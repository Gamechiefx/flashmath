"use server";

import { auth, signOut } from "@/auth";
import { getDatabase, generateId, now } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function resetUserData() {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    try {
        const db = getDatabase();

        // Delete all practice sessions for this user
        db.prepare('DELETE FROM practice_sessions WHERE user_id = ?').run(userId);

        // Delete all mastery stats for this user
        db.prepare('DELETE FROM mastery_stats WHERE user_id = ?').run(userId);

        // Remove user from league participants
        db.prepare('DELETE FROM league_participants WHERE user_id = ?').run(userId);

        // Delete all inventory items for this user
        db.prepare('DELETE FROM inventory WHERE user_id = ?').run(userId);

        // Delete all achievements for this user
        db.prepare('DELETE FROM user_achievements WHERE user_id = ?').run(userId);

        // Reset user's total XP, level, coins, math_tiers, and equipped_items
        db.prepare(`
            UPDATE users SET 
                total_xp = 0, 
                level = 1, 
                coins = 0, 
                math_tiers = '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
                equipped_items = '{"theme":"default","particle":"default","font":"default","sound":"default","bgm":"default","title":"default","frame":"default"}',
                updated_at = ?
            WHERE id = ?
        `).run(now(), userId);

        console.log(`[SETTINGS] Reset all data for user: ${userId}`);

        // Revalidate all relevant paths
        revalidatePath("/dashboard");
        revalidatePath("/practice");
        revalidatePath("/leaderboard");
        revalidatePath("/locker");
        revalidatePath("/shop");
        revalidatePath("/stats/[op]", "page");
        revalidatePath("/", "layout");

        return { success: true };
    } catch (error) {
        console.error("Error resetting user data:", error);
        return { error: "Failed to reset data" };
    }
}

export async function deleteUserAccount() {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    try {
        const db = getDatabase();

        // Delete all user-related data (CASCADE should handle some, but explicit is safer)
        db.prepare('DELETE FROM practice_sessions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM mastery_stats WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM league_participants WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM inventory WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

        // Delete the user account
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        console.log(`[SETTINGS] Deleted account for user: ${userId}`);

        // Sign out the user
        await signOut({ redirect: false });

        return { success: true };
    } catch (error) {
        console.error("Error deleting user account:", error);
        return { error: "Failed to delete account" };
    }
}

export async function updateUsername(newUsername: string) {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    if (!newUsername || newUsername.trim().length < 3) {
        return { error: "Username must be at least 3 characters" };
    }

    try {
        const db = getDatabase();

        // Check 3-month rate limit for username changes
        const user = db.prepare('SELECT name, updated_at FROM users WHERE id = ?').get(userId) as any;
        if (user?.updated_at) {
            const lastUpdate = new Date(user.updated_at);
            const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceUpdate < 90) {
                const daysRemaining = Math.ceil(90 - daysSinceUpdate);
                if (daysRemaining > 30) {
                    const monthsRemaining = Math.ceil(daysRemaining / 30);
                    return { error: `You can change your username again in ${monthsRemaining} month${monthsRemaining > 1 ? 's' : ''}` };
                }
                return { error: `You can change your username again in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}` };
            }
        }

        // Check if username is already taken
        const existingUser = db.prepare('SELECT id FROM users WHERE name = ? AND id != ?').get(newUsername, userId);
        if (existingUser) {
            return { error: "Username already taken" };
        }

        // Update username
        db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').run(newUsername, now(), userId);

        // Also update name in league_participants
        db.prepare('UPDATE league_participants SET name = ? WHERE user_id = ?').run(newUsername, userId);

        console.log(`[SETTINGS] Updated username for user ${userId} to: ${newUsername}`);

        revalidatePath("/dashboard");
        revalidatePath("/settings");
        revalidatePath("/leaderboard");

        return { success: true };
    } catch (error) {
        console.error("Error updating username:", error);
        return { error: "Failed to update username" };
    }
}
