"use server";

import { loadData } from "@/lib/db";
import { auth } from "@/auth";

export async function getDashboardStats() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

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

    return {
        accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
        avgSpeed: avgSpeed.toFixed(2) + "s",
        totalXP: userSessions.reduce((acc, s) => acc + (s.xp_earned || 0), 0),
        recentSessions: userSessions.slice(-10).reverse(),
        masteryMap
    };
}
