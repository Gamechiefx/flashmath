'use server';

/**
 * Arena Matchmaking Server Actions
 * Real-time matchmaking using Redis for queue management
 */

import { auth } from "@/auth";
import { v4 as uuidv4 } from 'uuid';

// Redis client for matchmaking
let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;

    try {
        const Redis = (await import('ioredis')).default;
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'redis',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        return redisClient;
    } catch (error) {
        console.error('[Matchmaking] Redis connection failed:', error);
        return null;
    }
}

interface QueueEntry {
    odUserId: string;
    odUserName: string;
    odElo: number;
    odTier: string;
    odOperation: string;
    odMode: string;
    odEquippedBanner: string;
    odEquippedTitle: string;
    odLevel: number;
    odJoinedAt: number;
}

interface MatchResult {
    matchId: string;
    odPlayer1: QueueEntry;
    odPlayer2: QueueEntry | null; // null if AI opponent
    odIsAiMatch: boolean;
}

const QUEUE_PREFIX = 'arena:queue:';
const MATCH_PREFIX = 'arena:match:';
const ELO_RANGE = 200; // Match with players ±200 ELO
const AI_TIMEOUT_MS = 15000; // Start AI match after 15 seconds

/**
 * Join the matchmaking queue
 */
export async function joinQueue(params: {
    mode: string;
    operation: string;
    elo: number;
    tier: string;
    equippedBanner: string;
    equippedTitle: string;
    level: number;
}): Promise<{ success: boolean; queuePosition?: number; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const userName = session.user.name || 'Player';

    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Queue service unavailable' };
    }

    // Clear any existing match data for this player (fresh start)
    await redis.del(`${MATCH_PREFIX}player:${userId}`);

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    const entry: QueueEntry = {
        odUserId: userId,
        odUserName: userName,
        odElo: params.elo,
        odTier: params.tier,
        odOperation: params.operation,
        odMode: params.mode,
        odEquippedBanner: params.equippedBanner,
        odEquippedTitle: params.equippedTitle,
        odLevel: params.level,
        odJoinedAt: Date.now(),
    };

    try {
        // First, remove any existing entries for this user (prevent stale entries)
        const existingEntries = await redis.zrange(queueKey, 0, -1);
        for (const entryStr of existingEntries) {
            try {
                const existing = JSON.parse(entryStr) as QueueEntry;
                if (existing.odUserId === userId) {
                    await redis.zrem(queueKey, entryStr);
                    console.log(`[Matchmaking] Removed stale entry for ${userName}`);
                }
            } catch { }
        }

        // Add to sorted set (score = ELO for matching)
        await redis.zadd(queueKey, params.elo, JSON.stringify(entry));

        // Set queue key expiration (clean up after 10 minutes of inactivity)
        await redis.expire(queueKey, 600);

        // Get queue position
        const position = await redis.zrank(queueKey, JSON.stringify(entry));

        console.log(`[Matchmaking] ${userName} joined queue for ${params.mode} ${params.operation} (ELO: ${params.elo})`);

        return { success: true, queuePosition: position || 0 };
    } catch (error) {
        console.error('[Matchmaking] Join queue error:', error);
        return { success: false, error: 'Failed to join queue' };
    }
}

/**
 * Leave the matchmaking queue
 */
export async function leaveQueue(params: {
    mode: string;
    operation: string;
}): Promise<{ success: boolean }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false };
    }

    const userId = (session.user as any).id;
    const redis = await getRedis();
    if (!redis) return { success: false };

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    try {
        // Get all entries and remove the one for this user
        const entries = await redis.zrange(queueKey, 0, -1);
        for (const entryStr of entries) {
            const entry = JSON.parse(entryStr) as QueueEntry;
            if (entry.odUserId === userId) {
                await redis.zrem(queueKey, entryStr);
                console.log(`[Matchmaking] User ${userId} left queue`);
                break;
            }
        }
        return { success: true };
    } catch (error) {
        console.error('[Matchmaking] Leave queue error:', error);
        return { success: false };
    }
}

/**
 * Check for a match (poll-based for now)
 */
