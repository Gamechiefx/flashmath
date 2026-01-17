'use client';

/**
 * Arena WebSocket Hook
 * Provides real-time sync for arena matches
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Player {
    odName: string;
    odScore: number;
    odStreak: number;
    odQuestionsAnswered: number;
    odLastAnswerCorrect: boolean | null;
    odCurrentQuestion?: Question;
    odEquippedBanner?: string;
    odEquippedTitle?: string;
    odLevel?: number;
    odTier?: string;
    odRank?: string;
    odDivision?: string;
}

interface Question {
    question: string;
    answer: number;
    operation: string;
}

/**
 * Performance stats for ELO calculations
 */
interface PerformanceStats {
    accuracy: number;       // 0-1 decimal
    avgSpeedMs: number;     // Average answer time in ms
    maxStreak: number;      // Max correct streak
    aps: number;            // Arena Performance Score (0-1000)
}

/**
 * Connection quality states for match integrity
 */
export type ConnectionState = 'GREEN' | 'YELLOW' | 'RED';

interface ConnectionMetrics {
    rtt: number;           // Round-trip time in ms
    jitter: number;        // RTT variance
    loss: number;          // Packet loss percentage
    state: ConnectionState;
    disconnects: number;
}

interface ConnectionStates {
    [playerId: string]: ConnectionMetrics;
}

interface MatchIntegrityInfo {
    matchIntegrity: ConnectionState;
    playerIntegrity: Record<string, { state: ConnectionState; metrics: ConnectionMetrics }>;
}

interface UseArenaSocketOptions {
    matchId: string;
    userId: string;
    userName: string;
    operation: string;
    userRank?: string;
    userDivision?: string;
    userLevel?: number;
    userBanner?: string;
    userTitle?: string;
    onMatchStart?: (data: { question: Question; timeLeft: number; players: Record<string, Player> }) => void;
    onAnswerResult?: (data: { odUserId: string; odIsCorrect: boolean; odPlayers: Record<string, Player> }) => void;
    onNewQuestion?: (data: { question: Question }) => void;
    onTimeUpdate?: (data: { timeLeft: number }) => void;
    onMatchEnd?: (data: { players: Record<string, Player>; performanceStats?: Record<string, PerformanceStats> } & Partial<MatchIntegrityInfo>) => void;
    onPlayerJoined?: (data: { players: Record<string, Player>; playerId: string; playerName: string }) => void;
    onPlayerLeft?: (data: { odUserId: string }) => void;
    onPlayerForfeit?: (data: { odForfeitedUserId: string; odForfeitedUserName: string }) => void;
    onConnectionStatesUpdate?: (states: ConnectionStates) => void;
    isAiMatch?: boolean;
}

