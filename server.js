/**
 * Custom Next.js Server with Socket.io
 * Enables WebSocket support for arena matches and real-time presence
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');
const Redis = require('ioredis');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store active matches
const activeMatches = new Map();

// Map socket IDs to match IDs
const socketToMatch = new Map();

// =============================================================================
// CONNECTION QUALITY STATE MACHINE (GREEN / YELLOW / RED)
// =============================================================================

const INTEGRITY_STATE = {
    GREEN: 'GREEN',   // Ranked, full ELO
    YELLOW: 'YELLOW', // Void, no ELO change
    RED: 'RED'        // Forfeit
};

const CONNECTION_THRESHOLDS = {
    // Relaxed thresholds for real-world connections through proxies
    GREEN: { maxRtt: 180, maxJitter: 50, maxLoss: 0.03, maxDisconnectSec: 3 },
    YELLOW: { maxRtt: 300, maxJitter: 100, maxLoss: 0.08, maxDisconnectSec: 15 },
    // Beyond YELLOW = RED
};

const HYSTERESIS = {
    GREEN_TO_YELLOW: 3000,   // 3s of bad conditions before downgrade
    YELLOW_TO_GREEN: 8000,   // 8s of good conditions to recover
    YELLOW_TO_RED: 20000,    // 20s in YELLOW = escalate to RED
    MAX_DISCONNECTS: 3,      // 3 disconnects = immediate RED
    RTT_SAMPLE_SIZE: 10,     // Keep last 10 RTT samples
};

/**
 * Initialize connection stats for a player
 */
function initConnectionStats() {
    return {
        state: INTEGRITY_STATE.GREEN,
        rttSamples: [],
        pingCount: 0,
        pongCount: 0,
        disconnectCount: 0,
        disconnectSecondsTotal: 0,
        lastDisconnectTime: null,
        isCurrentlyDisconnected: false,
        stateEnteredAt: Date.now(),
        conditionMetSince: null,
        lastCondition: INTEGRITY_STATE.GREEN,
        lastPingTime: null,
    };
}

/**
 * Calculate median of an array
 */
function median(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate jitter (standard deviation of RTT samples)
 */
function calculateJitter(samples) {
    if (!samples || samples.length < 2) return 0;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const squareDiffs = samples.map(s => Math.pow(s - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / samples.length);
}

/**
 * Evaluate connection quality → returns GREEN/YELLOW/RED condition
 */
function evaluateConnectionCondition(stats, playerId = 'unknown') {
    // Grace period: Need at least 5 pong responses before evaluating
    // This ensures we have actual RTT data and accounts for in-flight pings
    if (stats.pongCount < 5) {
        console.log(`[Connection] ${playerId}: Grace period (pongCount=${stats.pongCount} < 5), returning GREEN`);
        return INTEGRITY_STATE.GREEN; // Assume good until proven otherwise
    }
    
    const medianRtt = median(stats.rttSamples);
    const jitter = calculateJitter(stats.rttSamples);
    
    // Calculate loss accounting for in-flight pings (allow 2 pings to be in-flight)
    // Only count as loss if we're missing more than 2 pongs
    const expectedPongs = Math.max(0, stats.pingCount - 2);
    const loss = expectedPongs > 0 ? Math.max(0, 1 - (stats.pongCount / expectedPongs)) : 0;
    
    const disconnectSec = stats.disconnectSecondsTotal;
    
    console.log(`[Connection] ${playerId}: Evaluating - medianRtt=${medianRtt.toFixed(0)}ms, jitter=${jitter.toFixed(1)}ms, loss=${(loss*100).toFixed(1)}%, disconnects=${stats.disconnectCount}, disconnectSec=${disconnectSec.toFixed(1)}`);
    
    // Check RED conditions first (immediate)
    if (medianRtt > CONNECTION_THRESHOLDS.YELLOW.maxRtt) {
        console.log(`[Connection] ${playerId}: RED - medianRtt ${medianRtt.toFixed(0)} > ${CONNECTION_THRESHOLDS.YELLOW.maxRtt}`);
        return INTEGRITY_STATE.RED;
    }
    if (jitter > CONNECTION_THRESHOLDS.YELLOW.maxJitter) {
        console.log(`[Connection] ${playerId}: RED - jitter ${jitter.toFixed(1)} > ${CONNECTION_THRESHOLDS.YELLOW.maxJitter}`);
        return INTEGRITY_STATE.RED;
    }
    if (loss > CONNECTION_THRESHOLDS.YELLOW.maxLoss) {
        console.log(`[Connection] ${playerId}: RED - loss ${(loss*100).toFixed(1)}% > ${CONNECTION_THRESHOLDS.YELLOW.maxLoss*100}%`);
        return INTEGRITY_STATE.RED;
    }
    if (disconnectSec > CONNECTION_THRESHOLDS.YELLOW.maxDisconnectSec) {
        console.log(`[Connection] ${playerId}: RED - disconnectSec ${disconnectSec.toFixed(1)} > ${CONNECTION_THRESHOLDS.YELLOW.maxDisconnectSec}`);
        return INTEGRITY_STATE.RED;
    }
    if (stats.disconnectCount >= HYSTERESIS.MAX_DISCONNECTS) {
        console.log(`[Connection] ${playerId}: RED - disconnectCount ${stats.disconnectCount} >= ${HYSTERESIS.MAX_DISCONNECTS}`);
        return INTEGRITY_STATE.RED;
    }
    
    // Check YELLOW conditions
    if (medianRtt > CONNECTION_THRESHOLDS.GREEN.maxRtt ||
        jitter > CONNECTION_THRESHOLDS.GREEN.maxJitter ||
        loss > CONNECTION_THRESHOLDS.GREEN.maxLoss ||
        disconnectSec > CONNECTION_THRESHOLDS.GREEN.maxDisconnectSec) {
        console.log(`[Connection] ${playerId}: YELLOW - exceeded GREEN thresholds`);
        return INTEGRITY_STATE.YELLOW;
    }
    
    console.log(`[Connection] ${playerId}: GREEN - all conditions met`);
    return INTEGRITY_STATE.GREEN;
}

/**
 * Update player's connection state with hysteresis
 * Returns true if state changed
 */
function updateConnectionState(player, playerId = 'unknown') {
    if (!player.connectionStats) {
        player.connectionStats = initConnectionStats();
    }
    
    const stats = player.connectionStats;
    const currentCondition = evaluateConnectionCondition(stats, playerId);
    const now = Date.now();
    const previousState = stats.state;
    
    // Track how long current condition has been met
    if (stats.lastCondition !== currentCondition) {
        stats.conditionMetSince = now;
        stats.lastCondition = currentCondition;
    }
    
    const conditionDuration = now - (stats.conditionMetSince || now);
    
    // State transitions with hysteresis
    switch (stats.state) {
        case INTEGRITY_STATE.GREEN:
            if (currentCondition === INTEGRITY_STATE.RED) {
                stats.state = INTEGRITY_STATE.RED; // Immediate on hard RED
                stats.stateEnteredAt = now;
            } else if (currentCondition === INTEGRITY_STATE.YELLOW && 
                       conditionDuration >= HYSTERESIS.GREEN_TO_YELLOW) {
                stats.state = INTEGRITY_STATE.YELLOW;
                stats.stateEnteredAt = now;
            }
            break;
            
        case INTEGRITY_STATE.YELLOW:
            if (currentCondition === INTEGRITY_STATE.RED) {
                stats.state = INTEGRITY_STATE.RED; // Immediate
                stats.stateEnteredAt = now;
            } else if (currentCondition === INTEGRITY_STATE.GREEN && 
                       conditionDuration >= HYSTERESIS.YELLOW_TO_GREEN) {
                stats.state = INTEGRITY_STATE.GREEN;
                stats.stateEnteredAt = now;
            } else if (now - stats.stateEnteredAt >= HYSTERESIS.YELLOW_TO_RED) {
                stats.state = INTEGRITY_STATE.RED; // Too long in YELLOW
                stats.stateEnteredAt = now;
            }
            break;
            
        case INTEGRITY_STATE.RED:
            // No recovery from RED during match
            break;
    }
    
    return stats.state !== previousState;
}

/**
 * Get connection quality metrics for a player
 */
function getConnectionMetrics(stats) {
    if (!stats) return { rtt: 0, jitter: 0, loss: 0, state: INTEGRITY_STATE.GREEN };
    return {
        rtt: Math.round(median(stats.rttSamples)),
        jitter: Math.round(calculateJitter(stats.rttSamples)),
        loss: stats.pingCount > 0 ? Math.round((1 - stats.pongCount / stats.pingCount) * 100) : 0,
        state: stats.state,
        disconnects: stats.disconnectCount,
    };
}

// =============================================================================
// LEADERBOARD SYSTEM
// =============================================================================

// Track sockets subscribed to leaderboard updates
// Key: "duel:addition:weekly" or "team:overall:alltime", Value: Set of socket IDs
const leaderboardSubscriptions = new Map();

/**
 * Get the subscription key for a leaderboard
 */
function getLeaderboardKey(type, operation, timeFilter) {
    return `${type}:${operation}:${timeFilter}`;
}

/**
 * Subscribe a socket to leaderboard updates
 */
function subscribeToLeaderboard(socketId, type, operation, timeFilter) {
    const key = getLeaderboardKey(type, operation, timeFilter);
    if (!leaderboardSubscriptions.has(key)) {
        leaderboardSubscriptions.set(key, new Set());
    }
    leaderboardSubscriptions.get(key).add(socketId);
    console.log(`[Leaderboard] Socket ${socketId} subscribed to ${key}`);
}

/**
 * Unsubscribe a socket from all leaderboards
 */
function unsubscribeFromAllLeaderboards(socketId) {
    for (const [key, sockets] of leaderboardSubscriptions.entries()) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
            leaderboardSubscriptions.delete(key);
        }
    }
}

/**
 * Broadcast leaderboard update to all subscribed sockets
 */
function broadcastLeaderboardUpdate(io, type, operation, affectedUserIds) {
    // Broadcast to both weekly and alltime subscriptions
    const timeFilters = ['weekly', 'alltime'];
    const operations = operation === 'mixed' ? [] : ['overall', operation];
    
    for (const tf of timeFilters) {
        for (const op of operations) {
            const key = getLeaderboardKey(type, op, tf);
            const sockets = leaderboardSubscriptions.get(key);
            if (sockets && sockets.size > 0) {
                console.log(`[Leaderboard] Broadcasting update to ${sockets.size} sockets for ${key}`);
                for (const socketId of sockets) {
                    io.to(socketId).emit('leaderboard:update', {
                        type,
                        operation: op,
                        timeFilter: tf,
                        affectedUserIds,
                        timestamp: Date.now(),
                    });
                }
            }
        }
    }
}

// =============================================================================
// PRESENCE SYSTEM
// =============================================================================

// Redis client for presence (optional - graceful fallback if unavailable)
let presenceRedis = null;
const PRESENCE_TTL = 300; // 5 minutes presence TTL

// In-memory fallback for presence when Redis unavailable
const inMemoryPresence = new Map(); // userId -> { status, socketId, lastSeen }
const presenceSocketToUser = new Map(); // socketId -> userId

// Redis keys for presence
const PRESENCE_KEYS = {
    USER_STATUS: 'presence:user:',      // + userId -> status JSON
    ONLINE_USERS: 'presence:online',    // Set of online user IDs
};

/**
 * Initialize Redis for presence tracking (optional)
 */
function initPresenceRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
        presenceRedis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
        });
        
        presenceRedis.on('connect', () => {
            console.log('[Presence] Redis connected');
        });
        
        presenceRedis.on('error', (err) => {
            console.error('[Presence] Redis error:', err.message);
        });
        
        return presenceRedis;
    } catch (err) {
        console.warn('[Presence] Redis unavailable, using in-memory fallback');
        return null;
    }
}

/**
 * Set user online status
 */
async function setUserPresence(userId, status, socketId) {
    const data = { status, socketId, lastSeen: Date.now() };
    
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            await presenceRedis.setex(
                PRESENCE_KEYS.USER_STATUS + userId,
                PRESENCE_TTL,
                JSON.stringify(data)
            );
            await presenceRedis.sadd(PRESENCE_KEYS.ONLINE_USERS, userId);
            await presenceRedis.expire(PRESENCE_KEYS.ONLINE_USERS, PRESENCE_TTL);
        } catch (err) {
            console.error('[Presence] Redis setex failed:', err.message);
        }
    } else {
        // In-memory fallback
        inMemoryPresence.set(userId, data);
        presenceSocketToUser.set(socketId, userId);
    }
}

/**
 * Remove user presence
 */
async function removeUserPresence(userId) {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            await presenceRedis.del(PRESENCE_KEYS.USER_STATUS + userId);
            await presenceRedis.srem(PRESENCE_KEYS.ONLINE_USERS, userId);
        } catch (err) {
            console.error('[Presence] Redis del failed:', err.message);
        }
    } else {
        inMemoryPresence.delete(userId);
    }
}

/**
 * Get user presence status
 */
async function getUserPresence(userId) {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            const data = await presenceRedis.get(PRESENCE_KEYS.USER_STATUS + userId);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    } else {
        return inMemoryPresence.get(userId) || null;
    }
}

/**
 * Get all online users
 */
async function getOnlineUsers() {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            return await presenceRedis.smembers(PRESENCE_KEYS.ONLINE_USERS);
        } catch (err) {
            return [];
        }
    } else {
        return Array.from(inMemoryPresence.keys());
    }
}

// Math symbol operators
const OPERATORS = {
    addition: { symbol: '+', fn: (a, b) => a + b },
    subtraction: { symbol: '−', fn: (a, b) => a - b },
    multiplication: { symbol: '×', fn: (a, b) => a * b },
    division: { symbol: '÷', fn: (a, b) => Math.floor(a / b) },
};

