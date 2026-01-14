/**
 * FlashMath Arena - SQLite Practice Data Bridge
 * 
 * Bridges SQLite practice data to the Arena matchmaking system.
 * Reads Practice Tier, XP, and calculates Confidence from session history.
 * 
 * Data Flow:
 * SQLite (users.total_xp, math_tiers, practice_sessions) 
 *    → calculatePracticeTier() + calculateConfidence()
 *    → Matchmaker.joinQueue()
 * 
 * @module sqlite-bridge
 */

const Database = require('better-sqlite3');
const path = require('path');
const {
    PRACTICE_TIERS,
    TIER_ORDER,
    MATCHMAKING,
    SKILL_TIER_LEVELS,
    TIER_BANDS,
    getBandForTier,
    getTierDisplayName,
    OPERATIONS
} = require('./constants.js');

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

let db = null;

/**
 * Get SQLite database connection
 */
function getDatabase() {
    if (db) return db;

    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');
    db = new Database(dbPath, { readonly: true }); // Read-only for Arena

    return db;
}

// =============================================================================
// PRACTICE TIER CALCULATION
// =============================================================================

/**
 * Calculate practice tier from user's total XP
 * Uses the tier thresholds defined in constants:
 * Bronze (0-299), Silver (300-599), Gold (600-799), Platinum (800-949), Diamond (950+)
 * 
 * @param {number} totalXP - User's total practice XP
 * @returns {Object} Tier object with id, name, key
 */
function calculatePracticeTierFromXP(totalXP) {
    for (const tierKey of TIER_ORDER) {
        const tier = PRACTICE_TIERS[tierKey];
        if (totalXP >= tier.minXP && totalXP <= tier.maxXP) {
            return { ...tier, key: tierKey };
        }
    }
    return { ...PRACTICE_TIERS.BRONZE, key: 'BRONZE' };
}

/**
 * Calculate an aggregate tier from math_tiers JSON
 * Takes the average tier across all operations
 * 
 * @param {Object} mathTiers - JSON object like {addition: 2, subtraction: 1, ...}
 * @returns {number} Average tier level (0-4)
 */
function calculateAggregateMathTier(mathTiers) {
    let totalTier = 0;
    let count = 0;

    for (const op of OPERATIONS) {
        if (typeof mathTiers[op] === 'number') {
            totalTier += mathTiers[op];
            count++;
        }
    }

    return count > 0 ? Math.floor(totalTier / count) : 0;
}

// =============================================================================
// PER-OPERATION TIER MATCHING (SPEC REQUIREMENT)
// =============================================================================

/**
 * Get the lowest operation tier from math_tiers
 * Per spec: "Use lowest relevant operation tier to prevent skill masking"
 * 
 * UPDATED FOR 100-TIER SYSTEM:
 * - math_tiers now stores values 1-100 per operation
 * - Returns band info for matchmaking (±20 tier range)
 * 
 * @param {Object} mathTiers - JSON object like {addition: 45, subtraction: 32, ...}
 * @param {string[]} relevantOperations - Operations relevant to game mode (defaults to all)
 * @returns {Object} { tierLevel, tierName, bandId, weakestOperation, operationTiers }
 */
function getLowestOperationTier(mathTiers, relevantOperations = OPERATIONS) {
    const operationTiers = {};
    let lowestTier = 100; // Start at max (Master 100)
    let lowestOperation = null;

    for (const op of relevantOperations) {
        // Get tier value (1-100), default to 1 if not set
        let tier = typeof mathTiers[op] === 'number' ? mathTiers[op] : 1;
        
        // Handle legacy 0-4 values by mapping to 100-tier equivalents
        if (tier >= 0 && tier <= 4) {
            const legacyMapping = SKILL_TIER_LEVELS[tier];
            if (legacyMapping) {
                tier = legacyMapping.tier; // Convert 0-4 to 1-100 range
            }
        }
        
        // Clamp to valid range
        tier = Math.max(1, Math.min(100, tier));
        
        const band = getBandForTier(tier);
        operationTiers[op] = {
            tier: tier,
            band: band,
            displayName: getTierDisplayName(tier)
        };

        if (tier < lowestTier) {
            lowestTier = tier;
            lowestOperation = op;
        }
    }

    const lowestBand = getBandForTier(lowestTier);

    return {
        tierLevel: lowestTier,              // 1-100
        tierName: lowestBand.name,          // 'Foundation', 'Intermediate', etc.
        bandId: lowestBand.id,              // 1-5
        bandShortName: lowestBand.shortName, // 'F', 'I', 'A', 'E', 'M'
        displayName: getTierDisplayName(lowestTier), // 'Advanced 45'
        weakestOperation: lowestOperation,  // Which operation is holding them back
        operationTiers: operationTiers      // Full breakdown per operation
    };
}