export function useArenaSocket({
    matchId,
    userId,
    userName,
    operation,
    userRank,
    userDivision,
    userLevel,
    userBanner,
    userTitle,
    isAiMatch,
    onMatchStart,
    onAnswerResult,
    onNewQuestion,
    onTimeUpdate,
    onMatchEnd,
    onPlayerJoined,
    onPlayerLeft,
    onPlayerForfeit,
    onConnectionStatesUpdate,
}: UseArenaSocketOptions) {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const connectedRef = useRef(false); // Track connected state without triggering re-renders
    const isCleaningUpRef = useRef(false); // Prevent race conditions during cleanup
    const [players, setPlayers] = useState<Record<string, Player>>({});
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState(60);
    const [matchStarted, setMatchStarted] = useState(false);
    const [matchEnded, setMatchEnded] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(true);
    const [opponentForfeited, setOpponentForfeited] = useState<string | null>(null);
    const [performanceStats, setPerformanceStats] = useState<Record<string, PerformanceStats>>({});
    const [connectionStates, setConnectionStates] = useState<ConnectionStates>({});
    const [matchIntegrity, setMatchIntegrity] = useState<ConnectionState>('GREEN');

    // Store callbacks in refs to avoid triggering effect re-runs
    const callbacksRef = useRef({
        onMatchStart,
        onAnswerResult,
        onNewQuestion,
        onTimeUpdate,
        onMatchEnd,
        onPlayerJoined,
        onPlayerLeft,
        onPlayerForfeit,
        onConnectionStatesUpdate,
    });

    // Keep refs updated with latest callbacks
    useEffect(() => {
        callbacksRef.current = {
            onMatchStart,
            onAnswerResult,
            onNewQuestion,
            onTimeUpdate,
            onMatchEnd,
            onPlayerJoined,
            onPlayerLeft,
            onPlayerForfeit,
            onConnectionStatesUpdate,
        };
    });

    useEffect(() => {
        // Prevent re-initialization if socket already exists and is connected/connecting
        if (socketRef.current && (connectedRef.current || socketRef.current.connected)) {
            console.log('[Arena Socket] Socket already exists, skipping initialization');
            return;
        }

        // Reset cleanup flag when effect runs
        isCleaningUpRef.current = false;

        // Enhanced connection with retry logic and better error handling
        const connectWithRetry = (attempt = 1) => {
            // Don't retry if we're cleaning up
            if (isCleaningUpRef.current) {
                console.log('[Arena Socket] Cleanup in progress, aborting connection attempt');
                return;
            }

            console.log(`[Arena Socket] Connection attempt ${attempt}`);

            const socket = io({
                path: '/api/socket/arena',
                transports: ['websocket', 'polling'],
                timeout: 20000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                forceNew: attempt > 1, // Force new connection on retry
            });

            socketRef.current = socket;

            // Connection timeout handler
            const connectionTimeout = setTimeout(() => {
                if (!connectedRef.current && !isCleaningUpRef.current) {
                    console.log('[Arena Socket] Connection timeout, retrying...');
                    socket.disconnect();

                    if (attempt < 3 && !isCleaningUpRef.current) {
                        setTimeout(() => connectWithRetry(attempt + 1), 2000);
                    } else if (!isCleaningUpRef.current) {
                        console.error('[Arena Socket] Failed to connect after 3 attempts');
                        // Could emit an error event here for UI handling
                    }
                }
            }, 15000);

            socket.on('connect', () => {
                console.log('[Arena Socket] Connected successfully');
                clearTimeout(connectionTimeout);
                connectedRef.current = true;
                setConnected(true);

                // Join the match with enhanced data
                socket.emit('join_match', {
                    matchId,
                    userId,
                    userName,
                    operation,
                    isAiMatch,
                    userRank: userRank || 'Bronze',
                    userDivision: userDivision || 'I',
                    userLevel: userLevel || 1,
                    userBanner: userBanner || 'default',
                    userTitle: userTitle || 'Challenger',
                    timestamp: Date.now()
                });
            });

            socket.on('connect_error', (error) => {
                console.error('[Arena Socket] Connection error:', error.message);
                clearTimeout(connectionTimeout);
                connectedRef.current = false;
                setConnected(false);

                // Retry logic for connection errors (only if not cleaning up)
                if (attempt < 3 && !isCleaningUpRef.current) {
                    setTimeout(() => connectWithRetry(attempt + 1), 2000 * attempt);
                }
            });

            socket.on('disconnect', (reason) => {
                console.log('[Arena Socket] Disconnected:', reason);
                clearTimeout(connectionTimeout);
                connectedRef.current = false;
                setConnected(false);

                // Auto-reconnect for certain disconnect reasons (only if not cleaning up)
                if (!isCleaningUpRef.current && (reason === 'io server disconnect' || reason === 'transport close')) {
                    setTimeout(() => connectWithRetry(1), 1000);
                }
            });

            // Enhanced error handling
            socket.on('match_error', (error) => {
                console.error('[Arena Socket] Match error:', error);
                // Could set an error state here for UI display
            });

            socket.on('reconnect', (attemptNumber) => {
                console.log(`[Arena Socket] Reconnected after ${attemptNumber} attempts`);
                connectedRef.current = true;
                setConnected(true);
            });

            socket.on('reconnect_error', (error) => {
                console.error('[Arena Socket] Reconnection error:', error);
            });

            socket.on('match_state', (data) => {
                console.log('[Arena Socket] Received match state:', data);
                setPlayers(data.players);
                if (data.question) setCurrentQuestion(data.question);
                setTimeLeft(data.timeLeft);
                setMatchStarted(data.started);
                setMatchEnded(data.ended);
                setWaitingForOpponent(Object.keys(data.players).length < 2);
            });

            socket.on('player_joined', (data) => {
                console.log('[Arena Socket] Player joined:', data);
                setPlayers(data.players);
                setWaitingForOpponent(Object.keys(data.players).length < 2);
                callbacksRef.current.onPlayerJoined?.(data);
            });

            socket.on('match_start', (data) => {
                console.log('[Arena Socket] Match started:', data);
                setMatchStarted(true);
                setWaitingForOpponent(false);
                setPlayers(data.players);
                setCurrentQuestion(data.question);
                setTimeLeft(data.timeLeft);
                callbacksRef.current.onMatchStart?.(data);
            });

            socket.on('answer_result', (data) => {
                console.log('[Arena Socket] Answer result:', data);
                // Preserve odCurrentQuestion when updating players from answer_result
                // as answer_result might not contain the latest question for everyone
                setPlayers(prev => {
                    const newPlayers = { ...data.odPlayers };
                    // Restore local knowledge of opponent questions if missing in update
                    Object.keys(prev).forEach(pid => {
                        if (newPlayers[pid] && !newPlayers[pid].odCurrentQuestion && prev[pid].odCurrentQuestion) {
                            newPlayers[pid].odCurrentQuestion = prev[pid].odCurrentQuestion;
                        }
                    });
                    return newPlayers;
                });
                callbacksRef.current.onAnswerResult?.(data);
            });

            socket.on('new_question', (data) => {
                console.log('[Arena Socket] New question:', data);
                setCurrentQuestion(data.question);
                callbacksRef.current.onNewQuestion?.(data);
            });

            socket.on('opponent_question_update', (data) => {
                console.log('[Arena Socket] Opponent question update:', data);
                setPlayers(prev => {
                    if (!prev[data.odUserId]) return prev;
                    return {
                        ...prev,
                        [data.odUserId]: {
                            ...prev[data.odUserId],
                            odCurrentQuestion: data.question
                        }
                    };
                });
            });

            socket.on('time_update', (data) => {
                setTimeLeft(data.timeLeft);
                callbacksRef.current.onTimeUpdate?.(data);
            });

            // Connection quality ping/pong
            socket.on('connection_ping', (data: { t: number }) => {
                // Respond immediately with pong
                socket.emit('connection_pong', { t: data.t, matchId, userId });
            });

            // Connection states update from server
            socket.on('connection_states', (data: { states: ConnectionStates }) => {
                setConnectionStates(data.states);
                callbacksRef.current.onConnectionStatesUpdate?.(data.states);
            });

            socket.on('match_end', (data) => {
                console.log('[Arena Socket] Match ended:', data);
                setMatchEnded(true);
                setPlayers(data.players);
                if (data.performanceStats) {
                    setPerformanceStats(data.performanceStats);
                }
                if (data.matchIntegrity) {
                    setMatchIntegrity(data.matchIntegrity);
                }
                callbacksRef.current.onMatchEnd?.(data);
            });

            socket.on('player_left', (data) => {
                console.log('[Arena Socket] Player left:', data);
                setPlayers(prev => {
                    const newPlayers = { ...prev };
                    delete newPlayers[data.odUserId];
                    return newPlayers;
                });
                callbacksRef.current.onPlayerLeft?.(data);
            });

            socket.on('player_forfeit', (data) => {
                console.log('[Arena Socket] Player forfeited:', data);
                setMatchEnded(true);
                setOpponentForfeited(data.odForfeitedUserName);
                callbacksRef.current.onPlayerForfeit?.(data);
            });
        };

        // Start connection
        connectWithRetry(1);

        return () => {
            console.log('[Arena Socket] Cleanup running');
            isCleaningUpRef.current = true;
            if (socketRef.current) {
                socketRef.current.emit('leave_match', { matchId, userId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            connectedRef.current = false;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks handled via refs, user data intentionally excluded to prevent reconnection
    }, [matchId, userId, userName, operation, isAiMatch]);

    const submitAnswer = useCallback((userAnswer: number) => {
        if (socketRef.current && connected) {
            socketRef.current.emit('submit_answer', {
                matchId,
                odUserId: userId,
                userAnswer,
            });
        }
    }, [matchId, userId, connected]);

    const leaveMatch = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('leave_match', { matchId, userId });
            socketRef.current.disconnect();
        }
    }, [matchId, userId]);

    return {
        connected,
        players,
        currentQuestion,
        timeLeft,
        matchStarted,
        matchEnded,
        waitingForOpponent,
        opponentForfeited,
        performanceStats,
        connectionStates,
        matchIntegrity,
        submitAnswer,
        leaveMatch,
    };
}
