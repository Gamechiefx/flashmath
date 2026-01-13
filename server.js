/**
 * Custom Next.js Server with Socket.io
 * Enables WebSocket support for arena matches and real-time presence
 * 
 * Redis-First Architecture:
 * - Redis is the primary state store for match data
 * - In-memory Maps are kept for timer/interval references only
 * - Socket.IO Redis adapter enables horizontal scaling
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// Import Redis arena state management
const arenaRedis = require('./server-redis');

// Import PostgreSQL arena database (for permanent match history and ELO)
const arenaPostgres = require('./src/lib/arena/postgres.js');

// Server identification for multi-server deployments
const SERVER_ID = process.env.SERVER_ID || `server-${process.pid}`;

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// =============================================================================
// IN-MEMORY STATE (for timer/interval references only)
// Redis is the primary source of truth for match state
// =============================================================================

// In-memory Maps hold timer/interval references that can't be serialized to Redis
const activeMatches = new Map();      // matchId -> { timer, botInterval, ...matchState }
const socketToMatch = new Map();      // socketId -> matchId (fast lookup cache)

// =============================================================================
// 1v1 MATCH STATE HELPERS (Redis-First Architecture)
// =============================================================================

/**
 * Save a 1v1 match to Redis (primary) and in-memory (for timers)
 * @param {string} matchId - Match ID
 * @param {Object} match - Match state object
 */
async function saveMatchState(matchId, match) {
    // Keep in memory for timer access
    activeMatches.set(matchId, match);
    
    // Save to Redis (primary storage)
    try {
        await arenaRedis.saveMatch({
            matchId: match.matchId,
            players: match.players,
            odOperation: match.odOperation,
            odTimeLeft: match.odTimeLeft,
            odStarted: match.odStarted,
            odEnded: match.odEnded,
            isAiMatch: match.isAiMatch,
            hostRank: match.hostRank,
            hostDivision: match.hostDivision,
            currentQuestion: match.currentQuestion,
            status: match.odEnded ? 'finished' : (match.odStarted ? 'active' : 'pending'),
        });
    } catch (err) {
        console.error(`[Match] Redis save error for ${matchId}:`, err.message);
    }
}

/**
 * Get a 1v1 match - checks in-memory first (for timers), then Redis
 * @param {string} matchId - Match ID
 * @returns {Object|null} Match state or null
 */
async function getMatchState(matchId) {
    // In-memory first (has timer references)
    let match = activeMatches.get(matchId);
    if (match) return match;
    
    // Try Redis as fallback (for recovery or cross-server access)
    try {
        const redisMatch = await arenaRedis.getMatch(matchId);
        if (redisMatch) {
            console.log(`[Match] Recovered match ${matchId} from Redis`);
            // Note: timer/botInterval won't be restored - may need to reinitialize
            activeMatches.set(matchId, redisMatch);
            return redisMatch;
        }
    } catch (err) {
        console.error(`[Match] Redis get error for ${matchId}:`, err.message);
    }
    
    return null;
}

/**
 * Delete a 1v1 match from both in-memory and Redis
 * Also decrements active match counter
 * @param {string} matchId - Match ID
 */
async function removeMatchState(matchId) {
    const match = activeMatches.get(matchId);
    if (match) {
        // Clean up timers
        if (match.timer) clearInterval(match.timer);
        if (match.botInterval) clearInterval(match.botInterval);
    }
    
    // Remove from in-memory
    activeMatches.delete(matchId);
    
    // Remove from Redis
    try {
        await arenaRedis.deleteMatch(matchId);
        await arenaRedis.decrementActiveMatches();
    } catch (err) {
        console.error(`[Match] Redis delete error for ${matchId}:`, err.message);
    }
}

/**
 * Set socket-to-match mapping in both in-memory and Redis
 * @param {string} socketId - Socket ID
 * @param {string} matchId - Match ID
 */
async function setSocketMatch(socketId, matchId) {
    socketToMatch.set(socketId, matchId);
    try {
        await arenaRedis.setSocketToMatch(socketId, matchId);
    } catch (err) {
        console.error(`[Match] Redis socket map error:`, err.message);
    }
}

/**
 * Get match ID for a socket (in-memory cache first, then Redis)
 * @param {string} socketId - Socket ID
 * @returns {string|null} Match ID or null
 */
async function getSocketMatch(socketId) {
    // Check in-memory cache first
    const matchId = socketToMatch.get(socketId);
    if (matchId) return matchId;
    
    // Try Redis as fallback
    try {
        const redisMatchId = await arenaRedis.getMatchFromSocket(socketId);
        if (redisMatchId) {
            // Update local cache
            socketToMatch.set(socketId, redisMatchId);
            return redisMatchId;
        }
    } catch (err) {
        console.error(`[Match] Redis socket lookup error:`, err.message);
    }
    
    return null;
}

/**
 * Remove socket-to-match mapping from both in-memory and Redis
 * @param {string} socketId - Socket ID
 */
async function removeSocketMatch(socketId) {
    socketToMatch.delete(socketId);
    try {
        await arenaRedis.clearSocketMappings(socketId);
    } catch (err) {
        console.error(`[Match] Redis socket cleanup error:`, err.message);
    }
}

/**
 * Track a new active match in Redis statistics
 */
async function trackNewMatch() {
    try {
        await arenaRedis.incrementActiveMatches();
    } catch (err) {
        console.error(`[Match] Redis stats error:`, err.message);
    }
}

// =============================================================================
// PUB/SUB FOR CROSS-SERVER EVENTS
// =============================================================================

/**
 * Publish a match event for cross-server synchronization
 * Other servers subscribed to this match will receive the event
 * @param {string} matchId - Match ID
 * @param {string} eventType - Type of event (e.g., 'answer_submitted', 'player_joined')
 * @param {Object} data - Event data
 */
async function publishMatchEvent(matchId, eventType, data) {
    try {
        await arenaRedis.publishMatchEvent(matchId, {
            type: eventType,
            serverId: SERVER_ID,
            ...data,
        });
    } catch (err) {
        console.error(`[Pub/Sub] Failed to publish event:`, err.message);
    }
}

/**
 * Publish a global arena event (e.g., match completed, leaderboard update)
 * @param {string} eventType - Type of event
 * @param {Object} data - Event data
 */
async function publishGlobalEvent(eventType, data) {
    try {
        await arenaRedis.publishGlobalEvent({
            type: eventType,
            serverId: SERVER_ID,
            ...data,
        });
    } catch (err) {
        console.error(`[Pub/Sub] Failed to publish global event:`, err.message);
    }
}

/**
 * Cache a match result for quick access
 * @param {string} odUserId - User ID
 * @param {Object} matchSummary - Summary of the match
 */
async function cacheMatchResult(odUserId, matchSummary) {
    try {
        await arenaRedis.addRecentMatch(odUserId, matchSummary);
    } catch (err) {
        console.error(`[Cache] Failed to cache match result:`, err.message);
    }
}

/**
 * Update leaderboard in Redis
 * @param {string} odUserId - User ID
 * @param {number} elo - New ELO rating
 * @param {string} operation - Operation (e.g., 'global', 'multiplication')
 */
async function updateRedisLeaderboard(odUserId, elo, operation = 'global') {
    try {
        await arenaRedis.updateLeaderboard(odUserId, elo, operation);
    } catch (err) {
        console.error(`[Leaderboard] Failed to update:`, err.message);
    }
}

/**
 * Get arena statistics from Redis
 * @returns {Object} Arena stats
 */
async function getArenaStatistics() {
    try {
        return await arenaRedis.getArenaStats();
    } catch (err) {
        console.error(`[Stats] Failed to get arena stats:`, err.message);
        return { activeMatches: 0, activeTeamMatches: 0, queueSize: 0 };
    }
}

// =============================================================================
// POSTGRESQL MATCH RECORDING
// =============================================================================

/**
 * Record a completed 1v1 duel match to PostgreSQL
 * @param {Object} match - Match state object
 * @param {string} winnerId - Winner's user ID
 * @param {number} durationMs - Match duration in milliseconds
 */
async function recordDuelMatchToPostgres(match, winnerId, durationMs) {
    try {
        const playerEntries = Object.entries(match.players);
        if (playerEntries.length < 2) return;

        const [player1Id, player1] = playerEntries[0];
        const [player2Id, player2] = playerEntries[1];

        // Skip if both are AI
        if (player1Id.startsWith('ai_') && player2Id.startsWith('ai_')) return;

        // Calculate ELO changes (simple algorithm)
        const p1Elo = player1.odElo || 1000;
        const p2Elo = player2.odElo || 1000;
        const p1Won = player1Id === winnerId;
        const p2Won = player2Id === winnerId;
        
        // K-factor based on ELO (lower K for higher rated players)
        const k1 = p1Elo < 1200 ? 32 : (p1Elo < 1600 ? 24 : 16);
        const k2 = p2Elo < 1200 ? 32 : (p2Elo < 1600 ? 24 : 16);
        
        // Expected scores
        const exp1 = 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
        const exp2 = 1 / (1 + Math.pow(10, (p1Elo - p2Elo) / 400));
        
        // Actual scores
        const actual1 = p1Won ? 1 : (winnerId ? 0 : 0.5);
        const actual2 = p2Won ? 1 : (winnerId ? 0 : 0.5);
        
        // ELO changes
        const p1EloChange = Math.round(k1 * (actual1 - exp1));
        const p2EloChange = Math.round(k2 * (actual2 - exp2));

        const matchData = {
            id: match.matchId,
            player1: {
                id: player1Id,
                score: player1.odScore || 0,
                eloBefore: p1Elo,
                eloChange: player1Id.startsWith('ai_') ? 0 : p1EloChange,
            },
            player2: {
                id: player2Id,
                score: player2.odScore || 0,
                eloBefore: p2Elo,
                eloChange: player2Id.startsWith('ai_') ? 0 : p2EloChange,
            },
            winner: winnerId ? { id: winnerId } : null,
            questionsCount: Object.values(match.players).reduce((sum, p) => sum + (p.odQuestionsAnswered || 0), 0),
            durationMs: durationMs,
            isDraw: !winnerId,
            isForfeit: false,
        };

        await arenaPostgres.recordMatch(matchData);
        console.log(`[PostgreSQL] Recorded 1v1 match ${match.matchId}`);

        // Update leaderboards
        if (!player1Id.startsWith('ai_')) {
            await updateRedisLeaderboard(player1Id, p1Elo + p1EloChange, match.odOperation || 'global');
        }
        if (!player2Id.startsWith('ai_')) {
            await updateRedisLeaderboard(player2Id, p2Elo + p2EloChange, match.odOperation || 'global');
        }

    } catch (err) {
        console.error(`[PostgreSQL] Failed to record duel match:`, err.message);
    }
}

/**
 * Record a completed 5v5 team match to PostgreSQL
 * @param {Object} match - Team match state object
 * @param {number} winnerTeam - 1 or 2 (or null for draw)
 * @param {number} durationMs - Match duration in milliseconds
 */
async function recordTeamMatchToPostgres(match, winnerTeam, durationMs) {
    try {
        // Debug: Log what we have to work with
        console.log(`[PostgreSQL] Recording match ${match.matchId}`);
        console.log(`[PostgreSQL] Team1 players object:`, match.team1?.players ? Object.keys(match.team1.players) : 'undefined');
        console.log(`[PostgreSQL] Team2 players object:`, match.team2?.players ? Object.keys(match.team2.players) : 'undefined');
        
        // Extract player data from match.team1.players (object) and match.team2.players (object)
        const getPlayersArray = (team, teamNum) => {
            if (!team || !team.players) {
                console.log(`[PostgreSQL] Team ${teamNum} has no players object`);
                return [];
            }
            const playerValues = Object.values(team.players);
            console.log(`[PostgreSQL] Team ${teamNum} has ${playerValues.length} players:`, playerValues.map(p => p.odUserId || p.odName || 'unknown'));
            
            return playerValues.map(p => ({
                userId: p.odUserId,
                isIgl: p.isIgl || false,
                isAnchor: p.isAnchor || false,
                score: p.score || 0,
                questionsAnswered: p.total || 0,
                correctAnswers: p.correct || 0,
                eloBefore: 300, // Default, will be updated by postgres module
                eloChange: winnerTeam === teamNum ? 25 : (winnerTeam && winnerTeam !== teamNum ? -20 : 0),
            }));
        };

        const matchData = {
            id: match.matchId,
            team1: {
                id: match.team1?.teamId || null,
                name: match.team1?.teamName || 'Team 1',
                players: getPlayersArray(match.team1, 1),
                score: match.team1?.score || 0,
                eloBefore: 1200, // Default
                eloChange: winnerTeam === 1 ? 30 : (winnerTeam === 2 ? -25 : 0),
            },
            team2: {
                id: match.team2?.teamId || null,
                name: match.team2?.teamName || 'Team 2',
                players: getPlayersArray(match.team2, 2),
                score: match.team2?.score || 0,
                eloBefore: 1200, // Default
                eloChange: winnerTeam === 2 ? 30 : (winnerTeam === 1 ? -25 : 0),
            },
            winnerTeam: winnerTeam,
            matchType: match.matchType || 'casual',
            questionsCount: match.totalQuestionsAsked || 0,
            durationMs: durationMs,
            isForfeit: !!match.forfeitedBy, // Set true if match was forfeited
            forfeitedByTeam: match.forfeitedBy || null,
            isAIMatch: match.isAIMatch || false,
        };

        console.log(`[PostgreSQL] Recording match ${match.matchId} with ${matchData.team1.players.length} + ${matchData.team2.players.length} players`);
        await arenaPostgres.recordTeamMatch(matchData);
        console.log(`[PostgreSQL] Successfully recorded 5v5 match ${match.matchId}`);

    } catch (err) {
        console.error(`[PostgreSQL] Failed to record team match:`, err.message);
    }
}

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

