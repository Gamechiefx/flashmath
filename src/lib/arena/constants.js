/**
 * FlashMath Arena - Shared Constants
 * 
 * Central configuration for the multiplayer arena system.
 * These values are shared between matchmaker, game loop, and client.
 */

// =============================================================================
// PRACTICE TIER DEFINITIONS
// =============================================================================
// XP-based tiers (legacy, used for display)
// Reference: Bronze (0-299), Silver (300-599), Gold (600-799), 
//            Platinum (800-949), Diamond (950+)

export const PRACTICE_TIERS = {
    BRONZE: { id: 0, name: 'Bronze', minXP: 0, maxXP: 299 },
    SILVER: { id: 1, name: 'Silver', minXP: 300, maxXP: 599 },
    GOLD: { id: 2, name: 'Gold', minXP: 600, maxXP: 799 },
    PLATINUM: { id: 3, name: 'Platinum', minXP: 800, maxXP: 949 },
    DIAMOND: { id: 4, name: 'Diamond', minXP: 950, maxXP: Infinity }
};

// Ordered array for tier lookups
export const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

// =============================================================================
// PER-OPERATION SKILL TIER LEVELS
// =============================================================================
// math_tiers JSON stores tier LEVELS (0-4) per operation
// These map to Practice Tier names for matchmaking

export const SKILL_TIER_LEVELS = {
    0: { name: 'Bronze', id: 0 },
    1: { name: 'Silver', id: 1 },
    2: { name: 'Gold', id: 2 },
    3: { name: 'Platinum', id: 3 },
    4: { name: 'Diamond', id: 4 }
};

// Operations tracked in math_tiers
export const OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division'];

// =============================================================================
// MATCHMAKING CONFIGURATION
// =============================================================================

export const MATCHMAKING = {
    // Gate 1: Tier Compatibility - users must be within ±TIER_RANGE tiers
    TIER_RANGE: 1,

    // Gate 2: Elo Proximity
    INITIAL_ELO_RANGE: 50,      // Start matching within ±50 Elo
    ELO_EXPANSION_RATE: 25,     // Expand by 25 Elo every expansion interval
    ELO_EXPANSION_INTERVAL: 10000, // Expand every 10 seconds
    MAX_ELO_RANGE: 300,         // Cap at ±300 Elo difference

    // Anti-Smurf: Practice Confidence threshold
    MIN_CONFIDENCE_SCORE: 0.3,  // Minimum confidence (0-1) to enter matchmaking

    // Queue settings
    QUEUE_TIMEOUT: 120000,      // 2 minutes max wait time
    MATCH_READY_TIMEOUT: 15000, // 15 seconds to accept match

    // Default Elo for new players
    DEFAULT_ELO: 1000
};

// =============================================================================
// GAME LOOP CONFIGURATION
// =============================================================================

export const GAME = {
    // Match settings - 60 seconds to answer as many questions as possible
    MATCH_DURATION: 60000,      // Total match time in ms
    MAX_ANSWER_TIME: 60000,     // Full match duration (no per-question limit)
    COUNTDOWN_DURATION: 20000,  // 20 second countdown before match
    QUESTION_DELAY: 500,        // 0.5 seconds between questions (fast pacing)

    // =================================================================
    // ARENA PERFORMANCE SCORE (APS) WEIGHTS
    // Spec: Accuracy 40%, Streak 35%, Speed 25%
    // =================================================================
    APS_WEIGHTS: {
        ACCURACY: 0.40,
        STREAK: 0.35,
        SPEED: 0.25
    },

    // Speed is penalized if accuracy drops below this threshold
    SPEED_PENALTY_ACCURACY_THRESHOLD: 0.70,
    SPEED_PENALTY_MULTIPLIER: 0.5,

    // Legacy point-based scoring (still used for in-match display)
    CORRECT_ANSWER_POINTS: 100,
    WRONG_ANSWER_PENALTY: -10,
    SPEED_BONUS_MULTIPLIER: 2,

    // Lives system
    STARTING_LIVES: 3,

    // =================================================================
    // ELO CONFIGURATION
    // =================================================================
    ELO_K_FACTOR: 32,

    // Confidence-scaled K: Low confidence = dampened ELO changes
    MIN_CONFIDENCE_K_MULTIPLIER: 0.5,  // At confidence=0.3, K is halved
    FULL_CONFIDENCE_THRESHOLD: 0.7     // At confidence>=0.7, full K factor
};

// =============================================================================
// SOCKET.IO EVENTS
// =============================================================================

export const EVENTS = {
    // Client -> Server
    QUEUE_JOIN: 'queue:join',
    QUEUE_LEAVE: 'queue:leave',
    MATCH_ACCEPT: 'match:accept',
    MATCH_DECLINE: 'match:decline',
    ANSWER_SUBMIT: 'answer:submit',

    // Server -> Client
    QUEUE_UPDATE: 'queue:update',
    MATCH_FOUND: 'match:found',
    MATCH_START: 'match:start',
    QUESTION_START: 'question:start',
    QUESTION_NEXT: 'question:next',
    MATCH_UPDATE: 'match:update',
    MATCH_END: 'match:end',
    GAME_OVER: 'game:over',

    // Errors
    ERROR: 'arena:error'
};

// =============================================================================
// REDIS KEYS
// =============================================================================

export const REDIS_KEYS = {
    MATCHMAKING_QUEUE: 'arena:queue',
    ACTIVE_MATCHES: 'arena:matches',
    PLAYER_STATE: 'arena:player:',    // + playerId
    MATCH_STATE: 'arena:match:',      // + matchId
    LOSS_STREAK: 'arena:losses:'      // + playerId (for tilt protection)
};

// =============================================================================
// LEAGUE SYSTEM
// =============================================================================
// Leagues are cosmetic/motivational, based on ELO ranges
// Each league has 3 divisions (I, II, III)

export const LEAGUES = {
    BRONZE: { id: 0, name: 'Bronze', minElo: 0, maxElo: 1099 },
    SILVER: { id: 1, name: 'Silver', minElo: 1100, maxElo: 1399 },
    GOLD: { id: 2, name: 'Gold', minElo: 1400, maxElo: 1699 },
    PLATINUM: { id: 3, name: 'Platinum', minElo: 1700, maxElo: 1999 },
    DIAMOND: { id: 4, name: 'Diamond', minElo: 2000, maxElo: Infinity }
};

export const LEAGUE_CONFIG = {
    DIVISIONS_PER_LEAGUE: 3,
    DEMOTION_PROTECTION_GAMES: 3,  // Games of protection after promotion
    MIN_PRACTICE_TIER_FOR_PROMOTION: true  // Require matching practice tier
};

module.exports = {
    PRACTICE_TIERS,
    TIER_ORDER,
    MATCHMAKING,
    GAME,
    EVENTS,
    REDIS_KEYS
};
