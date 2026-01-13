'use client';

/**
 * HalftimePanel
 *
 * Clean halftime display with player stats, countdown, and IGL slot reassignment
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
    Users,
    ChevronDown,
    ChevronUp,
    ArrowLeftRight,
    Shuffle
} from 'lucide-react';

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
            transition={{ delay: rank * 0.03 }}
            className={cn(
                "border-b border-white/5 last:border-0",
                player.isCurrentUser && "bg-primary/5"
            )}
        >
            <td className="py-2 px-3">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                        rank === 1 && "bg-amber-500 text-black",
                        rank === 2 && "bg-slate-400 text-black",
                        rank === 3 && "bg-amber-700 text-white",
                        rank > 3 && "bg-white/10 text-white/50"
                    )}>
                        {rank}
                    </span>
                    <span className={cn(
                        "font-medium text-sm truncate max-w-[80px]",
                        player.isCurrentUser ? "text-primary" : "text-white"
                    )}>
                        {player.isCurrentUser ? 'YOU' : player.name}
                    </span>
                    {player.isIgl && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    {player.isAnchor && <Anchor className="w-3 h-3 text-cyan-400 flex-shrink-0" />}
                </div>
            </td>
            <td className="py-2 px-2 text-center">
                <span className="text-sm font-bold text-white/70">
                    {operationSymbols[player.operation] || '?'}
                </span>
            </td>
            <td className="py-2 px-2 text-right">
                <span className="text-sm font-bold text-white">{player.score}</span>
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
            <td className="py-2 px-2 text-right text-xs text-white/50">
                {player.avgResponseTime.toFixed(1)}s
            </td>
            <td className="py-2 px-2 text-right text-xs">
                {player.streak >= 3 ? (
                    <span className="text-amber-400 font-medium flex items-center justify-end gap-0.5">
                        <Zap className="w-3 h-3" />{player.streak}
                    </span>
                ) : (
                    <span className="text-white/30">{player.streak || '-'}</span>
                )}
            </td>
        </motion.tr>
    );
}

// Slot assignment card for IGL reassignment
function SlotAssignmentCard({
    player,
    slotOperation,
    isSelected,
    onSelect,
    isIGL,
}: {
    player: PlayerHalftimeStats;
    slotOperation: string;
    isSelected: boolean;
    onSelect: () => void;
    isIGL: boolean;
}) {
    const opSymbol = operationSymbols[slotOperation] || '?';

    return (
        <motion.button
            onClick={isIGL ? onSelect : undefined}
            whileHover={isIGL ? { scale: 1.02 } : {}}
            whileTap={isIGL ? { scale: 0.98 } : {}}
            className={cn(
                "relative p-3 rounded-xl border transition-all text-left",
                isSelected
                    ? "bg-amber-500/20 border-amber-500/50 ring-2 ring-amber-500/30"
                    : "bg-white/5 border-white/10 hover:border-white/20",
                isIGL ? "cursor-pointer" : "cursor-default",
                player.isCurrentUser && "ring-1 ring-primary/30"
            )}
        >
            {/* Operation Badge */}
            <div className={cn(
                "absolute -top-2 -right-2 w-8 h-8 rounded-lg flex items-center justify-center text-lg font-black",
                "bg-gradient-to-br shadow-lg",
                slotOperation === 'addition' && "from-emerald-500 to-emerald-600 text-white",
                slotOperation === 'subtraction' && "from-blue-500 to-blue-600 text-white",
                slotOperation === 'multiplication' && "from-purple-500 to-purple-600 text-white",
                slotOperation === 'division' && "from-amber-500 to-amber-600 text-white",
                !['addition', 'subtraction', 'multiplication', 'division'].includes(slotOperation) && "from-gray-500 to-gray-600 text-white"
            )}>
                {opSymbol}
            </div>

            {/* Player Info */}
            <div className="flex items-center gap-2 mb-1">
                {player.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                {player.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                <span className={cn(
                    "font-bold text-sm truncate",
                    player.isCurrentUser ? "text-primary" : "text-white"
                )}>
                    {player.isCurrentUser ? 'YOU' : player.name}
                </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-white/50">
                <span>{player.score} pts</span>
                <span>{player.accuracy.toFixed(0)}%</span>
            </div>

            {/* Selection indicator */}
            {isSelected && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5
                               bg-amber-500 text-black text-xs font-bold rounded-full"
                >
                    Selected
                </motion.div>
            )}
        </motion.button>
    );
}

