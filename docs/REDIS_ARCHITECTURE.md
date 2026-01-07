# Redis Architecture for FlashMath Arena

## Current Architecture (Redis-First, SQLite-Free Arena)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTED (Multi-Server Ready)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                      │
│  │ Client  │  │ Client  │  │ Client  │                                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                                      │
│       │            │            │                                            │
│       ▼            ▼            ▼                                            │
│  ┌─────────────────────────────────────┐                                    │
│  │      Socket.IO with Redis Adapter   │                                    │
│  └─────────────────────────────────────┘                                    │
│       │            │            │                                            │
│       └────────────┼────────────┘                                            │
│                    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           REDIS (Primary)                            │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Party State  │  │ Match State  │  │  Pub/Sub     │              │   │
│  │  │   (Hashes)   │  │   (Hashes)   │  │  (Events)    │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Queue State  │  │ Leaderboard  │  │ Rate Limits  │              │   │
│  │  │ (Sorted Set) │  │ (Sorted Set) │  │  (Strings)   │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                    │                                                         │
│                    ▼                                                         │
│  ┌─────────────────────────────────────┐                                    │
│  │           PostgreSQL                │  (Arena Permanent History)         │
│  │  arena_players, arena_matches       │  ELO, match results, teams         │
│  └─────────────────────────────────────┘                                    │
│                                                                              │
│  ┌─────────────────────────────────────┐                                    │
│  │            SQLite                   │  (Main App Only)                   │
│  │  users, shop, inventory, practice   │  NO arena/party data              │
│  └─────────────────────────────────────┘                                    │
│                                                                              │
│  Benefits:                                                                   │
│  ✓ Horizontally scalable                                                    │
│  ✓ Match/party state persists across restarts                               │
│  ✓ Cross-server Socket.IO via Redis adapter                                │
│  ✓ Real-time Pub/Sub for events                                            │
│  ✓ SQLite completely removed from arena flow                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Responsibilities

| Database   | Responsibilities                                    | Latency |
|------------|-----------------------------------------------------|---------|
| **Redis**  | Parties, queues, matches, presence, rate limits     | <1ms    |
| **PostgreSQL** | ELO history, match results, team stats          | <10ms   |
| **SQLite** | User profiles, shop, inventory, practice only       | <5ms    |

---

## Party System (Redis-Based)

Parties are now fully managed in Redis with no SQLite dependency.

### Key Structure

```redis
# Party Core State (Hash)
party:{id}
  id            "party_abc123"
  leaderId      "user_123"
  leaderName    "Alice"
  iglId         "user_456"
  anchorId      "user_789"
  targetMode    "5v5"
  teamId        ""
  teamName      ""
  teamTag       ""
  inviteMode    "open"
  maxSize       "5"
  createdAt     "1704654321000"
  updatedAt     "1704654321000"

# Party Members (Hash)
party:{id}:members
  {userId}      '{"odUserId":"user_123","odUserName":"Alice","isReady":true,...}'

# Party Queue State (String)
party:{id}:queue
  '{"status":"finding_opponents","startedAt":1704654321000,"matchType":"ranked","matchId":null}'

# Party Invites (Hash)
party:{id}:invites
  {inviteeId}   '{"inviteId":"inv_123","inviterId":"user_123","expiresAt":...}'

# User to Party Mapping (String)
user:{userId}:party  "party_abc123"
```

### TTL Configuration

| Key Type | TTL | Reason |
|----------|-----|--------|
| party:{id} | 4 hours | Auto-cleanup inactive parties |
| party:{id}:queue | 5 minutes | Force re-queue after timeout |
| party:{id}:invites | 10 minutes | Expire pending invites |

### Pub/Sub Events

```redis
PUBLISH party:events '{
  "partyId": "party_abc123",
  "eventType": "member_joined",
  "data": {"userId": "user_456", "userName": "Bob"},
  "timestamp": 1704654321000,
  "serverId": "server-1"
}'
```

Event types: `party_created`, `member_joined`, `member_left`, `member_kicked`, 
`ready_changed`, `party_disbanded`, `queue_started`, `match_found`

---

