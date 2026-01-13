/**
 * FlashMath Arena - Redis State Management
 * 
 * Redis-first architecture for match state, player sessions,
 * matchmaking, and real-time communication.
 * 
 * @module server-redis
 */

const Redis = require('ioredis');

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
};

const TTL = {
    MATCH: 7200,           // 2 hours
    TEAM_MATCH: 7200,      // 2 hours
    PLAYER_SESSION: 3600,  // 1 hour
    QUEUE_ENTRY: 600,      // 10 minutes
    RECENT_MATCHES: 86400, // 24 hours
    RATE_LIMIT: 60,        // 1 minute
    SOCKET_MAP: 3600,      // 1 hour
    MATCH_SETUP: 300,      // 5 minutes for match setup data
};

const KEYS = {
    // Match state
    MATCH: 'arena:match:',
    MATCH_PLAYERS: 'arena:match:players:',
    TEAM_MATCH: 'arena:team_match:',
    TEAM_MATCH_SETUP: 'arena:team_match_setup:',
    ACTIVE_MATCH_IDS: 'arena:active_match_ids',
    
    // Player state
    PLAYER_SESSION: 'player:session:',
    PLAYER_MATCH: 'player:match:',
    SOCKET_PLAYER: 'socket:player:',
    SOCKET_MATCH: 'socket:match:',
    
    // Matchmaking
    QUEUE_1V1: 'arena:queue:1v1',
    QUEUE_5V5: 'arena:queue:5v5',
    QUEUE_ENTRY: 'arena:queue:entry:',
    QUEUE_PARTY: 'arena:queue:party:',
    MATCHMAKING_QUEUE: 'arena:matchmaking:queue',
    MATCHMAKING_RESULT: 'arena:matchmaking:result:',  // Match result by partyId
    
    // Leaderboards
    LEADERBOARD_ELO: 'leaderboard:elo:',
    LEADERBOARD_XP: 'leaderboard:xp:',
    
    // Pub/Sub channels
    MATCH_EVENTS: 'arena:match:events:',
    GLOBAL_EVENTS: 'arena:events:global',
    PRESENCE: 'presence:updates',
    
    // Stats & Misc
    ACTIVE_MATCHES: 'stats:active_matches',
    ACTIVE_TEAM_MATCHES: 'stats:active_team_matches',
    RECENT_MATCHES: 'matches:recent:',
    RATE_LIMIT: 'ratelimit:',
    LOSS_STREAK: 'arena:losses:',
};

// =============================================================================
// REDIS CLIENT MANAGEMENT
// =============================================================================

let redis = null;
let redisSub = null;  // Separate client for subscriptions
let isConnected = false;

/**
 * Initialize and connect the primary Redis client and a duplicate subscriber client used for Pub/Sub.
 * @returns {Promise<boolean>} `true` if initialization succeeded and clients are connected, `false` otherwise.
 */
async function initRedis() {
    if (redis && isConnected) {
        return true;
    }
    
    try {
        redis = new Redis(REDIS_CONFIG);
        
        redis.on('connect', () => {
            console.log('[Redis] Connecting to Redis server...');
        });
        
        redis.on('ready', () => {
            console.log('[Redis] Connected and ready');
            isConnected = true;
        });
        
        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err.message);
            // Don't set isConnected to false on every error
            // Only on close/end events
        });
        
        redis.on('close', () => {
            console.log('[Redis] Connection closed');
            isConnected = false;
        });
        
        redis.on('reconnecting', (delay) => {
            console.log(`[Redis] Reconnecting in ${delay}ms...`);
        });
        
        // Connect and test
        await redis.connect();
        const pong = await redis.ping();
        
        if (pong === 'PONG') {
            console.log('[Redis] Ping successful');
            isConnected = true;
            
            // Initialize subscriber client for Pub/Sub
            redisSub = redis.duplicate();
            await redisSub.connect();
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('[Redis] Failed to initialize:', error.message);
        isConnected = false;
        return false;
    }
}

/**
 * Return the primary Redis client instance used by this module.
 * @returns {import('ioredis').Redis|null} The Redis client instance, or `null`/`undefined` if it has not been initialized.
 */
function getRedis() {
    return redis;
}

/**
 * Indicates whether the Redis client is currently connected.
 * @returns {boolean} `true` if the Redis client exists and the connection is active, `false` otherwise.
 */
function isRedisConnected() {
    return isConnected && redis !== null;
}

/**
 * Close Redis clients and clear internal connection state.
 *
 * Closes the primary and subscriber Redis clients if present, clears their references,
 * sets the internal connection flag to false, and logs the disconnection.
 */
async function disconnectRedis() {
    if (redis) {
        await redis.quit();
        redis = null;
    }
    if (redisSub) {
        await redisSub.quit();
        redisSub = null;
    }
    isConnected = false;
    console.log('[Redis] Disconnected');
}

// =============================================================================
// SAFE REDIS OPERATIONS (with fallback for when Redis is unavailable)
// =============================================================================

/**
 * Execute a Redis operation when the client is connected, otherwise return a fallback value.
 * @param {Function} operation - A callable that performs the Redis operation and returns its result.
 * @param {*} [fallback=null] - Value to return if Redis is disconnected or the operation fails.
 * @returns {*} The result of `operation()` if successful, or `fallback` when disconnected or on error.
 */
async function safeRedisOp(operation, fallback = null) {
    if (!isConnected || !redis) {
        return fallback;
    }
    try {
        return await operation();
    } catch (error) {
        console.error('[Redis] Operation failed:', error.message);
        return fallback;
    }
}

// =============================================================================
// 1v1 MATCH STATE
// =============================================================================

/**
 * Persist a 1v1 match and its players into Redis and mark the match as active.
 *
 * Stores match metadata and per-player state with appropriate TTLs and adds the match ID to the active set.
 * @param {Object} match - Match state object containing at minimum `matchId` and optionally `players` and metadata (status, odOperation, startTime, odTimeLeft, odStarted, odEnded, currentQuestion, isAiMatch, hostRank, hostDivision).
 * @returns {boolean} `true` if the save completed successfully, `false` otherwise.
 */
