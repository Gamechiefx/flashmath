import { auth } from "@/auth";
import { loadData, getDatabase } from "@/lib/db";
import { Item } from "@/lib/items";
import { ItemEditorRow } from "@/components/admin/item-editor-row";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { forceSeedShop } from "@/lib/actions/seed";
import { NeonButton } from "@/components/ui/neon-button";
import { UserManager } from "@/components/admin/user-manager";
import { AdminSection } from "@/components/admin/admin-section";
import { PriceGuide } from "@/components/admin/price-guide";
import { SeedButton } from "@/components/admin/seed-button";
import { SystemControls } from "@/components/admin/system-controls";
import { OnlinePlayers } from "@/components/admin/online-players";
import { getAllSystemSettings } from "@/lib/actions/system";
import { Role, parseRole, hasPermission, Permission, ROLE_LABELS } from "@/lib/rbac";
import { checkAdminMfaSession } from "@/lib/actions/admin-mfa";
import { AdminMfaGate } from "@/components/admin/admin-mfa-gate";

/**
 * Render the server-side Admin Console page with data loading, permission checks, and MFA gating.
 *
 * Performs authentication and authorisation, loads shop and user data and system settings, computes online player count, and conditionally renders the admin UI sections (Shop Inventory, User Management, System Controls, seed actions, and online players) based on the current user's role and permissions. If the user lacks authentication or required permissions an unauthorized message is returned; if an admin MFA session is not verified the admin UI is wrapped in an MFA gate.
 *
 * @returns A React element containing the admin console UI, an unauthorized message, or the admin UI wrapped in an MFA verification gate.
 */
export default async function AdminPage() {
    const session = await auth();
    if (!session?.user) return <div className="p-10 text-center">Unauthorized: Please log in</div>;

    // Get current user and their role from database
    const db = getDatabase();
    // Use SELECT * to handle databases without role column
    const currentUser = db.prepare('SELECT * FROM users WHERE id = ?')
        .get((session.user as any).id) as any;

    if (!currentUser) return <div className="p-10 text-center">Unauthorized: User not found</div>;

    const currentUserRole = parseRole(currentUser.role, !!currentUser.is_admin);

    // Check if user has permission to view admin console
    if (!hasPermission(currentUserRole, Permission.VIEW_ADMIN_CONSOLE)) {
        return <div className="p-10 text-center">Unauthorized: Insufficient permissions</div>;
    }

    // Check MFA session
    const hasMfaSession = await checkAdminMfaSession();

    const data = loadData();

    // Check specific permissions for different sections
    const canEditShop = hasPermission(currentUserRole, Permission.EDIT_SHOP_ITEMS);
    const canSeedDatabase = hasPermission(currentUserRole, Permission.SEED_DATABASE);
    const canViewUsers = hasPermission(currentUserRole, Permission.VIEW_USERS);

    // Sort by type then rarity
    const items = (data.shop_items as Item[]).sort((a, b) => a.type.localeCompare(b.type));

    // Get system settings
    const systemSettings = await getAllSystemSettings();

    // Count online players (users active in the last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const onlineCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM users
        WHERE last_active > ?
    `).get(fiveMinutesAgo) as { count: number };
    const playersOnline = onlineCount?.count || 0;

    // Wrap content in MFA gate if not verified
    const adminContent = (
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

                    {/* Online Players Badge - Live updating */}
                    <OnlinePlayers initialCount={playersOnline} />

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

                {/* System Controls Section */}
                {(currentUserRole === Role.ADMIN || currentUserRole === Role.SUPER_ADMIN) && (
                    <AdminSection title="System Controls">
                        <SystemControls
                            maintenanceMode={systemSettings.maintenance_mode === 'true'}
                            maintenanceMessage={systemSettings.maintenance_message || 'We are currently performing scheduled maintenance. Please check back soon!'}
                            signupEnabled={systemSettings.signup_enabled !== 'false'}
                        />
                    </AdminSection>
                )}
            </div>
        </div>
    );

    // If MFA verified, show admin content directly
    if (hasMfaSession) {
        return adminContent;
    }

    // Otherwise, require MFA verification
    return (
        <AdminMfaGate userEmail={session.user.email || ""}>
            {adminContent}
        </AdminMfaGate>
    );
}
