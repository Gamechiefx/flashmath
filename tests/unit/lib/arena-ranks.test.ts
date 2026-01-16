/**
 * Tests for Arena Rank System
 * 
 * Tests the rank calculation, display, and ELO change functions
 */

import { describe, it, expect } from 'vitest';
import { 
    calculateArenaRank, 
    getRankDisplay, 
    getRankColors, 
    calculateEloChange,
    getHighestTier,
    MODE_BASE_ELO 
} from '@/lib/arena/ranks';

describe('Arena Ranks', () => {
    describe('calculateArenaRank', () => {
        describe('Foundation tier (1-20)', () => {
            it('should return Bronze I for 0 wins at tier 1', () => {
                const result = calculateArenaRank(0, 1);
                expect(result.rank).toBe('Bronze');
                expect(result.division).toBe('I');
                expect(result.winsInRank).toBe(0);
            });

            it('should progress to Bronze II after 10 wins', () => {
                const result = calculateArenaRank(10, 5);
                expect(result.rank).toBe('Bronze');
                expect(result.division).toBe('II');
            });

            it('should progress to Bronze III after 20 wins', () => {
                const result = calculateArenaRank(20, 10);
                expect(result.rank).toBe('Bronze');
                expect(result.division).toBe('III');
            });

            it('should promote to Silver I after 30 wins', () => {
                const result = calculateArenaRank(30, 15);
                expect(result.rank).toBe('Silver');
                expect(result.division).toBe('I');
            });

            it('should stay at Silver max after 60+ wins at low tier', () => {
                const result = calculateArenaRank(100, 10);
                expect(result.rank).toBe('Silver');
                // Should be at max division
            });
        });

        describe('Intermediate tier (21-40)', () => {
            it('should start at Silver for tier 25', () => {
                const result = calculateArenaRank(0, 25);
                expect(result.rank).toBe('Silver');
                expect(result.division).toBe('I');
            });

            it('should be able to reach Gold at tier 30', () => {
                const result = calculateArenaRank(30, 30);
                expect(result.rank).toBe('Gold');
            });
        });

        describe('Advanced tier (41-60)', () => {
            it('should start at Gold for tier 45', () => {
                const result = calculateArenaRank(0, 45);
                expect(result.rank).toBe('Gold');
            });

            it('should be able to reach Platinum', () => {
                const result = calculateArenaRank(30, 50);
                expect(result.rank).toBe('Platinum');
            });
        });

        describe('Expert tier (61-80)', () => {
            it('should start at Platinum for tier 65', () => {
                const result = calculateArenaRank(0, 65);
                expect(result.rank).toBe('Platinum');
            });

            it('should be able to reach Diamond', () => {
                const result = calculateArenaRank(35, 75);
                expect(result.rank).toBe('Diamond');
            });
        });

        describe('Master tier (81-100)', () => {
            it('should start at Diamond for tier 85', () => {
                const result = calculateArenaRank(0, 85);
                expect(result.rank).toBe('Diamond');
            });

            it('should reach Master with wins at high tier', () => {
                const result = calculateArenaRank(50, 95);
                expect(result.rank).toBe('Master');
            });

            it('should handle tier 100', () => {
                const result = calculateArenaRank(60, 100);
                expect(result.rank).toBe('Master');
            });
        });

        describe('winsToNextDivision and winsToNextRank', () => {
            it('should calculate wins to next division correctly', () => {
                const result = calculateArenaRank(5, 1);
                expect(result.winsToNextDivision).toBe(5);
            });

            it('should return 0 winsToNextDivision at max division', () => {
                const result = calculateArenaRank(25, 1);
                expect(result.winsToNextDivision).toBe(0);
            });

            it('should calculate winsToNextRank correctly', () => {
                const result = calculateArenaRank(15, 1);
                expect(result.winsToNextRank).toBe(15);
            });
        });
    });

    describe('getRankDisplay', () => {
        it('should format rank and division correctly', () => {
            expect(getRankDisplay('Bronze', 'I')).toBe('Bronze I');
            expect(getRankDisplay('Silver', 'II')).toBe('Silver II');
            expect(getRankDisplay('Gold', 'III')).toBe('Gold III');
            expect(getRankDisplay('Diamond', 'I')).toBe('Diamond I');
            expect(getRankDisplay('Master', 'III')).toBe('Master III');
        });
    });

    describe('getRankColors', () => {
        it('should return correct colors for Bronze', () => {
            const colors = getRankColors('Bronze');
            expect(colors.text).toBe('text-amber-400');
            expect(colors.bg).toContain('amber');
        });

        it('should return correct colors for Silver', () => {
            const colors = getRankColors('Silver');
            expect(colors.text).toBe('text-slate-300');
        });

        it('should return correct colors for Gold', () => {
            const colors = getRankColors('Gold');
            expect(colors.text).toBe('text-yellow-400');
        });

        it('should return correct colors for Platinum', () => {
            const colors = getRankColors('Platinum');
            expect(colors.text).toBe('text-cyan-400');
        });

        it('should return correct colors for Diamond', () => {
            const colors = getRankColors('Diamond');
            expect(colors.text).toBe('text-blue-400');
        });

        it('should return correct colors for Master', () => {
            const colors = getRankColors('Master');
            expect(colors.text).toBe('text-purple-400');
        });

        it('should default to Bronze for unknown ranks', () => {
            const unknown = getRankColors('UnknownRank');
            const bronze = getRankColors('Bronze');
            expect(unknown).toEqual(bronze);
        });

        it('should include all required color properties', () => {
            const colors = getRankColors('Gold');
            expect(colors).toHaveProperty('bg');
            expect(colors).toHaveProperty('border');
            expect(colors).toHaveProperty('text');
            expect(colors).toHaveProperty('glow');
        });
    });

    describe('calculateEloChange', () => {
        describe('equal opponents', () => {
            it('should give +16 for win against equal opponent (default K=32)', () => {
                const change = calculateEloChange(1200, 1200, true);
                expect(change).toBe(16);
            });

            it('should give -16 for loss against equal opponent', () => {
                const change = calculateEloChange(1200, 1200, false);
                expect(change).toBe(-16);
            });
        });

        describe('upset matches', () => {
            it('should give more points for upset wins (underdog wins)', () => {
                const upsetWin = calculateEloChange(1000, 1400, true);
                const normalWin = calculateEloChange(1200, 1200, true);
                expect(upsetWin).toBeGreaterThan(normalWin);
            });

            it('should give fewer points for expected wins (favorite wins)', () => {
                const expectedWin = calculateEloChange(1400, 1000, true);
                const normalWin = calculateEloChange(1200, 1200, true);
                expect(expectedWin).toBeLessThan(normalWin);
            });
        });

        describe('loss scenarios', () => {
            it('should lose fewer points for expected losses', () => {
                const expectedLoss = Math.abs(calculateEloChange(1000, 1400, false));
                const normalLoss = Math.abs(calculateEloChange(1200, 1200, false));
                expect(expectedLoss).toBeLessThan(normalLoss);
            });

            it('should lose more points for upset losses (favorite loses)', () => {
                const upsetLoss = Math.abs(calculateEloChange(1400, 1000, false));
                const normalLoss = Math.abs(calculateEloChange(1200, 1200, false));
                expect(upsetLoss).toBeGreaterThan(normalLoss);
            });
        });

        describe('custom K factor', () => {
            it('should respect custom K factor', () => {
                const withK16 = calculateEloChange(1200, 1200, true, 16);
                const withK32 = calculateEloChange(1200, 1200, true, 32);
                expect(withK16).toBe(8);
                expect(withK32).toBe(16);
            });
        });

        describe('edge cases', () => {
            it('should handle very large ELO differences', () => {
                const bigUpset = calculateEloChange(500, 2500, true);
                expect(bigUpset).toBeGreaterThan(30);
            });

            it('should round to integers', () => {
                const change = calculateEloChange(1100, 1200, true);
                expect(Number.isInteger(change)).toBe(true);
            });
        });
    });

    describe('getHighestTier', () => {
        it('should return highest tier from math_tiers', () => {
            const tiers = { addition: 15, subtraction: 8, multiplication: 22, division: 5 };
            expect(getHighestTier(tiers)).toBe(22);
        });

        it('should return 0 for empty tiers', () => {
            expect(getHighestTier({})).toBe(0);
        });

        it('should handle single operation', () => {
            expect(getHighestTier({ addition: 50 })).toBe(50);
        });

        it('should handle all equal tiers', () => {
            const tiers = { addition: 30, subtraction: 30, multiplication: 30, division: 30 };
            expect(getHighestTier(tiers)).toBe(30);
        });

        it('should handle tier 100', () => {
            const tiers = { addition: 100, subtraction: 50 };
            expect(getHighestTier(tiers)).toBe(100);
        });
    });

    describe('MODE_BASE_ELO', () => {
        it('should have correct base ELO for 1v1', () => {
            expect(MODE_BASE_ELO['1v1']).toBe(500);
        });

        it('should have correct base ELO for 2v2', () => {
            expect(MODE_BASE_ELO['2v2']).toBe(400);
        });

        it('should have correct base ELO for 3v3', () => {
            expect(MODE_BASE_ELO['3v3']).toBe(350);
        });

        it('should have correct base ELO for 4v4', () => {
            expect(MODE_BASE_ELO['4v4']).toBe(300);
        });

        it('should have correct base ELO for 5v5', () => {
            expect(MODE_BASE_ELO['5v5']).toBe(250);
        });

        it('should have decreasing ELO from 1v1 to 5v5', () => {
            expect(MODE_BASE_ELO['1v1']).toBeGreaterThan(MODE_BASE_ELO['2v2']);
            expect(MODE_BASE_ELO['2v2']).toBeGreaterThan(MODE_BASE_ELO['3v3']);
            expect(MODE_BASE_ELO['3v3']).toBeGreaterThan(MODE_BASE_ELO['4v4']);
            expect(MODE_BASE_ELO['4v4']).toBeGreaterThan(MODE_BASE_ELO['5v5']);
        });
    });
});
