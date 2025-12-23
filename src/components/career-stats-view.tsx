"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ArrowLeft, Trophy, Zap, Target, Clock, Activity } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CareerStatsViewProps {
    stats: any;
}

export function CareerStatsView({ stats }: CareerStatsViewProps) {
    const overall = stats?.careerStats || {};
    const detailedOps = overall.detailedOps || [];

    return (
        <div className="min-h-screen p-6 md:p-12 space-y-8 max-w-7xl mx-auto">
            <header className="flex items-center gap-4">
                <Link href="/dashboard">
                    <button className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                </Link>
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Career Statistics</h1>
                    <p className="text-muted-foreground text-sm font-medium">Detailed performance breakdown</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <GlassCard className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Trophy size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Lifetime Accuracy</span>
                    </div>
                    <div className="text-4xl font-black">{overall.lifetimeAccuracy?.toFixed(1) || 0}%</div>
                </GlassCard>
                <GlassCard className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-accent">
                        <Zap size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Avg Speed</span>
                    </div>
                    <div className="text-4xl font-black text-accent">{stats?.avgSpeed || "0.00s"}</div>
                </GlassCard>
                <GlassCard className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-yellow-400">
                        <Target size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Weakest Link</span>
                    </div>
                    <div className="text-4xl font-black text-white">{overall.weakestLink || "None"}</div>
                </GlassCard>
                <GlassCard className="p-6 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-purple-400">
                        <Activity size={18} />
                        <span className="text-xs font-bold uppercase tracking-widest">Total Sessions</span>
                    </div>
                    <div className="text-4xl font-black text-white">{stats.recentSessions?.length || 0}</div>
                    {/* Note: recentSessions is sliced, ideally we want total count. 
                        Let's infer from detailedOps sum for now */}
                </GlassCard>
            </div>

            <h2 className="text-xl font-bold uppercase tracking-widest flex items-center gap-2 mt-12">
                <Target className="text-primary" />
                Operation Breakdown
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {detailedOps.map((op: any) => (
                    <GlassCard key={op.op} className={cn(
                        "p-8 space-y-6 transition-all hover:bg-white/5",
                        op.accuracy < 80 && op.sessionsPlayed > 0 ? "border-red-500/20" : ""
                    )}>
                        <div className="flex justify-between items-start">
                            <h3 className="text-2xl font-black uppercase tracking-widest">{op.op}</h3>
                            <div className="text-xs font-bold px-3 py-1 rounded-full bg-white/5 border border-white/10 uppercase tracking-widest text-muted-foreground">
                                {op.sessionsPlayed} Sessions
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Accuracy</div>
                                <div className={cn(
                                    "text-3xl font-black",
                                    op.accuracy >= 90 ? "text-green-400" : op.accuracy >= 70 ? "text-yellow-400" : "text-red-400"
                                )}>
                                    {op.accuracy.toFixed(1)}%
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Avg Speed</div>
                                <div className="text-3xl font-black text-white">
                                    {op.avgSpeed.toFixed(2)}s
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total XP</div>
                                <div className="text-3xl font-black text-primary">
                                    {op.totalXP}
                                </div>
                            </div>
                            <div className="flex items-end">
                                <Link href={`/practice?op=${op.op}`} className="w-full">
                                    <NeonButton className="w-full py-2 text-xs font-bold">
                                        PRACTICE
                                    </NeonButton>
                                </Link>
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    );
}
