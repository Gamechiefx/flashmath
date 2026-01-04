'use server';

import { getDatabase } from '@/lib/db/sqlite';
import { auth } from '@/auth';
import { getLeagueFromElo } from '@/lib/arena/leagues';

// =============================================================================
// APS CALCULATION HELPERS
// =============================================================================

// APS weights from arena constants
const APS_WEIGHTS = {
    ACCURACY: 0.40,
    STREAK: 0.35,
    SPEED: 0.25,
};

// Speed thresholds (ms) - faster is better
const SPEED_THRESHOLDS = {
    ELITE: 1500,   // Under 1.5s = elite
    FAST: 2500,    // Under 2.5s = fast
    AVERAGE: 4000, // Under 4s = average
    SLOW: 6000,    // Under 6s = slow
};

/**
 * Calculate APS score (0-100) from raw metrics
 */
function calculateApsScore(accuracy: number, avgSpeedMs: number, bestStreak: number): number {
    // Accuracy component (0-100)
    const accuracyScore = Math.min(100, accuracy);
    
    // Streak component (normalized, max 10 streak = 100)
    const streakScore = Math.min(100, (bestStreak / 10) * 100);
    
    // Speed component (faster = higher, 1s = 100, 10s = 0)
    const speedScore = avgSpeedMs > 0 
        ? Math.max(0, Math.min(100, 100 - ((avgSpeedMs - 1000) / 90)))
        : 50; // Default to 50 if no data
    
    // Weighted composite
    const apsScore = 
        (accuracyScore * APS_WEIGHTS.ACCURACY) +
        (streakScore * APS_WEIGHTS.STREAK) +
        (speedScore * APS_WEIGHTS.SPEED);
    
    return Math.round(apsScore);
}

/**
 * Calculate APS breakdown for detailed view
 * Returns both normalized scores (for progress bars) and raw values (for display)
 */
function calculateApsBreakdown(accuracy: number, avgSpeedMs: number, bestStreak: number): {
    accuracy: number;
    streak: number;
    speed: number;
    // Raw values for clearer display
    rawAccuracy: number;
    rawStreak: number;
    rawSpeedMs: number;
} {
    const accuracyScore = Math.min(100, accuracy);
    const streakScore = Math.min(100, (bestStreak / 10) * 100);
    const speedScore = avgSpeedMs > 0 
        ? Math.max(0, Math.min(100, 100 - ((avgSpeedMs - 1000) / 90)))
        : 50;
    
    return {
        accuracy: Math.round(accuracyScore),
        streak: Math.round(streakScore),
        speed: Math.round(speedScore),
        // Raw values
        rawAccuracy: Math.round(accuracy),
        rawStreak: bestStreak,
        rawSpeedMs: Math.round(avgSpeedMs),
    };
}

/**
 * Determine trend from recent ELO changes
 */
function calculateTrend(recentEloChanges: number[]): 'rising' | 'stable' | 'falling' {
    if (recentEloChanges.length < 2) return 'stable';
    
    const totalChange = recentEloChanges.reduce((sum, c) => sum + c, 0);
    
    if (totalChange > 15) return 'rising';
    if (totalChange < -15) return 'falling';
    return 'stable';
}

/**
 * Analyze strengths and weaknesses based on metrics
 */
function analyzeStrengthsWeaknesses(
    accuracy: number,
    avgSpeedMs: number,
    bestStreak: number,
    winRate: number
): { strengths: ('accuracy' | 'speed' | 'consistency' | 'improvement')[]; weaknesses: ('accuracy' | 'speed' | 'consistency' | 'improvement')[] } {
    const strengths: ('accuracy' | 'speed' | 'consistency' | 'improvement')[] = [];
    const weaknesses: ('accuracy' | 'speed' | 'consistency' | 'improvement')[] = [];
    
    // Accuracy analysis (threshold: 80% = strong, <60% = weak)
    if (accuracy >= 80) {
        strengths.push('accuracy');
    } else if (accuracy < 60) {
        weaknesses.push('accuracy');
    }
    
    // Speed analysis (threshold: <2.5s = fast, >5s = slow)
    if (avgSpeedMs > 0 && avgSpeedMs < SPEED_THRESHOLDS.FAST) {
        strengths.push('speed');
    } else if (avgSpeedMs > SPEED_THRESHOLDS.SLOW) {
        weaknesses.push('speed');
    }
    
    // Consistency analysis (based on best streak - 5+ = consistent)
    if (bestStreak >= 5) {
        strengths.push('consistency');
    } else if (bestStreak <= 2 && winRate > 0) {
        weaknesses.push('consistency');
    }
    
    return { strengths, weaknesses };
}

/**
 * Get the strongest operation for a user based on accuracy
 * Returns the operation with highest average accuracy, or null if no data
 */
