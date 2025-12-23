"use server";

import { query, queryOne, execute } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState } from "@/lib/league-engine";
import { revalidatePath } from "next/cache";

export async function getLeagueData() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

    await syncLeagueState(); // Ensure reset logic runs

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    const currentLeagueId = user?.current_league_id || 'neon-league';

    const league = queryOne("SELECT * FROM leagues where id = ?", [currentLeagueId]) as any;
    let participants = query("SELECT * FROM league_participants WHERE league_id = ?", [currentLeagueId]);

    // Ensure the user is in the participants list
    const userInLeague = participants.find(p => p.user_id === userId);
    if (!userInLeague && user) {
        execute(
            "INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)",
            [currentLeagueId, userId, user.name, 0]
        );
        // Refresh participants
        participants = query("SELECT * FROM league_participants WHERE league_id = ?", [currentLeagueId]);
    }

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
