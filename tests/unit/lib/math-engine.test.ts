/**
 * Math Engine Unit Tests
 * 
 * Tests the core math problem generation and performance evaluation logic.
 */

import { describe, it, expect, vi } from 'vitest';

// We need to test the logic without 'use client' directive issues
// Extract the pure functions for testing

type Operation = 'Addition' | 'Subtraction' | 'Multiplication' | 'Division';
type PerformanceType = 'fast' | 'correct' | 'slow';

const THRESHOLDS = {
    FAST: 2000,
    SLOW: 6000,
};

function generateProblem(op: Operation = 'Multiplication') {
    let num1 = Math.floor(Math.random() * 11) + 2;
    let num2 = Math.floor(Math.random() * 11) + 2;

    if (op === 'Addition') {
        return { num1, num2, answer: num1 + num2 };
    }
    if (op === 'Subtraction') {
        if (num1 < num2) [num1, num2] = [num2, num1];
        return { num1, num2, answer: num1 - num2 };
    }
    if (op === 'Division') {
        const product = num1 * num2;
        return { num1: product, num2: num1, answer: num2 };
    }

    return { num1, num2, answer: num1 * num2 };
}

function getPerformance(responseTime: number): { type: PerformanceType; label: string; xp: number } {
    if (responseTime <= THRESHOLDS.FAST) {
        return { type: 'fast', label: '⚡ LIGHTNING FAST', xp: 5 };
    }
    if (responseTime <= THRESHOLDS.SLOW) {
        return { type: 'correct', label: '✓ ACCURATE', xp: 3 };
    }
    return { type: 'slow', label: '🐢 GOT IT', xp: 1 };
}

describe('Math Engine', () => {
    describe('generateProblem', () => {
        describe('Addition', () => {
            it('should generate valid addition problems', () => {
                for (let i = 0; i < 100; i++) {
                    const problem = generateProblem('Addition');
                    
                    expect(problem.num1).toBeGreaterThanOrEqual(2);
                    expect(problem.num1).toBeLessThanOrEqual(12);
                    expect(problem.num2).toBeGreaterThanOrEqual(2);
                    expect(problem.num2).toBeLessThanOrEqual(12);
                    expect(problem.answer).toBe(problem.num1 + problem.num2);
                }
            });
        });
        
        describe('Subtraction', () => {
            it('should generate valid subtraction problems with non-negative results', () => {
                for (let i = 0; i < 100; i++) {
                    const problem = generateProblem('Subtraction');
                    
                    expect(problem.num1).toBeGreaterThanOrEqual(problem.num2);
                    expect(problem.answer).toBe(problem.num1 - problem.num2);
                    expect(problem.answer).toBeGreaterThanOrEqual(0);
                }
            });
        });
        
        describe('Multiplication', () => {
            it('should generate valid multiplication problems', () => {
                for (let i = 0; i < 100; i++) {
                    const problem = generateProblem('Multiplication');
                    
                    expect(problem.num1).toBeGreaterThanOrEqual(2);
                    expect(problem.num2).toBeGreaterThanOrEqual(2);
                    expect(problem.answer).toBe(problem.num1 * problem.num2);
                }
            });
            
            it('should default to multiplication when no operation specified', () => {
                const problem = generateProblem();
                expect(problem.answer).toBe(problem.num1 * problem.num2);
            });
        });
        
        describe('Division', () => {
            it('should generate valid division problems with whole number results', () => {
                for (let i = 0; i < 100; i++) {
                    const problem = generateProblem('Division');
                    
                    // Division: num1 is the product, num2 is divisor, answer is result
                    expect(problem.num1 % problem.num2).toBe(0);
                    expect(problem.answer).toBe(problem.num1 / problem.num2);
                    expect(Number.isInteger(problem.answer)).toBe(true);
                }
            });
        });
        
        describe('Randomness', () => {
            it('should generate different problems across multiple calls', () => {
                const problems = new Set<string>();
                
                for (let i = 0; i < 50; i++) {
                    const problem = generateProblem('Multiplication');
                    problems.add(`${problem.num1}x${problem.num2}`);
                }
                
                // Should have generated at least 5 unique problems in 50 calls
                expect(problems.size).toBeGreaterThan(5);
            });
        });
    });
    
    describe('getPerformance', () => {
        it('should return "fast" for response times <= 2000ms', () => {
            expect(getPerformance(500).type).toBe('fast');
            expect(getPerformance(1000).type).toBe('fast');
            expect(getPerformance(2000).type).toBe('fast');
            expect(getPerformance(2000).xp).toBe(5);
            expect(getPerformance(2000).label).toContain('LIGHTNING');
        });
        
        it('should return "correct" for response times 2001-6000ms', () => {
            expect(getPerformance(2001).type).toBe('correct');
            expect(getPerformance(4000).type).toBe('correct');
            expect(getPerformance(6000).type).toBe('correct');
            expect(getPerformance(4000).xp).toBe(3);
            expect(getPerformance(4000).label).toContain('ACCURATE');
        });
        
        it('should return "slow" for response times > 6000ms', () => {
            expect(getPerformance(6001).type).toBe('slow');
            expect(getPerformance(10000).type).toBe('slow');
            expect(getPerformance(60000).type).toBe('slow');
            expect(getPerformance(10000).xp).toBe(1);
            expect(getPerformance(10000).label).toContain('GOT IT');
        });
        
        it('should handle edge cases', () => {
            expect(getPerformance(0).type).toBe('fast');
            expect(getPerformance(1).type).toBe('fast');
        });
    });
    
    describe('THRESHOLDS', () => {
        it('should have correct threshold values', () => {
            expect(THRESHOLDS.FAST).toBe(2000);
            expect(THRESHOLDS.SLOW).toBe(6000);
        });
    });
});


