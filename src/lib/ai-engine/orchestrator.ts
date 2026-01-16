/**
 * FlashMath AI Engine - Orchestrator
 * 
 * Coordinates all agents and applies directives to select the next question.
 * Implements the Stream Selector logic with priority-based candidate selection.
 * 
 * Turn Order:
 * 1. Placement Agent (during placement mode or low confidence)
 * 2. Echo Agent (schedules remediation)
 * 3. Coach Agent (tilt adjustments and hints)
 * 4. Stream Selector (applies directives)
 */

import {
    AIDirectiveEnvelope,
    LearnerModel,
    SessionTelemetry,
    ContentItem,
    MathOperation,
    EchoQueueEntry,
    QuestionCandidate,
    SelectionReason,
    PlacementDirective,
    CoachDirective,
    EchoDirective,
    HintPayload,
    AIEngineConfig,
    DEFAULT_AI_CONFIG,
    AnswerSubmittedEvent,
} from './types';

import {
    initializeLearnerModel,
    createSessionTelemetry,
    updateTelemetry,
    loadEchoQueue,
    persistLearnerModel,
    updateSkillMastery,
} from './state';

import {
    getTierOperandRange,
    getBandForTier,
    MIN_TIER,
} from '@/lib/tier-system';

import {
    eventBus,
    createAnswerEvent,
    createStreamTickEvent,
    createSessionStartEvent,
    createSessionEndEvent,
} from './event-bus';

import {
    generateVariantFromProblem,
    selectNextRepresentation,
} from './content-variants';

import {
    initializeEchoAgent,
    processAnswer as processEchoAnswer,
    tickQueue as tickEchoQueue,
    getNextEchoItem,
    EchoAgentState,
} from './agents/echo-agent';

import {
    initializeCoachAgent,
    updateCoachState,
    buildCoachDirective,
    getHint,
    getAdjustedDifficulty,
    TiltState,
} from './agents/coach-agent';

import {
    initializePlacementAgent,
    processPlacementAnswer,
    quickPlacement,
    shouldRunPlacementTest,
    generatePlacementItems,
    PlacementAgentState,
} from './agents/placement-agent';

import { generateId } from '@/lib/db';

// =============================================================================
// ORCHESTRATOR STATE
// =============================================================================

export interface OrchestratorState {
    sessionId: string;
    userId: string;
    operation: MathOperation;

    // Agent states
    learnerModel: LearnerModel;
    telemetry: SessionTelemetry;
    echoAgent: EchoAgentState;
    coachAgent: TiltState;
    placementAgent: PlacementAgentState;

    // Session tracking
    questionNumber: number;
    recentItems: ContentItem[];  // For anti-repeat

    // Configuration
    config: AIEngineConfig;
}

/**
 * Initialize orchestrator for a new session
 */
export function initializeOrchestrator(
    userId: string,
    operation: MathOperation,
    mathTiers: Record<MathOperation, number>,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): OrchestratorState {
    const sessionId = generateId();

    // Initialize learner model from DB
    const learnerModel = initializeLearnerModel(userId, mathTiers);

    // Load existing echo queue
    const echoQueue = loadEchoQueue(userId);

    // Initialize all agents
    const telemetry = createSessionTelemetry(sessionId, userId, config);
    const echoAgent = initializeEchoAgent(echoQueue);
    const coachAgent = initializeCoachAgent();
    const placementAgent = initializePlacementAgent(mathTiers[operation] || 1);

    // Emit session start event
    eventBus.emit(createSessionStartEvent(sessionId, userId, operation));

    return {
        sessionId,
        userId,
        operation,
        learnerModel,
        telemetry,
        echoAgent,
        coachAgent,
        placementAgent,
        questionNumber: 0,
        recentItems: [],
        config,
    };
}

// =============================================================================
// MAIN ORCHESTRATOR FUNCTIONS
// =============================================================================

/**
 * Get the next question from the orchestrator
 */
