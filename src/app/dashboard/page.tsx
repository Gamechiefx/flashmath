"use client";

import { redirect } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    Zap,
    Trophy,
    Target,
    History,
    LogOut,
    ChevronRight
} from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export default function DashboardPage() {
    const { data: session, status } = useSession();

    if (status === "loading") return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary animate-pulse">BOOTING TERMINAL...</div>;
    if (!session?.user) {
        redirect("/auth/login");
    }

    const user = session.user;

    return (
        <main className="min-h-screen bg-background text-foreground p-6 lg:p-12 relative overflow-hidden">
            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            {/* Header */}
            <nav className="flex items-center justify-between mb-12 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                        <Zap size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tighter">FLASHMATH <span className="text-primary text-sm tracking-widest ml-2">TERMINAL</span></h1>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest">Active Pilot: {user.name}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <ThemeToggle />
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/10 hover:text-red-500 transition-all"
                    >
                        <LogOut size={20} />
                    </button>
                </div>

            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
                {/* Left Column: Stats Summary */}
                <div className="lg:col-span-4 space-y-6">
                    <GlassCard className="p-0 overflow-hidden">
                        <div className="p-6 bg-primary/10 border-b border-primary/10">
                            <div className="flex items-center gap-3 mb-2 text-primary">
                                <Trophy size={20} />
                                <span className="text-xs font-bold uppercase tracking-widest">Global Rank</span>
                            </div>
                            <div className="text-3xl font-black">NEON RECRUIT</div>
                            <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="w-1/3 h-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-tighter">Next Rank at 1,000 XP (350/1000)</p>
                        </div>

                        <div className="p-6 grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Accuracy</div>
                                <div className="text-xl font-mono tracking-tighter">98.4%</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Avg Speed</div>
                                <div className="text-xl font-mono tracking-tighter">2.41s</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Best Streak</div>
                                <div className="text-xl font-mono tracking-tighter text-accent">42</div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total XP</div>
                                <div className="text-xl font-mono tracking-tighter text-primary">12,400</div>
                            </div>
                        </div>
                    </GlassCard>

                    <GlassCard className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Session Log</h3>
                            <History size={16} className="text-muted-foreground" />
                        </div>
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                    <div className="text-sm font-bold">Multiplication</div>
                                    <div className="text-xs font-mono text-primary">+120 XP</div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full text-[10px] uppercase font-bold tracking-widest text-primary hover:underline transition-all">View All Activity</button>
                    </GlassCard>
                </div>

                {/* Right Column: Mastery Map & Operations */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                        <div className="flex items-center gap-3 mb-8">
                            <Target className="text-accent" size={24} />
                            <h2 className="text-2xl font-black tracking-tighter">MASTERY OPERATIVES</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[
                                { title: "Addition", icon: "+", color: "text-blue-400", bg: "bg-blue-400/10", progress: 80 },
                                { title: "Subtraction", icon: "-", color: "text-red-400", bg: "bg-red-400/10", progress: 45 },
                                { title: "Multiplication", icon: "×", color: "text-accent", bg: "bg-accent/10", progress: 10 },
                                { title: "Division", icon: "÷", color: "text-green-400", bg: "bg-green-400/10", progress: 0 }
                            ].map((op) => (
                                <Link key={op.title} href="/practice" className="block group">
                                    <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-all overflow-hidden">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={op.color + " text-2xl font-black"}>{op.title.toUpperCase()}</div>
                                            <div className={op.bg + " " + op.color + " w-10 h-10 rounded-xl flex items-center justify-center font-bold"}>
                                                {op.icon}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                <span>Mastery Progress</span>
                                                <span>{op.progress}%</span>
                                            </div>
                                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${op.progress}%` }}
                                                    className={cn("h-full", op.title === 'Addition' ? 'bg-blue-400' : op.title === 'Subtraction' ? 'bg-red-400' : 'bg-accent')}
                                                />
                                            </div>
                                        </div>

                                        <div className="mt-6 flex items-center justify-between text-xs font-bold text-muted-foreground uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span>Enter Simulation</span>
                                            <ChevronRight size={14} />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <GlassCard className="flex items-center justify-between p-8 border-accent/20">
                        <div className="flex gap-6 items-center">
                            <div className="w-16 h-16 rounded-3xl bg-accent shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center justify-center text-white">
                                <Zap size={32} />
                            </div>
                            <div>
                                <h4 className="text-xl font-black">DAILY SURGE</h4>
                                <p className="text-sm text-muted-foreground">10 facts. Fast as light. Double XP active.</p>
                            </div>
                        </div>
                        <NeonButton variant="accent">
                            COMMENCE
                        </NeonButton>
                    </GlassCard>
                </div>
            </div>
        </main>
    );
}

