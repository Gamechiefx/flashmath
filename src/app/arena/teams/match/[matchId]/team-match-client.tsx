'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MockMatchSimulator, type MatchPhase } from '@/lib/arena/mock-match-state';
import {
    Clock, Crown, Anchor, Zap, Check, X, Hash,
    Pause, Play, AlertCircle, Trophy, LogOut, ArrowLeft, Target,
    Maximize, Minimize, ChevronLeft, ChevronRight, Star, Home
} from 'lucide-react';
import Link from 'next/link';
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
    AnchorSoloDecisionModal,
    PointsFeedFAB,
    FirstToFinishBanner,
    createPointsEventFromResult,
    createTimeoutEvent,
    createFirstToFinishEvent,
    type SlotProgress,
    type PlayerHalftimeStats,
    type RoundMVP,
    type RoundInsight,
    type PointsEvent,
} from '@/components/arena/teams/match';
import { soundEngine } from '@/lib/sound-engine';
import { UserAvatar } from '@/components/user-avatar';

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
    totalAnswerTimeMs: number; // For calculating average response time
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
    mode?: '5v5' | '2v2';              // Match mode (5v5 or 2v2)
    slotOperations?: string[];          // The operations used in this match (e.g., ['addition', 'multiplication'] for 2v2)
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

// Default operations for 5v5 (all 5 operations)
const DEFAULT_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
const DEFAULT_SLOT_LABELS = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Mixed'];

// Backwards compatibility aliases
const operations = DEFAULT_OPERATIONS;
const SLOT_LABELS = DEFAULT_SLOT_LABELS;

// Map operation names to display labels
const OPERATION_TO_LABEL: Record<string, string> = {
    'addition': 'Addition',
    'subtraction': 'Subtraction',
    'multiplication': 'Multiplication',
    'division': 'Division',
    'mixed': 'Mixed',
};

/**
 * Get slot labels based on match operations (mode-aware)
 * For 2v2, returns labels for the 2 randomly selected operations
 */
function getSlotLabels(slotOperations?: string[]): string[] {
    if (slotOperations && slotOperations.length > 0) {
        return slotOperations.map(op => OPERATION_TO_LABEL[op] || op);
    }
    return DEFAULT_SLOT_LABELS;
}

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

// Post-match result player card - matching TeamPlayerCard "Match Starts In" style
interface ResultPlayerCardProps {
    player: PlayerState;
    isWinner: boolean;
    index: number;
    currentUserId: string;
    onViewStats: (player: PlayerState) => void;
}

function ResultPlayerCard({ player, isWinner, index, currentUserId, onViewStats }: ResultPlayerCardProps) {
    const resolvedBanner = resolveBannerStyle(player.odEquippedBanner || 'default');
    const bannerStyle = BANNER_STYLES[resolvedBanner] || BANNER_STYLES.default;
    const isCurrentUser = player.odUserId === currentUserId;

    // Determine avatar ring color based on role/result
    const getAvatarRingColor = () => {
        if (player.isIgl) return 'ring-amber-500 ring-offset-amber-500/20';
        if (player.isAnchor) return 'ring-purple-500 ring-offset-purple-500/20';
        if (isWinner) return 'ring-emerald-500 ring-offset-emerald-500/20';
        return 'ring-slate-600 ring-offset-slate-600/20';
    };

    return (
        <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.08, type: 'spring', damping: 20 }}
            className={cn(
                "relative flex flex-col rounded-xl overflow-hidden",
                "w-full min-h-[280px]",
                "border-2 shadow-2xl",
                "border-cyan-500/60 shadow-cyan-500/20"
            )}
        >
            {/* Background Gradient */}
            <div className={cn("absolute inset-0 bg-gradient-to-b", bannerStyle.background)} />

            {/* Banner pattern overlay */}
            {bannerStyle.pattern && (
                <div
                    className={cn("absolute inset-0 opacity-40", bannerStyle.animationClass)}
                    style={{
                        backgroundImage: bannerStyle.pattern,
                        backgroundSize: bannerStyle.patternSize || 'auto'
                    }}
                />
            )}

            {/* Level Badge - Top Left */}
            <div className="absolute top-3 left-3 z-20">
                <div className="w-12 h-14 rounded-lg bg-slate-900/90 border border-white/20 flex flex-col items-center justify-center shadow-lg">
                    <span className="text-[9px] font-black text-white/50 uppercase tracking-tight">LVL</span>
                    <span className="text-xl font-black text-white leading-none">{player.odLevel || 1}</span>
                </div>
            </div>

            {/* Role Badge - Top Right */}
            {(player.isIgl || player.isAnchor) && (
                <div className="absolute top-3 right-3 z-20">
                    {player.isIgl && (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/50">
                            <Crown className="w-5 h-5 text-white drop-shadow" />
                        </div>
                    )}
                    {player.isAnchor && !player.isIgl && (
                        <div className="w-10 h-10 rounded-lg bg-slate-800/90 border border-white/20 flex items-center justify-center shadow-lg">
                            <Anchor className="w-5 h-5 text-white/70" />
                        </div>
                    )}
                </div>
            )}

            {/* Score Badge - Top Center */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
                <div className={cn(
                    "px-3 py-1 rounded-full text-sm font-black",
                    "bg-black/70 backdrop-blur-sm border",
                    isWinner
                        ? "border-emerald-400/60 text-emerald-400"
                        : "border-rose-400/60 text-rose-400"
                )}>
                    +{player.score}
                </div>
            </div>

            {/* Main Content */}
            <div className="relative flex flex-col h-full pt-20 pb-0">
                {/* Avatar with colored ring */}
                <div className="flex-1 flex items-center justify-center">
                    <div className={cn(
                        "w-24 h-24 rounded-full flex items-center justify-center",
                        "bg-slate-900 shadow-2xl",
                        "ring-4 ring-offset-4 ring-offset-transparent",
                        getAvatarRingColor()
                    )}>
                        <span className="text-4xl font-black text-white">
                            {player.odName?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                    </div>
                </div>

                {/* Operation Badge - Below Avatar */}
                {player.slot && (
                    <div className="flex justify-center -mt-2 mb-3 relative z-10">
                        <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-lg font-black text-cyan-400 shadow-lg shadow-cyan-500/30">
                            {operationSymbols[player.slot] || '?'}
                        </div>
                    </div>
                )}

                {/* Bottom Info Bar */}
                <div className="bg-slate-900/90 backdrop-blur-sm p-4 border-t border-cyan-500/30">
                    <h3 className="text-base font-black uppercase tracking-wide text-center truncate text-white">
                        {player.odName}
                    </h3>
                    <p className="text-xs text-white/50 text-center truncate mt-0.5">
                        {player.odEquippedTitle
                            ? player.odEquippedTitle.replace(/^title[_-]?/i, '').replace(/[_-]/g, ' ')
                            : 'FlashMath Player'}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-semibold text-white/60">
                            Bronze I
                        </span>
                    </div>
                </div>

                {/* View Stats Button */}
                <button
                    onClick={() => onViewStats(player)}
                    className="w-full py-3 font-bold text-sm uppercase tracking-wider transition-all
                               bg-cyan-500/10 border-t border-cyan-500/30 text-cyan-400
                               hover:bg-cyan-500/20 hover:text-cyan-300"
                >
                    View Stats
                </button>
            </div>
        </motion.div>
    );
}

// Post-match award card - extracted to prevent recreation on re-render
interface AwardCardProps {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    player: PlayerState;
    value: string;
    color: 'amber' | 'cyan' | 'orange';
}

