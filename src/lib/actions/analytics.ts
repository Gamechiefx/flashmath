"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { auth } from "@/auth";
import { loadData, queryOne } from "@/lib/db";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface TrendAnalysis {
    direction: 'improving' | 'declining' | 'stable';
    strength: 'strong' | 'moderate' | 'weak';
    confidence: number; // 0-1
    timeframe: 'recent' | 'medium' | 'long';
    description: string;
}

export interface PerformanceMetrics {
    accuracy: number;
    speed: number; // in seconds
    consistency: number; // variance measure
    streak: number;
    timestamp: Date;
}

export interface ImprovementSuggestion {
    type: 'accuracy' | 'speed' | 'consistency' | 'focus_area';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionable: string;
    operation?: string;
    estimatedImpact: number; // 0-1
}

export interface AdvancedAnalytics {
    overallTrend: TrendAnalysis;
    operationTrends: Record<string, TrendAnalysis>;
    performancePattern: {
        bestTimeOfDay?: string;
        consistencyScore: number;
        improvementRate: number; // per week
        plateauDetection: boolean;
    };
    suggestions: ImprovementSuggestion[];
    strengthsAndWeaknesses: {
        strengths: string[];
        weaknesses: string[];
        focusAreas: string[];
    };
}

// =============================================================================
// TREND ANALYSIS ALGORITHMS
// =============================================================================

/**
 * Calculate linear regression for trend analysis
 */
