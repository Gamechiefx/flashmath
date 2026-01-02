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
const TIER_RANGE = 20; // Match with players ±20 tiers (one band width)
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

        console.log(`[Matchmaking] Checking for match: user=${userId}, elo=${params.elo}, tier=${params.tier}, range=${minElo}-${maxElo}, candidates=${candidates.length}`);

        // Find a different player (not self) within tier range
        for (const candidateStr of candidates) {
            const candidate = JSON.parse(candidateStr) as QueueEntry;
            console.log(`[Matchmaking] Candidate: ${candidate.odUserName} (${candidate.odUserId}), elo=${candidate.odElo}, tier=${candidate.odTier}`);
            if (candidate.odUserId !== userId) {
                // Check if candidate already has a pending match (prevents race condition)
                const candidateMatch = await redis.get(`${MATCH_PREFIX}player:${candidate.odUserId}`);
                if (candidateMatch) {
                    console.log(`[Matchmaking] Skipping ${candidate.odUserName}: already in a match`);
                    continue;
                }

                // Check tier is within range
                const candidateTier = parseInt(candidate.odTier) || 0;
                if (Math.abs(params.tier - candidateTier) > TIER_RANGE) {
                    console.log(`[Matchmaking] Skipping ${candidate.odUserName}: tier ${candidateTier} outside range ±${TIER_RANGE} from ${params.tier}`);
                    continue; // Skip - tier too different
                }

                // Use deterministic match creation: lower userId creates the match
                // This prevents both players from creating separate matches simultaneously
                if (userId > candidate.odUserId) {
                    console.log(`[Matchmaking] Deferring to ${candidate.odUserName} (lower userId) to create match`);
                    continue;
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
 * Valid ranked operations (mixed is unranked)
 */
const RANKED_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division'];

/**
 * Check if operation is ranked (not mixed)
 */
function isRankedOperation(operation: string): boolean {
    return RANKED_OPERATIONS.includes(operation);
}

/**
 * Get the ELO column name for a mode + operation combination
 */
function getEloColumnName(mode: string, operation: string): string {
    if (mode === '1v1') {
        return `arena_elo_duel_${operation}`;
    } else {
        return `arena_elo_${mode}_${operation}`;
    }
}

/**
 * Calculate average ELO from operation-specific ELOs
 */
function calculateAverageElo(elos: Record<string, number>): number {
    const values = RANKED_OPERATIONS.map(op => elos[op] || 300);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Save match result and update ELO + Award Coins
 * 
 * New ELO Structure:
 * - Duel (1v1): Per-operation ELO (addition, subtraction, multiplication, division)
 * - Team (2v2-5v5): Per-mode + per-operation ELO
 * - Mixed operation matches do NOT affect ELO (unranked)
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
    isRanked?: boolean;
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

    // Determine if this is a ranked match (not mixed operation)
    const isRanked = isRankedOperation(params.operation);
    const isDuel = params.mode === '1v1';

    try {
        const { execute, getDatabase } = await import("@/lib/db");
        const db = getDatabase();

        console.log(`[Match] saveMatchResult: matchId=${params.matchId}, mode=${params.mode}, op=${params.operation}, ranked=${isRanked}`);

        // Use Redis SETNX to atomically claim the right to save this match
        const redis = await getRedis();
        const saveLockKey = `arena:save_lock:${params.matchId}`;

        if (redis) {
            const lockAcquired = await redis.setnx(saveLockKey, userId);
            if (!lockAcquired) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const existingMatch = db.prepare("SELECT id, winner_elo_change, loser_elo_change FROM arena_matches WHERE id = ?").get(params.matchId) as any;
                if (existingMatch) {
                    const { revalidatePath } = await import("next/cache");
                    revalidatePath("/arena/modes");
                    revalidatePath("/arena");
                    revalidatePath("/stats");
                    revalidatePath("/dashboard");
                    return {
                        success: true,
                        winnerEloChange: existingMatch.winner_elo_change,
                        loserEloChange: existingMatch.loser_elo_change,
                        winnerCoinsEarned: 0,
                        loserCoinsEarned: 0,
                        isRanked
                    };
                }
            }
            await redis.expire(saveLockKey, 30);
        }

        // Double-check database
        const existingMatch = db.prepare("SELECT id, winner_elo_change, loser_elo_change FROM arena_matches WHERE id = ?").get(params.matchId) as any;
        if (existingMatch) {
            const { revalidatePath } = await import("next/cache");
            revalidatePath("/arena/modes");
            revalidatePath("/arena");
            revalidatePath("/stats");
            revalidatePath("/dashboard");
            return {
                success: true,
                winnerEloChange: existingMatch.winner_elo_change,
                loserEloChange: existingMatch.loser_elo_change,
                winnerCoinsEarned: 0,
                loserCoinsEarned: 0,
                isRanked
            };
        }

        // Calculate coin rewards (awarded regardless of ranked status)
        const winnerCorrectAnswers = Math.floor(params.winnerScore / 100);
        const loserCorrectAnswers = Math.floor(params.loserScore / 100);
        const winnerCoinsEarned = (winnerCorrectAnswers * 2) + 10;
        const loserCoinsEarned = loserCorrectAnswers * 2;

        let winnerEloChange = 0;
        let loserEloChange = 0;

        const isWinnerHuman = !params.winnerId.startsWith('ai-') && !params.winnerId.startsWith('ai_bot_');
        const isLoserHuman = !params.loserId.startsWith('ai-') && !params.loserId.startsWith('ai_bot_');

        // Only update ELO for ranked matches (not mixed operation)
        if (isRanked) {
            // Get the ELO column name based on mode and operation
            const eloColumn = getEloColumnName(params.mode, params.operation);
            
            // Get current ELOs for the specific operation
            let winnerCurrentElo = 300;
            let loserCurrentElo = 300;
            let winnerStreak = 0;

            if (isWinnerHuman) {
                const winnerData = db.prepare(`SELECT ${eloColumn}, ${isDuel ? 'arena_duel_win_streak' : 'arena_team_win_streak'} as streak FROM users WHERE id = ?`).get(params.winnerId) as any;
                winnerCurrentElo = winnerData?.[eloColumn] || 300;
                winnerStreak = (winnerData?.streak || 0) + 1;
            }
            if (isLoserHuman) {
                const loserData = db.prepare(`SELECT ${eloColumn} FROM users WHERE id = ?`).get(params.loserId) as any;
                loserCurrentElo = loserData?.[eloColumn] || 300;
            }

            // Calculate performance bonus
            const totalScore = params.winnerScore + params.loserScore;
            const winnerPerformance = totalScore > 0 ? params.winnerScore / totalScore : 0.5;
            const loserPerformance = totalScore > 0 ? params.loserScore / totalScore : 0.5;

            // Calculate ELO changes
            winnerEloChange = calculateEloChange(winnerCurrentElo, loserCurrentElo, true, winnerPerformance, winnerStreak);
            loserEloChange = calculateEloChange(loserCurrentElo, winnerCurrentElo, false, loserPerformance, 0);

            const newWinnerElo = Math.max(100, winnerCurrentElo + winnerEloChange);
            const newLoserElo = Math.max(100, loserCurrentElo + loserEloChange);

            // Update winner
            if (isWinnerHuman) {
                const winner = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.winnerId) as any;
                const newCoins = (winner?.coins || 0) + winnerCoinsEarned;

                // Get all operation ELOs for this mode to calculate average
                const winnerAllElos = db.prepare(`
                    SELECT ${isDuel ? 'arena_elo_duel_addition, arena_elo_duel_subtraction, arena_elo_duel_multiplication, arena_elo_duel_division, arena_duel_win_streak, arena_duel_best_win_streak'
                        : `arena_elo_${params.mode}_addition, arena_elo_${params.mode}_subtraction, arena_elo_${params.mode}_multiplication, arena_elo_${params.mode}_division, arena_team_win_streak, arena_team_best_win_streak`}
                    FROM users WHERE id = ?
                `).get(params.winnerId) as any;

                // Calculate new averages
                const opElos: Record<string, number> = {};
                for (const op of RANKED_OPERATIONS) {
                    const col = isDuel ? `arena_elo_duel_${op}` : `arena_elo_${params.mode}_${op}`;
                    opElos[op] = op === params.operation ? newWinnerElo : (winnerAllElos?.[col] || 300);
                }
                const newModeAvg = calculateAverageElo(opElos);

                const streakCol = isDuel ? 'arena_duel_win_streak' : 'arena_team_win_streak';
                const bestStreakCol = isDuel ? 'arena_duel_best_win_streak' : 'arena_team_best_win_streak';
                const winsCol = isDuel ? 'arena_duel_wins' : 'arena_team_wins';
                const avgCol = isDuel ? 'arena_elo_duel' : `arena_elo_${params.mode}`;

                const currentBestStreak = winnerAllElos?.[bestStreakCol] || 0;
                const newBestStreak = Math.max(currentBestStreak, winnerStreak);

                // For team modes, also update overall team ELO average
                let teamEloUpdate = '';
                if (!isDuel) {
                    // Get all team mode averages and recalculate team overall
                    const teamModeElos = db.prepare(`
                        SELECT arena_elo_2v2, arena_elo_3v3, arena_elo_4v4, arena_elo_5v5 FROM users WHERE id = ?
                    `).get(params.winnerId) as any;
                    
                    const modeAvgs = {
                        '2v2': params.mode === '2v2' ? newModeAvg : (teamModeElos?.arena_elo_2v2 || 300),
                        '3v3': params.mode === '3v3' ? newModeAvg : (teamModeElos?.arena_elo_3v3 || 300),
                        '4v4': params.mode === '4v4' ? newModeAvg : (teamModeElos?.arena_elo_4v4 || 300),
                        '5v5': params.mode === '5v5' ? newModeAvg : (teamModeElos?.arena_elo_5v5 || 300),
                    };
                    const newTeamAvg = Math.round((modeAvgs['2v2'] + modeAvgs['3v3'] + modeAvgs['4v4'] + modeAvgs['5v5']) / 4);
                    teamEloUpdate = `, arena_elo_team = ${newTeamAvg}`;
                }

                db.prepare(`
                    UPDATE users SET
                        ${eloColumn} = ?,
                        ${avgCol} = ?,
                        ${winsCol} = COALESCE(${winsCol}, 0) + 1,
                        ${streakCol} = ?,
                        ${bestStreakCol} = ?,
                        coins = ?
                        ${teamEloUpdate}
                    WHERE id = ?
                `).run(newWinnerElo, newModeAvg, winnerStreak, newBestStreak, newCoins, params.winnerId);

                console.log(`[Match] Winner updated: ${eloColumn}=${newWinnerElo}, avg=${newModeAvg}, streak=${winnerStreak}`);
            }

            // Update loser
            if (isLoserHuman) {
                const loser = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.loserId) as any;
                const newCoins = (loser?.coins || 0) + loserCoinsEarned;

                // Get all operation ELOs for this mode to calculate average
                const loserAllElos = db.prepare(`
                    SELECT ${isDuel ? 'arena_elo_duel_addition, arena_elo_duel_subtraction, arena_elo_duel_multiplication, arena_elo_duel_division'
                        : `arena_elo_${params.mode}_addition, arena_elo_${params.mode}_subtraction, arena_elo_${params.mode}_multiplication, arena_elo_${params.mode}_division`}
                    FROM users WHERE id = ?
                `).get(params.loserId) as any;

                const opElos: Record<string, number> = {};
                for (const op of RANKED_OPERATIONS) {
                    const col = isDuel ? `arena_elo_duel_${op}` : `arena_elo_${params.mode}_${op}`;
                    opElos[op] = op === params.operation ? newLoserElo : (loserAllElos?.[col] || 300);
                }
                const newModeAvg = calculateAverageElo(opElos);

                const lossesCol = isDuel ? 'arena_duel_losses' : 'arena_team_losses';
                const streakCol = isDuel ? 'arena_duel_win_streak' : 'arena_team_win_streak';
                const avgCol = isDuel ? 'arena_elo_duel' : `arena_elo_${params.mode}`;

                // For team modes, also update overall team ELO average
                let teamEloUpdate = '';
                if (!isDuel) {
                    const teamModeElos = db.prepare(`
                        SELECT arena_elo_2v2, arena_elo_3v3, arena_elo_4v4, arena_elo_5v5 FROM users WHERE id = ?
                    `).get(params.loserId) as any;
                    
                    const modeAvgs = {
                        '2v2': params.mode === '2v2' ? newModeAvg : (teamModeElos?.arena_elo_2v2 || 300),
                        '3v3': params.mode === '3v3' ? newModeAvg : (teamModeElos?.arena_elo_3v3 || 300),
                        '4v4': params.mode === '4v4' ? newModeAvg : (teamModeElos?.arena_elo_4v4 || 300),
                        '5v5': params.mode === '5v5' ? newModeAvg : (teamModeElos?.arena_elo_5v5 || 300),
                    };
                    const newTeamAvg = Math.round((modeAvgs['2v2'] + modeAvgs['3v3'] + modeAvgs['4v4'] + modeAvgs['5v5']) / 4);
                    teamEloUpdate = `, arena_elo_team = ${newTeamAvg}`;
                }

                db.prepare(`
                    UPDATE users SET
                        ${eloColumn} = ?,
                        ${avgCol} = ?,
                        ${lossesCol} = COALESCE(${lossesCol}, 0) + 1,
                        ${streakCol} = 0,
                        coins = ?
                        ${teamEloUpdate}
                    WHERE id = ?
                `).run(newLoserElo, newModeAvg, newCoins, params.loserId);

                console.log(`[Match] Loser updated: ${eloColumn}=${newLoserElo}, avg=${newModeAvg}`);
            }
        } else {
            // Unranked (mixed) - just update coins
            if (isWinnerHuman) {
                const winner = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.winnerId) as any;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run((winner?.coins || 0) + winnerCoinsEarned, params.winnerId);
            }
            if (isLoserHuman) {
                const loser = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.loserId) as any;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run((loser?.coins || 0) + loserCoinsEarned, params.loserId);
            }
            console.log(`[Match] Unranked match (mixed) - coins only`);
        }

        // Save match to history
        const isAiMatch = !isWinnerHuman || !isLoserHuman;
        if (!isAiMatch) {
            try {
                db.prepare(`
                    INSERT OR IGNORE INTO arena_matches (id, winner_id, loser_id, winner_score, loser_score, operation, mode, winner_elo_change, loser_elo_change, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `).run(params.matchId, params.winnerId, params.loserId, params.winnerScore, params.loserScore, params.operation, params.mode, winnerEloChange, loserEloChange);
            } catch (e: any) {
                if (!e.message?.includes('UNIQUE constraint')) throw e;
            }
        }

        // Revalidate
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/arena/modes");
        revalidatePath("/arena");
        revalidatePath("/stats");
        revalidatePath("/dashboard");

        return {
            success: true,
            winnerEloChange,
            loserEloChange,
            winnerCoinsEarned,
            loserCoinsEarned,
            isRanked
        };
    } catch (error: any) {
        console.error('[Match] Save result error:', error);
        return { success: false, error: `Failed to save match result: ${error?.message || error}` };
    }
}

