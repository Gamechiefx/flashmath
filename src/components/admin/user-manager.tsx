"use client";

import { useState, useEffect } from "react";
import { deleteUser, banUser, unbanUser } from "@/lib/actions/users";
import { giveUserCoins, giveUserXP, giveUserItem, giveUserAllItems, getAllShopItems } from "@/lib/actions/admin";
import { Loader2, Trash2, Ban, CheckCircle, Coins, Zap, AlertCircle, ArrowUp, ArrowDown, Package } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { RoleManager } from "@/components/admin/role-manager";
import { Role, parseRole, hasPermission, Permission, canManageRole } from "@/lib/rbac";

interface ShopItem {
    id: string;
    name: string;
    rarity: string;
    type: string;
    price: number;
}

interface User {
    id: string;
    name?: string;
    email?: string;
    total_xp?: number;
    level?: number;
    arena_elo_duel?: number;  // Duel ELO (legacy arena_elo will fall back to this)
    arena_elo?: number;  // Kept for backwards compatibility
    coins?: number;
    is_banned?: boolean;
    banned_until?: string | null;
    role?: string;
    is_admin?: boolean;
    created_at?: string;
}

interface UserManagerProps {
    users: User[];
    currentUserRole: Role;
}

export function UserManager({ users, currentUserRole }: UserManagerProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [banModalUser, setBanModalUser] = useState<User | null>(null);
    const [banDuration, setBanDuration] = useState<string>("5"); // Default 5 hours
    const [customDuration, setCustomDuration] = useState<string>("");

    // Unban modal state
    const [unbanModalUser, setUnbanModalUser] = useState<User | null>(null);

    // Gift modal state
    const [giftModalUser, setGiftModalUser] = useState<User | null>(null);
    const [giftType, setGiftType] = useState<"coins" | "xp">("coins");
    const [giftMode, setGiftMode] = useState<"give" | "take">("give");
    const [giftAmount, setGiftAmount] = useState<string>("100");

    // Item grant modal state
    const [itemModalUser, setItemModalUser] = useState<User | null>(null);
    const [shopItems, setShopItems] = useState<ShopItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string>("");
    const [itemsLoading, setItemsLoading] = useState(false);

    // Load shop items when modal opens
    useEffect(() => {
        if (itemModalUser && shopItems.length === 0) {
            // Defer to avoid setState in effect warning
            setTimeout(() => {
                setItemsLoading(true);
                getAllShopItems().then((result) => {
                    if (!result.error) {
                        setShopItems(result.items);
                    }
                    setItemsLoading(false);
                });
            }, 0);
        }
    }, [itemModalUser, shopItems.length]);

    // Sorting state
    const [sortBy, setSortBy] = useState<"created_at" | "name" | "xp" | "level" | "elo" | "coins" | "status" | "role">("created_at");
    const [sortAsc, setSortAsc] = useState(false); // Default: newest first

    // Toggle between Level and ELO display
    const [showElo, setShowElo] = useState(false);

    // Helper to check if user is banned
    const isBannedUser = (u: User) => u.is_banned || (u.banned_until && new Date(u.banned_until) > new Date());

    // Filter and sort users
    const filteredUsers = users
        .filter(u =>
        (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.id.includes(searchTerm) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'created_at':
                    comparison = (a.created_at || '').localeCompare(b.created_at || '');
                    break;
                case 'name':
                    comparison = (a.name || '').localeCompare(b.name || '');
                    break;
                case 'xp':
                    comparison = (a.total_xp || 0) - (b.total_xp || 0);
                    break;
                case 'level':
                    comparison = (a.level || 1) - (b.level || 1);
                    break;
                case 'elo':
                    comparison = (a.arena_elo_duel || a.arena_elo || 300) - (b.arena_elo_duel || b.arena_elo || 300);
                    break;
                case 'coins':
                    comparison = (a.coins || 0) - (b.coins || 0);
                    break;
                case 'status':
                    // Banned users sorted after active (ascending) or before (descending)
                    comparison = (isBannedUser(a) ? 1 : 0) - (isBannedUser(b) ? 1 : 0);
                    break;
                case 'role':
                    // Sort by role hierarchy (higher roles first when descending)
                    const roleOrder: Record<string, number> = { 'super_admin': 4, 'admin': 3, 'moderator': 2, 'user': 1 };
                    const aRole = parseRole(a.role, !!a.is_admin);
                    const bRole = parseRole(b.role, !!b.is_admin);
                    comparison = (roleOrder[aRole] || 0) - (roleOrder[bRole] || 0);
                    break;
            }
            return sortAsc ? comparison : -comparison;
        });


    const executeBan = async (userId: string, hours: number | null) => {
        setProcessingId(userId);
        setBanModalUser(null);
        if (hours === null) {
            await unbanUser(userId);
        } else {
            await banUser(userId, hours);
        }
        setProcessingId(null);
    };

    const confirmBan = () => {
        if (!banModalUser) return;

        let hours = 0;
        if (banDuration === "custom") {
            hours = parseFloat(customDuration);
            if (isNaN(hours) || hours <= 0) {
                alert("Please enter a valid number of hours");
                return;
            }
        } else if (banDuration === "perm") {
            hours = 99 * 365 * 24; // ~99 years
        } else {
            hours = parseInt(banDuration);
        }

        executeBan(banModalUser.id, hours);
    };

    const handleDelete = async (userId: string, userRole: Role) => {
        // Check permission
        if (!hasPermission(currentUserRole, Permission.DELETE_USERS)) {
            alert("❌ Permission Denied: You don't have permission to delete users.");
            return;
        }
        // Can't delete users at or above your level
        if (!canManageRole(currentUserRole, userRole)) {
            alert("❌ Permission Denied: You cannot delete users with equal or higher roles.");
            return;
        }
        if (!confirm("Are you sure you want to DELETE this user? This cannot be undone.")) return;
        setProcessingId(userId);
        await deleteUser(userId);
        setProcessingId(null);
    };

    const handleBanClick = (user: User) => {
        const userRole = parseRole(user.role, !!user.is_admin);
        // Can't ban users at or above your level
        if (!canManageRole(currentUserRole, userRole)) {
            alert("❌ Permission Denied: You cannot ban users with equal or higher roles.");
            return;
        }
        if (user.is_banned) {
            // Show unban modal instead of browser confirm
            setUnbanModalUser(user);
        } else {
            setBanModalUser(user);
        }
    };

    const confirmUnban = async () => {
        if (!unbanModalUser) return;
        setProcessingId(unbanModalUser.id);
        await unbanUser(unbanModalUser.id);
        setProcessingId(null);
        setUnbanModalUser(null);
    };

    const confirmGift = async () => {
        if (!giftModalUser) return;
        const amount = parseInt(giftAmount);
        if (isNaN(amount) || amount <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        // Apply negative sign for "take" mode
        const finalAmount = giftMode === "take" ? -amount : amount;

        setProcessingId(giftModalUser.id);
        setGiftModalUser(null);

        if (giftType === "coins") {
            await giveUserCoins(giftModalUser.id, finalAmount);
        } else {
            await giveUserXP(giftModalUser.id, finalAmount);
        }

        setProcessingId(null);
        window.location.reload(); // Refresh to show updated values
    };

    const openGiftModal = (user: User, type: "coins" | "xp", mode: "give" | "take" = "give") => {
        setGiftModalUser(user);
        setGiftType(type);
        setGiftMode(mode);
        setGiftAmount(type === "coins" ? "100" : "500");
    };

    // Item grant handlers
    const confirmItemGrant = async () => {
        if (!itemModalUser || !selectedItemId) return;
        setProcessingId(itemModalUser.id);

        const result = await giveUserItem(itemModalUser.id, selectedItemId);

        setProcessingId(null);
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert(`✅ Gave "${result.itemName}" to ${itemModalUser.name}`);
            setItemModalUser(null);
            setSelectedItemId("");
        }
    };

    const grantAllItems = async () => {
        if (!itemModalUser) return;
        if (!confirm(`Grant ALL ${shopItems.length} items to ${itemModalUser.name}?`)) return;

        setProcessingId(itemModalUser.id);
        const result = await giveUserAllItems(itemModalUser.id);
        setProcessingId(null);

        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert(`✅ Granted ${result.itemsGranted} new items to ${itemModalUser.name}`);
            setItemModalUser(null);
        }
    };

    // Helper to format ban time - currently unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getBanTimeRemaining = (isoDate: string) => {
        const date = new Date(isoDate);
        if (date < new Date()) return "Expired";
        return date.toLocaleString();
    };

    return (
        <div className="space-y-4 relative">
            {/* BAN MODAL OVERLAY */}
            {banModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <GlassCard className="w-full max-w-md p-6 space-y-4 border border-red-500/30">
                        <h3 className="text-xl font-bold text-red-400 flex items-center gap-2">
                            <Ban /> Ban User: {banModalUser.name}
                        </h3>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Duration</label>
                            <select
                                value={banDuration}
                                onChange={(e) => setBanDuration(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm"
                            >
                                <option value="1">1 Hour</option>
                                <option value="5">5 Hours</option>
                                <option value="24">24 Hours (1 Day)</option>
                                <option value="168">1 Week</option>
                                <option value="custom">Custom (Hours)</option>
                                <option value="perm">PERMANENT</option>
                            </select>
                        </div>

                        {banDuration === "custom" && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-muted-foreground">Hours</label>
                                <input
                                    type="number"
                                    value={customDuration}
                                    onChange={(e) => setCustomDuration(e.target.value)}
                                    placeholder="e.g. 0.5 for 30 mins"
                                    className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm"
                                />
                            </div>
                        )}

                        <div className="flex gap-2 justify-end mt-4">
                            <button
                                onClick={() => setBanModalUser(null)}
                                className="px-4 py-2 rounded hover:bg-white/10 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmBan}
                                className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-900/20"
                            >
                                CONFIRM BAN
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* UNBAN MODAL OVERLAY */}
            {unbanModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <GlassCard className="w-full max-w-md p-6 space-y-4 border border-green-500/30">
                        <h3 className="text-xl font-bold text-green-400 flex items-center gap-2">
                            <CheckCircle /> Unban User: {unbanModalUser.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Are you sure you want to unban this user? They will be able to access their account again.
                        </p>
                        <div className="flex gap-2 justify-end mt-4">
                            <button
                                onClick={() => setUnbanModalUser(null)}
                                className="px-4 py-2 rounded hover:bg-white/10 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmUnban}
                                disabled={!!processingId}
                                className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-bold shadow-lg shadow-green-900/20"
                            >
                                {processingId === unbanModalUser.id ? 'UNBANNING...' : 'CONFIRM UNBAN'}
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* GIFT MODAL OVERLAY */}
            {giftModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <GlassCard className={`w-full max-w-md p-6 space-y-4 border ${giftMode === 'take' ? 'border-red-500/30' : 'border-primary/30'}`}>
                        <h3 className={`text-xl font-bold flex items-center gap-2 ${giftMode === 'take' ? 'text-red-400' : 'text-primary'}`}>
                            {giftType === "coins" ? <Coins /> : <Zap />}
                            {giftMode === 'give' ? 'Give' : 'Take'} {giftType === "coins" ? "Coins" : "XP"}: {giftModalUser.name}
                        </h3>

                        {/* Give/Take Toggle */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setGiftMode("give")}
                                className={`flex-1 py-2 rounded text-sm font-bold uppercase ${giftMode === 'give' ? 'bg-primary/30 text-primary border border-primary/50' : 'bg-white/5 text-muted-foreground'}`}
                            >
                                + Give
                            </button>
                            <button
                                onClick={() => setGiftMode("take")}
                                className={`flex-1 py-2 rounded text-sm font-bold uppercase ${giftMode === 'take' ? 'bg-red-500/30 text-red-400 border border-red-500/50' : 'bg-white/5 text-muted-foreground'}`}
                            >
                                − Take
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">Amount</label>
                            <input
                                type="number"
                                value={giftAmount}
                                onChange={(e) => setGiftAmount(e.target.value)}
                                placeholder="Enter amount"
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm"
                            />
                        </div>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                            <button onClick={() => setGiftAmount("100")} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">100</button>
                            <button onClick={() => setGiftAmount("500")} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">500</button>
                            <button onClick={() => setGiftAmount("1000")} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">1000</button>
                            <button onClick={() => setGiftAmount("5000")} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">5000</button>
                        </div>
                        <div className="flex gap-2 justify-end mt-4">
                            <button
                                onClick={() => setGiftModalUser(null)}
                                className="px-4 py-2 rounded hover:bg-white/10 text-sm font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmGift}
                                className={`px-4 py-2 rounded text-white text-sm font-bold shadow-lg ${giftMode === 'take'
                                    ? 'bg-red-500/80 hover:bg-red-500 shadow-red-900/20'
                                    : 'bg-primary/80 hover:bg-primary shadow-primary/20'
                                    }`}
                            >
                                {giftMode === 'give' ? 'GIVE' : 'TAKE'} {giftType.toUpperCase()}
                            </button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {/* ITEM GRANT MODAL OVERLAY */}
            {itemModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <GlassCard className="w-full max-w-md p-6 space-y-4 border border-purple-500/30">
                        <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2">
                            <Package /> Grant Items: {itemModalUser.name}
                        </h3>

                        {itemsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase text-muted-foreground">Select Item</label>
                                    <select
                                        value={selectedItemId}
                                        onChange={(e) => setSelectedItemId(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm"
                                    >
                                        <option value="">-- Choose an item --</option>
                                        {shopItems.map((item: ShopItem) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.type}) - {item.rarity}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex gap-2 justify-between mt-4">
                                    <button
                                        onClick={grantAllItems}
                                        disabled={!!processingId}
                                        className="px-4 py-2 rounded bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-bold shadow-lg"
                                    >
                                        {processingId === itemModalUser.id ? <Loader2 size={16} className="animate-spin" /> : 'GRANT ALL ITEMS'}
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setItemModalUser(null); setSelectedItemId(""); }}
                                            className="px-4 py-2 rounded hover:bg-white/10 text-sm font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={confirmItemGrant}
                                            disabled={!selectedItemId || !!processingId}
                                            className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold shadow-lg shadow-purple-900/20 disabled:opacity-50"
                                        >
                                            GRANT ITEM
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </GlassCard>
                </div>
            )}

            <div className="flex justify-between items-center gap-4 flex-wrap">
                <h2 className="text-xl font-bold uppercase tracking-widest text-primary">User Management</h2>
                <div className="flex items-center gap-3">
                    {/* Sort Controls */}
                    <div className="flex items-center gap-2">
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'created_at' | 'name' | 'role')}
                            className="bg-black/20 border border-white/10 rounded px-3 py-2 text-sm"
                        >
                            <option value="created_at">Created</option>
                            <option value="name">Name</option>
                            <option value="role">Role</option>
                            <option value="status">Status</option>
                            <option value="level">Level</option>
                            <option value="elo">ELO</option>
                            <option value="xp">XP</option>
                            <option value="coins">Coins</option>
                        </select>
                        <button
                            onClick={() => setSortAsc(!sortAsc)}
                            className="p-2 bg-black/20 border border-white/10 rounded hover:bg-white/10 transition-colors"
                            title={sortAsc ? "Ascending" : "Descending"}
                        >
                            {sortAsc ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Search Users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-black/20 border border-white/10 rounded px-4 py-2 text-sm w-64"
                    />
                </div>
            </div>

            <GlassCard>
                <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-black/95 backdrop-blur-md z-20">
                            <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <th className="p-4">User</th>
                                <th className="p-4 relative">Role</th>
                                <th className="p-4">
                                    <button
                                        onClick={() => setShowElo(!showElo)}
                                        className="hover:text-primary transition-colors"
                                        title="Click to toggle Level/ELO"
                                    >
                                        {showElo ? 'ELO' : 'Level'}
                                    </button>
                                </th>
                                <th className="p-4">XP</th>
                                <th className="p-4">Coins</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(user => {
                                const isBanned = user.is_banned || (user.banned_until && new Date(user.banned_until) > new Date());
                                return (
                                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-white">{user.name || "Unknown"}</div>
                                            <div className="text-xs text-muted-foreground font-mono">{user.id}</div>
                                            {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                                            {user.created_at && (
                                                <div className="text-[10px] text-muted-foreground/60 mt-1" suppressHydrationWarning>
                                                    Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 relative z-30">
                                            <RoleManager
                                                userId={user.id}
                                                userName={user.name || "Unknown"}
                                                currentRole={parseRole(user.role, !!user.is_admin)}
                                                managerRole={currentUserRole}
                                                onRoleChanged={() => window.location.reload()}
                                            />
                                        </td>
                                        <td className="p-4 font-mono text-blue-400">
                                            {showElo ? (user.arena_elo_duel || user.arena_elo || 300) : (user.level || 1)}
                                        </td>
                                        <td className="p-4 font-mono text-accent">{user.total_xp?.toLocaleString() || 0}</td>
                                        <td className="p-4 font-mono text-yellow-400">{user.coins?.toLocaleString() || 0}</td>
                                        <td className="p-4">
                                            {isBanned ? (
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-bold uppercase">
                                                        <Ban size={12} /> BANNED
                                                    </span>
                                                    {(user as { banned_until?: string | null }).banned_until && (
                                                        <span className="text-[10px] text-red-300/60 font-mono" suppressHydrationWarning>
                                                            Until: {new Date((user as { banned_until: string }).banned_until).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs font-bold uppercase">
                                                    <CheckCircle size={12} /> Active
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            {/* Gift buttons - Super Admin can gift anyone including themselves */}
                                            {hasPermission(currentUserRole, Permission.GIVE_COINS_XP) && (currentUserRole === Role.SUPER_ADMIN || canManageRole(currentUserRole, parseRole(user.role, !!user.is_admin))) && (
                                                <>
                                                    <button
                                                        onClick={() => openGiftModal(user, "coins")}
                                                        disabled={!!processingId}
                                                        className="p-2 hover:bg-yellow-500/20 rounded text-muted-foreground hover:text-yellow-400 transition-colors"
                                                        title="Give Coins"
                                                    >
                                                        <Coins size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => openGiftModal(user, "xp")}
                                                        disabled={!!processingId}
                                                        className="p-2 hover:bg-primary/20 rounded text-muted-foreground hover:text-primary transition-colors"
                                                        title="Give XP"
                                                    >
                                                        <Zap size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setItemModalUser(user)}
                                                        disabled={!!processingId}
                                                        className="p-2 hover:bg-purple-500/20 rounded text-muted-foreground hover:text-purple-400 transition-colors"
                                                        title="Grant Items"
                                                    >
                                                        <Package size={16} />
                                                    </button>
                                                </>
                                            )}
                                            {/* Only show ban button if can manage this user */}
                                            {canManageRole(currentUserRole, parseRole(user.role, !!user.is_admin)) && (
                                                <button
                                                    onClick={() => handleBanClick(user)}
                                                    disabled={!!processingId}
                                                    className="p-2 hover:bg-white/10 rounded text-muted-foreground hover:text-white transition-colors"
                                                    title={isBanned ? "Unban" : "Ban"}
                                                >
                                                    {processingId === user.id ? <Loader2 size={16} className="animate-spin" /> :
                                                        <Ban size={16} className={isBanned ? "text-green-400" : "text-orange-400"} />
                                                    }
                                                </button>
                                            )}
                                            {/* Only show delete button if has permission and can manage this user */}
                                            {hasPermission(currentUserRole, Permission.DELETE_USERS) && canManageRole(currentUserRole, parseRole(user.role, !!user.is_admin)) && (
                                                <button
                                                    onClick={() => handleDelete(user.id, parseRole(user.role, !!user.is_admin))}
                                                    disabled={!!processingId}
                                                    className="p-2 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                            {/* Show lock icon for protected users */}
                                            {!canManageRole(currentUserRole, parseRole(user.role, !!user.is_admin)) && (
                                                <span className="p-2 text-muted-foreground/50" title="Protected - Cannot manage">
                                                    <AlertCircle size={16} />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </GlassCard>
        </div>
    );
}
