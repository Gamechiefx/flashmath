'use client';

/**
 * VS Screen Background
 * Dramatic background for pre-match and strategy screens
 * Inspired by fighting games, MOBAs, and competitive shooters
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VSScreenBackgroundProps {
    variant?: 'versus' | 'strategy' | 'loading';
    teamColor?: string;
    opponentColor?: string;
    className?: string;
    children?: React.ReactNode;
}

export function VSScreenBackground({
    variant = 'versus',
    teamColor = 'cyan',
    opponentColor = 'rose',
    className,
    children,
}: VSScreenBackgroundProps) {
    return (
        <div data-testid={`vs-screen-background-${variant}`} className={cn("relative min-h-screen overflow-hidden", className)}>
            {/* Base gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />

            {/* Dramatic diagonal split for VS screens */}
            {variant === 'versus' && (
                <>
                    {/* Team 1 (Your team) - Left/Top diagonal */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(135deg, 
                                rgba(6, 182, 212, 0.3) 0%, 
                                rgba(6, 182, 212, 0.1) 30%, 
                                transparent 50%)`,
                            clipPath: 'polygon(0 0, 100% 0, 40% 100%, 0 100%)',
                        }}
                    />
                    
                    {/* Team 2 (Opponent) - Right/Bottom diagonal */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(-45deg, 
                                rgba(244, 63, 94, 0.3) 0%, 
                                rgba(244, 63, 94, 0.1) 30%, 
                                transparent 50%)`,
                            clipPath: 'polygon(60% 0, 100% 0, 100% 100%, 0 100%)',
                        }}
                    />

                    {/* Central clash line */}
                    <motion.div
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className="absolute left-1/2 top-0 bottom-0 w-1 -translate-x-1/2 origin-center"
                        style={{
                            background: 'linear-gradient(to bottom, transparent, white, transparent)',
                            boxShadow: '0 0 30px rgba(255,255,255,0.5), 0 0 60px rgba(255,255,255,0.3)',
                        }}
                    />
                </>
            )}

            {/* Strategy phase - single team focus */}
            {variant === 'strategy' && (
                <>
                    {/* Radial glow from center - more visible */}
                    <motion.div 
                        animate={{
                            opacity: [0.3, 0.5, 0.3],
                            scale: [1, 1.05, 1],
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(ellipse at center, 
                                rgba(99, 102, 241, 0.4) 0%, 
                                rgba(99, 102, 241, 0.15) 40%, 
                                transparent 70%)`,
                        }}
                    />
                    
                    {/* Corner accents - brighter */}
                    <motion.div 
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute top-0 left-0 w-1/2 h-1/2"
                        style={{
                            background: 'radial-gradient(ellipse at top left, rgba(6, 182, 212, 0.4) 0%, transparent 60%)',
                        }}
                    />
                    <motion.div 
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                        className="absolute bottom-0 right-0 w-1/2 h-1/2"
                        style={{
                            background: 'radial-gradient(ellipse at bottom right, rgba(6, 182, 212, 0.4) 0%, transparent 60%)',
                        }}
                    />
                </>
            )}

            {/* Loading variant - pulsing effect */}
            {variant === 'loading' && (
                <motion.div
                    animate={{
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="absolute inset-0"
                    style={{
                        background: `radial-gradient(ellipse at center, 
                            rgba(139, 92, 246, 0.3) 0%, 
                            transparent 60%)`,
                    }}
                />
            )}

            {/* Animated grid pattern - more visible */}
            <motion.div 
                animate={{ opacity: [0.05, 0.1, 0.05] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(6, 182, 212, 0.2) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(6, 182, 212, 0.2) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px',
                }}
            />

            {/* Perspective grid floor - more dramatic */}
            <motion.div 
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute bottom-0 left-0 right-0 h-1/2"
                style={{
                    background: `
                        linear-gradient(to top, rgba(6, 182, 212, 0.4), transparent 80%),
                        repeating-linear-gradient(
                            90deg,
                            transparent,
                            transparent 48px,
                            rgba(6, 182, 212, 0.6) 48px,
                            rgba(6, 182, 212, 0.6) 52px,
                            transparent 52px
                        )
                    `,
                    transform: 'perspective(400px) rotateX(65deg)',
                    transformOrigin: 'bottom',
                }}
            />

            {/* Floating particles - larger and more visible */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(30)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                            width: `${2 + Math.random() * 4}px`,
                            height: `${2 + Math.random() * 4}px`,
                            background: i % 3 === 0 ? 'rgba(6, 182, 212, 0.8)' : 'rgba(255, 255, 255, 0.6)',
                            boxShadow: i % 3 === 0 ? '0 0 10px rgba(6, 182, 212, 0.5)' : '0 0 6px rgba(255, 255, 255, 0.3)',
                        }}
                        initial={{
                            x: `${Math.random() * 100}%`,
                            y: '110%',
                            opacity: 0,
                        }}
                        animate={{
                            y: '-10%',
                            opacity: [0, 0.8, 0],
                        }}
                        transition={{
                            duration: 6 + Math.random() * 6,
                            repeat: Infinity,
                            delay: Math.random() * 3,
                            ease: 'linear',
                        }}
                    />
                ))}
            </div>

            {/* Horizontal scan line effect */}
            <motion.div
                animate={{ y: ['0%', '100%'] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-px pointer-events-none"
                style={{
                    background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.5), transparent)',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)',
                }}
            />

            {/* Scanlines overlay */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-[0.04]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
                }}
            />

            {/* Vignette */}
            <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
                }}
            />

            {/* Corner decorations - larger and animated */}
            <motion.svg 
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute top-0 left-0 w-40 h-40 text-cyan-500" 
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg 
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                className="absolute top-0 right-0 w-40 h-40 text-rose-500 rotate-90" 
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg 
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                className="absolute bottom-0 left-0 w-40 h-40 text-cyan-500 -rotate-90" 
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg 
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
                className="absolute bottom-0 right-0 w-40 h-40 text-rose-500 rotate-180" 
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            
            {/* Edge glow lines */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-cyan-500/50 via-transparent to-rose-500/50" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-cyan-500/50 via-transparent to-rose-500/50" />
            <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-cyan-500/50 via-transparent to-cyan-500/50" />
            <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-rose-500/50 via-transparent to-rose-500/50" />

            {/* Content */}
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}

/**
 * Animated VS Text component
 */
export function AnimatedVSText({ className }: { className?: string }) {
    return (
        <motion.div
            className={cn("relative", className)}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
                type: 'spring', 
                damping: 15, 
                stiffness: 200,
                delay: 0.3 
            }}
        >
            {/* Glow layers */}
            <motion.div
                animate={{
                    opacity: [0.5, 1, 0.5],
                    scale: [1, 1.1, 1],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 blur-xl"
                style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                }}
            />
            
            {/* Main VS text */}
            <span 
                className="relative text-6xl md:text-8xl font-black tracking-tighter"
                style={{
                    background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #fff 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 0 40px rgba(255,255,255,0.5)',
                    filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.5))',
                }}
            >
                VS
            </span>
            
            {/* Decorative lines */}
            <motion.div 
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute left-full top-1/2 -translate-y-1/2 ml-4 w-24 md:w-32 h-0.5 origin-left"
                style={{
                    background: 'linear-gradient(to right, rgba(255,255,255,0.5), transparent)',
                }}
            />
            <motion.div 
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute right-full top-1/2 -translate-y-1/2 mr-4 w-24 md:w-32 h-0.5 origin-right"
                style={{
                    background: 'linear-gradient(to left, rgba(255,255,255,0.5), transparent)',
                }}
            />
        </motion.div>
    );
}

/**
 * Team Banner Header
 */
export function TeamBannerHeader({
    teamName,
    teamTag,
    isMyTeam = false,
    isAI = false,
    className,
}: {
    teamName: string;
    teamTag?: string;
    isMyTeam?: boolean;
    isAI?: boolean;
    className?: string;
}) {
    const baseColor = isMyTeam ? 'cyan' : 'rose';
    
    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={cn("relative text-center", className)}
        >
            {/* Background glow */}
            <div 
                className="absolute inset-0 -inset-x-8 rounded-2xl"
                style={{
                    background: isMyTeam 
                        ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, transparent 100%)'
                        : 'linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, transparent 100%)',
                }}
            />
            
            {/* Team tag and name */}
            <div className="relative py-3 px-6">
                <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-full",
                        "border backdrop-blur-sm",
                        isMyTeam 
                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" 
                            : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    )}
                >
                    {isAI && <span className="text-lg">🤖</span>}
                    <span className="text-sm md:text-base font-bold uppercase tracking-widest">
                        {teamTag && `[${teamTag}] `}{teamName}
                    </span>
                </motion.div>
            </div>
            
            {/* Decorative underline */}
            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className={cn(
                    "h-0.5 mx-auto max-w-xs",
                    isMyTeam ? "bg-gradient-to-r from-transparent via-cyan-500 to-transparent"
                             : "bg-gradient-to-r from-transparent via-rose-500 to-transparent"
                )}
            />
        </motion.div>
    );
}

