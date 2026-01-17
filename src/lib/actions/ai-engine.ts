"use server";

/**
 * FlashMath AI Engine - Server Actions
 * 
 * Server-side actions for the adaptive AI learning system.
 * These actions coordinate with the orchestrator to provide
 * AI-driven practice sessions.
 */

import { auth } from "@/auth";
import { queryOne, type UserRow } from "@/lib/db";
import { revalidatePath } from "next/cache";
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
import {
    MAX_TIER,
    getBandForTier,
    checkMilestoneReward,
    getTierOperandRange,
} from "@/lib/tier-system";

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

    const userId = (session.user as { id: string }).id;

    // Get user's current math tiers
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    if (!user) {
        return { error: "User not found" };
    }

    // Parse mathTiers from JSON if needed
    type MathTiersType = { addition: number; subtraction: number; multiplication: number; division: number };
    let parsedMathTiers: MathTiersType;
    const rawMathTiers = user.math_tiers;
    if (typeof rawMathTiers === 'string') {
        try {
            parsedMathTiers = JSON.parse(rawMathTiers) as MathTiersType;
        } catch {
            parsedMathTiers = { addition: 1, subtraction: 1, multiplication: 1, division: 1 };
        }
    } else {
        parsedMathTiers = { addition: 1, subtraction: 1, multiplication: 1, division: 1 };
    }
    // Ensure all fields exist
    if (!parsedMathTiers.addition) parsedMathTiers.addition = 1;
    if (!parsedMathTiers.subtraction) parsedMathTiers.subtraction = 1;
    if (!parsedMathTiers.multiplication) parsedMathTiers.multiplication = 1;
    if (!parsedMathTiers.division) parsedMathTiers.division = 1;

    const opKey = operation.toLowerCase() as keyof MathTiersType;
    console.log(`[AI] Starting session for ${userId}, operation: ${operation}, tier: ${parsedMathTiers[opKey] || 1}`);

    // Initialize orchestrator
    const state = initializeOrchestrator(
        userId,
        operation.toLowerCase() as MathOperation,
        parsedMathTiers,
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
 *
 * 100-Tier System Advancement:
 * - 85%+ accuracy, 80%+ confidence → +1 tier
 * - 90%+ accuracy, 85%+ confidence, 8+ streak → +2 tiers
 * - 95%+ accuracy, 90%+ confidence, 10+ streak → +3 tiers
 * - Band boundaries block advancement (require mastery test)
 * - Milestone rewards at 5/10/20 tier intervals
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
        tiersGained: number;
        bandName: string;
        blockedByBandBoundary?: boolean;
        milestone?: {
            type: string;
            coins: number;
            xp: number;
        };
    };
} | { error: string }> {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as { id: string }).id;
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

    // Log all conditions for debugging
    console.log(`[AI] Tier advancement check for ${operation}:`, {
        confidence: (confidence * 100).toFixed(1) + '%',
        accuracy: (accuracy * 100).toFixed(1) + '%',
        estimatedTier,
        previousTier,
        totalQuestions: stats.totalQuestions,
        tiltScore: tiltScore.toFixed(2),
        maxStreak: stats.maxStreak,
    });

    // Determine tier advancement (100-tier system)
    // Limited to +1 tier per session for gradual progression
    let tierAdvance = 0;
    let newTier = previousTier;

    // Requirements: 10+ questions, 85%+ accuracy, low frustration
    if (stats.totalQuestions >= 10 && accuracy >= 0.85 && tiltScore < 0.5) {
        tierAdvance = 1;
    }

    console.log(`[AI] Calculated tier advance: ${tierAdvance} (max streak: ${stats.maxStreak})`);

    // Check if band boundary blocks advancement
    let blockedByBandBoundary = false;
    let milestone = null;

    if (tierAdvance > 0) {
        const currentBand = getBandForTier(previousTier);
        const proposedTier = Math.min(MAX_TIER, previousTier + tierAdvance);
        const proposedBand = getBandForTier(proposedTier);

        // Check if crossing band boundary
        if (proposedBand.id > currentBand.id) {
            // Cap at current band's end tier
            newTier = Math.min(currentBand.tierRange[1], proposedTier);
            if (newTier === currentBand.tierRange[1]) {
                blockedByBandBoundary = true;
                console.log(`[AI] Advancement blocked at band boundary (tier ${newTier}). Mastery test required.`);
            }
        } else {
            newTier = proposedTier;
        }

        // Check for milestone rewards
        if (newTier > previousTier) {
            milestone = checkMilestoneReward(previousTier, newTier);
        }
    }

    // Update database if tier changed
    if (newTier > previousTier) {
        const { getDatabase } = await import("@/lib/db/sqlite");
        const db = getDatabase();

        const user = db.prepare("SELECT math_tiers, skill_points, coins, total_xp FROM users WHERE id = ?").get(userId) as { math_tiers?: string | null; skill_points?: string | null; coins?: number; total_xp?: number } | undefined;

        if (user) {
            // Parse mathTiers
            type TiersType = Record<string, number>;
            let parsedTiers: TiersType = {};
            if (typeof user.math_tiers === 'string') {
                try {
                    parsedTiers = JSON.parse(user.math_tiers) as TiersType;
                } catch {
                    parsedTiers = {};
                }
            }
            parsedTiers[operation] = newTier;

            // Prepare updates
            let coinsToAdd = 0;
            let xpToAdd = 0;

            if (milestone) {
                coinsToAdd = milestone.reward?.coins ?? 0;
                xpToAdd = milestone.reward?.xp ?? 0;
            }

            const newCoins = (Number(user.coins) || 0) + coinsToAdd;
            const newXp = (Number(user.total_xp) || 0) + xpToAdd;

            // Reset skill points for this operation (start fresh at new tier)
            let parsedSkillPoints: TiersType = {};
            if (typeof user.skill_points === 'string') {
                try {
                    parsedSkillPoints = JSON.parse(user.skill_points) as TiersType;
                } catch {
                    parsedSkillPoints = {};
                }
            }
            parsedSkillPoints[operation] = 0;  // Reset to 0% progress

            // Use direct database access to avoid pattern-matching issues
            db.prepare(
                "UPDATE users SET math_tiers = ?, skill_points = ?, coins = ?, total_xp = ? WHERE id = ?"
            ).run(JSON.stringify(parsedTiers), JSON.stringify(parsedSkillPoints), newCoins, newXp, userId);

            const band = getBandForTier(newTier);
            console.log(`[AI] Tier advanced for ${userId}: ${operation} ${previousTier} → ${newTier} (${band.name} band)`);
            if (milestone) {
                console.log(`[AI] Milestone reward: ${milestone.type} - ${coinsToAdd} coins, ${xpToAdd} XP`);
            }

            // Revalidate pages to show updated tier
            revalidatePath("/dashboard", "page");
            revalidatePath("/practice", "page");
        }
    }

    // End session and persist learner model
    await endSession(state, stats);

    // Clean up
    activeSessions.delete(sessionId);

    const band = getBandForTier(newTier);

    return {
        success: true,
        tierProgression: {
            operation,
            previousTier,
            newTier,
            advanced: newTier > previousTier,
            tiersGained: newTier - previousTier,
            bandName: band.name,
            blockedByBandBoundary,
            milestone: milestone ? {
                type: milestone.type,
                coins: milestone.reward?.coins ?? 0,
                xp: milestone.reward?.xp ?? 0,
            } : undefined,
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
 *
 * Uses 100-tier system with parametric operand scaling
 */
export async function getAIProblems(
    operation: string,
    count: number = 20
): Promise<{
    problems: ContentItem[];
    currentTier: number;
    bandName?: string;
    sessionId?: string;
} | { error: string }> {
    const session = await auth();

    // For unauthenticated users, fall back to simple generation at tier 1
    if (!session?.user) {
        const { generateVariantFromProblem } = await import("@/lib/ai-engine/content-variants");
        const op = operation.toLowerCase() as MathOperation;
        const [minOp, maxOp] = getTierOperandRange(1, op);

        const problems: ContentItem[] = [];
        for (let i = 0; i < count; i++) {
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
            problems.push(generateVariantFromProblem(op, op1, op2, 'direct', 1));
        }

        return { problems, currentTier: 1, bandName: 'Foundation' };
    }

    // For authenticated users, use full AI engine
    const result = await initializeAISession(operation);

    if ('error' in result) {
        return { error: result.error };
    }

    // Get tier from envelope (normalized difficulty 0-1 → tier 1-100)
    const { generateVariantFromProblem } = await import("@/lib/ai-engine/content-variants");
    const op = operation.toLowerCase() as MathOperation;
    const difficulty = result.envelope.directives.placement.targetDifficulty.level;

    // Convert difficulty (0.05-0.95) to tier (1-100)
    const tierNum = Math.round(1 + (difficulty - 0.05) / 0.9 * 99);
    const clampedTier = Math.max(1, Math.min(MAX_TIER, tierNum));
    const [minOp, maxOp] = getTierOperandRange(clampedTier, op);

    const problems: ContentItem[] = [result.firstQuestion];

    // Generate more problems at the estimated difficulty using tier ranges
    for (let i = 1; i < count; i++) {
        let op1: number, op2: number;
        if (op === 'division') {
            // For division, ensure clean integer answers
            const divisor = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            const quotient = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op1 = divisor * quotient;
            op2 = Math.max(2, divisor);
        } else {
            op1 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
            op2 = Math.floor(Math.random() * (maxOp - minOp + 1)) + minOp;
        }
        problems.push(generateVariantFromProblem(op, op1, op2, 'direct', clampedTier));
    }

    const band = getBandForTier(clampedTier);

    return {
        problems,
        currentTier: clampedTier,
        bandName: band.name,
        sessionId: result.sessionId,
    };
}
