/**
 * Tests for Arena Decay System
 * 
 * Tests decay phases, ELO decay calculation, and returning player logic
 * Note: These tests focus on pure logic functions that don't require database access
 */

import { describe, it, expect } from 'vitest';
import { DECAY, PLACEMENT } from '@/lib/arena/constants.js';

// Pure logic functions extracted for testing without DB dependency
function getDecayPhaseSync(daysSinceActivity: number): 'active' | 'warning' | 'decaying' | 'severe' | 'returning' {
    if (daysSinceActivity <= DECAY.GRACE_PERIOD_DAYS) {
        return 'active';
    } else if (daysSinceActivity <= DECAY.DECAY_START_DAYS - 1) {
        return 'warning';
    } else if (daysSinceActivity <= DECAY.SEVERE_DECAY_START_DAYS - 1) {
        return 'decaying';
    } else if (daysSinceActivity <= DECAY.RETURNING_PLAYER_DAYS) {
        return 'severe';
    } else {
        return 'returning';
    }
}

function calculateDailyDecaySync(daysSinceActivity: number): number {
    if (daysSinceActivity <= DECAY.GRACE_PERIOD_DAYS) {
        return 0;
    } else if (daysSinceActivity < DECAY.DECAY_START_DAYS) {
        return DECAY.WARNING_ELO_DECAY_PER_DAY;
    } else if (daysSinceActivity < DECAY.SEVERE_DECAY_START_DAYS) {
        return DECAY.DECAY_ELO_PER_DAY;
    } else {
        return DECAY.SEVERE_ELO_PER_DAY;
    }
}

function isInPlacementModeSync(user: { 
    is_returning_player: number; 
    placement_matches_required: number; 
    placement_matches_completed: number 
}): boolean {
    return !!(user.is_returning_player && user.placement_matches_completed < user.placement_matches_required);
}

