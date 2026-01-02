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
        try {
            // Try with new arena columns first
            db.prepare(`
                UPDATE users SET 
                    total_xp = 0, 
                    level = 1, 
                    coins = 0, 
                    math_tiers = '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
                    skill_points = '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
                    equipped_items = '{"theme":"default","particle":"default","font":"default","sound":"default","bgm":"default","title":"default","frame":"default"}',
                    arena_elo = 500,
                    arena_elo_1v1 = 500,
                    arena_elo_2v2 = 400,
                    arena_elo_3v3 = 350,
                    arena_wins = 0,
                    arena_losses = 0,
                    arena_win_streak = 0,
                    arena_best_win_streak = 0,
                    current_league_id = 'neon-league',
                    updated_at = ?
                WHERE id = ?
            `).run(now(), userId);
        } catch (e) {
            // Fallback for databases without new columns
            console.log('[SETTINGS] Using fallback reset (new columns may not exist)');
            db.prepare(`
                UPDATE users SET 
                    total_xp = 0, 
                    level = 1, 
                    coins = 0, 
                    math_tiers = '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
                    skill_points = '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
                    equipped_items = '{"theme":"default","particle":"default","font":"default","sound":"default","bgm":"default","title":"default","frame":"default"}',
                    arena_elo = 500,
                    arena_wins = 0,
                    arena_losses = 0,
                    current_league_id = 'neon-league',
                    updated_at = ?
                WHERE id = ?
            `).run(now(), userId);
        }

        // Clear user from Redis queue  if any
        try {
            const { getRedis } = await import("@/lib/redis");
            const redis = getRedis();
            if (redis) {
                await redis.del(`arena:queue:${userId}`);
            }
        } catch (e) {
            // Redis may not be available
        }

        console.log(`[SETTINGS] Reset all data for user: ${userId}`);

        // Revalidate all relevant paths
        revalidatePath("/dashboard");
        revalidatePath("/practice");
        revalidatePath("/leaderboard");
        revalidatePath("/locker");
        revalidatePath("/shop");
        revalidatePath("/stats/[op]", "page");
        revalidatePath("/arena");
        revalidatePath("/arena/modes");
        revalidatePath("/stats");
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

    // Validate username format, profanity, and reserved words
    const { validateUsername, isUsernameAvailable } = await import("@/lib/username-validator");

    const validation = validateUsername(newUsername);
    if (!validation.valid) {
        return { error: validation.error || "Invalid username" };
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

        // Check if username is already taken (case-insensitive)
        const available = await isUsernameAvailable(newUsername, userId);
        if (!available) {
            return { error: "Username is already taken" };
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

export async function updateDOB(dob: string) {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    try {
        const db = getDatabase();

        // Check if user already has DOB set
        try {
            const existing = db.prepare('SELECT dob FROM users WHERE id = ?').get(userId) as any;
            if (existing?.dob) {
                return { error: "Date of Birth has already been set and cannot be changed" };
            }
        } catch (e) {
            // Column might not exist yet, continue
        }

        // Ensure dob column exists
        try {
            db.prepare("ALTER TABLE users ADD COLUMN dob TEXT").run();
        } catch (e) {
            // Column likely already exists
        }

        db.prepare('UPDATE users SET dob = ?, updated_at = ? WHERE id = ?').run(dob, now(), userId);

        console.log(`[SETTINGS] Updated DOB for user ${userId}`);

        revalidatePath("/dashboard");
        revalidatePath("/settings");
        revalidatePath("/arena");

        return { success: true };
    } catch (error) {
        console.error("Error updating DOB:", error);
        return { error: "Failed to update date of birth" };
    }
}
