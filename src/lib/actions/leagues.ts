"use server";

import { query, queryOne, execute } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState } from "@/lib/league-engine";
import { revalidatePath } from "next/cache";

import { ITEMS, ItemType } from "@/lib/items";

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

    // Enrich with Titles
    const titleItems = ITEMS.filter(i => i.type === ItemType.TITLE);

    const enrichedParticipants = sorted.map(p => {
        let titleId = null;

        if (p.user_id === userId) {
            titleId = user.equipped_items?.title || null;
        } else if (p.user_id.startsWith('ghost-')) {
            // Deterministic random title for ghosts
            const hash = p.user_id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
            if (hash % 3 === 0) { // Only give titles to 1/3 of bots to make them feel special
                titleId = titleItems[hash % titleItems.length].id;
            }
        }

        const titleItem = titleId ? ITEMS.find(i => i.id === titleId) : null;
        return {
            ...p,
            titleName: titleItem ? titleItem.name : null
        };
    });

    // Find user's rank
    const userRank = enrichedParticipants.findIndex(p => p.user_id === userId) + 1;

    return {
        leagueName: league?.name || 'NEON',
        endTime: league?.end_time,
        participants: enrichedParticipants,
        userRank,
        userId
    };
}
