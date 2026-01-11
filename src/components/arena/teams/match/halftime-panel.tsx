'use client';

/**
 * HalftimePanel
 * 
 * Enhanced halftime display with:
 * - Countdown timer
 * - Player stats table for both teams
 * - IGL controls for strategy adjustments
 * - Slot reassignment UI
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Clock, 
    Crown, 
    Anchor, 
    TrendingUp, 
    TrendingDown,
    Target,
    Zap,
    RefreshCw,
    Users,
    ChevronDown,
    ChevronUp,
    Award
} from 'lucide-react';
// IGLControls are now in the FAB - no inline controls needed

export interface PlayerHalftimeStats {
    playerId: string;
    name: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    isCurrentUser?: boolean;
    operation: string;
    questionsAnswered: number;
    correctAnswers: number;
    accuracy: number;
    avgResponseTime: number;
    score: number;
    streak: number;
}

export interface HalftimePanelProps {
    durationMs: number;
    myTeamName: string;
    opponentTeamName: string;
    myTeamScore: number;
    opponentScore: number;
    myTeamPlayers: PlayerHalftimeStats[];
    opponentPlayers: PlayerHalftimeStats[];
    isIGL: boolean;
    currentUserId: string;
    round: number;
    half: number;
    usedDoubleCallinHalf1: boolean;
    timeoutsRemaining: number;
    availableSlots: string[];
    onDoubleCallin?: (round: number, slot: string) => void;
    onTimeout?: () => void;
    onSlotReassign?: (playerId: string, newSlot: string) => void;
    onComplete?: () => void;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

function CountdownTimer({ 
    durationMs, 
    onComplete 
}: { 
    durationMs: number; 
    onComplete?: () => void 
}) {
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
    const progress = 1 - (remainingMs / durationMs);
    
    return (
        <div className="text-center">
            <div className="relative inline-flex items-center justify-center">
                {/* Circular progress */}
                <svg className="w-24 h-24 -rotate-90">
                    <circle
                        cx="48"
                        cy="48"
                        r="44"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="4"
                    />
                    <motion.circle
                        cx="48"
                        cy="48"
                        r="44"
                        fill="none"
                        stroke="rgb(251, 191, 36)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 44}
                        strokeDashoffset={2 * Math.PI * 44 * (1 - progress)}
                        transition={{ duration: 0.1 }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-mono font-black text-amber-400">
                        {mins}:{secs.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>
            <p className="text-xs text-amber-400/70 mt-2">2nd Half starts in...</p>
        </div>
    );
}

function PlayerStatsRow({ 
    player, 
    rank 
}: { 
    player: PlayerHalftimeStats; 
    rank: number 
}) {
    return (
        <motion.tr
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: rank * 0.05 }}
            className={cn(
                "border-b border-white/5 last:border-0",
                player.isCurrentUser && "bg-primary/10"
            )}
        >
            <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                    {rank <= 3 && (
                        <span className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                            rank === 1 && "bg-amber-500 text-black",
                            rank === 2 && "bg-slate-400 text-black",
                            rank === 3 && "bg-amber-700 text-white"
                        )}>
                            {rank}
                        </span>
                    )}
                    {rank > 3 && <span className="w-5 text-center text-xs text-white/40">{rank}</span>}
                    <span className={cn(
                        "font-medium text-sm",
                        player.isCurrentUser ? "text-primary" : "text-white"
                    )}>
                        {player.isCurrentUser ? 'YOU' : player.name}
                    </span>
                    {player.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                    {player.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                </div>
            </td>
            <td className="py-2 px-2 text-center">
                <span className="text-lg font-bold bg-gradient-to-r from-primary to-purple-400 
                                 bg-clip-text text-transparent">
                    {operationSymbols[player.operation] || player.operation}
                </span>
            </td>
            <td className="py-2 px-2 text-right text-sm font-mono text-white/80">
                {player.score}
            </td>
            <td className="py-2 px-2 text-right">
                <span className={cn(
                    "text-xs font-medium",
                    player.accuracy >= 90 && "text-emerald-400",
                    player.accuracy >= 70 && player.accuracy < 90 && "text-amber-400",
                    player.accuracy < 70 && "text-rose-400"
                )}>
                    {player.accuracy.toFixed(0)}%
                </span>
            </td>
            <td className="py-2 px-2 text-right text-xs text-white/60">
                {player.avgResponseTime.toFixed(1)}s
            </td>
            <td className="py-2 px-2 text-right text-xs">
                {player.streak >= 3 ? (
                    <span className="text-amber-400 font-medium">🔥{player.streak}</span>
                ) : player.streak > 0 ? (
                    <span className="text-white/60">{player.streak}</span>
                ) : (
                    <span className="text-white/30">-</span>
                )}
            </td>
        </motion.tr>
    );
}

