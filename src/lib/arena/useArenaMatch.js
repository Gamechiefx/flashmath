/**
 * FlashMath Arena - React Hook for Match Management
 * 
 * Custom hook that manages the client-side Arena match lifecycle:
 * - Socket.IO connection to /arena namespace
 * - Match lifecycle events (start, questions, end)
 * - Optimistic UI updates for immediate feedback
 * - Local state synchronization with server authority
 * 
 * @module useArenaMatch
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { EVENTS, GAME } from './constants.js';

// =============================================================================
// TYPES (for documentation, actual types would be TypeScript)
// =============================================================================

/**
 * @typedef {Object} Player
 * @property {string} id - Player ID
 * @property {string} name - Display name
 * @property {number} score - Current score
 * @property {number} lives - Remaining lives
 * @property {boolean} answered - Has answered current question
 */

/**
 * @typedef {Object} Question
 * @property {string} questionId - Unique question ID
 * @property {string} question - Question text
 * @property {number} questionNumber - Current question number
 * @property {number} totalQuestions - Total questions in match
 * @property {number} maxTime - Max time in ms
 */

/**
 * @typedef {Object} MatchState
 * @property {'idle'|'queuing'|'found'|'countdown'|'active'|'finished'} status
 * @property {string|null} matchId
 * @property {Player[]} players
 * @property {Question|null} currentQuestion
 * @property {number} countdown - Countdown seconds remaining
 * @property {Object|null} result - Final match result
 */

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Custom hook for managing Arena match state
 * 
 * @param {Object} options
 * @param {Object} options.user - Current user object with id, name, practiceXP, elo
 * @param {string} options.serverUrl - Socket.IO server URL (defaults to current origin)
 * @param {Function} options.onMatchStart - Callback when match starts
 * @param {Function} options.onQuestionStart - Callback when new question arrives
 * @param {Function} options.onMatchEnd - Callback when match ends
 * @param {Function} options.onError - Error handler callback
 * @returns {Object} Match state and control functions
 */
