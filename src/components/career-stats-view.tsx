"use client";

import { useState, useEffect, useRef } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { motion, useInView } from "framer-motion";
import { ArrowLeft, Trophy, Zap, Target, Clock, Activity } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { OperationStatsModal } from "@/components/operation-stats-modal";

interface CareerStatsViewProps {
    stats: any;
}

// Animated counter component
function AnimatedNumber({ value, duration = 1.5, suffix = "", decimals = 1 }: { value: number; duration?: number; suffix?: string; decimals?: number }) {
    const [displayValue, setDisplayValue] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    const isInView = useInView(ref, { once: true });

    useEffect(() => {
        if (!isInView) return;

        const startTime = Date.now();
        const startValue = 0;
        const endValue = value;

        const animate = () => {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (endValue - startValue) * eased;

            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration, isInView]);

    return <span ref={ref}>{displayValue.toFixed(decimals)}{suffix}</span>;
}

// Stagger container variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: [0.25, 0.46, 0.45, 0.94]
        }
    }
};

export function CareerStatsView({ stats }: CareerStatsViewProps) {
    const [selectedOp, setSelectedOp] = useState<string | null>(null);
    const overall = stats?.careerStats || {};
    const detailedOps = overall.detailedOps || [];

    return (
        <motion.div
            className="min-h-screen p-6 md:p-12 space-y-8 max-w-7xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <motion.header
                className="flex items-center gap-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
            >
                <Link href="/dashboard">
                    <motion.button
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <ArrowLeft size={20} />
                    </motion.button>
                </Link>
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter">Career Statistics</h1>
                    <p className="text-muted-foreground text-sm font-medium">Detailed performance breakdown</p>
                </div>
            </motion.header>

            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <GlassCard className="p-6 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-primary">
                            <Trophy size={18} />
                            <span className="text-xs font-bold uppercase tracking-widest">Lifetime Accuracy</span>
                        </div>
                        <div className="text-4xl font-black">
                            <AnimatedNumber value={overall.lifetimeAccuracy || 0} suffix="%" />
                        </div>
                    </GlassCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <GlassCard className="p-6 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-accent">
                            <Zap size={18} />
                            <span className="text-xs font-bold uppercase tracking-widest">Avg Speed</span>
                        </div>
                        <div className="text-4xl font-black text-accent">{stats?.avgSpeed || "0.00s"}</div>
                    </GlassCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <GlassCard className="p-6 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-yellow-400">
                            <Target size={18} />
                            <span className="text-xs font-bold uppercase tracking-widest">Weakest Link</span>
                        </div>
                        <div className="text-4xl font-black text-white">{overall.weakestLink || "None"}</div>
                    </GlassCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <GlassCard className="p-6 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-purple-400">
                            <Activity size={18} />
                            <span className="text-xs font-bold uppercase tracking-widest">Total Sessions</span>
                        </div>
                        <div className="text-4xl font-black text-white">
                            <AnimatedNumber value={stats.totalSessions || 0} decimals={0} />
                        </div>
                    </GlassCard>
                </motion.div>
            </motion.div>

            <motion.h2
                className="text-xl font-bold uppercase tracking-widest flex items-center gap-2 mt-12"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <Target className="text-primary" />
                Operation Breakdown
            </motion.h2>

            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {detailedOps.map((op: any, index: number) => (
                    <motion.div
                        key={op.op}
                        variants={itemVariants}
                        custom={index}
                        transition={{ delay: 0.5 + index * 0.1 }}
                    >
                        <GlassCard
                            className={cn(
                                "p-8 space-y-6 transition-all hover:bg-white/5 cursor-pointer group",
                                op.accuracy < 80 && op.sessionsPlayed > 0 ? "border-red-500/20" : ""
                            )}
                            onClick={() => setSelectedOp(op.op)}
                        >
                            <div className="flex justify-between items-start">
                                <h3 className="text-2xl font-black uppercase tracking-widest group-hover:text-primary transition-colors">{op.op}</h3>
                                <motion.div
                                    className="text-xs font-bold px-3 py-1 rounded-full bg-white/5 border border-white/10 uppercase tracking-widest text-muted-foreground"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.6 + index * 0.1, type: "spring" }}
                                >
                                    {op.sessionsPlayed} Sessions
                                </motion.div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Accuracy</div>
                                    <div className={cn(
                                        "text-3xl font-black",
                                        op.accuracy >= 90 ? "text-green-400" : op.accuracy >= 70 ? "text-yellow-400" : "text-red-400"
                                    )}>
                                        <AnimatedNumber value={op.accuracy} suffix="%" duration={1} />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Avg Speed</div>
                                    <div className="text-3xl font-black text-white">
                                        <AnimatedNumber value={op.avgSpeed} suffix="s" duration={1} decimals={2} />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Total XP</div>
                                    <div className="text-3xl font-black text-primary">
                                        <AnimatedNumber value={op.totalXP} decimals={0} duration={1.2} />
                                    </div>
                                </div>
                                <div className="flex items-end">
                                    <Link href={`/practice?op=${op.op}`} className="w-full" onClick={(e) => e.stopPropagation()}>
                                        <NeonButton className="w-full py-2 text-xs font-bold">
                                            PRACTICE
                                        </NeonButton>
                                    </Link>
                                </div>
                            </div>
                        </GlassCard>
                    </motion.div>
                ))}
            </motion.div>

            {/* Operation Stats Modal */}
            <OperationStatsModal
                operation={selectedOp || ""}
                isOpen={!!selectedOp}
                onClose={() => setSelectedOp(null)}
            />
        </motion.div>
    );
}
