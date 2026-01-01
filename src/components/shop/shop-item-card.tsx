"use client";

import { motion } from "framer-motion";
import { Item, ItemType, RARITY_COLORS, Rarity } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { Lock, Check, Sparkles, Flag } from "lucide-react";
import { PurchaseButton } from "./purchase-button";
import { useItemPreview } from "@/components/item-preview-provider";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface ShopItemCardProps {
    item: Item;
    isOwned: boolean;
    userCoins: number;
    index?: number;
}

const RARITY_GLOW = {
    [Rarity.COMMON]: "shadow-slate-500/10",
    [Rarity.UNCOMMON]: "shadow-green-500/20",
    [Rarity.RARE]: "shadow-blue-500/30",
    [Rarity.EPIC]: "shadow-purple-500/40",
    [Rarity.LEGENDARY]: "shadow-amber-500/50",
};

const RARITY_BORDER_GLOW = {
    [Rarity.COMMON]: "hover:border-slate-400/30",
    [Rarity.UNCOMMON]: "hover:border-green-400/40",
    [Rarity.RARE]: "hover:border-blue-400/50",
    [Rarity.EPIC]: "hover:border-purple-400/60",
    [Rarity.LEGENDARY]: "hover:border-amber-400/70",
};

export function ShopItemCard({ item, isOwned, userCoins, index = 0 }: ShopItemCardProps) {
    const { setPreviewItem } = useItemPreview();
    const cardRef = useRef<HTMLDivElement>(null);

    if (!item) return null;

    const Icon = item.icon || Lock;
    const isBanner = item.type === ItemType.BANNER;

    const handleMouseEnter = () => {
        const rect = cardRef.current?.getBoundingClientRect();
        setPreviewItem(item, rect);
    };

    const handleMouseLeave = () => {
        setPreviewItem(null);
    };

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                duration: 0.4,
                delay: index * 0.08,
                ease: [0.25, 0.46, 0.45, 0.94]
            }}
            whileHover={{
                y: -8,
                scale: 1.02,
                transition: { duration: 0.2 }
            }}
            whileTap={{ scale: 0.98 }}
            className="relative"
        >
            <GlassCard
                className={cn(
                    "p-6 relative overflow-hidden group border transition-all duration-300",
                    "hover:shadow-2xl",
                    RARITY_GLOW[item.rarity],
                    RARITY_BORDER_GLOW[item.rarity],
                    isOwned && "opacity-60 grayscale-[0.3]"
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Animated Background Gradient */}
                <motion.div
                    className={cn(
                        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                        item.rarity === Rarity.LEGENDARY && "bg-gradient-to-br from-amber-500/10 via-transparent to-yellow-500/10",
                        item.rarity === Rarity.EPIC && "bg-gradient-to-br from-purple-500/10 via-transparent to-fuchsia-500/10",
                        item.rarity === Rarity.RARE && "bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-500/10",
                    )}
                />

                {/* Shine Sweep on Hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

                {/* Rarity Badge */}
                <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.08 + 0.2 }}
                    className={cn(
                        "absolute top-0 right-0 p-2 px-3 text-[10px] font-black uppercase tracking-widest rounded-bl-xl border-l border-b",
                        RARITY_COLORS[item.rarity]
                    )}
                >
                    {item.rarity === Rarity.LEGENDARY && <Sparkles size={10} className="inline mr-1 animate-pulse" />}
                    {item.rarity}
                </motion.div>

                {/* Type Badge for Banners */}
                {isBanner && (
                    <div className="absolute top-3 left-3">
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 border border-primary/30 text-[9px] font-black text-primary uppercase tracking-wider">
                            <Flag size={10} />
                            Arena Banner
                        </div>
                    </div>
                )}

                <div className="flex flex-col h-full justify-between gap-6 relative z-10">
                    <div className="flex items-start gap-4">
                        <motion.div
                            whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
                            transition={{ duration: 0.3 }}
                            className={cn(
                                "p-4 rounded-xl bg-white/5 border border-white/10",
                                RARITY_COLORS[item.rarity].split(' ')[0]
                            )}
                        >
                            <Icon size={32} />
                        </motion.div>
                        <div className={isBanner ? "mt-6" : ""}>
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                                {item.type}
                            </div>
                            <h3 className="text-xl font-bold leading-tight mb-2">{item.name}</h3>
                            <p className="text-sm text-balance text-muted-foreground">{item.description}</p>
                        </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                        <motion.div
                            className="text-lg font-bold text-white flex items-center gap-1"
                            whileHover={{ scale: 1.05 }}
                        >
                            {item.price.toLocaleString()}
                            <span className="text-xs text-muted-foreground uppercase">Flux</span>
                        </motion.div>

                        {isOwned ? (
                            <div className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase flex items-center gap-2">
                                <Check size={14} /> Owned
                            </div>
                        ) : (
                            <PurchaseButton itemId={item.id} price={item.price} userCoins={userCoins} />
                        )}
                    </div>
                </div>

                {/* Preview Hint */}
                <div className="absolute bottom-2 left-2 text-[9px] text-white/20 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Preview Active
                </div>
            </GlassCard>
        </motion.div>
    );
}
