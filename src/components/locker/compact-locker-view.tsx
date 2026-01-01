"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Item, ItemType, RARITY_COLORS, Rarity } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { Shield, ChevronDown, Check, X, Sparkles } from "lucide-react";
import { equipItem } from "@/lib/actions/shop";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useItemPreview } from "@/components/item-preview-provider";
import { cn } from "@/lib/utils";

interface CompactLockerItemProps {
    item: Item;
    isEquipped: boolean;
    type: string;
    onEquip: (itemId: string, type: string) => void;
    isLoading: boolean;
    index?: number;
}

function CompactLockerItem({ item, isEquipped, type, onEquip, isLoading, index = 0 }: CompactLockerItemProps) {
    const { setPreviewItem } = useItemPreview();
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

    const rarityBg = {
        common: "bg-zinc-600/20 border-zinc-500/30",
        uncommon: "bg-green-600/20 border-green-500/30",
        rare: "bg-blue-600/20 border-blue-500/30",
        epic: "bg-purple-600/20 border-purple-500/30",
        legendary: "bg-amber-600/20 border-amber-500/30",
    }[item.rarity] || "bg-zinc-600/20 border-zinc-500/30";

    const rarityGlow = {
        common: "",
        uncommon: "hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]",
        rare: "hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]",
        epic: "hover:shadow-[0_0_15px_rgba(147,51,234,0.2)]",
        legendary: "hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]",
    }[item.rarity] || "";

    return (
        <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
                duration: 0.3,
                delay: index * 0.03,
                ease: "easeOut"
            }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => !isLoading && onEquip(item.id, type)}
            disabled={isLoading}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
                "relative p-2 rounded-lg border transition-all text-left w-full group",
                rarityBg, rarityGlow,
                isEquipped
                    ? "border-accent shadow-[0_0_20px_rgba(34,211,238,0.3)] ring-1 ring-accent/50 hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                    : "hover:bg-white/5 cursor-pointer",
                isLoading && "opacity-50 cursor-wait"
            )}
        >
            {/* Legendary sparkle effect */}
            {item.rarity === Rarity.LEGENDARY && (
                <div className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 animate-banner-shimmer" />
                </div>
            )}

            {/* Equipped checkmark */}
            <AnimatePresence>
                {isEquipped && (
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-accent group-hover:bg-red-500 rounded-full flex items-center justify-center shadow-lg transition-colors z-10"
                    >
                        <Check size={12} className="text-black" strokeWidth={3} />
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center gap-2 relative z-10">
                <motion.div
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                        "p-1.5 rounded-md bg-black/20",
                        RARITY_COLORS[item.rarity].split(' ')[0]
                    )}
                >
                    <Icon size={16} />
                    {item.rarity === Rarity.LEGENDARY && (
                        <Sparkles size={8} className="absolute -top-0.5 -right-0.5 text-amber-400 animate-pulse" />
                    )}
                </motion.div>
                <div className="flex-1 min-w-0">
                    <div
                        className="text-xs font-medium truncate"
                        style={nameStyle}
                    >
                        {item.name}
                    </div>
                </div>
            </div>
        </motion.button>
    );
}

interface LockerAccordionProps {
    category: string;
    items: Item[];
    equipped: Record<string, string>;
    onEquip: (itemId: string, type: string) => void;
    loadingItem: string | null;
    defaultOpen?: boolean;
}

function LockerAccordion({ category, items, equipped, onEquip, loadingItem, defaultOpen = false }: LockerAccordionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const equippedItem = items.find(i => equipped[category] === i.id);

    // Sort: Common -> Legendary
    const rarityOrder = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 } as Record<string, number>;
    const sortedItems = [...items].sort((a, b) => (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0));

    const categoryLabels: Record<string, string> = {
        [ItemType.THEME]: "Themes",
        [ItemType.PARTICLE]: "Particles",
        [ItemType.FONT]: "Fonts",
        [ItemType.SOUND]: "Sounds",
        [ItemType.BGM]: "Music",
        [ItemType.TITLE]: "Titles",
        [ItemType.FRAME]: "Frames",
    };

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden">
            <div className="w-full p-4 flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-3 flex-1"
                >
                    <span className="text-sm font-bold uppercase tracking-wider text-white">
                        {categoryLabels[category] || category}
                    </span>
                    <span className="text-xs text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">
                        {items.length} owned
                    </span>
                    {equippedItem && (
                        <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check size={10} />
                            {equippedItem.name}
                        </span>
                    )}
                </button>
                <div className="flex items-center gap-2">
                    {/* Unequip X button - only show if something is equipped */}
                    {equippedItem && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEquip('default', category);
                            }}
                            disabled={loadingItem === 'default'}
                            className="w-6 h-6 rounded border transition-all bg-red-600/20 border-red-500/30 hover:bg-red-600/40 hover:border-red-500/50 flex items-center justify-center"
                            title="Unequip"
                        >
                            <X size={12} className="text-red-400" />
                        </button>
                    )}
                    <button onClick={() => setIsOpen(!isOpen)}>
                        <ChevronDown
                            size={18}
                            className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 bg-black/20">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                                {sortedItems.map((item, index) => (
                                    <CompactLockerItem
                                        key={item.id}
                                        item={item}
                                        isEquipped={equipped[category] === item.id}
                                        type={category}
                                        onEquip={onEquip}
                                        isLoading={loadingItem === item.id}
                                        index={index}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

interface CompactLockerViewProps {
    ownedItems: Item[];
    equipped: Record<string, string>;
}

export function CompactLockerView({ ownedItems, equipped }: CompactLockerViewProps) {
    const router = useRouter();
    const { update: updateSession } = useSession();
    const [loadingItem, setLoadingItem] = useState<string | null>(null);

    const handleEquip = async (itemId: string, type: string) => {
        setLoadingItem(itemId);
        await equipItem(type, itemId);
        await updateSession(); // Refresh session to update header avatar
        router.refresh();
        setLoadingItem(null);
    };

    const categories = [
        ItemType.TITLE,
        ItemType.FRAME,
        ItemType.THEME,
        ItemType.PARTICLE,
        ItemType.FONT,
        ItemType.SOUND,
        ItemType.BGM,
    ];

    const categorizedItems = categories.map(cat => ({
        category: cat,
        items: ownedItems.filter(i => i.type === cat),
    })).filter(c => c.items.length > 0);

    if (categorizedItems.length === 0) {
        return (
            <GlassCard className="p-8 text-center">
                <p className="text-muted-foreground">No items in your locker yet.</p>
                <p className="text-sm text-muted-foreground mt-2">Visit the shop to get started!</p>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-3">
            {categorizedItems.map((c, index) => (
                <LockerAccordion
                    key={c.category}
                    category={c.category}
                    items={c.items}
                    equipped={equipped}
                    onEquip={handleEquip}
                    loadingItem={loadingItem}
                    defaultOpen={index === 0} // First category open by default
                />
            ))}
        </div>
    );
}
