/**
 * FlashMath AI Engine - Coach Agent
 * 
 * Implements Real-Time Coaching ("Coach Layer"):
 * Maintains flow state via telemetry-based difficulty modulation and targeted hints.
 * 
 * Responsibilities:
 * - Tilt detection (consecutive misses, latency spikes, error bursts)
 * - Cognitive load balancing (temporary difficulty reduction)
 * - Socratic hint generation (LLM-powered and rules-based)
 * - Recovery mode management
 */

import {
    CoachDirective,
    ContentItem,
    HintPayload,
    HintRequest,
    HintType,
    AIEngineConfig,
    DEFAULT_AI_CONFIG,
    ErrorSignature,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    LearnerModel,
     
    SessionTelemetry,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
    AnswerSubmittedEvent,
} from '../types';
import { getLatencyTrendRatio } from '../state';

// =============================================================================
// TILT DETECTION
// =============================================================================

export interface TiltState {
    tiltScore: number;              // 0.0 to 1.0
    isInRecovery: boolean;
    recoveryQuestionsRemaining: number;
    recoveryDifficultyDelta: number;
    lastTiltCheck: number;
}

/**
 * Initialize coach agent state
 */
export function initializeCoachAgent(): TiltState {
    return {
        tiltScore: 0,
        isInRecovery: false,
        recoveryQuestionsRemaining: 0,
        recoveryDifficultyDelta: 0,
        lastTiltCheck: Date.now(),
    };
}

/**
 * Calculate tilt score from telemetry signals
 */
export function calculateTiltScore(
    telemetry: SessionTelemetry,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): number {
    const { tilt } = config;

    // Signal 1: Consecutive misses
    const missScore = Math.min(1.0, telemetry.consecutiveMisses / tilt.consecutiveMissesThreshold);

    // Signal 2: Error burst density
    const burstScore = telemetry.errorBurstScore / tilt.errorBurstThreshold;

    // Signal 3: Latency trend (slowing down = frustration)
    const latencyRatio = getLatencyTrendRatio(telemetry);
    const latencyScore = Math.min(1.0, Math.max(0, (latencyRatio - 1) / (tilt.latencyIncreaseRatio - 1)));

    // Weighted combination
    const tiltScore =
        tilt.weights.consecutiveMisses * missScore +
        tilt.weights.errorBurstScore * burstScore +
        tilt.weights.latencyTrend * latencyScore;

    return Math.min(1.0, Math.max(0, tiltScore));
}

/**
 * Update coach state after each answer
 */
export function updateCoachState(
    state: TiltState,
    telemetry: SessionTelemetry,
    isCorrect: boolean,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): TiltState {
    const newTiltScore = calculateTiltScore(telemetry, config);

    let updatedState = { ...state, tiltScore: newTiltScore };

    // Check if we should enter recovery mode
    if (!state.isInRecovery && newTiltScore > 0.75) {
        updatedState = {
            ...updatedState,
            isInRecovery: true,
            recoveryQuestionsRemaining: config.tilt.recoveryDurationQuestions,
            recoveryDifficultyDelta: config.tilt.recoveryDifficultyDelta,
        };
    }

    // Progress recovery mode
    if (state.isInRecovery) {
        updatedState.recoveryQuestionsRemaining--;

        // Ramp back difficulty gradually
        updatedState.recoveryDifficultyDelta += config.tilt.rampBackPercentPerQuestion;

        // Exit recovery if questions exhausted or recovered
        if (updatedState.recoveryQuestionsRemaining <= 0 || newTiltScore < 0.3) {
            updatedState = {
                ...updatedState,
                isInRecovery: false,
                recoveryQuestionsRemaining: 0,
                recoveryDifficultyDelta: 0,
            };
        }
    }

    updatedState.lastTiltCheck = Date.now();

    return updatedState;
}

/**
 * Build coach directive
 */
export function buildCoachDirective(
    state: TiltState,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): CoachDirective {
    return {
        tiltDetected: state.tiltScore > 0.75,
        tiltScore: state.tiltScore,
        recoveryMode: {
            enabled: state.isInRecovery,
            difficultyDeltaPct: state.recoveryDifficultyDelta,
            ttlQuestions: config.tilt.recoveryDurationQuestions,
            questionsRemaining: state.recoveryQuestionsRemaining,
        },
        hintPolicy: {
            onWrongAnswer: state.tiltScore > 0.5 ? 'socratic' : 'brief',
            onHelpRequest: 'socratic',
            maxHintTokens: config.hints.maxTokens,
            noFullSolution: true,
        },
    };
}

