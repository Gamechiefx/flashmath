'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PlayerBanner } from '@/components/arena/player-banner';
import { equipItem } from '@/lib/actions/shop';
import { cn } from '@/lib/utils';
import { ITEMS, RARITY_COLORS } from '@/lib/items';

interface BannerEditorClientProps {
    userName: string;
    level: number;
    rank: string;
    division: string;
    equippedTitle: string;
    equippedFrame: string;
    equippedBanner: string;
    ownedBannerIds: string[];
}

const BANNER_OPTIONS = [
    { id: 'default', name: 'Default', styleId: 'default' },
    { id: 'banner_caution', name: 'Caution High Math', styleId: 'caution' },
    { id: 'banner_matrices', name: 'System Override', styleId: 'matrices' },
    { id: 'banner_synthwave', name: 'Retro Pulse', styleId: 'synthwave' },
    { id: 'banner_royal', name: 'The King', styleId: 'royal' },
    { id: 'banner_legendary', name: 'Grand Champion', styleId: 'legendary' },
    { id: 'banner_plasma', name: 'Plasma Core', styleId: 'plasma' },
];

export function BannerEditorClient({
    userName,
    level,
    rank,
    division,
    equippedTitle,
    equippedFrame: _equippedFrame,
    equippedBanner,
    ownedBannerIds
}: BannerEditorClientProps) {
    const [selectedBanner, setSelectedBanner] = useState(() => {
        // Handle both Item IDs (new) and Style IDs (legacy/bugged)
        if (BANNER_OPTIONS.some(b => b.id === equippedBanner)) return equippedBanner;
        return BANNER_OPTIONS.find(b => b.styleId === equippedBanner)?.id || 'default';
    });
    const [isEquipping, setIsEquipping] = useState(false);

    const handleEquip = async (bannerId: string) => {
        if (bannerId === selectedBanner) return;

        setIsEquipping(true);
        setSelectedBanner(bannerId);

        // Pass the Item ID (e.g., 'banner_caution') not the styleId
        await equipItem('banner', bannerId);
        setIsEquipping(false);
    };

    const getItemRarity = (bannerId: string) => {
        const item = ITEMS.find(i => i.id === bannerId);
        return item?.rarity;
    };

    const isOwned = (bannerId: string) => {
        if (bannerId === 'default') return true;
        return ownedBannerIds.includes(bannerId);
    };

    const currentStyleId = BANNER_OPTIONS.find(b => b.id === selectedBanner)?.styleId ||
        (BANNER_OPTIONS.some(b => b.styleId === selectedBanner) ? selectedBanner : 'default');

    return (
        <div className="space-y-8">
            {/* Live Preview */}
            <div className="space-y-4">
                <h2 className="text-lg font-black uppercase tracking-widest text-white/40">
                    Live Preview
                </h2>
                <div className="flex justify-center p-8 rounded-2xl bg-black/20 border border-white/5">
                    <PlayerBanner
                        name={userName}
                        level={level}
                        rank={rank}
                        division={division}
                        styleId={currentStyleId}
                        title={equippedTitle}
                        className="max-w-lg"
                    />
                </div>
                <p className="text-center text-sm text-white/30">
                    This is how your banner appears to opponents in the Arena
                </p>
            </div>

            {/* Banner Selection Grid */}
            <div className="space-y-4">
                <h2 className="text-lg font-black uppercase tracking-widest text-white/40">
                    Select Background
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {BANNER_OPTIONS.map((banner) => {
                        const owned = isOwned(banner.id);
                        const rarity = getItemRarity(banner.id);
                        const isSelected = selectedBanner === banner.id;

                        return (
                            <motion.button
                                key={banner.id}
                                whileHover={owned ? { scale: 1.02 } : {}}
                                whileTap={owned ? { scale: 0.98 } : {}}
                                onClick={() => owned && handleEquip(banner.id)}
                                disabled={!owned || isEquipping}
                                className={cn(
                                    "relative p-4 rounded-xl border-2 transition-all text-left",
                                    isSelected
                                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                        : owned
                                            ? "border-white/10 hover:border-white/20 bg-white/5"
                                            : "border-white/5 bg-white/2 opacity-40 cursor-not-allowed",
                                    rarity && RARITY_COLORS[rarity]
                                )}
                            >
                                {/* Mini preview */}
                                <div className="h-12 rounded-lg overflow-hidden mb-3">
                                    <PlayerBanner
                                        name="Preview"
                                        level={1}
                                        rank="Silver"
                                        division="II"
                                        styleId={banner.styleId}
                                        title=""
                                        className="scale-50 origin-top-left w-[200%] h-[200%]"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <p className="font-black text-sm text-white truncate">
                                        {banner.name}
                                    </p>
                                    {!owned && (
                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                                            Not Owned
                                        </p>
                                    )}
                                    {isSelected && owned && (
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
                                            Equipped
                                        </p>
                                    )}
                                </div>

                                {/* Selected indicator */}
                                {isSelected && (
                                    <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-primary animate-pulse" />
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
