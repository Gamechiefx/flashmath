'use client';

/**
 * VS Screen Background
 * Dramatic background for pre-match and strategy screens
 * Inspired by fighting games, MOBAs, and competitive shooters
 * Now with theme-aware colors and floating math symbols
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VSScreenBackgroundProps {
    variant?: 'versus' | 'strategy' | 'loading';
    teamColor?: string;
    opponentColor?: string;
    className?: string;
    children?: React.ReactNode;
    showFloatingNumbers?: boolean;
}

/**
 * Floating Math Symbols Component
 * Renders animated floating numbers and operators like the Arena mode selection
 */
function FloatingMathSymbols() {
    const [mounted, setMounted] = useState(false);
    const symbols = useMemo(() => ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '−', '×', '÷', '=', '%'], []);

    // Generate deterministic positions and animation properties to avoid hydration mismatch
    const particles = useMemo(() => {
        return [...Array(25)].map((_, i) => {
            // Deterministic pseudo-random values based on index
            const leftRand = ((i * 37 + 13) % 100);
            const topRand = ((i * 53 + 7) % 100);
            const sizeRand = ((i * 19 + 3) % 24);
            const delayRand = ((i * 23 + 11) % 20);
            const durationRand = ((i * 29 + 5) % 10);
            const opacityRand = ((i * 31 + 2) % 15) / 100;

            return {
                id: i,
                symbol: symbols[i % symbols.length],
                left: `${leftRand}%`,
                top: `${topRand}%`,
                fontSize: `${sizeRand + 16}px`,
                delay: delayRand,
                duration: durationRand + 15,
                opacity: 0.1 + opacityRand,
            };
        });
    }, [symbols]);

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            setMounted(true);
        }, 0);
    }, []);

    if (!mounted) return null;

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    className="absolute font-black"
                    style={{
                        left: particle.left,
                        top: particle.top,
                        fontSize: particle.fontSize,
                        color: 'var(--primary)',
                        opacity: 0,
                        textShadow: '0 0 20px var(--accent-glow)',
                    }}
                    animate={{
                        y: [0, -30, 0],
                        opacity: [0, particle.opacity, 0],
                        rotate: [0, 10, -10, 0],
                    }}
                    transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    {particle.symbol}
                </motion.div>
            ))}
        </div>
    );
}

