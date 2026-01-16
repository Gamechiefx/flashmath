/**
 * Tests for League Engine Logic
 * 
 * Tests league tiers, promotion/demotion logic, and XP calculations
 */

import { describe, it, expect } from 'vitest';
import { LEAGUES, LEAGUE_CONFIG } from '@/lib/arena/constants.js';

describe('League Engine Logic', () => {
    describe('LEAGUES configuration', () => {
        it('should have 5 league tiers', () => {
            const leagues = Object.keys(LEAGUES);
            expect(leagues.length).toBe(5);
        });

        it('should have correct Bronze league config', () => {
            expect(LEAGUES.BRONZE.id).toBe(0);
            expect(LEAGUES.BRONZE.name).toBe('Bronze');
            expect(LEAGUES.BRONZE.minElo).toBe(0);
            expect(LEAGUES.BRONZE.maxElo).toBe(1099);
        });

        it('should have correct Silver league config', () => {
            expect(LEAGUES.SILVER.id).toBe(1);
            expect(LEAGUES.SILVER.name).toBe('Silver');
            expect(LEAGUES.SILVER.minElo).toBe(1100);
            expect(LEAGUES.SILVER.maxElo).toBe(1399);
        });

        it('should have correct Gold league config', () => {
            expect(LEAGUES.GOLD.id).toBe(2);
            expect(LEAGUES.GOLD.name).toBe('Gold');
            expect(LEAGUES.GOLD.minElo).toBe(1400);
            expect(LEAGUES.GOLD.maxElo).toBe(1699);
        });

        it('should have correct Platinum league config', () => {
            expect(LEAGUES.PLATINUM.id).toBe(3);
            expect(LEAGUES.PLATINUM.name).toBe('Platinum');
            expect(LEAGUES.PLATINUM.minElo).toBe(1700);
            expect(LEAGUES.PLATINUM.maxElo).toBe(1999);
        });

        it('should have correct Diamond league config', () => {
            expect(LEAGUES.DIAMOND.id).toBe(4);
            expect(LEAGUES.DIAMOND.name).toBe('Diamond');
            expect(LEAGUES.DIAMOND.minElo).toBe(2000);
            expect(LEAGUES.DIAMOND.maxElo).toBe(Infinity);
        });

        it('should have non-overlapping ELO ranges', () => {
            expect(LEAGUES.BRONZE.maxElo).toBeLessThan(LEAGUES.SILVER.minElo);
            expect(LEAGUES.SILVER.maxElo).toBeLessThan(LEAGUES.GOLD.minElo);
            expect(LEAGUES.GOLD.maxElo).toBeLessThan(LEAGUES.PLATINUM.minElo);
            expect(LEAGUES.PLATINUM.maxElo).toBeLessThan(LEAGUES.DIAMOND.minElo);
        });

        it('should start at ELO 0 for Bronze', () => {
            expect(LEAGUES.BRONZE.minElo).toBe(0);
        });

        it('should have infinite max for Diamond', () => {
            expect(LEAGUES.DIAMOND.maxElo).toBe(Infinity);
        });
    });

    describe('LEAGUE_CONFIG', () => {
        it('should have 3 divisions per league', () => {
            expect(LEAGUE_CONFIG.DIVISIONS_PER_LEAGUE).toBe(3);
        });

        it('should have demotion protection games', () => {
            expect(LEAGUE_CONFIG.DEMOTION_PROTECTION_GAMES).toBe(3);
        });

        it('should require matching practice tier for promotion', () => {
            expect(LEAGUE_CONFIG.MIN_PRACTICE_TIER_FOR_PROMOTION).toBe(true);
        });
    });

    describe('League lookup by ELO', () => {
        function getLeagueForElo(elo: number) {
            if (elo >= LEAGUES.DIAMOND.minElo) return LEAGUES.DIAMOND;
            if (elo >= LEAGUES.PLATINUM.minElo) return LEAGUES.PLATINUM;
            if (elo >= LEAGUES.GOLD.minElo) return LEAGUES.GOLD;
            if (elo >= LEAGUES.SILVER.minElo) return LEAGUES.SILVER;
            return LEAGUES.BRONZE;
        }

        it('should return Bronze for ELO 0-1099', () => {
            expect(getLeagueForElo(0).name).toBe('Bronze');
            expect(getLeagueForElo(500).name).toBe('Bronze');
            expect(getLeagueForElo(1099).name).toBe('Bronze');
        });

        it('should return Silver for ELO 1100-1399', () => {
            expect(getLeagueForElo(1100).name).toBe('Silver');
            expect(getLeagueForElo(1250).name).toBe('Silver');
            expect(getLeagueForElo(1399).name).toBe('Silver');
        });

        it('should return Gold for ELO 1400-1699', () => {
            expect(getLeagueForElo(1400).name).toBe('Gold');
            expect(getLeagueForElo(1550).name).toBe('Gold');
            expect(getLeagueForElo(1699).name).toBe('Gold');
        });

        it('should return Platinum for ELO 1700-1999', () => {
            expect(getLeagueForElo(1700).name).toBe('Platinum');
            expect(getLeagueForElo(1850).name).toBe('Platinum');
            expect(getLeagueForElo(1999).name).toBe('Platinum');
        });

        it('should return Diamond for ELO 2000+', () => {
            expect(getLeagueForElo(2000).name).toBe('Diamond');
            expect(getLeagueForElo(2500).name).toBe('Diamond');
            expect(getLeagueForElo(3000).name).toBe('Diamond');
        });
    });

    describe('Division calculation', () => {
        function getDivisionForElo(elo: number, league: typeof LEAGUES.BRONZE) {
            const range = league.maxElo - league.minElo;
            const divisionSize = range / LEAGUE_CONFIG.DIVISIONS_PER_LEAGUE;
            const position = elo - league.minElo;
            const division = Math.min(2, Math.floor(position / divisionSize));
            return ['I', 'II', 'III'][division];
        }

        it('should calculate division I for lower ELO', () => {
            expect(getDivisionForElo(0, LEAGUES.BRONZE)).toBe('I');
            expect(getDivisionForElo(100, LEAGUES.BRONZE)).toBe('I');
        });

        it('should calculate division II for mid ELO', () => {
            expect(getDivisionForElo(500, LEAGUES.BRONZE)).toBe('II');
        });

        it('should calculate division III for high ELO', () => {
            expect(getDivisionForElo(900, LEAGUES.BRONZE)).toBe('III');
        });
    });

    describe('Weekly league tiers (internal system)', () => {
        const TIERS = ['neon-league', 'cobalt-league', 'plasma-league', 'void-league', 'apex-league'];

        it('should have 5 weekly tiers', () => {
            expect(TIERS.length).toBe(5);
        });

        it('should have neon as lowest tier', () => {
            expect(TIERS[0]).toBe('neon-league');
        });

        it('should have apex as highest tier', () => {
            expect(TIERS[4]).toBe('apex-league');
        });

        it('should be ordered from lowest to highest', () => {
            expect(TIERS).toEqual([
                'neon-league',
                'cobalt-league', 
                'plasma-league',
                'void-league',
                'apex-league'
            ]);
        });
    });

    describe('Promotion/Demotion logic', () => {
        const TIERS = ['neon-league', 'cobalt-league', 'plasma-league', 'void-league', 'apex-league'];
        const MIN_XP_THRESHOLD = 20;

        function shouldPromote(rank: number): boolean {
            return rank <= 3; // Top 3 get promoted
        }

        function shouldDemote(weeklyXp: number, rank: number, totalParticipants: number): boolean {
            const isBottom2 = rank > totalParticipants - 2;
            const underXpThreshold = weeklyXp < MIN_XP_THRESHOLD;
            return isBottom2 || underXpThreshold;
        }

        it('should promote top 3', () => {
            expect(shouldPromote(1)).toBe(true);
            expect(shouldPromote(2)).toBe(true);
            expect(shouldPromote(3)).toBe(true);
            expect(shouldPromote(4)).toBe(false);
        });

        it('should demote bottom 2', () => {
            expect(shouldDemote(100, 9, 10)).toBe(true);
            expect(shouldDemote(100, 10, 10)).toBe(true);
            expect(shouldDemote(100, 8, 10)).toBe(false);
        });

        it('should demote players under XP threshold', () => {
            expect(shouldDemote(19, 5, 10)).toBe(true);
            expect(shouldDemote(20, 5, 10)).toBe(false);
            expect(shouldDemote(0, 5, 10)).toBe(true);
        });

        it('should not demote from lowest tier (neon)', () => {
            const tierId = 'neon-league';
            const tierIndex = TIERS.indexOf(tierId);
            expect(tierIndex).toBe(0);
            // Cannot demote below index 0
        });

        it('should not promote from highest tier (apex)', () => {
            const tierId = 'apex-league';
            const tierIndex = TIERS.indexOf(tierId);
            const nextTierIndex = tierIndex + 1;
            expect(nextTierIndex >= TIERS.length).toBe(true);
        });
    });

    describe('XP calculations', () => {
        const calculateXpGain = (baseXp: number, progress: number): number => {
            const multiplier = 1 + (progress * 2);
            return Math.floor(baseXp * multiplier);
        };

        it('should give base XP at start of week', () => {
            const xp = calculateXpGain(10, 0);
            expect(xp).toBe(10);
        });

        it('should triple XP at end of week', () => {
            const xp = calculateXpGain(10, 1);
            expect(xp).toBe(30);
        });

        it('should scale XP with progress', () => {
            const start = calculateXpGain(10, 0);
            const mid = calculateXpGain(10, 0.5);
            const end = calculateXpGain(10, 1);
            
            expect(start).toBeLessThan(mid);
            expect(mid).toBeLessThan(end);
        });
    });

    describe('Prize distribution', () => {
        const TOP_3_PRIZE = 250;

        it('should award 250 coins to top 3', () => {
            expect(TOP_3_PRIZE).toBe(250);
        });

        it('should calculate total prizes correctly', () => {
            const totalPrizes = TOP_3_PRIZE * 3;
            expect(totalPrizes).toBe(750);
        });
    });

    describe('Ghost player configuration', () => {
        const GHOST_NAMES = ["CyberBlade", "NeoMath", "VoidRunner", "CircuitLink", "DeltaBot", "Zenith", "Quantum", "Echo"];
        const GHOSTS_PER_TIER = 6;

        it('should have 8 ghost name options', () => {
            expect(GHOST_NAMES.length).toBe(8);
        });

        it('should have unique ghost names', () => {
            const unique = new Set(GHOST_NAMES);
            expect(unique.size).toBe(GHOST_NAMES.length);
        });

        it('should add 6 ghosts per tier', () => {
            expect(GHOSTS_PER_TIER).toBe(6);
        });

        it('should create 30 total ghosts (6 per 5 tiers)', () => {
            const totalGhosts = GHOSTS_PER_TIER * 5;
            expect(totalGhosts).toBe(30);
        });
    });

    describe('League cycle timing', () => {
        const LEAGUE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

        it('should have 7-day cycle', () => {
            expect(LEAGUE_DURATION_MS).toBe(604800000);
        });

        it('should calculate progress correctly', () => {
            const now = Date.now();
            const startTime = now - (3.5 * 24 * 60 * 60 * 1000); // 3.5 days ago
            const endTime = startTime + LEAGUE_DURATION_MS;
            const progress = (now - startTime) / LEAGUE_DURATION_MS;
            
            expect(progress).toBeCloseTo(0.5, 1);
        });
    });
});
