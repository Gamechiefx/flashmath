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
    Activity,
    Coins,
    BarChart3,
    ShoppingBag,
    ArrowRight,
    Archive
} from "lucide-react";
import Link from "next/link";

import { PlacementTest } from "@/components/placement-test";
import { useState } from "react";
import { updateTiers } from "@/lib/actions/game"; // If needed for placement test callback
import { useRouter } from "next/navigation";

interface DashboardViewProps {
    stats: any;
    userName: string;
}

import { useSession } from "next-auth/react";

export function DashboardView({ stats, userName }: DashboardViewProps) {
    const [isOperationsOpen, setIsOperationsOpen] = useState(true); // Default open?
    const [selectedOp, setSelectedOp] = useState<string | null>(null);
    const [showPlacementTest, setShowPlacementTest] = useState(false);
    const router = useRouter();
    const { update } = useSession();

    const handlePlacementComplete = async () => {
        setShowPlacementTest(false);
        await update();
        router.refresh();
    };

    const toRoman = (num: number) => {
        const romans = ["I", "II", "III", "IV"];
        return romans[num - 1] || "I";
    };


    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Stats Summary */}
            <div className="lg:col-span-4 space-y-6">
                <GlassCard className="p-0 overflow-hidden">
                    <div className="p-6 bg-primary/10 border-b border-primary/10">
                        <div className="flex items-center gap-3 mb-2 text-primary">
                            <Trophy size={20} />
                            <span className="text-xs font-bold uppercase tracking-widest">{stats?.leagueId?.replace('-league', '')?.toUpperCase()} LEAGUE</span>
                        </div>
                        <div className="text-3xl font-black">LEVEL {stats?.level || 1} PILOT</div>
                        {stats?.equippedTitle && (
                            <div className="text-xs font-bold uppercase tracking-widest text-primary mt-1">{stats.equippedTitle}</div>
                        )}
                        <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-1000"
                                style={{ width: `${(stats?.totalXP % 1000) / 10}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-tighter">Next Level at {Math.ceil(((stats?.totalXP || 0) + 1) / 1000) * 1000} XP ({stats?.totalXP || 0} Total)</p>
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
                            <div className="text-xl font-mono tracking-tighter text-accent">TOP 10</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Flux Coins</div>
                            <div className="text-xl font-mono tracking-tighter text-yellow-400">§ {stats?.coins || 0}</div>
                        </div>
                    </div>
                </GlassCard>

                {/* Career Stats Section */}
                {
                    stats?.careerStats && (
                        <Link href="/stats" className="block">
                            <GlassCard className="space-y-4 hover:bg-white/5 transition-all cursor-pointer group">
                                <div className="flex items-center gap-3 text-muted-foreground group-hover:text-white transition-colors">
                                    <Activity size={16} />
                                    <h3 className="text-xs font-bold uppercase tracking-widest">Career Stats</h3>
                                    <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center overflow-hidden">
                                        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Lifetime Accuracy</div>
                                        <div className="text-2xl font-black text-primary truncate max-w-full">{stats.careerStats.lifetimeAccuracy.toFixed(1)}%</div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center overflow-hidden">
                                        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Needs Work</div>
                                        <div className="text-2xl font-black text-red-400 truncate max-w-full" title={stats.careerStats.weakestLink}>{stats.careerStats.weakestLink}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Recent Trend</div>
                                    <div className="h-16 flex items-end gap-1">
                                        {stats.careerStats.history.map((s: any, i: number) => (
                                            <div
                                                key={i}
                                                className="flex-1 bg-primary/20 rounded-t-sm relative group/bar hover:bg-primary transition-colors"
                                                style={{ height: `${s.accuracy}%` }}
                                            >
                                                <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none z-10">
                                                    {s.accuracy.toFixed(0)}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </GlassCard>
                        </Link>
                    )
                }

                <div className="grid grid-cols-3 gap-4">
                    <Link href="/leaderboard" className="block">
                        <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-primary/5 transition-all group">
                            <BarChart3 className="text-primary group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Leagues</span>
                        </GlassCard>
                    </Link>
                    <Link href="/shop" className="block">
                        <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-accent/5 transition-all group">
                            <ShoppingBag className="text-accent group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Shop</span>
                        </GlassCard>
                    </Link>
                    <Link href="/locker" className="block">
                        <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-green-400/5 transition-all group">
                            <Archive size={24} className="text-green-400 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Locker</span>
                        </GlassCard>
                    </Link>
                </div>


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
            </div >

            {/* Right Column: Mastery Map & Operations */}
            <div className="lg:col-span-8 space-y-6">

                {showPlacementTest && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-4xl relative">
                            <button
                                onClick={() => setShowPlacementTest(false)}
                                className="absolute -top-12 right-0 text-white/50 hover:text-white"
                            >
                                CLOSE
                            </button>
                            <PlacementTest onComplete={handlePlacementComplete} />
                        </div>
                    </div>
                )}

                {/* Collapsible Operations Section */}
                <div className="group rounded-3xl border border-white/10 overflow-hidden bg-white/5 transition-all">
                    <button
                        onClick={() => setIsOperationsOpen(!isOperationsOpen)}
                        className="w-full flex items-center justify-between p-8 text-2xl font-black uppercase tracking-tighter text-white hover:text-primary transition-colors"
                    >
                        <div className="flex items-center gap-6">
                            <div className="grid grid-cols-2 gap-1 p-2 bg-accent/10 rounded-lg">
                                <span className="text-accent text-[10px] font-black leading-none">+</span>
                                <span className="text-accent text-[10px] font-black leading-none">×</span>
                                <span className="text-accent text-[10px] font-black leading-none">-</span>
                                <span className="text-accent text-[10px] font-black leading-none">÷</span>
                            </div>
                            <span className="text-2xl font-black uppercase tracking-tighter">OPERATIONS</span>
                        </div>
                        <div className={cn("transition-transform duration-300", isOperationsOpen ? "rotate-180" : "")}>
                            <ChevronRight />
                        </div>
                    </button>

                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out",
                        isOperationsOpen ? "grid-rows-[1fr] opacity-100 p-8 pt-0" : "grid-rows-[0fr] opacity-0 p-0"
                    )}>
                        <div className="overflow-hidden">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(stats?.masteryMap || [
                                    { title: "Addition", progress: 0 },
                                    { title: "Subtraction", progress: 0 },
                                    { title: "Multiplication", progress: 0 },
                                    { title: "Division", progress: 0 }
                                ]).map((op: any) => (
                                    <div
                                        key={op.title}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl border transition-all p-6 cursor-pointer group",
                                            selectedOp === op.title
                                                ? "bg-primary/20 border-primary/50 shadow-[0_0_30px_rgba(34,211,238,0.1)]"
                                                : "bg-black/20 border-white/5 hover:bg-white/5"
                                        )}
                                        onClick={() => setSelectedOp(selectedOp === op.title ? null : op.title)}
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-zinc-400 uppercase tracking-widest">{op.title}</span>
                                                <span className="text-xs font-black text-primary uppercase tracking-widest">
                                                    Tier {toRoman(op.tier || 1)}
                                                </span>
                                            </div>
                                            <span className={cn(
                                                "text-3xl font-black truncate max-w-[80px]",
                                                selectedOp === op.title ? "text-primary" : "text-zinc-700"
                                            )}>
                                                {op.title === "Addition" ? "+" : op.title === "Subtraction" ? "-" : op.title === "Multiplication" ? "×" : "÷"}
                                            </span>
                                        </div>

                                        <div className="space-y-3 mb-6">
                                            <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                                                <span>Tier Completion</span>
                                                <span className={cn(selectedOp === op.title ? "text-primary" : "")}>{op.progress}%</span>
                                            </div>

                                            <div className="h-2 w-full bg-zinc-800/50 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${op.progress}%` }}
                                                    className={cn("h-full transition-all", selectedOp === op.title ? "bg-primary shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-zinc-600")}
                                                />
                                            </div>
                                        </div>

                                        {/* Action Area (Visible when selected) */}
                                        <div className={cn(
                                            "grid transition-all duration-300 ease-in-out",
                                            selectedOp === op.title ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                        )}>
                                            <div className="overflow-hidden pt-2">
                                                <Link href={`/practice?op=${op.title}`}>
                                                    <NeonButton className="w-full py-4 text-lg font-bold">
                                                        START TRAINING
                                                    </NeonButton>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex gap-4 justify-center">
                                {!stats?.hasPlaced && (
                                    <button
                                        onClick={() => setShowPlacementTest(true)}
                                        className="px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-colors animate-pulse"
                                    >
                                        Take Placement Test
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coming Soon Sections */}
                <div className="grid grid-cols-2 gap-6 opacity-40">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex items-center justify-between cursor-not-allowed">
                        <span className="font-bold text-muted-foreground uppercase tracking-widest">Percentage</span>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded">SOON</span>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex items-center justify-between cursor-not-allowed">
                        <span className="font-bold text-muted-foreground uppercase tracking-widest">Decimals</span>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded">SOON</span>
                    </div>
                </div>

            </div>

            {/* Detailed Operation Stats */}
        </div >
    );
}