function getStrongestOperation(db: ReturnType<typeof getDatabase>, userId: string): string | null {
    const result = db.prepare(`
        SELECT 
            operation,
            AVG(accuracy) as avg_accuracy,
            COUNT(*) as match_count
        FROM (
            SELECT operation, winner_accuracy as accuracy
            FROM arena_matches 
            WHERE mode = '1v1' AND winner_id = ? AND winner_accuracy IS NOT NULL
            UNION ALL
            SELECT operation, loser_accuracy as accuracy
            FROM arena_matches 
            WHERE mode = '1v1' AND loser_id = ? AND loser_accuracy IS NOT NULL
        )
        GROUP BY operation
        HAVING match_count >= 1
        ORDER BY avg_accuracy DESC, match_count DESC
        LIMIT 1
    `).get(userId, userId) as { operation: string; avg_accuracy: number; match_count: number } | undefined;
    
    return result?.operation || null;
}

// =============================================================================
// TYPES
// =============================================================================

export type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division' | 'overall';
export type TimeFilter = 'weekly' | 'alltime';
export type LeaderboardType = 'duel' | 'team';

// APS Breakdown for detailed metrics
export interface ApsBreakdown {
    accuracy: number;   // 0-100 score (40% weight)
    streak: number;     // 0-100 score (35% weight)
    speed: number;      // 0-100 score (25% weight)
}

// Strength/weakness indicator types
export type StrengthType = 'accuracy' | 'speed' | 'consistency' | 'improvement';
export type TrendDirection = 'rising' | 'stable' | 'falling';

export interface LeaderboardEntry {
    rank: number;
    odUserId: string;
    odName: string;
    odLevel: number;
    odElo: number;
    odWins: number;
    odLosses: number;
    odWinRate: number;
    odStreak: number;
    odBestStreak: number;
    odLeague: string;
    odDivision: string;
    odEquippedFrame: string | null;
    odEquippedTitle: string | null;
    odEquippedBanner: string | null;
    odIsCurrentUser: boolean;
    odEloChange?: number; // For weekly: net ELO change this week
    odWeeklyWins?: number; // For weekly: wins this week
    
    // Performance metrics (condensed - available for all players)
    odAccuracy: number;         // Lifetime accuracy % (0-100)
    odAvgSpeedMs: number;       // Average answer speed in ms
    odApsScore: number;         // Composite APS score (0-100)
    odStrongestOperation?: string; // Best performing operation (for Overall view)
    
    // Extended metrics (full detail - only for current user)
    odApsBreakdown?: ApsBreakdown;
    odRecentTrend?: TrendDirection;
    odStrengths?: StrengthType[];
    odWeaknesses?: StrengthType[];
    odRecentEloChanges?: number[]; // Last 5 match ELO changes
}

export interface LeaderboardResult {
    entries: LeaderboardEntry[];
    currentUserRank: number | null;
    currentUserEntry: LeaderboardEntry | null;
    totalPlayers: number;
    operation: Operation;
    timeFilter: TimeFilter;
    type: LeaderboardType;
}

// =============================================================================
// DUEL LEADERBOARD
// =============================================================================

/**
 * Get the duel (1v1) leaderboard for a specific operation
 */
