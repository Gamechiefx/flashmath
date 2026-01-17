'use client';

/**
 * RelayProgressBar
 * 
 * Visual representation of relay progress through all 5 operation slots.
 * Shows completed slots, active slot with question progress, and waiting slots.
 * 
 * Per spec:
 * RELAY: [+]✓ → [−]✓ → [×]●●○○ → [÷]⏳ → [?]⏳
 *        Kira   Marcus  YOU      Priya    Jax
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, Clock, Zap } from 'lucide-react';

export interface SlotProgress {
    operation: string;
    playerName: string;
    playerId: string;
    status: 'waiting' | 'active' | 'complete';
    questionsCorrect: number;
    questionsTotal: number;
    isCurrentUser?: boolean;
    isIgl?: boolean;
    isAnchor?: boolean;
}

interface RelayProgressBarProps {
    slots: SlotProgress[];
    currentSlot: number;
    questionsInSlot: number;
    totalPerSlot: number;
    showPlayers?: boolean;
    compact?: boolean;
    className?: string;
}

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

const operationColors: Record<string, { bg: string; border: string; text: string }> = {
    addition: { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400' },
    subtraction: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400' },
    multiplication: { bg: 'bg-purple-500/20', border: 'border-purple-500', text: 'text-purple-400' },
    division: { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400' },
    mixed: { bg: 'bg-pink-500/20', border: 'border-pink-500', text: 'text-pink-400' },
};

function SlotIndicator({
    slot,
    slotIndex,
    currentSlot,
    questionsInSlot,
    totalPerSlot,
    showPlayers,
    compact,
}: {
    slot: SlotProgress;
    slotIndex: number;
    currentSlot: number;
    questionsInSlot: number;
    totalPerSlot: number;
    showPlayers?: boolean;
    compact?: boolean;
}) {
    const isActive = slotIndex + 1 === currentSlot;
    const isComplete = slot.status === 'complete' || slotIndex + 1 < currentSlot;
    const isWaiting = slotIndex + 1 > currentSlot;
    const colors = operationColors[slot.operation] || operationColors.mixed;
    
    return (
        <div className="flex flex-col items-center">
            {/* Slot box */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: slotIndex * 0.05 }}
                className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl border-2 transition-all",
                    compact ? "w-12 h-12" : "w-16 h-16 md:w-20 md:h-20",
                    isComplete && "bg-emerald-500/20 border-emerald-500/50",
                    isActive && `${colors.bg} ${colors.border} ring-2 ring-white/20`,
                    isWaiting && "bg-white/5 border-white/20"
                )}
            >
                {/* Operation symbol */}
                <span className={cn(
                    "font-black transition-colors",
                    compact ? "text-lg" : "text-2xl md:text-3xl",
                    isComplete && "text-emerald-400",
                    isActive && colors.text,
                    isWaiting && "text-white/40"
                )}>
                    {operationSymbols[slot.operation] || '?'}
                </span>
                
                {/* Status indicator */}
                {isComplete && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full 
                                   flex items-center justify-center"
                    >
                        <Check className="w-3 h-3 text-white" />
                    </motion.div>
                )}
                
                {isWaiting && (
                    <Clock className={cn(
                        "absolute -top-1 -right-1 text-white/30",
                        compact ? "w-3 h-3" : "w-4 h-4"
                    )} />
                )}
                
                {/* Active slot: question progress dots */}
                {isActive && !compact && (
                    <div className="flex gap-1 mt-1">
                        {Array.from({ length: totalPerSlot }).map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className={cn(
                                    "w-2 h-2 rounded-full transition-colors",
                                    i < questionsInSlot
                                        ? "bg-emerald-400"
                                        : i === questionsInSlot
                                            ? "bg-amber-400 animate-pulse"
                                            : "bg-white/20"
                                )}
                            />
                        ))}
                    </div>
                )}
            </motion.div>
            
            {/* Player name */}
            {showPlayers && (
                <div className="mt-2 text-center">
                    <p className={cn(
                        "text-xs font-medium truncate max-w-[60px] md:max-w-[80px]",
                        slot.isCurrentUser ? "text-primary" : "text-white/60"
                    )}>
                        {slot.isCurrentUser ? 'YOU' : slot.playerName}
                    </p>
                    {(slot.isIgl || slot.isAnchor) && (
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                            {slot.isIgl && (
                                <span className="text-[10px] text-amber-400">👑</span>
                            )}
                            {slot.isAnchor && (
                                <span className="text-[10px] text-cyan-400">⚓</span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ArrowConnector({ isComplete, compact }: { isComplete: boolean; compact?: boolean }) {
    return (
        <div className={cn(
            "flex items-center",
            compact ? "mx-1" : "mx-2 md:mx-3"
        )}>
            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                className={cn(
                    "h-0.5 rounded origin-left",
                    compact ? "w-4" : "w-6 md:w-8",
                    isComplete ? "bg-emerald-500/50" : "bg-white/10"
                )}
            />
            <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                    "text-xs",
                    isComplete ? "text-emerald-500/50" : "text-white/20"
                )}
            >
                →
            </motion.div>
        </div>
    );
}

export function RelayProgressBar({
    slots,
    currentSlot,
    questionsInSlot,
    totalPerSlot,
    showPlayers = true,
    compact = false,
    className,
}: RelayProgressBarProps) {
    // Ensure we have 5 slots
    const normalizedSlots = slots.length === 5 
        ? slots 
        : Array.from({ length: 5 }, (_, i) => slots[i] || {
            operation: ['addition', 'subtraction', 'multiplication', 'division', 'mixed'][i],
            playerName: 'Unknown',
            playerId: '',
            status: 'waiting' as const,
            questionsCorrect: 0,
            questionsTotal: totalPerSlot,
        });

    return (
        <div className={cn("py-2", className)}>
            {/* Header label */}
            {!compact && (
                <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                        Relay Progress
                    </span>
                </div>
            )}
            
            {/* Slots with arrows */}
            <div className="flex items-center justify-center">
                {normalizedSlots.map((slot, index) => (
                    <div key={index} className="flex items-center">
                        <SlotIndicator
                            slot={slot}
                            slotIndex={index}
                            currentSlot={currentSlot}
                            questionsInSlot={questionsInSlot}
                            totalPerSlot={totalPerSlot}
                            showPlayers={showPlayers}
                            compact={compact}
                        />
                        {index < normalizedSlots.length - 1 && (
                            <ArrowConnector 
                                isComplete={index + 1 < currentSlot}
                                compact={compact}
                            />
                        )}
                    </div>
                ))}
            </div>
            
            {/* Legend */}
            {!compact && (
                <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-white/40">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Complete</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>Active</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-white/20" />
                        <span>Waiting</span>
                    </div>
                </div>
            )}
        </div>
    );
}

