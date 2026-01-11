'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockMatchSimulator, type MatchPhase } from '@/lib/arena/mock-match-state';
import {
    Clock, Crown, Anchor, Zap, Check, X,
    Pause, Play, AlertCircle, Trophy, LogOut, ArrowLeft, Target,
    Maximize, Minimize
} from 'lucide-react';
import {
    TeammateSpectatorView,
    OpponentStatusPanel,
    LiveTypingIndicator,
    AnswerResultToast,
    AnchorAbilities,
    IGLFAB,
    PlayerStatsCards,
    TeamPlayerCard,
    TeamPlayerGrid,
    VSScreenBackground,
    AnimatedVSText,
    TeamBannerHeader,
    BANNER_STYLES
} from '@/components/arena/teams';
import {
    RelayProgressBar,
    HalftimePanel,
    TacticalBreakPanel,
    QuestionAnswerCard,
    QuestionCardSpectator,
    RoundStartCountdown,
    RelayHandoff,
    type SlotProgress,
    type PlayerHalftimeStats,
    type RoundMVP,
    type RoundInsight,
} from '@/components/arena/teams/match';

interface TeamMatchClientProps {
    matchId: string;
    currentUserId: string;
    currentUserName: string;
    partyId?: string;  // Required for PvP matches - used to look up match data in Redis
}

