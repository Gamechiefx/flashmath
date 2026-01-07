/**
 * ELO Calculator Unit Tests
 * 
 * Tests ELO rating calculation logic for arena matches.
 */

import { describe, it, expect } from 'vitest';

// ELO calculation constants (matching server.js)
const K_FACTOR = 32;
const ELO_FLOOR = 100;
const ELO_CEILING = 3000;

/**
 * Calculate expected score based on ELO difference
 */
function calculateExpectedScore(playerElo: number, opponentElo: number): number {
    return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Calculate new ELO after a match
 */
function calculateNewElo(
    currentElo: number,
    opponentElo: number,
    won: boolean,
    kFactor: number = K_FACTOR
): number {
    const expected = calculateExpectedScore(currentElo, opponentElo);
    const actual = won ? 1 : 0;
    const newElo = Math.round(currentElo + kFactor * (actual - expected));
    
    // Apply floor and ceiling
    return Math.max(ELO_FLOOR, Math.min(ELO_CEILING, newElo));
}

/**
 * Calculate ELO change (delta) for a match
 */
function calculateEloChange(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    kFactor: number = K_FACTOR
): number {
    const newElo = calculateNewElo(playerElo, opponentElo, won, kFactor);
    return newElo - playerElo;
}

describe('ELO Calculator', () => {
    describe('calculateExpectedScore', () => {
        it('should return 0.5 for equal ratings', () => {
            expect(calculateExpectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
            expect(calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
        });
        
        it('should return higher expected score for higher-rated player', () => {
            const higherRated = calculateExpectedScore(1200, 1000);
            const lowerRated = calculateExpectedScore(1000, 1200);
            
            expect(higherRated).toBeGreaterThan(0.5);
            expect(lowerRated).toBeLessThan(0.5);
            expect(higherRated + lowerRated).toBeCloseTo(1, 5);
        });
        
        it('should calculate correct expected scores for known ELO differences', () => {
            // 400 point difference = ~91% expected for higher rated
            expect(calculateExpectedScore(1400, 1000)).toBeCloseTo(0.909, 2);
            
            // 200 point difference = ~76% expected for higher rated
            expect(calculateExpectedScore(1200, 1000)).toBeCloseTo(0.76, 2);
        });
        
        it('should handle extreme differences', () => {
            const extreme = calculateExpectedScore(2000, 500);
            expect(extreme).toBeGreaterThan(0.99);
            expect(extreme).toBeLessThan(1);
        });
    });
    
    describe('calculateNewElo', () => {
        it('should increase ELO for a win against equal opponent', () => {
            const newElo = calculateNewElo(1000, 1000, true);
            expect(newElo).toBeGreaterThan(1000);
            expect(newElo).toBe(1016); // K=32, expected=0.5, actual=1: 1000 + 32*(1-0.5) = 1016
        });
        
        it('should decrease ELO for a loss against equal opponent', () => {
            const newElo = calculateNewElo(1000, 1000, false);
            expect(newElo).toBeLessThan(1000);
            expect(newElo).toBe(984); // K=32, expected=0.5, actual=0: 1000 + 32*(0-0.5) = 984
        });
        
        it('should give more points for upset wins', () => {
            const upsetWin = calculateEloChange(800, 1200, true);
            const normalWin = calculateEloChange(1000, 1000, true);
            const expectedWin = calculateEloChange(1200, 800, true);
            
            expect(upsetWin).toBeGreaterThan(normalWin);
            expect(normalWin).toBeGreaterThan(expectedWin);
        });
        
        it('should lose less points for expected losses', () => {
            const upsetLoss = calculateEloChange(1200, 800, false);
            const normalLoss = calculateEloChange(1000, 1000, false);
            const expectedLoss = calculateEloChange(800, 1200, false);
            
            expect(Math.abs(upsetLoss)).toBeGreaterThan(Math.abs(normalLoss));
            expect(Math.abs(normalLoss)).toBeGreaterThan(Math.abs(expectedLoss));
        });
        
        it('should respect ELO floor', () => {
            const newElo = calculateNewElo(ELO_FLOOR, 1500, false);
            expect(newElo).toBe(ELO_FLOOR);
        });
        
        it('should respect ELO ceiling', () => {
            const newElo = calculateNewElo(ELO_CEILING, 500, true);
            expect(newElo).toBe(ELO_CEILING);
        });
        
        it('should handle custom K factor', () => {
            const normalK = calculateEloChange(1000, 1000, true, 32);
            const lowK = calculateEloChange(1000, 1000, true, 16);
            const highK = calculateEloChange(1000, 1000, true, 64);
            
            expect(highK).toBeGreaterThan(normalK);
            expect(normalK).toBeGreaterThan(lowK);
        });
    });
    
    describe('calculateEloChange', () => {
        it('should return positive change for wins', () => {
            expect(calculateEloChange(1000, 1000, true)).toBeGreaterThan(0);
            expect(calculateEloChange(800, 1200, true)).toBeGreaterThan(0);
            expect(calculateEloChange(1200, 800, true)).toBeGreaterThan(0);
        });
        
        it('should return negative change for losses', () => {
            expect(calculateEloChange(1000, 1000, false)).toBeLessThan(0);
            expect(calculateEloChange(800, 1200, false)).toBeLessThan(0);
            expect(calculateEloChange(1200, 800, false)).toBeLessThan(0);
        });
        
        it('should be zero-sum for equal opponents', () => {
            const winChange = calculateEloChange(1000, 1000, true);
            const lossChange = calculateEloChange(1000, 1000, false);
            
            // Due to rounding, may not be exactly zero-sum
            expect(Math.abs(winChange + lossChange)).toBeLessThanOrEqual(1);
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle very low ELO values', () => {
            const newElo = calculateNewElo(100, 100, true);
            expect(newElo).toBeGreaterThanOrEqual(ELO_FLOOR);
        });
        
        it('should handle very high ELO values', () => {
            const newElo = calculateNewElo(2900, 2900, true);
            expect(newElo).toBeLessThanOrEqual(ELO_CEILING);
        });
        
        it('should round to integers', () => {
            const newElo = calculateNewElo(1000, 1050, true);
            expect(Number.isInteger(newElo)).toBe(true);
        });
    });
});