export async function checkForMatch(params: {
    mode: string;
    operation: string;
    elo: number;
    queueTime: number; // seconds in queue
}): Promise<{
    matched: boolean;
    matchId?: string;
    opponent?: { name: string; elo: number; tier: string; banner: string; title: string; level: number };
    isAiMatch?: boolean;
}> {
    const session = await auth();
    if (!session?.user) {
        return { matched: false };
    }

    const userId = (session.user as any).id;
    const redis = await getRedis();

    if (!redis) {
        // Fallback: AI match after timeout
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, params);
        }
        return { matched: false };
    }

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    try {
        // Check if user already has a pending match
        const existingMatch = await redis.get(`${MATCH_PREFIX}player:${userId}`);
        if (existingMatch) {
            const match = JSON.parse(existingMatch) as MatchResult;
            const opponent = match.odPlayer1.odUserId === userId ? match.odPlayer2 : match.odPlayer1;
            return {
                matched: true,
                matchId: match.matchId,
                opponent: opponent ? {
                    name: opponent.odUserName,
                    elo: opponent.odElo,
                    tier: opponent.odTier,
                    banner: opponent.odEquippedBanner,
                    title: opponent.odEquippedTitle,
                    level: opponent.odLevel,
                } : undefined,
                isAiMatch: match.odIsAiMatch,
            };
        }

        // Find potential matches (players within ELO range)
        const minElo = params.elo - ELO_RANGE;
        const maxElo = params.elo + ELO_RANGE;

        const candidates = await redis.zrangebyscore(queueKey, minElo, maxElo);

        // Find a different player (not self)
        for (const candidateStr of candidates) {
            const candidate = JSON.parse(candidateStr) as QueueEntry;
            if (candidate.odUserId !== userId) {
                // Found a match! Create match and remove both from queue
                const matchId = `match-${uuidv4()}`;

                // Get current user's entry
                const entries = await redis.zrange(queueKey, 0, -1);
                let currentUserEntry: QueueEntry | null = null;
                for (const entryStr of entries) {
                    const entry = JSON.parse(entryStr) as QueueEntry;
                    if (entry.odUserId === userId) {
                        currentUserEntry = entry;
                        await redis.zrem(queueKey, entryStr);
                        break;
                    }
                }

                if (!currentUserEntry) {
                    continue; // User not in queue anymore
                }

                // Remove matched opponent from queue
                await redis.zrem(queueKey, candidateStr);

                // Create match entry
                const match: MatchResult = {
                    matchId,
                    odPlayer1: currentUserEntry,
                    odPlayer2: candidate,
                    odIsAiMatch: false,
                };

                // Store match for both players (expires in 5 minutes)
                const matchStr = JSON.stringify(match);
                await redis.setex(`${MATCH_PREFIX}player:${currentUserEntry.odUserId}`, 300, matchStr);
                await redis.setex(`${MATCH_PREFIX}player:${candidate.odUserId}`, 300, matchStr);
                await redis.setex(`${MATCH_PREFIX}${matchId}`, 3600, matchStr); // Match data expires in 1 hour

                console.log(`[Matchmaking] Match created: ${matchId} - ${currentUserEntry.odUserName} vs ${candidate.odUserName}`);

                return {
                    matched: true,
                    matchId,
                    opponent: {
                        name: candidate.odUserName,
                        elo: candidate.odElo,
                        tier: candidate.odTier,
                        banner: candidate.odEquippedBanner,
                        title: candidate.odEquippedTitle,
                        level: candidate.odLevel,
                    },
                    isAiMatch: false,
                };
            }
        }

        // No match found - check if should start AI match
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, params);
        }

        return { matched: false };
    } catch (error) {
        console.error('[Matchmaking] Check match error:', error);
        // Fallback to AI
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, params);
        }
        return { matched: false };
    }
}

/**
 * Create an AI match when no players are available
 */
