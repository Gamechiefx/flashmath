"use server";

import { execute, loadData, saveData, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { syncLeagueState } from "@/lib/league-engine";
import { generateProblemForSession, checkProgression, MathOperation, generateMasteryTest } from "@/lib/math-tiers";

export async function getNextProblems(operation: string, count: number = 20) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    // Default to Tier 1 if missing
    let currentTier = 1;
    if (user && user.math_tiers) {
        currentTier = (user.math_tiers as any)[operation.toLowerCase()] || 1;
    }

    // If tier is 0, it means placement is needed.
    // The UI should normally handle this by showing "Placement Test" button,
    // but if we get here, serve Tier 1 but maybe flag it?
    // Actually, let's just serve Tier 1.
    if (currentTier === 0) currentTier = 1;

    const problems = [];
    for (let i = 0; i < count; i++) {
        problems.push(generateProblemForSession(operation.toLowerCase() as MathOperation, currentTier));
    }

    return { problems, currentTier };
}

export async function updateTiers(newTiers: Record<string, number>) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (!user) return { error: "User not found" };

    // Merge provided tiers with existing
    const currentTiers = user.math_tiers || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
    const updated = { ...currentTiers, ...newTiers };

    // In a real DB we'd use a proper update. Here we hack the JSON object via execute helper or direct
    // Since execute handles "math_tiers = ?" by checking for param[0]
    // We can use that.

    execute("UPDATE users SET math_tiers = ? WHERE id = ?", [updated, userId]);
    revalidatePath("/practice");
    return { success: true };
}

export async function saveSession(sessionData: any) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    const { operation, correctCount, totalCount, avgSpeed, xpGained: rawXpGained, maxStreak = 0 } = sessionData;
    const xpGained = Number(rawXpGained) || 0;
    const userId = (session.user as any).id;

    console.log(`[SAVE_SESSION] User: ${userId}, XP: ${xpGained}, Op: ${operation}`);

    execute(
        "INSERT INTO sessions (user_id, operation, correct_count, total_count, avg_speed, xp_earned) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, operation, correctCount, totalCount, avgSpeed, xpGained]
    );

    // 🏆 LEAGUE & LEVELING SYSTEM
    await syncLeagueState(); // Process any time-based resets

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (user) {
        const currentTotalXp = Number(user.total_xp) || 0;
        const newTotalXp = currentTotalXp + xpGained;
        const newLevel = Math.floor(newTotalXp / 1000) + 1;
        const coinsEarned = Math.floor(xpGained * 0.5); // 1 Flux per 2 XP
        const newCoins = (Number(user.coins) || 0) + coinsEarned;

        console.log(`[SAVE_SESSION] Updating User: ${userId}. New Total XP: ${newTotalXp}, Level: ${newLevel}`);

        execute(
            "UPDATE users SET total_xp = ?, level = ?, coins = ? WHERE id = ?",
            [newTotalXp, newLevel, newCoins, userId]
        );

        // Update League XP
        execute(
            "INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)",
            [user.current_league_id || 'neon-league', userId, user.name || 'Unknown Pilot', xpGained]
        );
    }

    // 🏅 CHECK ACHIEVEMENTS
    const { checkSessionAchievements } = await import("@/lib/actions/achievements");
    await checkSessionAchievements(userId, correctCount, totalCount, avgSpeed, maxStreak);

    revalidatePath("/dashboard", "page");
    revalidatePath("/leaderboard", "page");
    revalidatePath("/", "layout");
    return { success: true };
}

export async function updateMastery(stats: any[]) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const { getDatabase, generateId, now } = await import("@/lib/db");
    const db = getDatabase();

    stats.forEach(stat => {
        const { fact, operation, responseTime, masteryDelta } = stat;

        // Find existing stat for this user/fact/op
        const existing = db.prepare(
            'SELECT id, mastery_level FROM mastery_stats WHERE user_id = ? AND fact = ? AND operation = ?'
        ).get(userId, fact, operation) as { id: string; mastery_level: number } | undefined;

        if (existing) {
            // Update existing
            const newMastery = Math.max(0, Math.min(5, existing.mastery_level + masteryDelta));
            db.prepare(`
                UPDATE mastery_stats 
                SET last_response_time = ?, mastery_level = ?, updated_at = ?
                WHERE id = ?
            `).run(responseTime, newMastery, now(), existing.id);
        } else {
            // Insert new
            db.prepare(`
                INSERT INTO mastery_stats (id, user_id, operation, fact, last_response_time, mastery_level, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                generateId(),
                userId,
                operation,
                fact,
                responseTime,
                Math.max(0, Math.min(5, masteryDelta)),
                now()
            );
        }
    });

    revalidatePath("/dashboard");
    return { success: true };
}

/**
 * Get mastery test problems for a specific operation
 */
export async function getMasteryTestProblems(operation: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const currentTier = user?.math_tiers?.[operation.toLowerCase()] || 1;

    // Can't take mastery test for tier 4 (already max)
    if (currentTier >= 4) {
        return { error: "Already at max tier" };
    }

    const problems = generateMasteryTest(operation.toLowerCase() as MathOperation, currentTier);
    return { problems, currentTier, operation };
}

/**
 * Complete mastery test - advance tier if passed
 * Requires 80% accuracy to pass
 */
export async function completeMasteryTest(operation: string, correctCount: number, totalCount: number) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (!user) return { error: "User not found" };

    const currentTiers = user.math_tiers || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
    const opKey = operation.toLowerCase();
    const currentTier = currentTiers[opKey] || 1;

    const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
    const passed = accuracy >= 80;

    if (passed && currentTier < 4) {
        // Advance to next tier
        const updated = { ...currentTiers, [opKey]: currentTier + 1 };
        execute("UPDATE users SET math_tiers = ? WHERE id = ?", [updated, userId]);

        // Clear mastery stats for this operation so progress resets for new tier
        const { getDatabase } = await import("@/lib/db");
        const db = getDatabase();
        db.prepare('DELETE FROM mastery_stats WHERE user_id = ? AND operation = ?').run(userId, operation);

        revalidatePath("/practice");
        revalidatePath("/dashboard");

        return {
            success: true,
            passed: true,
            newTier: currentTier + 1,
            accuracy
        };
    }

    return {
        success: true,
        passed: false,
        newTier: currentTier,
        accuracy,
        message: `Need 80% to pass. You got ${accuracy.toFixed(0)}%`
    };
}
