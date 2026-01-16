/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS file, require() is legitimate */
/**
 * FlashMath Arena - Redis Client
 * 
 * Centralized Redis connection for real-time state management.
 * Handles matchmaking queues, active match state, and player sessions.
 * 
 * @module redis
 */

const Redis = require('ioredis');
const { REDIS_KEYS } = require('./constants.js');

// =============================================================================
// REDIS CONNECTION
// =============================================================================

let redisClient = null;
let isConnected = false;

/**
 * Get or create Redis client
 * @returns {Redis} Redis client instance
 */
function getRedisClient() {
    if (redisClient) {
        return redisClient;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        lazyConnect: true,
        // Reconnection strategy
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        }
    });

    redisClient.on('connect', () => {
        console.log('[Redis] Connected to server');
        isConnected = true;
    });

    redisClient.on('ready', () => {
        console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('error', (err) => {
        console.error('[Redis] Error:', err.message);
        isConnected = false;
    });

    redisClient.on('close', () => {
        console.log('[Redis] Connection closed');
        isConnected = false;
    });

    return redisClient;
}

/**
 * Connect to Redis
 */
async function connectRedis() {
    const client = getRedisClient();

    if (!isConnected) {
        try {
            await client.connect();
        } catch (err) {
            // May already be connected
            if (!err.message.includes('already')) {
                throw err;
            }
        }
    }

    return client;
}

/**
 * Check if Redis is connected
 */
function isRedisConnected() {
    return isConnected && redisClient?.status === 'ready';
}

/**
 * Gracefully disconnect Redis
 */
async function disconnectRedis() {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        isConnected = false;
    }
}

// =============================================================================
// MATCHMAKING QUEUE OPERATIONS
// =============================================================================

/**
 * Add a player to the matchmaking queue
 * @param {Object} playerData - Player queue entry
 */
async function addToQueue(playerData) {
    const client = getRedisClient();
    const key = REDIS_KEYS.MATCHMAKING_QUEUE;

    await client.hset(key, playerData.id, JSON.stringify({
        ...playerData,
        joinedAt: Date.now()
    }));

    // Set player state
    await client.set(
        `${REDIS_KEYS.PLAYER_STATE}${playerData.id}`,
        JSON.stringify({ status: 'queuing', socketId: playerData.socketId }),
        'EX', 3600  // 1 hour TTL
    );
}

/**
 * Remove a player from the matchmaking queue
 * @param {string} playerId - Player ID to remove
 */
async function removeFromQueue(playerId) {
    const client = getRedisClient();
    await client.hdel(REDIS_KEYS.MATCHMAKING_QUEUE, playerId);
    await client.del(`${REDIS_KEYS.PLAYER_STATE}${playerId}`);
}

/**
 * Get all players in matchmaking queue
 * @returns {Map<string, Object>} Map of playerId -> playerData
 */
async function getQueueEntries() {
    const client = getRedisClient();
    const entries = await client.hgetall(REDIS_KEYS.MATCHMAKING_QUEUE);

    const map = new Map();
    for (const [key, value] of Object.entries(entries)) {
        try {
            map.set(key, JSON.parse(value));
        } catch (_e) {
            // Skip malformed entries
        }
    }
    return map;
}

/**
 * Get queue size
 */
async function getQueueSize() {
    const client = getRedisClient();
    return await client.hlen(REDIS_KEYS.MATCHMAKING_QUEUE);
}

// =============================================================================
// MATCH STATE OPERATIONS
// =============================================================================

/**
 * Store active match state
 * @param {string} matchId - Match ID
 * @param {Object} matchState - Serializable match state
 */
async function setMatchState(matchId, matchState) {
    const client = getRedisClient();
    await client.set(
        `${REDIS_KEYS.MATCH_STATE}${matchId}`,
        JSON.stringify(matchState),
        'EX', 3600  // 1 hour TTL
    );

    // Track in active matches set
    await client.sadd(REDIS_KEYS.ACTIVE_MATCHES, matchId);
}

/**
 * Get match state
 * @param {string} matchId - Match ID
 */
async function getMatchState(matchId) {
    const client = getRedisClient();
    const data = await client.get(`${REDIS_KEYS.MATCH_STATE}${matchId}`);
    return data ? JSON.parse(data) : null;
}

/**
 * Remove match state
 * @param {string} matchId - Match ID
 */
async function removeMatchState(matchId) {
    const client = getRedisClient();
    await client.del(`${REDIS_KEYS.MATCH_STATE}${matchId}`);
    await client.srem(REDIS_KEYS.ACTIVE_MATCHES, matchId);
}

/**
 * Get count of active matches
 */
async function getActiveMatchCount() {
    const client = getRedisClient();
    return await client.scard(REDIS_KEYS.ACTIVE_MATCHES);
}

// =============================================================================
// PLAYER STATE OPERATIONS
// =============================================================================

/**
 * Set player state (queuing, in_match, idle)
 */
async function setPlayerState(playerId, state) {
    const client = getRedisClient();
    await client.set(
        `${REDIS_KEYS.PLAYER_STATE}${playerId}`,
        JSON.stringify(state),
        'EX', 3600
    );
}

/**
 * Get player state
 */
async function getPlayerState(playerId) {
    const client = getRedisClient();
    const data = await client.get(`${REDIS_KEYS.PLAYER_STATE}${playerId}`);
    return data ? JSON.parse(data) : null;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get arena statistics
 */
async function getArenaStats() {
    const client = getRedisClient();

    const [queueSize, activeMatches] = await Promise.all([
        client.hlen(REDIS_KEYS.MATCHMAKING_QUEUE),
        client.scard(REDIS_KEYS.ACTIVE_MATCHES)
    ]);

    return {
        playersInQueue: queueSize,
        activeMatches: activeMatches,
        redisConnected: isRedisConnected()
    };
}

module.exports = {
    getRedisClient,
    connectRedis,
    disconnectRedis,
    isRedisConnected,
    // Queue operations
    addToQueue,
    removeFromQueue,
    getQueueEntries,
    getQueueSize,
    // Match operations
    setMatchState,
    getMatchState,
    removeMatchState,
    getActiveMatchCount,
    // Player operations
    setPlayerState,
    getPlayerState,
    // Stats
    getArenaStats
};
