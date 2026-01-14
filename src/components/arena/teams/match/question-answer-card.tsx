'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Plus, Minus, X, Divide, Shuffle, Zap, Crown, Anchor,
    Check, AlertCircle, Flame, Timer, Target, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionAnswerCardProps {
    /** The math question to display */
    question: string;
    /** Operation type for theming */
    operation: 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed' | string;
    /** Current question number (1-5) */
    questionNumber: number;
    /** Total questions in slot (usually 5) */
    totalQuestions: number;
    /** Slot label (e.g., "Addition", "Mixed") */
    slotLabel: string;
    /** Current streak count */
    streak: number;
    /** Player's current score in this slot */
    slotScore: number;
    /** Is the player IGL? */
    isIgl?: boolean;
    /** Is the player Anchor? */
    isAnchor?: boolean;
    /** Player name */
    playerName: string;
    /** Callback when answer is submitted */
    onSubmit: (answer: string) => void;
    /** Callback when input changes (for typing indicators) */
    onInputChange?: (input: string) => void;
    /** Last answer result for feedback */
    lastResult?: {
        isCorrect: boolean;
        pointsEarned: number;
        correctAnswer?: string;
        newStreak: number;
    } | null;
    /** Optional time remaining in ms */
    timeRemainingMs?: number;
    /** Whether input is disabled */
    disabled?: boolean;
}

const OPERATION_CONFIG: Record<string, { 
    icon: React.ElementType; 
    color: string; 
    bgColor: string;
    borderColor: string;
    label: string;
}> = {
    addition: { 
        icon: Plus, 
        color: 'text-emerald-400', 
        bgColor: 'from-emerald-500/20 to-emerald-900/40',
        borderColor: 'border-emerald-500/40',
        label: 'Addition'
    },
    subtraction: { 
        icon: Minus, 
        color: 'text-rose-400', 
        bgColor: 'from-rose-500/20 to-rose-900/40',
        borderColor: 'border-rose-500/40',
        label: 'Subtraction'
    },
    multiplication: { 
        icon: X, 
        color: 'text-amber-400', 
        bgColor: 'from-amber-500/20 to-amber-900/40',
        borderColor: 'border-amber-500/40',
        label: 'Multiplication'
    },
    division: { 
        icon: Divide, 
        color: 'text-violet-400', 
        bgColor: 'from-violet-500/20 to-violet-900/40',
        borderColor: 'border-violet-500/40',
        label: 'Division'
    },
    mixed: { 
        icon: Shuffle, 
        color: 'text-cyan-400', 
        bgColor: 'from-cyan-500/20 to-cyan-900/40',
        borderColor: 'border-cyan-500/40',
        label: 'Mixed'
    },
};

