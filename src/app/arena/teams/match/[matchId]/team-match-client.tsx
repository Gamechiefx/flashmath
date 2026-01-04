'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { cn } from '@/lib/utils';
import { 
    Clock, Crown, Anchor, Zap, Check, X, 
    Pause, Play, AlertCircle, Trophy, LogOut, ArrowLeft
} from 'lucide-react';
import { 
    TeammateSpectatorView, 
    OpponentStatusPanel,
    LiveTypingIndicator,
    AnswerResultToast,
    AnchorAbilities,
    IGLControls 
} from '@/components/arena/teams/match';

interface TeamMatchClientProps {
    matchId: string;
    currentUserId: string;
    currentUserName: string;
}

interface PlayerState {
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

interface TeamState {
    teamId: string;
    teamName: string;
    teamTag: string | null;
    leaderId: string; // Party leader who can initiate quit votes
    score: number;
    currentStreak: number;
    isHome: boolean;
    timeoutsUsed: number;
    slotAssignments: Record<string, string>;
    players: Record<string, PlayerState>;
    currentSlot: number;        // Per-team slot tracking (1-5)
    questionsInSlot: number;    // Per-team questions progress (0-5)
}

interface MatchState {
    matchId: string;
    phase: 'pre_match' | 'strategy' | 'active' | 'break' | 'halftime' | 'anchor_decision' | 'post_match';
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

interface SlotAssignment {
    slot: number;
    name: string;
    isIgl: boolean;
    isAnchor: boolean;
}

interface StrategyPhaseState {
    durationMs: number;
    remainingMs: number;
    mySlots: Record<string, SlotAssignment>;
    opponentSlots: Record<string, SlotAssignment>;
    myTeamReady: boolean;
    opponentTeamReady: boolean;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

// Halftime countdown timer component
function HalftimeCountdown({ durationMs, onComplete }: { durationMs: number; onComplete?: () => void }) {
    const [remainingMs, setRemainingMs] = useState(durationMs);
    const startTimeRef = useRef(Date.now());
    
    useEffect(() => {
        startTimeRef.current = Date.now();
        setRemainingMs(durationMs);
        
        const interval = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const remaining = Math.max(0, durationMs - elapsed);
            setRemainingMs(remaining);
            
            if (remaining <= 0) {
                clearInterval(interval);
                onComplete?.();
            }
        }, 100);
        
        return () => clearInterval(interval);
    }, [durationMs, onComplete]);
    
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    
    return (
        <div className="mb-6">
            <div className="text-6xl font-mono font-black text-amber-400">
                {mins}:{secs.toString().padStart(2, '0')}
            </div>
            <p className="text-sm text-amber-400/70 mt-2">2nd Half starts in...</p>
        </div>
    );
}

export function TeamMatchClient({
    matchId,
    currentUserId,
    currentUserName,
}: TeamMatchClientProps) {
    const router = useRouter();
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const [connected, setConnected] = useState(false);
    const [matchState, setMatchState] = useState<MatchState | null>(null);
    const [currentInput, setCurrentInput] = useState('');
    const [lastAnswerResult, setLastAnswerResult] = useState<{
        isCorrect: boolean;
        pointsEarned: number;
        answerTimeMs: number;
    } | null>(null);
    // Track teammate's last answer result for real-time visibility
    const [teammateLastAnswerResult, setTeammateLastAnswerResult] = useState<{
        isCorrect: boolean;
        pointsEarned: number;
        answerTimeMs: number;
    } | null>(null);
    const [teammateTyping, setTeammateTyping] = useState<{
        odUserId: string;
        currentInput: string;
    } | null>(null);
    const [opponentLastResult, setOpponentLastResult] = useState<{
        isCorrect: boolean;
        pointsEarned: number;
    } | null>(null);
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    
    // Quit vote state
    const [quitVote, setQuitVote] = useState<{
        active: boolean;
        initiatorId: string;
        initiatorName: string;
        votes: Record<string, 'yes' | 'no' | null>;
        expiresAt: number;
        result?: 'quit' | 'stay' | null;
    } | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [voteTimeRemaining, setVoteTimeRemaining] = useState(30);
    
    // IGL/Anchor abilities state - tracked per half per spec
    const [usedDoubleCallinHalf1, setUsedDoubleCallinHalf1] = useState(false);
    const [usedDoubleCallinHalf2, setUsedDoubleCallinHalf2] = useState(false);
    const [usedAnchorSolo, setUsedAnchorSolo] = useState(false);
    const [timeoutsRemaining, setTimeoutsRemaining] = useState(2); // 2 per match
    const [breakCountdownMs, setBreakCountdownMs] = useState(0); // Countdown for tactical breaks
    
    // Strategy phase state (slot assignment before match starts)
    const [strategyPhase, setStrategyPhase] = useState<StrategyPhaseState | null>(null);
    const [selectedSlotPlayer, setSelectedSlotPlayer] = useState<string | null>(null);

    // Handle leaving/quitting the match (individual leave - only used after vote passes)
    const handleLeaveMatch = useCallback(() => {
        if (isLeaving) return;
        setIsLeaving(true);
        
        console.log('[TeamMatch] Leaving match:', matchId);
        
        // Emit leave event to server
        if (socketRef.current?.connected) {
            socketRef.current.emit('leave_match', { matchId });
        }
        
        // Navigate back to setup
        router.push('/arena/teams/setup?mode=5v5');
    }, [matchId, router, isLeaving]);

    // Initiate quit vote (leader only)
    const handleInitiateQuitVote = useCallback(() => {
        if (!socketRef.current?.connected || !matchState) return;
        
        console.log('[TeamMatch] Initiating quit vote');
        socketRef.current.emit('initiate_quit_vote', { matchId });
        setShowQuitConfirm(false);
    }, [matchId, matchState]);

    // Cast quit vote
    const handleCastVote = useCallback((vote: 'yes' | 'no') => {
        if (!socketRef.current?.connected || hasVoted) return;
        
        console.log('[TeamMatch] Casting quit vote:', vote);
        socketRef.current.emit('cast_quit_vote', { matchId, vote });
        setHasVoted(true);
    }, [matchId, hasVoted]);

    // Handle Double Call-In - IGL activates this, per spec
    const handleDoubleCallin = useCallback((targetSlot: number) => {
        if (!socketRef.current?.connected || !matchState) return;
        
        // Check if already used this half
        const usedThisHalf = matchState.half === 1 ? usedDoubleCallinHalf1 : usedDoubleCallinHalf2;
        if (usedThisHalf) return;
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:handleDoubleCallin',message:'DC-H1: Client emitting anchor_callin',data:{matchId,userId:currentUserId,targetSlot,half:matchState.half,phase:matchState.phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H1'})}).catch(()=>{});
        // #endregion
        
        console.log('[TeamMatch] IGL activating Double Call-In for slot:', targetSlot, 'Half:', matchState.half, 'UserId:', currentUserId);
        socketRef.current.emit('anchor_callin', { 
            matchId, 
            userId: currentUserId,  // CRITICAL: Server needs userId to verify IGL
            targetSlot, 
            half: matchState.half 
        });
        
        // Mark as used for this half
        if (matchState.half === 1) {
            setUsedDoubleCallinHalf1(true);
        } else {
            setUsedDoubleCallinHalf2(true);
        }
    }, [matchId, currentUserId, matchState?.half, usedDoubleCallinHalf1, usedDoubleCallinHalf2]);

    // Handle Anchor Solo (final round ability)
    const handleAnchorSolo = useCallback(() => {
        if (!socketRef.current?.connected || usedAnchorSolo) return;
        console.log('[TeamMatch] Activating Anchor Solo');
        socketRef.current.emit('anchor_solo', { matchId });
        setUsedAnchorSolo(true);
    }, [matchId, usedAnchorSolo]);

    // Derived state
    const myTeam = matchState 
        ? matchState.team1.teamId === matchState.isMyTeam 
            ? matchState.team1 
            : matchState.team2
        : null;
    const opponentTeam = matchState
        ? matchState.team1.teamId === matchState.isMyTeam
            ? matchState.team2
            : matchState.team1
        : null;
    const myPlayer = myTeam?.players[currentUserId];
    const isMyTurn = myPlayer?.isActive;
    const activeTeammateId = myTeam 
        ? Object.values(myTeam.players).find(p => p.isActive)?.odUserId 
        : null;
    const activeOpponent = opponentTeam
        ? Object.values(opponentTeam.players).find(p => p.isActive)
        : null;
    
    // Check if current user is the party leader (can initiate quit votes)
    const isPartyLeader = myTeam?.leaderId === currentUserId;
    
    // Check if current user is the IGL or Anchor
    const isIGL = myPlayer?.isIgl || false;
    const isAnchor = myPlayer?.isAnchor || false;
    
    // Get anchor player info (needed for IGL controls)
    const anchorPlayer = myTeam ? Object.values(myTeam.players).find(p => p.isAnchor) : null;
    const anchorName = anchorPlayer?.odName || 'Anchor';
    const anchorSlot = anchorPlayer?.slot || 'unknown';
    
    // Get available slots for Double Call-In (slots the anchor is NOT assigned to)
    // IGL controls this - anchor can play their assigned slot + one additional
    const availableSlots = myTeam ? 
        ['addition', 'subtraction', 'multiplication', 'division', 'mixed']
            .filter(op => {
                // Exclude the anchor's own assigned slot
                const playerInSlot = Object.values(myTeam.players).find(p => p.slot === op);
                return playerInSlot && !playerInSlot.isAnchor;
            })
            .map((op, idx) => {
                const playerInSlot = Object.values(myTeam.players).find(p => p.slot === op);
                return {
                    slot: idx + 1,
                    operation: op,
                    playerName: playerInSlot?.odName || 'Unknown'
                };
            })
        : [];

    // Format time as mm:ss
    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Connect to socket
    useEffect(() => {
        const socket = io('/arena/teams', {
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[TeamMatch] Connected to socket');
            setConnected(true);
            
            // Join the match
            socket.emit('join_team_match', {
                matchId,
                userId: currentUserId,
            });
        });

        socket.on('match_state', (state: MatchState) => {
            console.log('[TeamMatch] Received match state:', state);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:match_state',message:'H1A/H2A: match_state received',data:{phase:state.phase,gameClockMs:state.gameClockMs,relayClockMs:state.relayClockMs,currentSlot:state.currentSlot,questionsInSlot:state.questionsInSlot,round:state.round,half:state.half},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1A,H2A'})}).catch(()=>{});
            // #endregion
            setMatchState(state);
        });

        // STRATEGY PHASE: IGL slot assignment before match starts
        socket.on('strategy_phase_start', (data) => {
            console.log('[TeamMatch] Strategy phase started:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:strategy_phase_start',message:'Strategy phase started',data:{durationMs:data.durationMs,myTeamSlots:Object.keys(data.team1Slots || data.team2Slots || {}).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'STRATEGY'})}).catch(()=>{});
            // #endregion
            
            // Determine which team is mine
            const isTeam1 = matchState?.isMyTeam === matchState?.team1?.teamId;
            const mySlots = isTeam1 ? data.team1Slots : data.team2Slots;
            const opponentSlots = isTeam1 ? data.team2Slots : data.team1Slots;
            
            setStrategyPhase({
                durationMs: data.durationMs,
                remainingMs: data.durationMs,
                mySlots: mySlots || {},
                opponentSlots: opponentSlots || {},
                myTeamReady: false,
                opponentTeamReady: false,
            });
            
            // Update match phase
            setMatchState(prev => prev ? { ...prev, phase: 'strategy' } : prev);
        });
        
        socket.on('strategy_time_update', (data) => {
            setStrategyPhase(prev => prev ? { ...prev, remainingMs: data.remainingMs } : prev);
        });
        
        socket.on('slot_assignments_updated', (data) => {
            console.log('[TeamMatch] Slot assignments updated:', data);
            setStrategyPhase(prev => prev ? { ...prev, mySlots: data.slots } : prev);
        });
        
        socket.on('team_ready', (data) => {
            console.log('[TeamMatch] Team ready:', data);
            const isMyTeam = data.teamId === matchState?.isMyTeam;
            setStrategyPhase(prev => prev ? {
                ...prev,
                myTeamReady: isMyTeam ? true : prev.myTeamReady,
                opponentTeamReady: !isMyTeam ? true : prev.opponentTeamReady,
            } : prev);
        });

        socket.on('match_start', (data) => {
            console.log('[TeamMatch] Match started:', data);
            // CRITICAL: Update phase to 'active' and set active players
            setMatchState(prev => {
                if (!prev) return prev;
                
                // Deep clone to avoid mutation issues
                const newState = JSON.parse(JSON.stringify(prev));
                newState.phase = 'active';
                newState.round = data.round || prev.round;
                newState.half = data.half || prev.half;
                newState.currentSlot = data.currentSlot || 1;
                newState.questionsInSlot = 0;
                
                // Set active players based on the data from server
                if (data.team1ActivePlayerId) {
                    for (const playerId of Object.keys(newState.team1.players)) {
                        newState.team1.players[playerId].isActive = (playerId === data.team1ActivePlayerId);
                    }
                }
                if (data.team2ActivePlayerId) {
                    for (const playerId of Object.keys(newState.team2.players)) {
                        newState.team2.players[playerId].isActive = (playerId === data.team2ActivePlayerId);
                    }
                }
                
                console.log('[TeamMatch] Active players set - Team1:', data.team1ActivePlayerId, 'Team2:', data.team2ActivePlayerId);
                
                return newState;
            });
        });

        socket.on('question_update', (data) => {
            console.log('[TeamMatch] Question update:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:question_update',message:'H3A/H3C: question update received',data:{activePlayerId:data.activePlayerId,questionText:data.questionText,slotNumber:data.slotNumber,questionInSlot:data.questionInSlot,operation:data.operation},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3A,H3C'})}).catch(()=>{});
            // #endregion
            // Update question for the active player AND set them as active
            setMatchState(prev => {
                if (!prev) return prev;
                
                // Deep clone to avoid mutation issues
                const newState = JSON.parse(JSON.stringify(prev));
                
                // Find which team the active player is on
                const team = newState.team1.teamId === newState.isMyTeam ? newState.team1 : newState.team2;
                
                // First, set all players in this team as inactive
                for (const playerId of Object.keys(team.players)) {
                    team.players[playerId].isActive = false;
                }
                
                // Then set the active player and their question
                const player = team.players[data.activePlayerId];
                if (player) {
                    player.isActive = true;
                    player.currentQuestion = {
                        question: data.questionText,
                        operation: data.operation,
                    };
                    console.log('[TeamMatch] Set active player:', data.activePlayerId, 'question:', data.questionText);
                }
                
                // Update slot number only (not questionsInSlot - that's updated by answer_result)
                // data.slotNumber tells us which slot is active
                newState.currentSlot = data.slotNumber || newState.currentSlot;
                // Also update team-specific slot for UI consistency
                team.currentSlot = data.slotNumber || team.currentSlot;
                // NOTE: Don't update questionsInSlot here - it represents "completed questions" 
                // and is correctly updated by answer_result event
                
                return newState;
            });
        });

        socket.on('typing_update', (data) => {
            if (data.userId !== currentUserId) {
                setTeammateTyping({
                    odUserId: data.userId,
                    currentInput: data.currentInput,
                });
            }
        });

        socket.on('answer_result', (data) => {
            console.log('[TeamMatch] Answer result:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:answer_result',message:'H3A/H3B: answer result and questionsInSlot',data:{userId:data.userId,isCorrect:data.isCorrect,questionsInSlot:data.questionsInSlot,teamId:data.teamId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3A,H3B'})}).catch(()=>{});
            // #endregion
            if (data.userId === currentUserId) {
                setLastAnswerResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                    answerTimeMs: Date.now(), // TODO: Get actual time from server
                });
                setCurrentInput('');
                
                // Clear result after a delay
                setTimeout(() => setLastAnswerResult(null), 1500);
            } else if (myTeam && data.teamId === myTeam.teamId && data.userId !== currentUserId) {
                // Teammate answer result - show it to spectating teammates
                setTeammateLastAnswerResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                    answerTimeMs: Date.now(),
                });
                // Clear after delay
                setTimeout(() => setTeammateLastAnswerResult(null), 1500);
            } else if (opponentTeam && data.teamId === opponentTeam.teamId) {
                setOpponentLastResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                });
                setTimeout(() => setOpponentLastResult(null), 1500);
            }
            
            // Update scores and team-specific questionsInSlot
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                const team = newState.team1.teamId === data.teamId ? newState.team1 : newState.team2;
                team.score = data.newTeamScore;
                team.currentStreak = data.newStreak;
                team.questionsInSlot = data.questionsInSlot; // Update team-specific progress
                if (team.players[data.userId]) {
                    team.players[data.userId].score = data.newPlayerScore;
                    team.players[data.userId].streak = data.newStreak;
                }
                return newState;
            });
        });

        socket.on('teammate_answer', (data) => {
            console.log('[TeamMatch] Teammate answer:', data);
            setTeammateTyping(null);
        });

        socket.on('slot_change', (data) => {
            console.log('[TeamMatch] Slot change:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:slot_change',message:'H3B: slot changed (per-team)',data:{teamId:data.teamId,currentSlot:data.currentSlot,slotOperation:data.slotOperation},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3B'})}).catch(()=>{});
            // #endregion
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                // Update the specific team's currentSlot
                if (data.teamId === newState.team1.teamId) {
                    newState.team1.currentSlot = data.currentSlot;
                    newState.team1.questionsInSlot = 0; // Reset questions for new slot
                } else if (data.teamId === newState.team2.teamId) {
                    newState.team2.currentSlot = data.currentSlot;
                    newState.team2.questionsInSlot = 0; // Reset questions for new slot
                }
                // Also update match-level for backwards compatibility
                newState.currentSlot = data.currentSlot;
                return newState;
            });
        });

        socket.on('handoff_countdown', (data) => {
            console.log('[TeamMatch] Handoff countdown:', data);
        });

        socket.on('round_break', (data) => {
            console.log('[TeamMatch] Round break:', data);
            setBreakCountdownMs(data.breakDurationMs || 10000); // Default 10 seconds
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'break' };
            });
        });
        
        // Handle timeout called by IGL
        socket.on('timeout_called', (data) => {
            console.log('[TeamMatch] Timeout called:', data);
            // Use the server's calculated total duration if available, otherwise add extension
            if (data.newBreakDurationMs) {
                setBreakCountdownMs(data.newBreakDurationMs);
            } else {
                setBreakCountdownMs(prev => prev + (data.extensionMs || 60000));
            }
            setTimeoutsRemaining(data.timeoutsRemaining ?? 1);
        });

        socket.on('halftime', (data) => {
            console.log('[TeamMatch] Halftime:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:halftime',message:'H5: halftime event received on client',data:{team1Score:data.team1Score,team2Score:data.team2Score,halftimeDurationMs:data.halftimeDurationMs},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'})}).catch(()=>{});
            // #endregion
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'halftime' };
            });
        });
        
        // Double Call-In activated by IGL
        socket.on('double_callin_activated', (data) => {
            console.log('[TeamMatch] Double Call-In Activated:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:double_callin_activated',message:'Double Call-In event received',data:{anchorName:data.anchorName,targetSlot:data.targetSlot,benchedPlayerName:data.benchedPlayerName,forRound:data.forRound},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC1'})}).catch(()=>{});
            // #endregion
            
            // Update the appropriate half's usage state
            if (data.half === 1) {
                setUsedDoubleCallinHalf1(true);
            } else {
                setUsedDoubleCallinHalf2(true);
            }
            
            // Show a toast or notification
            alert(`Double Call-In: ${data.anchorName} will take over ${data.targetSlot} slot from ${data.benchedPlayerName} in Round ${data.forRound}`);
        });
        
        socket.on('double_callin_success', (data) => {
            console.log('[TeamMatch] Double Call-In Success:', data.message);
        });

        socket.on('round_start', (data) => {
            console.log('[TeamMatch] Round start:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:round_start',message:'H7/H8: round_start event received on client',data:{round:data.round,half:data.half,currentSlot:data.currentSlot},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H7,H8'})}).catch(()=>{});
            // #endregion
            setMatchState(prev => {
                if (!prev) return prev;
                // Reset BOTH team slots to 1 for the new round
                const newState = JSON.parse(JSON.stringify(prev));
                newState.phase = 'active';
                newState.round = data.round;
                newState.half = data.half;
                newState.currentSlot = data.currentSlot || 1;
                // Reset per-team slots
                newState.team1.currentSlot = 1;
                newState.team1.questionsInSlot = 0;
                newState.team2.currentSlot = 1;
                newState.team2.questionsInSlot = 0;
                return newState;
            });
        });

        socket.on('clock_update', (data) => {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:clock_update',message:'H2A: clock values from server',data:{gameClockMs:data.gameClockMs,relayClockMs:data.relayClockMs,round:data.round},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2A'})}).catch(()=>{});
            // #endregion
            setMatchState(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    gameClockMs: data.gameClockMs,
                    relayClockMs: data.relayClockMs,
                    round: data.round,
                };
            });
        });

        socket.on('match_end', (data) => {
            console.log('[TeamMatch] Match ended:', data);
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'post_match' };
            });
            
            // Navigate to results after brief delay
            setTimeout(() => {
                router.push(`/arena/teams/results/${matchId}`);
            }, 3000);
        });

        // Quit vote handlers
        socket.on('quit_vote_started', (data) => {
            console.log('[TeamMatch] Quit vote started:', data);
            setQuitVote({
                active: true,
                initiatorId: data.initiatorId,
                initiatorName: data.initiatorName,
                votes: data.votes || {},
                expiresAt: data.expiresAt,
                result: null,
            });
            setHasVoted(false);
            setVoteTimeRemaining(30);
        });

        socket.on('quit_vote_update', (data) => {
            console.log('[TeamMatch] Quit vote update:', data);
            setQuitVote(prev => {
                if (!prev) return prev;
                return { ...prev, votes: data.votes };
            });
        });

        socket.on('quit_vote_result', (data) => {
            console.log('[TeamMatch] Quit vote result:', data);
            setQuitVote(prev => {
                if (!prev) return prev;
                return { ...prev, active: false, result: data.result };
            });
            
            if (data.result === 'quit') {
                // Team voted to quit - everyone on this team leaves
                console.log('[TeamMatch] Quit vote passed - redirecting all team members to setup');
                setTimeout(() => {
                    router.push('/arena/teams/setup?mode=5v5&fromVote=true');
                }, 2000);
            } else {
                // Vote failed - clear after showing result
                setTimeout(() => {
                    setQuitVote(null);
                    setHasVoted(false);
                }, 2000);
            }
        });
        
        // Handle team forfeit (sent to ALL players in match, including opponent team)
        socket.on('team_forfeit', (data) => {
            console.log('[TeamMatch] Team forfeit:', data);
            // Show forfeit notification and redirect after delay
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'post_match', forfeitedBy: data.forfeitingTeamId };
            });
            
            // Redirect all players to setup after seeing the forfeit result
            setTimeout(() => {
                router.push('/arena/teams/setup?mode=5v5&fromForfeit=true');
            }, 5000);
        });

        socket.on('disconnect', () => {
            console.log('[TeamMatch] Disconnected');
            setConnected(false);
        });

        socket.on('error', (error) => {
            console.error('[TeamMatch] Socket error:', error);
        });

        return () => {
            socket.disconnect();
        };
    }, [matchId, currentUserId, router]);

    // Quit vote timer countdown
    useEffect(() => {
        if (!quitVote?.active || !quitVote.expiresAt) return;
        
        const interval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((quitVote.expiresAt - Date.now()) / 1000));
            setVoteTimeRemaining(remaining);
            
            if (remaining <= 0) {
                clearInterval(interval);
            }
        }, 1000);
        
        return () => clearInterval(interval);
    }, [quitVote?.active, quitVote?.expiresAt]);

    // Break countdown timer
    useEffect(() => {
        if (matchState?.phase !== 'break' || breakCountdownMs <= 0) return;
        
        const interval = setInterval(() => {
            setBreakCountdownMs(prev => Math.max(0, prev - 1000));
        }, 1000);
        
        return () => clearInterval(interval);
    }, [matchState?.phase, breakCountdownMs]);

    // #region agent log - Debug Q6 issue
    useEffect(() => {
        if (isMyTurn && myPlayer?.currentQuestion && myTeam) {
            const rawQNum = (myTeam.questionsInSlot || 0) + 1;
            if (rawQNum > 5) {
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:Q6_useEffect',message:'Q6-CLIENT: Client displaying Q6+',data:{rawQNum,questionsInSlot:myTeam.questionsInSlot,currentSlot:myTeam.currentSlot,question:myPlayer.currentQuestion.question},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'Q6-CLIENT'})}).catch(()=>{});
            }
        }
    }, [isMyTurn, myPlayer?.currentQuestion, myTeam?.questionsInSlot, myTeam?.currentSlot]);
    // #endregion

    // Handle answer submission
    const handleSubmit = useCallback(() => {
        if (!socketRef.current || !currentInput.trim() || !isMyTurn) return;
        
        socketRef.current.emit('submit_answer', {
            matchId,
            userId: currentUserId,
            answer: currentInput.trim(),
        });
    }, [matchId, currentUserId, currentInput, isMyTurn]);

    // Handle input change with typing broadcast
    const handleInputChange = useCallback((value: string) => {
        // Only allow numbers
        if (value && !/^\d*$/.test(value)) return;
        
        setCurrentInput(value);
        
        // Broadcast typing to team
        if (socketRef.current && isMyTurn) {
            socketRef.current.emit('typing_update', {
                matchId,
                userId: currentUserId,
                currentInput: value,
            });
        }
    }, [matchId, currentUserId, isMyTurn]);

    // Handle key press
    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    }, [handleSubmit]);

    // Focus input when it's my turn
    useEffect(() => {
        if (isMyTurn && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isMyTurn]);

    // Loading state
    if (!connected || !matchState) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 mx-auto mb-4 border-4 border-primary/30 
                                   border-t-primary rounded-full"
                    />
                    <p className="text-white/60">Connecting to match...</p>
                </div>
            </div>
        );
    }
    
    // Pre-match waiting state
    if (matchState.phase === 'pre_match') {
        // Count connected players
        const team1Connected = Object.values(matchState.team1.players).filter(p => p.odUserId).length;
        const team2Connected = Object.values(matchState.team2.players).filter(p => p.odUserId).length;
        const isAIMatch = matchState.team2.teamId?.startsWith('ai_team_') || matchState.team2.teamId?.startsWith('ai_party_');
        
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 flex items-center justify-center">
                <div className="text-center max-w-lg">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mb-8"
                    >
                        <h1 className="text-4xl font-black text-white mb-2">
                            {isAIMatch ? '🤖 AI Match' : '5v5 Arena'}
                        </h1>
                        <p className="text-white/60">Waiting for players to connect...</p>
                    </motion.div>
                    
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        {/* Team 1 - Your Team with Slot Assignments */}
                        <div className="bg-white/5 rounded-xl p-4 border border-primary/30">
                            <h3 className="text-primary font-bold mb-3">
                                {myTeam?.teamName || 'Your Team'}
                            </h3>
                            
                            {/* Slot Assignment Display */}
                            <div className="space-y-2">
                                {myTeam && Object.entries(myTeam.slotAssignments || {}).map(([op, userId]) => {
                                    const player = myTeam.players[userId];
                                    if (!player) return null;
                                    return (
                                        <div 
                                            key={`${op}-${userId}`}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                                player.odUserId ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40"
                                            )}
                                        >
                                            {/* Slot indicator */}
                                            <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-primary">
                                                {operationSymbols[op] || '?'}
                                            </span>
                                            {/* Player name */}
                                            <span className="flex-1">{player.odName}</span>
                                            {/* Role badges */}
                                            {player.isIgl && (
                                                <Crown className="w-4 h-4 text-amber-400" title="IGL" />
                                            )}
                                            {player.isAnchor && (
                                                <Anchor className="w-4 h-4 text-purple-400" title="Anchor" />
                                            )}
                                            {/* Connection status */}
                                            <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                player.odUserId ? "bg-emerald-400" : "bg-white/30"
                                            )} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        {/* Team 2 (Opponent/AI) with Slot Assignments */}
                        <div className="bg-white/5 rounded-xl p-4 border border-rose-500/30">
                            <h3 className="text-rose-400 font-bold mb-3 flex items-center justify-center gap-2">
                                {isAIMatch && <span>🤖</span>}
                                {opponentTeam?.teamName || 'Opponent'}
                            </h3>
                            <div className="space-y-2">
                                {opponentTeam && Object.entries(opponentTeam.slotAssignments || {}).map(([op, userId]) => {
                                    const player = opponentTeam.players[userId];
                                    if (!player) return null;
                                    return (
                                        <div 
                                            key={`${op}-${userId}`}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                                isAIMatch || player.odUserId 
                                                    ? "bg-rose-500/20 text-rose-400" 
                                                    : "bg-white/5 text-white/40"
                                            )}
                                        >
                                            <span className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center font-bold text-rose-400">
                                                {operationSymbols[op] || '?'}
                                            </span>
                                            <span className="flex-1">{player.odName}</span>
                                            {isAIMatch && <span className="text-xs bg-rose-500/30 px-2 py-0.5 rounded">BOT</span>}
                                            <span className={cn(
                                                "w-2 h-2 rounded-full",
                                                isAIMatch || player.odUserId ? "bg-rose-400" : "bg-white/30"
                                            )} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-white/40 text-sm"
                    >
                        Match will start when all players connect...
                    </motion.div>
                    
                    {/* Leave Button */}
                    <button
                        onClick={() => setShowQuitConfirm(true)}
                        className="mt-8 px-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 
                                   text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 
                                   transition-all flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Leave Match
                    </button>
                </div>
                
                {/* Quit Confirmation Modal for Pre-Match */}
                <AnimatePresence>
                    {showQuitConfirm && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                            onClick={() => setShowQuitConfirm(false)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-rose-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Leave Match?</h3>
                                        <p className="text-white/60 text-sm">Return to team setup</p>
                                    </div>
                                </div>
                                
                                <p className="text-white/70 mb-6">
                                    Are you sure you want to leave? You&apos;ll return to the team setup screen.
                                </p>
                                
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowQuitConfirm(false)}
                                        className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white 
                                                   hover:bg-white/20 transition-colors font-medium"
                                    >
                                        Stay
                                    </button>
                                    <button
                                        onClick={handleLeaveMatch}
                                        disabled={isLeaving}
                                        className="flex-1 px-4 py-3 rounded-xl bg-rose-600 text-white 
                                                   hover:bg-rose-700 transition-colors font-medium
                                                   disabled:opacity-50 disabled:cursor-not-allowed
                                                   flex items-center justify-center gap-2"
                                    >
                                        {isLeaving ? (
                                            <>
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                                />
                                                Leaving...
                                            </>
                                        ) : (
                                            <>
                                                <LogOut className="w-4 h-4" />
                                                Leave
                                            </>
                                        )}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }
    
    // Strategy Phase: IGL assigns player slots before match starts
    if (matchState.phase === 'strategy' && strategyPhase) {
        const isIGL = myPlayer?.isIgl;
        const operationLabels = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Mixed'];
        const remainingSecs = Math.ceil(strategyPhase.remainingMs / 1000);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:strategy_render',message:'H1-H5: Strategy phase render debug',data:{isIGL,myPlayerExists:!!myPlayer,myPlayerIsIgl:myPlayer?.isIgl,mySlotsCount:Object.keys(strategyPhase.mySlots).length,mySlots:strategyPhase.mySlots,selectedSlotPlayer,currentUserId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H5'})}).catch(()=>{});
        // #endregion
        
        const handleSlotChange = (playerId: string, newSlotOp: string) => {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:handleSlotChange',message:'H3-H4: Slot change clicked',data:{playerId,newSlotOp,isIGL,socketConnected:!!socketRef.current?.connected},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4'})}).catch(()=>{});
            // #endregion
            if (!isIGL || !socketRef.current) return;
            socketRef.current.emit('update_slot_assignment', {
                matchId,
                userId: currentUserId,
                playerId,
                newSlot: newSlotOp, // Send operation name, not number
            });
        };
        
        const handleConfirmSlots = () => {
            if (!isIGL || !socketRef.current) return;
            socketRef.current.emit('confirm_slots', {
                matchId,
                userId: currentUserId,
            });
        };
        
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-900/20 to-slate-900 flex flex-col items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-4xl"
                >
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-black text-white mb-2">
                            {isIGL ? '🎯 Assign Slots' : '⏳ Waiting for IGL'}
                        </h1>
                        <p className="text-white/60">
                            {isIGL 
                                ? 'Assign your team to operation slots before the match begins'
                                : 'Your IGL is assigning slots...'}
                        </p>
                    </div>
                    
                    {/* Timer */}
                    <div className="flex justify-center mb-8">
                        <div className={cn(
                            "px-6 py-3 rounded-full font-mono text-2xl font-bold",
                            remainingSecs <= 10 ? "bg-rose-500/20 text-rose-400" : "bg-primary/20 text-primary"
                        )}>
                            {Math.floor(remainingSecs / 60)}:{(remainingSecs % 60).toString().padStart(2, '0')}
                        </div>
                    </div>
                    
                    {/* Slot Assignment Grid */}
                    <div className="grid grid-cols-5 gap-4 mb-8">
                        {['addition', 'subtraction', 'multiplication', 'division', 'mixed'].map((slotOp, idx) => {
                            const op = operationLabels[idx];
                            // Server stores slot as operation name, not number
                            const playerInSlot = Object.entries(strategyPhase.mySlots).find(
                                ([, assignment]) => assignment.slot === slotOp
                            );
                            const [playerId, playerData] = playerInSlot || [null, null];
                            
                            return (
                                <div 
                                    key={slotOp}
                                    className={cn(
                                        "bg-white/5 rounded-xl p-4 border-2 transition-all",
                                        selectedSlotPlayer && isIGL 
                                            ? "border-primary/50 cursor-pointer hover:bg-primary/10" 
                                            : "border-white/10"
                                    )}
                                    onClick={() => {
                                        if (selectedSlotPlayer && isIGL) {
                                            handleSlotChange(selectedSlotPlayer, slotOp);
                                            setSelectedSlotPlayer(null);
                                        }
                                    }}
                                >
                                    {/* Slot Header */}
                                    <div className="text-center mb-3">
                                        <div className="w-12 h-12 mx-auto rounded-xl bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary mb-2">
                                            {operationSymbols[op.toLowerCase()] || '?'}
                                        </div>
                                        <span className="text-xs text-white/50 uppercase tracking-wider">{op}</span>
                                    </div>
                                    
                                    {/* Player in Slot */}
                                    {playerData && (
                                        <div 
                                            className={cn(
                                                "p-3 rounded-lg text-center transition-all",
                                                selectedSlotPlayer === playerId 
                                                    ? "bg-primary/30 ring-2 ring-primary" 
                                                    : "bg-white/10",
                                                isIGL && "cursor-pointer hover:bg-primary/20"
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // #region agent log
                                                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:playerClick',message:'H3: Player clicked in strategy phase',data:{playerId,isIGL,playerDataName:playerData?.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
                                                // #endregion
                                                if (isIGL) {
                                                    setSelectedSlotPlayer(prev => prev === playerId ? null : playerId);
                                                }
                                            }}
                                        >
                                            <span className="font-medium text-white">{playerData.name}</span>
                                            <div className="flex justify-center gap-1 mt-1">
                                                {playerData.isIgl && (
                                                    <span className="px-2 py-0.5 text-xs rounded bg-amber-500/30 text-amber-400">IGL</span>
                                                )}
                                                {playerData.isAnchor && (
                                                    <span className="px-2 py-0.5 text-xs rounded bg-purple-500/30 text-purple-400">Anchor</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Instructions / Confirm Button */}
                    <div className="text-center">
                        {isIGL ? (
                            <>
                                <p className="text-white/50 text-sm mb-4">
                                    {selectedSlotPlayer 
                                        ? 'Click on a slot to move this player' 
                                        : 'Click on a player to select, then click a slot to move them'}
                                </p>
                                <button
                                    onClick={handleConfirmSlots}
                                    disabled={strategyPhase.myTeamReady}
                                    className={cn(
                                        "px-8 py-4 rounded-xl font-bold text-lg transition-all",
                                        strategyPhase.myTeamReady
                                            ? "bg-emerald-500/30 text-emerald-400 cursor-not-allowed"
                                            : "bg-primary text-white hover:bg-primary/80"
                                    )}
                                >
                                    {strategyPhase.myTeamReady ? '✓ Slots Confirmed' : 'Confirm Slots & Ready'}
                                </button>
                            </>
                        ) : (
                            <div className="flex items-center justify-center gap-2 text-white/50">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-white/30 border-t-primary rounded-full"
                                />
                                Waiting for IGL to confirm slots...
                            </div>
                        )}
                    </div>
                    
                    {/* IGL Double Call-In for Round 1 - Can be set up during Strategy Phase */}
                    {isIGL && (
                        <div className="mt-8 max-w-md mx-auto">
                            <IGLControls
                                isIGL={true}
                                half={1}
                                currentRound={0} // Before Round 1 starts
                                usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                                usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                                timeoutsRemaining={timeoutsRemaining}
                                anchorName={anchorName}
                                onDoubleCallin={handleDoubleCallin}
                                onTimeout={() => {
                                    // Timeouts not available during strategy phase
                                }}
                                availableSlots={availableSlots}
                                phase="break" // Use break styling for controls
                            />
                        </div>
                    )}
                    
                    {/* Team Ready Status */}
                    {(strategyPhase.myTeamReady || strategyPhase.opponentTeamReady) && (
                        <div className="mt-6 flex justify-center gap-4">
                            {strategyPhase.myTeamReady && (
                                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
                                    ✓ Your Team Ready
                                </span>
                            )}
                            {strategyPhase.opponentTeamReady && (
                                <span className="px-3 py-1 bg-rose-500/20 text-rose-400 rounded-full text-sm">
                                    ✓ Opponent Ready
                                </span>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/10 to-slate-900 text-white">
            {/* Match Header */}
            <div className="border-b border-white/10 bg-black/40 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        {/* Timer and Round */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10">
                                <Clock className="w-5 h-5 text-primary" />
                                <span className="font-mono font-bold text-xl">
                                    {formatTime(matchState.gameClockMs)}
                                </span>
                            </div>
                            <div className="text-white/60">
                                Round {matchState.round}/4 • {matchState.half === 1 ? '1st' : '2nd'} Half
                            </div>
                        </div>

                        {/* Score Display */}
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-sm text-primary/80">{myTeam?.teamTag ? `[${myTeam.teamTag}]` : ''} {myTeam?.teamName}</p>
                                <p className="text-3xl font-black text-primary">{myTeam?.score || 0}</p>
                            </div>
                            <div className="text-2xl font-bold text-white/30">vs</div>
                            <div className="text-left">
                                <p className="text-sm text-rose-400/80">{opponentTeam?.teamTag ? `[${opponentTeam.teamTag}]` : ''} {opponentTeam?.teamName}</p>
                                <p className="text-3xl font-black text-rose-400">{opponentTeam?.score || 0}</p>
                            </div>
                        </div>

                        {/* Phase indicator & Quit Button */}
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-sm",
                                matchState.phase === 'active' && "bg-emerald-500/20 text-emerald-400",
                                matchState.phase === 'break' && "bg-amber-500/20 text-amber-400",
                                matchState.phase === 'halftime' && "bg-blue-500/20 text-blue-400",
                                matchState.phase === 'post_match' && "bg-purple-500/20 text-purple-400",
                            )}>
                                {matchState.phase === 'active' && 'LIVE'}
                                {matchState.phase === 'break' && 'BREAK'}
                                {matchState.phase === 'halftime' && 'HALFTIME'}
                                {matchState.phase === 'post_match' && 'FINISHED'}
                            </div>
                            
                            {/* Quit Button */}
                            <button
                                onClick={() => setShowQuitConfirm(true)}
                                className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 
                                           text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50 
                                           transition-all"
                                title="Leave Match"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Match Area */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                {matchState.phase === 'active' && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Teammate/My Turn View */}
                        <div className="col-span-8">
                            {isMyTurn && myPlayer?.currentQuestion ? (
                                /* Active Player Input */
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-gradient-to-b from-primary/20 to-slate-900/90 
                                               rounded-2xl border border-primary/30 p-8"
                                >
                                    <div className="text-center mb-8">
                                        <p className="text-sm text-primary/80 mb-2">YOUR TURN</p>
                                        <div className="text-5xl font-black text-white mb-4">
                                            {myPlayer.currentQuestion.question}
                                        </div>
                                        <div className="flex items-center justify-center gap-4">
                                            <span className="text-sm text-white/50">
                                                Q{Math.min((myTeam?.questionsInSlot || 0) + 1, 5)}/5
                                            </span>
                                            {myPlayer.streak > 0 && (
                                                <div className="flex items-center gap-1 text-orange-400">
                                                    <Zap className="w-4 h-4" />
                                                    <span className="font-bold">{myPlayer.streak}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-center">
                                        <div className="relative">
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                value={currentInput}
                                                onChange={(e) => handleInputChange(e.target.value)}
                                                onKeyPress={handleKeyPress}
                                                className="w-64 h-16 text-center text-3xl font-mono font-bold
                                                           bg-white/10 border-2 border-primary/50 rounded-xl
                                                           text-white placeholder-white/30 outline-none
                                                           focus:border-primary focus:bg-white/20
                                                           transition-all"
                                                placeholder="?"
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleSubmit}
                                                disabled={!currentInput.trim()}
                                                className="absolute right-2 top-1/2 -translate-y-1/2
                                                           w-12 h-12 rounded-lg bg-primary text-black
                                                           font-bold disabled:opacity-30 transition-opacity"
                                            >
                                                ↵
                                            </button>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {lastAnswerResult && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -20 }}
                                                className={cn(
                                                    "mt-6 p-4 rounded-xl text-center",
                                                    lastAnswerResult.isCorrect
                                                        ? "bg-emerald-500/20 text-emerald-400"
                                                        : "bg-rose-500/20 text-rose-400"
                                                )}
                                            >
                                                <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                                                    {lastAnswerResult.isCorrect ? (
                                                        <>
                                                            <Check className="w-6 h-6" />
                                                            CORRECT! +{lastAnswerResult.pointsEarned}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <X className="w-6 h-6" />
                                                            WRONG
                                                        </>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ) : activeTeammateId && myTeam?.players[activeTeammateId] ? (
                                /* Teammate Spectator View */
                                <TeammateSpectatorView
                                    activePlayer={myTeam.players[activeTeammateId]}
                                    currentQuestion={myTeam.players[activeTeammateId].currentQuestion || null}
                                    currentInput={teammateTyping?.odUserId === activeTeammateId 
                                        ? teammateTyping.currentInput 
                                        : ''}
                                    slotNumber={myTeam.currentSlot || 1}
                                    questionInSlot={myTeam.questionsInSlot || 0}
                                    totalQuestionsPerSlot={5}
                                    lastAnswerResult={teammateLastAnswerResult}
                                    isCurrentUser={false}
                                />
                            ) : (
                                <div className="bg-white/5 rounded-2xl border border-white/10 p-8 text-center">
                                    <p className="text-white/50">Waiting for next player...</p>
                                </div>
                            )}
                        </div>

                        {/* Opponent Status */}
                        <div className="col-span-4">
                            {opponentTeam && activeOpponent && (
                                <OpponentStatusPanel
                                    teamName={opponentTeam.teamName}
                                    teamTag={opponentTeam.teamTag}
                                    teamScore={opponentTeam.score}
                                    currentStreak={opponentTeam.currentStreak}
                                    activePlayer={activeOpponent}
                                    slotNumber={opponentTeam.currentSlot || 1}
                                    questionInSlot={opponentTeam.questionsInSlot || 0}
                                    totalQuestionsPerSlot={5}
                                    lastAnswerResult={opponentLastResult}
                                    players={Object.values(opponentTeam.players)}
                                />
                            )}
                            
                            {/* Note: Anchor abilities controlled by IGL during breaks per spec */}
                            {/* During active play, relay clock runs continuously - no ability controls */}
                        </div>
                    </div>
                )}

                {/* Break Phase */}
                {matchState.phase === 'break' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-2xl mx-auto text-center py-12"
                    >
                        <Pause className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                        <h2 className="text-3xl font-black mb-2">TACTICAL BREAK</h2>
                        <p className="text-white/60 mb-4">
                            Round {matchState.round} complete
                        </p>
                        
                        {/* Break Countdown Timer */}
                        <div className="text-5xl font-mono font-black text-amber-400 mb-6">
                            {Math.ceil(breakCountdownMs / 1000)}s
                        </div>
                        <p className="text-white/40 text-sm mb-6">
                            Next round starting in...
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                            <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                                <p className="text-sm text-primary/70 mb-1">{myTeam?.teamName}</p>
                                <p className="text-2xl font-black text-primary">{myTeam?.score}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                                <p className="text-sm text-rose-400/70 mb-1">{opponentTeam?.teamName}</p>
                                <p className="text-2xl font-black text-rose-400">{opponentTeam?.score}</p>
                            </div>
                        </div>
                        
                        {/* IGL Controls during break - per spec, IGL controls Anchor abilities */}
                        {isIGL && (
                            <div className="mt-8 max-w-md mx-auto">
                                <IGLControls
                                    isIGL={isIGL}
                                    half={matchState.half}
                                    currentRound={matchState.round}
                                    usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                                    usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                                    timeoutsRemaining={timeoutsRemaining}
                                    anchorName={anchorName}
                                    onDoubleCallin={handleDoubleCallin}
                                    onTimeout={() => {
                                        if (timeoutsRemaining > 0 && socketRef.current) {
                                            socketRef.current.emit('igl_timeout', { matchId, userId: currentUserId });
                                        }
                                    }}
                                    availableSlots={availableSlots}
                                    phase="break"
                                />
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Halftime Phase */}
                {matchState.phase === 'halftime' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-2xl mx-auto text-center py-12"
                    >
                        <div className="text-6xl mb-4">⏱️</div>
                        <h2 className="text-4xl font-black mb-4 bg-gradient-to-r from-primary to-amber-400 
                                       bg-clip-text text-transparent">
                            HALFTIME
                        </h2>
                        
                        {/* Halftime Countdown Timer */}
                        <HalftimeCountdown durationMs={120000} onComplete={() => {
                            // Server will transition to next round automatically
                        }} />
                        
                        <p className="text-white/60 mb-8">
                            Regroup and strategize for the second half
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
                            <div className="p-6 rounded-xl bg-primary/10 border border-primary/30">
                                <p className="text-sm text-primary/70 mb-2">{myTeam?.teamName}</p>
                                <p className="text-4xl font-black text-primary">{myTeam?.score}</p>
                            </div>
                            <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/30">
                                <p className="text-sm text-rose-400/70 mb-2">{opponentTeam?.teamName}</p>
                                <p className="text-4xl font-black text-rose-400">{opponentTeam?.score}</p>
                            </div>
                        </div>
                        
                        {/* IGL Controls during halftime - full strategic control */}
                        {isIGL && (
                            <div className="max-w-md mx-auto mb-4">
                                {/* Current Slot Assignments */}
                                <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
                                    <p className="text-xs text-white/50 mb-3">Current Slot Assignments</p>
                                    <div className="grid grid-cols-5 gap-2">
                                        {myTeam && Object.entries(myTeam.slotAssignments).map(([op, odUserId]) => {
                                            const player = myTeam.players[odUserId];
                                            return (
                                                <div key={op} className="text-center p-2 bg-white/5 rounded">
                                                    <p className="text-lg font-bold text-primary">{operationSymbols[op]}</p>
                                                    <p className="text-xs text-white/60 truncate">{player?.odName || 'Unknown'}</p>
                                                    {player?.isAnchor && <span className="text-[10px] text-purple-400">⚓</span>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                {/* IGL Controls Panel */}
                                <IGLControls
                                    isIGL={isIGL}
                                    half={2} // Halftime is before 2nd half
                                    currentRound={0} // Before first round of 2nd half
                                    usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                                    usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                                    timeoutsRemaining={timeoutsRemaining}
                                    anchorName={anchorName}
                                    onDoubleCallin={handleDoubleCallin}
                                    onTimeout={() => {
                                        if (timeoutsRemaining > 0 && socketRef.current) {
                                            socketRef.current.emit('igl_timeout', { matchId, userId: currentUserId });
                                        }
                                    }}
                                    availableSlots={availableSlots}
                                    phase="halftime"
                                />
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Post Match */}
                {matchState.phase === 'post_match' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-2xl mx-auto text-center py-12"
                    >
                        <Trophy className="w-20 h-20 text-amber-400 mx-auto mb-4" />
                        <h2 className="text-4xl font-black mb-4">MATCH COMPLETE</h2>
                        <p className="text-white/60 mb-8">
                            Calculating results...
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                            <div className={cn(
                                "p-6 rounded-xl border",
                                (myTeam?.score || 0) > (opponentTeam?.score || 0)
                                    ? "bg-emerald-500/10 border-emerald-500/30"
                                    : "bg-white/5 border-white/10"
                            )}>
                                <p className="text-sm text-white/70 mb-2">{myTeam?.teamName}</p>
                                <p className="text-4xl font-black">{myTeam?.score}</p>
                                {(myTeam?.score || 0) > (opponentTeam?.score || 0) && (
                                    <span className="text-emerald-400 text-sm font-bold">WINNER</span>
                                )}
                            </div>
                            <div className={cn(
                                "p-6 rounded-xl border",
                                (opponentTeam?.score || 0) > (myTeam?.score || 0)
                                    ? "bg-emerald-500/10 border-emerald-500/30"
                                    : "bg-white/5 border-white/10"
                            )}>
                                <p className="text-sm text-white/70 mb-2">{opponentTeam?.teamName}</p>
                                <p className="text-4xl font-black">{opponentTeam?.score}</p>
                                {(opponentTeam?.score || 0) > (myTeam?.score || 0) && (
                                    <span className="text-emerald-400 text-sm font-bold">WINNER</span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Relay Progress */}
                {matchState.phase === 'active' && myTeam && (
                    <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
                            Relay Progress
                        </p>
                        <div className="flex items-center justify-center gap-2">
                            {Object.entries(myTeam.slotAssignments).map(([op, userId], i) => {
                                const player = myTeam.players[userId];
                                // Use team-specific currentSlot for accurate relay progress
                                const teamCurrentSlot = myTeam.currentSlot || 1;
                                const isCurrentSlot = i + 1 === teamCurrentSlot;
                                const isComplete = i + 1 < teamCurrentSlot;
                                
                                return (
                                    <div key={op} className="flex items-center gap-2">
                                        <div className={cn(
                                            "flex flex-col items-center p-3 rounded-lg transition-all",
                                            isCurrentSlot && "bg-primary/20 border border-primary/30",
                                            isComplete && "bg-emerald-500/10",
                                            !isCurrentSlot && !isComplete && "bg-white/5"
                                        )}>
                                            <div className={cn(
                                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                                "text-xl font-bold mb-1",
                                                isCurrentSlot && "bg-primary text-black",
                                                isComplete && "bg-emerald-500/20 text-emerald-400",
                                                !isCurrentSlot && !isComplete && "bg-white/10 text-white/50"
                                            )}>
                                                {isComplete ? <Check className="w-5 h-5" /> : operationSymbols[op]}
                                            </div>
                                            <span className="text-xs text-white/60 truncate max-w-[60px]">
                                                {player?.odName}
                                            </span>
                                        </div>
                                        {i < 4 && (
                                            <div className={cn(
                                                "w-6 h-0.5",
                                                isComplete ? "bg-emerald-500" : "bg-white/20"
                                            )} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            
            {/* Quit Confirmation Modal (Leader initiates vote) */}
            <AnimatePresence>
                {showQuitConfirm && !quitVote?.active && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowQuitConfirm(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-rose-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">
                                        {isPartyLeader ? 'Start Quit Vote?' : 'Leave Match?'}
                                    </h3>
                                    <p className="text-white/60 text-sm">
                                        {isPartyLeader 
                                            ? 'Your team will vote on leaving' 
                                            : 'Only the party leader can start a vote'}
                                    </p>
                                </div>
                            </div>
                            
                            {isPartyLeader ? (
                                <>
                                    <p className="text-white/70 mb-6">
                                        As party leader, you can start a quit vote. Your team will have 30 seconds 
                                        to vote. If the majority votes to quit, your team will forfeit the match.
                                    </p>
                                    
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowQuitConfirm(false)}
                                            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white 
                                                       hover:bg-white/20 transition-colors font-medium"
                                        >
                                            Stay in Match
                                        </button>
                                        <button
                                            onClick={handleInitiateQuitVote}
                                            className="flex-1 px-4 py-3 rounded-xl bg-amber-600 text-white 
                                                       hover:bg-amber-700 transition-colors font-medium
                                                       flex items-center justify-center gap-2"
                                        >
                                            <AlertCircle className="w-4 h-4" />
                                            Start Vote
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-white/70 mb-6">
                                        Only the party leader can initiate a quit vote. Ask your leader if you 
                                        want to leave the match early.
                                    </p>
                                    
                                    <button
                                        onClick={() => setShowQuitConfirm(false)}
                                        className="w-full px-4 py-3 rounded-xl bg-white/10 text-white 
                                                   hover:bg-white/20 transition-colors font-medium"
                                    >
                                        Okay
                                    </button>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Active Quit Vote Modal */}
            <AnimatePresence>
                {quitVote?.active && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 max-w-md w-full mx-4"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Quit Vote</h3>
                                        <p className="text-white/60 text-sm">
                                            Started by {quitVote.initiatorName}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-2xl font-mono font-bold text-amber-400">
                                    {voteTimeRemaining}s
                                </div>
                            </div>
                            
                            <p className="text-white/70 mb-6">
                                Should your team forfeit this match? Majority vote wins.
                            </p>
                            
                            {/* Vote Status */}
                            <div className="space-y-2 mb-6">
                                {myTeam && Object.entries(quitVote.votes).map(([odUserId, vote]) => {
                                    const player = myTeam.players[odUserId];
                                    return (
                                        <div 
                                            key={odUserId}
                                            className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/5"
                                        >
                                            <span className="text-white/80">{player?.odName || 'Unknown'}</span>
                                            <span className={cn(
                                                "font-bold text-sm",
                                                vote === 'yes' && "text-rose-400",
                                                vote === 'no' && "text-emerald-400",
                                                vote === null && "text-white/40"
                                            )}>
                                                {vote === 'yes' ? 'QUIT' : vote === 'no' ? 'STAY' : 'Voting...'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* Voting Buttons (if haven't voted) */}
                            {!hasVoted && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleCastVote('no')}
                                        className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white 
                                                   hover:bg-emerald-700 transition-colors font-medium
                                                   flex items-center justify-center gap-2"
                                    >
                                        <Check className="w-4 h-4" />
                                        Stay
                                    </button>
                                    <button
                                        onClick={() => handleCastVote('yes')}
                                        className="flex-1 px-4 py-3 rounded-xl bg-rose-600 text-white 
                                                   hover:bg-rose-700 transition-colors font-medium
                                                   flex items-center justify-center gap-2"
                                    >
                                        <X className="w-4 h-4" />
                                        Quit
                                    </button>
                                </div>
                            )}
                            
                            {hasVoted && (
                                <p className="text-center text-white/60">
                                    Waiting for other votes...
                                </p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Quit Vote Result Modal */}
            <AnimatePresence>
                {quitVote && !quitVote.active && quitVote.result && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={cn(
                                "border rounded-2xl p-6 max-w-md w-full mx-4 text-center",
                                quitVote.result === 'quit' 
                                    ? "bg-rose-900/50 border-rose-500/30" 
                                    : "bg-emerald-900/50 border-emerald-500/30"
                            )}
                        >
                            <div className="text-6xl mb-4">
                                {quitVote.result === 'quit' ? '🏳️' : '💪'}
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">
                                {quitVote.result === 'quit' ? 'Vote Passed' : 'Vote Failed'}
                            </h3>
                            <p className="text-white/70">
                                {quitVote.result === 'quit' 
                                    ? 'Your team is leaving the match...' 
                                    : 'The match continues!'}
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