async function createAiMatch(userId: string, params: { mode: string; operation: string; elo: number }) {
    const matchId = `match-${uuidv4()}`;

    // Generate AI opponent stats (slightly varied from player)
    const aiEloVariance = Math.floor(Math.random() * 100) - 50;
    const aiNames = ['MathBot', 'CalcMaster', 'NumberNinja', 'AlgebraAce', 'QuickMath', 'BrainStorm'];
    const aiName = aiNames[Math.floor(Math.random() * aiNames.length)] + Math.floor(Math.random() * 100);
    const aiBanners = ['synthwave', 'matrices', 'neon_grid', 'cyber_pulse'];
    const aiTitles = ['AI Challenger', 'Math Bot', 'Practice Partner', 'Training Mode'];

    console.log(`[Matchmaking] AI match created: ${matchId} for user ${userId}`);

    return {
        matched: true,
        matchId,
        opponent: {
            name: aiName,
            elo: params.elo + aiEloVariance,
            tier: 'Silver',
            banner: aiBanners[Math.floor(Math.random() * aiBanners.length)],
            title: aiTitles[Math.floor(Math.random() * aiTitles.length)],
            level: Math.floor(Math.random() * 50) + 10,
        },
        isAiMatch: true,
    };
}

/**
 * Get match details
 */
export async function getMatch(matchId: string): Promise<{
    match?: MatchResult;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { error: 'Unauthorized' };
    }

    const redis = await getRedis();
    if (!redis) {
        return { error: 'Match service unavailable' };
    }

    try {
        const matchStr = await redis.get(`${MATCH_PREFIX}${matchId}`);
        if (!matchStr) {
            return { error: 'Match not found' };
        }

        return { match: JSON.parse(matchStr) };
    } catch (error) {
        console.error('[Matchmaking] Get match error:', error);
        return { error: 'Failed to get match' };
    }
}

/**
 * Clear match data after game ends
 */
export async function clearMatch(matchId: string): Promise<{ success: boolean }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false };
    }

    const userId = (session.user as any).id;
    const redis = await getRedis();
    if (!redis) return { success: false };

    try {
        await redis.del(`${MATCH_PREFIX}player:${userId}`);
        // Don't delete the match itself - keep for history
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}

/**
 * Calculate ELO change using standard formula
 * K-factor is higher for newer players
 */
function calculateEloChange(playerElo: number, opponentElo: number, won: boolean, kFactor: number = 32): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actualScore = won ? 1 : 0;
    return Math.round(kFactor * (actualScore - expectedScore));
}

/**
 * Save match result and update ELO
 */
