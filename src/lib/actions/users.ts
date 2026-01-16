"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { execute, loadData, saveData } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

export async function getUsers() {
    const session = await auth();
    if (!session?.user) return []; // Protect

    // Returning users + their league status maybe?
    const db = loadData();
    // Return all users
    return db.users;
}

export async function deleteUser(userId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    try {
        console.log(`[ADMIN] Deleting user ${userId}`);
        // Use execute for database operations
        execute("DELETE FROM users WHERE id = ?", [userId]);
        execute("DELETE FROM league_participants WHERE user_id = ?", [userId]);

        revalidatePath("/admin");
        return { success: true };
    } catch (deleteError) {
        console.error("Delete user failed", deleteError);
        return { error: "Failed" };
    }
}


export async function banUser(userId: string, durationHours: number | null) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    try {
        const db = loadData();
        const user = db.users.find((u: any) => u.id === userId);
        if (user) {
            let bannedUntil = null;
            if (durationHours) {
                const date = new Date();
                date.setHours(date.getHours() + durationHours);
                bannedUntil = date.toISOString();
            } else {
                // Permanent ban (99 years)
                const date = new Date();
                date.setFullYear(date.getFullYear() + 99);
                bannedUntil = date.toISOString();
            }

            console.log(`[ADMIN] Banning user ${userId} until ${bannedUntil}`);

            // We use execute to persist
            execute("UPDATE users SET banned_until = ? WHERE id = ?", [bannedUntil, userId]);

            revalidatePath("/admin");
            return { success: true, banned_until: bannedUntil };
        }
        return { error: "User not found" };
    } catch (banError) {
        console.error("Ban user failed", banError);
        return { error: "Failed" };
    }
}

export async function unbanUser(userId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    try {
        console.log(`[ADMIN] Unbanning user ${userId}`);
        execute("UPDATE users SET banned_until = ? WHERE id = ?", [null, userId]);
        revalidatePath("/admin");
        return { success: true };
    } catch (unbanError) {
        console.error("Unban user failed", unbanError);
        return { error: "Failed" };
    }
}
