'use client';

/**
 * AnswerResultToast
 * 
 * Animated toast showing correct/wrong answer result.
 * Appears briefly after each answer submission.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface AnswerResultToastProps {
    isCorrect: boolean;
    pointsEarned: number;
    answerTimeMs: number;
}

export function AnswerResultToast({
    isCorrect,
    pointsEarned,
    answerTimeMs,
}: AnswerResultToastProps) {
    const timeSeconds = (answerTimeMs / 1000).toFixed(1);
    
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className={cn(
                "absolute inset-x-4 bottom-4 p-4 rounded-xl",
                "flex items-center justify-between",
                "backdrop-blur-sm border",
                isCorrect 
                    ? "bg-emerald-500/20 border-emerald-500/30"
                    : "bg-rose-500/20 border-rose-500/30"
            )}
        >
            {/* Icon and result */}
            <div className="flex items-center gap-3">
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        isCorrect 
                            ? "bg-emerald-500 text-white"
                            : "bg-rose-500 text-white"
                    )}
                >
                    {isCorrect ? (
                        <Check className="w-6 h-6" />
                    ) : (
                        <X className="w-6 h-6" />
                    )}
                </motion.div>
                
                <div>
                    <p className={cn(
                        "font-bold text-lg",
                        isCorrect ? "text-emerald-400" : "text-rose-400"
                    )}>
                        {isCorrect ? 'CORRECT!' : 'WRONG'}
                    </p>
                    <p className="text-sm text-white/60">
                        {timeSeconds}s response time
                    </p>
                </div>
            </div>
            
            {/* Points earned */}
            {isCorrect && pointsEarned > 0 && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="text-right"
                >
                    <p className="text-3xl font-bold text-emerald-400">
                        +{pointsEarned}
                    </p>
                    <p className="text-xs text-emerald-400/60">points</p>
                </motion.div>
            )}
        </motion.div>
    );
}