function generateQuestion(operation) {
    const ops = ['addition', 'subtraction', 'multiplication', 'division'];
    const op = operation === 'mixed' ? ops[Math.floor(Math.random() * ops.length)] : operation;
    const opConfig = OPERATORS[op] || OPERATORS.addition;

    let a, b, answer;

    switch (op) {
        case 'addition':
            a = Math.floor(Math.random() * 50) + 1;
            b = Math.floor(Math.random() * 50) + 1;
            answer = a + b;
            break;
        case 'subtraction':
            a = Math.floor(Math.random() * 50) + 20;
            b = Math.floor(Math.random() * Math.min(a - 1, 30)) + 1;
            answer = a - b;
            break;
        case 'multiplication':
            a = Math.floor(Math.random() * 12) + 1;
            b = Math.floor(Math.random() * 12) + 1;
            answer = a * b;
            break;
        case 'division':
            b = Math.floor(Math.random() * 10) + 2;
            answer = Math.floor(Math.random() * 10) + 1;
            a = b * answer;
            break;
        default:
            a = Math.floor(Math.random() * 20) + 1;
            b = Math.floor(Math.random() * 20) + 1;
            answer = a + b;
    }

    return {
        question: `${a} ${opConfig.symbol} ${b}`,
        answer,
        operation: op,
    };
}

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // Initialize Socket.io
    const io = new SocketIOServer(httpServer, {
        path: '/api/socket/arena',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log(`[Arena Socket] Client connected: ${socket.id}`);

        // Player joins a match
        socket.on('join_match', (data) => {
            const { matchId, userId, userName, operation, isAiMatch, userRank, userDivision, userLevel, userBanner, userTitle } = data;

            socket.join(matchId);
            socketToMatch.set(socket.id, matchId);

            // Get or create match state
            let match = activeMatches.get(matchId);
            if (!match) {
                match = {
                    matchId,
                    players: {},
                    currentQuestion: generateQuestion(operation),
                    odTimeLeft: 60,
                    odStarted: false,
                    odEnded: false,
                    odOperation: operation,
                    timer: null,
                    botInterval: null,
                    isAiMatch: !!isAiMatch,
                    // Store user data for AI bot creation
                    hostRank: userRank || 'Bronze',
                    hostDivision: userDivision || 'I',
                };
                activeMatches.set(matchId, match);
            } else {
                // Update isAiMatch if provided (in case match was created before socket joined)
                if (isAiMatch) {
                    match.isAiMatch = true;
                }
                // Store host rank/division for AI bot
                if (!match.hostRank) {
                    match.hostRank = userRank || 'Bronze';
                    match.hostDivision = userDivision || 'I';
                }
            }

            // Add player to match with their own question
            const playerQuestion = generateQuestion(match.odOperation);
            match.players[userId] = {
                odName: userName,
                odScore: 0,
                odStreak: 0,
                odMaxStreak: 0,  // Track best streak for APS
                odQuestionsAnswered: 0,
                odCorrectAnswers: 0,  // Track for accuracy calculation
                odTotalAnswerTime: 0,  // Track for speed calculation (ms)
                odLastAnswerCorrect: null,
                odSocketId: socket.id,
                odCurrentQuestion: playerQuestion,
                odLastQuestionTime: Date.now(),  // Track when question was shown
                connectionStats: initConnectionStats(),  // Connection quality tracking
                // Player cosmetics and rank for display
                odRank: userRank || 'Bronze',
                odDivision: userDivision || 'I',
                odLevel: userLevel || 1,
                odEquippedBanner: userBanner || 'default',
                odEquippedTitle: userTitle || 'Challenger',
            };

            console.log(`[Arena Socket] ${userName} joined match ${matchId} (AI: ${match.isAiMatch}, ${Object.keys(match.players).length} players)`);

            // Notify all players in match
            io.to(matchId).emit('player_joined', {
                players: match.players,
                playerId: userId,
                playerName: userName,
            });

            // Handle AI Match or 2nd Player
            const shouldStart = (match.isAiMatch && Object.keys(match.players).length >= 1) ||
                (!match.isAiMatch && Object.keys(match.players).length >= 2);

            if (shouldStart && !match.odStarted) {
                match.odStarted = true;

                // Add Bot if AI match
                if (match.isAiMatch) {
                    const botId = 'ai_bot_' + matchId;
                    const botQuestion = generateQuestion(match.odOperation);
                    // AI bot uses the host's rank for fair matchup display
                    const aiBanners = ['matrices', 'synthwave', 'plasma', 'legendary'];
                    const aiTitles = ['AI Challenger', 'Math Bot', 'Practice Partner', 'Training Mode'];
                    match.players[botId] = {
                        odName: 'FlashBot 3000',
                        odScore: 0,
                        odStreak: 0,
                        odQuestionsAnswered: 0,
                        odLastAnswerCorrect: null,
                        odSocketId: 'bot',
                        odCurrentQuestion: botQuestion,
                        isBot: true,
                        // Visuals - use host's rank and random cosmetics
                        odEquippedBanner: aiBanners[Math.floor(Math.random() * aiBanners.length)],
                        odEquippedTitle: aiTitles[Math.floor(Math.random() * aiTitles.length)],
                        odLevel: Math.floor(Math.random() * 50) + 10,
                        odTier: match.hostRank || 'Bronze',
                        odRank: match.hostRank || 'Bronze',
                        odDivision: match.hostDivision || 'I',
                    };

                    // Notify about bot
                    io.to(matchId).emit('player_joined', {
                        players: match.players,
                        playerId: botId,
                        playerName: 'FlashBot 3000',
                    });

                    // Bot Logic Loop
                    match.botInterval = setInterval(() => {
                        if (match.odEnded) {
                            clearInterval(match.botInterval);
                            return;
                        }

                        // Bot answers every 3-6 seconds
                        if (Math.random() > 0.7) {
                            const botData = match.players[botId];
                            if (!botData) return;

                            // 80% chance to be correct
                            const isCorrect = Math.random() > 0.2;
                            const answer = isCorrect ? botData.odCurrentQuestion.answer : botData.odCurrentQuestion.answer + 1;

                            if (isCorrect) {
                                botData.odScore += 100;
                                botData.odStreak++;
                            } else {
                                botData.odStreak = 0;
                            }
                            botData.odCurrentQuestion = generateQuestion(match.odOperation);

                            io.to(matchId).emit('answer_result', {
                                odUserId: botId,
                                odIsCorrect: isCorrect,
                                odPlayers: match.players,
                            });

                            socket.emit('opponent_question_update', {
                                odUserId: botId,
                                question: botData.odCurrentQuestion,
                            });
                        }
                    }, 2000);
                }

                // Send match_start to each player with their own question
                for (const [playerId, playerData] of Object.entries(match.players)) {
                    if (playerData.isBot) continue;

                    const playerSocket = io.sockets.sockets.get(playerData.odSocketId);
                    if (playerSocket) {
                        playerSocket.emit('match_start', {
                            question: playerData.odCurrentQuestion,
                            timeLeft: match.odTimeLeft,
                            players: match.players,
                        });
                    }
                }

                // Start the timer
                match.timer = setInterval(() => {
                    const m = activeMatches.get(matchId);
                    if (!m || m.odEnded) {
                        if (m) {
                            if (m.timer) clearInterval(m.timer);
                            if (m.botInterval) clearInterval(m.botInterval);
                        }
                        return;
                    }

                    m.odTimeLeft--;
                    
                    // =========================================================
                    // CONNECTION QUALITY MONITORING
                    // =========================================================
                    const connectionStates = {};
                    for (const [playerId, player] of Object.entries(m.players)) {
                        // Skip bots
                        if (playerId.startsWith('ai') || player.isBot) continue;
                        
                        const playerSocket = io.sockets.sockets.get(player.odSocketId);
                        if (playerSocket && player.connectionStats) {
                            // Send ping
                            player.connectionStats.pingCount++;
                            player.connectionStats.lastPingTime = Date.now();
                            playerSocket.emit('connection_ping', { t: Date.now() });
                            
                            // Update connection state with hysteresis
                            const stateChanged = updateConnectionState(player, playerId);
                            
                            // Get metrics for this player
                            connectionStates[playerId] = getConnectionMetrics(player.connectionStats);
                            
                            if (stateChanged) {
                                console.log(`[Connection] ${player.odName} state changed to ${player.connectionStats.state}`);
                            }
                        } else if (player.connectionStats && !player.connectionStats.isCurrentlyDisconnected) {
                            // Player socket not found - mark as disconnected
                            player.connectionStats.isCurrentlyDisconnected = true;
                            player.connectionStats.lastDisconnectTime = Date.now();
                            player.connectionStats.disconnectCount++;
                        }
                        
                        // Track disconnect duration
                        if (player.connectionStats?.isCurrentlyDisconnected && player.connectionStats.lastDisconnectTime) {
                            player.connectionStats.disconnectSecondsTotal += 1;
                        }
                    }
                    
                    // Broadcast connection states to all players
                    if (Object.keys(connectionStates).length > 0) {
                        io.to(matchId).emit('connection_states', { states: connectionStates });
                    }
                    // =========================================================
                    
                    io.to(matchId).emit('time_update', { timeLeft: m.odTimeLeft });

                    if (m.odTimeLeft <= 0) {
                        clearInterval(m.timer);
                        if (m.botInterval) clearInterval(m.botInterval);
                        m.odEnded = true;

                        // Calculate performance stats for each player
                        const performanceStats = {};
                        for (const [playerId, player] of Object.entries(m.players)) {
                            const totalAnswers = player.odQuestionsAnswered || 0;
                            const correctAnswers = player.odCorrectAnswers || 0;
                            const accuracy = totalAnswers > 0 ? correctAnswers / totalAnswers : 0;
                            const avgSpeedMs = correctAnswers > 0 
                                ? Math.round((player.odTotalAnswerTime || 0) / correctAnswers) 
                                : 0;
                            const maxStreak = player.odMaxStreak || 0;

                            // Calculate APS (0-1000 scale)
                            // Weights: Accuracy 40%, Streak 35%, Speed 25%
                            const streakNormalized = Math.min(1, maxStreak / 10);
                            const speedRatio = avgSpeedMs > 0 
                                ? Math.max(0, 1 - (avgSpeedMs / 60000)) // Normalize to 60s max
                                : 0;
                            const speedMultiplier = accuracy >= 0.7 ? 1 : 0.5;  // Penalty if <70% accuracy
                            const aps = Math.round(
                                ((accuracy * 0.40) + (streakNormalized * 0.35) + (speedRatio * speedMultiplier * 0.25)) * 1000
                            );

                            performanceStats[playerId] = {
                                accuracy: accuracy,
                                avgSpeedMs: avgSpeedMs,
                                maxStreak: maxStreak,
                                aps: aps
                            };
                        }

                        // Determine match integrity based on connection states
                        let matchIntegrity = INTEGRITY_STATE.GREEN;
                        const playerIntegrity = {};
                        
                        for (const [playerId, player] of Object.entries(m.players)) {
                            if (playerId.startsWith('ai') || player.isBot) {
                                console.log(`[Match] Skipping AI player ${playerId} for integrity check`);
                                continue;
                            }
                            
                            const stats = player.connectionStats;
                            const state = stats?.state || INTEGRITY_STATE.GREEN;
                            const metrics = getConnectionMetrics(stats);
                            
                            console.log(`[Match] Player ${playerId} final state: ${state}, pings=${stats?.pingCount || 0}, pongs=${stats?.pongCount || 0}, rttSamples=${stats?.rttSamples?.length || 0}, medianRtt=${metrics?.medianRtt || 'N/A'}ms`);
                            
                            playerIntegrity[playerId] = {
                                state: state,
                                metrics: metrics
                            };
                            
                            // Overall match integrity = worst player state
                            if (state === INTEGRITY_STATE.RED) {
                                matchIntegrity = INTEGRITY_STATE.RED;
                            } else if (state === INTEGRITY_STATE.YELLOW && matchIntegrity !== INTEGRITY_STATE.RED) {
                                matchIntegrity = INTEGRITY_STATE.YELLOW;
                            }
                        }
                        
                        console.log(`[Match] ${matchId} ended - Final Integrity: ${matchIntegrity}`);

                        io.to(matchId).emit('match_end', { 
                            players: m.players,
                            performanceStats: performanceStats,
                            matchIntegrity: matchIntegrity,
                            playerIntegrity: playerIntegrity
                        });

                        // Broadcast leaderboard update after match ends
                        // Determine match type and operation for leaderboard
                        const matchType = m.odMode === '1v1' ? 'duel' : 'team';
                        const matchOperation = m.odOperation || 'overall';
                        const affectedUserIds = Object.keys(m.players).filter(id => !id.startsWith('ai-'));
                        
                        if (affectedUserIds.length > 0) {
                            // Use presenceNs (presence namespace) for leaderboard updates
                            broadcastLeaderboardUpdate(presenceNs, matchType, matchOperation, affectedUserIds);
                        }

                        // Clean up match after 30 seconds
                        setTimeout(() => {
                            activeMatches.delete(matchId);
                            console.log(`[Arena Socket] Match ${matchId} cleaned up`);
                        }, 30000);
                    }
                }, 1000);
            }

            // Send current state to the joining player (their own question)
            const playerData = match.players[userId];
            socket.emit('match_state', {
                players: match.players,
                question: playerData?.odCurrentQuestion || match.currentQuestion,
                timeLeft: match.odTimeLeft,
                started: match.odStarted,
                ended: match.odEnded,
            });
        });

        // Player submits an answer
        socket.on('submit_answer', (data) => {
            const { matchId, odUserId, userAnswer } = data;
            console.log(`[Arena Socket] Answer submitted: user=${odUserId}, answer=${userAnswer}, match=${matchId}`);

            const match = activeMatches.get(matchId);
            if (!match || match.odEnded) {
                console.log(`[Arena Socket] Match not found or ended: ${matchId}`);
                return;
            }

            const player = match.players[odUserId];
            if (!player) {
                console.log(`[Arena Socket] Player not found in match: ${odUserId}`);
                return;
            }

            // Check against PLAYER'S own question, not shared question
            const playerQuestion = player.odCurrentQuestion;
            const isCorrect = userAnswer === playerQuestion.answer;
            console.log(`[Arena Socket] Answer ${isCorrect ? 'CORRECT' : 'WRONG'} (expected: ${playerQuestion.answer}, got: ${userAnswer})`);

            // Calculate answer time for speed tracking
            const answerTime = Date.now() - (player.odLastQuestionTime || Date.now());

            // Update player stats
            if (isCorrect) {
                player.odScore += 100;
                player.odStreak++;
                player.odCorrectAnswers = (player.odCorrectAnswers || 0) + 1;
                player.odTotalAnswerTime = (player.odTotalAnswerTime || 0) + answerTime;
                // Update max streak
                if (player.odStreak > (player.odMaxStreak || 0)) {
                    player.odMaxStreak = player.odStreak;
                }
            } else {
                player.odStreak = 0;
            }
            player.odQuestionsAnswered++;
            player.odLastAnswerCorrect = isCorrect;

            // Generate new question for this player
            const newQuestion = generateQuestion(match.odOperation);
            player.odCurrentQuestion = newQuestion;
            player.odLastQuestionTime = Date.now();  // Reset timer for new question

            // Broadcast score update to all players
            io.to(matchId).emit('answer_result', {
                odUserId,
                odIsCorrect: isCorrect,
                odPlayers: match.players,
            });

            // Send new question only to the player who answered
            socket.emit('new_question', {
                question: newQuestion,
            });

            // Send new question to opponent(s) so they can see what this player is working on
            socket.to(matchId).emit('opponent_question_update', {
                odUserId,
                question: newQuestion,
            });
        });

        // Connection quality pong response
        socket.on('connection_pong', (data) => {
            const { t, matchId, userId } = data;
            const match = activeMatches.get(matchId);
            if (!match) {
                // console.log(`[Connection] Pong received but match ${matchId} not found`);
                return;
            }
            
            const player = match.players[userId];
            if (!player || !player.connectionStats) {
                // console.log(`[Connection] Pong received but player ${userId} not found in match`);
                return;
            }
            
            const rtt = Date.now() - t;
            const stats = player.connectionStats;
            
            // Record pong
            stats.pongCount++;
            
            // Add RTT sample (keep last N samples)
            stats.rttSamples.push(rtt);
            if (stats.rttSamples.length > HYSTERESIS.RTT_SAMPLE_SIZE) {
                stats.rttSamples.shift();
            }
            
            // Log EVERY ping for detailed debugging (can disable later)
            const medianRtt = median(stats.rttSamples);
            const jitter = calculateJitter(stats.rttSamples);
            console.log(`[RTT] ${player.odName}: ping#${stats.pongCount} RTT=${rtt}ms, median=${medianRtt.toFixed(0)}ms, jitter=${jitter.toFixed(1)}ms, state=${stats.state}`);
            
            // Mark as connected if was disconnected
            if (stats.isCurrentlyDisconnected) {
                stats.isCurrentlyDisconnected = false;
                console.log(`[Connection] ${player.odName} reconnected (RTT: ${rtt}ms)`);
            }
        });

        // Player disconnects
        socket.on('disconnect', () => {
            const matchId = socketToMatch.get(socket.id);
            if (matchId) {
                const match = activeMatches.get(matchId);
                if (match) {
                    // Find and remove the disconnected player
                    for (const [odUserId, player] of Object.entries(match.players)) {
                        if (player.odSocketId === socket.id) {
                            delete match.players[odUserId];
                            io.to(matchId).emit('player_left', { odUserId });
                            console.log(`[Arena Socket] Player ${odUserId} left match ${matchId}`);
                            break;
                        }
                    }

                    // Clean up empty matches
                    if (Object.keys(match.players).length === 0) {
                        if (match.timer) clearInterval(match.timer);
                        activeMatches.delete(matchId);
                        console.log(`[Arena Socket] Match ${matchId} cleaned up (no players)`);
                    }
                }
                socketToMatch.delete(socket.id);
            }
            console.log(`[Arena Socket] Client disconnected: ${socket.id}`);
        });

        // Leave match explicitly (forfeit)
        socket.on('leave_match', (data) => {
            const { matchId, userId } = data;
            const match = activeMatches.get(matchId);
            if (match && match.players[userId]) {
                const forfeitingPlayer = match.players[userId];
                delete match.players[userId];
                socket.leave(matchId);
                socketToMatch.delete(socket.id);

                // If match was active, notify remaining player they won
                if (match.odStarted && !match.odEnded) {
                    match.odEnded = true;
                    if (match.timer) clearInterval(match.timer);

                    // Notify remaining players about the forfeit
                    io.to(matchId).emit('player_forfeit', {
                        odForfeitedUserId: userId,
                        odForfeitedUserName: forfeitingPlayer.odName,
                        odPlayers: match.players,
                    });

                    console.log(`[Arena Socket] Player ${forfeitingPlayer.odName} forfeited match ${matchId}`);
                } else {
                    io.to(matchId).emit('player_left', { odUserId: userId });
                }
            }
        });
    });

    console.log('[Arena Socket] WebSocket server initialized');

    // =============================================================================
    // PRESENCE NAMESPACE
    // =============================================================================
    
    // Initialize presence Redis (optional)
    initPresenceRedis();
    
    const presenceNs = io.of('/presence');
    
    presenceNs.on('connection', (socket) => {
        console.log(`[Presence] Client connected: ${socket.id}`);
        let currentUserId = null;
        
        // User comes online
        socket.on('presence:online', async (data) => {
            const { userId, userName, status } = data;
            if (!userId) return;
            
            currentUserId = userId;
            presenceSocketToUser.set(socket.id, userId);
            
            // Use provided status or default to 'online'
            const userStatus = status || 'online';
            await setUserPresence(userId, userStatus, socket.id);
            
            // Join a room for this user to receive direct messages
            socket.join(`user:${userId}`);
            
            // #region agent log - Track user joining room
            try {
                const fs = require('fs');
                const roomName = `user:${userId}`;
                const socketsInRoom = presenceNs.adapter.rooms.get(roomName);
                const logEntry = JSON.stringify({
                    location: 'server.js:USER_JOINED_ROOM',
                    message: 'User joined their socket room',
                    data: { userId, userName, socketId: socket.id, roomName, socketsInRoom: socketsInRoom ? socketsInRoom.size : 0 },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'B'
                }) + '\n';
                fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', logEntry);
            } catch (e) { /* ignore */ }
            // #endregion
            
            console.log(`[Presence] ${userName || userId} is now ${userStatus}`);
            
            // Notify friends (broadcast to all - clients will filter)
            // Don't broadcast if invisible
            if (userStatus !== 'invisible') {
                socket.broadcast.emit('presence:update', {
                    userId,
                    status: userStatus,
                    timestamp: Date.now(),
                });
            }
        });
        
        // User changes status
        socket.on('presence:status', async (data) => {
            const { status } = data; // 'online', 'away', 'invisible', 'in-match'
            if (!currentUserId) return;
            
            await setUserPresence(currentUserId, status, socket.id);
            
            console.log(`[Presence] ${currentUserId} status: ${status}`);
            
            // Broadcast status update to friends
            // If going invisible, broadcast 'offline' to hide from friends
            // If coming back from invisible, broadcast actual status
            socket.broadcast.emit('presence:update', {
                userId: currentUserId,
                status: status === 'invisible' ? 'offline' : status,
                timestamp: Date.now(),
            });
        });
        
        // Request friend statuses
        socket.on('presence:get_friends', async (data) => {
            const { friendIds } = data;
            if (!friendIds || !Array.isArray(friendIds)) return;
            
            const statuses = {};
            for (const friendId of friendIds) {
                const presence = await getUserPresence(friendId);
                // Return 'offline' for invisible users (they don't want to be seen)
                if (presence) {
                    statuses[friendId] = presence.status === 'invisible' ? 'offline' : presence.status;
                } else {
                    statuses[friendId] = 'offline';
                }
            }
            
            socket.emit('presence:friends_status', { statuses });
        });
        
        // Friend request notification (from server action)
        socket.on('presence:notify_friend_request', async (data) => {
            const { receiverId, senderName } = data;
            // Send to specific user's room
            presenceNs.to(`user:${receiverId}`).emit('friend:request', {
                senderName,
                timestamp: Date.now(),
            });
        });
        
        // Friend request accepted notification
        socket.on('presence:notify_friend_accepted', async (data) => {
            const { senderId, accepterName } = data;
            // Notify the original sender that their request was accepted
            presenceNs.to(`user:${senderId}`).emit('friend:accepted', {
                accepterName,
                timestamp: Date.now(),
            });
        });
        
        // Party invite notification
        socket.on('presence:notify_party_invite', async (data) => {
            const { inviteeId, inviterName, partyId } = data;
            presenceNs.to(`user:${inviteeId}`).emit('party:invite', {
                inviterName,
                partyId,
                timestamp: Date.now(),
            });
        });
        
        // Friend removed notification
        socket.on('presence:notify_friend_removed', async (data) => {
            const { removedUserId, removerName } = data;
            presenceNs.to(`user:${removedUserId}`).emit('friend:removed', {
                removerName,
                timestamp: Date.now(),
            });
        });
        
        // Party member joined notification (notify all party members)
        socket.on('presence:notify_party_joined', async (data) => {
            const { partyMemberIds, joinerName, joinerId } = data;
            // Notify all party members except the joiner
            for (const memberId of partyMemberIds) {
                if (memberId !== joinerId) {
                    presenceNs.to(`user:${memberId}`).emit('party:member_joined', {
                        joinerName,
                        joinerId,
                        timestamp: Date.now(),
                    });
                }
            }
        });
        
        // Party member left notification (notify all remaining party members)
        socket.on('presence:notify_party_left', async (data) => {
            const { partyMemberIds, leaverName, leaverId, disbanded } = data;
            for (const memberId of partyMemberIds) {
                presenceNs.to(`user:${memberId}`).emit('party:member_left', {
                    leaverName,
                    leaverId,
                    disbanded: disbanded || false,
                    timestamp: Date.now(),
                });
            }
        });
        
        // Party settings updated notification (notify all party members)
        socket.on('presence:notify_party_settings', async (data) => {
            const { partyMemberIds, inviteMode, updaterId } = data;
            for (const memberId of partyMemberIds) {
                // Notify all members including the updater (for confirmation)
                presenceNs.to(`user:${memberId}`).emit('party:settings_updated', {
                    inviteMode,
                    updaterId,
                    timestamp: Date.now(),
                });
            }
        });
        
        // Party queue status changed notification (notify all party members)
        // This enables real-time sync when leader starts/stops queue
        socket.on('presence:notify_party_queue_status', async (data) => {
            const { partyMemberIds, queueStatus, partyId, updaterId } = data;
            console.log(`[Presence] 📢 BROADCASTING queue status change for party ${partyId}`);
            console.log(`[Presence] Status: ${queueStatus}, UpdaterId: ${updaterId}`);
            console.log(`[Presence] Broadcasting to members:`, partyMemberIds);
            
            // #region agent log - Check room membership for each member
            const roomInfo = {};
            for (const memberId of partyMemberIds) {
                const roomName = `user:${memberId}`;
                const socketsInRoom = presenceNs.adapter.rooms.get(roomName);
                roomInfo[memberId] = {
                    roomName,
                    socketCount: socketsInRoom ? socketsInRoom.size : 0,
                    socketIds: socketsInRoom ? Array.from(socketsInRoom) : []
                };
            }
            try {
                const fs = require('fs');
                const logEntry = JSON.stringify({
                    location: 'server.js:SOCKET_BROADCAST',
                    message: 'Server broadcasting queue status - checking room membership',
                    data: { partyId, queueStatus, updaterId, memberCount: partyMemberIds.length, roomInfo },
                    timestamp: Date.now(),
                    sessionId: 'debug-session',
                    hypothesisId: 'H1'
                }) + '\n';
                fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', logEntry);
            } catch (e) { /* ignore */ }
            // #endregion
            
            for (const memberId of partyMemberIds) {
                console.log(`[Presence] Emitting to user:${memberId}`);
                // #region agent log - H1: Track each member broadcast
                try {
                    const fs = require('fs');
                    const roomName = `user:${memberId}`;
                    const socketsInRoom = presenceNs.adapter.rooms.get(roomName);
                    fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({
                        location: 'server.js:EMIT_TO_MEMBER',
                        message: 'Emitting to individual member',
                        data: { memberId: memberId.slice(-8), roomName, hasSocketInRoom: socketsInRoom?.size > 0, socketCount: socketsInRoom?.size || 0 },
                        timestamp: Date.now(),
                        sessionId: 'debug-session',
                        hypothesisId: 'H1'
                    }) + '\n');
                } catch (e) {}
                // #endregion
                presenceNs.to(`user:${memberId}`).emit('party:queue_status_changed', {
                    queueStatus,
                    partyId,
                    updaterId,
                    timestamp: Date.now(),
                });
            }
        });
        
        // =============================================================================
        // LEADERBOARD EVENTS
        // =============================================================================
        
        // Subscribe to leaderboard updates
        socket.on('leaderboard:subscribe', (data) => {
            const { type, operation, timeFilter } = data;
            if (!type || !operation || !timeFilter) {
                console.log('[Leaderboard] Invalid subscription data:', data);
                return;
            }
            subscribeToLeaderboard(socket.id, type, operation, timeFilter);
        });
        
        // Unsubscribe from leaderboard updates
        socket.on('leaderboard:unsubscribe', (data) => {
            const { type, operation, timeFilter } = data;
            if (type && operation && timeFilter) {
                const key = getLeaderboardKey(type, operation, timeFilter);
                const sockets = leaderboardSubscriptions.get(key);
                if (sockets) {
                    sockets.delete(socket.id);
                    console.log(`[Leaderboard] Socket ${socket.id} unsubscribed from ${key}`);
                }
            }
        });
        
        // Disconnect
        socket.on('disconnect', async () => {
            const userId = presenceSocketToUser.get(socket.id);
            if (userId) {
                await removeUserPresence(userId);
                presenceSocketToUser.delete(socket.id);
                
                // Notify others
                socket.broadcast.emit('presence:update', {
                    userId,
                    status: 'offline',
                    timestamp: Date.now(),
                });
                
                console.log(`[Presence] ${userId} went offline`);
            }
            
            // Clean up leaderboard subscriptions
            unsubscribeFromAllLeaderboards(socket.id);
            
            console.log(`[Presence] Client disconnected: ${socket.id}`);
        });
    });
    
    console.log('[Presence Socket] Presence namespace initialized at /presence');

    // =============================================================================
    // ARENA TEAMS 5v5 NAMESPACE
    // =============================================================================
    
    // Store active team matches
    const activeTeamMatches = new Map();
    
    // Map socket IDs to team match IDs
    const socketToTeamMatch = new Map();
    
    // Team match state constants
    const TEAM_MATCH_PHASES = {
        PRE_MATCH: 'pre_match',
        STRATEGY: 'strategy',        // NEW: IGL assigns slots before match starts
        ACTIVE: 'active',
        BREAK: 'break',
        HALFTIME: 'halftime',
        ANCHOR_DECISION: 'anchor_decision',
        POST_MATCH: 'post_match',
    };
    
    const TEAM_MATCH_CONFIG = {
        ROUNDS_PER_HALF: 4,
        TOTAL_ROUNDS: 8,
        QUESTIONS_PER_SLOT: 5,
        SLOTS_PER_ROUND: 5,
        HALF_DURATION_MS: 360000,        // 6 minutes per half (user specified)
        ROUND_DURATION_MS: 80000,        // 1:20 per round (for reference, not used for clock)
        BREAK_DURATION_MS: 10000,        // 10 seconds between rounds
        HALFTIME_DURATION_MS: 120000,    // 2 minutes halftime
        STRATEGY_DURATION_MS: 60000,     // 60 seconds for IGL to assign slots before match
        TIMEOUT_DURATION_MS: 60000,      // 1 minute per timeout
        TIMEOUTS_PER_TEAM: 2,
        POINTS_PER_CORRECT: 100,
        STREAK_BONUS: 5,                 // +5 per consecutive correct
        HANDOFF_COUNTDOWN_MS: 3000,      // 3 second countdown before handoff
        TYPING_THROTTLE_MS: 50,          // Throttle typing updates
    };
    
    const SLOT_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
    
    // =============================================================================
    // AI TEAM BOT CONFIGURATION
    // =============================================================================
    
    const BOT_TEAM_NAMES = [
        { name: 'Neural Network', tag: 'NN', theme: 'tech' },
        { name: 'Matrix Runners', tag: 'MX', theme: 'cyber' },
        { name: 'Quantum Minds', tag: 'QM', theme: 'science' },
        { name: 'Binary Blazers', tag: 'BB', theme: 'tech' },
        { name: 'Algorithm Elite', tag: 'AE', theme: 'math' },
        { name: 'Circuit Breakers', tag: 'CB', theme: 'tech' },
        { name: 'Digital Storm', tag: 'DS', theme: 'cyber' },
        { name: 'Byte Force', tag: 'BF', theme: 'tech' },
    ];

    const BOT_NAMES_BY_THEME = {
        tech: ['ByteMaster', 'CyberNova', 'TechWiz', 'DigitalAce', 'CodeSlayer'],
        cyber: ['NeonGhost', 'VirtualViper', 'CyberPhantom', 'GridGlitch', 'PixelProwler'],
        science: ['QuantumQuark', 'AtomAce', 'NeutronNinja', 'ProtonPrime', 'FusionForce'],
        math: ['PrimePredator', 'FractalFury', 'IntegralIce', 'VectorVanguard', 'TangentTitan'],
    };

    const BOT_TITLES = ['AI Overlord', 'Machine Mind', 'Digital Champion', 'Binary Beast', 'Algorithm Master'];
    const BOT_FRAMES = ['matrix', 'cyber', 'neon', 'hologram', 'circuit'];

    const BOT_DIFFICULTY_CONFIGS = {
        easy: { answerTimeRange: [3000, 6000], accuracy: 0.6 },
        medium: { answerTimeRange: [2000, 4000], accuracy: 0.75 },
        hard: { answerTimeRange: [1500, 3000], accuracy: 0.85 },
        impossible: { answerTimeRange: [800, 1500], accuracy: 0.95 },
    };

    /**
     * Generate an AI team with 5 bot players
     */
    function generateAITeam(matchId, targetElo, difficulty = 'medium') {
        const teamIdentity = BOT_TEAM_NAMES[Math.floor(Math.random() * BOT_TEAM_NAMES.length)];
        const names = BOT_NAMES_BY_THEME[teamIdentity.theme] || BOT_NAMES_BY_THEME.tech;
        const config = BOT_DIFFICULTY_CONFIGS[difficulty] || BOT_DIFFICULTY_CONFIGS.medium;

        const botMembers = SLOT_OPERATIONS.map((op, index) => ({
            odUserId: `ai_bot_${matchId}_${index}`,
            odUserName: names[index % names.length],
            odElo: targetElo + Math.floor(Math.random() * 100) - 50,
            odLevel: Math.floor(Math.random() * 50) + 50,
            odEquippedFrame: BOT_FRAMES[Math.floor(Math.random() * BOT_FRAMES.length)],
            odEquippedTitle: BOT_TITLES[Math.floor(Math.random() * BOT_TITLES.length)],
            odPreferredOperation: op,
            isBot: true,
            botConfig: config,
        }));

        return {
            odPartyId: `ai_party_${matchId}`,
            odTeamId: `ai_team_${matchId}`,
            odTeamName: teamIdentity.name,
            odTeamTag: teamIdentity.tag,
            odElo: targetElo,
            odMode: '5v5',
            odMatchType: 'casual',
            odIglId: botMembers[0].odUserId,
            odIglName: botMembers[0].odUserName,
            odAnchorId: botMembers[1].odUserId,
            odAnchorName: botMembers[1].odUserName,
            odMembers: botMembers,
            odJoinedAt: Date.now(),
            isAITeam: true,
        };
    }

    /**
     * Check if a user ID is an AI bot
     */
    function isAIBot(userId) {
        return userId && userId.startsWith('ai_bot_');
    }

    /**
     * Check if a team is an AI team
     */
    function isAITeam(teamId) {
        return teamId && (teamId.startsWith('ai_team_') || teamId.startsWith('ai_party_'));
    }

    // Store active bot intervals for cleanup
    const botIntervals = new Map(); // matchId -> [intervalId, ...]
    
    /**
     * Initialize a team match state
     */
    function initTeamMatchState(matchId, team1, team2, operation, matchType) {
        // Create slot assignments (default: based on preferences or sequential)
        const createSlotAssignments = (team) => {
            const assignments = {};
            const members = [...team.odMembers];
            
            // Try to assign based on preferences first
            for (const slot of SLOT_OPERATIONS) {
                const preferred = members.find(m => m.odPreferredOperation === slot);
                if (preferred) {
                    assignments[slot] = preferred.odUserId;
                    members.splice(members.indexOf(preferred), 1);
                }
            }
            
            // Fill remaining slots sequentially
            let memberIndex = 0;
            for (const slot of SLOT_OPERATIONS) {
                if (!assignments[slot] && members[memberIndex]) {
                    assignments[slot] = members[memberIndex].odUserId;
                    memberIndex++;
                }
            }
            
            return assignments;
        };
        
        const createTeamState = (teamData, isHome) => {
            const slotAssignments = createSlotAssignments(teamData);
            
            return {
                teamId: teamData.odTeamId || teamData.odPartyId,
                partyId: teamData.odPartyId,
                teamName: teamData.odTeamName || `Team ${isHome ? '1' : '2'}`,
                teamTag: teamData.odTeamTag,
                leaderId: teamData.odLeaderId || teamData.odIglId, // Party leader for quit votes
                score: 0,
                currentStreak: 0,
                isHome,
                iglId: teamData.odIglId,
                anchorId: teamData.odAnchorId,
                timeoutsUsed: 0,
                slotAssignments,
                players: {},
                currentSlot: 1,           // Each team tracks their own slot (1-5)
                questionsInSlot: 0,       // Each team tracks their own progress (0-5)
                // Double Call-In state (per spec: Anchor plays 2 slots, one player benched)
                doubleCallinActive: false,       // Is Double Call-In active this round?
                doubleCallinSlot: null,          // Which slot (operation) the anchor is taking over
                doubleCallinBenchedId: null,     // Which player is sitting out
                usedDoubleCallinHalf1: false,    // Used in 1st half?
                usedDoubleCallinHalf2: false,    // Used in 2nd half?
            };
        };
        
        const team1State = createTeamState(team1, true);
        const team2State = createTeamState(team2, false);
        
        // Initialize player states for both teams
        const initPlayerStates = (teamData, teamState) => {
            for (const member of teamData.odMembers) {
                const slotOp = Object.entries(teamState.slotAssignments)
                    .find(([op, id]) => id === member.odUserId)?.[0] || SLOT_OPERATIONS[0];
                
                teamState.players[member.odUserId] = {
                    odUserId: member.odUserId,
                    odName: member.odUserName,
                    odLevel: member.odLevel,
                    odEquippedFrame: member.odEquippedFrame,
                    odEquippedTitle: member.odEquippedTitle,
                    odSocketId: null,
                    slot: slotOp,
                    score: 0,
                    correct: 0,
                    total: 0,
                    streak: 0,
                    maxStreak: 0,
                    totalAnswerTimeMs: 0,
                    isActive: false,
                    isComplete: false,
                    isIgl: member.odUserId === teamData.odIglId,
                    isAnchor: member.odUserId === teamData.odAnchorId,
                    currentQuestion: null,
                    questionStartTime: null,
                    currentInput: '',
                    usedDoubleCallin: false,
                    connectionStats: initConnectionStats(),
                };
            }
        };
        
        initPlayerStates(team1, team1State);
        initPlayerStates(team2, team2State);
        
        return {
            matchId,
            operation,
            matchType,
            round: 1,
            half: 1,
            phase: TEAM_MATCH_PHASES.PRE_MATCH,
            gameClockMs: TEAM_MATCH_CONFIG.HALF_DURATION_MS, // 6 minutes per half, count DOWN
            relayClockMs: 0,
            currentSlot: 1,              // 1-5 (which operation slot is active)
            // questionsInSlot is now per-team in team state
            team1: team1State,
            team2: team2State,
            roundScores: [],
            timer: null,
            startTime: null,
            roundStartTime: null,
            lastTickTime: null,
            anchorDecisionMade: { team1: false, team2: false },
        };
    }
    
    /**
     * Get the operation for a slot number
     */
    function getSlotOperation(slotNumber, matchOperation) {
        if (matchOperation === 'mixed') {
            return SLOT_OPERATIONS[slotNumber - 1] || 'addition';
        }
        return matchOperation;
    }
    
    /**
     * Get the active player for a team in the current slot
     * Handles Double Call-In: if anchor is taking over this slot, return anchor instead
     */
    function getActivePlayer(teamState, slotNumber) {
        const slotOp = SLOT_OPERATIONS[slotNumber - 1] || SLOT_OPERATIONS[0];
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:getActivePlayer',message:'DC-H4: getActivePlayer called',data:{slotNumber,slotOp,doubleCallinActive:teamState.doubleCallinActive,doubleCallinSlot:teamState.doubleCallinSlot,matchesSlot:teamState.doubleCallinSlot===slotOp,anchorId:teamState.anchorId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H4'})}).catch(()=>{});
        // #endregion
        
        // Check if Double Call-In is active for this slot
        if (teamState.doubleCallinActive && teamState.doubleCallinSlot === slotOp) {
            // Return the anchor player instead of the normally assigned player
            const anchorPlayer = teamState.players[teamState.anchorId];
            if (anchorPlayer) {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:getActivePlayer:anchorTakeover',message:'DC-H5: Anchor taking over slot',data:{anchorId:teamState.anchorId,anchorName:anchorPlayer.odName,slotOp},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H5'})}).catch(()=>{});
                // #endregion
                console.log(`[TeamMatch] Double Call-In: Anchor ${anchorPlayer.odName} playing slot ${slotOp} instead of benched player`);
                return anchorPlayer;
            }
        }
        
        const playerId = teamState.slotAssignments[slotOp];
        return teamState.players[playerId] || null;
    }
    
    /**
     * Generate a question for a specific operation
     */
    function generateTeamQuestion(operation) {
        return generateQuestion(operation);
    }
    
    // Team match namespace
    const teamMatchNs = io.of('/arena/teams');
    
    teamMatchNs.on('connection', (socket) => {
        console.log(`[TeamMatch] Client connected: ${socket.id}`);
        
        // Join a team match
        socket.on('join_team_match', async (data) => {
            const { matchId, userId, teamId, partyId } = data;
            
            let match = activeTeamMatches.get(matchId);
            
            // If match doesn't exist, check for AI match setup in Redis
            if (!match) {
                try {
                    const Redis = require('ioredis');
                    const redis = new Redis({
                        host: process.env.REDIS_HOST || 'redis',
                        port: parseInt(process.env.REDIS_PORT || '6379'),
                    });
                    
                    const setupData = await redis.get(`team:match:setup:${matchId}`);
                    await redis.quit();
                    
                    if (setupData) {
                        const setup = JSON.parse(setupData);
                        if (setup.isAIMatch) {
                            console.log(`[TeamMatch] Creating AI match ${matchId} on first player join`);
                            
                            // Generate AI team
                            const aiTeam = generateAITeam(matchId, setup.targetElo, setup.aiDifficulty);
                            
                            // Create the match
                            match = initTeamMatchState(matchId, setup.humanTeam, aiTeam, 'mixed', 'casual');
                            match.isAIMatch = true;
                            match.aiDifficulty = setup.aiDifficulty;
                            
                            // Mark AI players as already "connected"
                            for (const playerId of Object.keys(match.team2.players)) {
                                if (isAIBot(playerId)) {
                                    match.team2.players[playerId].odSocketId = 'ai_bot';
                                    match.team2.players[playerId].isBot = true;
                                    match.team2.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[setup.aiDifficulty || 'medium'];
                                }
                            }
                            
                            activeTeamMatches.set(matchId, match);
                            console.log(`[TeamMatch] AI Match ${matchId} created: ${setup.humanTeam.odTeamName || 'Team 1'} vs ${aiTeam.odTeamName}`);
                        }
                    }
                } catch (err) {
                    console.error('[TeamMatch] Error checking for AI match setup:', err);
                }
            }
            
            if (!match) {
                console.log(`[TeamMatch] Match ${matchId} not found`);
                socket.emit('error', { message: 'Match not found' });
                return;
            }
            
            // Find which team the player is on
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const isTeam2 = Object.keys(match.team2.players).includes(userId);
            
            if (!isTeam1 && !isTeam2) {
                console.log(`[TeamMatch] Player ${userId} not in match ${matchId}`);
                socket.emit('error', { message: 'Player not in this match' });
                return;
            }
            
            const team = isTeam1 ? match.team1 : match.team2;
            const opponentTeam = isTeam1 ? match.team2 : match.team1;
            const player = team.players[userId];
            
            // Update player's socket ID
            player.odSocketId = socket.id;
            
            // Join rooms
            socket.join(matchId);                                  // Match room (both teams)
            socket.join(`team:${matchId}:${team.teamId}`);        // Team room (own team only)
            socketToTeamMatch.set(socket.id, { matchId, userId, teamId: team.teamId });
            
            console.log(`[TeamMatch] ${player.odName} joined match ${matchId} as ${isTeam1 ? 'Team 1' : 'Team 2'}`);
            
            // Send initial match state
            socket.emit('match_state', {
                matchId: match.matchId,
                phase: match.phase,
                round: match.round,
                half: match.half,
                gameClockMs: match.gameClockMs,
                relayClockMs: match.relayClockMs,
                currentSlot: match.currentSlot,
                questionsInSlot: match.questionsInSlot,
                team1: sanitizeTeamState(match.team1, team.teamId === match.team1.teamId),
                team2: sanitizeTeamState(match.team2, team.teamId === match.team2.teamId),
                isMyTeam: team.teamId,
            });
            
            // Notify team about player joining
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('player_connected', {
                userId,
                playerName: player.odName,
            });
            
            // Check if all human players connected (AI bots don't need sockets)
            const allTeam1Connected = Object.values(match.team1.players).every(p => 
                p.odSocketId || isAIBot(p.odUserId)
            );
            const allTeam2Connected = Object.values(match.team2.players).every(p => 
                p.odSocketId || isAIBot(p.odUserId)
            );
            
            if (allTeam1Connected && allTeam2Connected && match.phase === TEAM_MATCH_PHASES.PRE_MATCH) {
                // Transition to STRATEGY phase for slot assignment
                setTimeout(() => startStrategyPhase(match, teamMatchNs), 2000);
            }
        });
        
        // =================================================================
        // CREATE AI TEAM MATCH (For Testing)
        // =================================================================
        socket.on('create_ai_match', async (data) => {
            const { matchId, humanTeam, difficulty, operation } = data;
            
            if (!matchId || !humanTeam) {
                socket.emit('error', { message: 'Invalid AI match data' });
                return;
            }
            
            console.log(`[TeamMatch] Creating AI match ${matchId} with difficulty: ${difficulty || 'medium'}`);
            
            // Generate AI team based on human team ELO
            const targetElo = humanTeam.odElo || 500;
            const aiTeam = generateAITeam(matchId, targetElo, difficulty || 'medium');
            
            // Create the match
            const match = initTeamMatchState(matchId, humanTeam, aiTeam, operation || 'mixed', 'casual');
            match.isAIMatch = true;
            match.aiDifficulty = difficulty || 'medium';
            
            // Mark AI players as already "connected" (they don't use real sockets)
            for (const playerId of Object.keys(match.team2.players)) {
                if (isAIBot(playerId)) {
                    match.team2.players[playerId].odSocketId = 'ai_bot';
                    match.team2.players[playerId].isBot = true;
                    match.team2.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[difficulty || 'medium'];
                }
            }
            
            activeTeamMatches.set(matchId, match);
            
            console.log(`[TeamMatch] AI Match ${matchId} created: ${humanTeam.odTeamName || 'Team 1'} vs ${aiTeam.odTeamName}`);
            
            // Notify the requesting socket
            socket.emit('ai_match_created', {
                matchId,
                aiTeam: {
                    teamId: aiTeam.odTeamId,
                    teamName: aiTeam.odTeamName,
                    teamTag: aiTeam.odTeamTag,
                    members: aiTeam.odMembers.map(m => ({
                        odUserId: m.odUserId,
                        odUserName: m.odUserName,
                        odLevel: m.odLevel,
                        odEquippedFrame: m.odEquippedFrame,
                        odEquippedTitle: m.odEquippedTitle,
                        slot: m.odPreferredOperation,
                    })),
                },
            });
        });
        
        // =================================================================
        // IGL SLOT ASSIGNMENT DURING STRATEGY PHASE
        // =================================================================
        socket.on('update_slot_assignment', (data) => {
            const { matchId, userId, playerId, newSlot } = data;
            
            const match = activeTeamMatches.get(matchId);
            if (!match || match.phase !== TEAM_MATCH_PHASES.STRATEGY) {
                socket.emit('error', { message: 'Can only update slots during strategy phase' });
                return;
            }
            
            // Find which team the user is on and verify they are IGL
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;
            
            if (team.iglId !== userId) {
                socket.emit('error', { message: 'Only IGL can reassign slots' });
                return;
            }
            
            // Verify playerId is on the same team
            if (!team.players[playerId]) {
                socket.emit('error', { message: 'Player not on your team' });
                return;
            }
            
            // Find the player currently in the target slot and swap
            const targetPlayer = Object.values(team.players).find(p => p.slot === newSlot);
            const movingPlayer = team.players[playerId];
            
            if (targetPlayer && targetPlayer.odUserId !== playerId) {
                // Swap slots
                const oldSlot = movingPlayer.slot;
                targetPlayer.slot = oldSlot;
                movingPlayer.slot = newSlot;
                
                console.log(`[TeamMatch] IGL ${userId} swapped ${movingPlayer.odName} (slot ${oldSlot}→${newSlot}) with ${targetPlayer.odName} (slot ${newSlot}→${oldSlot})`);
            } else {
                // Just move to empty slot
                movingPlayer.slot = newSlot;
            }
            
            // Broadcast updated slot assignments to team
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('slot_assignments_updated', {
                slots: getTeamSlotAssignments(team),
            });
        });
        
        socket.on('confirm_slots', (data) => {
            const { matchId, userId } = data;
            
            const match = activeTeamMatches.get(matchId);
            if (!match || match.phase !== TEAM_MATCH_PHASES.STRATEGY) return;
            
            // Find which team the user is on and verify they are IGL
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;
            
            if (team.iglId !== userId) {
                socket.emit('error', { message: 'Only IGL can confirm slots' });
                return;
            }
            
            // Mark this team as ready
            team.slotsConfirmed = true;
            
            console.log(`[TeamMatch] Team ${team.teamId} confirmed slots`);
            
            // If both teams confirmed (or this is AI match), start match immediately
            const bothConfirmed = match.team1.slotsConfirmed && match.team2.slotsConfirmed;
            const isAIMatch = match.isAIMatch && (match.team1.slotsConfirmed || match.team2.slotsConfirmed);
            
            if (bothConfirmed || isAIMatch) {
                if (match.strategyTimer) {
                    clearInterval(match.strategyTimer);
                    match.strategyTimer = null;
                }
                console.log(`[TeamMatch] Both teams confirmed, starting match immediately`);
                startTeamMatch(match, teamMatchNs);
            } else {
                // Notify the other team that this team is ready
                teamMatchNs.to(match.matchId).emit('team_ready', {
                    teamId: team.teamId,
                });
            }
        });
        
        // =================================================================
        // DOUBLE CALL-IN (IGL activates Anchor to play additional slot)
        // Per spec: Anchor plays their slot + one additional, benching that player
        // Available: 1st Half R1-3, 2nd Half R1 only
        // =================================================================
        socket.on('anchor_callin', (data) => {
            const { matchId, userId, targetSlot, half } = data;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:anchor_callin:entry',message:'DC-H2: Server received anchor_callin',data:{matchId,userId,targetSlot,half,hasUserId:!!userId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H2'})}).catch(()=>{});
            // #endregion
            
            console.log(`[TeamMatch] anchor_callin received:`, { matchId, userId, targetSlot, half });
            
            const match = activeTeamMatches.get(matchId);
            if (!match) {
                socket.emit('error', { message: 'Match not found' });
                return;
            }
            
            // Can use during break phase, halftime, OR strategy phase (for Round 1)
            const validPhases = [TEAM_MATCH_PHASES.BREAK, TEAM_MATCH_PHASES.HALFTIME, TEAM_MATCH_PHASES.STRATEGY];
            if (!validPhases.includes(match.phase)) {
                socket.emit('error', { message: 'Can only use Double Call-In during breaks or strategy phase' });
                return;
            }
            
            // Find team and verify IGL
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;
            
            if (team.iglId !== userId) {
                socket.emit('error', { message: 'Only IGL can activate Double Call-In' });
                return;
            }
            
            // Check if already used this half
            const usedThisHalf = match.half === 1 ? team.usedDoubleCallinHalf1 : team.usedDoubleCallinHalf2;
            if (usedThisHalf) {
                socket.emit('error', { message: 'Double Call-In already used this half' });
                return;
            }
            
            // Validate round restrictions per spec
            // 1st Half: R1, R2, or R3 (NOT R4)
            // 2nd Half: R1 ONLY
            const roundInHalf = match.half === 1 ? match.round : match.round - 4;
            if (match.half === 1 && roundInHalf >= 4) {
                socket.emit('error', { message: 'Cannot use Double Call-In in Round 4 of 1st Half' });
                return;
            }
            if (match.half === 2 && roundInHalf > 1) {
                socket.emit('error', { message: '2nd Half: Double Call-In only available in Round 1' });
                return;
            }
            
            // Get the target slot operation
            const slotOp = typeof targetSlot === 'number' 
                ? SLOT_OPERATIONS[targetSlot - 1] 
                : targetSlot;
            
            if (!slotOp || !SLOT_OPERATIONS.includes(slotOp)) {
                socket.emit('error', { message: 'Invalid target slot' });
                return;
            }
            
            // Find the player being benched (the one normally in this slot)
            const benchedPlayerId = team.slotAssignments[slotOp];
            const benchedPlayer = team.players[benchedPlayerId];
            const anchorPlayer = team.players[team.anchorId];
            
            if (!benchedPlayer || !anchorPlayer) {
                socket.emit('error', { message: 'Could not find benched or anchor player' });
                return;
            }
            
            // Can't bench the anchor (they're already playing their slot)
            if (benchedPlayerId === team.anchorId) {
                socket.emit('error', { message: 'Cannot bench the anchor - select a different slot' });
                return;
            }
            
            // Activate Double Call-In
            team.doubleCallinActive = true;
            team.doubleCallinSlot = slotOp;
            team.doubleCallinBenchedId = benchedPlayerId;
            
            // Mark as used for this half
            if (match.half === 1) {
                team.usedDoubleCallinHalf1 = true;
            } else {
                team.usedDoubleCallinHalf2 = true;
            }
            
            // Determine which round the Double Call-In applies to:
            // - During STRATEGY phase: applies to Round 1 (the round about to start)
            // - During BREAK phase: applies to the next round (match.round + 1)
            const isStrategyPhaseForLog = match.phase === TEAM_MATCH_PHASES.STRATEGY;
            const targetRound = isStrategyPhaseForLog ? 1 : match.round + 1;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:anchor_callin:activated',message:'DC-H3: Double Call-In ACTIVATED on server',data:{teamId:isTeam1?'team1':'team2',doubleCallinActive:team.doubleCallinActive,doubleCallinSlot:team.doubleCallinSlot,benchedPlayerId,anchorId:team.anchorId,forRound:targetRound,currentRound:match.round,phase:match.phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H3'})}).catch(()=>{});
            // #endregion
            
            console.log(`[TeamMatch] Double Call-In ACTIVATED:`);
            console.log(`  - Anchor: ${anchorPlayer.odName} will play ${slotOp} slot`);
            console.log(`  - Benched: ${benchedPlayer.odName} sits out Round ${targetRound}`);
            console.log(`  - Half: ${match.half}, Round: ${targetRound}, Phase: ${match.phase}`);
            
            // Determine which round the Double Call-In applies to:
            // - During STRATEGY phase: applies to Round 1 (the round about to start)
            // - During BREAK phase: applies to the next round (match.round + 1)
            const isStrategyPhase = match.phase === TEAM_MATCH_PHASES.STRATEGY;
            const forRound = isStrategyPhase ? 1 : match.round + 1;
            
            // Broadcast to all players in match
            teamMatchNs.to(matchId).emit('double_callin_activated', {
                teamId: team.teamId,
                anchorId: team.anchorId,
                anchorName: anchorPlayer.odName,
                targetSlot: slotOp,
                benchedPlayerId,
                benchedPlayerName: benchedPlayer.odName,
                half: match.half,
                forRound,
            });
            
            // Also send success confirmation to the IGL
            socket.emit('double_callin_success', {
                message: `${anchorPlayer.odName} will take over ${slotOp} slot from ${benchedPlayer.odName} in Round ${forRound}`,
            });
        });
        
        // Submit an answer
        socket.on('submit_answer', (data) => {
            const { matchId, userId, answer } = data;
            
            const match = activeTeamMatches.get(matchId);
            if (!match || match.phase !== TEAM_MATCH_PHASES.ACTIVE) return;
            
            // Find player
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;
            const opponentTeam = isTeam1 ? match.team2 : match.team1;
            const player = team.players[userId];
            
            if (!player || !player.isActive || !player.currentQuestion) {
                socket.emit('error', { message: 'Not your turn' });
                return;
            }
            
            const answerTimeMs = Date.now() - player.questionStartTime;
            const isCorrect = parseInt(answer) === player.currentQuestion.answer;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:submit_answer',message:'H3A/H3B: answer submitted - before increment (PER-TEAM)',data:{userId,teamId:team.teamId,isCorrect,teamQuestionsInSlotBefore:team.questionsInSlot,teamCurrentSlot:team.currentSlot,QUESTIONS_PER_SLOT:TEAM_MATCH_CONFIG.QUESTIONS_PER_SLOT},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3A,H3B'})}).catch(()=>{});
            // #endregion
            
            player.total++;
            player.totalAnswerTimeMs += answerTimeMs;
            
            let pointsEarned = 0;
            
            if (isCorrect) {
                player.correct++;
                player.streak++;
                player.maxStreak = Math.max(player.maxStreak, player.streak);
                team.currentStreak++;
                
                // Calculate points with streak bonus
                pointsEarned = TEAM_MATCH_CONFIG.POINTS_PER_CORRECT + 
                    (player.streak - 1) * TEAM_MATCH_CONFIG.STREAK_BONUS;
                
                player.score += pointsEarned;
                team.score += pointsEarned;
            } else {
                player.streak = 0;
                team.currentStreak = 0;
                // TODO: Add wrong answer delay penalty
            }
            
            // Emit result to both teams (no question details for opponent)
            teamMatchNs.to(matchId).emit('answer_result', {
                teamId: team.teamId,
                userId,
                isCorrect,
                pointsEarned,
                newStreak: player.streak,
                newTeamScore: team.score,
                newPlayerScore: player.score,
                questionsInSlot: team.questionsInSlot + 1, // Use team-specific counter
            });
            
            // Send full question to own team
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('teammate_answer', {
                userId,
                question: player.currentQuestion.question,
                correctAnswer: player.currentQuestion.answer,
                playerAnswer: answer,
                isCorrect,
                answerTimeMs,
            });
            
            // Advance to next question or slot (per-team)
            team.questionsInSlot++;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:submit_answer_after',message:'H3A/H3B: after increment - using TEAM counter',data:{teamId:team.teamId,questionsInSlotAfter:team.questionsInSlot,willAdvanceSlot:team.questionsInSlot>=TEAM_MATCH_CONFIG.QUESTIONS_PER_SLOT,teamCurrentSlot:team.currentSlot},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3A,H3B'})}).catch(()=>{});
            // #endregion
            
            if (team.questionsInSlot >= TEAM_MATCH_CONFIG.QUESTIONS_PER_SLOT) {
                // This team's slot complete - advance their slot
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:submit_answer:advance_slot',message:'Q6-H1: Advancing to next slot (NOT generating Q6)',data:{teamId:team.teamId,questionsInSlot:team.questionsInSlot,currentSlot:team.currentSlot},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'Q6-H1'})}).catch(()=>{});
                // #endregion
                advanceTeamToNextSlot(match, team, teamMatchNs);
            } else {
                // Generate next question for this player
                // #region agent log
                const questionNumber = team.questionsInSlot + 1;
                if (questionNumber > 5) {
                    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:submit_answer:Q6_BUG',message:'Q6-H2: BUG! About to generate Q6+!',data:{teamId:team.teamId,questionsInSlot:team.questionsInSlot,nextQuestionNumber:questionNumber,currentSlot:team.currentSlot},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'Q6-H2'})}).catch(()=>{});
                }
                // #endregion
                generateNextQuestion(match, player, team, teamMatchNs);
            }
        });
        
        // Typing update (for teammate spectating)
        socket.on('typing_update', (data) => {
            const { matchId, userId, currentInput } = data;
            
            const socketData = socketToTeamMatch.get(socket.id);
            if (!socketData || socketData.matchId !== matchId) return;
            
            const match = activeTeamMatches.get(matchId);
            if (!match) return;
            
            // Throttle handled client-side, just broadcast to team
            teamMatchNs.to(`team:${matchId}:${socketData.teamId}`).emit('typing_update', {
                userId,
                currentInput,
            });
        });
        
        // IGL calls timeout
        socket.on('igl_timeout', (data) => {
            const { matchId, userId } = data;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:igl_timeout:entry',message:'TO-H1: igl_timeout event received',data:{matchId,userId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TO-H1'})}).catch(()=>{});
            // #endregion
            
            const match = activeTeamMatches.get(matchId);
            if (!match) {
                console.log(`[TeamMatch] igl_timeout: Match ${matchId} not found`);
                return;
            }
            
            // Verify user is IGL and team hasn't used all timeouts
            const isTeam1Igl = match.team1.iglId === userId;
            const isTeam2Igl = match.team2.iglId === userId;
            
            if (!isTeam1Igl && !isTeam2Igl) {
                socket.emit('error', { message: 'Only IGL can call timeout' });
                return;
            }
            
            const team = isTeam1Igl ? match.team1 : match.team2;
            
            if (team.timeoutsUsed >= TEAM_MATCH_CONFIG.TIMEOUTS_PER_TEAM) {
                socket.emit('error', { message: 'No timeouts remaining' });
                return;
            }
            
            // Can only call timeout during breaks or halftime
            if (match.phase !== TEAM_MATCH_PHASES.BREAK && match.phase !== TEAM_MATCH_PHASES.HALFTIME) {
                socket.emit('error', { message: 'Can only call timeout during breaks' });
                return;
            }
            
            team.timeoutsUsed++;
            
            // Calculate remaining time and extend it
            const now = Date.now();
            const remainingMs = match.breakEndTime ? Math.max(0, match.breakEndTime - now) : 0;
            const newDurationMs = remainingMs + TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS;
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:igl_timeout:before_clear',message:'TO-H2: Before clearing timeout',data:{matchId,hasBreakTimeout:!!match.breakTimeout,breakEndTime:match.breakEndTime,remainingMs,newDurationMs,phase:match.phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TO-H2'})}).catch(()=>{});
            // #endregion
            
            // Clear existing break timeout and create new one with extended duration
            if (match.breakTimeout) {
                clearTimeout(match.breakTimeout);
                console.log(`[TeamMatch] Cleared existing break timeout`);
            }
            
            match.breakEndTime = now + newDurationMs;
            match.breakRemainingMs = newDurationMs;
            
            match.breakTimeout = setTimeout(() => {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:igl_timeout:timeout_fired',message:'TO-H3: Extended timeout fired',data:{matchId,phase:match.phase,expectedDurationMs:newDurationMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TO-H3'})}).catch(()=>{});
                // #endregion
                if (match.phase === TEAM_MATCH_PHASES.BREAK) {
                    startNextRound(match, teamMatchNs);
                } else if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    // For halftime, resume after extension
                    match.round = 0;
                    match.gameClockMs = TEAM_MATCH_CONFIG.HALF_DURATION_MS;
                    startNextRound(match, teamMatchNs);
                }
            }, newDurationMs);
            
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:igl_timeout:after_create',message:'TO-H2: After creating new timeout',data:{matchId,newBreakTimeoutSet:!!match.breakTimeout,newBreakEndTime:match.breakEndTime,newDurationMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TO-H2'})}).catch(()=>{});
            // #endregion
            
            // Notify clients about the timeout extension
            teamMatchNs.to(matchId).emit('timeout_called', {
                teamId: team.teamId,
                teamName: team.teamName,
                timeoutsRemaining: TEAM_MATCH_CONFIG.TIMEOUTS_PER_TEAM - team.timeoutsUsed,
                extensionMs: TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS,
                newBreakDurationMs: newDurationMs,
            });
            
            console.log(`[TeamMatch] Timeout called by ${team.teamName} in match ${matchId}. Break extended by ${TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS}ms to ${newDurationMs}ms total`);
        });
        
        // IGL swaps slot assignments (during halftime)
        socket.on('igl_swap_slots', (data) => {
            const { matchId, userId, newAssignments } = data;
            
            const match = activeTeamMatches.get(matchId);
            if (!match || match.phase !== TEAM_MATCH_PHASES.HALFTIME) {
                socket.emit('error', { message: 'Can only swap slots during halftime' });
                return;
            }
            
            const isTeam1Igl = match.team1.iglId === userId;
            const isTeam2Igl = match.team2.iglId === userId;
            
            if (!isTeam1Igl && !isTeam2Igl) {
                socket.emit('error', { message: 'Only IGL can swap slots' });
                return;
            }
            
            const team = isTeam1Igl ? match.team1 : match.team2;
            
            // Validate new assignments
            const validPlayers = Object.keys(team.players);
            const assignedPlayers = Object.values(newAssignments);
            
            if (!assignedPlayers.every(p => validPlayers.includes(p))) {
                socket.emit('error', { message: 'Invalid slot assignment' });
                return;
            }
            
            team.slotAssignments = newAssignments;
            
            // Update player slot references
            for (const [slot, playerId] of Object.entries(newAssignments)) {
                if (team.players[playerId]) {
                    team.players[playerId].slot = slot;
                }
            }
            
            // Notify team
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('slots_updated', {
                newAssignments,
            });
            
            console.log(`[TeamMatch] Slots swapped by IGL in ${team.teamName}, match ${matchId}`);
        });
        
        // Anchor activates double call-in
        socket.on('anchor_double_callin', (data) => {
            const { matchId, userId, targetSlot } = data;
            
            const match = activeTeamMatches.get(matchId);
            if (!match) return;
            
            const isTeam1Anchor = match.team1.anchorId === userId;
            const isTeam2Anchor = match.team2.anchorId === userId;
            
            if (!isTeam1Anchor && !isTeam2Anchor) {
                socket.emit('error', { message: 'Only Anchor can use double call-in' });
                return;
            }
            
            const team = isTeam1Anchor ? match.team1 : match.team2;
            const anchor = team.players[userId];
            
            if (anchor.usedDoubleCallin) {
                socket.emit('error', { message: 'Double call-in already used' });
                return;
            }
            
            anchor.usedDoubleCallin = true;
            
            // Notify match about anchor ability
            teamMatchNs.to(matchId).emit('anchor_ability_used', {
                teamId: team.teamId,
                ability: 'double_callin',
                targetSlot,
            });
            
            console.log(`[TeamMatch] Anchor double call-in used by ${team.teamName}, match ${matchId}`);
        });
        
        // =====================================================================
        // TEAMMATE SEARCH & IGL SELECTION (For Partial Parties)
        // =====================================================================
        
        // Store socket mappings for teammate search
        const teammateSearchSockets = new Map(); // partyId -> [socket.id, ...]
        const assembledTeamSockets = new Map();  // assembledTeamId -> [socket.id, ...]
        
        // Join teammate search queue
        socket.on('join_teammate_search', async (data) => {
            const { partyId, userId, operation } = data;
            
            // Store socket for this party
            if (!teammateSearchSockets.has(partyId)) {
                teammateSearchSockets.set(partyId, []);
            }
            teammateSearchSockets.get(partyId).push(socket.id);
            
            // Join a room for this party's search
            socket.join(`teammate_search:${partyId}`);
            
            console.log(`[TeamMatch] User ${userId} joined teammate search for party ${partyId}`);
            
            socket.emit('teammate_search_joined', { partyId });
        });
        
        // Check for teammates (called periodically by client)
        socket.on('check_teammates', async (data) => {
            const { partyId } = data;
            
            // This will be handled by server actions, but we can broadcast updates
            socket.emit('teammate_search_status', {
                partyId,
                phase: 'searching',
            });
        });
        
        // Leave teammate search
        socket.on('leave_teammate_search', (data) => {
            const { partyId } = data;
            
            socket.leave(`teammate_search:${partyId}`);
            
            const sockets = teammateSearchSockets.get(partyId);
            if (sockets) {
                const idx = sockets.indexOf(socket.id);
                if (idx > -1) sockets.splice(idx, 1);
                if (sockets.length === 0) teammateSearchSockets.delete(partyId);
            }
            
            console.log(`[TeamMatch] Socket left teammate search for party ${partyId}`);
        });
        
        // Join assembled team for IGL selection
        socket.on('join_assembled_team', (data) => {
            const { assembledTeamId, userId } = data;
            
            if (!assembledTeamSockets.has(assembledTeamId)) {
                assembledTeamSockets.set(assembledTeamId, []);
            }
            assembledTeamSockets.get(assembledTeamId).push(socket.id);
            
            socket.join(`assembled:${assembledTeamId}`);
            
            console.log(`[TeamMatch] User ${userId} joined assembled team ${assembledTeamId} for IGL selection`);
            
            socket.emit('assembled_team_joined', { assembledTeamId });
        });
        
        // Vote for IGL (in assembled team)
        socket.on('vote_igl', async (data) => {
            const { assembledTeamId, targetUserId, voterId } = data;
            
            // Broadcast vote update to all team members
            teamMatchNs.to(`assembled:${assembledTeamId}`).emit('igl_vote_update', {
                assembledTeamId,
                targetUserId,
                voterId,
            });
            
            console.log(`[TeamMatch] IGL vote: ${voterId} voted for ${targetUserId} in ${assembledTeamId}`);
        });
        
        // Vote for Anchor (in assembled team)
        socket.on('vote_anchor', async (data) => {
            const { assembledTeamId, targetUserId, voterId } = data;
            
            // Broadcast vote update to all team members
            teamMatchNs.to(`assembled:${assembledTeamId}`).emit('anchor_vote_update', {
                assembledTeamId,
                targetUserId,
                voterId,
            });
            
            console.log(`[TeamMatch] Anchor vote: ${voterId} voted for ${targetUserId} in ${assembledTeamId}`);
        });
        
        // IGL/Anchor selection complete - notify team to move to opponent queue
        socket.on('igl_selection_complete', (data) => {
            const { assembledTeamId, iglId, anchorId, newPartyId } = data;
            
            // Notify all team members to transition to opponent search
            teamMatchNs.to(`assembled:${assembledTeamId}`).emit('roles_confirmed', {
                assembledTeamId,
                iglId,
                anchorId,
                newPartyId,
                message: 'Roles confirmed! Finding opponents...',
            });
            
            console.log(`[TeamMatch] IGL selection complete for ${assembledTeamId}, new party: ${newPartyId}`);
            
            // Clean up assembled team sockets
            const sockets = assembledTeamSockets.get(assembledTeamId);
            if (sockets) {
                for (const sid of sockets) {
                    const s = teamMatchNs.sockets.get(sid);
                    if (s) s.leave(`assembled:${assembledTeamId}`);
                }
                assembledTeamSockets.delete(assembledTeamId);
            }
        });
        
        // Notify party members that a team has been assembled
        socket.on('team_assembled_notify', (data) => {
            const { partyIds, assembledTeamId, members } = data;
            
            // Notify all parties involved
            for (const partyId of partyIds) {
                teamMatchNs.to(`teammate_search:${partyId}`).emit('team_assembled', {
                    assembledTeamId,
                    members,
                    message: 'Team formed! Select your IGL and Anchor.',
                });
            }
            
            console.log(`[TeamMatch] Team assembled: ${assembledTeamId} from parties: ${partyIds.join(', ')}`);
        });
        
        // ========================================
        // QUIT VOTE SYSTEM
        // ========================================
        
        // Track active quit votes per match (matchId -> vote data)
        if (!global.activeQuitVotes) {
            global.activeQuitVotes = new Map();
        }
        
        // Initiate a quit vote (party leader only)
        socket.on('initiate_quit_vote', (data) => {
            const { matchId } = data;
            const socketData = socketToTeamMatch.get(socket.id);
            if (!socketData) {
                socket.emit('error', { message: 'Not in a match' });
                return;
            }
            
            const match = activeTeamMatches.get(matchId);
            if (!match) {
                socket.emit('error', { message: 'Match not found' });
                return;
            }
            
            const { userId, teamId } = socketData;
            const team = match.team1.teamId === teamId ? match.team1 : match.team2;
            
            // Verify user is the party leader
            if (team.leaderId !== userId) {
                socket.emit('error', { message: 'Only the party leader can initiate a quit vote' });
                return;
            }
            
            // Check if there's already an active vote for this team
            const voteKey = `${matchId}:${teamId}`;
            if (global.activeQuitVotes.has(voteKey)) {
                socket.emit('error', { message: 'A quit vote is already in progress' });
                return;
            }
            
            // Initialize vote
            const votes = {};
            for (const playerId of Object.keys(team.players)) {
                votes[playerId] = null; // null = hasn't voted
            }
            // Leader auto-votes yes
            votes[userId] = 'yes';
            
            const voteData = {
                matchId,
                teamId,
                initiatorId: userId,
                initiatorName: team.players[userId]?.odName || 'Unknown',
                votes,
                expiresAt: Date.now() + 30000, // 30 second timeout
                timer: null,
            };
            
            global.activeQuitVotes.set(voteKey, voteData);
            
            // Notify all team members about the vote
            teamMatchNs.to(`team:${matchId}:${teamId}`).emit('quit_vote_started', {
                initiatorId: userId,
                initiatorName: voteData.initiatorName,
                votes: voteData.votes,
                expiresAt: voteData.expiresAt,
            });
            
            console.log(`[TeamMatch] Quit vote started by ${voteData.initiatorName} in match ${matchId}`);
            
            // Set timer for auto-resolution
            voteData.timer = setTimeout(() => {
                resolveQuitVote(matchId, teamId, teamMatchNs);
            }, 30000);
        });
        
        // Cast a quit vote
        socket.on('cast_quit_vote', (data) => {
            const { matchId, vote } = data;
            const socketData = socketToTeamMatch.get(socket.id);
            if (!socketData) return;
            
            const { userId, teamId } = socketData;
            const voteKey = `${matchId}:${teamId}`;
            const voteData = global.activeQuitVotes.get(voteKey);
            
            if (!voteData) {
                socket.emit('error', { message: 'No active quit vote' });
                return;
            }
            
            // Validate vote value
            if (vote !== 'yes' && vote !== 'no') {
                socket.emit('error', { message: 'Invalid vote' });
                return;
            }
            
            // Check if user is part of this team
            if (voteData.votes[userId] === undefined) {
                socket.emit('error', { message: 'You are not part of this team' });
                return;
            }
            
            // Record vote
            voteData.votes[userId] = vote;
            
            // Broadcast updated votes to team
            teamMatchNs.to(`team:${matchId}:${teamId}`).emit('quit_vote_update', {
                votes: voteData.votes,
            });
            
            console.log(`[TeamMatch] ${userId} voted '${vote}' in quit vote for match ${matchId}`);
            
            // Check if all votes are in
            const allVoted = Object.values(voteData.votes).every(v => v !== null);
            if (allVoted) {
                clearTimeout(voteData.timer);
                resolveQuitVote(matchId, teamId, teamMatchNs);
            }
        });
        
        // Helper function to resolve a quit vote
        function resolveQuitVote(matchId, teamId, ns) {
            const voteKey = `${matchId}:${teamId}`;
            const voteData = global.activeQuitVotes.get(voteKey);
            if (!voteData) return;
            
            // Count votes
            const yesVotes = Object.values(voteData.votes).filter(v => v === 'yes').length;
            const noVotes = Object.values(voteData.votes).filter(v => v === 'no').length;
            const totalMembers = Object.keys(voteData.votes).length;
            
            // Majority wins (3 out of 5)
            const result = yesVotes > totalMembers / 2 ? 'quit' : 'stay';
            
            console.log(`[TeamMatch] Quit vote resolved: ${yesVotes} yes, ${noVotes} no - result: ${result}`);
            
            // Notify team of result
            ns.to(`team:${matchId}:${teamId}`).emit('quit_vote_result', {
                result,
                yesVotes,
                noVotes,
                votes: voteData.votes,
            });
            
            // Clean up
            if (voteData.timer) clearTimeout(voteData.timer);
            global.activeQuitVotes.delete(voteKey);
            
            // If quit, end the match for this team (forfeit)
            if (result === 'quit') {
                const match = activeTeamMatches.get(matchId);
                if (match && match.phase !== 'post_match') {
                    const team = match.team1.teamId === teamId ? match.team1 : match.team2;
                    const opponentTeam = match.team1.teamId === teamId ? match.team2 : match.team1;
                    
                    // Mark match as forfeited
                    match.phase = 'post_match';
                    match.forfeitedBy = teamId;
                    
                    // Notify both teams
                    ns.to(matchId).emit('team_forfeit', {
                        forfeitingTeamId: teamId,
                        forfeitingTeamName: team.teamName,
                        winningTeamId: opponentTeam.teamId,
                        winningTeamName: opponentTeam.teamName,
                    });
                    
                    console.log(`[TeamMatch] Team ${team.teamName} forfeited match ${matchId}`);
                    
                    // End the match after a short delay
                    setTimeout(() => {
                        endTeamMatch(match, ns);
                    }, 3000);
                }
            }
        }
        
        // ========================================
        // END QUIT VOTE SYSTEM
        // ========================================
        
        // Handle disconnect
        socket.on('disconnect', () => {
            const socketData = socketToTeamMatch.get(socket.id);
            if (!socketData) return;
            
            const { matchId, userId, teamId } = socketData;
            const match = activeTeamMatches.get(matchId);
            
            if (match) {
                const team = match.team1.teamId === teamId ? match.team1 : match.team2;
                const player = team.players[userId];
                
                if (player) {
                    player.odSocketId = null;
                    
                    // Notify team about disconnect
                    teamMatchNs.to(`team:${matchId}:${teamId}`).emit('player_disconnected', {
                        userId,
                        playerName: player.odName,
                    });
                    
                    console.log(`[TeamMatch] ${player.odName} disconnected from match ${matchId}`);
                }
            }
            
            socketToTeamMatch.delete(socket.id);
        });
    });
    
    /**
     * Sanitize team state for sending to clients
     * Hides sensitive data from opponent team
     */
    function sanitizeTeamState(teamState, isOwnTeam) {
        const sanitized = {
            teamId: teamState.teamId,
            teamName: teamState.teamName,
            teamTag: teamState.teamTag,
            leaderId: teamState.leaderId, // Party leader for quit votes
            iglId: teamState.iglId,       // IGL for role display
            anchorId: teamState.anchorId, // Anchor for role display
            score: teamState.score,
            currentStreak: teamState.currentStreak,
            isHome: teamState.isHome,
            timeoutsUsed: teamState.timeoutsUsed,
            slotAssignments: teamState.slotAssignments,
            currentSlot: teamState.currentSlot,         // Per-team slot tracking
            questionsInSlot: teamState.questionsInSlot, // Per-team questions progress
            players: {},
        };
        
        for (const [userId, player] of Object.entries(teamState.players)) {
            sanitized.players[userId] = {
                odUserId: player.odUserId,
                odName: player.odName,
                odLevel: player.odLevel,
                odEquippedFrame: player.odEquippedFrame,
                slot: player.slot,
                score: player.score,
                correct: player.correct,
                total: player.total,
                streak: player.streak,
                maxStreak: player.maxStreak,
                isActive: player.isActive,
                isComplete: player.isComplete,
                isIgl: player.isIgl,
                isAnchor: player.isAnchor,
                // Only send question to own team
                currentQuestion: isOwnTeam ? player.currentQuestion : null,
            };
        }
        
        return sanitized;
    }
    
    /**
     * Start the STRATEGY phase where IGL assigns slots before match starts
     */
    function startStrategyPhase(match, ns) {
        match.phase = TEAM_MATCH_PHASES.STRATEGY;
        match.strategyStartTime = Date.now();
        match.strategyTimeRemainingMs = TEAM_MATCH_CONFIG.STRATEGY_DURATION_MS;
        
        const team1Slots = getTeamSlotAssignments(match.team1);
        const team2Slots = getTeamSlotAssignments(match.team2);
        
        console.log(`[TeamMatch] Match ${match.matchId} entering STRATEGY phase (${TEAM_MATCH_CONFIG.STRATEGY_DURATION_MS / 1000}s)`);
        console.log(`[TeamMatch] Team1 slots:`, JSON.stringify(team1Slots));
        console.log(`[TeamMatch] Team2 slots:`, JSON.stringify(team2Slots));
        
        // Emit strategy phase started to all players
        ns.to(match.matchId).emit('strategy_phase_start', {
            matchId: match.matchId,
            durationMs: TEAM_MATCH_CONFIG.STRATEGY_DURATION_MS,
            team1Slots,
            team2Slots,
            team1IglId: match.team1.iglId,
            team2IglId: match.team2.iglId,
        });
        
        // Start countdown timer for strategy phase
        match.strategyTimer = setInterval(() => {
            const elapsed = Date.now() - match.strategyStartTime;
            match.strategyTimeRemainingMs = Math.max(0, TEAM_MATCH_CONFIG.STRATEGY_DURATION_MS - elapsed);
            
            // Emit time remaining every 5 seconds
            if (elapsed % 5000 < 1000) {
                ns.to(match.matchId).emit('strategy_time_update', {
                    remainingMs: match.strategyTimeRemainingMs,
                });
            }
            
            // When time expires, start the match
            if (match.strategyTimeRemainingMs === 0) {
                clearInterval(match.strategyTimer);
                match.strategyTimer = null;
                console.log(`[TeamMatch] Strategy phase ended for ${match.matchId}, starting match`);
                startTeamMatch(match, ns);
            }
        }, 1000);
    }
    
    /**
     * Get slot assignments for a team (player -> slot mapping)
     */
    function getTeamSlotAssignments(team) {
        const slots = {};
        for (const [playerId, player] of Object.entries(team.players)) {
            slots[playerId] = {
                slot: player.slot,
                name: player.odName,
                isIgl: player.isIgl,
                isAnchor: player.isAnchor,
            };
        }
        return slots;
    }
    
    /**
     * Start a team match
     */
    function startTeamMatch(match, ns) {
        match.phase = TEAM_MATCH_PHASES.ACTIVE;
        match.startTime = Date.now();
        match.roundStartTime = Date.now();
        match.lastTickTime = Date.now();
        
        // Set first players as active and generate their questions
        const slot1Op = getSlotOperation(1, match.operation);
        
        for (const team of [match.team1, match.team2]) {
            const activePlayer = getActivePlayer(team, 1);
            if (activePlayer) {
                activePlayer.isActive = true;
                activePlayer.currentQuestion = generateTeamQuestion(slot1Op);
                activePlayer.questionStartTime = Date.now();
            }
        }
        
        // Get active player IDs for both teams
        const team1ActivePlayer = getActivePlayer(match.team1, 1);
        const team2ActivePlayer = getActivePlayer(match.team2, 1);
        
        // Notify all players with full match state including active players
        ns.to(match.matchId).emit('match_start', {
            round: match.round,
            half: match.half,
            currentSlot: match.currentSlot,
            slotOperation: slot1Op,
            // Include active player IDs so clients can update their state
            team1ActivePlayerId: team1ActivePlayer?.odUserId || null,
            team2ActivePlayerId: team2ActivePlayer?.odUserId || null,
        });
        
        // Send FULL state update to each player so they see both teams correctly
        for (const team of [match.team1, match.team2]) {
            for (const playerId of Object.keys(team.players)) {
                const player = team.players[playerId];
                if (player.odSocketId && !isAIBot(playerId)) {
                    // Send full match state to this player
                    const playerSocket = ns.sockets.get(player.odSocketId);
                    if (playerSocket) {
                        playerSocket.emit('match_state', {
                            matchId: match.matchId,
                            phase: match.phase,
                            round: match.round,
                            half: match.half,
                            gameClockMs: match.gameClockMs,
                            relayClockMs: match.relayClockMs,
                            currentSlot: match.currentSlot,
                            questionsInSlot: match.questionsInSlot,
                            team1: sanitizeTeamState(match.team1, team.teamId === match.team1.teamId),
                            team2: sanitizeTeamState(match.team2, team.teamId === match.team2.teamId),
                            isMyTeam: team.teamId,
                        });
                    }
                }
            }
        }
        
        // Also send question_update for convenience (some UI elements listen for this)
        for (const team of [match.team1, match.team2]) {
            const activePlayer = getActivePlayer(team, 1);
            if (activePlayer) {
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                    questionId: Date.now().toString(),
                    questionText: activePlayer.currentQuestion.question,
                    operation: slot1Op,
                    activePlayerId: activePlayer.odUserId,
                    slotNumber: team.currentSlot, // Use team's slot
                    questionInSlot: 1,
                });
            }
        }
        
        // Start the game clock
        match.timer = setInterval(() => tickTeamMatch(match, ns), 1000);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:startTeamMatch:clockStart',message:'H1/H4: initial game clock value when match starts',data:{matchId:match.matchId,gameClockMs:match.gameClockMs,expectedMs:TEAM_MATCH_CONFIG.HALF_DURATION_MS,isAIMatch:match.isAIMatch},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H4'})}).catch(()=>{});
        // #endregion
        
        // Start AI bot behavior if this is an AI match
        if (match.isAIMatch) {
            startBotBehavior(match, ns);
        }
        
        console.log(`[TeamMatch] Match ${match.matchId} started${match.isAIMatch ? ' (AI Match)' : ''}`);
    }
    
    /**
     * Start AI bot behavior loops for the match
     */
    function startBotBehavior(match, ns) {
        const matchId = match.matchId;
        const intervals = [];
        
        // Find which team has bots (usually team2 for AI matches)
        const botTeam = isAITeam(match.team2.teamId) ? match.team2 : 
                        isAITeam(match.team1.teamId) ? match.team1 : null;
        
        if (!botTeam) {
            console.log(`[TeamMatch] No bot team found for AI match ${matchId}`);
            return;
        }
        
        console.log(`[TeamMatch] Starting bot behavior for team ${botTeam.teamName}`);
        
        // Create a single interval that handles the active bot's answers
        const botLoop = setInterval(() => {
            if (match.phase !== TEAM_MATCH_PHASES.ACTIVE) {
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:botLoop:phaseCheck',message:'H6: bot loop phase check (not active)',data:{matchId:match.matchId,phase:match.phase,half:match.half},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
                // #endregion
                return; // Only answer during active phase
            }
            
            // Find the active bot player for THIS TEAM's current slot
            const activePlayer = getActivePlayer(botTeam, botTeam.currentSlot);
            if (!activePlayer || !isAIBot(activePlayer.odUserId)) {
                return; // Current slot player is not a bot
            }
            
            if (!activePlayer.isActive || !activePlayer.currentQuestion) {
                return; // Bot not active or no question
            }
            
            // Check if enough time has passed since question was shown
            const config = activePlayer.botConfig || BOT_DIFFICULTY_CONFIGS.medium;
            const [minTime, maxTime] = config.answerTimeRange;
            const targetAnswerTime = minTime + Math.random() * (maxTime - minTime);
            const elapsed = Date.now() - activePlayer.questionStartTime;
            
            if (elapsed < targetAnswerTime) {
                return; // Not time to answer yet
            }
            
            // Bot answers the question
            const isCorrect = Math.random() < config.accuracy;
            const answer = isCorrect ? 
                activePlayer.currentQuestion.answer : 
                activePlayer.currentQuestion.answer + (Math.random() > 0.5 ? 1 : -1);
            
            // Process bot answer (similar to human answer handling)
            processBotAnswer(match, botTeam, activePlayer, answer, isCorrect, ns);
            
        }, 500); // Check every 500ms
        
        intervals.push(botLoop);
        botIntervals.set(matchId, intervals);
    }
    
    /**
     * Process a bot's answer
     */
    function processBotAnswer(match, team, player, answer, isCorrect, ns) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:processBotAnswer',message:'H6: bot answered question',data:{matchId:match.matchId,half:match.half,playerId:player.odUserId,teamSlot:team.currentSlot,questionsInSlot:team.questionsInSlot,isCorrect,phase:match.phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion
        
        const answerTimeMs = Date.now() - player.questionStartTime;
        
        player.total++;
        player.totalAnswerTimeMs += answerTimeMs;
        
        let pointsEarned = 0;
        
        if (isCorrect) {
            player.correct++;
            player.streak++;
            player.maxStreak = Math.max(player.maxStreak, player.streak);
            team.currentStreak++;
            
            pointsEarned = TEAM_MATCH_CONFIG.POINTS_PER_CORRECT + 
                (player.streak - 1) * TEAM_MATCH_CONFIG.STREAK_BONUS;
            
            player.score += pointsEarned;
            team.score += pointsEarned;
        } else {
            player.streak = 0;
            team.currentStreak = 0;
        }
        
        // Emit result to all (humans see bot team progress)
        ns.to(match.matchId).emit('answer_result', {
            teamId: team.teamId,
            userId: player.odUserId,
            isCorrect,
            pointsEarned,
            newStreak: player.streak,
            newTeamScore: team.score,
            newPlayerScore: player.score,
            questionsInSlot: team.questionsInSlot + 1, // Use team-specific counter
            isBot: true,
        });
        
        // Advance questions (per-team)
        team.questionsInSlot++;
        
        if (team.questionsInSlot >= TEAM_MATCH_CONFIG.QUESTIONS_PER_SLOT) {
            advanceTeamToNextSlot(match, team, ns);
        } else {
            // Generate next question for bot
            const slotOp = getSlotOperation(team.currentSlot, match.operation);
            player.currentQuestion = generateTeamQuestion(slotOp);
            player.questionStartTime = Date.now();
            player.currentInput = '';
        }
    }
    
    /**
     * Stop bot behavior for a match
     */
    function stopBotBehavior(matchId) {
        const intervals = botIntervals.get(matchId);
        if (intervals) {
            intervals.forEach(id => clearInterval(id));
            botIntervals.delete(matchId);
            console.log(`[TeamMatch] Stopped bot behavior for match ${matchId}`);
        }
    }
    
    /**
     * Game tick - update clocks and check for round/half/match end
     */
    function tickTeamMatch(match, ns) {
        const now = Date.now();
        const elapsed = now - match.lastTickTime;
        match.lastTickTime = now;
        
        if (match.phase === TEAM_MATCH_PHASES.ACTIVE) {
            match.relayClockMs += elapsed;      // Relay clock counts UP (time spent in relay)
            match.gameClockMs -= elapsed;       // Game clock counts DOWN (remaining time in half)
            
            // Check if HALF time is up (clock reached 0)
            if (match.gameClockMs <= 0) {
                match.gameClockMs = 0; // Clamp to 0
                // Half time expired - force end the current round and proceed to halftime/match end
                endHalf(match, ns);
            } else {
                // Send clock update every second
                ns.to(match.matchId).emit('clock_update', {
                    gameClockMs: match.gameClockMs,        // Remaining time in half
                    relayClockMs: match.relayClockMs,      // Elapsed relay time
                    round: match.round,
                    half: match.half,
                });
            }
        }
    }
    
    /**
     * End the current half (called when half timer expires)
     */
    function endHalf(match, ns) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:endHalf:entry',message:'H5: endHalf called',data:{matchId:match.matchId,currentHalf:match.half,currentRound:match.round,isAIMatch:match.isAIMatch,botIntervalsCount:match.botIntervals?.length||0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        
        // Store current round scores if in progress
        match.roundScores.push({
            round: match.round,
            team1: match.team1.score,
            team2: match.team2.score,
        });
        
        // Deactivate all players
        for (const team of [match.team1, match.team2]) {
            for (const player of Object.values(team.players)) {
                player.isActive = false;
            }
        }
        
        if (match.half === 1) {
            // End of first half - go to halftime
            match.phase = TEAM_MATCH_PHASES.HALFTIME;
            match.half = 2;
            
            ns.to(match.matchId).emit('halftime', {
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                roundScores: match.roundScores,
                halftimeDurationMs: TEAM_MATCH_CONFIG.HALFTIME_DURATION_MS,
            });
            
            // Resume after halftime with fresh clock for second half
            setTimeout(() => {
                if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    match.round = 0; // Set to 0 so startNextRound's round++ makes it 1
                    match.gameClockMs = TEAM_MATCH_CONFIG.HALF_DURATION_MS; // Reset clock for second half
                    // #region agent log
                    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:endHalf:halftimeTimeout',message:'H6/H7: halftime timeout fired, resuming 2nd half',data:{matchId:match.matchId,roundBeforeStartNextRound:match.round,gameClockMsReset:match.gameClockMs,isAIMatch:match.isAIMatch,botIntervalsActive:match.botIntervals?.length||0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6,H7'})}).catch(()=>{});
                    // #endregion
                    startNextRound(match, ns);
                }
            }, TEAM_MATCH_CONFIG.HALFTIME_DURATION_MS);
            
            console.log(`[TeamMatch] Half 1 ended - halftime for match ${match.matchId}`);
        } else {
            // End of second half - match complete
            console.log(`[TeamMatch] Half 2 ended - match complete ${match.matchId}`);
            endTeamMatch(match, ns);
        }
    }
    
    /**
     * Generate next question for player
     */
    function generateNextQuestion(match, player, team, ns) {
        // #region agent log
        const qNum = team.questionsInSlot + 1;
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:generateNextQuestion:entry',message:'Q6-H1: generateNextQuestion called',data:{playerId:player.odUserId,teamId:team.teamId,questionsInSlotBefore:team.questionsInSlot,questionNumber:qNum,currentSlot:team.currentSlot,willBeQ6:qNum>5},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'Q6-H1'})}).catch(()=>{});
        // #endregion
        
        const slotOp = getSlotOperation(team.currentSlot, match.operation); // Use team's slot
        player.currentQuestion = generateTeamQuestion(slotOp);
        player.questionStartTime = Date.now();
        player.currentInput = '';
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:generateNextQuestion',message:'H3C: generating next question (per-team)',data:{playerId:player.odUserId,teamId:team.teamId,slotOp,teamCurrentSlot:team.currentSlot,teamQuestionsInSlot:team.questionsInSlot,questionText:player.currentQuestion.question},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3C'})}).catch(()=>{});
        // #endregion
        
        // Send to team only - use TEAM's slot and questions counters
        ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
            questionId: Date.now().toString(),
            questionText: player.currentQuestion.question,
            operation: slotOp,
            activePlayerId: player.odUserId,
            slotNumber: team.currentSlot,              // Use team's slot
            questionInSlot: team.questionsInSlot + 1,  // Use team's questions counter
        });
    }
    
    /**
     * Advance a single team to their next slot (independent of other team)
     */
    function advanceTeamToNextSlot(match, team, ns) {
        team.questionsInSlot = 0;
        team.currentSlot++;
        
        // Mark previous player as complete and inactive
        const prevPlayer = getActivePlayer(team, team.currentSlot - 1);
        if (prevPlayer) {
            prevPlayer.isActive = false;
            prevPlayer.isComplete = true;
        }
        
        // Check if this team completed all slots for the round
        if (team.currentSlot > TEAM_MATCH_CONFIG.SLOTS_PER_ROUND) {
            // This team finished the round - check if both teams are done
            const otherTeam = team.teamId === match.team1.teamId ? match.team2 : match.team1;
            if (otherTeam.currentSlot > TEAM_MATCH_CONFIG.SLOTS_PER_ROUND) {
                // Both teams finished - end the round
                endRound(match, ns);
            } else {
                // Waiting for other team to finish their slots
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('waiting_for_opponents', {
                    message: 'Waiting for opponents to complete their relay...',
                });
            }
        } else {
            // Activate next slot player for this team
            const slotOp = getSlotOperation(team.currentSlot, match.operation);
            const activePlayer = getActivePlayer(team, team.currentSlot);
            
            if (activePlayer) {
                activePlayer.isActive = true;
                activePlayer.currentQuestion = generateTeamQuestion(slotOp);
                activePlayer.questionStartTime = Date.now();
                
                // Countdown notification for this team
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('handoff_countdown', {
                    nextPlayerId: activePlayer.odUserId,
                    nextPlayerName: activePlayer.odName,
                    slotNumber: team.currentSlot,
                    operation: slotOp,
                    countdownMs: TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS,
                });
                
                // After countdown, send question
                setTimeout(() => {
                    if (activePlayer.currentQuestion) {
                        ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                            questionId: Date.now().toString(),
                            questionText: activePlayer.currentQuestion.question,
                            operation: slotOp,
                            activePlayerId: activePlayer.odUserId,
                            slotNumber: team.currentSlot,
                            questionInSlot: 1,
                        });
                    }
                }, TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS);
            }
            
            // Notify about this team's slot change
            ns.to(`team:${match.matchId}:${team.teamId}`).emit('slot_change', {
                teamId: team.teamId,
                currentSlot: team.currentSlot,
                slotOperation: slotOp,
            });
        }
    }
    
    /**
     * Advance to next slot in the round (DEPRECATED - use advanceTeamToNextSlot)
     */
    function advanceToNextSlot(match, ns) {
        match.questionsInSlot = 0;
        match.currentSlot++;
        
        // Mark previous players as complete and inactive
        for (const team of [match.team1, match.team2]) {
            const prevPlayer = getActivePlayer(team, match.currentSlot - 1);
            if (prevPlayer) {
                prevPlayer.isActive = false;
                prevPlayer.isComplete = true;
            }
        }
        
        if (match.currentSlot > TEAM_MATCH_CONFIG.SLOTS_PER_ROUND) {
            // Round complete
            endRound(match, ns);
        } else {
            // Activate next slot players
            const slotOp = getSlotOperation(match.currentSlot, match.operation);
            
            for (const team of [match.team1, match.team2]) {
                const activePlayer = getActivePlayer(team, match.currentSlot);
                if (activePlayer) {
                    activePlayer.isActive = true;
                    activePlayer.currentQuestion = generateTeamQuestion(slotOp);
                    activePlayer.questionStartTime = Date.now();
                    
                    // Countdown notification
                    ns.to(`team:${match.matchId}:${team.teamId}`).emit('handoff_countdown', {
                        nextPlayerId: activePlayer.odUserId,
                        nextPlayerName: activePlayer.odName,
                        slotNumber: match.currentSlot,
                        operation: slotOp,
                        countdownMs: TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS,
                    });
                }
            }
            
            // After countdown, send questions
            setTimeout(() => {
                for (const team of [match.team1, match.team2]) {
                    const activePlayer = getActivePlayer(team, match.currentSlot);
                    if (activePlayer && activePlayer.currentQuestion) {
                        ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                            questionId: Date.now().toString(),
                            questionText: activePlayer.currentQuestion.question,
                            operation: slotOp,
                            activePlayerId: activePlayer.odUserId,
                            slotNumber: match.currentSlot,
                            questionInSlot: 1,
                        });
                    }
                }
            }, TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS);
            
            ns.to(match.matchId).emit('slot_change', {
                currentSlot: match.currentSlot,
                slotOperation: slotOp,
            });
        }
    }
    
    /**
     * End current round
     */
    function endRound(match, ns) {
        // Store round scores
        match.roundScores.push({
            round: match.round,
            team1: match.team1.score,
            team2: match.team2.score,
        });
        
        // Deactivate all players and reset Double Call-In for this round
        for (const team of [match.team1, match.team2]) {
            for (const player of Object.values(team.players)) {
                player.isActive = false;
            }
            // Reset Double Call-In active state for this round (it only lasts one round)
            if (team.doubleCallinActive) {
                console.log(`[TeamMatch] Resetting Double Call-In for team ${team.teamId} after round ${match.round}`);
            }
            team.doubleCallinActive = false;
            team.doubleCallinSlot = null;
            team.doubleCallinBenchedId = null;
        }
        
        if (match.round === TEAM_MATCH_CONFIG.ROUNDS_PER_HALF) {
            // Halftime
            match.phase = TEAM_MATCH_PHASES.HALFTIME;
            match.half = 2;
            
            ns.to(match.matchId).emit('halftime', {
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                roundScores: match.roundScores,
                halftimeDurationMs: TEAM_MATCH_CONFIG.HALFTIME_DURATION_MS,
            });
            
            // Resume after halftime
            setTimeout(() => {
                if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    startNextRound(match, ns);
                }
            }, TEAM_MATCH_CONFIG.HALFTIME_DURATION_MS);
            
        } else if (match.round >= TEAM_MATCH_CONFIG.TOTAL_ROUNDS) {
            // Match complete
            endTeamMatch(match, ns);
            
        } else {
            // Tactical break between rounds
            match.phase = TEAM_MATCH_PHASES.BREAK;
            
            ns.to(match.matchId).emit('round_break', {
                completedRound: match.round,
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                breakDurationMs: TEAM_MATCH_CONFIG.BREAK_DURATION_MS,
            });
            
            // Store break end time and timeout reference (for timeout extension)
            match.breakEndTime = Date.now() + TEAM_MATCH_CONFIG.BREAK_DURATION_MS;
            match.breakRemainingMs = TEAM_MATCH_CONFIG.BREAK_DURATION_MS;
            
            // Resume after break - use stored reference so it can be cancelled
            if (match.breakTimeout) clearTimeout(match.breakTimeout);
            match.breakTimeout = setTimeout(() => {
                if (match.phase === TEAM_MATCH_PHASES.BREAK) {
                    startNextRound(match, ns);
                }
            }, TEAM_MATCH_CONFIG.BREAK_DURATION_MS);
        }
    }
    
    /**
     * Start next round
     */
    function startNextRound(match, ns) {
        const roundBeforeIncrement = match.round;
        match.round++;
        match.currentSlot = 1;              // Keep for backwards compatibility
        match.questionsInSlot = 0;          // Keep for backwards compatibility
        // NOTE: Don't reset gameClockMs between rounds - it tracks the entire half
        // match.gameClockMs stays as-is (continuous countdown for the half)
        match.phase = TEAM_MATCH_PHASES.ACTIVE;
        match.roundStartTime = Date.now();
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:startNextRound',message:'H7/H8: startNextRound called',data:{matchId:match.matchId,roundBefore:roundBeforeIncrement,roundAfter:match.round,half:match.half,gameClockMs:match.gameClockMs,isAIMatch:match.isAIMatch,botIntervalsCount:match.botIntervals?.length||0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7,H8'})}).catch(()=>{});
        // #endregion
        
        // Reset per-team slot state for new round
        for (const team of [match.team1, match.team2]) {
            team.currentSlot = 1;
            team.questionsInSlot = 0;
            for (const player of Object.values(team.players)) {
                player.isComplete = false;
            }
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:startNextRound:teamState',message:'DC-H6: Team state at round start',data:{teamId:team.teamId,round:match.round,doubleCallinActive:team.doubleCallinActive,doubleCallinSlot:team.doubleCallinSlot,anchorId:team.anchorId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H6'})}).catch(()=>{});
            // #endregion
        }
        
        // Activate first slot players
        const slot1Op = getSlotOperation(1, match.operation);
        
        for (const team of [match.team1, match.team2]) {
            const activePlayer = getActivePlayer(team, 1);
            if (activePlayer) {
                activePlayer.isActive = true;
                activePlayer.currentQuestion = generateTeamQuestion(slot1Op);
                activePlayer.questionStartTime = Date.now();
            }
        }
        
        ns.to(match.matchId).emit('round_start', {
            round: match.round,
            half: match.half,
            currentSlot: 1,
            slotOperation: slot1Op,
        });
        
        // Send questions to teams
        for (const team of [match.team1, match.team2]) {
            const activePlayer = getActivePlayer(team, 1);
            if (activePlayer && activePlayer.currentQuestion) {
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                    questionId: Date.now().toString(),
                    questionText: activePlayer.currentQuestion.question,
                    operation: slot1Op,
                    activePlayerId: activePlayer.odUserId,
                    slotNumber: 1,
                    questionInSlot: 1,
                });
            }
        }
    }
    
    /**
     * End team match
     */
    function endTeamMatch(match, ns) {
        match.phase = TEAM_MATCH_PHASES.POST_MATCH;
        
        if (match.timer) {
            clearInterval(match.timer);
            match.timer = null;
        }
        
        // Stop bot behavior if this was an AI match
        stopBotBehavior(match.matchId);
        
        const team1Won = match.team1.score > match.team2.score;
        const team2Won = match.team2.score > match.team1.score;
        const isDraw = match.team1.score === match.team2.score;
        
        const winnerId = isDraw ? null : (team1Won ? match.team1.teamId : match.team2.teamId);
        
        // Calculate player stats
        const getPlayerStats = (team) => {
            return Object.values(team.players).map(p => ({
                odUserId: p.odUserId,
                odName: p.odName,
                operationSlot: p.slot,
                score: p.score,
                correct: p.correct,
                total: p.total,
                accuracy: p.total > 0 ? (p.correct / p.total * 100).toFixed(1) : 0,
                avgSpeedMs: p.total > 0 ? Math.round(p.totalAnswerTimeMs / p.total) : 0,
                maxStreak: p.maxStreak,
                wasIgl: p.isIgl,
                wasAnchor: p.isAnchor,
            }));
        };
        
        ns.to(match.matchId).emit('match_end', {
            winnerId,
            isDraw,
            team1Score: match.team1.score,
            team2Score: match.team2.score,
            roundScores: match.roundScores,
            team1Players: getPlayerStats(match.team1),
            team2Players: getPlayerStats(match.team2),
            matchDurationMs: Date.now() - match.startTime,
        });
        
        console.log(`[TeamMatch] Match ${match.matchId} ended. Winner: ${winnerId || 'DRAW'}`);
        
        // Clean up after a delay (let clients receive the end event)
        setTimeout(() => {
            activeTeamMatches.delete(match.matchId);
        }, 30000);
    }
    
    /**
     * Create a team match from matchmaking result
     * Called by the matchmaking system when a match is found
     */
    global.createTeamMatch = function(matchId, team1, team2, operation, matchType) {
        const match = initTeamMatchState(matchId, team1, team2, operation, matchType);
        activeTeamMatches.set(matchId, match);
        console.log(`[TeamMatch] Match ${matchId} created: ${team1.odTeamName || 'Team 1'} vs ${team2.odTeamName || 'Team 2'}`);
        return match;
    };
    
    console.log('[TeamMatch] Team match namespace initialized at /arena/teams');

    httpServer.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> WebSocket server running on /api/socket/arena`);
        console.log(`> Presence server running on /presence`);
        console.log(`> Team match server running on /arena/teams`);
    });
});