/**
 * Operation-specific ELO structure
 */
export interface OperationElos {
    elo: number;  // Average of all operation ELOs
    addition: number;
    subtraction: number;
    multiplication: number;
    divisionOp: number;  // Renamed to avoid conflict with rank division
}

/**
 * Arena stats interface for the new Duel/Team ELO system
 */
export interface ArenaStatsResult {
    // Duel (1v1) stats
    duel: {
        elo: number;
        addition: number;
        subtraction: number;
        multiplication: number;
        divisionOp: number;  // Operation ELO
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;  // Rank division (I, II, III)
        winsToNextDivision: number;
    };
    // Team stats
    team: {
        elo: number;
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;  // Rank division (I, II, III)
        winsToNextDivision: number;
        // Per-mode stats
        modes: {
            '2v2': OperationElos;
            '3v3': OperationElos;
            '4v4': OperationElos;
            '5v5': OperationElos;
        };
    };
}

const DEFAULT_STATS: ArenaStatsResult = {
    duel: {
        elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300,
        wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0,
        rank: 'Bronze', rankDivision: 'I', winsToNextDivision: 10
    },
    team: {
        elo: 300, wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0,
        rank: 'Bronze', rankDivision: 'I', winsToNextDivision: 10,
        modes: {
            '2v2': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '3v3': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '4v4': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '5v5': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
        }
    }
};

