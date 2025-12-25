
import { auth } from "@/auth";
import { queryOne, loadData } from "@/lib/db";
import { getDailyShopSelection } from "@/lib/shop-engine";
import { ITEMS, RARITY_COLORS, Rarity } from "@/lib/items";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { ShoppingBag, Coins, RefreshCw, Lock, Check } from "lucide-react";
import Link from "next/link";
import { PurchaseButton } from "@/components/shop/purchase-button";
import { ShopTimer } from "@/components/shop/shop-timer";
import { ShopItemCard } from "@/components/shop/shop-item-card";
import { AuthHeader } from "@/components/auth-header";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ShopPage() {
    const session = await auth();
    if (!session?.user) return <div>Please log in</div>;
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold">Account Not Found</h1>
                    <p className="text-muted-foreground">Your user record seems to be missing. Please sign out and create a new account.</p>
                    <Link href="/api/auth/signout">
                        <NeonButton variant="primary">Sign Out</NeonButton>
                    </Link>
                </div>
            </div>
        );
    }
    const inventory = loadData().inventory.filter(i => i.user_id === userId).map(i => i.item_id);

    const dailySelection = getDailyShopSelection();

    return (
        <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-20%] w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader session={session} />
            </div>

            <div className="max-w-6xl mx-auto relative z-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
                            <ShoppingBag size={14} />
                            Global Exchange
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-primary">
                            The Shop
                        </h1>
                        <p className="text-muted-foreground mt-2 max-w-lg">
                            New shipments arrive daily at midnight ET. Acquiring rare tech improves your pilot status.
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
                <div className="w-full p-3 rounded-lg bg-white/5 border border-white/10 flex justify-center items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <RefreshCw size={12} className="animate-spin-slow" />
                    Restock in: <ShopTimer />
                    (Global 5-Min Rotation)
                </div>



                {/* Shop Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dailySelection.map((item) => {
                        const isOwned = inventory.includes(item.id);
                        return (
                            <ShopItemCard
                                key={item.id}
                                item={item}
                                isOwned={isOwned}
                                userCoins={user.coins}
                            />
                        );
                    })}
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
                    <Link href="/locker">
                        <NeonButton variant="accent">Open Locker</NeonButton>
                    </Link>
                </div>
            </div>
        </div>
    );
}
