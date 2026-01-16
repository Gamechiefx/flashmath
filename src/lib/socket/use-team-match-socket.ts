'use client';

/**
 * useTeamMatchSocket
 * 
 * React hook for managing team match WebSocket connections.
 * Handles real-time match state, spectating, and answer submissions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Socket.IO event handlers use any types */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Types
export interface PlayerState {
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string | null;
    slot: string;
    score: number;
    correct: number;
    total: number;
    streak: number;
    maxStreak: number;
    isActive: boolean;
    isComplete: boolean;
    isIgl: boolean;
    isAnchor: boolean;
    currentQuestion?: {
        question: string;
        operation: string;
    } | null;
}

export interface TeamState {
    teamId: string;
    teamName: string;
    teamTag: string | null;
    score: number;
    currentStreak: number;
    isHome: boolean;
    timeoutsUsed: number;
    slotAssignments: Record<string, string>;
    players: Record<string, PlayerState>;
}

export interface MatchState {
    matchId: string;
    phase: 'pre_match' | 'active' | 'break' | 'halftime' | 'anchor_decision' | 'post_match';
    round: number;
    half: number;
    gameClockMs: number;
    relayClockMs: number;
    currentSlot: number;
    questionsInSlot: number;
    team1: TeamState;
    team2: TeamState;
    isMyTeam: string;
}

export interface AnswerResult {
    teamId: string;
    userId: string;
    isCorrect: boolean;
    pointsEarned: number;
    newStreak: number;
    newTeamScore: number;
    newPlayerScore: number;
    questionsInSlot: number;
}

export interface TeammateAnswer {
    userId: string;
    question: string;
    correctAnswer: number;
    playerAnswer: string;
    isCorrect: boolean;
    answerTimeMs: number;
}

export interface TypingUpdate {
    userId: string;
    currentInput: string;
}

export interface HandoffCountdown {
    nextPlayerId: string;
    nextPlayerName: string;
    slotNumber: number;
    operation: string;
    countdownMs: number;
}

interface UseTeamMatchSocketOptions {
    matchId: string;
    userId: string;
    onMatchState?: (state: MatchState) => void;
    onMatchStart?: (data: { round: number; half: number; currentSlot: number; slotOperation: string }) => void;
    onQuestionUpdate?: (data: { questionId: string; questionText: string; operation: string; activePlayerId: string; slotNumber: number; questionInSlot: number }) => void;
    onTypingUpdate?: (data: TypingUpdate) => void;
    onAnswerResult?: (result: AnswerResult) => void;
    onTeammateAnswer?: (answer: TeammateAnswer) => void;
    onSlotChange?: (data: { currentSlot: number; slotOperation: string }) => void;
    onHandoffCountdown?: (data: HandoffCountdown) => void;
    onRoundBreak?: (data: { completedRound: number; team1Score: number; team2Score: number; breakDurationMs: number }) => void;
    onHalftime?: (data: { team1Score: number; team2Score: number; roundScores: any[]; halftimeDurationMs: number }) => void;
    onRoundStart?: (data: { round: number; half: number; currentSlot: number; slotOperation: string }) => void;
    onClockUpdate?: (data: { gameClockMs: number; relayClockMs: number; round: number }) => void;
    onMatchEnd?: (data: { winnerId: string | null; isDraw: boolean; team1Score: number; team2Score: number; roundScores: any[]; team1Players: any[]; team2Players: any[]; matchDurationMs: number }) => void;
    onPlayerConnected?: (data: { userId: string; playerName: string }) => void;
    onPlayerDisconnected?: (data: { userId: string; playerName: string }) => void;
    onTimeoutCalled?: (data: { teamId: string; teamName: string; timeoutsRemaining: number; extensionMs: number }) => void;
    onSlotsUpdated?: (data: { newAssignments: Record<string, string> }) => void;
    onAnchorAbilityUsed?: (data: { teamId: string; ability: string; targetSlot?: number }) => void;
    onError?: (error: { message: string }) => void;
}

