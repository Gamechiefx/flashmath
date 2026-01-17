/**
 * Tier System Tests
 * Tests for the 100-tier progression system
 */

import { describe, it, expect } from 'vitest';
import {
    MIN_TIER,
    MAX_TIER,
    TIERS_PER_BAND,
    BANDS,
    getBandForTier,
    getTierWithinBand,
    getProgressWithinBand,
    isAtBandBoundary,
    crossesBandBoundary,
    getNextBandBoundary,
    tierToDifficulty,
    difficultyToTier,
    getTierOperandRange,
    generateOperands,
    formatTierDisplay,
    formatTierShort,
    getBandColorClass,
    getBandGradientClass,
    migrateTier,
    migrateMathTiers,
    getMilestones,
    checkMilestoneReward,
    getAllMilestonesCrossed,
    isMasteryTestAvailable,
    getMasteryTestRequirements,
    getNextMasteryTestTier,
    calculateTierAdvancement,
    canAttemptBandPromotion,
} from '@/lib/tier-system';

describe('Tier System Constants', () => {
    it('should have correct tier boundaries', () => {
        expect(MIN_TIER).toBe(1);
        expect(MAX_TIER).toBe(100);
        expect(TIERS_PER_BAND).toBe(20);
    });

    it('should have 5 bands defined', () => {
        expect(BANDS).toHaveLength(5);
    });

    it('should have bands with correct tier ranges', () => {
        expect(BANDS[0].tierRange).toEqual([1, 20]);
        expect(BANDS[1].tierRange).toEqual([21, 40]);
        expect(BANDS[2].tierRange).toEqual([41, 60]);
        expect(BANDS[3].tierRange).toEqual([61, 80]);
        expect(BANDS[4].tierRange).toEqual([81, 100]);
    });

    it('should have correct band names', () => {
        expect(BANDS[0].name).toBe('Foundation');
        expect(BANDS[1].name).toBe('Intermediate');
        expect(BANDS[2].name).toBe('Advanced');
        expect(BANDS[3].name).toBe('Expert');
        expect(BANDS[4].name).toBe('Master');
    });
});

describe('getBandForTier', () => {
    it('should return Foundation band for tiers 1-20', () => {
        expect(getBandForTier(1).name).toBe('Foundation');
        expect(getBandForTier(10).name).toBe('Foundation');
        expect(getBandForTier(20).name).toBe('Foundation');
    });

    it('should return Intermediate band for tiers 21-40', () => {
        expect(getBandForTier(21).name).toBe('Intermediate');
        expect(getBandForTier(30).name).toBe('Intermediate');
        expect(getBandForTier(40).name).toBe('Intermediate');
    });

    it('should return Master band for tiers 81-100', () => {
        expect(getBandForTier(81).name).toBe('Master');
        expect(getBandForTier(100).name).toBe('Master');
    });

    it('should clamp tier to valid range', () => {
        expect(getBandForTier(0).name).toBe('Foundation');
        expect(getBandForTier(-5).name).toBe('Foundation');
        expect(getBandForTier(150).name).toBe('Master');
    });
});

describe('getTierWithinBand', () => {
    it('should return correct position within Foundation band', () => {
        expect(getTierWithinBand(1)).toBe(1);
        expect(getTierWithinBand(10)).toBe(10);
        expect(getTierWithinBand(20)).toBe(20);
    });

    it('should return correct position within Intermediate band', () => {
        expect(getTierWithinBand(21)).toBe(1);
        expect(getTierWithinBand(30)).toBe(10);
        expect(getTierWithinBand(40)).toBe(20);
    });

    it('should return correct position within Master band', () => {
        expect(getTierWithinBand(81)).toBe(1);
        expect(getTierWithinBand(90)).toBe(10);
        expect(getTierWithinBand(100)).toBe(20);
    });
});

describe('getProgressWithinBand', () => {
    it('should return 0 at band start', () => {
        expect(getProgressWithinBand(1)).toBe(0);
        expect(getProgressWithinBand(21)).toBe(0);
        expect(getProgressWithinBand(81)).toBe(0);
    });

    it('should return 1 at band end', () => {
        expect(getProgressWithinBand(20)).toBe(1);
        expect(getProgressWithinBand(40)).toBe(1);
        expect(getProgressWithinBand(100)).toBe(1);
    });

    it('should return approximately 0.5 at band midpoint', () => {
        // Tier 10 is position 10, progress = (10-1)/19 ≈ 0.47
        const progress = getProgressWithinBand(10);
        expect(progress).toBeGreaterThan(0.4);
        expect(progress).toBeLessThan(0.6);
    });
});

