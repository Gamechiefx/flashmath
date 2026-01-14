/**
 * FlashMath Arena - Matchmaking System
 * 
 * Redis-backed matchmaker with dual-gate system:
 * Gate 1: Practice Tier compatibility (±1 tier)
 * Gate 2: Elo proximity (±50, expanding over time)
 * Anti-Smurf: Practice Confidence validation
 * 
 * @module matchmaker
 */

const {
    PRACTICE_TIERS,
    TIER_ORDER,
    MATCHMAKING,
    REDIS_KEYS
} = require('./constants.js');

// =============================================================================
// TIER UTILITIES
// =============================================================================

/**
 * Get the practice tier for a given XP value
 * @param {number} practiceXP - User's practice XP
 * @returns {Object} Tier object with id, name, minXP, maxXP
 */
function getTierFromXP(practiceXP) {
    for (const tierKey of TIER_ORDER) {
        const tier = PRACTICE_TIERS[tierKey];
        if (practiceXP >= tier.minXP && practiceXP <= tier.maxXP) {
            return { ...tier, key: tierKey };
        }
    }
    // Default to Bronze if somehow invalid
    return { ...PRACTICE_TIERS.BRONZE, key: 'BRONZE' };
}

/**
 * Calculate "Practice Confidence" score for anti-smurf detection
 * Confidence is a composite of:
 * - Practice volume (total sessions)
 * - Consistency (sessions per week average)
 * - Recency (days since last practice)
 * 
 * @param {Object} userStats - User's practice statistics
 * @param {number} userStats.totalSessions - Total practice sessions completed
 * @param {number} userStats.accountAgeDays - Days since account creation
 * @param {number} userStats.daysSinceLastPractice - Days since last practice
 * @returns {number} Confidence score from 0 to 1
 */