export function useArenaMatch(options = {}) {
    const {
        user,
        serverUrl = typeof window !== 'undefined' ? window.location.origin : '',
        onMatchStart,
        onQuestionStart,
        onMatchEnd,
        onError
    } = options;

    // =================================================================
    // STATE
    // =================================================================

    const [status, setStatus] = useState('idle');
    const [matchId, setMatchId] = useState(null);
    const [players, setPlayers] = useState([]);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const [queuePosition, setQueuePosition] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Optimistic UI state
    const [optimisticAnswer, setOptimisticAnswer] = useState(null);
    const [showHitAnimation, setShowHitAnimation] = useState(false);
    const [answerFeedback, setAnswerFeedback] = useState(null);

    // Refs
    const socketRef = useRef(null);
    const questionStartTimeRef = useRef(null);

    // =================================================================
    // SOCKET CONNECTION
    // =================================================================

    useEffect(() => {
        // Only connect if we have a user
        if (!user?.id) return;

        // Create socket connection to arena namespace
        const socket = io(`${serverUrl}/arena`, {
            auth: {
                userId: user.id,
                userName: user.name
            },
            transports: ['websocket', 'polling']
        });

        socketRef.current = socket;

        // -----------------------------------------------------------------
        // CONNECTION EVENTS
        // -----------------------------------------------------------------

        socket.on('connect', () => {
            console.log('[Arena] Connected to server');
            setError(null);
        });

        socket.on('connect_error', (err) => {
            console.error('[Arena] Connection error:', err);
            setError('Failed to connect to Arena server');
            onError?.({ type: 'connection', message: err.message });
        });

        socket.on('disconnect', (reason) => {
            console.log('[Arena] Disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server disconnected us, need to reconnect
                socket.connect();
            }
        });

        // -----------------------------------------------------------------
        // QUEUE EVENTS
        // -----------------------------------------------------------------

        socket.on(EVENTS.QUEUE_UPDATE, (data) => {
            setQueuePosition(data.position);
            if (data.error) {
                setError(data.error);
                setStatus('idle');
            }
        });

        socket.on(EVENTS.MATCH_FOUND, (data) => {
            console.log('[Arena] Match found!', data);
            setStatus('found');
            setMatchId(data.matchId);
            setPlayers(data.players);
        });

        // -----------------------------------------------------------------
        // MATCH LIFECYCLE EVENTS
        // -----------------------------------------------------------------

        socket.on(EVENTS.MATCH_START, (data) => {
            console.log('[Arena] Match starting!', data);
            setStatus('countdown');
            setMatchId(data.matchId);
            setPlayers(data.players);
            setResult(null);
            onMatchStart?.(data);
        });

        socket.on('countdown:tick', (data) => {
            setCountdown(data.seconds);
            if (data.seconds === 0) {
                setStatus('active');
            }
        });

        // -----------------------------------------------------------------
        // QUESTION EVENTS
        // -----------------------------------------------------------------

        socket.on(EVENTS.QUESTION_START, (data) => {
            console.log('[Arena] New question:', data.question);
            setCurrentQuestion({
                questionId: data.questionId,
                question: data.question,
                questionNumber: data.questionNumber,
                totalQuestions: data.totalQuestions,
                maxTime: data.maxTime,
                type: data.type
            });
            questionStartTimeRef.current = Date.now();

            // Reset answer state for new question
            setOptimisticAnswer(null);
            setShowHitAnimation(false);
            setAnswerFeedback(null);

            onQuestionStart?.(data);
        });

        socket.on(EVENTS.QUESTION_NEXT, (data) => {
            // Alias for question:start for compatibility
            socket.emit(EVENTS.QUESTION_START, data);
        });

        socket.on('question:timeout', (data) => {
            setAnswerFeedback({
                type: 'timeout',
                correctAnswer: data.correctAnswer,
                explanation: data.explanation
            });
        });

        // -----------------------------------------------------------------
        // MATCH UPDATE EVENTS
        // -----------------------------------------------------------------

        socket.on(EVENTS.MATCH_UPDATE, (data) => {
            console.log('[Arena] Match update:', data);
            setPlayers(data.players);

            // If this update is about our answer, show feedback
            if (data.lastAction && data.lastAction.playerId === user.id) {
                setAnswerFeedback({
                    type: data.lastAction.correct ? 'correct' : 'wrong',
                    points: data.lastAction.points
                });
            }
        });

        // -----------------------------------------------------------------
        // GAME OVER EVENT
        // -----------------------------------------------------------------

        socket.on(EVENTS.GAME_OVER, (data) => {
            console.log('[Arena] Game over!', data);
            setStatus('finished');
            setResult({
                winner: data.winner,
                loser: data.loser,
                finalScores: data.finalScores,
                isDraw: data.isDraw,
                isVictory: data.winner.id === user.id
            });
            setCurrentQuestion(null);
            onMatchEnd?.(data);
        });

        // -----------------------------------------------------------------
        // ERROR HANDLING
        // -----------------------------------------------------------------

        socket.on(EVENTS.ERROR, (data) => {
            console.error('[Arena] Error:', data);
            setError(data.message);
            onError?.(data);
        });

        // Cleanup on unmount
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user?.id, serverUrl, onMatchStart, onQuestionStart, onMatchEnd, onError]);

    // =================================================================
    // ACTIONS
    // =================================================================

    /**
     * Join the matchmaking queue
     */
    const joinQueue = useCallback(() => {
        if (!socketRef.current || !user) {
            setError('Not connected or no user');
            return;
        }

        setStatus('queuing');
        setError(null);
        setResult(null);

        socketRef.current.emit(EVENTS.QUEUE_JOIN, {
            id: user.id,
            name: user.name,
            practiceXP: user.practiceXP || user.total_xp || 0,
            elo: user.elo || 1000,
            practiceStats: user.practiceStats || {
                totalSessions: user.sessions_completed || 0,
                accountAgeDays: user.accountAgeDays || 7,
                daysSinceLastPractice: 0
            }
        });
    }, [user]);

    /**
     * Leave the matchmaking queue
     */
    const leaveQueue = useCallback(() => {
        if (!socketRef.current) return;

        socketRef.current.emit(EVENTS.QUEUE_LEAVE);
        setStatus('idle');
        setQueuePosition(null);
    }, []);

    /**
     * Submit an answer to the current question
     * Implements optimistic UI updates
     * 
     * @param {number} answer - The player's answer
     */
    const submitAnswer = useCallback((answer) => {
        if (!socketRef.current || !currentQuestion) {
            return;
        }

        const answerTime = Date.now() - (questionStartTimeRef.current || Date.now());

        // =========================================================
        // OPTIMISTIC UI UPDATE
        // Show immediate feedback before server confirmation
        // This creates a responsive feel even with network latency
        // =========================================================
        setOptimisticAnswer(answer);
        setShowHitAnimation(true);

        // Send to server
        socketRef.current.emit(EVENTS.ANSWER_SUBMIT, {
            answer: answer,
            timestamp: Date.now(),
            answerTime: answerTime,
            questionId: currentQuestion.questionId
        });

        // Hide hit animation after a short duration
        setTimeout(() => {
            setShowHitAnimation(false);
        }, 300);
    }, [currentQuestion]);

    /**
     * Disconnect and reset all state
     */
    const disconnect = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        setStatus('idle');
        setMatchId(null);
        setPlayers([]);
        setCurrentQuestion(null);
        setResult(null);
        setError(null);
        setQueuePosition(null);
    }, []);

    // =================================================================
    // DERIVED STATE
    // =================================================================

    // Find current user in players array
    const me = players.find(p => p.id === user?.id);
    const opponent = players.find(p => p.id !== user?.id);

    // Calculate time remaining for current question
    const [timeRemaining, setTimeRemaining] = useState(null);

    useEffect(() => {
        if (!currentQuestion || status !== 'active') {
            setTimeRemaining(null);
            return;
        }

        const updateTime = () => {
            const elapsed = Date.now() - questionStartTimeRef.current;
            const remaining = Math.max(0, currentQuestion.maxTime - elapsed);
            setTimeRemaining(remaining);
        };

        updateTime();
        const interval = setInterval(updateTime, 100);

        return () => clearInterval(interval);
    }, [currentQuestion, status]);

    // =================================================================
    // RETURN VALUE
    // =================================================================

    return {
        // Connection state
        isConnected: socketRef.current?.connected ?? false,

        // Match state
        status,
        matchId,
        players,
        me,
        opponent,

        // Question state
        currentQuestion,
        timeRemaining,
        countdown,

        // Queue state
        queuePosition,

        // Result state
        result,
        error,

        // Optimistic UI state
        optimisticAnswer,
        showHitAnimation,
        answerFeedback,

        // Actions
        joinQueue,
        leaveQueue,
        submitAnswer,
        disconnect,

        // Utilities
        clearError: () => setError(null)
    };
}

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Hook for arena sound effects
 * Plays appropriate sounds based on match events
 */
