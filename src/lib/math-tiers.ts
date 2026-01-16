/**
 * Math Problem Generation for 100-Tier System
 *
 * Uses parametric operand scaling based on tier (1-100) and band.
 * Problem complexity increases progressively within each band.
 */

import {
    getBandForTier,
    getTierOperandRange,
    getTierWithinBand,
    isMasteryTestAvailable,
    isAtBandBoundary,
    MIN_TIER,
    MAX_TIER,
} from './tier-system';

export type MathOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

export interface MathProblem {
    question: string;
    answer: number;
    type: 'basic' | 'variable' | 'multi-digit' | 'word';
    explanation: string;
    tier: number;
    band?: string;
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Determines problem complexity based on tier within band
 * - Tiers 1-5 within band: Basic problems
 * - Tiers 6-10: Introduce variables occasionally
 * - Tiers 11-15: More variables, harder ranges
 * - Tiers 16-20: Full complexity for the band
 */
function getProblemComplexity(tier: number): {
    variableChance: number;
    useHarderRange: boolean;
    multiOperandChance: number;
} {
    const tierInBand = getTierWithinBand(tier);

    if (tierInBand <= 5) {
        return { variableChance: 0, useHarderRange: false, multiOperandChance: 0 };
    } else if (tierInBand <= 10) {
        return { variableChance: 0.15, useHarderRange: false, multiOperandChance: 0 };
    } else if (tierInBand <= 15) {
        return { variableChance: 0.25, useHarderRange: true, multiOperandChance: 0.1 };
    } else {
        return { variableChance: 0.3, useHarderRange: true, multiOperandChance: 0.2 };
    }
}

/**
 * Generate a variable problem like "5 + x = 12" or "7x = 56"
 */
function generateVariableProblem(
    op: MathOperation,
    minOp: number,
    maxOp: number,
    tier: number
): MathProblem {
    const band = getBandForTier(tier);

    if (op === 'addition') {
        const a = rand(minOp, maxOp);
        const x = rand(minOp, maxOp);
        const sum = a + x;
        const missingFirst = Math.random() < 0.5;

        return {
            question: missingFirst ? `x + ${a} = ${sum}` : `${a} + x = ${sum}`,
            answer: x,
            type: 'variable',
            explanation: `To find x, subtract ${a} from ${sum}. ${sum} - ${a} = ${x}.`,
            tier,
            band: band.name,
        };
    } else if (op === 'subtraction') {
        if (Math.random() < 0.5) {
            // A - x = B
            const x = rand(minOp, maxOp);
            const b = rand(minOp, maxOp);
            const a = x + b;
            return {
                question: `${a} - x = ${b}`,
                answer: x,
                type: 'variable',
                explanation: `To find x, subtract ${b} from ${a}. ${a} - ${b} = ${x}.`,
                tier,
                band: band.name,
            };
        } else {
            // x - A = B
            const a = rand(minOp, maxOp);
            const b = rand(minOp, maxOp);
            const x = a + b;
            return {
                question: `x - ${a} = ${b}`,
                answer: x,
                type: 'variable',
                explanation: `To find x, add ${a} to ${b}. ${a} + ${b} = ${x}.`,
                tier,
                band: band.name,
            };
        }
    } else if (op === 'multiplication') {
        const factor = rand(Math.max(2, minOp), Math.min(maxOp, 25));
        const x = rand(2, Math.min(maxOp, 20));
        const product = factor * x;
        return {
            question: `${factor}x = ${product}`,
            answer: x,
            type: 'variable',
            explanation: `Divide the product by the factor: ${product} / ${factor} = ${x}.`,
            tier,
            band: band.name,
        };
    } else {
        // division
        if (Math.random() < 0.5) {
            // Total / x = Result
            const x = rand(2, Math.min(maxOp, 15));
            const result = rand(2, Math.min(maxOp, 20));
            const total = x * result;
            return {
                question: `${total} / x = ${result}`,
                answer: x,
                type: 'variable',
                explanation: `Divide the total by the result: ${total} / ${result} = ${x}.`,
                tier,
                band: band.name,
            };
        } else {
            // x / Factor = Result
            const factor = rand(2, Math.min(maxOp, 15));
            const result = rand(2, Math.min(maxOp, 20));
            const x = factor * result;
            return {
                question: `x / ${factor} = ${result}`,
                answer: x,
                type: 'variable',
                explanation: `Multiply the result by the divisor: ${result} * ${factor} = ${x}.`,
                tier,
                band: band.name,
            };
        }
    }
}

/**
 * Generate a basic arithmetic problem using parametric tier scaling
 */
function generateBasicProblem(
    op: MathOperation,
    tier: number
): MathProblem {
    const [minOp, maxOp] = getTierOperandRange(tier, op);
    const band = getBandForTier(tier);
    const complexity = getProblemComplexity(tier);

    // Check if we should generate a variable problem
    if (Math.random() < complexity.variableChance) {
        return generateVariableProblem(op, minOp, maxOp, tier);
    }

    // Generate operands based on tier range
    let a = rand(minOp, maxOp);
    let b = rand(minOp, maxOp);

    // Determine problem type based on operand sizes
    const isMultiDigit = a >= 10 || b >= 10;
    const type: MathProblem['type'] = isMultiDigit ? 'multi-digit' : 'basic';

    let question: string;
    let answer: number;
    let explanation: string;

    switch (op) {
        case 'addition':
            question = `${a} + ${b}`;
            answer = a + b;
            explanation = `Add ${a} and ${b}.`;
            break;

        case 'subtraction':
            // Ensure positive result
            if (a < b) [a, b] = [b, a];
            question = `${a} - ${b}`;
            answer = a - b;
            explanation = `Subtract ${b} from ${a}.`;
            break;

        case 'multiplication':
            question = `${a} × ${b}`;
            answer = a * b;
            explanation = `Multiply ${a} by ${b}.`;
            break;

        case 'division':
            // Ensure exact division
            const divisor = Math.max(2, b);
            const quotient = a;
            const dividend = divisor * quotient;
            question = `${dividend} / ${divisor}`;
            answer = quotient;
            explanation = `${dividend} divided by ${divisor} is ${quotient}.`;
            break;

        default:
            question = `${a} + ${b}`;
            answer = a + b;
            explanation = `Add ${a} and ${b}.`;
    }

    return {
        question,
        answer,
        type,
        explanation,
        tier,
        band: band.name,
    };
}

/**
 * Main problem generation function for the 100-tier system
 */
export const generateProblemForSession = (op: MathOperation, tier: number): MathProblem => {
    // Clamp tier to valid range
    const clampedTier = Math.max(MIN_TIER, Math.min(MAX_TIER, tier));

    return generateBasicProblem(op, clampedTier);
};

/**
 * Generate placement test with problems across difficulty range
 */
export const generatePlacementTest = (): Record<MathOperation, MathProblem[]> => {
    const ops: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    const test: Record<string, MathProblem[]> = {};

    // Sample from different bands for comprehensive placement
    const sampleTiers = [5, 15, 25, 45, 65]; // Foundation mid/end, Intermediate, Advanced, Expert

    ops.forEach(op => {
        test[op] = sampleTiers.map(tier => generateProblemForSession(op, tier));
    });

    return test as Record<MathOperation, MathProblem[]>;
};

/**
 * Check progression for 100-tier system
 *
 * Returns new tier based on performance:
 * - 85%+ accuracy: +1 tier
 * - 90%+ accuracy with good streaks: +2 tiers
 * - 95%+ accuracy with excellent streaks: +3 tiers
 * - Band boundaries require mastery test
 */
export const checkProgression = (
    currentTier: number,
    recentAccuracy: number,
    streak: number = 0
): { newTier: number; requiresMasteryTest: boolean } => {
    if (currentTier >= MAX_TIER) {
        return { newTier: MAX_TIER, requiresMasteryTest: false };
    }

    let tierAdvance = 0;

    // Determine advancement based on accuracy and streak
    if (recentAccuracy >= 95 && streak >= 10) {
        tierAdvance = 3;
    } else if (recentAccuracy >= 90 && streak >= 8) {
        tierAdvance = 2;
    } else if (recentAccuracy >= 85) {
        tierAdvance = 1;
    }

    if (tierAdvance === 0) {
        return { newTier: currentTier, requiresMasteryTest: false };
    }

    const proposedTier = Math.min(MAX_TIER, currentTier + tierAdvance);
    const currentBand = getBandForTier(currentTier);
    const proposedBand = getBandForTier(proposedTier);

    // Check if crossing band boundary
    if (proposedBand.id > currentBand.id) {
        // Can only advance to current band's end, then require mastery test
        const bandEndTier = currentBand.tierRange[1];
        if (currentTier < bandEndTier) {
            return {
                newTier: Math.min(bandEndTier, proposedTier),
                requiresMasteryTest: isAtBandBoundary(Math.min(bandEndTier, proposedTier)),
            };
        }
        // Already at band boundary, require mastery test to proceed
        return { newTier: currentTier, requiresMasteryTest: true };
    }

    // Check if hitting a mastery test tier (every 10)
    const requiresTest = isMasteryTestAvailable(proposedTier) && !isMasteryTestAvailable(currentTier);

    return { newTier: proposedTier, requiresMasteryTest: requiresTest };
};

/**
 * Legacy checkProgression for backwards compatibility
 */
export const checkProgressionLegacy = (currentTier: number, recentAccuracy: number): number => {
    const { newTier } = checkProgression(currentTier, recentAccuracy);
    return newTier;
};

/**
 * Generate mastery test for a specific tier
 *
 * - Within-band tests (every 10 tiers): 5 questions, 80% required
 * - Cross-band tests (tier 20, 40, 60, 80): 10 questions, 90% required
 */
export const generateMasteryTest = (
    operation: MathOperation,
    tier: number
): { problems: MathProblem[]; requiredAccuracy: number } => {
    const isBandBoundary = isAtBandBoundary(tier);
    const questionCount = isBandBoundary ? 10 : 5;
    const requiredAccuracy = isBandBoundary ? 90 : 80;

    const problems: MathProblem[] = [];

    // Generate problems at the current tier level
    for (let i = 0; i < questionCount; i++) {
        // Slight tier variation for diversity
        const problemTier = Math.max(MIN_TIER, tier - rand(0, 2));
        problems.push(generateProblemForSession(operation, problemTier));
    }

    return { problems, requiredAccuracy };
};

/**
 * Legacy generateMasteryTest for backwards compatibility
 */
export const generateMasteryTestLegacy = (operation: MathOperation, tier: number): MathProblem[] => {
    // Map old tier (1-4) to new tier if needed
    const mappedTier = tier <= 4 ? tier * 20 : tier;
    const { problems } = generateMasteryTest(operation, mappedTier);
    return problems;
};

const mathTiersModule = {
    generateProblemForSession,
    generatePlacementTest,
    checkProgression,
    generateMasteryTest,
};

export default mathTiersModule;