describe('Arena Decay System', () => {
    describe('DECAY constants', () => {
        it('should have correct grace period', () => {
            expect(DECAY.GRACE_PERIOD_DAYS).toBe(7);
        });

        it('should have correct warning phase start', () => {
            expect(DECAY.WARNING_START_DAYS).toBe(8);
        });

        it('should have correct decay phase start', () => {
            expect(DECAY.DECAY_START_DAYS).toBe(15);
        });

        it('should have correct severe decay start', () => {
            expect(DECAY.SEVERE_DECAY_START_DAYS).toBe(31);
        });

        it('should have correct returning player threshold', () => {
            expect(DECAY.RETURNING_PLAYER_DAYS).toBe(60);
        });

        it('should have correct ELO decay rates', () => {
            expect(DECAY.WARNING_ELO_DECAY_PER_DAY).toBe(5);
            expect(DECAY.DECAY_ELO_PER_DAY).toBe(10);
            expect(DECAY.SEVERE_ELO_PER_DAY).toBe(15);
        });

        it('should have minimum ELO floor', () => {
            expect(DECAY.MIN_ELO_FLOOR).toBe(200);
        });
    });

    describe('getDecayPhase', () => {
        it('should return "active" for 0-7 days of inactivity', () => {
            expect(getDecayPhaseSync(0)).toBe('active');
            expect(getDecayPhaseSync(5)).toBe('active');
            expect(getDecayPhaseSync(7)).toBe('active');
        });

        it('should return "warning" for 8-14 days of inactivity', () => {
            expect(getDecayPhaseSync(8)).toBe('warning');
            expect(getDecayPhaseSync(10)).toBe('warning');
            expect(getDecayPhaseSync(14)).toBe('warning');
        });

        it('should return "decaying" for 15-30 days of inactivity', () => {
            expect(getDecayPhaseSync(15)).toBe('decaying');
            expect(getDecayPhaseSync(20)).toBe('decaying');
            expect(getDecayPhaseSync(30)).toBe('decaying');
        });

        it('should return "severe" for 31-60 days of inactivity', () => {
            expect(getDecayPhaseSync(31)).toBe('severe');
            expect(getDecayPhaseSync(45)).toBe('severe');
            expect(getDecayPhaseSync(60)).toBe('severe');
        });

        it('should return "returning" for 61+ days of inactivity', () => {
            expect(getDecayPhaseSync(61)).toBe('returning');
            expect(getDecayPhaseSync(100)).toBe('returning');
            expect(getDecayPhaseSync(365)).toBe('returning');
        });
    });

    describe('calculateDailyDecay', () => {
        it('should return 0 for grace period (0-7 days)', () => {
            expect(calculateDailyDecaySync(0)).toBe(0);
            expect(calculateDailyDecaySync(5)).toBe(0);
            expect(calculateDailyDecaySync(7)).toBe(0);
        });

        it('should return 5 ELO for warning phase (8-14 days)', () => {
            expect(calculateDailyDecaySync(8)).toBe(5);
            expect(calculateDailyDecaySync(10)).toBe(5);
            expect(calculateDailyDecaySync(14)).toBe(5);
        });

        it('should return 10 ELO for decay phase (15-30 days)', () => {
            expect(calculateDailyDecaySync(15)).toBe(10);
            expect(calculateDailyDecaySync(20)).toBe(10);
            expect(calculateDailyDecaySync(30)).toBe(10);
        });

        it('should return 15 ELO for severe decay (31+ days)', () => {
            expect(calculateDailyDecaySync(31)).toBe(15);
            expect(calculateDailyDecaySync(45)).toBe(15);
            expect(calculateDailyDecaySync(100)).toBe(15);
        });
    });

    describe('isInPlacementMode', () => {
        it('should return false for non-returning player', () => {
            const result = isInPlacementModeSync({
                is_returning_player: 0,
                placement_matches_required: 0,
                placement_matches_completed: 0
            });
            expect(result).toBe(false);
        });

        it('should return true for returning player with matches remaining', () => {
            const result = isInPlacementModeSync({
                is_returning_player: 1,
                placement_matches_required: 3,
                placement_matches_completed: 1
            });
            expect(result).toBe(true);
        });

        it('should return false when placement matches completed', () => {
            const result = isInPlacementModeSync({
                is_returning_player: 1,
                placement_matches_required: 3,
                placement_matches_completed: 3
            });
            expect(result).toBe(false);
        });

        it('should return false when matches exceeded', () => {
            const result = isInPlacementModeSync({
                is_returning_player: 1,
                placement_matches_required: 3,
                placement_matches_completed: 5
            });
            expect(result).toBe(false);
        });
    });

    describe('PLACEMENT constants', () => {
        it('should require 3 placement matches', () => {
            expect(PLACEMENT.MATCHES_REQUIRED).toBe(3);
        });

        it('should have 2x ELO multiplier during placement', () => {
            expect(PLACEMENT.ELO_MULTIPLIER).toBe(2.0);
        });

        it('should have correct soft reset penalty', () => {
            expect(PLACEMENT.SOFT_RESET_ELO_PENALTY).toBe(100);
        });

        it('should trigger soft reset after 30 days', () => {
            expect(PLACEMENT.SOFT_RESET_DAYS).toBe(30);
        });
    });

    describe('Decay calculation scenarios', () => {
        it('should calculate total decay for warning phase', () => {
            // 7 days of warning = 7 * 5 = 35 ELO
            let total = 0;
            for (let day = 8; day <= 14; day++) {
                total += calculateDailyDecaySync(day);
            }
            expect(total).toBe(35);
        });

        it('should calculate total decay for active decay phase', () => {
            // 16 days of decay (15-30) = 16 * 10 = 160 ELO
            let total = 0;
            for (let day = 15; day <= 30; day++) {
                total += calculateDailyDecaySync(day);
            }
            expect(total).toBe(160);
        });

        it('should calculate severe decay correctly', () => {
            // 30 days of severe = 30 * 15 = 450 ELO
            let total = 0;
            for (let day = 31; day <= 60; day++) {
                total += calculateDailyDecaySync(day);
            }
            expect(total).toBe(450);
        });

        it('should calculate total decay from day 1 to day 60', () => {
            // Grace: 0, Warning: 35, Decay: 160, Severe: 450 = 645 total
            let total = 0;
            for (let day = 0; day <= 60; day++) {
                total += calculateDailyDecaySync(day);
            }
            expect(total).toBe(645);
        });
    });

    describe('Phase transitions', () => {
        it('should transition from active to warning at day 8', () => {
            expect(getDecayPhaseSync(7)).toBe('active');
            expect(getDecayPhaseSync(8)).toBe('warning');
        });

        it('should transition from warning to decaying at day 15', () => {
            expect(getDecayPhaseSync(14)).toBe('warning');
            expect(getDecayPhaseSync(15)).toBe('decaying');
        });

        it('should transition from decaying to severe at day 31', () => {
            expect(getDecayPhaseSync(30)).toBe('decaying');
            expect(getDecayPhaseSync(31)).toBe('severe');
        });

        it('should transition from severe to returning at day 61', () => {
            expect(getDecayPhaseSync(60)).toBe('severe');
            expect(getDecayPhaseSync(61)).toBe('returning');
        });
    });

    describe('Edge cases', () => {
        it('should handle negative days', () => {
            expect(getDecayPhaseSync(-1)).toBe('active');
            expect(calculateDailyDecaySync(-1)).toBe(0);
        });

        it('should handle very large day values', () => {
            expect(getDecayPhaseSync(1000)).toBe('returning');
            expect(calculateDailyDecaySync(1000)).toBe(15);
        });

        it('should handle exact boundary values', () => {
            expect(getDecayPhaseSync(DECAY.GRACE_PERIOD_DAYS)).toBe('active');
            expect(getDecayPhaseSync(DECAY.GRACE_PERIOD_DAYS + 1)).toBe('warning');
        });
    });
});
