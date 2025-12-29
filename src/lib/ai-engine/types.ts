/**
 * FlashMath Adaptive AI Learning System - Core Types
 * 
 * Model-agnostic type definitions aligned with the JSON behavior spec.
 * These interfaces form the shared data plane for all agents.
 */

// =============================================================================
// SKILL & CONTENT TYPES
// =============================================================================

export type MathOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

export type RepresentationType =
    | 'direct'           // 7 × 8 = ?
    | 'missing_op1'      // ? × 8 = 56
    | 'missing_op2'      // 7 × ? = 56
    | 'word'             // Seven groups of eight equals
    | 'algebraic'        // Solve: 7x = 56
    | 'visual';          // Array description

export type ErrorSignature =
    | 'magnitude_error'      // Off by factor of 10, 100, etc.
    | 'place_value_error'    // Wrong digit position
    | 'off_by_one'           // Close but ±1
    | 'operation_confusion'  // Wrong operation applied
    | 'commutativity_error'  // Reversed operands issue
    | 'near_fact_confusion'  // Confused with nearby multiplication fact
    | 'unknown';

export type HintType =
    | 'magnitude_check'
    | 'place_value_check'
    | 'decomposition'
    | 'near_facts'
    | 'commutativity_reminder'
    | 'step_by_step'
    | 'general';

// =============================================================================
// SKILL MASTERY MODEL (Per-Skill Bayesian State)
// =============================================================================

export interface SkillMastery {
    skillId: string;              // e.g., "mul.7x8", "add.15+23"
    masteryProb: number;          // 0.0 to 1.0, Bayesian probability
    uncertainty: number;          // Confidence in the mastery estimate
    fluency: {
        accuracy: number;           // Recent accuracy rate
        medianLatencyMs: number;    // Median response time
    };
    errorSignatures: ErrorSignature[];  // Common error patterns for this skill
    lastSeenMs: number;           // Timestamp of last encounter
}

// =============================================================================
// LEARNER MODEL (Aggregate State)
// =============================================================================

export interface LearnerModel {
    userId: string;
    skills: Map<string, SkillMastery>;  // skillId -> SkillMastery

    // Global session state
    global: {
        tiltRisk: number;           // 0.0 to 1.0, current frustration estimate
        sessionConfidence: number;  // Overall placement confidence
        difficultyLevel: number;    // Current effective difficulty (0-1)
        baseDifficulty: number;     // Target difficulty before modifiers
    };

    // Per-operation tier (from existing system)
    mathTiers: Record<MathOperation, number>;
}

// =============================================================================
// SESSION TELEMETRY (Real-Time Signals)
// =============================================================================

export interface SessionTelemetry {
    sessionId: string;
    userId: string;
    startedAt: number;            // Timestamp

    // Rolling windows
    recentLatencyMs: number[];    // Last N response times
    recentCorrectness: boolean[]; // Last N correct/incorrect

    // Computed signals
    errorBurstScore: number;      // 0.0 to 1.0, density of recent errors
    consecutiveMisses: number;    // Current error streak
    consecutiveCorrect: number;   // Current correct streak
    hintRequestsRecent: number;   // Help button presses in window

    // Baseline for comparison
    baselineLatencyMs: number;    // Average latency from early session

    // Question counter (for echo scheduling)
    questionsSinceStart: number;
}

// =============================================================================
// CONTENT ITEM (Problem with Metadata)
// =============================================================================

export interface ContentItem {
    itemId: string;               // Unique identifier
    skillId: string;              // e.g., "mul.7x8"
    conceptId: string;            // Broader concept grouping

    // Problem content
    promptText: string;           // "7 × 8 = ?"
    correctAnswer: string | number;
    answerFormat: 'numeric' | 'text';

    // Metadata
    operation: MathOperation;
    representation: RepresentationType;
    difficulty: number;           // 0.0 to 1.0
    tier: number;                 // 1-4 from existing system

    // For explanations
    explanation?: string;
    operand1?: number;
    operand2?: number;
}

// =============================================================================
// ECHO QUEUE (Remediation Scheduling)
// =============================================================================

export type EchoStatus = 'scheduled' | 'due' | 'resolved' | 'failed';

export interface EchoQueueEntry {
    id: string;
    skillId: string;
    conceptId: string;

    // Scheduling
    priority: number;             // Higher = more urgent
    insertAfterN: number;         // Insert after N more questions
    questionsUntilDue: number;    // Countdown