async function saveMatch(match) {
    return safeRedisOp(async () => {
        const matchKey = KEYS.MATCH + match.matchId;
        const playersKey = KEYS.MATCH_PLAYERS + match.matchId;
        
        const pipeline = redis.pipeline();
        
        // Save match metadata
        pipeline.hset(matchKey, {
            id: match.matchId,
            status: match.status || 'pending',
            operation: match.odOperation || 'mixed',
            startTime: (match.startTime || Date.now()).toString(),
            timeLeft: (match.odTimeLeft || 60000).toString(),
            started: match.odStarted ? '1' : '0',
            ended: match.odEnded ? '1' : '0',
            currentQuestion: JSON.stringify(match.currentQuestion || null),
            isAiMatch: match.isAiMatch ? '1' : '0',
            hostRank: match.hostRank || '',
            hostDivision: match.hostDivision || '',
        });
        pipeline.expire(matchKey, TTL.MATCH);
        
        // Save players
        if (match.players) {
            for (const [odUserId, player] of Object.entries(match.players)) {
                pipeline.hset(playersKey, odUserId, JSON.stringify(player));
            }
            pipeline.expire(playersKey, TTL.MATCH);
        }
        
        // Track active match
        pipeline.sadd(KEYS.ACTIVE_MATCH_IDS, match.matchId);
        
        await pipeline.exec();
        return true;
    }, false);
}

/**
 * Retrieve a 1v1 match state from Redis by match ID.
 * @param {string} matchId - The match identifier.
 * @returns {Object|null} The reconstructed match object containing: `matchId`, `odOperation`, `odTimeLeft`, `odStarted`, `odEnded`, `currentQuestion`, `isAiMatch`, `startTime`, `hostRank`, `hostDivision`, and `players`; or `null` if the match does not exist.
 */
async function getMatch(matchId) {
    return safeRedisOp(async () => {
        const matchKey = KEYS.MATCH + matchId;
        const playersKey = KEYS.MATCH_PLAYERS + matchId;
        
        const [matchData, playersData] = await Promise.all([
            redis.hgetall(matchKey),
            redis.hgetall(playersKey),
        ]);
        
        if (!matchData || !matchData.id) {
            return null;
        }
        
        // Reconstruct players object
        const players = {};
        for (const [odUserId, playerJson] of Object.entries(playersData)) {
            try {
                players[odUserId] = JSON.parse(playerJson);
            } catch (e) {
                console.error(`[Redis] Failed to parse player ${odUserId}:`, e);
            }
        }
        
        return {
            matchId: matchData.id,
            odOperation: matchData.operation,
            odTimeLeft: parseInt(matchData.timeLeft, 10),
            odStarted: matchData.started === '1',
            odEnded: matchData.ended === '1',
            currentQuestion: matchData.currentQuestion ? JSON.parse(matchData.currentQuestion) : null,
            isAiMatch: matchData.isAiMatch === '1',
            startTime: parseInt(matchData.startTime, 10),
            hostRank: matchData.hostRank,
            hostDivision: matchData.hostDivision,
            players,
        };
    }, null);
}

/**
 * Persist partial updates to a match's Redis hash, encoding objects and booleans for storage.
 *
 * The function serializes object values to JSON and converts boolean values to `'1'` or `'0'`
 * before writing all provided fields to the match hash in Redis.
 *
 * @param {string} matchId - ID of the match whose state will be updated.
 * @param {Object} updates - Key/value map of fields to update; values may be strings, numbers, booleans, or objects.
 * @returns {boolean} `true` if the update succeeded, `false` otherwise.
 */
async function updateMatch(matchId, updates) {
    return safeRedisOp(async () => {
        const matchKey = KEYS.MATCH + matchId;
        
        const flatUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'object' && value !== null) {
                flatUpdates[key] = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
                flatUpdates[key] = value ? '1' : '0';
            } else {
                flatUpdates[key] = String(value);
            }
        }
        
        await redis.hset(matchKey, flatUpdates);
        return true;
    }, false);
}

/**
 * Atomically adjusts a player's score for a match and persists optional player field updates.
 * @param {string} matchId - Match ID.
 * @param {string} odUserId - Player's user ID.
 * @param {number} scoreChange - Amount to add to the player's score; may be negative. The resulting score will be clamped to zero.
 * @param {Object} playerUpdate - Additional player fields to merge into the stored player object (shallow merge).
 * @returns {Object|null} The updated player object, or `null` if the player was not found (or Redis is unavailable).
 */
async function updatePlayerScore(matchId, odUserId, scoreChange, playerUpdate = {}) {
    return safeRedisOp(async () => {
        const playersKey = KEYS.MATCH_PLAYERS + matchId;
        
        // Get current player state
        const playerJson = await redis.hget(playersKey, odUserId);
        if (!playerJson) {
            return null;
        }
        
        const player = JSON.parse(playerJson);
        
        // Update fields
        Object.assign(player, playerUpdate);
        player.score = Math.max(0, (player.score || 0) + scoreChange);
        
        // Save back
        await redis.hset(playersKey, odUserId, JSON.stringify(player));
        
        return player;
    }, null);
}

/**
 * Remove a 1v1 match and its associated player data from Redis.
 * @param {string} matchId - The match identifier.
 * @returns {boolean} `true` if the Redis keys were removed, `false` otherwise.
 */
async function deleteMatch(matchId) {
    return safeRedisOp(async () => {
        const pipeline = redis.pipeline();
        
        pipeline.del(KEYS.MATCH + matchId);
        pipeline.del(KEYS.MATCH_PLAYERS + matchId);
        pipeline.srem(KEYS.ACTIVE_MATCH_IDS, matchId);
        
        await pipeline.exec();
        return true;
    }, false);
}

// =============================================================================
// 5v5 TEAM MATCH STATE
// =============================================================================

/**
 * Persist team match metadata and both teams' state into Redis with appropriate expirations.
 * 
 * @param {Object} match - Team match payload; expected keys include:
 *   - matchId: unique match identifier (required)
 *   - phase, round, half, gameClockMs, operation, matchType, mode, slotOperations
 *   - isAIMatch, aiDifficulty, startTime
 *   - team1, team2: team state objects (optional)
 * @returns {boolean} `true` if the match was saved to Redis, `false` otherwise.
 */