export async function getNextQuestion(
    state: OrchestratorState
): Promise<{
    state: OrchestratorState;
    envelope: AIDirectiveEnvelope;
}> {
    const { operation, config } = state;

    // Step 1: Tick echo queue
    const { updatedState: updatedEchoState, dueItems } = tickEchoQueue(
        state.echoAgent,
        state.coachAgent.tiltScore,
        config
    );
    state.echoAgent = updatedEchoState;

    // Step 2: Build coach directive
    const coachDirective = buildCoachDirective(state.coachAgent, config);

    // Step 3: Build placement directive
    const placementDirective = state.placementAgent.isInPlacementMode
        ? quickPlacement(state.learnerModel, operation, config)
        : quickPlacement(state.learnerModel, operation, config);

    // Step 4: Build echo directive
    const echoDirective: EchoDirective = {
        onWrongAnswer: {
            scheduleEcho: true,
            dueInQuestionsRange: config.echo.insertAfterNQuestions,
            escalateVariationOnRepeatMiss: true,
        },
        variationRules: {
            avoidSameSurfaceFormRepeats: true,
            allowedForms: ['direct', 'missing_op1', 'missing_op2', 'word', 'algebraic', 'visual'],
        },
        masteryGateRules: {
            blockAdvancementOnUnresolved: true,
            maxConcurrentOpenGates: 3,
        },
        scheduledInsertions: state.echoAgent.echoQueue.filter(e => e.status === 'scheduled'),
        dueItems,
    };

    // Step 5: Select next question using priority logic
    const { item, reasonCodes } = selectNextItem(
        state,
        dueItems,
        coachDirective,
        placementDirective
    );

    // Step 6: Update state
    state.questionNumber++;
    state.recentItems.push(item);
    if (state.recentItems.length > 10) {
        state.recentItems.shift();
    }

    // Emit stream tick event
    eventBus.emit(createStreamTickEvent(state.sessionId, state.userId, state.questionNumber));

    // Build envelope
    const envelope = buildEnvelope(
        state,
        placementDirective,
        coachDirective,
        echoDirective,
        item,
        reasonCodes
    );

    return { state, envelope };
}

/**
 * Process an answer and get next question
 */
export async function processAnswer(
    state: OrchestratorState,
    item: ContentItem,
    userAnswer: string | number,
    isCorrect: boolean,
    latencyMs: number,
    helpUsed: boolean = false
): Promise<{
    state: OrchestratorState;
    hint: HintPayload | null;
}> {
    const { config } = state;

    // Create answer event
    const event = createAnswerEvent(
        state.sessionId,
        state.userId,
        item,
        userAnswer,
        isCorrect,
        latencyMs,
        helpUsed
    );

    // Emit event
    await eventBus.emit(event);

    // Step 1: Update telemetry
    updateTelemetry(state.telemetry, isCorrect, latencyMs, helpUsed, config);

    // Step 2: Update coach state
    state.coachAgent = updateCoachState(state.coachAgent, state.telemetry, isCorrect, config);

    // Step 3: Update echo agent
    const echoResult = processEchoAnswer(
        state.echoAgent,
        event,
        state.learnerModel,
        config
    );
    state.echoAgent = echoResult.updatedState;

    // Apply mastery updates
    for (const update of echoResult.masteryUpdates) {
        const skill = state.learnerModel.skills.get(update.skillId);
        if (skill) {
            skill.masteryProb = Math.max(0.01, Math.min(0.99, skill.masteryProb + update.delta));
        }
    }

    // Step 4: Update skill mastery via BKT
    updateSkillMastery(state.learnerModel, item.skillId, isCorrect, latencyMs, config);

    // Step 5: Update global tilt risk
    state.learnerModel.global.tiltRisk = state.coachAgent.tiltScore;

    // Step 6: Generate hint if incorrect
    let hint: HintPayload | null = null;
    if (!isCorrect) {
        hint = await getHint(
            item,
            userAnswer,
            latencyMs,
            1,  // attempt number
            [],  // previous hints
            config
        );
    }

    // Step 7: If in placement mode, update placement
    if (state.placementAgent.isInPlacementMode) {
        const placementResult = processPlacementAnswer(
            state.placementAgent,
            state.learnerModel,
            item,
            isCorrect,
            latencyMs,
            config
        );
        state.placementAgent = placementResult.updatedState;
    }

    return { state, hint };
}

/**
 * End the session and persist state
 */
export async function endSession(
    state: OrchestratorState,
    stats: {
        totalQuestions: number;
        correctCount: number;
        avgLatencyMs: number;
        maxStreak: number;
        xpEarned: number;
    }
): Promise<void> {
    // Persist learner model
    persistLearnerModel(state.learnerModel);

    // Emit session end event
    await eventBus.emit(createSessionEndEvent(
        state.sessionId,
        state.userId,
        stats
    ));
}

// =============================================================================
// STREAM SELECTOR (PRIORITY-BASED SELECTION)
// =============================================================================

/**
 * Select the next item based on agent priorities
 */