/**
 * Calculate per-operation accuracy from recent sessions
 * Used to detect instability (recent accuracy drops)
 * 
 * @param {string} userId - User ID
 * @returns {Object} Per-operation accuracy stats
 */
function getOperationAccuracy(userId) {
    const database = getDatabase();

    const stats = database.prepare(`
        SELECT 
            operation,
            SUM(correct_count) as correct,
            SUM(total_count) as total
        FROM practice_sessions
        WHERE user_id = ? AND created_at > datetime('now', '-7 days')
        GROUP BY operation
    `).all(userId);

    const result = {};
    for (const op of OPERATIONS) {
        const opStats = stats.find(s => s.operation === op);
        if (opStats && opStats.total > 0) {
            result[op] = {
                accuracy: Math.round((opStats.correct / opStats.total) * 100),
                total: opStats.total,
                correct: opStats.correct
            };
        } else {
            result[op] = { accuracy: null, total: 0, correct: 0 };
        }
    }

    return result;
}

// =============================================================================
// CONFIDENCE CALCULATION
// =============================================================================

/**
 * Calculate Practice Confidence score for anti-smurf detection
 * Queries SQLite for session history to compute:
 * - Volume: Total practice sessions
 * - Consistency: Sessions per week
 * - Recency: Days since last practice
 * 
 * @param {string} userId - User ID
 * @returns {Object} { score: 0-1, stats: { totalSessions, ... } }
 */
function calculatePracticeConfidence(userId) {
    const database = getDatabase();

    // Get user creation date and basic info
    const user = database.prepare(`
        SELECT created_at, last_active FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
        return { score: 0, stats: { totalSessions: 0 } };
    }

    // Count total practice sessions
    const sessionCount = database.prepare(`
        SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = ?
    `).get(userId);

    // Get most recent session
    const lastSession = database.prepare(`
        SELECT created_at FROM practice_sessions 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
    `).get(userId);

    // Calculate stats
    const totalSessions = sessionCount?.count || 0;

    const accountCreated = new Date(user.created_at);
    const now = new Date();
    const accountAgeDays = Math.max(1, Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24)));

    let daysSinceLastPractice = 30; // Default to 30 if no sessions
    if (lastSession) {
        const lastPracticeDate = new Date(lastSession.created_at);
        daysSinceLastPractice = Math.floor((now - lastPracticeDate) / (1000 * 60 * 60 * 24));
    }

    // Calculate confidence factors
    // Volume factor: Logarithmic scale, caps around 50 sessions
    const volumeFactor = Math.min(1, Math.log10(totalSessions + 1) / Math.log10(51));

    // Consistency factor: Sessions per week, capped at 7
    const weeksActive = Math.max(1, accountAgeDays / 7);
    const sessionsPerWeek = totalSessions / weeksActive;
    const consistencyFactor = Math.min(1, sessionsPerWeek / 7);

    // Recency factor: Decays if no practice in last 7 days
    const recencyFactor = daysSinceLastPractice <= 7
        ? 1
        : Math.max(0, 1 - (daysSinceLastPractice - 7) / 30);

    // Weighted combination
    const confidence = (volumeFactor * 0.4) + (consistencyFactor * 0.3) + (recencyFactor * 0.3);

    return {
        score: Math.round(confidence * 100) / 100,
        stats: {
            totalSessions,
            accountAgeDays,
            daysSinceLastPractice,
            sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10
        }
    };
}

// =============================================================================
// MAIN BRIDGE FUNCTION
// =============================================================================

/**
 * Get complete Arena matchmaking data for a user from SQLite
 * This is the main function called before joining the matchmaking queue
 * 
 * @param {string} userId - User ID
 * @returns {Object} Complete matchmaking data
 */
function getArenaMatchmakingData(userId) {
    const database = getDatabase();

    // Fetch user data
    const user = database.prepare(`
        SELECT 
            id, name, email, total_xp, math_tiers, level,
            created_at, last_active
        FROM users 
        WHERE id = ?
    `).get(userId);

    if (!user) {
        return {
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'User not found in database'
        };
    }

    // Parse math_tiers JSON
    let mathTiers = {};
    try {
        mathTiers = JSON.parse(user.math_tiers || '{}');
    } catch (e) {
        mathTiers = {};
    }

    // =================================================================
    // PER-OPERATION TIER CALCULATION (Per Spec)
    // Uses LOWEST operation tier for matchmaking fairness
    // "Practice Tier is immutable during Arena play"
    // =================================================================
    const lowestTier = getLowestOperationTier(mathTiers);

    // Also calculate XP-based tier for display/fallback
    const xpBasedTier = calculatePracticeTierFromXP(user.total_xp || 0);

    // Calculate aggregate math tier (skill average) for reference
    const mathTierLevel = calculateAggregateMathTier(mathTiers);

    // Calculate confidence score
    const confidence = calculatePracticeConfidence(userId);

    // Get per-operation accuracy for stability detection
    const operationAccuracy = getOperationAccuracy(userId);

    // Get recent session stats for display
    const recentStats = database.prepare(`
        SELECT 
            SUM(correct_count) as total_correct,
            SUM(total_count) as total_questions,
            AVG(avg_speed) as avg_speed
        FROM practice_sessions
        WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).get(userId);

    return {
        success: true,
        userId: user.id,
        name: user.name,

        // =============================================================
        // PRIMARY MATCHMAKING DATA (100-Tier System)
        // =============================================================

        // For matchmaking tier gate: use LOWEST operation tier (1-100)
        // Matchmaking uses ±20 tier range (one band width)
        matchmakingTier: {
            tier: lowestTier.tierLevel,         // 1-100 (used for ±20 tier matching)
            bandId: lowestTier.bandId,          // 1-5 (band for display)
            bandName: lowestTier.tierName,      // 'Foundation', 'Intermediate', etc.
            bandShortName: lowestTier.bandShortName, // 'F', 'I', 'A', 'E', 'M'
            displayName: lowestTier.displayName, // 'Advanced 45'
            weakestOperation: lowestTier.weakestOperation,
            // Legacy compatibility (for old code that expects 'level' or 'id')
            level: lowestTier.tierLevel,
            id: lowestTier.bandId
        },

        // Full per-operation breakdown (each operation has tier 1-100)
        operationTiers: lowestTier.operationTiers,
        operationAccuracy: operationAccuracy,

        // Legacy XP-based tier (for display compatibility)
        practiceXP: user.total_xp || 0,
        practiceTier: xpBasedTier,
        mathTierLevel: mathTierLevel,
        mathTiers: mathTiers,

        // Confidence for anti-smurf and ELO dampening
        confidence: confidence.score,
        confidenceStats: confidence.stats,

        // Additional context
        level: user.level,
        recentAccuracy: recentStats?.total_questions > 0
            ? Math.round((recentStats.total_correct / recentStats.total_questions) * 100)
            : null,
        recentSpeed: recentStats?.avg_speed
            ? Math.round(recentStats.avg_speed)
            : null,

        // Eligibility check
        isEligible: confidence.score >= MATCHMAKING.MIN_CONFIDENCE_SCORE,
        eligibilityMessage: confidence.score < MATCHMAKING.MIN_CONFIDENCE_SCORE
            ? `Complete ${Math.ceil((MATCHMAKING.MIN_CONFIDENCE_SCORE - confidence.score) * 50)} more practice sessions to unlock Arena.`
            : null
    };
}

