import { auth } from "@/auth";
import { queryOne, loadData } from "@/lib/db";
import { getDailyShopSelection } from "@/lib/shop-engine";
import { ITEMS, RARITY_COLORS, Rarity, ItemType } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ShoppingBag, Coins, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ShopItemCard } from "@/components/shop/shop-item-card";
import { ShopTimer } from "@/components/shop/shop-timer";
import { AuthHeader } from "@/components/auth-header";
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Category display config
const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
    [ItemType.BANNER]: { label: 'Arena Banner', icon: '🏴' },
    [ItemType.THEME]: { label: 'Theme', icon: '🎨' },
    [ItemType.PARTICLE]: { label: 'Particle', icon: '✨' },
    [ItemType.FONT]: { label: 'Font', icon: '🔤' },
    [ItemType.SOUND]: { label: 'Sound', icon: '🔊' },
    [ItemType.BGM]: { label: 'Music', icon: '🎵' },
    [ItemType.TITLE]: { label: 'Title', icon: '🏷️' },
    [ItemType.FRAME]: { label: 'Frame', icon: '🖼️' },
};

/**
 * Render the Daily Shop page for the current authenticated user.
 *
 * Displays the user's balance, a countdown timer, and the day's selectable items grouped by category.
 *
 * @returns The page's React element: the full daily shop UI showing balance, timer, and daily items for the authenticated user; if no session exists, a login prompt; if the user record is missing, an account-not-found UI with a sign-out action.
 */
export default async function ShopPage() {
    noStore(); // Prevent caching - always fetch fresh data

    const session = await auth();
    if (!session?.user) return <div>Please log in</div>;
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold">Account Not Found</h1>
                    <p className="text-muted-foreground">Your user record seems to be missing.</p>
                    <Link href="/auth/signout">
                        <NeonButton variant="primary">Sign Out</NeonButton>
                    </Link>
                </div>
            </div>
        );
    }

    const inventory = loadData().inventory.filter(i => i.user_id === userId).map(i => i.item_id);

    // Get daily selection and strip icons for serialization
    const dailySelection = getDailyShopSelection().map(({ icon, ...rest }) => rest);

    return (
        <div className="min-h-screen bg-background text-foreground relative">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-20%] w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px]" />
            </div>

            {/* Auth Header - Full Width */}
            <AuthHeader session={session} />

            <div className="p-6 md:p-12">
                <div className="max-w-6xl mx-auto relative z-10 space-y-8">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
                                <ShoppingBag size={14} />
                                Daily Shop
                            </div>
                            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-primary">
                                Today's Picks
                            </h1>
                            <p className="text-muted-foreground mt-2 max-w-lg">
                                Fresh items every day. Don't miss out!
                            </p>
                        </div>

                        <GlassCard className="p-4 px-6 flex items-center gap-4 bg-primary/10 border-primary/20">
                            <div className="flex flex-col items-end">
                                <span className="text-xs font-bold uppercase tracking-widest text-primary/70">Balance</span>
                                <span className="text-2xl font-black text-primary flex items-center gap-2">
                                    <Coins size={20} />
                                    {user.coins.toLocaleString()}
                                </span>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Timer Banner */}
                    <div className="w-full p-4 rounded-xl bg-gradient-to-r from-primary/5 via-white/5 to-accent/5 border border-white/10 flex justify-center items-center gap-3">
                        <RefreshCw size={16} className="text-primary animate-spin" style={{ animationDuration: '3s' }} />
                        <span className="text-sm font-bold uppercase tracking-widest text-white/60">
                            New items in: <span className="text-primary"><ShopTimer /></span>
                        </span>
                    </div>

                    {/* Daily Items Grid - Organized by Category */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                        {dailySelection.map((item, index) => {
                            const isOwned = inventory.includes(item.id);
                            const config = CATEGORY_CONFIG[item.type];
                            return (
                                <div key={item.id} className="flex flex-col">
                                    {/* Category Tag */}
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/40 mb-2 h-5">
                                        <span>{config?.icon}</span>
                                        <span>{config?.label}</span>
                                    </div>
                                    <div className="flex-1">
                                        <ShopItemCard
                                            item={item}
                                            isOwned={isOwned}
                                            userCoins={user.coins}
                                            index={index}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Spacer for fixed footer */}
                <div className="h-24" />

                {/* Nav Footer */}
                <div className="fixed bottom-0 left-0 w-full p-4 bg-background/80 backdrop-blur-md border-t border-white/10 flex justify-center z-50">
                    <div className="flex gap-4">
                        <Link href="/dashboard">
                            <NeonButton variant="secondary">Dashboard</NeonButton>
                        </Link>
                        <Link href="/locker">
                            <NeonButton variant="accent">Open Locker</NeonButton>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}