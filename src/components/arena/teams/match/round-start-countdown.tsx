'use client';

/**
 * RoundStartCountdown
 * 
 * Full-screen countdown overlay that displays before each round begins.
 * Ensures all players start on equal timing with a dramatic 5-4-3-2-1-GO! sequence.
 * 
 * Used at:
 * - Start of Round 1 (after strategy phase)
 * - After each break
 * - After halftime
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundEngine } from '@/lib/sound-engine';

interface RoundStartCountdownProps {
    round: number;
    half: number;
    isVisible: boolean;
    countdownSeconds?: number;
    onComplete?: () => void;
    myTeamName?: string;
    opponentTeamName?: string;
}

export function RoundStartCountdown({
    round,
    half,
    isVisible,
    countdownSeconds = 5,
    onComplete,
    myTeamName = 'Your Team',
    opponentTeamName = 'Opponent',
}: RoundStartCountdownProps) {
    const [countdown, setCountdown] = useState(countdownSeconds);
    const [showGo, setShowGo] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const onCompleteRef = useRef(onComplete);
    const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    
    // Keep onComplete ref updated
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);
    
    // Initialize audio context
    useEffect(() => {
        isMountedRef.current = true;
        
        if (typeof window !== 'undefined' && !audioContextRef.current) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkitAudioContext is not in TypeScript types
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch (e) {
                console.warn('[RoundCountdown] Failed to create AudioContext:', e);
            }
        }
        
        return () => {
            isMountedRef.current = false;
            // Clear all pending timeouts
            timeoutsRef.current.forEach(t => clearTimeout(t));
            timeoutsRef.current = [];
            // Clear interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            // Close audio context
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(() => {});
            }
        };
    }, []);
    
    // Play countdown beep - memoized to avoid recreation
    const playBeep = useCallback((frequency: number, duration: number, volume: number = 0.15) => {
        const ctx = audioContextRef.current;
        if (!ctx || ctx.state === 'closed' || !isMountedRef.current) return;
        
        try {
            // Handle suspended state with promise
            const doPlay = () => {
                if (!ctx || ctx.state === 'closed' || !isMountedRef.current) return;
                
                try {
                    const oscillator = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    
                    oscillator.frequency.value = frequency;
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
                    
                    oscillator.start(ctx.currentTime);
                    oscillator.stop(ctx.currentTime + duration);
                } catch (e) {
                    // Ignore audio errors silently
                }
            };
            
            if (ctx.state === 'suspended') {
                ctx.resume().then(doPlay).catch(() => {});
            } else {
                doPlay();
            }
        } catch (e) {
            // Ignore audio errors
        }
    }, []);
    
    // Countdown effect - runs on mount since component is conditionally rendered
    useEffect(() => {
        console.log('[RoundCountdown] Mounted - starting countdown from', countdownSeconds);

        // Play initial tick using soundEngine
        soundEngine.playCountdownTickIntense(countdownSeconds);

        let currentCount = countdownSeconds;

        intervalRef.current = setInterval(() => {
            if (!isMountedRef.current) return;

            currentCount -= 1;
            console.log('[RoundCountdown] Tick:', currentCount);

            if (currentCount > 0) {
                setCountdown(currentCount);
                // Use soundEngine for intense countdown ticks
                soundEngine.playCountdownTickIntense(currentCount);
            } else if (currentCount === 0) {
                setCountdown(0);
                setShowGo(true);
                console.log('[RoundCountdown] GO!');

                // Use soundEngine for GO! sound
                soundEngine.playGo();

                // Clear interval
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }

                // Call onComplete via ref after showing GO
                const t3 = setTimeout(() => {
                    if (isMountedRef.current) {
                        console.log('[RoundCountdown] Calling onComplete');
                        onCompleteRef.current?.();
                    }
                }, 800);
                timeoutsRef.current.push(t3);
            }
        }, 1000);

        return () => {
            console.log('[RoundCountdown] Cleanup - clearing interval');
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount
    
    const roundInHalf = half === 1 ? round : round - 4;
    const isFirstRound = round === 1 || round === 5;

    // Intensity increases as countdown decreases
    const isUrgent = countdown <= 2;
    const isMedium = countdown === 3;
    const spinDuration = isUrgent ? 0.3 : isMedium ? 0.5 : 0.8;
    const glowIntensity = isUrgent ? 0.6 : isMedium ? 0.4 : 0.3;
    const ringColor = isUrgent ? 'border-t-orange-500 border-r-rose-500/50' : isMedium ? 'border-t-amber-400 border-r-orange-400/50' : 'border-t-primary/60 border-r-primary/30';
    const textColor = isUrgent ? 'text-orange-400' : isMedium ? 'text-amber-300' : 'text-white';
    const glowColor = isUrgent ? 'bg-orange-500' : isMedium ? 'bg-amber-400' : 'bg-primary';
    const shadowColor = isUrgent ? 'drop-shadow-[0_0_40px_rgba(249,115,22,0.7)]' : isMedium ? 'drop-shadow-[0_0_35px_rgba(251,191,36,0.6)]' : 'drop-shadow-[0_0_30px_rgba(99,102,241,0.5)]';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
        >
            <div className="flex flex-col items-center justify-center">
                {/* Round label */}
                <motion.p
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-lg font-bold text-white/60 uppercase tracking-[0.3em] mb-8"
                >
                    {isFirstRound ? `Half ${half} • Round 1` : `Round ${round}`}
                </motion.p>

                {/* Main countdown or GO */}
                <div className="relative w-52 h-52 flex items-center justify-center">
                    {/* Animated ring - spins faster as countdown decreases */}
                    <motion.div
                        key={`ring-${countdown}`}
                        className="absolute inset-0"
                        animate={{ rotate: 360 }}
                        transition={{ duration: spinDuration, ease: "linear", repeat: Infinity }}
                    >
                        <div className={`w-full h-full rounded-full border-4 border-transparent ${ringColor}`} />
                    </motion.div>

                    {/* Pulsing outer ring - pulses faster when urgent */}
                    <motion.div
                        className="absolute inset-0"
                        animate={{ scale: isUrgent ? [1, 1.08, 1] : [1, 1.03, 1], opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: isUrgent ? 0.3 : 0.8, repeat: Infinity }}
                    >
                        <div className={`w-full h-full rounded-full border-2 ${isUrgent ? 'border-orange-500/40' : isMedium ? 'border-amber-400/30' : 'border-white/10'}`} />
                    </motion.div>

                    {/* Number display */}
                    <AnimatePresence mode="popLayout">
                        {!showGo ? (
                            <motion.div
                                key={countdown}
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 1.5, opacity: 0 }}
                                transition={{
                                    duration: 0.2,
                                    ease: "easeOut"
                                }}
                                className="relative flex items-center justify-center"
                            >
                                {/* Glow - intensifies with urgency */}
                                <motion.div
                                    className={`absolute w-32 h-32 blur-3xl ${glowColor} rounded-full`}
                                    animate={{ opacity: [glowIntensity, glowIntensity + 0.2, glowIntensity], scale: [1, 1.2, 1] }}
                                    transition={{ duration: isUrgent ? 0.3 : 0.6, repeat: Infinity }}
                                />
                                {/* Number - centered with flex */}
                                <motion.span
                                    className={`relative text-[120px] font-black leading-none flex items-center justify-center w-full h-full ${textColor} ${shadowColor}`}
                                    style={{ lineHeight: 1 }}
                                    animate={isUrgent ? { scale: [1, 1.1, 1] } : {}}
                                    transition={isUrgent ? { duration: 0.3, repeat: Infinity } : {}}
                                >
                                    {countdown}
                                </motion.span>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="go"
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 2, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                                className="relative flex items-center justify-center"
                            >
                                {/* Burst effect */}
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0.8 }}
                                    animate={{ scale: 4, opacity: 0 }}
                                    transition={{ duration: 0.6 }}
                                    className="absolute w-20 h-20 bg-emerald-500/50 rounded-full blur-2xl"
                                />
                                {/* GO text */}
                                <span className="relative text-[80px] font-black leading-none text-emerald-400 drop-shadow-[0_0_50px_rgba(52,211,153,0.9)]">
                                    GO!
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Pulse indicator - faster when urgent */}
                <motion.div
                    className="flex justify-center gap-2 mt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className={`w-2 h-2 rounded-full ${isUrgent ? 'bg-orange-400' : isMedium ? 'bg-amber-400' : 'bg-white/40'}`}
                            animate={{ opacity: [0.3, 1, 0.3], scale: isUrgent ? [1, 1.3, 1] : [1, 1.1, 1] }}
                            transition={{ duration: isUrgent ? 0.2 : 0.6, repeat: Infinity, delay: i * (isUrgent ? 0.05 : 0.15) }}
                        />
                    ))}
                </motion.div>
            </div>
        </motion.div>
    );
}
