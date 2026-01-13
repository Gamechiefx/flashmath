import { auth } from "@/auth";
import { queryOne, loadData } from "@/lib/db";
import { Item, ITEMS, ItemType } from "@/lib/items";
import { NeonButton } from "@/components/ui/neon-button";
import { Archive } from "lucide-react";
import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";
import { CompactLockerView } from "@/components/locker/compact-locker-view";
import { unstable_noStore as noStore } from 'next/cache';

export default async function LockerPage() {
    noStore(); // Prevent caching - always fetch fresh data

    const session = await auth();
    if (!session?.user) return <div>Please log in</div>;
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const db = loadData();
    const shopItems = db.shop_items as Item[];
    const inventory = (db.inventory as any[]).filter((i: any) => i.user_id === userId);

    // Merge DB shop_items with static ITEMS (ITEMS takes precedence for missing items)
    const allItemsMap = new Map<string, Item>();
    ITEMS.forEach(item => allItemsMap.set(item.id, item));
    shopItems?.forEach(item => allItemsMap.set(item.id, item));
    const allItems = Array.from(allItemsMap.values());

    const ownedItems = allItems.filter(item =>
        inventory.some((inv: any) => inv.item_id === item.id)
    );

    const equipped = user.equipped_items || {};

    // Count total owned
    const totalOwned = ownedItems.length;

    return (
        <div className="min-h-screen bg-background text-foreground relative">
            {/* Auth Header - Full Width */}
            <AuthHeader session={session} />

            <div className="p-6 md:p-12">
                {/* Compact Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 rounded-xl">
                            <Archive size={24} className="text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-tight text-primary">
                                Locker
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {totalOwned} items • Click to equip
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Link href="/locker/banner">
                            <NeonButton variant="primary" className="text-sm">Customize Banner</NeonButton>
                        </Link>
                        <Link href="/shop">
                            <NeonButton variant="accent" className="text-sm">Visit Shop</NeonButton>
                        </Link>
                    </div>
                </div>

                {/* Compact Locker View */}
                <CompactLockerView ownedItems={ownedItems} equipped={equipped} />
            </div>

            {/* Spacer for fixed footer */}
            <div className="h-24" />

            {/* Compact Nav Footer */}
            <div className="fixed bottom-0 left-0 w-full p-3 bg-background/80 backdrop-blur-md border-t border-white/10 flex justify-center z-50">
                <div className="flex gap-3">
                    <Link href="/dashboard">
                        <NeonButton variant="secondary" className="text-sm">Dashboard</NeonButton>
                    </Link>
                    <Link href="/shop">
                        <NeonButton variant="accent" className="text-sm">Shop</NeonButton>
                    </Link>
                </div>
            </div>
        </div>
    );
}
