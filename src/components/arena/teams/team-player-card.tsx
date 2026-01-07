'use client';

/**
 * Team Player Card Component
 * Displays a player with their banner, frame, and role badges
 * Used in strategy phase, pre-match loading, and match displays
 * Inspired by R6 Siege operator selection cards
 */

import { motion } from 'framer-motion';
import { Crown, Anchor, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/user-avatar';

// Banner styles matching player-banner.tsx
const BANNER_STYLES: Record<string, {
    background: string;
    border: string;
    glow: string;
    textColor: string;
    pattern?: string;
    patternSize?: string;
    animationClass?: string;
}> = {
    default: {
        background: 'from-slate-800 to-slate-900',
        border: 'border-slate-700',
        glow: 'shadow-slate-500/20',
        textColor: 'text-white'
    },
    caution: {
        background: 'from-amber-600 to-amber-950',
        border: 'border-amber-500/50',
        glow: 'shadow-amber-500/30',
        textColor: 'text-amber-100',
        pattern: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 10px, transparent 10px, transparent 20px)',
        patternSize: '60px 60px',
        animationClass: 'animate-banner-stripe-scroll'
    },
    matrices: {
        background: 'from-emerald-900 to-emerald-950',
        border: 'border-emerald-500/50',
        glow: 'shadow-emerald-500/30',
        textColor: 'text-emerald-400',
        pattern: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 1px, transparent 1px)',
        patternSize: '8px 8px',
        animationClass: 'animate-banner-matrix-rain'
    },
    synthwave: {
        background: 'from-fuchsia-600 via-purple-900 to-slate-950',
        border: 'border-fuchsia-500/50',
        glow: 'shadow-fuchsia-500/40',
        textColor: 'text-pink-200',
        pattern: 'linear-gradient(0deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
        patternSize: '100% 4px',
        animationClass: 'animate-banner-scan-lines'
    },
    royal: {
        background: 'from-indigo-600 via-blue-900 to-slate-950',
        border: 'border-indigo-400/50',
        glow: 'shadow-indigo-500/40',
        textColor: 'text-indigo-100',
        animationClass: 'animate-banner-shimmer'
    },
    legendary: {
        background: 'from-yellow-400 via-amber-600 to-yellow-900',
        border: 'border-white/40',
        glow: 'shadow-yellow-400/50',
        textColor: 'text-white',
        pattern: 'radial-gradient(circle, rgba(255, 255, 255, 0.5) 1px, transparent 1px)',
        patternSize: '10px 10px',
        animationClass: 'animate-banner-sparkle'
    },
    plasma: {
        background: 'from-violet-500 via-fuchsia-600 to-cyan-500',
        border: 'border-white/50',
        glow: 'shadow-violet-500/60',
        textColor: 'text-white',
        animationClass: 'animate-banner-plasma'
    }
};

export interface TeamPlayerCardProps {
    name: string;
    odUserId: string;
    level: number;
    banner?: string;
    frame?: string;
    title?: string;
    rank?: string;
    division?: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    isReady?: boolean;
    isActive?: boolean;
    isComplete?: boolean;
    slot?: string;
    score?: number;
    streak?: number;
    className?: string;
    variant?: 'full' | 'compact' | 'minimal';
    showSlot?: boolean;
    onClick?: () => void;
    index?: number;
}

const OPERATION_SYMBOLS: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

