"use server";

import { loadData, queryOne, type UserRow } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState, ensureLeagueParticipation } from "@/lib/league-engine";

export async function getDashboardStats() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as { id: string }).id;
    
    // Guard against missing userId
    if (!userId) {
        console.error('[getDashboardStats] User session exists but userId is missing');
        return null;
    }

    await syncLeagueState();
    const db = loadData();
    interface SessionRow {
        user_id: string;
        correct_count?: number;
        total_count?: number;
        avg_speed?: number;
        operation?: string;
        [key: string]: unknown;
    }
    interface MasteryRow {
        user_id: string;
        operation?: string;
        [key: string]: unknown;
    }
    const userSessions = (db.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId);
    const userMastery = (db.mastery_stats as MasteryRow[]).filter((s: MasteryRow) => s.user_id === userId);

    const totalCorrect = userSessions.reduce((acc: number, s: SessionRow) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc: number, s: SessionRow) => acc + (s.total_count || 0), 0);
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc: number, s: SessionRow) => acc + (s.avg_speed || 0), 0) / userSessions.length
        : 0;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;

    // Tiers map
    let userTiers = user?.math_tiers;
    if (typeof userTiers === 'string') {
        try { userTiers = JSON.parse(userTiers); } catch { userTiers = null; }
    }
    userTiers = userTiers || { addition: 1, subtraction: 1, multiplication: 1, division: 1 };

    // Skill points for tier completion bar
    let skillPoints = user?.skill_points;
    if (typeof skillPoints === 'string') {
        try { skillPoints = JSON.parse(skillPoints); } catch { skillPoints = null; }
    }
    skillPoints = skillPoints || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };

    // Calculate mastery % for each op
    // Simple system: 100 skill points = 100% tier completion
    const ops = ["Addition", "Subtraction", "Multiplication", "Division"];
    const masteryMap = ops.map(op => {
        const opLower = op.toLowerCase();
        const tier = userTiers[opLower] || 1;
        const points = skillPoints[opLower] || 0;

        // Progress is percentage of 100 points needed to complete tier
        // Each tier requires 100 points to complete
        const progress = Math.min(100, Math.round(points));

        return {
            title: op,
            tier: tier,
            progress: progress
        };
    });


    // Career Stats Calculation
    const careerTotalCorrect = userSessions.length > 0 ? userSessions.reduce((acc: number, s: SessionRow) => acc + (s.correct_count || 0), 0) : 0;
    const careerTotalAttempts = userSessions.length > 0 ? userSessions.reduce((acc: number, s: SessionRow) => acc + (s.total_count || 0), 0) : 0;
    const careerAccuracy = careerTotalAttempts > 0 ? (careerTotalCorrect / careerTotalAttempts) * 100 : 0;

    // Detailed Operation Stats
    const opStats = ops.map(op => {
        const opSessions = userSessions.filter((s: SessionRow) => s.operation === op);
        const opCorrect = opSessions.reduce((acc: number, s: SessionRow) => acc + (s.correct_count || 0), 0);
        const opTotal = opSessions.reduce((acc: number, s: SessionRow) => acc + (s.total_count || 0), 0);
        const opXP = opSessions.reduce((acc: number, s: SessionRow) => acc + ((s as { xp_earned?: number }).xp_earned || 0), 0);
        const opAvgSpeed = opSessions.length > 0
            ? opSessions.reduce((acc: number, s: SessionRow) => acc + (s.avg_speed || 0), 0) / opSessions.length
            : 0;

        return {
            op,
            accuracy: opTotal > 0 ? (opCorrect / opTotal) * 100 : 0,
            avgSpeed: opAvgSpeed,
            totalXP: opXP,
            sessionsPlayed: opSessions.length
        };
    });

    // Determine weakest link based on accuracy (excluding ops with no plays if possible, else default)
    const playedOps = opStats.filter(s => s.sessionsPlayed > 0);
    const weakestLink = playedOps.length > 0
        ? playedOps.sort((a, b) => a.accuracy - b.accuracy)[0]
        : { op: "None", accuracy: 0 };

    // Check if user needs placement (all tiers are 0)
    const hasPlaced = Object.values(userTiers).some((t: number) => t > 0);

    // Accuracy History (Last 10)
    const accuracyHistory = userSessions.slice(-10).map((s: SessionRow) => ({
        id: s.id as string,
        accuracy: (s.total_count || 0) > 0 ? ((s.correct_count || 0) / (s.total_count || 1)) * 100 : 0,
        xp: (s as { xp_earned?: number }).xp_earned || 0
    }));

    // Ensure league participation
    await ensureLeagueParticipation(userId, session.user.name || "Pilot");

    // Title Lookup
    interface EquippedItems {
        title?: string;
        [key: string]: unknown;
    }
    const equippedItems = (user?.equipped_items ? JSON.parse(user.equipped_items as string) : {}) as EquippedItems;
    const titleId = equippedItems?.title;
    let equippedTitle = "";
    if (titleId && titleId !== 'default') {
        const { ITEMS } = require("@/lib/items");
        // Prefer DB items if available to reflect dynamic changes
        interface ShopItem {
            id: string;
            name?: string;
            assetValue?: string;
        }
        const dbShopItems = (db.shop_items as ShopItem[]) || [];
        const item = dbShopItems.find((i: ShopItem) => i.id === titleId) || ITEMS.find((i: ShopItem) => i.id === titleId);

        if (item) equippedTitle = item.name || item.assetValue;
    }

    // Calculate user's league rank
    const leagueId = user?.current_league_id || 'neon-league';
    interface LeagueParticipant {
        league_id: string;
        user_id: string;
        weekly_xp?: number;
    }
    const leagueParticipants = (db.league_participants as LeagueParticipant[]).filter((p: LeagueParticipant) => p.league_id === leagueId);
    const sortedParticipants = [...leagueParticipants].sort((a: LeagueParticipant, b: LeagueParticipant) => (b.weekly_xp || 0) - (a.weekly_xp || 0));
    const userRank = sortedParticipants.findIndex((p: LeagueParticipant) => p.user_id === userId) + 1;

    return {
        accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
        avgSpeed: avgSpeed.toFixed(2) + "s",
        totalXP: user?.total_xp || 0,
        coins: user?.coins || 0,
        level: user?.level || 1,
        leagueId: leagueId,
        equippedTitle,
        userRank: userRank > 0 ? userRank : null, // null if not in league yet
        recentSessions: userSessions.slice(-5).reverse(), // Limit to last 5
        totalSessions: userSessions.length, // Full count
        masteryMap,
        careerStats: {
            lifetimeAccuracy: careerAccuracy,
            weakestLink: weakestLink.op,
            history: accuracyHistory,
            detailedOps: opStats
        },
        hasPlaced
    };
}

