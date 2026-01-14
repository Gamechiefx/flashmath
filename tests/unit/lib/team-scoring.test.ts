/**
 * Team Scoring Unit Tests
 * 
 * Tests team match scoring logic including streaks, bonuses, and point calculations.
 */

import { describe, it, expect } from 'vitest';

// Scoring constants (matching ARENA_TEAMS_5V5.md spec)
const POINTS_PER_CORRECT = 100;
const STREAK_BONUS = 5;
const QUESTIONS_PER_SLOT = 5;
const SLOTS_PER_ROUND = 5;
const ROUNDS_PER_HALF = 4;

/**
 * Calculate points for a single answer
 */
function calculateAnswerPoints(correct: boolean, currentStreak: number): {
    points: number;
    newStreak: number;
    streakBonus: number;
} {
    if (!correct) {
        return { points: 0, newStreak: 0, streakBonus: 0 };
    }
    
    const streakBonus = currentStreak * STREAK_BONUS;
    const points = POINTS_PER_CORRECT + streakBonus;
    
    return {
        points,
        newStreak: currentStreak + 1,
        streakBonus,
    };
}

/**
 * Calculate round score for a player
 */
function calculatePlayerRoundScore(
    correctAnswers: boolean[],
    startStreak: number = 0
): {
    totalPoints: number;
    accuracy: number;
    maxStreak: number;
    endStreak: number;
} {
    let totalPoints = 0;
    let currentStreak = startStreak;
    let maxStreak = startStreak;
    
    for (const correct of correctAnswers) {
        const result = calculateAnswerPoints(correct, currentStreak);
        totalPoints += result.points;
        currentStreak = result.newStreak;
        maxStreak = Math.max(maxStreak, currentStreak);
    }
    
    const accuracy = correctAnswers.filter(c => c).length / correctAnswers.length;
    
    return {
        totalPoints,
        accuracy,
        maxStreak,
        endStreak: currentStreak,
    };
}

/**
 * Calculate team round score
 */
function calculateTeamRoundScore(
    playerScores: { totalPoints: number; accuracy: number }[]
): {
    teamScore: number;
    teamAccuracy: number;
    mvpIndex: number;
} {
    const teamScore = playerScores.reduce((sum, p) => sum + p.totalPoints, 0);
    const teamAccuracy = playerScores.reduce((sum, p) => sum + p.accuracy, 0) / playerScores.length;
    
    let mvpIndex = 0;
    let maxPoints = 0;
    playerScores.forEach((p, i) => {
        if (p.totalPoints > maxPoints) {
            maxPoints = p.totalPoints;
            mvpIndex = i;
        }
    });
    
    return { teamScore, teamAccuracy, mvpIndex };
}

/**
 * Determine winner based on tiebreaker rules
 */
function determineWinner(
    team1: { score: number; accuracy: number; avgSpeed: number; maxStreak: number; correctTotal: number },
    team2: { score: number; accuracy: number; avgSpeed: number; maxStreak: number; correctTotal: number }
): 'team1' | 'team2' | 'draw' {
    // Primary: Higher score
    if (team1.score !== team2.score) {
        return team1.score > team2.score ? 'team1' : 'team2';
    }
    
    // Tiebreaker 1: Higher accuracy
    if (team1.accuracy !== team2.accuracy) {
        return team1.accuracy > team2.accuracy ? 'team1' : 'team2';
    }
    
    // Tiebreaker 2: Faster average speed (lower is better)
    if (team1.avgSpeed !== team2.avgSpeed) {
        return team1.avgSpeed < team2.avgSpeed ? 'team1' : 'team2';
    }
    
    // Tiebreaker 3: Longer max streak
    if (team1.maxStreak !== team2.maxStreak) {
        return team1.maxStreak > team2.maxStreak ? 'team1' : 'team2';
    }
    
    // Tiebreaker 4: More correct answers
    if (team1.correctTotal !== team2.correctTotal) {
        return team1.correctTotal > team2.correctTotal ? 'team1' : 'team2';
    }
    
    // Ultimate: Draw
    return 'draw';
}

