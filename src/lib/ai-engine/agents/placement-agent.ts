/**
 * FlashMath AI Engine - Placement Agent
 * 
 * Implements Predictive Placement & Dynamic Progression:
 * Rapidly estimates learner proficiency and places them at the edge of competence.
 * 
 * Uses simplified Bayesian Knowledge Tracing to:
 * - Update skill mastery probabilities based on responses
 * - Skip concepts with high mastery
 * - Accelerate into more complex material when confidence is high
 * - Fallback to safer difficulty when confidence drops
 */

import {
    PlacementDirective,
    LearnerModel,
    SessionTelemetry,
    ContentItem,
    MathOperation,
    SkillMastery,
    AIEngineConfig,
    DEFAULT_AI_CONFIG,
    RepresentationType,
} from '../types';
import {
    getSkillMastery,
    updateSkillMastery,
    tierToDifficulty,
    difficultyToTier,
} from '../state';
import {
    createSkillId,
    generateVariantFromProblem,
} from '../content-variants';
import {
    getTierOperandRange,
    MAX_TIER,
} from '@/lib/tier-system';

// =============================================================================
// PLACEMENT AGENT STATE
// =============================================================================

export interface PlacementAgentState {
    isInPlacementMode: boolean;
    questionsAsked: number;
    skillsProbed: Set<string>;
    confidenceScore: number;
    estimatedDifficulty: number;
    estimatedTier: number;
    lastUpdated: number;
}

/**
 * Initialize placement agent state
 */
export function initializePlacementAgent(
    existingTier: number = 1
): PlacementAgentState {
    return {
        isInPlacementMode: true,
        questionsAsked: 0,
        skillsProbed: new Set(),
        confidenceScore: 0.5,
        estimatedDifficulty: tierToDifficulty(existingTier),
        estimatedTier: existingTier,
        lastUpdated: Date.now(),
    };
}

// =============================================================================
// BAYESIAN KNOWLEDGE TRACING
// =============================================================================

/**
 * BKT parameters (can be tuned)
 */
interface BKTParams {
    pInit: number;      // Initial probability of mastery
    pLearn: number;     // Probability of learning after each opportunity
    pForget: number;    // Probability of forgetting
    pGuess: number;     // Probability of correct guess when not mastered
    pSlip: number;      // Probability of slip when mastered
}

const DEFAULT_BKT_PARAMS: BKTParams = {
    pInit: 0.3,
    pLearn: 0.1,
    pForget: 0.05,
    pGuess: 0.25,
    pSlip: 0.1,
};

/**
 * Update mastery probability using BKT
 */
export function bktUpdate(
    priorMastery: number,
    isCorrect: boolean,
    params: BKTParams = DEFAULT_BKT_PARAMS
): { posteriorMastery: number; infoGain: number } {
    const { pGuess, pSlip, pLearn, pForget } = params;

    // Calculate P(correct | state)
    const pCorrectMastered = 1 - pSlip;
    const pCorrectNotMastered = pGuess;

    // Calculate P(correct) using total probability
    const pCorrect = priorMastery * pCorrectMastered + (1 - priorMastery) * pCorrectNotMastered;

    // Bayesian update based on observation
    let posteriorMastery: number;

    if (isCorrect) {
        // P(mastered | correct)
        posteriorMastery = (priorMastery * pCorrectMastered) / pCorrect;
    } else {
        // P(mastered | incorrect)
        const pIncorrect = 1 - pCorrect;
        posteriorMastery = (priorMastery * pSlip) / pIncorrect;
    }

    // Apply learning/forgetting transition
    posteriorMastery = posteriorMastery * (1 - pForget) + (1 - posteriorMastery) * pLearn;

    // Clamp to valid range
    posteriorMastery = Math.max(0.01, Math.min(0.99, posteriorMastery));

    // Calculate information gain (change in uncertainty)
    const priorEntropy = -priorMastery * Math.log2(priorMastery + 0.001) -
        (1 - priorMastery) * Math.log2(1 - priorMastery + 0.001);
    const postEntropy = -posteriorMastery * Math.log2(posteriorMastery + 0.001) -
        (1 - posteriorMastery) * Math.log2(1 - posteriorMastery + 0.001);
    const infoGain = Math.abs(priorEntropy - postEntropy);

    return { posteriorMastery, infoGain };
}

// =============================================================================
// SKILL SELECTION FOR PLACEMENT
// =============================================================================

/**
 * Generate placement test items for an operation
 */
export function generatePlacementItems(
    operation: MathOperation,
    tier: number,
    count: number = 3
): ContentItem[] {
    const items: ContentItem[] = [];

    // Get appropriate number ranges for tier
    const [minOp, maxOp] = getTierOperandRange(tier);

    for (let i = 0; i < count; i++) {
        const op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        const op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;

        // Use direct representation for placement (clearest signal)
        const item = generateVariantFromProblem(operation, op1, op2, 'direct', tier);
        items.push(item);
    }

    return items;
}

// getTierOperandRange is now imported from @/lib/tier-system
// It uses parametric scaling for 100 tiers across 5 bands

/**
 * Select next skill to probe during placement
 */
export function selectNextPlacementSkill(
    state: PlacementAgentState,
    learnerModel: LearnerModel,
    operation: MathOperation,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): { skillId: string; item: ContentItem } | null {
    const { placement } = config;

    // Check if we've reached max questions
    if (state.questionsAsked >= placement.maxQuestions) {
        return null;
    }

    // Check if we've reached sufficient confidence
    if (state.confidenceScore >= placement.minConfidence) {
        return null;
    }

    // Find skill with highest uncertainty (most informative to probe)
    const tier = state.estimatedTier;
    const items = generatePlacementItems(operation, tier, 1);

    if (items.length === 0) {
        return null;
    }

    const item = items[0];
    return { skillId: item.skillId, item };
}

