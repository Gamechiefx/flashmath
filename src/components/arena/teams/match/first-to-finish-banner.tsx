'use client';

/**
 * FirstToFinishBanner
 * 
 * A prominent animated banner that displays when a team finishes
 * their relay first, earning the +50 bonus. Shows for 3 seconds
 * before transitioning to the break screen.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Trophy, Zap, Star } from 'lucide-react';

interface FirstToFinishBannerProps {
    visible: boolean;
    teamName: string;
    bonus: number;
    isMyTeam: boolean;
    round: number;
}

export function FirstToFinishBanner({
    visible,
    teamName,
    bonus,
    isMyTeam,
    round,
}: FirstToFinishBannerProps) {
    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
                >
                    {/* Background overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                            "absolute inset-0",
                            isMyTeam
                                ? "bg-gradient-to-b from-emerald-900/60 via-emerald-900/40 to-transparent"
                                : "bg-gradient-to-b from-rose-900/60 via-rose-900/40 to-transparent"
                        )}
                    />

                    {/* Animated particles */}
                    <div className="absolute inset-0 overflow-hidden">
                        {/* eslint-disable react-hooks/purity -- Intentional randomness for particle effects */}
                        {[...Array(20)].map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{
                                    opacity: 0,
                                    y: '100vh',
                                    x: `${Math.random() * 100}vw`,
                                }}
                                animate={{
                                    opacity: [0, 1, 1, 0],
                                    y: '-20vh',
                                }}
                                transition={{
                                    duration: 2 + Math.random() * 1,
                                    delay: Math.random() * 0.5,
                                    ease: 'easeOut',
                                }}
                                className={cn(
                                    "absolute w-2 h-2 rounded-full",
                                    isMyTeam ? "bg-emerald-400" : "bg-rose-400"
                                )}
                            />
                        ))}
                    </div>

                    {/* Main banner content */}
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0, y: -50 }}
                        transition={{ 
                            type: 'spring', 
                            damping: 15, 
                            stiffness: 200,
                            delay: 0.1 
                        }}
                        className="relative flex flex-col items-center"
                    >
                        {/* Trophy icon with glow */}
                        <motion.div
                            initial={{ scale: 0, rotate: -30 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ 
                                type: 'spring', 
                                damping: 10, 
                                stiffness: 150,
                                delay: 0.2 
                            }}
                            className={cn(
                                "relative w-28 h-28 rounded-full flex items-center justify-center mb-4",
                                "bg-gradient-to-br shadow-2xl",
                                isMyTeam
                                    ? "from-amber-400 to-amber-600 shadow-amber-500/50"
                                    : "from-slate-400 to-slate-600 shadow-slate-500/50"
                            )}
                        >
                            {/* Pulsing ring */}
                            <motion.div
                                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className={cn(
                                    "absolute inset-0 rounded-full",
                                    isMyTeam ? "bg-amber-400" : "bg-slate-400"
                                )}
                            />
                            <Trophy className="w-14 h-14 text-white drop-shadow-lg relative z-10" />
                        </motion.div>

                        {/* "FIRST TO FINISH" text */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-center"
                        >
                            <h2 className={cn(
                                "text-3xl md:text-4xl font-black uppercase tracking-wider mb-2",
                                "drop-shadow-lg",
                                isMyTeam ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {isMyTeam ? "Your Team" : teamName}
                            </h2>
                            <p className="text-xl md:text-2xl font-bold text-white/90 uppercase tracking-wide">
                                First to Finish Round {round}!
                            </p>
                        </motion.div>

                        {/* Bonus points */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ 
                                type: 'spring', 
                                damping: 12, 
                                stiffness: 200,
                                delay: 0.5 
                            }}
                            className={cn(
                                "mt-6 px-8 py-4 rounded-2xl",
                                "bg-gradient-to-r shadow-2xl",
                                "flex items-center gap-3",
                                isMyTeam
                                    ? "from-emerald-500 to-emerald-600 shadow-emerald-500/40"
                                    : "from-rose-500 to-rose-600 shadow-rose-500/40"
                            )}
                        >
                            <Zap className="w-8 h-8 text-white" />
                            <span className="text-4xl md:text-5xl font-black text-white">
                                +{bonus}
                            </span>
                            <span className="text-lg font-bold text-white/80 uppercase">
                                Bonus
                            </span>
                        </motion.div>

                        {/* Stars decoration */}
                        <div className="absolute -inset-20 pointer-events-none">
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ scale: 0, rotate: 0 }}
                                    animate={{ 
                                        scale: [0, 1, 0.8], 
                                        rotate: 360,
                                        opacity: [0, 1, 0.6] 
                                    }}
                                    transition={{ 
                                        delay: 0.4 + i * 0.1,
                                        duration: 0.5,
                                        ease: 'easeOut'
                                    }}
                                    className="absolute"
                                    style={{
                                        top: `${20 + Math.sin(i * 1.2) * 35}%`,
                                        left: `${20 + Math.cos(i * 1.2) * 35}%`,
                                    }}
                                >
                                    <Star 
                                        className={cn(
                                            "w-6 h-6",
                                            isMyTeam ? "text-amber-400" : "text-slate-400"
                                        )} 
                                        fill="currentColor" 
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
