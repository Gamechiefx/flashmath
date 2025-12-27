"use client";

import { useState } from "react";
import { deleteUser, banUser, unbanUser } from "@/lib/actions/users";
import { giveUserCoins, giveUserXP } from "@/lib/actions/admin";
import { Loader2, Trash2, Ban, CheckCircle, Coins, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

interface User {
    id: string;
    name?: string; // Optional if not set
    email?: string;
    total_xp?: number;
    is_banned?: boolean;
    banned_until?: string | null;
}

export function UserManager({ users }: { users: User[] }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [banModalUser, setBanModalUser] = useState<User | null>(null);
    const [banDuration, setBanDuration] = useState<string>("5"); // Default 5 hours
    const [customDuration, setCustomDuration] = useState<string>("");

    // Gift modal state
    const [giftModalUser, setGiftModalUser] = useState<User | null>(null);
    const [giftType, setGiftType] = useState<"coins" | "xp">("coins");
    const [giftMode, setGiftMode] = useState<"give" | "take">("give");
    const [giftAmount, setGiftAmount] = useState<string>("100");

    const filteredUsers = users.filter(u =>
    (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.id.includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleBanClick = (user: User) => {
        if (user.is_banned) {
            // If already banned, just unban immediately (or show info? Let's just unban for now)
            if (!confirm("Unban this user?")) return;
            executeBan(user.id, null); // Unban
        } else {
            setBanModalUser(user);
        }
    };

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

    const handleDelete = async (userId: string) => {
        if (!confirm("Are you sure you want to DELETE this user? This cannot be undone.")) return;
        setProcessingId(userId);
        await deleteUser(userId);
        setProcessingId(null);
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

    // Helper to format ban time
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

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold uppercase tracking-widest text-primary">User Management</h2>
                <input
                    type="text"
                    placeholder="Search Users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-black/20 border border-white/10 rounded px-4 py-2 text-sm w-64"
                />
            </div>

            <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-black/80 backdrop-blur-md z-10">
                            <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                <th className="p-4">User</th>
                                <th className="p-4">XP</th>
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
                                        </td>
                                        <td className="p-4 font-mono text-accent">{user.total_xp?.toLocaleString() || 0}</td>
                                        <td className="p-4">
                                            {isBanned ? (
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-bold uppercase">
                                                        <Ban size={12} /> BANNED
                                                    </span>
                                                    {(user as any).banned_until && (
                                                        <span className="text-[10px] text-red-300/60 font-mono">
                                                            Until: {new Date((user as any).banned_until).toLocaleDateString()}
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
                                                onClick={() => handleBanClick(user)}
                                                disabled={!!processingId}
                                                className="p-2 hover:bg-white/10 rounded text-muted-foreground hover:text-white transition-colors"
                                                title={isBanned ? "Unban" : "Ban"}
                                            >
                                                {processingId === user.id ? <Loader2 size={16} className="animate-spin" /> :
                                                    <Ban size={16} className={isBanned ? "text-green-400" : "text-orange-400"} />
                                                }
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                disabled={!!processingId}
                                                className="p-2 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
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