function selectNextItem(
    state: OrchestratorState,
    dueItems: EchoQueueEntry[],
    coachDirective: CoachDirective,
    placementDirective: PlacementDirective
): { item: ContentItem; reasonCodes: SelectionReason[] } {
    const { operation, config } = state;
    const reasonCodes: SelectionReason[] = [];

    // Priority 1: Echo items that are due (must-serve)
    if (dueItems.length > 0 && !coachDirective.recoveryMode.enabled) {
        const echoItem = getNextEchoItem(state.echoAgent, state.placementAgent.estimatedTier, operation);
        if (echoItem) {
            reasonCodes.push('ECHO_DUE');

            // Check if we should use varied representation
            const entry = dueItems[0];
            if (entry.attempts > 0) {
                reasonCodes.push('CHAMELEON_VARIATION');
            }

            return { item: echoItem, reasonCodes };
        }
    }

    // Priority 2: Tilt recovery (serve easier problems)
    if (coachDirective.recoveryMode.enabled) {
        reasonCodes.push('TILT_RECOVERY');

        // Generate an easier problem - drop 5 tiers but stay within same band if possible
        const userTier = state.learnerModel.mathTiers[operation] || 1;
        const userBand = getBandForTier(userTier);
        const recoveryTier = Math.max(MIN_TIER, Math.max(userBand.tierRange[0], userTier - 5));

        const item = generatePracticeItem(operation, recoveryTier, state.recentItems);
        return { item, reasonCodes };
    }

    // Priority 3: Echo items due (even with recovery, but delayed)
    if (dueItems.length > 0) {
        const echoItem = getNextEchoItem(state.echoAgent, state.placementAgent.estimatedTier, operation);
        if (echoItem) {
            reasonCodes.push('ECHO_DUE');
            return { item: echoItem, reasonCodes };
        }
    }

    // Priority 4: Regular practice at target difficulty
    // Use actual user tier from learnerModel, NOT the dynamic placement estimate
    reasonCodes.push('MAINTENANCE');
    const userTier = state.learnerModel.mathTiers[operation] || 1;
    console.log(`[AI ORCHESTRATOR] Generating question for op=${operation}, tier=${userTier}, mathTiers=`, state.learnerModel.mathTiers);
    const item = generatePracticeItem(operation, userTier, state.recentItems);

    return { item, reasonCodes };
}

/**
 * Generate a practice item avoiding recent repeats
 */
function generatePracticeItem(
    operation: MathOperation,
    tier: number,
    recentItems: ContentItem[]
): ContentItem {
    const recentSkillIds = new Set(recentItems.map(i => i.skillId));

    // Get appropriate operand range for tier
    const [minOp, maxOp] = getTierOperandRange(tier, operation);

    // Try up to 10 times to generate a non-repeat
    for (let attempt = 0; attempt < 10; attempt++) {
        let op1: number, op2: number;

        if (operation === 'division') {
            // For division, generate a multiplication fact and reverse it
            // This ensures clean integer answers
            const divisor = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            const quotient = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op1 = divisor * quotient;  // dividend = divisor × quotient
            op2 = divisor;
            // Now op1 ÷ op2 = quotient (always an integer)
        } else {
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        }

        const item = generateVariantFromProblem(operation, op1, op2, 'direct', tier);

        if (!recentSkillIds.has(item.skillId) || attempt === 9) {
            return item;
        }
    }

    // Fallback
    let op1: number, op2: number;
    if (operation === 'division') {
        const divisor = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        const quotient = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        op1 = divisor * quotient;
        op2 = divisor;
    } else {
        op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
    }
    return generateVariantFromProblem(operation, op1, op2, 'direct', tier);
}

// getTierOperandRange is now imported from @/lib/tier-system
// It uses parametric scaling for 100 tiers across 5 bands

// =============================================================================
// ENVELOPE BUILDER
// =============================================================================

function buildEnvelope(
    state: OrchestratorState,
    placementDirective: PlacementDirective,
    coachDirective: CoachDirective,
    echoDirective: EchoDirective,
    item: ContentItem,
    reasonCodes: SelectionReason[]
): AIDirectiveEnvelope {
    return {
        specVersion: '1.0',
        timestampMs: Date.now(),
        session: {
            sessionId: state.sessionId,
            userId: state.userId,
            mode: 'solo',
        },
        learnerModel: state.learnerModel,
        telemetry: state.telemetry,
        echoQueue: state.echoAgent.echoQueue,
        directives: {
            placement: placementDirective,
            coach: coachDirective,
            echo: echoDirective,
        },
        selection: {
            chosenCandidateId: item.itemId,
            item,
            reasonCodes,
        },
        audit: {
            agentVersions: {
                placementAgent: '1.0.0',
                coachAgent: '1.0.0',
                echoAgent: '1.0.0',
                orchestrator: '1.0.0',
            },
            traceId: generateId(),
        },
    };
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export {
    initializeEchoAgent,
    initializeCoachAgent,
    initializePlacementAgent,
};