    // Attempt tracking
    maxAttempts: number;
    attempts: number;

    // Variation control
    usedRepresentations: RepresentationType[];
    nextRepresentation: RepresentationType;

    status: EchoStatus;
    createdAt: number;
    lastAttemptAt?: number;
}

// =============================================================================
// MASTERY GATE (Blocks progression until resolved)
// =============================================================================

export interface MasteryGate {
    gateId: string;
    conceptId: string;
    skillId: string;

    requiredSuccesses: number;    // How many correct needed
    currentSuccesses: number;     // Current progress
    withinWindow: number;         // Must achieve within N questions

    status: 'open' | 'closed';
    createdAt: number;
}

// =============================================================================
// AGENT DIRECTIVES (Output from each agent)
// =============================================================================

export interface PlacementDirective {
    targetSkillBand: string[];    // Skills to focus on
    targetDifficulty: {
        level: number;
        min: number;
        max: number;
    };
    skipIfMasteryAbove: number;   // Skip skills with high mastery
    updatePriors: boolean;
    confidenceScore: number;      // How confident in placement
}

export interface CoachDirective {
    tiltDetected: boolean;
    tiltScore: number;

    recoveryMode: {
        enabled: boolean;
        difficultyDeltaPct: number; // e.g., -0.15 for 15% reduction
        ttlQuestions: number;       // How long to stay in recovery
        questionsRemaining: number;
    };

    hintPolicy: {
        onWrongAnswer: 'none' | 'brief' | 'socratic';
        onHelpRequest: 'brief' | 'socratic' | 'detailed';
        maxHintTokens: number;
        noFullSolution: boolean;
    };
}

export interface EchoDirective {
    onWrongAnswer: {
        scheduleEcho: boolean;
        dueInQuestionsRange: [number, number];  // [min, max]
        escalateVariationOnRepeatMiss: boolean;
    };

    variationRules: {
        avoidSameSurfaceFormRepeats: boolean;
        allowedForms: RepresentationType[];
    };

    masteryGateRules: {
        blockAdvancementOnUnresolved: boolean;
        maxConcurrentOpenGates: number;
    };

    // Pending insertions
    scheduledInsertions: EchoQueueEntry[];
    dueItems: EchoQueueEntry[];
}

// =============================================================================
// QUESTION CANDIDATE (For stream selection)
// =============================================================================

export type SelectionReason =
    | 'ECHO_DUE'
    | 'TILT_RECOVERY'
    | 'PLACEMENT_RAMP'
    | 'MAINTENANCE'
    | 'CHAMELEON_VARIATION'
    | 'INFO_GAIN';

export interface QuestionCandidate {
    candidateId: string;
    item: ContentItem;

    // Scoring
    priority: number;
    score: number;

    // Constraints
    mustServe: boolean;           // Cannot be skipped
    cooldownQuestions: number;    // Minimum questions before repeat

    // Selection metadata
    reasonCodes: SelectionReason[];
}

// =============================================================================
// AI DIRECTIVE ENVELOPE (Complete orchestrator output)
// =============================================================================

export interface AIDirectiveEnvelope {
    specVersion: string;          // "1.0"
    timestampMs: number;

    session: {
        sessionId: string;
        userId: string;
        mode: 'solo' | 'duel' | 'tournament';
    };

    // Updated state
    learnerModel: LearnerModel;
    telemetry: SessionTelemetry;
    echoQueue: EchoQueueEntry[];

    // Agent directives
    directives: {
        placement: PlacementDirective;
        coach: CoachDirective;
        echo: EchoDirective;
    };

    // Selected question
    selection: {
        chosenCandidateId: string;
        item: ContentItem;
        reasonCodes: SelectionReason[];
        hint?: HintPayload;
    };

    // Debugging
    audit: {
        agentVersions: {
            placementAgent: string;
            coachAgent: string;
            echoAgent: string;
            orchestrator: string;
        };
        traceId: string;
    };
}

// =============================================================================
// HINT SYSTEM
// =============================================================================

export interface HintPayload {
    hintText: string;
    hintType: HintType;
    confidence: number;
    isLLMGenerated: boolean;
    microSteps?: string[];        // Optional step-by-step breakdown
}

export interface HintRequest {
    question: ContentItem;
    userAnswer: string | number;
    correctAnswer: string | number;
    errorContext: {
        responseTimeMs: number;
        attemptNumber: number;
        previousHints: string[];
    };
    policy: {
        style: 'brief' | 'socratic' | 'detailed';
        maxTokens: number;
        noFullSolution: boolean;
    };
}