export async function getDuelLeaderboard(
    operation: Operation = 'overall',
    timeFilter: TimeFilter = 'alltime',
    limit: number = 100
): Promise<LeaderboardResult> {
    const session = await auth();
    const currentUserId = session?.user?.id || null;
    const db = getDatabase();

    // Determine which ELO column to use based on operation
    const eloColumn = operation === 'overall' 
        ? 'arena_elo_duel'
        : `arena_elo_duel_${operation}`;

    let entries: LeaderboardEntry[] = [];
    let totalPlayers = 0;

    if (timeFilter === 'alltime') {
        // All-time leaderboard: direct query on users table with performance stats
        const countResult = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE (arena_duel_wins > 0 OR arena_duel_losses > 0)
        `).get() as { count: number };
        totalPlayers = countResult.count;

        // Query with aggregated performance stats from arena_matches
        // Filter by operation if not 'overall'
        const operationFilter = operation !== 'overall' ? `AND operation = '${operation}'` : '';
        
        const rows = db.prepare(`
            WITH user_perf AS (
                SELECT 
                    user_id,
                    AVG(accuracy) as avg_accuracy,
                    AVG(avg_speed_ms) as avg_speed,
                    MAX(max_streak) as best_streak_match
                FROM (
                    SELECT 
                        winner_id as user_id,
                        winner_accuracy as accuracy,
                        winner_avg_speed_ms as avg_speed_ms,
                        winner_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND winner_accuracy IS NOT NULL ${operationFilter}
                    UNION ALL
                    SELECT 
                        loser_id as user_id,
                        loser_accuracy as accuracy,
                        loser_avg_speed_ms as avg_speed_ms,
                        loser_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND loser_accuracy IS NOT NULL ${operationFilter}
                )
                GROUP BY user_id
            )
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_duel_wins as wins,
                u.arena_duel_losses as losses,
                u.arena_duel_win_streak as streak,
                u.arena_duel_best_win_streak as best_streak,
                u.equipped_items,
                COALESCE(p.avg_accuracy, 0) as avg_accuracy,
                COALESCE(p.avg_speed, 0) as avg_speed,
                COALESCE(p.best_streak_match, 0) as best_streak_match
            FROM users u
            LEFT JOIN user_perf p ON p.user_id = u.id
            WHERE (u.arena_duel_wins > 0 OR u.arena_duel_losses > 0)
            ORDER BY u.${eloColumn} DESC
            LIMIT ?
        `).all(limit) as any[];

        entries = rows.map((row, index) => {
            const equippedItems = row.equipped_items ? JSON.parse(row.equipped_items) : {};
            const league = getLeagueFromElo(row.elo);
            const winRate = row.wins + row.losses > 0 
                ? Math.round((row.wins / (row.wins + row.losses)) * 100) 
                : 0;
            
            // Use performance data from arena_matches (best_streak_match is in-match answer streak)
            const accuracy = row.avg_accuracy || 0;
            const avgSpeedMs = row.avg_speed || 0;
            const bestAnswerStreak = row.best_streak_match || 0;  // Best answer streak within matches
            
            const apsScore = calculateApsScore(accuracy * 100, avgSpeedMs, bestAnswerStreak);
            const isCurrentUser = row.id === currentUserId;
            
            // Get strongest operation for Overall view
            const strongestOp = operation === 'overall' ? getStrongestOperation(db, row.id) : null;
            
            // Get extended data for current user
            let extendedData = {};
            if (isCurrentUser) {
                const breakdown = calculateApsBreakdown(accuracy * 100, avgSpeedMs, bestAnswerStreak);
                const { strengths, weaknesses } = analyzeStrengthsWeaknesses(
                    accuracy * 100, avgSpeedMs, bestAnswerStreak, winRate
                );
                
                // Get recent ELO changes for trend
                const recentMatches = db.prepare(`
                    SELECT 
                        CASE WHEN winner_id = ? THEN winner_elo_change ELSE loser_elo_change END as elo_change
                    FROM arena_matches
                    WHERE (winner_id = ? OR loser_id = ?) AND mode = '1v1'
                    ORDER BY created_at DESC
                    LIMIT 5
                `).all(currentUserId, currentUserId, currentUserId) as { elo_change: number }[];
                
                const recentEloChanges = recentMatches.map(m => m.elo_change);
                const trend = calculateTrend(recentEloChanges);
                
                extendedData = {
                    odApsBreakdown: breakdown,
                    odRecentTrend: trend,
                    odStrengths: strengths,
                    odWeaknesses: weaknesses,
                    odRecentEloChanges: recentEloChanges,
                };
            }

            return {
                rank: index + 1,
                odUserId: row.id,
                odName: row.name,
                odLevel: row.level,
                odElo: row.elo,
                odWins: row.wins,
                odLosses: row.losses,
                odWinRate: winRate,
                odStreak: row.streak,
                odBestStreak: bestAnswerStreak,  // Use in-match answer streak, not match win streak
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: isCurrentUser,
                odAccuracy: Math.round(accuracy * 100),
                odAvgSpeedMs: Math.round(avgSpeedMs),
                odApsScore: apsScore,
                odStrongestOperation: strongestOp || undefined,  // Strongest operation for Overall view
                ...extendedData,
            };
        });
    } else {
        // Weekly leaderboard: aggregate from arena_matches in last 7 days
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        // Get weekly stats for players with matches in the last week
        const rows = db.prepare(`
            WITH weekly_stats AS (
                SELECT 
                    winner_id as user_id,
                    SUM(winner_elo_change) as elo_change,
                    COUNT(*) as weekly_wins,
                    0 as weekly_losses
                FROM arena_matches
                WHERE created_at >= ? AND mode = '1v1'
                    ${operation !== 'overall' ? 'AND operation = ?' : ''}
                GROUP BY winner_id
                
                UNION ALL
                
                SELECT 
                    loser_id as user_id,
                    SUM(loser_elo_change) as elo_change,
                    0 as weekly_wins,
                    COUNT(*) as weekly_losses
                FROM arena_matches
                WHERE created_at >= ? AND mode = '1v1'
                    ${operation !== 'overall' ? 'AND operation = ?' : ''}
                GROUP BY loser_id
            ),
            aggregated AS (
                SELECT 
                    user_id,
                    SUM(elo_change) as net_elo_change,
                    SUM(weekly_wins) as weekly_wins,
                    SUM(weekly_losses) as weekly_losses
                FROM weekly_stats
                GROUP BY user_id
            )
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_duel_wins as wins,
                u.arena_duel_losses as losses,
                u.arena_duel_win_streak as streak,
                u.arena_duel_best_win_streak as best_streak,
                u.equipped_items,
                a.net_elo_change,
                a.weekly_wins,
                a.weekly_losses
            FROM aggregated a
            JOIN users u ON u.id = a.user_id
            ORDER BY a.net_elo_change DESC, a.weekly_wins DESC
            LIMIT ?
        `).all(
            operation !== 'overall' 
                ? [weekAgo, operation, weekAgo, operation, limit]
                : [weekAgo, weekAgo, limit]
        ) as any[];

        totalPlayers = rows.length;

        // Get performance stats for weekly entries
        const userIds = rows.map((r: any) => r.id);
        const perfStats = new Map<string, { accuracy: number; avgSpeed: number; bestStreak: number }>();
        
        if (userIds.length > 0) {
            const placeholders = userIds.map(() => '?').join(',');
            // Filter by operation if not 'overall'
            const opFilter = operation !== 'overall' ? `AND operation = ?` : '';
            const queryParams = operation !== 'overall'
                ? [...userIds, operation, ...userIds, operation]
                : [...userIds, ...userIds];
            
            const perfRows = db.prepare(`
                SELECT 
                    user_id,
                    AVG(accuracy) as avg_accuracy,
                    AVG(avg_speed_ms) as avg_speed,
                    MAX(max_streak) as best_streak
                FROM (
                    SELECT winner_id as user_id, winner_accuracy as accuracy, winner_avg_speed_ms as avg_speed_ms, winner_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND winner_id IN (${placeholders}) ${opFilter}
                    UNION ALL
                    SELECT loser_id as user_id, loser_accuracy as accuracy, loser_avg_speed_ms as avg_speed_ms, loser_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND loser_id IN (${placeholders}) ${opFilter}
                )
                GROUP BY user_id
            `).all(queryParams) as any[];
            
            for (const p of perfRows) {
                perfStats.set(p.user_id, {
                    accuracy: p.avg_accuracy || 0,
                    avgSpeed: p.avg_speed || 0,
                    bestStreak: p.best_streak || 0,
                });
            }
        }

        entries = rows.map((row: any, index: number) => {
            const equippedItems = row.equipped_items ? JSON.parse(row.equipped_items) : {};
            const league = getLeagueFromElo(row.elo);
            const winRate = row.wins + row.losses > 0 
                ? Math.round((row.wins / (row.wins + row.losses)) * 100) 
                : 0;
            
            const perf = perfStats.get(row.id) || { accuracy: 0, avgSpeed: 0, bestStreak: 0 };
            const accuracy = perf.accuracy;
            const avgSpeedMs = perf.avgSpeed;
            const bestAnswerStreak = perf.bestStreak || 0;  // Use in-match answer streak from performance stats
            
            const apsScore = calculateApsScore(accuracy * 100, avgSpeedMs, bestAnswerStreak);
            const isCurrentUser = row.id === currentUserId;
            
            // Get strongest operation for Overall view
            const strongestOp = operation === 'overall' ? getStrongestOperation(db, row.id) : null;
            
            let extendedData = {};
            if (isCurrentUser) {
                const breakdown = calculateApsBreakdown(accuracy * 100, avgSpeedMs, bestAnswerStreak);
                const { strengths, weaknesses } = analyzeStrengthsWeaknesses(
                    accuracy * 100, avgSpeedMs, bestAnswerStreak, winRate
                );
                
                const recentMatches = db.prepare(`
                    SELECT CASE WHEN winner_id = ? THEN winner_elo_change ELSE loser_elo_change END as elo_change
                    FROM arena_matches WHERE (winner_id = ? OR loser_id = ?) AND mode = '1v1'
                    ORDER BY created_at DESC LIMIT 5
                `).all(currentUserId, currentUserId, currentUserId) as { elo_change: number }[];
                
                const recentEloChanges = recentMatches.map(m => m.elo_change);
                const trend = calculateTrend(recentEloChanges);
                
                extendedData = {
                    odApsBreakdown: breakdown,
                    odRecentTrend: trend,
                    odStrengths: strengths,
                    odWeaknesses: weaknesses,
                    odRecentEloChanges: recentEloChanges,
                };
            }

            return {
                rank: index + 1,
                odUserId: row.id,
                odName: row.name,
                odLevel: row.level,
                odElo: row.elo,
                odWins: row.wins,
                odLosses: row.losses,
                odWinRate: winRate,
                odStreak: row.streak,
                odBestStreak: bestAnswerStreak,  // Use in-match answer streak
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: isCurrentUser,
                odEloChange: row.net_elo_change || 0,
                odWeeklyWins: row.weekly_wins || 0,
                odAccuracy: Math.round(accuracy * 100),
                odAvgSpeedMs: Math.round(avgSpeedMs),
                odApsScore: apsScore,
                odStrongestOperation: strongestOp || undefined,
                ...extendedData,
            };
        });
    }

    // Find current user's rank if not in top entries
    let currentUserRank: number | null = null;
    let currentUserEntry: LeaderboardEntry | null = null;

    const existingUserEntry = entries.find(e => e.odIsCurrentUser);
    if (existingUserEntry) {
        currentUserRank = existingUserEntry.rank;
        currentUserEntry = existingUserEntry;
    } else if (currentUserId) {
        // Query for current user's rank
        const userRow = db.prepare(`
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_duel_wins as wins,
                u.arena_duel_losses as losses,
                u.arena_duel_win_streak as streak,
                u.arena_duel_best_win_streak as best_streak,
                u.equipped_items,
                (SELECT COUNT(*) + 1 FROM users u2 
                 WHERE u2.${eloColumn} > u.${eloColumn} 
                 AND (u2.arena_duel_wins > 0 OR u2.arena_duel_losses > 0)) as rank
            FROM users u
            WHERE u.id = ?
        `).get(currentUserId) as any;

        if (userRow && (userRow.wins > 0 || userRow.losses > 0)) {
            const equippedItems = userRow.equipped_items ? JSON.parse(userRow.equipped_items) : {};
            const league = getLeagueFromElo(userRow.elo);
            const winRate = userRow.wins + userRow.losses > 0 
                ? Math.round((userRow.wins / (userRow.wins + userRow.losses)) * 100) 
                : 0;
            
            // Get performance stats for current user (including best answer streak)
            const perfRow = db.prepare(`
                SELECT 
                    AVG(accuracy) as avg_accuracy,
                    AVG(avg_speed_ms) as avg_speed,
                    MAX(max_streak) as best_streak_match
                FROM (
                    SELECT winner_accuracy as accuracy, winner_avg_speed_ms as avg_speed_ms, winner_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND winner_id = ?
                    UNION ALL
                    SELECT loser_accuracy as accuracy, loser_avg_speed_ms as avg_speed_ms, loser_max_streak as max_streak
                    FROM arena_matches WHERE mode = '1v1' AND loser_id = ?
                )
            `).get(currentUserId, currentUserId) as any;
            
            const accuracy = perfRow?.avg_accuracy || 0;
            const avgSpeedMs = perfRow?.avg_speed || 0;
            const bestAnswerStreak = perfRow?.best_streak_match || 0;  // In-match answer streak
            const apsScore = calculateApsScore(accuracy * 100, avgSpeedMs, bestAnswerStreak);
            
            // Get strongest operation for Overall view
            const strongestOp = operation === 'overall' ? getStrongestOperation(db, currentUserId) : null;
            
            // Get extended data
            const breakdown = calculateApsBreakdown(accuracy * 100, avgSpeedMs, bestAnswerStreak);
            const { strengths, weaknesses } = analyzeStrengthsWeaknesses(
                accuracy * 100, avgSpeedMs, bestAnswerStreak, winRate
            );
            
            const recentMatches = db.prepare(`
                SELECT CASE WHEN winner_id = ? THEN winner_elo_change ELSE loser_elo_change END as elo_change
                FROM arena_matches WHERE (winner_id = ? OR loser_id = ?) AND mode = '1v1'
                ORDER BY created_at DESC LIMIT 5
            `).all(currentUserId, currentUserId, currentUserId) as { elo_change: number }[];
            
            const recentEloChanges = recentMatches.map(m => m.elo_change);
            const trend = calculateTrend(recentEloChanges);

            currentUserRank = userRow.rank;
            currentUserEntry = {
                rank: userRow.rank,
                odUserId: userRow.id,
                odName: userRow.name,
                odLevel: userRow.level,
                odElo: userRow.elo,
                odWins: userRow.wins,
                odLosses: userRow.losses,
                odWinRate: winRate,
                odStreak: userRow.streak,
                odBestStreak: bestAnswerStreak,  // Use in-match answer streak
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: true,
                odAccuracy: Math.round(accuracy * 100),
                odAvgSpeedMs: Math.round(avgSpeedMs),
                odApsScore: apsScore,
                odStrongestOperation: strongestOp || undefined,
                odApsBreakdown: breakdown,
                odRecentTrend: trend,
                odStrengths: strengths,
                odWeaknesses: weaknesses,
                odRecentEloChanges: recentEloChanges,
            };
        }
    }

    return {
        entries,
        currentUserRank,
        currentUserEntry,
        totalPlayers,
        operation,
        timeFilter,
        type: 'duel',
    };
}

// =============================================================================
// TEAM LEADERBOARD
// =============================================================================

/**
 * Get the team leaderboard for a specific operation
 * Note: Team modes are not yet implemented, so this returns placeholder data
 */
export async function getTeamLeaderboard(
    operation: Operation = 'overall',
    timeFilter: TimeFilter = 'alltime',
    limit: number = 100
): Promise<LeaderboardResult> {
    const session = await auth();
    const currentUserId = session?.user?.id || null;
    const db = getDatabase();

    // For now, team leaderboard uses arena_elo_team
    // In the future, this could be per-mode (2v2, 3v3, etc.)
    const eloColumn = 'arena_elo_team';

    let entries: LeaderboardEntry[] = [];
    let totalPlayers = 0;

    if (timeFilter === 'alltime') {
        const countResult = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE (arena_team_wins > 0 OR arena_team_losses > 0)
        `).get() as { count: number };
        totalPlayers = countResult.count;

        const rows = db.prepare(`
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_team_wins as wins,
                u.arena_team_losses as losses,
                u.arena_team_win_streak as streak,
                u.arena_team_best_win_streak as best_streak,
                u.equipped_items
            FROM users u
            WHERE (u.arena_team_wins > 0 OR u.arena_team_losses > 0)
            ORDER BY u.${eloColumn} DESC
            LIMIT ?
        `).all(limit) as any[];

        entries = rows.map((row: any, index: number) => {
            const equippedItems = row.equipped_items ? JSON.parse(row.equipped_items) : {};
            const league = getLeagueFromElo(row.elo);
            const winRate = row.wins + row.losses > 0 
                ? Math.round((row.wins / (row.wins + row.losses)) * 100) 
                : 0;
            
            // Default APS metrics for team (less match data available)
            const bestStreak = row.best_streak || 0;
            const apsScore = calculateApsScore(winRate, 3000, bestStreak); // Use win rate as proxy

            return {
                rank: index + 1,
                odUserId: row.id,
                odName: row.name,
                odLevel: row.level,
                odElo: row.elo,
                odWins: row.wins,
                odLosses: row.losses,
                odWinRate: winRate,
                odStreak: row.streak,
                odBestStreak: row.best_streak,
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: row.id === currentUserId,
                odAccuracy: winRate, // Use win rate as proxy for team
                odAvgSpeedMs: 0,
                odApsScore: apsScore,
            };
        });
    } else {
        // Weekly team leaderboard - similar logic to duel
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const rows = db.prepare(`
            WITH weekly_stats AS (
                SELECT 
                    winner_id as user_id,
                    SUM(winner_elo_change) as elo_change,
                    COUNT(*) as weekly_wins,
                    0 as weekly_losses
                FROM arena_matches
                WHERE created_at >= ? AND mode != '1v1'
                    ${operation !== 'overall' ? 'AND operation = ?' : ''}
                GROUP BY winner_id
                
                UNION ALL
                
                SELECT 
                    loser_id as user_id,
                    SUM(loser_elo_change) as elo_change,
                    0 as weekly_wins,
                    COUNT(*) as weekly_losses
                FROM arena_matches
                WHERE created_at >= ? AND mode != '1v1'
                    ${operation !== 'overall' ? 'AND operation = ?' : ''}
                GROUP BY loser_id
            ),
            aggregated AS (
                SELECT 
                    user_id,
                    SUM(elo_change) as net_elo_change,
                    SUM(weekly_wins) as weekly_wins,
                    SUM(weekly_losses) as weekly_losses
                FROM weekly_stats
                GROUP BY user_id
            )
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_team_wins as wins,
                u.arena_team_losses as losses,
                u.arena_team_win_streak as streak,
                u.arena_team_best_win_streak as best_streak,
                u.equipped_items,
                a.net_elo_change,
                a.weekly_wins,
                a.weekly_losses
            FROM aggregated a
            JOIN users u ON u.id = a.user_id
            ORDER BY a.net_elo_change DESC, a.weekly_wins DESC
            LIMIT ?
        `).all(
            operation !== 'overall' 
                ? [weekAgo, operation, weekAgo, operation, limit]
                : [weekAgo, weekAgo, limit]
        ) as any[];

        totalPlayers = rows.length;

        entries = rows.map((row: any, index: number) => {
            const equippedItems = row.equipped_items ? JSON.parse(row.equipped_items) : {};
            const league = getLeagueFromElo(row.elo);
            const winRate = row.wins + row.losses > 0 
                ? Math.round((row.wins / (row.wins + row.losses)) * 100) 
                : 0;
            
            const bestStreak = row.best_streak || 0;
            const apsScore = calculateApsScore(winRate, 3000, bestStreak);

            return {
                rank: index + 1,
                odUserId: row.id,
                odName: row.name,
                odLevel: row.level,
                odElo: row.elo,
                odWins: row.wins,
                odLosses: row.losses,
                odWinRate: winRate,
                odStreak: row.streak,
                odBestStreak: row.best_streak,
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: row.id === currentUserId,
                odEloChange: row.net_elo_change || 0,
                odWeeklyWins: row.weekly_wins || 0,
                odAccuracy: winRate,
                odAvgSpeedMs: 0,
                odApsScore: apsScore,
            };
        });
    }

    // Find current user's rank
    let currentUserRank: number | null = null;
    let currentUserEntry: LeaderboardEntry | null = null;

    const existingUserEntry = entries.find(e => e.odIsCurrentUser);
    if (existingUserEntry) {
        currentUserRank = existingUserEntry.rank;
        currentUserEntry = existingUserEntry;
    } else if (currentUserId) {
        const userRow = db.prepare(`
            SELECT 
                u.id,
                u.name,
                u.level,
                u.${eloColumn} as elo,
                u.arena_team_wins as wins,
                u.arena_team_losses as losses,
                u.arena_team_win_streak as streak,
                u.arena_team_best_win_streak as best_streak,
                u.equipped_items,
                (SELECT COUNT(*) + 1 FROM users u2 
                 WHERE u2.${eloColumn} > u.${eloColumn} 
                 AND (u2.arena_team_wins > 0 OR u2.arena_team_losses > 0)) as rank
            FROM users u
            WHERE u.id = ?
        `).get(currentUserId) as any;

        if (userRow && (userRow.wins > 0 || userRow.losses > 0)) {
            const equippedItems = userRow.equipped_items ? JSON.parse(userRow.equipped_items) : {};
            const league = getLeagueFromElo(userRow.elo);
            const winRate = userRow.wins + userRow.losses > 0 
                ? Math.round((userRow.wins / (userRow.wins + userRow.losses)) * 100) 
                : 0;
            
            const bestStreak = userRow.best_streak || 0;
            const apsScore = calculateApsScore(winRate, 3000, bestStreak);

            currentUserRank = userRow.rank;
            currentUserEntry = {
                rank: userRow.rank,
                odUserId: userRow.id,
                odName: userRow.name,
                odLevel: userRow.level,
                odElo: userRow.elo,
                odWins: userRow.wins,
                odLosses: userRow.losses,
                odWinRate: winRate,
                odStreak: userRow.streak,
                odBestStreak: userRow.best_streak,
                odLeague: league.league,
                odDivision: league.division,
                odEquippedFrame: equippedItems.frame || null,
                odEquippedTitle: equippedItems.title || null,
                odEquippedBanner: equippedItems.banner || null,
                odIsCurrentUser: true,
                odAccuracy: winRate,
                odAvgSpeedMs: 0,
                odApsScore: apsScore,
            };
        }
    }

    return {
        entries,
        currentUserRank,
        currentUserEntry,
        totalPlayers,
        operation,
        timeFilter,
        type: 'team',
    };
}

