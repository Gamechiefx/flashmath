'use client';

/**
 * StrategyTimer
 * 
 * Reusable countdown timer component for strategy phases.
 * Features:
 * - Circular progress visualization
 * - Urgency color transitions (green → amber → red)
 * - Phase labels
 * - Optional callbacks at specific times
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface StrategyTimerProps {
    /** Total duration in seconds */
    totalSeconds: number;
    /** Current remaining seconds */
    remainingSeconds: number;
    /** Current phase label */
    phase?: 'scouting' | 'assignment' | 'ready' | 'break' | 'halftime' | 'decision';
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Show progress ring */
    showProgress?: boolean;
    /** Show phase label */
    showPhase?: boolean;
    /** Callback when timer reaches 0 */
    onComplete?: () => void;
    /** Callback at specific second thresholds */
    onWarning?: (secondsRemaining: number) => void;
    /** Warning threshold in seconds (default: 10) */
    warningAt?: number;
    /** Urgent threshold in seconds (default: 5) */
    urgentAt?: number;
    /** Additional className */
    className?: string;
}

const PHASE_LABELS: Record<string, string> = {
    scouting: 'Scouting',
    assignment: 'Slot Assignment',
    ready: 'Ready Check',
    break: 'Tactical Break',
    halftime: 'Halftime',
    decision: 'IGL Decision',
};

const SIZE_CONFIG = {
    sm: { ring: 60, stroke: 4, text: 'text-xl', label: 'text-[10px]' },
    md: { ring: 100, stroke: 6, text: 'text-3xl', label: 'text-xs' },
    lg: { ring: 140, stroke: 8, text: 'text-5xl', label: 'text-sm' },
};

export function StrategyTimer({
    totalSeconds,
    remainingSeconds,
    phase,
    size = 'md',
    showProgress = true,
    showPhase = true,
    onComplete,
    onWarning,
    warningAt = 10,
    urgentAt = 5,
    className,
}: StrategyTimerProps) {
    const [hasCalledComplete, setHasCalledComplete] = useState(false);
    const [warningsCalled, setWarningsCalled] = useState<Set<number>>(new Set());
    const prevRemainingRef = useRef(remainingSeconds);

    // Calculate progress percentage
    const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

    // Determine urgency level
    const isUrgent = remainingSeconds <= urgentAt;
    const isWarning = remainingSeconds <= warningAt && !isUrgent;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isNormal = !isUrgent && !isWarning;

    // Colors based on urgency
    const ringColor = isUrgent ? 'stroke-red-500' : isWarning ? 'stroke-amber-500' : 'stroke-green-500';
    const textColor = isUrgent ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-green-400';
    const glowColor = isUrgent ? 'shadow-red-500/30' : isWarning ? 'shadow-amber-500/30' : 'shadow-green-500/30';

    const config = SIZE_CONFIG[size];
    const radius = (config.ring - config.stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - progress);

    // Format time
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const timeDisplay = minutes > 0 
        ? `${minutes}:${seconds.toString().padStart(2, '0')}` 
        : seconds.toString();

    // Handle callbacks
    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            // Complete callback
            if (remainingSeconds <= 0 && !hasCalledComplete && onComplete) {
                setHasCalledComplete(true);
                onComplete();
            }

            // Warning callbacks at specific thresholds
            if (onWarning && remainingSeconds < prevRemainingRef.current) {
                const thresholds = [30, 15, 10, 5, 3, 2, 1];
                for (const threshold of thresholds) {
                    if (remainingSeconds === threshold && !warningsCalled.has(threshold)) {
                        setWarningsCalled(prev => new Set([...prev, threshold]));
                        onWarning(threshold);
                    }
                }
            }
        }, 0);

        prevRemainingRef.current = remainingSeconds;
    }, [remainingSeconds, hasCalledComplete, onComplete, onWarning, warningsCalled]);

    // Reset when totalSeconds changes (new timer started)
    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            setHasCalledComplete(false);
            setWarningsCalled(new Set());
        }, 0);
    }, [totalSeconds]);

    return (
        <div className={cn("flex flex-col items-center gap-2", className)}>
            {/* Circular Timer */}
            <div 
                className={cn(
                    "relative flex items-center justify-center",
                    isUrgent && "animate-pulse"
                )}
                style={{ width: config.ring, height: config.ring }}
            >
                {showProgress && (
                    <svg
                        className="absolute transform -rotate-90"
                        width={config.ring}
                        height={config.ring}
                    >
                        {/* Background ring */}
                        <circle
                            cx={config.ring / 2}
                            cy={config.ring / 2}
                            r={radius}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={config.stroke}
                            className="text-white/10"
                        />
                        {/* Progress ring */}
                        <motion.circle
                            cx={config.ring / 2}
                            cy={config.ring / 2}
                            r={radius}
                            fill="none"
                            strokeWidth={config.stroke}
                            strokeLinecap="round"
                            className={ringColor}
                            strokeDasharray={circumference}
                            initial={{ strokeDashoffset: 0 }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 0.5, ease: 'linear' }}
                        />
                    </svg>
                )}

                {/* Time Display */}
                <div className={cn(
                    "flex flex-col items-center justify-center",
                    "rounded-full shadow-lg",
                    glowColor
                )}>
                    <span className={cn("font-mono font-black", config.text, textColor)}>
                        {timeDisplay}
                    </span>
                </div>
            </div>

            {/* Phase Label */}
            {showPhase && phase && (
                <div className="flex items-center gap-2">
                    <Clock className={cn("w-4 h-4", textColor)} />
                    <span className={cn("font-bold uppercase tracking-wider", config.label, "text-white/60")}>
                        {PHASE_LABELS[phase] || phase}
                    </span>
                </div>
            )}

            {/* Urgency Indicator */}
            {isUrgent && remainingSeconds > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30"
                >
                    <span className="text-xs font-bold text-red-400">
                        ⚠️ Hurry up!
                    </span>
                </motion.div>
            )}
        </div>
    );
}

/**
 * Standalone hook for countdown logic
 */
export function useCountdown(initialSeconds: number, autoStart = true) {
    const [remaining, setRemaining] = useState(initialSeconds);
    const [isRunning, setIsRunning] = useState(autoStart);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isRunning && remaining > 0) {
            intervalRef.current = setInterval(() => {
                setRemaining(prev => Math.max(0, prev - 1));
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning, remaining]);

    const start = () => setIsRunning(true);
    const pause = () => setIsRunning(false);
    const reset = (seconds?: number) => {
        setRemaining(seconds ?? initialSeconds);
        setIsRunning(false);
    };

    return { remaining, isRunning, start, pause, reset };
}