// =============================================================================
// EVENT TYPES (For event bus)
// =============================================================================

export interface AnswerSubmittedEvent {
    type: 'answer_submitted';
    timestampMs: number;
    sessionId: string;
    userId: string;

    item: ContentItem;
    userAnswer: string | number;
    correctAnswer: string | number;
    isCorrect: boolean;
    latencyMs: number;
    helpUsed: boolean;
}

export interface StreamTickEvent {
    type: 'stream_tick';
    timestampMs: number;
    sessionId: string;
    userId: string;
    questionNumber: number;
}

export interface SessionStartEvent {
    type: 'session_start';
    timestampMs: number;
    sessionId: string;
    userId: string;
    operation: MathOperation;
}

export interface SessionEndEvent {
    type: 'session_end';
    timestampMs: number;
    sessionId: string;
    userId: string;
    stats: {
        totalQuestions: number;
        correctCount: number;
        avgLatencyMs: number;
        maxStreak: number;
        xpEarned: number;
    };
}

export type AIEvent =
    | AnswerSubmittedEvent
    | StreamTickEvent
    | SessionStartEvent
    | SessionEndEvent;

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface AIEngineConfig {
    // Tilt detection thresholds
    tilt: {
        consecutiveMissesThreshold: number;      // Default: 3
        errorBurstThreshold: number;             // Default: 0.70
        latencyIncreaseRatio: number;            // Default: 1.40
        weights: {
            consecutiveMisses: number;             // Default: 0.45
            errorBurstScore: number;               // Default: 0.35
            latencyTrend: number;                  // Default: 0.20
        };
        recoveryDifficultyDelta: number;         // Default: -0.15
        recoveryDurationQuestions: number;       // Default: 5
        rampBackPercentPerQuestion: number;      // Default: 0.03
    };

    // Echo loop settings
    echo: {
        insertAfterNQuestions: [number, number]; // Default: [2, 5]
        maxAttempts: number;                     // Default: 3
        masteryDeltaOnMiss: number;              // Default: -0.12
        masteryDeltaOnEchoCorrect: number;       // Default: +0.10
        masteryDeltaOnRepeatMiss: number;        // Default: -0.08
        releaseRequiredConsecutive: number;      // Default: 2
        releaseWithinWindow: number;             // Default: 12
    };

    // Placement settings
    placement: {
        maxQuestions: number;                    // Default: 20
        minConfidence: number;                   // Default: 0.85
        targetUncertaintyBand: [number, number]; // Default: [0.35, 0.65]
        skipIfMasteryAbove: number;              // Default: 0.90
    };

    // Hint settings
    hints: {
        useLLM: boolean;                         // Default: true
        llmProvider: 'openai' | 'anthropic' | 'local';
        llmModel: string;
        maxTokens: number;                       // Default: 80
        fallbackToRules: boolean;                // Default: true
    };

    // Telemetry windows
    telemetry: {
        latencyWindowSize: number;               // Default: 10
        correctnessWindowSize: number;           // Default: 10
    };
}

// Default configuration
export const DEFAULT_AI_CONFIG: AIEngineConfig = {
    tilt: {
        consecutiveMissesThreshold: 3,
        errorBurstThreshold: 0.70,
        latencyIncreaseRatio: 1.40,
        weights: {
            consecutiveMisses: 0.45,
            errorBurstScore: 0.35,
            latencyTrend: 0.20,
        },
        recoveryDifficultyDelta: -0.15,
        recoveryDurationQuestions: 5,
        rampBackPercentPerQuestion: 0.03,
    },
    echo: {
        insertAfterNQuestions: [2, 5],
        maxAttempts: 3,
        masteryDeltaOnMiss: -0.12,
        masteryDeltaOnEchoCorrect: 0.10,
        masteryDeltaOnRepeatMiss: -0.08,
        releaseRequiredConsecutive: 2,
        releaseWithinWindow: 12,
    },
    placement: {
        maxQuestions: 20,
        minConfidence: 0.85,
        targetUncertaintyBand: [0.35, 0.65],
        skipIfMasteryAbove: 0.90,
    },
    hints: {
        useLLM: true,
        llmProvider: 'anthropic',
        llmModel: 'claude-3-haiku-20240307',
        maxTokens: 110,
        fallbackToRules: true,
    },
    telemetry: {
        latencyWindowSize: 10,
        correctnessWindowSize: 10,
    },
};
