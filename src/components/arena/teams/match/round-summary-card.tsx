'use client';

/**
 * RoundSummaryCard
 * 
 * Compact card showing round results.
 * Features:
 * - Expandable for detailed breakdown
 * - Color-coded win/loss/tie indicators
 * - MVP highlight
 * - Per-player performance on expand
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChevronDown, Trophy, Zap, Target } from 'lucide-react';

interface PlayerRoundStats {
    userId: string;
    name: string;
    operation: string;
    score: number;
    accuracy: number;
    avgSpeed: number;
}

interface RoundSummaryCardProps {
    roundNumber: number;
    half: 1 | 2;
    myTeamScore: number;
    opponentScore: number;
    myTeamAccuracy?: number;
    opponentAccuracy?: number;
    myTeamPlayers?: PlayerRoundStats[];
    mvpUserId?: string;
    mvpName?: string;
    isExpandable?: boolean;
    defaultExpanded?: boolean;
    className?: string;
}

const OPERATION_SYMBOLS: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

export function RoundSummaryCard({
    roundNumber,
    half,
    myTeamScore,
    opponentScore,
    myTeamAccuracy,
    opponentAccuracy,
    myTeamPlayers,
    mvpUserId,
    mvpName,
    isExpandable = true,
    defaultExpanded = false,
    className,
}: RoundSummaryCardProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const scoreDiff = myTeamScore - opponentScore;
    const isWin = scoreDiff > 0;
    const isLoss = scoreDiff < 0;
    const isTie = scoreDiff === 0;

    const resultLabel = isWin ? 'WIN' : isLoss ? 'LOSS' : 'TIE';
    const resultColor = isWin ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-amber-400';
    const resultBg = isWin ? 'bg-green-500/10' : isLoss ? 'bg-red-500/10' : 'bg-amber-500/10';
    const resultBorder = isWin ? 'border-green-500/30' : isLoss ? 'border-red-500/30' : 'border-amber-500/30';

    const toggleExpand = () => {
        if (isExpandable) {
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <motion.div
            layout
            className={cn(
                "rounded-xl border overflow-hidden transition-colors",
                resultBg,
                resultBorder,
                isExpandable && "cursor-pointer hover:bg-opacity-20",
                className
            )}
            onClick={toggleExpand}
        >
            {/* Compact View */}
            <div className="flex items-center justify-between px-4 py-3">
                {/* Round Info */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider">
                            {half === 1 ? '1st' : '2nd'} Half
                        </span>
                        <span className="text-lg font-bold text-white">
                            R{roundNumber}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="w-px h-8 bg-white/10" />

                    {/* Scores */}
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-primary">
                            +{myTeamScore}
                        </span>
                        <span className="text-white/40">vs</span>
                        <span className="text-xl font-bold text-white/60">
                            +{opponentScore}
                        </span>
                    </div>
                </div>

                {/* Result & Actions */}
                <div className="flex items-center gap-3">
                    {/* MVP Badge (if applicable) */}
                    {mvpName && (
                        <div className="hidden sm:flex items-center gap-1 px-2 py-1 
                                        rounded-full bg-amber-500/20 text-amber-400">
                            <Trophy className="w-3 h-3" />
                            <span className="text-xs font-bold">{mvpName}</span>
                        </div>
                    )}

                    {/* Result Badge */}
                    <div className={cn(
                        "px-3 py-1 rounded-lg font-bold text-sm",
                        resultColor,
                        isWin && "bg-green-500/20",
                        isLoss && "bg-red-500/20",
                        isTie && "bg-amber-500/20"
                    )}>
                        {resultLabel} {isWin && `(+${scoreDiff})`}{isLoss && `(${scoreDiff})`}
                    </div>

                    {/* Expand Icon */}
                    {isExpandable && (
                        <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            className="text-white/40"
                        >
                            <ChevronDown className="w-5 h-5" />
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Expanded View */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-2 border-t border-white/10">
                            {/* Accuracy Comparison */}
                            {(myTeamAccuracy !== undefined || opponentAccuracy !== undefined) && (
                                <div className="flex items-center justify-center gap-6 mb-4">
                                    <div className="text-center">
                                        <span className="text-xs text-white/40 block">Your Accuracy</span>
                                        <span className="text-lg font-bold text-primary">
                                            {myTeamAccuracy?.toFixed(0) || '--'}%
                                        </span>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-xs text-white/40 block">Opponent Accuracy</span>
                                        <span className="text-lg font-bold text-white/60">
                                            {opponentAccuracy?.toFixed(0) || '--'}%
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Player Breakdown */}
                            {myTeamPlayers && myTeamPlayers.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-xs text-white/40 uppercase tracking-wider mb-2">
                                        Player Breakdown
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                        {myTeamPlayers.map((player) => {
                                            const isMVP = player.userId === mvpUserId;
                                            return (
                                                <div
                                                    key={player.userId}
                                                    className={cn(
                                                        "p-2 rounded-lg text-center",
                                                        "bg-white/5 border border-white/10",
                                                        isMVP && "border-amber-500/50 bg-amber-500/10"
                                                    )}
                                                >
                                                    {/* Operation */}
                                                    <div className="text-lg font-bold text-primary mb-1">
                                                        {OPERATION_SYMBOLS[player.operation] || '?'}
                                                    </div>
                                                    
                                                    {/* Name */}
                                                    <div className="text-xs font-medium text-white truncate">
                                                        {player.name}
                                                        {isMVP && <Trophy className="w-3 h-3 inline ml-1 text-amber-400" />}
                                                    </div>
                                                    
                                                    {/* Score */}
                                                    <div className="text-sm font-bold text-green-400">
                                                        +{player.score}
                                                    </div>
                                                    
                                                    {/* Stats */}
                                                    <div className="flex items-center justify-center gap-2 mt-1">
                                                        <span className="text-[10px] text-white/50 flex items-center gap-0.5">
                                                            <Target className="w-2.5 h-2.5" />
                                                            {player.accuracy.toFixed(0)}%
                                                        </span>
                                                        <span className="text-[10px] text-white/50 flex items-center gap-0.5">
                                                            <Zap className="w-2.5 h-2.5" />
                                                            {player.avgSpeed.toFixed(1)}s
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