function AwardCard({ icon: Icon, title, player, value, color }: AwardCardProps) {
    const colorClasses = {
        amber: 'bg-amber-500/10 border-amber-500/40 text-amber-400',
        cyan: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400',
        orange: 'bg-orange-500/10 border-orange-500/40 text-orange-400',
    };
    const iconBgClasses = {
        amber: 'bg-gradient-to-br from-amber-400 to-amber-600',
        cyan: 'bg-gradient-to-br from-cyan-400 to-cyan-600',
        orange: 'bg-gradient-to-br from-orange-400 to-orange-600',
    };
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex items-center gap-4 p-4 rounded-xl border-2", colorClasses[color])}
        >
            <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shadow-lg",
                iconBgClasses[color]
            )}>
                <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider opacity-70">{title}</p>
                <p className="font-bold text-lg text-white truncate">{player.odName}</p>
            </div>
            <p className="font-black text-2xl">{value}</p>
        </motion.div>
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
    const socketRef = useRef<Socket | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const mockSimulatorRef = useRef<MockMatchSimulator | null>(null);
    const myTeamIdRef = useRef<string | null>(null); // To avoid stale closures in socket handlers
    const finalMatchStateRef = useRef<MatchState | null>(null); // Preserve state after match ends

    // Try to restore final state from sessionStorage on mount (handles page refreshes during post_match)
    useEffect(() => {
        if (typeof window !== 'undefined' && !finalMatchStateRef.current) {
            const stored = sessionStorage.getItem(`match_results_${matchId}`);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed.phase === 'post_match') {
                        console.log('[TeamMatch] Restored final state from sessionStorage');
                        finalMatchStateRef.current = parsed;
                    }
                } catch (e) {
                    console.error('[TeamMatch] Failed to parse stored match state');
                }
            }
        }
    }, [matchId]);
    
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
    // Question timeout warning state
    const [timeoutWarning, setTimeoutWarning] = useState<{
        active: boolean;
        secondsRemaining: number;
    } | null>(null);
    const [showTimeoutFlash, setShowTimeoutFlash] = useState(false);
    // Solo decision phase state (final round decision)
    const [soloDecisionPhase, setSoloDecisionPhase] = useState<{
        active: boolean;
        durationMs: number;
        myDecision: 'normal' | 'solo' | null;
        opponentDecision: 'normal' | 'solo' | null;
        myAnchorName: string;
        opponentAnchorName: string;
    } | null>(null);
    const [opponentLastResult, setOpponentLastResult] = useState<{
        isCorrect: boolean;
        pointsEarned: number;
    } | null>(null);
    const [showQuitConfirm, setShowQuitConfirm] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [resultsPage, setResultsPage] = useState(0); // 0 = winner, 1 = loser
    const [selectedPlayerStats, setSelectedPlayerStats] = useState<PlayerState | null>(null);
    
    // Points feed state for real-time scoring events
    const [pointsEvents, setPointsEvents] = useState<PointsEvent[]>([]);
    
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
    
    // Double Anchor slot indicator - tracks which slot has been targeted for Double Anchor
    const [doubleAnchorSlot, setDoubleAnchorSlot] = useState<string | null>(null); // Slot operation name
    const [doubleAnchorForRound, setDoubleAnchorForRound] = useState<number | null>(null); // Which round it applies to
    const [doubleAnchorBenchedPlayer, setDoubleAnchorBenchedPlayer] = useState<string | null>(null); // Who is benched
    const [doubleAnchorPlayerName, setDoubleAnchorPlayerName] = useState<string | null>(null); // Anchor player name
    const [phaseInitialDuration, setPhaseInitialDuration] = useState(0); // Initial duration when phase starts
    const lastPhaseRef = useRef<string | null>(null);
    
    // Round start countdown state
    const [showRoundCountdown, setShowRoundCountdown] = useState(false);
    const [roundCountdownSeconds, setRoundCountdownSeconds] = useState(5);

    // First-to-finish banner state
    const [firstToFinishBanner, setFirstToFinishBanner] = useState<{
        visible: boolean;
        teamName: string;
        bonus: number;
        isMyTeam: boolean;
        round: number;
    } | null>(null);

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

    // "Your turn starting" indicator for slot 1 players (no previous handoff)
    const [yourTurnStarting, setYourTurnStarting] = useState(false);
    
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
        
        // Navigate back to setup (use mode from match state if available)
        const mode = matchState?.mode || '5v5';
        router.push(`/arena/teams/setup?mode=${mode}`);
    }, [matchId, router, isLeaving, matchState?.mode]);

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
            console.log('[TeamMatch] Emitting join_team_match with effectivePartyId:', effectivePartyId || 'UNDEFINED');
            socket.emit('join_team_match', {
                matchId,
                userId: currentUserId,
                partyId: effectivePartyId,  // CRITICAL: Server needs this for PvP match lookup
            });
        });

        socket.on('match_state', (state: MatchState) => {
            console.log('[TeamMatch] Received match state:', state);

            // If we're already in post_match, don't update state (preserve results screen)
            if (finalMatchStateRef.current?.phase === 'post_match') {
                console.log('[TeamMatch] Ignoring match_state update - already in post_match');
                return;
            }

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
            // Play countdown tick sounds for last 5 seconds
            const secs = Math.ceil(data.remainingMs / 1000);
            if (secs <= 5 && secs > 0) {
                soundEngine.playCountdownTickIntense(secs);
            }
        });

        // STRATEGY PHASE: IGL slot assignment before match starts
        socket.on('strategy_phase_start', (data) => {
            console.log('[TeamMatch] Strategy phase started:', data);
            soundEngine.playGo();
            
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

            // Update match phase AND slotOperations/mode from strategy phase data
            setMatchState(prev => prev ? { 
                ...prev, 
                phase: 'strategy',
                mode: data.mode || prev.mode,
                slotOperations: data.slotOperations || prev.slotOperations,
            } : prev);
        });
        
        socket.on('strategy_time_update', (data) => {
            setStrategyPhase(prev => prev ? { ...prev, remainingMs: data.remainingMs } : prev);
        });
        
        socket.on('slot_assignments_updated', (data: {
            slots: Record<string, string>;  // { operation: playerId } mapping
            teamId?: string;
            swapDetails?: {
                type: 'swap' | 'move';
                player1Name?: string;
                player1OldSlot?: string;
                player1NewSlot?: string;
                player2Name?: string;
                player2OldSlot?: string;
                player2NewSlot?: string;
                playerName?: string;
                oldSlot?: string;
                newSlot?: string;
            };
            phase?: string;
        }) => {
            console.log('[TeamMatch] Slot assignments updated:', data);
            
            // Update strategy phase slots - need to rebuild the mySlots structure
            // data.slots is { operation: playerId }, we need { playerId: SlotAssignment }
            setStrategyPhase(prev => {
                if (!prev) return prev;
                
                // Build a new mySlots object from the updated assignments
                // We need to preserve player metadata (name, level, cosmetics) from existing data
                const existingPlayerData: Record<string, SlotAssignment> = {};
                
                // First, collect all existing player data by playerId
                for (const [playerId, assignment] of Object.entries(prev.mySlots)) {
                    existingPlayerData[playerId] = assignment;
                }
                
                // Now rebuild mySlots with updated slot assignments
                const newMySlots: Record<string, SlotAssignment> = {};
                
                for (const [operation, playerId] of Object.entries(data.slots)) {
                    const existingData = existingPlayerData[playerId];
                    if (existingData) {
                        // Preserve player data, update slot
                        newMySlots[playerId] = {
                            ...existingData,
                            slot: operation,
                        };
                    } else {
                        // Player not found in existing data - use defaults
                        // This shouldn't normally happen, but handle gracefully
                        newMySlots[playerId] = {
                            slot: operation,
                            name: 'Unknown',
                            level: 1,
                            isIgl: false,
                            isAnchor: false,
                            banner: 'default',
                            frame: 'default',
                            title: 'Player',
                        };
                    }
                }
                
                return { ...prev, mySlots: newMySlots };
            });
            
            // Show notification for halftime slot reassignments
            if (data.phase === 'halftime' && data.swapDetails) {
                const operationSymbols: Record<string, string> = {
                    'addition': '+',
                    'subtraction': '−',
                    'multiplication': '×',
                    'division': '÷',
                    'mixed': '±'
                };
                
                if (data.swapDetails.type === 'swap') {
                    const slot1Symbol = operationSymbols[data.swapDetails.player1NewSlot || ''] || data.swapDetails.player1NewSlot;
                    const slot2Symbol = operationSymbols[data.swapDetails.player2NewSlot || ''] || data.swapDetails.player2NewSlot;
                    toast.info('🔄 Slot Reassignment', {
                        description: `${data.swapDetails.player1Name} → ${slot1Symbol} | ${data.swapDetails.player2Name} → ${slot2Symbol}`,
                        duration: 5000,
                    });
                } else if (data.swapDetails.type === 'move') {
                    const newSlotSymbol = operationSymbols[data.swapDetails.newSlot || ''] || data.swapDetails.newSlot;
                    toast.info('🔄 Slot Reassignment', {
                        description: `${data.swapDetails.playerName} moved to ${newSlotSymbol}`,
                        duration: 5000,
                    });
                }
            }
            
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
                    player.isComplete = false; // Reset complete flag when player becomes active again
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
            if (data.userId === currentUserId) {
                // Play correct/incorrect sound for own answer
                if (data.isCorrect) {
                    soundEngine.playCorrect();
                    // Check for streak milestones
                    if (data.newStreak === 3) soundEngine.playStreakMilestone(3);
                    else if (data.newStreak === 5) soundEngine.playStreakMilestone(5);
                    else if (data.newStreak === 10) soundEngine.playStreakMilestone(10);
                } else {
                    soundEngine.playIncorrect();
                }

                setLastAnswerResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                    answerTimeMs: Date.now(), // TODO: Get actual time from server
                });
                setCurrentInput('');

                // Clear result after a delay
                setTimeout(() => setLastAnswerResult(null), 600);
            } else if (myTeam && data.teamId === myTeam.teamId && data.userId !== currentUserId) {
                // Teammate answer result - play sound for correct/incorrect
                if (data.isCorrect) {
                    soundEngine.playTeammateCorrect();
                } else {
                    // Play a subtle incorrect sound for teammate miss
                    soundEngine.playIncorrect();
                }

                // Teammate answer result - show it to all teammates (including active player)
                setTeammateLastAnswerResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                    answerTimeMs: Date.now(),
                });
                // Clear after delay - longer so it's more noticeable
                setTimeout(() => setTeammateLastAnswerResult(null), 2500);
            } else if (opponentTeam && data.teamId === opponentTeam.teamId) {
                setOpponentLastResult({
                    isCorrect: data.isCorrect,
                    pointsEarned: data.pointsEarned,
                });
                // Longer timeout so it's more noticeable
                setTimeout(() => setOpponentLastResult(null), 2500);
            }
            
            // Update scores, questionsInSlot, AND track correct/total/answerTime for halftime stats
            // Also add to points feed using current matchState
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                const team = newState.team1.teamId === data.teamId ? newState.team1 : newState.team2;
                const myTeamIdFromState = prev.isMyTeam;
                const player = team.players[data.userId];
                
                // Add to points feed (capture values before mutation)
                if (player) {
                    const event = createPointsEventFromResult(
                        {
                            teamId: data.teamId,
                            userId: data.userId,
                            isCorrect: data.isCorrect,
                            pointsEarned: data.pointsEarned,
                            speedBonus: data.speedBonus,
                            streakMilestoneBonus: data.streakMilestoneBonus,
                            teamStreak: data.teamStreak,
                            newStreak: data.newStreak,
                        },
                        team.teamName || 'Team',
                        player.odName || 'Player',
                        myTeamIdFromState || ''
                    );
                    // Use setTimeout to defer state update (can't call setPointsEvents during render)
                    setTimeout(() => {
                        setPointsEvents(prevEvents => [...prevEvents.slice(-49), event]);
                    }, 0);
                }
                
                team.score = data.newTeamScore;
                team.currentStreak = data.newStreak;
                team.questionsInSlot = data.questionsInSlot; // Update team-specific progress
                if (team.players[data.userId]) {
                    team.players[data.userId].score = data.newPlayerScore;
                    team.players[data.userId].streak = data.newStreak;
                    // Update maxStreak if current streak is higher
                    if (data.newStreak > (team.players[data.userId].maxStreak || 0)) {
                        team.players[data.userId].maxStreak = data.newStreak;
                    }
                    // Track correct/total for accuracy calculation (halftime stats)
                    team.players[data.userId].total = (team.players[data.userId].total || 0) + 1;
                    if (data.isCorrect) {
                        team.players[data.userId].correct = (team.players[data.userId].correct || 0) + 1;
                    }
                    // Track answer time for avg speed calculation (works for ALL players, including opponents)
                    if (data.answerTimeMs) {
                        team.players[data.userId].totalAnswerTimeMs = 
                            (team.players[data.userId].totalAnswerTimeMs || 0) + data.answerTimeMs;
                    }
                    
                    // If this was the 5th question (slot complete), clear the player's active state
                    // This prevents showing the question input while waiting for slot transition
                    if (data.questionsInSlot >= 5) {
                        team.players[data.userId].isActive = false;
                        team.players[data.userId].currentQuestion = null;
                        team.players[data.userId].isComplete = true;
                    }
                }
                return newState;
            });
        });

        socket.on('teammate_answer', (data) => {
            console.log('[TeamMatch] Teammate answer:', data);
            setTeammateTyping(null);
            
            // Track answer time for average speed calculation (used in halftime stats)
            if (data.answerTimeMs && data.userId) {
                setMatchState(prev => {
                    if (!prev) return prev;
                    const newState = JSON.parse(JSON.stringify(prev));
                    
                    // Find which team the user is on
                    const team = newState.team1.players[data.userId] 
                        ? newState.team1 
                        : newState.team2.players[data.userId] 
                            ? newState.team2 
                            : null;
                    
                    if (team && team.players[data.userId]) {
                        team.players[data.userId].totalAnswerTimeMs = 
                            (team.players[data.userId].totalAnswerTimeMs || 0) + data.answerTimeMs;
                    }
                    
                    return newState;
                });
            }
        });

        // Question timeout warning - starts countdown before timeout
        socket.on('timeout_warning', (data: {
            matchId: string;
            playerId: string;
            remainingMs: number;
            countdownSeconds: number;
        }) => {
            console.log('[TeamMatch] Timeout warning:', data);
            if (data.playerId === currentUserId) {
                setTimeoutWarning({
                    active: true,
                    secondsRemaining: data.countdownSeconds,
                });
                // Play warning sound
                soundEngine.playCountdownTickIntense(data.countdownSeconds);

                // Start countdown interval
                const interval = setInterval(() => {
                    setTimeoutWarning(prev => {
                        if (!prev || prev.secondsRemaining <= 1) {
                            clearInterval(interval);
                            return null;
                        }
                        const newSeconds = prev.secondsRemaining - 1;
                        soundEngine.playCountdownTickIntense(newSeconds);
                        return { ...prev, secondsRemaining: newSeconds };
                    });
                }, 1000);
            }
        });

        // Question timeout - player didn't answer in time
        socket.on('question_timeout', (data: {
            matchId: string;
            playerId: string;
            playerName: string;
            correctAnswer: number;
            question: string;
            timeoutsInSlot: number;
            questionsInSlot: number;
            questionsPerSlot: number;
            streak: number;
            teamStreak?: number;
            pointsLost?: number;
            newPlayerScore?: number;
            newTeamScore?: number;
        }) => {
            console.log('[TeamMatch] Question timeout:', data);
            if (data.playerId === currentUserId) {
                // Clear any active warning
                setTimeoutWarning(null);
                // Show timeout flash
                setShowTimeoutFlash(true);
                setTimeout(() => setShowTimeoutFlash(false), 1500);
                // Play timeout sound
                soundEngine.playIncorrect();
                // Clear input
                setCurrentInput('');
                // Show toast with correct answer
                toast.error(`Time's up! Answer was ${data.correctAnswer}`, {
                    duration: 2000,
                });
                
                // Update questionsInSlot to update progress dots and player stats
                // Also add timeout event to points feed using current matchState
                setMatchState(prev => {
                    if (!prev) return prev;
                    const newState = JSON.parse(JSON.stringify(prev));
                    const myTeamIdFromState = prev.isMyTeam;
                    
                    // Find the team and update questionsInSlot
                    for (const team of [newState.team1, newState.team2]) {
                        if (team.players[currentUserId]) {
                            // Add timeout event to points feed
                            const event = createTimeoutEvent(
                                team.teamId,
                                team.teamName || 'My Team',
                                data.playerName,
                                data.pointsLost || 3,
                                myTeamIdFromState || ''
                            );
                            setTimeout(() => {
                                setPointsEvents(prevEvents => [...prevEvents.slice(-49), event]);
                            }, 0);
                            
                            team.questionsInSlot = data.questionsInSlot;
                            // Update scores if provided
                            if (data.newTeamScore !== undefined) {
                                team.score = data.newTeamScore;
                            }
                            // Also update player's total (for accuracy tracking)
                            if (team.players[currentUserId]) {
                                team.players[currentUserId].total = (team.players[currentUserId].total || 0) + 1;
                                team.players[currentUserId].streak = 0; // Timeout breaks streak
                                if (data.newPlayerScore !== undefined) {
                                    team.players[currentUserId].score = data.newPlayerScore;
                                }
                            }
                            // Reset team streak on timeout
                            team.currentStreak = 0;
                            break;
                        }
                    }
                    
                    return newState;
                });
            }
        });

        // Teammate timeout notification
        socket.on('teammate_timeout', (data: {
            playerId: string;
            playerName: string;
            timeoutsInSlot: number;
            pointsLost?: number;
            newTeamScore?: number;
        }) => {
            console.log('[TeamMatch] Teammate timeout:', data);
            if (data.playerId !== currentUserId) {
                toast.warning(`${data.playerName} timed out!`, {
                    duration: 1500,
                });
                
                // Add timeout event to points feed and update team score using current matchState
                setMatchState(prev => {
                    if (!prev) return prev;
                    const newState = JSON.parse(JSON.stringify(prev));
                    const myTeamIdFromState = prev.isMyTeam;
                    
                    // Find my team (the team that had the timeout)
                    const myTeamData = newState.team1.teamId === myTeamIdFromState ? newState.team1 : newState.team2;
                    
                    // Add timeout event to points feed
                    const event = createTimeoutEvent(
                        myTeamData.teamId,
                        myTeamData.teamName || 'My Team',
                        data.playerName,
                        data.pointsLost || 3,
                        myTeamIdFromState || ''
                    );
                    setTimeout(() => {
                        setPointsEvents(prevEvents => [...prevEvents.slice(-49), event]);
                    }, 0);
                    
                    // Update team score if provided
                    if (data.newTeamScore !== undefined) {
                        myTeamData.score = data.newTeamScore;
                        myTeamData.currentStreak = 0; // Reset team streak
                    }
                    
                    return newState;
                });
            }
        });

        // First to finish round bonus - team completed round before opponent
        socket.on('first_to_finish_bonus', (data: {
            teamId: string;
            teamName: string;
            bonus: number;
            newTeamScore: number;
            round: number;
        }) => {
            console.log('[TeamMatch] First to finish bonus:', data);

            // Update team score and add to points feed using current matchState
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                const myTeamIdFromState = prev.isMyTeam;
                const team = newState.team1.teamId === data.teamId ? newState.team1 : newState.team2;
                const isMyTeamEvent = data.teamId === myTeamIdFromState;

                // Add to points feed
                const event = createFirstToFinishEvent(
                    data.teamId,
                    data.teamName,
                    data.bonus,
                    data.round,
                    myTeamIdFromState || ''
                );
                setTimeout(() => {
                    setPointsEvents(prevEvents => [...prevEvents.slice(-49), event]);
                }, 0);

                // Show prominent banner instead of just a toast
                setTimeout(() => {
                    setFirstToFinishBanner({
                        visible: true,
                        teamName: data.teamName,
                        bonus: data.bonus,
                        isMyTeam: isMyTeamEvent,
                        round: data.round,
                    });
                    // Hide banner after 3 seconds (matches ROUND_END_DELAY_MS)
                    setTimeout(() => {
                        setFirstToFinishBanner(null);
                    }, 3000);
                }, 0);

                team.score = data.newTeamScore;
                return newState;
            });
        });

        // New question after timeout - update the question for the active player
        socket.on('new_question', (data: {
            question: { question: string; answer: number; operation?: string };
            questionNumber: number;
            totalQuestions: number;
            slot: number;
            operation: string;
            afterTimeout?: boolean;
        }) => {
            console.log('[TeamMatch] New question (after timeout):', data);
            console.log('[TeamMatch] Updating question for userId:', currentUserId, 'to:', data.question.question);
            
            // Update the player's current question in match state
            // This is sent only to the player who timed out, so currentUserId is correct
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));

                // Find which team the current user is on
                let foundPlayer = false;
                for (const team of [newState.team1, newState.team2]) {
                    const player = team.players[currentUserId];
                    if (player) {
                        // Update the question - keep player active
                        player.isActive = true;
                        player.isComplete = false;
                        player.currentQuestion = {
                            question: data.question.question,
                            operation: data.operation,
                        };
                        foundPlayer = true;
                        console.log('[TeamMatch] Updated player question in state:', player.odName, '->', data.question.question);
                        break;
                    }
                }
                
                if (!foundPlayer) {
                    console.warn('[TeamMatch] Could not find player in state for new_question. userId:', currentUserId);
                }

                return newState;
            });
        });

        // =================================================================
        // SOLO DECISION PHASE (Final Round Anchor Solo Decision)
        // =================================================================

        // Solo decision phase started - IGL must choose Normal vs Anchor Solo
        socket.on('solo_decision_phase', (data: {
            round: number;
            half: number;
            nextRound: number;
            durationMs: number;
            team1: { teamId: string; teamName: string; iglId: string; anchorId: string; anchorName: string };
            team2: { teamId: string; teamName: string; iglId: string; anchorId: string; anchorName: string };
        }) => {
            console.log('[TeamMatch] Solo decision phase started:', data);
            soundEngine.playGo(); // Play attention sound
            
            // Determine which team is mine
            setMatchState(prev => {
                if (!prev) return prev;
                const isTeam1 = Object.keys(prev.team1.players).includes(currentUserId);
                const myTeamData = isTeam1 ? data.team1 : data.team2;
                const opponentTeamData = isTeam1 ? data.team2 : data.team1;
                
                setSoloDecisionPhase({
                    active: true,
                    durationMs: data.durationMs,
                    myDecision: null,
                    opponentDecision: null,
                    myAnchorName: myTeamData.anchorName,
                    opponentAnchorName: opponentTeamData.anchorName,
                });
                
                return { ...prev, phase: 'anchor_decision' };
            });
        });

        // A team made their solo decision
        socket.on('solo_decision_made', (data: {
            teamId: string;
            teamName: string;
            decision: 'normal' | 'solo';
            anchorId: string;
            anchorName: string;
            autoSelected?: boolean;
        }) => {
            console.log('[TeamMatch] Solo decision made:', data);
            
            setMatchState(prev => {
                if (!prev) return prev;
                const isMyTeam = 
                    (prev.team1.teamId === data.teamId && Object.keys(prev.team1.players).includes(currentUserId)) ||
                    (prev.team2.teamId === data.teamId && Object.keys(prev.team2.players).includes(currentUserId));
                
                setSoloDecisionPhase(phase => {
                    if (!phase) return phase;
                    if (isMyTeam) {
                        return { ...phase, myDecision: data.decision };
                    } else {
                        return { ...phase, opponentDecision: data.decision };
                    }
                });
                
                return prev;
            });
            
            if (data.autoSelected) {
                toast.info(`${data.teamName} auto-selected NORMAL (timeout)`, { duration: 2000 });
            }
        });

        // Both teams' decisions revealed
        socket.on('solo_decisions_revealed', (data: {
            team1: { teamId: string; teamName: string; decision: string; anchorName: string; anchorSoloActive: boolean };
            team2: { teamId: string; teamName: string; decision: string; anchorName: string; anchorSoloActive: boolean };
        }) => {
            console.log('[TeamMatch] Solo decisions revealed:', data);
            soundEngine.playGo();
            
            // Show toast with both decisions
            const team1Msg = data.team1.anchorSoloActive 
                ? `${data.team1.teamName}: ANCHOR SOLO (${data.team1.anchorName})` 
                : `${data.team1.teamName}: NORMAL`;
            const team2Msg = data.team2.anchorSoloActive 
                ? `${data.team2.teamName}: ANCHOR SOLO (${data.team2.anchorName})` 
                : `${data.team2.teamName}: NORMAL`;
            
            toast.info(`Final Round: ${team1Msg} vs ${team2Msg}`, { duration: 3000 });
            
            // Close the decision modal
            setSoloDecisionPhase(null);
        });

        socket.on('slot_change', (data: {
            teamId: string;
            currentSlot: number;
            slotOperation: string;
            activePlayerId?: string;
            activePlayerName?: string;
            questionText?: string;
            questionId?: string;
        }) => {
            console.log('[TeamMatch] Slot change:', data);
            console.log('[TeamMatch] Slot change has question:', !!data.questionText, 'questionText:', data.questionText);
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                
                // Helper to update a team
                const updateTeam = (team: typeof newState.team1) => {
                    team.currentSlot = data.currentSlot;
                    team.questionsInSlot = 0; // Reset questions for new slot
                    // Reset isComplete and update isActive for all players on this team
                    for (const playerId of Object.keys(team.players)) {
                        team.players[playerId].isComplete = false;
                        // Set isActive based on activePlayerId from server
                        const isActive = playerId === data.activePlayerId;
                        team.players[playerId].isActive = isActive;
                        
                        // If this is the active player AND we have a question, set it immediately
                        // This prevents the "Relay in progress..." flash when it's the human's turn
                        if (isActive && data.questionText) {
                            console.log('[TeamMatch] Setting question from slot_change for player:', playerId, 'question:', data.questionText);
                            team.players[playerId].currentQuestion = {
                                question: data.questionText,
                                operation: data.slotOperation,
                            };
                        }
                    }
                };
                
                // Update the specific team's currentSlot
                if (data.teamId === newState.team1.teamId) {
                    updateTeam(newState.team1);
                } else if (data.teamId === newState.team2.teamId) {
                    updateTeam(newState.team2);
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
            
            // Show non-blocking "YOUR TURN" notification if this is for the current user
            const isMyTurn = data.nextPlayerId === currentUserId;
            
            if (isMyTurn) {
                // Play sound and show brief notification - doesn't block input
                soundEngine.playYourTurn();
                setYourTurnStarting(true);
                setTimeout(() => setYourTurnStarting(false), 1500);
            }
            // NOTE: Removed blocking RelayHandoff animation
        });

        // Round complete - brief pause before break to show results
        socket.on('round_complete', (data: {
            round: number;
            half: number;
            team1Score: number;
            team2Score: number;
            team1Name: string;
            team2Name: string;
            delayMs: number;
        }) => {
            console.log('[TeamMatch] Round complete:', data);
            // Show round complete toast so players can see the results
            const team1Lead = data.team1Score > data.team2Score;
            const tie = data.team1Score === data.team2Score;
            toast.info(
                `Round ${data.round} Complete! ${tie ? 'Tied' : team1Lead ? `${data.team1Name} leads` : `${data.team2Name} leads`}`,
                { duration: data.delayMs }
            );
        });

        socket.on('round_break', (data) => {
            console.log('[TeamMatch] Round break:', data);
            soundEngine.playRoundEnd();
            const breakDuration = data.breakDurationMs || 10000; // Default 10 seconds
            setBreakCountdownMs(breakDuration);
            // Set phaseInitialDuration directly for correct TacticalBreakPanel countdown
            setPhaseInitialDuration(breakDuration);
            
            // Clear Double Anchor indicator after the target round completes
            // data.completedRound tells us which round just finished
            setDoubleAnchorSlot(null);
            setDoubleAnchorForRound(null);
            setDoubleAnchorBenchedPlayer(null);
            setDoubleAnchorPlayerName(null);
            
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                // Clear isActive for all players during break (no one is answering)
                for (const playerId of Object.keys(newState.team1.players)) {
                    newState.team1.players[playerId].isActive = false;
                }
                for (const playerId of Object.keys(newState.team2.players)) {
                    newState.team2.players[playerId].isActive = false;
                }
                // Update relayClockMs to break duration so phaseInitialDuration captures the correct value
                return { ...newState, phase: 'break', relayClockMs: breakDuration };
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
            soundEngine.playTimeout();
            // Use the server's calculated total duration if available, otherwise add extension
            if (data.newBreakDurationMs) {
                setBreakCountdownMs(data.newBreakDurationMs);
                // Also update phaseInitialDuration so the countdown timer shows the new extended duration
                setPhaseInitialDuration(data.newBreakDurationMs);
            } else {
                setBreakCountdownMs(prev => prev + (data.extensionMs || 60000));
                // Update phaseInitialDuration with the new extended duration
                setPhaseInitialDuration(prev => prev + (data.extensionMs || 60000));
            }
            setTimeoutsRemaining(data.timeoutsRemaining ?? 1);
        });

        socket.on('halftime', (data) => {
            console.log('[TeamMatch] Halftime:', data);
            soundEngine.playHalftime();
            const halftimeDuration = data.halftimeDurationMs || 120000; // Default 2 minutes
            setBreakCountdownMs(halftimeDuration);
            // IMPORTANT: Also set phaseInitialDuration directly since the useEffect depends on relayClockMs
            setPhaseInitialDuration(halftimeDuration);
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                // Clear isActive for all players during halftime (no one is answering)
                for (const playerId of Object.keys(newState.team1.players)) {
                    newState.team1.players[playerId].isActive = false;
                }
                for (const playerId of Object.keys(newState.team2.players)) {
                    newState.team2.players[playerId].isActive = false;
                }
                // Update relayClockMs to halftime duration so phaseInitialDuration captures the correct value
                return { ...newState, phase: 'halftime', relayClockMs: halftimeDuration };
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
            soundEngine.playDoubleCallin();

            // Update the appropriate half's usage state
            if (data.half === 1) {
                setUsedDoubleCallinHalf1(true);
            } else {
                setUsedDoubleCallinHalf2(true);
            }
            
            // Store Double Anchor slot info for visual indicator on slot card
            const slotName = typeof data.targetSlot === 'string' ? data.targetSlot.toLowerCase() : '';
            setDoubleAnchorSlot(slotName);
            setDoubleAnchorForRound(data.forRound);
            setDoubleAnchorBenchedPlayer(data.benchedPlayerName);
            setDoubleAnchorPlayerName(data.anchorName);
            
            // Map slot name to operation symbol for cleaner display
            const slotSymbols: Record<string, string> = {
                'addition': '+',
                'subtraction': '−',
                'multiplication': '×',
                'division': '÷',
                'mixed': '±'
            };
            const slotSymbol = slotSymbols[slotName] || data.targetSlot;
            
            // Show a detailed toast notification with anchor icon
            toast.success('⚓ Double Anchor Activated!', {
                description: (
                    <div className="space-y-1">
                        <div className="font-bold text-primary">{data.anchorName}</div>
                        <div>will play the <span className="font-bold text-white">{slotSymbol}</span> slot</div>
                        <div className="text-sm opacity-80">
                            (replacing {data.benchedPlayerName} in Round {data.forRound})
                        </div>
                    </div>
                ),
                duration: 8000,
                icon: <Anchor className="w-5 h-5 text-primary" />,
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
                const newState = JSON.parse(JSON.stringify(prev));
                newState.phase = 'round_countdown';
                newState.round = data.round;
                newState.half = data.half;
                
                // Reset isComplete for all players when round countdown starts
                // This clears the "SLOT COMPLETE!" message from the previous round
                for (const playerId of Object.keys(newState.team1.players)) {
                    newState.team1.players[playerId].isComplete = false;
                }
                for (const playerId of Object.keys(newState.team2.players)) {
                    newState.team2.players[playerId].isComplete = false;
                }
                
                return newState;
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

            // Check if current user is the slot 1 player - must check BEFORE state update
            setMatchState(prev => {
                if (!prev) return prev;

                // Find the user's team and check if they're slot 1
                const myTeamKey = prev.team1.players[currentUserId] ? 'team1' : 'team2';
                const myTeam = prev[myTeamKey];
                const myPlayer = myTeam?.players[currentUserId];

                // If user is the slot 1 player (addition), show "your turn" indicator FIRST
                if (myPlayer?.slot?.toLowerCase() === 'addition') {
                    // Use setTimeout to ensure this runs after state update completes
                    setTimeout(() => {
                        soundEngine.playYourTurn();
                        setYourTurnStarting(true);
                        setTimeout(() => setYourTurnStarting(false), 2000);
                    }, 0);
                }

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
                
                // Reset isComplete for ALL players on both teams at round start
                for (const playerId of Object.keys(newState.team1.players)) {
                    newState.team1.players[playerId].isComplete = false;
                }
                for (const playerId of Object.keys(newState.team2.players)) {
                    newState.team2.players[playerId].isComplete = false;
                }
                
                return newState;
            });
        });

        socket.on('clock_update', (data) => {
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

            // Determine win/lose and play appropriate sound
            setMatchState(prev => {
                if (!prev) return prev;
                const newState = JSON.parse(JSON.stringify(prev));
                const myTeam = newState.team1.players[currentUserId] ? newState.team1 : newState.team2;
                const opTeam = newState.team1.players[currentUserId] ? newState.team2 : newState.team1;
                if (myTeam.score > opTeam.score) {
                    soundEngine.playVictory();
                } else if (myTeam.score < opTeam.score) {
                    soundEngine.playDefeat();
                } else {
                    // Tie - play a more neutral sound
                    soundEngine.playRoundEnd();
                }
                // Clear isActive for all players (match is over)
                for (const playerId of Object.keys(newState.team1.players)) {
                    newState.team1.players[playerId].isActive = false;
                }
                for (const playerId of Object.keys(newState.team2.players)) {
                    newState.team2.players[playerId].isActive = false;
                }
                const finalState = { ...newState, phase: 'post_match' as const };
                // Save final state to ref so it's preserved even if server cleans up
                finalMatchStateRef.current = finalState;
                // Also save to sessionStorage for extra persistence
                try {
                    sessionStorage.setItem(`match_results_${matchId}`, JSON.stringify(finalState));
                    console.log('[TeamMatch] Saved final state to sessionStorage');
                } catch (e) {
                    console.error('[TeamMatch] Failed to save to sessionStorage');
                }
                return finalState;
            });

            // Results are now shown inline - no redirect needed
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
                // Team voted to quit - DO NOT redirect here
                // The server will send team_forfeit event which sets phase to post_match
                // Results will be shown inline, user clicks "Back to Arena" to leave
                console.log('[TeamMatch] Quit vote passed - waiting for team_forfeit event to show results inline');
                // Clear the vote UI after a moment
                setTimeout(() => {
                    setQuitVote(null);
                    setHasVoted(false);
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
            // Show forfeit notification - results shown inline, no redirect
            setMatchState(prev => {
                if (!prev) return prev;
                const finalState = { ...prev, phase: 'post_match' as const, forfeitedBy: data.forfeitingTeamId };
                // Save final state to ref and sessionStorage
                finalMatchStateRef.current = finalState;
                try {
                    sessionStorage.setItem(`match_results_${matchId}`, JSON.stringify(finalState));
                    console.log('[TeamMatch] Saved forfeit state to sessionStorage');
                } catch (e) {
                    console.error('[TeamMatch] Failed to save forfeit state to sessionStorage');
                }
                return finalState;
            });
            // No redirect - results shown inline, user clicks "Back to Arena" when ready
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
            
            // Show round start countdown ONLY when phase is exactly 'round_countdown'
            // Do NOT show during break/halftime even if showRoundCountdown state is stale
            if (matchState.phase === 'round_countdown') {
                setShowRoundCountdown(true);
            } else if (matchState.phase === 'break' || matchState.phase === 'halftime' || matchState.phase === 'active') {
                // Explicitly hide during break, halftime, and active phases
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

            // Find the incoming player by their assigned slot (the slot that's NOW active)
            const incomingSlotOp = operations[currentSlot - 1];
            const incomingPlayerData = players.find(p => p.slot?.toLowerCase() === incomingSlotOp);

            // Find the outgoing player by their assigned slot (the slot that just finished)
            const outgoingSlotOp = operations[previousSlotRef.current - 1];
            const outgoingPlayerData = players.find(p => p.slot?.toLowerCase() === outgoingSlotOp);

            // Use the slot position to determine the operation label
            const outgoingSlotLabel = SLOT_LABELS[previousSlotRef.current - 1] || 'Unknown';
            const incomingSlotLabel = SLOT_LABELS[currentSlot - 1] || 'Unknown';

            // Check if the current user is the incoming player (their slot matches the new current slot)
            const isIncomingCurrentUser = incomingPlayerData?.odUserId === currentUserId;

            // If current user is the incoming player, show brief "YOUR TURN!" notification
            // This is non-blocking - the QuestionAnswerCard shows immediately
            if (isIncomingCurrentUser) {
                soundEngine.playYourTurn();
                setYourTurnStarting(true);
                // Short notification duration - doesn't block input
                setTimeout(() => setYourTurnStarting(false), 1500);
            } else if (outgoingPlayerData || incomingPlayerData) {
                // Play sound for relay transitions (even when not your turn)
                soundEngine.playRelayHandoff();
            }
            // NOTE: Removed RelayHandoff animation - input is now immediately available
        }
        
        previousSlotRef.current = currentSlot;
    }, [matchState?.phase, myTeam?.currentSlot, myTeam, currentUserId]);


    // Handle solo decision (IGL only)
    const handleSoloDecision = useCallback((decision: 'normal' | 'solo') => {
        if (!socketRef.current || !matchState) return;
        
        socketRef.current.emit('anchor_solo_decision', {
            matchId,
            userId: currentUserId,
            decision,
        });
        
        console.log(`[TeamMatch] Solo decision submitted: ${decision}`);
    }, [matchId, currentUserId, matchState]);

    // Handle answer submission
    const handleSubmit = useCallback((answer?: string) => {
        const answerToSubmit = answer?.trim() || currentInput.trim();
        if (!answerToSubmit || !isMyTurn) return;

        // Clear timeout warning since we're submitting
        setTimeoutWarning(null);

        // For demo mode, simulate answer result
        if (isDemoMode && mockSimulatorRef.current) {
            const result = mockSimulatorRef.current.submitAnswer(answerToSubmit);
            setLastAnswerResult({
                isCorrect: result.correct,
                pointsEarned: result.points,
                correctAnswer: undefined,
            });
            // Clear result after delay
            setTimeout(() => setLastAnswerResult(null), 600);
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

    // Use the effective match state - prefer stored final state if we're in post_match
    // This ensures results screen stays visible even after server cleanup
    const effectiveMatchState = matchState || finalMatchStateRef.current;

    // Debug logging for post-match state preservation
    if (typeof window !== 'undefined' && (matchState?.phase === 'post_match' || finalMatchStateRef.current?.phase === 'post_match')) {
        console.log('[TeamMatch] Post-match state check:', {
            connected,
            hasMatchState: !!matchState,
            matchPhase: matchState?.phase,
            hasFinalRef: !!finalMatchStateRef.current,
            finalRefPhase: finalMatchStateRef.current?.phase,
            hasEffective: !!effectiveMatchState,
        });
    }

    // Loading state - but not if we have final results stored
    if ((!connected || !effectiveMatchState) && !finalMatchStateRef.current) {
        console.log('[TeamMatch] Showing loading screen - no final state stored');
        console.log('[TeamMatch] State:', { connected, effectiveMatchState: !!effectiveMatchState, finalRef: !!finalMatchStateRef.current });
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
                        onClick={() => {
                            // Use search param mode or default to 5v5
                            const mode = searchParams.get('mode') || '5v5';
                            router.push(`/arena/teams/setup?mode=${mode}&fromQueue=true`);
                        }}
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

    // If we have final state but no current state (server cleaned up), use final state
    const displayMatchState = effectiveMatchState!;

    // During post_match, anyone can leave directly (match is over)
    const isPostMatch = displayMatchState.phase === 'post_match';
    const canLeaveDirectly = isSoloHumanWithAI || isPostMatch;

    // Derive team states from displayMatchState for consistent rendering
    const renderedMyTeam = displayMatchState.team1.players[currentUserId]
        ? displayMatchState.team1
        : displayMatchState.team2.players[currentUserId]
            ? displayMatchState.team2
            : null;
    const renderedOpponentTeam = renderedMyTeam === displayMatchState.team1
        ? displayMatchState.team2
        : displayMatchState.team1;

    // Pre-match waiting state
    if (displayMatchState.phase === 'pre_match') {
        // Count connected players
        const team1Connected = Object.values(displayMatchState.team1.players).filter(p => p.odUserId).length;
        const team2Connected = Object.values(displayMatchState.team2.players).filter(p => p.odUserId).length;
        const isAIMatch = displayMatchState.team2.teamId?.startsWith('ai_team_') || displayMatchState.team2.teamId?.startsWith('ai_party_');
        
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
                isCurrentUser: userId === currentUserId,
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
                    {/* Leave Button - Top Left Corner */}
                    <button
                        onClick={() => setShowQuitConfirm(true)}
                        className="fixed top-4 left-4 z-50 px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30
                                   text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/50
                                   transition-all inline-flex items-center gap-2 text-sm backdrop-blur-sm"
                    >
                        <ArrowLeft className="w-3 h-3" />
                        Leave Match
                    </button>

                    {/* Header - MATCH STARTS IN countdown */}
                    <motion.div
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-3"
                    >
                        <h1 className="text-xl md:text-2xl font-black italic text-white/90 tracking-wide mb-1">
                            MATCH STARTS IN...
                        </h1>
                        {preMatchCountdownMs !== null ? (() => {
                            const secs = Math.ceil(preMatchCountdownMs / 1000);
                            const isUrgent = secs <= 3;
                            const isMedium = secs <= 5 && secs > 3;
                            const textColor = isUrgent ? 'text-orange-400' : isMedium ? 'text-amber-300' : 'text-white';
                            const shadowColor = isUrgent ? 'drop-shadow-[0_0_40px_rgba(249,115,22,0.8)]' : isMedium ? 'drop-shadow-[0_0_35px_rgba(251,191,36,0.6)]' : 'drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]';
                            return (
                                <motion.div
                                    key={secs}
                                    initial={{ scale: 1.3, opacity: 0 }}
                                    animate={{ scale: isUrgent ? [1, 1.15, 1] : 1, opacity: 1 }}
                                    transition={isUrgent ? { scale: { duration: 0.4, repeat: Infinity } } : {}}
                                    className="relative"
                                >
                                    {isUrgent && (
                                        <motion.div
                                            className="absolute inset-0 blur-2xl bg-orange-500/40 rounded-full"
                                            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
                                            transition={{ duration: 0.4, repeat: Infinity }}
                                        />
                                    )}
                                    <span className={`relative text-4xl md:text-5xl font-black ${textColor} ${shadowColor}`}>
                                        {secs}
                                    </span>
                                </motion.div>
                            );
                        })() : (
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

                                    {/* Players Grid - Dynamic columns based on team size */}
                                    <div className={cn(
                                        "grid gap-2 mt-3",
                                        myTeamPlayers.length <= 2 ? "grid-cols-2 max-w-sm mx-auto" : "grid-cols-5"
                                    )}>
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

                                    {/* Players Grid - Dynamic columns based on team size */}
                                    <div className={cn(
                                        "grid gap-2 mt-3",
                                        opponentPlayers.length <= 2 ? "grid-cols-2 max-w-sm mx-auto" : "grid-cols-5"
                                    )}>
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
    if (displayMatchState.phase === 'strategy' && strategyPhase) {
        const isIGL = myPlayer?.isIgl;
        const teamSize = Object.keys(strategyPhase.mySlots).length;
        
        // Derive available operations from the strategy phase data
        // For 2v2, only 2 random operations are available - extract them from current slot assignments
        const assignedSlots = Object.values(strategyPhase.mySlots)
            .map(assignment => assignment.slot)
            .filter((slot): slot is string => typeof slot === 'string' && slot.length > 0);
        const uniqueSlots = [...new Set(assignedSlots)];
        
        // Use derived slots if we have them and they match team size, otherwise fall back
        const matchSlotOps = (uniqueSlots.length === teamSize && teamSize <= 2) 
            ? uniqueSlots 
            : (displayMatchState.slotOperations || DEFAULT_OPERATIONS);
        const operationLabels = matchSlotOps.map(op => OPERATION_TO_LABEL[op] || op);
        const remainingSecs = Math.ceil(strategyPhase.remainingMs / 1000);
        
        
        const handleSlotChange = (playerId: string, newSlotOp: string) => {
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
                        <div className={cn(
                            "grid gap-2",
                            teamSize <= 2 ? "grid-cols-2 max-w-md mx-auto" : "grid-cols-5"
                        )}>
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
                                        isCurrentUser={playerId === currentUserId}
                                        onClick={isIGL ? () => setSelectedSlotPlayer(prev => prev === playerId ? null : playerId) : undefined}
                                        variant="minimal"
                                        index={idx}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Slot Assignment Grid - Uses mode-aware operations */}
                    <div className={cn(
                        "grid gap-3 mb-4",
                        matchSlotOps.length <= 2 ? "grid-cols-2 max-w-md mx-auto" : "grid-cols-5"
                    )}>
                        {matchSlotOps.map((slotOp, idx) => {
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
                                    {formatTime(displayMatchState.gameClockMs)}
                                </span>
                            </motion.div>
                            <div className="flex flex-col">
                                <span className="text-xs text-white/40 uppercase tracking-wider">Round</span>
                                <span className="text-lg font-bold text-white/80">
                                    {displayMatchState.round}/4 • {displayMatchState.half === 1 ? '1st' : '2nd'} Half
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
                                data-testid={`phase-${displayMatchState.phase}`}
                                className={cn(
                                    "px-5 py-2.5 rounded-xl font-black uppercase tracking-wider text-sm border-2",
                                    displayMatchState.phase === 'active' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                                    displayMatchState.phase === 'break' && "bg-amber-500/20 text-amber-400 border-amber-500/40",
                                    displayMatchState.phase === 'halftime' && "bg-blue-500/20 text-blue-400 border-blue-500/40",
                                    displayMatchState.phase === 'post_match' && "bg-purple-500/20 text-purple-400 border-purple-500/40",
                                )}
                                animate={displayMatchState.phase === 'active' ? {
                                    boxShadow: ['0 0 10px rgba(34,197,94,0.3)', '0 0 20px rgba(34,197,94,0.5)', '0 0 10px rgba(34,197,94,0.3)']
                                } : {}}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            >
                                {displayMatchState.phase === 'active' && (
                                    <span className="flex items-center gap-2">
                                        <motion.span
                                            className="w-2 h-2 rounded-full bg-emerald-400"
                                            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                            transition={{ duration: 1, repeat: Infinity }}
                                        />
                                        LIVE
                                    </span>
                                )}
                                {displayMatchState.phase === 'break' && 'BREAK'}
                                {displayMatchState.phase === 'halftime' && 'HALFTIME'}
                                {displayMatchState.phase === 'post_match' && 'FINISHED'}
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

                            {/* Quit Button - Hidden during post_match (use results buttons instead) */}
                            {displayMatchState.phase !== 'post_match' && (
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
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Match Area */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                {displayMatchState.phase === 'active' && (
                    <div className="grid grid-cols-12 gap-6">
                        {/* Teammate/My Turn View */}
                        <div className="col-span-8">
                            {/* Active Player Input - Show immediately when it's user's turn */}
                            {isMyTurn && myPlayerQuestion ? (
                                <div className="relative">
                                    {/* Non-blocking "YOUR TURN" notification overlay */}
                                    <AnimatePresence>
                                        {yourTurnStarting && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                                                className="absolute -top-16 left-1/2 -translate-x-1/2 z-30
                                                           px-6 py-3 rounded-full
                                                           bg-emerald-500/90 border-2 border-emerald-400
                                                           shadow-lg shadow-emerald-500/30"
                                            >
                                                <motion.span
                                                    animate={{ scale: [1, 1.05, 1] }}
                                                    transition={{ duration: 0.4, repeat: 3 }}
                                                    className="text-xl font-black text-white tracking-wider"
                                                >
                                                    🎯 YOUR TURN!
                                                </motion.span>
                                            </motion.div>
                                        )}
                                        {/* Timeout warning countdown */}
                                        {timeoutWarning?.active && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                className="absolute top-4 right-4 z-50
                                                           px-6 py-3 rounded-xl
                                                           bg-amber-500 border-2 border-amber-300
                                                           shadow-xl shadow-amber-500/50"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <motion.span
                                                        animate={{ scale: [1, 1.2, 1] }}
                                                        transition={{ duration: 0.3, repeat: Infinity }}
                                                        className="text-2xl"
                                                    >
                                                        ⏰
                                                    </motion.span>
                                                    <span className="text-2xl font-black text-white">
                                                        {timeoutWarning.secondsRemaining}s
                                                    </span>
                                                </div>
                                            </motion.div>
                                        )}
                                        {/* Timeout flash overlay */}
                                        {showTimeoutFlash && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: [0, 0.5, 0] }}
                                                transition={{ duration: 0.5 }}
                                                className="absolute inset-0 z-50 bg-red-500/30 rounded-xl
                                                           pointer-events-none flex items-center justify-center"
                                            >
                                                <motion.span
                                                    initial={{ scale: 0.5 }}
                                                    animate={{ scale: [0.5, 1.5, 1] }}
                                                    className="text-4xl font-black text-red-500"
                                                >
                                                    TIME'S UP!
                                                </motion.span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <QuestionAnswerCard
                                        key={myPlayerQuestion.question} // Force remount when question changes (e.g., after timeout)
                                        question={myPlayerQuestion.question}
                                        operation={myPlayerQuestion.operation || 'mixed'}
                                        questionNumber={Math.min((myTeam?.questionsInSlot || 0) + 1, 5)}
                                        totalQuestions={5}
                                        slotLabel={SLOT_LABELS[(myTeam?.currentSlot || 1) - 1] || 'Mixed'}
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
                                    {/* Teammate answer indicator - shows when teammate answers during your turn */}
                                    <AnimatePresence>
                                        {teammateLastAnswerResult && (
                                            <motion.div
                                                initial={{ opacity: 0, x: 50, scale: 0.8 }}
                                                animate={{
                                                    opacity: 1,
                                                    x: 0,
                                                    scale: 1,
                                                    // Shake animation for incorrect answers
                                                    ...(teammateLastAnswerResult.isCorrect ? {} : {
                                                        x: [0, -5, 5, -5, 5, 0]
                                                    })
                                                }}
                                                exit={{ opacity: 0, x: 50, scale: 0.8 }}
                                                transition={{ duration: 0.3 }}
                                                className={cn(
                                                    "absolute top-4 right-4 px-5 py-3 rounded-xl flex items-center gap-3 z-20 shadow-lg",
                                                    teammateLastAnswerResult.isCorrect
                                                        ? "bg-emerald-500/30 border-2 border-emerald-500/60"
                                                        : "bg-rose-500/30 border-2 border-rose-500/60"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center",
                                                    teammateLastAnswerResult.isCorrect ? "bg-emerald-500" : "bg-rose-500"
                                                )}>
                                                    {teammateLastAnswerResult.isCorrect
                                                        ? <Check className="w-5 h-5 text-white" />
                                                        : <X className="w-5 h-5 text-white" />
                                                    }
                                                </div>
                                                <span className={cn(
                                                    "text-base font-bold",
                                                    teammateLastAnswerResult.isCorrect ? "text-emerald-400" : "text-rose-400"
                                                )}>
                                                    Teammate {teammateLastAnswerResult.isCorrect ? '+' + teammateLastAnswerResult.pointsEarned : 'MISSED!'}
                                                </span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            ) : myPlayer?.isComplete ? (
                                /* Player completed their slot - waiting for next teammate */
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-gradient-to-b from-emerald-900/30 to-slate-900/90 
                                               rounded-2xl border-2 border-emerald-500/30 p-8 text-center"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", bounce: 0.5 }}
                                        className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 
                                                   flex items-center justify-center"
                                    >
                                        <Check className="w-8 h-8 text-emerald-400" />
                                    </motion.div>
                                    <h3 className="text-2xl font-black text-emerald-400 mb-2">SLOT COMPLETE!</h3>
                                    <p className="text-white/60">Great job! Waiting for next teammate...</p>
                                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/40">
                                        <span>Your score this slot:</span>
                                        <span className="font-bold text-primary">+{myPlayer.score}</span>
                                    </div>
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
                                /* Brief transition state - minimal/invisible during instant transitions */
                                /* This should rarely be visible with 0ms handoff delay */
                                <div className="min-h-[200px]" />
                            )}
                        </div>

                        {/* Opponent Status */}
                        <div className="col-span-4">
                            {opponentTeam && (
                                <OpponentStatusPanel
                                    teamName={opponentTeam.teamName}
                                    teamTag={opponentTeam.teamTag}
                                    teamScore={opponentTeam.score}
                                    currentStreak={opponentTeam.currentStreak}
                                    activePlayer={activeOpponent || null}
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
                {displayMatchState.phase === 'active' && myTeam && opponentTeam && (
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

                                        // Determine slot position (1-5) based on operation order
                                        const slotPosition = operations.indexOf(op) + 1;
                                        const currentSlot = myTeam.currentSlot || 1;
                                        const hasPlayed = slotPosition < currentSlot;
                                        const isCurrentlyPlaying = player.isActive;
                                        const isWaiting = slotPosition > currentSlot && !player.isComplete;
                                        
                                        // Check if Double Anchor is actively playing THIS slot in the CURRENT round
                                        const isDoubleAnchorActive = doubleAnchorSlot === op && 
                                                                      doubleAnchorForRound === displayMatchState.round &&
                                                                      slotPosition === currentSlot;
                                        
                                        // Find the anchor player for overlay display
                                        const anchorPlayer = isDoubleAnchorActive 
                                            ? Object.values(myTeam.players).find(p => p.isAnchor)
                                            : null;

                                        return (
                                            <motion.div
                                                key={odUserId}
                                                className={cn(
                                                    "flex-1 rounded-2xl overflow-hidden relative transition-all",
                                                    // Only highlight if actively playing
                                                    isCurrentlyPlaying && "ring-3 ring-primary ring-offset-2 ring-offset-slate-900 shadow-xl shadow-primary/50",
                                                    // Grey out completed or waiting players
                                                    (hasPlayed || isWaiting) && !isCurrentlyPlaying && "opacity-60 grayscale-[20%]"
                                                )}
                                                animate={isCurrentlyPlaying ? {
                                                    scale: [1, 1.02, 1],
                                                    y: [0, -3, 0]
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
                                                {isCurrentlyPlaying && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                                        animate={{ x: ['-100%', '200%'] }}
                                                        transition={{ duration: 1.5, repeat: Infinity }}
                                                    />
                                                )}

                                                {/* Double Anchor Active Overlay - Shows anchor taking over this slot */}
                                                {isDoubleAnchorActive && anchorPlayer && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className="absolute inset-0 z-20 flex flex-col items-center justify-center
                                                                   bg-gradient-to-br from-primary/90 to-primary/70 backdrop-blur-sm"
                                                    >
                                                        {/* Pulsing border effect */}
                                                        <motion.div
                                                            className="absolute inset-0 border-4 border-primary rounded-2xl"
                                                            animate={{
                                                                boxShadow: ['0 0 20px hsl(var(--primary) / 0.6)', '0 0 40px hsl(var(--primary) / 0.9)', '0 0 20px hsl(var(--primary) / 0.6)']
                                                            }}
                                                            transition={{ duration: 1, repeat: Infinity }}
                                                        />
                                                        
                                                        {/* Anchor icon with pulse */}
                                                        <motion.div
                                                            animate={{ scale: [1, 1.15, 1] }}
                                                            transition={{ duration: 0.8, repeat: Infinity }}
                                                            className="mb-1"
                                                        >
                                                            <Anchor className="w-8 h-8 text-white drop-shadow-lg" />
                                                        </motion.div>
                                                        
                                                        {/* Anchor player name */}
                                                        <span className="text-sm font-black text-white drop-shadow-lg text-center px-2">
                                                            {anchorPlayer.odName}
                                                        </span>
                                                        
                                                        {/* "DOUBLE ANCHOR" label */}
                                                        <motion.span 
                                                            className="text-[10px] font-bold text-white/90 uppercase tracking-wider mt-0.5"
                                                            animate={{ opacity: [0.7, 1, 0.7] }}
                                                            transition={{ duration: 1.5, repeat: Infinity }}
                                                        >
                                                            Double Anchor
                                                        </motion.span>
                                                        
                                                        {/* Original player (benched) indicator */}
                                                        <span className="text-[9px] text-white/70 mt-1">
                                                            (replaces {player.odName})
                                                        </span>
                                                    </motion.div>
                                                )}

                                                {/* Content */}
                                                <div className="relative p-3 flex flex-col items-center justify-between min-h-[100px]">
                                                    {/* Top row: Operation + Roles */}
                                                    <div className="w-full flex items-start justify-between">
                                                        {/* Operation badge */}
                                                        <div className={cn(
                                                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black",
                                                            "bg-black/50 backdrop-blur-md border-2 border-white/30 shadow-lg",
                                                            bannerStyle.textColor
                                                        )}>
                                                            {operationSymbols[op]}
                                                        </div>

                                                        {/* Role badges */}
                                                        <div className="flex gap-1">
                                                            {player.isIgl && (
                                                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-amber-600
                                                                               flex items-center justify-center shadow-lg border border-amber-300">
                                                                    <Crown className="w-3.5 h-3.5 text-white drop-shadow" />
                                                                </div>
                                                            )}
                                                            {player.isAnchor && (
                                                                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-purple-400 to-purple-600
                                                                               flex items-center justify-center shadow-lg border border-purple-300">
                                                                    <Anchor className="w-3.5 h-3.5 text-white drop-shadow" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Double Anchor Indicator - Shows when slot is targeted for Double Call-In */}
                                                    {doubleAnchorSlot === op && doubleAnchorForRound && (
                                                        <motion.div
                                                            initial={{ scale: 0, opacity: 0 }}
                                                            animate={{ scale: 1, opacity: 1 }}
                                                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                                                        >
                                                            <motion.div
                                                                className="px-4 py-2 rounded-xl bg-gradient-to-br from-primary/95 to-primary-foreground/95 backdrop-blur-sm 
                                                                           border-2 border-primary shadow-xl shadow-primary/60"
                                                                animate={{
                                                                    boxShadow: ['0 0 15px hsl(var(--primary) / 0.5)', '0 0 30px hsl(var(--primary) / 0.8)', '0 0 15px hsl(var(--primary) / 0.5)'],
                                                                    scale: [1, 1.02, 1]
                                                                }}
                                                                transition={{ duration: 1.5, repeat: Infinity }}
                                                            >
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Anchor className="w-5 h-5 text-primary-foreground" />
                                                                        <span className="text-sm font-black text-white whitespace-nowrap">
                                                                            DOUBLE ANCHOR
                                                                        </span>
                                                                    </div>
                                                                    {doubleAnchorPlayerName && (
                                                                        <span className="text-xs font-bold text-primary-foreground whitespace-nowrap">
                                                                            {doubleAnchorPlayerName} • R{doubleAnchorForRound}
                                                                        </span>
                                                                    )}
                                                                    {doubleAnchorBenchedPlayer && (
                                                                        <span className="text-[10px] text-white/80 whitespace-nowrap">
                                                                            replaces {doubleAnchorBenchedPlayer}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        </motion.div>
                                                    )}

                                                    {/* Player name - Center */}
                                                    <span className={cn(
                                                        "text-sm font-black truncate text-center drop-shadow-lg w-full",
                                                        bannerStyle.textColor
                                                    )}>
                                                        {player.odName}
                                                    </span>

                                                    {/* Bottom: Status/Score */}
                                                    <div className="w-full">
                                                        {/* Currently playing - LIVE indicator */}
                                                        {isCurrentlyPlaying && (
                                                            <div className="flex flex-col items-center gap-1">
                                                                <motion.div
                                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/40 backdrop-blur-sm border border-primary/50"
                                                                    animate={{ boxShadow: ['0 0 8px var(--primary)', '0 0 16px var(--primary)', '0 0 8px var(--primary)'] }}
                                                                    transition={{ duration: 0.8, repeat: Infinity }}
                                                                >
                                                                    <motion.span
                                                                        className="w-2 h-2 rounded-full bg-primary"
                                                                        animate={{ scale: [1, 1.4, 1] }}
                                                                        transition={{ duration: 0.5, repeat: Infinity }}
                                                                    />
                                                                    <span className="text-xs font-black text-primary">LIVE</span>
                                                                </motion.div>
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="font-bold text-white">{player.score} pts</span>
                                                                    {player.streak > 0 && (
                                                                        <span className="flex items-center gap-0.5 text-orange-400 font-bold">
                                                                            <Zap className="w-3 h-3" />{player.streak}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Completed - Show score */}
                                                        {hasPlayed && !isCurrentlyPlaying && (
                                                            <div className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/30 border border-emerald-400/40">
                                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                <span className="text-xs font-black text-emerald-400">+{player.score}</span>
                                                            </div>
                                                        )}
                                                        {/* Waiting - Show slot number */}
                                                        {isWaiting && !isCurrentlyPlaying && (
                                                            <div className="text-center">
                                                                <span className="text-[10px] text-white/40 font-bold uppercase">Slot {slotPosition}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Active border glow */}
                                                {isCurrentlyPlaying && (
                                                    <motion.div
                                                        className="absolute inset-0 border-2 border-primary rounded-2xl"
                                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                                        transition={{ duration: 0.8, repeat: Infinity }}
                                                    />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Team Progress Bar - Dynamic based on slot count */}
                            <div className="relative mt-3 h-2.5 bg-black/40 rounded-full overflow-hidden flex shadow-inner">
                                {getSlotLabels(matchState?.slotOperations).map((_, idx) => {
                                    const slot = idx + 1;
                                    return (
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
                                    );
                                })}
                            </div>
                            <div className="flex justify-between mt-1 px-1">
                                {getSlotLabels(matchState?.slotOperations).map((label, idx) => (
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

                            {/* Team Progress Bar - Dynamic based on slot count */}
                            <div className="relative mt-3 h-2.5 bg-black/40 rounded-full overflow-hidden flex shadow-inner">
                                {getSlotLabels(matchState?.slotOperations).map((_, idx) => {
                                    const slot = idx + 1;
                                    return (
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
                                    );
                                })}
                            </div>
                            <div className="flex justify-between mt-1 px-1">
                                {getSlotLabels(matchState?.slotOperations).map((label, idx) => (
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
                {/* Hide when round countdown is showing to prevent overlap */}
                {displayMatchState.phase === 'break' && !showRoundCountdown && myTeam && opponentTeam && (
                    <TacticalBreakPanel
                        durationMs={phaseInitialDuration || 20000}
                        completedRound={displayMatchState.round}
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
                                    half={displayMatchState.half}
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
                {/* Hide when round countdown is showing to prevent overlap */}
                {displayMatchState.phase === 'halftime' && !showRoundCountdown && myTeam && opponentTeam && (
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
                            questionsAnswered: p.total || 0,
                            correctAnswers: p.correct || 0,
                            accuracy: p.total > 0 ? (p.correct / p.total) * 100 : 0,
                            // Calculate average response time in seconds from tracked milliseconds
                            avgResponseTime: p.total > 0 && p.totalAnswerTimeMs 
                                ? (p.totalAnswerTimeMs / p.total) / 1000 
                                : 0,
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
                            questionsAnswered: p.total || 0,
                            correctAnswers: p.correct || 0,
                            accuracy: p.total > 0 ? (p.correct / p.total) * 100 : 0,
                            // Calculate average response time in seconds from tracked milliseconds
                            avgResponseTime: p.total > 0 && p.totalAnswerTimeMs 
                                ? (p.totalAnswerTimeMs / p.total) / 1000 
                                : 0,
                            score: p.score,
                            streak: p.streak,
                        }))}
                                    isIGL={isIGL}
                        currentUserId={currentUserId}
                        round={displayMatchState.round}
                        half={displayMatchState.half}
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

                {/* Post Match - Full Results View */}
                {displayMatchState.phase === 'post_match' && (() => {
                    // Determine winner/loser - use displayMatchState to preserve results after server cleanup
                    const team1Score = displayMatchState.team1.score;
                    const team2Score = displayMatchState.team2.score;
                    const team1Won = team1Score > team2Score;
                    const isDraw = team1Score === team2Score;

                    const winningTeam = team1Won ? displayMatchState.team1 : displayMatchState.team2;
                    const losingTeam = team1Won ? displayMatchState.team2 : displayMatchState.team1;
                    const userWon = myTeam && winningTeam.teamId === myTeam.teamId;

                    // Sort players by score
                    const sortPlayersByScore = (team: TeamState) =>
                        Object.values(team.players).sort((a, b) => b.score - a.score);

                    const winnerPlayers = sortPlayersByScore(winningTeam);
                    const loserPlayers = sortPlayersByScore(losingTeam);

                    // Calculate awards
                    const getTeamAwards = (players: PlayerState[]) => {
                        if (!players.length) return { mvp: null, fastest: null, bestStreak: null };
                        const mvp = players[0]; // Already sorted by score
                        const fastest = players.reduce((best, p) => {
                            const avgTime = p.total > 0 ? p.totalAnswerTimeMs / p.total : Infinity;
                            const bestAvg = best.total > 0 ? best.totalAnswerTimeMs / best.total : Infinity;
                            return avgTime < bestAvg ? p : best;
                        }, players[0]);
                        const bestStreak = players.reduce((best, p) =>
                            p.maxStreak > best.maxStreak ? p : best, players[0]);
                        return { mvp, fastest, bestStreak };
                    };

                    const winnerAwards = getTeamAwards(winnerPlayers);
                    const loserAwards = getTeamAwards(loserPlayers);

                    const currentTeamData = resultsPage === 0 ? winningTeam : losingTeam;
                    const currentPlayers = resultsPage === 0 ? winnerPlayers : loserPlayers;
                    const currentAwards = resultsPage === 0 ? winnerAwards : loserAwards;
                    const isCurrentPageWinner = resultsPage === 0;

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="w-full max-w-7xl mx-auto"
                        >
                            {/* Header - bigger and more impactful */}
                            <div className="text-center mb-8">
                                <motion.h1
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="text-4xl font-black text-white mb-4"
                                >
                                    Match Results
                                </motion.h1>
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className={cn(
                                        "inline-flex items-center gap-3 px-6 py-3 rounded-2xl border-2",
                                        userWon
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                            : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                                    )}
                                >
                                    {userWon ? <Trophy className="w-7 h-7" /> : <Target className="w-7 h-7" />}
                                    <span className="font-black text-2xl uppercase tracking-wider">
                                        {isDraw ? 'DRAW' : userWon ? 'VICTORY' : 'DEFEAT'}
                                    </span>
                                </motion.div>
                            </div>

                            {/* Navigation arrows - larger and more visible */}
                            {!isDraw && (
                                <>
                                    <button
                                        onClick={() => setResultsPage(0)}
                                        disabled={resultsPage === 0}
                                        className={cn(
                                            "fixed left-6 top-1/2 -translate-y-1/2 z-40 p-4 rounded-2xl",
                                            "bg-black/60 backdrop-blur-md border-2 border-white/20 transition-all",
                                            resultsPage === 0
                                                ? "opacity-30 cursor-not-allowed"
                                                : "hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:scale-110"
                                        )}
                                    >
                                        <ChevronLeft className="w-8 h-8" />
                                    </button>
                                    <button
                                        onClick={() => setResultsPage(1)}
                                        disabled={resultsPage === 1}
                                        className={cn(
                                            "fixed right-6 top-1/2 -translate-y-1/2 z-40 p-4 rounded-2xl",
                                            "bg-black/60 backdrop-blur-md border-2 border-white/20 transition-all",
                                            resultsPage === 1
                                                ? "opacity-30 cursor-not-allowed"
                                                : "hover:bg-rose-500/20 hover:border-rose-500/50 hover:scale-110"
                                        )}
                                    >
                                        <ChevronRight className="w-8 h-8" />
                                    </button>
                                </>
                            )}

                            {/* Results content */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={`results-page-${resultsPage}`}
                                    initial={{ x: resultsPage === 0 ? -100 : 100, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: resultsPage === 0 ? 100 : -100, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="w-full"
                                >
                                    <div className={cn(
                                        "relative rounded-2xl overflow-hidden border-2",
                                        isCurrentPageWinner
                                            ? "border-emerald-500/30 bg-gradient-to-b from-fuchsia-900/20 via-slate-900/90 to-slate-900"
                                            : "border-rose-500/30 bg-gradient-to-b from-rose-900/20 via-slate-900/90 to-slate-900"
                                    )}>
                                        {/* Team header - larger and more impactful */}
                                        <div className={cn(
                                            "relative p-6 border-b-2 flex items-center justify-between",
                                            isCurrentPageWinner
                                                ? "border-emerald-500/30 bg-gradient-to-r from-emerald-600/20 via-fuchsia-600/20 to-emerald-600/20"
                                                : "border-rose-500/30 bg-gradient-to-r from-rose-600/20 via-red-600/20 to-rose-600/20"
                                        )}>
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-14 h-14 rounded-xl flex items-center justify-center",
                                                    isCurrentPageWinner
                                                        ? "bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30"
                                                        : "bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg shadow-rose-500/30"
                                                )}>
                                                    {isCurrentPageWinner ? (
                                                        <Trophy className="w-7 h-7 text-white" />
                                                    ) : (
                                                        <Target className="w-7 h-7 text-white" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className={cn(
                                                        "text-sm uppercase tracking-widest font-bold",
                                                        isCurrentPageWinner ? "text-emerald-400" : "text-rose-400"
                                                    )}>
                                                        {isCurrentPageWinner ? 'Winner' : 'Defeated'}
                                                    </p>
                                                    <p className="font-black text-2xl text-white">
                                                        {currentTeamData.teamTag ? `[${currentTeamData.teamTag}] ` : ''}{currentTeamData.teamName}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn(
                                                    "text-5xl font-black",
                                                    isCurrentPageWinner ? "text-emerald-400" : "text-rose-400"
                                                )}>
                                                    {currentTeamData.score}
                                                </p>
                                                <p className="text-sm text-white/50 uppercase tracking-wider">points</p>
                                            </div>
                                        </div>

                                        {/* Player cards - dynamic columns based on team size */}
                                        <div className="relative px-4 py-8">
                                            <div className={cn(
                                                "grid gap-6",
                                                currentPlayers.length <= 2 ? "grid-cols-2 max-w-md mx-auto" : "grid-cols-5"
                                            )}>
                                                {currentPlayers.map((player, idx) => (
                                                    <ResultPlayerCard
                                                        key={player.odUserId}
                                                        player={player}
                                                        isWinner={isCurrentPageWinner}
                                                        index={idx}
                                                        currentUserId={currentUserId}
                                                        onViewStats={setSelectedPlayerStats}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Awards */}
                                        <div className="relative px-8 pb-8">
                                            <p className="text-sm text-white/50 mb-4 text-center uppercase tracking-wider">Team Awards</p>
                                            <div className="grid grid-cols-3 gap-4">
                                                {currentAwards.mvp && (
                                                    <AwardCard
                                                        icon={Star}
                                                        title="MVP"
                                                        player={currentAwards.mvp}
                                                        value={`${currentAwards.mvp.score} pts`}
                                                        color="amber"
                                                    />
                                                )}
                                                {currentAwards.fastest && currentAwards.fastest.total > 0 && (
                                                    <AwardCard
                                                        icon={Clock}
                                                        title="Fastest"
                                                        player={currentAwards.fastest}
                                                        value={`${(currentAwards.fastest.totalAnswerTimeMs / currentAwards.fastest.total / 1000).toFixed(1)}s`}
                                                        color="cyan"
                                                    />
                                                )}
                                                {currentAwards.bestStreak && currentAwards.bestStreak.maxStreak > 0 && (
                                                    <AwardCard
                                                        icon={Zap}
                                                        title="Best Streak"
                                                        player={currentAwards.bestStreak}
                                                        value={`${currentAwards.bestStreak.maxStreak}x`}
                                                        color="orange"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            </AnimatePresence>

                            {/* Page indicator */}
                            {!isDraw && (
                                <div className="flex items-center justify-center gap-2 mt-6">
                                    {[0, 1].map(i => (
                                        <button
                                            key={i}
                                            onClick={() => setResultsPage(i)}
                                            className={cn(
                                                "w-2.5 h-2.5 rounded-full transition-all",
                                                resultsPage === i ? "bg-primary w-8" : "bg-white/30 hover:bg-white/50"
                                            )}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col items-center gap-3 mt-8">
                                <button
                                    onClick={() => {
                                        // Clear stored match state before navigating
                                        sessionStorage.removeItem(`match_results_${matchId}`);
                                        finalMatchStateRef.current = null;
                                        router.push('/arena/modes');
                                    }}
                                    className="w-full max-w-xs py-4 rounded-xl bg-primary hover:bg-primary/80
                                               text-black font-bold text-center transition-colors flex items-center justify-center gap-2"
                                >
                                    <Home className="w-5 h-5" />
                                    Back to Arena
                                </button>
                                <button
                                    onClick={() => {
                                        // Clear stored match state before navigating
                                        sessionStorage.removeItem(`match_results_${matchId}`);
                                        finalMatchStateRef.current = null;
                                        // Use mode from match state or search params
                                        const mode = matchState?.mode || searchParams.get('mode') || '5v5';
                                        router.push(`/arena/teams/setup?mode=${mode}`);
                                    }}
                                    className="w-full max-w-xs py-3 rounded-xl bg-white/10 hover:bg-white/20
                                               text-white font-semibold text-center transition-colors"
                                >
                                    Play Again
                                </button>
                            </div>
                        </motion.div>
                    );
                })()}

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
                                        {canLeaveDirectly 
                                            ? 'Leave Match?' 
                                            : isPartyLeader 
                                                ? 'Start Quit Vote?' 
                                                : 'Leave Match?'}
                                    </h3>
                                    <p className="text-white/60 text-sm">
                                        {canLeaveDirectly
                                            ? (isPostMatch ? 'Match is over' : 'You can leave immediately')
                                            : isPartyLeader 
                                                ? 'Your team will vote on leaving' 
                                                : 'Only the party leader can start a vote'}
                                    </p>
                                </div>
                            </div>
                            
                            {canLeaveDirectly ? (
                                <>
                                    <p className="text-white/70 mb-6">
                                        {isPostMatch 
                                            ? 'The match is over. You can return to the arena.' 
                                            : 'Since you\'re playing with AI teammates, you can leave the match immediately without a vote. Your team will forfeit the match.'}
                                    </p>
                                    
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowQuitConfirm(false)}
                                            className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white 
                                                       hover:bg-white/20 transition-colors font-medium"
                                        >
                                            {isPostMatch ? 'Stay' : 'Stay in Match'}
                                        </button>
                                        <button
                                            onClick={isPostMatch ? handleLeaveMatch : handleInitiateQuitVote}
                                            className="flex-1 px-4 py-3 rounded-xl bg-primary text-black 
                                                       hover:bg-primary/90 transition-colors font-medium
                                                       flex items-center justify-center gap-2"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            {isPostMatch ? 'Leave' : 'Leave Match'}
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

            {/* Round Start Countdown (5-4-3-2-1-GO!) - only show when phase is round_countdown, NOT during break/halftime */}
            {(showRoundCountdown || displayMatchState.phase === 'round_countdown') &&
             displayMatchState.phase !== 'break' && displayMatchState.phase !== 'halftime' && (
                <RoundStartCountdown
                    key={`countdown-${displayMatchState.round}-${displayMatchState.half}`}
                    round={displayMatchState.round || 1}
                    half={displayMatchState.half}
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
                half={displayMatchState.half}
                currentRound={displayMatchState.round}
                usedDoubleCallinHalf1={usedDoubleCallinHalf1}
                usedDoubleCallinHalf2={usedDoubleCallinHalf2}
                timeoutsRemaining={timeoutsRemaining}
                anchorName={anchorName}
                phase={displayMatchState.phase}
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

            {/* Points Feed FAB - Real-time scoring events */}
            {displayMatchState.phase !== 'post_match' && displayMatchState.phase !== 'pre_match' && (
                <PointsFeedFAB
                    team1Name={displayMatchState.team1.teamName || 'Team 1'}
                    team2Name={displayMatchState.team2.teamName || 'Team 2'}
                    team1Id={displayMatchState.team1.teamId}
                    team2Id={displayMatchState.team2.teamId}
                    team1Score={displayMatchState.team1.score}
                    team2Score={displayMatchState.team2.score}
                    myTeamId={myTeam?.teamId || ''}
                    events={pointsEvents}
                />
            )}

            {/* First to Finish Banner - Shows when a team completes relay first */}
            <FirstToFinishBanner
                visible={firstToFinishBanner?.visible || false}
                teamName={firstToFinishBanner?.teamName || ''}
                bonus={firstToFinishBanner?.bonus || 50}
                isMyTeam={firstToFinishBanner?.isMyTeam || false}
                round={firstToFinishBanner?.round || 1}
            />

            {/* Player Stats Modal for Post-Match Results */}
            <AnimatePresence>
                {selectedPlayerStats && (() => {
                    const resolvedBanner = resolveBannerStyle(selectedPlayerStats.odEquippedBanner || 'default');
                    const bannerStyle = BANNER_STYLES[resolvedBanner] || BANNER_STYLES.default;
                    const accuracy = selectedPlayerStats.total > 0
                        ? Math.round((selectedPlayerStats.correct / selectedPlayerStats.total) * 100)
                        : 0;
                    const avgTime = selectedPlayerStats.total > 0
                        ? (selectedPlayerStats.totalAnswerTimeMs / selectedPlayerStats.total / 1000).toFixed(2)
                        : 'N/A';

                    return (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
                            onClick={() => setSelectedPlayerStats(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                className="bg-slate-950 border-2 border-cyan-500/50 rounded-2xl overflow-hidden max-w-lg w-full mx-4 shadow-2xl shadow-cyan-500/20"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Banner Header */}
                                <div className={cn("relative h-32 bg-gradient-to-b", bannerStyle.background)}>
                                    {/* Pattern overlay */}
                                    {bannerStyle.pattern && (
                                        <div
                                            className={cn("absolute inset-0 opacity-30", bannerStyle.animationClass)}
                                            style={{
                                                backgroundImage: bannerStyle.pattern,
                                                backgroundSize: bannerStyle.patternSize || 'auto'
                                            }}
                                        />
                                    )}

                                    {/* Close button */}
                                    <button
                                        onClick={() => setSelectedPlayerStats(null)}
                                        className="absolute top-3 right-3 p-2 rounded-lg bg-black/50 hover:bg-black/70 transition-colors z-10"
                                    >
                                        <X className="w-5 h-5 text-white" />
                                    </button>

                                    {/* Level Badge */}
                                    <div className="absolute top-3 left-3 z-10">
                                        <div className="w-12 h-14 rounded-lg bg-slate-900/90 border border-white/20 flex flex-col items-center justify-center">
                                            <span className="text-[9px] font-black text-white/50 uppercase">LVL</span>
                                            <span className="text-xl font-black text-white">{selectedPlayerStats.odLevel || 1}</span>
                                        </div>
                                    </div>

                                    {/* Role Badge */}
                                    {(selectedPlayerStats.isIgl || selectedPlayerStats.isAnchor) && (
                                        <div className="absolute top-3 right-14 z-10">
                                            {selectedPlayerStats.isIgl && (
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-300 flex items-center justify-center shadow-lg">
                                                    <Crown className="w-5 h-5 text-white" />
                                                </div>
                                            )}
                                            {selectedPlayerStats.isAnchor && !selectedPlayerStats.isIgl && (
                                                <div className="w-10 h-10 rounded-lg bg-purple-500/30 border border-purple-400 flex items-center justify-center">
                                                    <Anchor className="w-5 h-5 text-purple-400" />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Avatar - overlapping */}
                                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                                        <div className={cn(
                                            "w-20 h-20 rounded-full flex items-center justify-center",
                                            "bg-slate-900 border-4 shadow-2xl",
                                            selectedPlayerStats.isIgl ? "border-amber-500" :
                                            selectedPlayerStats.isAnchor ? "border-purple-500" :
                                            "border-cyan-500"
                                        )}>
                                            <span className="text-3xl font-black text-white">
                                                {selectedPlayerStats.odName?.charAt(0) || '?'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Player Info */}
                                <div className="pt-14 pb-4 px-6 text-center border-b border-white/10">
                                    <h3 className="text-xl font-black text-white uppercase tracking-wide">
                                        {selectedPlayerStats.odName}
                                    </h3>
                                    <p className="text-sm text-white/50 mt-1">
                                        {selectedPlayerStats.odEquippedTitle
                                            ? selectedPlayerStats.odEquippedTitle.replace(/^title[_-]?/i, '').replace(/[_-]/g, ' ')
                                            : 'FlashMath Player'}
                                    </p>
                                    <div className="flex items-center justify-center gap-2 mt-2">
                                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                                        <span className="text-xs font-semibold text-white/60">Bronze I</span>
                                        {selectedPlayerStats.slot && (
                                            <>
                                                <span className="text-white/30">•</span>
                                                <span className="text-xs font-semibold text-cyan-400 capitalize">{selectedPlayerStats.slot}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Stats Grid */}
                                <div className="p-6">
                                    {/* Main Score */}
                                    <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-cyan-500/20 to-primary/20 border border-cyan-500/30 text-center">
                                        <p className="text-5xl font-black text-cyan-400">
                                            +{selectedPlayerStats.score}
                                        </p>
                                        <p className="text-sm text-white/50 mt-1">Points Scored</p>
                                    </div>

                                    {/* Stats Row */}
                                    <div className="grid grid-cols-4 gap-3">
                                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                                                <Target className="w-4 h-4 text-emerald-400" />
                                            </div>
                                            <p className="text-xl font-black text-emerald-400">{accuracy}%</p>
                                            <p className="text-[10px] text-white/50 uppercase">Accuracy</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-center">
                                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center mx-auto mb-2">
                                                <Clock className="w-4 h-4 text-cyan-400" />
                                            </div>
                                            <p className="text-xl font-black text-cyan-400">{avgTime}s</p>
                                            <p className="text-[10px] text-white/50 uppercase">Avg Time</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-center">
                                            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                                                <Zap className="w-4 h-4 text-orange-400" />
                                            </div>
                                            <p className="text-xl font-black text-orange-400">{selectedPlayerStats.maxStreak}</p>
                                            <p className="text-[10px] text-white/50 uppercase">Best Streak</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                                            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mx-auto mb-2">
                                                <Hash className="w-4 h-4 text-white/70" />
                                            </div>
                                            <p className="text-xl font-black text-white">{selectedPlayerStats.correct}/{selectedPlayerStats.total}</p>
                                            <p className="text-[10px] text-white/50 uppercase">Questions</p>
                                        </div>
                                    </div>

                                    {/* Role Badge */}
                                    <div className="mt-4 flex items-center justify-center gap-2">
                                        {selectedPlayerStats.isIgl && (
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30">
                                                <Crown className="w-4 h-4 text-amber-400" />
                                                <span className="text-sm font-bold text-amber-400">In-Game Leader</span>
                                            </div>
                                        )}
                                        {selectedPlayerStats.isAnchor && (
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30">
                                                <Anchor className="w-4 h-4 text-purple-400" />
                                                <span className="text-sm font-bold text-purple-400">Anchor</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={() => setSelectedPlayerStats(null)}
                                    className="w-full py-4 font-bold text-sm uppercase tracking-wider transition-all
                                               bg-cyan-500/10 border-t border-cyan-500/30 text-cyan-400
                                               hover:bg-cyan-500/20 hover:text-cyan-300"
                                >
                                    Close
                                </button>
                            </motion.div>
                        </motion.div>
                    );
                })()}
            </AnimatePresence>

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
                                            Phase: {displayMatchState.phase.toUpperCase()} | 
                                            Round: {displayMatchState.round} | 
                                            Half: {displayMatchState.half}
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

            {/* Anchor Solo Decision Modal */}
            {soloDecisionPhase?.active && (
                <AnchorSoloDecisionModal
                    isOpen={soloDecisionPhase.active}
                    isIgl={myPlayer?.isIgl || false}
                    teamName={myTeam?.teamName || 'Your Team'}
                    anchorInfo={{
                        anchorId: myTeam?.slotAssignments ? Object.entries(myTeam.players).find(([, p]) => p.isAnchor)?.[0] || '' : '',
                        anchorName: soloDecisionPhase.myAnchorName,
                    }}
                    durationMs={soloDecisionPhase.durationMs}
                    mode={(matchState?.mode as '5v5' | '2v2') || '5v5'}
                    onDecision={handleSoloDecision}
                    myDecision={soloDecisionPhase.myDecision}
                    opponentDecision={soloDecisionPhase.opponentDecision}
                />
            )}
        </div>
    );
}