export function useTeamMatchSocket(options: UseTeamMatchSocketOptions) {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [matchState, setMatchState] = useState<MatchState | null>(null);

    // Connect to socket
    useEffect(() => {
        const socket = io('/arena/teams', {
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[TeamMatchSocket] Connected');
            setConnected(true);
            
            // Join the match
            socket.emit('join_team_match', {
                matchId: options.matchId,
                userId: options.userId,
            });
        });

        socket.on('match_state', (state: MatchState) => {
            setMatchState(state);
            options.onMatchState?.(state);
        });

        socket.on('match_start', (data) => {
            options.onMatchStart?.(data);
        });

        socket.on('question_update', (data) => {
            options.onQuestionUpdate?.(data);
        });

        socket.on('typing_update', (data) => {
            if (data.userId !== options.userId) {
                options.onTypingUpdate?.(data);
            }
        });

        socket.on('answer_result', (result) => {
            options.onAnswerResult?.(result);
        });

        socket.on('teammate_answer', (answer) => {
            options.onTeammateAnswer?.(answer);
        });

        socket.on('slot_change', (data) => {
            options.onSlotChange?.(data);
        });

        socket.on('handoff_countdown', (data) => {
            options.onHandoffCountdown?.(data);
        });

        socket.on('round_break', (data) => {
            options.onRoundBreak?.(data);
        });

        socket.on('halftime', (data) => {
            options.onHalftime?.(data);
        });

        socket.on('round_start', (data) => {
            options.onRoundStart?.(data);
        });

        socket.on('clock_update', (data) => {
            options.onClockUpdate?.(data);
        });

        socket.on('match_end', (data) => {
            options.onMatchEnd?.(data);
        });

        socket.on('player_connected', (data) => {
            options.onPlayerConnected?.(data);
        });

        socket.on('player_disconnected', (data) => {
            options.onPlayerDisconnected?.(data);
        });

        socket.on('timeout_called', (data) => {
            options.onTimeoutCalled?.(data);
        });

        socket.on('slots_updated', (data) => {
            options.onSlotsUpdated?.(data);
        });

        socket.on('anchor_ability_used', (data) => {
            options.onAnchorAbilityUsed?.(data);
        });

        socket.on('error', (error) => {
            console.error('[TeamMatchSocket] Error:', error);
            options.onError?.(error);
        });

        socket.on('disconnect', () => {
            console.log('[TeamMatchSocket] Disconnected');
            setConnected(false);
        });

        return () => {
            socket.disconnect();
        };
    }, [options.matchId, options.userId]);

    // Submit an answer
    const submitAnswer = useCallback((answer: string) => {
        if (!socketRef.current) return;
        
        socketRef.current.emit('submit_answer', {
            matchId: options.matchId,
            userId: options.userId,
            answer,
        });
    }, [options.matchId, options.userId]);

    // Send typing update to teammates
    const sendTypingUpdate = useCallback((currentInput: string) => {
        if (!socketRef.current) return;
        
        socketRef.current.emit('typing_update', {
            matchId: options.matchId,
            userId: options.userId,
            currentInput,
        });
    }, [options.matchId, options.userId]);

    // IGL calls timeout
    const callTimeout = useCallback(() => {
        if (!socketRef.current) return;
        
        socketRef.current.emit('igl_timeout', {
            matchId: options.matchId,
            userId: options.userId,
        });
    }, [options.matchId, options.userId]);

    // IGL swaps slot assignments
    const swapSlots = useCallback((newAssignments: Record<string, string>) => {
        if (!socketRef.current) return;
        
        socketRef.current.emit('igl_swap_slots', {
            matchId: options.matchId,
            userId: options.userId,
            newAssignments,
        });
    }, [options.matchId, options.userId]);

    // Anchor uses double call-in
    const useDoubleCallin = useCallback((targetSlot: number) => {
        if (!socketRef.current) return;
        
        socketRef.current.emit('anchor_double_callin', {
            matchId: options.matchId,
            userId: options.userId,
            targetSlot,
        });
    }, [options.matchId, options.userId]);

    return {
        connected,
        matchState,
        submitAnswer,
        sendTypingUpdate,
        callTimeout,
        swapSlots,
        useDoubleCallin,
    };
}



