/**
 * FlashMath AI Engine - Shared State Management
 * 
 * Manages the learner model, telemetry, and echo queue state.
 * Provides initialization, persistence, and update functions.
 */

import {
    LearnerModel,
    SessionTelemetry,
    SkillMastery,
    EchoQueueEntry,
    MasteryGate,
    MathOperation,
    AIEngineConfig,
    DEFAULT_AI_CONFIG,
    ErrorSignature,
} from './types';
import { getDatabase, generateId, now } from '@/lib/db';

// =============================================================================
// LEARNER MODEL MANAGEMENT
// =============================================================================

/**
 * Initialize a learner model from database or create fresh
 */
export function initializeLearnerModel(
    userId: string,
    mathTiers: Record<MathOperation, number>
): LearnerModel {
    const db = getDatabase();

    // Load existing skill mastery from DB
    interface SkillMasteryRow {
        skill_id: string;
        mastery_prob?: number;
        [key: string]: unknown;
    }
    const skillRows = db.prepare(`
    SELECT * FROM skill_mastery WHERE user_id = ?
  `).all(userId) as SkillMasteryRow[];

    const skills = new Map<string, SkillMastery>();

    for (const row of skillRows) {
        skills.set(row.skill_id, {
            skillId: row.skill_id,
            masteryProb: row.mastery_prob ?? 0.5,
            uncertainty: row.uncertainty ?? 0.3,
            fluency: {
                accuracy: 0.5,  // Will be computed from recent history
                medianLatencyMs: 3000,
            },
            errorSignatures: row.error_signatures ? JSON.parse(row.error_signatures) : [],
            lastSeenMs: row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0,
        });
    }

    return {
        userId,
        skills,
        global: {
            tiltRisk: 0,
            sessionConfidence: 0.5,
            difficultyLevel: 0.5,
            baseDifficulty: 0.5,
        },
        mathTiers,
    };
}

/**
 * Get or create skill mastery for a specific skill
 */
export function getSkillMastery(
    model: LearnerModel,
    skillId: string
): SkillMastery {
    if (model.skills.has(skillId)) {
        return model.skills.get(skillId)!;
    }

    // Create new skill with default priors
    const newSkill: SkillMastery = {
        skillId,
        masteryProb: 0.5,
        uncertainty: 0.3,
        fluency: {
            accuracy: 0.5,
            medianLatencyMs: 3000,
        },
        errorSignatures: [],
        lastSeenMs: 0,
    };

    model.skills.set(skillId, newSkill);
    return newSkill;
}

/**
 * Update skill mastery probability using Bayesian update
 */
export function updateSkillMastery(
    model: LearnerModel,
    skillId: string,
    isCorrect: boolean,
    latencyMs: number,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): void {
    const skill = getSkillMastery(model, skillId);

    // Bayesian Knowledge Tracing simplified update
    // P(L_n | obs) = P(obs | L_n) * P(L_n) / P(obs)

    const pLearn = 0.1;    // Probability of learning on each opportunity
    const pForget = 0.05;  // Probability of forgetting
    const pGuess = 0.25;   // Probability of guessing correctly when not mastered
    const pSlip = 0.1;     // Probability of slipping when mastered

    const pMastered = skill.masteryProb;

    if (isCorrect) {
        // Correct answer: increase mastery probability
        const pCorrectGivenMastered = 1 - pSlip;
        const pCorrectGivenNotMastered = pGuess;
        const pCorrect = pMastered * pCorrectGivenMastered + (1 - pMastered) * pCorrectGivenNotMastered;

        skill.masteryProb = (pMastered * pCorrectGivenMastered) / pCorrect;

        // Fast responses boost mastery more
        if (latencyMs < 2000) {
            skill.masteryProb = Math.min(1, skill.masteryProb + 0.05);
        }

        // Reduce uncertainty on success
        skill.uncertainty = Math.max(0.05, skill.uncertainty * 0.9);
    } else {
        // Incorrect answer: decrease mastery probability
        const pIncorrectGivenMastered = pSlip;
        const pIncorrectGivenNotMastered = 1 - pGuess;
        const pIncorrect = pMastered * pIncorrectGivenMastered + (1 - pMastered) * pIncorrectGivenNotMastered;

        skill.masteryProb = (pMastered * pIncorrectGivenMastered) / pIncorrect;

        // Increase uncertainty on failure
        skill.uncertainty = Math.min(0.5, skill.uncertainty * 1.1);
    }

    // Apply learning/forgetting transition
    skill.masteryProb = skill.masteryProb * (1 - pForget) + (1 - skill.masteryProb) * pLearn;

    // Clamp to valid range
    skill.masteryProb = Math.max(0.01, Math.min(0.99, skill.masteryProb));

    // Update timestamp
    skill.lastSeenMs = Date.now();
}

/**
 * Add error signature to skill
 */
