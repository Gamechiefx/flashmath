"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    Zap,
    Trophy,
    Target,
    History,
    ChevronRight,
    Activity
} from "lucide-react";
import Link from "next/link";

interface DashboardViewProps {
    stats: any;
    userName: string;
}

export function DashboardView({ stats, userName }: DashboardViewProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Stats Summary */}
            <div className="lg:col-span-4 space-y-6">
                <GlassCard className="p-0 overflow-hidden">
                    <div className="p-6 bg-primary/10 border-b border-primary/10">
                        <div className="flex items-center gap-3 mb-2 text-primary">
                            <Trophy size={20} />
                            <span className="text-xs font-bold uppercase tracking-widest">Global Rank</span>
                        </div>
                        <div className="text-3xl font-black">{stats?.totalXP > 500 ? "PHANTOM PILOT" : "NEON RECRUIT"}</div>
                        <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-1000"
                                style={{ width: `${Math.min(100, (stats?.totalXP % 1000) / 10)}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-tighter">Next Rank at {Math.ceil((stats?.totalXP || 0) / 1000) * 1000} XP ({stats?.totalXP || 0} XP Total)</p>
                    </div>

                    <div className="p-6 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Accuracy</div>
                            <div className="text-xl font-mono tracking-tighter">{stats?.accuracy?.toFixed(1) || 0}%</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Avg Speed</div>
                            <div className="text-xl font-mono tracking-tighter">{stats?.avgSpeed || "0.00s"}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Rank #</div>
                            <div className="text-xl font-mono tracking-tighter text-accent">--</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total XP</div>
                            <div className="text-xl font-mono tracking-tighter text-primary">{stats?.totalXP || 0}</div>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Sessions</h3>
                        <History size={16} className="text-muted-foreground" />
                    </div>
                    <div className="space-y-3">
                        {stats?.recentSessions?.length > 0 ? (
                            stats.recentSessions.map((s: any, i: number) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                    <div className="text-sm font-bold">{s.operation}</div>
                                    <div className="text-xs font-mono text-primary">+{s.xp_earned || 0} XP</div>
                                </div>
                            ))
                        ) : (
                            <div className="text-xs text-muted-foreground italic py-4">No sessions logged yet.</div>
                        )}
                    </div>
                    <Link href="/practice" className="block text-center">
                        <button className="w-full text-[10px] uppercase font-bold tracking-widest text-primary hover:underline transition-all">Start New Practice</button>
                    </Link>
                </GlassCard>
            </div>

            {/* Right Column: Mastery Map & Operations */}
            <div className="lg:col-span-8 space-y-8">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <Target className="text-accent" size={24} />
                        <h2 className="text-2xl font-black tracking-tighter uppercase">Mastery Progress</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {(stats?.masteryMap || [
                            { title: "Addition", progress: 0 },
                            { title: "Subtraction", progress: 0 },
                            { title: "Multiplication", progress: 0 },
                            { title: "Division", progress: 0 }
                        ]).map((op: any) => (
                            <Link key={op.title} href={`/practice?op=${op.title}`} className="block group">
                                <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-white/20 transition-all overflow-hidden">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-2xl font-black uppercase text-foreground/80 group-hover:text-foreground transition-colors">{op.title}</div>
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold bg-white/5 border border-white/10 text-primary">
                                            {op.title === "Addition" ? "+" : op.title === "Subtraction" ? "-" : op.title === "Multiplication" ? "×" : "÷"}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            <span>Mastery</span>
                                            <span>{op.progress}%</span>
                                        </div>
                                        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${op.progress}%` }}
                                                className={cn("h-full", op.title === 'Addition' ? 'bg-blue-400' : op.title === 'Subtraction' ? 'bg-red-400' : 'bg-primary')}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center justify-between text-xs font-bold text-muted-foreground uppercase opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                        <span>Begin Session</span>
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
                            <Activity size={32} />
                        </div>
                        <div>
                            <h4 className="text-xl font-black">DAILY SURGE</h4>
                            <p className="text-sm text-muted-foreground">10 facts. Fast as light. Double XP active.</p>
                        </div>
                    </div>
                    <Link href="/practice">
                        <NeonButton variant="accent">
                            LET'S GO!
                        </NeonButton>
                    </Link>
                </GlassCard>
            </div>
        </div>
    );
}
