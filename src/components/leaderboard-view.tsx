"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { motion } from "framer-motion";
import { Trophy, Timer, ChevronUp, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

interface LeaderboardViewProps {
    data: any;
}

export function LeaderboardView({ data }: LeaderboardViewProps) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(data.endTime).getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft("RESETTING...");
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            setTimeLeft(`${days}d ${hours}h ${mins}m`);
        }, 1000);

        return () => clearInterval(timer);
    }, [data.endTime]);

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
                <div>
                    <div className="flex items-center gap-3 text-primary mb-2">
                        <Trophy size={20} />
                        <span className="text-xs font-bold uppercase tracking-widest">{data.leagueName} LEAGUE</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter uppercase">Circuit Standings</h1>
                </div>

                <GlassCard className="py-3 px-6 flex items-center gap-3 border-primary/20">
                    <Timer size={18} className="text-primary" />
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ends in</div>
                        <div className="text-xl font-mono font-bold tabular-nums text-primary">{timeLeft}</div>
                    </div>
                </GlassCard>
            </div>

            <div className="space-y-3">
                {data.participants.map((p: any, i: number) => {
                    const rank = i + 1;
                    const isPromotion = rank <= 3;
                    const isDemotion = rank > data.participants.length - 2 && data.participants.length > 2;
                    const isUser = p.user_id === data.userId;

                    return (
                        <motion.div
                            key={p.user_id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <GlassCard
                                className={cn(
                                    "p-4 flex items-center justify-between transition-all",
                                    isUser && "border-primary bg-primary/5 shadow-[0_0_20px_rgba(34,211,238,0.1)]",
                                    !isUser && "hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-6">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black",
                                        rank === 1 ? "bg-yellow-400 text-black" :
                                            rank === 2 ? "bg-gray-300 text-black" :
                                                rank === 3 ? "bg-amber-600 text-white" : "bg-white/5 text-muted-foreground"
                                    )}>
                                        {rank}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <UserAvatar
                                            user={{
                                                name: p.name,
                                                equipped_items: { frame: p.equippedFrame }
                                            }}
                                            size="sm"
                                            className="w-10 h-10"
                                        />
                                        <div>
                                            <div className={cn("text-sm font-bold uppercase tracking-tight", isUser && "text-primary")}>
                                                {p.name} {isUser && "(YOU)"}
                                            </div>
                                            {p.titleName && (
                                                <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                                    {p.titleName}
                                                </div>
                                            )}
                                            {isPromotion && <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest flex items-center gap-1"><ChevronUp size={10} /> Promotion Zone</div>}
                                            {isDemotion && <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1"><ChevronDown size={10} /> Risk of Demotion</div>}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-lg font-mono font-bold tracking-tighter text-foreground">{p.weekly_xp}</div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Weekly XP</div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    );
                })}
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 text-center">
                <p className="text-sm font-medium text-primary">
                    <Trophy size={16} className="inline mr-2 -translate-y-0.5" />
                    Finish in the **Top 3** to advance to the next league and earn **250 Flux Coins**!
                </p>
            </div>
        </div>
    );
}