export async function saveMatchResult(params: {
    matchId: string;
    winnerId: string;
    loserId: string;
    winnerScore: number;
    loserScore: number;
    operation: string;
    mode: string;
}): Promise<{
    success: boolean;
    winnerEloChange?: number;
    loserEloChange?: number;
    error?: string
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;

    // Only allow match participants to save results
    if (userId !== params.winnerId && userId !== params.loserId) {
        return { success: false, error: 'Not a match participant' };
    }

    try {
        const { execute, queryOne } = await import("@/lib/db");

        // Get current ELO for both players
        const winner = queryOne("SELECT arena_elo FROM users WHERE id = ?", [params.winnerId]) as any;
        const loser = queryOne("SELECT arena_elo FROM users WHERE id = ?", [params.loserId]) as any;

        const winnerElo = winner?.arena_elo || 1000;
        const loserElo = loser?.arena_elo || 1000;

        // Calculate ELO changes
        const winnerEloChange = calculateEloChange(winnerElo, loserElo, true);
        const loserEloChange = calculateEloChange(loserElo, winnerElo, false);

        const newWinnerElo = Math.max(100, winnerElo + winnerEloChange);
        const newLoserElo = Math.max(100, loserElo + loserEloChange);

        // Update winner ELO (skip if AI opponent)
        if (!params.winnerId.startsWith('ai-')) {
            execute(
                "UPDATE users SET arena_elo = ?, arena_wins = COALESCE(arena_wins, 0) + 1 WHERE id = ?",
                [newWinnerElo, params.winnerId]
            );
        }

        // Update loser ELO (skip if AI opponent)
        if (!params.loserId.startsWith('ai-')) {
            execute(
                "UPDATE users SET arena_elo = ?, arena_losses = COALESCE(arena_losses, 0) + 1 WHERE id = ?",
                [newLoserElo, params.loserId]
            );
        }

        // Save match to history
        execute(
            `INSERT INTO arena_matches (id, winner_id, loser_id, winner_score, loser_score, operation, mode, winner_elo_change, loser_elo_change, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [params.matchId, params.winnerId, params.loserId, params.winnerScore, params.loserScore, params.operation, params.mode, winnerEloChange, loserEloChange]
        );

        console.log(`[Match] Saved result: ${params.winnerId} beat ${params.loserId} (${params.winnerScore}-${params.loserScore}), ELO: +${winnerEloChange}/${loserEloChange}`);

        return {
            success: true,
            winnerEloChange,
            loserEloChange
        };
    } catch (error) {
        console.error('[Match] Save result error:', error);
        return { success: false, error: 'Failed to save match result' };
    }
}

/**
 * Get user's arena stats
 */
export async function getArenaStats(userId?: string): Promise<{
    elo: number;
    wins: number;
    losses: number;
    rank: string;
    division: string;
}> {
    const session = await auth();
    const targetId = userId || (session?.user as any)?.id;

    if (!targetId) {
        return { elo: 1000, wins: 0, losses: 0, rank: 'Silver', division: 'II' };
    }

    try {
        const { queryOne } = await import("@/lib/db");
        const user = queryOne("SELECT arena_elo, arena_wins, arena_losses FROM users WHERE id = ?", [targetId]) as any;

        const elo = user?.arena_elo || 1000;
        const wins = user?.arena_wins || 0;
        const losses = user?.arena_losses || 0;

        // Calculate rank from ELO
        let rank = 'Silver';
        let division = 'II';

        if (elo < 700) { rank = 'Bronze'; division = 'III'; }
        else if (elo < 800) { rank = 'Bronze'; division = 'II'; }
        else if (elo < 900) { rank = 'Bronze'; division = 'I'; }
        else if (elo < 1100) { rank = 'Silver'; division = 'III'; }
        else if (elo < 1200) { rank = 'Silver'; division = 'II'; }
        else if (elo < 1300) { rank = 'Silver'; division = 'I'; }
        else if (elo < 1500) { rank = 'Gold'; division = 'III'; }
        else if (elo < 1600) { rank = 'Gold'; division = 'II'; }
        else if (elo < 1700) { rank = 'Gold'; division = 'I'; }
        else if (elo < 1900) { rank = 'Platinum'; division = 'III'; }
        else if (elo < 2000) { rank = 'Platinum'; division = 'II'; }
        else if (elo < 2100) { rank = 'Platinum'; division = 'I'; }
        else if (elo < 2300) { rank = 'Diamond'; division = 'III'; }
        else if (elo < 2400) { rank = 'Diamond'; division = 'II'; }
        else if (elo < 2500) { rank = 'Diamond'; division = 'I'; }
        else { rank = 'Master'; division = 'I'; }

        return { elo, wins, losses, rank, division };
    } catch (error) {
        return { elo: 1000, wins: 0, losses: 0, rank: 'Silver', division: 'II' };
    }
}

/**
 * Send an emoji message in a match lobby
 */
export async function sendMatchEmoji(matchId: string, emoji: string) {
    const session = await auth();
    if (!session?.user) return { success: false };
    const userId = (session.user as any).id;

    const redis = await getRedis();
    if (!redis) return { success: false };

    const chatKey = `arena:chat:${matchId}`;
    const message = JSON.stringify({
        emoji,
        senderId: userId,
        timestamp: Date.now()
    });

    try {
        await redis.rpush(chatKey, message);
        await redis.expire(chatKey, 300); // 5 minutes expiry
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}

/**
 * Get recent emoji messages for a match lobby
 */
export async function getMatchEmojis(matchId: string) {
    const redis = await getRedis();
    if (!redis) return [];

    const chatKey = `arena:chat:${matchId}`;
    try {
        const messages = await redis.lrange(chatKey, 0, -1);
        return messages.map(m => JSON.parse(m));
    } catch (error) {
        return [];
    }
}
