import { auth } from "@/auth";
import { loadData, getDatabase } from "@/lib/db";
import { Item } from "@/lib/items";
import { ItemEditorRow } from "@/components/admin/item-editor-row";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { forceSeedShop } from "@/lib/actions/seed";
import { NeonButton } from "@/components/ui/neon-button";
import { UserManager } from "@/components/admin/user-manager";
import { AdminSection } from "@/components/admin/admin-section";
import { PriceGuide } from "@/components/admin/price-guide";
import { SeedButton } from "@/components/admin/seed-button";
import { Role, parseRole, hasPermission, Permission, ROLE_LABELS } from "@/lib/rbac";

export default async function AdminPage() {
    const session = await auth();
    if (!session?.user) return <div className="p-10 text-center">Unauthorized: Please log in</div>;

    // Get current user and their role from database
    const db = getDatabase();
    const currentUser = db.prepare('SELECT role, is_admin FROM users WHERE id = ?')
        .get((session.user as any).id) as any;

    if (!currentUser) return <div className="p-10 text-center">Unauthorized: User not found</div>;

    const currentUserRole = parseRole(currentUser.role, !!currentUser.is_admin);

    // Check if user has permission to view admin console
    if (!hasPermission(currentUserRole, Permission.VIEW_ADMIN_CONSOLE)) {
        return <div className="p-10 text-center">Unauthorized: Insufficient permissions</div>;
    }

    const data = loadData();

    // Check specific permissions for different sections
    const canEditShop = hasPermission(currentUserRole, Permission.EDIT_SHOP_ITEMS);
    const canSeedDatabase = hasPermission(currentUserRole, Permission.SEED_DATABASE);
    const canViewUsers = hasPermission(currentUserRole, Permission.VIEW_USERS);

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
                    <span className="ml-2 px-3 py-1 text-xs font-bold uppercase rounded-full bg-primary/10 text-primary">
                        {ROLE_LABELS[currentUserRole]}
                    </span>
                    {canSeedDatabase && (
                        <div className="ml-auto">
                            <SeedButton />
                        </div>
                    )}
                </div>

                {canEditShop && (
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
                )}

                {/* User Management Section */}
                {canViewUsers && (
                    <AdminSection title="User Management DB" defaultOpen={true}>
                        <UserManager users={data.users || []} currentUserRole={currentUserRole} />
                    </AdminSection>
                )}
            </div>
        </div>
    );
}

