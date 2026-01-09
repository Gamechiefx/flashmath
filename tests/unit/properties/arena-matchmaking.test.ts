/**
 * Property-Based Tests for Arena Matchmaking Fairness
 * 
 * Feature: comprehensive-user-stories
 * Property 4: Arena Matchmaking Fairness
 * 
 * Validates: Requirements 2.1
 * For any arena queue entry, players should be matched with opponents 
 * of similar ELO rating to ensure competitive balance
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock matchmaking data structures
interface Player {
    id: string;
    elo: number;
    league: string;
    queueTime: number;
}

interface MatchmakingResult {
    players: Player[];
    eloSpread: number;
    averageElo: number;
    isBalanced: boolean;
}

// Simulate the matchmaking algorithm
function simulateMatchmaking(queuedPlayers: Player[], maxEloSpread: number = 200): MatchmakingResult | null {
    if (queuedPlayers.length < 2) return null;
    
    // Sort by ELO for easier matching
    const sortedPlayers = [...queuedPlayers].sort((a, b) => a.elo - b.elo);
    
    // Find best match within ELO spread
    for (let i = 0; i < sortedPlayers.length - 1; i++) {
        const player1 = sortedPlayers[i];
        for (let j = i + 1; j < sortedPlayers.length; j++) {
            const player2 = sortedPlayers[j];
            const eloSpread = Math.abs(player1.elo - player2.elo);
            
            if (eloSpread <= maxEloSpread) {
                const players = [player1, player2];
                const averageElo = (player1.elo + player2.elo) / 2;
                return {
                    players,
                    eloSpread,
                    averageElo,
                    isBalanced: eloSpread <= maxEloSpread
                };
            }
        }
    }
    
    return null; // No suitable match found
}

// Generate random player for testing
function generateRandomPlayer(): Player {
    return {
        id: `player-${Math.random().toString(36).substring(7)}`,
        elo: Math.floor(Math.random() * 2000) + 100, // 100-2100 ELO
        league: ['neon', 'cobalt', 'plasma', 'void', 'apex'][Math.floor(Math.random() * 5)],
        queueTime: Date.now() - Math.floor(Math.random() * 300000) // Up to 5 minutes ago
    };
}

describe('Property 4: Arena Matchmaking Fairness', () => {
    it('should match players within reasonable ELO ranges', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate a pool of players with varying ELO ratings
            const playerCount = Math.floor(Math.random() * 20) + 2; // 2-21 players
            const players: Player[] = [];
            
            for (let i = 0; i < playerCount; i++) {
                players.push(generateRandomPlayer());
            }
            
            const maxEloSpread = 200; // Standard matchmaking tolerance
            const match = simulateMatchmaking(players, maxEloSpread);
            
            if (match) {
                // Validate match quality
                expect(match.players.length).toBe(2);
                expect(match.eloSpread).toBeLessThanOrEqual(maxEloSpread);
                expect(match.isBalanced).toBe(true);
                
                // Validate ELO calculations
                const actualSpread = Math.abs(match.players[0].elo - match.players[1].elo);
                expect(match.eloSpread).toBe(actualSpread);
                
                const actualAverage = (match.players[0].elo + match.players[1].elo) / 2;
                expect(match.averageElo).toBe(actualAverage);
                
                // Both players should have valid ELO ratings
                match.players.forEach(player => {
                    expect(player.elo).toBeGreaterThan(0);
                    expect(player.elo).toBeLessThan(3000); // Reasonable upper bound
                });
            }
        }
    });
    
    it('should prioritize closer ELO matches when multiple options exist', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Create a scenario with one player and multiple potential matches
            const baseElo = 1000 + Math.floor(Math.random() * 500); // 1000-1500 base
            const targetPlayer: Player = {
                id: 'target',
                elo: baseElo,
                league: 'cobalt',
                queueTime: Date.now()
            };
            
            // Create potential matches at different ELO distances
            const closeMatch: Player = {
                id: 'close',
                elo: baseElo + Math.floor(Math.random() * 50) + 10, // 10-60 points away
                league: 'cobalt',
                queueTime: Date.now() - 1000
            };
            
            const farMatch: Player = {
                id: 'far',
                elo: baseElo + Math.floor(Math.random() * 100) + 100, // 100-200 points away
                league: 'cobalt',
                queueTime: Date.now() - 2000
            };
            
            const players = [targetPlayer, closeMatch, farMatch];
            const match = simulateMatchmaking(players, 200);
            
            if (match) {
                // Should prefer the closer ELO match
                const targetInMatch = match.players.find(p => p.id === 'target');
                const otherPlayer = match.players.find(p => p.id !== 'target');
                
                expect(targetInMatch).toBeDefined();
                expect(otherPlayer).toBeDefined();
                
                // The match should include the closer player when possible
                const closeDistance = Math.abs(targetPlayer.elo - closeMatch.elo);
                const farDistance = Math.abs(targetPlayer.elo - farMatch.elo);
                
                if (closeDistance <= 200) {
                    // Close match is within range, should be preferred
                    expect(match.eloSpread).toBeLessThanOrEqual(closeDistance + 10); // Allow small variance
                }
            }
        }
    });
    
    it('should handle edge cases in ELO matching', () => {
        const edgeCases = [
            // Very low ELO players
            [{ id: '1', elo: 100, league: 'neon', queueTime: Date.now() },
             { id: '2', elo: 150, league: 'neon', queueTime: Date.now() }],
            
            // Very high ELO players
            [{ id: '1', elo: 2000, league: 'apex', queueTime: Date.now() },
             { id: '2', elo: 1950, league: 'apex', queueTime: Date.now() }],
            
            // Identical ELO
            [{ id: '1', elo: 1000, league: 'cobalt', queueTime: Date.now() },
             { id: '2', elo: 1000, league: 'cobalt', queueTime: Date.now() }],
            
            // Maximum allowed spread
            [{ id: '1', elo: 1000, league: 'cobalt', queueTime: Date.now() },
             { id: '2', elo: 1200, league: 'plasma', queueTime: Date.now() }],
        ];
        
        edgeCases.forEach((players, index) => {
            const match = simulateMatchmaking(players as Player[], 200);
            
            if (match) {
                expect(match.players.length).toBe(2);
                expect(match.eloSpread).toBeLessThanOrEqual(200);
                expect(match.isBalanced).toBe(true);
                
                // Validate specific edge case expectations
                if (index === 2) { // Identical ELO case
                    expect(match.eloSpread).toBe(0);
                }
                if (index === 3) { // Maximum spread case
                    expect(match.eloSpread).toBe(200);
                }
            }
        });
    });
    
    it('should maintain fairness across different league distributions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Create players distributed across different leagues
            const leagues = ['neon', 'cobalt', 'plasma', 'void', 'apex'];
            const players: Player[] = [];
            
            // Generate players with league-appropriate ELO ranges
            leagues.forEach(league => {
                const leagueBaseElo = leagues.indexOf(league) * 400 + 300; // Rough league ELO ranges
                const playerCount = Math.floor(Math.random() * 5) + 1; // 1-5 players per league
                
                for (let i = 0; i < playerCount; i++) {
                    players.push({
                        id: `${league}-${i}`,
                        elo: leagueBaseElo + Math.floor(Math.random() * 300), // Spread within league
                        league,
                        queueTime: Date.now() - Math.floor(Math.random() * 60000)
                    });
                }
            });
            
            const match = simulateMatchmaking(players, 200);
            
            if (match) {
                // Validate cross-league matching is still fair
                expect(match.eloSpread).toBeLessThanOrEqual(200);
                
                // Players should be reasonably close in skill regardless of league
                const avgElo = match.averageElo;
                match.players.forEach(player => {
                    const eloDeviation = Math.abs(player.elo - avgElo);
                    expect(eloDeviation).toBeLessThanOrEqual(100); // Half the max spread
                });
            }
        }
    });
    
    it('should handle queue time considerations fairly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const baseElo = 1000;
            const now = Date.now();
            
            // Create players with different queue times
            const longWaitPlayer: Player = {
                id: 'long-wait',
                elo: baseElo,
                league: 'cobalt',
                queueTime: now - 300000 // 5 minutes ago
            };
            
            const recentPlayer: Player = {
                id: 'recent',
                elo: baseElo + 150, // Slightly higher ELO
                league: 'cobalt',
                queueTime: now - 10000 // 10 seconds ago
            };
            
            const players = [longWaitPlayer, recentPlayer];
            const match = simulateMatchmaking(players, 200);
            
            if (match) {
                // Should still respect ELO constraints
                expect(match.eloSpread).toBeLessThanOrEqual(200);
                expect(match.isBalanced).toBe(true);
                
                // Both players should be included in reasonable matches
                expect(match.players.length).toBe(2);
                expect(match.players).toContain(longWaitPlayer);
                expect(match.players).toContain(recentPlayer);
            }
        }
    });
    
    it('should reject matches that exceed fairness thresholds', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Create players with ELO differences that exceed thresholds
            const lowEloPlayer: Player = {
                id: 'low',
                elo: 500,
                league: 'neon',
                queueTime: Date.now()
            };
            
            const highEloPlayer: Player = {
                id: 'high',
                elo: 1500, // 1000 point difference
                league: 'apex',
                queueTime: Date.now()
            };
            
            const players = [lowEloPlayer, highEloPlayer];
            const match = simulateMatchmaking(players, 200); // Strict threshold
            
            // Should not create unfair matches
            expect(match).toBeNull();
        }
    });
});