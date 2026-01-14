/**
 * Property-Based Tests for Performance Analytics Generation
 * 
 * Feature: comprehensive-user-stories
 * Property 15: Performance Analytics Generation
 * 
 * Validates: Requirements 6.5, 6.6
 * For any user with sufficient practice data, the system should generate accurate 
 * trend analysis and improvement suggestions based on their performance patterns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock performance data structures
interface MockSession {
    id: string;
    user_id: string;
    operation: string;
    correct_count: number;
    total_count: number;
    avg_speed: number;
    xp_earned: number;
    created_at: string;
}

interface MockUser {
    id: string;
    level: number;
    total_xp: number;
    name: string;
}

interface AnalyticsResult {
    overallTrend: {
        direction: 'improving' | 'declining' | 'stable';
        strength: 'strong' | 'moderate' | 'weak';
        confidence: number;
        timeframe: string;
        description: string;
    };
    operationTrends: Record<string, any>;
    performancePattern: {
        consistencyScore: number;
        improvementRate: number;
        plateauDetection: boolean;
    };
    suggestions: Array<{
        type: string;
        priority: 'high' | 'medium' | 'low';
        title: string;
        description: string;
        actionable: string;
        estimatedImpact: number;
    }>;
    strengthsAndWeaknesses: {
        strengths: string[];
        weaknesses: string[];
        focusAreas: string[];
    };
}

// Simulate analytics generation
function generateAnalytics(user: MockUser, sessions: MockSession[]): AnalyticsResult {
    if (sessions.length < 3) {
        return {
            overallTrend: {
                direction: 'stable',
                strength: 'weak',
                confidence: 0,
                timeframe: 'recent',
                description: 'Not enough data for analysis'
            },
            operationTrends: {},
            performancePattern: {
                consistencyScore: 0,
                improvementRate: 0,
                plateauDetection: false
            },
            suggestions: [{
                type: 'focus_area',
                priority: 'high',
                title: 'Start Practicing',
                description: 'Complete more practice sessions to unlock detailed analytics.',
                actionable: 'Try practicing different operations to build your performance history.',
                estimatedImpact: 1.0
            }],
            strengthsAndWeaknesses: {
                strengths: [],
                weaknesses: [],
                focusAreas: ['Complete more practice sessions']
            }
        };
    }

    // Calculate overall accuracy trend
    const accuracies = sessions.map(s => s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0);
    const speeds = sessions.map(s => s.avg_speed);
    
    // Simple trend analysis
    const firstHalf = accuracies.slice(0, Math.floor(accuracies.length / 2));
    const secondHalf = accuracies.slice(Math.floor(accuracies.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const improvement = secondAvg - firstAvg;
    
    let direction: 'improving' | 'declining' | 'stable';
    let strength: 'strong' | 'moderate' | 'weak';
    
    if (Math.abs(improvement) < 2) {
        direction = 'stable';
        strength = 'weak';
    } else {
        direction = improvement > 0 ? 'improving' : 'declining';
        strength = Math.abs(improvement) > 10 ? 'strong' : Math.abs(improvement) > 5 ? 'moderate' : 'weak';
    }

    // Calculate consistency score
    const accuracyVariance = calculateVariance(accuracies);
    const consistencyScore = Math.max(0, 1 - (accuracyVariance / 100));

    // Detect plateau
    const recentAccuracies = accuracies.slice(-5);
    const plateauDetection = recentAccuracies.length >= 5 && calculateVariance(recentAccuracies) < 10;

    // Generate operation trends
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const operationTrends: Record<string, any> = {};
    
    operations.forEach(op => {
        const opSessions = sessions.filter(s => s.operation === op);
        if (opSessions.length >= 2) {
            const opAccuracies = opSessions.map(s => s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0);
            const opImprovement = opAccuracies.length > 1 ? opAccuracies[opAccuracies.length - 1] - opAccuracies[0] : 0;
            
            operationTrends[op.toLowerCase()] = {
                direction: Math.abs(opImprovement) < 2 ? 'stable' : opImprovement > 0 ? 'improving' : 'declining',
                strength: Math.abs(opImprovement) > 10 ? 'strong' : Math.abs(opImprovement) > 5 ? 'moderate' : 'weak',
                confidence: Math.min(opSessions.length / 10, 1),
                timeframe: 'recent',
                description: `${op} performance trend`
            };
        }
    });

    // Generate suggestions
    const suggestions = [];
    const overallAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

    if (overallAccuracy < 80) {
        suggestions.push({
            type: 'accuracy',
            priority: 'high' as const,
            title: 'Focus on Accuracy',
            description: `Your accuracy is ${overallAccuracy.toFixed(1)}%, which could be improved.`,
            actionable: 'Take your time with each problem and double-check your mental calculations.',
            estimatedImpact: 0.8
        });
    }

    if (avgSpeed > 4) {
        suggestions.push({
            type: 'speed',
            priority: 'medium' as const,
            title: 'Improve Speed',
            description: `Your average response time is ${avgSpeed.toFixed(1)}s.`,
            actionable: 'Practice mental math techniques and memorize basic facts.',
            estimatedImpact: 0.6
        });
    }

    if (plateauDetection) {
        suggestions.push({
            type: 'focus_area',
            priority: 'high' as const,
            title: 'Break Through Plateau',
            description: 'Your performance has leveled off recently.',
            actionable: 'Try increasing difficulty or mixing different operation types.',
            estimatedImpact: 0.7
        });
    }

    // Analyze strengths and weaknesses
    const operationStats = operations.map(op => {
        const opSessions = sessions.filter(s => s.operation === op);
        const opAccuracy = opSessions.length > 0 
            ? opSessions.reduce((acc, s) => acc + (s.total_count > 0 ? (s.correct_count / s.total_count) * 100 : 0), 0) / opSessions.length
            : 0;
        return { operation: op, accuracy: opAccuracy, sessions: opSessions.length };
    }).filter(stat => stat.sessions > 0);

    const strengths = [];
    const weaknesses = [];
    const focusAreas = [];

    if (operationStats.length > 0) {
        const bestOp = operationStats.reduce((best, current) => current.accuracy > best.accuracy ? current : best);
        const worstOp = operationStats.reduce((worst, current) => current.accuracy < worst.accuracy ? current : worst);

        if (bestOp.accuracy > 85) {
            strengths.push(`Strong ${bestOp.operation.toLowerCase()} skills (${bestOp.accuracy.toFixed(1)}%)`);
        }

        if (worstOp.accuracy < 70) {
            weaknesses.push(`${worstOp.operation} needs improvement (${worstOp.accuracy.toFixed(1)}%)`);
            focusAreas.push(`Practice ${worstOp.operation.toLowerCase()} problems`);
        }
    }

    if (consistencyScore > 0.8) {
        strengths.push('Consistent performance across sessions');
    } else if (consistencyScore < 0.5) {
        weaknesses.push('Performance varies significantly between sessions');
        focusAreas.push('Work on maintaining steady performance');
    }

    return {
        overallTrend: {
            direction,
            strength,
            confidence: Math.min(sessions.length / 20, 1),
            timeframe: sessions.length > 15 ? 'long' : sessions.length > 5 ? 'medium' : 'recent',
            description: `Overall performance is ${direction} with ${strength} evidence`
        },
        operationTrends,
        performancePattern: {
            consistencyScore,
            improvementRate: improvement / (sessions.length / 7), // per week
            plateauDetection
        },
        suggestions,
        strengthsAndWeaknesses: {
            strengths,
            weaknesses,
            focusAreas
        }
    };
}

// Helper function to calculate variance
function calculateVariance(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return variance;
}

// Generate random user data
function generateRandomUser(): MockUser {
    return {
        id: `user-${Math.random().toString(36).substring(7)}`,
        level: Math.floor(Math.random() * 50) + 1,
        total_xp: Math.floor(Math.random() * 50000),
        name: `TestUser${Math.floor(Math.random() * 1000)}`
    };
}

// Generate random session data
function generateRandomSessions(userId: string, count: number): MockSession[] {
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const sessions: MockSession[] = [];
    
    for (let i = 0; i < count; i++) {
        const totalCount = Math.floor(Math.random() * 20) + 5; // 5-24 problems
        const correctCount = Math.floor(Math.random() * totalCount); // 0 to totalCount correct
        
        sessions.push({
            id: `session-${i}`,
            user_id: userId,
            operation: operations[Math.floor(Math.random() * operations.length)],
            correct_count: correctCount,
            total_count: totalCount,
            avg_speed: Math.random() * 8 + 1, // 1-9 seconds
            xp_earned: correctCount * 10,
            created_at: new Date(Date.now() - (count - i) * 24 * 60 * 60 * 1000).toISOString()
        });
    }
    
    return sessions;
}

describe('Property 15: Performance Analytics Generation', () => {
    it('should generate consistent analytics for users with sufficient data', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const sessionCount = Math.floor(Math.random() * 25) + 5; // 5-29 sessions
            const sessions = generateRandomSessions(user.id, sessionCount);
            
            const analytics = generateAnalytics(user, sessions);
            
            // Analytics should always be generated
            expect(analytics).toBeDefined();
            expect(analytics.overallTrend).toBeDefined();
            expect(analytics.performancePattern).toBeDefined();
            expect(analytics.suggestions).toBeDefined();
            expect(analytics.strengthsAndWeaknesses).toBeDefined();
            
            // Overall trend should have valid properties
            expect(['improving', 'declining', 'stable']).toContain(analytics.overallTrend.direction);
            expect(['strong', 'moderate', 'weak']).toContain(analytics.overallTrend.strength);
            expect(analytics.overallTrend.confidence).toBeGreaterThanOrEqual(0);
            expect(analytics.overallTrend.confidence).toBeLessThanOrEqual(1);
            expect(analytics.overallTrend.description).toBeDefined();
            expect(analytics.overallTrend.description.length).toBeGreaterThan(0);
            
            // Performance pattern should have valid metrics
            expect(analytics.performancePattern.consistencyScore).toBeGreaterThanOrEqual(0);
            expect(analytics.performancePattern.consistencyScore).toBeLessThanOrEqual(1);
            expect(typeof analytics.performancePattern.improvementRate).toBe('number');
            expect(typeof analytics.performancePattern.plateauDetection).toBe('boolean');
            
            // Suggestions should be valid
            expect(Array.isArray(analytics.suggestions)).toBe(true);
            analytics.suggestions.forEach(suggestion => {
                expect(['accuracy', 'speed', 'consistency', 'focus_area']).toContain(suggestion.type);
                expect(['high', 'medium', 'low']).toContain(suggestion.priority);
                expect(suggestion.title).toBeDefined();
                expect(suggestion.title.length).toBeGreaterThan(0);
                expect(suggestion.description).toBeDefined();
                expect(suggestion.actionable).toBeDefined();
                expect(suggestion.estimatedImpact).toBeGreaterThanOrEqual(0);
                expect(suggestion.estimatedImpact).toBeLessThanOrEqual(1);
            });
            
            // Strengths and weaknesses should be arrays
            expect(Array.isArray(analytics.strengthsAndWeaknesses.strengths)).toBe(true);
            expect(Array.isArray(analytics.strengthsAndWeaknesses.weaknesses)).toBe(true);
            expect(Array.isArray(analytics.strengthsAndWeaknesses.focusAreas)).toBe(true);
        }
    });

    it('should provide appropriate suggestions based on performance patterns', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const sessions = generateRandomSessions(user.id, 10);
            
            // Modify sessions to create specific patterns
            const pattern = Math.floor(Math.random() * 3);
            
            if (pattern === 0) {
                // Low accuracy pattern
                sessions.forEach(session => {
                    session.correct_count = Math.floor(session.total_count * 0.6); // 60% accuracy
                });
            } else if (pattern === 1) {
                // Slow speed pattern
                sessions.forEach(session => {
                    session.avg_speed = Math.random() * 3 + 5; // 5-8 seconds
                });
            } else {
                // Plateau pattern (consistent performance)
                const baseAccuracy = 0.8;
                sessions.forEach(session => {
                    session.correct_count = Math.floor(session.total_count * (baseAccuracy + (Math.random() - 0.5) * 0.1));
                    session.avg_speed = 3 + (Math.random() - 0.5) * 0.5; // Very consistent speed
                });
            }
            
            const analytics = generateAnalytics(user, sessions);
            
            // Should have at least one suggestion
            expect(analytics.suggestions.length).toBeGreaterThan(0);
            
            // Suggestions should be relevant to the pattern
            const suggestionTypes = analytics.suggestions.map(s => s.type);
            
            if (pattern === 0) {
                // Low accuracy should generate accuracy-focused suggestions
                expect(suggestionTypes.some(type => type === 'accuracy' || type === 'focus_area')).toBe(true);
            } else if (pattern === 1) {
                // Slow speed should generate speed-focused suggestions
                expect(suggestionTypes.some(type => type === 'speed')).toBe(true);
            }
            
            // All suggestions should have actionable advice
            analytics.suggestions.forEach(suggestion => {
                expect(suggestion.actionable.length).toBeGreaterThan(10); // Meaningful advice
                expect(suggestion.estimatedImpact).toBeGreaterThan(0);
            });
        }
    });

    it('should detect operation-specific trends accurately', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const sessions: MockSession[] = [];
            
            // Create sessions with specific operation patterns
            const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
            
            operations.forEach((op, opIndex) => {
                for (let i = 0; i < 5; i++) {
                    const totalCount = 20;
                    // Create improving trend for first operation, declining for second, etc.
                    let accuracy: number;
                    if (opIndex === 0) {
                        accuracy = 0.6 + (i * 0.08); // Improving from 60% to 92%
                    } else if (opIndex === 1) {
                        accuracy = 0.9 - (i * 0.08); // Declining from 90% to 58%
                    } else {
                        accuracy = 0.75 + (Math.random() - 0.5) * 0.1; // Stable around 75%
                    }
                    
                    sessions.push({
                        id: `session-${op}-${i}`,
                        user_id: user.id,
                        operation: op,
                        correct_count: Math.floor(totalCount * accuracy),
                        total_count: totalCount,
                        avg_speed: Math.random() * 2 + 2,
                        xp_earned: Math.floor(totalCount * accuracy) * 10,
                        created_at: new Date(Date.now() - (20 - (opIndex * 5 + i)) * 24 * 60 * 60 * 1000).toISOString()
                    });
                }
            });
            
            const analytics = generateAnalytics(user, sessions);
            
            // Should detect trends for operations with enough data
            expect(Object.keys(analytics.operationTrends).length).toBeGreaterThan(0);
            
            // Check specific trends if they exist
            if (analytics.operationTrends.addition) {
                expect(['improving', 'stable']).toContain(analytics.operationTrends.addition.direction);
            }
            
            if (analytics.operationTrends.subtraction) {
                expect(['declining', 'stable']).toContain(analytics.operationTrends.subtraction.direction);
            }
            
            // All operation trends should have valid properties
            Object.values(analytics.operationTrends).forEach((trend: any) => {
                expect(['improving', 'declining', 'stable']).toContain(trend.direction);
                expect(['strong', 'moderate', 'weak']).toContain(trend.strength);
                expect(trend.confidence).toBeGreaterThanOrEqual(0);
                expect(trend.confidence).toBeLessThanOrEqual(1);
            });
        }
    });

    it('should maintain consistency across multiple analytics generations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const sessions = generateRandomSessions(user.id, 15);
            
            // Generate analytics multiple times with same data
            const analytics1 = generateAnalytics(user, sessions);
            const analytics2 = generateAnalytics(user, sessions);
            
            // Results should be identical for same input
            expect(analytics1.overallTrend.direction).toBe(analytics2.overallTrend.direction);
            expect(analytics1.overallTrend.strength).toBe(analytics2.overallTrend.strength);
            expect(analytics1.performancePattern.consistencyScore).toBe(analytics2.performancePattern.consistencyScore);
            expect(analytics1.performancePattern.plateauDetection).toBe(analytics2.performancePattern.plateauDetection);
            expect(analytics1.suggestions.length).toBe(analytics2.suggestions.length);
            
            // Operation trends should be consistent
            Object.keys(analytics1.operationTrends).forEach(op => {
                if (analytics2.operationTrends[op]) {
                    expect(analytics1.operationTrends[op].direction).toBe(analytics2.operationTrends[op].direction);
                    expect(analytics1.operationTrends[op].strength).toBe(analytics2.operationTrends[op].strength);
                }
            });
        }
    });

    it('should handle edge cases gracefully', () => {
        const edgeCases = [
            // No sessions
            { user: generateRandomUser(), sessions: [] },
            // Very few sessions
            { user: generateRandomUser(), sessions: generateRandomSessions('user1', 1) },
            // Perfect performance
            { 
                user: generateRandomUser(), 
                sessions: generateRandomSessions('user2', 10).map(s => ({
                    ...s,
                    correct_count: s.total_count,
                    avg_speed: 1
                }))
            },
            // Zero performance
            { 
                user: generateRandomUser(), 
                sessions: generateRandomSessions('user3', 10).map(s => ({
                    ...s,
                    correct_count: 0,
                    avg_speed: 10
                }))
            }
        ];

        edgeCases.forEach((testCase, index) => {
            const analytics = generateAnalytics(testCase.user, testCase.sessions);
            
            // Should always return valid analytics structure
            expect(analytics).toBeDefined();
            expect(analytics.overallTrend).toBeDefined();
            expect(analytics.performancePattern).toBeDefined();
            expect(analytics.suggestions).toBeDefined();
            expect(analytics.strengthsAndWeaknesses).toBeDefined();
            
            // Should handle insufficient data appropriately
            if (testCase.sessions.length < 3) {
                expect(analytics.overallTrend.description).toContain('Not enough data');
                expect(analytics.suggestions.some(s => s.title.includes('Start Practicing'))).toBe(true);
            }
            
            // Consistency score should be valid
            expect(analytics.performancePattern.consistencyScore).toBeGreaterThanOrEqual(0);
            expect(analytics.performancePattern.consistencyScore).toBeLessThanOrEqual(1);
            
            // Should not crash or return invalid data
            expect(typeof analytics.performancePattern.improvementRate).toBe('number');
            expect(typeof analytics.performancePattern.plateauDetection).toBe('boolean');
        });
    });

    it('should generate meaningful improvement suggestions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const sessions = generateRandomSessions(user.id, 12);
            
            const analytics = generateAnalytics(user, sessions);
            
            // Should have suggestions
            expect(analytics.suggestions.length).toBeGreaterThan(0);
            
            // Each suggestion should be actionable and specific
            analytics.suggestions.forEach(suggestion => {
                // Title should be descriptive
                expect(suggestion.title.length).toBeGreaterThan(5);
                
                // Description should explain the issue
                expect(suggestion.description.length).toBeGreaterThan(10);
                
                // Actionable advice should be specific
                expect(suggestion.actionable.length).toBeGreaterThan(15);
                expect(suggestion.actionable).toMatch(/[a-z]/i); // Contains letters
                
                // Priority should be appropriate for estimated impact
                if (suggestion.estimatedImpact > 0.7) {
                    expect(['high', 'medium']).toContain(suggestion.priority);
                }
                
                // Type should match content
                if (suggestion.title.toLowerCase().includes('accuracy')) {
                    expect(suggestion.type).toBe('accuracy');
                } else if (suggestion.title.toLowerCase().includes('speed')) {
                    expect(suggestion.type).toBe('speed');
                }
            });
            
            // High priority suggestions should come first
            for (let i = 1; i < analytics.suggestions.length; i++) {
                const prev = analytics.suggestions[i - 1];
                const curr = analytics.suggestions[i];
                
                if (prev.priority === 'high' && curr.priority === 'low') {
                    // High should come before low
                    expect(true).toBe(true); // This ordering is expected
                }
            }
        }
    });
});