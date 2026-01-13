'use client';

/**
 * HandoffCountdown
 * 
 * Visual countdown overlay alerting the player when their turn is approaching.
 * 
 * Per spec:
 * - 5s: "Get Ready" (dim)
 * - 3s: "3..." (amber) + soft ping
 * - 2s: "2..." (amber) + medium ping  
 * - 1s: "1..." + question (blurred) + high ping
 * - 0s: Question unblurs + GO chime
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Zap, Target } from 'lucide-react';

interface HandoffCountdownProps {
    secondsUntil: number;
    operation: string;
    operationLabel?: string;
    isVisible: boolean;
    questionPreview?: string;
    onComplete?: () => void;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

const operationLabels: Record<string, string> = {
    addition: 'ADDITION',
    subtraction: 'SUBTRACTION',
    multiplication: 'MULTIPLICATION',
    division: 'DIVISION',
    mixed: 'MIXED',
};

const operationColors: Record<string, string> = {
    addition: 'from-emerald-500 to-emerald-600',
    subtraction: 'from-blue-500 to-blue-600',
    multiplication: 'from-purple-500 to-purple-600',
    division: 'from-orange-500 to-orange-600',
    mixed: 'from-pink-500 to-pink-600',
};

export function HandoffCountdown({
    secondsUntil,
    operation,
    operationLabel,
    isVisible,
    questionPreview,
    onComplete,
}: HandoffCountdownProps) {
    const [countdown, setCountdown] = useState(secondsUntil);
    const audioContextRef = useRef<AudioContext | null>(null);
    
    // Initialize audio context
    useEffect(() => {
        if (typeof window !== 'undefined' && !audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return () => {
            audioContextRef.current?.close();
        };
    }, []);
    
    // Play ping sound
    const playPing = (frequency: number, duration: number) => {
        if (!audioContextRef.current) return;
        
        try {
            const ctx = audioContextRef.current;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + duration);
        } catch (e) {
            // Ignore audio errors
        }
    };
    
    // Countdown effect
    useEffect(() => {
        if (!isVisible) {
            setCountdown(secondsUntil);
            return;
        }
        
        setCountdown(secondsUntil);
        
        const interval = setInterval(() => {
            setCountdown(prev => {
                const next = prev - 1;
                
                // Play sounds at specific times
                if (next === 3) playPing(440, 0.15); // Soft ping
                if (next === 2) playPing(523, 0.2);  // Medium ping
                if (next === 1) playPing(659, 0.25); // High ping
                if (next === 0) {
                    playPing(880, 0.4); // GO chime
                    onComplete?.();
                }
                
                return Math.max(0, next);
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isVisible, secondsUntil, onComplete]);
    
    const getStateStyle = () => {
        if (countdown > 5) return { label: 'STANDBY', color: 'text-white/40' };
        if (countdown > 3) return { label: 'GET READY', color: 'text-white/60' };
        if (countdown > 0) return { label: countdown.toString(), color: 'text-amber-400' };
        return { label: 'GO!', color: 'text-emerald-400' };
    };
    
    const state = getStateStyle();
    const symbol = operationSymbols[operation] || '?';
    const label = operationLabel || operationLabels[operation] || operation.toUpperCase();
    const gradient = operationColors[operation] || operationColors.mixed;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center 
                               bg-black/80 backdrop-blur-md"
                >
                    <motion.div
                        initial={{ scale: 0.8, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.8, y: -20 }}
                        className="text-center max-w-md mx-auto px-6"
                    >
                        {/* Pulsing ring */}
                        <div className="relative mb-8">
                            <motion.div
                                animate={{
                                    scale: [1, 1.2, 1],
                                    opacity: [0.5, 0.2, 0.5],
                                }}
                                transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                                className={cn(
                                    "absolute inset-0 rounded-full bg-gradient-to-br",
                                    gradient
                                )}
                                style={{ 
                                    width: '150px', 
                                    height: '150px',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                            />
                            
                            {/* Operation symbol */}
                            <motion.div
                                animate={countdown <= 3 && countdown > 0 ? {
                                    scale: [1, 1.1, 1],
                                } : {}}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className={cn(
                                    "relative w-32 h-32 mx-auto rounded-full flex items-center justify-center",
                                    "bg-gradient-to-br shadow-2xl",
                                    gradient
                                )}
                            >
                                <span className="text-6xl font-black text-white drop-shadow-lg">
                                    {symbol}
                                </span>
                            </motion.div>
                        </div>
                        
                        {/* Countdown or status */}
                        <motion.div
                            key={state.label}
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="mb-4"
                        >
                            {countdown > 0 && countdown <= 3 ? (
                                <motion.span
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5 }}
                                    className={cn("text-8xl font-black", state.color)}
                                >
                                    {countdown}
                                </motion.span>
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                    <Zap className={cn("w-6 h-6", state.color)} />
                                    <span className={cn("text-2xl font-bold", state.color)}>
                                        {state.label}
                                    </span>
                                </div>
                            )}
                        </motion.div>
                        
                        {/* Operation label */}
                        <motion.h2
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="text-xl font-bold text-white mb-2"
                        >
                            YOUR TURN: {label}
                        </motion.h2>
                        
                        {/* Question preview (blurred until GO) */}
                        {questionPreview && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className={cn(
                                    "mt-6 p-4 rounded-xl bg-white/5 border border-white/10",
                                    countdown > 0 && "blur-sm"
                                )}
                            >
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <Target className="w-4 h-4 text-white/40" />
                                    <span className="text-xs text-white/40 uppercase tracking-wider">
                                        First Question
                                    </span>
                                </div>
                                <p className="text-2xl font-mono font-bold text-white">
                                    {questionPreview}
                                </p>
                            </motion.div>
                        )}
                        
                        {/* Timer bar */}
                        <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: secondsUntil, ease: "linear" }}
                            className={cn(
                                "mt-8 h-1 rounded-full origin-left bg-gradient-to-r",
                                gradient
                            )}
                        />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

