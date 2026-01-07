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
 * Initialize Redis connection
 * @returns {Promise<boolean>} Whether initialization was successful
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
 * Get Redis client instance
 * @returns {Redis} Redis client
 */
function getRedis() {
    return redis;
}

/**
 * Check if Redis is connected
 * @returns {boolean}
 */
function isRedisConnected() {
    return isConnected && redis !== null;
}

/**
 * Gracefully disconnect Redis
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
 * Safely execute a Redis operation with fallback
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
 * Save a 1v1 match to Redis
 * @param {Object} match - Match state object
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
 * Get a 1v1 match from Redis
 * @param {string} matchId - Match ID
 * @returns {Object|null} Match state or null
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
 * Update a specific field in match state
 * @param {string} matchId - Match ID
 * @param {Object} updates - Fields to update
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
 * Update player score atomically
 * @param {string} matchId - Match ID
 * @param {string} odUserId - User ID
 * @param {number} scoreChange - Score change (can be negative)
 * @param {Object} playerUpdate - Additional player fields to update
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
 * Delete a 1v1 match from Redis
 * @param {string} matchId - Match ID
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
 * Save a team match to Redis
 * @param {Object} match - Team match state
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
 * Helper to save team state within a pipeline
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
 * Get a team match from Redis
 * @param {string} matchId - Match ID
 * @returns {Object|null} Team match state or null
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
        
        return {
            matchId: matchData.id,
            phase: matchData.phase,
            round: parseInt(matchData.round, 10),
            half: parseInt(matchData.half, 10),
            gameClockMs: parseInt(matchData.gameClockMs, 10),
            operation: matchData.operation,
            matchType: matchData.matchType,
            isAIMatch: matchData.isAIMatch === '1',
            aiDifficulty: matchData.aiDifficulty,
            startTime: parseInt(matchData.startTime, 10),
            team1: parseTeamState(team1Data, team1Players),
            team2: parseTeamState(team2Data, team2Players),
        };
    }, null);
}

/**
 * Helper to parse team state from Redis
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
        players,
    };
}

/**
 * Store team match setup data (for AI matches)
 */
async function setTeamMatchSetup(matchId, setupData) {
    return safeRedisOp(async () => {
        const key = KEYS.TEAM_MATCH_SETUP + matchId;
        await redis.set(key, JSON.stringify(setupData), 'EX', TTL.MATCH_SETUP);
        return true;
    }, false);
}

/**
 * Get team match setup data
 */