describe('Band Boundary Functions', () => {
    describe('isAtBandBoundary', () => {
        it('should return true for band boundaries', () => {
            expect(isAtBandBoundary(20)).toBe(true);
            expect(isAtBandBoundary(40)).toBe(true);
            expect(isAtBandBoundary(60)).toBe(true);
            expect(isAtBandBoundary(80)).toBe(true);
            expect(isAtBandBoundary(100)).toBe(true);
        });

        it('should return false for non-boundaries', () => {
            expect(isAtBandBoundary(1)).toBe(false);
            expect(isAtBandBoundary(19)).toBe(false);
            expect(isAtBandBoundary(21)).toBe(false);
            expect(isAtBandBoundary(50)).toBe(false);
        });

        it('should return false for tier 0', () => {
            expect(isAtBandBoundary(0)).toBe(false);
        });
    });

    describe('crossesBandBoundary', () => {
        it('should detect crossing from Foundation to Intermediate', () => {
            expect(crossesBandBoundary(20, 21)).toBe(true);
        });

        it('should not detect crossing within same band', () => {
            expect(crossesBandBoundary(15, 20)).toBe(false);
            expect(crossesBandBoundary(1, 19)).toBe(false);
        });

        it('should detect multiple band crossing', () => {
            expect(crossesBandBoundary(20, 50)).toBe(true);
        });
    });

    describe('getNextBandBoundary', () => {
        it('should return 20 for tiers in Foundation', () => {
            expect(getNextBandBoundary(1)).toBe(20);
            expect(getNextBandBoundary(15)).toBe(20);
        });

        it('should return 100 for tiers in Master', () => {
            expect(getNextBandBoundary(81)).toBe(100);
            expect(getNextBandBoundary(99)).toBe(100);
        });
    });
});

describe('Difficulty Mapping', () => {
    describe('tierToDifficulty', () => {
        it('should return 0.05 for tier 1', () => {
            expect(tierToDifficulty(1)).toBe(0.05);
        });

        it('should return 0.95 for tier 100', () => {
            expect(tierToDifficulty(100)).toBeCloseTo(0.95);
        });

        it('should return approximately 0.5 for tier 50', () => {
            const diff = tierToDifficulty(50);
            expect(diff).toBeGreaterThan(0.4);
            expect(diff).toBeLessThan(0.6);
        });

        it('should clamp out-of-range tiers', () => {
            expect(tierToDifficulty(0)).toBe(0.05);
            expect(tierToDifficulty(150)).toBeCloseTo(0.95);
        });
    });

    describe('difficultyToTier', () => {
        it('should return tier 1 for difficulty 0.05', () => {
            expect(difficultyToTier(0.05)).toBe(1);
        });

        it('should return tier 100 for difficulty 0.95', () => {
            expect(difficultyToTier(0.95)).toBe(100);
        });

        it('should round to nearest tier', () => {
            // Middle difficulty should give middle tier
            const tier = difficultyToTier(0.5);
            expect(tier).toBeGreaterThan(45);
            expect(tier).toBeLessThan(55);
        });

        it('should clamp out-of-range difficulties', () => {
            expect(difficultyToTier(0)).toBe(1);
            expect(difficultyToTier(1.5)).toBe(100);
        });
    });
});

describe('Operand Range Functions', () => {
    describe('getTierOperandRange', () => {
        it('should return small range for tier 1', () => {
            const [min, max] = getTierOperandRange(1);
            expect(min).toBe(2);
            expect(max).toBe(5);
        });

        it('should return larger range for higher tiers', () => {
            const [min1, max1] = getTierOperandRange(1);
            const [min50, max50] = getTierOperandRange(50);
            expect(min50).toBeGreaterThan(min1);
            expect(max50).toBeGreaterThan(max1);
        });

        it('should reduce range for division', () => {
            const [min, max] = getTierOperandRange(50, 'division');
            const [minAdd, maxAdd] = getTierOperandRange(50, 'addition');
            expect(min).toBeLessThan(minAdd);
            expect(max).toBeLessThan(maxAdd);
        });
    });

    describe('generateOperands', () => {
        it('should generate valid addition operands', () => {
            const { op1, op2, answer } = generateOperands(10, 'addition');
            expect(op1 + op2).toBe(answer);
            expect(op1).toBeGreaterThan(0);
            expect(op2).toBeGreaterThan(0);
        });

        it('should generate valid subtraction with positive result', () => {
            for (let i = 0; i < 10; i++) {
                const { op1, op2, answer } = generateOperands(10, 'subtraction');
                expect(op1 - op2).toBe(answer);
                expect(answer).toBeGreaterThanOrEqual(0);
            }
        });

        it('should generate valid multiplication operands', () => {
            const { op1, op2, answer } = generateOperands(10, 'multiplication');
            expect(op1 * op2).toBe(answer);
        });

        it('should generate clean division operands', () => {
            for (let i = 0; i < 10; i++) {
                const { op1, op2, answer } = generateOperands(10, 'division');
                expect(op1 / op2).toBe(answer);
                expect(Number.isInteger(answer)).toBe(true);
            }
        });
    });
});

