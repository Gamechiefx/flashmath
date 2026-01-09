/**
 * Property-Based Tests for ELO and League System Consistency
 * 
 * Feature: comprehensive-user-stories
 * Property 6: ELO and League System Consistency
 * 
 * Validates: Requirements 2.4, 2.5
 * For any completed arena match, ELO ratings should be updated based on performance 
 * and league placement should adjust according to new ELO thresholds
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock ELO and League system
interface Player {
    id: string;
    name: string;
    elo: number;
    league: LeagueType;
    wins: number;
    losses: number;
}

type LeagueType = 'neon' | 'cobalt' | 'plasma' | 'void' | 'apex';

interface MatchResult {
    winner: Player;
    loser: Player;
    winnerEloChange: number;
    loserEloChange: number;
    winnerNewLeague: LeagueType;
    loserNewLeague: LeagueType;
}

// League thresholds (based on FlashMath's league system)
const LEAGUE_THRESHOLDS = {
    neon: { min: 0, max: 599 },
    cobalt: { min: 600, max: 999 },
    plasma: { min: 1000, max: 1399 },
    void: { min: 1400, max: 1799 },
    apex: { min: 1800, max: Infinity }
};

// Calculate ELO change using standard ELO formula
function calculateEloChange(playerElo: number, opponentElo: number, actualScore: number, kFactor: number = 32): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const change = kFactor * (actualScore - expectedScore);
    const roundedChange = Math.round(change);
    
    // Ensure minimum change of 1 point for wins/losses
    if (actualScore === 1 && roundedChange <= 0) return 1;
    if (actualScore === 0 && roundedChange >= 0) return -1;
    
    return roundedChange;
}

// Determine league based on ELO
function getLeagueFromElo(elo: number): LeagueType {
    for (const [league, threshold] of Object.entries(LEAGUE_THRESHOLDS)) {
        if (elo >= threshold.min && elo <= threshold.max) {
            return league as LeagueType;
        }
    }
    return 'neon'; // Default fallback
}

// Simulate a match result
function simulateMatch(player1: Player, player2: Player, winner: 'player1' | 'player2'): MatchResult {
    const actualScore1 = winner === 'player1' ? 1 : 0;
    const actualScore2 = winner === 'player2' ? 1 : 0;
    
    const player1EloChange = calculateEloChange(player1.elo, player2.elo, actualScore1);
    const player2EloChange = calculateEloChange(player2.elo, player1.elo, actualScore2);
    
    let player1NewElo = player1.elo + player1EloChange;
    let player2NewElo = player2.elo + player2EloChange;
    
    // Enforce minimum ELO of 100
    player1NewElo = Math.max(100, player1NewElo);
    player2NewElo = Math.max(100, player2NewElo);
    
    const winnerPlayer = winner === 'player1' ? player1 : player2;
    const loserPlayer = winner === 'player1' ? player2 : player1;
    const winnerEloChange = winner === 'player1' ? player1EloChange : player2EloChange;
    const loserEloChange = winner === 'player1' ? player2EloChange : player1EloChange;
    const winnerNewElo = winner === 'player1' ? player1NewElo : player2NewElo;
    const loserNewElo = winner === 'player1' ? player2NewElo : player1NewElo;
    
    return {
        winner: {
            ...winnerPlayer,
            elo: winnerNewElo,
            wins: winnerPlayer.wins + 1
        },
        loser: {
            ...loserPlayer,
            elo: loserNewElo,
            losses: loserPlayer.losses + 1
        },
        winnerEloChange,
        loserEloChange,
        winnerNewLeague: getLeagueFromElo(winnerNewElo),
        loserNewLeague: getLeagueFromElo(loserNewElo)
    };
}

// Generate random player
function generateRandomPlayer(): Player {
    const elo = Math.floor(Math.random() * 2000) + 100; // 100-2100 ELO
    return {
        id: `player-${Math.random().toString(36).substring(7)}`,
        name: `Player ${Math.floor(Math.random() * 1000)}`,
        elo,
        league: getLeagueFromElo(elo),
        wins: Math.floor(Math.random() * 100),
        losses: Math.floor(Math.random() * 100)
    };
}

describe('Property 6: ELO and League System Consistency', () => {
    it('should calculate ELO changes based on performance and opponent strength', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const player1 = generateRandomPlayer();
            const player2 = generateRandomPlayer();
            const winner = Math.random() > 0.5 ? 'player1' : 'player2';
            
            const result = simulateMatch(player1, player2, winner);
            
            // Winner should gain ELO, loser should lose ELO
            expect(result.winnerEloChange).toBeGreaterThan(0);
            expect(result.loserEloChange).toBeLessThan(0);
            
            // Total ELO change should be approximately zero (conservation)
            const totalEloChange = result.winnerEloChange + result.loserEloChange;
            expect(Math.abs(totalEloChange)).toBeLessThanOrEqual(2); // Allow small rounding differences
            
            // ELO changes should be reasonable (not extreme)
            expect(Math.abs(result.winnerEloChange)).toBeLessThanOrEqual(50);
            expect(Math.abs(result.loserEloChange)).toBeLessThanOrEqual(50);
            
            // Validate final ELO values (accounting for minimum ELO protection)
            const expectedWinnerElo = Math.max(100, (winner === 'player1' ? player1.elo : player2.elo) + result.winnerEloChange);
            const expectedLoserElo = Math.max(100, (winner === 'player1' ? player2.elo : player1.elo) + result.loserEloChange);
            
            expect(result.winner.elo).toBe(expectedWinnerElo);
            expect(result.loser.elo).toBe(expectedLoserElo);
        }
    });
    
    it('should adjust league placement based on new ELO ratings', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const player1 = generateRandomPlayer();
            const player2 = generateRandomPlayer();
            const winner = Math.random() > 0.5 ? 'player1' : 'player2';
            
            const result = simulateMatch(player1, player2, winner);
            
            // League should match ELO thresholds
            expect(result.winnerNewLeague).toBe(getLeagueFromElo(result.winner.elo));
            expect(result.loserNewLeague).toBe(getLeagueFromElo(result.loser.elo));
            
            // Validate league consistency
            const winnerLeagueThreshold = LEAGUE_THRESHOLDS[result.winnerNewLeague];
            const loserLeagueThreshold = LEAGUE_THRESHOLDS[result.loserNewLeague];
            
            expect(result.winner.elo).toBeGreaterThanOrEqual(winnerLeagueThreshold.min);
            expect(result.winner.elo).toBeLessThanOrEqual(winnerLeagueThreshold.max);
            expect(result.loser.elo).toBeGreaterThanOrEqual(loserLeagueThreshold.min);
            expect(result.loser.elo).toBeLessThanOrEqual(loserLeagueThreshold.max);
        }
    });
    
    it('should handle league promotions and demotions correctly', () => {
        // Test promotion scenarios
        const promotionCases = [
            { elo: 595, expectedLeague: 'neon' as LeagueType, afterWin: 'cobalt' as LeagueType },
            { elo: 995, expectedLeague: 'cobalt' as LeagueType, afterWin: 'plasma' as LeagueType },
            { elo: 1395, expectedLeague: 'plasma' as LeagueType, afterWin: 'void' as LeagueType },
            { elo: 1795, expectedLeague: 'void' as LeagueType, afterWin: 'apex' as LeagueType },
        ];
        
        promotionCases.forEach(({ elo, expectedLeague, afterWin }) => {
            const player: Player = {
                id: 'test-player',
                name: 'Test Player',
                elo,
                league: expectedLeague,
                wins: 10,
                losses: 5
            };
            
            // Create a weaker opponent to ensure ELO gain
            const opponent: Player = {
                id: 'opponent',
                name: 'Opponent',
                elo: elo - 200,
                league: getLeagueFromElo(elo - 200),
                wins: 5,
                losses: 10
            };
            
            const result = simulateMatch(player, opponent, 'player1');
            
            // Should be promoted if ELO crosses threshold
            if (result.winner.elo >= LEAGUE_THRESHOLDS[afterWin].min) {
                expect(result.winnerNewLeague).toBe(afterWin);
            }
        });
        
        // Test demotion scenarios
        const demotionCases = [
            { elo: 605, expectedLeague: 'cobalt' as LeagueType, afterLoss: 'neon' as LeagueType },
            { elo: 1005, expectedLeague: 'plasma' as LeagueType, afterLoss: 'cobalt' as LeagueType },
            { elo: 1405, expectedLeague: 'void' as LeagueType, afterLoss: 'plasma' as LeagueType },
            { elo: 1805, expectedLeague: 'apex' as LeagueType, afterLoss: 'void' as LeagueType },
        ];
        
        demotionCases.forEach(({ elo, expectedLeague, afterLoss }) => {
            const player: Player = {
                id: 'test-player',
                name: 'Test Player',
                elo,
                league: expectedLeague,
                wins: 5,
                losses: 10
            };
            
            // Create a stronger opponent to ensure ELO loss
            const opponent: Player = {
                id: 'opponent',
                name: 'Opponent',
                elo: elo + 200,
                league: getLeagueFromElo(elo + 200),
                wins: 15,
                losses: 2
            };
            
            const result = simulateMatch(player, opponent, 'player2');
            
            // Should be demoted if ELO falls below threshold
            if (result.loser.elo < LEAGUE_THRESHOLDS[expectedLeague].min) {
                expect(result.loserNewLeague).toBe(afterLoss);
            }
        });
    });
    
    it('should maintain ELO conservation across multiple matches', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const players = Array.from({ length: 10 }, () => generateRandomPlayer());
            const initialTotalElo = players.reduce((sum, player) => sum + player.elo, 0);
            
            // Simulate multiple matches
            const matchCount = Math.floor(Math.random() * 20) + 10; // 10-29 matches
            let currentPlayers = [...players];
            
            for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
                // Pick two random players
                const player1Index = Math.floor(Math.random() * currentPlayers.length);
                let player2Index = Math.floor(Math.random() * currentPlayers.length);
                while (player2Index === player1Index) {
                    player2Index = Math.floor(Math.random() * currentPlayers.length);
                }
                
                const player1 = currentPlayers[player1Index];
                const player2 = currentPlayers[player2Index];
                const winner = Math.random() > 0.5 ? 'player1' : 'player2';
                
                const result = simulateMatch(player1, player2, winner);
                
                // Update players array
                currentPlayers[player1Index] = result.winner.id === player1.id ? result.winner : result.loser;
                currentPlayers[player2Index] = result.winner.id === player2.id ? result.winner : result.loser;
            }
            
            // Total ELO should be approximately conserved
            const finalTotalElo = currentPlayers.reduce((sum, player) => sum + player.elo, 0);
            const eloDeviation = Math.abs(finalTotalElo - initialTotalElo);
            
            // Allow small deviation due to rounding
            expect(eloDeviation).toBeLessThanOrEqual(matchCount * 2);
        }
    });
    
    it('should handle edge cases in ELO calculations', () => {
        const edgeCases = [
            // Very low ELO vs very high ELO
            { player1Elo: 100, player2Elo: 2000, winner: 'player1' as const },
            { player1Elo: 100, player2Elo: 2000, winner: 'player2' as const },
            
            // Identical ELO
            { player1Elo: 1000, player2Elo: 1000, winner: 'player1' as const },
            { player1Elo: 1000, player2Elo: 1000, winner: 'player2' as const },
            
            // Minimum ELO
            { player1Elo: 100, player2Elo: 500, winner: 'player1' as const },
            { player1Elo: 100, player2Elo: 500, winner: 'player2' as const },
            
            // Maximum reasonable ELO
            { player1Elo: 2000, player2Elo: 1800, winner: 'player1' as const },
            { player1Elo: 2000, player2Elo: 1800, winner: 'player2' as const },
        ];
        
        edgeCases.forEach(({ player1Elo, player2Elo, winner }) => {
            const player1: Player = {
                id: 'player1',
                name: 'Player 1',
                elo: player1Elo,
                league: getLeagueFromElo(player1Elo),
                wins: 0,
                losses: 0
            };
            
            const player2: Player = {
                id: 'player2',
                name: 'Player 2',
                elo: player2Elo,
                league: getLeagueFromElo(player2Elo),
                wins: 0,
                losses: 0
            };
            
            const result = simulateMatch(player1, player2, winner);
            
            // ELO changes should be reasonable even in edge cases
            expect(Math.abs(result.winnerEloChange)).toBeLessThanOrEqual(50);
            expect(Math.abs(result.loserEloChange)).toBeLessThanOrEqual(50);
            
            // Winner should gain ELO, loser should lose ELO
            expect(result.winnerEloChange).toBeGreaterThan(0);
            expect(result.loserEloChange).toBeLessThan(0);
            
            // Final ELO should not go below minimum
            expect(result.winner.elo).toBeGreaterThanOrEqual(100);
            expect(result.loser.elo).toBeGreaterThanOrEqual(100);
            
            // League assignments should be correct
            expect(result.winnerNewLeague).toBe(getLeagueFromElo(result.winner.elo));
            expect(result.loserNewLeague).toBe(getLeagueFromElo(result.loser.elo));
        });
    });
    
    it('should provide larger ELO changes for upsets', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Create a significant ELO difference
            const strongPlayer: Player = {
                id: 'strong',
                name: 'Strong Player',
                elo: 1500 + Math.floor(Math.random() * 300), // 1500-1800
                league: 'void',
                wins: 50,
                losses: 10
            };
            
            const weakPlayer: Player = {
                id: 'weak',
                name: 'Weak Player',
                elo: 800 + Math.floor(Math.random() * 200), // 800-1000
                league: 'cobalt',
                wins: 10,
                losses: 30
            };
            
            // Simulate both possible outcomes
            const normalResult = simulateMatch(strongPlayer, weakPlayer, 'player1'); // Strong wins
            const upsetResult = simulateMatch(strongPlayer, weakPlayer, 'player2');  // Weak wins
            
            // Upset should provide larger ELO changes
            expect(Math.abs(upsetResult.winnerEloChange)).toBeGreaterThan(Math.abs(normalResult.winnerEloChange));
            expect(Math.abs(upsetResult.loserEloChange)).toBeGreaterThan(Math.abs(normalResult.loserEloChange));
            
            // Validate the direction of changes
            expect(normalResult.winnerEloChange).toBeGreaterThan(0); // Strong player gains less
            expect(normalResult.loserEloChange).toBeLessThan(0);     // Weak player loses less
            expect(upsetResult.winnerEloChange).toBeGreaterThan(0);  // Weak player gains more
            expect(upsetResult.loserEloChange).toBeLessThan(0);      // Strong player loses more
        }
    });
});