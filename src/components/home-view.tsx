"use client";

import { motion } from "framer-motion";
import { Zap, Trophy, ArrowRight, Play } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";
import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";

interface HomeViewProps {
    session: any;
}

export function HomeView({ session }: HomeViewProps) {
    return (
        <main className="relative min-h-screen flex flex-col overflow-hidden bg-background">
            {/* Auth Header */}
            <div className="w-full max-w-7xl mx-auto px-4 relative z-50">
                <AuthHeader session={session} />
            </div>

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
                        <Link href="/practice">
                            <NeonButton className="flex items-center gap-2 px-8">
                                <Play className="fill-current" size={18} />
                                Quick Practice
                            </NeonButton>
                        </Link>
                        {session ? (
                            <Link href="/dashboard">
                                <button className="px-8 py-4 rounded-xl font-bold border border-foreground/10 hover:bg-foreground/5 transition-all text-foreground flex items-center gap-2">
                                    Dashboard
                                    <ArrowRight size={18} />
                                </button>
                            </Link>
                        ) : (
                            <Link href="/auth/login">
                                <button className="px-8 py-4 rounded-xl font-bold border border-foreground/10 hover:bg-foreground/5 transition-all text-foreground flex items-center gap-2">
                                    Sign In
                                    <ArrowRight size={18} />
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
