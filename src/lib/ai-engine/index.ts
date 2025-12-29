/**
 * FlashMath AI Engine - Barrel Export
 * 
 * Main entry point for the adaptive AI learning system.
 */

// Core types
export * from './types';

// State management
export {
    initializeLearnerModel,
    getSkillMastery,
    updateSkillMastery,
    persistLearnerModel,
    createSessionTelemetry,
    updateTelemetry,
    loadEchoQueue,
    addToEchoQueue,
    tierToDifficulty,
    difficultyToTier,
} from './state';

// Event bus
export {
    eventBus,
    createAnswerEvent,
    createStreamTickEvent,
    createSessionStartEvent,
    createSessionEndEvent,
} from './event-bus';

// Content variants
export {
    generateVariant,
    generateVariantFromProblem,
    selectNextRepresentation,
    parseSkillId,
    createSkillId,
} from './content-variants';

// Agents
export {
    initializeEchoAgent,
    processAnswer as processEchoAgentAnswer,
    tickQueue as tickEchoQueue,
    getNextEchoItem,
    getEchoStats,
} from './agents/echo-agent';

export {
    initializeCoachAgent,
    updateCoachState,
    buildCoachDirective,
    getHint,
    calculateTiltScore,
    getAdjustedDifficulty,
    detectErrorSignature,
} from './agents/coach-agent';

export {
    initializePlacementAgent,
    processPlacementAnswer,
    quickPlacement,
    shouldRunPlacementTest,
    generatePlacementItems,
    bktUpdate,
} from './agents/placement-agent';

// Orchestrator (main entry point)
export {
    initializeOrchestrator,
    getNextQuestion,
    processAnswer,
    endSession,
    type OrchestratorState,
} from './orchestrator';