/**
 * Get practice stats summary for a user (for UI display)
 */
function getPracticeStatsSummary(userId) {
    const database = getDatabase();

    // Get overall stats
    const stats = database.prepare(`
        SELECT 
            SUM(correct_count) as lifetime_correct,
            SUM(total_count) as lifetime_total,
            COUNT(*) as session_count,
            AVG(avg_speed) as avg_speed
        FROM practice_sessions
        WHERE user_id = ?
    `).get(userId);

    // Get per-operation stats
    const operationStats = database.prepare(`
        SELECT 
            operation,
            SUM(correct_count) as correct,
            SUM(total_count) as total,
            COUNT(*) as sessions,
            AVG(avg_speed) as avg_speed
        FROM practice_sessions
        WHERE user_id = ?
        GROUP BY operation
    `).all(userId);

    return {
        lifetime: {
            correct: stats?.lifetime_correct || 0,
            total: stats?.lifetime_total || 0,
            accuracy: stats?.lifetime_total > 0
                ? Math.round((stats.lifetime_correct / stats.lifetime_total) * 100)
                : 0,
            sessions: stats?.session_count || 0,
            avgSpeed: Math.round(stats?.avg_speed || 0)
        },
        byOperation: operationStats.reduce((acc, op) => {
            acc[op.operation] = {
                correct: op.correct,
                total: op.total,
                accuracy: op.total > 0 ? Math.round((op.correct / op.total) * 100) : 0,
                avgSpeed: Math.round(op.avg_speed)
            };
            return acc;
        }, {})
    };
}

// =============================================================================
// CLOSE CONNECTION (for cleanup)
// =============================================================================

function closeBridge() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    getArenaMatchmakingData,
    getPracticeStatsSummary,
    calculatePracticeTierFromXP,
    calculatePracticeConfidence,
    closeBridge
};
