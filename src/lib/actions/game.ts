"use server";

import { execute, loadData, saveData, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { syncLeagueState } from "@/lib/league-engine";

export async function saveSession(sessionId: any) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    const { operation, correctCount, totalCount, avgSpeed, xpGained } = sessionId;
    const userId = (session.user as any).id;

    execute(
        "INSERT INTO sessions (user_id, operation, correct_count, total_count, avg_speed, xp_earned) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, operation, correctCount, totalCount, avgSpeed, xpGained]
    );

    // 🏆 LEAGUE & LEVELING SYSTEM
    await syncLeagueState(); // Process any time-based resets

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (user) {
        const newTotalXp = (user.total_xp || 0) + xpGained;
        const newLevel = Math.floor(newTotalXp / 1000) + 1; // 1000 XP per level
        const coinsEarned = Math.floor(xpGained * 0.5); // 1 Flux per 2 XP
        const newCoins = (user.coins || 0) + coinsEarned;

        execute(
            "UPDATE users SET total_xp = ?, level = ?, coins = ? WHERE id = ?",
            [newTotalXp, newLevel, newCoins, userId]
        );

        // Update League XP
        execute(
            "INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)",
            [user.current_league_id || 'neon-league', userId, user.name, xpGained]
        );
    }

    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    return { success: true };
}

export async function updateMastery(stats: any[]) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    // Load current data to check existing stats
    const db = loadData();

    stats.forEach(stat => {
        const { fact, operation, responseTime, masteryDelta } = stat;

        // Find existing stat for this user/fact/op
        const existingIdx = db.mastery_stats.findIndex(s =>
            s.user_id === userId && s.fact === fact && s.operation === operation
        );

        if (existingIdx > -1) {
            // Update existing
            db.mastery_stats[existingIdx].last_response_time = responseTime;
            db.mastery_stats[existingIdx].mastery_level = Math.max(0, Math.min(5, db.mastery_stats[existingIdx].mastery_level + masteryDelta));
            db.mastery_stats[existingIdx].updated_at = new Date().toISOString();
        } else {
            // Insert new
            db.mastery_stats.push({
                id: Date.now() + Math.random(),
                user_id: userId,
                operation,
                fact,
                last_response_time: responseTime,
                mastery_level: Math.max(0, Math.min(5, masteryDelta)),
                updated_at: new Date().toISOString()
            });
        }
    });

    saveData();
    revalidatePath("/dashboard");
    return { success: true };
}