describe('Display Formatting', () => {
    describe('formatTierDisplay', () => {
        it('should format tier 1 correctly', () => {
            expect(formatTierDisplay(1)).toBe('Foundation 1');
        });

        it('should format tier 25 correctly', () => {
            expect(formatTierDisplay(25)).toBe('Intermediate 5');
        });

        it('should format tier 100 correctly', () => {
            expect(formatTierDisplay(100)).toBe('Master 20');
        });
    });

    describe('formatTierShort', () => {
        it('should format tier 1 as F1', () => {
            expect(formatTierShort(1)).toBe('F1');
        });

        it('should format tier 25 as I5', () => {
            expect(formatTierShort(25)).toBe('I5');
        });

        it('should format tier 100 as M20', () => {
            expect(formatTierShort(100)).toBe('M20');
        });
    });

    describe('getBandColorClass', () => {
        it('should return amber color for Foundation', () => {
            expect(getBandColorClass(5)).toContain('amber');
        });

        it('should return purple color for Master', () => {
            expect(getBandColorClass(90)).toContain('purple');
        });
    });

    describe('getBandGradientClass', () => {
        it('should return gradient class', () => {
            const gradient = getBandGradientClass(50);
            expect(gradient).toContain('bg-gradient-to-r');
        });
    });
});

describe('Migration Functions', () => {
    describe('migrateTier', () => {
        it('should migrate old tier 0 to new tier 1', () => {
            expect(migrateTier(0)).toBe(1);
        });

        it('should migrate old tier 1 to new tier 5', () => {
            expect(migrateTier(1)).toBe(5);
        });

        it('should migrate old tier 4 to new tier 61', () => {
            expect(migrateTier(4)).toBe(61);
        });

        it('should default to tier 1 for unknown values', () => {
            expect(migrateTier(99)).toBe(1);
        });
    });

    describe('migrateMathTiers', () => {
        it('should migrate all operations', () => {
            const old = {
                addition: 2,
                subtraction: 1,
                multiplication: 3,
                division: 0,
            };
            const result = migrateMathTiers(old);
            expect(result.addition).toBe(21);
            expect(result.subtraction).toBe(5);
            expect(result.multiplication).toBe(41);
            expect(result.division).toBe(1);
        });
    });
});

describe('Milestone System', () => {
    describe('getMilestones', () => {
        it('should return sorted milestones', () => {
            const milestones = getMilestones();
            for (let i = 1; i < milestones.length; i++) {
                expect(milestones[i].tier).toBeGreaterThanOrEqual(milestones[i - 1].tier);
            }
        });

        it('should include band completion milestones', () => {
            const milestones = getMilestones();
            const bandComplete = milestones.filter(m => m.type === 'band_complete');
            expect(bandComplete).toHaveLength(5);
            expect(bandComplete.map(m => m.tier)).toEqual([20, 40, 60, 80, 100]);
        });

        it('should have correct rewards for minor milestones', () => {
            const milestones = getMilestones();
            const minor = milestones.find(m => m.type === 'minor');
            expect(minor?.reward.coins).toBe(50);
        });
    });

    describe('checkMilestoneReward', () => {
        it('should return null when no milestone crossed', () => {
            expect(checkMilestoneReward(3, 4)).toBeNull();
        });

        it('should return milestone when crossed', () => {
            const result = checkMilestoneReward(4, 5);
            expect(result).not.toBeNull();
            expect(result?.tier).toBe(5);
        });

        it('should return highest milestone crossed', () => {
            const result = checkMilestoneReward(1, 20);
            expect(result?.tier).toBe(20);
            expect(result?.type).toBe('band_complete');
        });

        it('should return null for same tier', () => {
            expect(checkMilestoneReward(10, 10)).toBeNull();
        });

        it('should return null for tier decrease', () => {
            expect(checkMilestoneReward(20, 10)).toBeNull();
        });
    });

    describe('getAllMilestonesCrossed', () => {
        it('should return empty array for no advancement', () => {
            expect(getAllMilestonesCrossed(5, 5)).toEqual([]);
        });

        it('should return all milestones crossed', () => {
            const result = getAllMilestonesCrossed(1, 20);
            expect(result.length).toBeGreaterThan(1);
            expect(result.some(m => m.tier === 5)).toBe(true);
            expect(result.some(m => m.tier === 10)).toBe(true);
            expect(result.some(m => m.tier === 20)).toBe(true);
        });
    });
});

