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
// 100-TIER SYSTEM BANDS
// =============================================================================
// math_tiers JSON stores tier LEVELS (1-100) per operation
// These are organized into 5 bands of 20 tiers each

export const TIER_BANDS = {
    FOUNDATION:   { id: 1, name: 'Foundation',   shortName: 'F', range: [1, 20] },
    INTERMEDIATE: { id: 2, name: 'Intermediate', shortName: 'I', range: [21, 40] },
    ADVANCED:     { id: 3, name: 'Advanced',     shortName: 'A', range: [41, 60] },
    EXPERT:       { id: 4, name: 'Expert',       shortName: 'E', range: [61, 80] },
    MASTER:       { id: 5, name: 'Master',       shortName: 'M', range: [81, 100] }
};

/**
 * Get the band for a given tier level (1-100)
 * @param {number} tier - Tier level (1-100)
 * @returns {Object} Band object with id, name, shortName, range
 */
export function getBandForTier(tier) {
    if (tier <= 20) return TIER_BANDS.FOUNDATION;
    if (tier <= 40) return TIER_BANDS.INTERMEDIATE;
    if (tier <= 60) return TIER_BANDS.ADVANCED;
    if (tier <= 80) return TIER_BANDS.EXPERT;
    return TIER_BANDS.MASTER;
}

/**
 * Get display name for a tier (e.g., "Advanced 45" or "Master 92")
 * @param {number} tier - Tier level (1-100)
 * @returns {string} Display name
 */
export function getTierDisplayName(tier) {
    const band = getBandForTier(tier);
    return `${band.name} ${tier}`;
}

// Legacy mapping for backwards compatibility (0-4 → band id)
// Used during migration period
export const SKILL_TIER_LEVELS = {
    0: { name: 'Foundation', id: 1, tier: 10 },    // Map old 0 → Foundation mid-point
    1: { name: 'Intermediate', id: 2, tier: 30 },  // Map old 1 → Intermediate mid-point
    2: { name: 'Advanced', id: 3, tier: 50 },      // Map old 2 → Advanced mid-point
    3: { name: 'Expert', id: 4, tier: 70 },        // Map old 3 → Expert mid-point
    4: { name: 'Master', id: 5, tier: 90 }         // Map old 4 → Master mid-point
};

// Operations tracked in math_tiers
export const OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division'];

// =============================================================================
// MATCHMAKING CONFIGURATION (100-Tier System)
// =============================================================================
// The 100-tier system has 5 bands of 20 tiers each:
// - Foundation (F): 1-20
// - Intermediate (I): 21-40
// - Advanced (A): 41-60
// - Expert (E): 61-80
// - Master (M): 81-100

export const MATCHMAKING = {
    // Gate 1: Tier Compatibility (100-tier system)
    // ±20 tiers = approximately one band width
    // This keeps players within similar skill levels while allowing some flexibility
    TIER_RANGE: 20,

    // Gate 2: ELO Proximity with Expanding Range
    // Starts with a reasonable range, expands over time to reduce queue times
    INITIAL_ELO_RANGE: 100,       // Start matching within ±100 ELO (reasonable for fair matches)
    ELO_EXPANSION_RATE: 50,       // Expand by 50 ELO every expansion interval (faster matching)
    ELO_EXPANSION_INTERVAL: 5000, // Expand every 5 seconds (faster expansion)
    MAX_ELO_RANGE: 300,           // Cap at ±300 ELO difference

    // Gate 3: Confidence-Based Matchmaking (replaces hard gating)
    // Instead of blocking low-confidence players, we match them with similar players
    CONFIDENCE_BRACKETS: {
        NEWCOMER:     { min: 0.00, max: 0.30, label: 'Newcomer',    priority: 1 },
        DEVELOPING:   { min: 0.30, max: 0.70, label: 'Developing',  priority: 2 },
        ESTABLISHED:  { min: 0.70, max: 1.00, label: 'Established', priority: 3 }
    },
    // Prefer matching within same confidence bracket (soft preference, not hard gate)
    CONFIDENCE_BRACKET_WEIGHT: 50,  // Extra ELO-equivalent penalty for mismatched brackets

    // Queue settings
    QUEUE_TIMEOUT: 120000,        // 2 minutes max wait time
    MATCH_READY_TIMEOUT: 15000,   // 15 seconds to accept match
    AI_FALLBACK_TIMEOUT: 15000,   // Start AI match after 15 seconds if no human found

    // Default ELO for new players
    DEFAULT_ELO: 1000,

    // High-Rank Quality Matching (Diamond+)
    // At high ranks, additionally consider APS history for better match quality
    HIGH_RANK_ELO_THRESHOLD: 2000, // Diamond starts at 2000 ELO
    HIGH_RANK_APS_WEIGHT: 0.15,    // APS contributes 15% to match score at high ranks
    HIGH_RANK_CONFIDENCE_STRICT: true // Require same confidence bracket at high ranks
};

