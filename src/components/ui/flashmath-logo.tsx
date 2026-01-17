"use client";

/**
 * FlashMath Logo Component
 * 
 * Styled to match the Flash Arena title aesthetic:
 * - "FLASH" in cyan with glow
 * - "MATH" in amber/gold with glow
 * - Italic, ultra-heavy font weight
 * - Flickering neon animation
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FlashMathLogoProps {
    /** Size variant */
    size?: "sm" | "md" | "lg" | "xl" | "hero";
    /** Enable animated gradient shimmer */
    animated?: boolean;
    /** Enable flickering neon effect */
    flicker?: boolean;
    /** Additional className */
    className?: string;
    /** Show as a link wrapper (just styling, wrap with Link yourself) */
    asLink?: boolean;
}

const sizeClasses = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
    hero: "text-6xl md:text-8xl",
};

const glowSizes = {
    sm: "drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]",
    md: "drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]",
    lg: "drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]",
    xl: "drop-shadow-[0_0_25px_rgba(6,182,212,0.5)]",
    hero: "drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]",
};

// Flickering animation keyframes - simulates neon sign effect
const flickerVariants = {
    flash: {
        opacity: [1, 0.8, 1, 0.9, 1, 0.85, 1, 1, 0.9, 1, 0.95, 1],
        textShadow: [
            "0 0 30px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.4)",
            "0 0 20px rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.2)",
            "0 0 35px rgba(6,182,212,0.9), 0 0 70px rgba(6,182,212,0.5)",
            "0 0 25px rgba(6,182,212,0.6), 0 0 50px rgba(6,182,212,0.3)",
            "0 0 30px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.4)",
            "0 0 22px rgba(6,182,212,0.55), 0 0 45px rgba(6,182,212,0.25)",
            "0 0 32px rgba(6,182,212,0.85), 0 0 65px rgba(6,182,212,0.45)",
            "0 0 30px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.4)",
            "0 0 24px rgba(6,182,212,0.6), 0 0 48px rgba(6,182,212,0.3)",
            "0 0 30px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.4)",
            "0 0 28px rgba(6,182,212,0.75), 0 0 55px rgba(6,182,212,0.35)",
            "0 0 30px rgba(6,182,212,0.8), 0 0 60px rgba(6,182,212,0.4)",
        ],
    },
    math: {
        opacity: [1, 0.9, 1, 0.85, 1, 0.9, 1, 0.95, 1, 0.88, 1, 1],
        textShadow: [
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
            "0 0 24px rgba(251,191,36,0.6), 0 0 48px rgba(251,191,36,0.3)",
            "0 0 32px rgba(251,191,36,0.85), 0 0 65px rgba(251,191,36,0.45)",
            "0 0 22px rgba(251,191,36,0.55), 0 0 44px rgba(251,191,36,0.25)",
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
            "0 0 26px rgba(251,191,36,0.65), 0 0 52px rgba(251,191,36,0.32)",
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
            "0 0 28px rgba(251,191,36,0.75), 0 0 56px rgba(251,191,36,0.38)",
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
            "0 0 23px rgba(251,191,36,0.58), 0 0 46px rgba(251,191,36,0.28)",
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
            "0 0 30px rgba(251,191,36,0.8), 0 0 60px rgba(251,191,36,0.4)",
        ],
    },
};