export async function getOperationDetails(operation: string) {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as { id: string }).id;

    const db = loadData();
    // Case-insensitive match for operation
    interface SessionRow {
        user_id: string;
        operation?: string;
        correct_count?: number;
        total_count?: number;
        avg_speed?: number;
        xp_earned?: number;
        created_at?: string;
        id?: string;
        [key: string]: unknown;
    }
    interface MasteryRow {
        user_id: string;
        operation?: string;
        mastery_level?: number;
        fact?: string;
        attempts?: number;
        last_practiced?: string;
        [key: string]: unknown;
    }
    const opSessions = (db.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId && s.operation?.toLowerCase() === operation.toLowerCase());
    const opMastery = (db.mastery_stats as MasteryRow[]).filter((s: MasteryRow) => s.user_id === userId && s.operation?.toLowerCase() === operation.toLowerCase());

    // Calculate Summary Stats
    const totalCorrect = opSessions.reduce((acc: number, s: SessionRow) => acc + (s.correct_count || 0), 0);
    const totalAttempts = opSessions.reduce((acc: number, s: SessionRow) => acc + (s.total_count || 0), 0);
    const totalXP = opSessions.reduce((acc: number, s: SessionRow) => acc + (s.xp_earned || 0), 0);
    const avgSpeed = opSessions.length > 0
        ? opSessions.reduce((acc: number, s: SessionRow) => acc + (s.avg_speed || 0), 0) / opSessions.length
        : 0;

    // Identify Missed Problems (Mastery < 3 means not fully mastered, < 0 means struggling)
    // Sorting by mastery level ascending (lowest first)
    const missedProblems = opMastery
        .filter((m: MasteryRow) => (m.mastery_level || 0) < 3)
        .sort((a: MasteryRow, b: MasteryRow) => (a.mastery_level || 0) - (b.mastery_level || 0))
        .slice(0, 20) // Top 20 needs work
        .map((m: MasteryRow) => ({
            fact: m.fact || '',
            mastery: m.mastery_level || 0,
            attempts: m.attempts || 0,
            lastPracticed: m.last_practiced || ''
        }));

    // Trend Graph (Last 10 sessions for this op)
    const trend = opSessions.slice(-10).map((s: SessionRow, index: number) => ({
        id: s.id || `session-${index}`,
        date: s.created_at ? new Date(s.created_at).toLocaleDateString() : `Session ${index + 1}`,
        accuracy: (s.total_count || 0) > 0 ? ((s.correct_count || 0) / (s.total_count || 1)) * 100 : 0,
        speed: s.avg_speed || 0
    }));

    return {
        operation: operation.charAt(0).toUpperCase() + operation.slice(1),
        accuracy: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0,
        avgSpeed: avgSpeed.toFixed(2),
        totalXP,
        totalPlays: opSessions.length,
        missedProblems,
        trend
    };
}

