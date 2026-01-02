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
}

interface Question {
    question: string;
    answer: number;
    operation: string;
}

interface UseArenaSocketOptions {
    matchId: string;
    userId: string;
    userName: string;
    operation: string;
    onMatchStart?: (data: { question: Question; timeLeft: number; players: Record<string, Player> }) => void;
    onAnswerResult?: (data: { odUserId: string; odIsCorrect: boolean; odPlayers: Record<string, Player> }) => void;
    onNewQuestion?: (data: { question: Question }) => void;
    onTimeUpdate?: (data: { timeLeft: number }) => void;
    onMatchEnd?: (data: { players: Record<string, Player> }) => void;
    onPlayerJoined?: (data: { players: Record<string, Player>; playerId: string; playerName: string }) => void;
    onPlayerLeft?: (data: { odUserId: string }) => void;
    onPlayerForfeit?: (data: { odForfeitedUserId: string; odForfeitedUserName: string }) => void;
    isAiMatch?: boolean;
}

export function useArenaSocket({
    matchId,
    userId,
    userName,
    operation,
    isAiMatch,
    onMatchStart,
    onAnswerResult,
    onNewQuestion,
    onTimeUpdate,
    onMatchEnd,
    onPlayerJoined,
    onPlayerLeft,
    onPlayerForfeit,
}: UseArenaSocketOptions) {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [players, setPlayers] = useState<Record<string, Player>>({});
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState(60);
    const [matchStarted, setMatchStarted] = useState(false);
    const [matchEnded, setMatchEnded] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(true);
    const [opponentForfeited, setOpponentForfeited] = useState<string | null>(null);

    useEffect(() => {
        // Connect to WebSocket server
        const socket = io({
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Arena Socket] Connected');
            setConnected(true);

            // Join the match
            socket.emit('join_match', {
                matchId,
                userId,
                userName,
                operation,
                isAiMatch,
            });
        });

        socket.on('disconnect', () => {
            console.log('[Arena Socket] Disconnected');
            setConnected(false);
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
            onPlayerJoined?.(data);
        });

        socket.on('match_start', (data) => {
            console.log('[Arena Socket] Match started:', data);
            setMatchStarted(true);
            setWaitingForOpponent(false);
            setPlayers(data.players);
            setCurrentQuestion(data.question);
            setTimeLeft(data.timeLeft);
            onMatchStart?.(data);
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
            onAnswerResult?.(data);
        });

        socket.on('new_question', (data) => {
            console.log('[Arena Socket] New question:', data);
            setCurrentQuestion(data.question);
            onNewQuestion?.(data);
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
            onTimeUpdate?.(data);
        });

        socket.on('match_end', (data) => {
            console.log('[Arena Socket] Match ended:', data);
            setMatchEnded(true);
            setPlayers(data.players);
            onMatchEnd?.(data);
        });

        socket.on('player_left', (data) => {
            console.log('[Arena Socket] Player left:', data);
            setPlayers(prev => {
                const newPlayers = { ...prev };
                delete newPlayers[data.odUserId];
                return newPlayers;
            });
            onPlayerLeft?.(data);
        });

        socket.on('player_forfeit', (data) => {
            console.log('[Arena Socket] Player forfeited:', data);
            setMatchEnded(true);
            setOpponentForfeited(data.odForfeitedUserName);
            onPlayerForfeit?.(data);
        });

        return () => {
            socket.emit('leave_match', { matchId, userId });
            socket.disconnect();
        };
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
        submitAnswer,
        leaveMatch,
    };
}
