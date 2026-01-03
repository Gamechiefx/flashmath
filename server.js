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
            const { matchId, userId, userName, operation, isAiMatch } = data;

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
                };
                activeMatches.set(matchId, match);
            } else {
                // Update isAiMatch if provided (in case match was created before socket joined)
                if (isAiMatch) {
                    match.isAiMatch = true;
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
                    match.players[botId] = {
                        odName: 'FlashBot 3000',
                        odScore: 0,
                        odStreak: 0,
                        odQuestionsAnswered: 0,
                        odLastAnswerCorrect: null,
                        odSocketId: 'bot',
                        odCurrentQuestion: botQuestion,
                        isBot: true,
                        // Visuals
                        odEquippedBanner: 'matrix',
                        odEquippedTitle: 'AI Overlord',
                        odLevel: 99,
                        odTier: 'Diamond'
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

    httpServer.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> WebSocket server running on /api/socket/arena`);
        console.log(`> Presence server running on /presence`);
    });
});
