"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, Gift, Lock, Check, Coins, Star, Crown, Flame, Medal, Zap, Target, TrendingUp, ShoppingBag, Music, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserAchievements, claimAchievement, UserAchievement } from "@/lib/actions/achievements";
import type { AchievementCategory } from "@/lib/achievements";

interface AchievementsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

// Map icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
    Trophy, Star, Crown, Flame, Medal, Zap, Target, TrendingUp, ShoppingBag, Music, Coins
};

const getIcon = (iconName: string): LucideIcon => {
    return ICON_MAP[iconName] || Trophy;
};

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
    level: "Level Milestones",
    milestone: "Practice Milestones",
    mastery: "Operation Mastery",
    league: "League Achievements",
    wealth: "Wealth & Shopping",
    dedication: "Dedication"
};

const CATEGORY_ORDER: AchievementCategory[] = ['level', 'milestone', 'mastery', 'league', 'wealth', 'dedication'];

export function AchievementsPanel({ isOpen, onClose }: AchievementsPanelProps) {
    const [achievements, setAchievements] = useState<UserAchievement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [claiming, setClaiming] = useState<string | null>(null);
    const [claimResult, setClaimResult] = useState<{ id: string; coins?: number; title?: string } | null>(null);

    // Define loadAchievements before useEffect to avoid "accessed before declaration" error
    const loadAchievements = async () => {
        setIsLoading(true);
        const data = await getUserAchievements();
        setAchievements(data);
        setIsLoading(false);
    };

    useEffect(() => {
        if (isOpen) {
            // Defer to avoid setState in effect warning
            setTimeout(() => {
                loadAchievements();
            }, 0);
        }
    }, [isOpen]);

    const handleClaim = async (achievementId: string) => {
        setClaiming(achievementId);
        const result = await claimAchievement(achievementId);
        if (result.success) {
            setClaimResult({
                id: achievementId,
                coins: result.coinsAwarded,
                title: result.titleAwarded || undefined
            });
            // Refresh achievements
            await loadAchievements();
        }
        setClaiming(null);
    };

    if (!isOpen) return null;

    // Group by category
    const grouped = CATEGORY_ORDER.map(cat => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: achievements.filter(a => a.achievement.category === cat && !a.achievement.hidden)
    })).filter(g => g.items.length > 0);

    const unclaimedCount = achievements.filter(a => a.unlocked && !a.claimed).length;
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalVisible = achievements.filter(a => !a.achievement.hidden).length;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-background border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                                <Trophy className="text-accent" size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black uppercase tracking-tight">Achievements</h2>
                                <p className="text-xs text-muted-foreground">
                                    {unlockedCount}/{totalVisible} unlocked
                                    {unclaimedCount > 0 && (
                                        <span className="text-accent ml-2">• {unclaimedCount} to claim!</span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                        {isLoading ? (
                            <div className="text-center py-12 text-muted-foreground animate-pulse">
                                Loading achievements...
                            </div>
                        ) : (
                            grouped.map(group => (
                                <div key={group.category} className="space-y-3">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                                        {group.label}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {group.items.map(item => {
                                            const Icon = getIcon(item.achievement.iconName);
                                            const canClaim = item.unlocked && !item.claimed;
                                            const isClaiming = claiming === item.achievement.id;

                                            return (
                                                <div
                                                    key={item.achievement.id}
                                                    className={cn(
                                                        "p-4 rounded-xl border transition-all",
                                                        item.unlocked
                                                            ? item.claimed
                                                                ? "bg-white/5 border-white/10"
                                                                : "bg-accent/10 border-accent/30 shadow-[0_0_15px_rgba(250,204,21,0.1)]"
                                                            : "bg-black/20 border-white/5 opacity-60"
                                                    )}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className={cn(
                                                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                                            item.unlocked
                                                                ? item.claimed
                                                                    ? "bg-green-500/20 text-green-400"
                                                                    : "bg-accent/20 text-accent"
                                                                : "bg-white/5 text-muted-foreground"
                                                        )}>
                                                            {item.unlocked ? (
                                                                item.claimed ? <Check size={20} /> : <Icon size={20} />
                                                            ) : (
                                                                <Lock size={16} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-sm truncate">
                                                                {item.achievement.name}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground line-clamp-2">
                                                                {item.achievement.description}
                                                            </div>

                                                            {/* Reward */}
                                                            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest">
                                                                {item.achievement.reward.coins && (
                                                                    <span className="flex items-center gap-1 text-yellow-400">
                                                                        <Coins size={10} />
                                                                        {item.achievement.reward.coins.toLocaleString()}
                                                                    </span>
                                                                )}
                                                                {item.achievement.reward.titleName && (
                                                                    <span className="text-accent">
                                                                        Title: {item.achievement.reward.titleName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Claim Button */}
                                                        {canClaim && (
                                                            <button
                                                                onClick={() => handleClaim(item.achievement.id)}
                                                                disabled={isClaiming}
                                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-bold uppercase tracking-wider hover:bg-accent/80 transition-colors disabled:opacity-50"
                                                            >
                                                                {isClaiming ? "..." : "Claim"}
                                                            </button>
                                                        )}
                                                        {item.claimed && (
                                                            <span className="text-[10px] text-green-400 font-bold uppercase">
                                                                Claimed
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Claim Result Toast */}
                    <AnimatePresence>
                        {claimResult && (
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-accent text-black px-6 py-3 rounded-xl shadow-xl flex items-center gap-3"
                            >
                                <Gift size={20} />
                                <span className="font-bold">
                                    {claimResult.coins && `+${claimResult.coins.toLocaleString()} Coins`}
                                    {claimResult.title && ` • Title: ${claimResult.title}`}
                                </span>
                                <button
                                    onClick={() => setClaimResult(null)}
                                    className="ml-2 hover:bg-black/10 rounded p-1"
                                >
                                    <X size={16} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