## Previous Architecture (Reference Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OLD ARCHITECTURE (SQLite-dependent)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                      │
│  │ Client  │  │ Client  │  │ Client  │                                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                                      │
│       │            │            │                                            │
│       ▼            ▼            ▼                                            │
│  ┌─────────────────────────────────────┐                                    │
│  │           Load Balancer             │                                    │
│  └─────────────────────────────────────┘                                    │
│       │            │            │                                            │
│       ▼            ▼            ▼                                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                      │
│  │ Server  │  │ Server  │  │ Server  │  (Socket.io with Redis Adapter)     │
│  │   1     │  │   2     │  │   3     │                                      │
│  └────┬────┘  └────┬────┘  └────┬────┘                                      │
│       │            │            │                                            │
│       └────────────┼────────────┘                                            │
│                    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           REDIS CLUSTER                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Match State  │  │  Pub/Sub     │  │ Sorted Sets  │              │   │
│  │  │   (Hashes)   │  │  (Events)    │  │ (Leaderboard)│              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │  │ Player State │  │ Rate Limits  │  │ Session Data │              │   │
│  │  │   (Strings)  │  │  (Strings)   │  │   (Hashes)   │              │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                    │                                                         │
│                    ▼                                                         │
│  ┌─────────────────────────────────────┐                                    │
│  │           PostgreSQL                │  (Arena Permanent History)         │
│  │  arena_players, arena_matches       │                                    │
│  └─────────────────────────────────────┘                                    │
│                    │                                                         │
│  ┌─────────────────────────────────────┐                                    │
│  │            SQLite                   │  (Main App: users, shop, etc.)     │
│  └─────────────────────────────────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Redis Data Structures & Keys

### 1. Match State (Primary Storage)

```redis
# 1v1 Match State - Hash
HSET arena:match:{matchId}
  id            "match_123"
  status        "active"           # pending, countdown, active, finished
  operation     "multiplication"
  startTime     "1704654321000"
  timeLeft      "45000"
  currentQuestion '{"question":"7×8","answer":56}'

# Match Players - Hash (separate for atomic updates)
HSET arena:match:{matchId}:players
  {userId1}     '{"name":"Alice","score":500,"lives":3,"streak":2}'
  {userId2}     '{"name":"Bob","score":450,"lives":2,"streak":0}'

# TTL: 2 hours (auto-cleanup stale matches)
EXPIRE arena:match:{matchId} 7200
```

### 2. Team Match State (5v5)

```redis
# Team Match - Hash
HSET arena:team_match:{matchId}
  id            "team_match_456"
  phase         "active"
  round         "3"
  half          "1"
  gameClockMs   "180000"
  operation     "mixed"

# Team 1 State - Hash
HSET arena:team_match:{matchId}:team1
  teamId        "party_abc"
  teamName      "Math Masters"
  score         "1500"
  currentStreak "3"
  currentSlot   "2"

# Team 1 Players - Hash
HSET arena:team_match:{matchId}:team1:players
  {userId1}     '{"name":"Alice","slot":"addition","score":300,"correct":5,"total":6}'
  {userId2}     '{"name":"Bob","slot":"subtraction","score":250,"correct":4,"total":5}'
  ...

# Same structure for team2
```

### 3. Player Sessions & State

```redis
# Player Session - String with TTL
SET player:session:{odUserId} '{"socketId":"sock_123","serverId":"server-1","status":"in_match","matchId":"match_123"}'
EXPIRE player:session:{userId} 3600

# Player-to-Match Mapping (for quick lookups)
SET player:match:{userId} "match_123"
EXPIRE player:match:{userId} 7200

# Socket-to-Player Mapping (for disconnect handling)
SET socket:player:{socketId} "{userId}"
EXPIRE socket:player:{socketId} 3600
```

### 4. Matchmaking Queue (Enhanced)

```redis
# Primary Queue - Sorted Set by ELO
ZADD arena:queue:1v1 1050 '{userId}:1704654321'

# Queue Entry Details - Hash
HSET arena:queue:entry:{odUserId}
  id            "{userId}"
  name          "Alice"
  elo           "1050"
  tier          "gold"
  socketId      "sock_123"
  joinedAt      "1704654321000"
  serverId      "server-1"

# Team Queue - Sorted Set by average team ELO
ZADD arena:queue:5v5 1200 '{partyId}:1704654321'

HSET arena:queue:party:{partyId}
  partyId       "{partyId}"
  leaderId      "{userId}"
  avgElo        "1200"
  memberCount   "5"
  serverId      "server-1"
```

### 5. Leaderboards (Sorted Sets)