describe('Team Scoring', () => {
    describe('calculateAnswerPoints', () => {
        it('should return 100 points for first correct answer (no streak)', () => {
            const result = calculateAnswerPoints(true, 0);
            expect(result.points).toBe(100);
            expect(result.newStreak).toBe(1);
            expect(result.streakBonus).toBe(0);
        });
        
        it('should add streak bonus for consecutive correct answers', () => {
            const result1 = calculateAnswerPoints(true, 1);
            expect(result1.points).toBe(105); // 100 + 5
            expect(result1.streakBonus).toBe(5);
            
            const result5 = calculateAnswerPoints(true, 5);
            expect(result5.points).toBe(125); // 100 + 25
            expect(result5.streakBonus).toBe(25);
        });
        
        it('should return 0 points and reset streak for wrong answer', () => {
            const result = calculateAnswerPoints(false, 10);
            expect(result.points).toBe(0);
            expect(result.newStreak).toBe(0);
            expect(result.streakBonus).toBe(0);
        });
        
        it('should correctly track streak progression', () => {
            expect(calculateAnswerPoints(true, 0).newStreak).toBe(1);
            expect(calculateAnswerPoints(true, 1).newStreak).toBe(2);
            expect(calculateAnswerPoints(true, 10).newStreak).toBe(11);
            expect(calculateAnswerPoints(false, 10).newStreak).toBe(0);
        });
    });
    
    describe('calculatePlayerRoundScore', () => {
        it('should calculate perfect round (5/5 correct)', () => {
            const result = calculatePlayerRoundScore([true, true, true, true, true]);
            
            // 100 + 105 + 110 + 115 + 120 = 550
            expect(result.totalPoints).toBe(550);
            expect(result.accuracy).toBe(1);
            expect(result.maxStreak).toBe(5);
            expect(result.endStreak).toBe(5);
        });
        
        it('should calculate round with mistakes', () => {
            const result = calculatePlayerRoundScore([true, true, false, true, true]);
            
            // 100 + 105 + 0 + 100 + 105 = 410
            expect(result.totalPoints).toBe(410);
            expect(result.accuracy).toBe(0.8);
            expect(result.maxStreak).toBe(2);
            expect(result.endStreak).toBe(2);
        });
        
        it('should handle all wrong answers', () => {
            const result = calculatePlayerRoundScore([false, false, false, false, false]);
            
            expect(result.totalPoints).toBe(0);
            expect(result.accuracy).toBe(0);
            expect(result.maxStreak).toBe(0);
            expect(result.endStreak).toBe(0);
        });
        
        it('should continue streak from previous round', () => {
            const result = calculatePlayerRoundScore([true, true], 3);
            
            // (100 + 15) + (100 + 20) = 235
            expect(result.totalPoints).toBe(235);
            expect(result.maxStreak).toBe(5);
            expect(result.endStreak).toBe(5);
        });
    });
    
    describe('calculateTeamRoundScore', () => {
        it('should sum player scores', () => {
            const players = [
                { totalPoints: 550, accuracy: 1 },
                { totalPoints: 410, accuracy: 0.8 },
                { totalPoints: 500, accuracy: 0.9 },
                { totalPoints: 300, accuracy: 0.6 },
                { totalPoints: 450, accuracy: 0.85 },
            ];
            
            const result = calculateTeamRoundScore(players);
            
            expect(result.teamScore).toBe(2210);
            expect(result.teamAccuracy).toBeCloseTo(0.83, 2);
            expect(result.mvpIndex).toBe(0); // Player with 550 points
        });
        
        it('should identify correct MVP', () => {
            const players = [
                { totalPoints: 100, accuracy: 0.5 },
                { totalPoints: 500, accuracy: 1 },
                { totalPoints: 200, accuracy: 0.7 },
            ];
            
            const result = calculateTeamRoundScore(players);
            expect(result.mvpIndex).toBe(1); // Player 2 is MVP
        });
    });
    
    describe('determineWinner', () => {
        it('should determine winner by score', () => {
            const team1 = { score: 5000, accuracy: 0.9, avgSpeed: 1.2, maxStreak: 10, correctTotal: 90 };
            const team2 = { score: 4500, accuracy: 0.95, avgSpeed: 1.0, maxStreak: 15, correctTotal: 95 };
            
            expect(determineWinner(team1, team2)).toBe('team1');
        });
        
        it('should use accuracy as first tiebreaker', () => {
            const team1 = { score: 5000, accuracy: 0.95, avgSpeed: 1.2, maxStreak: 10, correctTotal: 90 };
            const team2 = { score: 5000, accuracy: 0.90, avgSpeed: 1.0, maxStreak: 15, correctTotal: 95 };
            
            expect(determineWinner(team1, team2)).toBe('team1');
        });
        
        it('should use speed as second tiebreaker', () => {
            const team1 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 90 };
            const team2 = { score: 5000, accuracy: 0.9, avgSpeed: 1.2, maxStreak: 15, correctTotal: 95 };
            
            expect(determineWinner(team1, team2)).toBe('team1');
        });
        
        it('should use max streak as third tiebreaker', () => {
            const team1 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 15, correctTotal: 90 };
            const team2 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 95 };
            
            expect(determineWinner(team1, team2)).toBe('team1');
        });
        
        it('should use correct total as fourth tiebreaker', () => {
            const team1 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 95 };
            const team2 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 90 };
            
            expect(determineWinner(team1, team2)).toBe('team1');
        });
        
        it('should return draw when all tiebreakers are equal', () => {
            const team1 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 90 };
            const team2 = { score: 5000, accuracy: 0.9, avgSpeed: 1.0, maxStreak: 10, correctTotal: 90 };
            
            expect(determineWinner(team1, team2)).toBe('draw');
        });
    });
    
    describe('Constants', () => {
        it('should have correct game constants', () => {
            expect(POINTS_PER_CORRECT).toBe(100);
            expect(STREAK_BONUS).toBe(5);
            expect(QUESTIONS_PER_SLOT).toBe(5);
            expect(SLOTS_PER_ROUND).toBe(5);
            expect(ROUNDS_PER_HALF).toBe(4);
        });
        
        it('should calculate max possible round score', () => {
            // Perfect round with max streak: 25 questions, starting from 0
            // Q1-5: 100+0, 100+5, 100+10, 100+15, 100+20 = 550 per slot
            // But streak continues across slots...
            // Total for 25 Qs with streak: sum of (100 + 5*i) for i=0..24
            const maxRoundScore = Array.from({ length: 25 }, (_, i) => 100 + 5 * i)
                .reduce((sum, pts) => sum + pts, 0);
            
            expect(maxRoundScore).toBe(4000); // 100*25 + 5*(0+1+2+...+24) = 2500 + 1500
        });
    });
});