async function saveTeamMatch(match) {
    return safeRedisOp(async () => {
        const baseKey = KEYS.TEAM_MATCH + match.matchId;
        
        const pipeline = redis.pipeline();
        
        // Match metadata
        pipeline.hset(baseKey, {
            id: match.matchId,
            phase: match.phase || 'pre_match',
            round: (match.round || 1).toString(),
            half: (match.half || 1).toString(),
            gameClockMs: (match.gameClockMs || 360000).toString(),
            operation: match.operation || 'mixed',
            matchType: match.matchType || 'casual',
            mode: match.mode || '5v5',  // CRITICAL: Include mode for 2v2/5v5 distinction
            slotOperations: JSON.stringify(match.slotOperations || []),  // Include slot operations
            isAIMatch: match.isAIMatch ? '1' : '0',
            aiDifficulty: match.aiDifficulty || '',
            startTime: (match.startTime || Date.now()).toString(),
        });
        pipeline.expire(baseKey, TTL.TEAM_MATCH);
        
        // Save Team 1
        if (match.team1) {
            await saveTeamState(pipeline, baseKey, 'team1', match.team1);
        }
        
        // Save Team 2
        if (match.team2) {
            await saveTeamState(pipeline, baseKey, 'team2', match.team2);
        }
        
        await pipeline.exec();
        return true;
    }, false);
}

/**
 * Persist a team's metadata and optional player entries into the provided Redis pipeline and set appropriate TTLs.
 *
 * Writes a hash at `{baseKey}:{teamName}` containing team fields (ids, name/tag, scores, slot and timeout info,
 * slotAssignments, home flag, and anchor-solo state) and, if present, a players hash at `{baseKey}:{teamName}:players`
 * with per-player JSON values. Both keys receive the TEAM_MATCH expiration.
 *
 * @param {object} pipeline - A Redis pipeline/transaction object (supports hset and expire).
 * @param {string} baseKey - Base Redis key for the team match (prefix used to build team and players keys).
 * @param {string} teamName - Name identifier for the team (e.g., "team1" or "team2").
 * @param {object} team - Team payload. Recognized fields: `teamId`, `partyId`, `teamName`, `teamTag`, `leaderId`,
 *   `score`, `currentStreak`, `currentSlot`, `questionsInSlot`, `iglId`, `anchorId`, `timeoutsUsed`,
 *   `slotAssignments` (object), `isHome` (boolean), `anchorSoloActive` (boolean), `anchorSoloDecision`,
 *   `usedAnchorSolo` (boolean), and `players` (map of odUserId -> player object).
 */
function saveTeamState(pipeline, baseKey, teamName, team) {
    const teamKey = `${baseKey}:${teamName}`;
    const playersKey = `${teamKey}:players`;
    
    pipeline.hset(teamKey, {
        teamId: team.teamId || '',
        partyId: team.partyId || '',
        teamName: team.teamName || teamName,
        teamTag: team.teamTag || '',
        leaderId: team.leaderId || '',
        score: (team.score || 0).toString(),
        currentStreak: (team.currentStreak || 0).toString(),
        currentSlot: (team.currentSlot || 1).toString(),
        questionsInSlot: (team.questionsInSlot || 0).toString(),
        iglId: team.iglId || '',
        anchorId: team.anchorId || '',
        timeoutsUsed: (team.timeoutsUsed || 0).toString(),
        slotAssignments: JSON.stringify(team.slotAssignments || {}),
        isHome: team.isHome ? '1' : '0',
        // Anchor Solo state
        anchorSoloActive: team.anchorSoloActive ? '1' : '0',
        anchorSoloDecision: team.anchorSoloDecision || '',
        usedAnchorSolo: team.usedAnchorSolo ? '1' : '0',
    });
    pipeline.expire(teamKey, TTL.TEAM_MATCH);
    
    // Save players
    if (team.players) {
        for (const [odUserId, player] of Object.entries(team.players)) {
            pipeline.hset(playersKey, odUserId, JSON.stringify(player));
        }
        pipeline.expire(playersKey, TTL.TEAM_MATCH);
    }
}

/**
 * Retrieve the persisted team match state for the given match ID from Redis.
 *
 * @param {string} matchId - Unique identifier of the team match.
 * @returns {Object|null} The team match state object containing keys: `matchId`, `phase`, `round`, `half`, `gameClockMs`, `operation`, `matchType`, `mode`, `slotOperations`, `isAIMatch`, `aiDifficulty`, `startTime`, `team1`, and `team2`; or `null` if the match is not found.
 */
async function getTeamMatch(matchId) {
    return safeRedisOp(async () => {
        const baseKey = KEYS.TEAM_MATCH + matchId;
        
        const [matchData, team1Data, team1Players, team2Data, team2Players] = await Promise.all([
            redis.hgetall(baseKey),
            redis.hgetall(`${baseKey}:team1`),
            redis.hgetall(`${baseKey}:team1:players`),
            redis.hgetall(`${baseKey}:team2`),
            redis.hgetall(`${baseKey}:team2:players`),
        ]);
        
        if (!matchData || !matchData.id) {
            return null;
        }
        
        // Parse slotOperations from JSON (or default to empty array)
        let slotOperations = [];
        try {
            slotOperations = matchData.slotOperations ? JSON.parse(matchData.slotOperations) : [];
        } catch (e) {
            console.error('[Redis] Failed to parse slotOperations:', e);
        }
        
        return {
            matchId: matchData.id,
            phase: matchData.phase,
            round: parseInt(matchData.round, 10),
            half: parseInt(matchData.half, 10),
            gameClockMs: parseInt(matchData.gameClockMs, 10),
            operation: matchData.operation,
            matchType: matchData.matchType,
            mode: matchData.mode || '5v5',  // CRITICAL: Include mode for 2v2/5v5 distinction
            slotOperations,                  // Include slot operations for UI
            isAIMatch: matchData.isAIMatch === '1',
            aiDifficulty: matchData.aiDifficulty,
            startTime: parseInt(matchData.startTime, 10),
            team1: parseTeamState(team1Data, team1Players),
            team2: parseTeamState(team2Data, team2Players),
        };
    }, null);
}

/**
 * Reconstructs a team's runtime state from Redis-stored hash data and its player entries.
 *
 * @param {Object|null} teamData - Hash-like object from Redis containing team fields (expects at least `teamId`).
 * @param {Object<string,string>|null} playersData - Map of playerId to serialized JSON player objects.
 * @returns {Object|null} A team object with typed fields (integers for numeric counters, booleans for flags, parsed `slotAssignments` and `players` objects), or `null` if `teamData` is missing or lacks `teamId`.
 */