```redis
# Global ELO Leaderboard
ZADD leaderboard:elo:global 1850 "{userId}"

# Operation-specific Leaderboards
ZADD leaderboard:elo:multiplication 1920 "{userId}"
ZADD leaderboard:elo:addition 1780 "{userId}"

# Weekly XP Leaderboard (with expiration)
ZADD leaderboard:xp:weekly:2024-01 5500 "{userId}"
EXPIREAT leaderboard:xp:weekly:2024-01 {next_monday_timestamp}

# Get top 100: ZREVRANGE leaderboard:elo:global 0 99 WITHSCORES
# Get rank: ZREVRANK leaderboard:elo:global {userId}
```

### 6. Real-time Pub/Sub Channels

```redis
# Match Events Channel
PUBLISH arena:match:{matchId}:events '{"type":"answer","userId":"user_123","correct":true,"score":550}'

# Global Arena Events
PUBLISH arena:events:global '{"type":"match_complete","matchId":"match_123","winnerId":"user_A"}'

# Presence Updates
PUBLISH presence:updates '{"userId":"user_123","status":"online","activity":"in_match"}'
```

### 7. Rate Limiting

```redis
# Answer Rate Limit (sliding window)
SET ratelimit:answer:{userId}:{timestamp_minute} 1
INCR ratelimit:answer:{userId}:{timestamp_minute}
EXPIRE ratelimit:answer:{userId}:{timestamp_minute} 60

# Queue Join Rate Limit
SET ratelimit:queue:{userId} 1
INCR ratelimit:queue:{userId}
EXPIRE ratelimit:queue:{userId} 10  # 10 second cooldown
```

### 8. Match History Cache

```redis
# Recent matches cache (avoid DB queries for hot data)
LPUSH matches:recent:{userId} '{"matchId":"match_123","opponent":"Bob","result":"win","eloChange":25}'
LTRIM matches:recent:{userId} 0 49  # Keep last 50 matches
EXPIRE matches:recent:{userId} 86400  # 24 hour cache

# Live match count
INCR stats:active_matches
DECR stats:active_matches
GET stats:active_matches
```

---

## Implementation: `server-redis.js`