export function FlashMathLogo({ 
    size = "md", 
    animated = false,
    flicker = true,
    className,
    asLink = false
}: FlashMathLogoProps) {
    const baseClasses = cn(
        "font-black italic tracking-tighter",
        sizeClasses[size],
        asLink && "hover:opacity-90 transition-opacity",
        className
    );

    // Static version (no animation, no flicker)
    if (!animated && !flicker) {
        return (
            <span className={baseClasses}>
                <span className={cn(
                    "text-cyan-400",
                    glowSizes[size]
                )}>
                    FLASH
                </span>
                <span className={cn(
                    "text-amber-400",
                    "drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]"
                )}>
                    MATH
                </span>
            </span>
        );
    }

    // Flickering neon effect (default)
    if (flicker && !animated) {
        return (
            <span className={baseClasses}>
                <motion.span
                    animate={flickerVariants.flash}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        times: [0, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
                    }}
                    className="inline-block text-cyan-400"
                >
                    FLASH
                </motion.span>
                <motion.span
                    animate={flickerVariants.math}
                    transition={{
                        duration: 4.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.3,
                        times: [0, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92, 1]
                    }}
                    className="inline-block text-amber-400"
                >
                    MATH
                </motion.span>
            </span>
        );
    }

    // Animated version with gradient shimmer + flicker
    return (
        <span className={baseClasses}>
            <motion.span
                animate={{
                    backgroundPosition: ["200% center", "-200% center"],
                    opacity: [1, 0.85, 1, 0.9, 1, 0.88, 1],
                    filter: [
                        "drop-shadow(0 0 30px rgba(6,182,212,0.8))",
                        "drop-shadow(0 0 20px rgba(6,182,212,0.5))",
                        "drop-shadow(0 0 35px rgba(6,182,212,0.9))",
                        "drop-shadow(0 0 25px rgba(6,182,212,0.6))",
                        "drop-shadow(0 0 30px rgba(6,182,212,0.8))",
                        "drop-shadow(0 0 22px rgba(6,182,212,0.55))",
                        "drop-shadow(0 0 30px rgba(6,182,212,0.8))",
                    ],
                }}
                transition={{
                    backgroundPosition: {
                        duration: 6,
                        repeat: Infinity,
                        ease: "linear"
                    },
                    opacity: {
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                    },
                    filter: {
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }
                }}
                style={{
                    backgroundImage: "linear-gradient(90deg, #22d3ee 0%, #ffffff 50%, #22d3ee 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                }}
                className="inline-block"
            >
                FLASH
            </motion.span>
            <motion.span
                animate={{
                    backgroundPosition: ["200% center", "-200% center"],
                    opacity: [1, 0.9, 1, 0.85, 1, 0.92, 1],
                    filter: [
                        "drop-shadow(0 0 30px rgba(251,191,36,0.8))",
                        "drop-shadow(0 0 22px rgba(251,191,36,0.55))",
                        "drop-shadow(0 0 32px rgba(251,191,36,0.85))",
                        "drop-shadow(0 0 24px rgba(251,191,36,0.6))",
                        "drop-shadow(0 0 30px rgba(251,191,36,0.8))",
                        "drop-shadow(0 0 26px rgba(251,191,36,0.65))",
                        "drop-shadow(0 0 30px rgba(251,191,36,0.8))",
                    ],
                }}
                transition={{
                    backgroundPosition: {
                        duration: 6,
                        repeat: Infinity,
                        ease: "linear",
                        delay: 0.5
                    },
                    opacity: {
                        duration: 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.2
                    },
                    filter: {
                        duration: 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.2
                    }
                }}
                style={{
                    backgroundImage: "linear-gradient(90deg, #fbbf24 0%, #fef3c7 50%, #fbbf24 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                }}
                className="inline-block"
            >
                MATH
            </motion.span>
        </span>
    );
}

/**
 * FlashMath Logo with Icon
 * Includes the lightning bolt icon alongside the text
 */
export function FlashMathLogoWithIcon({ 
    size = "md",
    animated = false,
    flicker = true,
    className 
}: FlashMathLogoProps) {
    const iconSizes = {
        sm: "w-8 h-8",
        md: "w-10 h-10",
        lg: "w-12 h-12",
        xl: "w-14 h-14",
        hero: "w-16 h-16",
    };

    const iconTextSizes = {
        sm: "text-base",
        md: "text-lg",
        lg: "text-xl",
        xl: "text-2xl",
        hero: "text-3xl",
    };

    return (
        <div className={cn("flex items-center gap-3", className)}>
            <motion.div 
                className={cn(
                    iconSizes[size],
                    "rounded-xl bg-gradient-to-br from-cyan-500/20 to-amber-500/20",
                    "flex items-center justify-center",
                    "border border-cyan-500/30",
                )}
                animate={flicker ? {
                    boxShadow: [
                        "0 0 20px rgba(6,182,212,0.4)",
                        "0 0 15px rgba(6,182,212,0.25)",
                        "0 0 25px rgba(6,182,212,0.5)",
                        "0 0 18px rgba(6,182,212,0.3)",
                        "0 0 20px rgba(6,182,212,0.4)",
                    ]
                } : undefined}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            >
                <motion.span 
                    className={cn(iconTextSizes[size], "text-cyan-400")}
                    animate={flicker ? {
                        opacity: [1, 0.7, 1, 0.85, 1],
                        textShadow: [
                            "0 0 10px rgba(6,182,212,0.8)",
                            "0 0 6px rgba(6,182,212,0.4)",
                            "0 0 12px rgba(6,182,212,0.9)",
                            "0 0 8px rgba(6,182,212,0.5)",
                            "0 0 10px rgba(6,182,212,0.8)",
                        ]
                    } : undefined}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                >
                    ⚡
                </motion.span>
            </motion.div>
            <FlashMathLogo size={size} animated={animated} flicker={flicker} />
        </div>
    );
}
