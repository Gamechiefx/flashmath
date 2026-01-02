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
const TIER_RANGE = 5; // Match with players ±5 tiers
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
    tier: number; // player's practice tier (1-100)
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
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
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

        console.log(`[Matchmaking] Checking for match: user=${userId}, elo=${params.elo}, range=${minElo}-${maxElo}, candidates=${candidates.length}`);

        // Find a different player (not self) within tier range
        for (const candidateStr of candidates) {
            const candidate = JSON.parse(candidateStr) as QueueEntry;
            console.log(`[Matchmaking] Candidate: ${candidate.odUserName} (${candidate.odUserId}), elo=${candidate.odElo}, tier=${candidate.odTier}`);
            if (candidate.odUserId !== userId) {
                // Check tier is within range
                const candidateTier = parseInt(candidate.odTier) || 0;
                if (Math.abs(params.tier - candidateTier) > TIER_RANGE) {
                    console.log(`[Matchmaking] Skipping ${candidate.odUserName}: tier ${candidateTier} outside range ±${TIER_RANGE} from ${params.tier}`);
                    continue; // Skip - tier too different
                }
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
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
        }

        return { matched: false };
    } catch (error) {
        console.error('[Matchmaking] Check match error:', error);
        // Fallback to AI
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
        }
        return { matched: false };
    }
}

/**
 * Create an AI match when no players are available
 */
