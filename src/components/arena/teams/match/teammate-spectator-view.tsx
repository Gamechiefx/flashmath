'use client';

/**
 * TeammateSpectatorView
 * 
 * Full real-time view for teammates watching the active player.
 * Shows the current question, live typing input, and answer results.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AnswerResultToast } from './answer-result-toast';

interface TeammateSpectatorViewProps {
    activePlayer: {
        odUserId: string;
        odName: string;
        odLevel: number;
        odEquippedFrame: string | null;
        streak: number;
        score: number;
    };
    currentQuestion: {
        questionText: string;
        operation: string;
    } | null;
    currentInput: string;
    slotNumber: number;
    questionInSlot: number;
    totalQuestionsPerSlot: number;
    lastAnswerResult: {
        isCorrect: boolean;
        pointsEarned: number;
        answerTimeMs: number;
    } | null;
    isCurrentUser: boolean;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

const operationColors: Record<string, string> = {
    addition: 'text-emerald-400',
    subtraction: 'text-rose-400',
    multiplication: 'text-violet-400',
    division: 'text-amber-400',
    mixed: 'text-sky-400',
};

export function TeammateSpectatorView({
    activePlayer,
    currentQuestion,
    currentInput,
    slotNumber,
    questionInSlot,
    totalQuestionsPerSlot,
    lastAnswerResult,
    isCurrentUser,
}: TeammateSpectatorViewProps) {
    const operation = currentQuestion?.operation || 'addition';
    
    if (isCurrentUser) {
        // Current user sees their own input field, not spectator view
        return null;
    }
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative bg-gradient-to-b from-violet-950/80 to-slate-900/90
                       rounded-2xl border-2 border-violet-500/40 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-white/10">
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full",
                    "bg-black/30 backdrop-blur-sm"
                )}>
                    <span className={cn("text-lg font-bold", operationColors[operation])}>
                        {operationSymbols[operation]}
                    </span>
                    <span className={cn("font-bold text-sm uppercase", operationColors[operation])}>
                        {operation}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-sm text-white/70 font-medium">{activePlayer.odName}</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Streak indicator */}
                    {activePlayer.streak > 0 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1 px-3 py-1 rounded-full
                                       bg-orange-500/80 text-white font-bold"
                        >
                            <span>🔥</span>
                            <span className="text-sm">{activePlayer.streak}x</span>
                        </motion.div>
                    )}

                    {/* Score */}
                    <div className="text-sm text-white/50">
                        +{activePlayer.score}
                    </div>
                </div>
            </div>
            
            {/* Question Display */}
            <div className="p-8">
                {/* Progress dots */}
                <div className="flex justify-center gap-3 mb-6">
                    {Array.from({ length: totalQuestionsPerSlot }).map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-4 h-4 rounded-full transition-all",
                                i < questionInSlot && "bg-emerald-500",
                                i === questionInSlot && "bg-orange-500 scale-110",
                                i > questionInSlot && "bg-white/20"
                            )}
                        />
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {currentQuestion ? (
                        <motion.div
                            key={`${slotNumber}-${questionInSlot}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="text-center"
                        >
                            {/* Question */}
                            <div className="text-6xl font-black text-white tracking-tight drop-shadow-lg mb-8">
                                {currentQuestion.questionText}
                            </div>

                            {/* Live typing indicator styled like input box */}
                            <div className="flex justify-center">
                                <div className="w-80 h-16 flex items-center justify-center
                                               bg-slate-900/60 backdrop-blur-sm
                                               border-2 rounded-2xl border-orange-500/50">
                                    <span className="text-3xl font-mono font-bold text-white/40">
                                        {currentInput || '='}
                                    </span>
                                    {currentInput && (
                                        <span className="inline-block w-0.5 h-8 bg-orange-500 animate-pulse ml-1" />
                                    )}
                                </div>
                            </div>

                            <p className="text-center text-white/30 text-xs mt-4">
                                {activePlayer.odName} is typing...
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center text-white/50"
                        >
                            Waiting for question...
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            {/* Answer result toast */}
            <AnimatePresence>
                {lastAnswerResult && (
                    <AnswerResultToast
                        isCorrect={lastAnswerResult.isCorrect}
                        pointsEarned={lastAnswerResult.pointsEarned}
                        answerTimeMs={lastAnswerResult.answerTimeMs}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}



