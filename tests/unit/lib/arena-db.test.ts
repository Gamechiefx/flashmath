/**
 * Arena Database Tests
 * Tests for arena database operations and rank calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getRankFromElo,
    type ArenaPlayer,
    type ArenaTeam,
    type ArenaDisplayStats,
    type FullArenaStats,
} from '@/lib/arena/arena-db';

// Mock the postgres module
vi.mock('@/lib/arena/postgres.js', () => ({
    initSchema: vi.fn(),
    testConnection: vi.fn().mockResolvedValue(true),
    closePool: vi.fn(),
    getOrCreatePlayer: vi.fn(),
    getPlayer: vi.fn(),
    getPlayerElo: vi.fn(),
    updatePlayerElo: vi.fn(),
    updatePlayer5v5Elo: vi.fn(),
    updatePlayerTier: vi.fn(),
    getLeaderboard: vi.fn(),
    getOrCreateTeam: vi.fn(),
    getTeam: vi.fn(),
    getTeamElo: vi.fn(),
    updateTeamElo: vi.fn(),
    updateTeamAvgTier: vi.fn(),
    getTeamLeaderboard: vi.fn(),
    recordMatch: vi.fn(),
    recordTeamMatch: vi.fn(),
    getPlayerMatchHistory: vi.fn(),
    getPlayerTeamMatchHistory: vi.fn(),
    getTeamMatchHistory: vi.fn(),
    getGlobalStats: vi.fn(),
    getPlayerFullStats: vi.fn(),
    updatePlayerOperationElo: vi.fn(),
    updatePlayerTeamOperationElo: vi.fn(),
    getPlayersBatch: vi.fn(),
}));

// Mock Redis caching (optional)
vi.mock('../../../server-redis.js', () => null);

describe('getRankFromElo', () => {
    describe('Rank Assignment', () => {
        it('should assign BRONZE for ELO below 1100', () => {
            expect(getRankFromElo(0).rank).toBe('BRONZE');
            expect(getRankFromElo(300).rank).toBe('BRONZE');
            expect(getRankFromElo(500).rank).toBe('BRONZE');
            expect(getRankFromElo(1099).rank).toBe('BRONZE');
        });

        it('should assign SILVER for ELO 1100-1399', () => {
            expect(getRankFromElo(1100).rank).toBe('SILVER');
            expect(getRankFromElo(1250).rank).toBe('SILVER');
            expect(getRankFromElo(1399).rank).toBe('SILVER');
        });

        it('should assign GOLD for ELO 1400-1699', () => {
            expect(getRankFromElo(1400).rank).toBe('GOLD');
            expect(getRankFromElo(1550).rank).toBe('GOLD');
            expect(getRankFromElo(1699).rank).toBe('GOLD');
        });

        it('should assign PLATINUM for ELO 1700-1999', () => {
            expect(getRankFromElo(1700).rank).toBe('PLATINUM');
            expect(getRankFromElo(1850).rank).toBe('PLATINUM');
            expect(getRankFromElo(1999).rank).toBe('PLATINUM');
        });

        it('should assign DIAMOND for ELO 2000+', () => {
            expect(getRankFromElo(2000).rank).toBe('DIAMOND');
            expect(getRankFromElo(2500).rank).toBe('DIAMOND');
            expect(getRankFromElo(3000).rank).toBe('DIAMOND');
        });
    });

    describe('Division Assignment', () => {
        it('should assign Division III for lowest third of rank', () => {
            // Bronze: 0-1100, Division III = 0-366
            expect(getRankFromElo(100).division).toBe('III');
            expect(getRankFromElo(300).division).toBe('III');
        });

        it('should assign Division II for middle third of rank', () => {
            // Bronze: 0-1100, Division II = 367-733
            expect(getRankFromElo(500).division).toBe('II');
            expect(getRankFromElo(700).division).toBe('II');
        });

        it('should assign Division I for highest third of rank', () => {
            // Bronze: 0-1100, Division I = 734-1099
            expect(getRankFromElo(800).division).toBe('I');
            expect(getRankFromElo(1000).division).toBe('I');
        });

        it('should correctly assign divisions at rank boundaries', () => {
            // Just entered Silver (1100) = Division III
            expect(getRankFromElo(1100).division).toBe('III');
            
            // Just about to promote from Silver (1399) = Division I
            expect(getRankFromElo(1399).division).toBe('I');
        });
    });

    describe('Edge Cases', () => {
        it('should handle negative ELO', () => {
            const result = getRankFromElo(-100);
            expect(result.rank).toBe('BRONZE');
            expect(result.division).toBeDefined();
        });

        it('should handle very high ELO', () => {
            const result = getRankFromElo(5000);
            expect(result.rank).toBe('DIAMOND');
            expect(result.division).toBe('I');
        });

        it('should return consistent results for same ELO', () => {
            const elo = 1500;
            const result1 = getRankFromElo(elo);
            const result2 = getRankFromElo(elo);
            expect(result1.rank).toBe(result2.rank);
            expect(result1.division).toBe(result2.division);
        });
    });

    describe('Rank Progression', () => {
        it('should show logical rank progression', () => {
            const ranks = [
                getRankFromElo(500),    // BRONZE
                getRankFromElo(1200),   // SILVER
                getRankFromElo(1500),   // GOLD
                getRankFromElo(1800),   // PLATINUM
                getRankFromElo(2200),   // DIAMOND
            ];

            expect(ranks[0].rank).toBe('BRONZE');
            expect(ranks[1].rank).toBe('SILVER');
            expect(ranks[2].rank).toBe('GOLD');
            expect(ranks[3].rank).toBe('PLATINUM');
            expect(ranks[4].rank).toBe('DIAMOND');
        });

        it('should show division progression within rank', () => {
            // Silver divisions: 1100-1399
            const div3 = getRankFromElo(1100); // Bottom of Silver
            const div2 = getRankFromElo(1200); // Middle of Silver
            const div1 = getRankFromElo(1350); // Top of Silver

            expect(div3.division).toBe('III');
            expect(div2.division).toBe('II');
            expect(div1.division).toBe('I');
        });
    });
});

describe('ArenaPlayer Interface', () => {
    it('should define correct player properties', () => {
        const player: Partial<ArenaPlayer> = {
            user_id: 'test-user-1',
            username: 'TestPlayer',
            elo: 1500,
            peak_elo: 1600,
            matches_played: 50,
            matches_won: 30,
            matches_lost: 20,
            current_streak: 3,
            best_streak: 10,
            total_score: 15000,
            elo_5v5: 1400,
            peak_elo_5v5: 1450,
            matches_played_5v5: 20,
            matches_won_5v5: 12,
            matches_lost_5v5: 8,
            practice_tier: 50,
            confidence_score: 0.85,
        };

        expect(player.user_id).toBe('test-user-1');
        expect(player.elo).toBe(1500);
        expect(player.practice_tier).toBe(50);
    });
});

describe('ArenaTeam Interface', () => {
    it('should define correct team properties', () => {
        const team: Partial<ArenaTeam> = {
            team_id: 'team-1',
            team_name: 'Test Team',
            team_tag: 'TST',
            elo: 1600,
            peak_elo: 1700,
            matches_played: 30,
            matches_won: 20,
            matches_lost: 10,
            current_streak: 5,
            best_streak: 8,
            total_score: 25000,
            avg_member_tier: 55,
        };

        expect(team.team_id).toBe('team-1');
        expect(team.team_name).toBe('Test Team');
        expect(team.elo).toBe(1600);
    });
});

describe('ArenaDisplayStats Interface', () => {
    it('should have correct display properties', () => {
        const stats: ArenaDisplayStats = {
            odDuelElo: 1500,
            odDuelRank: 'GOLD',
            odDuelDivision: 'II',
            odElo5v5: 1400,
            odElo5v5Rank: 'GOLD',
            odElo5v5Division: 'III',
            odPracticeTier: 50,
            odMatchesPlayed: 70,
            odMatchesWon: 42,
        };

        expect(stats.odDuelRank).toBe('GOLD');
        expect(stats.odDuelDivision).toBe('II');
        expect(stats.odMatchesPlayed).toBe(70);
    });
});

describe('FullArenaStats Interface', () => {
    it('should have correct nested structure', () => {
        const stats: Partial<FullArenaStats> = {
            duel: {
                elo: 1500,
                addition: 1550,
                subtraction: 1480,
                multiplication: 1520,
                divisionOp: 1450,
                wins: 30,
                losses: 20,
                winStreak: 3,
                bestWinStreak: 10,
                rank: 'GOLD',
                rankDivision: 'II',
                winsToNextDivision: 5,
            },
            team: {
                elo: 1400,
                wins: 12,
                losses: 8,
                winStreak: 2,
                bestWinStreak: 5,
                rank: 'GOLD',
                rankDivision: 'III',
                winsToNextDivision: 8,
                modes: {
                    '2v2': { elo: 1350, addition: 1350, subtraction: 1350, multiplication: 1350, divisionOp: 1350 },
                    '3v3': { elo: 1400, addition: 1400, subtraction: 1400, multiplication: 1400, divisionOp: 1400 },
                    '4v4': { elo: 1380, addition: 1380, subtraction: 1380, multiplication: 1380, divisionOp: 1380 },
                    '5v5': { elo: 1450, addition: 1450, subtraction: 1450, multiplication: 1450, divisionOp: 1450 },
                },
            },
        };

        expect(stats.duel?.elo).toBe(1500);
        expect(stats.team?.modes['5v5'].elo).toBe(1450);
    });
});

describe('Rank Thresholds', () => {
    const RANK_THRESHOLDS = {
        DIAMOND: 2000,
        PLATINUM: 1700,
        GOLD: 1400,
        SILVER: 1100,
        BRONZE: 0,
    };

    it('should have correct threshold values', () => {
        expect(RANK_THRESHOLDS.BRONZE).toBe(0);
        expect(RANK_THRESHOLDS.SILVER).toBe(1100);
        expect(RANK_THRESHOLDS.GOLD).toBe(1400);
        expect(RANK_THRESHOLDS.PLATINUM).toBe(1700);
        expect(RANK_THRESHOLDS.DIAMOND).toBe(2000);
    });

    it('should have ascending order', () => {
        expect(RANK_THRESHOLDS.BRONZE).toBeLessThan(RANK_THRESHOLDS.SILVER);
        expect(RANK_THRESHOLDS.SILVER).toBeLessThan(RANK_THRESHOLDS.GOLD);
        expect(RANK_THRESHOLDS.GOLD).toBeLessThan(RANK_THRESHOLDS.PLATINUM);
        expect(RANK_THRESHOLDS.PLATINUM).toBeLessThan(RANK_THRESHOLDS.DIAMOND);
    });

    it('should have reasonable gaps between ranks', () => {
        const silverGap = RANK_THRESHOLDS.SILVER - RANK_THRESHOLDS.BRONZE;
        const goldGap = RANK_THRESHOLDS.GOLD - RANK_THRESHOLDS.SILVER;
        const platGap = RANK_THRESHOLDS.PLATINUM - RANK_THRESHOLDS.GOLD;
        const diamondGap = RANK_THRESHOLDS.DIAMOND - RANK_THRESHOLDS.PLATINUM;

        // All gaps should be reasonable (200-400 ELO range)
        expect(goldGap).toBe(300);
        expect(platGap).toBe(300);
        expect(diamondGap).toBe(300);
    });
});

describe('Division Ranges', () => {
    const DIVISION_RANGES = {
        I: 0.667,
        II: 0.333,
        III: 0,
    };

    it('should have correct division thresholds', () => {
        expect(DIVISION_RANGES.III).toBe(0);
        expect(DIVISION_RANGES.II).toBeCloseTo(0.333, 2);
        expect(DIVISION_RANGES.I).toBeCloseTo(0.667, 2);
    });

    it('should have ascending order', () => {
        expect(DIVISION_RANGES.III).toBeLessThan(DIVISION_RANGES.II);
        expect(DIVISION_RANGES.II).toBeLessThan(DIVISION_RANGES.I);
    });

    it('should divide rank into three equal parts', () => {
        const divisionWidth = 1 / 3;
        expect(DIVISION_RANGES.II - DIVISION_RANGES.III).toBeCloseTo(divisionWidth, 2);
        expect(DIVISION_RANGES.I - DIVISION_RANGES.II).toBeCloseTo(divisionWidth, 2);
    });
});

describe('Module Exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should export all required functions', async () => {
        const arenaDb = await import('@/lib/arena/arena-db');

        // Initialization
        expect(arenaDb.initArenaDatabase).toBeDefined();
        expect(arenaDb.testArenaConnection).toBeDefined();
        expect(arenaDb.closeArenaDatabase).toBeDefined();

        // Player operations
        expect(arenaDb.getOrCreateArenaPlayer).toBeDefined();
        expect(arenaDb.getArenaPlayer).toBeDefined();
        expect(arenaDb.getPlayerElo).toBeDefined();
        expect(arenaDb.updatePlayerDuelElo).toBeDefined();
        expect(arenaDb.updatePlayer5v5Elo).toBeDefined();
        expect(arenaDb.updatePlayerTier).toBeDefined();

        // Leaderboard
        expect(arenaDb.getDuelLeaderboard).toBeDefined();
        expect(arenaDb.invalidateLeaderboardCache).toBeDefined();

        // Display stats
        expect(arenaDb.getArenaDisplayStats).toBeDefined();
        expect(arenaDb.getArenaDisplayStatsBatch).toBeDefined();

        // Team operations
        expect(arenaDb.getOrCreateArenaTeam).toBeDefined();
        expect(arenaDb.getArenaTeam).toBeDefined();
        expect(arenaDb.getTeamElo).toBeDefined();
        expect(arenaDb.updateTeamElo).toBeDefined();
        expect(arenaDb.updateTeamAvgTier).toBeDefined();
        expect(arenaDb.getTeamLeaderboard).toBeDefined();

        // Match operations
        expect(arenaDb.recordDuelMatch).toBeDefined();
        expect(arenaDb.recordTeamMatch).toBeDefined();
        expect(arenaDb.getPlayerDuelHistory).toBeDefined();
        expect(arenaDb.getPlayerTeamHistory).toBeDefined();
        expect(arenaDb.getTeamMatchHistory).toBeDefined();

        // Stats
        expect(arenaDb.getGlobalArenaStats).toBeDefined();
        expect(arenaDb.getFullArenaStats).toBeDefined();
    });
});