export function VSScreenBackground({
    variant = 'versus',
    teamColor: _teamColor = 'cyan',
    opponentColor: _opponentColor = 'rose',
    className,
    children,
    showFloatingNumbers = true,
}: VSScreenBackgroundProps) {
    return (
        <div data-testid={`vs-screen-background-${variant}`} className={cn("relative h-screen overflow-hidden no-scrollbar", className)}>
            {/* Base gradient - theme aware */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'linear-gradient(to bottom, var(--background) 0%, hsl(var(--card)) 50%, var(--background) 100%)',
                }}
            />

            {/* Floating Math Symbols - theme aware */}
            {showFloatingNumbers && <FloatingMathSymbols />}

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

            {/* Strategy phase - single team focus - theme aware */}
            {variant === 'strategy' && (
                <>
                    {/* Radial glow from center - uses theme accent */}
                    <motion.div
                        animate={{
                            opacity: [0.3, 0.5, 0.3],
                            scale: [1, 1.05, 1],
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(ellipse at center,
                                var(--accent-glow) 0%,
                                transparent 70%)`,
                        }}
                    />

                    {/* Corner accents - uses theme primary */}
                    <motion.div
                        animate={{ opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute top-0 left-0 w-1/2 h-1/2"
                        style={{
                            background: 'radial-gradient(ellipse at top left, var(--accent-glow) 0%, transparent 60%)',
                        }}
                    />
                    <motion.div
                        animate={{ opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                        className="absolute bottom-0 right-0 w-1/2 h-1/2"
                        style={{
                            background: 'radial-gradient(ellipse at bottom right, var(--accent-glow) 0%, transparent 60%)',
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

            {/* Animated grid pattern - theme aware */}
            <motion.div
                animate={{ opacity: [0.03, 0.08, 0.03] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0"
                style={{
                    backgroundImage: `
                        linear-gradient(var(--primary) 1px, transparent 1px),
                        linear-gradient(90deg, var(--primary) 1px, transparent 1px)
                    `,
                    backgroundSize: '60px 60px',
                    opacity: 0.1,
                }}
            />

            {/* Perspective grid floor - theme aware */}
            <motion.div
                animate={{ opacity: [0.2, 0.35, 0.2] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute bottom-0 left-0 right-0 h-1/2"
                style={{
                    background: `linear-gradient(to top, var(--accent-glow), transparent 80%)`,
                    transform: 'perspective(400px) rotateX(65deg)',
                    transformOrigin: 'bottom',
                }}
            />

            {/* Floating particles - theme aware */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(20)].map((_, i) => {
                    // Use deterministic pseudo-random values based on index to avoid hydration mismatch
                    const sizeRand = ((i * 7 + 3) % 10) / 10; // 0-1 based on i
                    const posRand = ((i * 13 + 5) % 100); // 0-99 based on i
                    const durationRand = ((i * 11 + 2) % 8); // 0-7 based on i
                    const delayRand = ((i * 17 + 1) % 5); // 0-4 based on i

                    return (
                        <motion.div
                            key={i}
                            className="absolute rounded-full"
                            style={{
                                width: `${2 + sizeRand * 3}px`,
                                height: `${2 + sizeRand * 3}px`,
                                background: i % 3 === 0 ? 'var(--primary)' : 'var(--foreground)',
                                boxShadow: i % 3 === 0 ? '0 0 10px var(--accent-glow)' : '0 0 6px var(--foreground)',
                                opacity: 0.4,
                            }}
                            initial={{
                                x: `${posRand}%`,
                                y: '110%',
                                opacity: 0,
                            }}
                            animate={{
                                y: '-10%',
                                opacity: [0, 0.6, 0],
                            }}
                            transition={{
                                duration: 8 + durationRand,
                                repeat: Infinity,
                                delay: delayRand,
                                ease: 'linear',
                            }}
                        />
                    );
                })}
            </div>

            {/* Horizontal scan line effect - theme aware */}
            <motion.div
                animate={{ y: ['0%', '100%'] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-px pointer-events-none"
                style={{
                    background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                    boxShadow: '0 0 20px var(--accent-glow)',
                    opacity: 0.5,
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

            {/* Corner decorations - theme aware (z-0 to stay behind header) */}
            <motion.svg
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute top-0 left-0 w-32 h-32 z-0"
                style={{ color: 'var(--primary)' }}
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                className="absolute top-0 right-0 w-32 h-32 rotate-90 z-0"
                style={{ color: 'var(--accent)' }}
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                className="absolute bottom-0 left-0 w-32 h-32 -rotate-90 z-0"
                style={{ color: 'var(--primary)' }}
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>
            <motion.svg
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, delay: 1.5 }}
                className="absolute bottom-0 right-0 w-32 h-32 rotate-180 z-0"
                style={{ color: 'var(--accent)' }}
                viewBox="0 0 100 100"
            >
                <path d="M0 0 L45 0 L45 4 L4 4 L4 45 L0 45 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 0 L25 0 L25 2 L2 2 L2 25 L0 25 Z" fill="currentColor" opacity="0.3" />
            </motion.svg>

            {/* Edge glow lines - theme aware */}
            <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(to right, var(--primary), transparent 50%, var(--accent))', opacity: 0.5 }}
            />
            <div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(to right, var(--primary), transparent 50%, var(--accent))', opacity: 0.5 }}
            />
            <div
                className="absolute top-0 bottom-0 left-0 w-px"
                style={{ background: 'linear-gradient(to bottom, var(--primary), transparent 50%, var(--primary))', opacity: 0.5 }}
            />
            <div
                className="absolute top-0 bottom-0 right-0 w-px"
                style={{ background: 'linear-gradient(to bottom, var(--accent), transparent 50%, var(--accent))', opacity: 0.5 }}
            />

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
    align = 'center',
    className,
}: {
    teamName: string;
    teamTag?: string;
    isMyTeam?: boolean;
    isAI?: boolean;
    align?: 'left' | 'center' | 'right';
    className?: string;
}) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const baseColor = isMyTeam ? 'cyan' : 'rose';
    const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
    
    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={cn("relative", alignClass, className)}
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