function parseTeamState(teamData, playersData) {
    if (!teamData || !teamData.teamId) {
        return null;
    }
    
    const players = {};
    for (const [odUserId, playerJson] of Object.entries(playersData || {})) {
        try {
            players[odUserId] = JSON.parse(playerJson);
        } catch (e) {
            console.error(`[Redis] Failed to parse player ${odUserId}:`, e);
        }
    }
    
    return {
        teamId: teamData.teamId,
        partyId: teamData.partyId,
        teamName: teamData.teamName,
        teamTag: teamData.teamTag,
        leaderId: teamData.leaderId,
        score: parseInt(teamData.score, 10),
        currentStreak: parseInt(teamData.currentStreak, 10),
        currentSlot: parseInt(teamData.currentSlot, 10),
        questionsInSlot: parseInt(teamData.questionsInSlot, 10),
        iglId: teamData.iglId,
        anchorId: teamData.anchorId,
        timeoutsUsed: parseInt(teamData.timeoutsUsed, 10),
        slotAssignments: teamData.slotAssignments ? JSON.parse(teamData.slotAssignments) : {},
        isHome: teamData.isHome === '1',
        // Anchor Solo state
        anchorSoloActive: teamData.anchorSoloActive === '1',
        anchorSoloDecision: teamData.anchorSoloDecision || null,
        usedAnchorSolo: teamData.usedAnchorSolo === '1',
        players,
    };
}

/**
 * Persist team-match setup data used for AI matches under the team-match setup key.
 * @param {string} matchId - The match identifier used to compose the Redis key.
 * @param {Object} setupData - Arbitrary setup payload for the match (will be JSON-stringified).
 * @returns {boolean} `true` if the setup was saved, `false` otherwise.
 */
async function setTeamMatchSetup(matchId, setupData) {
    return safeRedisOp(async () => {
        const key = KEYS.TEAM_MATCH_SETUP + matchId;
        await redis.set(key, JSON.stringify(setupData), 'EX', TTL.MATCH_SETUP);
        return true;
    }, false);
}

/**
 * Retrieve the persisted team-match setup for a match.
 * @param {string} matchId - Match identifier.
 * @returns {Object|null} The parsed setup object for the match, or `null` if no setup is stored.
 */