// =============================================================================
// PLACEMENT UPDATES
// =============================================================================

/**
 * Process a placement answer and update state
 */
export function processPlacementAnswer(
    state: PlacementAgentState,
    learnerModel: LearnerModel,
    item: ContentItem,
    isCorrect: boolean,
    latencyMs: number,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): {
    updatedState: PlacementAgentState;
    directive: PlacementDirective;
    shouldContinuePlacement: boolean;
} {
    const skillId = item.skillId;
    const skill = getSkillMastery(learnerModel, skillId);

    // BKT update
    const { posteriorMastery, infoGain } = bktUpdate(skill.masteryProb, isCorrect);
    skill.masteryProb = posteriorMastery;

    // Fast responses indicate higher mastery
    if (isCorrect && latencyMs < 2000) {
        skill.masteryProb = Math.min(0.99, skill.masteryProb + 0.05);
    }

    // Update placement state
    const updatedState = { ...state };
    updatedState.questionsAsked++;
    updatedState.skillsProbed.add(skillId);

    // Aggregate confidence from probed skills
    const probedMasteries = Array.from(updatedState.skillsProbed)
        .map(sid => getSkillMastery(learnerModel, sid).masteryProb);

    const avgMastery = probedMasteries.reduce((a, b) => a + b, 0) / probedMasteries.length;
    const masteryVariance = probedMasteries.reduce((acc, m) => acc + Math.pow(m - avgMastery, 2), 0) / probedMasteries.length;

    // Confidence increases with more questions and lower variance
    updatedState.confidenceScore = Math.min(0.99,
        0.3 + (updatedState.questionsAsked / config.placement.maxQuestions) * 0.4 +
        (1 - masteryVariance) * 0.3
    );

    // Adjust difficulty estimate based on performance
    // Using finer increments for 100-tier system
    if (isCorrect) {
        // Try harder next time - small increment (~1 tier)
        updatedState.estimatedDifficulty = Math.min(0.95, updatedState.estimatedDifficulty + 0.01);
    } else {
        // Step back - slightly larger decrement (~2 tiers)
        updatedState.estimatedDifficulty = Math.max(0.05, updatedState.estimatedDifficulty - 0.02);
    }

    // Map to tier
    updatedState.estimatedTier = difficultyToTier(updatedState.estimatedDifficulty);
    updatedState.lastUpdated = Date.now();

    // Check if we should continue
    const shouldContinuePlacement =
        updatedState.questionsAsked < config.placement.maxQuestions &&
        updatedState.confidenceScore < config.placement.minConfidence;

    if (!shouldContinuePlacement) {
        updatedState.isInPlacementMode = false;
    }

    // Build directive
    const directive = buildPlacementDirective(updatedState, learnerModel, config);

    return {
        updatedState,
        directive,
        shouldContinuePlacement,
    };
}

/**
 * Build placement directive
 */
function buildPlacementDirective(
    state: PlacementAgentState,
    learnerModel: LearnerModel,
    config: AIEngineConfig
): PlacementDirective {
    // Find skills to focus on (those with uncertainty in target band)
    const targetSkillBand: string[] = [];

    for (const [skillId, skill] of learnerModel.skills) {
        const uncertainty = skill.uncertainty;
        if (uncertainty >= config.placement.targetUncertaintyBand[0] &&
            uncertainty <= config.placement.targetUncertaintyBand[1]) {
            targetSkillBand.push(skillId);
        }
    }

    return {
        targetSkillBand,
        targetDifficulty: {
            level: state.estimatedDifficulty,
            min: Math.max(0.1, state.estimatedDifficulty - 0.15),
            max: Math.min(1.0, state.estimatedDifficulty + 0.15),
        },
        skipIfMasteryAbove: config.placement.skipIfMasteryAbove,
        updatePriors: true,
        confidenceScore: state.confidenceScore,
    };
}

// =============================================================================
// QUICK PLACEMENT (WITHOUT FORMAL TEST)
// =============================================================================

/**
 * Quick placement based on existing tier data
 */
export function quickPlacement(
    learnerModel: LearnerModel,
    operation: MathOperation,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): PlacementDirective {
    const currentTier = learnerModel.mathTiers[operation] || 1;
    const estimatedDifficulty = tierToDifficulty(currentTier);

    return {
        targetSkillBand: [],
        targetDifficulty: {
            level: estimatedDifficulty,
            min: Math.max(0.1, estimatedDifficulty - 0.15),
            max: Math.min(1.0, estimatedDifficulty + 0.15),
        },
        skipIfMasteryAbove: config.placement.skipIfMasteryAbove,
        updatePriors: false,
        confidenceScore: 0.7,  // Moderate confidence from existing data
    };
}

/**
 * Should we run a formal placement test?
 */
export function shouldRunPlacementTest(
    learnerModel: LearnerModel,
    operation: MathOperation
): boolean {
    const tier = learnerModel.mathTiers[operation];

    // Run placement if tier is 0 (never placed) or very low confidence
    if (tier === 0) return true;

    // Count how many skills have been probed for this operation
    let probedCount = 0;
    for (const [skillId] of learnerModel.skills) {
        if (skillId.startsWith(`${operation.substring(0, 3)}.`)) {
            probedCount++;
        }
    }

    // If we have very little data, suggest placement
    return probedCount < 5;
}
