"use server";

import { query, queryOne, execute, saveData } from "./db";
import { v4 as uuid } from "uuid";

const LEAGUE_DURATION_MS = 5 * 60 * 1000; // 5 mins for testing
const TIERS = ['neon-league', 'cobalt-league', 'plasma-league', 'void-league', 'apex-league'];

/**
 * Ensures the league is active and handles resets
 */
export async function syncLeagueState() {
    const leagues = query('SELECT * FROM leagues');
    if (leagues.length === 0) {
        console.warn("[LEAGUE] No leagues found in DB. Re-initializing...");
        return;
    }

    const now = new Date();
    const endTime = new Date(leagues[0].end_time);

    const progress = Math.min(1, Math.max(0, (now.getTime() - (endTime.getTime() - LEAGUE_DURATION_MS)) / LEAGUE_DURATION_MS));

    if (now > endTime) {
        console.log("[LEAGUE] Cycle ended. Processing promotions...");
        await processLeagueReset();
    } else {
        // Ensure ghosts exist in the current league participants
        const participants = query('SELECT * FROM league_participants');
        const ghosts = participants.filter((p: any) => p.user_id.startsWith('ghost-'));

        if (ghosts.length < 5) {
            console.log("[LEAGUE] Seeding missing ghosts...");
            await seedGhostPlayers();
        }

        // 50% chance for ghost player XP gain every sync
        if (Math.random() > 0.5) {
            await simulateGhostActivity(progress);
        }
    }
}

async function processLeagueReset() {
    for (const tierId of TIERS) {
        const participants = query('SELECT * FROM league_participants WHERE league_id = ?', [tierId]);
        const sorted = [...participants].sort((a, b) => b.weekly_xp - a.weekly_xp);

        // Process Promotions (Top 3)
        const top3 = sorted.slice(0, 3);
        for (const winner of top3) {
            if (winner.user_id.startsWith('ghost-')) continue;

            const nextTierIdx = TIERS.indexOf(tierId) + 1;
            if (nextTierIdx < TIERS.length) {
                const nextTier = TIERS[nextTierIdx];
                await promoteUser(winner.user_id, nextTier);
            }

            // Prize: Coins for being top 3
            await awardPrize(winner.user_id, 250);
        }

        // Process Demotions (Anyone under 20 XP OR bottom 2)
        if (tierId !== 'neon-league') {
            const under20 = sorted.filter(p => p.weekly_xp < 20);
            const bottom2 = sorted.slice(-2);

            // Combine and unique by user_id
            const demotees = Array.from(new Set([...under20, ...bottom2].map(p => p.user_id)));

            for (const demoteeId of demotees) {
                if (demoteeId.startsWith('ghost-')) continue;
                const prevTierIdx = TIERS.indexOf(tierId) - 1;
                const prevTier = TIERS[prevTierIdx];
                await promoteUser(demoteeId, prevTier);
            }
        }

        // Wipe participants for next cycle
        execute('DELETE FROM league_participants WHERE league_id = ?', [tierId]);
    }

    // Set new end time
    const newEndTime = new Date(Date.now() + LEAGUE_DURATION_MS).toISOString();
    for (const tierId of TIERS) {
        execute('UPDATE leagues SET end_time = ? WHERE id = ?', [newEndTime, tierId]);
    }

    // Re-seed ghost players
    await seedGhostPlayers();
}

async function promoteUser(userId: string, targetTier: string) {
    execute('UPDATE users SET current_league_id = ? WHERE id = ?', [targetTier, userId]);
}

async function awardPrize(userId: string, amount: number) {
    const user = queryOne('SELECT * FROM users WHERE id = ?', [userId]) as any;
    if (user) {
        execute('UPDATE users SET total_xp = ?, level = ?, coins = ? WHERE id = ?', [
            user.total_xp,
            user.level,
            (user.coins || 0) + amount,
            userId
        ]);
    }
}

export async function simulateGhostActivity(progress: number = 0) {
    const participants = query('SELECT * FROM league_participants');
    const ghosts = participants.filter(p => p.user_id.startsWith('ghost-'));

    if (ghosts.length > 0) {
        // Give 2-4 ghosts some XP
        const count = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < count; i++) {
            const randomGhost = ghosts[Math.floor(Math.random() * ghosts.length)];
            // XP gain scales with progress (base 20-100, increases by up to 3x near the end)
            const multiplier = 1 + (progress * 2);
            const xpGain = Math.floor((Math.random() * 80 + 20) * multiplier);

            execute('INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)', [
                randomGhost.league_id,
                randomGhost.user_id,
                randomGhost.name,
                xpGain
            ]);
        }
    }
}

export async function seedGhostPlayers(targetTierId?: string) {
    const ghostNames = ["CyberBlade", "NeoMath", "VoidRunner", "CircuitLink", "DeltaBot", "Zenith", "Quantum", "Echo"];

    const tiersToSeed = targetTierId ? [targetTierId] : TIERS;

    for (const tierId of tiersToSeed) {
        // Clear existing ghosts for this tier first to avoid duplication
        const participants = query('SELECT * FROM league_participants WHERE league_id = ?', [tierId]);
        const nonGhosts = participants.filter(p => !p.user_id.startsWith('ghost-'));

        execute('DELETE FROM league_participants WHERE league_id = ?', [tierId]);

        // Restore non-ghosts
        for (const p of nonGhosts) {
            execute('INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)', [
                p.league_id, p.user_id, p.name, p.weekly_xp
            ]);
        }

        // Add exactly 6 ghosts per tier
        for (let i = 0; i < 6; i++) {
            const name = ghostNames[Math.floor(Math.random() * ghostNames.length)] + `#${Math.floor(Math.random() * 999)}`;
            const startXp = Math.floor(Math.random() * 100);
            execute('INSERT INTO league_participants (league_id, user_id, name, weekly_xp) VALUES (?, ?, ?, ?)', [
                tierId,
                `ghost-${uuid()}`,
                name,
                startXp
            ]);
        }
    }
}
