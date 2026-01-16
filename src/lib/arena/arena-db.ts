/**
 * FlashMath Arena Database Bridge
 * 
 * TypeScript wrapper for PostgreSQL arena database operations.
 * Use this module for all arena-related database operations.
 * 
 * Database architecture:
 * - PostgreSQL: Arena ELO, match history, team stats (this module) - SOURCE OF TRUTH
 * - SQLite: User profiles, friends, practice data (NO ELO DATA)
 * - Redis: Real-time queue state, active matches, parties, CACHING
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL query results use any types */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS modules */

// Import the PostgreSQL module
const arenaPostgres = require('./postgres.js');

// Import Redis for caching (optional - falls back to direct DB if unavailable)
let arenaRedis: {
    getCachedLeaderboard: (type: string, operation: string) => Promise<any[] | null>;
    cacheLeaderboard: (type: string, operation: string, data: any[]) => Promise<boolean>;
    getCachedUserStats: (userId: string) => Promise<any | null>;
    cacheUserStats: (userId: string, stats: any) => Promise<boolean>;
    getCachedUserStatsBatch: (userIds: string[]) => Promise<Record<string, any>>;
    invalidateLeaderboardCache: (type?: string) => Promise<boolean>;
} | null = null;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS module
    arenaRedis = require('../../../server-redis.js');
} catch (e) {
    // Redis not available (e.g., during build), will use direct DB
    console.log('[arena-db] Redis caching not available, using direct DB queries');
}

// =============================================================================
// RANK/DIVISION HELPERS
// =============================================================================

/**
 * ELO thresholds for each rank
 * Based on percentile distribution
 */
/**
 * Rank thresholds (aligned with LEAGUES in constants.js)
 * These MUST match the values in src/lib/arena/constants.js LEAGUES
 */
const RANK_THRESHOLDS = {
    DIAMOND: 2000,
    PLATINUM: 1700,
    GOLD: 1400,
    SILVER: 1100,
    BRONZE: 0,
};

/**
 * Division thresholds within each rank (as % of rank range)
 * Uses 3 divisions to match LEAGUE_CONFIG.DIVISIONS_PER_LEAGUE
 * I = highest (about to promote), III = lowest (just entered rank)
 */
const DIVISION_RANGES = {
    I: 0.667,   // 66.7-100% of rank = Division I (highest)
    II: 0.333,  // 33.3-66.7% of rank = Division II (middle)
    III: 0,     // 0-33.3% of rank = Division III (lowest)
};

/**
 * Get rank and division from ELO
 */
export function getRankFromElo(elo: number): { rank: string; division: string } {
    let rank = 'BRONZE';
    let nextThreshold = RANK_THRESHOLDS.SILVER;
    let currentThreshold = RANK_THRESHOLDS.BRONZE;
    
    if (elo >= RANK_THRESHOLDS.DIAMOND) {
        rank = 'DIAMOND';
        currentThreshold = RANK_THRESHOLDS.DIAMOND;
        nextThreshold = 2600; // Cap for Diamond divisions (aligned with LEAGUES)
    } else if (elo >= RANK_THRESHOLDS.PLATINUM) {
        rank = 'PLATINUM';
        currentThreshold = RANK_THRESHOLDS.PLATINUM;
        nextThreshold = RANK_THRESHOLDS.DIAMOND;
    } else if (elo >= RANK_THRESHOLDS.GOLD) {
        rank = 'GOLD';
        currentThreshold = RANK_THRESHOLDS.GOLD;
        nextThreshold = RANK_THRESHOLDS.PLATINUM;
    } else if (elo >= RANK_THRESHOLDS.SILVER) {
        rank = 'SILVER';
        currentThreshold = RANK_THRESHOLDS.SILVER;
        nextThreshold = RANK_THRESHOLDS.GOLD;
    }
    
    // Calculate division within rank (3 divisions: I, II, III)
    // I = highest (about to promote), III = lowest (just entered rank)
    const rankRange = nextThreshold - currentThreshold;
    const positionInRank = elo - currentThreshold;
    const percentInRank = positionInRank / rankRange;
    
    let division = 'III';  // Default to lowest division
    if (percentInRank >= DIVISION_RANGES.I) division = 'I';
    else if (percentInRank >= DIVISION_RANGES.II) division = 'II';
    
    return { rank, division };
}

// =============================================================================
// TYPES
// =============================================================================

