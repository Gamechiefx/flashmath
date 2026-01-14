/**
 * FlashMath 100-Tier System
 *
 * Implements a 100-tier progression system organized into 5 bands:
 * - Foundation (1-20): Basic facts, single-digit operations
 * - Intermediate (21-40): Variables, missing operands
 * - Advanced (41-60): Multi-digit operations
 * - Expert (61-80): Complex multi-digit
 * - Master (81-100): Speed mastery, competition-level
 *
 * Uses parametric scaling for smooth difficulty progression within bands.
 */

export type MathOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

// =============================================================================
// CONSTANTS
// =============================================================================

export const MIN_TIER = 1;
export const MAX_TIER = 100;
export const TIERS_PER_BAND = 20;
export const TOTAL_BANDS = 5;

// =============================================================================
// BAND DEFINITIONS
// =============================================================================

export interface Band {
    id: number;
    name: string;
    shortName: string;
    tierRange: [number, number];
    color: string;
    bgGradient: string;
    textColor: string;
    operandRangeStart: [number, number];  // [min, max] at band start
    operandRangeEnd: [number, number];    // [min, max] at band end
    features: string[];
    icon: string;
}

export const BANDS: Band[] = [
    {
        id: 1,
        name: 'Foundation',
        shortName: 'F',
        tierRange: [1, 20],
        color: 'amber',
        bgGradient: 'from-amber-600 to-amber-800',
        textColor: 'text-amber-400',
        operandRangeStart: [2, 5],
        operandRangeEnd: [2, 12],
        features: ['Basic facts', 'Single-digit operations', 'Core multiplication tables'],
        icon: 'Sprout',
    },
    {
        id: 2,
        name: 'Intermediate',
        shortName: 'I',
        tierRange: [21, 40],
        color: 'slate',
        bgGradient: 'from-slate-400 to-slate-600',
        textColor: 'text-slate-300',
        operandRangeStart: [2, 12],
        operandRangeEnd: [10, 25],
        features: ['Extended facts', 'Variable introduction', 'Missing operand problems'],
        icon: 'Star',
    },
    {
        id: 3,
        name: 'Advanced',
        shortName: 'A',
        tierRange: [41, 60],
        color: 'yellow',
        bgGradient: 'from-yellow-400 to-yellow-600',
        textColor: 'text-yellow-400',
        operandRangeStart: [10, 25],
        operandRangeEnd: [20, 99],
        features: ['Multi-digit operations', '2-digit × 2-digit', 'Word problems'],
        icon: 'Crown',
    },
    {
        id: 4,
        name: 'Expert',
        shortName: 'E',
        tierRange: [61, 80],
        color: 'cyan',
        bgGradient: 'from-cyan-400 to-cyan-600',
        textColor: 'text-cyan-400',
        operandRangeStart: [20, 99],
        operandRangeEnd: [100, 500],
        features: ['Complex multi-digit', '3-digit operations', 'Algebraic notation'],
        icon: 'Gem',
    },
    {
        id: 5,
        name: 'Master',
        shortName: 'M',
        tierRange: [81, 100],
        color: 'purple',
        bgGradient: 'from-purple-400 to-pink-600',
        textColor: 'text-purple-400',
        operandRangeStart: [100, 500],
        operandRangeEnd: [200, 1000],
        features: ['Speed mastery', 'Competition-level', 'Mixed operations'],
        icon: 'Trophy',
    },
];

// =============================================================================
// CORE TIER FUNCTIONS
// =============================================================================

/**
 * Get the band for a given tier (1-100)
 */
export function getBandForTier(tier: number): Band {
    const clampedTier = Math.max(MIN_TIER, Math.min(MAX_TIER, tier));
    const bandIndex = Math.floor((clampedTier - 1) / TIERS_PER_BAND);
    return BANDS[Math.min(bandIndex, BANDS.length - 1)];
}

/**
 * Get the tier number within its band (1-20)
 */