interface PlayerState {
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string | null;
    odEquippedBanner: string | null;
    odEquippedTitle: string | null;
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
    level: number;
    isIgl: boolean;
    isAnchor: boolean;
    // Cosmetics for banner display
    banner: string;
    frame: string;
    title: string;
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

const operations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
const SLOT_LABELS = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Mixed'];

/**
 * Resolve banner ID to style key for BANNER_STYLES lookup
 */
function resolveBannerStyle(bannerId: string | null | undefined): string {
    if (!bannerId || bannerId === 'default') return 'default';
    if (BANNER_STYLES[bannerId]) return bannerId;

    // Remove "banner_" or "banner-" prefix
    let styleKey = bannerId.replace(/^banner[_-]?/i, '').replace(/-/g, '_');
    if (BANNER_STYLES[styleKey]) return styleKey;

    // Try without underscores
    styleKey = styleKey.replace(/_/g, '');
    if (BANNER_STYLES[styleKey]) return styleKey;

    return 'default';
}

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
    partyId,
}: TeamMatchClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    // Also check URL for partyId (fallback if not passed as prop)
    const effectivePartyId = partyId || searchParams.get('partyId') || undefined;
    // #region agent log - H8_MOUNT: Track partyId sources at component mount
    if (typeof window !== 'undefined') {
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:MOUNT_PARTYID',message:'Component mounting - partyId sources',data:{partyIdProp:partyId||'UNDEFINED',searchParamsPartyId:searchParams.get('partyId')||'NULL',effectivePartyId:effectivePartyId||'UNDEFINED',fullUrl:window.location.href,matchId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H8_MOUNT'})}).catch(()=>{});
    }
    // #endregion
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mockSimulatorRef = useRef<MockMatchSimulator | null>(null);
    const myTeamIdRef = useRef<string | null>(null); // To avoid stale closures in socket handlers
    
    // Check if this is demo mode (supports both ?demo=true and ?demoMode=true)
    const isDemoMode = (searchParams.get('demo') === 'true' || searchParams.get('demoMode') === 'true') && 
                      process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
    
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
    const [phaseInitialDuration, setPhaseInitialDuration] = useState(0); // Initial duration when phase starts
    const lastPhaseRef = useRef<string | null>(null);
    
    // Round start countdown state
    const [showRoundCountdown, setShowRoundCountdown] = useState(false);
    const [roundCountdownSeconds, setRoundCountdownSeconds] = useState(5);

    // Pre-match (versus screen) countdown state
    const [preMatchCountdownMs, setPreMatchCountdownMs] = useState<number | null>(null);
    
    // Relay handoff state (between teammates)
    const [relayHandoff, setRelayHandoff] = useState<{
        isVisible: boolean;
        outgoingPlayer: { name: string; operation: string; questionsAnswered: number; correctAnswers: number; slotScore: number } | null;
        incomingPlayer: { name: string; operation: string; isCurrentUser: boolean } | null;
        slotNumber: number;
    }>({ isVisible: false, outgoingPlayer: null, incomingPlayer: null, slotNumber: 0 });
    const previousSlotRef = useRef<number | null>(null);
    
    // Strategy phase state (slot assignment before match starts)
    const [strategyPhase, setStrategyPhase] = useState<StrategyPhaseState | null>(null);
    const [selectedSlotPlayer, setSelectedSlotPlayer] = useState<string | null>(null);

    // Fullscreen state
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Track fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        setIsFullscreen(!!document.fullscreenElement);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Toggle fullscreen
    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if ((elem as any).webkitRequestFullscreen) {
                    await (elem as any).webkitRequestFullscreen();
                }
            }
        } catch (err) {
            console.log('[TeamMatch] Fullscreen toggle failed:', err);
        }
    }, []);

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
    // targetRound: which round the Double Call-In applies to
    // targetSlot: operation name (e.g., "addition", "multiplication")
    const handleDoubleCallin = useCallback((targetRound: number, targetSlot: string) => {
        // In demo mode, just update local state
        if (isDemoMode) {
            console.log('[TeamMatch] Demo: Double Call-In set for round', targetRound, 'slot', targetSlot);
            if (matchState?.half === 1) {
                setUsedDoubleCallinHalf1(true);
            } else {
                setUsedDoubleCallinHalf2(true);
            }
            return;
        }
        
        if (!socketRef.current?.connected || !matchState) return;
        
        // Check if already used this half
        const usedThisHalf = matchState.half === 1 ? usedDoubleCallinHalf1 : usedDoubleCallinHalf2;
        if (usedThisHalf) return;
        
        // Convert slot name to slot number
        const slotNumber = operations.indexOf(targetSlot.toLowerCase()) + 1;
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:handleDoubleCallin',message:'DC-H1: Client emitting anchor_callin',data:{matchId,userId:currentUserId,targetRound,targetSlot,slotNumber,half:matchState.half,phase:matchState.phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'DC-H1'})}).catch(()=>{});
        // #endregion
        
        console.log('[TeamMatch] IGL activating Double Call-In for round:', targetRound, 'slot:', targetSlot, 'Half:', matchState.half, 'UserId:', currentUserId);
        socketRef.current.emit('anchor_callin', { 
            matchId, 
            userId: currentUserId,  // CRITICAL: Server needs userId to verify IGL
            targetRound,
            targetSlot: slotNumber, 
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
    // Find my player - in demo mode, we're the first player on team1
    const myPlayerId = isDemoMode ? 'team-alpha-player-1' : currentUserId;
    const myPlayer = myTeam?.players[myPlayerId];
    
    // isMyTurn is ONLY true when I am the active player (my slot is up)
    const isMyTurn = myPlayer?.isActive === true;
    
    // Get my question (only when it's my turn)
    const myPlayerQuestion = isMyTurn ? myPlayer?.currentQuestion : null;
    const activeTeammateId = myTeam 
        ? Object.values(myTeam.players).find(p => p.isActive)?.odUserId 
        : null;
    const activeOpponent = opponentTeam
        ? Object.values(opponentTeam.players).find(p => p.isActive)
        : null;
    
    // Check if current user is the party leader (can initiate quit votes)
    const isPartyLeader = myTeam?.leaderId === currentUserId;
    
    // Check if the current user is the only human player on the team (rest are AI teammates)
    // AI teammates have IDs starting with 'ai_teammate_'
    const humanTeammates = myTeam 
        ? Object.keys(myTeam.players).filter(id => !id.startsWith('ai_teammate_'))
        : [];
    const isSoloHumanWithAI = humanTeammates.length === 1 && humanTeammates[0] === currentUserId;
    
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

    // Force fullscreen when entering arena match
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                const elem = document.documentElement;
                if (elem.requestFullscreen && !document.fullscreenElement) {
                    await elem.requestFullscreen();
                } else if ((elem as any).webkitRequestFullscreen && !(document as any).webkitFullscreenElement) {
                    await (elem as any).webkitRequestFullscreen();
                } else if ((elem as any).msRequestFullscreen && !(document as any).msFullscreenElement) {
                    await (elem as any).msRequestFullscreen();
                }
            } catch (err) {
                console.log('[Arena] Fullscreen request failed or denied:', err);
            }
        };

        // Small delay to ensure page is ready
        const timer = setTimeout(enterFullscreen, 500);

        // Exit fullscreen when leaving the match page
        return () => {
            clearTimeout(timer);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        };
    }, []);

    // Connect to socket OR initialize demo mode
    useEffect(() => {
        if (isDemoMode) {
            // Demo Mode: Use MockMatchSimulator instead of Socket.io
            console.log('[TeamMatch] Demo mode enabled - using MockMatchSimulator');
            mockSimulatorRef.current = new MockMatchSimulator();
            setConnected(true);
            
            // Convert mock state to match state format
            // MockMatchSimulator returns team1/team2 objects directly, so we just pass them through
            const convertMockToMatchState = (mockState: any): MatchState => {
                return {
                    matchId: mockState.matchId,
                    phase: mockState.phase,
                    round: mockState.round,
                    half: mockState.half,
                    gameClockMs: mockState.gameClockMs,
                    relayClockMs: mockState.relayClockMs,
                    currentSlot: mockState.currentSlot,
                    questionsInSlot: mockState.questionsInSlot,
                    team1: mockState.team1,
                    team2: mockState.team2,
                    isMyTeam: mockState.isMyTeam,
                };
            };
            
            // Update strategy phase state from mock
            const updateStrategyPhase = () => {
                if (!mockSimulatorRef.current) return;
                const strategyData = mockSimulatorRef.current.getStrategyPhase();
                if (strategyData) {
                    setStrategyPhase({
                        durationMs: strategyData.durationMs,
                        remainingMs: strategyData.remainingMs,
                        mySlots: strategyData.mySlots,
                        opponentSlots: strategyData.opponentSlots,
                        myTeamReady: strategyData.myTeamReady,
                        opponentTeamReady: strategyData.opponentTeamReady,
                    });
                } else {
                    setStrategyPhase(null);
                }
            };
            
            // Set initial mock state
            const initialMockState = mockSimulatorRef.current.getState();
            setMatchState(convertMockToMatchState(initialMockState));
            updateStrategyPhase();
            
            // Simulate time progression
            const interval = setInterval(() => {
                if (mockSimulatorRef.current) {
                    mockSimulatorRef.current.advanceTime(1000);
                    const newMockState = mockSimulatorRef.current.getState();
                    setMatchState(convertMockToMatchState(newMockState));
                    updateStrategyPhase();
                }
            }, 1000);
            
            return () => clearInterval(interval);
        }
        
        // Normal Socket.io connection
        const socket = io('/arena/teams', {
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[TeamMatch] Connected to socket');
            setConnected(true);

            // Join the match - include partyId for PvP match lookup from Redis
            // #region agent log - H5/H6/H7: Track join_team_match emission
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:join_team_match',message:'Emitting join_team_match - SOCKET CONNECT',data:{matchId,userId:currentUserId?.slice(-8),effectivePartyId:effectivePartyId||'UNDEFINED',hasPartyId:!!effectivePartyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H8_EMIT'})}).catch(()=>{});
            // #endregion
            console.log('[TeamMatch] Emitting join_team_match with effectivePartyId:', effectivePartyId || 'UNDEFINED');
            socket.emit('join_team_match', {
                matchId,
                userId: currentUserId,
                partyId: effectivePartyId,  // CRITICAL: Server needs this for PvP match lookup
            });
        });

        socket.on('match_state', (state: MatchState) => {
            console.log('[TeamMatch] Received match state:', state);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:match_state',message:'H1A/H2A: match_state received',data:{phase:state.phase,gameClockMs:state.gameClockMs,relayClockMs:state.relayClockMs,currentSlot:state.currentSlot,questionsInSlot:state.questionsInSlot,round:state.round,half:state.half},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1A,H2A'})}).catch(()=>{});
            // #endregion
            // Store myTeamId in ref to avoid stale closures in other handlers
            myTeamIdRef.current = state.isMyTeam;
            setMatchState(state);
        });

        // PRE-MATCH COUNTDOWN: 15-second versus screen timer
        socket.on('pre_match_countdown_start', (data: { durationMs: number; endsAt: number }) => {
            console.log('[TeamMatch] Pre-match countdown started:', data);
            setPreMatchCountdownMs(data.durationMs);
        });

        socket.on('pre_match_countdown_tick', (data: { remainingMs: number }) => {
            setPreMatchCountdownMs(data.remainingMs);
        });

        // STRATEGY PHASE: IGL slot assignment before match starts
        socket.on('strategy_phase_start', (data) => {
            console.log('[TeamMatch] Strategy phase started:', data);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-match-client.tsx:strategy_phase_start',message:'Strategy phase started',data:{durationMs:data.durationMs,myTeamSlots:Object.keys(data.team1Slots || data.team2Slots || {}).length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'STRATEGY'})}).catch(()=>{});
            // #endregion
            
            // Determine which team is mine by checking if currentUserId is in team1Slots or team2Slots
            // This avoids stale closure issues with matchState
            const team1PlayerIds = Object.keys(data.team1Slots || {});
            const team2PlayerIds = Object.keys(data.team2Slots || {});
            const isTeam1 = team1PlayerIds.includes(currentUserId);
            console.log('[TeamMatch] Strategy: currentUserId:', currentUserId, 'isTeam1:', isTeam1, 'team1Players:', team1PlayerIds, 'team2Players:', team2PlayerIds);
            
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
        
        socket.on('slot_assignments_updated', (data: { slots: Record<string, string>, teamId?: string }) => {
            console.log('[TeamMatch] Slot assignments updated:', data);
            // Update strategy phase slots
            setStrategyPhase(prev => prev ? { ...prev, mySlots: data.slots } : prev);
            
            // Also update matchState player slots AND slotAssignments (for halftime changes)
            setMatchState(prev => {
                if (!prev || !prev.team1) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                
                // Determine which team this is for (use teamId if provided, otherwise check players)
                const isTeam1 = data.teamId 
                    ? data.teamId === newState.team1.teamId
                    : Object.values(data.slots).some(pid => newState.team1.players[pid]);
                const targetTeam = isTeam1 ? newState.team1 : newState.team2;
                
                // Update the slotAssignments object on the team
                targetTeam.slotAssignments = data.slots;
                
                // Update player slots based on new assignments
                // slots is { operation: playerId } mapping
                for (const [operation, playerId] of Object.entries(data.slots)) {
                    if (targetTeam.players[playerId]) {
                        targetTeam.players[playerId].slot = operation;
                    }
                }
                
                return newState;
            });
        });
        
        // Handle opponent team slot updates (when opponent IGL reassigns their players)
        socket.on('opponent_slots_updated', (data: { slots: Record<string, string>, teamId: string }) => {
            console.log('[TeamMatch] Opponent slots updated:', data);
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                
                // Update opponent team's slotAssignments
                const isTeam1 = data.teamId === newState.team1.teamId;
                const targetTeam = isTeam1 ? newState.team1 : newState.team2;
                
                // Update the slotAssignments object on the opponent team
                targetTeam.slotAssignments = data.slots;
                
                // Update player slots based on new assignments
                for (const [operation, playerId] of Object.entries(data.slots)) {
                    if (targetTeam.players[playerId]) {
                        targetTeam.players[playerId].slot = operation;
                    }
                }
                
                return newState;
            });
        });
        
        socket.on('team_ready', (data) => {
            console.log('[TeamMatch] Team ready:', data);
            // Use ref to avoid stale closure with matchState
            const isMyTeam = data.teamId === myTeamIdRef.current;
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

        // Opponent slot change - updates opponent team's relay position
        socket.on('opponent_slot_change', (data: {
            teamId: string;
            currentSlot: number;
            activePlayerId?: string;
            activePlayerName?: string;
        }) => {
            console.log('[TeamMatch] Opponent slot change:', data);
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                
                // Update the opponent team's slot
                if (data.teamId === newState.team1.teamId) {
                    newState.team1.currentSlot = data.currentSlot;
                    newState.team1.questionsInSlot = 0;
                    // Update active player
                    for (const playerId of Object.keys(newState.team1.players)) {
                        newState.team1.players[playerId].isActive = playerId === data.activePlayerId;
                    }
                } else if (data.teamId === newState.team2.teamId) {
                    newState.team2.currentSlot = data.currentSlot;
                    newState.team2.questionsInSlot = 0;
                    // Update active player
                    for (const playerId of Object.keys(newState.team2.players)) {
                        newState.team2.players[playerId].isActive = playerId === data.activePlayerId;
                    }
                }
                return newState;
            });
        });

        socket.on('handoff_countdown', (data: {
            nextPlayerId: string;
            nextPlayerName: string;
            slotNumber: number;
            operation: string;
            countdownMs: number;
            previousPlayerId?: string;
            previousPlayerName?: string;
            previousPlayerStats?: { correct: number; total: number; score: number };
        }) => {
            console.log('[TeamMatch] Handoff countdown:', data);
            
            // Show RelayHandoff UI if this is for the current user
            const isMyTurn = data.nextPlayerId === currentUserId;
            
            if (isMyTurn && data.previousPlayerId && data.previousPlayerStats) {
                setRelayHandoff({
                    isVisible: true,
                    outgoingPlayer: {
                        name: data.previousPlayerName || 'Teammate',
                        operation: SLOT_LABELS[data.slotNumber - 2] || 'Unknown', // Previous slot
                        questionsAnswered: data.previousPlayerStats.total || 5,
                        correctAnswers: data.previousPlayerStats.correct || 0,
                        slotScore: data.previousPlayerStats.score || 0,
                    },
                    incomingPlayer: {
                        name: data.nextPlayerName,
                        operation: data.operation,
                        isCurrentUser: true,
                    },
                    slotNumber: data.slotNumber - 1,
                });
                
                // Auto-hide after countdown completes
                setTimeout(() => {
                    setRelayHandoff(prev => ({ ...prev, isVisible: false }));
                }, data.countdownMs || 2500);
            }
        });

        socket.on('round_break', (data) => {
            console.log('[TeamMatch] Round break:', data);
            setBreakCountdownMs(data.breakDurationMs || 10000); // Default 10 seconds
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'break' };
            });
        });

        // Break timer tick updates
        socket.on('break_time_update', (data: { remainingMs: number }) => {
            setBreakCountdownMs(data.remainingMs);
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, relayClockMs: data.remainingMs };
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
            setBreakCountdownMs(data.halftimeDurationMs || 120000); // Default 2 minutes
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, phase: 'halftime' };
            });
        });

        // Halftime timer tick updates
        socket.on('halftime_time_update', (data: { remainingMs: number }) => {
            setBreakCountdownMs(data.remainingMs);
            setMatchState(prev => {
                if (!prev) return prev;
                return { ...prev, relayClockMs: data.remainingMs };
            });
        });

        // Team ready for next round (during break/halftime)
        socket.on('team_ready_for_next', (data: { teamId: string; phase: string }) => {
            console.log('[TeamMatch] Team ready for next:', data);
            // Could show a visual indicator that the other team is ready
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
            
            // Show a toast notification
            toast.success('Double Call-In Activated!', {
                description: `${data.anchorName} will take over ${data.targetSlot} slot from ${data.benchedPlayerName} in Round ${data.forRound}`,
                duration: 5000,
            });
        });
        
        socket.on('double_callin_success', (data) => {
            console.log('[TeamMatch] Double Call-In Success:', data.message);
        });

        // Server sends round_countdown before round_start
        socket.on('round_countdown', (data: {
            round: number;
            half: number;
            countdownMs: number;
            team1Name: string;
            team2Name: string;
        }) => {
            console.log('[TeamMatch] Round countdown:', data);
            setShowRoundCountdown(true);
            setRoundCountdownSeconds(Math.ceil(data.countdownMs / 1000));
            setMatchState(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    phase: 'round_countdown',
                    round: data.round,
                    half: data.half,
                };
            });
        });

        // Round countdown tick updates (5, 4, 3, 2, 1, GO!)
        socket.on('round_countdown_tick', (data: {
            round: number;
            half: number;
            remainingMs: number;
            secondsRemaining: number;
            displayText: string;
        }) => {
            setRoundCountdownSeconds(data.secondsRemaining);
            // When countdown reaches 0 (GO!), hide the countdown after a short delay
            if (data.secondsRemaining === 0) {
                setTimeout(() => setShowRoundCountdown(false), 500);
            }
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
            
            // Redirect faster for instant leave (solo human with AI)
            const redirectDelay = data.instantLeave ? 2000 : 5000;
            setTimeout(() => {
                router.push('/arena/teams/setup?mode=5v5&fromForfeit=true');
            }, redirectDelay);
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

    // Capture initial duration when phase changes (for countdown timers)
    useEffect(() => {
        if (!matchState?.phase) return;
        
        // Only capture when phase actually changes
        if (lastPhaseRef.current !== matchState.phase) {
            lastPhaseRef.current = matchState.phase;
            
            // Set initial duration based on phase
            if (matchState.phase === 'break' || matchState.phase === 'halftime' || 
                matchState.phase === 'strategy' || matchState.phase === 'pre_match' ||
                matchState.phase === 'round_countdown') {
                setPhaseInitialDuration(matchState.relayClockMs || 0);
            }
            
            // Show round start countdown when entering round_countdown phase
            if (matchState.phase === 'round_countdown') {
                setShowRoundCountdown(true);
            } else {
                setShowRoundCountdown(false);
            }
        }
    }, [matchState?.phase, matchState?.relayClockMs]);
    
    // Detect slot changes to trigger relay handoff animation
    useEffect(() => {
        if (!matchState || matchState.phase !== 'active' || !myTeam) return;
        
        const currentSlot = myTeam.currentSlot;
        
        // Detect slot change
        if (previousSlotRef.current !== null && previousSlotRef.current !== currentSlot && currentSlot > 1) {
            // Get outgoing and incoming player info
            const players = Object.values(myTeam.players);
            const outgoingPlayerData = players.find(p => p.slot?.toLowerCase().includes(SLOT_LABELS[previousSlotRef.current - 1]?.toLowerCase()));
            const incomingPlayerData = players.find(p => p.slot?.toLowerCase().includes(SLOT_LABELS[currentSlot - 1]?.toLowerCase()));
            
            if (outgoingPlayerData && incomingPlayerData) {
                setRelayHandoff({
                    isVisible: true,
                    outgoingPlayer: {
                        name: outgoingPlayerData.odName,
                        operation: outgoingPlayerData.slot || 'Unknown',
                        questionsAnswered: outgoingPlayerData.total || 5,
                        correctAnswers: outgoingPlayerData.correct || 0,
                        slotScore: outgoingPlayerData.score || 0,
                    },
                    incomingPlayer: {
                        name: incomingPlayerData.odName,
                        operation: incomingPlayerData.slot || 'Unknown',
                        isCurrentUser: incomingPlayerData.odUserId === currentUserId,
                    },
                    slotNumber: previousSlotRef.current,
                });
                
                // Auto-hide after animation completes (2.5s - quick READY-SET-GO)
                setTimeout(() => {
                    setRelayHandoff(prev => ({ ...prev, isVisible: false }));
                }, 2500);
            }
        }
        
        previousSlotRef.current = currentSlot;
    }, [matchState?.phase, myTeam?.currentSlot, myTeam, currentUserId]);

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
    const handleSubmit = useCallback((answer?: string) => {
        const answerToSubmit = answer?.trim() || currentInput.trim();
        if (!answerToSubmit || !isMyTurn) return;
        
        // For demo mode, simulate answer result
        if (isDemoMode && mockSimulatorRef.current) {
            const result = mockSimulatorRef.current.submitAnswer(answerToSubmit);
            setLastAnswerResult({
                isCorrect: result.correct,
                pointsEarned: result.points,
                correctAnswer: undefined,
            });
            // Clear result after delay
            setTimeout(() => setLastAnswerResult(null), 1500);
            setCurrentInput('');
            return;
        }
        
        if (!socketRef.current) return;
        socketRef.current.emit('submit_answer', {
            matchId,
            userId: currentUserId,
            answer: answerToSubmit,
        });
        setCurrentInput('');
    }, [matchId, currentUserId, currentInput, isMyTurn, isDemoMode]);

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
            <div className="h-screen overflow-hidden no-scrollbar bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 mx-auto mb-4 border-4 border-primary/30 
                                   border-t-primary rounded-full"
                    />
                    <p className="text-white/60 mb-6">Connecting to match...</p>
                    
                    {/* Cancel / Back button for when stuck connecting */}
                    <button
                        onClick={() => router.push('/arena/teams/setup?mode=5v5&fromQueue=true')}
                        className="px-6 py-2 rounded-lg bg-white/5 hover:bg-white/10 
                                   border border-white/10 text-white/60 hover:text-white/80
                                   font-medium transition-colors flex items-center gap-2 mx-auto"
                    >
                        <X className="w-4 h-4" />
                        Cancel & Return to Setup
                    </button>
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
        
        // Convert players to TeamPlayerCard format
        // Sort by operation order (addition, subtraction, multiplication, division, mixed)
        const myTeamPlayers = myTeam ? Object.entries(myTeam.slotAssignments || {})
            .sort(([opA], [opB]) => operations.indexOf(opA) - operations.indexOf(opB))
            .map(([op, userId]) => {
            const player = myTeam.players[userId];
            return {
                odUserId: userId,
                name: player?.odName || 'Unknown',
                level: player?.odLevel || 1,
                banner: player?.odEquippedBanner || 'default',
                frame: player?.odEquippedFrame || 'default',
                title: player?.odEquippedTitle || 'Player',
                isIgl: player?.isIgl || false,
                isAnchor: player?.isAnchor || false,
                slot: op,
                isActive: !!player?.odUserId,
            };
        }) : [];
        
        // Sort opponent players by operation order as well
        const opponentPlayers = opponentTeam ? Object.entries(opponentTeam.slotAssignments || {})
            .sort(([opA], [opB]) => operations.indexOf(opA) - operations.indexOf(opB))
            .map(([op, userId]) => {
            const player = opponentTeam.players[userId];
            return {
                odUserId: userId,
                name: player?.odName || 'Unknown',
                level: player?.odLevel || 1,
                banner: player?.odEquippedBanner || 'default',
                frame: player?.odEquippedFrame || 'default',
                title: isAIMatch ? 'AI Bot' : (player?.odEquippedTitle || 'Player'),
                isIgl: player?.isIgl || false,
                isAnchor: player?.isAnchor || false,
                slot: op,
                isActive: isAIMatch || !!player?.odUserId,
            };
        }) : [];
        
        return (
            <VSScreenBackground variant="versus">
                <div className="h-screen overflow-hidden no-scrollbar flex flex-col">
                    {/* Header - MATCH STARTS IN countdown */}
                    <motion.div
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-3"
                    >
                        <h1 className="text-xl md:text-2xl font-black italic text-white/90 tracking-wide mb-1">
                            MATCH STARTS IN...
                        </h1>
                        {preMatchCountdownMs !== null ? (
                            <motion.div
                                key={Math.ceil(preMatchCountdownMs / 1000)}
                                initial={{ scale: 1.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="relative"
                            >
                                <span className="text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
                                    {Math.ceil(preMatchCountdownMs / 1000)}
                                </span>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-white/40 text-xs mt-1"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                        className="w-3 h-3 border-2 border-white/30 border-t-white/80 rounded-full"
                                    />
                                    Waiting for players...
                                </span>
                            </motion.div>
                        )}
                    </motion.div>

                    {/* Teams Display - Stacked Close Together */}
                    <div className="flex-1 flex flex-col justify-center px-3 md:px-6">
                        <div className="max-w-6xl mx-auto w-full space-y-3">
                            {/* Your Team Container */}
                            <motion.div
                                initial={{ opacity: 0, y: -30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="relative"
                            >
                                {/* Team container with cyan border */}
                                <div className="rounded-xl border-2 border-cyan-500/60 bg-gradient-to-b from-cyan-950/30 to-slate-900/80 p-3 backdrop-blur-sm">
                                    {/* Team Name Badge */}
                                    <div className="absolute -top-3 left-4 z-10">
                                        <div className="px-4 py-1 rounded-full bg-gradient-to-r from-cyan-600 to-cyan-500 text-white text-sm font-bold uppercase tracking-wider shadow-lg">
                                            {myTeam?.teamTag ? `[${myTeam.teamTag}] ` : ''}{myTeam?.teamName || 'Team Alpha'}
                                        </div>
                                    </div>

                                    {/* Players Grid */}
                                    <div className="grid grid-cols-5 gap-2 mt-3">
                                        {myTeamPlayers.map((player, idx) => (
                                            <TeamPlayerCard
                                                key={player.odUserId}
                                                {...player}
                                                showSlot={true}
                                                variant="minimal"
                                                index={idx}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>

                            {/* Opponent Team Container */}
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="relative"
                            >
                                {/* Team container with magenta/pink border */}
                                <div className="rounded-xl border-2 border-pink-500/60 bg-gradient-to-b from-pink-950/30 to-slate-900/80 p-3 backdrop-blur-sm">
                                    {/* Team Name Badge */}
                                    <div className="absolute -top-3 left-4 z-10">
                                        <div className="px-4 py-1 rounded-full bg-gradient-to-r from-pink-600 to-pink-500 text-white text-sm font-bold uppercase tracking-wider shadow-lg flex items-center gap-2">
                                            {isAIMatch && <span className="text-xs">🤖</span>}
                                            {opponentTeam?.teamTag ? `[${opponentTeam.teamTag}] ` : ''}{opponentTeam?.teamName || 'Opponent'}
                                        </div>
                                    </div>

                                    {/* Players Grid */}
                                    <div className="grid grid-cols-5 gap-2 mt-3">
                                        {opponentPlayers.map((player, idx) => (
                                            <TeamPlayerCard
                                                key={player.odUserId}
                                                {...player}
                                                showSlot={true}
                                                variant="minimal"
                                                index={idx}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center pb-2">
                        {preMatchCountdownMs !== null ? (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-white/60 text-xs mb-2"
                            >
                                Get ready! Strategy phase begins soon...
                            </motion.p>
                        ) : (
                            <motion.div
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="text-white/40 text-xs mb-2"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                        className="w-3 h-3 border-2 border-white/30 border-t-primary rounded-full"
                                    />
                                    Match will start when all players connect...
                                </span>
                            </motion.div>
                        )}

                        {/* Leave Button */}
                        <button
                            onClick={() => setShowQuitConfirm(true)}
                            className="px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30
                                       text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50
                                       transition-all inline-flex items-center gap-2 text-sm"
                        >
                            <ArrowLeft className="w-3 h-3" />
                            Leave Match
                        </button>
                    </div>
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
            </VSScreenBackground>
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
            <VSScreenBackground variant="strategy">
                <div className="h-screen overflow-hidden no-scrollbar flex flex-col items-center justify-center p-2 md:p-3">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-6xl"
                    >
                        {/* Header + Timer Combined */}
                        <div className="text-center mb-3">
                            <motion.div
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                            >
                                <span className="text-2xl">{isIGL ? '🎯' : '⏳'}</span>
                                <div className="text-left">
                                    <h1 className="text-lg font-black text-white">
                                        {isIGL ? 'Strategy Phase' : 'Waiting for IGL'}
                                    </h1>
                                    <p className="text-white/50 text-xs">
                                        {isIGL
                                            ? 'Assign your team to operation slots'
                                            : 'Your IGL is assigning slots...'}
                                    </p>
                                </div>
                                <motion.div
                                    animate={remainingSecs <= 10 ? {
                                        scale: [1, 1.05, 1],
                                    } : {}}
                                    transition={{ duration: 0.5, repeat: remainingSecs <= 10 ? Infinity : 0 }}
                                    className={cn(
                                        "px-4 py-2 rounded-xl font-mono text-2xl font-black border ml-4",
                                        remainingSecs <= 10
                                            ? "bg-rose-500/20 text-rose-400 border-rose-500/50"
                                            : "bg-primary/10 text-primary border-primary/30"
                                    )}
                                >
                                    {Math.floor(remainingSecs / 60)}:{(remainingSecs % 60).toString().padStart(2, '0')}
                                </motion.div>
                            </motion.div>
                        </div>

                        {/* Team Player Cards with Banners */}
                        <div className="mb-3">
                            <h3 className="text-xs font-bold text-white/70 mb-2 flex items-center gap-2">
                                <Target className="w-3 h-3 text-primary" />
                                Your Team
                                {isIGL && <span className="text-xs text-white/40 ml-auto">Click a player to select for reassignment</span>}
                            </h3>
                        <div className="grid grid-cols-5 gap-2">
                            {Object.entries(strategyPhase.mySlots).map(([playerId, assignment], idx) => {
                                const slotOp = typeof assignment.slot === 'string' ? assignment.slot : '';
                                return (
                                    <TeamPlayerCard
                                        key={playerId}
                                        odUserId={playerId}
                                        name={assignment.name}
                                        level={assignment.level || 1}
                                        banner={assignment.banner || 'default'}
                                        frame={assignment.frame || 'default'}
                                        title={assignment.title || 'Player'}
                                        isIgl={assignment.isIgl}
                                        isAnchor={assignment.isAnchor}
                                        slot={slotOp}
                                        showSlot={true}
                                        isActive={selectedSlotPlayer === playerId}
                                        onClick={isIGL ? () => setSelectedSlotPlayer(prev => prev === playerId ? null : playerId) : undefined}
                                        variant="minimal"
                                        index={idx}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Slot Assignment Grid */}
                    <div className="grid grid-cols-5 gap-3 mb-4">
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
                                        "bg-white/5 rounded-xl p-3 border-2 transition-all",
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
                                    <div className="text-center mb-2">
                                        <div className="w-10 h-10 mx-auto rounded-lg bg-primary/20 flex items-center justify-center text-xl font-bold text-primary mb-1">
                                            {operationSymbols[op.toLowerCase()] || '?'}
                                        </div>
                                        <span className="text-xs text-white/50 uppercase tracking-wider">{op}</span>
                                    </div>

                                    {/* Player in Slot - with banner background */}
                                    {playerData && (() => {
                                        const bannerKey = resolveBannerStyle(playerData.banner);
                                        const bannerStyle = BANNER_STYLES[bannerKey] || BANNER_STYLES.default;
                                        return (
                                            <div
                                                className={cn(
                                                    "p-2 rounded-lg text-center transition-all overflow-hidden relative",
                                                    "bg-gradient-to-b",
                                                    bannerStyle.background,
                                                    bannerStyle.border,
                                                    selectedSlotPlayer === playerId && "ring-2 ring-primary",
                                                    isIGL && "cursor-pointer hover:brightness-110"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isIGL) {
                                                        setSelectedSlotPlayer(prev => prev === playerId ? null : playerId);
                                                    }
                                                }}
                                            >
                                                {/* Pattern overlay */}
                                                {bannerStyle.pattern && (
                                                    <div
                                                        className={cn("absolute inset-0 opacity-20", bannerStyle.animationClass)}
                                                        style={{
                                                            backgroundImage: bannerStyle.pattern,
                                                            backgroundSize: bannerStyle.patternSize || 'auto'
                                                        }}
                                                    />
                                                )}
                                                <span className={cn("font-bold text-sm relative z-10", bannerStyle.textColor)}>{playerData.name}</span>
                                                <div className="flex justify-center gap-1 mt-0.5 relative z-10">
                                                    {playerData.isIgl && (
                                                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/30 text-amber-400">IGL</span>
                                                    )}
                                                    {playerData.isAnchor && (
                                                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/30 text-purple-400">Anchor</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Instructions / Confirm Button */}
                    <div className="text-center">
                        {isIGL ? (
                            <>
                                <p className="text-white/50 text-xs mb-2">
                                    {selectedSlotPlayer
                                        ? 'Click on a slot to move this player'
                                        : 'Click on a player to select, then click a slot to move them'}
                                </p>
                                <button
                                    onClick={handleConfirmSlots}
                                    disabled={strategyPhase.myTeamReady}
                                    className={cn(
                                        "px-6 py-2 rounded-lg font-bold transition-all",
                                        strategyPhase.myTeamReady
                                            ? "bg-emerald-500/30 text-emerald-400 cursor-not-allowed"
                                            : "bg-primary text-white hover:bg-primary/80"
                                    )}
                                >
                                    {strategyPhase.myTeamReady ? '✓ Slots Confirmed' : 'Confirm Slots & Ready'}
                                </button>
                            </>
                        ) : (
                            <div className="flex items-center justify-center gap-2 text-white/50 text-sm">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className="w-4 h-4 border-2 border-white/30 border-t-primary rounded-full"
                                />
                                Waiting for IGL to confirm slots...
                            </div>
                        )}
                    </div>
                    
                    {/* IGL Reminder - actual controls are in the FAB */}
                    {isIGL && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="mt-8 max-w-md mx-auto p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3"
                        >
                            <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-amber-300">IGL: Set Up Strategy</p>
                                <p className="text-xs text-amber-300/70 whitespace-nowrap">
                                    Use the command panel to set up Double Call-In for Round 1.
                                </p>
                        </div>
                        </motion.div>
                    )}
                    
                    {/* Team Ready Status */}
                    {(strategyPhase.myTeamReady || strategyPhase.opponentTeamReady) && (
                        <div className="mt-6 flex justify-center gap-4">
                            {strategyPhase.myTeamReady && (
                                <motion.span 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-bold border border-emerald-500/30"
                                >
                                    ✓ Your Team Ready
                                </motion.span>
                            )}
                            {strategyPhase.opponentTeamReady && (
                                <motion.span 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="px-4 py-2 bg-rose-500/20 text-rose-400 rounded-full text-sm font-bold border border-rose-500/30"
                                >
                                    ✓ Opponent Ready
                                </motion.span>
                            )}
                        </div>
                    )}
                    </motion.div>
                </div>
            </VSScreenBackground>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/10 to-slate-900 text-white">
            {/* Match Header - Enhanced with animations */}
            <div className="relative border-b border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden">
                {/* Animated background gradient */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-rose-500/5"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                />

                <div className="relative max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        {/* Timer and Round - Left side */}
                        <div className="flex items-center gap-4">
                            <motion.div
                                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-white/10 to-white/5 border border-white/10"
                                animate={{ boxShadow: ['0 0 10px rgba(255,255,255,0.05)', '0 0 20px rgba(255,255,255,0.1)', '0 0 10px rgba(255,255,255,0.05)'] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <Clock className="w-5 h-5 text-primary" />
                                <span className="font-mono font-black text-2xl text-white">
                                    {formatTime(matchState.gameClockMs)}
                                </span>
                            </motion.div>
                            <div className="flex flex-col">
                                <span className="text-xs text-white/40 uppercase tracking-wider">Round</span>
                                <span className="text-lg font-bold text-white/80">
                                    {matchState.round}/4 • {matchState.half === 1 ? '1st' : '2nd'} Half
                                </span>
                            </div>
                        </div>

                        {/* VS Score Display - Center (Enhanced) */}
                        <div className="flex items-center gap-4">
                            {/* My Team */}
                            <motion.div
                                className="flex items-center gap-3 px-5 py-2 rounded-xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30"
                                whileHover={{ scale: 1.02 }}
                            >
                                <div className="text-right">
                                    <p className="text-xs text-primary/70 font-medium uppercase tracking-wider">
                                        {myTeam?.teamTag ? `[${myTeam.teamTag}]` : 'YOUR TEAM'}
                                    </p>
                                    <p className="text-lg font-black text-primary truncate max-w-[120px]">
                                        {myTeam?.teamName}
                                    </p>
                                </div>
                                <motion.div
                                    className="text-4xl font-black text-primary"
                                    key={myTeam?.score}
                                    initial={{ scale: 1.3, color: '#22c55e' }}
                                    animate={{ scale: 1, color: 'var(--primary)' }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {myTeam?.score || 0}
                                </motion.div>
                            </motion.div>

                            {/* VS Badge */}
                            <motion.div
                                className="relative px-4 py-2"
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-white/10 to-rose-500/20 rounded-full blur-xl" />
                                <span className="relative text-2xl font-black text-white/80 italic">VS</span>
                            </motion.div>

                            {/* Opponent Team */}
                            <motion.div
                                className="flex items-center gap-3 px-5 py-2 rounded-xl bg-gradient-to-l from-rose-500/20 to-rose-500/5 border border-rose-500/30"
                                whileHover={{ scale: 1.02 }}
                            >
                                <motion.div
                                    className="text-4xl font-black text-rose-400"
                                    key={opponentTeam?.score}
                                    initial={{ scale: 1.3, color: '#ef4444' }}
                                    animate={{ scale: 1, color: '#fb7185' }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {opponentTeam?.score || 0}
                                </motion.div>
                                <div className="text-left">
                                    <p className="text-xs text-rose-400/70 font-medium uppercase tracking-wider">
                                        {opponentTeam?.teamTag ? `[${opponentTeam.teamTag}]` : 'OPPONENT'}
                                    </p>
                                    <p className="text-lg font-black text-rose-400 truncate max-w-[120px]">
                                        {opponentTeam?.teamName}
                                    </p>
                                </div>
                            </motion.div>
                        </div>

                        {/* Phase indicator & Buttons - Right side */}
                        <div className="flex items-center gap-3">
                            <motion.div
                                data-testid={`phase-${matchState.phase}`}
                                className={cn(
                                    "px-5 py-2.5 rounded-xl font-black uppercase tracking-wider text-sm border-2",
                                    matchState.phase === 'active' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                                    matchState.phase === 'break' && "bg-amber-500/20 text-amber-400 border-amber-500/40",
                                    matchState.phase === 'halftime' && "bg-blue-500/20 text-blue-400 border-blue-500/40",
                                    matchState.phase === 'post_match' && "bg-purple-500/20 text-purple-400 border-purple-500/40",
                                )}
                                animate={matchState.phase === 'active' ? {
                                    boxShadow: ['0 0 10px rgba(34,197,94,0.3)', '0 0 20px rgba(34,197,94,0.5)', '0 0 10px rgba(34,197,94,0.3)']
                                } : {}}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            >
                                {matchState.phase === 'active' && (
                                    <span className="flex items-center gap-2">
                                        <motion.span
                                            className="w-2 h-2 rounded-full bg-emerald-400"
                                            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                            transition={{ duration: 1, repeat: Infinity }}
                                        />
                                        LIVE
                                    </span>
                                )}
                                {matchState.phase === 'break' && 'BREAK'}
                                {matchState.phase === 'halftime' && 'HALFTIME'}
                                {matchState.phase === 'post_match' && 'FINISHED'}
                            </motion.div>

                            {/* Fullscreen Button */}
                            <motion.button
                                onClick={toggleFullscreen}
                                className="p-2.5 rounded-xl bg-white/5 border border-white/10
                                           text-white/60 hover:text-primary hover:bg-primary/10 hover:border-primary/30
                                           transition-all"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                            >
                                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                            </motion.button>

                            {/* Quit Button */}
                            <motion.button
                                onClick={() => setShowQuitConfirm(true)}
                                className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30
                                           text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50
                                           transition-all"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                title="Leave Match"
                            >
                                <LogOut className="w-5 h-5" />
                            </motion.button>
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
                            {/* Relay Handoff Animation - Only shown to the incoming player */}
                            {relayHandoff.isVisible && 
                             relayHandoff.outgoingPlayer && 
                             relayHandoff.incomingPlayer && 
                             relayHandoff.incomingPlayer.isCurrentUser ? (
                                <RelayHandoff
                                    isVisible={true}
                                    outgoingPlayer={relayHandoff.outgoingPlayer}
                                    incomingPlayer={relayHandoff.incomingPlayer}
                                    slotNumber={relayHandoff.slotNumber}
                                    onComplete={() => setRelayHandoff(prev => ({ ...prev, isVisible: false }))}
                                />
                            ) : isMyTurn && myPlayerQuestion ? (
                                /* Active Player Input - Enhanced Question Card */
                                <QuestionAnswerCard
                                    question={myPlayerQuestion.question}
                                    operation={myPlayerQuestion.operation || 'mixed'}
                                    questionNumber={Math.min((myTeam?.questionsInSlot || 0) + 1, 5)}
                                    totalQuestions={5}
                                    slotLabel={myPlayer.slot || 'Mixed'}
                                    streak={myPlayer.streak || 0}
                                    slotScore={myPlayer.score || 0}
                                    isIgl={myPlayer.isIgl}
                                    isAnchor={myPlayer.isAnchor}
                                    playerName={myPlayer.odName}
                                    onSubmit={handleSubmit}
                                    onInputChange={handleInputChange}
                                    lastResult={lastAnswerResult ? {
                                        isCorrect: lastAnswerResult.isCorrect,
                                        pointsEarned: lastAnswerResult.pointsEarned,
                                        correctAnswer: lastAnswerResult.correctAnswer,
                                        newStreak: myPlayer.streak || 0,
                                    } : null}
                                />
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
                                    players={Object.values(opponentTeam.players).sort((a, b) => 
                                        operations.indexOf(a.slot) - operations.indexOf(b.slot)
                                    )}
                                />
                            )}
                            
                            {/* Note: Anchor abilities controlled by IGL during breaks per spec */}
                            {/* During active play, relay clock runs continuously - no ability controls */}
                        </div>
                    </div>
                )}

                {/* VS Relay Race Display - Full size with banners and animations */}
                {matchState.phase === 'active' && myTeam && opponentTeam && (
                    <div className="mt-5 space-y-3">
                        {/* My Team Relay Lane */}
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5 }}
                            className="rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-slate-900/90
                                        border-2 border-primary/40 p-4 overflow-hidden relative"
                        >
                            {/* Animated background glow */}
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/5 to-transparent"
                                animate={{ opacity: [0.4, 0.7, 0.4] }}
                                transition={{ duration: 2.5, repeat: Infinity }}
                            />

                            {/* Scanning line effect - slowed down */}
                            <motion.div
                                className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-primary to-transparent"
                                animate={{ x: ['0%', '100vw'] }}
                                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                            />

                            <div className="relative flex items-center gap-5">
                                {/* Team Info */}
                                <div className="flex-shrink-0 w-40">
                                    <div className="flex items-center gap-2 mb-2">
                                        <motion.div
                                            className="w-4 h-4 rounded-full bg-primary shadow-lg shadow-primary/50"
                                            animate={{ scale: [1, 1.3, 1], boxShadow: ['0 0 10px var(--primary)', '0 0 25px var(--primary)', '0 0 10px var(--primary)'] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        />
                                        <span className="text-sm text-primary font-bold uppercase tracking-wider">
                                            {myTeam.teamTag && `[${myTeam.teamTag}]`} Your Team
                                        </span>
                                    </div>
                                    <span className="text-2xl font-black text-primary truncate block mb-1">
                                        {myTeam.teamName}
                                    </span>
                                    <motion.span
                                        className="text-4xl font-black text-primary"
                                        key={myTeam.score}
                                        initial={{ scale: 1.3 }}
                                        animate={{ scale: 1 }}
                                    >
                                        {myTeam.score.toLocaleString()}
                                    </motion.span>
                                </div>

                                {/* Relay Track with Full Banner Cards */}
                                <div className="flex-1 flex items-stretch gap-3">
                                    {Object.entries(myTeam.slotAssignments || {})
                                        .sort(([opA], [opB]) => operations.indexOf(opA) - operations.indexOf(opB))
                                        .map(([op, odUserId], idx) => {
                                        const player = myTeam.players[odUserId];
                                        if (!player) return <div key={idx} className="flex-1" />;
                                        const bannerStyle = BANNER_STYLES[resolveBannerStyle(player.odEquippedBanner)] || BANNER_STYLES.default;

                                        return (
                                            <motion.div
                                                key={odUserId}
                                                className={cn(
                                                    "flex-1 rounded-2xl overflow-hidden relative transition-all",
                                                    player.isComplete && "ring-3 ring-emerald-500 ring-offset-2 ring-offset-slate-900 shadow-xl shadow-emerald-500/30",
                                                    player.isActive && "ring-3 ring-primary ring-offset-2 ring-offset-slate-900 shadow-xl shadow-primary/50",
                                                    !player.isActive && !player.isComplete && "opacity-50 grayscale-[30%]"
                                                )}
                                                animate={player.isActive ? {
                                                    scale: [1, 1.03, 1],
                                                    y: [0, -4, 0]
                                                } : {}}
                                                transition={{ duration: 1.2, repeat: Infinity }}
                                            >
                                                {/* Banner background - Full display */}
                                                <div className={cn("absolute inset-0 bg-gradient-to-br", bannerStyle.background)} />
                                                {bannerStyle.pattern && (
                                                    <div
                                                        className="absolute inset-0 opacity-50"
                                                        style={{
                                                            backgroundImage: bannerStyle.pattern,
                                                            backgroundSize: bannerStyle.patternSize || '20px 20px'
                                                        }}
                                                    />
                                                )}
                                                {bannerStyle.animationClass && (
                                                    <div className={cn("absolute inset-0 opacity-30", bannerStyle.animationClass)} />
                                                )}

                                                {/* Shimmer effect for active */}
                                                {player.isActive && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                                        animate={{ x: ['-100%', '200%'] }}
                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                    />
                                                )}

                                                {/* Content */}
                                                <div className="relative p-3 flex flex-col items-center justify-center min-h-[85px]">
                                                    {/* Operation badge - Top left */}
                                                    <div className={cn(
                                                        "absolute top-2 left-2 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black",
                                                        "bg-black/50 backdrop-blur-md border-2 border-white/30 shadow-lg",
                                                        bannerStyle.textColor
                                                    )}>
                                                        {operationSymbols[op]}
                                                    </div>

                                                    {/* Role badges - Top right */}
                                                    <div className="absolute top-2 right-2 flex gap-1.5">
                                                        {player.isIgl && (
                                                            <motion.div
                                                                className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600
                                                                           flex items-center justify-center shadow-lg shadow-amber-500/50 border border-amber-300"
                                                                animate={{ rotate: [0, 8, -8, 0] }}
                                                                transition={{ duration: 2, repeat: Infinity }}
                                                            >
                                                                <Crown className="w-4 h-4 text-white drop-shadow" />
                                                            </motion.div>
                                                        )}
                                                        {player.isAnchor && (
                                                            <motion.div
                                                                className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600
                                                                           flex items-center justify-center shadow-lg shadow-purple-500/50 border border-purple-300"
                                                                animate={{ y: [0, -2, 0] }}
                                                                transition={{ duration: 1.5, repeat: Infinity }}
                                                            >
                                                                <Anchor className="w-4 h-4 text-white drop-shadow" />
                                                            </motion.div>
                                                        )}
                                                    </div>

                                                    {/* Player name - Center */}
                                                    <span className={cn(
                                                        "text-base font-black truncate text-center mt-4 drop-shadow-lg",
                                                        bannerStyle.textColor
                                                    )}>
                                                        {player.odName}
                                                    </span>

                                                    {/* Status indicator - Bottom */}
                                                    <div className="mt-2 flex items-center gap-2">
                                                        {player.isComplete && (
                                                            <motion.div
                                                                initial={{ scale: 0, rotate: -180 }}
                                                                animate={{ scale: 1, rotate: 0 }}
                                                                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/40 backdrop-blur-sm border border-emerald-400/50"
                                                            >
                                                                <Check className="w-4 h-4 text-emerald-300" />
                                                                <span className="text-sm font-black text-emerald-300">{player.score} pts</span>
                                                            </motion.div>
                                                        )}
                                                        {player.isActive && (
                                                            <motion.div
                                                                className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/40 backdrop-blur-sm border border-primary/50"
                                                                animate={{ boxShadow: ['0 0 10px var(--primary)', '0 0 20px var(--primary)', '0 0 10px var(--primary)'] }}
                                                                transition={{ duration: 0.8, repeat: Infinity }}
                                                            >
                                                                <motion.span
                                                                    className="w-2 h-2 rounded-full bg-primary"
                                                                    animate={{ scale: [1, 1.5, 1] }}
                                                                    transition={{ duration: 0.5, repeat: Infinity }}
                                                                />
                                                                <span className="text-sm font-black text-primary">LIVE</span>
                                                                {player.streak > 0 && (
                                                                    <div className="flex items-center gap-1 text-orange-400">
                                                                        <Zap className="w-4 h-4" />
                                                                        <span className="text-sm font-black">{player.streak}</span>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                        {!player.isActive && !player.isComplete && (
                                                            <span className="text-sm text-white/50 font-bold uppercase tracking-wider">Next Up</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Active border glow */}
                                                {player.isActive && (
                                                    <motion.div
                                                        className="absolute inset-0 border-3 border-primary rounded-2xl"
                                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                                        transition={{ duration: 0.8, repeat: Infinity }}
                                                    />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Team Progress Bar - Enhanced */}
                            <div className="relative mt-3 h-2.5 bg-black/40 rounded-full overflow-hidden flex shadow-inner">
                                {[1, 2, 3, 4, 5].map(slot => (
                                    <motion.div
                                        key={slot}
                                        className={cn(
                                            "flex-1 transition-all duration-500 relative",
                                            slot < (myTeam.currentSlot || 1) && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                                            slot === (myTeam.currentSlot || 1) && "bg-gradient-to-r from-primary via-primary to-primary/70",
                                            slot > (myTeam.currentSlot || 1) && "bg-white/10"
                                        )}
                                        animate={slot === (myTeam.currentSlot || 1) ? {
                                            opacity: [1, 0.6, 1],
                                        } : {}}
                                        transition={{ duration: 0.8, repeat: Infinity }}
                                    >
                                        {slot === (myTeam.currentSlot || 1) && (
                                            <motion.div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                                                animate={{ x: ['-100%', '100%'] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            />
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-1 px-1">
                                {SLOT_LABELS.map((label, idx) => (
                                    <span key={label} className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        idx + 1 < (myTeam.currentSlot || 1) && "text-emerald-400",
                                        idx + 1 === (myTeam.currentSlot || 1) && "text-primary",
                                        idx + 1 > (myTeam.currentSlot || 1) && "text-white/30"
                                    )}>
                                        {label.slice(0, 3)}
                                    </span>
                                ))}
                            </div>
                        </motion.div>

                        {/* Opponent Team Relay Lane */}
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="rounded-2xl bg-gradient-to-r from-rose-500/20 via-rose-500/10 to-slate-900/90
                                        border-2 border-rose-500/40 p-4 overflow-hidden relative"
                        >
                            {/* Animated background glow */}
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-rose-500/20 via-rose-500/5 to-transparent"
                                animate={{ opacity: [0.4, 0.6, 0.4] }}
                                transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
                            />

                            {/* Scanning line effect - slowed down */}
                            <motion.div
                                className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-transparent via-rose-500 to-transparent"
                                animate={{ x: ['0%', '-100vw'] }}
                                transition={{ duration: 10, repeat: Infinity, ease: 'linear', delay: 5 }}
                            />

                            <div className="relative flex items-center gap-5">
                                {/* Team Info */}
                                <div className="flex-shrink-0 w-40">
                                    <div className="flex items-center gap-2 mb-2">
                                        <motion.div
                                            className="w-4 h-4 rounded-full bg-rose-500 shadow-lg shadow-rose-500/50"
                                            animate={{ scale: [1, 1.3, 1], boxShadow: ['0 0 10px #f43f5e', '0 0 25px #f43f5e', '0 0 10px #f43f5e'] }}
                                            transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                                        />
                                        <span className="text-sm text-rose-400 font-bold uppercase tracking-wider">
                                            {opponentTeam.teamTag && `[${opponentTeam.teamTag}]`} Opponent
                                        </span>
                                    </div>
                                    <span className="text-2xl font-black text-rose-400 truncate block mb-1">
                                        {opponentTeam.teamName}
                                    </span>
                                    <motion.span
                                        className="text-4xl font-black text-rose-400"
                                        key={opponentTeam.score}
                                        initial={{ scale: 1.3 }}
                                        animate={{ scale: 1 }}
                                    >
                                        {opponentTeam.score.toLocaleString()}
                                    </motion.span>
                                </div>

                                {/* Relay Track with Full Banner Cards */}
                                <div className="flex-1 flex items-stretch gap-3">
                                    {Object.entries(opponentTeam.slotAssignments || {})
                                        .sort(([opA], [opB]) => operations.indexOf(opA) - operations.indexOf(opB))
                                        .map(([op, odUserId], idx) => {
                                        const player = opponentTeam.players[odUserId];
                                        if (!player) return <div key={idx} className="flex-1" />;
                                        const bannerStyle = BANNER_STYLES[resolveBannerStyle(player.odEquippedBanner)] || BANNER_STYLES.default;

                                        return (
                                            <motion.div
                                                key={odUserId}
                                                className={cn(
                                                    "flex-1 rounded-2xl overflow-hidden relative transition-all",
                                                    player.isComplete && "ring-3 ring-rose-400 ring-offset-2 ring-offset-slate-900 shadow-xl shadow-rose-500/30",
                                                    player.isActive && "ring-3 ring-rose-500 ring-offset-2 ring-offset-slate-900 shadow-xl shadow-rose-500/50",
                                                    !player.isActive && !player.isComplete && "opacity-50 grayscale-[30%]"
                                                )}
                                                animate={player.isActive ? {
                                                    scale: [1, 1.03, 1],
                                                    y: [0, -4, 0]
                                                } : {}}
                                                transition={{ duration: 1.2, repeat: Infinity }}
                                            >
                                                {/* Banner background - Full display */}
                                                <div className={cn("absolute inset-0 bg-gradient-to-br", bannerStyle.background)} />
                                                {bannerStyle.pattern && (
                                                    <div
                                                        className="absolute inset-0 opacity-50"
                                                        style={{
                                                            backgroundImage: bannerStyle.pattern,
                                                            backgroundSize: bannerStyle.patternSize || '20px 20px'
                                                        }}
                                                    />
                                                )}
                                                {bannerStyle.animationClass && (
                                                    <div className={cn("absolute inset-0 opacity-30", bannerStyle.animationClass)} />
                                                )}

                                                {/* Shimmer effect for active */}
                                                {player.isActive && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                                        animate={{ x: ['-100%', '200%'] }}
                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                    />
                                                )}

                                                {/* Content */}
                                                <div className="relative p-3 flex flex-col items-center justify-center min-h-[85px]">
                                                    {/* Operation badge - Top left */}
                                                    <div className={cn(
                                                        "absolute top-2 left-2 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black",
                                                        "bg-black/50 backdrop-blur-md border-2 border-white/30 shadow-lg",
                                                        bannerStyle.textColor
                                                    )}>
                                                        {operationSymbols[op]}
                                                    </div>

                                                    {/* Role badges - Top right */}
                                                    <div className="absolute top-2 right-2 flex gap-1.5">
                                                        {player.isIgl && (
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600
                                                                           flex items-center justify-center shadow-lg shadow-amber-500/50 border border-amber-300">
                                                                <Crown className="w-4 h-4 text-white drop-shadow" />
                                                            </div>
                                                        )}
                                                        {player.isAnchor && (
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600
                                                                           flex items-center justify-center shadow-lg shadow-purple-500/50 border border-purple-300">
                                                                <Anchor className="w-4 h-4 text-white drop-shadow" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Player name - Center */}
                                                    <span className={cn(
                                                        "text-base font-black truncate text-center mt-4 drop-shadow-lg",
                                                        bannerStyle.textColor
                                                    )}>
                                                        {player.odName}
                                                    </span>

                                                    {/* Status indicator - Bottom */}
                                                    <div className="mt-2 flex items-center gap-2">
                                                        {player.isComplete && (
                                                            <motion.div
                                                                initial={{ scale: 0, rotate: -180 }}
                                                                animate={{ scale: 1, rotate: 0 }}
                                                                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/40 backdrop-blur-sm border border-rose-400/50"
                                                            >
                                                                <Check className="w-4 h-4 text-rose-300" />
                                                                <span className="text-sm font-black text-rose-300">{player.score} pts</span>
                                                            </motion.div>
                                                        )}
                                                        {player.isActive && (
                                                            <motion.div
                                                                className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/40 backdrop-blur-sm border border-rose-500/50"
                                                                animate={{ boxShadow: ['0 0 10px #f43f5e', '0 0 20px #f43f5e', '0 0 10px #f43f5e'] }}
                                                                transition={{ duration: 0.8, repeat: Infinity }}
                                                            >
                                                                <motion.span
                                                                    className="w-2 h-2 rounded-full bg-rose-400"
                                                                    animate={{ scale: [1, 1.5, 1] }}
                                                                    transition={{ duration: 0.5, repeat: Infinity }}
                                                                />
                                                                <span className="text-sm font-black text-rose-400">LIVE</span>
                                                                {player.streak > 0 && (
                                                                    <div className="flex items-center gap-1 text-orange-400">
                                                                        <Zap className="w-4 h-4" />
                                                                        <span className="text-sm font-black">{player.streak}</span>
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                        {!player.isActive && !player.isComplete && (
                                                            <span className="text-sm text-white/50 font-bold uppercase tracking-wider">Next Up</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Active border glow */}
                                                {player.isActive && (
                                                    <motion.div
                                                        className="absolute inset-0 border-3 border-rose-400 rounded-2xl"
                                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                                        transition={{ duration: 0.8, repeat: Infinity }}
                                                    />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Team Progress Bar - Enhanced */}
                            <div className="relative mt-3 h-2.5 bg-black/40 rounded-full overflow-hidden flex shadow-inner">
                                {[1, 2, 3, 4, 5].map(slot => (
                                    <motion.div
                                        key={slot}
                                        className={cn(
                                            "flex-1 transition-all duration-500 relative",
                                            slot < (opponentTeam.currentSlot || 1) && "bg-gradient-to-r from-rose-500 to-rose-400",
                                            slot === (opponentTeam.currentSlot || 1) && "bg-gradient-to-r from-rose-400 via-rose-400 to-rose-300",
                                            slot > (opponentTeam.currentSlot || 1) && "bg-white/10"
                                        )}
                                        animate={slot === (opponentTeam.currentSlot || 1) ? {
                                            opacity: [1, 0.6, 1],
                                        } : {}}
                                        transition={{ duration: 0.8, repeat: Infinity }}
                                    >
                                        {slot === (opponentTeam.currentSlot || 1) && (
                                            <motion.div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                                                animate={{ x: ['-100%', '100%'] }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            />
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-1 px-1">
                                {SLOT_LABELS.map((label, idx) => (
                                    <span key={label} className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        idx + 1 < (opponentTeam.currentSlot || 1) && "text-rose-400",
                                        idx + 1 === (opponentTeam.currentSlot || 1) && "text-rose-300",
                                        idx + 1 > (opponentTeam.currentSlot || 1) && "text-white/30"
                                    )}>
                                        {label.slice(0, 3)}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Break Phase - Enhanced with MVP and insights */}
                {matchState.phase === 'break' && myTeam && opponentTeam && (
                    <TacticalBreakPanel
                        durationMs={phaseInitialDuration || 20000}
                        completedRound={matchState.round}
                        totalRounds={8}
                        myTeamScore={myTeam.score}
                        opponentScore={opponentTeam.score}
                        myTeamName={myTeam.teamName}
                        opponentTeamName={opponentTeam.teamName}
                        roundMVP={(() => {
                            // Find top scorer from this round across both teams
                            const allPlayers = [
                                ...Object.values(myTeam.players).map(p => ({ ...p, isMyTeam: true })),
                                ...Object.values(opponentTeam.players).map(p => ({ ...p, isMyTeam: false })),
                            ];
                            const topPlayer = allPlayers.reduce((best, p) => 
                                p.score > (best?.score || 0) ? p : best, allPlayers[0]);
                            if (topPlayer) {
                                return {
                                    playerId: topPlayer.odUserId,
                                    name: topPlayer.odName,
                                    isMyTeam: topPlayer.isMyTeam,
                                    score: topPlayer.score,
                                    accuracy: topPlayer.total > 0 ? Math.round((topPlayer.correct / topPlayer.total) * 100) : 0,
                                    questionsAnswered: topPlayer.total,
                                } as RoundMVP;
                            }
                            return undefined;
                        })()}
                        insights={(() => {
                            const insights: RoundInsight[] = [];
                            // Generate insights based on round performance
                            if (myTeam.currentStreak >= 3) {
                                insights.push({ type: 'positive', message: `Team on a ${myTeam.currentStreak} streak!`, icon: 'streak' });
                            }
                            const teamAccuracy = Object.values(myTeam.players).reduce((sum, p) => 
                                sum + (p.total > 0 ? p.correct / p.total : 0), 0) / Object.values(myTeam.players).length * 100;
                            if (teamAccuracy > 85) {
                                insights.push({ type: 'positive', message: 'Excellent team accuracy this round', icon: 'accuracy' });
                            } else if (teamAccuracy < 60) {
                                insights.push({ type: 'negative', message: 'Accuracy needs improvement', icon: 'warning' });
                            }
                            if (myTeam.score > opponentTeam.score) {
                                insights.push({ type: 'positive', message: 'Maintaining the lead!', icon: 'streak' });
                            } else if (myTeam.score < opponentTeam.score) {
                                insights.push({ type: 'negative', message: 'Need to close the gap', icon: 'warning' });
                            }
                            return insights;
                        })()}
                                    isIGL={isIGL}
                                    half={matchState.half}
                                    usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                                    usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                                    timeoutsRemaining={timeoutsRemaining}
                        availableSlots={availableSlots.map(s => s.operation)}
                                    onDoubleCallin={handleDoubleCallin}
                                    onTimeout={() => {
                                        if (timeoutsRemaining > 0 && socketRef.current) {
                                            socketRef.current.emit('igl_timeout', { matchId, userId: currentUserId });
                                        }
                                    }}
                    />
                )}

                {/* Halftime Phase - Enhanced with player stats */}
                {matchState.phase === 'halftime' && myTeam && opponentTeam && (
                    <HalftimePanel
                        durationMs={phaseInitialDuration || 30000}
                        myTeamName={myTeam.teamName}
                        opponentTeamName={opponentTeam.teamName}
                        myTeamScore={myTeam.score}
                        opponentScore={opponentTeam.score}
                        myTeamPlayers={Object.values(myTeam.players).map((p): PlayerHalftimeStats => ({
                            playerId: p.odUserId,
                            name: p.odName,
                            isIgl: p.isIgl,
                            isAnchor: p.isAnchor,
                            isCurrentUser: p.odUserId === currentUserId,
                            operation: p.slot,
                            questionsAnswered: p.total,
                            correctAnswers: p.correct,
                            accuracy: p.total > 0 ? (p.correct / p.total) * 100 : 0,
                            avgResponseTime: 2.5, // TODO: Track actual response times
                            score: p.score,
                            streak: p.streak,
                        }))}
                        opponentPlayers={Object.values(opponentTeam.players).map((p): PlayerHalftimeStats => ({
                            playerId: p.odUserId,
                            name: p.odName,
                            isIgl: p.isIgl,
                            isAnchor: p.isAnchor,
                            isCurrentUser: false,
                            operation: p.slot,
                            questionsAnswered: p.total,
                            correctAnswers: p.correct,
                            accuracy: p.total > 0 ? (p.correct / p.total) * 100 : 0,
                            avgResponseTime: 2.5,
                            score: p.score,
                            streak: p.streak,
                        }))}
                                    isIGL={isIGL}
                        currentUserId={currentUserId}
                        round={matchState.round}
                        half={matchState.half}
                                    usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                                    timeoutsRemaining={timeoutsRemaining}
                        availableSlots={availableSlots.map(s => s.operation)}
                        onDoubleCallin={handleDoubleCallin}
                                    onTimeout={() => {
                                        if (timeoutsRemaining > 0 && socketRef.current) {
                                            socketRef.current.emit('igl_timeout', { matchId, userId: currentUserId });
                                        }
                                    }}
                                />
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

            </div>
            
            {/* Quit Confirmation Modal (Leader initiates vote, or instant leave for solo human with AI) */}
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
                                        {isSoloHumanWithAI 
                                            ? 'Leave Match?' 
                                            : isPartyLeader 
                                                ? 'Start Quit Vote?' 
                                                : 'Leave Match?'}
                                    </h3>
                                    <p className="text-white/60 text-sm">
                                        {isSoloHumanWithAI
                                            ? 'You can leave immediately'
                                            : isPartyLeader 
                                                ? 'Your team will vote on leaving' 
                                                : 'Only the party leader can start a vote'}
                                    </p>
                                </div>
                            </div>
                            
                            {isSoloHumanWithAI ? (
                                <>
                                    <p className="text-white/70 mb-6">
                                        Since you&apos;re playing with AI teammates, you can leave the match immediately 
                                        without a vote. Your team will forfeit the match.
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
                                            className="flex-1 px-4 py-3 rounded-xl bg-rose-600 text-white 
                                                       hover:bg-rose-700 transition-colors font-medium
                                                       flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Leave Match
                                        </button>
                                    </div>
                                </>
                            ) : isPartyLeader ? (
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

            {/* Round Start Countdown (5-4-3-2-1-GO!) */}
            {(showRoundCountdown || matchState.phase === 'round_countdown') && (
                <RoundStartCountdown
                    key={`countdown-${matchState.round}-${matchState.half}`}
                    round={matchState.round || 1}
                    half={matchState.half}
                    isVisible={true}
                    countdownSeconds={roundCountdownSeconds}
                    myTeamName={myTeam?.teamName || 'Your Team'}
                    opponentTeamName={opponentTeam?.teamName || 'Opponent'}
                    onComplete={() => setShowRoundCountdown(false)}
                />
            )}
            
            {/* RelayHandoff is now rendered inline within the active phase */}

            {/* IGL Floating Action Button */}
            <IGLFAB
                isIGL={isIGL}
                half={matchState.half}
                currentRound={matchState.round}
                usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                timeoutsRemaining={timeoutsRemaining}
                anchorName={anchorName}
                phase={matchState.phase}
                availableSlots={availableSlots}
                teamPlayers={myTeam ? Object.values(myTeam.players).map(p => ({
                    playerId: p.odUserId,
                    name: p.odName,
                    isIgl: p.isIgl,
                    isAnchor: p.isAnchor,
                    isAITeammate: p.odUserId.startsWith('ai_teammate_'),
                    currentSlot: p.slot || 'mixed',
                })) : []}
                onDoubleCallin={handleDoubleCallin}
                onTimeout={() => {
                    if (socketRef.current) {
                        socketRef.current.emit('igl_timeout', {
                            matchId,
                            userId: currentUserId,
                        });
                    }
                }}
                onSlotReassign={(playerId, newSlot) => {
                    if (socketRef.current) {
                        console.log(`[IGL] Reassigning player ${playerId} to slot ${newSlot}`);
                        socketRef.current.emit('update_slot_assignment', {
                            matchId,
                            userId: currentUserId,
                            playerId,
                            newSlot,
                        });
                    }
                }}
            />
            
            {/* Demo Mode Control Panel */}
            {isDemoMode && (
                <div className="fixed top-4 left-4 right-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-yellow-600 text-black px-6 py-4 rounded-xl shadow-2xl border-2 border-yellow-400"
                    >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">🛠️</span>
                                    <div>
                                        <div className="font-bold text-lg">DEMO MODE</div>
                                        <div className="text-sm opacity-80">
                                            Phase: {matchState.phase.toUpperCase()} | 
                                            Round: {matchState.round} | 
                                            Half: {matchState.half}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('pre_match')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    PRE MATCH
                                </button>
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('strategy')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    STRATEGY
                                </button>
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('active')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    ACTIVE
                                </button>
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('break')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    BREAK
                                </button>
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('halftime')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    HALFTIME
                                </button>
                                <button
                                    onClick={() => mockSimulatorRef.current?.skipToPhase('post_match')}
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors"
                                >
                                    POST MATCH
                                </button>
                                
                                <div className="w-px h-6 bg-black/30 mx-2" />
                                
                                <a
                                    href="/dev/teams"
                                    className="px-3 py-1 bg-black/20 hover:bg-black/30 rounded text-sm font-medium transition-colors inline-flex items-center gap-1"
                                >
                                    ← Component Playground
                                </a>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}