/**
 * Get detailed operation stats for graphs and modal view
 */
export async function getOperationStats(operation: string) {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as { id: string }).id;

    const db = loadData();
    const opLower = operation.toLowerCase();

    // Get all sessions for this operation
    interface SessionRow {
        user_id: string;
        operation?: string;
        created_at: string;
        correct_count?: number;
        total_count?: number;
        avg_speed?: number;
        xp_earned?: number;
        [key: string]: unknown;
    }
    const opSessions = (db.sessions as SessionRow[])
        .filter((s: SessionRow) => s.user_id === userId && s.operation?.toLowerCase() === opLower)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Session logs (last 50)
    const sessionLogs = opSessions.slice(-50).map((s, idx) => ({
        index: idx + 1,
        date: s.created_at,
        speed: s.avg_speed || 0,
        accuracy: s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0,
        correct: s.correct_count || 0,
        total: s.total_count || 0,
        xp: s.xp_earned || 0,
    }));

    // Group by day (last 30 days)
    const dailyMap = new Map<string, { total: number; correct: number; speed: number; count: number }>();
    opSessions.forEach(s => {
        const day = new Date(s.created_at).toISOString().split('T')[0];
        const existing = dailyMap.get(day) || { total: 0, correct: 0, speed: 0, count: 0 };
        dailyMap.set(day, {
            total: existing.total + (s.total_count || 0),
            correct: existing.correct + (s.correct_count || 0),
            speed: existing.speed + (s.avg_speed || 0),
            count: existing.count + 1,
        });
    });

    const dailyActivity = Array.from(dailyMap.entries())
        .map(([day, data]) => ({
            date: day,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            avgSpeed: data.count > 0 ? data.speed / data.count : 0,
            sessions: data.count,
        }))
        .slice(-30);

    // Group by month (last 12 months)
    const monthlyMap = new Map<string, { total: number; correct: number; speed: number; count: number }>();
    opSessions.forEach(s => {
        const month = new Date(s.created_at).toISOString().slice(0, 7); // YYYY-MM
        const existing = monthlyMap.get(month) || { total: 0, correct: 0, speed: 0, count: 0 };
        monthlyMap.set(month, {
            total: existing.total + (s.total_count || 0),
            correct: existing.correct + (s.correct_count || 0),
            speed: existing.speed + (s.avg_speed || 0),
            count: existing.count + 1,
        });
    });

    const monthlyActivity = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
            month,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            avgSpeed: data.count > 0 ? data.speed / data.count : 0,
            sessions: data.count,
        }))
        .slice(-12);

    // Top speeds (fastest 10 sessions by avg_speed)
    const topSpeeds = [...opSessions]
        .filter(s => s.avg_speed && s.avg_speed > 0)
        .sort((a, b) => a.avg_speed - b.avg_speed)
        .slice(0, 10)
        .map((s, idx) => ({
            rank: idx + 1,
            date: s.created_at,
            speed: s.avg_speed,
            accuracy: s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0,
        }));

    return {
        operation: operation.charAt(0).toUpperCase() + operation.slice(1),
        sessionLogs,
        dailyActivity,
        monthlyActivity,
        topSpeeds,
        totalSessions: opSessions.length,
    };
}