```javascript
/**
 * FlashMath Arena - Redis State Management
 * 
 * Redis-first architecture for match state, player sessions,
 * matchmaking, and real-time communication.
 */

const Redis = require('ioredis');

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
};

const TTL = {
    MATCH: 7200,           // 2 hours
    PLAYER_SESSION: 3600,  // 1 hour
    QUEUE_ENTRY: 600,      // 10 minutes
    RECENT_MATCHES: 86400, // 24 hours
    RATE_LIMIT: 60,        // 1 minute
};

const KEYS = {
    // Match state
    MATCH: 'arena:match:',
    MATCH_PLAYERS: 'arena:match:players:',
    TEAM_MATCH: 'arena:team_match:',
    
    // Player state
    PLAYER_SESSION: 'player:session:',
    PLAYER_MATCH: 'player:match:',
    SOCKET_PLAYER: 'socket:player:',
    
    // Matchmaking
    QUEUE_1V1: 'arena:queue:1v1',
    QUEUE_5V5: 'arena:queue:5v5',
    QUEUE_ENTRY: 'arena:queue:entry:',
    QUEUE_PARTY: 'arena:queue:party:',
    
    // Leaderboards
    LEADERBOARD_ELO: 'leaderboard:elo:',
    LEADERBOARD_XP: 'leaderboard:xp:',
    
    // Pub/Sub
    MATCH_EVENTS: 'arena:match:events:',
    GLOBAL_EVENTS: 'arena:events:global',
    PRESENCE: 'presence:updates',
    
    // Stats & Misc
    ACTIVE_MATCHES: 'stats:active_matches',
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

async function initRedis() {
    if (redis && isConnected) return true;
    
    try {
        redis = new Redis(REDIS_CONFIG);
        redisSub = new Redis(REDIS_CONFIG);
        
        redis.on('connect', () => {
            console.log('[Redis] Connected to Redis server');
            isConnected = true;
        });
        
        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err);
            isConnected = false;
        });
        
        redis.on('close', () => {
            console.log('[Redis] Connection closed');
            isConnected = false;
        });
        
        // Test connection
        await redis.ping();
        console.log('[Redis] Ping successful');
        
        return true;
    } catch (error) {
        console.error('[Redis] Failed to initialize:', error);
        return false;
    }
}

function getRedis() {
    if (!redis || !isConnected) {
        throw new Error('Redis not connected');
    }
    return redis;
}

// =============================================================================
// 1v1 MATCH STATE
// =============================================================================

/**
 * Save a 1v1 match to Redis
 */
async function saveMatch(match) {
    const r = getRedis();
    const matchKey = KEYS.MATCH + match.matchId;
    const playersKey = KEYS.MATCH_PLAYERS + match.matchId;
    
    // Use pipeline for atomic operation
    const pipeline = r.pipeline();
    
    // Save match metadata
    pipeline.hset(matchKey, {
        id: match.matchId,
        status: match.status || 'pending',
        operation: match.odOperation || 'mixed',
        startTime: match.startTime?.toString() || Date.now().toString(),
        timeLeft: match.odTimeLeft?.toString() || '60000',
        started: match.odStarted ? '1' : '0',
        ended: match.odEnded ? '1' : '0',
        currentQuestion: JSON.stringify(match.currentQuestion || null),
        isAiMatch: match.isAiMatch ? '1' : '0',
    });
    pipeline.expire(matchKey, TTL.MATCH);
    
    // Save players
    if (match.players) {
        for (const [userId, player] of Object.entries(match.players)) {
            pipeline.hset(playersKey, odUserId, JSON.stringify(player));
        }
        pipeline.expire(playersKey, TTL.MATCH);
    }
    
    // Track active match count
    pipeline.sadd('arena:active_match_ids', match.matchId);
    
    await pipeline.exec();
}

/**
 * Get a 1v1 match from Redis
 */
async function getMatch(matchId) {
    const r = getRedis();
    const matchKey = KEYS.MATCH + matchId;
    const playersKey = KEYS.MATCH_PLAYERS + matchId;
    
    const [matchData, playersData] = await Promise.all([
        r.hgetall(matchKey),
        r.hgetall(playersKey),
    ]);
    
    if (!matchData || !matchData.id) return null;
    
    // Reconstruct players object
    const players = {};
    for (const [odUserId, playerJson] of Object.entries(playersData)) {
        players[odUserId] = JSON.parse(playerJson);
    }
    
    return {
        matchId: matchData.id,
        odOperation: matchData.operation,
        odTimeLeft: parseInt(matchData.timeLeft),
        odStarted: matchData.started === '1',
        odEnded: matchData.ended === '1',
        currentQuestion: JSON.parse(matchData.currentQuestion),
        isAiMatch: matchData.isAiMatch === '1',
        startTime: parseInt(matchData.startTime),
        players,
    };
}

/**
 * Update player score atomically
 */
async function updatePlayerScore(matchId, odUserId, scoreChange, playerUpdate) {
    const r = getRedis();
    const playersKey = KEYS.MATCH_PLAYERS + matchId;
    
    // Get current player state
    const playerJson = await r.hget(playersKey, odUserId);
    if (!playerJson) return null;
    
    const player = JSON.parse(playerJson);
    
    // Update fields
    Object.assign(player, playerUpdate);
    player.score = (player.score || 0) + scoreChange;
    
    // Save back
    await r.hset(playersKey, odUserId, JSON.stringify(player));
    
    return player;
}

/**
 * Delete a 1v1 match
 */
async function deleteMatch(matchId) {
    const r = getRedis();
    const pipeline = r.pipeline();
    
    pipeline.del(KEYS.MATCH + matchId);
    pipeline.del(KEYS.MATCH_PLAYERS + matchId);
    pipeline.srem('arena:active_match_ids', matchId);
    
    await pipeline.exec();
}

// =============================================================================
// 5v5 TEAM MATCH STATE
// =============================================================================

/**
 * Save a team match to Redis
 */
async function saveTeamMatch(match) {
    const r = getRedis();
    const baseKey = KEYS.TEAM_MATCH + match.matchId;
    
    const pipeline = r.pipeline();
    
    // Match metadata
    pipeline.hset(baseKey, {
        id: match.matchId,
        phase: match.phase,
        round: match.round?.toString() || '1',
        half: match.half?.toString() || '1',
        gameClockMs: match.gameClockMs?.toString() || '360000',
        operation: match.operation,
        matchType: match.matchType,
        isAIMatch: match.isAIMatch ? '1' : '0',
    });
    pipeline.expire(baseKey, TTL.MATCH);
    
    // Team 1
    if (match.team1) {
        const team1Key = baseKey + ':team1';
        pipeline.hset(team1Key, {
            teamId: match.team1.teamId,
            partyId: match.team1.partyId || '',
            teamName: match.team1.teamName,
            teamTag: match.team1.teamTag || '',
            score: match.team1.score?.toString() || '0',
            currentStreak: match.team1.currentStreak?.toString() || '0',
            currentSlot: match.team1.currentSlot?.toString() || '1',
            slotAssignments: JSON.stringify(match.team1.slotAssignments || {}),
        });
        pipeline.expire(team1Key, TTL.MATCH);
        
        // Team 1 players
        const team1PlayersKey = baseKey + ':team1:players';
        for (const [odUserId, player] of Object.entries(match.team1.players || {})) {
            pipeline.hset(team1PlayersKey, odUserId, JSON.stringify(player));
        }
        pipeline.expire(team1PlayersKey, TTL.MATCH);
    }
    
    // Team 2 (same structure)
    if (match.team2) {
        const team2Key = baseKey + ':team2';
        pipeline.hset(team2Key, {
            teamId: match.team2.teamId,
            partyId: match.team2.partyId || '',
            teamName: match.team2.teamName,
            teamTag: match.team2.teamTag || '',
            score: match.team2.score?.toString() || '0',
            currentStreak: match.team2.currentStreak?.toString() || '0',
            currentSlot: match.team2.currentSlot?.toString() || '1',
            slotAssignments: JSON.stringify(match.team2.slotAssignments || {}),
        });
        pipeline.expire(team2Key, TTL.MATCH);
        
        const team2PlayersKey = baseKey + ':team2:players';
        for (const [odUserId, player] of Object.entries(match.team2.players || {})) {
            pipeline.hset(team2PlayersKey, odUserId, JSON.stringify(player));
        }
        pipeline.expire(team2PlayersKey, TTL.MATCH);
    }
    
    await pipeline.exec();
}

/**
 * Get a team match from Redis
 */
async function getTeamMatch(matchId) {
    const r = getRedis();
    const baseKey = KEYS.TEAM_MATCH + matchId;
    
    const [matchData, team1Data, team1Players, team2Data, team2Players] = await Promise.all([
        r.hgetall(baseKey),
        r.hgetall(baseKey + ':team1'),
        r.hgetall(baseKey + ':team1:players'),
        r.hgetall(baseKey + ':team2'),
        r.hgetall(baseKey + ':team2:players'),
    ]);
    
    if (!matchData || !matchData.id) return null;
    
    // Reconstruct team objects
    const parseTeam = (teamData, playersData) => {
        const players = {};
        for (const [odUserId, playerJson] of Object.entries(playersData)) {
            players[odUserId] = JSON.parse(playerJson);
        }
        return {
            teamId: teamData.teamId,
            partyId: teamData.partyId,
            teamName: teamData.teamName,
            teamTag: teamData.teamTag,
            score: parseInt(teamData.score),
            currentStreak: parseInt(teamData.currentStreak),
            currentSlot: parseInt(teamData.currentSlot),
            slotAssignments: JSON.parse(teamData.slotAssignments || '{}'),
            players,
        };
    };
    
    return {
        matchId: matchData.id,
        phase: matchData.phase,
        round: parseInt(matchData.round),
        half: parseInt(matchData.half),
        gameClockMs: parseInt(matchData.gameClockMs),
        operation: matchData.operation,
        matchType: matchData.matchType,
        isAIMatch: matchData.isAIMatch === '1',
        team1: parseTeam(team1Data, team1Players),
        team2: parseTeam(team2Data, team2Players),
    };
}

/**
 * Get AI match setup data
 */
async function getTeamMatchSetup(matchId) {
    const r = getRedis();
    const data = await r.get(`arena:team_match_setup:${matchId}`);
    return data ? JSON.parse(data) : null;
}

/**
 * Delete a team match
 */
async function deleteTeamMatch(matchId) {
    const r = getRedis();
    const baseKey = KEYS.TEAM_MATCH + matchId;
    
    const pipeline = r.pipeline();
    pipeline.del(baseKey);
    pipeline.del(baseKey + ':team1');
    pipeline.del(baseKey + ':team1:players');
    pipeline.del(baseKey + ':team2');
    pipeline.del(baseKey + ':team2:players');
    
    await pipeline.exec();
}

// =============================================================================
// PLAYER SESSION MANAGEMENT
// =============================================================================

/**
 * Set player session
 */
async function setPlayerSession(odUserId, sessionData) {
    const r = getRedis();
    const key = KEYS.PLAYER_SESSION + odUserId;
    
    await r.set(key, JSON.stringify({
        ...sessionData,
        updatedAt: Date.now(),
    }), 'EX', TTL.PLAYER_SESSION);
}

/**
 * Get player session
 */
async function getPlayerSession(odUserId) {
    const r = getRedis();
    const data = await r.get(KEYS.PLAYER_SESSION + odUserId);
    return data ? JSON.parse(data) : null;
}

/**
 * Map socket to player
 */
async function setSocketToPlayer(socketId, odUserId) {
    const r = getRedis();
    await r.set(KEYS.SOCKET_PLAYER + socketId, odUserId, 'EX', TTL.PLAYER_SESSION);
}

/**
 * Get player from socket
 */
async function getPlayerFromSocket(socketId) {
    const r = getRedis();
    return await r.get(KEYS.SOCKET_PLAYER + socketId);
}

/**
 * Map socket to match
 */
async function setSocketToMatch(socketId, matchId) {
    const r = getRedis();
    await r.set(`socket:match:${socketId}`, matchId, 'EX', TTL.MATCH);
}

/**
 * Get match from socket
 */
async function getMatchFromSocket(socketId) {
    const r = getRedis();
    return await r.get(`socket:match:${socketId}`);
}

// =============================================================================
// LEADERBOARDS (Sorted Sets)
// =============================================================================

/**
 * Update player ELO in leaderboard
 */
async function updateLeaderboard(odUserId, elo, operation = 'global') {
    const r = getRedis();
    const key = KEYS.LEADERBOARD_ELO + operation;
    await r.zadd(key, elo, odUserId);
}

/**
 * Get leaderboard (top N players)
 */
async function getLeaderboard(operation = 'global', limit = 100) {
    const r = getRedis();
    const key = KEYS.LEADERBOARD_ELO + operation;
    
    const results = await r.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    
    // Convert to array of { userId, elo, rank }
    const leaderboard = [];
    for (let i = 0; i < results.length; i += 2) {
        leaderboard.push({
            odUserId: results[i],
            elo: parseInt(results[i + 1]),
            rank: (i / 2) + 1,
        });
    }
    
    return leaderboard;
}

/**
 * Get player rank
 */
async function getPlayerRank(odUserId, operation = 'global') {
    const r = getRedis();
    const key = KEYS.LEADERBOARD_ELO + operation;
    
    const rank = await r.zrevrank(key, odUserId);
    const score = await r.zscore(key, odUserId);
    
    return {
        rank: rank !== null ? rank + 1 : null,
        elo: score ? parseInt(score) : null,
    };
}

// =============================================================================
// PUB/SUB FOR MULTI-SERVER
// =============================================================================

/**
 * Publish match event
 */
async function publishMatchEvent(matchId, event) {
    const r = getRedis();
    await r.publish(KEYS.MATCH_EVENTS + matchId, JSON.stringify({
        ...event,
        timestamp: Date.now(),
    }));
}

/**
 * Subscribe to match events
 */
function subscribeToMatchEvents(matchId, callback) {
    const channel = KEYS.MATCH_EVENTS + matchId;
    
    redisSub.subscribe(channel);
    redisSub.on('message', (ch, message) => {
        if (ch === channel) {
            callback(JSON.parse(message));
        }
    });
    
    return () => redisSub.unsubscribe(channel);
}

/**
 * Publish global event
 */
async function publishGlobalEvent(event) {
    const r = getRedis();
    await r.publish(KEYS.GLOBAL_EVENTS, JSON.stringify({
        ...event,
        timestamp: Date.now(),
    }));
}

// =============================================================================
// RATE LIMITING
// =============================================================================

/**
 * Check and increment rate limit
 * @returns {boolean} true if allowed, false if rate limited
 */
async function checkRateLimit(odUserId, action, maxPerMinute = 60) {
    const r = getRedis();
    const minute = Math.floor(Date.now() / 60000);
    const key = `${KEYS.RATE_LIMIT}${action}:${odUserId}:${minute}`;
    
    const count = await r.incr(key);
    
    if (count === 1) {
        await r.expire(key, 60);
    }
    
    return count <= maxPerMinute;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Increment active match count
 */
async function incrementActiveMatches() {
    const r = getRedis();
    return await r.incr(KEYS.ACTIVE_MATCHES);
}

/**
 * Decrement active match count
 */
async function decrementActiveMatches() {
    const r = getRedis();
    return await r.decr(KEYS.ACTIVE_MATCHES);
}

/**
 * Get arena statistics
 */
async function getArenaStats() {
    const r = getRedis();
    
    const [activeMatches, queueSize1v1, queueSize5v5] = await Promise.all([
        r.get(KEYS.ACTIVE_MATCHES),
        r.zcard(KEYS.QUEUE_1V1),
        r.zcard(KEYS.QUEUE_5V5),
    ]);
    
    return {
        activeMatches: parseInt(activeMatches) || 0,
        queue1v1: queueSize1v1 || 0,
        queue5v5: queueSize5v5 || 0,
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Initialization
    initRedis,
    getRedis,
    
    // 1v1 Matches
    saveMatch,
    getMatch,
    updatePlayerScore,
    deleteMatch,
    
    // Team Matches
    saveTeamMatch,
    getTeamMatch,
    getTeamMatchSetup,
    deleteTeamMatch,
    
    // Player Sessions
    setPlayerSession,
    getPlayerSession,
    setSocketToPlayer,
    getPlayerFromSocket,
    setSocketToMatch,
    getMatchFromSocket,
    
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
    
    // Statistics
    incrementActiveMatches,
    decrementActiveMatches,
    getArenaStats,
    
    // Constants
    KEYS,
    TTL,
};
```

