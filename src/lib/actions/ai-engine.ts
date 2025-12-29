"use server";

/**
 * FlashMath AI Engine - Server Actions
 * 
 * Server-side actions for the adaptive AI learning system.
 * These actions coordinate with the orchestrator to provide
 * AI-driven practice sessions.
 */

import { auth } from "@/auth";
import { queryOne } from "@/lib/db";
import {
    initializeOrchestrator,
    getNextQuestion,
    processAnswer,
    endSession,
    OrchestratorState,
    MathOperation,
    ContentItem,
    HintPayload,
    AIDirectiveEnvelope,
    DEFAULT_AI_CONFIG,
} from "@/lib/ai-engine";

// In-memory session store (in production, use Redis or similar)
const activeSessions = new Map<string, OrchestratorState>();

/**
 * Initialize an AI-powered practice session
 */
export async function initializeAISession(operation: string): Promise<{
    sessionId: string;
    firstQuestion: ContentItem;
    envelope: AIDirectiveEnvelope;
} | { error: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    // Get user's current math tiers
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (!user) {
        return { error: "User not found" };
    }

    // Parse mathTiers from JSON if needed
    let mathTiers = user.math_tiers;
    if (typeof mathTiers === 'string') {
        try {
            mathTiers = JSON.parse(mathTiers);
        } catch {
            mathTiers = null;
        }
    }
    mathTiers = mathTiers || {
        addition: 1,
        subtraction: 1,
        multiplication: 1,
        division: 1,
    };

    console.log(`[AI] Starting session for ${userId}, operation: ${operation}, tier: ${mathTiers[operation.toLowerCase()] || 1}`);

    // Initialize orchestrator
    const state = initializeOrchestrator(
        userId,
        operation.toLowerCase() as MathOperation,
        mathTiers,
        DEFAULT_AI_CONFIG
    );

    // Get first question
    const { state: updatedState, envelope } = await getNextQuestion(state);

    // Store session
    activeSessions.set(updatedState.sessionId, updatedState);

    return {
        sessionId: updatedState.sessionId,
        firstQuestion: envelope.selection.item,
        envelope,
    };
}

/**
 * Submit an answer and get next question
 */
export async function submitAIAnswer(
    sessionId: string,
    userAnswer: string | number,
    latencyMs: number,
    helpUsed: boolean = false
): Promise<{
    isCorrect: boolean;
    hint: HintPayload | null;
    nextQuestion: ContentItem;
    envelope: AIDirectiveEnvelope;
    sessionStats: {
        questionNumber: number;
        tiltScore: number;
        echoQueueSize: number;
        echoItemsResolved: number;
    };
} | { error: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    // Get session state
    const state = activeSessions.get(sessionId);
    if (!state) {
        return { error: "Session not found" };
    }

    // Get current item from state
    const currentItem = state.recentItems[state.recentItems.length - 1];
    if (!currentItem) {
        return { error: "No current question" };
    }

    // Check correctness
    const correctAnswer = currentItem.correctAnswer;
    const userNum = typeof userAnswer === 'string' ? parseFloat(userAnswer) : userAnswer;
    const correctNum = typeof correctAnswer === 'string' ? parseFloat(correctAnswer) : correctAnswer;
    const isCorrect = !isNaN(userNum) && Math.abs(userNum - correctNum) < 0.01;

    // Process answer
    const { state: stateAfterAnswer, hint } = await processAnswer(
        state,
        currentItem,
        userAnswer,
        isCorrect,
        latencyMs,
        helpUsed
    );

    // Get next question
    const { state: stateAfterNext, envelope } = await getNextQuestion(stateAfterAnswer);

    // Update stored session
    activeSessions.set(sessionId, stateAfterNext);

    return {
        isCorrect,
        hint,
        nextQuestion: envelope.selection.item,
        envelope,
        sessionStats: {
            questionNumber: stateAfterNext.questionNumber,
            tiltScore: stateAfterNext.coachAgent.tiltScore,
            echoQueueSize: stateAfterNext.echoAgent.echoQueue.filter(e =>
                e.status === 'scheduled' || e.status === 'due'
            ).length,
            echoItemsResolved: stateAfterNext.echoAgent.echoQueue.filter(e =>
                e.status === 'resolved'
            ).length,
        },
    };
}

/**
 * Request a hint for the current question
 */
export async function requestAIHint(
    sessionId: string,
    userAnswer: string | number,
    latencyMs: number,
    problemText?: string,
    correctAnswer?: number | string
): Promise<{ hint: HintPayload } | { error: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const state = activeSessions.get(sessionId);
    if (!state) {
        return { error: "Session not found" };
    }

    // Import hint function and content variant helper
    const { getHint } = await import("@/lib/ai-engine/agents/coach-agent");

    // Use passed-in problem details if available, otherwise fall back to state
    let currentItem = state.recentItems[state.recentItems.length - 1];

    // Override with client-provided data if given (more reliable)
    if (problemText && correctAnswer !== undefined) {
        currentItem = {
            ...currentItem,
            promptText: problemText,
            correctAnswer: correctAnswer,
        };
    }

    if (!currentItem) {
        return { error: "No current question" };
    }

    const hint = await getHint(
        currentItem,
        userAnswer,
        latencyMs,
        1,  // attempt number
        [],  // previous hints
        state.config
    );

    return { hint };
}

/**
 * End an AI session and save results
 * Persists AI-estimated tier if learner showed strong fluency
 */
