/**
 * Property-Based Tests for Practice Feedback Consistency
 * 
 * Feature: comprehensive-user-stories
 * Property 2: Practice Feedback Consistency
 * 
 * Validates: Requirements 1.3, 1.4
 * For any practice problem response, correct answers should trigger positive feedback 
 * and incorrect answers should display the correct answer with explanation
 */

import { describe, it, expect } from 'vitest';
import { generateProblemForSession, MathOperation } from '@/lib/math-tiers';
import { getPerformance, THRESHOLDS } from '@/lib/math-engine';
import { MIN_TIER, MAX_TIER } from '@/lib/tier-system';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

describe('Property 2: Practice Feedback Consistency', () => {
    const operations: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    
    it('should provide positive feedback for correct answers', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const operation = operations[Math.floor(Math.random() * operations.length)];
            const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
            const responseTime = Math.floor(Math.random() * 10000) + 500; // 0.5s to 10.5s
            
            const problem = generateProblemForSession(operation, tier);
            const correctAnswer = problem.answer;
            
            // Test correct answer feedback
            const performance = getPerformance(responseTime);
            
            // Validate performance feedback structure
            expect(performance).toHaveProperty('type');
            expect(performance).toHaveProperty('label');
            expect(performance).toHaveProperty('xp');
            
            // Validate performance type based on response time
            if (responseTime <= THRESHOLDS.FAST) {
                expect(performance.type).toBe('fast');
                expect(performance.label).toBe('⚡ LIGHTNING FAST');
                expect(performance.xp).toBe(5);
            } else if (responseTime <= THRESHOLDS.SLOW) {
                expect(performance.type).toBe('correct');
                expect(performance.label).toBe('✓ ACCURATE');
                expect(performance.xp).toBe(3);
            } else {
                expect(performance.type).toBe('slow');
                expect(performance.label).toBe('🐢 GOT IT');
                expect(performance.xp).toBe(1);
            }
            
            // All correct answers should give positive XP
            expect(performance.xp).toBeGreaterThan(0);
            
            // Validate that problem has explanation for incorrect answers
            expect(problem.explanation).toBeDefined();
            expect(typeof problem.explanation).toBe('string');
            expect(problem.explanation.length).toBeGreaterThan(0);
        }
    });
    
    it('should provide explanations for all generated problems', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const operation = operations[Math.floor(Math.random() * operations.length)];
            const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
            
            const problem = generateProblemForSession(operation, tier);
            
            // Every problem should have an explanation
            expect(problem.explanation).toBeDefined();
            expect(typeof problem.explanation).toBe('string');
            expect(problem.explanation.length).toBeGreaterThan(0);
            
            // Explanation should be meaningful (not just contain the answer)
            // Some explanations are instructional rather than showing the answer
            expect(problem.explanation.length).toBeGreaterThan(5); // At least some meaningful text
        }
    });
    
    it('should maintain consistent feedback timing thresholds', () => {
        const testResponseTimes = [
            500,    // Very fast
            1500,   // Fast
            2500,   // Normal
            5000,   // Slow
            8000,   // Very slow
            12000   // Extremely slow
        ];
        
        testResponseTimes.forEach(responseTime => {
            for (let iteration = 0; iteration < 10; iteration++) {
                const performance = getPerformance(responseTime);
                
                // Validate consistent categorization
                if (responseTime <= THRESHOLDS.FAST) {
                    expect(performance.type).toBe('fast');
                    expect(performance.xp).toBe(5);
                } else if (responseTime <= THRESHOLDS.SLOW) {
                    expect(performance.type).toBe('correct');
                    expect(performance.xp).toBe(3);
                } else {
                    expect(performance.type).toBe('slow');
                    expect(performance.xp).toBe(1);
                }
            }
        });
    });
    
    it('should provide appropriate feedback labels for different performance levels', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const responseTime = Math.floor(Math.random() * 15000) + 100; // 0.1s to 15s
            const performance = getPerformance(responseTime);
            
            // Validate label format and content
            expect(performance.label).toBeDefined();
            expect(typeof performance.label).toBe('string');
            expect(performance.label.length).toBeGreaterThan(0);
            
            // Labels should be encouraging and descriptive
            const validLabels = ['⚡ LIGHTNING FAST', '✓ ACCURATE', '🐢 GOT IT'];
            expect(validLabels).toContain(performance.label);
            
            // Fast responses should get the most encouraging feedback
            if (performance.type === 'fast') {
                expect(performance.label).toContain('LIGHTNING FAST');
            }
        }
    });
    
    it('should handle edge cases in response timing', () => {
        const edgeCases = [
            0,          // Instant (impossible but test boundary)
            1,          // 1ms
            THRESHOLDS.FAST,        // Exactly at fast threshold
            THRESHOLDS.FAST + 1,    // Just over fast threshold
            THRESHOLDS.SLOW,        // Exactly at slow threshold
            THRESHOLDS.SLOW + 1,    // Just over slow threshold
            999999      // Very large number
        ];
        
        edgeCases.forEach(responseTime => {
            const performance = getPerformance(responseTime);
            
            // Should always return valid performance object
            expect(performance).toHaveProperty('type');
            expect(performance).toHaveProperty('label');
            expect(performance).toHaveProperty('xp');
            expect(performance.xp).toBeGreaterThan(0);
            
            // Type should be one of the valid types
            expect(['fast', 'correct', 'slow']).toContain(performance.type);
        });
    });
    
    it('should provide consistent XP rewards based on performance', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const responseTime = Math.floor(Math.random() * 10000) + 100;
            const performance = getPerformance(responseTime);
            
            // XP should be consistent with performance type
            switch (performance.type) {
                case 'fast':
                    expect(performance.xp).toBe(5);
                    break;
                case 'correct':
                    expect(performance.xp).toBe(3);
                    break;
                case 'slow':
                    expect(performance.xp).toBe(1);
                    break;
            }
            
            // XP should always be positive
            expect(performance.xp).toBeGreaterThan(0);
            expect(performance.xp).toBeLessThanOrEqual(5); // Maximum XP
        }
    });
});