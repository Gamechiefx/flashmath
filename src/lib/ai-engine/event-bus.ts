/**
 * FlashMath AI Engine - Event Bus
 * 
 * Simple event system for coordinating agent communication.
 * Allows agents to subscribe to events and emit responses.
 */

import {
    AIEvent,
    AnswerSubmittedEvent,
    StreamTickEvent,
    SessionStartEvent,
    SessionEndEvent,
    ContentItem,
    MathOperation,
} from './types';

// =============================================================================
// EVENT BUS
// =============================================================================

type EventHandler<T extends AIEvent = AIEvent> = (event: T) => void | Promise<void>;

interface EventSubscription {
    id: string;
    eventType: AIEvent['type'];
    handler: EventHandler;
}

class AIEventBus {
    private subscriptions: EventSubscription[] = [];
    private eventHistory: AIEvent[] = [];
    private maxHistorySize = 100;

    /**
     * Subscribe to a specific event type
     */
    subscribe<T extends AIEvent>(
        eventType: T['type'],
        handler: EventHandler<T>
    ): string {
        const id = crypto.randomUUID();
        this.subscriptions.push({
            id,
            eventType,
            handler: handler as EventHandler,
        });
        return id;
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(subscriptionId: string): void {
        this.subscriptions = this.subscriptions.filter(s => s.id !== subscriptionId);
    }

    /**
     * Emit an event to all subscribers
     */
    async emit(event: AIEvent): Promise<void> {
        // Store in history
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }

        // Notify subscribers
        const handlers = this.subscriptions
            .filter(s => s.eventType === event.type)
            .map(s => s.handler);

        await Promise.all(handlers.map(h => h(event)));
    }

    /**
     * Get recent events of a specific type
     */
    getRecentEvents<T extends AIEvent>(
        eventType: T['type'],
        limit: number = 10
    ): T[] {
        return this.eventHistory
            .filter((e): e is T => e.type === eventType)
            .slice(-limit);
    }

    /**
     * Clear all subscriptions (for cleanup)
     */
    clearSubscriptions(): void {
        this.subscriptions = [];
    }

    /**
     * Clear event history
     */
    clearHistory(): void {
        this.eventHistory = [];
    }
}

// Global event bus instance
export const eventBus = new AIEventBus();

// =============================================================================
// EVENT FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an answer submitted event
 */
export function createAnswerEvent(
    sessionId: string,
    userId: string,
    item: ContentItem,
    userAnswer: string | number,
    isCorrect: boolean,
    latencyMs: number,
    helpUsed: boolean
): AnswerSubmittedEvent {
    return {
        type: 'answer_submitted',
        timestampMs: Date.now(),
        sessionId,
        userId,
        item,
        userAnswer,
        correctAnswer: item.correctAnswer,
        isCorrect,
        latencyMs,
        helpUsed,
    };
}

/**
 * Create a stream tick event (before selecting next question)
 */
export function createStreamTickEvent(
    sessionId: string,
    userId: string,
    questionNumber: number
): StreamTickEvent {
    return {
        type: 'stream_tick',
        timestampMs: Date.now(),
        sessionId,
        userId,
        questionNumber,
    };
}

/**
 * Create a session start event
 */
export function createSessionStartEvent(
    sessionId: string,
    userId: string,
    operation: MathOperation
): SessionStartEvent {
    return {
        type: 'session_start',
        timestampMs: Date.now(),
        sessionId,
        userId,
        operation,
    };
}

/**
 * Create a session end event
 */
export function createSessionEndEvent(
    sessionId: string,
    userId: string,
    stats: {
        totalQuestions: number;
        correctCount: number;
        avgLatencyMs: number;
        maxStreak: number;
        xpEarned: number;
    }
): SessionEndEvent {
    return {
        type: 'session_end',
        timestampMs: Date.now(),
        sessionId,
        userId,
        stats,
    };
}

// =============================================================================
// HELPER: Wait for event
// =============================================================================

/**
 * Wait for a specific event type (useful for testing)
 */
export function waitForEvent<T extends AIEvent>(
    eventType: T['type'],
    timeoutMs: number = 5000
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            eventBus.unsubscribe(subId);
            reject(new Error(`Timeout waiting for event: ${eventType}`));
        }, timeoutMs);

        const subId = eventBus.subscribe(eventType, (event) => {
            clearTimeout(timeout);
            eventBus.unsubscribe(subId);
            resolve(event as T);
        });
    });
}
