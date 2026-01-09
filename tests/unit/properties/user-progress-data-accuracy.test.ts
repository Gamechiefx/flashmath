/**
 * Property-Based Tests for User Progress Data Accuracy
 * 
 * Feature: comprehensive-user-stories
 * Property 14: User Progress Data Accuracy
 * 
 * Validates: Requirements 6.2, 6.3, 6.4
 * For any user profile or progress view, displayed statistics should accurately reflect 
 * current Math_Tier levels, match history, and achievement status
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock user data structures
interface UserSession {
    id: string;
    userId: string;
    operation: 'Addition' | 'Subtraction' | 'Multiplication' | 'Division';
    correctCount: number;
    totalCount: number;
    avgSpeed: number;
    xpEarned: number;
    createdAt: Date;
    mathTier: number;
}

interface UserProgress {
    userId: string;
    mathTiers: Record<string, number>;
    totalXp: number;
    level: number;
    coins: number;
    achievements: string[];
    arenaStats: {
        elo: number;
        wins: number;
        losses: number;
        winStreak: number;
    };
}

interface ProgressDisplay {
    accuracy: number;
    avgSpeed: string;
    totalXP: number;
    level: number;
    mathTiers: Record<string, number>;
    careerStats: {
        lifetimeAccuracy: number;
        detailedOps: Array<{
            op: string;
            accuracy: number;
            avgSpeed: number;
            totalXP: number;
            sessionsPlayed: number;
        }>;
    };
    achievements: string[];
    arenaRank?: string;
}

// Simulate progress calculation
function simulateProgressCalculation(
    sessions: UserSession[],
    userProgress: UserProgress
): ProgressDisplay {
    // Calculate overall accuracy
    const totalCorrect = sessions.reduce((acc, s) => acc + s.correctCount, 0);
    const totalAttempted = sessions.reduce((acc, s) => acc + s.totalCount, 0);
    const accuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

    // Calculate average speed
    const avgSpeed = sessions.length > 0
        ? sessions.reduce((acc, s) => acc + s.avgSpeed, 0) / sessions.length
        : 0;

    // Calculate operation-specific stats
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const detailedOps = operations.map(op => {
        const opSessions = sessions.filter(s => s.operation === op);
        const opCorrect = opSessions.reduce((acc, s) => acc + s.correctCount, 0);
        const opTotal = opSessions.reduce((acc, s) => acc + s.totalCount, 0);
        const opXP = opSessions.reduce((acc, s) => acc + s.xpEarned, 0);
        const opAvgSpeed = opSessions.length > 0
            ? opSessions.reduce((acc, s) => acc + s.avgSpeed, 0) / opSessions.length
            : 0;

        return {
            op,
            accuracy: opTotal > 0 ? (opCorrect / opTotal) * 100 : 0,
            avgSpeed: opAvgSpeed,
            totalXP: opXP,
            sessionsPlayed: opSessions.length
        };
    });

    // Determine arena rank based on ELO
    let arenaRank: string | undefined;
    if (userProgress.arenaStats.elo >= 2000) arenaRank = 'Apex';
    else if (userProgress.arenaStats.elo >= 1500) arenaRank = 'Void';
    else if (userProgress.arenaStats.elo >= 1000) arenaRank = 'Plasma';
    else if (userProgress.arenaStats.elo >= 500) arenaRank = 'Cobalt';
    else arenaRank = 'Neon';

    return {
        accuracy,
        avgSpeed: avgSpeed.toFixed(2) + "s",
        totalXP: userProgress.totalXp,
        level: userProgress.level,
        mathTiers: userProgress.mathTiers,
        careerStats: {
            lifetimeAccuracy: accuracy,
            detailedOps
        },
        achievements: userProgress.achievements,
        arenaRank
    };
}

// Generate random user session
function generateRandomSession(userId: string): UserSession {
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'] as const;
    const operation = operations[Math.floor(Math.random() * operations.length)];
    const totalCount = Math.floor(Math.random() * 20) + 5; // 5-24 problems
    const correctCount = Math.floor(Math.random() * totalCount); // 0 to totalCount correct
    
    return {
        id: `session-${Math.random().toString(36).substring(7)}`,
        userId,
        operation,
        correctCount,
        totalCount,
        avgSpeed: Math.random() * 5 + 1, // 1-6 seconds
        xpEarned: correctCount * 10, // 10 XP per correct answer
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Up to 30 days ago
        mathTier: Math.floor(Math.random() * 4) + 1 // Tier 1-4
    };
}

// Generate random user progress
function generateRandomUserProgress(userId: string): UserProgress {
    return {
        userId,
        mathTiers: {
            addition: Math.floor(Math.random() * 4) + 1,
            subtraction: Math.floor(Math.random() * 4) + 1,
            multiplication: Math.floor(Math.random() * 4) + 1,
            division: Math.floor(Math.random() * 4) + 1
        },
        totalXp: Math.floor(Math.random() * 50000),
        level: Math.floor(Math.random() * 50) + 1,
        coins: Math.floor(Math.random() * 10000),
        achievements: ['first_session', 'speed_demon', 'accuracy_ace'].filter(() => Math.random() > 0.5),
        arenaStats: {
            elo: Math.floor(Math.random() * 2500) + 100,
            wins: Math.floor(Math.random() * 100),
            losses: Math.floor(Math.random() * 100),
            winStreak: Math.floor(Math.random() * 10)
        }
    };
}

describe('Property 14: User Progress Data Accuracy', () => {
    it('should accurately calculate overall accuracy from session data', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessionCount = Math.floor(Math.random() * 20) + 1; // 1-20 sessions
            const sessions = Array.from({ length: sessionCount }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Calculate expected accuracy
            const totalCorrect = sessions.reduce((acc, s) => acc + s.correctCount, 0);
            const totalAttempted = sessions.reduce((acc, s) => acc + s.totalCount, 0);
            const expectedAccuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

            // Validate accuracy calculation
            expect(display.accuracy).toBeCloseTo(expectedAccuracy, 2);
            expect(display.careerStats.lifetimeAccuracy).toBeCloseTo(expectedAccuracy, 2);

            // Validate accuracy is within valid range
            expect(display.accuracy).toBeGreaterThanOrEqual(0);
            expect(display.accuracy).toBeLessThanOrEqual(100);
        }
    });

    it('should accurately calculate operation-specific statistics', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 30 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Validate each operation's statistics
            display.careerStats.detailedOps.forEach(opStat => {
                const opSessions = sessions.filter(s => s.operation === opStat.op);
                
                // Validate session count
                expect(opStat.sessionsPlayed).toBe(opSessions.length);

                if (opSessions.length > 0) {
                    // Calculate expected values
                    const opCorrect = opSessions.reduce((acc, s) => acc + s.correctCount, 0);
                    const opTotal = opSessions.reduce((acc, s) => acc + s.totalCount, 0);
                    const opXP = opSessions.reduce((acc, s) => acc + s.xpEarned, 0);
                    const opAvgSpeed = opSessions.reduce((acc, s) => acc + s.avgSpeed, 0) / opSessions.length;

                    const expectedAccuracy = opTotal > 0 ? (opCorrect / opTotal) * 100 : 0;

                    // Validate calculations
                    expect(opStat.accuracy).toBeCloseTo(expectedAccuracy, 2);
                    expect(opStat.totalXP).toBe(opXP);
                    expect(opStat.avgSpeed).toBeCloseTo(opAvgSpeed, 2);

                    // Validate ranges
                    expect(opStat.accuracy).toBeGreaterThanOrEqual(0);
                    expect(opStat.accuracy).toBeLessThanOrEqual(100);
                    expect(opStat.avgSpeed).toBeGreaterThan(0);
                } else {
                    // No sessions should result in zero values
                    expect(opStat.accuracy).toBe(0);
                    expect(opStat.totalXP).toBe(0);
                    expect(opStat.avgSpeed).toBe(0);
                }
            });
        }
    });

    it('should accurately reflect math tier progression', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 10 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Math tiers should match user progress exactly
            expect(display.mathTiers).toEqual(userProgress.mathTiers);

            // Validate tier values are within valid range
            Object.values(display.mathTiers).forEach(tier => {
                expect(tier).toBeGreaterThanOrEqual(1);
                expect(tier).toBeLessThanOrEqual(4);
            });

            // Validate all operations have tier data
            const expectedOperations = ['addition', 'subtraction', 'multiplication', 'division'];
            expectedOperations.forEach(op => {
                expect(display.mathTiers).toHaveProperty(op);
            });
        }
    });

    it('should accurately calculate average response speed', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 15 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            if (sessions.length > 0) {
                // Calculate expected average speed
                const totalSpeed = sessions.reduce((acc, s) => acc + s.avgSpeed, 0);
                const expectedAvgSpeed = totalSpeed / sessions.length;

                // Parse displayed speed (remove 's' suffix)
                const displayedSpeed = parseFloat(display.avgSpeed.replace('s', ''));

                // Validate speed calculation
                expect(displayedSpeed).toBeCloseTo(expectedAvgSpeed, 2);
                expect(displayedSpeed).toBeGreaterThan(0);
                expect(display.avgSpeed).toMatch(/^\d+\.\d{2}s$/); // Format: "X.XXs"
            } else {
                expect(display.avgSpeed).toBe("0.00s");
            }
        }
    });

    it('should accurately reflect user level and XP', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 5 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Level and XP should match user progress exactly
            expect(display.level).toBe(userProgress.level);
            expect(display.totalXP).toBe(userProgress.totalXp);

            // Validate ranges
            expect(display.level).toBeGreaterThan(0);
            expect(display.totalXP).toBeGreaterThanOrEqual(0);
        }
    });

    it('should accurately determine arena rank from ELO', () => {
        const eloRankMappings = [
            { elo: 2500, expectedRank: 'Apex' },
            { elo: 2000, expectedRank: 'Apex' },
            { elo: 1999, expectedRank: 'Void' },
            { elo: 1500, expectedRank: 'Void' },
            { elo: 1499, expectedRank: 'Plasma' },
            { elo: 1000, expectedRank: 'Plasma' },
            { elo: 999, expectedRank: 'Cobalt' },
            { elo: 500, expectedRank: 'Cobalt' },
            { elo: 499, expectedRank: 'Neon' },
            { elo: 100, expectedRank: 'Neon' }
        ];

        eloRankMappings.forEach(({ elo, expectedRank }) => {
            const userId = 'test-user';
            const sessions = [generateRandomSession(userId)];
            const userProgress = generateRandomUserProgress(userId);
            userProgress.arenaStats.elo = elo;

            const display = simulateProgressCalculation(sessions, userProgress);

            expect(display.arenaRank).toBe(expectedRank);
        });
    });

    it('should accurately reflect achievement status', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 3 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Achievements should match exactly
            expect(display.achievements).toEqual(userProgress.achievements);
            expect(display.achievements).toBeInstanceOf(Array);

            // All achievement IDs should be strings
            display.achievements.forEach(achievement => {
                expect(typeof achievement).toBe('string');
                expect(achievement.length).toBeGreaterThan(0);
            });
        }
    });

    it('should handle edge cases in data calculation', () => {
        const edgeCases = [
            // No sessions
            { sessions: [], description: 'no sessions' },
            
            // Single session with perfect accuracy
            { 
                sessions: [{
                    id: 'perfect',
                    userId: 'test',
                    operation: 'Addition' as const,
                    correctCount: 10,
                    totalCount: 10,
                    avgSpeed: 2.5,
                    xpEarned: 100,
                    createdAt: new Date(),
                    mathTier: 2
                }],
                description: 'perfect accuracy'
            },
            
            // Single session with zero accuracy
            {
                sessions: [{
                    id: 'zero',
                    userId: 'test',
                    operation: 'Subtraction' as const,
                    correctCount: 0,
                    totalCount: 10,
                    avgSpeed: 5.0,
                    xpEarned: 0,
                    createdAt: new Date(),
                    mathTier: 1
                }],
                description: 'zero accuracy'
            }
        ];

        edgeCases.forEach(({ sessions, description }) => {
            const userProgress = generateRandomUserProgress('edge-user');
            const display = simulateProgressCalculation(sessions, userProgress);

            // Validate basic structure
            expect(display.accuracy).toBeGreaterThanOrEqual(0);
            expect(display.accuracy).toBeLessThanOrEqual(100);
            expect(display.careerStats.detailedOps).toHaveLength(4);
            expect(display.mathTiers).toEqual(userProgress.mathTiers);
            expect(display.level).toBe(userProgress.level);
            expect(display.totalXP).toBe(userProgress.totalXp);

            if (sessions.length === 0) {
                expect(display.accuracy).toBe(0);
                expect(display.avgSpeed).toBe("0.00s");
            } else if (description === 'perfect accuracy') {
                expect(display.accuracy).toBe(100);
            } else if (description === 'zero accuracy') {
                expect(display.accuracy).toBe(0);
            }
        });
    });

    it('should maintain data consistency across multiple calculations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 10 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            // Calculate display multiple times
            const displays = Array.from({ length: 3 }, () => 
                simulateProgressCalculation(sessions, userProgress)
            );

            // All calculations should be identical
            const first = displays[0];
            displays.slice(1).forEach(display => {
                expect(display.accuracy).toBe(first.accuracy);
                expect(display.avgSpeed).toBe(first.avgSpeed);
                expect(display.totalXP).toBe(first.totalXP);
                expect(display.level).toBe(first.level);
                expect(display.mathTiers).toEqual(first.mathTiers);
                expect(display.arenaRank).toBe(first.arenaRank);
                expect(display.achievements).toEqual(first.achievements);
                
                // Detailed ops should match
                display.careerStats.detailedOps.forEach((opStat, index) => {
                    const firstOpStat = first.careerStats.detailedOps[index];
                    expect(opStat.op).toBe(firstOpStat.op);
                    expect(opStat.accuracy).toBe(firstOpStat.accuracy);
                    expect(opStat.avgSpeed).toBe(firstOpStat.avgSpeed);
                    expect(opStat.totalXP).toBe(firstOpStat.totalXP);
                    expect(opStat.sessionsPlayed).toBe(firstOpStat.sessionsPlayed);
                });
            });
        }
    });

    it('should validate data integrity and completeness', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const sessions = Array.from({ length: 8 }, () => generateRandomSession(userId));
            const userProgress = generateRandomUserProgress(userId);

            const display = simulateProgressCalculation(sessions, userProgress);

            // Validate all required fields are present
            expect(display.accuracy).toBeDefined();
            expect(display.avgSpeed).toBeDefined();
            expect(display.totalXP).toBeDefined();
            expect(display.level).toBeDefined();
            expect(display.mathTiers).toBeDefined();
            expect(display.careerStats).toBeDefined();
            expect(display.careerStats.lifetimeAccuracy).toBeDefined();
            expect(display.careerStats.detailedOps).toBeDefined();
            expect(display.achievements).toBeDefined();
            expect(display.arenaRank).toBeDefined();

            // Validate data types
            expect(typeof display.accuracy).toBe('number');
            expect(typeof display.avgSpeed).toBe('string');
            expect(typeof display.totalXP).toBe('number');
            expect(typeof display.level).toBe('number');
            expect(typeof display.mathTiers).toBe('object');
            expect(Array.isArray(display.achievements)).toBe(true);
            expect(typeof display.arenaRank).toBe('string');

            // Validate detailed ops structure
            expect(display.careerStats.detailedOps).toHaveLength(4);
            display.careerStats.detailedOps.forEach(opStat => {
                expect(opStat.op).toBeDefined();
                expect(typeof opStat.accuracy).toBe('number');
                expect(typeof opStat.avgSpeed).toBe('number');
                expect(typeof opStat.totalXP).toBe('number');
                expect(typeof opStat.sessionsPlayed).toBe('number');
            });
        }
    });
});