export function addErrorSignature(
    model: LearnerModel,
    skillId: string,
    signature: ErrorSignature
): void {
    const skill = getSkillMastery(model, skillId);

    if (!skill.errorSignatures.includes(signature)) {
        skill.errorSignatures.push(signature);

        // Keep only most recent 5 error signatures
        if (skill.errorSignatures.length > 5) {
            skill.errorSignatures.shift();
        }
    }
}

/**
 * Persist learner model to database
 */
export function persistLearnerModel(model: LearnerModel): void {
    const db = getDatabase();

    const upsertStmt = db.prepare(`
    INSERT INTO skill_mastery (id, user_id, skill_id, mastery_prob, uncertainty, last_seen_at, error_signatures)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, skill_id) DO UPDATE SET
      mastery_prob = excluded.mastery_prob,
      uncertainty = excluded.uncertainty,
      last_seen_at = excluded.last_seen_at,
      error_signatures = excluded.error_signatures
  `);

    const transaction = db.transaction(() => {
        for (const [skillId, skill] of model.skills) {
            upsertStmt.run(
                generateId(),
                model.userId,
                skillId,
                skill.masteryProb,
                skill.uncertainty,
                skill.lastSeenMs ? new Date(skill.lastSeenMs).toISOString() : null,
                JSON.stringify(skill.errorSignatures)
            );
        }
    });

    transaction();
}

// =============================================================================
// SESSION TELEMETRY
// =============================================================================

/**
 * Create a new session telemetry tracker
 */
export function createSessionTelemetry(
    sessionId: string,
    userId: string,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): SessionTelemetry {
    return {
        sessionId,
        userId,
        startedAt: Date.now(),
        recentLatencyMs: [],
        recentCorrectness: [],
        errorBurstScore: 0,
        consecutiveMisses: 0,
        consecutiveCorrect: 0,
        hintRequestsRecent: 0,
        baselineLatencyMs: 3000,  // Default, will be calibrated
        questionsSinceStart: 0,
    };
}

/**
 * Update telemetry with a new answer
 */
export function updateTelemetry(
    telemetry: SessionTelemetry,
    isCorrect: boolean,
    latencyMs: number,
    helpUsed: boolean,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): void {
    // Update latency window
    telemetry.recentLatencyMs.push(latencyMs);
    if (telemetry.recentLatencyMs.length > config.telemetry.latencyWindowSize) {
        telemetry.recentLatencyMs.shift();
    }

    // Update correctness window
    telemetry.recentCorrectness.push(isCorrect);
    if (telemetry.recentCorrectness.length > config.telemetry.correctnessWindowSize) {
        telemetry.recentCorrectness.shift();
    }

    // Update streaks
    if (isCorrect) {
        telemetry.consecutiveCorrect++;
        telemetry.consecutiveMisses = 0;
    } else {
        telemetry.consecutiveMisses++;
        telemetry.consecutiveCorrect = 0;
    }

    // Update error burst score (density of errors in recent window)
    const errorCount = telemetry.recentCorrectness.filter(c => !c).length;
    telemetry.errorBurstScore = errorCount / telemetry.recentCorrectness.length;

    // Track hint usage
    if (helpUsed) {
        telemetry.hintRequestsRecent++;
    }

    // Calibrate baseline latency from first few questions
    if (telemetry.questionsSinceStart < 5 && isCorrect) {
        const correctLatencies = telemetry.recentLatencyMs.slice(0, 5);
        if (correctLatencies.length > 0) {
            telemetry.baselineLatencyMs = correctLatencies.reduce((a, b) => a + b, 0) / correctLatencies.length;
        }
    }

    telemetry.questionsSinceStart++;
}

/**
 * Calculate current latency trend ratio
 */
export function getLatencyTrendRatio(telemetry: SessionTelemetry): number {
    if (telemetry.recentLatencyMs.length < 3) {
        return 1.0;  // Not enough data
    }

    const recent = telemetry.recentLatencyMs.slice(-3);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;

    return avgRecent / telemetry.baselineLatencyMs;
}

// =============================================================================
// ECHO QUEUE MANAGEMENT
// =============================================================================

/**
 * Load echo queue from database
 */
export function loadEchoQueue(userId: string): EchoQueueEntry[] {
    const db = getDatabase();

    interface EchoQueueRow {
        id: string;
        skill_id: string;
        concept_id?: string;
        priority?: number;
        due_after_n?: number;
        [key: string]: unknown;
    }
    const rows = db.prepare(`
    SELECT * FROM echo_queue 
    WHERE user_id = ? AND status IN ('scheduled', 'due')
    ORDER BY priority DESC, created_at ASC
  `).all(userId) as EchoQueueRow[];

    return rows.map(row => ({
        id: row.id,
        skillId: row.skill_id,
        conceptId: row.concept_id,
        priority: row.priority,
        insertAfterN: row.due_after_n,
        questionsUntilDue: row.due_after_n,  // Will be updated
        maxAttempts: row.max_attempts,
        attempts: row.attempts,
        usedRepresentations: row.variant_policy ? [row.variant_policy] : ['direct'],
        nextRepresentation: row.variant_policy || 'direct',
        status: row.status,
        createdAt: new Date(row.created_at).getTime(),
        lastAttemptAt: undefined,
    }));
}

