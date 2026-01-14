"use client";

import { motion } from "framer-motion";
import { Zap, Trophy, ArrowRight, Play, AlertTriangle } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";

interface HomeViewProps {
    session: any;
    maintenanceMode?: boolean;
    maintenanceMessage?: string | null;
}

export function HomeView({ session, maintenanceMode = false, maintenanceMessage }: HomeViewProps) {
    return (
        <main className="relative min-h-screen flex flex-col overflow-hidden bg-background">
            {/* Maintenance Banner */}
            {maintenanceMode && (
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative z-50 w-full bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 border-b border-yellow-500/30"
                >
                    <div className="container mx-auto px-6 py-4">
                        <div className="flex items-center justify-center gap-3 text-center">
                            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
                            <div>
                                <span className="font-bold text-yellow-400 uppercase tracking-widest text-sm">Maintenance Mode</span>
                                {maintenanceMessage && (
                                    <p className="text-sm text-yellow-200/80 mt-1">{maintenanceMessage}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Auth Header */}
            <AuthHeader session={session} />

            {/* Background Animated Geometry */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-primary/40 dark:bg-primary/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] bg-accent/40 dark:bg-accent/10 rounded-full blur-[150px] animate-pulse delay-1000" />
            </div>

            {/* Hero Section */}
            <div className="relative z-10 container mx-auto px-6 flex-1 flex flex-col justify-center text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
                        <Zap className="w-4 h-4" />
                        <span>Next-Gen Speed Math</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter text-foreground">
                        <motion.span
                            animate={{
                                backgroundPosition: ["200% center", "-200% center"],
                            }}
                            transition={{
                                duration: 6,
                                repeat: Infinity,
                                ease: "linear"
                            }}
                            style={{
                                backgroundImage: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 25%, #ffffff 50%, var(--color-accent) 75%, var(--color-primary) 100%)",
                                backgroundSize: "200% auto",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                            className="inline-block"
                        >
                            FLASH
                        </motion.span>
                        MATH
                    </h1>

                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground mb-10 text-balance font-medium">
                        Master arithmetic at lightning speed. Adaptive practice designed for future mathematicians.
                        Enjoyable, addicting, and scientifically effective.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        {/* Quick Practice - always available */}
                        <Link href="/practice">
                            <NeonButton className="px-8 shadow-[0_0_30px_rgba(34,211,238,0.4)] hover:shadow-[0_0_40px_rgba(34,211,238,0.6)]">
                                <span className="flex items-center gap-2 whitespace-nowrap">
                                    Quick Practice
                                    <Play className="fill-current" size={18} />
                                </span>
                            </NeonButton>
                        </Link>

                        {session ? (
                            <Link href="/dashboard">
                                <button className="px-8 py-4 rounded-xl font-bold border border-foreground/10 hover:bg-foreground/5 transition-all text-foreground flex items-center gap-2">
                                    Dashboard
                                    <ArrowRight size={18} />
                                </button>
                            </Link>
                        ) : maintenanceMode ? (
                            /* Auth disabled during maintenance */
                            <div className="relative group">
                                <button
                                    disabled
                                    className="px-8 py-4 rounded-xl font-bold border border-foreground/10 bg-foreground/5 text-muted-foreground/50 flex items-center gap-2 cursor-not-allowed"
                                >
                                    Sign Up
                                    <ArrowRight size={18} />
                                </button>
                                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-black/90 text-yellow-400 text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-yellow-500/30">
                                    <AlertTriangle size={12} className="inline mr-1" />
                                    Registration disabled during maintenance
                                </div>
                            </div>
                        ) : (
                            /* Sign Up button with shimmer */
                            <Link href="/auth/register">
                                <button className="px-8 py-4 rounded-xl font-black uppercase tracking-widest border border-primary/30 hover:border-primary/50 bg-gradient-to-r from-primary/10 to-accent/10 transition-all flex items-center gap-2">
                                    <motion.span
                                        animate={{
                                            backgroundPosition: ["200% center", "-200% center"],
                                        }}
                                        transition={{
                                            duration: 3,
                                            repeat: Infinity,
                                            ease: "linear"
                                        }}
                                        style={{
                                            backgroundImage: "linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 25%, #ffffff 50%, var(--color-accent) 75%, var(--color-primary) 100%)",
                                            backgroundSize: "200% auto",
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent",
                                        }}
                                    >
                                        Sign Up
                                    </motion.span>
                                    <ArrowRight size={18} className="text-primary" />
                                </button>
                            </Link>
                        )}
                    </div>

                    <div className="mt-12">
                        <Link href="/why-flash-math" className="text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 font-semibold text-xs tracking-widest uppercase">
                            <Trophy className="w-4 h-4" />
                            Project Info
                            <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                </motion.div>
            </div>

            {/* Modern Footer */}
            <footer className="relative z-10 w-full py-10 border-t border-foreground/5 shrink-0">
                <div className="container mx-auto px-6 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                    © 2025 FAST MATH VENTURES.
                </div>
            </footer>
        </main>
    );
}