export function TeamPlayerCard({
    name,
    odUserId,
    level,
    banner = 'default',
    frame = 'default',
    title = 'FlashMath Player',
    rank = 'Bronze',
    division = 'I',
    isIgl = false,
    isAnchor = false,
    isReady = false,
    isActive = false,
    isComplete = false,
    slot,
    score,
    streak,
    className,
    variant = 'full',
    showSlot = false,
    onClick,
    index = 0,
}: TeamPlayerCardProps) {
    const style = BANNER_STYLES[banner] || BANNER_STYLES.default;
    const opSymbol = slot ? OPERATION_SYMBOLS[slot] || '?' : null;

    // Compact variant for inline displays
    if (variant === 'compact') {
        return (
            <motion.div
                data-testid={`team-player-card-${odUserId}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={onClick}
                className={cn(
                    "relative flex items-center gap-3 p-3 rounded-xl border-2 overflow-hidden",
                    "bg-gradient-to-r",
                    style.background,
                    style.border,
                    style.glow,
                    onClick && "cursor-pointer hover:scale-[1.02] transition-transform",
                    isActive && "ring-2 ring-primary ring-offset-2 ring-offset-slate-900",
                    className
                )}
            >
                {/* Pattern overlay */}
                {style.pattern && (
                    <div
                        className={cn("absolute inset-0 opacity-30", style.animationClass)}
                        style={{
                            backgroundImage: style.pattern,
                            backgroundSize: style.patternSize || 'auto'
                        }}
                    />
                )}

                {/* Avatar */}
                <UserAvatar
                    user={{ name, equipped_items: { frame } }}
                    size="sm"
                    className="shrink-0"
                />

                {/* Name & Title */}
                <div className="flex-1 min-w-0 relative z-10">
                    <div className="flex items-center gap-1">
                        <span className={cn("font-bold truncate", style.textColor)}>{name}</span>
                        {isIgl && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                        {isAnchor && <Anchor className="w-3 h-3 text-purple-400 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-white/50 truncate block">{title}</span>
                </div>

                {/* Slot indicator */}
                {showSlot && opSymbol && (
                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                        {opSymbol}
                    </div>
                )}

                {/* Ready indicator */}
                {isReady && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                )}
            </motion.div>
        );
    }

    // Minimal variant for small displays
    if (variant === 'minimal') {
        return (
            <motion.div
                data-testid={`team-player-card-${odUserId}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={onClick}
                className={cn(
                    "relative flex flex-col items-center gap-1 p-2 rounded-lg border overflow-hidden",
                    "bg-gradient-to-b",
                    style.background,
                    style.border,
                    onClick && "cursor-pointer hover:scale-105 transition-transform",
                    isActive && "ring-2 ring-primary",
                    className
                )}
            >
                <UserAvatar
                    user={{ name, equipped_items: { frame } }}
                    size="sm"
                />
                <span className={cn("text-xs font-bold truncate max-w-full", style.textColor)}>{name}</span>
                <div className="flex gap-1">
                    {isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                    {isAnchor && <Anchor className="w-3 h-3 text-purple-400" />}
                </div>
            </motion.div>
        );
    }

    // Full variant - R6 Siege inspired tall card
    return (
        <motion.div
            data-testid={`team-player-card-${odUserId}`}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, type: 'spring', damping: 20 }}
            onClick={onClick}
            className={cn(
                "relative flex flex-col rounded-2xl border-2 overflow-hidden shadow-2xl",
                "w-full aspect-[3/4] min-h-[200px]",
                style.border,
                style.glow,
                onClick && "cursor-pointer hover:scale-[1.02] transition-transform",
                isActive && "ring-4 ring-primary ring-offset-2 ring-offset-slate-900",
                isComplete && "opacity-60",
                className
            )}
        >
            {/* Background Gradient */}
            <div className={cn("absolute inset-0 bg-gradient-to-b", style.background)} />

            {/* Pattern Overlay */}
            {style.pattern && (
                <div
                    className={cn("absolute inset-0 opacity-30", style.animationClass)}
                    style={{
                        backgroundImage: style.pattern,
                        backgroundSize: style.patternSize || 'auto'
                    }}
                />
            )}

            {/* Shine sweep */}
            <motion.div
                animate={{ x: ['100%', '-100%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
            />

            {/* Role Badges - Top Right */}
            <div className="absolute top-3 right-3 flex gap-1.5 z-20">
                {isIgl && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-8 h-8 rounded-lg bg-amber-500/30 border border-amber-500/50 flex items-center justify-center backdrop-blur-sm"
                    >
                        <Crown className="w-4 h-4 text-amber-400" />
                    </motion.div>
                )}
                {isAnchor && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1 }}
                        className="w-8 h-8 rounded-lg bg-purple-500/30 border border-purple-500/50 flex items-center justify-center backdrop-blur-sm"
                    >
                        <Anchor className="w-4 h-4 text-purple-400" />
                    </motion.div>
                )}
            </div>

            {/* Ready Check - Top Left */}
            {isReady && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 left-3 z-20"
                >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/30 border border-emerald-500/50 flex items-center justify-center backdrop-blur-sm">
                        <Check className="w-4 h-4 text-emerald-400" />
                    </div>
                </motion.div>
            )}

            {/* Main Content - Centered Avatar */}
            <div className="flex-1 flex items-center justify-center relative z-10 pt-4">
                <UserAvatar
                    user={{ name, equipped_items: { frame } }}
                    size="xl"
                    className="drop-shadow-2xl"
                />
            </div>

            {/* Level Badge */}
            <div className="absolute top-1/2 left-3 -translate-y-1/2 z-10">
                <div className="w-10 h-14 rounded-lg bg-black/50 border border-white/10 flex flex-col items-center justify-center backdrop-blur-sm">
                    <span className="text-[8px] font-black text-white/50 uppercase">LVL</span>
                    <span className="text-lg font-black text-white leading-none">{level}</span>
                </div>
            </div>

            {/* Score/Streak - During active match */}
            {typeof score === 'number' && (
                <div className="absolute top-1/2 right-3 -translate-y-1/2 z-10">
                    <div className="w-14 h-14 rounded-lg bg-black/50 border border-white/10 flex flex-col items-center justify-center backdrop-blur-sm">
                        <span className="text-xl font-black text-primary leading-none">{score}</span>
                        {typeof streak === 'number' && streak > 0 && (
                            <div className="flex items-center gap-0.5 text-orange-400 mt-0.5">
                                <Zap className="w-3 h-3" />
                                <span className="text-xs font-bold">{streak}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Info Bar */}
            <div className="relative z-10 bg-black/60 backdrop-blur-sm p-3 border-t border-white/10">
                {/* Slot indicator at top of bar */}
                {showSlot && opSymbol && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 border-2 border-primary flex items-center justify-center text-xl font-black text-primary shadow-lg shadow-primary/30">
                            {opSymbol}
                        </div>
                    </div>
                )}

                {/* Player Name */}
                <h3 className={cn(
                    "text-lg font-black uppercase tracking-wide text-center truncate",
                    showSlot ? "mt-3" : "",
                    style.textColor
                )}>
                    {name}
                </h3>

                {/* Title */}
                <p className="text-[10px] text-white/50 uppercase tracking-widest text-center truncate">
                    {title}
                </p>

                {/* Rank */}
                <div className="flex items-center justify-center gap-2 mt-2">
                    <div className={cn(
                        "w-2 h-2 rounded-sm rotate-45",
                        rank === 'Gold' ? 'bg-yellow-400' : rank === 'Silver' ? 'bg-slate-300' : 'bg-amber-600'
                    )} />
                    <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
                        {rank} {division}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

// Team display grid for 5 players (R6 Siege style)
export function TeamPlayerGrid({
    players,
    teamName,
    teamTag,
    isMyTeam = false,
    showSlots = false,
    className,
}: {
    players: TeamPlayerCardProps[];
    teamName?: string;
    teamTag?: string;
    isMyTeam?: boolean;
    showSlots?: boolean;
    className?: string;
}) {
    return (
        <div className={cn("space-y-4", className)}>
            {/* Team Header */}
            {teamName && (
                <div className={cn(
                    "text-center py-2 px-4 rounded-lg",
                    isMyTeam ? "bg-primary/20 text-primary" : "bg-rose-500/20 text-rose-400"
                )}>
                    <span className="text-xs font-bold uppercase tracking-widest">
                        {teamTag && `[${teamTag}] `}{teamName}
                    </span>
                </div>
            )}

            {/* Player Grid */}
            <div className="grid grid-cols-5 gap-3">
                {players.map((player, index) => (
                    <TeamPlayerCard
                        key={player.odUserId}
                        {...player}
                        showSlot={showSlots}
                        index={index}
                    />
                ))}
            </div>
        </div>
    );
}
