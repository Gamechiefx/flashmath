'use client';

/**
 * RelayHandoff
 * 
 * Visual "baton pass" animation between teammates during the relay.
 * Shows when one player completes their slot and the next player begins.
 * 
 * Features:
 * - Outgoing player stats summary
 * - "Ready Set Go!" countdown for incoming player
 * - Baton pass visual
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight, Zap, Check, Target, User } from 'lucide-react';

interface RelayHandoffProps {
    isVisible: boolean;
    outgoingPlayer: {
        name: string;
        operation: string;
        questionsAnswered: number;
        correctAnswers: number;
        slotScore: number;
    };
    incomingPlayer: {
        name: string;
        operation: string;
        isCurrentUser: boolean;
    };
    slotNumber: number;
    onComplete?: () => void;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

const operationColors: Record<string, { bg: string; text: string; glow: string }> = {
    addition: { bg: 'bg-emerald-500', text: 'text-emerald-400', glow: 'shadow-emerald-500/50' },
    subtraction: { bg: 'bg-blue-500', text: 'text-blue-400', glow: 'shadow-blue-500/50' },
    multiplication: { bg: 'bg-purple-500', text: 'text-purple-400', glow: 'shadow-purple-500/50' },
    division: { bg: 'bg-orange-500', text: 'text-orange-400', glow: 'shadow-orange-500/50' },
    mixed: { bg: 'bg-pink-500', text: 'text-pink-400', glow: 'shadow-pink-500/50' },
};

export function RelayHandoff({
    isVisible,
    outgoingPlayer,
    incomingPlayer,
    slotNumber,
    onComplete,
}: RelayHandoffProps) {
    const [phase, setPhase] = useState<'summary' | 'ready' | 'set' | 'go'>('summary');
    const audioContextRef = useRef<AudioContext | null>(null);
    const hasCompletedRef = useRef(false);
    const isUnmountedRef = useRef(false);
    
    // Initialize audio context
    useEffect(() => {
        isUnmountedRef.current = false;
        
        if (typeof window !== 'undefined' && !audioContextRef.current) {
            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                // AudioContext not available
            }
        }
        return () => {
            isUnmountedRef.current = true;
            const ctx = audioContextRef.current;
            if (ctx && ctx.state !== 'closed') {
                try {
                    ctx.close();
                } catch (e) {
                    // Already closed or error closing
                }
            }
            audioContextRef.current = null;
        };
    }, []);
    
    // Play sound
    const playSound = (frequency: number, duration: number) => {
        // Don't play sounds if component is unmounting or AudioContext is unavailable
        if (isUnmountedRef.current || !audioContextRef.current) return;
        
        try {
            const ctx = audioContextRef.current;
            // Don't use a closed context
            if (ctx.state === 'closed') return;
            if (ctx.state === 'suspended') ctx.resume();
            
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
    
    // Animation sequence
    useEffect(() => {
        if (!isVisible) {
            setPhase('summary');
            hasCompletedRef.current = false;
            return;
        }
        
        hasCompletedRef.current = false;
        setPhase('summary');
        
        // Phase progression: summary (1s) -> ready (0.6s) -> set (0.6s) -> go (0.8s) -> complete
        const timers = [
            setTimeout(() => {
                if (isUnmountedRef.current) return;
                setPhase('ready');
                playSound(440, 0.15);
            }, 600),
            setTimeout(() => {
                if (isUnmountedRef.current) return;
                setPhase('set');
                playSound(523, 0.15);
            }, 1100),
            setTimeout(() => {
                if (isUnmountedRef.current) return;
                setPhase('go');
                playSound(659, 0.2);
                playSound(784, 0.3);
            }, 1600),
            setTimeout(() => {
                if (isUnmountedRef.current) return;
                if (!hasCompletedRef.current) {
                    hasCompletedRef.current = true;
                    onComplete?.();
                }
            }, 2400),
        ];
        
        return () => timers.forEach(clearTimeout);
    }, [isVisible, onComplete]);
    
    const outgoingColors = operationColors[outgoingPlayer.operation] || operationColors.mixed;
    const incomingColors = operationColors[incomingPlayer.operation] || operationColors.mixed;
    const accuracy = outgoingPlayer.questionsAnswered > 0 
        ? Math.round((outgoingPlayer.correctAnswers / outgoingPlayer.questionsAnswered) * 100)
        : 0;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-2xl mx-auto rounded-2xl overflow-hidden
                               bg-gradient-to-b from-slate-800/95 to-slate-900/95
                               border border-white/20 shadow-2xl"
                >
                    <div className="p-6 text-center">
                        {/* Slot transition indicator */}
                        <motion.div
                            initial={{ y: -10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="mb-6 text-sm font-medium text-white/50 uppercase tracking-wider"
                        >
                            Slot {slotNumber} → Slot {slotNumber + 1}
                        </motion.div>
                        
                        {/* Player transition */}
                        <div className="flex items-center justify-center gap-4 mb-8">
                            {/* Outgoing player */}
                            <motion.div
                                initial={{ x: 0, opacity: 1 }}
                                animate={phase !== 'summary' ? { x: -30, opacity: 0.4 } : {}}
                                transition={{ duration: 0.3 }}
                                className="text-center"
                            >
                                <div className={cn(
                                    "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2",
                                    outgoingColors.bg,
                                    "shadow-lg",
                                    outgoingColors.glow
                                )}>
                                    <span className="text-2xl font-bold text-white">
                                        {operationSymbols[outgoingPlayer.operation]}
                                    </span>
                                </div>
                                <p className="text-sm font-semibold text-white/80">{outgoingPlayer.name}</p>
                                <p className="text-xs text-white/40">{outgoingPlayer.operation}</p>
                            </motion.div>
                            
                            {/* Baton pass animation */}
                            <motion.div
                                animate={{
                                    x: phase === 'summary' ? 0 : [0, 20, 40],
                                    scale: phase === 'go' ? [1, 1.2, 1] : 1,
                                }}
                                transition={{ duration: 0.5 }}
                                className="relative"
                            >
                                <div className="w-12 h-4 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 shadow-lg shadow-amber-500/50" />
                                <motion.div
                                    animate={{ x: [0, 5, 0] }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="absolute -right-2 top-1/2 -translate-y-1/2"
                                >
                                    <ArrowRight className="w-5 h-5 text-amber-400" />
                                </motion.div>
                            </motion.div>
                            
                            {/* Incoming player */}
                            <motion.div
                                initial={{ x: 0, opacity: 0.4 }}
                                animate={phase !== 'summary' ? { x: 0, opacity: 1, scale: phase === 'go' ? 1.1 : 1 } : {}}
                                transition={{ duration: 0.3 }}
                                className="text-center"
                            >
                                <motion.div 
                                    animate={phase === 'go' ? { 
                                        boxShadow: ['0 0 20px rgba(52, 211, 153, 0.5)', '0 0 40px rgba(52, 211, 153, 0.8)', '0 0 20px rgba(52, 211, 153, 0.5)']
                                    } : {}}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className={cn(
                                        "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2",
                                        incomingColors.bg,
                                        "shadow-lg",
                                        incomingColors.glow,
                                        incomingPlayer.isCurrentUser && "ring-2 ring-white ring-offset-2 ring-offset-black"
                                    )}
                                >
                                    <span className="text-2xl font-bold text-white">
                                        {operationSymbols[incomingPlayer.operation]}
                                    </span>
                                </motion.div>
                                <p className="text-sm font-semibold text-white/80">
                                    {incomingPlayer.isCurrentUser ? 'YOU' : incomingPlayer.name}
                                </p>
                                <p className="text-xs text-white/40">{incomingPlayer.operation}</p>
                            </motion.div>
                        </div>
                        
                        {/* Phase display */}
                        <AnimatePresence mode="wait">
                            {phase === 'summary' && (
                                <motion.div
                                    key="summary"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-2"
                                >
                                    <div className="flex items-center justify-center gap-6 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-emerald-400" />
                                            <span className="text-white/60">
                                                {outgoingPlayer.correctAnswers}/{outgoingPlayer.questionsAnswered} correct
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Target className="w-4 h-4 text-amber-400" />
                                            <span className="text-white/60">{accuracy}% accuracy</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-purple-400" />
                                            <span className="text-white/60">+{outgoingPlayer.slotScore} pts</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            
                            {phase === 'ready' && (
                                <motion.div
                                    key="ready"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.2, opacity: 0 }}
                                    className="text-6xl font-black text-amber-400"
                                >
                                    READY
                                </motion.div>
                            )}
                            
                            {phase === 'set' && (
                                <motion.div
                                    key="set"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.2, opacity: 0 }}
                                    className="text-6xl font-black text-orange-400"
                                >
                                    SET
                                </motion.div>
                            )}
                            
                            {phase === 'go' && (
                                <motion.div
                                    key="go"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: [1, 1.1, 1], opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                                    className="text-7xl font-black text-emerald-400"
                                >
                                    GO!
                                </motion.div>
                            )}
                        </AnimatePresence>
                        
                        {/* Your turn indicator */}
                        {incomingPlayer.isCurrentUser && phase !== 'summary' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-6 flex items-center justify-center gap-2"
                            >
                                <User className="w-4 h-4 text-primary" />
                                <span className="text-sm font-bold text-primary uppercase tracking-wider">
                                    Your Turn!
                                </span>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
