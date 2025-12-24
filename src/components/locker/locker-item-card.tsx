"use client";

import { Item, ItemType, RARITY_COLORS, ITEMS } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { Shield } from "lucide-react";
import { EquipButton } from "./equip-button";
import { useItemPreview } from "@/components/item-preview-provider";

interface LockerItemCardProps {
    item: Item;
    isEquipped: boolean;
    type: string;
}

export function LockerItemCard({ item, isEquipped, type }: LockerItemCardProps) {
    // const item = ITEMS.find(i => i.id === itemId); // REMOVED static lookup
    const { setPreviewItem } = useItemPreview();

    if (!item) return null;

    const Icon = item.icon || Shield;

    const handleMouseEnter = (e: React.MouseEvent) => {
        setPreviewItem(item, e.currentTarget.getBoundingClientRect());
    };

    const handleMouseLeave = () => {
        setPreviewItem(null);
    };

    // Font Preview Style
    const nameStyle = item.type === ItemType.FONT
        ? { fontFamily: item.assetValue }
        : {};

    return (
        <GlassCard
            className={`p-3 relative group hover:border-white/20 transition-colors ${isEquipped ? 'border-accent shadow-[0_0_20px_rgba(34,211,238,0.2)]' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className={`absolute top-0 right-0 p-1 px-2 text-[8px] font-bold uppercase tracking-widest rounded-bl-lg border-l border-b ${RARITY_COLORS[item.rarity]}`}>
                {item.rarity}
            </div>

            <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-lg bg-white/5 ${RARITY_COLORS[item.rarity].split(' ')[0]}`}>
                    <Icon size={20} />
                </div>
                <div>
                    <div className="text-sm font-bold leading-tight" style={nameStyle}>{item.name}</div>
                </div>
            </div>

            <div className="mt-2">
                <EquipButton type={type} itemId={item.id} isEquipped={isEquipped} />
            </div>
        </GlassCard>
    );
}