// =============================================================================
// UNIFIED LEADERBOARD GETTER
// =============================================================================

/**
 * Get leaderboard data based on type, operation, and time filter
 */
export async function getArenaLeaderboard(
    type: LeaderboardType = 'duel',
    operation: Operation = 'overall',
    timeFilter: TimeFilter = 'alltime',
    limit: number = 100
): Promise<LeaderboardResult> {
    if (type === 'team') {
        return getTeamLeaderboard(operation, timeFilter, limit);
    }
    return getDuelLeaderboard(operation, timeFilter, limit);
}

// =============================================================================
// PERSISTENT TEAM LEADERBOARD (Ranks TEAMS, not individuals)
// =============================================================================

/**
 * Team leaderboard entry for persistent teams
 */
export interface PersistentTeamLeaderboardEntry {
    rank: number;
    odTeamId: string;
    odTeamName: string;
    odTeamTag: string | null;
    odElo: number;
    odWins: number;
    odLosses: number;
    odWinRate: number;
    odStreak: number;
    odBestStreak: number;
    odMemberCount: number;
    odCaptainName: string;
    odIsCurrentUserTeam: boolean;
}

export interface PersistentTeamLeaderboardResult {
    entries: PersistentTeamLeaderboardEntry[];
    currentUserTeamRank: number | null;
    currentUserTeamEntry: PersistentTeamLeaderboardEntry | null;
    totalTeams: number;
    sortBy: 'elo' | 'wins';
}

