import { auth } from "@/auth";
import { loadData } from "@/lib/db";
import { Item } from "@/lib/items";
import { ItemEditorRow } from "@/components/admin/item-editor-row";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { forceSeedShop } from "@/lib/actions/seed";
import { NeonButton } from "@/components/ui/neon-button";
import { UserManager } from "@/components/admin/user-manager";
import { AdminSection } from "@/components/admin/admin-section"; // Added import

import { PriceGuide } from "@/components/admin/price-guide"; // Added import

// Client Component for Button
import { SeedButton } from "@/components/admin/seed-button"; // Separate file to avoid mixed server/client issues? 
// No, I can't easily make a mixed file without "use client".
// AdminPage is Server Component. 
// I need `SeedButton` to be a Client Component.

export default async function AdminPage() {
    const session = await auth();
    if (!session?.user) return <div className="p-10 text-center">Unauthorized: Please log in</div>;

    // Check for admin flag in database
    const data = loadData();
    const user = data.users.find((u: any) => u.id === (session.user as any).id);
    if (!user?.is_admin) return <div className="p-10 text-center">Unauthorized: Admins Only</div>;

    // Sort by type then rarity
    const items = (data.shop_items as Item[]).sort((a, b) => a.type.localeCompare(b.type));

    return (
        <div className="min-h-screen bg-background text-foreground p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft />
                    </Link>
                    <h1 className="text-4xl font-black uppercase tracking-tighter">
                        Admin <span className="text-primary">Console</span>
                    </h1>
                    <div className="ml-auto">
                        <SeedButton />
                    </div>
                </div>

                <AdminSection title="Shop Inventory DB">
                    <PriceGuide />
                    <GlassCard className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/10 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        <th className="p-4">ID</th>
                                        <th className="p-4">Name</th>
                                        <th className="p-4">Type</th>
                                        <th className="p-4 w-32">Rarity</th>
                                        <th className="p-4 w-32">Price</th>
                                        <th className="p-4 w-16">Save</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <ItemEditorRow key={item.id} item={item} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </GlassCard>
                </AdminSection>

                {/* User Management Section */}
                <AdminSection title="User Management DB" defaultOpen={true}>
                    <UserManager users={data.users || []} />
                </AdminSection>
            </div>
        </div>
    );
}
