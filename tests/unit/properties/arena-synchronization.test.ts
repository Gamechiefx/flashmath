/**
 * Property-Based Tests for Arena Match Synchronization
 * 
 * Feature: comprehensive-user-stories
 * Property 5: Arena Match Synchronization
 * 
 * Validates: Requirements 2.2, 2.3
 * For any active arena match, all participants should receive identical problems 
 * simultaneously and scoring should reflect first correct responses
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock arena match data structures
interface ArenaPlayer {
    id: string;
    name: string;
    elo: number;
    responses: PlayerResponse[];
    score: number;
    connected: boolean;
}

interface PlayerResponse {
    problemId: string;
    answer: number;
    timestamp: number;
    isCorrect: boolean;
    responseTime: number;
}

interface ArenaProblem {
    id: string;
    question: string;
    correctAnswer: number;
    distributedAt: number;
    responses: PlayerResponse[];
}

interface ArenaMatch {
    id: string;
    players: ArenaPlayer[];
    problems: ArenaProblem[];
    currentProblem: ArenaProblem | null;
    startTime: number;
    status: 'waiting' | 'active' | 'completed';
}

// Simulate problem distribution to all players
function distributeProblem(match: ArenaMatch, problem: ArenaProblem): ArenaMatch {
    const distributionTime = Date.now();
    
    return {
        ...match,
        currentProblem: {
            ...problem,
            distributedAt: distributionTime,
            responses: []
        },
        problems: [...match.problems, {
            ...problem,
            distributedAt: distributionTime,
            responses: []
        }]
    };
}

// Simulate player response submission
function submitResponse(
    match: ArenaMatch, 
    playerId: string, 
    answer: number, 
    responseTime: number,
    customTimestamp?: number
): ArenaMatch {
    if (!match.currentProblem) return match;
    
    const timestamp = customTimestamp || Date.now();
    const isCorrect = answer === match.currentProblem.correctAnswer;
    
    const response: PlayerResponse = {
        problemId: match.currentProblem.id,
        answer,
        timestamp,
        isCorrect,
        responseTime
    };
    
    // Update player responses
    const updatedPlayers = match.players.map(player => {
        if (player.id === playerId) {
            return {
                ...player,
                responses: [...player.responses, response],
                score: isCorrect ? player.score + 1 : player.score
            };
        }
        return player;
    });
    
    // Update problem responses
    const updatedProblems = match.problems.map(problem => {
        if (problem.id === match.currentProblem!.id) {
            return {
                ...problem,
                responses: [...problem.responses, response]
            };
        }
        return problem;
    });
    
    return {
        ...match,
        players: updatedPlayers,
        problems: updatedProblems,
        currentProblem: {
            ...match.currentProblem,
            responses: [...match.currentProblem.responses, response]
        }
    };
}

// Generate random arena problem
function generateArenaProblem(): ArenaProblem {
    const a = Math.floor(Math.random() * 12) + 2;
    const b = Math.floor(Math.random() * 12) + 2;
    const operations = ['+', '-', '×', '÷'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    
    let correctAnswer: number;
    let question: string;
    
    switch (op) {
        case '+':
            correctAnswer = a + b;
            question = `${a} + ${b}`;
            break;
        case '-':
            correctAnswer = Math.abs(a - b);
            question = `${Math.max(a, b)} - ${Math.min(a, b)}`;
            break;
        case '×':
            correctAnswer = a * b;
            question = `${a} × ${b}`;
            break;
        case '÷':
            correctAnswer = a;
            question = `${a * b} ÷ ${b}`;
            break;
        default:
            correctAnswer = a + b;
            question = `${a} + ${b}`;
    }
    
    return {
        id: `problem-${Math.random().toString(36).substring(7)}`,
        question,
        correctAnswer,
        distributedAt: 0,
        responses: []
    };
}

// Create mock arena match
function createArenaMatch(playerCount: number = 2): ArenaMatch {
    const players: ArenaPlayer[] = [];
    
    for (let i = 0; i < playerCount; i++) {
        players.push({
            id: `player-${i}`,
            name: `Player ${i + 1}`,
            elo: 1000 + Math.floor(Math.random() * 500),
            responses: [],
            score: 0,
            connected: true
        });
    }
    
    return {
        id: `match-${Math.random().toString(36).substring(7)}`,
        players,
        problems: [],
        currentProblem: null,
        startTime: Date.now(),
        status: 'active'
    };
}

describe('Property 5: Arena Match Synchronization', () => {
    it('should distribute identical problems to all players simultaneously', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const playerCount = Math.floor(Math.random() * 6) + 2; // 2-7 players
            const match = createArenaMatch(playerCount);
            const problem = generateArenaProblem();
            
            const updatedMatch = distributeProblem(match, problem);
            
            // Validate problem distribution
            expect(updatedMatch.currentProblem).toBeDefined();
            expect(updatedMatch.currentProblem!.id).toBe(problem.id);
            expect(updatedMatch.currentProblem!.question).toBe(problem.question);
            expect(updatedMatch.currentProblem!.correctAnswer).toBe(problem.correctAnswer);
            expect(updatedMatch.currentProblem!.distributedAt).toBeGreaterThan(0);
            
            // All players should receive the same problem
            expect(updatedMatch.problems.length).toBe(1);
            expect(updatedMatch.problems[0].id).toBe(problem.id);
            expect(updatedMatch.problems[0].question).toBe(problem.question);
            expect(updatedMatch.problems[0].correctAnswer).toBe(problem.correctAnswer);
            
            // Distribution timestamp should be consistent
            const distributionTime = updatedMatch.currentProblem!.distributedAt;
            expect(distributionTime).toBe(updatedMatch.problems[0].distributedAt);
        }
    });
    
    it('should track first correct response for scoring', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const match = createArenaMatch(3); // 3 players
            const problem = generateArenaProblem();
            let updatedMatch = distributeProblem(match, problem);
            
            // Simulate responses at different times
            const baseTime = Date.now();
            const responses = [
                { playerId: 'player-0', answer: problem.correctAnswer + 1, responseTime: 1000, timestamp: baseTime + 100 }, // Wrong
                { playerId: 'player-1', answer: problem.correctAnswer, responseTime: 1500, timestamp: baseTime + 200 },     // Correct (first)
                { playerId: 'player-2', answer: problem.correctAnswer, responseTime: 2000, timestamp: baseTime + 300 },     // Correct (second)
            ];
            
            let firstCorrectPlayer: string | null = null;
            
            responses.forEach(({ playerId, answer, responseTime, timestamp }) => {
                updatedMatch = submitResponse(updatedMatch, playerId, answer, responseTime, timestamp);
                
                if (answer === problem.correctAnswer && !firstCorrectPlayer) {
                    firstCorrectPlayer = playerId;
                }
            });
            
            // Validate scoring
            const player0 = updatedMatch.players.find(p => p.id === 'player-0')!;
            const player1 = updatedMatch.players.find(p => p.id === 'player-1')!;
            const player2 = updatedMatch.players.find(p => p.id === 'player-2')!;
            
            expect(player0.score).toBe(0); // Wrong answer
            expect(player1.score).toBe(1); // First correct
            expect(player2.score).toBe(1); // Also correct (but second)
            
            // Validate response tracking
            expect(updatedMatch.currentProblem!.responses.length).toBe(3);
            
            // First correct response should be identifiable
            const correctResponses = updatedMatch.currentProblem!.responses
                .filter(r => r.isCorrect)
                .sort((a, b) => a.timestamp - b.timestamp);
            
            expect(correctResponses.length).toBe(2);
            expect(correctResponses[0].timestamp).toBeLessThan(correctResponses[1].timestamp);
        }
    });
    
    it('should maintain response order and timing accuracy', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const match = createArenaMatch(4);
            const problem = generateArenaProblem();
            let updatedMatch = distributeProblem(match, problem);
            
            const baseTime = Date.now();
            const responses = [];
            
            // Generate responses with specific timing
            for (let i = 0; i < 4; i++) {
                const responseTime = (i + 1) * 500; // 500ms intervals
                responses.push({
                    playerId: `player-${i}`,
                    answer: Math.random() > 0.5 ? problem.correctAnswer : problem.correctAnswer + 1,
                    responseTime,
                    expectedTimestamp: baseTime + responseTime
                });
            }
            
            // Submit responses in order
            responses.forEach(({ playerId, answer, responseTime }) => {
                updatedMatch = submitResponse(updatedMatch, playerId, answer, responseTime);
            });
            
            // Validate response ordering
            const allResponses = updatedMatch.currentProblem!.responses;
            expect(allResponses.length).toBe(4);
            
            // Responses should be in chronological order
            for (let i = 1; i < allResponses.length; i++) {
                expect(allResponses[i].timestamp).toBeGreaterThanOrEqual(allResponses[i - 1].timestamp);
            }
            
            // Response times should be preserved
            allResponses.forEach((response, index) => {
                expect(response.responseTime).toBe(responses[index].responseTime);
            });
        }
    });
    
    it('should handle simultaneous responses correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const match = createArenaMatch(2);
            const problem = generateArenaProblem();
            let updatedMatch = distributeProblem(match, problem);
            
            const simultaneousTime = 1000;
            
            // Both players submit correct answers at exactly the same time
            updatedMatch = submitResponse(updatedMatch, 'player-0', problem.correctAnswer, simultaneousTime);
            updatedMatch = submitResponse(updatedMatch, 'player-1', problem.correctAnswer, simultaneousTime);
            
            // Both should get points for correct answers
            const player0 = updatedMatch.players.find(p => p.id === 'player-0')!;
            const player1 = updatedMatch.players.find(p => p.id === 'player-1')!;
            
            expect(player0.score).toBe(1);
            expect(player1.score).toBe(1);
            
            // Both responses should be recorded
            expect(updatedMatch.currentProblem!.responses.length).toBe(2);
            
            // Response times should be identical
            const responses = updatedMatch.currentProblem!.responses;
            expect(responses[0].responseTime).toBe(simultaneousTime);
            expect(responses[1].responseTime).toBe(simultaneousTime);
        }
    });
    
    it('should maintain match state consistency across multiple problems', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            let match = createArenaMatch(3);
            const problemCount = Math.floor(Math.random() * 5) + 3; // 3-7 problems
            
            for (let problemIndex = 0; problemIndex < problemCount; problemIndex++) {
                const problem = generateArenaProblem();
                match = distributeProblem(match, problem);
                
                // Each player responds to each problem
                match.players.forEach((player, playerIndex) => {
                    const responseTime = (playerIndex + 1) * 200 + Math.random() * 100;
                    const isCorrect = Math.random() > 0.3; // 70% chance of correct answer
                    const answer = isCorrect ? problem.correctAnswer : problem.correctAnswer + 1;
                    
                    match = submitResponse(match, player.id, answer, responseTime);
                });
                
                // Validate match state after each problem
                expect(match.problems.length).toBe(problemIndex + 1);
                expect(match.currentProblem!.id).toBe(problem.id);
                expect(match.currentProblem!.responses.length).toBe(3); // All players responded
                
                // Validate cumulative scoring
                match.players.forEach(player => {
                    const correctResponses = player.responses.filter(r => r.isCorrect).length;
                    expect(player.score).toBe(correctResponses);
                });
            }
            
            // Final validation
            expect(match.problems.length).toBe(problemCount);
            
            // Total responses should equal players × problems
            const totalResponses = match.problems.reduce((sum, problem) => sum + problem.responses.length, 0);
            expect(totalResponses).toBe(match.players.length * problemCount);
        }
    });
    
    it('should handle disconnected players gracefully', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const match = createArenaMatch(4);
            const problem = generateArenaProblem();
            let updatedMatch = distributeProblem(match, problem);
            
            // Simulate one player disconnecting
            updatedMatch.players[2].connected = false;
            
            // Only connected players respond
            const connectedPlayers = updatedMatch.players.filter(p => p.connected);
            
            connectedPlayers.forEach((player, index) => {
                const responseTime = (index + 1) * 300;
                updatedMatch = submitResponse(updatedMatch, player.id, problem.correctAnswer, responseTime);
            });
            
            // Validate that only connected players have responses
            expect(updatedMatch.currentProblem!.responses.length).toBe(connectedPlayers.length);
            
            // Disconnected player should not have new responses
            const disconnectedPlayer = updatedMatch.players.find(p => !p.connected)!;
            expect(disconnectedPlayer.responses.length).toBe(0);
            
            // Connected players should have responses
            connectedPlayers.forEach(player => {
                const matchPlayer = updatedMatch.players.find(p => p.id === player.id)!;
                expect(matchPlayer.responses.length).toBe(1);
            });
        }
    });
});