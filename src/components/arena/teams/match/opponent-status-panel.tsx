'use client';

/**
 * OpponentStatusPanel
 * 
 * Status-only view for watching opponent team.
 * Shows active player, slot, streak, and correct/wrong indicators.
 * Does NOT show the actual question (competitive integrity).
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, X, Zap } from 'lucide-react';

interface OpponentPlayerState {
    odUserId: string;
    odName: string;
    odLevel: number;
    slot: string;
    score: number;
    correct: number;
    total: number;
    streak: number;
    isActive: boolean;
    isComplete: boolean;
    isIgl: boolean;
    isAnchor: boolean;
}

interface OpponentStatusPanelProps {
    teamName: string;
    teamTag: string | null;
    teamScore: number;
    currentStreak: number;
    activePlayer: OpponentPlayerState | null;
    slotNumber: number;
    questionInSlot: number;
    totalQuestionsPerSlot: number;
    lastAnswerResult: {
        isCorrect: boolean;
        pointsEarned: number;
    } | null;
    players: OpponentPlayerState[];
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

export function OpponentStatusPanel({
    teamName,
    teamTag,
    teamScore,
    currentStreak,
    activePlayer,
    questionInSlot,
    totalQuestionsPerSlot,
    lastAnswerResult,
    players,
}: OpponentStatusPanelProps) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-b from-rose-900/30 to-slate-900/90 
                       rounded-xl border border-rose-500/20 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 
                            border-b border-rose-500/20 bg-rose-500/10">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="font-bold text-rose-400">
                        {teamTag ? `[${teamTag}] ` : ''}{teamName}
                    </span>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Streak */}
                    {currentStreak > 0 && (
                        <div className="flex items-center gap-1 text-orange-400">
                            <Zap className="w-4 h-4" />
                            <span className="font-bold">{currentStreak}</span>
                        </div>
                    )}
                    
                    {/* Score */}
                    <div className="font-mono font-bold text-xl text-rose-400">
                        {teamScore.toLocaleString()}
                    </div>
                </div>
            </div>
            
            {/* Active Player Status */}
            <div className="p-4">
                {activePlayer ? (
                    <div className="text-center">
                        <p className="text-sm text-white/50 mb-1">Now Answering</p>
                        
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                "bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold"
                            )}>
                                {operationSymbols[activePlayer.slot] || '?'}
                            </div>
                            <span className="font-semibold text-white">
                                {activePlayer.odName}
                            </span>
                            {activePlayer.isIgl && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                    IGL
                                </span>
                            )}
                            {activePlayer.isAnchor && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                    ⚓
                                </span>
                            )}
                        </div>
                        
                        {/* Question progress */}
                        <div className="flex items-center justify-center gap-2 mb-3">
                            <span className="text-xs text-white/50">
                                Q{questionInSlot}/{totalQuestionsPerSlot}
                            </span>
                            <div className="flex gap-1">
                                {Array.from({ length: totalQuestionsPerSlot }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-3 h-3 rounded-full border transition-all",
                                            i < questionInSlot 
                                                ? "bg-rose-500 border-rose-500" 
                                                : "bg-transparent border-rose-500/30"
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        
                        {/* Last answer result */}
                        <AnimatePresence>
                            {lastAnswerResult && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                    animate={{
                                        opacity: 1,
                                        scale: 1,
                                        y: 0,
                                        // Shake for incorrect
                                        ...(lastAnswerResult.isCorrect ? {} : {
                                            x: [0, -3, 3, -3, 3, 0]
                                        })
                                    }}
                                    exit={{ opacity: 0, scale: 0.8, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg",
                                        lastAnswerResult.isCorrect
                                            ? "bg-emerald-500/30 border border-emerald-500/50 text-emerald-400"
                                            : "bg-rose-500/30 border border-rose-500/50 text-rose-400"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center",
                                        lastAnswerResult.isCorrect ? "bg-emerald-500" : "bg-rose-500"
                                    )}>
                                        {lastAnswerResult.isCorrect ? (
                                            <Check className="w-4 h-4 text-white" />
                                        ) : (
                                            <X className="w-4 h-4 text-white" />
                                        )}
                                    </div>
                                    <span className="font-bold">
                                        {lastAnswerResult.isCorrect
                                            ? `+${lastAnswerResult.pointsEarned}`
                                            : 'MISSED!'}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="text-center text-white/50">
                        Waiting...
                    </div>
                )}
            </div>
            
            {/* Slot Progress Mini */}
            <div className="px-4 pb-3">
                <div className="flex justify-between gap-1">
                    {players.map((player) => (
                        <div
                            key={player.odUserId}
                            className={cn(
                                "flex-1 h-1.5 rounded-full transition-all",
                                player.isComplete 
                                    ? "bg-rose-500" 
                                    : player.isActive 
                                        ? "bg-rose-500/50 animate-pulse"
                                        : "bg-white/10"
                            )}
                        />
                    ))}
                </div>
            </div>
        </motion.div>
    );
}



