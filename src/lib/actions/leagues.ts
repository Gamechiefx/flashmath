"use server";

import { query, queryOne } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState } from "@/lib/league-engine";

export async function getLeagueData() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

    await syncLeagueState(); // Ensure reset logic runs

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const currentLeagueId = user?.current_league_id || 'neon-league';

    const league = queryOne("SELECT * FROM leagues WHERE id = ?", [currentLeagueId]) as any;
    const participants = query("SELECT * FROM league_participants WHERE league_id = ?", [currentLeagueId]);

    // Sort participants by weekly_xp
    const sorted = [...participants].sort((a, b) => b.weekly_xp - a.weekly_xp);

    // Find user's rank
    const userRank = sorted.findIndex(p => p.user_id === userId) + 1;

    return {
        leagueName: league?.name || 'NEON',
        endTime: league?.end_time,
        participants: sorted,
        userRank,
        userId
    };
}
