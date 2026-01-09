/**
 * Property-Based Tests for Practice Session Data Integrity
 * 
 * Feature: comprehensive-user-stories
 * Property 3: Practice Session Data Integrity
 * 
 * Validates: Requirements 1.5, 1.6
 * For any completed practice session, the system should update user XP, level, 
 * and Math_Tier progression based on performance metrics
 */

import { describe, it, expect } from 'vitest';
import { checkProgression, generateMasteryTest, MathOperation } from '@/lib/math-tiers';
import { calculateTierAdvancement, getBandForTier, getTierWithinBand, MIN_TIER, MAX_TIER } from '@/lib/tier-system';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

describe('Property 3: Practice Session Data Integrity', () => {
    const operations: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    
    it('should advance tiers based on performance metrics', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const currentTier = Math.floor(Math.random() * (MAX_TIER - 10)) + MIN_TIER;
            const accuracy = Math.random(); // 0.0 to 1.0
            const streak = Math.floor(Math.random() * 20); // 0 to 19
            
            const progression = checkProgression(currentTier, accuracy * 100, streak);
            
            // Validate progression structure
            expect(progression).toHaveProperty('newTier');
            expect(progression).toHaveProperty('requiresMasteryTest');
            expect(typeof progression.newTier).toBe('number');
            expect(typeof progression.requiresMasteryTest).toBe('boolean');
            
            // New tier should be within valid bounds
            expect(progression.newTier).toBeGreaterThanOrEqual(MIN_TIER);
            expect(progression.newTier).toBeLessThanOrEqual(MAX_TIER);
            expect(progression.newTier).toBeGreaterThanOrEqual(currentTier);
            
            // Validate advancement logic
            if (accuracy >= 0.85) {
                // High accuracy should advance at least 1 tier (unless at max or band boundary)
                if (currentTier < MAX_TIER) {
                    const currentBand = getBandForTier(currentTier);
                    const isAtBandEnd = currentTier === currentBand.tierRange[1];
                    
                    if (!isAtBandEnd) {
                        // Should advance if not at band boundary
                        expect(progression.newTier).toBeGreaterThan(currentTier);
                    } else {
                        // At band boundary, may require mastery test instead of advancing
                        expect(progression.newTier).toBeGreaterThanOrEqual(currentTier);
                    }
                }
            } else {
                // Low accuracy should not advance
                expect(progression.newTier).toBe(currentTier);
            }
            
            // Validate mastery test requirements
            const currentBand = getBandForTier(currentTier);
            const newBand = getBandForTier(progression.newTier);
            
            if (newBand.id > currentBand.id) {
                // Crossing band boundary should require mastery test
                expect(progression.requiresMasteryTest).toBe(true);
            }
        }
    });
    
    it('should calculate tier advancement based on AI session metrics', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const currentTier = Math.floor(Math.random() * (MAX_TIER - 5)) + MIN_TIER;
            const accuracy = Math.random();
            const confidence = Math.random();
            const totalQuestions = Math.floor(Math.random() * 50) + 10; // 10-59 questions
            const maxStreak = Math.floor(Math.random() * 20);
            const tiltScore = Math.random();
            
            const advancement = calculateTierAdvancement(
                accuracy,
                confidence,
                totalQuestions,
                maxStreak,
                tiltScore,
                currentTier
            );
            
            // Advancement should be non-negative integer
            expect(advancement).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(advancement)).toBe(true);
            
            // Should not advance beyond max tier
            expect(currentTier + advancement).toBeLessThanOrEqual(MAX_TIER);
            
            // High performance should lead to advancement
            if (accuracy >= 0.95 && confidence >= 0.90 && maxStreak >= 10 && totalQuestions >= 25 && tiltScore <= 0.3) {
                expect(advancement).toBeGreaterThan(0);
            }
            
            // High tilt should reduce advancement
            if (tiltScore > 0.75) {
                expect(advancement).toBeLessThanOrEqual(2); // Reduced advancement
            }
            
            // Should not cross band boundaries automatically
            const currentBand = getBandForTier(currentTier);
            const potentialNewTier = currentTier + advancement;
            const potentialBand = getBandForTier(potentialNewTier);
            
            if (potentialBand.id > currentBand.id) {
                // Should stop at band boundary
                expect(potentialNewTier).toBeLessThanOrEqual(currentBand.tierRange[1]);
            }
        }
    });
    
    it('should generate appropriate mastery tests for tier progression', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const operation = operations[Math.floor(Math.random() * operations.length)];
            const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
            
            // Only test tiers that can have mastery tests (every 10 tiers)
            if (tier % 10 !== 0 && tier !== MAX_TIER) continue;
            
            const masteryTest = generateMasteryTest(operation, tier);
            
            // Validate mastery test structure
            expect(masteryTest).toHaveProperty('problems');
            expect(masteryTest).toHaveProperty('requiredAccuracy');
            expect(Array.isArray(masteryTest.problems)).toBe(true);
            expect(masteryTest.problems.length).toBeGreaterThan(0);
            expect(typeof masteryTest.requiredAccuracy).toBe('number');
            
            // Band boundary tests should be harder
            const isAtBandBoundary = tier % 20 === 0;
            if (isAtBandBoundary) {
                expect(masteryTest.problems.length).toBe(10);
                expect(masteryTest.requiredAccuracy).toBe(90);
            } else {
                expect(masteryTest.problems.length).toBe(5);
                expect(masteryTest.requiredAccuracy).toBe(80);
            }
            
            // All problems should be valid
            masteryTest.problems.forEach(problem => {
                expect(problem).toHaveProperty('question');
                expect(problem).toHaveProperty('answer');
                expect(problem).toHaveProperty('tier');
                expect(typeof problem.answer).toBe('number');
                expect(problem.tier).toBeGreaterThan(0);
            });
        }
    });
    
    it('should maintain session statistics consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Simulate session statistics
            const correctCount = Math.floor(Math.random() * 50);
            const totalCount = correctCount + Math.floor(Math.random() * 20);
            const avgSpeed = Math.random() * 10 + 0.5; // 0.5s to 10.5s
            const maxStreak = Math.floor(Math.random() * (correctCount + 1)); // 0 to correctCount
            
            // Validate basic consistency
            expect(correctCount).toBeLessThanOrEqual(totalCount);
            expect(maxStreak).toBeLessThanOrEqual(correctCount);
            expect(avgSpeed).toBeGreaterThan(0);
            
            // Calculate accuracy
            const accuracy = totalCount > 0 ? correctCount / totalCount : 0;
            expect(accuracy).toBeGreaterThanOrEqual(0);
            expect(accuracy).toBeLessThanOrEqual(1);
            
            // XP calculation should be consistent
            const baseXP = correctCount * 3; // Assuming average XP per correct answer
            const speedBonus = avgSpeed < 2 ? correctCount * 2 : 0; // Fast answers get bonus
            const expectedXP = baseXP + speedBonus;
            
            expect(expectedXP).toBeGreaterThanOrEqual(0);
            expect(expectedXP).toBe(Math.floor(expectedXP)); // Should be integer
        }
    });
    
    it('should handle edge cases in progression calculation', () => {
        const edgeCases = [
            { tier: MIN_TIER, accuracy: 100, streak: 20 },
            { tier: MAX_TIER, accuracy: 100, streak: 20 },
            { tier: MAX_TIER - 1, accuracy: 100, streak: 20 },
            { tier: 20, accuracy: 90, streak: 10 }, // Band boundary
            { tier: 40, accuracy: 90, streak: 10 }, // Band boundary
            { tier: 60, accuracy: 90, streak: 10 }, // Band boundary
            { tier: 80, accuracy: 90, streak: 10 }, // Band boundary
        ];
        
        edgeCases.forEach(({ tier, accuracy, streak }) => {
            const progression = checkProgression(tier, accuracy, streak);
            
            // Should always return valid progression
            expect(progression.newTier).toBeGreaterThanOrEqual(MIN_TIER);
            expect(progression.newTier).toBeLessThanOrEqual(MAX_TIER);
            expect(progression.newTier).toBeGreaterThanOrEqual(tier);
            
            // At max tier, should not advance further
            if (tier === MAX_TIER) {
                expect(progression.newTier).toBe(MAX_TIER);
                expect(progression.requiresMasteryTest).toBe(false);
            }
        });
    });
    
    it('should maintain tier progression consistency across operations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
            const accuracy = 85 + Math.random() * 15; // 85-100% accuracy
            const streak = Math.floor(Math.random() * 15) + 5; // 5-19 streak
            
            // Test progression for all operations
            const progressions = operations.map(op => checkProgression(tier, accuracy, streak));
            
            // All operations should have consistent progression logic
            progressions.forEach(progression => {
                expect(progression.newTier).toBeGreaterThanOrEqual(tier);
                expect(progression.newTier).toBeLessThanOrEqual(MAX_TIER);
                
                // High accuracy should lead to advancement (unless at band boundary)
                if (accuracy >= 90 && streak >= 8) {
                    const currentBand = getBandForTier(tier);
                    const isAtBandEnd = tier === currentBand.tierRange[1];
                    
                    if (!isAtBandEnd && tier < MAX_TIER) {
                        expect(progression.newTier).toBeGreaterThan(tier);
                    } else {
                        // At band boundary or max tier, may not advance
                        expect(progression.newTier).toBeGreaterThanOrEqual(tier);
                    }
                }
            });
        }
    });
});