function TeamStatsTable({ 
    teamName, 
    players, 
    isMyTeam 
}: { 
    teamName: string; 
    players: PlayerHalftimeStats[]; 
    isMyTeam: boolean 
}) {
    const [expanded, setExpanded] = useState(true);
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    
    return (
        <div className={cn(
            "rounded-xl border overflow-hidden",
            isMyTeam 
                ? "bg-primary/5 border-primary/30" 
                : "bg-rose-500/5 border-rose-500/30"
        )}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 
                           hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Users className={cn(
                        "w-4 h-4",
                        isMyTeam ? "text-primary" : "text-rose-400"
                    )} />
                    <span className={cn(
                        "font-bold",
                        isMyTeam ? "text-primary" : "text-rose-400"
                    )}>
                        {teamName}
                    </span>
                    <span className="text-xs text-white/50">
                        ({players.length} players)
                    </span>
                </div>
                {expanded ? (
                    <ChevronUp className="w-4 h-4 text-white/50" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-white/50" />
                )}
            </button>
            
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-white/40 border-b border-white/10">
                                    <th className="py-2 px-2 text-left font-medium">Player</th>
                                    <th className="py-2 px-2 text-center font-medium">Slot</th>
                                    <th className="py-2 px-2 text-right font-medium">Score</th>
                                    <th className="py-2 px-2 text-right font-medium">Acc.</th>
                                    <th className="py-2 px-2 text-right font-medium">Avg</th>
                                    <th className="py-2 px-2 text-right font-medium">Streak</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPlayers.map((player, i) => (
                                    <PlayerStatsRow 
                                        key={player.playerId} 
                                        player={player} 
                                        rank={i + 1} 
                                    />
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function HalftimePanel({
    durationMs,
    myTeamName,
    opponentTeamName,
    myTeamScore,
    opponentScore,
    myTeamPlayers,
    opponentPlayers,
    isIGL,
    currentUserId,
    round,
    half,
    usedDoubleCallinHalf1,
    timeoutsRemaining,
    availableSlots,
    onDoubleCallin,
    onTimeout,
    onSlotReassign,
    onComplete,
}: HalftimePanelProps) {
    const scoreDiff = myTeamScore - opponentScore;
    const isWinning = scoreDiff > 0;
    const isTied = scoreDiff === 0;
    
    // Calculate team stats
    const myTeamAccuracy = myTeamPlayers.length > 0
        ? myTeamPlayers.reduce((sum, p) => sum + p.accuracy, 0) / myTeamPlayers.length
        : 0;
    const oppTeamAccuracy = opponentPlayers.length > 0
        ? opponentPlayers.reduce((sum, p) => sum + p.accuracy, 0) / opponentPlayers.length
        : 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-4xl mx-auto px-4"
        >
            {/* Header */}
            <div className="text-center mb-8">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-6xl mb-4"
                >
                    ⏱️
                </motion.div>
                <h2 className="text-4xl font-black mb-2 bg-gradient-to-r from-primary to-amber-400
                               bg-clip-text text-transparent">
                    HALFTIME
                </h2>
                <p className="text-white/60">Regroup and strategize for the second half</p>
            </div>
            
            {/* Countdown */}
            <div className="flex justify-center mb-8">
                <CountdownTimer durationMs={durationMs} onComplete={onComplete} />
            </div>
            
            {/* Score Summary */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="p-6 rounded-xl bg-primary/10 border border-primary/30 text-center">
                    <p className="text-sm text-primary/70 mb-2">{myTeamName}</p>
                    <p className="text-5xl font-black text-primary">{myTeamScore}</p>
                    <div className="flex items-center justify-center gap-1 mt-2">
                        <Target className="w-3 h-3 text-primary/60" />
                        <span className="text-xs text-primary/60">{myTeamAccuracy.toFixed(0)}% avg</span>
                    </div>
                </div>
                
                <div className="flex items-center justify-center">
                    <div className={cn(
                        "px-4 py-2 rounded-full font-bold",
                        isWinning && "bg-emerald-500/20 text-emerald-400",
                        !isWinning && !isTied && "bg-rose-500/20 text-rose-400",
                        isTied && "bg-white/10 text-white/60"
                    )}>
                        {isWinning && <TrendingUp className="w-4 h-4 inline mr-1" />}
                        {!isWinning && !isTied && <TrendingDown className="w-4 h-4 inline mr-1" />}
                        {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                    </div>
                </div>
                
                <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center">
                    <p className="text-sm text-rose-400/70 mb-2">{opponentTeamName}</p>
                    <p className="text-5xl font-black text-rose-400">{opponentScore}</p>
                    <div className="flex items-center justify-center gap-1 mt-2">
                        <Target className="w-3 h-3 text-rose-400/60" />
                        <span className="text-xs text-rose-400/60">{oppTeamAccuracy.toFixed(0)}% avg</span>
                    </div>
                </div>
            </div>
            
            {/* Player Stats Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                <TeamStatsTable 
                    teamName={myTeamName} 
                    players={myTeamPlayers} 
                    isMyTeam={true}
                />
                <TeamStatsTable 
                    teamName={opponentTeamName} 
                    players={opponentPlayers} 
                    isMyTeam={false}
                />
            </div>
            
            {/* IGL Section - actual controls are in the FAB */}
            {isIGL && (
                <div className="mb-8 space-y-4">
                    {/* IGL Reminder */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3"
                    >
                        <Crown className="w-6 h-6 text-amber-400 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-amber-300">IGL Command Panel</p>
                            <p className="text-xs text-amber-300/70 whitespace-nowrap">
                                Use the command panel to call timeout or set up Double Call-In.
                            </p>
                        </div>
                    </motion.div>
                    
                    {/* Slot Reassignment Hint */}
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <div className="flex items-center gap-2 mb-2">
                            <RefreshCw className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-emerald-400">Slot Reassignment Available</span>
                        </div>
                        <p className="text-sm text-white/60">
                            As IGL, you can reassign player slots for the 2nd half. Click on any player 
                            in your team's roster, then click on a slot to move them.
                        </p>
                    </div>
                </div>
            )}
            
            {/* Tips */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="p-4 rounded-xl bg-white/5 border border-white/10"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white">Halftime Tips</span>
                </div>
                <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                    <li>Review opponent performance to identify weaknesses</li>
                    <li>Consider reassigning struggling players to different slots</li>
                    <li>Plan your Double Call-In for critical 2nd half rounds</li>
                    <li>Save timeout for close endgame situations</li>
                </ul>
            </motion.div>
        </motion.div>
    );
}