export function getTierWithinBand(tier: number): number {
    const band = getBandForTier(tier);
    return tier - band.tierRange[0] + 1;
}

/**
 * Get progress within band as 0.0 to 1.0
 */
export function getProgressWithinBand(tier: number): number {
    const tierInBand = getTierWithinBand(tier);
    return (tierInBand - 1) / (TIERS_PER_BAND - 1);
}

/**
 * Check if a tier is at a band boundary (20, 40, 60, 80, 100)
 */
export function isAtBandBoundary(tier: number): boolean {
    return tier % TIERS_PER_BAND === 0 && tier > 0;
}

/**
 * Check if advancing from prevTier to newTier crosses a band boundary
 */
export function crossesBandBoundary(prevTier: number, newTier: number): boolean {
    const prevBand = getBandForTier(prevTier);
    const newBand = getBandForTier(newTier);
    return newBand.id > prevBand.id;
}

/**
 * Get the next band boundary tier from current tier
 */
export function getNextBandBoundary(tier: number): number {
    const band = getBandForTier(tier);
    return band.tierRange[1];
}

// =============================================================================
// DIFFICULTY MAPPING (FOR AI ENGINE)
// =============================================================================

/**
 * Map tier (1-100) to difficulty (0.05-0.95)
 * Used by AI engine for continuous difficulty calculations
 */
export function tierToDifficulty(tier: number): number {
    const clampedTier = Math.max(MIN_TIER, Math.min(MAX_TIER, tier));
    return 0.05 + ((clampedTier - 1) / (MAX_TIER - 1)) * 0.9;
}

/**
 * Map difficulty (0.0-1.0) back to tier (1-100)
 */
export function difficultyToTier(difficulty: number): number {
    const clampedDiff = Math.max(0.05, Math.min(0.95, difficulty));
    const tier = Math.round(((clampedDiff - 0.05) / 0.9) * (MAX_TIER - 1) + 1);
    return Math.max(MIN_TIER, Math.min(MAX_TIER, tier));
}

// =============================================================================
// OPERAND RANGE CALCULATION (PARAMETRIC SCALING)
// =============================================================================

/**
 * Linear interpolation helper
 */
function lerp(start: number, end: number, t: number): number {
    return Math.round(start + (end - start) * t);
}

/**
 * Get operand range for a tier using parametric scaling
 * Smoothly interpolates between band start and end ranges
 */
export function getTierOperandRange(
    tier: number,
    operation?: MathOperation
): [number, number] {
    const band = getBandForTier(tier);
    const progress = getProgressWithinBand(tier);

    // Linear interpolation between band start and end ranges
    let minOp = lerp(band.operandRangeStart[0], band.operandRangeEnd[0], progress);
    let maxOp = lerp(band.operandRangeStart[1], band.operandRangeEnd[1], progress);

    // Operation-specific adjustments
    if (operation === 'division') {
        // Keep divisors more reasonable for division
        minOp = Math.max(2, Math.floor(minOp / 2));
        maxOp = Math.max(minOp + 2, Math.floor(maxOp / 2));
    } else if (operation === 'subtraction') {
        // Ensure we can always have positive results
        // minOp stays the same, maxOp determines the range
    }

    return [minOp, maxOp];
}

/**
 * Generate operands for a given tier and operation
 */
export function generateOperands(
    tier: number,
    operation: MathOperation
): { op1: number; op2: number; answer: number } {
    const [minOp, maxOp] = getTierOperandRange(tier, operation);

    let op1: number, op2: number, answer: number;

    switch (operation) {
        case 'addition':
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            answer = op1 + op2;
            break;

        case 'subtraction':
            // Ensure positive result
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * Math.min(op1 - 1, maxOp - minOp + 1)) + minOp;
            if (op2 >= op1) op2 = Math.floor(op1 / 2) + 1;
            answer = op1 - op2;
            break;

        case 'multiplication':
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            answer = op1 * op2;
            break;

        case 'division':
            // Ensure clean division
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            answer = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op1 = op2 * answer;
            break;

        default:
            op1 = minOp;
            op2 = minOp;
            answer = op1 + op2;
    }

    return { op1, op2, answer };
}