export interface ArenaPlayer {
    user_id: string;
    username: string;
    // 1v1 stats
    elo: number;
    peak_elo: number;
    matches_played: number;
    matches_won: number;
    matches_lost: number;
    current_streak: number;
    best_streak: number;
    total_score: number;
    // 5v5 stats
    elo_5v5: number;
    peak_elo_5v5: number;
    matches_played_5v5: number;
    matches_won_5v5: number;
    matches_lost_5v5: number;
    // Tier
    practice_tier: number;
    confidence_score: number;
    last_match_at: Date | null;
    last_match_5v5_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface ArenaTeam {
    team_id: string;
    team_name: string;
    team_tag: string | null;
    elo: number;
    peak_elo: number;
    matches_played: number;
    matches_won: number;
    matches_lost: number;
    current_streak: number;
    best_streak: number;
    total_score: number;
    avg_member_tier: number;
    created_at: Date;
    updated_at: Date;
}

export interface PlayerEloData {
    elo: number;
    practice_tier: number;
    confidence_score: number;
}

export interface TeamEloData {
    elo: number;
    avg_member_tier: number;
}

export interface MatchPlayer {
    userId: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    score?: number;
    questionsAnswered?: number;
    correctAnswers?: number;
    eloBefore: number;
    eloChange: number;
}

export interface TeamMatchData {
    id: string;
    team1: {
        id: string | null;
        name: string;
        players: MatchPlayer[];
        score: number;
        eloBefore: number;
        eloChange: number;
    };
    team2: {
        id: string | null;
        name: string;
        players: MatchPlayer[];
        score: number;
        eloBefore: number;
        eloChange: number;
    };
    winnerTeam: 1 | 2 | null;
    matchType: 'ranked' | 'casual';
    questionsCount: number;
    durationMs: number;
    isForfeit?: boolean;
    isAIMatch?: boolean;
}

export interface DuelMatchData {
    id: string;
    player1: {
        id: string;
        score: number;
        eloBefore: number;
        eloChange: number;
    };
    player2: {
        id: string;
        score: number;
        eloBefore: number;
        eloChange: number;
    };
    winner?: { id: string };
    questionsCount: number;
    durationMs: number;
    isDraw?: boolean;
    isForfeit?: boolean;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the PostgreSQL arena database schema
 */
export async function initArenaDatabase(): Promise<void> {
    await arenaPostgres.initSchema();
}

/**
 * Test PostgreSQL connection
 */
export async function testArenaConnection(): Promise<boolean> {
    return await arenaPostgres.testConnection();
}

/**
 * Close PostgreSQL connection pool
 */
export async function closeArenaDatabase(): Promise<void> {
    await arenaPostgres.closePool();
}

// =============================================================================
// PLAYER OPERATIONS
// =============================================================================

/**
 * Get or create an arena player record
 */
export async function getOrCreateArenaPlayer(
    userId: string,
    username: string
): Promise<ArenaPlayer> {
    return await arenaPostgres.getOrCreatePlayer(userId, username);
}

/**
 * Get arena player by ID
 */
export async function getArenaPlayer(userId: string): Promise<ArenaPlayer | null> {
    return await arenaPostgres.getPlayer(userId);
}

/**
 * Get player ELO for matchmaking
 * @param userId - Player ID
 * @param mode - '1v1' or '5v5'
 */
export async function getPlayerElo(
    userId: string,
    mode: '1v1' | '5v5' = '1v1'
): Promise<PlayerEloData> {
    return await arenaPostgres.getPlayerElo(userId, mode);
}

/**
 * Update player 1v1 ELO after a duel match
 */
export async function updatePlayerDuelElo(
    userId: string,
    eloChange: number,
    won: boolean
): Promise<void> {
    await arenaPostgres.updatePlayerElo(userId, eloChange, won);
}

/**
 * Update player 5v5 ELO after a team match
 */
export async function updatePlayer5v5Elo(
    userId: string,
    eloChange: number,
    won: boolean
): Promise<void> {
    await arenaPostgres.updatePlayer5v5Elo(userId, eloChange, won);
}

/**
 * Update player's practice tier and confidence score
 * @param userId - Player ID
 * @param tier - Tier level (1-100)
 * @param confidence - Confidence score (0.00-1.00)
 */
export async function updatePlayerTier(
    userId: string,
    tier: number,
    confidence: number
): Promise<void> {
    await arenaPostgres.updatePlayerTier(userId, tier, confidence);
}

/**
 * Get 1v1 duel leaderboard (with Redis caching)
 * 
 * Uses Redis cache with 60-second TTL for fast repeated access.
 * Cache is automatically invalidated after ELO updates.
 * 
 * @param limit - Number of entries to return
 * @param operation - Filter by operation: 'overall', 'addition', 'subtraction', 'multiplication', 'division'
 */
export async function getDuelLeaderboard(
    limit: number = 100,
    operation: 'overall' | 'addition' | 'subtraction' | 'multiplication' | 'division' = 'overall'
): Promise<ArenaPlayer[]> {
    // Try cache first
    if (arenaRedis) {
        try {
            const cached = await arenaRedis.getCachedLeaderboard('duel', operation);
            if (cached && cached.length >= limit) {
                return cached.slice(0, limit);
            }
        } catch (e) {
            // Cache miss or error, continue to DB
        }
    }
    
    // Fetch from PostgreSQL with operation filter
    const data = await arenaPostgres.getLeaderboard(limit, operation);
    
    // Cache the result
    if (arenaRedis && data && data.length > 0) {
        arenaRedis.cacheLeaderboard('duel', operation, data).catch(() => {});
    }
    
    return data;
}

/**
 * Invalidate leaderboard cache (call after ELO updates)
 */
export async function invalidateLeaderboardCache(type: string = 'all'): Promise<void> {
    if (arenaRedis) {
        await arenaRedis.invalidateLeaderboardCache(type);
    }
}

/**
 * Arena stats for display in social/friend lists
 */
export interface ArenaDisplayStats {
    odDuelElo: number;
    odDuelRank: string;
    odDuelDivision: string;
    odElo5v5: number;
    odElo5v5Rank: string;
    odElo5v5Division: string;
    odPracticeTier: number;
    odMatchesPlayed: number;
    odMatchesWon: number;
}

/**
 * Get arena display stats for a user (for social panel, friend lists, etc.)
 * This is the primary function to use when displaying ELO in the UI.
 * 
 * Uses Redis cache with 30-second TTL for fast repeated access.
 * 
 * @param userId - User ID to fetch stats for
 * @returns Arena stats with calculated rank/division, or defaults if player not found
 */
export async function getArenaDisplayStats(userId: string): Promise<ArenaDisplayStats> {
    const defaultStats = (): ArenaDisplayStats => {
        const defaultRank = getRankFromElo(300);
        return {
            odDuelElo: 300,
            odDuelRank: defaultRank.rank,
            odDuelDivision: defaultRank.division,
            odElo5v5: 300,
            odElo5v5Rank: defaultRank.rank,
            odElo5v5Division: defaultRank.division,
            odPracticeTier: 50,
            odMatchesPlayed: 0,
            odMatchesWon: 0,
        };
    };

    // Try cache first
    if (arenaRedis) {
        try {
            const cached = await arenaRedis.getCachedUserStats(userId);
            if (cached) {
                return cached as ArenaDisplayStats;
            }
        } catch (e) {
            // Cache miss, continue to DB
        }
    }

    try {
        const player = await arenaPostgres.getPlayer(userId);
        
        if (!player) {
            return defaultStats();
        }
        
        const duelRank = getRankFromElo(player.elo);
        const teamRank = getRankFromElo(player.elo_5v5);
        
        const stats: ArenaDisplayStats = {
            odDuelElo: player.elo,
            odDuelRank: duelRank.rank,
            odDuelDivision: duelRank.division,
            odElo5v5: player.elo_5v5,
            odElo5v5Rank: teamRank.rank,
            odElo5v5Division: teamRank.division,
            odPracticeTier: player.practice_tier,
            odMatchesPlayed: (player.matches_played || 0) + (player.matches_played_5v5 || 0),
            odMatchesWon: (player.matches_won || 0) + (player.matches_won_5v5 || 0),
        };
        
        // Cache the result
        if (arenaRedis) {
            arenaRedis.cacheUserStats(userId, stats).catch(() => {});
        }
        
        return stats;
    } catch (error) {
        console.error(`[ArenaDB] Failed to get display stats for ${userId}:`, error);
        return defaultStats();
    }
}

/**
 * Batch get arena display stats for multiple users
 * More efficient than calling getArenaDisplayStats multiple times
 * 
 * Uses Redis batch caching for maximum efficiency.
 * 
 * @param userIds - Array of user IDs
 * @returns Map of userId -> ArenaDisplayStats
 */
export async function getArenaDisplayStatsBatch(
    userIds: string[]
): Promise<Map<string, ArenaDisplayStats>> {
    // #region agent log
    const startTime = Date.now();
    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arena-db.ts:getArenaDisplayStatsBatch',message:'getArenaDisplayStatsBatch called',data:{userCount:userIds.length},timestamp:startTime,sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const result = new Map<string, ArenaDisplayStats>();
    
    if (userIds.length === 0) return result;
    
    const getDefaultStats = (): ArenaDisplayStats => {
        const defaultRank = getRankFromElo(300);
        return {
            odDuelElo: 300,
            odDuelRank: defaultRank.rank,
            odDuelDivision: defaultRank.division,
            odElo5v5: 300,
            odElo5v5Rank: defaultRank.rank,
            odElo5v5Division: defaultRank.division,
            odPracticeTier: 50,
            odMatchesPlayed: 0,
            odMatchesWon: 0,
        };
    };
    
    // Check Redis cache first
    let cachedStats: Record<string, ArenaDisplayStats> = {};
    let uncachedIds: string[] = [...userIds];
    
    if (arenaRedis) {
        try {
            cachedStats = await arenaRedis.getCachedUserStatsBatch(userIds);
            // Add cached results and identify uncached IDs
            for (const userId of userIds) {
                if (cachedStats[userId]) {
                    result.set(userId, cachedStats[userId] as ArenaDisplayStats);
                }
            }
            uncachedIds = userIds.filter(id => !cachedStats[id]);
        } catch (e) {
            // Cache failed, fetch all from DB
            uncachedIds = [...userIds];
        }
    }
    
    // If all cached, return early
    if (uncachedIds.length === 0) {
        return result;
    }
    
    try {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arena-db.ts:getArenaDisplayStatsBatch',message:'Calling getPlayersBatch',data:{uncachedCount:uncachedIds.length,durationSoFarMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        // Fetch uncached players in one query
        const players = await arenaPostgres.getPlayersBatch(uncachedIds);
        const playerMap = new Map(players.map((p: ArenaPlayer) => [p.user_id, p]));
        
        // Build result with defaults for missing players
        for (const userId of uncachedIds) {
            const player = playerMap.get(userId);
            
            if (player) {
                const duelRank = getRankFromElo(player.elo);
                const teamRank = getRankFromElo(player.elo_5v5);
                
                const stats: ArenaDisplayStats = {
                    odDuelElo: player.elo,
                    odDuelRank: duelRank.rank,
                    odDuelDivision: duelRank.division,
                    odElo5v5: player.elo_5v5,
                    odElo5v5Rank: teamRank.rank,
                    odElo5v5Division: teamRank.division,
                    odPracticeTier: player.practice_tier,
                    odMatchesPlayed: (player.matches_played || 0) + (player.matches_played_5v5 || 0),
                    odMatchesWon: (player.matches_won || 0) + (player.matches_won_5v5 || 0),
                };
                
                result.set(userId, stats);
                
                // Cache individual result
                if (arenaRedis) {
                    arenaRedis.cacheUserStats(userId, stats).catch(() => {});
                }
            } else {
                result.set(userId, getDefaultStats());
            }
        }
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arena-db.ts:getArenaDisplayStatsBatch',message:'getArenaDisplayStatsBatch CATCH ERROR',data:{error:String(error),durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        console.error(`[ArenaDB] Failed to batch get display stats:`, error);
        // Return defaults for uncached on error
        for (const userId of uncachedIds) {
            result.set(userId, getDefaultStats());
        }
    }
    
    return result;
}

// =============================================================================
// TEAM OPERATIONS
// =============================================================================

/**
 * Get or create an arena team record
 */
export async function getOrCreateArenaTeam(
    teamId: string,
    teamName: string,
    teamTag?: string
): Promise<ArenaTeam> {
    return await arenaPostgres.getOrCreateTeam(teamId, teamName, teamTag || null);
}

/**
 * Get arena team by ID
 */
export async function getArenaTeam(teamId: string): Promise<ArenaTeam | null> {
    return await arenaPostgres.getTeam(teamId);
}

/**
 * Get team ELO for matchmaking
 */
export async function getTeamElo(teamId: string): Promise<TeamEloData> {
    return await arenaPostgres.getTeamElo(teamId);
}

/**
 * Update team ELO after a match
 */
export async function updateTeamElo(
    teamId: string,
    eloChange: number,
    won: boolean,
    score: number = 0
): Promise<void> {
    await arenaPostgres.updateTeamElo(teamId, eloChange, won, score);
}

/**
 * Update team's average member tier
 */
export async function updateTeamAvgTier(
    teamId: string,
    avgTier: number
): Promise<void> {
    await arenaPostgres.updateTeamAvgTier(teamId, avgTier);
}

/**
 * Get 5v5 team leaderboard
 */
export async function getTeamLeaderboard(limit: number = 50): Promise<ArenaTeam[]> {
    return await arenaPostgres.getTeamLeaderboard(limit);
}

// =============================================================================
// MATCH OPERATIONS
// =============================================================================

/**
 * Record a completed 1v1 duel match
 */
export async function recordDuelMatch(
    matchData: DuelMatchData
): Promise<{ success: boolean; error?: string }> {
    return await arenaPostgres.recordMatch(matchData);
}

/**
 * Record a completed 5v5 team match
 */
export async function recordTeamMatch(
    matchData: TeamMatchData
): Promise<{ success: boolean; error?: string }> {
    return await arenaPostgres.recordTeamMatch(matchData);
}

/**
 * Get player's 1v1 match history
 */
export async function getPlayerDuelHistory(
    userId: string,
    limit: number = 20
): Promise<any[]> {
    return await arenaPostgres.getPlayerMatchHistory(userId, limit);
}

/**
 * Get player's 5v5 team match history
 */
export async function getPlayerTeamHistory(
    userId: string,
    limit: number = 20
): Promise<any[]> {
    return await arenaPostgres.getPlayerTeamMatchHistory(userId, limit);
}

/**
 * Get team's match history
 */
export async function getTeamMatchHistory(
    teamId: string,
    limit: number = 20
): Promise<any[]> {
    return await arenaPostgres.getTeamMatchHistory(teamId, limit);
}

/**
 * Get global arena statistics
 */
export async function getGlobalArenaStats(): Promise<{
    total_players: number;
    total_matches: number;
    average_elo: number;
    highest_elo: number;
}> {
    return await arenaPostgres.getGlobalStats();
}

// =============================================================================
// PER-OPERATION ELO (Complete Stats)
// =============================================================================

/**
 * Full arena stats interface (matches SQLite getArenaStats format)
 */
export interface FullArenaStats {
    duel: {
        elo: number;
        addition: number;
        subtraction: number;
        multiplication: number;
        divisionOp: number;
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;
        winsToNextDivision: number;
    };
    team: {
        elo: number;
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;
        winsToNextDivision: number;
        modes: {
            '2v2': ModeEloStats;
            '3v3': ModeEloStats;
            '4v4': ModeEloStats;
            '5v5': ModeEloStats;
        };
    };
}

export interface ModeEloStats {
    elo: number;
    addition: number;
    subtraction: number;
    multiplication: number;
    divisionOp: number;
}

/**
 * Get full arena stats for a player (replaces SQLite getArenaStats)
 * This is the primary function for displaying arena stats on the stats page.
 */
export async function getFullArenaStats(userId: string): Promise<FullArenaStats | null> {
    try {
        const stats = await arenaPostgres.getPlayerFullStats(userId);
        if (!stats) return null;

        // Calculate ranks from wins
        const duelRank = getRankFromElo(stats.duel.elo);
        const teamRank = getRankFromElo(stats.team.elo);

        return {
            duel: {
                ...stats.duel,
                rank: duelRank.rank,
                rankDivision: duelRank.division,
                winsToNextDivision: calculateWinsToNextDivision(stats.duel.wins),
            },
            team: {
                ...stats.team,
                rank: teamRank.rank,
                rankDivision: teamRank.division,
                winsToNextDivision: calculateWinsToNextDivision(stats.team.wins),
            },
        };
    } catch (error) {
        console.error(`[ArenaDB] Failed to get full stats for ${userId}:`, error);
        return null;
    }
}

/**
 * Helper to calculate wins to next division
 */
function calculateWinsToNextDivision(wins: number): number {
    // Simple approximation - can be made more complex
    const winsPerDivision = 10;
    const nextMilestone = Math.ceil((wins + 1) / winsPerDivision) * winsPerDivision;
    return nextMilestone - wins;
}

/**
 * Update player per-operation ELO after a 1v1 match
 */
export async function updatePlayerOperationElo(
    userId: string,
    operation: 'addition' | 'subtraction' | 'multiplication' | 'division',
    newElo: number,
    eloChange: number,
    won: boolean
): Promise<void> {
    await arenaPostgres.updatePlayerOperationElo(userId, operation, newElo, eloChange, won);
}

/**
 * Update player per-operation ELO for team modes
 */
export async function updatePlayerTeamOperationElo(
    userId: string,
    mode: '2v2' | '3v3' | '4v4' | '5v5',
    operation: 'addition' | 'subtraction' | 'multiplication' | 'division',
    newElo: number,
    won: boolean
): Promise<void> {
    await arenaPostgres.updatePlayerTeamOperationElo(userId, mode, operation, newElo, won);
}

