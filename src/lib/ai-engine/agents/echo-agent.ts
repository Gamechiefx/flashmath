/**
 * FlashMath AI Engine - Echo Agent
 * 
 * Implements "The Echo Mechanic" - Immediate Correction Loop:
 * Prevents "fail-forward drift" by forcing rapid conceptual repair.
 * 
 * Responsibilities:
 * - Schedule echo loops when learner answers incorrectly
 * - Reinsert concepts within 2-5 questions using varied repetition
 * - Track attempts and escalate representation variety on repeat misses
 * - Enforce mastery gates before releasing concepts
 */

import {
    EchoDirective,
    EchoQueueEntry,
    ContentItem,
    AIEngineConfig,
    DEFAULT_AI_CONFIG,
     
    LearnerModel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    SessionTelemetry,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    RepresentationType,
     
    AnswerSubmittedEvent,
} from '../types';
import {
    addToEchoQueue,
    updateEchoQueueEntry,
    tickEchoQueue,
    resolveEchoQueueEntry,
    failEchoQueueEntry,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    updateSkillMastery,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    addErrorSignature,
} from '../state';
import {
     
    selectNextRepresentation,
    generateVariant,
} from '../content-variants';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
import { generateId } from '@/lib/db';

// =============================================================================
// ECHO AGENT
// =============================================================================

export interface EchoAgentState {
    echoQueue: EchoQueueEntry[];
    recentResolutions: Map<string, number>;  // skillId -> timestamp of last resolution
    consecutiveCorrectBySkill: Map<string, number>;  // For release condition tracking
}

/**
 * Initialize Echo Agent state
 */
export function initializeEchoAgent(echoQueue: EchoQueueEntry[] = []): EchoAgentState {
    return {
        echoQueue,
        recentResolutions: new Map(),
        consecutiveCorrectBySkill: new Map(),
    };
}

/**
 * Process an answer event and update echo state
 */
export function processAnswer(
    state: EchoAgentState,
    event: AnswerSubmittedEvent,
    learnerModel: LearnerModel,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): {
    updatedState: EchoAgentState;
    directive: EchoDirective;
    masteryUpdates: { skillId: string; delta: number }[];
} {
    const { item, isCorrect, latencyMs: _latencyMs } = event;
    const skillId = item.skillId;

    const updatedQueue = [...state.echoQueue];
    const masteryUpdates: { skillId: string; delta: number }[] = [];

    // Check if this was an echo item
    const echoIndex = updatedQueue.findIndex(
        e => e.skillId === skillId && e.status === 'due'
    );
    const isEchoItem = echoIndex >= 0;

    if (isCorrect) {
        // Handle correct answer
        if (isEchoItem) {
            // Correct on echo - good recovery!
            const entry = updatedQueue[echoIndex];
            entry.attempts++;

            // Track consecutive correct
            const prevConsecutive = state.consecutiveCorrectBySkill.get(skillId) || 0;
            const newConsecutive = prevConsecutive + 1;
            state.consecutiveCorrectBySkill.set(skillId, newConsecutive);

            // Check release condition
            if (newConsecutive >= config.echo.releaseRequiredConsecutive) {
                // Release the concept!
                entry.status = 'resolved';
                resolveEchoQueueEntry(entry.id);
                state.recentResolutions.set(skillId, Date.now());

                // Positive mastery update
                masteryUpdates.push({
                    skillId,
                    delta: config.echo.masteryDeltaOnEchoCorrect,
                });
            } else {
                // Not enough consecutive - reschedule for confirmation
                entry.status = 'scheduled';
                entry.questionsUntilDue = 3;  // Check again soon
                updateEchoQueueEntry(entry);
            }
        } else {
            // Regular correct answer - reset consecutive counter if exists
            const currentConsecutive = state.consecutiveCorrectBySkill.get(skillId) || 0;
            if (currentConsecutive > 0) {
                state.consecutiveCorrectBySkill.set(skillId, currentConsecutive + 1);
            }
        }
    } else {
        // Handle incorrect answer
        state.consecutiveCorrectBySkill.set(skillId, 0);  // Reset streak

        if (isEchoItem) {
            // Repeat miss on echo - escalate!
            const entry = updatedQueue[echoIndex];
            entry.attempts++;

            if (entry.attempts >= entry.maxAttempts) {
                // Failed too many times - mark as failed
                entry.status = 'failed';
                failEchoQueueEntry(entry.id);

                // Strong negative mastery update
                masteryUpdates.push({
                    skillId,
                    delta: config.echo.masteryDeltaOnRepeatMiss * 2,  // Double penalty
                });
            } else {
                // Reschedule with different representation
                entry.usedRepresentations.push(entry.nextRepresentation);
                entry.nextRepresentation = selectNextRepresentation(entry.usedRepresentations);
                entry.status = 'scheduled';
                entry.questionsUntilDue = Math.floor(
                    Math.random() * (config.echo.insertAfterNQuestions[1] - config.echo.insertAfterNQuestions[0] + 1)
                ) + config.echo.insertAfterNQuestions[0];
                entry.priority++; // Increase priority

                updateEchoQueueEntry(entry);

                // Negative mastery update
                masteryUpdates.push({
                    skillId,
                    delta: config.echo.masteryDeltaOnRepeatMiss,
                });
            }
        } else {
            // New miss - schedule echo
            const existingEntry = updatedQueue.find(e => e.skillId === skillId && e.status !== 'resolved' && e.status !== 'failed');

            if (!existingEntry) {
                // Schedule new echo
                const insertAfterN = Math.floor(
                    Math.random() * (config.echo.insertAfterNQuestions[1] - config.echo.insertAfterNQuestions[0] + 1)
                ) + config.echo.insertAfterNQuestions[0];

                const newEntry = addToEchoQueue(
                    event.userId,
                    skillId,
                    item.conceptId,
                    insertAfterN,
                    config
                );

                updatedQueue.push(newEntry);
            }

            // Initial miss mastery penalty
            masteryUpdates.push({
                skillId,
                delta: config.echo.masteryDeltaOnMiss,
            });
        }
    }

    // Build directive
    const directive = buildEchoDirective(updatedQueue, config);

    return {
        updatedState: {
            ...state,
            echoQueue: updatedQueue,
        },
        directive,
        masteryUpdates,
    };
}