/**
 * Get user's arena stats with new Duel/Team ELO system
 */
export async function getArenaStats(userId?: string): Promise<ArenaStatsResult> {
    const session = await auth();
    const targetId = userId || (session?.user as any)?.id;

    if (!targetId) {
        return DEFAULT_STATS;
    }

    try {
        const { getDatabase } = await import("@/lib/db");
        const { calculateArenaRank, getHighestTier } = await import("@/lib/arena/ranks");
        const db = getDatabase();

        // Get all arena-related columns
        let user;
        try {
            user = db.prepare(`
                SELECT 
                    -- Duel stats
                    arena_elo_duel, arena_elo_duel_addition, arena_elo_duel_subtraction,
                    arena_elo_duel_multiplication, arena_elo_duel_division,
                    arena_duel_wins, arena_duel_losses, arena_duel_win_streak, arena_duel_best_win_streak,
                    -- Team stats
                    arena_elo_team, arena_team_wins, arena_team_losses, 
                    arena_team_win_streak, arena_team_best_win_streak,
                    -- 2v2
                    arena_elo_2v2, arena_elo_2v2_addition, arena_elo_2v2_subtraction,
                    arena_elo_2v2_multiplication, arena_elo_2v2_division,
                    -- 3v3
                    arena_elo_3v3, arena_elo_3v3_addition, arena_elo_3v3_subtraction,
                    arena_elo_3v3_multiplication, arena_elo_3v3_division,
                    -- 4v4
                    arena_elo_4v4, arena_elo_4v4_addition, arena_elo_4v4_subtraction,
                    arena_elo_4v4_multiplication, arena_elo_4v4_division,
                    -- 5v5
                    arena_elo_5v5, arena_elo_5v5_addition, arena_elo_5v5_subtraction,
                    arena_elo_5v5_multiplication, arena_elo_5v5_division,
                    -- For rank calculation
                    math_tiers
                FROM users WHERE id = ?
            `).get(targetId) as any;
        } catch (e) {
            console.error('[Arena] Error fetching stats, using defaults:', e);
            return DEFAULT_STATS;
        }

        if (!user) return DEFAULT_STATS;

        // Get highest practice tier for rank bracket
        let mathTiers: Record<string, number> = { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
        try {
            if (user.math_tiers) {
                mathTiers = typeof user.math_tiers === 'string' ? JSON.parse(user.math_tiers) : user.math_tiers;
            }
        } catch (e) { }
        const highestTier = getHighestTier(mathTiers);

        // Calculate duel rank
        const duelWins = user.arena_duel_wins || 0;
        const duelRankInfo = calculateArenaRank(duelWins, highestTier);

        // Calculate team rank
        const teamWins = user.arena_team_wins || 0;
        const teamRankInfo = calculateArenaRank(teamWins, highestTier);

        return {
            duel: {
                elo: user.arena_elo_duel || 300,
                addition: user.arena_elo_duel_addition || 300,
                subtraction: user.arena_elo_duel_subtraction || 300,
                multiplication: user.arena_elo_duel_multiplication || 300,
                divisionOp: user.arena_elo_duel_division || 300,
                wins: duelWins,
                losses: user.arena_duel_losses || 0,
                winStreak: user.arena_duel_win_streak || 0,
                bestWinStreak: user.arena_duel_best_win_streak || 0,
                rank: duelRankInfo.rank,
                rankDivision: duelRankInfo.division,
                winsToNextDivision: duelRankInfo.winsToNextDivision
            },
            team: {
                elo: user.arena_elo_team || 300,
                wins: teamWins,
                losses: user.arena_team_losses || 0,
                winStreak: user.arena_team_win_streak || 0,
                bestWinStreak: user.arena_team_best_win_streak || 0,
                rank: teamRankInfo.rank,
                rankDivision: teamRankInfo.division,
                winsToNextDivision: teamRankInfo.winsToNextDivision,
                modes: {
                    '2v2': {
                        elo: user.arena_elo_2v2 || 300,
                        addition: user.arena_elo_2v2_addition || 300,
                        subtraction: user.arena_elo_2v2_subtraction || 300,
                        multiplication: user.arena_elo_2v2_multiplication || 300,
                        divisionOp: user.arena_elo_2v2_division || 300,
                    },
                    '3v3': {
                        elo: user.arena_elo_3v3 || 300,
                        addition: user.arena_elo_3v3_addition || 300,
                        subtraction: user.arena_elo_3v3_subtraction || 300,
                        multiplication: user.arena_elo_3v3_multiplication || 300,
                        divisionOp: user.arena_elo_3v3_division || 300,
                    },
                    '4v4': {
                        elo: user.arena_elo_4v4 || 300,
                        addition: user.arena_elo_4v4_addition || 300,
                        subtraction: user.arena_elo_4v4_subtraction || 300,
                        multiplication: user.arena_elo_4v4_multiplication || 300,
                        divisionOp: user.arena_elo_4v4_division || 300,
                    },
                    '5v5': {
                        elo: user.arena_elo_5v5 || 300,
                        addition: user.arena_elo_5v5_addition || 300,
                        subtraction: user.arena_elo_5v5_subtraction || 300,
                        multiplication: user.arena_elo_5v5_multiplication || 300,
                        divisionOp: user.arena_elo_5v5_division || 300,
                    },
                }
            }
        };
    } catch (error) {
        console.error('[Arena] Error getting stats:', error);
        return DEFAULT_STATS;
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
        return messages.map((m: string) => JSON.parse(m));
    } catch (error) {
        return [];
    }
}