async function getTeamMatchSetup(matchId) {
    return safeRedisOp(async () => {
        const key = KEYS.TEAM_MATCH_SETUP + matchId;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Remove all Redis keys for a team match, including both teams, their players, and the match setup.
 * @param {string} matchId - Team match identifier.
 * @returns {boolean} `true` if the deletion succeeded, `false` otherwise.
 */
async function deleteTeamMatch(matchId) {
    return safeRedisOp(async () => {
        const baseKey = KEYS.TEAM_MATCH + matchId;
        
        const pipeline = redis.pipeline();
        pipeline.del(baseKey);
        pipeline.del(`${baseKey}:team1`);
        pipeline.del(`${baseKey}:team1:players`);
        pipeline.del(`${baseKey}:team2`);
        pipeline.del(`${baseKey}:team2:players`);
        pipeline.del(KEYS.TEAM_MATCH_SETUP + matchId);
        
        await pipeline.exec();
        return true;
    }, false);
}

// =============================================================================
// PLAYER SESSION & SOCKET MAPPING
// =============================================================================

/**
 * Store a player's session data in Redis with a TTL and an updated timestamp.
 *
 * The session is serialized to JSON, an `updatedAt` timestamp (ms since epoch) is added,
 * and the key is set to expire using the PLAYER_SESSION TTL.
 * @param {string|number} odUserId - The player's unique identifier used as part of the Redis key.
 * @param {Object} sessionData - Arbitrary session information to persist (will be merged with `updatedAt`).
 * @returns {boolean} `true` if the session was saved, `false` if Redis was unavailable or the operation failed.
 */
async function setPlayerSession(odUserId, sessionData) {
    return safeRedisOp(async () => {
        const key = KEYS.PLAYER_SESSION + odUserId;
        await redis.set(key, JSON.stringify({
            ...sessionData,
            updatedAt: Date.now(),
        }), 'EX', TTL.PLAYER_SESSION);
        return true;
    }, false);
}

/**
 * Retrieve a player's session data from Redis.
 * @param {string|number} odUserId - The player's OpenDuel user ID.
 * @returns {Object|null} The parsed session object if present, or `null` if no session is stored.
 */
async function getPlayerSession(odUserId) {
    return safeRedisOp(async () => {
        const key = KEYS.PLAYER_SESSION + odUserId;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Associate a socket ID with a match ID in Redis for later lookup (e.g., on disconnect).
 * @param {string} socketId - Socket identifier.
 * @param {string} matchId - Match identifier to map to the socket.
 * @returns {boolean} `true` if the mapping was saved, `false` otherwise.
 */
async function setSocketToMatch(socketId, matchId) {
    return safeRedisOp(async () => {
        await redis.set(KEYS.SOCKET_MATCH + socketId, matchId, 'EX', TTL.SOCKET_MAP);
        return true;
    }, false);
}

/**
 * Retrieve the match ID associated with a socket.
 * @param {string} socketId - The socket identifier.
 * @returns {string|null} The match ID for the socket, or `null` if no mapping exists or Redis is unavailable.
 */
async function getMatchFromSocket(socketId) {
    return safeRedisOp(async () => {
        return await redis.get(KEYS.SOCKET_MATCH + socketId);
    }, null);
}

/**
 * Retrieve the match ID mapped to a socket.
 * @param {string} socketId - The socket's identifier.
 * @returns {string|null} The match ID associated with the socket, or `null` if no mapping exists.
 */
async function getMatchForSocket(socketId) {
    return getMatchFromSocket(socketId);
}

/**
 * Remove all mappings associated with a socket identifier.
 * @param {string} socketId - The socket identifier whose mappings should be removed.
 * @returns {Promise<*>} The result of clearing the socket's mappings. 
 */
async function removeSocketMapping(socketId) {
    return clearSocketMappings(socketId);
}

/**
 * Remove Redis entries that map a socket to a match and to a player.
 * @param {string} socketId - Socket identifier used as the key suffix.
 * @returns {boolean} `true` if the mappings were removed (or the delete commands were issued), `false` otherwise.
 */
async function clearSocketMappings(socketId) {
    return safeRedisOp(async () => {
        await redis.del(KEYS.SOCKET_MATCH + socketId);
        await redis.del(KEYS.SOCKET_PLAYER + socketId);
        return true;
    }, false);
}

// =============================================================================
// TEAM MATCH SOCKET MAPPINGS
// =============================================================================

/**
 * Associate a socket ID with a 5v5 team-match mapping.
 *
 * Stores the mapping in Redis and applies the match TTL.
 * @param {string} socketId - The socket identifier.
 * @param {Object} data - Mapping payload.
 * @param {string} data.matchId - Team match identifier.
 * @param {string|number} data.userId - User identifier for the socket.
 * @param {string} data.teamId - Team identifier within the match.
 * @returns {boolean} `true` if the mapping was saved, `false` otherwise.
 */
async function setSocketToTeamMatch(socketId, data) {
    return safeRedisOp(async () => {
        const key = `socket:team_match:${socketId}`;
        await redis.setex(key, TTL.MATCH, JSON.stringify(data));
        return true;
    }, false);
}

/**
 * Retrieve the team-match mapping associated with a socket ID.
 * @param {string} socketId - Socket identifier.
 * @returns {{matchId: string, userId: string, teamId: string}|null} The parsed mapping `{ matchId, userId, teamId }` if present, `null` otherwise.
 */
async function getSocketTeamMatch(socketId) {
    return safeRedisOp(async () => {
        const key = `socket:team_match:${socketId}`;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Remove the mapping that associates a socket with a team match.
 * @param {string} socketId - Socket identifier.
 * @returns {boolean} `true` if the Redis operation succeeded (mapping removed or key absent), `false` otherwise.
 */
async function removeSocketTeamMatch(socketId) {
    return safeRedisOp(async () => {
        const key = `socket:team_match:${socketId}`;
        await redis.del(key);
        return true;
    }, false);
}

// =============================================================================
// MATCHMAKING QUEUE
// =============================================================================

/**
 * Add a player entry to the 1v1 matchmaking queue and persist their queue record.
 *
 * Stores the player in a sorted set keyed by ELO and writes a full per-player queue hash with metadata (joined timestamp, server id, socket id, tier). The queue entry is given a TTL to expire stale entries.
 *
 * @param {Object} playerData - Player information to enqueue.
 * @param {string} playerData.id - Unique player id.
 * @param {string} [playerData.name] - Display name.
 * @param {number} [playerData.elo=1000] - Player ELO used for sorting candidates.
 * @param {string} [playerData.tier='bronze'] - Player tier label.
 * @param {string} [playerData.socketId] - Socket id associated with the player.
 * @returns {boolean} `true` if the entry was added (or updated) successfully, `false` on failure or when Redis is unavailable.
 */
async function addToQueue(playerData) {
    return safeRedisOp(async () => {
        const pipeline = redis.pipeline();
        
        // Add to sorted set (sorted by ELO for matching)
        pipeline.zadd(KEYS.QUEUE_1V1, playerData.elo || 1000, playerData.id);
        
        // Store full player data
        pipeline.hset(KEYS.QUEUE_ENTRY + playerData.id, {
            id: playerData.id,
            name: playerData.name,
            elo: (playerData.elo || 1000).toString(),
            tier: playerData.tier || 'bronze',
            socketId: playerData.socketId,
            joinedAt: Date.now().toString(),
            serverId: process.env.SERVER_ID || 'server-1',
        });
        pipeline.expire(KEYS.QUEUE_ENTRY + playerData.id, TTL.QUEUE_ENTRY);
        
        await pipeline.exec();
        return true;
    }, false);
}

/**
 * Remove a player from the 1v1 matchmaking queue.
 * @param {string} playerId - The player's unique identifier.
 * @returns {boolean} `true` if the removal operation succeeded, `false` otherwise.
 */
async function removeFromQueue(playerId) {
    return safeRedisOp(async () => {
        const pipeline = redis.pipeline();
        pipeline.zrem(KEYS.QUEUE_1V1, playerId);
        pipeline.del(KEYS.QUEUE_ENTRY + playerId);
        await pipeline.exec();
        return true;
    }, false);
}

/**
 * Retrieve a player's matchmaking queue entry.
 *
 * Fetches the stored queue entry for the given player ID and returns a plain object
 * describing the queued player or `null` if no entry exists.
 *
 * @param {string} playerId - The player's unique identifier.
 * @returns {{id: string, name: string, elo: number, tier: string|undefined, socketId: string|undefined, joinedAt: number, serverId: string|undefined}|null}
 *          The queue entry object with:
 *          - `id`: player id,
 *          - `name`: display name,
 *          - `elo`: numeric ELO,
 *          - `tier`: optional tier string,
 *          - `socketId`: optional socket identifier,
 *          - `joinedAt`: timestamp in milliseconds since epoch,
 *          - `serverId`: optional server id;
 *          or `null` if no entry is found.
 */
async function getQueueEntry(playerId) {
    return safeRedisOp(async () => {
        const data = await redis.hgetall(KEYS.QUEUE_ENTRY + playerId);
        if (!data || !data.id) return null;
        
        return {
            id: data.id,
            name: data.name,
            elo: parseInt(data.elo, 10),
            tier: data.tier,
            socketId: data.socketId,
            joinedAt: parseInt(data.joinedAt, 10),
            serverId: data.serverId,
        };
    }, null);
}

/**
 * Retrieve queued players whose ELO falls within a symmetric range around a target ELO.
 *
 * @param {number} elo - Target ELO to search around.
 * @param {number} [range=100] - Maximum allowed deviation above or below `elo`; candidates with ELO in [elo - range, elo + range] are returned.
 * @returns {Array<Object>} An array of queue entry objects for players whose ELO is within the specified range; returns an empty array if no candidates are found. 
 */
async function findMatchCandidates(elo, range = 100) {
    return safeRedisOp(async () => {
        const minElo = elo - range;
        const maxElo = elo + range;
        
        // Get player IDs in ELO range
        const playerIds = await redis.zrangebyscore(KEYS.QUEUE_1V1, minElo, maxElo);
        
        // Get full data for each
        const candidates = [];
        for (const playerId of playerIds) {
            const entry = await getQueueEntry(playerId);
            if (entry) {
                candidates.push(entry);
            }
        }
        
        return candidates;
    }, []);
}

/**
 * Get the number of entries in the 1v1 matchmaking queue.
 * @returns {number} The number of entries in the 1v1 matchmaking queue; returns 0 if Redis is unavailable.
 */
async function getQueueSize() {
    return safeRedisOp(async () => {
        return await redis.zcard(KEYS.QUEUE_1V1);
    }, 0);
}

/**
 * Save matchmaking result (when two parties are matched for a PvP game)
 * This allows the Socket.IO server to retrieve match data when players connect.
 * Stored by partyId so both parties can look up the match.
 * 
 * NOTE: team-matchmaking.ts stores match results under 'team:match:${partyId}'
 * so we use the same key pattern for compatibility.
 */
const TEAM_MATCH_RESULT_KEY = 'team:match:';

/**
 * Store a matchmaking result for a party in Redis and apply the configured TTL.
 *
 * @param {string} partyId - Unique identifier for the party whose match result is being saved.
 * @param {Object} matchResult - Matchmaking result payload (e.g., contains `matchId` and related metadata).
 * @returns {boolean} `true` if the result was saved to Redis, `false` otherwise.
 */
async function saveMatchFromMatchmaking(partyId, matchResult) {
    return safeRedisOp(async () => {
        const key = TEAM_MATCH_RESULT_KEY + partyId;
        await redis.set(key, JSON.stringify(matchResult), 'EX', TTL.MATCH_SETUP);
        console.log(`[Redis] Saved matchmaking result for party ${partyId}, matchId=${matchResult.matchId}`);
        return true;
    }, false);
}

/**
 * Retrieve a stored team matchmaking result for a party ID.
 * @param {string} partyId - Party identifier used to look up the matchmaking result.
 * @returns {Object|null} The parsed matchmaking result object, or `null` if no result is found.
 */
async function getMatchFromMatchmaking(partyId) {
    return safeRedisOp(async () => {
        const key = TEAM_MATCH_RESULT_KEY + partyId;
        const data = await redis.get(key);
        if (!data) {
            console.log(`[Redis] No matchmaking result found for party ${partyId}`);
            return null;
        }
        console.log(`[Redis] Found matchmaking result for party ${partyId}`);
        return JSON.parse(data);
    }, null);
}

/**
 * Remove the stored matchmaking result for a given party.
 * @param {string} partyId - Party identifier appended to the matchmaking result key.
 * @returns {boolean} `true` if the deletion operation was attempted (or succeeded), `false` if Redis was unavailable.
 */
async function deleteMatchFromMatchmaking(partyId) {
    return safeRedisOp(async () => {
        await redis.del(TEAM_MATCH_RESULT_KEY + partyId);
        return true;
    }, false);
}

// =============================================================================
// LEADERBOARDS
// =============================================================================

/**
 * Store a player's ELO score in the specified leaderboard.
 * @param {string} odUserId - Player identifier.
 * @param {number} elo - ELO score to record.
 * @param {string} [operation='global'] - Leaderboard namespace (e.g., `"global"` or operation-specific key suffix).
 * @returns {boolean} `true` if the leaderboard was updated, `false` otherwise.
 */
async function updateLeaderboard(odUserId, elo, operation = 'global') {
    return safeRedisOp(async () => {
        await redis.zadd(KEYS.LEADERBOARD_ELO + operation, elo, odUserId);
        return true;
    }, false);
}

/**
 * Retrieve the top N entries from a leaderboard.
 *
 * @param {string} operation - Leaderboard identifier (e.g., `'global'`).
 * @param {number} limit - Maximum number of entries to return.
 * @returns {Array<Object>} An array of leaderboard entries ordered by rank. Each entry has:
 *  - `odUserId` (string): player id,
 *  - `elo` (number): player's ELO score,
 *  - `rank` (number): 1-based rank.
 * Returns an empty array if the leaderboard is empty or unavailable.
 */
async function getLeaderboard(operation = 'global', limit = 100) {
    return safeRedisOp(async () => {
        const results = await redis.zrevrange(
            KEYS.LEADERBOARD_ELO + operation,
            0,
            limit - 1,
            'WITHSCORES'
        );
        
        const leaderboard = [];
        for (let i = 0; i < results.length; i += 2) {
            leaderboard.push({
                odUserId: results[i],
                elo: parseInt(results[i + 1], 10),
                rank: (i / 2) + 1,
            });
        }
        
        return leaderboard;
    }, []);
}

/**
 * Retrieve a player's rank and ELO from a leaderboard.
 *
 * @param {(string|number)} odUserId - The player identifier to look up.
 * @param {string} [operation='global'] - Leaderboard namespace or operation name.
 * @returns {{rank: number|null, elo: number|null}} An object where `rank` is the player's 1-based rank or `null` if not ranked, and `elo` is the player's ELO score as an integer or `null` if absent.
 */
async function getPlayerRank(odUserId, operation = 'global') {
    return safeRedisOp(async () => {
        const [rank, score] = await Promise.all([
            redis.zrevrank(KEYS.LEADERBOARD_ELO + operation, odUserId),
            redis.zscore(KEYS.LEADERBOARD_ELO + operation, odUserId),
        ]);
        
        return {
            rank: rank !== null ? rank + 1 : null,
            elo: score ? parseInt(score, 10) : null,
        };
    }, { rank: null, elo: null });
}

// =============================================================================
// PUB/SUB (for multi-server communication)
// =============================================================================

/**
 * Publish an event for a specific match to the match's Pub/Sub channel.
 * @param {string} matchId - Match identifier used to select the channel.
 * @param {Object} event - Event payload to publish; additional `timestamp` will be added.
 * @returns {boolean} `true` if the event was published to the match channel, `false` otherwise.
 */
async function publishMatchEvent(matchId, event) {
    return safeRedisOp(async () => {
        await redis.publish(KEYS.MATCH_EVENTS + matchId, JSON.stringify({
            ...event,
            timestamp: Date.now(),
        }));
        return true;
    }, false);
}

/**
 * Subscribes to pub/sub events for a match and invokes the callback with parsed event objects.
 * @param {string} matchId - Match identifier used to subscribe to the match-specific channel.
 * @param {function(object):void} callback - Handler invoked for each received event; receives the parsed message object.
 * @returns {function():void} Unsubscribe function that stops listening and unsubscribes from the channel. If the Redis subscriber is not initialized, returns a no-op function.
 */
function subscribeToMatchEvents(matchId, callback) {
    if (!redisSub) {
        console.warn('[Redis] Subscriber not initialized');
        return () => {};
    }
    
    const channel = KEYS.MATCH_EVENTS + matchId;
    
    redisSub.subscribe(channel);
    
    const handler = (ch, message) => {
        if (ch === channel) {
            try {
                callback(JSON.parse(message));
            } catch (e) {
                console.error('[Redis] Failed to parse Pub/Sub message:', e);
            }
        }
    };
    
    redisSub.on('message', handler);
    
    // Return unsubscribe function
    return () => {
        redisSub.unsubscribe(channel);
        redisSub.off('message', handler);
    };
}

/**
 * Publish an event to the global arena channel.
 *
 * The provided event object will be published to the global events channel; a `timestamp` field
 * is added to the payload before publishing.
 * @param {Object} event - Payload for the global event.
 * @returns {boolean} `true` if the event was published, `false` otherwise.
 */
async function publishGlobalEvent(event) {
    return safeRedisOp(async () => {
        await redis.publish(KEYS.GLOBAL_EVENTS, JSON.stringify({
            ...event,
            timestamp: Date.now(),
        }));
        return true;
    }, false);
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Enforces a per-user, per-action rate limit scoped to one-minute windows.
 *
 * @param {string|number} odUserId - User identifier to apply the rate limit to.
 * @param {string} action - Action name or key to rate-limit.
 * @param {number} [maxPerMinute=60] - Maximum allowed occurrences of the action within a single minute.
 * @returns {boolean} `true` if the action is allowed (count is less than or equal to `maxPerMinute`), `false` if the rate limit has been exceeded. If Redis is unavailable, the function defaults to allowing the action (`true`).
 */
async function checkRateLimit(odUserId, action, maxPerMinute = 60) {
    return safeRedisOp(async () => {
        const minute = Math.floor(Date.now() / 60000);
        const key = `${KEYS.RATE_LIMIT}${action}:${odUserId}:${minute}`;
        
        const count = await redis.incr(key);
        
        if (count === 1) {
            await redis.expire(key, TTL.RATE_LIMIT);
        }
        
        return count <= maxPerMinute;
    }, true); // Default to allowing if Redis is down
}

// =============================================================================
// LOSS STREAK (Tilt Protection)
// =============================================================================

/**
 * Retrieve a player's current loss streak value.
 * @param {string|number} playerId - Player identifier used as the key suffix.
 * @returns {number} The player's loss streak; `0` if no value is stored, the stored value is invalid, or Redis is unavailable.
 */
async function getLossStreak(playerId) {
    return safeRedisOp(async () => {
        const streak = await redis.get(KEYS.LOSS_STREAK + playerId);
        return parseInt(streak, 10) || 0;
    }, 0);
}

/**
 * Increment a player's loss streak counter and ensure it expires after one hour.
 *
 * @param {string|number} playerId - Identifier of the player whose loss streak to increment.
 * @returns {number} The new loss-streak value for the player (or `0` if Redis is unavailable).
 */
async function incrementLossStreak(playerId) {
    return safeRedisOp(async () => {
        const key = KEYS.LOSS_STREAK + playerId;
        const newStreak = await redis.incr(key);
        await redis.expire(key, 3600); // 1 hour TTL
        return newStreak;
    }, 0);
}

/**
 * Reset a player's loss-streak counter.
 * @param {string|number} playerId - The player's unique identifier.
 * @returns {boolean} `true` if the loss streak was cleared, `false` on failure or when Redis is unavailable.
 */
async function clearLossStreak(playerId) {
    return safeRedisOp(async () => {
        await redis.del(KEYS.LOSS_STREAK + playerId);
        return true;
    }, false);
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Increment the global active matches counter.
 * @returns {number} The new active matches count, or 0 if Redis is unavailable.
 */
async function incrementActiveMatches() {
    return safeRedisOp(async () => {
        return await redis.incr(KEYS.ACTIVE_MATCHES);
    }, 0);
}

/**
 * Decrease the active matches counter by one and ensure it never becomes negative.
 *
 * If Redis is unavailable, returns 0.
 *
 * @returns {number} The updated active matches count (0 or greater).
 */
async function decrementActiveMatches() {
    return safeRedisOp(async () => {
        const count = await redis.decr(KEYS.ACTIVE_MATCHES);
        // Ensure we don't go negative
        if (count < 0) {
            await redis.set(KEYS.ACTIVE_MATCHES, '0');
            return 0;
        }
        return count;
    }, 0);
}

/**
 * Retrieve current arena statistics: active 1v1 matches, active team matches, and 1v1 queue size.
 * @returns {{activeMatches: number, activeTeamMatches: number, queueSize: number}} An object with:
 *  - activeMatches: number of active 1v1 matches,
 *  - activeTeamMatches: number of active team matches,
 *  - queueSize: number of players currently in the 1v1 matchmaking queue.
 * When Redis is unavailable, each field will be `0`.
 */
async function getArenaStats() {
    return safeRedisOp(async () => {
        const [activeMatches, activeTeamMatches, queueSize] = await Promise.all([
            redis.get(KEYS.ACTIVE_MATCHES),
            redis.get(KEYS.ACTIVE_TEAM_MATCHES),
            redis.zcard(KEYS.QUEUE_1V1),
        ]);
        
        return {
            activeMatches: parseInt(activeMatches, 10) || 0,
            activeTeamMatches: parseInt(activeTeamMatches, 10) || 0,
            queueSize: queueSize || 0,
        };
    }, { activeMatches: 0, activeTeamMatches: 0, queueSize: 0 });
}

// =============================================================================
// CACHE: Recent Matches
// =============================================================================

/**
 * Pushes a match summary into a user's recent matches list in Redis, trims the list to the latest 50 entries, and refreshes its TTL.
 * @param {string} odUserId - The user identifier whose recent matches list will be updated.
 * @param {Object} matchSummary - A serializable summary of the match to store.
 * @returns {boolean} `true` if the summary was added to the cache, `false` otherwise.
 */
async function addRecentMatch(odUserId, matchSummary) {
    return safeRedisOp(async () => {
        const key = KEYS.RECENT_MATCHES + odUserId;
        const pipeline = redis.pipeline();
        
        pipeline.lpush(key, JSON.stringify(matchSummary));
        pipeline.ltrim(key, 0, 49); // Keep last 50
        pipeline.expire(key, TTL.RECENT_MATCHES);
        
        await pipeline.exec();
        return true;
    }, false);
}

/**
 * Retrieve a user's recent match summaries from the cached list.
 *
 * Reads up to `limit` entries from the user's recent matches list and parses each entry as JSON; malformed entries are skipped.
 * @param {string} odUserId - The user's unique identifier.
 * @param {number} [limit=10] - Maximum number of recent matches to return.
 * @returns {Array<Object>} An array of parsed match summary objects (may be empty).
 */
async function getRecentMatches(odUserId, limit = 10) {
    return safeRedisOp(async () => {
        const key = KEYS.RECENT_MATCHES + odUserId;
        const data = await redis.lrange(key, 0, limit - 1);
        
        return data.map(json => {
            try {
                return JSON.parse(json);
            } catch (e) {
                return null;
            }
        }).filter(Boolean);
    }, []);
}

// =============================================================================
// CACHED LEADERBOARD (Full data with TTL)
// =============================================================================

const CACHE_TTL = {
    LEADERBOARD: 60,        // 60 seconds for leaderboard cache
    PLAYER_STATS: 30,       // 30 seconds for player stats
    FRIENDS_LIST: 120,      // 2 minutes for friends list
};

/**
 * Caches a complete leaderboard payload (usernames, stats, and metadata) under a key composed of type and operation.
 * @param {string} type - Leaderboard type (e.g., "duel", "team", "5v5").
 * @param {string} operation - Operation filter or scope (e.g., "overall", "addition").
 * @param {Array} data - Full leaderboard data array to serialize and store.
 * @returns {boolean} `true` if the data was cached successfully, `false` otherwise.
 */
async function cacheLeaderboard(type, operation, data) {
    return safeRedisOp(async () => {
        const key = `cache:leaderboard:${type}:${operation}`;
        await redis.setex(key, CACHE_TTL.LEADERBOARD, JSON.stringify(data));
        return true;
    }, false);
}

/**
 * Retrieve a cached leaderboard payload for the given type and operation.
 * @param {string} type - Leaderboard cache namespace (e.g., "global", "friends").
 * @param {string} operation - Operation identifier used to scope the leaderboard.
 * @returns {Array|null} An array of cached leaderboard entries, or `null` if no cached data exists.
 */
async function getCachedLeaderboard(type, operation) {
    return safeRedisOp(async () => {
        const key = `cache:leaderboard:${type}:${operation}`;
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }, null);
}

/**
 * Cache a user's stats in Redis for fast retrieval by friend lists and social panels, using the module's player-stats TTL.
 * @param {string} userId - The user's identifier.
 * @param {Object} stats - Serializable stats object to cache.
 * @returns {boolean} `true` if the stats were cached successfully, `false` otherwise.
 */
async function cacheUserStats(userId, stats) {
    return safeRedisOp(async () => {
        const key = `cache:stats:${userId}`;
        await redis.setex(key, CACHE_TTL.PLAYER_STATS, JSON.stringify(stats));
        return true;
    }, false);
}

/**
 * Retrieve cached stats for a given user from Redis.
 * @param {string} userId - The user ID whose cached stats to retrieve.
 * @returns {Object|null} Parsed cached stats object, or `null` if no cache entry exists.
 */
async function getCachedUserStats(userId) {
    return safeRedisOp(async () => {
        const key = `cache:stats:${userId}`;
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }, null);
}

/**
 * Retrieve cached stats for multiple users from Redis.
 *
 * Returns an object mapping each userId to its parsed cached stats for entries present in the cache.
 * User IDs with no cache entry or with invalid JSON are omitted. If `userIds` is empty, returns an empty object.
 *
 * @param {string[]} userIds - Array of user IDs to fetch cached stats for.
 * @returns {Object} Map of `userId` -> parsed stats object (only includes users with valid cached entries).
 */
async function getCachedUserStatsBatch(userIds) {
    return safeRedisOp(async () => {
        if (!userIds || userIds.length === 0) return {};
        
        const keys = userIds.map(id => `cache:stats:${id}`);
        const cached = await redis.mget(...keys);
        
        const result = {};
        userIds.forEach((id, index) => {
            if (cached[index]) {
                try {
                    result[id] = JSON.parse(cached[index]);
                } catch (e) { /* ignore parse errors */ }
            }
        });
        return result;
    }, {});
}

/**
 * Clear cached leaderboard entries for the given leaderboard type.
 *
 * Deletes cache keys matching `cache:leaderboard:*` when `type` is `'all'`, or `cache:leaderboard:{type}:*` for a specific type.
 * @param {string} [type='all'] - Leaderboard type to invalidate, or `'all'` to invalidate every leaderboard cache.
 * @returns {boolean} `true` if the cache was cleared or no matching keys existed, `false` if the operation failed or Redis is unavailable.
 */
async function invalidateLeaderboardCache(type = 'all') {
    return safeRedisOp(async () => {
        if (type === 'all') {
            const keys = await redis.keys('cache:leaderboard:*');
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } else {
            const keys = await redis.keys(`cache:leaderboard:${type}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        }
        return true;
    }, false);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Initialization
    initRedis,
    getRedis,
    isRedisConnected,
    disconnectRedis,
    
    // 1v1 Matches
    saveMatch,
    getMatch,
    updateMatch,
    updatePlayerScore,
    deleteMatch,
    
    // Team Matches
    saveTeamMatch,
    getTeamMatch,
    setTeamMatchSetup,
    getTeamMatchSetup,
    deleteTeamMatch,
    
    // Player Sessions & Socket Mapping
    setPlayerSession,
    getPlayerSession,
    setSocketToMatch,
    getMatchFromSocket,
    getMatchForSocket,  // Alias for backwards compatibility
    clearSocketMappings,
    removeSocketMapping, // Alias for backwards compatibility
    
    // Team Match Socket Mapping
    setSocketToTeamMatch,
    getSocketTeamMatch,
    removeSocketTeamMatch,
    
    // Matchmaking Queue
    addToQueue,
    removeFromQueue,
    getQueueEntry,
    findMatchCandidates,
    getQueueSize,
    
    // Matchmaking Results (PvP match data for Socket.IO server)
    saveMatchFromMatchmaking,
    getMatchFromMatchmaking,
    deleteMatchFromMatchmaking,
    
    // Leaderboards
    updateLeaderboard,
    getLeaderboard,
    getPlayerRank,
    
    // Pub/Sub
    publishMatchEvent,
    subscribeToMatchEvents,
    publishGlobalEvent,
    
    // Rate Limiting
    checkRateLimit,
    
    // Loss Streak (Tilt Protection)
    getLossStreak,
    incrementLossStreak,
    clearLossStreak,
    
    // Statistics
    incrementActiveMatches,
    decrementActiveMatches,
    getArenaStats,
    
    // Cache
    addRecentMatch,
    getRecentMatches,
    
    // Leaderboard & Stats Cache
    cacheLeaderboard,
    getCachedLeaderboard,
    cacheUserStats,
    getCachedUserStats,
    getCachedUserStatsBatch,
    invalidateLeaderboardCache,
    CACHE_TTL,
    
    // Constants
    KEYS,
    TTL,
};
