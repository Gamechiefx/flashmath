'use client';

/**
 * Player Stats Cards for Strategy Phase
 * Displays player statistics to help IGL make informed slot assignment decisions
 * Shows accuracy, speed, and best operations for each player
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Target, Zap, Clock, TrendingUp, Crown, Anchor,
    Plus, Minus, X, Divide, HelpCircle
} from 'lucide-react';

interface PlayerStats {
    odUserId: string;
    name: string;
    isIgl: boolean;
    isAnchor: boolean;
    level?: number;
    // Per-operation stats
    operationStats: {
        addition: { accuracy: number; avgSpeedMs: number; gamesPlayed: number };
        subtraction: { accuracy: number; avgSpeedMs: number; gamesPlayed: number };
        multiplication: { accuracy: number; avgSpeedMs: number; gamesPlayed: number };
        division: { accuracy: number; avgSpeedMs: number; gamesPlayed: number };
        mixed: { accuracy: number; avgSpeedMs: number; gamesPlayed: number };
    };
    // Overall stats
    overallAccuracy: number;
    avgStreak: number;
    bestOperation: string;
}

interface PlayerStatsCardsProps {
    players: PlayerStats[];
    currentAssignments: Record<string, string>; // userId -> operation
    isIGL: boolean;
    onPlayerClick?: (userId: string) => void;
    selectedPlayerId?: string | null;
}

const OPERATION_ICONS: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
    addition: { 
        icon: <Plus className="w-4 h-4" />, 
        color: 'text-emerald-400', 
        bgColor: 'bg-emerald-500/20' 
    },
    subtraction: { 
        icon: <Minus className="w-4 h-4" />, 
        color: 'text-blue-400', 
        bgColor: 'bg-blue-500/20' 
    },
    multiplication: { 
        icon: <X className="w-4 h-4" />, 
        color: 'text-purple-400', 
        bgColor: 'bg-purple-500/20' 
    },
    division: { 
        icon: <Divide className="w-4 h-4" />, 
        color: 'text-orange-400', 
        bgColor: 'bg-orange-500/20' 
    },
    mixed: { 
        icon: <HelpCircle className="w-4 h-4" />, 
        color: 'text-pink-400', 
        bgColor: 'bg-pink-500/20' 
    },
};

function AccuracyBar({ accuracy, label }: { accuracy: number; label: string }) {
    const getColor = (acc: number) => {
        if (acc >= 90) return 'bg-emerald-500';
        if (acc >= 75) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/50 w-8 uppercase">{label}</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${accuracy}%` }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className={cn("h-full rounded-full", getColor(accuracy))}
                />
            </div>
            <span className="text-[10px] font-mono text-white/70 w-8 text-right">{accuracy}%</span>
        </div>
    );
}

function PlayerStatCard({ 
    player, 
    currentSlot,
    isIGL,
    isSelected,
    onClick 
}: { 
    player: PlayerStats; 
    currentSlot?: string;
    isIGL: boolean;
    isSelected: boolean;
    onClick?: () => void;
}) {
    const slotInfo = currentSlot ? OPERATION_ICONS[currentSlot] : null;
    
    // Find best and worst operations
    const opEntries = Object.entries(player.operationStats);
    const bestOp = opEntries.reduce((a, b) => 
        a[1].accuracy > b[1].accuracy ? a : b
    );
    const worstOp = opEntries.reduce((a, b) => 
        a[1].accuracy < b[1].accuracy ? a : b
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={isIGL ? { scale: 1.02 } : {}}
            onClick={isIGL ? onClick : undefined}
            className={cn(
                "relative p-4 rounded-xl border transition-all",
                "bg-gradient-to-b from-white/5 to-white/[0.02]",
                isSelected 
                    ? "border-primary ring-2 ring-primary/50 shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]"
                    : "border-white/10 hover:border-white/20",
                isIGL && "cursor-pointer"
            )}
        >
            {/* Role Badges */}
            <div className="absolute -top-2 -right-2 flex gap-1">
                {player.isIgl && (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/50 
                                    flex items-center justify-center">
                        <Crown className="w-3 h-3 text-amber-400" />
                    </div>
                )}
                {player.isAnchor && (
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/50 
                                    flex items-center justify-center">
                        <Anchor className="w-3 h-3 text-purple-400" />
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h4 className="font-bold text-white">{player.name}</h4>
                    {player.level && (
                        <span className="text-xs text-white/50">Level {player.level}</span>
                    )}
                </div>
                {slotInfo && (
                    <div className={cn(
                        "px-2 py-1 rounded-lg flex items-center gap-1",
                        slotInfo.bgColor, slotInfo.color
                    )}>
                        {slotInfo.icon}
                        <span className="text-xs font-bold capitalize">{currentSlot}</span>
                    </div>
                )}
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3 p-2 rounded-lg bg-white/5">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-emerald-400">
                        <Target className="w-3 h-3" />
                        <span className="text-sm font-bold">{player.overallAccuracy}%</span>
                    </div>
                    <span className="text-[10px] text-white/40">Accuracy</span>
                </div>
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-amber-400">
                        <Zap className="w-3 h-3" />
                        <span className="text-sm font-bold">{player.avgStreak}</span>
                    </div>
                    <span className="text-[10px] text-white/40">Avg Streak</span>
                </div>
                <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-primary">
                        <TrendingUp className="w-3 h-3" />
                        <span className="text-sm font-bold capitalize">{bestOp[0].slice(0, 3)}</span>
                    </div>
                    <span className="text-[10px] text-white/40">Best Op</span>
                </div>
            </div>

            {/* Per-Operation Accuracy Bars */}
            <div className="space-y-1.5">
                <AccuracyBar 
                    accuracy={player.operationStats.addition.accuracy} 
                    label="+" 
                />
                <AccuracyBar 
                    accuracy={player.operationStats.subtraction.accuracy} 
                    label="−" 
                />
                <AccuracyBar 
                    accuracy={player.operationStats.multiplication.accuracy} 
                    label="×" 
                />
                <AccuracyBar 
                    accuracy={player.operationStats.division.accuracy} 
                    label="÷" 
                />
                <AccuracyBar 
                    accuracy={player.operationStats.mixed.accuracy} 
                    label="?" 
                />
            </div>

            {/* Recommendations */}
            <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-[10px]">
                    <span className="text-emerald-400">
                        Best: {bestOp[0]} ({bestOp[1].accuracy}%)
                    </span>
                    <span className="text-rose-400">
                        Weakest: {worstOp[0]} ({worstOp[1].accuracy}%)
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

export function PlayerStatsCards({
    players,
    currentAssignments,
    isIGL,
    onPlayerClick,
    selectedPlayerId,
}: PlayerStatsCardsProps) {
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Team Statistics
                </h3>
                {isIGL && (
                    <span className="text-xs text-white/50">
                        Click a player to select for reassignment
                    </span>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {players.map((player, index) => (
                    <motion.div
                        key={player.odUserId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <PlayerStatCard
                            player={player}
                            currentSlot={currentAssignments[player.odUserId]}
                            isIGL={isIGL}
                            isSelected={selectedPlayerId === player.odUserId}
                            onClick={() => onPlayerClick?.(player.odUserId)}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-white/10">
                {Object.entries(OPERATION_ICONS).map(([op, { icon, color, bgColor }]) => (
                    <div key={op} className="flex items-center gap-1.5">
                        <div className={cn("w-5 h-5 rounded flex items-center justify-center", bgColor, color)}>
                            {icon}
                        </div>
                        <span className="text-xs text-white/50 capitalize">{op}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Compact version for sidebar/panel use
export function PlayerStatsCompact({
    players,
    currentAssignments,
}: {
    players: PlayerStats[];
    currentAssignments: Record<string, string>;
}) {
    return (
        <div className="space-y-2">
            {players.map((player) => {
                const currentSlot = currentAssignments[player.odUserId];
                const slotInfo = currentSlot ? OPERATION_ICONS[currentSlot] : null;
                
                return (
                    <div 
                        key={player.odUserId}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10"
                    >
                        <div className="flex items-center gap-2">
                            {player.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                            {player.isAnchor && <Anchor className="w-3 h-3 text-purple-400" />}
                            <span className="text-sm font-medium text-white">{player.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-white/50">{player.overallAccuracy}% acc</span>
                            {slotInfo && (
                                <div className={cn(
                                    "w-6 h-6 rounded flex items-center justify-center",
                                    slotInfo.bgColor, slotInfo.color
                                )}>
                                    {slotInfo.icon}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