// =============================================================================
// ERROR SIGNATURE DETECTION
// =============================================================================

/**
 * Detect error signature from wrong answer
 */
export function detectErrorSignature(
    correctAnswer: number,
    userAnswer: number
): ErrorSignature {
    const diff = userAnswer - correctAnswer;
    const ratio = userAnswer / correctAnswer;

    // Magnitude error (off by factor of 10, 100, etc.)
    if (Math.abs(ratio - 10) < 0.01 || Math.abs(ratio - 0.1) < 0.01) {
        return 'magnitude_error';
    }
    if (Math.abs(ratio - 100) < 0.01 || Math.abs(ratio - 0.01) < 0.001) {
        return 'magnitude_error';
    }

    // Off by one
    if (Math.abs(diff) === 1) {
        return 'off_by_one';
    }

    // Place value error (digits in wrong position)
    const correctStr = correctAnswer.toString();
    const userStr = userAnswer.toString();
    if (correctStr.length === userStr.length) {
        const sortedCorrect = correctStr.split('').sort().join('');
        const sortedUser = userStr.split('').sort().join('');
        if (sortedCorrect === sortedUser) {
            return 'place_value_error';
        }
    }

    // Near fact confusion (within small range)
    const percentOff = Math.abs(diff) / correctAnswer;
    if (percentOff < 0.2 && percentOff > 0.01) {
        return 'near_fact_confusion';
    }

    return 'unknown';
}

// =============================================================================
// HINT GENERATION - RULES BASED
// =============================================================================

/**
 * Generate a rules-based hint
 */
export function generateRulesBasedHint(
    question: ContentItem,
    userAnswer: string | number,
    correctAnswer: string | number
): HintPayload {
    const userNum = typeof userAnswer === 'string' ? parseFloat(userAnswer) : userAnswer;
    const correctNum = typeof correctAnswer === 'string' ? parseFloat(correctAnswer) : correctAnswer;

    if (isNaN(userNum)) {
        return {
            hintText: "Make sure to enter a number.",
            hintType: 'general',
            confidence: 0.9,
            isLLMGenerated: false,
        };
    }

    const errorSig = detectErrorSignature(correctNum, userNum);

    let hintText: string;
    let hintType: HintType;

    switch (errorSig) {
        case 'magnitude_error':
            hintText = "You're off by a factor of 10. Check your place value - did you add an extra zero or miss one?";
            hintType = 'magnitude_check';
            break;

        case 'off_by_one':
            hintText = "Very close! You're just one off. Double-check your calculation.";
            hintType = 'near_facts';
            break;

        case 'place_value_error':
            hintText = "The digits look right but might be in the wrong order. Check your place values.";
            hintType = 'place_value_check';
            break;

        case 'near_fact_confusion':
            hintText = getOperationSpecificHint(question, userNum, correctNum);
            hintType = 'near_facts';
            break;

        default:
            hintText = getOperationSpecificHint(question, userNum, correctNum);
            hintType = 'general';
    }

    return {
        hintText,
        hintType,
        confidence: 0.7,
        isLLMGenerated: false,
    };
}

function getOperationSpecificHint(
    question: ContentItem,
    _userAnswer: number,
    _correctAnswer: number
): string {
    const { operation, operand1, operand2 } = question;

    switch (operation) {
        case 'multiplication':
            if (operand1 && operand2) {
                // Suggest decomposition
                if (operand2 > 5) {
                    return `Try breaking it down: ${operand1} × ${operand2} = ${operand1} × ${Math.floor(operand2 / 2)} × 2`;
                }
                return `Think about it as ${operand1} groups of ${operand2}. What does that give you?`;
            }
            return "Check your multiplication. Try breaking the numbers into smaller parts.";

        case 'addition':
            if (operand1 && operand2) {
                return `Try adding step by step: Start with ${operand1}, then add ${operand2}.`;
            }
            return "Count carefully from the first number.";

        case 'subtraction':
            if (operand1 && operand2) {
                return `Start at ${operand1} and count back ${operand2}.`;
            }
            return "Think about how much is left when you take away.";

        case 'division':
            if (operand1 && operand2) {
                return `How many groups of ${operand2} fit into ${operand1}?`;
            }
            return "Think about equal sharing - how many in each group?";

        default:
            return "Take your time and check your work.";
    }
}