export function QuestionAnswerCard({
    question,
    operation,
    questionNumber,
    totalQuestions,
    slotLabel,
    streak,
    slotScore,
    isIgl = false,
    isAnchor = false,
    playerName,
    onSubmit,
    onInputChange,
    lastResult,
    timeRemainingMs,
    disabled = false,
}: QuestionAnswerCardProps) {
    const [input, setInput] = useState('');
    const [isShaking, setIsShaking] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    
    const opConfig = OPERATION_CONFIG[operation] || OPERATION_CONFIG.mixed;
    const OpIcon = opConfig.icon;
    
    // Focus input on mount
    useEffect(() => {
        if (!disabled && inputRef.current) {
            inputRef.current.focus();
        }
    }, [question, disabled]);
    
    // Clear input when question changes
    useEffect(() => {
        setInput('');
    }, [question]);
    
    // Shake effect on wrong answer
    useEffect(() => {
        if (lastResult && !lastResult.isCorrect) {
            setIsShaking(true);
            const timer = setTimeout(() => setIsShaking(false), 500);
            return () => clearTimeout(timer);
        }
    }, [lastResult]);
    
    const handleInputChange = useCallback((value: string) => {
        // Only allow numbers and negative sign
        const sanitized = value.replace(/[^0-9.-]/g, '');
        setInput(sanitized);
        onInputChange?.(sanitized);
    }, [onInputChange]);
    
    const handleSubmit = useCallback(() => {
        if (input.trim() && !disabled) {
            onSubmit(input.trim());
            setInput('');
        }
    }, [input, disabled, onSubmit]);
    
    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    }, [handleSubmit]);
    
    // Streak tier for visual effects
    const streakTier = streak >= 10 ? 'legendary' : streak >= 5 ? 'epic' : streak >= 3 ? 'hot' : 'normal';
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{
                opacity: 1,
                y: 0,
                x: isShaking ? [0, -10, 10, -10, 10, 0] : 0
            }}
            transition={{ duration: 0.3 }}
            className={cn(
                "relative rounded-2xl overflow-hidden",
                "bg-gradient-to-b from-violet-950/80 to-slate-900/90",
                "border-2 border-violet-500/40",
                streakTier === 'legendary' && "ring-2 ring-amber-400/50 ring-offset-2 ring-offset-slate-900",
                streakTier === 'epic' && "ring-2 ring-violet-400/50"
            )}
        >
            {/* Streak Fire Effect */}
            {streakTier !== 'normal' && (
                <motion.div
                    className="absolute inset-0 pointer-events-none"
                    animate={{ opacity: [0.3, 0.5, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                >
                    <div className={cn(
                        "absolute inset-0",
                        streakTier === 'legendary' && "bg-gradient-to-t from-amber-500/20 via-orange-500/10 to-transparent",
                        streakTier === 'epic' && "bg-gradient-to-t from-violet-500/15 via-purple-500/10 to-transparent",
                        streakTier === 'hot' && "bg-gradient-to-t from-orange-500/10 to-transparent"
                    )} />
                </motion.div>
            )}
            
            {/* Header: Operation Badge + Player Info + Streak */}
            <div className="px-6 pt-4 pb-2 grid grid-cols-3 items-center border-b border-white/10">
                {/* Operation Badge - Left */}
                <div className="flex justify-start">
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full",
                        "bg-black/30 backdrop-blur-sm"
                    )}>
                        <OpIcon className={cn("w-5 h-5", opConfig.color)} />
                        <span className={cn("font-bold text-sm", opConfig.color)}>
                            {slotLabel.toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* Player Info - Center (always centered) */}
                <div className="flex items-center justify-center gap-2">
                    {isIgl && <Crown className="w-4 h-4 text-yellow-400" />}
                    {isAnchor && <Anchor className="w-4 h-4 text-cyan-400" />}
                    <span className="text-sm text-white/70 font-medium">{playerName}</span>
                </div>

                {/* Streak Indicator - Right */}
                <div className="flex items-center justify-end gap-2">
                    {streak > 0 && (
                        <motion.div
                            className={cn(
                                "flex items-center gap-1 px-3 py-1 rounded-full font-bold",
                                streakTier === 'legendary' && "bg-gradient-to-r from-amber-500 to-orange-500 text-black",
                                streakTier === 'epic' && "bg-gradient-to-r from-violet-500 to-purple-500 text-white",
                                streakTier === 'hot' && "bg-orange-500/80 text-white",
                                streakTier === 'normal' && "bg-white/10 text-orange-400"
                            )}
                            animate={streakTier !== 'normal' ? { scale: [1, 1.05, 1] } : {}}
                            transition={{ duration: 0.5, repeat: Infinity }}
                        >
                            {streakTier === 'legendary' ? (
                                <Sparkles className="w-4 h-4" />
                            ) : streakTier !== 'normal' ? (
                                <Flame className="w-4 h-4" />
                            ) : (
                                <Zap className="w-4 h-4" />
                            )}
                            <span className="text-sm">{streak}x</span>
                        </motion.div>
                    )}

                    {/* Slot Score */}
                    <div className="text-sm text-white/50">
                        +{slotScore}
                    </div>
                </div>
            </div>
            
            {/* Main Question Area */}
            <div className="p-8">
                {/* Question Progress Circles */}
                <div className="flex justify-center gap-3 mb-6">
                    {Array.from({ length: totalQuestions }).map((_, i) => (
                        <motion.div
                            key={i}
                            className={cn(
                                "w-4 h-4 rounded-full transition-all",
                                i < questionNumber - 1 && "bg-emerald-500",
                                i === questionNumber - 1 && "bg-orange-500 scale-110",
                                i > questionNumber - 1 && "bg-white/20"
                            )}
                        />
                    ))}
                </div>
                
                {/* Question Display */}
                <motion.div
                    key={question}
                    initial={{ opacity: 0, scale: 0.9, rotateX: -15 }}
                    animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                    className="text-center mb-8"
                >
                    <div className="text-6xl font-black text-white tracking-tight drop-shadow-lg">
                        {question}
                    </div>
                </motion.div>
                
                {/* Answer Input */}
                <div className="flex justify-center">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            value={input}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={disabled}
                            data-particle-target="arena-answer"
                            className={cn(
                                "w-80 h-16 text-center text-3xl font-mono font-bold",
                                "bg-slate-900/60 backdrop-blur-sm",
                                "border-2 rounded-2xl border-orange-500",
                                "text-white placeholder-white/40",
                                "outline-none transition-all",
                                "focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400",
                                disabled && "opacity-50 cursor-not-allowed"
                            )}
                            placeholder="="
                            autoComplete="off"
                            autoFocus
                        />

                        {/* Submit Button */}
                        <motion.button
                            onClick={handleSubmit}
                            disabled={!input.trim() || disabled}
                            className={cn(
                                "absolute right-2 top-1/2 -translate-y-1/2",
                                "w-12 h-12 rounded-xl",
                                "bg-rose-900/80 hover:bg-rose-800/80",
                                "text-white/60 font-bold text-xl",
                                "disabled:opacity-30 disabled:cursor-not-allowed",
                                "transition-all"
                            )}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            ↵
                        </motion.button>
                    </div>
                </div>
                
                {/* Keyboard Hint */}
                <p className="text-center text-white/30 text-xs mt-4">
                    Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/50">Enter</kbd> to submit
                </p>
            </div>
            
            {/* Answer Result Feedback - Non-blocking floating notification */}
            <AnimatePresence>
                {lastResult && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.8 }}
                        className={cn(
                            "absolute top-4 left-1/2 -translate-x-1/2 z-20",
                            "pointer-events-none", // Don't block input!
                            "px-6 py-3 rounded-full shadow-lg",
                            "flex items-center gap-3",
                            lastResult.isCorrect 
                                ? "bg-emerald-500/90 border-2 border-emerald-400" 
                                : "bg-rose-500/90 border-2 border-rose-400"
                        )}
                    >
                        {lastResult.isCorrect ? (
                            <>
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: [0, 1.3, 1] }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <Check className="w-6 h-6 text-white" />
                                </motion.div>
                                <span className="text-lg font-black text-white">
                                    +{lastResult.pointsEarned}
                                </span>
                                {lastResult.newStreak > 1 && (
                                    <span className="flex items-center gap-1 text-amber-300 font-bold">
                                        <Zap className="w-4 h-4" />
                                        {lastResult.newStreak}x
                                    </span>
                                )}
                            </>
                        ) : (
                            <>
                                <motion.div
                                    initial={{ scale: 0, rotate: -90 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <AlertCircle className="w-6 h-6 text-white" />
                                </motion.div>
                                <span className="text-lg font-black text-white">
                                    WRONG
                                </span>
                                {lastResult.correctAnswer && (
                                    <span className="text-white/80 font-medium">
                                        = {lastResult.correctAnswer}
                                    </span>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Timer Bar (if provided) */}
            {timeRemainingMs !== undefined && (
                <div className="h-1 bg-black/30">
                    <motion.div
                        className={cn(
                            "h-full",
                            timeRemainingMs > 5000 ? "bg-primary" : "bg-rose-500"
                        )}
                        initial={{ width: '100%' }}
                        animate={{ width: `${Math.max(0, (timeRemainingMs / 30000) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            )}
        </motion.div>
    );
}

// Compact version for spectating teammates
export function QuestionCardSpectator({
    question,
    operation,
    playerName,
    currentInput,
    streak,
    slotLabel,
    questionNumber,
    totalQuestions,
}: {
    question: string;
    operation: string;
    playerName: string;
    currentInput: string;
    streak: number;
    slotLabel: string;
    questionNumber: number;
    totalQuestions: number;
}) {
    const opConfig = OPERATION_CONFIG[operation] || OPERATION_CONFIG.mixed;
    const OpIcon = opConfig.icon;
    
    return (
        <div className={cn(
            "rounded-xl overflow-hidden",
            "bg-gradient-to-b",
            opConfig.bgColor,
            "border",
            opConfig.borderColor
        )}>
            {/* Header */}
            <div className="px-4 py-2 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                    <OpIcon className={cn("w-4 h-4", opConfig.color)} />
                    <span className="text-sm font-medium text-white/80">{playerName}</span>
                </div>
                {streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-400">
                        <Zap className="w-3 h-3" />
                        <span className="text-xs font-bold">{streak}x</span>
                    </div>
                )}
            </div>
            
            {/* Question */}
            <div className="p-4 text-center">
                <div className="text-2xl font-bold text-white mb-2">
                    {question}
                </div>
                
                {/* Current Input Preview */}
                <div className="flex items-center justify-center gap-2">
                    <span className="text-white/50">=</span>
                    <div className="min-w-[60px] px-3 py-1 bg-black/30 rounded-lg">
                        <span className="text-lg font-mono text-primary">
                            {currentInput || '?'}
                        </span>
                        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />
                    </div>
                </div>
                
                {/* Progress */}
                <div className="flex justify-center gap-1 mt-3">
                    {Array.from({ length: totalQuestions }).map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-2 h-2 rounded-full",
                                i < questionNumber - 1 && "bg-emerald-500",
                                i === questionNumber - 1 && "bg-primary",
                                i > questionNumber - 1 && "bg-white/20"
                            )}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