describe('Mastery Test Functions', () => {
    describe('isMasteryTestAvailable', () => {
        it('should return true at tier 10 boundaries', () => {
            expect(isMasteryTestAvailable(10)).toBe(true);
            expect(isMasteryTestAvailable(20)).toBe(true);
            expect(isMasteryTestAvailable(100)).toBe(true);
        });

        it('should return false for non-test tiers', () => {
            expect(isMasteryTestAvailable(5)).toBe(false);
            expect(isMasteryTestAvailable(15)).toBe(false);
            expect(isMasteryTestAvailable(99)).toBe(false);
        });
    });

    describe('getMasteryTestRequirements', () => {
        it('should require more for band crossing', () => {
            const bandCrossing = getMasteryTestRequirements(20);
            const regular = getMasteryTestRequirements(10);
            expect(bandCrossing.questions).toBeGreaterThan(regular.questions);
            expect(bandCrossing.requiredAccuracy).toBeGreaterThan(regular.requiredAccuracy);
        });

        it('should mark band crossing correctly', () => {
            expect(getMasteryTestRequirements(20).isBandCrossing).toBe(true);
            expect(getMasteryTestRequirements(10).isBandCrossing).toBe(false);
        });
    });

    describe('getNextMasteryTestTier', () => {
        it('should return 10 for tier 1', () => {
            expect(getNextMasteryTestTier(1)).toBe(10);
        });

        it('should return 20 for tier 15', () => {
            expect(getNextMasteryTestTier(15)).toBe(20);
        });

        it('should not exceed 100', () => {
            expect(getNextMasteryTestTier(95)).toBe(100);
            expect(getNextMasteryTestTier(100)).toBe(100);
        });
    });
});

describe('Progression Functions', () => {
    describe('calculateTierAdvancement', () => {
        it('should return 0 for poor performance', () => {
            expect(calculateTierAdvancement(0.5, 0.5, 10, 2, 0.3, 10)).toBe(0);
        });

        it('should return 1 for good performance', () => {
            expect(calculateTierAdvancement(0.85, 0.80, 15, 5, 0.2, 10)).toBe(1);
        });

        it('should return 2 for great performance', () => {
            expect(calculateTierAdvancement(0.90, 0.85, 20, 8, 0.2, 10)).toBe(2);
        });

        it('should return 3 for excellent performance', () => {
            expect(calculateTierAdvancement(0.95, 0.90, 25, 10, 0.2, 10)).toBe(3);
        });

        it('should reduce advancement when tilted', () => {
            const normal = calculateTierAdvancement(0.90, 0.85, 20, 8, 0.2, 10);
            const tilted = calculateTierAdvancement(0.90, 0.85, 20, 8, 0.7, 10);
            expect(tilted).toBeLessThan(normal);
        });

        it('should not cross band boundary', () => {
            const advancement = calculateTierAdvancement(0.95, 0.90, 25, 10, 0.2, 19);
            expect(advancement).toBe(1); // Can only advance to 20, not beyond
        });

        it('should not exceed max tier', () => {
            const advancement = calculateTierAdvancement(0.95, 0.90, 25, 10, 0.2, 99);
            expect(advancement).toBeLessThanOrEqual(1);
        });
    });

    describe('canAttemptBandPromotion', () => {
        it('should return true at band boundaries', () => {
            expect(canAttemptBandPromotion(20)).toBe(true);
            expect(canAttemptBandPromotion(40)).toBe(true);
            expect(canAttemptBandPromotion(80)).toBe(true);
        });

        it('should return false at tier 100', () => {
            expect(canAttemptBandPromotion(100)).toBe(false);
        });

        it('should return false for non-boundaries', () => {
            expect(canAttemptBandPromotion(15)).toBe(false);
            expect(canAttemptBandPromotion(50)).toBe(false);
        });
    });
});