/**
 * Get persistent TEAM leaderboard (ranks teams by their team ELO, not individual players)
 * Distinct from getTeamLeaderboard which ranks individual player performance in team modes
 * Team mode uses overall ELO only (no operation-specific ELO)
 */
export async function getPersistentTeamLeaderboard(
    mode: '5v5' = '5v5',
    sortBy: 'elo' | 'wins' = 'elo',
    limit: number = 100
): Promise<PersistentTeamLeaderboardResult> {
    const session = await auth();
    const currentUserId = session?.user?.id || null;
    const db = getDatabase();

    // Team mode uses overall ELO only
    const eloColumn = 'e.elo_5v5';

    // Determine sort order
    const orderBy = sortBy === 'wins' 
        ? 't.team_wins DESC, ' + eloColumn + ' DESC'
        : eloColumn + ' DESC, t.team_wins DESC';

    // Get total teams count
    const countResult = db.prepare(`
        SELECT COUNT(*) as count FROM teams t
        JOIN team_elo e ON e.team_id = t.id
        WHERE t.team_wins > 0 OR t.team_losses > 0
    `).get() as { count: number };
    const totalTeams = countResult.count;

    // Get team leaderboard
    const teams = db.prepare(`
        SELECT 
            t.id,
            t.name,
            t.tag,
            t.created_by,
            t.team_wins,
            t.team_losses,
            t.team_win_streak,
            t.team_best_win_streak,
            ${eloColumn} as elo,
            u.name as captain_name,
            (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
        FROM teams t
        JOIN team_elo e ON e.team_id = t.id
        JOIN users u ON u.id = t.created_by
        WHERE t.team_wins > 0 OR t.team_losses > 0
        ORDER BY ${orderBy}
        LIMIT ?
    `).all(limit) as any[];

    // Get current user's team membership to determine if they're on any team
    let currentUserTeamIds: string[] = [];
    if (currentUserId) {
        const userTeams = db.prepare(`
            SELECT team_id FROM team_members WHERE user_id = ?
        `).all(currentUserId) as { team_id: string }[];
        currentUserTeamIds = userTeams.map(t => t.team_id);
    }

    const entries: PersistentTeamLeaderboardEntry[] = teams.map((team, index) => {
        const winRate = team.team_wins + team.team_losses > 0
            ? Math.round((team.team_wins / (team.team_wins + team.team_losses)) * 100)
            : 0;

        return {
            rank: index + 1,
            odTeamId: team.id,
            odTeamName: team.name,
            odTeamTag: team.tag,
            odElo: team.elo || 300,
            odWins: team.team_wins || 0,
            odLosses: team.team_losses || 0,
            odWinRate: winRate,
            odStreak: team.team_win_streak || 0,
            odBestStreak: team.team_best_win_streak || 0,
            odMemberCount: team.member_count || 0,
            odCaptainName: team.captain_name,
            odIsCurrentUserTeam: currentUserTeamIds.includes(team.id),
        };
    });

    // Find current user's team rank (use their primary/first team)
    let currentUserTeamRank: number | null = null;
    let currentUserTeamEntry: PersistentTeamLeaderboardEntry | null = null;

    const existingUserTeamEntry = entries.find(e => e.odIsCurrentUserTeam);
    if (existingUserTeamEntry) {
        currentUserTeamRank = existingUserTeamEntry.rank;
        currentUserTeamEntry = existingUserTeamEntry;
    } else if (currentUserTeamIds.length > 0) {
        // User's team is not in top results, find their rank
        const userTeam = db.prepare(`
            SELECT 
                t.id,
                t.name,
                t.tag,
                t.team_wins,
                t.team_losses,
                t.team_win_streak,
                t.team_best_win_streak,
                ${eloColumn} as elo,
                u.name as captain_name,
                (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
            FROM teams t
            JOIN team_elo e ON e.team_id = t.id
            JOIN users u ON u.id = t.created_by
            WHERE t.id = ?
        `).get(currentUserTeamIds[0]) as any;

        if (userTeam) {
            // Calculate rank
            const rankQuery = sortBy === 'wins'
                ? `SELECT COUNT(*) + 1 as rank FROM teams t2 
                   JOIN team_elo e2 ON e2.team_id = t2.id 
                   WHERE t2.team_wins > ? OR (t2.team_wins = ? AND ${eloColumn.replace('e.', 'e2.')} > ?)`
                : `SELECT COUNT(*) + 1 as rank FROM teams t2 
                   JOIN team_elo e2 ON e2.team_id = t2.id 
                   WHERE ${eloColumn.replace('e.', 'e2.')} > ?`;

            const rankResult = sortBy === 'wins'
                ? db.prepare(rankQuery).get(userTeam.team_wins, userTeam.team_wins, userTeam.elo) as { rank: number }
                : db.prepare(rankQuery).get(userTeam.elo) as { rank: number };

            currentUserTeamRank = rankResult?.rank || null;

            const winRate = userTeam.team_wins + userTeam.team_losses > 0
                ? Math.round((userTeam.team_wins / (userTeam.team_wins + userTeam.team_losses)) * 100)
                : 0;

            currentUserTeamEntry = {
                rank: currentUserTeamRank || 0,
                odTeamId: userTeam.id,
                odTeamName: userTeam.name,
                odTeamTag: userTeam.tag,
                odElo: userTeam.elo || 300,
                odWins: userTeam.team_wins || 0,
                odLosses: userTeam.team_losses || 0,
                odWinRate: winRate,
                odStreak: userTeam.team_win_streak || 0,
                odBestStreak: userTeam.team_best_win_streak || 0,
                odMemberCount: userTeam.member_count || 0,
                odCaptainName: userTeam.captain_name,
                odIsCurrentUserTeam: true,
            };
        }
    }

    return {
        entries,
        currentUserTeamRank,
        currentUserTeamEntry,
        totalTeams,
        sortBy,
    };
}