// =============================================================================
// DECAY & RETURNING PLAYER SYSTEM
// =============================================================================
// Skills decay without practice. This keeps rankings accurate and encourages
// regular play. Returning players get placement matches for fair re-calibration.

export const DECAY = {
    // Grace period - no decay
    GRACE_PERIOD_DAYS: 7,         // No decay for first 7 days of inactivity
    
    // Warning phase (8-14 days)
    WARNING_START_DAYS: 8,        // Start warning at day 8
    WARNING_ELO_DECAY_PER_DAY: 5, // -5 ELO per day during warning
    
    // Active decay phase (15-30 days)
    DECAY_START_DAYS: 15,         // Full decay starts at day 15
    DECAY_ELO_PER_DAY: 10,        // -10 ELO per day
    
    // Severe decay (31+ days)
    SEVERE_DECAY_START_DAYS: 31,
    SEVERE_ELO_PER_DAY: 15,       // -15 ELO per day
    TIER_DECAY_PER_WEEK: 1,       // -1 tier per week at severe decay
    
    // Returning player threshold
    RETURNING_PLAYER_DAYS: 60,    // Flagged as returning player after 60 days
    
    // Decay caps (prevent going too low)
    MIN_ELO_FLOOR: 200,           // ELO cannot drop below 200
    MIN_TIER_FLOOR: 1,            // Tier cannot drop below 1 (F1)
    
    // Confidence threshold for returning player flag
    LOW_CONFIDENCE_THRESHOLD: 0.15  // Below 15% triggers returning player status
};

export const PLACEMENT = {
    // Returning player placement matches
    MATCHES_REQUIRED: 3,          // 3 placement matches to recalibrate
    ELO_MULTIPLIER: 2.0,          // K-factor doubled during placement
    
    // Soft reset for moderate inactivity (30-60 days)
    SOFT_RESET_ELO_PENALTY: 100,  // -100 ELO for soft reset
    SOFT_RESET_DAYS: 30,          // Soft reset triggers after 30 days
    
    // Match other returning players when possible
    PREFER_RETURNING_PLAYERS: true,
    RETURNING_PLAYER_WEIGHT: 100  // Heavy preference for matching returning players together
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
    FULL_CONFIDENCE_THRESHOLD: 0.7,    // At confidence>=0.7, full K factor

    // =================================================================
    // PERFORMANCE-BASED ELO BONUSES (Speed & Accuracy Integration)
    // =================================================================
    
    // APS-Scaled K-Factor Multipliers
    // Higher APS = bigger gains for winners, smaller losses for losers
    APS_TIERS: {
        ELITE:    { min: 800, winnerMult: 1.25, loserMult: 0.75 },  // Elite performance
        HIGH:     { min: 600, winnerMult: 1.10, loserMult: 0.90 },  // High performance
        BASELINE: { min: 400, winnerMult: 1.00, loserMult: 1.00 },  // Average
        LOW:      { min: 200, winnerMult: 0.90, loserMult: 1.10 },  // Below average
        POOR:     { min: 0,   winnerMult: 0.75, loserMult: 1.25 }   // Poor performance
    },

    // Threshold Bonuses (flat ELO additions)
    // Awarded for meeting specific performance thresholds
    PERFORMANCE_BONUSES: {
        // Accuracy bonuses (mutually exclusive - highest applies)
        ACCURACY_PERFECT: { threshold: 1.00, bonus: 8 },  // 100% accuracy
        ACCURACY_HIGH:    { threshold: 0.90, bonus: 5 },  // 90%+ accuracy
        ACCURACY_GOOD:    { threshold: 0.80, bonus: 2 },  // 80%+ accuracy

        // Speed bonuses (mutually exclusive - highest applies)
        SPEED_DEMON:      { threshold: 2000, bonus: 5 },  // Avg < 2 seconds (in ms)
        SPEED_QUICK:      { threshold: 3000, bonus: 2 },  // Avg < 3 seconds (in ms)

        // Streak bonuses (mutually exclusive - highest applies)
        STREAK_HOT:       { threshold: 10, bonus: 5 },    // 10+ streak
        STREAK_SOLID:     { threshold: 5,  bonus: 2 }     // 5+ streak
    },

    // Bonus caps to prevent runaway ELO gains
    MAX_WINNER_BONUS: 10,  // Winners can earn max +10 from bonuses
    MAX_LOSER_BONUS: 5,    // Losers can earn max +5 from bonuses (reduces loss)

    // Loser Protection - reduce ELO loss based on APS
    LOSER_PROTECTION: {
        HIGH_APS: { threshold: 700, multiplier: 0.75 },   // Lose only 75%
        MID_APS:  { threshold: 500, multiplier: 0.85 },   // Lose only 85%
        LOW_APS:  { threshold: 0,   multiplier: 1.00 }    // Full loss
    }
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
    REDIS_KEYS,
    DECAY,
    PLACEMENT
};