export async function endAISession(
    sessionId: string,
    stats: {
        totalQuestions: number;
        correctCount: number;
        avgLatencyMs: number;
        maxStreak: number;
        xpEarned: number;
    }
): Promise<{
    success: boolean;
    tierProgression?: {
        operation: string;
        previousTier: number;
        newTier: number;
        advanced: boolean;
    };
} | { error: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;
    const state = activeSessions.get(sessionId);
    if (!state) {
        return { error: "Session not found" };
    }

    // Calculate if tier should advance based on AI analysis
    const operation = state.operation;
    const previousTier = state.learnerModel.mathTiers[operation] || 1;
    const estimatedTier = state.placementAgent.estimatedTier;
    const confidence = state.placementAgent.confidenceScore;
    const accuracy = stats.correctCount / Math.max(1, stats.totalQuestions);
    const tiltScore = state.coachAgent.tiltScore;

    // Determine if tier should advance
    // VERY STRICT requirements - must demonstrate consistent mastery
    let newTier = previousTier;
    const shouldAdvance =
        confidence >= 0.85 &&            // AI must be very confident in estimate
        accuracy >= 0.90 &&              // 90%+ accuracy
        estimatedTier > previousTier &&  // AI estimates higher ability
        stats.totalQuestions >= 25 &&    // At least 25 questions (substantial session)
        tiltScore < 0.3 &&               // Low frustration (not struggling)
        stats.maxStreak >= 8;            // Strong consistency with a longer streak

    if (shouldAdvance) {
        // Advance by 1 tier (conservative)
        newTier = Math.min(4, previousTier + 1);

        // Update user's math_tiers in database
        const { execute, queryOne: dbQueryOne } = await import("@/lib/db");
        const user = dbQueryOne("SELECT math_tiers FROM users WHERE id = ?", [userId]) as any;

        if (user) {
            let mathTiers = user.math_tiers;
            if (typeof mathTiers === 'string') {
                mathTiers = JSON.parse(mathTiers);
            }
            mathTiers = mathTiers || {};
            mathTiers[operation] = newTier;

            execute(
                "UPDATE users SET math_tiers = ? WHERE id = ?",
                [JSON.stringify(mathTiers), userId]
            );

            console.log(`[AI] Tier advanced for ${userId}: ${operation} ${previousTier} → ${newTier} (accuracy: ${(accuracy * 100).toFixed(0)}%, confidence: ${(confidence * 100).toFixed(0)}%, streak: ${stats.maxStreak})`);
        }
    }

    // End session and persist learner model
    await endSession(state, stats);

    // Clean up
    activeSessions.delete(sessionId);

    return {
        success: true,
        tierProgression: {
            operation,
            previousTier,
            newTier,
            advanced: shouldAdvance,
        }
    };
}


/**
 * Get AI session status (for debugging/admin)
 */
export async function getAISessionStatus(
    sessionId: string
): Promise<{
    exists: boolean;
    questionNumber?: number;
    tiltScore?: number;
    echoQueueSize?: number;
    isInRecovery?: boolean;
}> {
    const state = activeSessions.get(sessionId);

    if (!state) {
        return { exists: false };
    }

    return {
        exists: true,
        questionNumber: state.questionNumber,
        tiltScore: state.coachAgent.tiltScore,
        echoQueueSize: state.echoAgent.echoQueue.length,
        isInRecovery: state.coachAgent.isInRecovery,
    };
}

/**
 * Get problems using AI engine (drop-in replacement for getNextProblems)
 * This provides backward compatibility with the existing practice flow
 */
export async function getAIProblems(
    operation: string,
    count: number = 20
): Promise<{
    problems: ContentItem[];
    currentTier: number;
    sessionId?: string;
} | { error: string }> {
    const session = await auth();

    // For unauthenticated users, fall back to simple generation
    if (!session?.user) {
        const { generateVariantFromProblem } = await import("@/lib/ai-engine/content-variants");
        const op = operation.toLowerCase() as MathOperation;

        const problems: ContentItem[] = [];
        for (let i = 0; i < count; i++) {
            let op1: number, op2: number;
            if (op === 'division') {
                // For division, ensure clean integer answers
                const divisor = Math.floor(Math.random() * 8) + 2;
                const quotient = Math.floor(Math.random() * 8) + 2;
                op1 = divisor * quotient;
                op2 = divisor;
            } else {
                op1 = Math.floor(Math.random() * 9) + 2;
                op2 = Math.floor(Math.random() * 9) + 2;
            }
            problems.push(generateVariantFromProblem(op, op1, op2, 'direct', 1));
        }

        return { problems, currentTier: 1 };
    }

    // For authenticated users, use full AI engine
    const result = await initializeAISession(operation);

    if ('error' in result) {
        return { error: result.error };
    }

    // Generate initial batch of problems
    const { generateVariantFromProblem } = await import("@/lib/ai-engine/content-variants");
    const op = operation.toLowerCase() as MathOperation;
    const tier = result.envelope.directives.placement.targetDifficulty.level;
    const tierNum = Math.min(4, Math.max(1, Math.round(tier * 4)));

    const problems: ContentItem[] = [result.firstQuestion];

    // Generate more problems at the estimated difficulty
    for (let i = 1; i < count; i++) {
        const [minOp, maxOp] = tierNum <= 2 ? [2, 9] : [2, 12];
        let op1: number, op2: number;
        if (op === 'division') {
            // For division, ensure clean integer answers
            const divisor = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            const quotient = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op1 = divisor * quotient;
            op2 = divisor;
        } else {
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        }
        problems.push(generateVariantFromProblem(op, op1, op2, 'direct', tierNum));
    }

    return {
        problems,
        currentTier: tierNum,
        sessionId: result.sessionId,
    };
}
