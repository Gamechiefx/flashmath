"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { query, queryOne, execute, loadData, type UserRow } from "@/lib/db";
import { auth } from "@/auth";
import { syncLeagueState } from "@/lib/league-engine";
import { revalidatePath } from "next/cache";

import { ITEMS, ItemType } from "@/lib/items";

export async function getLeagueData() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as { id: string }).id;

    await syncLeagueState(); // Ensure reset logic runs

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    const currentLeagueId = user?.current_league_id || 'neon-league';

    interface LeagueRow {
        id: string;
        name?: string;
        [key: string]: unknown;
    }
    const league = queryOne("SELECT * FROM leagues where id = ?", [currentLeagueId]) as LeagueRow | null;
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

    // Enrich with Titles and Frames
    // Enrich with Titles and Frames
    const db = loadData();
    const sourceItems = (db.shop_items && db.shop_items.length > 0) ? db.shop_items : ITEMS; // Use DB items if available

    const titleItems = sourceItems.filter((i: any) => i.type === ItemType.TITLE);
    const frameItems = sourceItems.filter((i: any) => i.type === ItemType.FRAME);

    // Fetch real users details for accurate frames
    const realUserIds = sorted.filter(p => !p.user_id.startsWith('ghost-')).map(p => p.user_id);
    const realUsersMap: Record<string, any> = {};

    if (realUserIds.length > 0) {
        // Safe parameter expansion
        const placeholders = realUserIds.map(() => '?').join(',');
        const users = query(`SELECT id, equipped_items FROM users WHERE id IN (${placeholders})`, realUserIds);
        users.forEach((u: any) => {
            realUsersMap[u.id] = u;
        });
    }

    const enrichedParticipants = sorted.map(p => {
        let titleId = null;
        let frameId = 'default';

        if (p.user_id === userId || !p.user_id.startsWith('ghost-')) {
            // Real User
            const uData = p.user_id === userId ? user : realUsersMap[p.user_id];
            if (uData && uData.equipped_items) {
                // Parse if string (SQLite) or object
                const equipped = typeof uData.equipped_items === 'string'
                    ? JSON.parse(uData.equipped_items)
                    : uData.equipped_items;

                titleId = equipped.title || null;
                frameId = equipped.frame || 'default';
            }
        } else if (p.user_id.startsWith('ghost-')) {
            // Deterministic random decoration for ghosts
            const hash = p.user_id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);

            // Titles for 1/3
            if (hash % 3 === 0) {
                titleId = titleItems[hash % titleItems.length].id;
            }

            // Frames for 1/2
            if (hash % 2 === 0) {
                frameId = frameItems[hash % frameItems.length].id;
            }
        }

        const titleItem = titleId ? sourceItems.find((i: any) => i.id === titleId) : null;

        return {
            ...p,
            titleName: titleItem ? titleItem.name : null,
            equippedFrame: frameId
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