app.prepare().then(async () => {
    // =========================================================================
    // REDIS INITIALIZATION
    // =========================================================================
    
    // Initialize Redis for arena state management
    const redisInitialized = await arenaRedis.initRedis();
    if (redisInitialized) {
        console.log(`[Server ${SERVER_ID}] Arena Redis state management initialized`);
    } else {
        console.warn(`[Server ${SERVER_ID}] Arena Redis not available, using in-memory fallback`);
    }
    
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // =========================================================================
    // SOCKET.IO WITH REDIS ADAPTER
    // =========================================================================
    
    // Initialize Socket.io with performance optimizations
    const io = new SocketIOServer(httpServer, {
        path: '/api/socket/arena',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        // Connection settings for better reliability
        pingTimeout: 30000,
        pingInterval: 10000,
        
        // === PERFORMANCE OPTIMIZATIONS ===
        
        // Enable per-message compression (50-70% bandwidth reduction)
        perMessageDeflate: {
            threshold: 1024, // Only compress messages > 1KB
            zlibDeflateOptions: {
                chunkSize: 16 * 1024,   // 16KB chunks
            },
            zlibInflateOptions: {
                chunkSize: 16 * 1024,
            },
            clientNoContextTakeover: true, // Don't maintain compression context between messages
            serverNoContextTakeover: true, // Reduces memory usage
        },
        
        // Limit maximum HTTP buffer size (security + memory)
        maxHttpBufferSize: 1e6, // 1MB max payload
        
        // Allow binary parser for efficiency
        allowEIO3: true,
        
        // Transports: prefer websocket, fallback to polling
        transports: ['websocket', 'polling'],
        
        // Upgrade settings
        allowUpgrades: true,
        upgradeTimeout: 10000,
    });
    
    // Setup Socket.IO Redis Adapter for horizontal scaling
    if (redisInitialized) {
        try {
            const redisHost = process.env.REDIS_HOST || 'localhost';
            const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
            const redisPassword = process.env.REDIS_PASSWORD;
            
            const pubClient = new Redis({
                host: redisHost,
                port: redisPort,
                password: redisPassword,
                lazyConnect: true,
            });
            const subClient = pubClient.duplicate();
            
            await Promise.all([pubClient.connect(), subClient.connect()]);
            
            io.adapter(createAdapter(pubClient, subClient));
            console.log(`[Server ${SERVER_ID}] Socket.IO Redis adapter enabled - horizontal scaling ready`);
        } catch (adapterError) {
            console.warn(`[Server ${SERVER_ID}] Socket.IO Redis adapter failed, using default adapter:`, adapterError.message);
        }
    }

    io.on('connection', (socket) => {
        console.log(`[Arena Socket] Client connected: ${socket.id}`);

        // Player joins a match
        socket.on('join_match', async (data) => {
            const { matchId, userId, userName, operation, isAiMatch, userRank, userDivision, userLevel, userBanner, userTitle } = data;

            socket.join(matchId);
            await setSocketMatch(socket.id, matchId);

            // Get or create match state (check Redis if not in memory)
            let match = await getMatchState(matchId);
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
                await saveMatchState(matchId, match);
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
            
            // Save updated match state to Redis
            await saveMatchState(matchId, match);

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
                
                // Track new active match in Redis
                await trackNewMatch();

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
                            
                            // Simulate bot answer time (1-4 seconds)
                            const botAnswerTimeMs = 1000 + Math.random() * 3000;

                            if (isCorrect) {
                                // Base points + speed bonus
                                const basePoints = SCORING_CONFIG.POINTS_PER_CORRECT;
                                const speedBonus = calculateSpeedBonus(botAnswerTimeMs);
                                botData.odScore += basePoints + speedBonus;
                                botData.odStreak++;
                            } else {
                                // Penalty for wrong answer
                                botData.odScore += SCORING_CONFIG.POINTS_PER_INCORRECT;
                                botData.odStreak = 0;
                            }
                            
                            // Apply score floor
                            botData.odScore = applyScoreFloor(botData.odScore);
                            
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
                
                // Save match state after all players added and match started
                await saveMatchState(matchId, match);

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
                        const affectedUserIds = Object.keys(m.players).filter(id => !id.startsWith('ai-') && !id.startsWith('ai_'));
                        
                        if (affectedUserIds.length > 0) {
                            // Use presenceNs (presence namespace) for leaderboard updates
                            broadcastLeaderboardUpdate(presenceNs, matchType, matchOperation, affectedUserIds);
                        }
                        
                        // Publish global event for cross-server coordination
                        publishGlobalEvent('match_completed', {
                            matchId,
                            operation: matchOperation,
                            affectedUserIds,
                            matchIntegrity,
                        });
                        
                        // Cache match results for each player
                        const playerScores = Object.entries(m.players)
                            .filter(([id]) => !id.startsWith('ai_'))
                            .sort(([, a], [, b]) => b.odScore - a.odScore);
                        
                        const winnerId = playerScores[0]?.[0];
                        
                        for (const [playerId, player] of Object.entries(m.players)) {
                            if (playerId.startsWith('ai_')) continue;
                            
                            const isWinner = playerId === winnerId;
                            cacheMatchResult(playerId, {
                                matchId,
                                opponent: Object.entries(m.players)
                                    .find(([id]) => id !== playerId)?.[1]?.odName || 'Unknown',
                                result: isWinner ? 'win' : 'loss',
                                score: player.odScore,
                                operation: matchOperation,
                                timestamp: Date.now(),
                            });
                        }

                        // Record match to PostgreSQL for permanent history
                        // Only record if match had valid integrity (not voided)
                        if (matchIntegrity === INTEGRITY_STATE.GREEN) {
                            const matchStartTime = m.odStartTime || (Date.now() - 120000); // Fallback 2 min
                            const durationMs = Date.now() - matchStartTime;
                            recordDuelMatchToPostgres(m, winnerId, durationMs);
                        }

                        // Clean up match after 30 seconds (from both memory and Redis)
                        setTimeout(async () => {
                            await removeMatchState(matchId);
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

            // Update player stats with new scoring system
            let pointsEarned = 0;
            let speedBonus = 0;
            
            if (isCorrect) {
                // Base points + speed bonus
                const basePoints = SCORING_CONFIG.POINTS_PER_CORRECT;
                speedBonus = calculateSpeedBonus(answerTime);
                pointsEarned = basePoints + speedBonus;
                
                player.odScore += pointsEarned;
                player.odStreak++;
                player.odCorrectAnswers = (player.odCorrectAnswers || 0) + 1;
                player.odTotalAnswerTime = (player.odTotalAnswerTime || 0) + answerTime;
                // Update max streak
                if (player.odStreak > (player.odMaxStreak || 0)) {
                    player.odMaxStreak = player.odStreak;
                }
            } else {
                // Penalty for wrong answer
                pointsEarned = SCORING_CONFIG.POINTS_PER_INCORRECT;
                player.odScore += pointsEarned;
                player.odStreak = 0;
            }
            
            // Apply score floor (no negative scores)
            player.odScore = applyScoreFloor(player.odScore);
            
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
            
            // Publish event for cross-server sync (non-blocking)
            publishMatchEvent(matchId, 'answer_submitted', {
                odUserId,
                isCorrect,
                newScore: player.odScore,
                streak: player.odStreak,
            });
            
            // Periodically save match state to Redis (every 5 answers)
            if ((player.odQuestionsAnswered % 5) === 0) {
                saveMatchState(matchId, match).catch(() => {});
            }
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
        socket.on('disconnect', async () => {
            const matchId = await getSocketMatch(socket.id);
            if (matchId) {
                const match = await getMatchState(matchId);
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
                        await removeMatchState(matchId);
                        console.log(`[Arena Socket] Match ${matchId} cleaned up (no players)`);
                    } else {
                        // Update match state in Redis
                        await saveMatchState(matchId, match);
                    }
                }
                await removeSocketMatch(socket.id);
            }
            console.log(`[Arena Socket] Client disconnected: ${socket.id}`);
        });

        // Leave match explicitly (forfeit)
        socket.on('leave_match', async (data) => {
            const { matchId, userId } = data;
            const match = await getMatchState(matchId);
            if (match && match.players[userId]) {
                const forfeitingPlayer = match.players[userId];
                delete match.players[userId];
                socket.leave(matchId);
                await removeSocketMatch(socket.id);

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
                    
                    // Update match state in Redis
                    await saveMatchState(matchId, match);
                } else {
                    io.to(matchId).emit('player_left', { odUserId: userId });
                    // Update match state in Redis
                    await saveMatchState(matchId, match);
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
    
    // =============================================================================
    // PARTY REDIS INTEGRATION
    // =============================================================================
    
    // Party Redis key pattern (matches src/lib/party/party-redis.ts)
    const PARTY_USER_KEY = (userId) => `user:${userId}:party`;
    
    /**
     * Get user's current party ID from Redis
     * Inlined version of partyRedis.getUserParty() to avoid TypeScript import
     */
    async function getUserPartyId(userId) {
        if (!presenceRedis) return null;
        try {
            return await presenceRedis.get(PARTY_USER_KEY(userId));
        } catch (err) {
            console.error('[Party] Failed to get user party:', err.message);
            return null;
        }
    }
    
    /**
     * Join a user to their party's Socket.IO room
     * This enables efficient broadcasts to all party members
     */
    async function joinPartyRoom(socket, userId) {
        try {
            const partyId = await getUserPartyId(userId);
            if (partyId) {
                socket.join(`party:${partyId}`);
                console.log(`[Party] User ${userId} joined room party:${partyId}`);
                return partyId;
            }
        } catch (err) {
            console.error(`[Party] Failed to join party room:`, err.message);
        }
        return null;
    }
    
    /**
     * Leave party Socket.IO room
     */
    function leavePartyRoom(socket, partyId) {
        socket.leave(`party:${partyId}`);
        console.log(`[Party] Socket left room party:${partyId}`);
    }
    
    /**
     * Broadcast to all members of a party
     */
    function broadcastToParty(partyId, event, data) {
        presenceNs.to(`party:${partyId}`).emit(event, {
            ...data,
            timestamp: Date.now(),
        });
    }
    
    presenceNs.on('connection', (socket) => {
        console.log(`[Presence] Client connected: ${socket.id}`);
        let currentUserId = null;
        let currentPartyId = null;
        
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
            
            // Auto-join party room if user is in a party
            currentPartyId = await joinPartyRoom(socket, userId);
            
            
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
        
        // Party queue status changed notification (using party room for efficient broadcast)
        socket.on('presence:notify_party_queue_status', async (data) => {
            const { queueStatus, partyId, updaterId } = data;
            console.log(`[Presence] 📢 BROADCASTING queue status change for party ${partyId}`);
            
            // Use party room for efficient broadcast (no member iteration needed)
            broadcastToParty(partyId, 'party:queue_status_changed', {
                queueStatus,
                partyId,
                updaterId,
            });
        });
        
        // =============================================================================
        // REDIS-BASED PARTY EVENTS (New)
        // =============================================================================
        
        // Create a new party
        socket.on('party:create', async (data) => {
            const { userId, userName, level, equippedFrame, equippedTitle } = data;
            if (!userId || !userName) return;
            
            const result = await partyRedis.createParty(userId, userName, {
                level: level || 1,
                equippedFrame,
                equippedTitle,
            });
            
            if (result.success) {
                currentPartyId = result.partyId;
                socket.join(`party:${result.partyId}`);
                socket.emit('party:created', { partyId: result.partyId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Get party data
        socket.on('party:get', async (data) => {
            const { partyId } = data;
            if (!partyId) return;
            
            const partyData = await partyRedis.getParty(partyId);
            socket.emit('party:data', partyData);
        });
        
        // Join a party
        socket.on('party:join', async (data) => {
            const { partyId, userId, userName, level, equippedFrame, equippedTitle } = data;
            if (!partyId || !userId || !userName) return;
            
            const result = await partyRedis.joinParty(partyId, userId, userName, {
                level: level || 1,
                equippedFrame,
                equippedTitle,
            });
            
            if (result.success) {
                currentPartyId = partyId;
                socket.join(`party:${partyId}`);
                
                // Broadcast to party room
                broadcastToParty(partyId, 'party:member_joined', {
                    odUserId: userId,
                    odUserName: userName,
                });
                
                socket.emit('party:joined', { partyId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Leave party
        socket.on('party:leave', async (data) => {
            const { partyId, userId } = data;
            if (!partyId || !userId) return;
            
            const result = await partyRedis.leaveParty(partyId, userId);
            
            if (result.success) {
                // Broadcast BEFORE leaving room
                broadcastToParty(partyId, 'party:member_left', {
                    odUserId: userId,
                    disbanded: result.disbanded,
                    newLeaderId: result.newLeaderId,
                });
                
                leavePartyRoom(socket, partyId);
                currentPartyId = null;
                
                socket.emit('party:left', { disbanded: result.disbanded });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Kick member
        socket.on('party:kick', async (data) => {
            const { partyId, leaderId, targetUserId } = data;
            if (!partyId || !leaderId || !targetUserId) return;
            
            const result = await partyRedis.kickMember(partyId, leaderId, targetUserId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:member_kicked', {
                    kickedUserId: targetUserId,
                    kickedName: result.kickedName,
                });
                
                // Notify the kicked user directly
                presenceNs.to(`user:${targetUserId}`).emit('party:you_were_kicked', {
                    partyId,
                    timestamp: Date.now(),
                });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Toggle ready
        socket.on('party:toggle_ready', async (data) => {
            const { partyId, userId } = data;
            if (!partyId || !userId) return;
            
            const result = await partyRedis.toggleReady(partyId, userId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:ready_changed', {
                    odUserId: userId,
                    isReady: result.isReady,
                    queueCancelled: result.queueCancelled,
                });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Set IGL
        socket.on('party:set_igl', async (data) => {
            const { partyId, leaderId, iglUserId } = data;
            if (!partyId || !leaderId || !iglUserId) return;
            
            const result = await partyRedis.setIGL(partyId, leaderId, iglUserId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:igl_changed', { iglUserId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Set Anchor
        socket.on('party:set_anchor', async (data) => {
            const { partyId, leaderId, anchorUserId } = data;
            if (!partyId || !leaderId || !anchorUserId) return;
            
            const result = await partyRedis.setAnchor(partyId, leaderId, anchorUserId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:anchor_changed', { anchorUserId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Set preferred operation
        socket.on('party:set_preferred_op', async (data) => {
            const { partyId, userId, operation } = data;
            if (!partyId || !userId) return;
            
            const result = await partyRedis.setPreferredOperation(partyId, userId, operation);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:preferred_op_changed', {
                    odUserId: userId,
                    operation,
                });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Create invite
        socket.on('party:invite', async (data) => {
            const { partyId, inviterId, inviterName, inviteeId, inviteeName } = data;
            if (!partyId || !inviterId || !inviteeId) return;
            
            const result = await partyRedis.createInvite(partyId, inviterId, inviterName, inviteeId, inviteeName);
            
            if (result.success) {
                // Notify invitee
                presenceNs.to(`user:${inviteeId}`).emit('party:invite_received', {
                    inviteId: result.inviteId,
                    partyId,
                    inviterName,
                    timestamp: Date.now(),
                });
                
                socket.emit('party:invite_sent', { inviteeId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Accept invite
        socket.on('party:accept_invite', async (data) => {
            const { partyId, userId, userName, level, equippedFrame, equippedTitle } = data;
            if (!partyId || !userId) return;
            
            const result = await partyRedis.acceptInvite(partyId, userId, userName, {
                level: level || 1,
                equippedFrame,
                equippedTitle,
            });
            
            if (result.success) {
                currentPartyId = partyId;
                socket.join(`party:${partyId}`);
                
                broadcastToParty(partyId, 'party:member_joined', {
                    odUserId: userId,
                    odUserName: userName,
                    fromInvite: true,
                });
                
                socket.emit('party:joined', { partyId });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Transfer leadership
        socket.on('party:transfer_leadership', async (data) => {
            const { partyId, currentLeaderId, newLeaderId } = data;
            if (!partyId || !currentLeaderId || !newLeaderId) return;
            
            const result = await partyRedis.transferLeadership(partyId, currentLeaderId, newLeaderId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:leader_changed', {
                    newLeaderId,
                    newLeaderName: result.newLeaderName,
                });
            } else {
                socket.emit('party:error', { error: result.error });
            }
        });
        
        // Disband party
        socket.on('party:disband', async (data) => {
            const { partyId, userId } = data;
            if (!partyId || !userId) return;
            
            const result = await partyRedis.disbandParty(partyId, userId);
            
            if (result.success) {
                broadcastToParty(partyId, 'party:disbanded', {});
                currentPartyId = null;
            } else {
                socket.emit('party:error', { error: result.error });
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
                
                // If user was in a party, notify party members they went offline
                if (currentPartyId) {
                    broadcastToParty(currentPartyId, 'party:member_offline', {
                        odUserId: userId,
                    });
                }
                
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
    
    // In-memory storage for timer references (Redis is primary for state)
    const activeTeamMatches = new Map();      // matchId -> { timer, ...matchState }
    const socketToTeamMatch = new Map();       // socketId -> matchId (cache)
    
    /**
     * Save team match to Redis (primary) and in-memory (for timers)
     */
    async function saveTeamMatchState(matchId, match) {
        // Keep in memory for timer access
        activeTeamMatches.set(matchId, match);
        
        // Save to Redis (primary storage)
        try {
            await arenaRedis.saveTeamMatch(match);
        } catch (err) {
            console.error(`[TeamMatch] Redis save error for ${matchId}:`, err.message);
        }
    }
    
    /**
     * Get team match - checks in-memory first (for timers), then Redis
     */
    async function getTeamMatchState(matchId) {
        // In-memory first (has timer references)
        let match = activeTeamMatches.get(matchId);
        if (match) return match;
        
        // Try Redis as fallback
        try {
            const redisMatch = await arenaRedis.getTeamMatch(matchId);
            if (redisMatch) {
                console.log(`[TeamMatch] Recovered match ${matchId} from Redis`);
                activeTeamMatches.set(matchId, redisMatch);
                return redisMatch;
            }
        } catch (err) {
            console.error(`[TeamMatch] Redis get error for ${matchId}:`, err.message);
        }
        
        return null;
    }
    
    /**
     * Delete team match from both in-memory and Redis
     */
    async function removeTeamMatchState(matchId) {
        const match = activeTeamMatches.get(matchId);
        if (match) {
            // Clean up timers
            if (match.timer) clearInterval(match.timer);
            if (match.relayTimer) clearInterval(match.relayTimer);
            
            // Clean up party queue status for both teams (backup cleanup in case endTeamMatch didn't run)
            for (const team of [match.team1, match.team2]) {
                if (team?.partyId && !team.partyId.startsWith('ai_')) {
                    try {
                        // Delete the match reference
                        await arenaRedis.redis.del(`team:match:${team.partyId}`);
                        console.log(`[TeamMatch] Cleanup: Deleted team:match:${team.partyId}`);
                    } catch (err) {
                        console.error(`[TeamMatch] Cleanup failed for party ${team.partyId}:`, err.message);
                    }
                }
            }
        }

        // Remove from in-memory
        activeTeamMatches.delete(matchId);

        // Remove from Redis
        try {
            await arenaRedis.deleteTeamMatch(matchId);
        } catch (err) {
            console.error(`[TeamMatch] Redis delete error for ${matchId}:`, err.message);
        }
    }
    
    /**
     * Set socket-to-team-match mapping
     */
    async function setSocketTeamMatch(socketId, matchId) {
        socketToTeamMatch.set(socketId, matchId);
        try {
            await arenaRedis.setSocketToMatch(socketId, matchId);
        } catch (err) {
            console.error(`[TeamMatch] Redis socket map error:`, err.message);
        }
    }
    
    /**
     * Get team match ID for a socket
     */
    async function getSocketTeamMatch(socketId) {
        const matchId = socketToTeamMatch.get(socketId);
        if (matchId) return matchId;
        
        try {
            const redisMatchId = await arenaRedis.getMatchFromSocket(socketId);
            if (redisMatchId) {
                socketToTeamMatch.set(socketId, redisMatchId);
                return redisMatchId;
            }
        } catch (err) {
            console.error(`[TeamMatch] Redis socket lookup error:`, err.message);
        }
        
        return null;
    }
    
    // Team match state constants
    const TEAM_MATCH_PHASES = {
        PRE_MATCH: 'pre_match',
        STRATEGY: 'strategy',        // IGL assigns slots before match starts
        ROUND_COUNTDOWN: 'round_countdown', // 3-2-1-GO before each round
        ACTIVE: 'active',
        BREAK: 'break',
        HALFTIME: 'halftime',
        ANCHOR_DECISION: 'anchor_decision',
        SOLO_DECISION: 'solo_decision',     // Between R3 and R4 of 2nd half - IGL chooses Normal vs Anchor Solo
        POST_MATCH: 'post_match',
    };
    
    // =============================================================================
    // MODE-SPECIFIC TEAM MATCH CONFIGURATIONS
    // =============================================================================
    
    // =============================================================================
    // SCORING SYSTEM CONFIGURATION
    // =============================================================================
    const SCORING_CONFIG = {
        // Base points
        POINTS_PER_CORRECT: 5,           // Base points for correct answer
        POINTS_PER_INCORRECT: -3,        // Penalty for wrong answer
        POINTS_PER_TIMEOUT: -3,          // Penalty for unanswered question
        
        // Speed bonus (only if correct) - based on answer time in seconds
        // 0-1s = +7, 1-2s = +6, 2-3s = +5, 3-4s = +4, 4-5s = +3
        SPEED_BONUS_MAX: 7,              // Bonus for 0-1 second answer
        SPEED_BONUS_MIN: 3,              // Bonus for 4-5 second answer
        SPEED_BONUS_STEP: 1,             // Decrease per second
        
        // First to finish round bonus
        FIRST_TO_FINISH_ROUND: 50,       // Bonus for first team to complete round
        
        // Team streak milestone bonuses (one-time when reached)
        STREAK_MILESTONES: {
            10: 10,   // +10 at 10 streak
            25: 25,   // +25 at 25 streak
            50: 50,   // +50 at 50 streak
            75: 75,   // +75 at 75 streak
        },
        
        // Score floor (minimum score)
        SCORE_FLOOR: 0,                  // Scores cannot go below this
    };
    
    /**
     * Calculate speed bonus based on answer time
     * @param {number} answerTimeMs - Time to answer in milliseconds
     * @returns {number} Speed bonus points (0 if > 5 seconds)
     */
    function calculateSpeedBonus(answerTimeMs) {
        const answerTimeSec = answerTimeMs / 1000;
        if (answerTimeSec >= 5) return 0;
        
        // 0-1s = +7, 1-2s = +6, 2-3s = +5, 3-4s = +4, 4-5s = +3
        const secondBucket = Math.floor(answerTimeSec);
        return SCORING_CONFIG.SPEED_BONUS_MAX - (secondBucket * SCORING_CONFIG.SPEED_BONUS_STEP);
    }
    
    /**
     * Check if team streak has reached a milestone and return bonus
     * @param {number} previousStreak - Streak before this answer
     * @param {number} newStreak - Streak after this answer
     * @returns {number} Milestone bonus points (0 if no milestone reached)
     */
    function checkStreakMilestone(previousStreak, newStreak) {
        let bonus = 0;
        for (const [milestone, points] of Object.entries(SCORING_CONFIG.STREAK_MILESTONES)) {
            const milestoneNum = parseInt(milestone);
            // Check if we just crossed this milestone
            if (previousStreak < milestoneNum && newStreak >= milestoneNum) {
                bonus += points;
                console.log(`[Scoring] Team streak milestone reached: ${milestoneNum} (+${points} points)`);
            }
        }
        return bonus;
    }
    
    /**
     * Apply score floor to ensure score doesn't go below minimum
     * @param {number} score - Current score
     * @returns {number} Score clamped to floor
     */
    function applyScoreFloor(score) {
        return Math.max(SCORING_CONFIG.SCORE_FLOOR, score);
    }
    
    const TEAM_MATCH_CONFIGS = {
        '5v5': {
            TEAM_SIZE: 5,
            ROUNDS_PER_HALF: 4,
            TOTAL_ROUNDS: 8,
            QUESTIONS_PER_SLOT: 5,
            SLOTS_PER_ROUND: 5,
            HALF_DURATION_MS: 300000,        // 5 minutes per half
            ROUND_DURATION_MS: 80000,        // 1:20 per round
            PRE_MATCH_DURATION_MS: 15000,    // 15 seconds to view teams before strategy phase
            BREAK_DURATION_MS: 15000,        // 15 seconds between rounds
            HALFTIME_DURATION_MS: 120000,    // 2 minutes halftime
            STRATEGY_DURATION_MS: 60000,     // 60 seconds for IGL to assign slots before match
            TIMEOUT_DURATION_MS: 30000,      // 30 seconds per timeout
            TIMEOUTS_PER_TEAM: 2,
            HANDOFF_COUNTDOWN_MS: 0,         // Instant handoff - no delay
            ROUND_COUNTDOWN_MS: 6000,        // 5-4-3-2-1-GO countdown (6s total)
            TYPING_THROTTLE_MS: 50,          // Throttle typing updates
            DOUBLE_CALLIN_ENABLED: true,     // Double Call-In available in 5v5
            QUESTION_TIMEOUT_MS: 15000,      // 15 seconds per question before auto-skip
            TIMEOUT_WARNING_MS: 5000,        // Show warning at 5s remaining
            SOLO_DECISION_DURATION_MS: 10000, // 10 seconds for IGL to choose Normal vs Anchor Solo
            ROUND_END_DELAY_MS: 3000,        // 3 second delay before break to show first-to-finish bonus
        },
        '2v2': {
            TEAM_SIZE: 2,
            ROUNDS_PER_HALF: 4,
            TOTAL_ROUNDS: 8,
            QUESTIONS_PER_SLOT: 6,           // 6 questions per slot (2 slots × 6 = 12 per round)
            SLOTS_PER_ROUND: 2,              // 2 operations chosen randomly
            HALF_DURATION_MS: 210000,        // 3:30 per half
            ROUND_DURATION_MS: 50000,        // 0:50 per round
            PRE_MATCH_DURATION_MS: 10000,    // 10 seconds pre-match (faster pace)
            BREAK_DURATION_MS: 8000,         // 8 seconds between rounds
            HALFTIME_DURATION_MS: 60000,     // 60 seconds halftime
            STRATEGY_DURATION_MS: 30000,     // 30 seconds for IGL to assign slots
            TIMEOUT_DURATION_MS: 30000,      // 30 seconds per timeout
            TIMEOUTS_PER_TEAM: 2,
            HANDOFF_COUNTDOWN_MS: 0,         // Instant handoff - no delay
            ROUND_COUNTDOWN_MS: 5000,        // 4-3-2-1-GO countdown (5s total, faster)
            TYPING_THROTTLE_MS: 50,
            DOUBLE_CALLIN_ENABLED: false,    // Double Call-In NOT available in 2v2 per spec
            QUESTION_TIMEOUT_MS: 15000,      // 15 seconds per question before auto-skip
            TIMEOUT_WARNING_MS: 5000,        // Show warning at 5s remaining
            SOLO_DECISION_DURATION_MS: 10000, // 10 seconds for IGL to choose Normal vs Anchor Solo
            ROUND_END_DELAY_MS: 3000,        // 3 second delay before break to show first-to-finish bonus
        },
    };
    
    /**
     * Get match configuration for a specific mode
     * @param {string} mode - '5v5' or '2v2'
     * @returns {Object} Mode-specific configuration
     */
    function getMatchConfig(mode) {
        return TEAM_MATCH_CONFIGS[mode] || TEAM_MATCH_CONFIGS['5v5'];
    }
    
    // Default config for backwards compatibility (uses 5v5)
    const TEAM_MATCH_CONFIG = TEAM_MATCH_CONFIGS['5v5'];
    
    // All available operations
    const ALL_SLOT_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
    
    // Default slot operations (for 5v5, uses all operations)
    const SLOT_OPERATIONS = ALL_SLOT_OPERATIONS;
    
    /**
     * Get slot operations for a specific mode
     * For 2v2: Randomly select 2 of 5 operations
     * For 5v5: Use all 5 operations
     * @param {string} mode - '5v5' or '2v2'
     * @returns {string[]} Array of operation names for this match
     */
    function getSlotOperationsForMode(mode) {
        if (mode === '2v2') {
            // Shuffle and pick 2 operations randomly
            const shuffled = [...ALL_SLOT_OPERATIONS].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, 2);
        }
        // Default: all operations for 5v5
        return ALL_SLOT_OPERATIONS;
    }
    
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
    const BOT_BANNERS = ['matrices', 'synthwave', 'plasma', 'legendary', 'royal'];

    const BOT_DIFFICULTY_CONFIGS = {
        easy: { answerTimeRange: [3000, 6000], accuracy: 0.6 },
        medium: { answerTimeRange: [2000, 4000], accuracy: 0.75 },
        hard: { answerTimeRange: [1500, 3000], accuracy: 0.85 },
        impossible: { answerTimeRange: [800, 1500], accuracy: 0.95 },
    };

    /**
     * Generate an AI team with bot players (mode-aware)
     * @param {string} matchId - Match ID for unique bot IDs
     * @param {number} targetElo - Target ELO for the bots
     * @param {string} difficulty - Bot difficulty level
     * @param {string} mode - '5v5' or '2v2'
     */
    function generateAITeam(matchId, targetElo, difficulty = 'medium', mode = '5v5') {
        console.log(`[TeamMatch] generateAITeam called with mode=${mode}`);
        const teamIdentity = BOT_TEAM_NAMES[Math.floor(Math.random() * BOT_TEAM_NAMES.length)];
        const names = BOT_NAMES_BY_THEME[teamIdentity.theme] || BOT_NAMES_BY_THEME.tech;
        const config = BOT_DIFFICULTY_CONFIGS[difficulty] || BOT_DIFFICULTY_CONFIGS.medium;
        
        // Get mode-specific slot operations
        const slotOps = getSlotOperationsForMode(mode);
        console.log(`[TeamMatch] For mode=${mode}, slotOps=${JSON.stringify(slotOps)} (count: ${slotOps.length})`);
        
        const botMembers = slotOps.map((op, index) => ({
            odUserId: `ai_bot_${matchId}_${index}`,
            odUserName: names[index % names.length],
            odElo: targetElo + Math.floor(Math.random() * 100) - 50,
            odLevel: Math.floor(Math.random() * 50) + 50,
            odEquippedFrame: BOT_FRAMES[Math.floor(Math.random() * BOT_FRAMES.length)],
            odEquippedBanner: BOT_BANNERS[Math.floor(Math.random() * BOT_BANNERS.length)],
            odEquippedTitle: BOT_TITLES[Math.floor(Math.random() * BOT_TITLES.length)],
            odPreferredOperation: op,
            isBot: true,
            botConfig: config,
        }));

        console.log(`[TeamMatch] Generated AI team for ${mode} with ${botMembers.length} bots`);

        return {
            odPartyId: `ai_party_${matchId}`,
            odTeamId: `ai_team_${matchId}`,
            odTeamName: teamIdentity.name,
            odTeamTag: teamIdentity.tag,
            odElo: targetElo,
            odMode: mode,
            odMatchType: 'casual',
            odIglId: botMembers[0].odUserId,
            odIglName: botMembers[0].odUserName,
            odAnchorId: botMembers[1] ? botMembers[1].odUserId : botMembers[0].odUserId,
            odAnchorName: botMembers[1] ? botMembers[1].odUserName : botMembers[0].odUserName,
            odMembers: botMembers,
            odJoinedAt: Date.now(),
            isAITeam: true,
        };
    }

    /**
     * Check if a user ID is an AI bot (opponent)
     */
    function isAIBot(userId) {
        return userId && userId.startsWith('ai_bot_');
    }

    /**
     * Check if a user ID is an AI teammate
     */
    function isAITeammate(userId) {
        return userId && userId.startsWith('ai_teammate_');
    }

    /**
     * Check if a user ID is any type of AI (bot or teammate)
     */
    function isAnyAI(userId) {
        return isAIBot(userId) || isAITeammate(userId);
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
     * @param {string} matchId - Unique match identifier
     * @param {Object} team1 - Team 1 data from queue entry
     * @param {Object} team2 - Team 2 data from queue entry
     * @param {string} operation - Match operation type ('mixed' for team matches)
     * @param {string} matchType - 'ranked' or 'casual'
     * @param {string} mode - '5v5' or '2v2' (defaults to '5v5')
     */
    function initTeamMatchState(matchId, team1, team2, operation, matchType, mode = '5v5') {
        // Get mode-specific configuration
        const config = getMatchConfig(mode);
        
        // Get slot operations for this mode (2v2 gets 2 random operations)
        const matchSlotOperations = getSlotOperationsForMode(mode);
        
        console.log(`[TeamMatch] Initializing ${mode} match ${matchId} with slots:`, matchSlotOperations);
        
        // Create slot assignments (default: based on preferences or sequential)
        const createSlotAssignments = (team) => {
            const assignments = {};
            const members = [...team.odMembers];
            
            // Try to assign based on preferences first
            for (const slot of matchSlotOperations) {
                const preferred = members.find(m => m.odPreferredOperation === slot);
                if (preferred) {
                    assignments[slot] = preferred.odUserId;
                    members.splice(members.indexOf(preferred), 1);
                }
            }
            
            // Fill remaining slots sequentially
            let memberIndex = 0;
            for (const slot of matchSlotOperations) {
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
                slotOperationsOrder: matchSlotOperations, // Store the ordered operations for this match
                players: {},
                currentSlot: 1,           // Each team tracks their own slot (1-N based on mode)
                questionsInSlot: 0,       // Each team tracks their own progress
                // Double Call-In state (per spec: Anchor plays 2 slots, one player benched)
                // NOTE: Double Call-In is NOT available in 2v2 mode
                doubleCallinActive: false,       // Is Double Call-In active this round?
                doubleCallinSlot: null,          // Which slot (operation) the anchor is taking over
                doubleCallinBenchedId: null,     // Which player is sitting out
                doubleCallinForRound: null,      // Which round this Double Call-In applies to
                usedDoubleCallinHalf1: false,    // Used in 1st half?
                usedDoubleCallinHalf2: false,    // Used in 2nd half?
                // Anchor Solo state (Final Round Solo - anchor plays all slots in final round)
                anchorSoloActive: false,         // Is Anchor Solo active for final round?
                anchorSoloDecision: null,        // 'solo' | 'normal' | null (decision made by IGL)
                usedAnchorSolo: false,           // Has Anchor Solo been used this match?
            };
        };
        
        const team1State = createTeamState(team1, true);
        const team2State = createTeamState(team2, false);
        
        // Initialize player states for both teams
        const initPlayerStates = (teamData, teamState) => {
            for (const member of teamData.odMembers) {
                const slotOp = Object.entries(teamState.slotAssignments)
                    .find(([op, id]) => id === member.odUserId)?.[0] || matchSlotOperations[0];
                
                teamState.players[member.odUserId] = {
                    odUserId: member.odUserId,
                    odName: member.odUserName,
                    odLevel: member.odLevel,
                    odEquippedFrame: member.odEquippedFrame,
                    odEquippedBanner: member.odEquippedBanner || 'default',
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
                    questionTimeoutTimer: null,    // Timer ID for per-question timeout
                    questionWarningTimer: null,    // Timer ID for timeout warning
                    timeoutsInSlot: 0,             // Count of timed-out questions in current slot
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
            mode,                        // '5v5' or '2v2'
            slotOperations: matchSlotOperations,  // Array of operations for this match
            round: 1,
            half: 1,
            phase: TEAM_MATCH_PHASES.PRE_MATCH,
            gameClockMs: config.HALF_DURATION_MS, // Mode-specific half duration, count DOWN
            relayClockMs: 0,
            currentSlot: 1,              // 1-N (which operation slot is active, based on mode)
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
     * FIXED: Use ordered slot assignments for consistent turn order
     */
    function getSlotOperation(slotNumber, matchOperation, teamState = null) {
        if (matchOperation === 'mixed' && teamState) {
            // Use the ordered slot assignments to ensure consistent turn order
            const orderedSlots = getOrderedSlotAssignments(teamState);
            return orderedSlots[slotNumber - 1] || 'addition';
        } else if (matchOperation === 'mixed') {
            // Fallback to original behavior if no team state provided
            return SLOT_OPERATIONS[slotNumber - 1] || 'addition';
        }
        return matchOperation;
    }
    
    /**
     * Get the active player for a team in the current slot
     * Handles Double Call-In: if anchor is taking over this slot, return anchor instead
     * FIXED: Use ordered slot assignments instead of assuming SLOT_OPERATIONS order
     * @param {Object} teamState - The team state object
     * @param {number} slotNumber - The slot number (1-5)
     * @param {number} currentRound - The current round number (used to check if Double Call-In applies)
     */
    function getActivePlayer(teamState, slotNumber, currentRound = null) {
        // Get the ordered list of slot assignments to ensure consistent turn order
        const orderedSlots = getOrderedSlotAssignments(teamState);
        const slotOp = orderedSlots[slotNumber - 1];

        if (!slotOp) {
            console.error(`[TeamMatch] No slot operation found for slot ${slotNumber}. Available slots:`, orderedSlots);
            return null;
        }

        // ANCHOR SOLO: If anchor solo is active, anchor plays ALL slots
        if (teamState.anchorSoloActive) {
            const anchorPlayer = teamState.players[teamState.anchorId];
            if (anchorPlayer) {
                console.log(`[TeamMatch] Anchor Solo: ${anchorPlayer.odName} playing slot ${slotNumber} (${slotOp})`);
                return anchorPlayer;
            }
        }

        // Check if Double Call-In is active for this slot AND this round
        // Double Call-In only activates when:
        // 1. doubleCallinActive is true
        // 2. The target slot matches (doubleCallinSlot === slotOp)
        // 3. The current round matches the scheduled round (doubleCallinForRound === currentRound)
        const doubleCallinApplies = teamState.doubleCallinActive &&
                                     teamState.doubleCallinSlot === slotOp &&
                                     (currentRound === null || teamState.doubleCallinForRound === currentRound);

        if (doubleCallinApplies) {
            // Return the anchor player instead of the normally assigned player
            const anchorPlayer = teamState.players[teamState.anchorId];
            if (anchorPlayer) {
                console.log(`[TeamMatch] Double Call-In: Anchor ${anchorPlayer.odName} playing slot ${slotOp} in Round ${currentRound} (scheduled for R${teamState.doubleCallinForRound})`);
                return anchorPlayer;
            }
        }

        const playerId = teamState.slotAssignments[slotOp];
        const player = teamState.players[playerId];
        
        if (!player) {
            console.error(`[TeamMatch] No player found for slot ${slotNumber} (${slotOp}). PlayerId: ${playerId}, Available players:`, Object.keys(teamState.players));
        }
        
        return player || null;
    }
    
    /**
     * Get ordered slot assignments for consistent turn order
     * Returns array of operation names in the order they should be played
     * FIXED: Uses the match-specific slotOperationsOrder instead of global SLOT_OPERATIONS
     * This ensures 2v2 matches respect the randomly picked operation order
     */
    function getOrderedSlotAssignments(teamState) {
        // Use the team's stored slot operations order (set during match init)
        // This preserves the random operation order picked for 2v2 matches
        const operationsOrder = teamState.slotOperationsOrder || SLOT_OPERATIONS;
        
        const orderedSlots = [];
        
        for (const operation of operationsOrder) {
            if (teamState.slotAssignments[operation]) {
                orderedSlots.push(operation);
            }
        }
        
        // Fallback: if no slots match, use whatever assignments exist
        if (orderedSlots.length === 0) {
            orderedSlots.push(...Object.keys(teamState.slotAssignments));
        }
        
        // Debug: Log the ordering to verify it respects the random pick
        if (teamState.slotOperationsOrder && teamState.slotOperationsOrder.length === 2) {
            console.log(`[TeamMatch] 2v2 ordered slots: ${JSON.stringify(orderedSlots)} (from order: ${JSON.stringify(operationsOrder)})`);
        }
        
        return orderedSlots;
    }
    
    /**
     * Generate a question for a specific operation
     */
    function generateTeamQuestion(operation) {
        return generateQuestion(operation);
    }

    /**
     * Clear any existing question timers for a player
     * Call this before starting a new timer or when slot/round changes
     */
    function clearQuestionTimer(player) {
        if (player.questionTimeoutTimer) {
            clearTimeout(player.questionTimeoutTimer);
            player.questionTimeoutTimer = null;
        }
        if (player.questionWarningTimer) {
            clearTimeout(player.questionWarningTimer);
            player.questionWarningTimer = null;
        }
    }

    /**
     * Start the question timer for an active player
     * - Emits timeout_warning at (QUESTION_TIMEOUT_MS - TIMEOUT_WARNING_MS) 
     * - Calls handleQuestionTimeout at QUESTION_TIMEOUT_MS
     * 
     * @param {Object} match - The match object
     * @param {Object} team - The team object the player belongs to
     * @param {Object} player - The player object
     * @param {Object} ns - The Socket.IO namespace
     */
    function startQuestionTimer(match, team, player, ns) {
        // Don't start timers for AI players - they answer on their own
        if (isAITeammate(player.odUserId) || isAIBot(player.odUserId)) {
            return;
        }

        // Clear any existing timers first
        clearQuestionTimer(player);

        const matchConfig = getMatchConfig(match.mode || '5v5');
        const timeoutMs = matchConfig.QUESTION_TIMEOUT_MS;
        const warningMs = matchConfig.TIMEOUT_WARNING_MS;
        const warningDelayMs = timeoutMs - warningMs; // When to show warning (2s into question for 5s timeout with 3s warning)

        // Start the warning timer
        player.questionWarningTimer = setTimeout(() => {
            // Emit warning to the player's socket
            if (player.odSocketId) {
                console.log(`[TeamMatch] Emitting timeout_warning to ${player.odName} (socket: ${player.odSocketId})`);
                ns.to(player.odSocketId).emit('timeout_warning', {
                    matchId: match.matchId,
                    playerId: player.odUserId,
                    remainingMs: warningMs,
                    countdownSeconds: Math.ceil(warningMs / 1000),
                });
            } else {
                console.warn(`[TeamMatch] Cannot emit timeout_warning - ${player.odName} has no socket ID`);
            }
            console.log(`[TeamMatch] Timeout warning for ${player.odName} - ${warningMs}ms remaining`);
        }, warningDelayMs);

        // Start the timeout timer
        player.questionTimeoutTimer = setTimeout(() => {
            handleQuestionTimeout(match, team, player, ns);
        }, timeoutMs);

        console.log(`[TeamMatch] Started ${timeoutMs}ms question timer for ${player.odName}`);
    }

    /**
     * Handle a question timeout - player didn't answer in time
     * - Mark question as skipped (0 points, streak broken)
     * - Generate new question or advance slot if all questions timed out
     * 
     * @param {Object} match - The match object
     * @param {Object} team - The team object
     * @param {Object} player - The player who timed out
     * @param {Object} ns - The Socket.IO namespace
     */
    function handleQuestionTimeout(match, team, player, ns) {
        // Clear any remaining timers
        clearQuestionTimer(player);

        const matchConfig = getMatchConfig(match.mode || '5v5');

        // Increment timeout counter for this slot
        player.timeoutsInSlot = (player.timeoutsInSlot || 0) + 1;
        
        // Reset streaks (timeout breaks both individual and team streak)
        player.streak = 0;
        team.currentStreak = 0;
        
        // Apply timeout penalty
        const timeoutPenalty = SCORING_CONFIG.POINTS_PER_TIMEOUT;
        player.score += timeoutPenalty;
        team.score += timeoutPenalty;
        
        // Apply score floor (no negative scores)
        player.score = applyScoreFloor(player.score);
        team.score = applyScoreFloor(team.score);
        
        // Increment total questions answered (counts as an attempt)
        player.total++;
        team.questionsInSlot++;

        console.log(`[TeamMatch] Question timeout for ${player.odName}: ${timeoutPenalty} pts, ${player.timeoutsInSlot} timeouts in slot, ${team.questionsInSlot}/${matchConfig.QUESTIONS_PER_SLOT} questions in slot`);

        // Emit timeout event to client
        if (player.odSocketId) {
            ns.to(player.odSocketId).emit('question_timeout', {
                matchId: match.matchId,
                playerId: player.odUserId,
                playerName: player.odName,
                correctAnswer: player.currentQuestion?.answer,
                question: player.currentQuestion?.displayText,
                timeoutsInSlot: player.timeoutsInSlot,
                questionsInSlot: team.questionsInSlot,
                questionsPerSlot: matchConfig.QUESTIONS_PER_SLOT,
                streak: 0,
                teamStreak: 0,
                pointsLost: Math.abs(timeoutPenalty),
                newPlayerScore: player.score,
                newTeamScore: team.score,
            });
        }

        // Broadcast to team that player timed out
        ns.to(`team:${match.matchId}:${team.teamId}`).emit('teammate_timeout', {
            playerId: player.odUserId,
            playerName: player.odName,
            timeoutsInSlot: player.timeoutsInSlot,
            pointsLost: Math.abs(timeoutPenalty),
            newTeamScore: team.score,
        });

        // Check if slot is complete
        if (team.questionsInSlot >= matchConfig.QUESTIONS_PER_SLOT) {
            // Slot complete - advance to next slot
            console.log(`[TeamMatch] Slot complete for ${team.teamName} after timeout`);
            advanceTeamToNextSlot(match, team, ns);
        } else if (player.timeoutsInSlot >= matchConfig.QUESTIONS_PER_SLOT) {
            // Player timed out on ALL questions in their slot - force handoff
            console.log(`[TeamMatch] Player ${player.odName} timed out on all questions - forcing slot advance`);
            
            // Mark the remaining questions as timed out
            const remaining = matchConfig.QUESTIONS_PER_SLOT - team.questionsInSlot;
            team.questionsInSlot = matchConfig.QUESTIONS_PER_SLOT;
            player.total += remaining;
            player.timeoutsInSlot += remaining;
            
            advanceTeamToNextSlot(match, team, ns);
        } else {
            // Generate next question and restart timer
            const slotOp = getSlotOperation(team.currentSlot, match.operation, team);
            player.currentQuestion = generateTeamQuestion(slotOp);
            player.questionStartTime = Date.now();

            // Emit new question to player
            if (player.odSocketId) {
                console.log(`[TeamMatch] Emitting new_question to ${player.odName} (socket: ${player.odSocketId}): ${player.currentQuestion.question}`);
                ns.to(player.odSocketId).emit('new_question', {
                    question: player.currentQuestion,
                    questionNumber: team.questionsInSlot + 1,
                    totalQuestions: matchConfig.QUESTIONS_PER_SLOT,
                    slot: team.currentSlot,
                    operation: slotOp,
                    afterTimeout: true,
                });
            } else {
                console.warn(`[TeamMatch] Cannot emit new_question - ${player.odName} has no socket ID!`);
            }

            // Start timer for the new question
            startQuestionTimer(match, team, player, ns);
        }

        // Save match state after timeout processing
        arenaRedis.saveTeamMatch(match).catch(err => {
            console.error(`[TeamMatch] Failed to save match after timeout:`, err);
        });
    }

    // Team match namespace
    const teamMatchNs = io.of('/arena/teams');
    
    teamMatchNs.on('connection', (socket) => {
        console.log(`[TeamMatch] Client connected: ${socket.id}`);
        
        // Join a team match
        socket.on('join_team_match', async (data) => {
            const { matchId, userId, teamId, partyId } = data;
            
            console.log(`[TeamMatch] =============== join_team_match DEBUG ===============`);
            console.log(`[TeamMatch] join_team_match received: matchId=${matchId}, userId=${userId}, partyId=${partyId || 'MISSING'}`);
            console.log(`[TeamMatch] Raw data received:`, JSON.stringify(data, null, 2));
            
            // First check in-memory (for matches already created)
            let match = activeTeamMatches.get(matchId);
            
            // If match doesn't exist in memory, check Redis for:
            // 1. Already created match state
            // 2. AI match setup
            // 3. PvP match from matchmaking (by partyId)
            if (!match) {
                try {
                    // Use the centralized arena Redis helper
                    console.log(`[TeamMatch] Match ${matchId} not in memory, checking Redis...`);
                    
                    // Check for existing match state in Redis
                    match = await arenaRedis.getTeamMatch(matchId);
                    if (match) {
                        console.log(`[TeamMatch] Found match ${matchId} in Redis`);
                        activeTeamMatches.set(matchId, match);
                    }
                    
                    // Check for AI match setup
                    if (!match) {
                        const setupData = await arenaRedis.getTeamMatchSetup(matchId);
                        if (setupData && setupData.isAIMatch) {
                            const matchMode = setupData.mode || setupData.humanTeam?.odMode || '5v5';
                            console.log(`[TeamMatch] Creating AI match ${matchId} (${matchMode}) on first player join`);
                            console.log(`[TeamMatch] DEBUG setupData.mode=${setupData.mode}, humanTeam.odMode=${setupData.humanTeam?.odMode}, resolved matchMode=${matchMode}`);
                            
                            // Generate AI team (mode-aware)
                            const aiTeam = generateAITeam(matchId, setupData.targetElo, setupData.aiDifficulty, matchMode);
                            
                            // Create the match (with mode)
                            match = initTeamMatchState(matchId, setupData.humanTeam, aiTeam, 'mixed', 'casual', matchMode);
                            match.isAIMatch = true;
                            match.aiDifficulty = setupData.aiDifficulty;
                            match.hasAITeammates = setupData.hasAITeammates || false;
                            
                            // Mark AI opponent players as already "connected"
                            for (const playerId of Object.keys(match.team2.players)) {
                                if (isAIBot(playerId)) {
                                    match.team2.players[playerId].odSocketId = 'ai_bot';
                                    match.team2.players[playerId].isBot = true;
                                    match.team2.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[setupData.aiDifficulty || 'medium'];
                                }
                            }
                            
                            // Mark AI teammates as already "connected" (if any)
                            for (const playerId of Object.keys(match.team1.players)) {
                                if (isAITeammate(playerId)) {
                                    match.team1.players[playerId].odSocketId = 'ai_teammate';
                                    match.team1.players[playerId].isBot = true;
                                    match.team1.players[playerId].isAITeammate = true;
                                    match.team1.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[setupData.aiDifficulty || 'medium'];
                                    console.log(`[TeamMatch] AI Teammate ${playerId} marked as connected`);
                                }
                            }
                            
                            // Save to both Redis and in-memory
                            activeTeamMatches.set(matchId, match);
                            await arenaRedis.saveTeamMatch(match);
                            
                            const aiTeammateCount = Object.keys(match.team1.players).filter(id => isAITeammate(id)).length;
                            console.log(`[TeamMatch] AI Match ${matchId} created: ${setupData.humanTeam.odTeamName || 'Team 1'} (${aiTeammateCount} AI teammates) vs ${aiTeam.odTeamName}`);
                        }
                    }
                    
                    // Check for PvP match from matchmaking (stored by partyId)
                    console.log(`[TeamMatch] DEBUG: About to check PvP matchmaking. match=${!!match}, partyId=${partyId || 'MISSING'}, willCheckPvP=${!match && !!partyId}`);
                    if (!match && partyId) {
                        console.log(`[TeamMatch] DEBUG: Calling getMatchFromMatchmaking for partyId=${partyId}`);
                        const matchResult = await arenaRedis.getMatchFromMatchmaking(partyId);
                        console.log(`[TeamMatch] DEBUG: getMatchFromMatchmaking returned: found=${!!matchResult}, matchResultMatchId=${matchResult?.matchId}, expectedMatchId=${matchId}, idsMatch=${matchResult?.matchId === matchId}`);
                        if (matchResult && matchResult.matchId === matchId) {
                            // Determine match type and mode from matchmaking result
                            const matchType = matchResult.odTeam1.odMatchType || 'casual';
                            const matchMode = matchResult.odTeam1.odMode || '5v5';
                            console.log(`[TeamMatch] Creating PvP match ${matchId} (${matchMode}) from matchmaking data`);
                            
                            // Create match state from matchmaking result (with mode)
                            match = initTeamMatchState(
                                matchId,
                                matchResult.odTeam1,
                                matchResult.odTeam2,
                                'mixed',  // operation
                                matchType,
                                matchMode
                            );
                            
                            // Check for AI teammates on either team and configure them
                            let hasAnyAI = false;
                            for (const team of [match.team1, match.team2]) {
                                for (const playerId of Object.keys(team.players)) {
                                    if (isAITeammate(playerId)) {
                                        team.players[playerId].odSocketId = 'ai_teammate';
                                        team.players[playerId].isBot = true;
                                        team.players[playerId].isAITeammate = true;
                                        team.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS['medium'];
                                        hasAnyAI = true;
                                        console.log(`[TeamMatch] PvP AI Teammate ${playerId} configured for team ${team.teamId}`);
                                    }
                                }
                            }
                            
                            // Set match flags for AI behavior
                            if (hasAnyAI) {
                                match.isAIMatch = true;  // Enable bot behavior loop
                                match.hasAITeammates = true;
                                match.aiDifficulty = 'medium';
                            }
                            
                            // Save to both Redis and in-memory
                            activeTeamMatches.set(matchId, match);
                            await arenaRedis.saveTeamMatch(match);
                            
                            const team1AICount = Object.keys(match.team1.players).filter(id => isAITeammate(id)).length;
                            const team2AICount = Object.keys(match.team2.players).filter(id => isAITeammate(id)).length;
                            console.log(`[TeamMatch] PvP Match ${matchId} created: ${matchResult.odTeam1.odTeamName || 'Team 1'} (${team1AICount} AI) vs ${matchResult.odTeam2.odTeamName || 'Team 2'} (${team2AICount} AI)`);
                        }
                    }
                } catch (err) {
                    console.error('[TeamMatch] Error checking for match in Redis:', err);
                }
            }
            
            if (!match) {
                console.log(`[TeamMatch] Match ${matchId} not found (checked memory + Redis)`);
                socket.emit('error', { message: 'Match not found', matchId, partyId });
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
            // Also save to Redis for cross-process access
            await arenaRedis.setSocketToTeamMatch(socket.id, { matchId, userId, teamId: team.teamId });
            
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
                mode: match.mode || '5v5',                // Include match mode
                slotOperations: match.slotOperations,     // Include slot operations for UI
            });

            // If pre-match countdown is already in progress, send the current countdown state
            // to this player so they see the VS screen countdown
            if (match.preMatchCountdownStarted && match.phase === TEAM_MATCH_PHASES.PRE_MATCH) {
                const elapsed = Date.now() - match.preMatchStartTime;
                const remainingMs = Math.max(0, TEAM_MATCH_CONFIG.PRE_MATCH_DURATION_MS - elapsed);
                console.log(`[TeamMatch] Sending pre-match countdown catchup to ${player.odName}: ${remainingMs}ms remaining`);
                socket.emit('pre_match_countdown_start', {
                    matchId: match.matchId,
                    durationMs: remainingMs,
                    endsAt: Date.now() + remainingMs,
                });
            }

            // If strategy phase is in progress, send the current strategy state
            if (match.phase === TEAM_MATCH_PHASES.STRATEGY) {
                const elapsed = Date.now() - match.strategyStartTime;
                const remainingMs = Math.max(0, TEAM_MATCH_CONFIG.STRATEGY_DURATION_MS - elapsed);
                const team1Slots = getTeamSlotAssignments(match.team1);
                const team2Slots = getTeamSlotAssignments(match.team2);
                console.log(`[TeamMatch] Sending strategy phase catchup to ${player.odName}: ${remainingMs}ms remaining`);
                socket.emit('strategy_phase_start', {
                    matchId: match.matchId,
                    durationMs: remainingMs,
                    team1Slots,
                    team2Slots,
                    team1IglId: match.team1.iglId,
                    team2IglId: match.team2.iglId,
                });
            }

            // If active phase (match in progress), send catchup data
            if (match.phase === TEAM_MATCH_PHASES.ACTIVE) {
                console.log(`[TeamMatch] Sending active phase catchup to ${player.odName}`);

                // CRITICAL: If the game tick is not running (server restarted), restart it
                if (!match.timer) {
                    console.log(`[TeamMatch] RESTART: Game tick not running, restarting for match ${matchId}`);
                    match.lastTickTime = Date.now();
                    match.timer = setInterval(() => tickTeamMatch(match, teamMatchNs), 1000);

                    // Also restart bot behavior if this is an AI match
                    const hasTeam1AI = Object.keys(match.team1.players).some(id => isAITeammate(id) || isAIBot(id));
                    const hasTeam2AI = Object.keys(match.team2.players).some(id => isAITeammate(id) || isAIBot(id)) || isAITeam(match.team2.teamId);

                    if ((match.isAIMatch || hasTeam1AI || hasTeam2AI) && !botIntervals.has(matchId)) {
                        console.log(`[TeamMatch] RESTART: Restarting bot behavior for match ${matchId}`);
                        startBotBehavior(match, teamMatchNs);
                    }
                }

                // Send match_start event so client knows we're in active phase
                socket.emit('match_start', {
                    round: match.round,
                    half: match.half,
                    currentSlot: team.currentSlot,
                    slotOperation: getSlotOperation(team.currentSlot, match.operation, team),
                    team1ActivePlayerId: getActivePlayer(match.team1, match.team1.currentSlot, match.round)?.odUserId || null,
                    team2ActivePlayerId: getActivePlayer(match.team2, match.team2.currentSlot, match.round)?.odUserId || null,
                    isCatchup: true, // Flag to indicate this is reconnection catchup
                });

                // If this player is currently active, send them their question
                if (player.isActive && player.currentQuestion) {
                    const slotOp = getSlotOperation(team.currentSlot, match.operation, team);
                    console.log(`[TeamMatch] Sending question catchup to active player ${player.odName}`);
                    socket.emit('new_question', {
                        question: player.currentQuestion,
                        questionNumber: team.questionsInSlot + 1,
                        totalQuestions: getMatchConfig(match.mode || '5v5').QUESTIONS_PER_SLOT,
                        slot: team.currentSlot,
                        operation: slotOp,
                        isCatchup: true, // Indicates this is reconnection, not a new question
                    });
                }

                // Restart question timer for this player if they're active
                if (player.isActive && player.currentQuestion && !isAIBot(player.odUserId) && !isAITeammate(player.odUserId)) {
                    // Calculate remaining time based on when question was generated
                    const elapsed = Date.now() - (player.questionStartTime || Date.now());
                    const remainingMs = Math.max(1000, TEAM_MATCH_CONFIG.QUESTION_TIME_LIMIT_MS - elapsed);

                    // Clear any existing timer and start new one with remaining time
                    if (player.questionTimer) {
                        clearTimeout(player.questionTimer);
                    }
                    player.questionTimer = setTimeout(() => {
                        handleQuestionTimeout(match, team, player, teamMatchNs);
                    }, remainingMs);

                    console.log(`[TeamMatch] Restarted question timer for ${player.odName} with ${remainingMs}ms remaining`);
                }
            }

            // If break phase, send break timer catchup
            if (match.phase === TEAM_MATCH_PHASES.BREAK) {
                const matchConfig = getMatchConfig(match.mode || '5v5');
                const breakDuration = match.breakDuration || matchConfig.BREAK_DURATION_MS;
                const elapsed = Date.now() - (match.breakStartTime || Date.now());
                const remainingMs = Math.max(0, breakDuration - elapsed);

                // Restart break timer if server restarted
                if (!match.breakTimer && remainingMs > 0) {
                    console.log(`[TeamMatch] RESTART: Break timer not running, restarting for match ${matchId}`);
                    match.breakTimer = setInterval(() => {
                        const elapsedNow = Date.now() - match.breakStartTime;
                        match.breakRemainingMs = Math.max(0, breakDuration - elapsedNow);

                        teamMatchNs.to(match.matchId).emit('break_time_update', {
                            matchId: match.matchId,
                            remainingMs: match.breakRemainingMs,
                        });

                        if (match.breakRemainingMs <= 0) {
                            clearInterval(match.breakTimer);
                            match.breakTimer = null;
                            startNextRound(match, teamMatchNs);
                        }
                    }, 1000);
                }

                console.log(`[TeamMatch] Sending break phase catchup to ${player.odName}: ${remainingMs}ms remaining`);
                socket.emit('break_start', {
                    matchId: match.matchId,
                    round: match.round,
                    half: match.half,
                    durationMs: remainingMs,
                    endsAt: Date.now() + remainingMs,
                    isCatchup: true,
                });
            }

            // If halftime phase, send halftime timer catchup
            if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                const matchConfig = getMatchConfig(match.mode || '5v5');
                const halftimeDuration = matchConfig.HALFTIME_DURATION_MS;
                const elapsed = Date.now() - (match.halftimeStartTime || Date.now());
                const remainingMs = Math.max(0, halftimeDuration - elapsed);

                // Restart halftime timer if server restarted
                if (!match.halftimeTimer && remainingMs > 0) {
                    console.log(`[TeamMatch] RESTART: Halftime timer not running, restarting for match ${matchId}`);
                    match.halftimeTimer = setInterval(() => {
                        const elapsedNow = Date.now() - match.halftimeStartTime;
                        match.breakRemainingMs = Math.max(0, halftimeDuration - elapsedNow);

                        teamMatchNs.to(match.matchId).emit('halftime_time_update', {
                            matchId: match.matchId,
                            remainingMs: match.breakRemainingMs,
                        });

                        if (match.breakRemainingMs <= 0) {
                            clearInterval(match.halftimeTimer);
                            match.halftimeTimer = null;
                            startSecondHalf(match, teamMatchNs);
                        }
                    }, 1000);
                }

                console.log(`[TeamMatch] Sending halftime phase catchup to ${player.odName}: ${remainingMs}ms remaining`);
                socket.emit('halftime', {
                    matchId: match.matchId,
                    durationMs: remainingMs,
                    half: 1,
                    team1Score: match.team1.score,
                    team2Score: match.team2.score,
                    isCatchup: true,
                });
            }

            // If round countdown phase, send countdown catchup
            if (match.phase === TEAM_MATCH_PHASES.ROUND_COUNTDOWN) {
                const matchConfig = getMatchConfig(match.mode || '5v5');
                const countdownDuration = matchConfig.ROUND_COUNTDOWN_MS || 5000;
                const elapsed = Date.now() - (match.roundCountdownStartTime || Date.now());
                const remainingMs = Math.max(0, countdownDuration - elapsed);

                // Restart round countdown timer if server restarted
                if (!match.roundCountdownTimer && remainingMs > 0) {
                    console.log(`[TeamMatch] RESTART: Round countdown timer not running, restarting for match ${matchId}`);
                    match.roundCountdownTimer = setInterval(() => {
                        const elapsedNow = Date.now() - match.roundCountdownStartTime;
                        const remainingNow = Math.max(0, countdownDuration - elapsedNow);
                        const secondsRemaining = Math.ceil(remainingNow / 1000);

                        teamMatchNs.to(match.matchId).emit('round_countdown_tick', {
                            round: match.round,
                            half: match.half,
                            remainingMs: remainingNow,
                            secondsRemaining: secondsRemaining,
                        });

                        if (remainingNow === 0) {
                            clearInterval(match.roundCountdownTimer);
                            match.roundCountdownTimer = null;

                            if (match.phase === TEAM_MATCH_PHASES.ROUND_COUNTDOWN) {
                                beginActivePhase(match, teamMatchNs);
                            }
                        }
                    }, 1000);
                }

                console.log(`[TeamMatch] Sending round countdown catchup to ${player.odName}: ${remainingMs}ms remaining`);
                socket.emit('round_countdown_start', {
                    matchId: match.matchId,
                    round: match.round,
                    half: match.half,
                    durationMs: remainingMs,
                    isCatchup: true,
                });
            }

            // Notify team about player joining
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('player_connected', {
                userId,
                playerName: player.odName,
            });
            
            // Check if all human players connected (AI bots and AI teammates don't need sockets)
            const allTeam1Connected = Object.values(match.team1.players).every(p => 
                p.odSocketId || isAIBot(p.odUserId) || isAITeammate(p.odUserId)
            );
            const allTeam2Connected = Object.values(match.team2.players).every(p => 
                p.odSocketId || isAIBot(p.odUserId) || isAITeammate(p.odUserId)
            );
            
            if (allTeam1Connected && allTeam2Connected && match.phase === TEAM_MATCH_PHASES.PRE_MATCH) {
                // Start 15-second versus countdown before strategy phase
                startPreMatchCountdown(match, teamMatchNs);
            }
        });
        
        // =================================================================
        // CREATE AI TEAM MATCH (For Testing)
        // =================================================================
        socket.on('create_ai_match', async (data) => {
            const { matchId, humanTeam, difficulty, operation, mode } = data;
            
            if (!matchId || !humanTeam) {
                socket.emit('error', { message: 'Invalid AI match data' });
                return;
            }
            
            // Determine mode from data or humanTeam
            const matchMode = mode || humanTeam.odMode || '5v5';
            console.log(`[TeamMatch] Creating AI match ${matchId} (${matchMode}) with difficulty: ${difficulty || 'medium'}`);
            
            // Generate AI team based on human team ELO (mode-aware)
            const targetElo = humanTeam.odElo || 500;
            const aiTeam = generateAITeam(matchId, targetElo, difficulty || 'medium', matchMode);
            
            // Create the match (with mode)
            const match = initTeamMatchState(matchId, humanTeam, aiTeam, operation || 'mixed', 'casual', matchMode);
            match.isAIMatch = true;
            match.aiDifficulty = difficulty || 'medium';
            match.hasAITeammates = humanTeam.hasAITeammates || false;
            
            // Mark AI opponent players as already "connected" (they don't use real sockets)
            for (const playerId of Object.keys(match.team2.players)) {
                if (isAIBot(playerId)) {
                    match.team2.players[playerId].odSocketId = 'ai_bot';
                    match.team2.players[playerId].isBot = true;
                    match.team2.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[difficulty || 'medium'];
                }
            }
            
            // Mark AI teammates as already "connected" (if any)
            for (const playerId of Object.keys(match.team1.players)) {
                if (isAITeammate(playerId)) {
                    match.team1.players[playerId].odSocketId = 'ai_teammate';
                    match.team1.players[playerId].isBot = true;
                    match.team1.players[playerId].isAITeammate = true;
                    match.team1.players[playerId].botConfig = BOT_DIFFICULTY_CONFIGS[difficulty || 'medium'];
                    console.log(`[TeamMatch] AI Teammate ${playerId} marked as connected`);
                }
            }
            
            // Save to both in-memory and Redis
            await saveTeamMatchState(matchId, match);
            
            const aiTeammateCount = Object.keys(match.team1.players).filter(id => isAITeammate(id)).length;
            console.log(`[TeamMatch] AI Match ${matchId} created: ${humanTeam.odTeamName || 'Team 1'} (${aiTeammateCount} AI teammates) vs ${aiTeam.odTeamName}`);
            
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
                        odEquippedBanner: m.odEquippedBanner || 'default',
                        odEquippedTitle: m.odEquippedTitle,
                        slot: m.odPreferredOperation,
                    })),
                },
            });
        });
        
        // =================================================================
        // IGL SLOT ASSIGNMENT DURING STRATEGY PHASE OR HALFTIME
        // =================================================================
        socket.on('update_slot_assignment', (data) => {
            const { matchId, userId, playerId, newSlot } = data;
            
            const match = activeTeamMatches.get(matchId);
            const allowedPhases = [TEAM_MATCH_PHASES.STRATEGY, TEAM_MATCH_PHASES.HALFTIME];
            if (!match || !allowedPhases.includes(match.phase)) {
                socket.emit('error', { message: 'Can only update slots during strategy phase or halftime' });
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
            
            let swapDetails = null;
            
            if (targetPlayer && targetPlayer.odUserId !== playerId) {
                // Swap slots
                const oldSlot = movingPlayer.slot;
                targetPlayer.slot = oldSlot;
                movingPlayer.slot = newSlot;
                
                // CRITICAL: Also update team.slotAssignments (the authoritative source for getActivePlayerForSlot)
                team.slotAssignments[oldSlot] = targetPlayer.odUserId;
                team.slotAssignments[newSlot] = movingPlayer.odUserId;
                
                swapDetails = {
                    type: 'swap',
                    player1Name: movingPlayer.odName,
                    player1OldSlot: oldSlot,
                    player1NewSlot: newSlot,
                    player2Name: targetPlayer.odName,
                    player2OldSlot: newSlot,
                    player2NewSlot: oldSlot,
                };
                
                console.log(`[TeamMatch] IGL ${userId} swapped ${movingPlayer.odName} (slot ${oldSlot}→${newSlot}) with ${targetPlayer.odName} (slot ${newSlot}→${oldSlot})`);
            } else {
                // Just move to empty slot
                const oldSlot = movingPlayer.slot;
                movingPlayer.slot = newSlot;
                
                // CRITICAL: Also update team.slotAssignments
                if (oldSlot) {
                    delete team.slotAssignments[oldSlot];
                }
                team.slotAssignments[newSlot] = movingPlayer.odUserId;
                
                swapDetails = {
                    type: 'move',
                    playerName: movingPlayer.odName,
                    oldSlot: oldSlot,
                    newSlot: newSlot,
                };
            }
            
            // Broadcast updated slot assignments to own team
            // Send the correct format: { operation: playerId } which is what team.slotAssignments contains
            console.log(`[TeamMatch] Broadcasting slot assignments:`, team.slotAssignments);
            teamMatchNs.to(`team:${matchId}:${team.teamId}`).emit('slot_assignments_updated', {
                slots: team.slotAssignments,
                teamId: team.teamId,
                swapDetails: swapDetails,
                phase: match.phase, // Include phase so client knows if this is halftime
            });
            
            // Also notify opponent team of the slot changes (so they see correct opponent display)
            const opponentTeam = team.teamId === match.team1.teamId ? match.team2 : match.team1;
            teamMatchNs.to(`team:${matchId}:${opponentTeam.teamId}`).emit('opponent_slots_updated', {
                slots: team.slotAssignments,
                teamId: team.teamId,
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
            
            // Check if we should start the match:
            // 1. Both teams have confirmed, OR
            // 2. This team confirmed AND the opponent team is entirely AI (no human IGL)
            const bothConfirmed = match.team1.slotsConfirmed && match.team2.slotsConfirmed;
            
            // Determine if opponent team is entirely AI (no human players)
            const opponentTeam = isTeam1 ? match.team2 : match.team1;
            const opponentHasHumans = Object.keys(opponentTeam.players).some(
                id => !id.startsWith('ai_teammate_') && !id.startsWith('ai_bot_')
            );
            const canSkipOpponentConfirm = !opponentHasHumans;
            
            console.log(`[TeamMatch] Strategy confirm check: bothConfirmed=${bothConfirmed}, opponentHasHumans=${opponentHasHumans}, canSkipOpponentConfirm=${canSkipOpponentConfirm}`);
            
            if (bothConfirmed || canSkipOpponentConfirm) {
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
        // READY FOR NEXT ROUND (Skip break/halftime early)
        // =================================================================
        socket.on('ready_for_next', (data) => {
            const { matchId, userId } = data;

            const match = activeTeamMatches.get(matchId);
            if (!match) return;

            // Only allow during break or halftime phases
            const allowedPhases = [TEAM_MATCH_PHASES.BREAK, TEAM_MATCH_PHASES.HALFTIME];
            if (!allowedPhases.includes(match.phase)) {
                socket.emit('error', { message: 'Can only ready up during break or halftime' });
                return;
            }

            // Find which team the user is on and verify they are IGL
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;

            if (team.iglId !== userId) {
                socket.emit('error', { message: 'Only IGL can ready up for next round' });
                return;
            }

            // Mark this team as ready
            team.readyForNext = true;

            console.log(`[TeamMatch] Team ${team.teamId} ready for next (phase: ${match.phase})`);

            // Check if we should skip to next round:
            // 1. Both teams are ready, OR
            // 2. This team is ready AND the opponent team is entirely AI (no human IGL)
            const bothReady = match.team1.readyForNext && match.team2.readyForNext;
            
            // Determine if opponent team is entirely AI (no human players)
            const opponentTeam = isTeam1 ? match.team2 : match.team1;
            const opponentHasHumans = Object.keys(opponentTeam.players).some(
                id => !id.startsWith('ai_teammate_') && !id.startsWith('ai_bot_')
            );
            const canSkipOpponentReady = !opponentHasHumans;
            
            console.log(`[TeamMatch] Ready check: bothReady=${bothReady}, opponentHasHumans=${opponentHasHumans}, canSkipOpponentReady=${canSkipOpponentReady}`);

            if (bothReady || canSkipOpponentReady) {
                // Clear the appropriate timer
                if (match.phase === TEAM_MATCH_PHASES.BREAK && match.breakTimer) {
                    clearInterval(match.breakTimer);
                    match.breakTimer = null;
                }
                if (match.phase === TEAM_MATCH_PHASES.HALFTIME && match.halftimeTimer) {
                    clearInterval(match.halftimeTimer);
                    match.halftimeTimer = null;
                }

                console.log(`[TeamMatch] Both teams ready, skipping to next round`);

                // For halftime, reset round and clock
                if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    match.round = 0;
                    match.gameClockMs = TEAM_MATCH_CONFIG.HALF_DURATION_MS;
                }

                startNextRound(match, teamMatchNs);
            } else {
                // Notify the other team that this team is ready
                teamMatchNs.to(match.matchId).emit('team_ready_for_next', {
                    teamId: team.teamId,
                    phase: match.phase,
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
            
            
            console.log(`[TeamMatch] anchor_callin received:`, { matchId, userId, targetSlot, half });
            
            const match = activeTeamMatches.get(matchId);
            if (!match) {
                socket.emit('error', { message: 'Match not found' });
                return;
            }
            
            // Double Call-In is NOT available in 2v2 mode (per spec)
            const matchConfig = getMatchConfig(match.mode || '5v5');
            if (!matchConfig.DOUBLE_CALLIN_ENABLED) {
                socket.emit('error', { message: 'Double Call-In is not available in 2v2 mode' });
                return;
            }
            
            // Can use during break phase, halftime, strategy phase, active phase, or round countdown
            // During active phase or round_countdown: applies to the NEXT round
            const validPhases = [
                TEAM_MATCH_PHASES.BREAK, 
                TEAM_MATCH_PHASES.HALFTIME, 
                TEAM_MATCH_PHASES.STRATEGY,
                TEAM_MATCH_PHASES.ACTIVE,
                TEAM_MATCH_PHASES.ROUND_COUNTDOWN,
            ];
            if (!validPhases.includes(match.phase)) {
                socket.emit('error', { message: 'Cannot use Double Call-In in current phase' });
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
            
            // Determine which round the Double Call-In applies to FIRST (before activation)
            // - During STRATEGY phase: applies to Round 1 (the round about to start)
            // - During HALFTIME phase: applies to Round 1 of 2nd half (rounds reset)
            // - During BREAK phase: applies to the next round (match.round + 1)
            // - During ACTIVE/ROUND_COUNTDOWN phase: applies to the next round (match.round + 1)
            let targetRound;
            if (match.phase === TEAM_MATCH_PHASES.STRATEGY) {
                targetRound = 1; // First round of match
            } else if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                targetRound = 1; // First round of 2nd half (rounds reset at halftime)
            } else {
                targetRound = match.round + 1; // Next round in current half
            }
            
            // Activate Double Call-In
            team.doubleCallinActive = true;
            team.doubleCallinSlot = slotOp;
            team.doubleCallinBenchedId = benchedPlayerId;
            team.doubleCallinForRound = targetRound; // Track which round this applies to
            
            // Mark as used for this half
            if (match.half === 1) {
                team.usedDoubleCallinHalf1 = true;
            } else {
                team.usedDoubleCallinHalf2 = true;
            }
            
            
            console.log(`[TeamMatch] Double Call-In ACTIVATED:`);
            console.log(`  - Anchor: ${anchorPlayer.odName} will play ${slotOp} slot`);
            console.log(`  - Benched: ${benchedPlayer.odName} sits out Round ${targetRound}`);
            console.log(`  - Half: ${match.half}, Round: ${targetRound}, Phase: ${match.phase}`);
            
            // Use the already calculated targetRound for the broadcast
            const forRound = targetRound;
            
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

        // =================================================================
        // ANCHOR SOLO DECISION (Final Round Solo)
        // IGL chooses between NORMAL relay or ANCHOR SOLO for final round
        // Available: 2nd Half, between Round 3 and Round 4
        // =================================================================
        socket.on('anchor_solo_decision', (data) => {
            const { matchId, userId, decision } = data; // decision: 'solo' | 'normal'

            console.log(`[TeamMatch] anchor_solo_decision received:`, { matchId, userId, decision });

            const match = activeTeamMatches.get(matchId);
            if (!match) {
                socket.emit('error', { message: 'Match not found' });
                return;
            }

            // Can only decide during SOLO_DECISION phase
            if (match.phase !== TEAM_MATCH_PHASES.SOLO_DECISION) {
                socket.emit('error', { message: 'Can only make solo decision during solo decision phase' });
                return;
            }

            // Validate decision
            if (decision !== 'solo' && decision !== 'normal') {
                socket.emit('error', { message: 'Invalid decision. Must be "solo" or "normal"' });
                return;
            }

            // Find team and verify IGL
            const isTeam1 = Object.keys(match.team1.players).includes(userId);
            const team = isTeam1 ? match.team1 : match.team2;

            if (team.iglId !== userId) {
                socket.emit('error', { message: 'Only IGL can make solo decision' });
                return;
            }

            // Check if already decided
            if (team.anchorSoloDecision !== null) {
                socket.emit('error', { message: 'Solo decision already made' });
                return;
            }

            // Record the decision
            team.anchorSoloDecision = decision;
            if (decision === 'solo') {
                team.anchorSoloActive = true;
                team.usedAnchorSolo = true;
            }

            const anchor = team.players[team.anchorId];
            console.log(`[TeamMatch] Anchor Solo decision by ${team.teamName}: ${decision.toUpperCase()}`);

            // Notify all players of the decision
            teamMatchNs.to(matchId).emit('solo_decision_made', {
                teamId: team.teamId,
                teamName: team.teamName,
                decision,
                anchorId: team.anchorId,
                anchorName: anchor?.odName || 'Unknown',
            });

            // Check if both teams have decided
            const otherTeam = isTeam1 ? match.team2 : match.team1;
            const bothDecided = team.anchorSoloDecision !== null && otherTeam.anchorSoloDecision !== null;

            if (bothDecided) {
                // Clear the decision timer if it exists
                if (match.soloDecisionTimer) {
                    clearTimeout(match.soloDecisionTimer);
                    match.soloDecisionTimer = null;
                }

                // Reveal both decisions and proceed to final round
                revealSoloDecisionsAndStartFinalRound(match, teamMatchNs);
            }
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

            // Clear the question timeout timer since they answered
            clearQuestionTimer(player);

            const answerTimeMs = Date.now() - player.questionStartTime;
            const isCorrect = parseInt(answer) === player.currentQuestion.answer;
            
            
            player.total++;
            player.totalAnswerTimeMs += answerTimeMs;
            
            let pointsEarned = 0;
            let speedBonus = 0;
            let streakMilestoneBonus = 0;
            
            if (isCorrect) {
                player.correct++;
                player.streak++;
                player.maxStreak = Math.max(player.maxStreak, player.streak);
                
                // Track team streak (cumulative across all players, resets on any wrong/timeout)
                const previousTeamStreak = team.currentStreak || 0;
                team.currentStreak = (team.currentStreak || 0) + 1;
                
                // Calculate points: base + speed bonus
                const basePoints = SCORING_CONFIG.POINTS_PER_CORRECT;
                speedBonus = calculateSpeedBonus(answerTimeMs);
                pointsEarned = basePoints + speedBonus;
                
                // Check for team streak milestones (one-time bonuses)
                streakMilestoneBonus = checkStreakMilestone(previousTeamStreak, team.currentStreak);
                pointsEarned += streakMilestoneBonus;
                
                player.score += pointsEarned;
                team.score += pointsEarned;
                
                // Apply score floor
                player.score = applyScoreFloor(player.score);
                team.score = applyScoreFloor(team.score);
            } else {
                player.streak = 0;
                team.currentStreak = 0; // Team streak resets on any wrong answer
                
                // Apply penalty for incorrect answer
                pointsEarned = SCORING_CONFIG.POINTS_PER_INCORRECT;
                player.score += pointsEarned;
                team.score += pointsEarned;
                
                // Apply score floor (no negative scores)
                player.score = applyScoreFloor(player.score);
                team.score = applyScoreFloor(team.score);
            }
            
            // Emit result to both teams (no question details for opponent)
            teamMatchNs.to(matchId).emit('answer_result', {
                teamId: team.teamId,
                userId,
                isCorrect,
                pointsEarned,
                speedBonus,
                streakMilestoneBonus,
                teamStreak: team.currentStreak,
                newStreak: player.streak,
                newTeamScore: team.score,
                newPlayerScore: player.score,
                questionsInSlot: team.questionsInSlot + 1, // Use team-specific counter
                answerTimeMs, // For avg speed calculation in halftime stats
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
            
            
            // Use mode-specific config for questions per slot
            const matchConfig = getMatchConfig(match.mode || '5v5');
            if (team.questionsInSlot >= matchConfig.QUESTIONS_PER_SLOT) {
                // This team's slot complete - advance their slot
                advanceTeamToNextSlot(match, team, teamMatchNs);
            } else {
                // Generate next question for this player
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
            
            // Can call timeout during active phase, breaks, or halftime
            const allowedPhases = [
                TEAM_MATCH_PHASES.ACTIVE, 
                TEAM_MATCH_PHASES.BREAK, 
                TEAM_MATCH_PHASES.HALFTIME,
                TEAM_MATCH_PHASES.ROUND_COUNTDOWN,
            ];
            
            if (!allowedPhases.includes(match.phase)) {
                socket.emit('error', { message: 'Cannot call timeout in current phase' });
                return;
            }
            
            team.timeoutsUsed++;
            
            const now = Date.now();
            
            // If during active or round_countdown phase, queue the timeout to extend the NEXT break
            if (match.phase === TEAM_MATCH_PHASES.ACTIVE || match.phase === TEAM_MATCH_PHASES.ROUND_COUNTDOWN) {
                // Store pending timeout extension for the next break
                if (!team.pendingTimeoutExtension) {
                    team.pendingTimeoutExtension = 0;
                }
                team.pendingTimeoutExtension += TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS;
                
                console.log(`[TeamMatch] Timeout queued during active phase. Will extend next break by ${TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS}ms`);
                
                // Notify clients about the queued timeout
                teamMatchNs.to(matchId).emit('timeout_called', {
                    teamId: team.teamId,
                    teamName: team.teamName,
                    timeoutsRemaining: TEAM_MATCH_CONFIG.TIMEOUTS_PER_TEAM - team.timeoutsUsed,
                    extensionMs: TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS,
                    queuedForNextBreak: true,
                    targetBreak: match.round < 4 ? `Round ${match.round + 1}` : 'Halftime',
                });
                
                return;
            }
            
            // If during break or halftime, extend current break immediately
            const remainingMs = match.breakEndTime ? Math.max(0, match.breakEndTime - now) : 0;
            const newDurationMs = remainingMs + TEAM_MATCH_CONFIG.TIMEOUT_DURATION_MS;
            
            
            // Clear existing break timeout and create new one with extended duration
            if (match.breakTimeout) {
                clearTimeout(match.breakTimeout);
                console.log(`[TeamMatch] Cleared existing break timeout`);
            }
            
            // IMPORTANT: Clear the break timer interval if calling timeout during break
            // The breakTimer is an interval that runs every second - we need to stop it
            // and manage the countdown manually with the new extended breakTimeout
            if (match.phase === TEAM_MATCH_PHASES.BREAK && match.breakTimer) {
                clearInterval(match.breakTimer);
                match.breakTimer = null;
                console.log(`[TeamMatch] Cleared existing break timer for timeout extension`);
            }
            
            // Also clear the halftime timer interval if calling timeout during halftime
            if (match.phase === TEAM_MATCH_PHASES.HALFTIME && match.halftimeTimer) {
                clearInterval(match.halftimeTimer);
                match.halftimeTimer = null;
                console.log(`[TeamMatch] Cleared existing halftime timer for timeout extension`);
            }
            
            match.breakEndTime = now + newDurationMs;
            match.breakRemainingMs = newDurationMs;
            
            // Store the phase at time of timeout for the callback
            const phaseAtTimeout = match.phase;
            
            match.breakTimeout = setTimeout(() => {
                
                // Clear the countdown interval
                if (match.timeoutCountdownInterval) {
                    clearInterval(match.timeoutCountdownInterval);
                    match.timeoutCountdownInterval = null;
                }
                
                if (match.phase === TEAM_MATCH_PHASES.BREAK) {
                    startNextRound(match, teamMatchNs);
                } else if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    // For halftime, resume after extension
                    match.round = 0;
                    match.gameClockMs = TEAM_MATCH_CONFIG.HALF_DURATION_MS;
                    startNextRound(match, teamMatchNs);
                }
            }, newDurationMs);
            
            // Start an interval to emit countdown updates every second
            // This is especially important for halftime since we cleared the halftimeTimer
            if (match.timeoutCountdownInterval) {
                clearInterval(match.timeoutCountdownInterval);
            }
            const countdownStartTime = now;
            match.timeoutCountdownInterval = setInterval(() => {
                const elapsed = Date.now() - countdownStartTime;
                match.breakRemainingMs = Math.max(0, newDurationMs - elapsed);
                
                // Emit the appropriate event based on the phase
                if (phaseAtTimeout === TEAM_MATCH_PHASES.HALFTIME) {
                    teamMatchNs.to(matchId).emit('halftime_time_update', {
                        remainingMs: match.breakRemainingMs,
                    });
                } else {
                    teamMatchNs.to(matchId).emit('break_time_update', {
                        remainingMs: match.breakRemainingMs,
                    });
                }
                
                // Stop when time expires (the setTimeout will handle the actual transition)
                if (match.breakRemainingMs === 0) {
                    clearInterval(match.timeoutCountdownInterval);
                    match.timeoutCountdownInterval = null;
                }
            }, 1000);
            
            
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
            
            // Double Call-In is NOT available in 2v2 mode (per spec)
            const matchConfig = getMatchConfig(match.mode || '5v5');
            if (!matchConfig.DOUBLE_CALLIN_ENABLED) {
                socket.emit('error', { message: 'Double Call-In is not available in 2v2 mode' });
                return;
            }
            
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
        
        // Initiate a quit vote (party leader only, or instant leave for solo human with AI teammates)
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
            const opponentTeam = match.team1.teamId === teamId ? match.team2 : match.team1;
            
            // Verify user is the party leader
            if (team.leaderId !== userId) {
                socket.emit('error', { message: 'Only the party leader can initiate a quit vote' });
                return;
            }
            
            // Check if this is a solo human player with AI teammates
            // Count human players on the team (not AI teammates)
            const humanPlayers = Object.keys(team.players).filter(playerId => !isAITeammate(playerId));
            const isSoloHumanWithAI = humanPlayers.length === 1 && humanPlayers[0] === userId;
            
            if (isSoloHumanWithAI) {
                // Solo human with AI teammates can leave immediately without a vote
                console.log(`[TeamMatch] Solo human ${team.players[userId]?.odName} leaving match ${matchId} immediately (no vote needed with AI teammates)`);
                
                // Mark match as forfeited
                if (match.phase !== 'post_match') {
                    match.phase = 'post_match';
                    match.forfeitedBy = teamId;
                    
                    // Notify both teams
                    teamMatchNs.to(matchId).emit('team_forfeit', {
                        forfeitingTeamId: teamId,
                        forfeitingTeamName: team.teamName,
                        winningTeamId: opponentTeam.teamId,
                        winningTeamName: opponentTeam.teamName,
                        instantLeave: true, // Flag to indicate no vote was needed
                    });
                    
                    console.log(`[TeamMatch] Team ${team.teamName} forfeited match ${matchId} (solo human left)`);
                    
                    // End the match after a short delay
                    setTimeout(() => {
                        endTeamMatch(match, teamMatchNs);
                    }, 2000); // Shorter delay for instant leave
                }
                
                return; // Don't proceed with vote flow
            }
            
            // Check if there's already an active vote for this team
            const voteKey = `${matchId}:${teamId}`;
            if (global.activeQuitVotes.has(voteKey)) {
                socket.emit('error', { message: 'A quit vote is already in progress' });
                return;
            }
            
            // Initialize vote (only for human players)
            const votes = {};
            for (const playerId of Object.keys(team.players)) {
                // Only human players vote - AI teammates auto-approve
                if (!isAITeammate(playerId)) {
                    votes[playerId] = null; // null = hasn't voted
                }
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
            
            console.log(`[TeamMatch] Quit vote started by ${voteData.initiatorName} in match ${matchId} (${humanPlayers.length} human players)`);
            
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
        socket.on('disconnect', async () => {
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
            // Also remove from Redis
            await arenaRedis.removeSocketMapping(socket.id);
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
                odEquippedBanner: player.odEquippedBanner || 'default',
                odEquippedTitle: player.odEquippedTitle || 'Player',
                slot: player.slot,
                score: player.score,
                correct: player.correct,
                total: player.total,
                streak: player.streak,
                maxStreak: player.maxStreak,
                totalAnswerTimeMs: player.totalAnswerTimeMs || 0, // For avg speed calculation in halftime stats
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
     * Start the PRE_MATCH countdown (15 seconds to view teams before strategy)
     */
    function startPreMatchCountdown(match, ns) {
        if (match.preMatchCountdownStarted) return; // Prevent double-start
        match.preMatchCountdownStarted = true;
        
        // Use mode-specific config for pre-match duration
        const preMatchConfig = getMatchConfig(match.mode || '5v5');
        const durationMs = preMatchConfig.PRE_MATCH_DURATION_MS;
        match.preMatchStartTime = Date.now();
        match.relayClockMs = durationMs;
        
        console.log(`[TeamMatch] Match ${match.matchId} all players connected - starting ${durationMs / 1000}s versus countdown`);
        
        // Emit pre-match countdown started to all players
        ns.to(match.matchId).emit('pre_match_countdown_start', {
            matchId: match.matchId,
            durationMs,
            endsAt: Date.now() + durationMs,
        });
        
        // Update countdown every second
        match.preMatchTimer = setInterval(() => {
            const elapsed = Date.now() - match.preMatchStartTime;
            match.relayClockMs = Math.max(0, durationMs - elapsed);
            
            // Emit countdown update every second
            ns.to(match.matchId).emit('pre_match_countdown_tick', {
                remainingMs: match.relayClockMs,
            });
            
            // When countdown ends, transition to strategy phase
            if (match.relayClockMs === 0) {
                clearInterval(match.preMatchTimer);
                match.preMatchTimer = null;
                startStrategyPhase(match, ns);
            }
        }, 1000);
    }
    
    /**
     * Start the STRATEGY phase where IGL assigns slots before match starts
     */
    function startStrategyPhase(match, ns) {
        // Use mode-specific config for strategy phase duration
        const strategyConfig = getMatchConfig(match.mode || '5v5');
        
        match.phase = TEAM_MATCH_PHASES.STRATEGY;
        match.strategyStartTime = Date.now();
        match.strategyTimeRemainingMs = strategyConfig.STRATEGY_DURATION_MS;
        
        const team1Slots = getTeamSlotAssignments(match.team1);
        const team2Slots = getTeamSlotAssignments(match.team2);
        
        console.log(`[TeamMatch] Match ${match.matchId} (${match.mode || '5v5'}) entering STRATEGY phase (${strategyConfig.STRATEGY_DURATION_MS / 1000}s)`);
        console.log(`[TeamMatch] Team1 slots:`, JSON.stringify(team1Slots));
        console.log(`[TeamMatch] Team2 slots:`, JSON.stringify(team2Slots));
        
        // Emit strategy phase started to all players
        ns.to(match.matchId).emit('strategy_phase_start', {
            matchId: match.matchId,
            durationMs: strategyConfig.STRATEGY_DURATION_MS,
            team1Slots,
            team2Slots,
            team1IglId: match.team1.iglId,
            team2IglId: match.team2.iglId,
            mode: match.mode || '5v5',                // Include match mode
            slotOperations: match.slotOperations,     // Include slot operations for UI
        });
        
        // Start countdown timer for strategy phase - emit every second for smooth countdown
        match.strategyTimer = setInterval(() => {
            const elapsed = Date.now() - match.strategyStartTime;
            match.strategyTimeRemainingMs = Math.max(0, strategyConfig.STRATEGY_DURATION_MS - elapsed);
            
            // Emit time remaining every second
            ns.to(match.matchId).emit('strategy_time_update', {
                remainingMs: match.strategyTimeRemainingMs,
            });
            
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
     * Includes cosmetic data for banner display
     */
    function getTeamSlotAssignments(team) {
        const slots = {};
        for (const [playerId, player] of Object.entries(team.players)) {
            slots[playerId] = {
                slot: player.slot,
                name: player.odName,
                level: player.odLevel || 1,
                isIgl: player.isIgl,
                isAnchor: player.isAnchor,
                // Cosmetics for banner display
                banner: player.odEquippedBanner || 'default',
                frame: player.odEquippedFrame || 'default',
                title: player.odEquippedTitle || 'Player',
            };
        }
        return slots;
    }
    
    /**
     * Start a team match
     */
    function startTeamMatch(match, ns) {
        // Start with ROUND_COUNTDOWN phase (5-4-3-2-1-GO) before activating
        match.phase = TEAM_MATCH_PHASES.ROUND_COUNTDOWN;
        match.startTime = Date.now();
        match.roundCountdownStartTime = Date.now();
        match.lastTickTime = Date.now();
        
        // CRITICAL: Reset per-team slot state at match start (same as startNextRound)
        // This ensures both teams start at slot 1, regardless of what happened during strategy phase
        match.currentSlot = 1;
        match.questionsInSlot = 0;
        for (const team of [match.team1, match.team2]) {
            team.currentSlot = 1;
            team.questionsInSlot = 0;
            for (const player of Object.values(team.players)) {
                player.isActive = false;
                player.isComplete = false;
            }
        }

        console.log(`[TeamMatch] Match ${match.matchId} entering round countdown phase`);
        
        // Emit round_countdown event so clients show the 5-4-3-2-1-GO countdown
        const countdownDuration = TEAM_MATCH_CONFIG.ROUND_COUNTDOWN_MS;
        ns.to(match.matchId).emit('round_countdown', {
            round: match.round,
            half: match.half,
            countdownMs: countdownDuration,
            team1Name: match.team1.teamName,
            team2Name: match.team2.teamName,
            isFirstRound: true, // Indicates this is the initial match start
        });
        
        // Start round countdown interval to emit tick updates every second
        if (match.roundCountdownTimer) clearInterval(match.roundCountdownTimer);
        match.roundCountdownStartTime = Date.now();
        match.roundCountdownTimer = setInterval(() => {
            const elapsed = Date.now() - match.roundCountdownStartTime;
            const remainingMs = Math.max(0, countdownDuration - elapsed);
            const secondsRemaining = Math.ceil(remainingMs / 1000);
            
            // Emit countdown tick (5, 4, 3, 2, 1, GO!)
            ns.to(match.matchId).emit('round_countdown_tick', {
                round: match.round,
                half: match.half,
                remainingMs: remainingMs,
                secondsRemaining: secondsRemaining,
                displayText: secondsRemaining > 0 ? String(secondsRemaining) : 'GO!',
            });
            
            // When countdown reaches 0, transition to active phase
            if (remainingMs === 0) {
                clearInterval(match.roundCountdownTimer);
                match.roundCountdownTimer = null;
                
                if (match.phase !== TEAM_MATCH_PHASES.ROUND_COUNTDOWN) {
                    console.log(`[TeamMatch] Phase changed during countdown, aborting active transition`);
                    return;
                }
                
                // Now enter active phase
                match.phase = TEAM_MATCH_PHASES.ACTIVE;
                match.roundStartTime = Date.now();
            
            // Set first players as active and generate their questions
            let slot1Op = getSlotOperation(1, match.operation, match.team1);
            
            for (const team of [match.team1, match.team2]) {
                const teamSlot1Op = getSlotOperation(1, match.operation, team);
                const activePlayer = getActivePlayer(team, 1, match.round);
                if (activePlayer) {
                    activePlayer.isActive = true;
                    activePlayer.currentQuestion = generateTeamQuestion(teamSlot1Op);
                    activePlayer.questionStartTime = Date.now();
                }
            }
            
            // Get active player IDs for both teams
            const team1ActivePlayer = getActivePlayer(match.team1, 1, match.round);
            const team2ActivePlayer = getActivePlayer(match.team2, 1, match.round);
            
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
                                mode: match.mode || '5v5',                // Include match mode
                                slotOperations: match.slotOperations,     // Include slot operations for UI
                            });
                        }
                    }
                }
            }
            
            // Also send question_update for convenience (some UI elements listen for this)
            // AND start question timeout timers for human players
            for (const team of [match.team1, match.team2]) {
                const activePlayer = getActivePlayer(team, 1, match.round);
                if (activePlayer) {
                    // Reset timeout counter for new round
                    activePlayer.timeoutsInSlot = 0;
                    
                    ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                        questionId: Date.now().toString(),
                        questionText: activePlayer.currentQuestion.question,
                        operation: getSlotOperation(1, match.operation, team),
                        activePlayerId: activePlayer.odUserId,
                        slotNumber: team.currentSlot,
                        questionInSlot: 1,
                    });
                    
                    // Start question timeout timer for human players
                    startQuestionTimer(match, team, activePlayer, ns);
                }
            }
            
            // Start the game clock
            match.timer = setInterval(() => tickTeamMatch(match, ns), 1000);
            
            
            // Start AI bot behavior if this match has any AI players (opponents or teammates)
            const hasTeam1AI = Object.keys(match.team1.players).some(id => isAITeammate(id) || isAIBot(id));
            const hasTeam2AI = Object.keys(match.team2.players).some(id => isAITeammate(id) || isAIBot(id)) || isAITeam(match.team2.teamId);
            
            if (match.isAIMatch || hasTeam1AI || hasTeam2AI) {
                console.log(`[TeamMatch] Starting bot behavior - isAIMatch=${match.isAIMatch}, hasTeam1AI=${hasTeam1AI}, hasTeam2AI=${hasTeam2AI}`);
                startBotBehavior(match, ns);
            }
            
            console.log(`[TeamMatch] Match ${match.matchId} active phase started${(match.isAIMatch || hasTeam1AI || hasTeam2AI) ? ' (with AI players)' : ''}`);
            }
        }, 1000);
    }
    
    /**
     * Start AI bot behavior loops for the match
     * Handles both AI opponents (team2) and AI teammates (team1)
     */
    function startBotBehavior(match, ns) {
        const matchId = match.matchId;
        const intervals = [];
        
        // Collect teams that have any AI players
        const teamsWithBots = [];
        
        // Check team2 - either full AI team OR has AI teammates (PvP casual)
        const team2IsAITeam = isAITeam(match.team2.teamId);
        const team2HasAITeammates = Object.keys(match.team2.players).some(id => isAITeammate(id));
        if (team2IsAITeam || team2HasAITeammates) {
            teamsWithBots.push({ team: match.team2, type: team2IsAITeam ? 'opponent' : 'teammate' });
            console.log(`[TeamMatch] Team2 has AI: isAITeam=${team2IsAITeam}, hasAITeammates=${team2HasAITeammates}`);
        }
        
        // Check team1 for AI teammates
        const team1HasAITeammates = Object.keys(match.team1.players).some(id => isAITeammate(id));
        if (team1HasAITeammates) {
            teamsWithBots.push({ team: match.team1, type: 'teammate' });
            console.log(`[TeamMatch] Team1 has AI teammates`);
        }
        
        if (teamsWithBots.length === 0) {
            console.log(`[TeamMatch] No bot players found for match ${matchId}`);
            return;
        }
        
        console.log(`[TeamMatch] Starting bot behavior for ${teamsWithBots.length} team(s) with AI players`);
        
        // Create bot loops for each team with AI players
        for (const { team, type } of teamsWithBots) {
            const botLoop = setInterval(() => {
                if (match.phase !== TEAM_MATCH_PHASES.ACTIVE) {
                    return; // Only answer during active phase
                }
                
                // Use mode-specific config for slots per round
                const matchConfig = getMatchConfig(match.mode || '5v5');
                
                // Skip if this team has already completed all slots for the round
                if (team.currentSlot > matchConfig.SLOTS_PER_ROUND) {
                    return; // Team is waiting for other team to finish
                }
                
                // Find the active player for THIS TEAM's current slot
                const activePlayer = getActivePlayer(team, team.currentSlot, match.round);
                if (!activePlayer) {
                    return; // No active player
                }
                
                // Check if this player is an AI (bot opponent or AI teammate)
                const isBot = isAIBot(activePlayer.odUserId);
                const isTeammate = isAITeammate(activePlayer.odUserId);
                if (!isBot && !isTeammate) {
                    return; // Current slot player is a human
                }
                
                if (!activePlayer.isActive || !activePlayer.currentQuestion) {
                    return; // AI not active or no question
                }
                
                // Check if enough time has passed since question was shown
                const config = activePlayer.botConfig || BOT_DIFFICULTY_CONFIGS.medium;
                const [minTime, maxTime] = config.answerTimeRange;
                const targetAnswerTime = minTime + Math.random() * (maxTime - minTime);
                const elapsed = Date.now() - activePlayer.questionStartTime;
                
                if (elapsed < targetAnswerTime) {
                    return; // Not time to answer yet
                }
                
                // AI answers the question
                const isCorrect = Math.random() < config.accuracy;
                const answer = isCorrect ? 
                    activePlayer.currentQuestion.answer : 
                    activePlayer.currentQuestion.answer + (Math.random() > 0.5 ? 1 : -1);
                
                // Process AI answer (similar to human answer handling)
                processBotAnswer(match, team, activePlayer, answer, isCorrect, ns);
                
            }, 500); // Check every 500ms
            
            intervals.push(botLoop);
            console.log(`[TeamMatch] Bot loop started for ${type} team: ${team.teamName}`);
        }
        
        botIntervals.set(matchId, intervals);
    }
    
    /**
     * Process a bot's answer (uses same scoring system as humans)
     */
    function processBotAnswer(match, team, player, answer, isCorrect, ns) {

        const answerTimeMs = Date.now() - player.questionStartTime;

        player.total++;
        player.totalAnswerTimeMs += answerTimeMs;

        let pointsEarned = 0;
        let speedBonus = 0;
        let streakMilestoneBonus = 0;

        if (isCorrect) {
            player.correct++;
            player.streak++;
            player.maxStreak = Math.max(player.maxStreak, player.streak);
            
            // Track team streak
            const previousTeamStreak = team.currentStreak || 0;
            team.currentStreak = (team.currentStreak || 0) + 1;

            // Calculate points: base + speed bonus
            const basePoints = SCORING_CONFIG.POINTS_PER_CORRECT;
            speedBonus = calculateSpeedBonus(answerTimeMs);
            pointsEarned = basePoints + speedBonus;
            
            // Check for team streak milestones
            streakMilestoneBonus = checkStreakMilestone(previousTeamStreak, team.currentStreak);
            pointsEarned += streakMilestoneBonus;

            player.score += pointsEarned;
            team.score += pointsEarned;
            
            // Apply score floor
            player.score = applyScoreFloor(player.score);
            team.score = applyScoreFloor(team.score);
        } else {
            player.streak = 0;
            team.currentStreak = 0;
            
            // Apply penalty for incorrect answer
            pointsEarned = SCORING_CONFIG.POINTS_PER_INCORRECT;
            player.score += pointsEarned;
            team.score += pointsEarned;
            
            // Apply score floor
            player.score = applyScoreFloor(player.score);
            team.score = applyScoreFloor(team.score);
        }

        // Emit result to all (humans see bot team progress)
        ns.to(match.matchId).emit('answer_result', {
            teamId: team.teamId,
            userId: player.odUserId,
            isCorrect,
            pointsEarned,
            speedBonus,
            streakMilestoneBonus,
            teamStreak: team.currentStreak,
            newStreak: player.streak,
            newTeamScore: team.score,
            newPlayerScore: player.score,
            questionsInSlot: team.questionsInSlot + 1, // Use team-specific counter
            answerTimeMs, // For avg speed calculation in halftime stats
            isBot: true,
        });
        
        // Advance questions (per-team)
        team.questionsInSlot++;
        
        // Use mode-specific config for questions per slot
        const matchConfig = getMatchConfig(match.mode || '5v5');
        if (team.questionsInSlot >= matchConfig.QUESTIONS_PER_SLOT) {
            advanceTeamToNextSlot(match, team, ns);
        } else {
            // Generate next question for bot
            const slotOp = getSlotOperation(team.currentSlot, match.operation, team);
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
        
        // Ensure roundScores array exists (safety check for matches that may have been restored)
        if (!match.roundScores) {
            match.roundScores = [];
        }
        
        // Store current round scores if in progress
        match.roundScores.push({
            round: match.round,
            team1: match.team1.score,
            team2: match.team2.score,
        });
        
        // Deactivate all players and clear question timers
        for (const team of [match.team1, match.team2]) {
            for (const player of Object.values(team.players)) {
                player.isActive = false;
                clearQuestionTimer(player);
            }
        }

        // Use mode-specific config for halftime duration
        const halfConfig = getMatchConfig(match.mode || '5v5');
        
        if (match.half === 1) {
            // End of first half - go to halftime
            match.phase = TEAM_MATCH_PHASES.HALFTIME;
            match.half = 2;
            
            // Calculate halftime duration, including any pending timeout extensions
            let halftimeDuration = halfConfig.HALFTIME_DURATION_MS;
            let appliedExtensions = [];
            
            for (const team of [match.team1, match.team2]) {
                if (team.pendingTimeoutExtension && team.pendingTimeoutExtension > 0) {
                    halftimeDuration += team.pendingTimeoutExtension;
                    appliedExtensions.push({
                        teamName: team.teamName,
                        extensionMs: team.pendingTimeoutExtension,
                    });
                    console.log(`[TeamMatch] Applied pending timeout extension of ${team.pendingTimeoutExtension}ms from ${team.teamName} to halftime`);
                    team.pendingTimeoutExtension = 0; // Clear after applying
                }
            }
            
            ns.to(match.matchId).emit('halftime', {
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                roundScores: match.roundScores,
                halftimeDurationMs: halftimeDuration,
                appliedTimeoutExtensions: appliedExtensions,
            });
            
            // Store halftime end time for potential extension
            match.breakEndTime = Date.now() + halftimeDuration;
            match.breakRemainingMs = halftimeDuration;
            
            // Resume after halftime with fresh clock for second half
            if (match.breakTimeout) clearTimeout(match.breakTimeout);
            match.breakTimeout = setTimeout(() => {
                if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                    match.round = 0; // Set to 0 so startNextRound's round++ makes it 1
                    match.gameClockMs = halfConfig.HALF_DURATION_MS; // Reset clock for second half
                    startNextRound(match, ns);
                }
            }, halftimeDuration);
            
            console.log(`[TeamMatch] Half 1 ended - halftime for match ${match.matchId} (${halftimeDuration}ms)`);
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

        const slotOp = getSlotOperation(team.currentSlot, match.operation, team); // Use team's slot
        player.currentQuestion = generateTeamQuestion(slotOp);
        player.questionStartTime = Date.now();
        player.currentInput = '';

        // Start the question timeout timer
        startQuestionTimer(match, team, player, ns);

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
        const prevPlayer = getActivePlayer(team, team.currentSlot - 1, match.round);
        if (prevPlayer) {
            prevPlayer.isActive = false;
            prevPlayer.isComplete = true;
            // Clear any remaining question timers for the previous player
            clearQuestionTimer(prevPlayer);
        }
        
        // Use mode-specific config for slots per round
        const matchConfig = getMatchConfig(match.mode || '5v5');
        
        // Check if this team completed all slots for the round
        if (team.currentSlot > matchConfig.SLOTS_PER_ROUND) {
            console.log(`[TeamMatch] Team ${team.teamId} completed all slots for ${match.mode || '5v5'} mode. currentSlot=${team.currentSlot}, SLOTS_PER_ROUND=${matchConfig.SLOTS_PER_ROUND}`);
            
            // This team finished the round - check if both teams are done
            const otherTeam = team.teamId === match.team1.teamId ? match.team2 : match.team1;
            console.log(`[TeamMatch] Other team (${otherTeam.teamId}) currentSlot=${otherTeam.currentSlot}`);
            
            if (otherTeam.currentSlot > matchConfig.SLOTS_PER_ROUND) {
                // Both teams finished - end the round
                console.log(`[TeamMatch] Both teams finished! Calling endRound for round ${match.round}`);
                endRound(match, ns);
            } else {
                // This team finished first! Award the first-to-finish bonus
                const firstFinishBonus = SCORING_CONFIG.FIRST_TO_FINISH_ROUND;
                team.score += firstFinishBonus;
                
                console.log(`[TeamMatch] Team ${team.teamName} finished round ${match.round} first! +${firstFinishBonus} bonus`);
                
                // Notify the team about the bonus
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('first_to_finish_bonus', {
                    teamId: team.teamId,
                    teamName: team.teamName,
                    bonus: firstFinishBonus,
                    newTeamScore: team.score,
                    round: match.round,
                });
                
                // Notify all players in match about who finished first
                ns.to(match.matchId).emit('team_finished_round', {
                    teamId: team.teamId,
                    teamName: team.teamName,
                    isFirst: true,
                    bonus: firstFinishBonus,
                    round: match.round,
                });
                
                // Waiting for other team to finish their slots
                console.log(`[TeamMatch] Waiting for other team to finish (they're on slot ${otherTeam.currentSlot})`);
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('waiting_for_opponents', {
                    message: 'Waiting for opponents to complete their relay...',
                });
            }
        } else {
            // Activate next slot player for this team
            const slotOp = getSlotOperation(team.currentSlot, match.operation, team);
            const activePlayer = getActivePlayer(team, team.currentSlot, match.round);
            
            if (activePlayer) {
                activePlayer.isActive = true;
                activePlayer.currentQuestion = generateTeamQuestion(slotOp);
                activePlayer.questionStartTime = Date.now();
                activePlayer.timeoutsInSlot = 0; // Reset timeout counter for new slot
                
                // Countdown notification for this team
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('handoff_countdown', {
                    nextPlayerId: activePlayer.odUserId,
                    nextPlayerName: activePlayer.odName,
                    slotNumber: team.currentSlot,
                    operation: slotOp,
                    countdownMs: TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS,
                });
                
                // After countdown, send question and start timeout timer
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
                        // Start the question timeout timer after handoff
                        startQuestionTimer(match, team, activePlayer, ns);
                    }
                }, TEAM_MATCH_CONFIG.HANDOFF_COUNTDOWN_MS);
            }
            
            // Notify about this team's slot change (to own team)
            // Include activePlayerId AND the question so client can update immediately
            const questionText = activePlayer?.currentQuestion?.question;
            console.log(`[TeamMatch] Emitting slot_change with questionText: ${questionText ? questionText : 'MISSING'}`);
            ns.to(`team:${match.matchId}:${team.teamId}`).emit('slot_change', {
                teamId: team.teamId,
                currentSlot: team.currentSlot,
                slotOperation: slotOp,
                activePlayerId: activePlayer?.odUserId,
                activePlayerName: activePlayer?.odName,
                // Include question for immediate display (no waiting for question_update)
                questionText: questionText,
                questionId: Date.now().toString(),
            });
            
            // ALSO notify the opponent team about this team's slot change
            // This allows the opponent relay UI to update
            const opponentTeam = team.teamId === match.team1.teamId ? match.team2 : match.team1;
            ns.to(`team:${match.matchId}:${opponentTeam.teamId}`).emit('opponent_slot_change', {
                teamId: team.teamId,
                currentSlot: team.currentSlot,
                activePlayerId: activePlayer?.odUserId,
                activePlayerName: activePlayer?.odName,
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
            const prevPlayer = getActivePlayer(team, match.currentSlot - 1, match.round);
            if (prevPlayer) {
                prevPlayer.isActive = false;
                prevPlayer.isComplete = true;
            }
        }
        
        // Use mode-specific config for slots per round
        const matchConfig = getMatchConfig(match.mode || '5v5');
        if (match.currentSlot > matchConfig.SLOTS_PER_ROUND) {
            // Round complete
            endRound(match, ns);
        } else {
            // Activate next slot players
            for (const team of [match.team1, match.team2]) {
                const slotOp = getSlotOperation(match.currentSlot, match.operation, team);
                const activePlayer = getActivePlayer(team, match.currentSlot, match.round);
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
                    const activePlayer = getActivePlayer(team, match.currentSlot, match.round);
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
        console.log(`[TeamMatch] endRound called for round ${match.round}, half ${match.half}`);

        // Ensure roundScores array exists (safety check for matches that may have been restored)
        if (!match.roundScores) {
            match.roundScores = [];
        }

        // Store round scores
        match.roundScores.push({
            round: match.round,
            team1: match.team1.score,
            team2: match.team2.score,
        });

        // Deactivate all players, clear question timers, and reset Double Call-In ONLY if it was used this round
        for (const team of [match.team1, match.team2]) {
            for (const player of Object.values(team.players)) {
                player.isActive = false;
                // Clear any remaining question timers
                clearQuestionTimer(player);
            }
            // Reset Double Call-In ONLY if it was for THIS round (not a future round)
            // This prevents resetting a Double Call-In scheduled for the next round
            if (team.doubleCallinActive && team.doubleCallinForRound === match.round) {
                console.log(`[TeamMatch] Resetting Double Call-In for team ${team.teamId} after round ${match.round} (was scheduled for round ${team.doubleCallinForRound})`);
                team.doubleCallinActive = false;
                team.doubleCallinSlot = null;
                team.doubleCallinBenchedId = null;
                team.doubleCallinForRound = null;
            } else if (team.doubleCallinActive) {
                console.log(`[TeamMatch] Preserving Double Call-In for team ${team.teamId}: scheduled for round ${team.doubleCallinForRound}, current round is ${match.round}`);
            }
        }

        // Use mode-specific config for round/half checking
        const roundConfig = getMatchConfig(match.mode || '5v5');
        const roundEndDelay = roundConfig.ROUND_END_DELAY_MS || 3000;

        // Emit round_complete event so clients can show the summary before break
        // This gives players time to see the first-to-finish bonus and round results
        ns.to(match.matchId).emit('round_complete', {
            round: match.round,
            half: match.half,
            team1Score: match.team1.score,
            team2Score: match.team2.score,
            team1Name: match.team1.teamName,
            team2Name: match.team2.teamName,
            delayMs: roundEndDelay,
        });

        // Delay before transitioning to break/halftime
        setTimeout(() => {
            // Safety check: ensure match still exists and is in expected state
            if (!match || match.phase === TEAM_MATCH_PHASES.POST_MATCH) {
                console.log(`[TeamMatch] Match ended or not found during round end delay, skipping transition`);
                return;
            }
            
            proceedToBreakOrHalftime(match, ns, roundConfig);
        }, roundEndDelay);
    }
    
    /**
     * Proceed to break, halftime, or match end after round complete delay
     */
    function proceedToBreakOrHalftime(match, ns, roundConfig) {
        console.log(`[TeamMatch] proceedToBreakOrHalftime for round ${match.round}, half ${match.half}`);

        if (match.round === roundConfig.ROUNDS_PER_HALF && match.half === 1) {
            // End of 1st Half - go to Halftime
            match.phase = TEAM_MATCH_PHASES.HALFTIME;
            match.half = 2;
            
            // Calculate halftime duration, including any pending timeout extensions
            let halftimeDuration = roundConfig.HALFTIME_DURATION_MS;
            let appliedExtensions = [];
            
            for (const team of [match.team1, match.team2]) {
                if (team.pendingTimeoutExtension && team.pendingTimeoutExtension > 0) {
                    halftimeDuration += team.pendingTimeoutExtension;
                    appliedExtensions.push({
                        teamName: team.teamName,
                        extensionMs: team.pendingTimeoutExtension,
                    });
                    console.log(`[TeamMatch] Applied pending timeout extension of ${team.pendingTimeoutExtension}ms from ${team.teamName} to halftime`);
                    team.pendingTimeoutExtension = 0; // Clear after applying
                }
            }
            
            ns.to(match.matchId).emit('halftime', {
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                roundScores: match.roundScores,
                halftimeDurationMs: halftimeDuration,
                appliedTimeoutExtensions: appliedExtensions,
            });
            
            // Store halftime end time for potential extension
            match.breakEndTime = Date.now() + halftimeDuration;
            match.breakRemainingMs = halftimeDuration;
            
            // Reset ready flags for both teams
            match.team1.readyForNext = false;
            match.team2.readyForNext = false;
            
            // Start halftime timer interval to emit countdown updates every second
            if (match.halftimeTimer) clearInterval(match.halftimeTimer);
            match.halftimeStartTime = Date.now();
            match.halftimeTimer = setInterval(() => {
                const elapsed = Date.now() - match.halftimeStartTime;
                match.breakRemainingMs = Math.max(0, halftimeDuration - elapsed);
                
                ns.to(match.matchId).emit('halftime_time_update', {
                    remainingMs: match.breakRemainingMs,
                });
                
                // When time expires, start second half
                if (match.breakRemainingMs === 0) {
                    clearInterval(match.halftimeTimer);
                    match.halftimeTimer = null;
                    if (match.phase === TEAM_MATCH_PHASES.HALFTIME) {
                        match.round = 0;
                        match.gameClockMs = roundConfig.HALF_DURATION_MS;
                        startNextRound(match, ns);
                    }
                }
            }, 1000);
            
        } else if (match.round >= roundConfig.TOTAL_ROUNDS || 
                   (match.round === roundConfig.ROUNDS_PER_HALF && match.half === 2)) {
            // Match complete - either reached total rounds (legacy) or Round 4 of 2nd Half
            console.log(`[TeamMatch] Match complete: round=${match.round}, half=${match.half}`);
            endTeamMatch(match, ns);
            
        } else if (match.half === 2 && match.round === roundConfig.ROUNDS_PER_HALF - 1) {
            // End of Round 3 in 2nd Half - SOLO DECISION PHASE
            // IGL must choose between Normal relay or Anchor Solo for the final round
            console.log(`[TeamMatch] Entering solo decision phase after round ${match.round}`);
            startSoloDecisionPhase(match, ns);
            
        } else {
            // Tactical break between rounds
            match.phase = TEAM_MATCH_PHASES.BREAK;
            
            // Calculate break duration, including any pending timeout extensions
            let breakDuration = roundConfig.BREAK_DURATION_MS;
            let appliedExtensions = [];
            
            for (const team of [match.team1, match.team2]) {
                if (team.pendingTimeoutExtension && team.pendingTimeoutExtension > 0) {
                    breakDuration += team.pendingTimeoutExtension;
                    appliedExtensions.push({
                        teamName: team.teamName,
                        extensionMs: team.pendingTimeoutExtension,
                    });
                    console.log(`[TeamMatch] Applied pending timeout extension of ${team.pendingTimeoutExtension}ms from ${team.teamName}`);
                    team.pendingTimeoutExtension = 0; // Clear after applying
                }
            }
            
            ns.to(match.matchId).emit('round_break', {
                completedRound: match.round,
                team1Score: match.team1.score,
                team2Score: match.team2.score,
                breakDurationMs: breakDuration,
                appliedTimeoutExtensions: appliedExtensions,
            });
            
            // Store break end time and timeout reference (for timeout extension)
            match.breakEndTime = Date.now() + breakDuration;
            match.breakRemainingMs = breakDuration;
            
            // Reset ready flags for both teams
            match.team1.readyForNext = false;
            match.team2.readyForNext = false;
            
            // Start break timer interval to emit countdown updates every second
            if (match.breakTimer) clearInterval(match.breakTimer);
            match.breakStartTime = Date.now();
            match.breakTimer = setInterval(() => {
                const elapsed = Date.now() - match.breakStartTime;
                match.breakRemainingMs = Math.max(0, breakDuration - elapsed);
                
                ns.to(match.matchId).emit('break_time_update', {
                    remainingMs: match.breakRemainingMs,
                });
                
                // When time expires, start next round
                if (match.breakRemainingMs === 0) {
                    clearInterval(match.breakTimer);
                    match.breakTimer = null;
                    if (match.phase === TEAM_MATCH_PHASES.BREAK) {
                        startNextRound(match, ns);
                    }
                }
            }, 1000);
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
        
        // First enter ROUND_COUNTDOWN phase for 3-2-1-GO
        match.phase = TEAM_MATCH_PHASES.ROUND_COUNTDOWN;
        match.roundCountdownStartTime = Date.now();
        
        
        // Reset per-team slot state for new round
        for (const team of [match.team1, match.team2]) {
            team.currentSlot = 1;
            team.questionsInSlot = 0;
            for (const player of Object.values(team.players)) {
                player.isComplete = false;
            }
        }
        
        // Emit round_countdown event to clients with initial state
        const countdownDuration = TEAM_MATCH_CONFIG.ROUND_COUNTDOWN_MS;
        ns.to(match.matchId).emit('round_countdown', {
            round: match.round,
            half: match.half,
            countdownMs: countdownDuration,
            team1Name: match.team1.teamName,
            team2Name: match.team2.teamName,
        });
        
        console.log(`[TeamMatch] Round ${match.round} countdown started for match ${match.matchId}`);
        
        // Start round countdown interval to emit tick updates every second
        if (match.roundCountdownTimer) clearInterval(match.roundCountdownTimer);
        match.roundCountdownStartTime = Date.now();
        match.roundCountdownTimer = setInterval(() => {
            const elapsed = Date.now() - match.roundCountdownStartTime;
            const remainingMs = Math.max(0, countdownDuration - elapsed);
            const secondsRemaining = Math.ceil(remainingMs / 1000);
            
            // Emit countdown tick (5, 4, 3, 2, 1, GO!)
            ns.to(match.matchId).emit('round_countdown_tick', {
                round: match.round,
                half: match.half,
                remainingMs: remainingMs,
                secondsRemaining: secondsRemaining,
                displayText: secondsRemaining > 0 ? String(secondsRemaining) : 'GO!',
            });
            
            // When countdown reaches 0, transition to active phase
            if (remainingMs === 0) {
                clearInterval(match.roundCountdownTimer);
                match.roundCountdownTimer = null;
                
                if (match.phase !== TEAM_MATCH_PHASES.ROUND_COUNTDOWN) {
                    console.log(`[TeamMatch] Phase changed during countdown, aborting active transition`);
                    return;
                }
                
                beginActivePhase(match, ns);
            }
        }, 1000);
    }

    /**
     * Start the Solo Decision phase before the final round of 2nd half
     * IGLs have 10 seconds to choose NORMAL or ANCHOR SOLO
     */
    function startSoloDecisionPhase(match, ns) {
        match.phase = TEAM_MATCH_PHASES.SOLO_DECISION;
        
        const matchConfig = getMatchConfig(match.mode || '5v5');
        const decisionDuration = matchConfig.SOLO_DECISION_DURATION_MS;
        
        // Reset solo decision state for both teams
        match.team1.anchorSoloDecision = null;
        match.team2.anchorSoloDecision = null;
        
        // Notify all players about the solo decision phase
        const team1Anchor = match.team1.players[match.team1.anchorId];
        const team2Anchor = match.team2.players[match.team2.anchorId];
        
        ns.to(match.matchId).emit('solo_decision_phase', {
            round: match.round,
            half: match.half,
            nextRound: match.round + 1,
            durationMs: decisionDuration,
            team1: {
                teamId: match.team1.teamId,
                teamName: match.team1.teamName,
                iglId: match.team1.iglId,
                anchorId: match.team1.anchorId,
                anchorName: team1Anchor?.odName || 'Unknown',
            },
            team2: {
                teamId: match.team2.teamId,
                teamName: match.team2.teamName,
                iglId: match.team2.iglId,
                anchorId: match.team2.anchorId,
                anchorName: team2Anchor?.odName || 'Unknown',
            },
        });
        
        console.log(`[TeamMatch] Solo decision phase started for match ${match.matchId} (${decisionDuration}ms)`);
        
        // Auto-select NORMAL for AI team IGLs immediately
        for (const team of [match.team1, match.team2]) {
            if (isAITeammate(team.iglId) || isAIBot(team.iglId)) {
                team.anchorSoloDecision = 'normal';
                console.log(`[TeamMatch] AI IGL for ${team.teamName} auto-selected NORMAL`);
                ns.to(match.matchId).emit('solo_decision_made', {
                    teamId: team.teamId,
                    teamName: team.teamName,
                    decision: 'normal',
                    anchorId: team.anchorId,
                    anchorName: team.players[team.anchorId]?.odName || 'AI',
                });
            }
        }
        
        // Check if both teams already decided (e.g., both AI)
        if (match.team1.anchorSoloDecision !== null && match.team2.anchorSoloDecision !== null) {
            revealSoloDecisionsAndStartFinalRound(match, ns);
            return;
        }
        
        // Start decision timer - auto-select NORMAL if no decision made
        match.soloDecisionTimer = setTimeout(() => {
            console.log(`[TeamMatch] Solo decision timeout - auto-selecting NORMAL for undecided teams`);
            
            // Auto-select NORMAL for any team that hasn't decided
            for (const team of [match.team1, match.team2]) {
                if (team.anchorSoloDecision === null) {
                    team.anchorSoloDecision = 'normal';
                    console.log(`[TeamMatch] ${team.teamName} auto-selected NORMAL (timeout)`);
                    ns.to(match.matchId).emit('solo_decision_made', {
                        teamId: team.teamId,
                        teamName: team.teamName,
                        decision: 'normal',
                        anchorId: team.anchorId,
                        anchorName: team.players[team.anchorId]?.odName || 'Unknown',
                        autoSelected: true,
                    });
                }
            }
            
            revealSoloDecisionsAndStartFinalRound(match, ns);
        }, decisionDuration);
    }

    /**
     * Reveal both teams' solo decisions and start the final round
     */
    function revealSoloDecisionsAndStartFinalRound(match, ns) {
        const team1Anchor = match.team1.players[match.team1.anchorId];
        const team2Anchor = match.team2.players[match.team2.anchorId];
        
        // Emit the reveal event
        ns.to(match.matchId).emit('solo_decisions_revealed', {
            team1: {
                teamId: match.team1.teamId,
                teamName: match.team1.teamName,
                decision: match.team1.anchorSoloDecision,
                anchorName: team1Anchor?.odName || 'Unknown',
                anchorSoloActive: match.team1.anchorSoloActive,
            },
            team2: {
                teamId: match.team2.teamId,
                teamName: match.team2.teamName,
                decision: match.team2.anchorSoloDecision,
                anchorName: team2Anchor?.odName || 'Unknown',
                anchorSoloActive: match.team2.anchorSoloActive,
            },
        });
        
        console.log(`[TeamMatch] Solo decisions revealed:`);
        console.log(`  - ${match.team1.teamName}: ${match.team1.anchorSoloDecision?.toUpperCase()}`);
        console.log(`  - ${match.team2.teamName}: ${match.team2.anchorSoloDecision?.toUpperCase()}`);
        
        // Brief delay to show the reveal, then start final round
        setTimeout(() => {
            startNextRound(match, ns);
        }, 2000); // 2 second reveal animation
    }
    
    /**
     * Begin the active phase after countdown completes
     */
    function beginActivePhase(match, ns) {
        match.phase = TEAM_MATCH_PHASES.ACTIVE;
        match.roundStartTime = Date.now();
        
        console.log(`[TeamMatch] Round ${match.round} active phase started for match ${match.matchId}`);
        
        // Get slot1 operation for team1 (used for the broadcast event)
        const slot1Op = getSlotOperation(1, match.operation, match.team1);
        
        // Activate first slot players and track their IDs for the round_start event
        let team1ActivePlayerId = null;
        let team2ActivePlayerId = null;
        
        for (const team of [match.team1, match.team2]) {
            const teamSlot1Op = getSlotOperation(1, match.operation, team);
            const activePlayer = getActivePlayer(team, 1, match.round);
            if (activePlayer) {
                activePlayer.isActive = true;
                activePlayer.currentQuestion = generateTeamQuestion(teamSlot1Op);
                activePlayer.questionStartTime = Date.now();
                activePlayer.timeoutsInSlot = 0; // Reset timeout counter for new round
                
                // Track which player is active for each team
                if (team === match.team1) {
                    team1ActivePlayerId = activePlayer.odUserId;
                } else {
                    team2ActivePlayerId = activePlayer.odUserId;
                }
            }
        }
        
        ns.to(match.matchId).emit('round_start', {
            round: match.round,
            half: match.half,
            currentSlot: 1,
            slotOperation: slot1Op,
            team1ActivePlayerId,
            team2ActivePlayerId,
        });
        
        // Send questions to teams and start timeout timers
        for (const team of [match.team1, match.team2]) {
            const activePlayer = getActivePlayer(team, 1, match.round);
            if (activePlayer && activePlayer.currentQuestion) {
                ns.to(`team:${match.matchId}:${team.teamId}`).emit('question_update', {
                    questionId: Date.now().toString(),
                    questionText: activePlayer.currentQuestion.question,
                    operation: getSlotOperation(1, match.operation, team),
                    activePlayerId: activePlayer.odUserId,
                    slotNumber: 1,
                    questionInSlot: 1,
                });
                // Start the question timeout timer
                startQuestionTimer(match, team, activePlayer, ns);
            }
        }
    }
    
    /**
     * End team match
     */
    async function endTeamMatch(match, ns) {
        match.phase = TEAM_MATCH_PHASES.POST_MATCH;
        
        if (match.timer) {
            clearInterval(match.timer);
            match.timer = null;
        }
        
        // Stop bot behavior if this was an AI match
        stopBotBehavior(match.matchId);
        
        // CRITICAL: Reset party queue status for both teams immediately
        // This prevents duplicate "match found" notifications after leaving a match
        for (const team of [match.team1, match.team2]) {
            if (team.partyId && !team.partyId.startsWith('ai_')) {
                try {
                    // Reset the party's queue state to idle
                    const queueStateKey = `party:${team.partyId}:queue`;
                    await arenaRedis.redis.set(queueStateKey, JSON.stringify({
                        status: 'idle',
                        startedAt: null,
                        matchType: null,
                        matchId: null,
                    }), 'EX', 14400); // 4 hour TTL
                    
                    // Also delete the match reference
                    await arenaRedis.redis.del(`team:match:${team.partyId}`);
                    
                    console.log(`[TeamMatch] Reset queue status to idle for party ${team.partyId}`);
                } catch (err) {
                    console.error(`[TeamMatch] Failed to reset queue status for party ${team.partyId}:`, err.message);
                }
            }
        }
        
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
        
        // Record team match to PostgreSQL for permanent history
        const winnerTeam = isDraw ? null : (team1Won ? 1 : 2);
        const durationMs = Date.now() - match.startTime;
        recordTeamMatchToPostgres(match, winnerTeam, durationMs);
        
        // Clean up after a delay - extended to 5 minutes so players can view results
        // Players should manually leave by clicking "Back to Arena" or "Play Again"
        setTimeout(async () => {
            await removeTeamMatchState(match.matchId);
        }, 300000); // 5 minutes
    }
    
    /**
     * Create a team match from matchmaking result
     * Called by the matchmaking system when a match is found
     * Now async to support Redis storage
     */
    global.createTeamMatch = async function(matchId, team1, team2, operation, matchType, mode = '5v5') {
        const matchMode = mode || team1.odMode || '5v5';
        const match = initTeamMatchState(matchId, team1, team2, operation, matchType, matchMode);
        await saveTeamMatchState(matchId, match);
        console.log(`[TeamMatch] Match ${matchId} (${matchMode}) created and saved to Redis: ${team1.odTeamName || 'Team 1'} vs ${team2.odTeamName || 'Team 2'}`);
        return match;
    };
    
    console.log('[TeamMatch] Team match namespace initialized at /arena/teams');

    // Initialize PostgreSQL schema for arena data
    // IMPORTANT: Await this before starting HTTP server to prevent 503 errors on first requests
    try {
        await arenaPostgres.initSchema();
        console.log('[PostgreSQL] Arena database schema initialized');
    } catch (err) {
        console.error('[PostgreSQL] Schema init failed:', err.message);
        // Continue anyway - PostgreSQL errors shouldn't prevent server start
        // but log the warning so we know there's an issue
        console.warn('[PostgreSQL] Server starting without PostgreSQL - some features may be unavailable');
    }

    httpServer.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> WebSocket server running on /api/socket/arena`);
        console.log(`> Presence server running on /presence`);
        console.log(`> Team match server running on /arena/teams`);
        console.log(`> PostgreSQL arena database connected`);
    });
});