async function createAiMatch(userId: string, userName: string, params: { mode: string; operation: string; elo: number; tier: number }) {
    const matchId = `match-${uuidv4()}`;

    // Generate AI opponent stats (slightly varied from player)
    const aiEloVariance = Math.floor(Math.random() * 100) - 50;
    const aiTierVariance = Math.floor(Math.random() * (TIER_RANGE * 2 + 1)) - TIER_RANGE;
    const aiTier = Math.max(1, Math.min(100, params.tier + aiTierVariance));
    const aiNames = ['MathBot', 'CalcMaster', 'NumberNinja', 'AlgebraAce', 'QuickMath', 'BrainStorm'];
    const aiName = aiNames[Math.floor(Math.random() * aiNames.length)] + Math.floor(Math.random() * 100);
    const aiBanners = ['matrices', 'synthwave', 'plasma', 'legendary'];
    const aiTitles = ['AI Challenger', 'Math Bot', 'Practice Partner', 'Training Mode'];

    console.log(`[Matchmaking] AI match created: ${matchId} for user ${userId}`);

    const match: MatchResult = {
        matchId,
        odPlayer1: {
            odUserId: userId,
            odUserName: 'You', // This will be updated by getMatch/Queue but basic placeholder ok
            odElo: params.elo,
            odTier: params.tier.toString(),
            odOperation: params.operation,
            odMode: params.mode,
            odEquippedBanner: 'default',
            odEquippedTitle: 'default',
            odLevel: 1,
            odJoinedAt: Date.now()
        },
        odPlayer2: {
            odUserId: 'ai-' + matchId, // Unique ID for AI
            odUserName: aiName,
            odElo: params.elo + aiEloVariance,
            odTier: aiTier.toString(),
            odOperation: params.operation,
            odMode: params.mode,
            odEquippedBanner: aiBanners[Math.floor(Math.random() * aiBanners.length)],
            odEquippedTitle: aiTitles[Math.floor(Math.random() * aiTitles.length)],
            odLevel: Math.floor(Math.random() * 50) + 10,
            odJoinedAt: Date.now()
        },
        odIsAiMatch: true,
    };

    // Save to Redis
    const redis = await getRedis();
    if (redis) {
        await redis.setex(`${MATCH_PREFIX}${matchId}`, 3600, JSON.stringify(match));
    }

    return {
        matched: true,
        matchId,
        opponent: {
            name: aiName,
            elo: params.elo + aiEloVariance,
            tier: aiTier.toString(),
            banner: match.odPlayer2?.odEquippedBanner || 'default',
            title: match.odPlayer2?.odEquippedTitle || 'default',
            level: match.odPlayer2?.odLevel || 1,
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
/**
 * Calculate ELO change with performance bonuses
 * @param playerElo - Current player ELO
 * @param opponentElo - Opponent's ELO
 * @param won - Whether the player won
 * @param performanceBonus - Bonus/penalty based on performance (0-1 scale, 0.5 = neutral)
 * @param streakBonus - Bonus from win streak (0+)
 * @param kFactor - Base K-factor (default 32)
 */
function calculateEloChange(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    performanceBonus: number = 0.5,
    streakBonus: number = 0,
    kFactor: number = 32
): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actualScore = won ? 1 : 0;

    // Base ELO change
    let baseChange = kFactor * (actualScore - expectedScore);

    // Apply performance multiplier (0.8x to 1.5x based on how well you performed)
    // performanceBonus ranges from 0 (terrible) to 1 (dominant)
    const performanceMultiplier = 0.8 + (performanceBonus * 0.7);
    baseChange *= performanceMultiplier;

    // Add streak bonus for winners (up to +5 for 5+ streak)
    if (won && streakBonus > 0) {
        baseChange += Math.min(streakBonus, 5);
    }

    return Math.round(baseChange);
}

/**
 * Save match result and update ELO + Award Coins
 */
export async function saveMatchResult(params: {
    matchId: string;
    winnerId: string;
    loserId: string;
    winnerScore: number;
    loserScore: number;
    winnerQuestionsAnswered?: number;
    loserQuestionsAnswered?: number;
    operation: string;
    mode: string;
}): Promise<{
    success: boolean;
    winnerEloChange?: number;
    loserEloChange?: number;
    winnerCoinsEarned?: number;
    loserCoinsEarned?: number;
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

        console.log(`[Match] saveMatchResult called: winnerId=${params.winnerId}, loserId=${params.loserId}`);

        // Get current ELO and streak for both players
        const winner = queryOne("SELECT arena_elo, coins, arena_win_streak, arena_best_win_streak FROM users WHERE id = ?", [params.winnerId]) as any;
        const loser = queryOne("SELECT arena_elo, coins FROM users WHERE id = ?", [params.loserId]) as any;

        console.log(`[Match] Winner data:`, winner);
        console.log(`[Match] Loser data:`, loser);

        const winnerElo = winner?.arena_elo || 500;
        const loserElo = loser?.arena_elo || 500;
        const currentWinStreak = (winner?.arena_win_streak || 0) + 1;

        // Calculate performance bonus based on score margin
        // If winner dominated (e.g., 1000 vs 200), performance bonus is high
        // If it was close (e.g., 600 vs 500), performance bonus is neutral
        const totalScore = params.winnerScore + params.loserScore;
        const winnerPerformance = totalScore > 0 ? params.winnerScore / totalScore : 0.5;
        const loserPerformance = totalScore > 0 ? params.loserScore / totalScore : 0.5;

        // Calculate ELO changes with performance and streak bonuses
        const winnerEloChange = calculateEloChange(winnerElo, loserElo, true, winnerPerformance, currentWinStreak);
        const loserEloChange = calculateEloChange(loserElo, winnerElo, false, loserPerformance, 0);

        const newWinnerElo = Math.max(100, winnerElo + winnerEloChange);
        const newLoserElo = Math.max(100, loserElo + loserEloChange);

        // Calculate coin rewards (Arena Premium Rate: 2 coins per correct answer + win bonus)
        // Score is 100 per correct answer, so questionsCorrect = score / 100
        const winnerCorrectAnswers = Math.floor(params.winnerScore / 100);
        const loserCorrectAnswers = Math.floor(params.loserScore / 100);

        // Base: 2 coins per correct answer
        // Winner bonus: +10 coins for winning
        const winnerCoinsEarned = (winnerCorrectAnswers * 2) + 10;
        const loserCoinsEarned = loserCorrectAnswers * 2;

        // Determine mode-specific ELO column
        const modeEloColumn = `arena_elo_${params.mode.replace('v', 'v')}`;

        // Update winner ELO, wins, streak, and coins (skip if AI opponent)
        const isWinnerHuman = !params.winnerId.startsWith('ai-') && !params.winnerId.startsWith('ai_bot_');
        console.log(`[Match] isWinnerHuman: ${isWinnerHuman}, winnerId: ${params.winnerId}`);

        if (isWinnerHuman) {
            const newWinnerCoins = (winner?.coins || 0) + winnerCoinsEarned;
            const bestStreak = Math.max(winner?.arena_best_win_streak || 0, currentWinStreak);

            console.log(`[Match] Updating winner: newElo=${newWinnerElo}, newCoins=${newWinnerCoins}, streak=${currentWinStreak}`);

            // Try to update mode-specific ELO, fall back to general if column doesn't exist
            try {
                execute(
                    `UPDATE users SET 
                        arena_elo = ?, 
                        arena_elo_1v1 = CASE WHEN ? = '1v1' THEN ? ELSE COALESCE(arena_elo_1v1, 500) END,
                        arena_elo_2v2 = CASE WHEN ? = '2v2' THEN ? ELSE COALESCE(arena_elo_2v2, 400) END,
                        arena_elo_3v3 = CASE WHEN ? = '3v3' THEN ? ELSE COALESCE(arena_elo_3v3, 350) END,
                        arena_wins = COALESCE(arena_wins, 0) + 1, 
                        arena_win_streak = ?,
                        arena_best_win_streak = ?,
                        coins = ? 
                    WHERE id = ?`,
                    [newWinnerElo, params.mode, newWinnerElo, params.mode, newWinnerElo, params.mode, newWinnerElo, currentWinStreak, bestStreak, newWinnerCoins, params.winnerId]
                );
                console.log(`[Match] Winner update executed successfully`);
            } catch (e) {
                console.error(`[Match] Winner update failed, trying fallback:`, e);
                // Fallback if new columns don't exist
                execute(
                    "UPDATE users SET arena_elo = ?, arena_wins = COALESCE(arena_wins, 0) + 1, coins = ? WHERE id = ?",
                    [newWinnerElo, newWinnerCoins, params.winnerId]
                );
            }
            console.log(`[Match] Winner ${params.winnerId} earned ${winnerCoinsEarned} coins, streak: ${currentWinStreak}`);
        }

        // Update loser ELO, losses, reset streak, and coins (skip if AI opponent)
        if (!params.loserId.startsWith('ai-') && !params.loserId.startsWith('ai_bot_')) {
            const newLoserCoins = (loser?.coins || 0) + loserCoinsEarned;

            try {
                execute(
                    `UPDATE users SET 
                        arena_elo = ?, 
                        arena_elo_1v1 = CASE WHEN ? = '1v1' THEN ? ELSE COALESCE(arena_elo_1v1, 500) END,
                        arena_elo_2v2 = CASE WHEN ? = '2v2' THEN ? ELSE COALESCE(arena_elo_2v2, 400) END,
                        arena_elo_3v3 = CASE WHEN ? = '3v3' THEN ? ELSE COALESCE(arena_elo_3v3, 350) END,
                        arena_losses = COALESCE(arena_losses, 0) + 1,
                        arena_win_streak = 0,
                        coins = ? 
                    WHERE id = ?`,
                    [newLoserElo, params.mode, newLoserElo, params.mode, newLoserElo, params.mode, newLoserElo, newLoserCoins, params.loserId]
                );
            } catch (e) {
                // Fallback if new columns don't exist
                execute(
                    "UPDATE users SET arena_elo = ?, arena_losses = COALESCE(arena_losses, 0) + 1, coins = ? WHERE id = ?",
                    [newLoserElo, newLoserCoins, params.loserId]
                );
            }
            console.log(`[Match] Loser ${params.loserId} earned ${loserCoinsEarned} coins, streak reset`);
        }

        // Save match to history (only for human vs human matches due to FK constraint)
        const isAiMatch = params.winnerId.startsWith('ai_bot_') || params.winnerId.startsWith('ai-') ||
            params.loserId.startsWith('ai_bot_') || params.loserId.startsWith('ai-');

        if (!isAiMatch) {
            execute(
                `INSERT INTO arena_matches (id, winner_id, loser_id, winner_score, loser_score, operation, mode, winner_elo_change, loser_elo_change, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                [params.matchId, params.winnerId, params.loserId, params.winnerScore, params.loserScore, params.operation, params.mode, winnerEloChange, loserEloChange]
            );
            console.log(`[Match] Saved match history to database`);
        } else {
            console.log(`[Match] Skipped match history insert (AI match)`);
        }

        console.log(`[Match] Saved result: ${params.winnerId} beat ${params.loserId} (${params.winnerScore}-${params.loserScore}), ELO: +${winnerEloChange}/${loserEloChange}`);
        // Revalidate arena pages so stats update immediately
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/arena/modes");
        revalidatePath("/arena");
        revalidatePath("/stats");
        revalidatePath("/dashboard");

        // Get final updated stats for both players to ensure UI is perfectly in sync
        const winnerStats = await getArenaStats(params.winnerId);
        const loserStats = await getArenaStats(params.loserId);

        return {
            success: true,
            winnerEloChange,
            loserEloChange,
            winnerCoinsEarned,
            loserCoinsEarned,
            newWinnerElo,
            newLoserElo,
            winnerStats,
            loserStats
        };
    } catch (error: any) {
        console.error('[Match] Save result error:', error);
        return { success: false, error: `Failed to save match result: ${error?.message || error}` };
    }
}

/**
 * Get user's arena stats with new rank system
 */
export async function getArenaStats(userId?: string): Promise<{
    elo: number;
    elo1v1: number;
    elo2v2: number;
    elo3v3: number;
    wins: number;
    losses: number;
    winStreak: number;
    bestWinStreak: number;
    rank: string;
    division: string;
    winsToNextDivision: number;
}> {
    const session = await auth();
    const targetId = userId || (session?.user as any)?.id;

    if (!targetId) {
        return { elo: 500, elo1v1: 500, elo2v2: 400, elo3v3: 350, wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0, rank: 'Bronze', division: 'I', winsToNextDivision: 10 };
    }

    try {
        const { getDatabase } = await import("@/lib/db");
        const { calculateArenaRank, getHighestTier } = await import("@/lib/arena/ranks");
        const db = getDatabase();

        // Get user data including math tiers
        let user;
        try {
            user = db.prepare(`
                SELECT arena_elo, arena_elo_1v1, arena_elo_2v2, arena_elo_3v3,
                       arena_wins, arena_losses, arena_win_streak, arena_best_win_streak,
                       math_tiers
                FROM users WHERE id = ?
            `).get(targetId) as any;
        } catch (e) {
            // Columns might not exist, try simpler query
            user = db.prepare("SELECT arena_elo, arena_wins, arena_losses, math_tiers FROM users WHERE id = ?").get(targetId) as any;
        }

        const elo = user?.arena_elo || 500;
        const elo1v1 = user?.arena_elo_1v1 || 500;
        const elo2v2 = user?.arena_elo_2v2 || 400;
        const elo3v3 = user?.arena_elo_3v3 || 350;
        const wins = user?.arena_wins || 0;
        const losses = user?.arena_losses || 0;
        const winStreak = user?.arena_win_streak || 0;
        const bestWinStreak = user?.arena_best_win_streak || 0;

        // Get highest practice tier for rank bracket
        let mathTiers: Record<string, number> = { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
        try {
            if (user?.math_tiers) {
                mathTiers = typeof user.math_tiers === 'string' ? JSON.parse(user.math_tiers) : user.math_tiers;
            }
        } catch (e) { }

        const highestTier = getHighestTier(mathTiers);

        // Calculate rank from wins and tier
        const rankInfo = calculateArenaRank(wins, highestTier);

        return {
            elo,
            elo1v1,
            elo2v2,
            elo3v3,
            wins,
            losses,
            winStreak,
            bestWinStreak,
            rank: rankInfo.rank,
            division: rankInfo.division,
            winsToNextDivision: rankInfo.winsToNextDivision
        };
    } catch (error) {
        console.error('[Arena] Error getting stats:', error);
        return { elo: 500, elo1v1: 500, elo2v2: 400, elo3v3: 350, wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0, rank: 'Bronze', division: 'I', winsToNextDivision: 10 };
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
