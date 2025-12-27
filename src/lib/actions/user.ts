"use server";

import { loadData, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState, ensureLeagueParticipation } from "@/lib/league-engine";

export async function getDashboardStats() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

    await syncLeagueState();
    const db = loadData();
    const userSessions = (db.sessions as any[]).filter((s: any) => s.user_id === userId);
    const userMastery = (db.mastery_stats as any[]).filter((s: any) => s.user_id === userId);

    const totalCorrect = userSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / userSessions.length
        : 0;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    // Tiers map
    const userTiers = user?.math_tiers || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };

    // Calculate mastery % for each op
    // We blend "Real Mastery" (facts mastered) with "Tier Progress" (placement result)
    // to give immediate feedback.
    const ops = ["Addition", "Subtraction", "Multiplication", "Division"];
    const masteryMap = ops.map(op => {
        const opLower = op.toLowerCase();
        const opMastery = userMastery.filter((m: any) => m.operation.toLowerCase() === opLower);

        // Calculate progress based on total mastery points earned
        // Each fact can have mastery 0-5, assume 50 facts per tier, 5 mastery each = 250 max points per tier
        // But for simpler feedback: count total mastery points / expected points for meaningful progress
        const totalMasteryPoints = opMastery.reduce((acc: number, m: any) => acc + (m.mastery_level || 0), 0);
        // 25 facts with avg mastery of 2 = 50 points per 25% tier progress
        // So let's say 100 points = 100% tier progress for simpler math
        const realProgress = Math.min(100, Math.round(totalMasteryPoints));

        // Tier Implied Progress
        // Tier 4 = 75% start (Simulated mastery of tiers 1-3)
        // Tier 3 = 50% start
        // Tier 2 = 25% start
        // Tier 1 = 0% start
        const tier = userTiers[opLower] || 1;
        const tierBase = (tier - 1) * 25;

        // Calculate progress WITHIN the current tier
        // realProgress is now mastery points earned, which directly contributes to bar fill
        // Scale: 100 mastery points fills 100% of a tier
        const effectiveProgress = Math.min(100, tierBase + realProgress);

        // now scale it to 0-100 for just this tier
        // range of current tier is [tierBase, tierBase + 25]
        const progressInTier = Math.round(Math.min(100, Math.max(0, (effectiveProgress - tierBase) / 25 * 100)));

        return {
            title: op,
            tier: tier,
            progress: progressInTier
        };
    });


    // Career Stats Calculation
    const careerTotalCorrect = userSessions.length > 0 ? userSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0) : 0;
    const careerTotalAttempts = userSessions.length > 0 ? userSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0) : 0;
    const careerAccuracy = careerTotalAttempts > 0 ? (careerTotalCorrect / careerTotalAttempts) * 100 : 0;

    // Detailed Operation Stats
    const opStats = ops.map(op => {
        const opSessions = userSessions.filter((s: any) => s.operation === op);
        const opCorrect = opSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
        const opTotal = opSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
        const opXP = opSessions.reduce((acc: number, s: any) => acc + (s.xp_earned || 0), 0);
        const opAvgSpeed = opSessions.length > 0
            ? opSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / opSessions.length
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
    const hasPlaced = Object.values(userTiers).some((t: any) => t > 0);

    // Accuracy History (Last 10)
    const accuracyHistory = userSessions.slice(-10).map((s: any) => ({
        id: s.id,
        accuracy: s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0,
        xp: s.xp_earned
    }));

    // Ensure league participation
    await ensureLeagueParticipation(userId, session.user.name || "Pilot");

    // Title Lookup
    const titleId = (user?.equipped_items as any)?.title;
    let equippedTitle = "";
    if (titleId && titleId !== 'default') {
        const { ITEMS } = require("@/lib/items");
        // Prefer DB items if available to reflect dynamic changes
        const dbShopItems = db.shop_items as any[] || [];
        const item = dbShopItems.find((i: any) => i.id === titleId) || ITEMS.find((i: any) => i.id === titleId);

        if (item) equippedTitle = item.name || item.assetValue;
    }

    // Calculate user's league rank
    const leagueId = user?.current_league_id || 'neon-league';
    const leagueParticipants = db.league_participants.filter((p: any) => p.league_id === leagueId);
    const sortedParticipants = [...leagueParticipants].sort((a: any, b: any) => b.weekly_xp - a.weekly_xp);
    const userRank = sortedParticipants.findIndex((p: any) => p.user_id === userId) + 1;

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
    const userId = (session.user as any).id;

    const db = loadData();
    // Case-insensitive match for operation
    const opSessions = (db.sessions as any[]).filter((s: any) => s.user_id === userId && s.operation.toLowerCase() === operation.toLowerCase());
    const opMastery = (db.mastery_stats as any[]).filter((s: any) => s.user_id === userId && s.operation.toLowerCase() === operation.toLowerCase());

    // Calculate Summary Stats
    const totalCorrect = opSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const totalAttempts = opSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
    const totalXP = opSessions.reduce((acc: number, s: any) => acc + (s.xp_earned || 0), 0);
    const avgSpeed = opSessions.length > 0
        ? opSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / opSessions.length
        : 0;

    // Identify Missed Problems (Mastery < 3 means not fully mastered, < 0 means struggling)
    // Sorting by mastery level ascending (lowest first)
    const missedProblems = opMastery
        .filter((m: any) => m.mastery_level < 3)
        .sort((a: any, b: any) => a.mastery_level - b.mastery_level)
        .slice(0, 20) // Top 20 needs work
        .map((m: any) => ({
            fact: m.fact,
            mastery: m.mastery_level,
            attempts: m.attempts,
            lastPracticed: m.last_practiced
        }));

    // Trend Graph (Last 10 sessions for this op)
    const trend = opSessions.slice(-10).map((s: any, index: number) => ({
        id: s.id,
        date: s.created_at ? new Date(s.created_at).toLocaleDateString() : `Session ${index + 1}`,
        accuracy: s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0,
        speed: s.avg_speed
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
