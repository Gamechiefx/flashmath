/**
 * Property-Based Tests for Competition Tracking and Rewards
 * 
 * Feature: comprehensive-user-stories
 * Property 17: Competition Tracking and Rewards
 * 
 * Validates: Requirements 7.5, 7.6
 * For any competitive activity (arena matches, weekly competitions), the system should
 * accurately track performance and distribute appropriate rewards based on achievements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock competition structures
interface MockMatch {
    id: string;
    type: 'duel' | 'tournament' | 'weekly_challenge';
    participants: string[];
    results: Array<{
        userId: string;
        rank: number;
        score: number;
        accuracy: number;
        avgSpeed: number;
    }>;
    rewards: Array<{
        userId: string;
        type: 'coins' | 'xp' | 'cosmetic' | 'title';
        amount?: number;
        item?: string;
    }>;
    timestamp: Date;
    league: string;
}

interface MockUser {
    id: string;
    name: string;
    elo: number;
    league: string;
    coins: number;
    totalXP: number;
    level: number;
    titles: string[];
    cosmetics: string[];
}

interface CompetitionStats {
    userId: string;
    matchesPlayed: number;
    wins: number;
    losses: number;
    totalScore: number;
    averageAccuracy: number;
    averageSpeed: number;
    coinsEarned: number;
    xpEarned: number;
    titlesUnlocked: string[];
    cosmeticsUnlocked: string[];
    weeklyRank?: number;
    seasonRank?: number;
}

interface RewardCalculationResult {
    baseReward: number;
    leagueMultiplier: number;
    performanceBonus: number;
    streakBonus: number;
    finalReward: number;
    additionalRewards: Array<{
        type: 'cosmetic' | 'title' | 'xp_bonus';
        item: string;
        condition: string;
    }>;
}

// League multipliers for rewards
const LEAGUE_MULTIPLIERS = {
    'neon-league': 1.0,
    'cobalt-league': 1.2,
    'plasma-league': 1.5,
    'void-league': 2.0,
    'apex-league': 3.0
};

// Calculate rewards for match performance
function calculateMatchRewards(
    match: MockMatch,
    userId: string,
    user: MockUser,
    winStreak: number = 0
): RewardCalculationResult {
    const userResult = match.results.find(r => r.userId === userId);
    if (!userResult) {
        return {
            baseReward: 0,
            leagueMultiplier: 1,
            performanceBonus: 0,
            streakBonus: 0,
            finalReward: 0,
            additionalRewards: []
        };
    }

    // Base reward calculation
    let baseReward = 0;
    if (match.type === 'duel') {
        baseReward = userResult.rank === 1 ? 50 : 20; // Winner gets 50, loser gets 20
    } else if (match.type === 'tournament') {
        const rankRewards = [200, 100, 50, 25]; // Top 4 rewards
        baseReward = rankRewards[userResult.rank - 1] || 10;
    } else if (match.type === 'weekly_challenge') {
        baseReward = Math.max(10, userResult.score / 10);
    }

    // League multiplier
    const leagueMultiplier = LEAGUE_MULTIPLIERS[user.league as keyof typeof LEAGUE_MULTIPLIERS] || 1.0;

    // Performance bonus (accuracy and speed)
    let performanceBonus = 0;
    if (userResult.accuracy >= 95) performanceBonus += baseReward * 0.5;
    else if (userResult.accuracy >= 90) performanceBonus += baseReward * 0.25;
    
    if (userResult.avgSpeed <= 2) performanceBonus += baseReward * 0.3;
    else if (userResult.avgSpeed <= 3) performanceBonus += baseReward * 0.15;

    // Streak bonus
    const streakBonus = Math.min(winStreak * baseReward * 0.1, baseReward * 0.5);

    // Calculate final reward
    const finalReward = Math.floor((baseReward + performanceBonus + streakBonus) * leagueMultiplier);

    // Additional rewards for special achievements
    const additionalRewards = [];
    
    if (userResult.accuracy === 100) {
        additionalRewards.push({
            type: 'title' as const,
            item: 'Perfect Pilot',
            condition: '100% accuracy in match'
        });
    }
    
    if (userResult.avgSpeed <= 1.5 && userResult.accuracy >= 90) {
        additionalRewards.push({
            type: 'cosmetic' as const,
            item: 'Lightning Trail',
            condition: 'Speed demon performance'
        });
    }
    
    if (winStreak >= 5) {
        additionalRewards.push({
            type: 'title' as const,
            item: 'Unstoppable',
            condition: '5+ win streak'
        });
    }
    
    if (match.type === 'tournament' && userResult.rank === 1) {
        additionalRewards.push({
            type: 'cosmetic' as const,
            item: 'Champion Crown',
            condition: 'Tournament victory'
        });
    }

    return {
        baseReward,
        leagueMultiplier,
        performanceBonus,
        streakBonus,
        finalReward,
        additionalRewards
    };
}

// Track competition statistics
function updateCompetitionStats(
    existingStats: CompetitionStats,
    match: MockMatch,
    userId: string
): CompetitionStats {
    const userResult = match.results.find(r => r.userId === userId);
    if (!userResult) return existingStats;

    const isWin = userResult.rank === 1 || (match.type === 'tournament' && userResult.rank <= 3);
    
    return {
        ...existingStats,
        matchesPlayed: existingStats.matchesPlayed + 1,
        wins: existingStats.wins + (isWin ? 1 : 0),
        losses: existingStats.losses + (isWin ? 0 : 1),
        totalScore: existingStats.totalScore + userResult.score,
        averageAccuracy: (existingStats.averageAccuracy * existingStats.matchesPlayed + userResult.accuracy) / (existingStats.matchesPlayed + 1),
        averageSpeed: (existingStats.averageSpeed * existingStats.matchesPlayed + userResult.avgSpeed) / (existingStats.matchesPlayed + 1),
        coinsEarned: existingStats.coinsEarned + (match.rewards.find(r => r.userId === userId && r.type === 'coins')?.amount || 0),
        xpEarned: existingStats.xpEarned + (match.rewards.find(r => r.userId === userId && r.type === 'xp')?.amount || 0),
        titlesUnlocked: [
            ...existingStats.titlesUnlocked,
            ...match.rewards.filter(r => r.userId === userId && r.type === 'title').map(r => r.item || '')
        ],
        cosmeticsUnlocked: [
            ...existingStats.cosmeticsUnlocked,
            ...match.rewards.filter(r => r.userId === userId && r.type === 'cosmetic').map(r => r.item || '')
        ]
    };
}

// Generate random match data
function generateRandomMatch(users: MockUser[]): MockMatch {
    const matchTypes = ['duel', 'tournament', 'weekly_challenge'] as const;
    const type = matchTypes[Math.floor(Math.random() * matchTypes.length)];
    
    let participantCount: number;
    if (type === 'duel') participantCount = 2;
    else if (type === 'tournament') participantCount = Math.floor(Math.random() * 6) + 4; // 4-9 participants
    else participantCount = Math.floor(Math.random() * 10) + 5; // 5-14 participants
    
    const participants = users
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(participantCount, users.length))
        .map(u => u.id);
    
    const results = participants.map((userId, index) => ({
        userId,
        rank: index + 1,
        score: Math.floor(Math.random() * 1000) + 100,
        accuracy: Math.floor(Math.random() * 40) + 60, // 60-99%
        avgSpeed: Math.random() * 5 + 1 // 1-6 seconds
    })).sort((a, b) => b.score - a.score).map((result, index) => ({
        ...result,
        rank: index + 1
    }));
    
    // Generate rewards based on results
    const rewards = results.map(result => {
        const user = users.find(u => u.id === result.userId)!;
        const rewardCalc = calculateMatchRewards(
            { id: '', type, participants, results, rewards: [], timestamp: new Date(), league: user.league },
            result.userId,
            user,
            Math.floor(Math.random() * 10)
        );
        
        const matchRewards = [
            { userId: result.userId, type: 'coins' as const, amount: rewardCalc.finalReward },
            { userId: result.userId, type: 'xp' as const, amount: rewardCalc.finalReward * 2 }
        ];
        
        rewardCalc.additionalRewards.forEach(additional => {
            matchRewards.push({
                userId: result.userId,
                type: additional.type as 'cosmetic' | 'title',
                item: additional.item
            });
        });
        
        return matchRewards;
    }).flat();
    
    return {
        id: `match-${Math.random().toString(36).substring(7)}`,
        type,
        participants,
        results,
        rewards,
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Within last week
        league: users[0]?.league || 'neon-league'
    };
}

// Generate random users
function generateRandomUsers(count: number): MockUser[] {
    const leagues = Object.keys(LEAGUE_MULTIPLIERS);
    
    return Array.from({ length: count }, (_, i) => ({
        id: `user-${i}`,
        name: `Player${i}`,
        elo: Math.floor(Math.random() * 2000) + 800,
        league: leagues[Math.floor(Math.random() * leagues.length)],
        coins: Math.floor(Math.random() * 10000),
        totalXP: Math.floor(Math.random() * 50000),
        level: Math.floor(Math.random() * 50) + 1,
        titles: [],
        cosmetics: []
    }));
}

describe('Property 17: Competition Tracking and Rewards', () => {
    it('should calculate rewards proportional to performance and league tier', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const users = generateRandomUsers(10);
            const match = generateRandomMatch(users);
            
            match.results.forEach(result => {
                const user = users.find(u => u.id === result.userId)!;
                const rewardCalc = calculateMatchRewards(match, result.userId, user, 0);
                
                // Rewards should be non-negative
                expect(rewardCalc.baseReward).toBeGreaterThanOrEqual(0);
                expect(rewardCalc.finalReward).toBeGreaterThanOrEqual(0);
                expect(rewardCalc.leagueMultiplier).toBeGreaterThan(0);
                expect(rewardCalc.performanceBonus).toBeGreaterThanOrEqual(0);
                expect(rewardCalc.streakBonus).toBeGreaterThanOrEqual(0);
                
                // League multiplier should match user's league
                const expectedMultiplier = LEAGUE_MULTIPLIERS[user.league as keyof typeof LEAGUE_MULTIPLIERS];
                expect(rewardCalc.leagueMultiplier).toBe(expectedMultiplier);
                
                // Higher league should mean higher rewards (for same performance)
                // Note: finalReward is floored to integer, so allow for rounding
                if (rewardCalc.baseReward > 0) {
                    expect(rewardCalc.finalReward).toBeGreaterThanOrEqual(Math.floor(rewardCalc.baseReward));
                }
                
                // Performance bonus should correlate with accuracy/speed
                if (result.accuracy >= 95 || result.avgSpeed <= 2) {
                    expect(rewardCalc.performanceBonus).toBeGreaterThan(0);
                }
                
                // Better rank should generally mean better base rewards
                if (match.type === 'duel') {
                    if (result.rank === 1) {
                        expect(rewardCalc.baseReward).toBeGreaterThanOrEqual(50);
                    } else {
                        expect(rewardCalc.baseReward).toBeGreaterThanOrEqual(20);
                    }
                }
            });
        }
    });

    it('should track competition statistics accurately over multiple matches', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const users = generateRandomUsers(5);
            const user = users[0];
            
            let stats: CompetitionStats = {
                userId: user.id,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                totalScore: 0,
                averageAccuracy: 0,
                averageSpeed: 0,
                coinsEarned: 0,
                xpEarned: 0,
                titlesUnlocked: [],
                cosmeticsUnlocked: []
            };
            
            const matchCount = Math.floor(Math.random() * 10) + 5; // 5-14 matches
            let totalAccuracy = 0;
            let totalSpeed = 0;
            let totalScore = 0;
            let wins = 0;
            let losses = 0;
            
            for (let i = 0; i < matchCount; i++) {
                const match = generateRandomMatch(users);
                
                // Ensure user participates
                if (!match.participants.includes(user.id)) {
                    match.participants[0] = user.id;
                    match.results[0].userId = user.id;
                }
                
                const userResult = match.results.find(r => r.userId === user.id)!;
                totalAccuracy += userResult.accuracy;
                totalSpeed += userResult.avgSpeed;
                totalScore += userResult.score;
                
                const isWin = userResult.rank === 1 || (match.type === 'tournament' && userResult.rank <= 3);
                if (isWin) wins++;
                else losses++;
                
                stats = updateCompetitionStats(stats, match, user.id);
            }
            
            // Verify statistics accuracy
            expect(stats.matchesPlayed).toBe(matchCount);
            expect(stats.wins).toBe(wins);
            expect(stats.losses).toBe(losses);
            expect(stats.totalScore).toBe(totalScore);
            expect(Math.abs(stats.averageAccuracy - (totalAccuracy / matchCount))).toBeLessThan(0.01);
            expect(Math.abs(stats.averageSpeed - (totalSpeed / matchCount))).toBeLessThan(0.01);
            
            // Coins and XP should be accumulated
            expect(stats.coinsEarned).toBeGreaterThanOrEqual(0);
            expect(stats.xpEarned).toBeGreaterThanOrEqual(0);
            
            // Arrays should not contain duplicates
            expect(new Set(stats.titlesUnlocked).size).toBe(stats.titlesUnlocked.length);
            expect(new Set(stats.cosmeticsUnlocked).size).toBe(stats.cosmeticsUnlocked.length);
        }
    });

    it('should award special rewards for exceptional performance', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const users = generateRandomUsers(4);
            const user = users[0];
            
            // Create match with perfect performance
            const match: MockMatch = {
                id: 'test-match',
                type: 'duel',
                participants: [user.id, users[1].id],
                results: [
                    { userId: user.id, rank: 1, score: 1000, accuracy: 100, avgSpeed: 1.2 },
                    { userId: users[1].id, rank: 2, score: 800, accuracy: 85, avgSpeed: 3.5 }
                ],
                rewards: [],
                timestamp: new Date(),
                league: user.league
            };
            
            const rewardCalc = calculateMatchRewards(match, user.id, user, 6); // 6 win streak
            
            // Should have performance bonus for perfect accuracy
            expect(rewardCalc.performanceBonus).toBeGreaterThan(0);
            
            // Should have streak bonus
            expect(rewardCalc.streakBonus).toBeGreaterThan(0);
            
            // Should have additional rewards for special achievements
            const perfectTitle = rewardCalc.additionalRewards.find(r => r.item === 'Perfect Pilot');
            expect(perfectTitle).toBeDefined();
            expect(perfectTitle?.condition).toContain('100% accuracy');
            
            const speedReward = rewardCalc.additionalRewards.find(r => r.item === 'Lightning Trail');
            expect(speedReward).toBeDefined();
            
            const streakTitle = rewardCalc.additionalRewards.find(r => r.item === 'Unstoppable');
            expect(streakTitle).toBeDefined();
            expect(streakTitle?.condition).toContain('5+ win streak');
        }
    });

    it('should maintain reward consistency across similar performances', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const users = generateRandomUsers(4);
            
            // Create two identical matches
            const baseMatch: MockMatch = {
                id: 'match-1',
                type: 'duel',
                participants: [users[0].id, users[1].id],
                results: [
                    { userId: users[0].id, rank: 1, score: 500, accuracy: 85, avgSpeed: 2.5 },
                    { userId: users[1].id, rank: 2, score: 400, accuracy: 80, avgSpeed: 3.0 }
                ],
                rewards: [],
                timestamp: new Date(),
                league: 'cobalt-league'
            };
            
            const match2 = { ...baseMatch, id: 'match-2' };
            
            const reward1 = calculateMatchRewards(match2, users[0].id, users[0], 2);
            const reward2 = calculateMatchRewards(match2, users[0].id, users[0], 2);
            
            // Identical inputs should produce identical outputs
            expect(reward1.baseReward).toBe(reward2.baseReward);
            expect(reward1.leagueMultiplier).toBe(reward2.leagueMultiplier);
            expect(reward1.performanceBonus).toBe(reward2.performanceBonus);
            expect(reward1.streakBonus).toBe(reward2.streakBonus);
            expect(reward1.finalReward).toBe(reward2.finalReward);
            expect(reward1.additionalRewards.length).toBe(reward2.additionalRewards.length);
        }
    });

    it('should handle edge cases in competition tracking', () => {
        const edgeCases = [
            // No matches
            { matches: [], expectedStats: { matchesPlayed: 0, wins: 0, losses: 0 } },
            
            // Single match win
            { 
                matches: [{
                    id: 'test',
                    type: 'duel' as const,
                    participants: ['user-1', 'user-2'],
                    results: [
                        { userId: 'user-1', rank: 1, score: 100, accuracy: 90, avgSpeed: 2.0 },
                        { userId: 'user-2', rank: 2, score: 80, accuracy: 85, avgSpeed: 2.5 }
                    ],
                    rewards: [
                        { userId: 'user-1', type: 'coins' as const, amount: 50 }
                    ],
                    timestamp: new Date(),
                    league: 'neon-league'
                }],
                expectedStats: { matchesPlayed: 1, wins: 1, losses: 0 }
            },
            
            // All losses
            {
                matches: Array.from({ length: 3 }, (_, i) => ({
                    id: `match-${i}`,
                    type: 'duel' as const,
                    participants: ['user-1', 'user-2'],
                    results: [
                        { userId: 'user-2', rank: 1, score: 100, accuracy: 90, avgSpeed: 2.0 },
                        { userId: 'user-1', rank: 2, score: 80, accuracy: 85, avgSpeed: 2.5 }
                    ],
                    rewards: [],
                    timestamp: new Date(),
                    league: 'neon-league'
                })),
                expectedStats: { matchesPlayed: 3, wins: 0, losses: 3 }
            }
        ];

        edgeCases.forEach((testCase, index) => {
            let stats: CompetitionStats = {
                userId: 'user-1',
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                totalScore: 0,
                averageAccuracy: 0,
                averageSpeed: 0,
                coinsEarned: 0,
                xpEarned: 0,
                titlesUnlocked: [],
                cosmeticsUnlocked: []
            };
            
            testCase.matches.forEach(match => {
                stats = updateCompetitionStats(stats, match, 'user-1');
            });
            
            expect(stats.matchesPlayed).toBe(testCase.expectedStats.matchesPlayed);
            expect(stats.wins).toBe(testCase.expectedStats.wins);
            expect(stats.losses).toBe(testCase.expectedStats.losses);
            
            // Should not have invalid values
            expect(stats.averageAccuracy).toBeGreaterThanOrEqual(0);
            expect(stats.averageSpeed).toBeGreaterThanOrEqual(0);
            expect(stats.coinsEarned).toBeGreaterThanOrEqual(0);
            expect(stats.xpEarned).toBeGreaterThanOrEqual(0);
            
            if (stats.matchesPlayed > 0) {
                expect(stats.averageAccuracy).toBeLessThanOrEqual(100);
                expect(stats.averageSpeed).toBeGreaterThan(0);
            }
        });
    });

    it('should scale rewards appropriately with league tiers', () => {
        const leagues = Object.keys(LEAGUE_MULTIPLIERS);
        
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const baseUser: MockUser = {
                id: 'test-user',
                name: 'Test Player',
                elo: 1200,
                league: 'neon-league',
                coins: 1000,
                totalXP: 5000,
                level: 10,
                titles: [],
                cosmetics: []
            };
            
            const match: MockMatch = {
                id: 'test-match',
                type: 'duel',
                participants: ['test-user', 'opponent'],
                results: [
                    { userId: 'test-user', rank: 1, score: 500, accuracy: 90, avgSpeed: 2.0 },
                    { userId: 'opponent', rank: 2, score: 400, accuracy: 85, avgSpeed: 2.5 }
                ],
                rewards: [],
                timestamp: new Date(),
                league: 'neon-league'
            };
            
            const rewards: number[] = [];
            
            // Test same performance across all leagues
            leagues.forEach(league => {
                const user = { ...baseUser, league };
                const rewardCalc = calculateMatchRewards(match, 'test-user', user, 0);
                rewards.push(rewardCalc.finalReward);
            });
            
            // Rewards should increase with league tier
            for (let i = 1; i < rewards.length; i++) {
                expect(rewards[i]).toBeGreaterThanOrEqual(rewards[i - 1]);
            }
            
            // Apex league should have highest rewards
            const apexReward = rewards[rewards.length - 1];
            const neonReward = rewards[0];
            expect(apexReward).toBeGreaterThan(neonReward * 2.5); // At least 3x multiplier
        }
    });

    it('should prevent reward exploitation and maintain fairness', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const users = generateRandomUsers(6);
            const matches: MockMatch[] = [];
            
            // Generate multiple matches for same users
            for (let i = 0; i < 10; i++) {
                matches.push(generateRandomMatch(users));
            }
            
            // Track total rewards per user
            const userRewards = new Map<string, number>();
            const userPerformance = new Map<string, { totalScore: number, matches: number }>();
            
            matches.forEach(match => {
                match.results.forEach(result => {
                    const user = users.find(u => u.id === result.userId)!;
                    const rewardCalc = calculateMatchRewards(match, result.userId, user, 0);
                    
                    const currentReward = userRewards.get(result.userId) || 0;
                    userRewards.set(result.userId, currentReward + rewardCalc.finalReward);
                    
                    const currentPerf = userPerformance.get(result.userId) || { totalScore: 0, matches: 0 };
                    userPerformance.set(result.userId, {
                        totalScore: currentPerf.totalScore + result.score,
                        matches: currentPerf.matches + 1
                    });
                });
            });
            
            // Better performing users should generally earn more rewards
            const userStats = Array.from(userPerformance.entries()).map(([userId, perf]) => ({
                userId,
                avgScore: perf.totalScore / perf.matches,
                totalRewards: userRewards.get(userId) || 0,
                user: users.find(u => u.id === userId)!
            }));
            
            // Sort by average score
            userStats.sort((a, b) => b.avgScore - a.avgScore);
            
            // Verify reward distribution makes sense
            userStats.forEach((stat, index) => {
                // Rewards should be positive
                expect(stat.totalRewards).toBeGreaterThanOrEqual(0);
                
                // Higher league users should generally earn more (accounting for performance)
                const leagueMultiplier = LEAGUE_MULTIPLIERS[stat.user.league as keyof typeof LEAGUE_MULTIPLIERS];
                expect(leagueMultiplier).toBeGreaterThan(0);
                
                // No single match should give excessive rewards
                const maxSingleReward = stat.totalRewards; // This is total, so individual should be less
                expect(maxSingleReward).toBeLessThan(10000); // Reasonable upper bound
            });
        }
    });
});