async function getTeamMatchSetup(matchId) {
    return safeRedisOp(async () => {
        const key = KEYS.TEAM_MATCH_SETUP + matchId;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Delete a team match from Redis
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
 * Set player session data
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
 * Get player session data
 */
async function getPlayerSession(odUserId) {
    return safeRedisOp(async () => {
        const key = KEYS.PLAYER_SESSION + odUserId;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Map socket to match (for disconnect handling)
 */
async function setSocketToMatch(socketId, matchId) {
    return safeRedisOp(async () => {
        await redis.set(KEYS.SOCKET_MATCH + socketId, matchId, 'EX', TTL.SOCKET_MAP);
        return true;
    }, false);
}

/**
 * Get match from socket
 */
async function getMatchFromSocket(socketId) {
    return safeRedisOp(async () => {
        return await redis.get(KEYS.SOCKET_MATCH + socketId);
    }, null);
}

// Alias for backwards compatibility
async function getMatchForSocket(socketId) {
    return getMatchFromSocket(socketId);
}

/**
 * Remove socket mapping (backwards compatibility alias)
 */
async function removeSocketMapping(socketId) {
    return clearSocketMappings(socketId);
}

/**
 * Clear socket mappings
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
 * Map a socket to a team match (for 5v5 games)
 * @param {string} socketId - Socket ID
 * @param {Object} data - Match data { matchId, userId, teamId }
 */
async function setSocketToTeamMatch(socketId, data) {
    return safeRedisOp(async () => {
        const key = `socket:team_match:${socketId}`;
        await redis.setex(key, TTL.MATCH, JSON.stringify(data));
        return true;
    }, false);
}

/**
 * Get team match info for a socket
 * @param {string} socketId - Socket ID
 * @returns {Object|null} Match data { matchId, userId, teamId }
 */
async function getSocketTeamMatch(socketId) {
    return safeRedisOp(async () => {
        const key = `socket:team_match:${socketId}`;
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    }, null);
}

/**
 * Remove team match socket mapping
 * @param {string} socketId - Socket ID
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
 * Add player to matchmaking queue
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
 * Remove player from matchmaking queue
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
 * Get queue entry
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
 * Find potential matches within ELO range
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
 * Get queue size
 */
async function getQueueSize() {
    return safeRedisOp(async () => {
        return await redis.zcard(KEYS.QUEUE_1V1);
    }, 0);
}

// =============================================================================
// LEADERBOARDS
// =============================================================================

/**
 * Update player ELO in leaderboard
 */
async function updateLeaderboard(odUserId, elo, operation = 'global') {
    return safeRedisOp(async () => {
        await redis.zadd(KEYS.LEADERBOARD_ELO + operation, elo, odUserId);
        return true;
    }, false);
}

/**
 * Get leaderboard (top N players)
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
 * Get player rank in leaderboard
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
 * Publish match event to all servers
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
 * Subscribe to match events (for cross-server sync)
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
 * Publish global arena event
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
 * Check rate limit for an action
 * @returns {boolean} true if allowed, false if rate limited
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
 * Get loss streak for a player
 */
async function getLossStreak(playerId) {
    return safeRedisOp(async () => {
        const streak = await redis.get(KEYS.LOSS_STREAK + playerId);
        return parseInt(streak, 10) || 0;
    }, 0);
}

/**
 * Increment loss streak
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
 * Clear loss streak (on win)
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
 * Increment active match count
 */
async function incrementActiveMatches() {
    return safeRedisOp(async () => {
        return await redis.incr(KEYS.ACTIVE_MATCHES);
    }, 0);
}

/**
 * Decrement active match count
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
 * Get arena statistics
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
 * Add match to player's recent match cache
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
 * Get player's recent matches from cache
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
 * Cache full leaderboard data (with usernames, stats, etc.)
 * @param {string} type - Leaderboard type (duel, team, 5v5)
 * @param {string} operation - Operation filter (overall, addition, etc.)
 * @param {Array} data - Full leaderboard data array
 */
async function cacheLeaderboard(type, operation, data) {
    return safeRedisOp(async () => {
        const key = `cache:leaderboard:${type}:${operation}`;
        await redis.setex(key, CACHE_TTL.LEADERBOARD, JSON.stringify(data));
        return true;
    }, false);
}

/**
 * Get cached leaderboard data
 * @param {string} type - Leaderboard type
 * @param {string} operation - Operation filter
 * @returns {Array|null} Cached data or null if expired/missing
 */
async function getCachedLeaderboard(type, operation) {
    return safeRedisOp(async () => {
        const key = `cache:leaderboard:${type}:${operation}`;
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }, null);
}

/**
 * Cache user stats (for friend lists, social panels)
 * @param {string} userId - User ID
 * @param {Object} stats - Stats object
 */
async function cacheUserStats(userId, stats) {
    return safeRedisOp(async () => {
        const key = `cache:stats:${userId}`;
        await redis.setex(key, CACHE_TTL.PLAYER_STATS, JSON.stringify(stats));
        return true;
    }, false);
}

/**
 * Get cached user stats
 * @param {string} userId - User ID
 * @returns {Object|null} Cached stats or null
 */
async function getCachedUserStats(userId) {
    return safeRedisOp(async () => {
        const key = `cache:stats:${userId}`;
        const cached = await redis.get(key);
        return cached ? JSON.parse(cached) : null;
    }, null);
}

/**
 * Batch get cached user stats
 * @param {string[]} userIds - Array of user IDs
 * @returns {Object} Map of userId -> stats (only cached ones)
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
 * Invalidate leaderboard cache (call after ELO updates)
 * @param {string} type - Leaderboard type
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

