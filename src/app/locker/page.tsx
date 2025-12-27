
import { auth } from "@/auth";
import { queryOne, loadData } from "@/lib/db";
import { Item, ITEMS, ItemType, RARITY_COLORS } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Archive, Check, Lock, Shield } from "lucide-react";
import Link from "next/link";
import { EquipButton } from "@/components/locker/equip-button";
import { LockerItemCard } from "@/components/locker/locker-item-card";
import { AuthHeader } from "@/components/auth-header";

export default async function LockerPage() {
    const session = await auth();
    if (!session?.user) return <div>Please log in</div>;
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const db = loadData();
    const shopItems = db.shop_items as Item[];
    const inventory = (db.inventory as any[]).filter((i: any) => i.user_id === userId);

    // Merge DB shop_items with static ITEMS (ITEMS takes precedence for missing items)
    // This ensures achievement titles from ITEMS are available even if not in DB yet
    const allItemsMap = new Map<string, Item>();
    ITEMS.forEach(item => allItemsMap.set(item.id, item));
    shopItems?.forEach(item => allItemsMap.set(item.id, item));
    const allItems = Array.from(allItemsMap.values());

    const ownedItems = allItems.filter(item =>
        inventory.some((inv: any) => inv.item_id === item.id)
    );

    const equipped = user.equipped_items || {};

    // Group by category
    const categories = [ItemType.THEME, ItemType.PARTICLE, ItemType.FONT, ItemType.SOUND, ItemType.BGM, ItemType.TITLE, ItemType.FRAME];

    return (
        <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative">
            {/* Auth Header */}
            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader session={session} />
            </div>

            <div className="max-w-6xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
                            <Archive size={14} />
                            Locker
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-primary">
                            Locker
                        </h1>
                        <p className="text-muted-foreground mt-2 max-w-lg">
                            Manage your equipped tech and customization modules.
                        </p>
                    </div>

                    <Link href="/shop">
                        <NeonButton variant="accent">Visit Shop</NeonButton>
                    </Link>
                </div>

                <div className="space-y-12">
                    {categories.map(cat => {
                        const itemsInCat = ownedItems.filter(i => i.type === cat);
                        if (itemsInCat.length === 0) return null;

                        // Sort: Common -> Legendary
                        const rarityOrder = {
                            'common': 1,
                            'uncommon': 2,
                            'rare': 3,
                            'epic': 4,
                            'legendary': 5
                        } as Record<string, number>;

                        itemsInCat.sort((a, b) => (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0));

                        return (
                            <div key={cat} className="space-y-4">
                                <h3 className="text-xl font-bold uppercase tracking-wider text-white border-b border-white/10 pb-2">
                                    {cat}s
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">


                                    {itemsInCat.map(item => {
                                        const isEquipped = equipped[cat] === item.id;
                                        return (
                                            <LockerItemCard
                                                key={item.id}
                                                item={item}
                                                isEquipped={isEquipped}
                                                type={cat}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {ownedItems.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground">
                            <div className="mb-4 opacity-50"><Lock size={48} className="mx-auto" /></div>
                            No items acquired. Visit the shop to purchase gear.
                        </div>
                    )}
                </div>
            </div>

            {/* Spacer for fixed footer */}
            <div className="h-48" />

            {/* Nav Footer */}
            <div className="fixed bottom-0 left-0 w-full p-4 bg-background/80 backdrop-blur-md border-t border-white/10 flex justify-center z-50">
                <div className="flex gap-4">
                    <Link href="/dashboard">
                        <NeonButton variant="accent">Dashboard</NeonButton>
                    </Link>
                    <Link href="/shop">
                        <NeonButton variant="accent">Go to Shop</NeonButton>
                    </Link>
                </div>
            </div>
        </div >
    );
}