// IGL Slot Reassignment Panel
function SlotReassignmentPanel({
    players,
    availableSlots,
    isIGL,
    onSlotReassign,
}: {
    players: PlayerHalftimeStats[];
    availableSlots: string[];
    isIGL: boolean;
    onSlotReassign?: (playerId: string, newSlot: string) => void;
}) {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [showPanel, setShowPanel] = useState(true);

    // Get unique operations from available slots or players
    const operations = availableSlots.length > 0
        ? availableSlots
        : [...new Set(players.map(p => p.operation))];

    // Group players by their current operation
    const playersByOp: Record<string, PlayerHalftimeStats[]> = {};
    for (const op of operations) {
        playersByOp[op] = players.filter(p => p.operation === op);
    }

    const handleSlotClick = (playerId: string) => {
        if (!isIGL) return;

        if (selectedPlayer === null) {
            // First click - select the player
            setSelectedPlayer(playerId);
        } else if (selectedPlayer === playerId) {
            // Clicked same player - deselect
            setSelectedPlayer(null);
        } else {
            // Second click on different player - swap their slots
            const firstPlayer = players.find(p => p.playerId === selectedPlayer);
            const secondPlayer = players.find(p => p.playerId === playerId);

            if (firstPlayer && secondPlayer && onSlotReassign) {
                // Swap: assign first player to second player's slot
                onSlotReassign(firstPlayer.playerId, secondPlayer.operation);
                // Swap: assign second player to first player's slot
                onSlotReassign(secondPlayer.playerId, firstPlayer.operation);
            }
            setSelectedPlayer(null);
        }
    };

    if (!isIGL) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-4"
        >
            <button
                onClick={() => setShowPanel(!showPanel)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                           bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Shuffle className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-sm text-amber-400">
                        Reassign Slots for 2nd Half
                    </span>
                </div>
                {showPanel ? (
                    <ChevronUp className="w-4 h-4 text-amber-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-amber-400" />
                )}
            </button>

            <AnimatePresence>
                {showPanel && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-4 space-y-3">
                            {/* Instructions */}
                            <div className="flex items-center gap-2 text-xs text-white/50 px-1">
                                <ArrowLeftRight className="w-3 h-3" />
                                <span>Click two players to swap their slots</span>
                            </div>

                            {/* Slot Grid */}
                            <div className={cn(
                                "grid gap-3",
                                operations.length <= 2 ? "grid-cols-2" :
                                operations.length <= 3 ? "grid-cols-3" :
                                operations.length <= 4 ? "grid-cols-4" : "grid-cols-5"
                            )}>
                                {players.map((player) => (
                                    <SlotAssignmentCard
                                        key={player.playerId}
                                        player={player}
                                        slotOperation={player.operation}
                                        isSelected={selectedPlayer === player.playerId}
                                        onSelect={() => handleSlotClick(player.playerId)}
                                        isIGL={isIGL}
                                    />
                                ))}
                            </div>

                            {/* Selected player hint */}
                            {selectedPlayer && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-center text-xs text-amber-400"
                                >
                                    Now click another player to swap slots
                                </motion.p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function TeamStatsTable({
    teamName,
    players,
    isMyTeam,
    defaultExpanded = true
}: {
    teamName: string;
    players: PlayerHalftimeStats[];
    isMyTeam: boolean;
    defaultExpanded?: boolean;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const teamScore = players.reduce((sum, p) => sum + p.score, 0);
    const teamAccuracy = players.length > 0
        ? players.reduce((sum, p) => sum + p.accuracy, 0) / players.length
        : 0;

    return (
        <div className={cn(
            "rounded-xl border overflow-hidden",
            isMyTeam
                ? "bg-primary/5 border-primary/20"
                : "bg-rose-500/5 border-rose-500/20"
        )}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Users className={cn("w-4 h-4", isMyTeam ? "text-primary" : "text-rose-400")} />
                    <span className={cn("font-bold text-sm", isMyTeam ? "text-primary" : "text-rose-400")}>
                        {teamName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-white/50">
                        <Target className="w-3 h-3" />
                        <span>{teamAccuracy.toFixed(0)}%</span>
                    </div>
                    {expanded ? (
                        <ChevronUp className="w-4 h-4 text-white/40" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-white/40" />
                    )}
                </div>
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
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[400px]">
                                <thead>
                                    <tr className="text-xs text-white/40 border-b border-white/10">
                                        <th className="py-2 px-3 text-left font-medium">Player</th>
                                        <th className="py-2 px-2 text-center font-medium">Op</th>
                                        <th className="py-2 px-2 text-right font-medium">Pts</th>
                                        <th className="py-2 px-2 text-right font-medium">Acc</th>
                                        <th className="py-2 px-2 text-right font-medium">Avg</th>
                                        <th className="py-2 px-2 text-right font-medium">Str</th>
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
                        </div>
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
    const [remainingMs, setRemainingMs] = useState(durationMs);
    const startTimeRef = useRef<number>(0);

    useEffect(() => {
        startTimeRef.current = Date.now();

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
    const progress = remainingMs / durationMs;
    const scoreDiff = myTeamScore - opponentScore;
    const isWinning = scoreDiff > 0;
    const isTied = scoreDiff === 0;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center px-4 py-6 max-h-screen overflow-y-auto no-scrollbar"
        >
            <div className="w-full max-w-4xl">
                {/* Header Card */}
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="mb-6"
                >
                    {/* Timer Header */}
                    <div className="relative rounded-2xl bg-gradient-to-b from-blue-500/20 to-black/40
                                  backdrop-blur-sm border border-blue-500/30 p-6 text-center overflow-hidden">
                        {/* Progress bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
                            <motion.div
                                className="h-full bg-blue-400"
                                initial={{ width: '100%' }}
                                animate={{ width: `${progress * 100}%` }}
                                transition={{ duration: 0.1 }}
                            />
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-3">
                            <Clock className="w-5 h-5 text-blue-400" />
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
                                Halftime
                            </span>
                        </div>

                        {/* Timer */}
                        <div className="text-5xl font-mono font-black text-white mb-2">
                            {mins}:{secs.toString().padStart(2, '0')}
                        </div>
                        <p className="text-xs text-white/50">2nd half starts soon</p>

                        {/* Score Summary - Inline */}
                        <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-white/10">
                            <div className="text-center">
                                <p className="text-xs text-primary/70 mb-1">{myTeamName}</p>
                                <p className="text-3xl font-black text-primary">{myTeamScore}</p>
                            </div>

                            <div className={cn(
                                "px-3 py-1.5 rounded-full text-sm font-bold",
                                isWinning && "bg-emerald-500/20 text-emerald-400",
                                !isWinning && !isTied && "bg-rose-500/20 text-rose-400",
                                isTied && "bg-white/10 text-white/50"
                            )}>
                                {isWinning && <TrendingUp className="w-3 h-3 inline mr-1" />}
                                {!isWinning && !isTied && <TrendingDown className="w-3 h-3 inline mr-1" />}
                                {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                            </div>

                            <div className="text-center">
                                <p className="text-xs text-rose-400/70 mb-1">{opponentTeamName}</p>
                                <p className="text-3xl font-black text-rose-400">{opponentScore}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* IGL Slot Reassignment Panel */}
                {isIGL && (
                    <SlotReassignmentPanel
                        players={myTeamPlayers}
                        availableSlots={availableSlots}
                        isIGL={isIGL}
                        onSlotReassign={onSlotReassign}
                    />
                )}

                {/* Stats Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <TeamStatsTable
                            teamName={myTeamName}
                            players={myTeamPlayers}
                            isMyTeam={true}
                            defaultExpanded={true}
                        />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <TeamStatsTable
                            teamName={opponentTeamName}
                            players={opponentPlayers}
                            isMyTeam={false}
                            defaultExpanded={false}
                        />
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}