// =============================================================================
// DISPLAY FORMATTING
// =============================================================================

/**
 * Format tier for display: "Foundation 15"
 */
export function formatTierDisplay(tier: number): string {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);
    return `${band.name} ${tierInBand}`;
}

/**
 * Format tier short form: "F15"
 */
export function formatTierShort(tier: number): string {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);
    return `${band.shortName}${tierInBand}`;
}

/**
 * Get band color class for Tailwind
 */
export function getBandColorClass(tier: number): string {
    const band = getBandForTier(tier);
    return band.textColor;
}

/**
 * Get band gradient class for Tailwind
 */
export function getBandGradientClass(tier: number): string {
    const band = getBandForTier(tier);
    return `bg-gradient-to-r ${band.bgGradient}`;
}

// =============================================================================
// MIGRATION (OLD 4-TIER TO NEW 100-TIER)
// =============================================================================

/**
 * Migrate old tier (0-4) to new tier system
 * Places users at the start of equivalent bands
 */
export function migrateTier(oldTier: number): number {
    const MIGRATION_MAP: Record<number, number> = {
        0: 1,   // Unplaced → Foundation 1
        1: 5,   // Tier I → Foundation 5
        2: 21,  // Tier II → Intermediate 1 (band start, +1 for established)
        3: 41,  // Tier III → Advanced 1
        4: 61,  // Tier IV → Expert 1
    };
    return MIGRATION_MAP[oldTier] ?? 1;
}

/**
 * Migrate a full math_tiers object
 */
export function migrateMathTiers(
    oldTiers: Record<MathOperation, number>
): Record<MathOperation, number> {
    return {
        addition: migrateTier(oldTiers.addition ?? 0),
        subtraction: migrateTier(oldTiers.subtraction ?? 0),
        multiplication: migrateTier(oldTiers.multiplication ?? 0),
        division: migrateTier(oldTiers.division ?? 0),
    };
}

// =============================================================================
// MILESTONE REWARDS
// =============================================================================

export interface Milestone {
    tier: number;
    type: 'minor' | 'major' | 'band_complete';
    reward: {
        coins?: number;
        xp?: number;
        title?: string;
        achievement?: string;
    };
}

/**
 * Get all defined milestones
 */
export function getMilestones(): Milestone[] {
    const milestones: Milestone[] = [];

    // Every 5 tiers: minor milestone (50 coins)
    for (let t = 5; t <= MAX_TIER; t += 5) {
        if (t % 10 !== 0) {
            milestones.push({
                tier: t,
                type: 'minor',
                reward: { coins: 50 }
            });
        }
    }

    // Every 10 tiers: major milestone (150 coins + XP) - except band boundaries
    for (let t = 10; t <= MAX_TIER; t += 10) {
        if (t % 20 !== 0) {
            milestones.push({
                tier: t,
                type: 'major',
                reward: { coins: 150, xp: 100 }
            });
        }
    }

    // Every 20 tiers: band completion (500 coins + title)
    const bandNames = ['Foundation', 'Intermediate', 'Advanced', 'Expert', 'Master'];
    for (let i = 0; i < TOTAL_BANDS; i++) {
        const tier = (i + 1) * TIERS_PER_BAND;
        milestones.push({
            tier,
            type: 'band_complete',
            reward: {
                coins: 500,
                xp: 500,
                title: `${bandNames[i]} Graduate`,
                achievement: `band_${bandNames[i].toLowerCase()}_complete`
            }
        });
    }

    return milestones.sort((a, b) => a.tier - b.tier);
}

/**
 * Check if a milestone was crossed and return the highest one
 */