/**
 * Tick the echo queue - called before selecting next question
 */
export function tickQueue(
    state: EchoAgentState,
    tiltRisk: number,
    _config: AIEngineConfig = DEFAULT_AI_CONFIG
): {
    updatedState: EchoAgentState;
    dueItems: EchoQueueEntry[];
} {
    // Decrement countdowns
    let updatedQueue = tickEchoQueue(state.echoQueue);

    // If tilt is high, delay echoes (be gentler)
    if (tiltRisk > 0.75) {
        updatedQueue = updatedQueue.map(entry => {
            if (entry.status === 'due') {
                return {
                    ...entry,
                    status: 'scheduled' as const,
                    questionsUntilDue: 2,  // Delay a bit
                };
            }
            return entry;
        });
    }

    // Get items that are now due
    const dueItems = updatedQueue.filter(e => e.status === 'due');

    return {
        updatedState: {
            ...state,
            echoQueue: updatedQueue,
        },
        dueItems,
    };
}

/**
 * Build echo directive based on current state
 */
function buildEchoDirective(
    queue: EchoQueueEntry[],
    config: AIEngineConfig
): EchoDirective {
    const scheduledInsertions = queue.filter(e => e.status === 'scheduled');
    const dueItems = queue.filter(e => e.status === 'due');

    return {
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
        scheduledInsertions,
        dueItems,
    };
}

/**
 * Get the next echo item to serve (if any are due)
 * Only returns items that match the current operation
 */
export function getNextEchoItem(
    state: EchoAgentState,
    currentTier: number,
    currentOperation?: string
): ContentItem | null {
    let dueItems = state.echoQueue.filter(e => e.status === 'due');

    // Filter by operation if specified
    if (currentOperation) {
        dueItems = dueItems.filter(e => {
            // Check if skillId starts with correct operation prefix
            const opPrefix = {
                'multiplication': 'mul.',
                'addition': 'add.',
                'subtraction': 'sub.',
                'division': 'div.',
            }[currentOperation.toLowerCase()];
            return opPrefix && e.skillId.startsWith(opPrefix);
        });
    }

    if (dueItems.length === 0) {
        return null;
    }

    // Sort by priority (highest first)
    dueItems.sort((a, b) => b.priority - a.priority);

    const entry = dueItems[0];

    // Generate variant with the next representation
    const item = generateVariant(entry.skillId, entry.nextRepresentation, currentTier);

    return item;
}


/**
 * Check if there are any blocking gates (concepts that must be mastered)
 */
export function hasBlockingGates(
    state: EchoAgentState,
    maxConcurrent: number = 3
): boolean {
    const activeEchoes = state.echoQueue.filter(
        e => e.status !== 'resolved' && e.status !== 'failed'
    );

    return activeEchoes.length >= maxConcurrent;
}

/**
 * Get echo queue statistics for debugging/display
 */
export function getEchoStats(state: EchoAgentState): {
    scheduled: number;
    due: number;
    resolved: number;
    failed: number;
    total: number;
} {
    const scheduled = state.echoQueue.filter(e => e.status === 'scheduled').length;
    const due = state.echoQueue.filter(e => e.status === 'due').length;
    const resolved = state.echoQueue.filter(e => e.status === 'resolved').length;
    const failed = state.echoQueue.filter(e => e.status === 'failed').length;

    return {
        scheduled,
        due,
        resolved,
        failed,
        total: state.echoQueue.length,
    };
}

/**
 * Clean up old resolved/failed entries
 */
export function cleanupEchoQueue(
    state: EchoAgentState,
    maxAgeMs: number = 24 * 60 * 60 * 1000  // 24 hours
): EchoAgentState {
    const now = Date.now();

    const cleanedQueue = state.echoQueue.filter(entry => {
        if (entry.status === 'resolved' || entry.status === 'failed') {
            return (now - entry.createdAt) < maxAgeMs;
        }
        return true;  // Keep active entries
    });

    return {
        ...state,
        echoQueue: cleanedQueue,
    };
}
