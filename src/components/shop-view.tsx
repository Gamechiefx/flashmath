"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ShoppingBag, Coins, CheckCircle2, Lock } from "lucide-react";
import { purchaseItem } from "@/lib/actions/shop";
import { cn } from "@/lib/utils";

interface ShopViewProps {
    data: any;
}

export function ShopView({ data }: ShopViewProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const handlePurchase = async (itemId: string) => {
        setLoading(itemId);
        setMessage(null);
        const result = await purchaseItem(itemId);
        if (result.error) {
            setMessage({ text: result.error, type: 'error' });
        } else {
            setMessage({ text: "UPGRADE ACQUIRED!", type: 'success' });
        }
        setLoading(null);
    };

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/10 pb-8">
                <div>
                    <div className="flex items-center gap-3 text-accent mb-2">
                        <ShoppingBag size={20} />
                        <span className="text-xs font-bold uppercase tracking-widest">Neural Upgrades</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter uppercase">The Exchange</h1>
                </div>

                <GlassCard className="py-3 px-6 flex items-center gap-3 border-yellow-400/20">
                    <Coins size={18} className="text-yellow-400" />
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Available Credits</div>
                        <div className="text-xl font-mono font-bold tabular-nums text-yellow-400">§ {data.coins}</div>
                    </div>
                </GlassCard>
            </div>

            {message && (
                <div className={cn(
                    "p-4 rounded-xl text-xs font-bold text-center uppercase tracking-widest animate-in fade-in slide-in-from-top-2",
                    message.type === 'error' ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-green-500/10 text-green-400 border border-green-500/20"
                )}>
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {data.items.map((item: any) => {
                    const isOwned = data.inventory.includes(item.id);
                    const canAfford = data.coins >= item.cost;

                    return (
                        <GlassCard
                            key={item.id}
                            className={cn(
                                "flex flex-col h-full transition-all group overflow-hidden cursor-pointer hover:scale-[1.02] hover:shadow-xl",
                                isOwned && "border-green-500/40 opacity-90"
                            )}
                        >
                            <div className="p-8 flex-1">
                                <div className={cn(
                                    "w-12 h-12 rounded-2xl mb-6 flex items-center justify-center transition-transform group-hover:scale-110",
                                    item.id.includes('cyan') ? "bg-cyan-500/20 text-cyan-400" :
                                        item.id.includes('pink') ? "bg-pink-500/20 text-pink-400" :
                                            item.id.includes('gold') ? "bg-yellow-500/20 text-yellow-400" : "bg-accent/20 text-accent"
                                )}>
                                    <ShoppingBag size={24} />
                                </div>
                                <h3 className="text-xl font-black mb-2 tracking-tight uppercase">{item.name}</h3>
                                <p className="text-xs text-muted-foreground font-medium mb-6">{item.description}</p>
                            </div>

                            <div className="p-6 bg-white/5 border-t border-white/5 mt-auto">
                                <div className="flex items-center justify-between gap-6">
                                    <div>
                                        <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Price</div>
                                        <div className="text-xl font-mono font-bold text-yellow-400">§ {item.cost.toLocaleString()}</div>
                                    </div>

                                    {isOwned ? (
                                        <div className="flex items-center gap-2 text-green-400 text-[10px] font-black uppercase tracking-widest">
                                            <CheckCircle2 size={16} />
                                            Acquired
                                        </div>
                                    ) : canAfford ? (
                                        <NeonButton
                                            variant="primary"
                                            disabled={loading === item.id}
                                            onClick={() => handlePurchase(item.id)}
                                            className="px-6 py-2 text-[10px]"
                                        >
                                            {loading === item.id ? "SYNCING..." : "PURCHASE"}
                                        </NeonButton>
                                    ) : (
                                        <div className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-white/20 text-[10px] font-bold flex items-center gap-2">
                                            <Lock size={12} />
                                            LOCKED
                                        </div>
                                    )}
                                </div>
                            </div>
                        </GlassCard>
                    );
                })}
            </div>
        </div>
    );
}
