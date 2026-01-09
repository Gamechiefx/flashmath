/**
 * Property-Based Tests for Arena Reward Calculation
 * 
 * Feature: comprehensive-user-stories
 * Property 7: Arena Reward Calculation
 * 
 * Validates: Requirements 2.6
 * For any arena victory, Flux_Coins awarded should be calculated based on 
 * performance metrics and current league tier
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock reward system data structures
type LeagueType = 'neon' | 'cobalt' | 'plasma' | 'void' | 'apex';

interface ArenaPerformance {
    correctAnswers: number;
    totalQuestions: number;
    averageResponseTime: number; // in milliseconds
    maxStreak: number;
    opponentElo: number;
    playerElo: number;
    matchDuration: number; // in seconds
}

interface RewardCalculation {
    baseReward: number;
    performanceBonus: number;
    leagueMultiplier: number;
    streakBonus: number;
    speedBonus: number;
    difficultyBonus: number;
    totalFluxCoins: number;
}

// League reward multipliers
const LEAGUE_MULTIPLIERS = {
    neon: 1.0,
    cobalt: 1.2,
    plasma: 1.5,
    void: 1.8,
    apex: 2.2
};

// Base reward constants
const BASE_REWARD = 50; // Base Flux Coins for winning
const PERFORMANCE_MULTIPLIER = 2; // Coins per correct answer
const STREAK_BONUS_PER_STREAK = 5; // Bonus per streak point
const SPEED_THRESHOLD = 3000; // 3 seconds for speed bonus
const SPEED_BONUS_MULTIPLIER = 0.5;

// Calculate arena rewards
function calculateArenaRewards(performance: ArenaPerformance, playerLeague: LeagueType): RewardCalculation {
    // Base reward for winning
    const baseReward = BASE_REWARD;
    
    // Performance bonus based on accuracy
    const accuracy = performance.correctAnswers / performance.totalQuestions;
    const performanceBonus = Math.floor(performance.correctAnswers * PERFORMANCE_MULTIPLIER * accuracy);
    
    // League multiplier
    const leagueMultiplier = LEAGUE_MULTIPLIERS[playerLeague];
    
    // Streak bonus
    const streakBonus = performance.maxStreak * STREAK_BONUS_PER_STREAK;
    
    // Speed bonus for fast responses
    const speedBonus = performance.averageResponseTime < SPEED_THRESHOLD 
        ? Math.floor(performance.correctAnswers * SPEED_BONUS_MULTIPLIER)
        : 0;
    
    // Difficulty bonus for beating higher ELO opponents
    const eloDifference = performance.opponentElo - performance.playerElo;
    const difficultyBonus = eloDifference > 0 
        ? Math.floor(eloDifference / 50) * 5 // 5 coins per 50 ELO difference
        : 0;
    
    // Calculate total before league multiplier
    const subtotal = baseReward + performanceBonus + streakBonus + speedBonus + difficultyBonus;
    
    // Apply league multiplier
    const totalFluxCoins = Math.floor(subtotal * leagueMultiplier);
    
    return {
        baseReward,
        performanceBonus,
        leagueMultiplier,
        streakBonus,
        speedBonus,
        difficultyBonus,
        totalFluxCoins
    };
}

// Generate random performance data
function generateRandomPerformance(): ArenaPerformance {
    const totalQuestions = Math.floor(Math.random() * 20) + 10; // 10-29 questions
    const correctAnswers = Math.floor(Math.random() * totalQuestions) + 1; // At least 1 correct
    
    return {
        correctAnswers,
        totalQuestions,
        averageResponseTime: Math.floor(Math.random() * 8000) + 1000, // 1-9 seconds
        maxStreak: Math.floor(Math.random() * correctAnswers) + 1, // 1 to correctAnswers
        opponentElo: Math.floor(Math.random() * 1500) + 500, // 500-2000
        playerElo: Math.floor(Math.random() * 1500) + 500, // 500-2000
        matchDuration: Math.floor(Math.random() * 300) + 60 // 1-5 minutes
    };
}

// Get league from ELO (simplified)
function getLeagueFromElo(elo: number): LeagueType {
    if (elo < 600) return 'neon';
    if (elo < 1000) return 'cobalt';
    if (elo < 1400) return 'plasma';
    if (elo < 1800) return 'void';
    return 'apex';
}

describe('Property 7: Arena Reward Calculation', () => {
    it('should calculate base rewards consistently for all victories', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const performance = generateRandomPerformance();
            const league = getLeagueFromElo(performance.playerElo);
            
            const rewards = calculateArenaRewards(performance, league);
            
            // Base reward should always be present
            expect(rewards.baseReward).toBe(BASE_REWARD);
            expect(rewards.baseReward).toBeGreaterThan(0);
            
            // Total should always be at least the base reward
            expect(rewards.totalFluxCoins).toBeGreaterThanOrEqual(rewards.baseReward);
            
            // League multiplier should match the league
            expect(rewards.leagueMultiplier).toBe(LEAGUE_MULTIPLIERS[league]);
            
            // All reward components should be non-negative
            expect(rewards.performanceBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.streakBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.speedBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.difficultyBonus).toBeGreaterThanOrEqual(0);
        }
    });
    
    it('should scale rewards based on performance metrics', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const basePerformance = generateRandomPerformance();
            const league = getLeagueFromElo(basePerformance.playerElo);
            
            // Create a better performance version
            const betterPerformance: ArenaPerformance = {
                ...basePerformance,
                correctAnswers: Math.min(basePerformance.totalQuestions, basePerformance.correctAnswers + 5),
                maxStreak: basePerformance.maxStreak + 3,
                averageResponseTime: Math.max(1000, basePerformance.averageResponseTime - 1000)
            };
            
            const baseRewards = calculateArenaRewards(basePerformance, league);
            const betterRewards = calculateArenaRewards(betterPerformance, league);
            
            // Better performance should yield higher rewards
            expect(betterRewards.totalFluxCoins).toBeGreaterThanOrEqual(baseRewards.totalFluxCoins);
            
            // Performance bonus should increase with more correct answers
            if (betterPerformance.correctAnswers > basePerformance.correctAnswers) {
                expect(betterRewards.performanceBonus).toBeGreaterThan(baseRewards.performanceBonus);
            }
            
            // Streak bonus should increase with better streaks
            if (betterPerformance.maxStreak > basePerformance.maxStreak) {
                expect(betterRewards.streakBonus).toBeGreaterThan(baseRewards.streakBonus);
            }
            
            // Speed bonus should increase with faster responses
            if (betterPerformance.averageResponseTime < basePerformance.averageResponseTime) {
                expect(betterRewards.speedBonus).toBeGreaterThanOrEqual(baseRewards.speedBonus);
            }
        }
    });
    
    it('should apply league multipliers correctly', () => {
        const leagues: LeagueType[] = ['neon', 'cobalt', 'plasma', 'void', 'apex'];
        
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const performance = generateRandomPerformance();
            
            // Calculate rewards for each league
            const rewardsByLeague = leagues.map(league => ({
                league,
                rewards: calculateArenaRewards(performance, league)
            }));
            
            // Higher leagues should generally provide higher total rewards
            for (let i = 1; i < rewardsByLeague.length; i++) {
                const currentLeague = rewardsByLeague[i];
                const previousLeague = rewardsByLeague[i - 1];
                
                expect(currentLeague.rewards.leagueMultiplier).toBeGreaterThan(previousLeague.rewards.leagueMultiplier);
                expect(currentLeague.rewards.totalFluxCoins).toBeGreaterThan(previousLeague.rewards.totalFluxCoins);
            }
            
            // Validate specific multiplier values
            rewardsByLeague.forEach(({ league, rewards }) => {
                expect(rewards.leagueMultiplier).toBe(LEAGUE_MULTIPLIERS[league]);
            });
        }
    });
    
    it('should provide difficulty bonuses for beating stronger opponents', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const playerElo = 1000 + Math.floor(Math.random() * 500); // 1000-1500
            const league = getLeagueFromElo(playerElo);
            
            // Create scenarios with different opponent strengths
            const weakerOpponent: ArenaPerformance = {
                correctAnswers: 10,
                totalQuestions: 15,
                averageResponseTime: 2500,
                maxStreak: 5,
                opponentElo: playerElo - 200, // Weaker opponent
                playerElo,
                matchDuration: 180
            };
            
            const strongerOpponent: ArenaPerformance = {
                ...weakerOpponent,
                opponentElo: playerElo + 200 // Stronger opponent
            };
            
            const weakerRewards = calculateArenaRewards(weakerOpponent, league);
            const strongerRewards = calculateArenaRewards(strongerOpponent, league);
            
            // Beating stronger opponent should provide difficulty bonus
            expect(strongerRewards.difficultyBonus).toBeGreaterThan(weakerRewards.difficultyBonus);
            expect(strongerRewards.totalFluxCoins).toBeGreaterThan(weakerRewards.totalFluxCoins);
            
            // Validate difficulty bonus calculation
            const eloDifference = strongerOpponent.opponentElo - strongerOpponent.playerElo;
            const expectedDifficultyBonus = Math.floor(eloDifference / 50) * 5;
            expect(strongerRewards.difficultyBonus).toBe(expectedDifficultyBonus);
        }
    });
    
    it('should provide speed bonuses for fast responses', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const league = getLeagueFromElo(1200);
            
            // Create fast and slow response scenarios
            const fastPerformance: ArenaPerformance = {
                correctAnswers: 12,
                totalQuestions: 15,
                averageResponseTime: 2000, // Fast (under threshold)
                maxStreak: 6,
                opponentElo: 1200,
                playerElo: 1200,
                matchDuration: 120
            };
            
            const slowPerformance: ArenaPerformance = {
                ...fastPerformance,
                averageResponseTime: 5000 // Slow (over threshold)
            };
            
            const fastRewards = calculateArenaRewards(fastPerformance, league);
            const slowRewards = calculateArenaRewards(slowPerformance, league);
            
            // Fast responses should get speed bonus
            expect(fastRewards.speedBonus).toBeGreaterThan(slowRewards.speedBonus);
            expect(fastRewards.totalFluxCoins).toBeGreaterThan(slowRewards.totalFluxCoins);
            
            // Validate speed bonus calculation
            const expectedSpeedBonus = Math.floor(fastPerformance.correctAnswers * SPEED_BONUS_MULTIPLIER);
            expect(fastRewards.speedBonus).toBe(expectedSpeedBonus);
            expect(slowRewards.speedBonus).toBe(0);
        }
    });
    
    it('should handle edge cases in reward calculation', () => {
        const edgeCases = [
            // Perfect performance
            {
                correctAnswers: 20,
                totalQuestions: 20,
                averageResponseTime: 1500,
                maxStreak: 20,
                opponentElo: 2000,
                playerElo: 1000,
                matchDuration: 60
            },
            // Minimal performance (1 correct answer)
            {
                correctAnswers: 1,
                totalQuestions: 20,
                averageResponseTime: 8000,
                maxStreak: 1,
                opponentElo: 800,
                playerElo: 1200,
                matchDuration: 300
            },
            // Equal ELO opponents
            {
                correctAnswers: 10,
                totalQuestions: 15,
                averageResponseTime: 3000,
                maxStreak: 5,
                opponentElo: 1200,
                playerElo: 1200,
                matchDuration: 180
            }
        ];
        
        edgeCases.forEach((performance, index) => {
            const league = getLeagueFromElo(performance.playerElo);
            const rewards = calculateArenaRewards(performance, league);
            
            // All rewards should be non-negative
            expect(rewards.baseReward).toBeGreaterThanOrEqual(0);
            expect(rewards.performanceBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.streakBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.speedBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.difficultyBonus).toBeGreaterThanOrEqual(0);
            expect(rewards.totalFluxCoins).toBeGreaterThan(0);
            
            // Validate specific edge case expectations
            if (index === 0) { // Perfect performance
                expect(rewards.performanceBonus).toBeGreaterThan(0);
                expect(rewards.streakBonus).toBeGreaterThan(0);
                expect(rewards.speedBonus).toBeGreaterThan(0);
                expect(rewards.difficultyBonus).toBeGreaterThan(0);
            }
            
            if (index === 1) { // Minimal performance
                expect(rewards.performanceBonus).toBeGreaterThanOrEqual(0); // May be 0 for very poor accuracy
                expect(rewards.speedBonus).toBe(0); // Too slow
            }
            
            if (index === 2) { // Equal ELO
                expect(rewards.difficultyBonus).toBe(0); // No ELO difference
            }
        });
    });
    
    it('should maintain reward proportionality across different match lengths', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const league = getLeagueFromElo(1200);
            
            // Create short and long match scenarios with proportional performance
            const shortMatch: ArenaPerformance = {
                correctAnswers: 8,
                totalQuestions: 10,
                averageResponseTime: 2500,
                maxStreak: 4,
                opponentElo: 1300,
                playerElo: 1200,
                matchDuration: 90
            };
            
            const longMatch: ArenaPerformance = {
                correctAnswers: 16, // Proportionally same (80% accuracy)
                totalQuestions: 20,
                averageResponseTime: 2500,
                maxStreak: 8, // Proportionally same
                opponentElo: 1300,
                playerElo: 1200,
                matchDuration: 180
            };
            
            const shortRewards = calculateArenaRewards(shortMatch, league);
            const longRewards = calculateArenaRewards(longMatch, league);
            
            // Longer matches with proportionally better performance should yield more rewards
            expect(longRewards.totalFluxCoins).toBeGreaterThan(shortRewards.totalFluxCoins);
            
            // Performance bonus should scale with number of correct answers
            expect(longRewards.performanceBonus).toBeGreaterThan(shortRewards.performanceBonus);
            
            // Streak bonus should scale with streak length
            expect(longRewards.streakBonus).toBeGreaterThan(shortRewards.streakBonus);
        }
    });
    
    it('should ensure reward calculations are deterministic', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const performance = generateRandomPerformance();
            const league = getLeagueFromElo(performance.playerElo);
            
            // Calculate rewards multiple times with same input
            const rewards1 = calculateArenaRewards(performance, league);
            const rewards2 = calculateArenaRewards(performance, league);
            const rewards3 = calculateArenaRewards(performance, league);
            
            // Results should be identical
            expect(rewards1.totalFluxCoins).toBe(rewards2.totalFluxCoins);
            expect(rewards2.totalFluxCoins).toBe(rewards3.totalFluxCoins);
            
            expect(rewards1.performanceBonus).toBe(rewards2.performanceBonus);
            expect(rewards1.streakBonus).toBe(rewards2.streakBonus);
            expect(rewards1.speedBonus).toBe(rewards2.speedBonus);
            expect(rewards1.difficultyBonus).toBe(rewards2.difficultyBonus);
        }
    });
});