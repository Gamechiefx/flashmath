"use server";

import { loadData, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState } from "@/lib/league-engine";

export async function getDashboardStats() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

    await syncLeagueState();
    const db = loadData();
    const userSessions = db.sessions.filter(s => s.user_id === userId);
    const userMastery = db.mastery_stats.filter(s => s.user_id === userId);

    const totalCorrect = userSessions.reduce((acc, s) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc, s) => acc + (s.total_count || 0), 0);
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc, s) => acc + s.avg_speed, 0) / userSessions.length
        : 0;

    // Calculate mastery % for each op (placeholder logic: count facts with mastery > 2)
    const ops = ["Addition", "Subtraction", "Multiplication", "Division"];
    const masteryMap = ops.map(op => {
        const opMastery = userMastery.filter(m => m.operation.toLowerCase() === op.toLowerCase());
        const masteredCount = opMastery.filter(m => m.mastery_level >= 3).length;
        // Assuming 100 possible facts per operation for now
        return {
            title: op,
            progress: Math.min(100, Math.round((masteredCount / 100) * 100))
        };
    });

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    return {
        accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
        avgSpeed: avgSpeed.toFixed(2) + "s",
        totalXP: user?.total_xp || 0,
        coins: user?.coins || 0,
        level: user?.level || 1,
        leagueId: user?.current_league_id || 'neon-league',
        recentSessions: userSessions.slice(-10).reverse(),
        masteryMap
    };
}
