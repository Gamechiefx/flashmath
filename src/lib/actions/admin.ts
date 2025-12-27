"use server";

import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized", isAdmin: false };

    const db = getDatabase();
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get((session.user as any).id) as any;

    if (!user?.is_admin) return { error: "Admin access required", isAdmin: false };

    return { isAdmin: true, session };
}

export async function updateItem(itemId: string, data: { name: string; rarity: string; price: number }) {
    const { isAdmin, error } = await requireAdmin();
    if (!isAdmin) return { error };

    try {
        console.log(`[ADMIN] Updating item ${itemId}:`, data);
        const db = getDatabase();

        // Check if item exists
        const existingItem = db.prepare('SELECT id FROM shop_items WHERE id = ?').get(itemId);
        if (!existingItem) return { error: "Item not found" };

        // Update using SQLite
        db.prepare(`
            UPDATE shop_items 
            SET name = ?, rarity = ?, price = ?
            WHERE id = ?
        `).run(data.name, data.rarity, data.price, itemId);

        console.log(`[ADMIN] Successfully updated item ${itemId}`);

        revalidatePath("/shop");
        revalidatePath("/admin");
        revalidatePath("/locker");
        return { success: true };
    } catch (error) {
        console.error("Failed to update item:", error);
        return { error: "Failed to update item" };
    }
}

export async function giveUserCoins(userId: string, amount: number) {
    const { isAdmin, error } = await requireAdmin();
    if (!isAdmin) return { error };

    try {
        const db = getDatabase();

        // Check if user exists
        const user = db.prepare('SELECT id, name, coins FROM users WHERE id = ?').get(userId) as any;
        if (!user) return { error: "User not found" };

        const newCoins = (user.coins || 0) + amount;
        db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(newCoins, userId);

        console.log(`[ADMIN] Gave ${amount} coins to ${user.name} (${userId}). New balance: ${newCoins}`);

        revalidatePath("/admin");
        revalidatePath("/dashboard");
        return { success: true, newCoins };
    } catch (error) {
        console.error("Failed to give coins:", error);
        return { error: "Failed to give coins" };
    }
}

export async function giveUserXP(userId: string, amount: number) {
    const { isAdmin, error } = await requireAdmin();
    if (!isAdmin) return { error };

    try {
        const db = getDatabase();

        // Check if user exists
        const user = db.prepare('SELECT id, name, total_xp, level, current_league_id FROM users WHERE id = ?').get(userId) as any;
        if (!user) return { error: "User not found" };

        const newXP = (user.total_xp || 0) + amount;
        const newLevel = Math.floor(newXP / 1000) + 1;

        db.prepare('UPDATE users SET total_xp = ?, level = ? WHERE id = ?').run(newXP, newLevel, userId);

        // Also update league XP
        const existingParticipant = db.prepare(
            'SELECT id, weekly_xp FROM league_participants WHERE league_id = ? AND user_id = ?'
        ).get(user.current_league_id || 'neon-league', userId) as any;

        if (existingParticipant) {
            db.prepare('UPDATE league_participants SET weekly_xp = weekly_xp + ? WHERE id = ?')
                .run(amount, existingParticipant.id);
        }

        console.log(`[ADMIN] Gave ${amount} XP to ${user.name} (${userId}). New total: ${newXP}, Level: ${newLevel}`);

        revalidatePath("/admin");
        revalidatePath("/dashboard");
        revalidatePath("/leaderboard");
        return { success: true, newXP, newLevel };
    } catch (error) {
        console.error("Failed to give XP:", error);
        return { error: "Failed to give XP" };
    }
}

export async function getAllUsers() {
    const { isAdmin, error } = await requireAdmin();
    if (!isAdmin) return { error, users: [] };

    try {
        const db = getDatabase();
        const users = db.prepare('SELECT id, name, email, level, total_xp, coins, is_admin FROM users ORDER BY name').all();
        return { users };
    } catch (error) {
        console.error("Failed to get users:", error);
        return { error: "Failed to get users", users: [] };
    }
}
