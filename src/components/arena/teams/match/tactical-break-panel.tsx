'use client';

/**
 * TacticalBreakPanel
 *
 * Clean tactical break display between rounds
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
    Pause,
    Crown,
    Star,
    Zap,
    TrendingUp,
    TrendingDown,
    Target,
    Clock,
    AlertTriangle,
    ChevronRight
} from 'lucide-react';

export interface RoundMVP {
    playerId: string;
    name: string;
    isMyTeam: boolean;
    score: number;
    accuracy: number;
    questionsAnswered: number;
}

export interface RoundInsight {
    type: 'positive' | 'negative' | 'neutral';
    message: string;
    icon?: 'speed' | 'accuracy' | 'streak' | 'warning';
}

export interface TacticalBreakPanelProps {
    durationMs: number;
    completedRound: number;
    totalRounds: number;
    myTeamScore: number;
    opponentScore: number;
    myTeamName: string;
    opponentTeamName: string;
    roundMVP?: RoundMVP;
    insights: RoundInsight[];
    isIGL: boolean;
    half: number;
    usedDoubleCallinHalf1: boolean;
    usedDoubleCallinHalf2: boolean;
    timeoutsRemaining: number;
    availableSlots: string[];
    onDoubleCallin?: (round: number, slot: string) => void;
    onTimeout?: () => void;
    onComplete?: () => void;
}

export function TacticalBreakPanel({
    durationMs,
    completedRound,
    totalRounds,
    myTeamScore,
    opponentScore,
    myTeamName,
    opponentTeamName,
    roundMVP,
    insights,
    isIGL,
    half,
    usedDoubleCallinHalf1: _usedDoubleCallinHalf1,
    usedDoubleCallinHalf2: _usedDoubleCallinHalf2,
    timeoutsRemaining: _timeoutsRemaining,
    availableSlots: _availableSlots,
    onDoubleCallin: _onDoubleCallin,
    onTimeout: _onTimeout,
    onComplete,
}: TacticalBreakPanelProps) {
    const [remainingMs, setRemainingMs] = useState(durationMs);
    // eslint-disable-next-line react-hooks/purity -- Time tracking requires Date.now()
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

    const secs = Math.ceil(remainingMs / 1000);
    const progress = remainingMs / durationMs;
    const isUrgent = secs <= 5;
    const scoreDiff = myTeamScore - opponentScore;
    const isWinning = scoreDiff > 0;
    const isTied = scoreDiff === 0;
    const roundsRemaining = totalRounds - completedRound;

    const icons = {
        speed: Clock,
        accuracy: Target,
        streak: Zap,
        warning: AlertTriangle,
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-4"
        >
            {/* Main Card */}
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-lg"
            >
                {/* Header with Timer */}
                <div className="relative rounded-t-2xl bg-gradient-to-b from-amber-500/20 to-transparent
                                border border-b-0 border-amber-500/30 p-6 text-center overflow-hidden">
                    {/* Progress bar at top */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
                        <motion.div
                            className="h-full bg-amber-400"
                            initial={{ width: '100%' }}
                            animate={{ width: `${progress * 100}%` }}
                            transition={{ duration: 0.1 }}
                        />
                    </div>

                    <div className="flex items-center justify-center gap-3 mb-2">
                        <Pause className="w-5 h-5 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                            Tactical Break
                        </span>
                    </div>

                    <motion.div
                        animate={isUrgent ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 0.5, repeat: isUrgent ? Infinity : 0 }}
                        className={cn(
                            "text-5xl font-mono font-black",
                            isUrgent ? "text-rose-400" : "text-white"
                        )}
                    >
                        {secs}
                    </motion.div>
                    <p className="text-xs text-white/50 mt-1">
                        Round {completedRound} complete • {roundsRemaining} remaining
                    </p>
                </div>

                {/* Score Section */}
                <div className="bg-black/40 backdrop-blur-sm border-x border-amber-500/30 p-4">
                    <div className="flex items-center justify-between">
                        {/* My Team */}
                        <div className="flex-1 text-center">
                            <p className="text-xs text-primary/70 truncate mb-1">{myTeamName}</p>
                            <p className="text-3xl font-black text-primary">{myTeamScore}</p>
                        </div>

                        {/* Diff Badge */}
                        <div className={cn(
                            "px-3 py-1.5 rounded-full text-sm font-bold mx-2",
                            isWinning && "bg-emerald-500/20 text-emerald-400",
                            !isWinning && !isTied && "bg-rose-500/20 text-rose-400",
                            isTied && "bg-white/10 text-white/50"
                        )}>
                            {isWinning && <TrendingUp className="w-3 h-3 inline mr-1" />}
                            {!isWinning && !isTied && <TrendingDown className="w-3 h-3 inline mr-1" />}
                            {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                        </div>

                        {/* Opponent */}
                        <div className="flex-1 text-center">
                            <p className="text-xs text-rose-400/70 truncate mb-1">{opponentTeamName}</p>
                            <p className="text-3xl font-black text-rose-400">{opponentScore}</p>
                        </div>
                    </div>
                </div>

                {/* MVP & Insights */}
                <div className="bg-black/20 backdrop-blur-sm border-x border-amber-500/30 p-4 space-y-3">
                    {/* Round MVP */}
                    {roundMVP && (
                        <div className={cn(
                            "flex items-center gap-3 p-3 rounded-xl",
                            roundMVP.isMyTeam
                                ? "bg-amber-500/10 border border-amber-500/20"
                                : "bg-rose-500/10 border border-rose-500/20"
                        )}>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600
                                          flex items-center justify-center flex-shrink-0">
                                <Star className="w-5 h-5 text-white fill-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-amber-400/70 uppercase tracking-wider">Round MVP</p>
                                <p className={cn(
                                    "font-bold truncate",
                                    roundMVP.isMyTeam ? "text-amber-400" : "text-rose-400"
                                )}>
                                    {roundMVP.name}
                                </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <p className="text-lg font-bold text-white">{roundMVP.score}</p>
                                <p className="text-xs text-white/50">{roundMVP.accuracy}%</p>
                            </div>
                        </div>
                    )}

                    {/* Insights - compact */}
                    {insights.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {insights.slice(0, 3).map((insight, i) => {
                                const Icon = insight.icon ? icons[insight.icon] : Zap;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs",
                                            insight.type === 'positive' && "bg-emerald-500/10 text-emerald-400",
                                            insight.type === 'negative' && "bg-rose-500/10 text-rose-400",
                                            insight.type === 'neutral' && "bg-white/5 text-white/60"
                                        )}
                                    >
                                        <Icon className="w-3 h-3" />
                                        <span>{insight.message}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="rounded-b-2xl bg-black/30 backdrop-blur-sm border border-t-0
                              border-amber-500/30 p-4">
                    {/* IGL Reminder */}
                    {isIGL && (
                        <div className="flex items-center gap-2 text-xs text-amber-400/80 mb-3">
                            <Crown className="w-4 h-4 text-amber-400" />
                            <span>IGL: Use command panel for tactical options</span>
                        </div>
                    )}

                    {/* Next Round Preview */}
                    <div className="flex items-center gap-2 text-xs text-white/50">
                        <ChevronRight className="w-4 h-4" />
                        <span>
                            <strong className="text-white/70">Round {completedRound + 1}</strong>
                            {half === 1 && completedRound + 1 === 4 && " • Last round before halftime"}
                            {completedRound + 1 === totalRounds && " • FINAL ROUND"}
                        </span>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
