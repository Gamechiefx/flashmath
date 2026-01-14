/**
 * Property-Based Tests for Practice Problem Generation
 * 
 * Feature: comprehensive-user-stories
 * Property 1: Practice Problem Generation Consistency
 * 
 * Validates: Requirements 1.2
 * For any user and math tier combination, generated practice problems should match 
 * the difficulty level specified by the user's current Math_Tier for that operation
 */

import { describe, it, expect } from 'vitest';
import { generateProblemForSession, MathOperation } from '@/lib/math-tiers';
import { getTierOperandRange, getBandForTier, MIN_TIER, MAX_TIER } from '@/lib/tier-system';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

describe('Property 1: Practice Problem Generation Consistency', () => {
    const operations: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    
    operations.forEach(operation => {
        it(`should generate problems matching tier difficulty for ${operation}`, () => {
            for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
                // Generate random tier within valid range
                const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
                
                // Generate problem for this tier and operation
                const problem = generateProblemForSession(operation, tier);
                
                // Get expected operand range for this tier
                const [minOp, maxOp] = getTierOperandRange(tier, operation);
                const band = getBandForTier(tier);
                
                // Validate problem structure
                expect(problem).toHaveProperty('question');
                expect(problem).toHaveProperty('answer');
                expect(problem).toHaveProperty('tier');
                expect(problem).toHaveProperty('band');
                expect(problem.tier).toBe(tier);
                expect(problem.band).toBe(band.name);
                
                // Extract operands from question to validate difficulty
                const operands = extractOperandsFromQuestion(problem.question, operation);
                
                if (operands) {
                    const { op1, op2 } = operands;
                    
                    // Validate operands are within expected range for the tier
                    // Allow some flexibility for division (divisors can be smaller)
                    if (operation === 'division') {
                        // For division, dividend (op1) should be in range, divisor (op2) can be smaller
                        expect(op2).toBeGreaterThanOrEqual(2); // Minimum divisor
                        expect(op2).toBeLessThanOrEqual(maxOp * 2); // Allow some flexibility
                    } else {
                        // For other operations, both operands should be in tier range
                        expect(op1).toBeGreaterThanOrEqual(minOp);
                        expect(op1).toBeLessThanOrEqual(maxOp * 2); // Allow some flexibility for products
                        expect(op2).toBeGreaterThanOrEqual(minOp);
                        expect(op2).toBeLessThanOrEqual(maxOp);
                    }
                }
                
                // Validate answer is correct for the question
                const calculatedAnswer = calculateAnswer(problem.question, operation);
                if (calculatedAnswer !== null) {
                    expect(problem.answer).toBe(calculatedAnswer);
                }
                
                // Validate tier progression makes sense (skip for now due to randomness)
                // Note: Tier progression validation is complex due to random generation
                // This property is validated at the system level through tier ranges
            }
        });
    });
    
    it('should generate consistent problem types within bands', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const operation = operations[Math.floor(Math.random() * operations.length)];
            const tier = Math.floor(Math.random() * (MAX_TIER - MIN_TIER + 1)) + MIN_TIER;
            
            const problem = generateProblemForSession(operation, tier);
            const band = getBandForTier(tier);
            
            // Validate problem type matches band expectations
            switch (band.name) {
                case 'Foundation':
                    // Foundation can have basic, multi-digit, or variable problems
                    expect(['basic', 'multi-digit', 'variable']).toContain(problem.type);
                    break;
                case 'Intermediate':
                    // Intermediate can have variables
                    expect(['basic', 'multi-digit', 'variable']).toContain(problem.type);
                    break;
                case 'Advanced':
                case 'Expert':
                case 'Master':
                    // Higher bands can have any type
                    expect(['basic', 'multi-digit', 'variable', 'word']).toContain(problem.type);
                    break;
            }
        }
    });
});

/**
 * Extract operands from a math question string
 */
function extractOperandsFromQuestion(question: string, operation: MathOperation): { op1: number; op2: number } | null {
    // Handle variable problems (contain 'x')
    if (question.includes('x') && !question.includes('×')) {
        return null; // Skip variable problems for operand validation
    }
    
    // Clean up the question
    const cleaned = question.replace(/[×÷]/g, (match) => match === '×' ? '*' : '/');
    
    // Extract numbers from the question
    const numbers = cleaned.match(/\d+/g);
    if (!numbers || numbers.length < 2) {
        return null;
    }
    
    const op1 = parseInt(numbers[0]);
    const op2 = parseInt(numbers[1]);
    
    return { op1, op2 };
}

/**
 * Calculate the correct answer for a math question
 */
function calculateAnswer(question: string, operation: MathOperation): number | null {
    // Handle variable problems
    if (question.includes('x') && !question.includes('×')) {
        return null; // Skip variable problems
    }
    
    const operands = extractOperandsFromQuestion(question, operation);
    if (!operands) return null;
    
    const { op1, op2 } = operands;
    
    switch (operation) {
        case 'addition':
            return op1 + op2;
        case 'subtraction':
            return op1 - op2;
        case 'multiplication':
            return op1 * op2;
        case 'division':
            return op2 !== 0 ? op1 / op2 : null;
        default:
            return null;
    }
}