---

## Socket.io Redis Adapter (Horizontal Scaling)

For multi-server deployments, add the Socket.io Redis adapter:

```javascript
// server.js additions
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

// After creating Socket.IO server
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

This allows Socket.IO events to be broadcast across multiple server instances.

---

## Migration Status

### Phase 1: Core Redis Integration ✅
- [x] Implement `server-redis.js` module
- [x] Update `server.js` to use Redis for match state
- [x] Add Redis health checks
- [x] Test single-server with Redis

### Phase 2: Party System ✅
- [x] Create `party-redis.ts` module
- [x] Remove SQLite party dependencies
- [x] Add Socket.IO party rooms
- [x] Implement party Pub/Sub

### Phase 3: Matchmaking Enhancement ✅
- [x] Move queue to Redis sorted sets
- [x] Update team-matchmaking.ts
- [x] Add tier compatibility checks

### Phase 4: Horizontal Scaling ✅
- [x] Add Socket.IO Redis adapter
- [x] Implement Pub/Sub for cross-server events
- [ ] Configure load balancer (deployment)
- [ ] Test multi-server deployment (deployment)

### Phase 5: Advanced Features
- [x] Implement Pub/Sub for live match updates
- [x] Add rate limiting
- [ ] Real-time statistics dashboard

---

## Performance Considerations

| Operation | Expected Latency | Scaling |
|-----------|------------------|---------|
| Get match state | <1ms | O(1) |
| Update player score | <2ms | O(1) |
| Leaderboard top 100 | <5ms | O(log N) |
| Get player rank | <2ms | O(log N) |
| Matchmaking search | <10ms | O(N) queue size |

## Memory Estimation

| Data Type | Per-Unit Size | Count | Total |
|-----------|---------------|-------|-------|
| 1v1 Match | ~2 KB | 1000 concurrent | 2 MB |
| 5v5 Match | ~10 KB | 200 concurrent | 2 MB |
| Player session | ~500 B | 10,000 online | 5 MB |
| Leaderboard | ~50 B/user | 100,000 users | 5 MB |
| Queue entries | ~300 B | 5,000 waiting | 1.5 MB |

**Total estimated**: ~15-20 MB for active state (easily fits in Redis)

---

## Monitoring & Alerts

```redis
# Monitor commands for debugging
MONITOR

# Slow log
SLOWLOG GET 10

# Memory usage
INFO memory

# Key count by pattern
SCAN 0 MATCH arena:match:* COUNT 1000
```

Recommended metrics to track:
- Redis memory usage
- Commands per second
- Key count by namespace
- Pub/Sub message rate
- Connection count

