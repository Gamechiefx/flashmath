'use client';

/**
 * TeamFormationProgress
 * 
 * Animated visualization of team slots filling up during matchmaking.
 * Shows avatars sliding into position as teammates join.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { User, Crown, Anchor, Loader2, Sparkles } from 'lucide-react';

export interface TeamSlot {
    position: number;
    playerId?: string;
    playerName?: string;
    avatarUrl?: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    isCurrentUser?: boolean;
    status: 'empty' | 'searching' | 'filled';
}

interface TeamFormationProgressProps {
    slots: TeamSlot[];
    teamSize: number;
    isSearching: boolean;
    searchTimeSeconds?: number;
    onComplete?: () => void;
    className?: string;
}

const slotPositions = [
    { x: 0, y: 0 },      // Center/Leader
    { x: -80, y: 40 },   // Left
    { x: 80, y: 40 },    // Right
    { x: -50, y: 90 },   // Far Left
    { x: 50, y: 90 },    // Far Right
];

function SlotAvatar({ slot, index }: { slot: TeamSlot; index: number }) {
    const pos = slotPositions[index] || { x: 0, y: index * 50 };
    
    return (
        <motion.div
            initial={{ scale: 0, opacity: 0, x: pos.x - 50, y: pos.y + 50 }}
            animate={{ 
                scale: 1, 
                opacity: 1, 
                x: pos.x, 
                y: pos.y,
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 20,
                delay: index * 0.1,
            }}
            className="absolute"
            style={{ 
                left: '50%', 
                top: '50%',
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
            }}
        >
            <motion.div
                whileHover={{ scale: 1.1 }}
                className={cn(
                    "relative w-16 h-16 rounded-full flex items-center justify-center",
                    "transition-all duration-300",
                    slot.status === 'filled' && "bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/50",
                    slot.status === 'searching' && "bg-white/5 border-2 border-dashed border-white/20",
                    slot.status === 'empty' && "bg-white/5 border border-white/10",
                    slot.isCurrentUser && "ring-2 ring-primary ring-offset-2 ring-offset-slate-900"
                )}
            >
                {slot.status === 'filled' ? (
                    <>
                        {slot.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Avatar URLs may be external
                            <img 
                                src={slot.avatarUrl} 
                                alt={slot.playerName} 
                                className="w-full h-full rounded-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full rounded-full bg-gradient-to-br 
                                            from-primary to-purple-600 flex items-center justify-center">
                                <span className="text-xl font-bold text-white">
                                    {slot.playerName?.charAt(0).toUpperCase() || '?'}
                                </span>
                            </div>
                        )}
                        
                        {/* Role badges */}
                        {slot.isIgl && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full 
                                           flex items-center justify-center shadow-lg"
                            >
                                <Crown className="w-3 h-3 text-white" />
                            </motion.div>
                        )}
                        {slot.isAnchor && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -bottom-1 -right-1 w-6 h-6 bg-cyan-500 rounded-full 
                                           flex items-center justify-center shadow-lg"
                            >
                                <Anchor className="w-3 h-3 text-white" />
                            </motion.div>
                        )}
                    </>
                ) : slot.status === 'searching' ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                        <Loader2 className="w-6 h-6 text-white/40" />
                    </motion.div>
                ) : (
                    <User className="w-6 h-6 text-white/20" />
                )}
            </motion.div>
            
            {/* Player name */}
            {slot.status === 'filled' && (
                <motion.p
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={cn(
                        "text-xs text-center mt-2 font-medium truncate max-w-[80px]",
                        slot.isCurrentUser ? "text-primary" : "text-white/70"
                    )}
                >
                    {slot.isCurrentUser ? 'YOU' : slot.playerName}
                </motion.p>
            )}
            {slot.status === 'searching' && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[10px] text-center mt-2 text-white/40"
                >
                    Searching...
                </motion.p>
            )}
        </motion.div>
    );
}

export function TeamFormationProgress({
    slots,
    teamSize,
    isSearching,
    searchTimeSeconds = 0,
    onComplete,
    className,
}: TeamFormationProgressProps) {
    const [showComplete, setShowComplete] = useState(false);
    const filledCount = slots.filter(s => s.status === 'filled').length;
    const isComplete = filledCount === teamSize;
    
    // Trigger complete animation
    useEffect(() => {
        if (isComplete && !showComplete) {
            const timer = setTimeout(() => {
                setShowComplete(true);
                onComplete?.();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isComplete, showComplete, onComplete]);
    
    // Normalize slots to teamSize
    const normalizedSlots: TeamSlot[] = Array.from({ length: teamSize }, (_, i) => {
        const existingSlot = slots.find(s => s.position === i + 1);
        if (existingSlot) return existingSlot;
        return {
            position: i + 1,
            status: isSearching ? 'searching' : 'empty',
        };
    });

    return (
        <div className={cn("relative", className)}>
            {/* Formation container */}
            <div className="relative h-64 w-full max-w-sm mx-auto">
                {/* Connection lines (visual flair) */}
                <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
                    <defs>
                        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="rgb(var(--primary))" stopOpacity="0.1" />
                        </linearGradient>
                    </defs>
                    {isComplete && normalizedSlots.map((_, i) => {
                        if (i === 0) return null;
                        const from = slotPositions[0];
                        const to = slotPositions[i];
                        const cx = 150 + from.x;
                        const cy = 80 + from.y;
                        const cx2 = 150 + to.x;
                        const cy2 = 80 + to.y;
                        return (
                            <motion.line
                                key={i}
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
                                x1={cx}
                                y1={cy}
                                x2={cx2}
                                y2={cy2}
                                stroke="url(#lineGrad)"
                                strokeWidth="2"
                            />
                        );
                    })}
                </svg>
                
                {/* Slots */}
                <AnimatePresence mode="sync">
                    {normalizedSlots.map((slot, i) => (
                        <SlotAvatar key={slot.position} slot={slot} index={i} />
                    ))}
                </AnimatePresence>
                
                {/* Complete celebration */}
                <AnimatePresence>
                    {showComplete && (
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: [0, 1.5, 1] }}
                                transition={{ duration: 0.5 }}
                                className="w-full h-full absolute"
                            >
                                <Sparkles className="w-8 h-8 text-primary absolute top-0 left-1/4 animate-bounce" />
                                <Sparkles className="w-6 h-6 text-amber-400 absolute top-1/4 right-1/4 animate-bounce" 
                                          style={{ animationDelay: '0.1s' }} />
                                <Sparkles className="w-5 h-5 text-cyan-400 absolute bottom-1/4 left-1/3 animate-bounce"
                                          style={{ animationDelay: '0.2s' }} />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            {/* Progress indicator */}
            <div className="mt-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    {Array.from({ length: teamSize }).map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn(
                                "w-3 h-3 rounded-full transition-colors duration-300",
                                i < filledCount 
                                    ? "bg-primary shadow-lg shadow-primary/50" 
                                    : "bg-white/20"
                            )}
                        />
                    ))}
                </div>
                <p className="text-sm text-white/60">
                    {isComplete ? (
                        <span className="text-primary font-medium">Team Complete!</span>
                    ) : (
                        <>
                            <span className="font-medium text-white">{filledCount}</span>
                            <span> / {teamSize} players</span>
                        </>
                    )}
                </p>
                {isSearching && !isComplete && (
                    <p className="text-xs text-white/40 mt-1">
                        Searching for {searchTimeSeconds}s...
                    </p>
                )}
            </div>
        </div>
    );
}

