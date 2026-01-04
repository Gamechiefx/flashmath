'use client';

/**
 * TeammateSpectatorView
 * 
 * Full real-time view for teammates watching the active player.
 * Shows the current question, live typing input, and answer results.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LiveTypingIndicator } from './live-typing-indicator';
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
            className="relative bg-gradient-to-b from-slate-800/90 to-slate-900/90 
                       rounded-xl border border-white/10 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 
                            border-b border-white/10 bg-primary/10">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold",
                        "bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30",
                        operationColors[operation]
                    )}>
                        {operationSymbols[operation]}
                    </div>
                    <div>
                        <p className="text-sm text-white/50">Now Answering</p>
                        <p className="font-semibold text-white">{activePlayer.odName}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Streak indicator */}
                    {activePlayer.streak > 0 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1 px-3 py-1 rounded-full 
                                       bg-orange-500/20 border border-orange-500/30"
                        >
                            <span className="text-orange-400">🔥</span>
                            <span className="font-bold text-orange-400">{activePlayer.streak}</span>
                        </motion.div>
                    )}
                    
                    {/* Score */}
                    <div className="text-right">
                        <p className="text-xs text-white/50">Score</p>
                        <p className="font-mono font-bold text-lg text-primary">
                            +{activePlayer.score}
                        </p>
                    </div>
                </div>
            </div>
            
            {/* Question Display */}
            <div className="p-6">
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
                            <div className={cn(
                                "text-4xl md:text-5xl font-bold mb-6 tracking-wide",
                                operationColors[operation]
                            )}>
                                {currentQuestion.questionText}
                            </div>
                            
                            {/* Live typing indicator */}
                            <LiveTypingIndicator
                                playerName={activePlayer.odName}
                                currentInput={currentInput}
                            />
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
            
            {/* Progress bar */}
            <div className="px-4 pb-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">
                        Q{questionInSlot}/{totalQuestionsPerSlot}
                    </span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-primary to-primary/60"
                            initial={{ width: 0 }}
                            animate={{ 
                                width: `${(questionInSlot / totalQuestionsPerSlot) * 100}%` 
                            }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                    <div className="flex gap-1">
                        {Array.from({ length: totalQuestionsPerSlot }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "w-2 h-2 rounded-full transition-colors",
                                    i < questionInSlot 
                                        ? "bg-primary" 
                                        : "bg-white/20"
                                )}
                            />
                        ))}
                    </div>
                </div>
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


