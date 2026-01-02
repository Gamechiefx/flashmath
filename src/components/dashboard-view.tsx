"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { motion, useSpring, useTransform, useInView } from "framer-motion";
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
import { useState, useEffect, useRef } from "react";
import { updateTiers } from "@/lib/actions/game";
import { useRouter } from "next/navigation";
import { getBandForTier, getTierWithinBand, getProgressWithinBand, formatTierShort } from "@/lib/tier-system";

interface DashboardViewProps {
    stats: any;
    userName: string;
}

import { useSession } from "next-auth/react";

// Animated counter component
function AnimatedNumber({ value, duration = 1.5, suffix = "" }: { value: number; duration?: number; suffix?: string }) {
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

    return <span ref={ref}>{displayValue.toFixed(suffix === "%" || suffix === "s" ? 1 : 0)}{suffix}</span>;
}

// Animated progress bar component
function AnimatedProgressBar({
    value,
    className,
    glowColor = "rgba(34,211,238,0.5)",
    delay = 0
}: {
    value: number;
    className?: string;
    glowColor?: string;
    delay?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true });

    return (
        <div ref={ref} className="h-full w-full">
            <motion.div
                initial={{ width: 0 }}
                animate={isInView ? { width: `${value}%` } : { width: 0 }}
                transition={{
                    duration: 1.2,
                    delay: delay,
                    ease: [0.34, 1.56, 0.64, 1] // Spring-like easing
                }}
                className={className}
                style={{ boxShadow: `0 0 10px ${glowColor}` }}
            />
        </div>
    );
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

const cardHover = {
    scale: 1.02,
    transition: { duration: 0.2 }
};

