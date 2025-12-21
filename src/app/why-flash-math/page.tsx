"use client";

import { motion } from "framer-motion";
import { Zap, Brain, Trophy, ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function WhyFlashMath() {
    return (
        <main className="relative min-h-screen flex flex-col overflow-hidden">
            <div className="absolute top-6 right-6 z-50">
                <ThemeToggle />
            </div>

            <div className="absolute inset-0 z-0 text-foreground overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-primary/40 dark:bg-primary/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute -bottom-20 -right-20 w-[600px] h-[600px] bg-accent/40 dark:bg-accent/10 rounded-full blur-[150px] animate-pulse delay-1000" />
            </div>

            <div className="relative z-10 container mx-auto px-6 flex-1 flex flex-col justify-center text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
                        <ArrowLeft size={18} />
                        Back to Home
                    </Link>

                    <h1 className="text-4xl md:text-6xl font-black mb-12 tracking-tighter">
                        Why <span className="text-primary">Flash</span><span className="text-accent">Math</span>?
                    </h1>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        <GlassCard className="text-left">
                            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 text-primary">
                                <Zap size={24} />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-foreground">Fluency First</h3>
                            <p className="text-sm text-muted-foreground">
                                Built on XtraMath principles to build subconscious recall of basic facts.
                            </p>
                        </GlassCard>

                        <GlassCard className="text-left border-accent/20">
                            <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center mb-4 text-accent">
                                <Brain size={24} />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-foreground">Adaptive AI</h3>
                            <p className="text-sm text-muted-foreground">
                                Intelligently focuses on facts you struggle with using spaced repetition.
                            </p>
                        </GlassCard>

                        <GlassCard className="text-left">
                            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4 text-primary">
                                <Trophy size={24} />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-foreground">Gamified Mastery</h3>
                            <p className="text-sm text-muted-foreground">
                                Level up your skill ceiling and collect digital badges as you master operations.
                            </p>
                        </GlassCard>
                    </div>
                </motion.div>
            </div>

            <footer className="relative z-10 w-full py-10 shrink-0">
                <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
                    © 2025 FlashMath Ecosystem. All rights reserved.
                </div>
            </footer>
        </main>
    );
}