/**
 * Generate a hint using LLM (async) - Uses Claude/Anthropic
 */
export async function generateLLMHint(
    request: HintRequest,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): Promise<HintPayload> {
    const { question, userAnswer, correctAnswer, errorContext, policy: _policy } = request;

    // Build prompt for Claude
    const systemPrompt = `You are a patient, encouraging math tutor for children ages 6-12.
Your job is to give a helpful hint that guides the student toward the correct answer.

Guidelines:
- Explain the concept step-by-step in a friendly way
- Give them a strategy or method to solve similar problems
- Use real-world examples when helpful (like counting objects, groups, etc.)
- Be encouraging and build their confidence
- Don't just give the answer, but help them understand HOW to find it
- Keep the explanation under 2-3 sentences
- Use simple language appropriate for children`;

    const userPrompt = `The student was asked: "${question.promptText}"
They answered: ${userAnswer}
The correct answer is: ${correctAnswer}
This is attempt ${errorContext.attemptNumber}.

Help them understand how to solve this. Explain the concept in a friendly way that guides them to the answer.`;

    try {
        // Check if we have Anthropic API key configured
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey || !config.hints.useLLM) {
            // Fallback to rules-based
            return generateRulesBasedHint(question, userAnswer, correctAnswer);
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',  // Fast and cheap for hints
                max_tokens: config.hints.maxTokens,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt },
                ],
            }),
        });

        if (!response.ok) {
            console.error('[Coach] Claude API error:', response.status);
            return generateRulesBasedHint(question, userAnswer, correctAnswer);
        }

        const data = await response.json();
        const hintText = data.content?.[0]?.text?.trim();

        if (!hintText) {
            return generateRulesBasedHint(question, userAnswer, correctAnswer);
        }

        return {
            hintText,
            hintType: 'general',
            confidence: 0.85,
            isLLMGenerated: true,
        };

    } catch (error) {
        console.error('[Coach] Claude hint generation failed:', error);
        return generateRulesBasedHint(question, userAnswer, correctAnswer);
    }
}


/**
 * Get appropriate hint based on context
 */
export async function getHint(
    question: ContentItem,
    userAnswer: string | number,
    responseTimeMs: number,
    attemptNumber: number,
    previousHints: string[],
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): Promise<HintPayload> {
    const request: HintRequest = {
        question,
        userAnswer,
        correctAnswer: question.correctAnswer,
        errorContext: {
            responseTimeMs,
            attemptNumber,
            previousHints,
        },
        policy: {
            style: attemptNumber > 2 ? 'detailed' : 'socratic',
            maxTokens: config.hints.maxTokens,
            noFullSolution: attemptNumber < 3,
        },
    };

    // Use LLM if configured, otherwise rules-based
    if (config.hints.useLLM) {
        return await generateLLMHint(request, config);
    }

    return generateRulesBasedHint(question, userAnswer, question.correctAnswer);
}

// =============================================================================
// DIFFICULTY ADJUSTMENT
// =============================================================================

/**
 * Calculate adjusted difficulty based on recovery mode
 */
export function getAdjustedDifficulty(
    baseDifficulty: number,
    state: TiltState
): number {
    if (!state.isInRecovery) {
        return baseDifficulty;
    }

    // Apply recovery delta (negative = easier)
    const adjusted = baseDifficulty * (1 + state.recoveryDifficultyDelta);

    // Clamp to valid range
    return Math.max(0.1, Math.min(1.0, adjusted));
}

/**
 * Should we show a hint automatically?
 */
export function shouldShowAutoHint(
    state: TiltState,
    telemetry: SessionTelemetry
): boolean {
    // Auto-hint if tilt is high and multiple consecutive misses
    return state.tiltScore > 0.6 && telemetry.consecutiveMisses >= 2;
}