export function checkMilestoneReward(
    previousTier: number,
    newTier: number
): Milestone | null {
    if (newTier <= previousTier) return null;

    const milestones = getMilestones();

    // Find the highest milestone crossed
    for (const m of milestones.sort((a, b) => b.tier - a.tier)) {
        if (previousTier < m.tier && newTier >= m.tier) {
            return m;
        }
    }

    return null;
}

/**
 * Get all milestones crossed between two tiers
 */
export function getAllMilestonesCrossed(
    previousTier: number,
    newTier: number
): Milestone[] {
    if (newTier <= previousTier) return [];

    const milestones = getMilestones();
    return milestones.filter(m => previousTier < m.tier && newTier >= m.tier);
}

// =============================================================================
// MASTERY TEST HELPERS
// =============================================================================

/**
 * Check if a mastery test is available at this tier
 * Tests available every 10 tiers
 */
export function isMasteryTestAvailable(tier: number): boolean {
    return tier % 10 === 0 || tier === MAX_TIER;
}

/**
 * Get mastery test requirements for a tier
 */
export function getMasteryTestRequirements(tier: number): {
    questions: number;
    requiredAccuracy: number;
    isBandCrossing: boolean;
} {
    const isBandCrossing = isAtBandBoundary(tier);

    return {
        questions: isBandCrossing ? 10 : 5,
        requiredAccuracy: isBandCrossing ? 0.90 : 0.80,
        isBandCrossing,
    };
}

/**
 * Get the next tier milestone (mastery test tier)
 */
export function getNextMasteryTestTier(currentTier: number): number {
    const next = Math.ceil((currentTier + 1) / 10) * 10;
    return Math.min(next, MAX_TIER);
}

// =============================================================================
// PROGRESSION HELPERS
// =============================================================================

/**
 * Calculate tier advancement based on AI session performance
 * Returns how many tiers to advance (0-3)
 */
export function calculateTierAdvancement(
    accuracy: number,
    confidence: number,
    totalQuestions: number,
    maxStreak: number,
    tiltScore: number,
    currentTier: number
): number {
    let advancement = 0;

    // Determine base advancement from performance
    if (accuracy >= 0.95 && confidence >= 0.90 && maxStreak >= 10 && totalQuestions >= 25) {
        advancement = 3;  // Excellent
    } else if (accuracy >= 0.90 && confidence >= 0.85 && maxStreak >= 8 && totalQuestions >= 20) {
        advancement = 2;  // Great
    } else if (accuracy >= 0.85 && confidence >= 0.80 && totalQuestions >= 15) {
        advancement = 1;  // Good
    }

    // Reduce if struggling (high tilt)
    if (tiltScore > 0.5) {
        advancement = Math.max(0, advancement - 1);
    }

    // Don't cross band boundary automatically - stop at boundary
    const currentBand = getBandForTier(currentTier);
    const potentialNewTier = currentTier + advancement;
    const potentialBand = getBandForTier(potentialNewTier);

    if (potentialBand.id > currentBand.id) {
        // Would cross band - stop at band end instead
        advancement = currentBand.tierRange[1] - currentTier;
    }

    return Math.max(0, Math.min(advancement, MAX_TIER - currentTier));
}

/**
 * Check if user can attempt band promotion test
 */
export function canAttemptBandPromotion(currentTier: number): boolean {
    return isAtBandBoundary(currentTier) && currentTier < MAX_TIER;
}

// =============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// =============================================================================

export default {
    BANDS,
    MIN_TIER,
    MAX_TIER,
    TIERS_PER_BAND,
    getBandForTier,
    getTierWithinBand,
    getProgressWithinBand,
    getTierOperandRange,
    tierToDifficulty,
    difficultyToTier,
    formatTierDisplay,
    formatTierShort,
    migrateTier,
    migrateMathTiers,
    getMilestones,
    checkMilestoneReward,
    calculateTierAdvancement,
};
