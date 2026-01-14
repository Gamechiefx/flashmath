"use server";

import { execute, loadData, saveData, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { syncLeagueState } from "@/lib/league-engine";
import { generateProblemForSession, checkProgression, MathOperation, generateMasteryTest } from "@/lib/math-tiers";
import { MAX_TIER, isAtBandBoundary, getBandForTier, checkMilestoneReward, isMasteryTestAvailable } from "@/lib/tier-system";

export async function getNextProblems(operation: string, count: number = 20) {
    const session = await auth();

    // For unauthenticated users (quick practice), use default tier 1
    let currentTier = 1;

    if (session?.user) {
        const userId = (session.user as any).id;
        const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

        if (user && user.math_tiers) {
            currentTier = (user.math_tiers as any)[operation.toLowerCase()] || 1;
        }
    }

    // If tier is 0, it means placement is needed - default to Tier 1
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

        // Update Skill Points for tier completion bar
        // Net points: +1 for correct, -1 for wrong
        // Only award skill points if at least 10 questions were answered
        if (totalCount >= 10) {
            const netSkillPoints = correctCount - (totalCount - correctCount); // = 2*correct - total
            const opLower = operation.toLowerCase();

            let skillPoints = user.skill_points;
            if (typeof skillPoints === 'string') {
                try { skillPoints = JSON.parse(skillPoints); } catch { skillPoints = null; }
            }
            skillPoints = skillPoints || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };

            // Update points for this operation (can go negative, min 0)
            skillPoints[opLower] = Math.max(0, (skillPoints[opLower] || 0) + netSkillPoints);

            console.log(`[SAVE_SESSION] Skill points for ${opLower}: ${netSkillPoints} net, new total: ${skillPoints[opLower]}`);

            execute(
                "UPDATE users SET skill_points = ? WHERE id = ?",
                [JSON.stringify(skillPoints), userId]
            );
        } else {
            console.log(`[SAVE_SESSION] Skipping skill points - only ${totalCount} questions (need 10+)`);
        }
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
 *
 * 100-tier system: Tests available every 10 tiers
 * - Within-band tests: 5 questions, 80% required
 * - Cross-band tests (tier 20, 40, 60, 80): 10 questions, 90% required
 */
export async function getMasteryTestProblems(operation: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const currentTier = user?.math_tiers?.[operation.toLowerCase()] || 1;

    // Already at max tier
    if (currentTier >= MAX_TIER) {
        return { error: "Already at max tier" };
    }

    // Check if mastery test is available for this tier
    if (!isMasteryTestAvailable(currentTier)) {
        return { error: "Mastery test not available at this tier" };
    }

    const { problems, requiredAccuracy } = generateMasteryTest(
        operation.toLowerCase() as MathOperation,
        currentTier
    );
    const band = getBandForTier(currentTier);
    const isBandBoundary = isAtBandBoundary(currentTier);

    return {
        problems,
        currentTier,
        operation,
        requiredAccuracy,
        isBandBoundary,
        bandName: band.name,
    };
}

/**
 * Complete mastery test - advance tier if passed
 *
 * 100-tier system:
 * - Within-band tests: 80% required, advance 1-5 tiers (to next test point)
 * - Cross-band tests: 90% required, advance to next band
 * - Milestone rewards at 5/10/20 tier intervals
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
    const isBandBoundary = isAtBandBoundary(currentTier);
    const requiredAccuracy = isBandBoundary ? 90 : 80;
    const passed = accuracy >= requiredAccuracy;

    if (passed && currentTier < MAX_TIER) {
        // Calculate new tier (advance to next milestone or band)
        let newTier: number;
        if (isBandBoundary) {
            // Cross band boundary - advance to next band start
            const currentBand = getBandForTier(currentTier);
            newTier = Math.min(MAX_TIER, currentBand.tierRange[1] + 1);
        } else {
            // Advance to next test tier (every 10)
            const nextTestTier = Math.ceil((currentTier + 1) / 10) * 10;
            newTier = Math.min(MAX_TIER, nextTestTier);
        }

        // Update tier
        const updated = { ...currentTiers, [opKey]: newTier };
        execute("UPDATE users SET math_tiers = ? WHERE id = ?", [updated, userId]);

        // Check for milestone rewards
        const milestone = checkMilestoneReward(currentTier, newTier);
        let coinsAwarded = 0;
        let xpAwarded = 0;

        if (milestone) {
            coinsAwarded = milestone.coins;
            xpAwarded = milestone.xp;

            // Award coins and XP
            const currentCoins = Number(user.coins) || 0;
            const currentXp = Number(user.total_xp) || 0;
            execute(
                "UPDATE users SET coins = ?, total_xp = ? WHERE id = ?",
                [currentCoins + coinsAwarded, currentXp + xpAwarded, userId]
            );
        }

        // Reset skill points only at band boundaries
        if (isBandBoundary) {
            let skillPoints = user.skill_points;
            if (typeof skillPoints === 'string') {
                try { skillPoints = JSON.parse(skillPoints); } catch { skillPoints = null; }
            }
            skillPoints = skillPoints || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
            skillPoints[opKey] = 0;
            execute("UPDATE users SET skill_points = ? WHERE id = ?", [JSON.stringify(skillPoints), userId]);

            // Clear mastery stats for this operation at band boundaries
            const { getDatabase } = await import("@/lib/db");
            const db = getDatabase();
            db.prepare('DELETE FROM mastery_stats WHERE user_id = ? AND operation = ?').run(userId, operation);
        }

        revalidatePath("/practice");
        revalidatePath("/dashboard");

        const newBand = getBandForTier(newTier);
        return {
            success: true,
            passed: true,
            newTier,
            previousTier: currentTier,
            accuracy,
            bandName: newBand.name,
            crossedBand: isBandBoundary,
            milestone: milestone ? {
                type: milestone.type,
                coins: coinsAwarded,
                xp: xpAwarded,
            } : null,
        };
    }

    return {
        success: true,
        passed: false,
        newTier: currentTier,
        accuracy,
        requiredAccuracy,
        message: `Need ${requiredAccuracy}% to pass. You got ${accuracy.toFixed(0)}%`
    };
}
