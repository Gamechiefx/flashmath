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
    const userSessions = db.sessions.filter(s => s.user_id === userId);
    const userMastery = db.mastery_stats.filter(s => s.user_id === userId);

    const totalCorrect = userSessions.reduce((acc, s) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc, s) => acc + (s.total_count || 0), 0);
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc, s) => acc + s.avg_speed, 0) / userSessions.length
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
        const opMastery = userMastery.filter(m => m.operation.toLowerCase() === opLower);
        const masteredCount = opMastery.filter(m => m.mastery_level >= 3).length;
        const realProgress = Math.min(100, Math.round((masteredCount / 100) * 100)); // Assuming 100 facts base

        // Tier Implied Progress
        // Tier 4 = 75% start (Simulated mastery of tiers 1-3)
        // Tier 3 = 50% start
        // Tier 2 = 25% start
        // Tier 1 = 0% start
        const tier = userTiers[opLower] || 1;
        const tierBase = (tier - 1) * 25;

        // Calculate progress WITHIN the current tier
        // e.g. if I am Tier 1, my progress is RealProgress / 25 * 100 (since tier 1 is first 25%)
        // if I am Tier 2, my progress is (RealProgress - 25) / 25 * 100
        // But what if RealProgress < TierBase (e.g. placed tier 3, but 0 facts)? then undefined.
        // We initially set "RealProgress" based on fact count.
        // If we are "placed" in a tier, we assume previous tiers are mastered.
        // So we should assume RealProgress is AT LEAST TierBase.

        // But if we use Math.max, and the user has 0 actual mastery facts (fresh placement),
        // they have to master 25 facts before the bar moves from 0% (if Tier 2).
        // User wants immediate feedback.
        // So we treat 'realProgress' (facts mastered) as ADDITIVE to the tier base.
        // Assumption: Any fact you master now contributes to moving through the current tier.

        const effectiveProgress = Math.min(100, tierBase + realProgress);

        // now scale it to 0-100 for just this tier
        // range of current tier is [tierBase, tierBase + 25]
        const progressInTier = Math.min(100, Math.max(0, (effectiveProgress - tierBase) / 25 * 100));

        return {
            title: op,
            tier: tier,
            progress: progressInTier
        };
    });


    // Career Stats Calculation
    const careerTotalCorrect = userSessions.length > 0 ? userSessions.reduce((acc, s) => acc + (s.correct_count || 0), 0) : 0;
    const careerTotalAttempts = userSessions.length > 0 ? userSessions.reduce((acc, s) => acc + (s.total_count || 0), 0) : 0;
    const careerAccuracy = careerTotalAttempts > 0 ? (careerTotalCorrect / careerTotalAttempts) * 100 : 0;

    // Detailed Operation Stats
    const opStats = ops.map(op => {
        const opSessions = userSessions.filter(s => s.operation === op);
        const opCorrect = opSessions.reduce((acc, s) => acc + (s.correct_count || 0), 0);
        const opTotal = opSessions.reduce((acc, s) => acc + (s.total_count || 0), 0);
        const opXP = opSessions.reduce((acc, s) => acc + (s.xp_earned || 0), 0);
        const opAvgSpeed = opSessions.length > 0
            ? opSessions.reduce((acc, s) => acc + s.avg_speed, 0) / opSessions.length
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
    const accuracyHistory = userSessions.slice(-10).map(s => ({
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

    return {
        accuracy: totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0,
        avgSpeed: avgSpeed.toFixed(2) + "s",
        totalXP: user?.total_xp || 0,
        coins: user?.coins || 0,
        level: user?.level || 1,
        leagueId: user?.current_league_id || 'neon-league',
        equippedTitle, // Added
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
    const opSessions = db.sessions.filter(s => s.user_id === userId && s.operation.toLowerCase() === operation.toLowerCase());
    const opMastery = db.mastery_stats.filter(s => s.user_id === userId && s.operation.toLowerCase() === operation.toLowerCase());

    // Calculate Summary Stats
    const totalCorrect = opSessions.reduce((acc, s) => acc + (s.correct_count || 0), 0);
    const totalAttempts = opSessions.reduce((acc, s) => acc + (s.total_count || 0), 0);
    const totalXP = opSessions.reduce((acc, s) => acc + (s.xp_earned || 0), 0);
    const avgSpeed = opSessions.length > 0
        ? opSessions.reduce((acc, s) => acc + s.avg_speed, 0) / opSessions.length
        : 0;

    // Identify Missed Problems (Mastery < 3 means not fully mastered, < 0 means struggling)
    // Sorting by mastery level ascending (lowest first)
    const missedProblems = opMastery
        .filter(m => m.mastery_level < 3)
        .sort((a, b) => a.mastery_level - b.mastery_level)
        .slice(0, 20) // Top 20 needs work
        .map(m => ({
            fact: m.fact,
            mastery: m.mastery_level,
            attempts: m.attempts,
            lastPracticed: m.last_practiced
        }));

    // Trend Graph (Last 10 sessions for this op)
    const trend = opSessions.slice(-10).map((s, index) => ({
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