function calculateConfidenceScore(userStats) {
    const { totalSessions = 0, accountAgeDays = 1, daysSinceLastPractice = 0 } = userStats;

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

    return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

// =============================================================================
// MATCHMAKER CLASS
// =============================================================================

class Matchmaker {
    /**
     * @param {Object} options
     * @param {Object} options.redis - ioredis client instance (optional, uses mock if not provided)
     * @param {Function} options.onMatchFound - Callback when a match is found
     */
    constructor(options = {}) {
        this.redis = options.redis || null;
        this.onMatchFound = options.onMatchFound || (() => { });

        // In-memory queue for mock mode (when Redis not available)
        this.mockQueue = new Map();

        // Track queue join times for Elo expansion
        this.joinTimes = new Map();

        // Track loss streaks for tilt protection (in-memory, syncs with Redis)
        this.lossStreaks = new Map();

        // New player threshold (matches played)
        this.NEW_PLAYER_THRESHOLD = 10;
        this.TILT_PROTECTION_THRESHOLD = 3;  // Losses before suggesting break
    }

    /**
     * Add a player to the matchmaking queue
     * 
     * @param {Object} player - Player data
     * @param {string} player.id - Unique player ID
     * @param {string} player.name - Display name
     * @param {number} player.practiceXP - Practice XP (determines tier)
     * @param {number} player.elo - Current Elo rating
     * @param {Object} player.practiceStats - Stats for confidence calculation
     * @param {string} player.socketId - Socket.IO socket ID
     * @returns {Object} Result with success/error status
     */
    async joinQueue(player) {
        // =================================================================
        // ANTI-SMURF GATE: Validate Practice Confidence
        // Reject players with too little practice history
        // =================================================================
        const confidence = player.confidence || calculateConfidenceScore(player.practiceStats || {});

        if (confidence < MATCHMAKING.MIN_CONFIDENCE_SCORE) {
            return {
                success: false,
                error: 'INSUFFICIENT_PRACTICE',
                message: `Practice Confidence too low (${confidence}). Complete more practice sessions before entering Arena.`,
                requiredConfidence: MATCHMAKING.MIN_CONFIDENCE_SCORE,
                currentConfidence: confidence
            };
        }

        // =================================================================
        // TILT PROTECTION: Check loss streak
        // =================================================================
        const lossStreak = await this.getLossStreak(player.id);
        if (lossStreak >= this.TILT_PROTECTION_THRESHOLD) {
            return {
                success: false,
                error: 'TILT_PROTECTION',
                message: `You've lost ${lossStreak} matches in a row. Take a short practice break to reset.`,
                lossStreak: lossStreak,
                recommendation: {
                    type: 'break',
                    message: 'Practice 5 minutes to clear tilt protection.',
                    duration: 5
                }
            };
        }

        // Determine player's practice tier (100-tier system: 1-100)
        // matchmakingTier.tier is the numeric 1-100 value
        let tierValue = 1; // Default to Foundation
        
        if (player.matchmakingTier) {
            // New 100-tier format: { tier: 45, bandId: 3, ... }
            tierValue = player.matchmakingTier.tier || player.matchmakingTier.level || 1;
        } else if (typeof player.tier === 'number') {
            // Direct numeric tier
            tierValue = player.tier;
        } else if (player.practiceTier) {
            // Legacy format
            tierValue = player.practiceTier.tier || player.practiceTier.id || 1;
        } else {
            // Fallback to XP-based tier (legacy)
            const xpTier = getTierFromXP(player.practiceXP || 0);
            tierValue = (xpTier.id + 1) * 20; // Convert 0-4 → approximate 1-100
        }
        
        // Ensure tier is in valid range
        tierValue = Math.max(1, Math.min(100, tierValue));

        const queueEntry = {
            id: player.id,
            name: player.name,
            socketId: player.socketId,
            tier: tierValue,  // Now a number 1-100
            elo: player.elo || MATCHMAKING.DEFAULT_ELO,
            confidence: confidence,
            arenaMatchCount: player.arenaMatchCount || 0,  // For new player protection
            joinedAt: Date.now()
        };

        // Track join time for Elo expansion calculation
        this.joinTimes.set(player.id, Date.now());

        // Store in queue (Redis or mock)
        if (this.redis) {
            await this.redis.hset(
                REDIS_KEYS.MATCHMAKING_QUEUE,
                player.id,
                JSON.stringify(queueEntry)
            );
        } else {
            this.mockQueue.set(player.id, queueEntry);
        }

        // Attempt to find a match immediately
        const match = await this.findMatch(queueEntry);

        if (match) {
            return {
                success: true,
                matched: true,
                match: match
            };
        }

        return {
            success: true,
            matched: false,
            position: await this.getQueuePosition(player.id),
            tier: tierValue,  // Now a number 1-100
            elo: queueEntry.elo
        };
    }

    /**
     * Remove a player from the matchmaking queue
     * @param {string} playerId - Player ID to remove
     */
    async leaveQueue(playerId) {
        this.joinTimes.delete(playerId);

        if (this.redis) {
            await this.redis.hdel(REDIS_KEYS.MATCHMAKING_QUEUE, playerId);
        } else {
            this.mockQueue.delete(playerId);
        }

        return { success: true };
    }

    /**
     * Find a compatible match for a player
     * Implements Gate 1 (Tier) and Gate 2 (Elo) logic
     * 
     * @param {Object} seeker - The player seeking a match
     * @returns {Object|null} Match object or null if no match found
     */
    async findMatch(seeker) {
        const queue = await this.getQueueEntries();

        // Calculate current Elo range based on wait time
        const waitTime = Date.now() - (this.joinTimes.get(seeker.id) || Date.now());
        const expansions = Math.floor(waitTime / MATCHMAKING.ELO_EXPANSION_INTERVAL);
        const currentEloRange = Math.min(
            MATCHMAKING.INITIAL_ELO_RANGE + (expansions * MATCHMAKING.ELO_EXPANSION_RATE),
            MATCHMAKING.MAX_ELO_RANGE
        );

        let bestMatch = null;
        let bestScore = Infinity;

        for (const [playerId, candidate] of queue) {
            // Skip self
            if (playerId === seeker.id) continue;

            // =============================================================
            // GATE 1: PRACTICE TIER COMPATIBILITY (100-Tier System)
            // Users must be within ±20 tiers (one band width) to match
            // E.g., tier 45 can match with tiers 25-65
            // This keeps players within similar skill levels
            // =============================================================
            const seekerTier = typeof seeker.tier === 'number' ? seeker.tier : (seeker.tier?.tier || seeker.tier?.id || 50);
            const candidateTier = typeof candidate.tier === 'number' ? candidate.tier : (candidate.tier?.tier || candidate.tier?.id || 50);
            const tierDifference = Math.abs(seekerTier - candidateTier);

            if (tierDifference > MATCHMAKING.TIER_RANGE) {
                // Tiers too far apart (more than ±20), skip this candidate
                continue;
            }

            // =============================================================
            // GATE 2: ELO PROXIMITY
            // Match based on Elo closeness within expanding range
            // Starts at ±50, expands over wait time
            // =============================================================
            const eloDifference = Math.abs(seeker.elo - candidate.elo);

            // Also calculate opponent's wait time for expanded range
            const candidateWaitTime = Date.now() - (this.joinTimes.get(playerId) || Date.now());
            const candidateExpansions = Math.floor(candidateWaitTime / MATCHMAKING.ELO_EXPANSION_INTERVAL);
            const candidateEloRange = Math.min(
                MATCHMAKING.INITIAL_ELO_RANGE + (candidateExpansions * MATCHMAKING.ELO_EXPANSION_RATE),
                MATCHMAKING.MAX_ELO_RANGE
            );

            // Use the larger of the two ranges (more desperate player expands)
            const effectiveRange = Math.max(currentEloRange, candidateEloRange);

            if (eloDifference > effectiveRange) {
                // Elo difference too large, skip
                continue;
            }

            // =============================================================
            // MATCH QUALITY SCORE
            // Lower is better - prefer closer Elo and tier matches
            // NEW PLAYER PROTECTION: Prefer matching new with new
            // =============================================================
            // Tier difference is now 0-20 (100-tier system)
            // Weight tier difference by 5 to make it comparable to ELO difference
            let matchScore = (tierDifference * 5) + eloDifference;

            // New player preference: add penalty for mismatched experience levels
            const seekerIsNew = (seeker.arenaMatchCount || 0) < this.NEW_PLAYER_THRESHOLD;
            const candidateIsNew = (candidate.arenaMatchCount || 0) < this.NEW_PLAYER_THRESHOLD;

            if (seekerIsNew !== candidateIsNew) {
                // One is new, one is experienced - add penalty to prefer same-experience matches
                matchScore += 50;
            }

            if (matchScore < bestScore) {
                bestScore = matchScore;
                bestMatch = candidate;
            }
        }

        if (bestMatch) {
            // Remove both players from queue
            await this.leaveQueue(seeker.id);
            await this.leaveQueue(bestMatch.id);

            // Extract numeric tier values (100-tier system)
            const seekerTierNum = typeof seeker.tier === 'number' ? seeker.tier : (seeker.tier?.tier || 50);
            const bestMatchTierNum = typeof bestMatch.tier === 'number' ? bestMatch.tier : (bestMatch.tier?.tier || 50);
            
            const match = {
                id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                players: [
                    {
                        id: seeker.id,
                        name: seeker.name,
                        socketId: seeker.socketId,
                        tier: seekerTierNum,  // Now a number 1-100
                        elo: seeker.elo
                    },
                    {
                        id: bestMatch.id,
                        name: bestMatch.name,
                        socketId: bestMatch.socketId,
                        tier: bestMatchTierNum,  // Now a number 1-100
                        elo: bestMatch.elo
                    }
                ],
                createdAt: Date.now(),
                qualityScore: bestScore
            };

            // Trigger callback
            this.onMatchFound(match);

            return match;
        }

        return null;
    }

    /**
     * Get all entries in the queue
     * @returns {Map} Map of playerId -> queueEntry
     */
    async getQueueEntries() {
        if (this.redis) {
            const entries = await this.redis.hgetall(REDIS_KEYS.MATCHMAKING_QUEUE);
            const map = new Map();
            for (const [key, value] of Object.entries(entries)) {
                map.set(key, JSON.parse(value));
            }
            return map;
        }
        return new Map(this.mockQueue);
    }

    /**
     * Get queue position for a player
     * @param {string} playerId - Player ID
     * @returns {number} Position in queue (1-indexed)
     */
    async getQueuePosition(playerId) {
        const queue = await this.getQueueEntries();
        const entries = Array.from(queue.entries())
            .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

        const index = entries.findIndex(([id]) => id === playerId);
        return index + 1;
    }

    // =================================================================
    // TILT PROTECTION: Loss Streak Tracking
    // =================================================================

    /**
     * Get current loss streak for a player
     */
    async getLossStreak(playerId) {
        if (this.redis) {
            const streak = await this.redis.get(`${REDIS_KEYS.LOSS_STREAK}${playerId}`);
            return parseInt(streak, 10) || 0;
        }
        return this.lossStreaks.get(playerId) || 0;
    }

    /**
     * Record a match result for tilt protection
     * @param {string} playerId - Player ID
     * @param {boolean} won - Whether player won
     */
    async recordMatchResult(playerId, won) {
        if (won) {
            // Win resets loss streak
            if (this.redis) {
                await this.redis.del(`${REDIS_KEYS.LOSS_STREAK}${playerId}`);
            } else {
                this.lossStreaks.delete(playerId);
            }
            return { streak: 0, protected: false };
        } else {
            // Loss increments streak
            let newStreak;
            if (this.redis) {
                newStreak = await this.redis.incr(`${REDIS_KEYS.LOSS_STREAK}${playerId}`);
                await this.redis.expire(`${REDIS_KEYS.LOSS_STREAK}${playerId}`, 3600); // 1 hour TTL
            } else {
                newStreak = (this.lossStreaks.get(playerId) || 0) + 1;
                this.lossStreaks.set(playerId, newStreak);
            }
            return {
                streak: newStreak,
                protected: newStreak >= this.TILT_PROTECTION_THRESHOLD
            };
        }
    }

    /**
     * Clear loss streak (called after practice session)
     */
    async clearLossStreak(playerId) {
        if (this.redis) {
            await this.redis.del(`${REDIS_KEYS.LOSS_STREAK}${playerId}`);
        } else {
            this.lossStreaks.delete(playerId);
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue stats
     */
    async getStats() {
        const queue = await this.getQueueEntries();

        const tierCounts = {};
        TIER_ORDER.forEach(tier => { tierCounts[tier] = 0; });

        for (const [, entry] of queue) {
            tierCounts[entry.tier.key]++;
        }

        return {
            totalInQueue: queue.size,
            byTier: tierCounts
        };
    }
}

// =============================================================================
// TEST FUNCTION
// =============================================================================

/**
 * Self-contained test for matchmaker logic
 * Run with: node -e "require('./matchmaker.js').test()"
 */
function test() {
    console.log('🧪 Testing Matchmaker...\n');

    const matchmaker = new Matchmaker({
        onMatchFound: (match) => {
            console.log('✅ Match found:', match.id);
            console.log('   Players:', match.players.map(p => `${p.name} (${p.tier}, Elo: ${p.elo})`).join(' vs '));
        }
    });

    // Test tier calculation
    console.log('📊 Tier Tests:');
    console.log('   XP 0 ->', getTierFromXP(0).name);      // Bronze
    console.log('   XP 350 ->', getTierFromXP(350).name);   // Silver
    console.log('   XP 650 ->', getTierFromXP(650).name);   // Gold
    console.log('   XP 900 ->', getTierFromXP(900).name);   // Platinum
    console.log('   XP 1000 ->', getTierFromXP(1000).name); // Diamond

    // Test confidence calculation
    console.log('\n🔒 Confidence Tests:');
    console.log('   New player (0 sessions):', calculateConfidenceScore({ totalSessions: 0 }));
    console.log('   Active player (20 sessions, 14 days):', calculateConfidenceScore({
        totalSessions: 20,
        accountAgeDays: 14,
        daysSinceLastPractice: 1
    }));

    // Test matching
    console.log('\n🎮 Match Tests:');

    // Add compatible players (same tier, close Elo)
    const results = [];

    results.push(matchmaker.joinQueue({
        id: 'player1',
        name: 'Alice',
        practiceXP: 350,  // Silver
        elo: 1000,
        practiceStats: { totalSessions: 20, accountAgeDays: 30, daysSinceLastPractice: 1 },
        socketId: 'socket1'
    }));

    results.push(matchmaker.joinQueue({
        id: 'player2',
        name: 'Bob',
        practiceXP: 400,  // Silver
        elo: 1030,        // Within ±50
        practiceStats: { totalSessions: 25, accountAgeDays: 45, daysSinceLastPractice: 0 },
        socketId: 'socket2'
    }));

    Promise.all(results).then(async (outcomes) => {
        console.log('   Player 1 result:', outcomes[0].matched ? 'MATCHED' : 'QUEUED');
        console.log('   Player 2 result:', outcomes[1].matched ? 'MATCHED' : 'QUEUED');

        // Test incompatible tiers
        console.log('\n❌ Incompatible Tier Test (Bronze vs Diamond):');

        await matchmaker.joinQueue({
            id: 'player3',
            name: 'Bronze Player',
            practiceXP: 100,   // Bronze
            elo: 800,
            practiceStats: { totalSessions: 15, accountAgeDays: 20, daysSinceLastPractice: 2 },
            socketId: 'socket3'
        });

        const diamondResult = await matchmaker.joinQueue({
            id: 'player4',
            name: 'Diamond Player',
            practiceXP: 1000,  // Diamond (3 tiers away from Bronze)
            elo: 820,         // Close Elo but tier too far
            practiceStats: { totalSessions: 100, accountAgeDays: 180, daysSinceLastPractice: 0 },
            socketId: 'socket4'
        });

        console.log('   Diamond player matched?', diamondResult.matched ? 'YES (BUG!)' : 'NO (correct - tier too far)');

        const stats = await matchmaker.getStats();
        console.log('\n📈 Queue Stats:', stats);

        console.log('\n✅ All tests complete!');
    });

    return 'Tests running... (async)';
}

module.exports = {
    Matchmaker,
    getTierFromXP,
    calculateConfidenceScore,
    test
};
