'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BannerStyle {
    id: string;
    name: string;
    className: string;
    background: string;
    border: string;
    glow: string;
    textColor: string;
    pattern?: string;
    patternSize?: string;
    animationClass?: string;
}

const BANNER_STYLES: Record<string, BannerStyle> = {
    default: {
        id: 'default',
        name: 'Default',
        className: 'bg-slate-900',
        background: 'from-slate-800 to-slate-900',
        border: 'border-slate-700',
        glow: 'shadow-slate-500/20',
        textColor: 'text-white'
    },
    caution: {
        id: 'caution',
        name: 'Caution High Math',
        className: 'bg-amber-950',
        background: 'from-amber-600 to-amber-950',
        border: 'border-amber-500/50',
        glow: 'shadow-amber-500/30',
        textColor: 'text-amber-100',
        pattern: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.15) 0, rgba(0,0,0,0.15) 10px, transparent 10px, transparent 20px)',
        patternSize: '60px 60px',
        animationClass: 'animate-banner-stripe-scroll'
    },
    matrices: {
        id: 'matrices',
        name: 'System Override',
        className: 'bg-emerald-950',
        background: 'from-emerald-900 to-emerald-950',
        border: 'border-emerald-500/50',
        glow: 'shadow-emerald-500/30',
        textColor: 'text-emerald-400',
        pattern: 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 1px, transparent 1px)',
        patternSize: '8px 8px',
        animationClass: 'animate-banner-matrix-rain'
    },
    synthwave: {
        id: 'synthwave',
        name: 'Retro Pulse',
        className: 'bg-fuchsia-950',
        background: 'from-fuchsia-600 via-purple-900 to-slate-950',
        border: 'border-fuchsia-500/50',
        glow: 'shadow-fuchsia-500/40',
        textColor: 'text-pink-200',
        pattern: 'linear-gradient(0deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
        patternSize: '100% 4px',
        animationClass: 'animate-banner-scan-lines'
    },
    royal: {
        id: 'royal',
        name: 'The King',
        className: 'bg-indigo-950',
        background: 'from-indigo-600 via-blue-900 to-slate-950',
        border: 'border-indigo-400/50',
        glow: 'shadow-indigo-500/40',
        textColor: 'text-indigo-100',
        animationClass: 'animate-banner-shimmer'
    },
    legendary: {
        id: 'legendary',
        name: 'Grand Champion',
        className: 'bg-yellow-950',
        background: 'from-yellow-400 via-amber-600 to-yellow-900',
        border: 'border-white/40',
        glow: 'shadow-yellow-400/50',
        textColor: 'text-white',
        pattern: 'radial-gradient(circle, rgba(255, 255, 255, 0.5) 1px, transparent 1px)',
        patternSize: '10px 10px',
        animationClass: 'animate-banner-sparkle'
    },
    plasma: {
        id: 'plasma',
        name: 'Plasma Core',
        className: 'bg-violet-950',
        background: 'from-violet-500 via-fuchsia-600 to-cyan-500',
        border: 'border-white/50',
        glow: 'shadow-violet-500/60',
        textColor: 'text-white',
        animationClass: 'animate-banner-plasma'
    }
};

interface PlayerBannerProps {
    name: string;
    level: number;
    rank: string;
    division: string;
    styleId?: string;
    title?: string;
    className?: string;
}

export function PlayerBanner({ name, level, rank, division, styleId = 'default', title = 'FlashMath Competitor', className }: PlayerBannerProps) {
    const style = BANNER_STYLES[styleId] || BANNER_STYLES.default;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                "relative h-24 w-full max-w-md rounded-xl border-2 overflow-hidden flex items-center shadow-2xl",
                style.border,
                style.glow,
                className
            )}
        >
            {/* Background Base */}
            <div className={cn("absolute inset-0 bg-gradient-to-r", style.background)} />

            {/* Pattern Overlay with Animation */}
            {style.pattern && (
                <div
                    className={cn("absolute inset-0 opacity-40", style.animationClass)}
                    style={{
                        backgroundImage: style.pattern,
                        backgroundSize: style.patternSize || 'auto'
                    }}
                />
            )}

            {/* Animation overlay for styles without pattern */}
            {!style.pattern && style.animationClass && (
                <div
                    className={cn(
                        "absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent",
                        style.animationClass
                    )}
                />
            )}

            {/* Shine Sweep Effect */}
            <motion.div
                animate={{ x: ['100%', '-100%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
            />

            {/* Content Container */}
            <div className="relative flex items-center w-full px-6 gap-6">
                {/* Level Tag */}
                <div className="flex flex-col items-center justify-center shrink-0">
                    <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-black opacity-50 text-white uppercase tracking-tighter">LVL</span>
                        <span className="text-xl font-black text-white leading-none">{level}</span>
                    </div>
                </div>

                {/* Player Identity */}
                <div className="flex-1 flex flex-col gap-0.5">
                    <span className={cn("text-2xl font-black italic tracking-tight drop-shadow-md", style.textColor)}>
                        {name}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                        {title}
                    </span>
                </div>

                {/* Rank Badge */}
                <div className="flex flex-col items-end shrink-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                        <div className={cn(
                            "w-3 h-3 rounded-sm rotate-45",
                            rank === 'Gold' ? 'bg-yellow-400' : rank === 'Silver' ? 'bg-slate-300' : 'bg-amber-600'
                        )} />
                        <span className="text-xs font-black text-white uppercase tracking-widest">
                            {rank} {division}
                        </span>
                    </div>
                </div>
            </div>

            {/* Inner Border Ambient Glow */}
            <div className="absolute inset-0 border border-white/5 rounded-xl pointer-events-none" />
        </motion.div>
    );
}