/**
 * Add item to echo queue
 */
export function addToEchoQueue(
    userId: string,
    skillId: string,
    conceptId: string,
    insertAfterN: number,
    config: AIEngineConfig = DEFAULT_AI_CONFIG
): EchoQueueEntry {
    const db = getDatabase();
    const id = generateId();

    db.prepare(`
    INSERT INTO echo_queue (id, user_id, skill_id, concept_id, priority, due_after_n, max_attempts, attempts, variant_policy, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        id,
        userId,
        skillId,
        conceptId,
        1,  // Default priority
        insertAfterN,
        config.echo.maxAttempts,
        0,
        'direct',
        'scheduled',
        now()
    );

    return {
        id,
        skillId,
        conceptId,
        priority: 1,
        insertAfterN,
        questionsUntilDue: insertAfterN,
        maxAttempts: config.echo.maxAttempts,
        attempts: 0,
        usedRepresentations: ['direct'],
        nextRepresentation: 'direct',
        status: 'scheduled',
        createdAt: Date.now(),
    };
}

/**
 * Update echo queue entry
 */
export function updateEchoQueueEntry(entry: EchoQueueEntry): void {
    const db = getDatabase();

    db.prepare(`
    UPDATE echo_queue 
    SET priority = ?, due_after_n = ?, attempts = ?, variant_policy = ?, status = ?
    WHERE id = ?
  `).run(
        entry.priority,
        entry.questionsUntilDue,
        entry.attempts,
        entry.nextRepresentation,
        entry.status,
        entry.id
    );
}

/**
 * Tick echo queue - decrement countdown for all scheduled items
 */
export function tickEchoQueue(queue: EchoQueueEntry[]): EchoQueueEntry[] {
    return queue.map(entry => {
        if (entry.status === 'scheduled') {
            const newCountdown = entry.questionsUntilDue - 1;
            return {
                ...entry,
                questionsUntilDue: newCountdown,
                status: newCountdown <= 0 ? 'due' : 'scheduled',
            };
        }
        return entry;
    });
}

/**
 * Remove resolved item from echo queue
 */
export function resolveEchoQueueEntry(entryId: string): void {
    const db = getDatabase();

    db.prepare(`
    UPDATE echo_queue SET status = 'resolved' WHERE id = ?
  `).run(entryId);
}

/**
 * Mark entry as failed after max attempts
 */
export function failEchoQueueEntry(entryId: string): void {
    const db = getDatabase();

    db.prepare(`
    UPDATE echo_queue SET status = 'failed' WHERE id = ?
  `).run(entryId);
}

// =============================================================================
// MASTERY GATES
// =============================================================================

/**
 * Create a mastery gate that blocks progression
 */
export function createMasteryGate(
    userId: string,
    skillId: string,
    conceptId: string,
    requiredSuccesses: number = 2,
    withinWindow: number = 12
): MasteryGate {
    return {
        gateId: generateId(),
        skillId,
        conceptId,
        requiredSuccesses,
        currentSuccesses: 0,
        withinWindow,
        status: 'open',
        createdAt: Date.now(),
    };
}

/**
 * Update mastery gate progress
 */
export function updateMasteryGate(
    gate: MasteryGate,
    isCorrect: boolean,
    questionDelta: number
): MasteryGate {
    const updated = { ...gate };

    if (isCorrect) {
        updated.currentSuccesses++;

        if (updated.currentSuccesses >= updated.requiredSuccesses) {
            updated.status = 'closed';
        }
    } else {
        // Reset on incorrect
        updated.currentSuccesses = 0;
    }

    // Reduce window
    updated.withinWindow -= questionDelta;

    // Check if window expired without meeting requirement
    if (updated.withinWindow <= 0 && updated.status === 'open') {
        // Gate remains open, will need to re-encounter
        updated.withinWindow = 12;  // Reset window
        updated.currentSuccesses = 0;
    }

    return updated;
}

// =============================================================================
// DIFFICULTY CALCULATION
// =============================================================================

/**
 * Calculate effective difficulty based on base + coach modifiers
 */
export function calculateEffectiveDifficulty(
    baseDifficulty: number,
    tiltRecovery: { enabled: boolean; difficultyDeltaPct: number }
): number {
    if (tiltRecovery.enabled) {
        return Math.max(0.1, Math.min(1.0, baseDifficulty * (1 + tiltRecovery.difficultyDeltaPct)));
    }
    return baseDifficulty;
}

// Import tier-to-difficulty mapping from the new 100-tier system
// Re-export for backward compatibility with existing imports
export {
    tierToDifficulty,
    difficultyToTier,
} from '@/lib/tier-system';