export function DashboardView({ stats, userName }: DashboardViewProps) {
    const [isOperationsOpen, setIsOperationsOpen] = useState(true);
    const [selectedOp, setSelectedOp] = useState<string | null>(null);
    const [showPlacementTest, setShowPlacementTest] = useState(false);
    const router = useRouter();
    const { update } = useSession();

    const handlePlacementComplete = async () => {
        setShowPlacementTest(false);
        await update();
        router.refresh();
    };

    // Helper to get tier display info for 100-tier system
    const getTierDisplayInfo = (tier: number) => {
        const band = getBandForTier(tier);
        const tierInBand = getTierWithinBand(tier);
        const progress = getProgressWithinBand(tier) * 100;
        return { band, tierInBand, progress };
    };

    return (
        <motion.div
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Left Column: Stats Summary */}
            <div className="lg:col-span-4 space-y-6">
                <motion.div variants={itemVariants}>
                    <GlassCard className="p-0 overflow-hidden">
                        <div className="p-6 bg-primary/10 border-b border-primary/10">
                            <motion.div
                                className="flex items-center gap-3 mb-2 text-primary"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                <Trophy size={20} />
                                <span className="text-xs font-bold uppercase tracking-widest">{stats?.leagueId?.replace('-league', '')?.toUpperCase()} LEAGUE</span>
                            </motion.div>
                            <motion.div
                                className="text-3xl font-black"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3, duration: 0.5 }}
                            >
                                LEVEL {stats?.level || 1}
                            </motion.div>
                            {stats?.equippedTitle && (
                                <motion.div
                                    className="text-xs font-bold uppercase tracking-widest text-primary mt-1"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    {stats.equippedTitle}
                                </motion.div>
                            )}
                            <div className="mt-4 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <AnimatedProgressBar
                                    value={(stats?.totalXP % 1000) / 10}
                                    className="h-full bg-primary"
                                    delay={0.5}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-tighter">Next Level at {Math.ceil(((stats?.totalXP || 0) + 1) / 1000) * 1000} XP ({stats?.totalXP || 0} Total)</p>
                        </div>

                        <motion.div
                            className="p-6 grid grid-cols-2 gap-4"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <motion.div className="space-y-1" variants={itemVariants}>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Accuracy</div>
                                <div className="text-xl font-mono tracking-tighter">
                                    <AnimatedNumber value={stats?.accuracy || 0} suffix="%" />
                                </div>
                            </motion.div>
                            <motion.div className="space-y-1" variants={itemVariants}>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Avg Speed</div>
                                <div className="text-xl font-mono tracking-tighter">{stats?.avgSpeed || "0.00s"}</div>
                            </motion.div>
                            <motion.div className="space-y-1" variants={itemVariants}>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Rank #</div>
                                <div className="text-xl font-mono tracking-tighter text-accent">
                                    #{stats?.userRank || "-"}
                                </div>
                            </motion.div>
                            <motion.div className="space-y-1" variants={itemVariants}>
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Flux Coins</div>
                                <div className="text-xl font-mono tracking-tighter text-yellow-400">
                                    § <AnimatedNumber value={stats?.coins || 0} />
                                </div>
                            </motion.div>
                        </motion.div>
                    </GlassCard>
                </motion.div>

                {/* Quick Links - Leagues, Shop, Locker */}
                <motion.div
                    className="grid grid-cols-3 gap-4"
                    variants={containerVariants}
                >
                    <motion.div variants={itemVariants}>
                        <Link href="/leaderboard" className="block">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-primary/5 transition-all group">
                                    <BarChart3 className="text-primary group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Leagues</span>
                                </GlassCard>
                            </motion.div>
                        </Link>
                    </motion.div>
                    <motion.div variants={itemVariants}>
                        <Link href="/shop" className="block">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-accent/5 transition-all group">
                                    <ShoppingBag className="text-accent group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Shop</span>
                                </GlassCard>
                            </motion.div>
                        </Link>
                    </motion.div>
                    <motion.div variants={itemVariants}>
                        <Link href="/locker" className="block">
                            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                                <GlassCard className="p-4 flex flex-col items-center gap-2 hover:bg-green-400/5 transition-all group">
                                    <Archive size={24} className="text-green-400 group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Locker</span>
                                </GlassCard>
                            </motion.div>
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Career Stats Section */}
                {
                    stats?.careerStats && (
                        <motion.div variants={itemVariants}>
                            <Link href="/stats" className="block">
                                <motion.div whileHover={cardHover}>
                                    <GlassCard className="space-y-4 hover:bg-white/5 transition-all cursor-pointer group">
                                        <div className="flex items-center gap-3 text-muted-foreground group-hover:text-white transition-colors">
                                            <Activity size={16} />
                                            <h3 className="text-xs font-bold uppercase tracking-widest">Career Stats</h3>
                                            <ArrowRight size={14} className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center overflow-hidden">
                                                <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Lifetime Accuracy</div>
                                                <div className="text-2xl font-black text-primary truncate max-w-full">
                                                    <AnimatedNumber value={stats.careerStats.lifetimeAccuracy} suffix="%" />
                                                </div>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center overflow-hidden">
                                                <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Needs Work</div>
                                                <div className="text-4xl font-black text-red-400 truncate max-w-full" title={stats.careerStats.weakestLink}>
                                                    {stats.careerStats.weakestLink === 'Addition' ? '+' :
                                                     stats.careerStats.weakestLink === 'Subtraction' ? '−' :
                                                     stats.careerStats.weakestLink === 'Multiplication' ? '×' :
                                                     stats.careerStats.weakestLink === 'Division' ? '÷' :
                                                     stats.careerStats.weakestLink}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Recent Trend</div>
                                            <div className="h-16 flex items-end gap-1">
                                                {stats.careerStats.history.map((s: any, i: number) => (
                                                    <motion.div
                                                        key={i}
                                                        className="flex-1 bg-primary/20 rounded-t-sm relative group/bar hover:bg-primary transition-colors"
                                                        initial={{ height: 0 }}
                                                        animate={{ height: `${s.accuracy}%` }}
                                                        transition={{
                                                            duration: 0.8,
                                                            delay: 0.5 + i * 0.1,
                                                            ease: [0.34, 1.56, 0.64, 1]
                                                        }}
                                                    >
                                                        <div className="opacity-0 group-hover/bar:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none z-10">
                                                            {s.accuracy.toFixed(0)}%
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    </GlassCard>
                                </motion.div>
                            </Link>
                        </motion.div>
                    )
                }


                <motion.div variants={itemVariants}>
                    <GlassCard className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent Sessions</h3>
                            <History size={16} className="text-muted-foreground" />
                        </div>
                        <div className="space-y-3">
                            {stats?.recentSessions?.length > 0 ? (
                                stats.recentSessions.map((s: any, i: number) => (
                                    <motion.div
                                        key={i}
                                        className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.8 + i * 0.1 }}
                                    >
                                        <div className="text-sm font-bold">{s.operation}</div>
                                        <motion.div
                                            className="text-xs font-mono text-primary"
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 1 + i * 0.1, type: "spring" }}
                                        >
                                            +{s.xp_earned || 0} XP
                                        </motion.div>
                                    </motion.div>
                                ))
                            ) : (
                                <div className="text-xs text-muted-foreground italic py-4">No sessions logged yet.</div>
                            )}
                        </div>
                        <Link href="/practice" className="block text-center">
                            <button className="w-full text-[10px] uppercase font-bold tracking-widest text-primary hover:underline transition-all">Start New Practice</button>
                        </Link>
                    </GlassCard>
                </motion.div>
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
                <motion.div
                    className="group rounded-3xl border border-white/10 overflow-hidden bg-white/5 transition-all"
                    variants={itemVariants}
                >
                    <button
                        onClick={() => setIsOperationsOpen(!isOperationsOpen)}
                        className="w-full flex items-center justify-between p-8 text-2xl font-black uppercase tracking-tighter text-white hover:text-primary transition-colors"
                    >
                        <div className="flex items-center gap-6">
                            <motion.div
                                className="grid grid-cols-2 gap-1 p-2 bg-accent/10 rounded-lg"
                                animate={{ rotate: isOperationsOpen ? 0 : 180 }}
                                transition={{ duration: 0.3 }}
                            >
                                <span className="text-accent text-[10px] font-black leading-none">+</span>
                                <span className="text-accent text-[10px] font-black leading-none">×</span>
                                <span className="text-accent text-[10px] font-black leading-none">-</span>
                                <span className="text-accent text-[10px] font-black leading-none">÷</span>
                            </motion.div>
                            <span className="text-2xl font-black uppercase tracking-tighter">OPERATIONS</span>
                        </div>
                        <motion.div
                            animate={{ rotate: isOperationsOpen ? 90 : 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ChevronRight />
                        </motion.div>
                    </button>

                    <motion.div
                        initial={false}
                        animate={{
                            height: isOperationsOpen ? "auto" : 0,
                            opacity: isOperationsOpen ? 1 : 0
                        }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="p-8 pt-0">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(stats?.masteryMap || [
                                    { title: "Addition", progress: 0 },
                                    { title: "Subtraction", progress: 0 },
                                    { title: "Multiplication", progress: 0 },
                                    { title: "Division", progress: 0 }
                                ]).map((op: any, index: number) => (
                                    <motion.div
                                        key={op.title}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 + index * 0.1 }}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl border transition-all p-6 cursor-pointer group",
                                            selectedOp === op.title
                                                ? "bg-primary/20 border-primary/50 shadow-[0_0_30px_rgba(34,211,238,0.1)]"
                                                : "bg-black/20 border-white/5 hover:bg-white/5"
                                        )}
                                        onClick={() => setSelectedOp(selectedOp === op.title ? null : op.title)}
                                    >
                                        {(() => {
                                            const tierInfo = getTierDisplayInfo(op.tier || 1);
                                            return (
                                                <>
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm text-zinc-400 uppercase tracking-widest">{op.title}</span>
                                                            <span className={cn(
                                                                "text-xs font-black uppercase tracking-widest",
                                                                tierInfo.band.textColor
                                                            )}>
                                                                {tierInfo.band.shortName}{tierInfo.tierInBand}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <motion.span
                                                                className={cn(
                                                                    "text-3xl font-black truncate max-w-[80px]",
                                                                    selectedOp === op.title ? "text-primary" : "text-zinc-700"
                                                                )}
                                                                animate={{
                                                                    scale: selectedOp === op.title ? [1, 1.2, 1] : 1,
                                                                    rotate: selectedOp === op.title ? [0, 5, -5, 0] : 0
                                                                }}
                                                                transition={{ duration: 0.4 }}
                                                            >
                                                                {op.title === "Addition" ? "+" : op.title === "Subtraction" ? "-" : op.title === "Multiplication" ? "×" : "÷"}
                                                            </motion.span>
                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                                                                {tierInfo.band.name}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 mb-6">
                                                        <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                                                            <span>Tier Progress</span>
                                                            <motion.span
                                                                className={cn(selectedOp === op.title ? tierInfo.band.textColor : "")}
                                                                key={op.progress}
                                                                initial={{ scale: 1.5, opacity: 0 }}
                                                                animate={{ scale: 1, opacity: 1 }}
                                                            >
                                                                {op.progress}%
                                                            </motion.span>
                                                        </div>

                                                        <div className="h-2 w-full bg-zinc-800/50 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${op.progress}%` }}
                                                                transition={{
                                                                    duration: 1,
                                                                    delay: 0.3 + index * 0.15,
                                                                    ease: [0.34, 1.56, 0.64, 1]
                                                                }}
                                                                className={cn(
                                                                    "h-full transition-all",
                                                                    selectedOp === op.title
                                                                        ? `bg-gradient-to-r ${tierInfo.band.bgGradient} shadow-lg`
                                                                        : "bg-gradient-to-r from-zinc-600 to-zinc-500"
                                                                )}
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}

                                        {/* Action Area (Visible when selected) */}
                                        <motion.div
                                            initial={false}
                                            animate={{
                                                height: selectedOp === op.title ? "auto" : 0,
                                                opacity: selectedOp === op.title ? 1 : 0
                                            }}
                                            transition={{ duration: 0.3 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-2">
                                                <Link href={`/practice?op=${op.title}`}>
                                                    <NeonButton className="w-full py-4 text-lg font-bold">
                                                        START TRAINING
                                                    </NeonButton>
                                                </Link>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="mt-8 flex gap-4 justify-center">
                                {!stats?.hasPlaced && (
                                    <motion.button
                                        onClick={() => setShowPlacementTest(true)}
                                        className="px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-colors"
                                        animate={{
                                            boxShadow: [
                                                "0 0 0 0 rgba(34, 211, 238, 0)",
                                                "0 0 0 10px rgba(34, 211, 238, 0.1)",
                                                "0 0 0 0 rgba(34, 211, 238, 0)"
                                            ]
                                        }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    >
                                        Take Placement Test
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Coming Soon Sections */}
                <motion.div
                    className="grid grid-cols-2 gap-6 opacity-40"
                    variants={containerVariants}
                >
                    <motion.div
                        className="rounded-3xl border border-white/10 bg-white/5 p-8 flex items-center justify-between cursor-not-allowed"
                        variants={itemVariants}
                    >
                        <span className="font-bold text-muted-foreground uppercase tracking-widest">Percentage</span>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded">SOON</span>
                    </motion.div>
                    <motion.div
                        className="rounded-3xl border border-white/10 bg-white/5 p-8 flex items-center justify-between cursor-not-allowed"
                        variants={itemVariants}
                    >
                        <span className="font-bold text-muted-foreground uppercase tracking-widest">Decimals</span>
                        <span className="text-[10px] bg-white/10 px-2 py-1 rounded">SOON</span>
                    </motion.div>
                </motion.div>

            </div>

            {/* Detailed Operation Stats */}
        </motion.div >
    );
}
