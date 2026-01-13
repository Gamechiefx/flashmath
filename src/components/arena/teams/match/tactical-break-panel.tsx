'use client';

/**
 * TacticalBreakPanel
 * 
 * Enhanced tactical break display between rounds with:
 * - Round MVP highlight
 * - Quick performance insights
 * - IGL controls
 * - Countdown timer
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Pause, 
    Crown, 
    Anchor, 
    Star,
    Zap,
    TrendingUp,
    TrendingDown,
    Target,
    Clock,
    AlertTriangle
} from 'lucide-react';
// IGLControls are now in the FAB - no inline controls needed

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

function BreakCountdown({ 
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
    
    const secs = Math.ceil(remainingMs / 1000);
    const isUrgent = secs <= 5;
    
    return (
        <motion.div
            animate={isUrgent ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.5, repeat: isUrgent ? Infinity : 0 }}
            className={cn(
                "text-5xl font-mono font-black transition-colors",
                isUrgent ? "text-rose-400" : "text-amber-400"
            )}
        >
            {secs}s
        </motion.div>
    );
}

function MVPCard({ mvp }: { mvp: RoundMVP }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                "p-4 rounded-xl border",
                mvp.isMyTeam 
                    ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30"
                    : "bg-gradient-to-br from-rose-500/20 to-rose-600/10 border-rose-500/30"
            )}
        >
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    "bg-gradient-to-br from-amber-400 to-amber-600"
                )}>
                    <Star className="w-6 h-6 text-white fill-white" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-400/70 uppercase tracking-wider">
                            Round MVP
                        </span>
                    </div>
                    <p className={cn(
                        "font-bold",
                        mvp.isMyTeam ? "text-amber-400" : "text-rose-400"
                    )}>
                        {mvp.name}
                    </p>
                </div>
                <div className="ml-auto text-right">
                    <p className="text-lg font-bold text-white">{mvp.score} pts</p>
                    <div className="flex items-center gap-2 text-xs text-white/60">
                        <span>{mvp.questionsAnswered} Q</span>
                        <span>•</span>
                        <span>{mvp.accuracy}% acc</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function InsightCard({ insight, index }: { insight: RoundInsight; index: number }) {
    const icons = {
        speed: Clock,
        accuracy: Target,
        streak: Zap,
        warning: AlertTriangle,
    };
    const Icon = insight.icon ? icons[insight.icon] : Zap;
    
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                insight.type === 'positive' && "bg-emerald-500/10 text-emerald-400",
                insight.type === 'negative' && "bg-rose-500/10 text-rose-400",
                insight.type === 'neutral' && "bg-white/5 text-white/70"
            )}
        >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{insight.message}</span>
        </motion.div>
    );
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
    usedDoubleCallinHalf1,
    usedDoubleCallinHalf2,
    timeoutsRemaining,
    availableSlots,
    onDoubleCallin,
    onTimeout,
    onComplete,
}: TacticalBreakPanelProps) {
    const scoreDiff = myTeamScore - opponentScore;
    const isWinning = scoreDiff > 0;
    const isTied = scoreDiff === 0;
    const roundsRemaining = totalRounds - completedRound;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-2xl mx-auto text-center py-8"
        >
            {/* Header */}
            <div className="mb-6">
                <Pause className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                <h2 className="text-3xl font-black mb-1">TACTICAL BREAK</h2>
                <p className="text-white/60">
                    Round {completedRound} complete • {roundsRemaining} round{roundsRemaining !== 1 ? 's' : ''} remaining
                </p>
            </div>
            
            {/* Countdown */}
            <div className="mb-6">
                <BreakCountdown durationMs={durationMs} onComplete={onComplete} />
                <p className="text-white/40 text-sm mt-1">Break time remaining</p>
            </div>
            
            {/* Score Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                    <p className="text-xs text-primary/70 mb-1">{myTeamName}</p>
                    <p className="text-3xl font-black text-primary">{myTeamScore}</p>
                </div>
                
                <div className="flex items-center justify-center">
                    <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-bold",
                        isWinning && "bg-emerald-500/20 text-emerald-400",
                        !isWinning && !isTied && "bg-rose-500/20 text-rose-400",
                        isTied && "bg-white/10 text-white/60"
                    )}>
                        {isWinning && <TrendingUp className="w-3 h-3 inline mr-1" />}
                        {!isWinning && !isTied && <TrendingDown className="w-3 h-3 inline mr-1" />}
                        {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                    </div>
                </div>
                
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <p className="text-xs text-rose-400/70 mb-1">{opponentTeamName}</p>
                    <p className="text-3xl font-black text-rose-400">{opponentScore}</p>
                </div>
            </div>
            
            {/* Round MVP */}
            {roundMVP && (
                <div className="mb-6">
                    <MVPCard mvp={roundMVP} />
                </div>
            )}
            
            {/* Insights */}
            {insights.length > 0 && (
                <div className="mb-6 space-y-2">
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                        Round Insights
                    </h3>
                    {insights.map((insight, i) => (
                        <InsightCard key={i} insight={insight} index={i} />
                    ))}
                </div>
            )}
            
            {/* IGL Reminder - actual controls are in the FAB */}
            {isIGL && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-3"
                >
                    <Crown className="w-5 h-5 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-300 whitespace-nowrap">
                        <strong>IGL:</strong> Use the command panel to call timeout or set up Double Call-In.
                    </p>
                </motion.div>
            )}
            
            {/* Upcoming round preview */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 p-3 rounded-lg bg-white/5 border border-white/10"
            >
                <p className="text-xs text-white/50">
                    <strong className="text-white">Round {completedRound + 1}:</strong> All operations continue in sequence.
                    {half === 1 && completedRound + 1 > 3 && " This will be the final round before halftime."}
                    {completedRound + 1 === totalRounds && " This is the FINAL round!"}
                </p>
            </motion.div>
        </motion.div>
    );
}