function calculateLinearRegression(data: { x: number; y: number }[]): {
    slope: number;
    intercept: number;
    rSquared: number;
} {
    if (data.length < 2) {
        return { slope: 0, intercept: 0, rSquared: 0 };
    }

    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- sumYY calculated but not used in regression
    const _sumYY = data.reduce((sum, point) => sum + point.y * point.y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const totalSumSquares = data.reduce((sum, point) => sum + Math.pow(point.y - meanY, 2), 0);
    const residualSumSquares = data.reduce((sum, point) => {
        const predicted = slope * point.x + intercept;
        return sum + Math.pow(point.y - predicted, 2);
    }, 0);
    
    const rSquared = totalSumSquares > 0 ? 1 - (residualSumSquares / totalSumSquares) : 0;

    return { slope, intercept, rSquared };
}

/**
 * Analyze trend from performance data
 */
function analyzeTrend(metrics: PerformanceMetrics[], metric: 'accuracy' | 'speed'): TrendAnalysis {
    if (metrics.length < 3) {
        return {
            direction: 'stable',
            strength: 'weak',
            confidence: 0,
            timeframe: 'recent',
            description: 'Insufficient data for trend analysis'
        };
    }

    // Prepare data for regression (x = time index, y = metric value)
    const data = metrics.map((m, index) => ({
        x: index,
        y: metric === 'speed' ? 1 / m.speed : m.accuracy // For speed, use inverse (faster = better)
    }));

    const regression = calculateLinearRegression(data);
    const { slope, rSquared } = regression;

    // Determine direction and strength
    const absSlope = Math.abs(slope);
    let direction: 'improving' | 'declining' | 'stable';
    let strength: 'strong' | 'moderate' | 'weak';

    // Thresholds for different metrics
    const thresholds = metric === 'accuracy' 
        ? { weak: 0.5, moderate: 2, strong: 5 } // percentage points per session
        : { weak: 0.01, moderate: 0.05, strong: 0.1 }; // inverse seconds per session

    if (absSlope < thresholds.weak) {
        direction = 'stable';
        strength = 'weak';
    } else {
        direction = slope > 0 ? 'improving' : 'declining';
        if (absSlope >= thresholds.strong) {
            strength = 'strong';
        } else if (absSlope >= thresholds.moderate) {
            strength = 'moderate';
        } else {
            strength = 'weak';
        }
    }

    // Confidence based on R-squared and data points
    const dataConfidence = Math.min(metrics.length / 10, 1); // More data = more confidence
    const confidence = rSquared * dataConfidence;

    // Determine timeframe
    const timeframe = metrics.length <= 5 ? 'recent' : metrics.length <= 15 ? 'medium' : 'long';

    // Generate description
    let description = '';
    if (direction === 'stable') {
        description = `${metric === 'accuracy' ? 'Accuracy' : 'Speed'} has remained consistent`;
    } else {
        const metricName = metric === 'accuracy' ? 'accuracy' : 'response time';
        const changeDirection = direction === 'improving' ? 'improving' : 'declining';
        description = `${metricName.charAt(0).toUpperCase() + metricName.slice(1)} is ${changeDirection} with ${strength} ${strength === 'weak' ? 'signs' : 'evidence'}`;
    }

    return {
        direction,
        strength,
        confidence,
        timeframe,
        description
    };
}

/**
 * Detect performance plateaus
 */
function detectPlateau(metrics: PerformanceMetrics[]): boolean {
    if (metrics.length < 10) return false;

    // Look at recent 10 sessions
    const recent = metrics.slice(-10);
    const accuracyVariance = calculateVariance(recent.map(m => m.accuracy));
    const speedVariance = calculateVariance(recent.map(m => m.speed));

    // Low variance in both accuracy and speed suggests plateau
    return accuracyVariance < 25 && speedVariance < 0.5; // Thresholds for plateau detection
}

/**
 * Calculate variance of a dataset
 */
function calculateVariance(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return variance;
}

/**
 * Calculate improvement rate (per week)
 */
function calculateImprovementRate(metrics: PerformanceMetrics[]): number {
    if (metrics.length < 2) return 0;

    const firstWeek = metrics.slice(0, Math.min(7, metrics.length));
    const lastWeek = metrics.slice(-Math.min(7, metrics.length));

    const firstAvgAccuracy = firstWeek.reduce((sum, m) => sum + m.accuracy, 0) / firstWeek.length;
    const lastAvgAccuracy = lastWeek.reduce((sum, m) => sum + m.accuracy, 0) / lastWeek.length;

    const weeksSpanned = Math.max(1, metrics.length / 7);
    return (lastAvgAccuracy - firstAvgAccuracy) / weeksSpanned;
}

// =============================================================================
// SUGGESTION GENERATION
// =============================================================================

/**
 * Generate personalized improvement suggestions
 */
function generateSuggestions(
    overallTrend: TrendAnalysis,
    operationTrends: Record<string, TrendAnalysis>,
    userStats: any,
    performancePattern: any
): ImprovementSuggestion[] {
    const suggestions: ImprovementSuggestion[] = [];

    // Analyze weakest operation
    const operations = ['addition', 'subtraction', 'multiplication', 'division'];
    let weakestOp = '';
    let lowestAccuracy = 100;

    operations.forEach(op => {
        const opStats = userStats.careerStats?.detailedOps?.find((d: any) => 
            d.op.toLowerCase() === op
        );
        if (opStats && opStats.accuracy < lowestAccuracy && opStats.sessionsPlayed > 0) {
            lowestAccuracy = opStats.accuracy;
            weakestOp = op;
        }
    });

    // Suggestion 1: Focus on weakest operation
    if (weakestOp && lowestAccuracy < 80) {
        suggestions.push({
            type: 'focus_area',
            priority: 'high',
            title: `Focus on ${weakestOp.charAt(0).toUpperCase() + weakestOp.slice(1)}`,
            description: `Your ${weakestOp} accuracy is ${lowestAccuracy.toFixed(1)}%, which is below your other operations.`,
            actionable: `Spend 10-15 minutes daily practicing ${weakestOp} problems at your current tier level.`,
            operation: weakestOp,
            estimatedImpact: 0.8
        });
    }

    // Suggestion 2: Speed improvement
    const avgSpeed = parseFloat(userStats.avgSpeed?.replace('s', '') || '0');
    if (avgSpeed > 4) {
        suggestions.push({
            type: 'speed',
            priority: 'medium',
            title: 'Improve Response Speed',
            description: `Your average response time is ${avgSpeed.toFixed(1)}s. Faster responses can boost your arena performance.`,
            actionable: 'Practice mental math techniques like the "doubles plus one" method for addition or memorize multiplication tables.',
            estimatedImpact: 0.6
        });
    }

    // Suggestion 3: Consistency improvement
    if (performancePattern.consistencyScore < 0.7) {
        suggestions.push({
            type: 'consistency',
            priority: 'medium',
            title: 'Build Consistency',
            description: 'Your performance varies significantly between sessions.',
            actionable: 'Try to practice at the same time each day and maintain a steady pace during sessions.',
            estimatedImpact: 0.5
        });
    }

    // Suggestion 4: Plateau breaking
    if (performancePattern.plateauDetection) {
        suggestions.push({
            type: 'accuracy',
            priority: 'high',
            title: 'Break Through Your Plateau',
            description: 'Your progress has leveled off recently.',
            actionable: 'Try increasing your math tier or mixing different operation types to challenge yourself.',
            estimatedImpact: 0.7
        });
    }

    // Suggestion 5: Arena participation
    const arenaStats = userStats.arenaStats;
    if (!arenaStats || (arenaStats.duel?.wins || 0) < 5) {
        suggestions.push({
            type: 'focus_area',
            priority: 'low',
            title: 'Try Arena Competition',
            description: 'Competitive play can accelerate your improvement through real-time pressure.',
            actionable: 'Join the arena queue for 1v1 matches to test your skills against other players.',
            estimatedImpact: 0.4
        });
    }

    return suggestions.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
}

// =============================================================================
// MAIN ANALYTICS FUNCTION
// =============================================================================

/**
 * Get advanced analytics and trend analysis for the current user
 */
export async function getAdvancedAnalytics(): Promise<AdvancedAnalytics | null> {
    const session = await auth();
    if (!session?.user) return null;
    
    const userId = (session.user as { id: string }).id;
    if (!userId) return null;

    const db = loadData();
    
    // Get user sessions (last 30 for trend analysis)
    interface SessionRow {
        user_id: string;
        created_at: string;
        [key: string]: unknown;
    }
    const userSessions = (db.sessions as SessionRow[])
        .filter((s: SessionRow) => s.user_id === userId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(-30);

    if (userSessions.length < 3) {
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

    // Convert sessions to performance metrics
    const performanceMetrics: PerformanceMetrics[] = userSessions.map(session => ({
        accuracy: session.total_count > 0 ? (session.correct_count / session.total_count) * 100 : 0,
        speed: session.avg_speed || 5,
        consistency: 1, // Will be calculated separately
        streak: session.correct_count || 0,
        timestamp: new Date(session.created_at)
    }));

    // Calculate overall trends
    const overallTrend = analyzeTrend(performanceMetrics, 'accuracy');
    
    // Calculate operation-specific trends
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const operationTrends: Record<string, TrendAnalysis> = {};
    
    operations.forEach(op => {
        const opSessions = userSessions.filter(s => s.operation === op);
        if (opSessions.length >= 3) {
            const opMetrics = opSessions.map(session => ({
                accuracy: session.total_count > 0 ? (session.correct_count / session.total_count) * 100 : 0,
                speed: session.avg_speed || 5,
                consistency: 1,
                streak: session.correct_count || 0,
                timestamp: new Date(session.created_at)
            }));
            operationTrends[op.toLowerCase()] = analyzeTrend(opMetrics, 'accuracy');
        }
    });

    // Calculate performance patterns
    const consistencyScore = 1 - (calculateVariance(performanceMetrics.map(m => m.accuracy)) / 100);
    const improvementRate = calculateImprovementRate(performanceMetrics);
    const plateauDetection = detectPlateau(performanceMetrics);

    const performancePattern = {
        consistencyScore: Math.max(0, Math.min(1, consistencyScore)),
        improvementRate,
        plateauDetection
    };

    // Get user stats for suggestion generation
    const userStats = await getUserStatsForAnalytics(userId);
    
    // Generate suggestions
    const suggestions = generateSuggestions(overallTrend, operationTrends, userStats, performancePattern);

    // Analyze strengths and weaknesses
    const strengthsAndWeaknesses = analyzeStrengthsAndWeaknesses(userStats, operationTrends);

    return {
        overallTrend,
        operationTrends,
        performancePattern,
        suggestions,
        strengthsAndWeaknesses
    };
}

/**
 * Helper function to get user stats for analytics
 */
async function getUserStatsForAnalytics(userId: string) {
    const db = loadData();
    interface SessionRow {
        user_id: string;
        [key: string]: unknown;
    }
    const userSessions = (db.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId);
    
    const operations = ['Addition', 'Subtraction', 'Multiplication', 'Division'];
    const detailedOps = operations.map(op => {
        const opSessions = userSessions.filter((s: any) => s.operation === op);
        const opCorrect = opSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
        const opTotal = opSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
        const opXP = opSessions.reduce((acc: number, s: any) => acc + (s.xp_earned || 0), 0);
        const opAvgSpeed = opSessions.length > 0
            ? opSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / opSessions.length
            : 0;

        return {
            op,
            accuracy: opTotal > 0 ? (opCorrect / opTotal) * 100 : 0,
            avgSpeed: opAvgSpeed,
            totalXP: opXP,
            sessionsPlayed: opSessions.length
        };
    });

    const totalCorrect = userSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / userSessions.length
        : 0;

    return {
        avgSpeed: avgSpeed.toFixed(2) + "s",
        careerStats: {
            detailedOps
        },
        arenaStats: null // Will be populated if needed
    };
}

/**
 * Analyze user's strengths and weaknesses
 */
function analyzeStrengthsAndWeaknesses(userStats: any, operationTrends: Record<string, TrendAnalysis>) {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const focusAreas: string[] = [];

    const operations = userStats.careerStats?.detailedOps || [];
    
    // Find best and worst operations
    const playedOps = operations.filter((op: any) => op.sessionsPlayed > 0);
    if (playedOps.length > 0) {
        const sortedByAccuracy = [...playedOps].sort((a, b) => b.accuracy - a.accuracy);
        const sortedBySpeed = [...playedOps].sort((a, b) => a.avgSpeed - b.avgSpeed);

        // Strengths
        if (sortedByAccuracy[0]?.accuracy > 85) {
            strengths.push(`Excellent ${sortedByAccuracy[0].op.toLowerCase()} accuracy (${sortedByAccuracy[0].accuracy.toFixed(1)}%)`);
        }
        if (sortedBySpeed[0]?.avgSpeed < 3) {
            strengths.push(`Fast ${sortedBySpeed[0].op.toLowerCase()} responses (${sortedBySpeed[0].avgSpeed.toFixed(1)}s avg)`);
        }

        // Weaknesses
        if (sortedByAccuracy[sortedByAccuracy.length - 1]?.accuracy < 70) {
            const weakOp = sortedByAccuracy[sortedByAccuracy.length - 1];
            weaknesses.push(`${weakOp.op} accuracy needs improvement (${weakOp.accuracy.toFixed(1)}%)`);
            focusAreas.push(`Practice ${weakOp.op.toLowerCase()} problems`);
        }
        if (sortedBySpeed[sortedBySpeed.length - 1]?.avgSpeed > 5) {
            const slowOp = sortedBySpeed[sortedBySpeed.length - 1];
            weaknesses.push(`${slowOp.op} response time is slow (${slowOp.avgSpeed.toFixed(1)}s avg)`);
            focusAreas.push(`Work on ${slowOp.op.toLowerCase()} speed`);
        }
    }

    // Check trends for additional insights
    Object.entries(operationTrends).forEach(([op, trend]) => {
        if (trend.direction === 'improving' && trend.strength !== 'weak') {
            strengths.push(`${op.charAt(0).toUpperCase() + op.slice(1)} is improving ${trend.strength}ly`);
        } else if (trend.direction === 'declining') {
            weaknesses.push(`${op.charAt(0).toUpperCase() + op.slice(1)} performance is declining`);
            focusAreas.push(`Review ${op} fundamentals`);
        }
    });

    return { strengths, weaknesses, focusAreas };
}

// =============================================================================
// SHAREABLE STATISTICS GENERATION
// =============================================================================

export interface ShareableAchievement {
    id: string;
    title: string;
    description: string;
    value: string;
    category: 'milestone' | 'performance' | 'streak' | 'improvement';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    icon: string;
    backgroundColor: string;
    textColor: string;
    timestamp: Date;
}

export interface ShareableProgressSummary {
    id: string;
    userName: string;
    title: string;
    timeframe: string;
    stats: {
        totalSessions: number;
        averageAccuracy: number;
        bestStreak: number;
        totalXP: number;
        level: number;
        arenaRank?: string;
    };
    highlights: string[];
    improvements: string[];
    nextGoals: string[];
    generatedAt: Date;
}

export interface ShareableCard {
    type: 'achievement' | 'progress' | 'milestone';
    data: ShareableAchievement | ShareableProgressSummary;
    shareUrl: string;
    imageUrl?: string; // For future image generation
}

/**
 * Generate shareable achievement cards based on user performance
 */
export async function generateShareableAchievements(): Promise<ShareableAchievement[]> {
    const session = await auth();
    if (!session?.user) return [];
    
    const userId = (session.user as { id: string }).id;
    if (!userId) return [];

    const db = loadData();
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    interface SessionRow {
        user_id: string;
        [key: string]: unknown;
    }
    const userSessions = (db.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId);
    
    const achievements: ShareableAchievement[] = [];

    // Achievement 1: Level Milestone
    if (user?.level && user.level >= 10) {
        const rarity = user.level >= 50 ? 'legendary' : user.level >= 25 ? 'epic' : user.level >= 15 ? 'rare' : 'common';
        achievements.push({
            id: `level-${user.level}`,
            title: `Level ${user.level} Pilot`,
            description: `Reached level ${user.level} through dedicated practice`,
            value: `Level ${user.level}`,
            category: 'milestone',
            rarity,
            icon: '🚀',
            backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : rarity === 'rare' ? '#3B82F6' : '#10B981',
            textColor: '#FFFFFF',
            timestamp: new Date()
        });
    }

    // Achievement 2: Accuracy Master
    const totalCorrect = userSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const totalAttempted = userSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
    const overallAccuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

    if (overallAccuracy >= 90) {
        const rarity = overallAccuracy >= 98 ? 'legendary' : overallAccuracy >= 95 ? 'epic' : 'rare';
        achievements.push({
            id: `accuracy-${Math.floor(overallAccuracy)}`,
            title: 'Accuracy Master',
            description: `Maintained ${overallAccuracy.toFixed(1)}% accuracy across all sessions`,
            value: `${overallAccuracy.toFixed(1)}%`,
            category: 'performance',
            rarity,
            icon: '🎯',
            backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : '#3B82F6',
            textColor: '#FFFFFF',
            timestamp: new Date()
        });
    }

    // Achievement 3: Speed Demon
    const avgSpeed = userSessions.length > 0
        ? userSessions.reduce((acc: number, s: any) => acc + s.avg_speed, 0) / userSessions.length
        : 0;

    if (avgSpeed > 0 && avgSpeed < 2.5) {
        const rarity = avgSpeed < 1.5 ? 'legendary' : avgSpeed < 2.0 ? 'epic' : 'rare';
        achievements.push({
            id: `speed-${Math.floor(avgSpeed * 10)}`,
            title: 'Speed Demon',
            description: `Lightning-fast responses averaging ${avgSpeed.toFixed(1)}s`,
            value: `${avgSpeed.toFixed(1)}s`,
            category: 'performance',
            rarity,
            icon: '⚡',
            backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : '#3B82F6',
            textColor: '#FFFFFF',
            timestamp: new Date()
        });
    }

    // Achievement 4: Session Streak
    if (userSessions.length >= 7) {
        // Calculate consecutive days with sessions
        const sessionDates = userSessions.map(s => new Date(s.created_at).toDateString());
        const uniqueDates = [...new Set(sessionDates)].sort();
        
        let currentStreak = 1;
        let maxStreak = 1;
        
        for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = new Date(uniqueDates[i - 1]);
            const currDate = new Date(uniqueDates[i]);
            const dayDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (dayDiff === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        if (maxStreak >= 7) {
            const rarity = maxStreak >= 30 ? 'legendary' : maxStreak >= 14 ? 'epic' : 'rare';
            achievements.push({
                id: `streak-${maxStreak}`,
                title: 'Dedication Streak',
                description: `Practiced for ${maxStreak} consecutive days`,
                value: `${maxStreak} days`,
                category: 'streak',
                rarity,
                icon: '🔥',
                backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : '#3B82F6',
                textColor: '#FFFFFF',
                timestamp: new Date()
            });
        }
    }

    // Achievement 5: Total XP Milestone
    if (user?.total_xp && user.total_xp >= 1000) {
        const rarity = user.total_xp >= 50000 ? 'legendary' : user.total_xp >= 10000 ? 'epic' : user.total_xp >= 5000 ? 'rare' : 'common';
        achievements.push({
            id: `xp-${Math.floor(user.total_xp / 1000)}k`,
            title: 'XP Collector',
            description: `Earned ${user.total_xp.toLocaleString()} total experience points`,
            value: `${(user.total_xp / 1000).toFixed(1)}k XP`,
            category: 'milestone',
            rarity,
            icon: '💎',
            backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : rarity === 'rare' ? '#3B82F6' : '#10B981',
            textColor: '#FFFFFF',
            timestamp: new Date()
        });
    }

    // Achievement 6: Arena Performance (if available)
    try {
        const arenaStats = await getArenaStatsForSharing(userId);
        if (arenaStats && arenaStats.duel && arenaStats.duel.wins >= 10) {
            const winRate = arenaStats.duel.wins / (arenaStats.duel.wins + arenaStats.duel.losses) * 100;
            if (winRate >= 70) {
                const rarity = winRate >= 90 ? 'legendary' : winRate >= 80 ? 'epic' : 'rare';
                achievements.push({
                    id: `arena-winrate-${Math.floor(winRate)}`,
                    title: 'Arena Champion',
                    description: `Dominating the arena with ${winRate.toFixed(1)}% win rate`,
                    value: `${winRate.toFixed(1)}%`,
                    category: 'performance',
                    rarity,
                    icon: '👑',
                    backgroundColor: rarity === 'legendary' ? '#FFD700' : rarity === 'epic' ? '#9D4EDD' : '#3B82F6',
                    textColor: '#FFFFFF',
                    timestamp: new Date()
                });
            }
        }
    } catch (error) {
        // Arena stats not available, skip
    }

    return achievements.sort((a, b) => {
        const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };
        return rarityOrder[b.rarity] - rarityOrder[a.rarity];
    });
}

/**
 * Generate a shareable progress summary
 */
export async function generateProgressSummary(timeframe: 'week' | 'month' | 'alltime' = 'month'): Promise<ShareableProgressSummary | null> {
    const session = await auth();
    if (!session?.user) return null;
    
    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Pilot';
    if (!userId) return null;

    const db = loadData();
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let timeframeLabel: string;
    
    switch (timeframe) {
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            timeframeLabel = 'This Week';
            break;
        case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            timeframeLabel = 'This Month';
            break;
        case 'alltime':
        default:
            startDate = new Date(0);
            timeframeLabel = 'All Time';
            break;
    }

    // Filter sessions by timeframe
    interface SessionRow {
        user_id: string;
        [key: string]: unknown;
    }
    const allSessions = (db.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId);
    const timeframeSessions = allSessions.filter((s: any) => 
        new Date(s.created_at) >= startDate
    );

    if (timeframeSessions.length === 0 && timeframe !== 'alltime') {
        return null; // No activity in timeframe
    }

    const sessionsToAnalyze = timeframeSessions.length > 0 ? timeframeSessions : allSessions;

    // Calculate stats
    const totalCorrect = sessionsToAnalyze.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const totalAttempted = sessionsToAnalyze.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
    const averageAccuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;
    const bestStreak = Math.max(...sessionsToAnalyze.map((s: any) => s.correct_count || 0), 0);
    const totalXP = sessionsToAnalyze.reduce((acc: number, s: any) => acc + (s.xp_earned || 0), 0);

    // Generate highlights
    const highlights: string[] = [];
    if (averageAccuracy >= 90) highlights.push(`Exceptional ${averageAccuracy.toFixed(1)}% accuracy`);
    if (bestStreak >= 10) highlights.push(`${bestStreak} question streak achieved`);
    if (sessionsToAnalyze.length >= 20) highlights.push(`${sessionsToAnalyze.length} practice sessions completed`);
    if (totalXP >= 1000) highlights.push(`${totalXP.toLocaleString()} XP earned`);

    // Generate improvements
    const improvements: string[] = [];
    if (timeframe !== 'alltime' && allSessions.length > sessionsToAnalyze.length) {
        // Compare with previous period
        const prevPeriodSessions = allSessions.filter((s: any) => {
            const sessionDate = new Date(s.created_at);
            const periodStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
            return sessionDate >= periodStart && sessionDate < startDate;
        });

        if (prevPeriodSessions.length > 0) {
            const prevCorrect = prevPeriodSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
            const prevAttempted = prevPeriodSessions.reduce((acc: number, s: any) => acc + (s.total_count || 0), 0);
            const prevAccuracy = prevAttempted > 0 ? (prevCorrect / prevAttempted) * 100 : 0;
            
            const accuracyImprovement = averageAccuracy - prevAccuracy;
            if (accuracyImprovement > 2) {
                improvements.push(`+${accuracyImprovement.toFixed(1)}% accuracy improvement`);
            }
            
            if (sessionsToAnalyze.length > prevPeriodSessions.length) {
                improvements.push(`${sessionsToAnalyze.length - prevPeriodSessions.length} more sessions than last period`);
            }
        }
    }

    // Generate next goals
    const nextGoals: string[] = [];
    if (averageAccuracy < 90) nextGoals.push('Reach 90% accuracy');
    if (user?.level < 20) nextGoals.push(`Reach level ${user.level + 5}`);
    if (bestStreak < 15) nextGoals.push('Achieve 15+ question streak');
    
    // Try to get arena rank
    let arenaRank: string | undefined;
    try {
        const arenaStats = await getArenaStatsForSharing(userId);
        if (arenaStats?.duel?.rank) {
            arenaRank = `${arenaStats.duel.rank} ${arenaStats.duel.rankDivision || ''}`.trim();
        }
    } catch (error) {
        // Arena stats not available
    }

    return {
        id: `progress-${timeframe}-${Date.now()}`,
        userName,
        title: `${userName}'s ${timeframeLabel} Progress`,
        timeframe: timeframeLabel,
        stats: {
            totalSessions: sessionsToAnalyze.length,
            averageAccuracy: Math.round(averageAccuracy),
            bestStreak,
            totalXP,
            level: user?.level || 1,
            arenaRank
        },
        highlights: highlights.length > 0 ? highlights : ['Keep practicing to unlock highlights!'],
        improvements: improvements.length > 0 ? improvements : ['Complete more sessions to track improvements'],
        nextGoals: nextGoals.length > 0 ? nextGoals : ['Continue your math journey!'],
        generatedAt: new Date()
    };
}

/**
 * Create a shareable card with URL
 */
export async function createShareableCard(
    type: 'achievement' | 'progress' | 'milestone',
    achievementId?: string,
    timeframe?: 'week' | 'month' | 'alltime'
): Promise<ShareableCard | null> {
    const session = await auth();
    if (!session?.user) return null;

    let data: ShareableAchievement | ShareableProgressSummary | null = null;
    let shareUrl = '';

    if (type === 'achievement' && achievementId) {
        const achievements = await generateShareableAchievements();
        data = achievements.find(a => a.id === achievementId) || null;
        shareUrl = `/share/achievement/${achievementId}`;
    } else if (type === 'progress') {
        data = await generateProgressSummary(timeframe);
        shareUrl = `/share/progress/${timeframe || 'month'}`;
    }

    if (!data) return null;

    return {
        type,
        data,
        shareUrl,
        imageUrl: undefined // Future: generate image cards
    };
}

/**
 * Get social sharing text for achievements and progress
 */
export async function generateSocialShareText(card: ShareableCard): Promise<string> {
    if (card.type === 'achievement') {
        const achievement = card.data as ShareableAchievement;
        return `🎉 Just unlocked "${achievement.title}" in FlashMath! ${achievement.description} ${achievement.icon} #FlashMath #MathSkills`;
    } else if (card.type === 'progress') {
        const progress = card.data as ShareableProgressSummary;
        const highlights = progress.highlights.slice(0, 2).join(', ');
        return `📊 My FlashMath ${progress.timeframe} progress: ${highlights}! 🚀 #FlashMath #MathProgress #Learning`;
    }
    return 'Check out my FlashMath progress! 🚀 #FlashMath';
}

/**
 * Helper function to get arena stats for sharing (simplified)
 */
async function getArenaStatsForSharing(userId: string) {
    try {
        // Import dynamically to avoid circular dependencies
        const { getArenaStats } = await import('./matchmaking');
        return await getArenaStats();
    } catch (error) {
        return null;
    }
}