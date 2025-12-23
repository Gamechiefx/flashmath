"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { motion } from "framer-motion";
import {
    Activity,
    ArrowLeft,
    Clock,
    Target,
    Zap,
    AlertTriangle,
    CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from "recharts";

interface OperationStatsViewProps {
    stats: {
        operation: string;
        accuracy: number;
        avgSpeed: string;
        totalXP: number;
        totalPlays: number;
        missedProblems: any[];
        trend: any[];
    };
}

export function OperationStatsView({ stats }: OperationStatsViewProps) {
    const getOpColor = (op: string) => {
        switch (op) {
            case "Addition": return "text-blue-400";
            case "Subtraction": return "text-red-400";
            case "Multiplication": return "text-cyan-400";
            case "Division": return "text-green-400";
            default: return "text-primary";
        }
    };

    const getOpBg = (op: string) => {
        switch (op) {
            case "Addition": return "bg-blue-500/10 border-blue-500/20";
            case "Subtraction": return "bg-red-500/10 border-red-500/20";
            case "Multiplication": return "bg-cyan-500/10 border-cyan-500/20";
            case "Division": return "bg-green-500/10 border-green-500/20";
            default: return "bg-primary/10 border-primary/20";
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px]" />
            </div>

            <div className="max-w-6xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <div className="flex items-center gap-6">
                    <Link href="/dashboard">
                        <NeonButton variant="ghost" className="p-3 rounded-xl border border-white/10 hover:bg-white/5">
                            <ArrowLeft size={24} />
                        </NeonButton>
                    </Link>
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Activity size={14} />
                            Operation Report
                        </div>
                        <h1 className={cn("text-4xl md:text-6xl font-black uppercase tracking-tighter", getOpColor(stats.operation))}>
                            {stats.operation}
                        </h1>
                    </div>
                </div>

                {/* Summary Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <GlassCard className="p-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Overall Accuracy</div>
                        <div className="text-3xl font-black">{stats.accuracy.toFixed(1)}%</div>
                    </GlassCard>
                    <GlassCard className="p-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Avg Speed</div>
                        <div className="text-3xl font-black">{stats.avgSpeed}s</div>
                    </GlassCard>
                    <GlassCard className="p-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total XP</div>
                        <div className="text-3xl font-black text-primary">+{stats.totalXP}</div>
                    </GlassCard>
                    <GlassCard className="p-6">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Sessions</div>
                        <div className="text-3xl font-black">{stats.totalPlays}</div>
                    </GlassCard>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Missed Problems List */}
                    <div className="lg:col-span-1 space-y-6">
                        <GlassCard className={cn("h-full border", getOpBg(stats.operation))}>
                            <div className="flex items-center gap-3 mb-6">
                                <AlertTriangle className="text-red-400" />
                                <h3 className="text-xl font-black uppercase tracking-tight">Missed Problems</h3>
                            </div>

                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                {stats.missedProblems.length > 0 ? (
                                    stats.missedProblems.map((p: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors">
                                            <div className="text-2xl font-black font-mono tracking-tighter">{p.fact}</div>
                                            <div className="text-right">
                                                <div className="text-[10px] uppercase font-bold text-muted-foreground">Mastery</div>
                                                <div className={cn("text-xs font-bold", p.mastery < 0 ? "text-red-400" : "text-yellow-400")}>
                                                    {p.mastery < 0 ? "STRUGGLING" : "LEARNING"}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <CheckCircle2 size={48} className="mx-auto mb-4 text-green-400 opacity-50" />
                                        <p>No missed problems found!</p>
                                        <p className="text-xs mt-2">You are mastering this operation.</p>
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    </div>

                    {/* Trend Graph */}
                    <div className="lg:col-span-2 space-y-6">
                        <GlassCard className="h-full">
                            <div className="flex items-center gap-3 mb-6">
                                <Zap className="text-accent" />
                                <h3 className="text-xl font-black uppercase tracking-tight">Recent Performance Trend</h3>
                            </div>

                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats.trend}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#ffffff40"
                                            tick={{ fontSize: 10 }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="#ffffff40"
                                            tick={{ fontSize: 10 }}
                                            tickLine={false}
                                            axisLine={false}
                                            domain={[0, 100]}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#000000CC', border: '1px solid #ffffff20', borderRadius: '12px', backdropFilter: 'blur(10px)' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="accuracy"
                                            stroke="#22d3ee"
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 2, fill: '#000' }}
                                            activeDot={{ r: 6, fill: '#22d3ee' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="text-center text-xs text-muted-foreground mt-4 font-mono">
                                Showing accuracy % for the last 10 sessions
                            </div>
                        </GlassCard>
                    </div>
                </div>

                <div className="flex justify-center pt-8">
                    <Link href={`/practice?op=${stats.operation}`}>
                        <NeonButton className="px-12 py-6 text-lg">
                            PRACTICE {stats.operation.toUpperCase()}
                        </NeonButton>
                    </Link>
                </div>
            </div>
        </div>
    );
}
