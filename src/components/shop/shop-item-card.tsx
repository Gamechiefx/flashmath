"use client";

import { Item, ItemType, RARITY_COLORS, ITEMS } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { Lock, Check } from "lucide-react";
import { PurchaseButton } from "./purchase-button";
import { useItemPreview } from "@/components/item-preview-provider";
import { soundEngine } from "@/lib/sound-engine";
import { useRef, useEffect } from "react"; // Added useRef

interface ShopItemCardProps {
    item: Item;
    isOwned: boolean;
    userCoins: number;
}

export function ShopItemCard({ item, isOwned, userCoins }: ShopItemCardProps) {
    // const item = ITEMS.find(i => i.id === itemId); // REMOVED static lookup
    const { setPreviewItem } = useItemPreview();
    const cardRef = useRef<HTMLDivElement>(null); // Ref for the card

    if (!item) return null;

    const Icon = item.icon || Lock;

    const handleMouseEnter = () => {
        // Calculate rect for particle origin
        const rect = cardRef.current?.getBoundingClientRect();
        setPreviewItem(item, rect);

        // Instant feedback for Sound Packs
        // ... (existing comments)
    };

    const handleMouseLeave = () => {
        setPreviewItem(null);
    };

    return (
        <div ref={cardRef}> {/* Wrapper div to ensure ref works reliably */}
            <GlassCard
                className={`p-6 relative overflow-hidden group border hover:border-white/20 transition-colors ${isOwned ? 'opacity-70' : ''}`}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Rarity Glow */}
                <div className={`absolute top-0 right-0 p-2 px-3 text-[10px] font-bold uppercase tracking-widest rounded-bl-xl border-l border-b ${RARITY_COLORS[item.rarity]}`}>
                    {item.rarity}
                </div>

                <div className="flex flex-col h-full justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-4 rounded-xl bg-white/5 border border-white/10 ${RARITY_COLORS[item.rarity].split(' ')[0]}`}>
                            <Icon size={32} />
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">{item.type}</div>
                            <h3 className="text-xl font-bold leading-tight mb-2">{item.name}</h3>
                            <p className="text-sm text-balance text-muted-foreground">{item.description}</p>
                        </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="text-lg font-bold text-white flex items-center gap-1">
                            {item.price.toLocaleString()} <span className="text-xs text-muted-foreground uppercase">Flux</span>
                        </div>

                        {isOwned ? (
                            <div className="px-4 py-2 rounded-lg bg-white/5 text-white/50 text-xs font-bold uppercase flex items-center gap-2">
                                <Check size={14} /> Owned
                            </div>
                        ) : (
                            <PurchaseButton itemId={item.id} price={item.price} userCoins={userCoins} />
                        )}
                    </div>
                </div>

                {/* Hover Hint */}
                <div className="absolute top-2 left-2 text-[10px] text-white/20 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Preview Active
                </div>
            </GlassCard>
        </div>
    );
}
