import { auth } from "@/auth";
import { queryOne, loadData, getDatabase } from "@/lib/db";
import { AuthHeader } from "@/components/auth-header";
import { BannerEditorClient } from "@/components/locker/banner-editor-client";
import { NeonButton } from "@/components/ui/neon-button";
import { ArrowLeft, Flag } from "lucide-react";
import Link from "next/link";

export default async function BannerEditorPage() {
    const session = await auth();
    if (!session?.user) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">Please log in</div>;
    }

    const userId = (session.user as any).id;
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    if (!user) {
        return <div className="min-h-screen bg-background flex items-center justify-center text-foreground">User not found</div>;
    }

    // Parse equipped items
    let equipped: Record<string, string> = {};
    try {
        equipped = typeof user.equipped_items === 'string'
            ? JSON.parse(user.equipped_items)
            : user.equipped_items || {};
    } catch {
        equipped = {};
    }

    // Get owned banner item IDs
    const db = getDatabase();
    const inventory = db.prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId) as { item_id: string }[];
    const ownedBannerIds = inventory
        .map(i => i.item_id)
        .filter(id => id.startsWith('banner_'));

    // Get title display name
    const equippedTitleId = equipped.title || 'default';
    let titleDisplay = 'FlashMath Competitor';
    if (equippedTitleId !== 'default') {
        const data = loadData();
        const titleItem = (data.shop_items as any[])?.find(i => i.id === equippedTitleId);
        if (titleItem) {
            titleDisplay = titleItem.asset_value || titleItem.name;
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-6 md:p-12 relative">
            {/* Auth Header */}
            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader session={session} />
            </div>

            <div className="max-w-4xl mx-auto relative z-10 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/locker">
                            <div className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
                                <ArrowLeft size={24} className="text-white/60" />
                            </div>
                        </Link>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/20 rounded-xl">
                                <Flag size={24} className="text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-tight text-primary">
                                    Banner Editor
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Customize your Arena banner
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Banner Editor */}
                <BannerEditorClient
                    userName={user.name}
                    level={user.level || 1}
                    rank="Silver"
                    division="II"
                    equippedTitle={titleDisplay}
                    equippedFrame={equipped.frame || 'default'}
                    equippedBanner={equipped.banner || 'default'}
                    ownedBannerIds={ownedBannerIds}
                />
            </div>

            {/* Spacer for fixed footer */}
            <div className="h-24" />

            {/* Compact Nav Footer */}
            <div className="fixed bottom-0 left-0 w-full p-3 bg-background/80 backdrop-blur-md border-t border-white/10 flex justify-center z-50">
                <div className="flex gap-3">
                    <Link href="/locker">
                        <NeonButton variant="secondary" className="text-sm">Back to Locker</NeonButton>
                    </Link>
                    <Link href="/shop">
                        <NeonButton variant="accent" className="text-sm">Shop for Banners</NeonButton>
                    </Link>
                </div>
            </div>
        </div>
    );
}