export function useArenaSounds(matchState) {
    const { status, answerFeedback, result } = matchState;

    useEffect(() => {
        // These would integrate with your existing sound engine
        // For now, just log the events
        if (answerFeedback?.type === 'correct') {
            // playSound('correct');
            console.log('[Sound] Correct answer!');
        } else if (answerFeedback?.type === 'wrong') {
            // playSound('wrong');
            console.log('[Sound] Wrong answer!');
        }
    }, [answerFeedback]);

    useEffect(() => {
        if (result) {
            if (result.isVictory) {
                // playSound('victory');
                console.log('[Sound] Victory!');
            } else {
                // playSound('defeat');
                console.log('[Sound] Defeat!');
            }
        }
    }, [result]);
}

/**
 * Hook for arena animations
 * Returns animation state for UI components
 */
export function useArenaAnimations(matchState) {
    const { showHitAnimation, answerFeedback, status } = matchState;

    return {
        // Hit flash animation when submitting answer
        hitFlash: showHitAnimation,

        // Shake animation on wrong answer
        shake: answerFeedback?.type === 'wrong',

        // Pulse animation on correct answer
        pulse: answerFeedback?.type === 'correct',

        // Countdown pulse
        countdownPulse: status === 'countdown',

        // Victory/defeat animations
        victoryBurst: status === 'finished' && matchState.result?.isVictory,
        defeatFade: status === 'finished' && !matchState.result?.isVictory
    };
}

export default useArenaMatch;
