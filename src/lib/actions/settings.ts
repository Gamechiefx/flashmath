"use server";

import { auth, signOut } from "@/auth";
import { execute, loadData, saveData } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function resetUserData() {
    const session = await auth();
    if (!session?.user) {
        return { error: "Unauthorized" };
    }

    const userId = (session.user as any).id;

    try {
        // Delete all sessions for this user
        const db = loadData();
        db.sessions = db.sessions.filter(s => s.user_id !== userId);

        // Delete all mastery stats for this user
        db.mastery_stats = db.mastery_stats.filter(m => m.user_id !== userId);

        // Reset user's total XP, level, and coins
        const userIndex = db.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            db.users[userIndex].total_xp = 0;
            db.users[userIndex].level = 1;
            db.users[userIndex].coins = 0;
            db.users[userIndex].math_tiers = {
                addition: 0,
                subtraction: 0,
                multiplication: 0,
                division: 0
            };
        }

        // Remove user from league participants
        db.league_participants = db.league_participants.filter(p => p.user_id !== userId);

        saveData();

        // Revalidate all relevant paths
        revalidatePath("/dashboard");
        revalidatePath("/practice");
        revalidatePath("/leaderboard");
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
        const db = loadData();

        // Delete all user data
        db.sessions = db.sessions.filter(s => s.user_id !== userId);
        db.mastery_stats = db.mastery_stats.filter(m => m.user_id !== userId);
        db.league_participants = db.league_participants.filter(p => p.user_id !== userId);
        db.inventory = db.inventory.filter(i => i.user_id !== userId);

        // Delete the user account
        db.users = db.users.filter(u => u.id !== userId);

        saveData();

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
        const db = loadData();

        // Check if username is already taken
        const existingUser = db.users.find(u => u.name === newUsername && u.id !== userId);
        if (existingUser) {
            return { error: "Username already taken" };
        }

        // Update username
        const userIndex = db.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            db.users[userIndex].name = newUsername;
        }

        saveData();

        revalidatePath("/dashboard");
        revalidatePath("/settings");

        return { success: true };
    } catch (error) {
        console.error("Error updating username:", error);
        return { error: "Failed to update username" };
    }
}
