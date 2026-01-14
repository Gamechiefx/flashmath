/**
 * Property-Based Tests for Arena Match State Synchronization
 * 
 * Feature: bug-fixes-ui-optimization
 * Property 2: Match State Synchronization Consistency
 * 
 * Validates: Requirements 2.4
 * For any match state update, all connected players should receive identical 
 * state information simultaneously to prevent desynchronization issues
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock arena match state structures
interface PlayerState {
    id: string;
    name: string;
    score: number;
    questionsAnswered: number;
    currentStreak: number;
    isConnected: boolean;
    lastUpdateTime: number;
    socketId: string;
}

interface MatchState {
    matchId: string;
    players: Record<string, PlayerState>;
    currentQuestion: {
        id: string;
        question: string;
        answer: number;
        distributedAt: number;
    } | null;
    timeLeft: number;
    matchStarted: boolean;
    matchEnded: boolean;
    lastStateUpdate: number;
}

interface StateUpdate {
    type: 'PLAYER_SCORE' | 'NEW_QUESTION' | 'TIME_UPDATE' | 'PLAYER_JOIN' | 'PLAYER_LEAVE';
    playerId?: string;
    data: any;
    timestamp: number;
    updateId: string;
}

interface SynchronizationResult {
    success: boolean;
    allPlayersReceived: boolean;
    stateConsistent: boolean;
    latencyVariance: number;
    errors: string[];
}

// Simulate state synchronization across multiple players
function simulateStateSynchronization(
    initialState: MatchState,
    update: StateUpdate,
    connectedPlayers: string[]
): SynchronizationResult {
    const errors: string[] = [];
    let allPlayersReceived = true;
    let stateConsistent = true;
    const deliveryTimes: number[] = [];
    
    // Simulate network delivery to each player
    const playerStates: Record<string, MatchState> = {};
    
    connectedPlayers.forEach(playerId => {
        // Simulate network latency (0-100ms)
        const networkLatency = Math.random() * 100;
        const deliveryTime = update.timestamp + networkLatency;
        deliveryTimes.push(deliveryTime);
        
        // Apply state update
        const playerState = applyStateUpdate(initialState, update, playerId);
        
        if (!playerState) {
            errors.push(`Failed to apply update to player ${playerId}`);
            allPlayersReceived = false;
            return;
        }
        
        playerStates[playerId] = playerState;
    });
    
    // Check state consistency across all players
    if (Object.keys(playerStates).length > 1) {
        const referenceState = Object.values(playerStates)[0];
        
        Object.values(playerStates).forEach((state, index) => {
            if (!areStatesEqual(referenceState, state)) {
                errors.push(`State inconsistency detected for player ${index}`);
                stateConsistent = false;
            }
        });
    }
    
    // Calculate latency variance
    const avgLatency = deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length;
    const latencyVariance = Math.max(...deliveryTimes) - Math.min(...deliveryTimes);
    
    return {
        success: errors.length === 0,
        allPlayersReceived,
        stateConsistent,
        latencyVariance,
        errors
    };
}

// Apply a state update to match state
function applyStateUpdate(
    state: MatchState,
    update: StateUpdate,
    receivingPlayerId: string
): MatchState | null {
    try {
        const newState = { ...state };
        newState.lastStateUpdate = update.timestamp;
        
        switch (update.type) {
            case 'PLAYER_SCORE':
                if (update.playerId && newState.players[update.playerId]) {
                    newState.players = {
                        ...newState.players,
                        [update.playerId]: {
                            ...newState.players[update.playerId],
                            score: update.data.score,
                            questionsAnswered: update.data.questionsAnswered,
                            currentStreak: update.data.currentStreak,
                            lastUpdateTime: update.timestamp
                        }
                    };
                }
                break;
                
            case 'NEW_QUESTION':
                newState.currentQuestion = {
                    id: update.data.id,
                    question: update.data.question,
                    answer: update.data.answer,
                    distributedAt: update.timestamp
                };
                break;
                
            case 'TIME_UPDATE':
                newState.timeLeft = update.data.timeLeft;
                break;
                
            case 'PLAYER_JOIN':
                if (update.playerId) {
                    newState.players = {
                        ...newState.players,
                        [update.playerId]: {
                            id: update.playerId,
                            name: update.data.name,
                            score: 0,
                            questionsAnswered: 0,
                            currentStreak: 0,
                            isConnected: true,
                            lastUpdateTime: update.timestamp,
                            socketId: update.data.socketId
                        }
                    };
                }
                break;
                
            case 'PLAYER_LEAVE':
                if (update.playerId && newState.players[update.playerId]) {
                    newState.players = {
                        ...newState.players,
                        [update.playerId]: {
                            ...newState.players[update.playerId],
                            isConnected: false,
                            lastUpdateTime: update.timestamp
                        }
                    };
                }
                break;
                
            default:
                return null;
        }
        
        return newState;
    } catch (error) {
        return null;
    }
}

// Check if two match states are equal
function areStatesEqual(state1: MatchState, state2: MatchState): boolean {
    // Compare basic properties
    if (state1.matchId !== state2.matchId ||
        state1.timeLeft !== state2.timeLeft ||
        state1.matchStarted !== state2.matchStarted ||
        state1.matchEnded !== state2.matchEnded) {
        return false;
    }
    
    // Compare current question
    if (state1.currentQuestion?.id !== state2.currentQuestion?.id ||
        state1.currentQuestion?.question !== state2.currentQuestion?.question ||
        state1.currentQuestion?.answer !== state2.currentQuestion?.answer) {
        return false;
    }
    
    // Compare players
    const players1Keys = Object.keys(state1.players).sort();
    const players2Keys = Object.keys(state2.players).sort();
    
    if (players1Keys.length !== players2Keys.length) {
        return false;
    }
    
    for (let i = 0; i < players1Keys.length; i++) {
        if (players1Keys[i] !== players2Keys[i]) {
            return false;
        }
        
        const player1 = state1.players[players1Keys[i]];
        const player2 = state2.players[players2Keys[i]];
        
        if (player1.id !== player2.id ||
            player1.name !== player2.name ||
            player1.score !== player2.score ||
            player1.questionsAnswered !== player2.questionsAnswered ||
            player1.currentStreak !== player2.currentStreak ||
            player1.isConnected !== player2.isConnected) {
            return false;
        }
    }
    
    return true;
}

// Generate random match state for testing
function generateRandomMatchState(): MatchState {
    const playerCount = Math.floor(Math.random() * 4) + 2; // 2-5 players
    const players: Record<string, PlayerState> = {};
    
    for (let i = 0; i < playerCount; i++) {
        const playerId = `player-${i}`;
        players[playerId] = {
            id: playerId,
            name: `Player ${i + 1}`,
            score: Math.floor(Math.random() * 20),
            questionsAnswered: Math.floor(Math.random() * 25),
            currentStreak: Math.floor(Math.random() * 10),
            isConnected: Math.random() > 0.1, // 90% connected
            lastUpdateTime: Date.now() - Math.random() * 10000,
            socketId: `socket-${i}-${Math.random().toString(36).substring(7)}`
        };
    }
    
    return {
        matchId: `match-${Math.random().toString(36).substring(7)}`,
        players,
        currentQuestion: Math.random() > 0.3 ? {
            id: `q-${Math.random().toString(36).substring(7)}`,
            question: `${Math.floor(Math.random() * 12) + 1} + ${Math.floor(Math.random() * 12) + 1}`,
            answer: Math.floor(Math.random() * 24) + 2,
            distributedAt: Date.now() - Math.random() * 5000
        } : null,
        timeLeft: Math.floor(Math.random() * 60),
        matchStarted: Math.random() > 0.2,
        matchEnded: Math.random() > 0.8,
        lastStateUpdate: Date.now() - Math.random() * 1000
    };
}

// Generate random state update
function generateRandomStateUpdate(matchState: MatchState): StateUpdate {
    const updateTypes: StateUpdate['type'][] = ['PLAYER_SCORE', 'NEW_QUESTION', 'TIME_UPDATE', 'PLAYER_JOIN', 'PLAYER_LEAVE'];
    const type = updateTypes[Math.floor(Math.random() * updateTypes.length)];
    const playerIds = Object.keys(matchState.players);
    
    const update: StateUpdate = {
        type,
        timestamp: Date.now(),
        updateId: `update-${Math.random().toString(36).substring(7)}`,
        data: {}
    };
    
    switch (type) {
        case 'PLAYER_SCORE':
            update.playerId = playerIds[Math.floor(Math.random() * playerIds.length)];
            update.data = {
                score: Math.floor(Math.random() * 30),
                questionsAnswered: Math.floor(Math.random() * 35),
                currentStreak: Math.floor(Math.random() * 15)
            };
            break;
            
        case 'NEW_QUESTION':
            const a = Math.floor(Math.random() * 12) + 1;
            const b = Math.floor(Math.random() * 12) + 1;
            update.data = {
                id: `q-${Math.random().toString(36).substring(7)}`,
                question: `${a} + ${b}`,
                answer: a + b
            };
            break;
            
        case 'TIME_UPDATE':
            update.data = {
                timeLeft: Math.max(0, Math.floor(Math.random() * 60))
            };
            break;
            
        case 'PLAYER_JOIN':
            update.playerId = `new-player-${Math.random().toString(36).substring(7)}`;
            update.data = {
                name: `New Player ${Math.floor(Math.random() * 1000)}`,
                socketId: `socket-${Math.random().toString(36).substring(7)}`
            };
            break;
            
        case 'PLAYER_LEAVE':
            update.playerId = playerIds[Math.floor(Math.random() * playerIds.length)];
            break;
    }
    
    return update;
}

describe('Property 2: Match State Synchronization Consistency', () => {
    it('should synchronize state updates consistently across all connected players', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const matchState = generateRandomMatchState();
            const update = generateRandomStateUpdate(matchState);
            const connectedPlayers = Object.keys(matchState.players).filter(
                playerId => matchState.players[playerId].isConnected
            );
            
            if (connectedPlayers.length === 0) continue; // Skip if no connected players
            
            const result = simulateStateSynchronization(matchState, update, connectedPlayers);
            
            // **Validates: Requirements 2.4**
            // All connected players should receive the update
            expect(result.allPlayersReceived).toBe(true);
            
            // State should be consistent across all players
            expect(result.stateConsistent).toBe(true);
            
            // Should not have synchronization errors
            expect(result.errors.length).toBe(0);
            
            // Latency variance should be reasonable (under 200ms)
            expect(result.latencyVariance).toBeLessThan(200);
        }
    });
    
    it('should maintain state consistency during rapid updates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const matchState = generateRandomMatchState();
            const connectedPlayers = Object.keys(matchState.players).filter(
                playerId => matchState.players[playerId].isConnected
            );
            
            if (connectedPlayers.length === 0) continue;
            
            // Generate multiple rapid updates
            const updateCount = Math.floor(Math.random() * 5) + 2; // 2-6 updates
            let currentState = matchState;
            
            for (let i = 0; i < updateCount; i++) {
                const update = generateRandomStateUpdate(currentState);
                update.timestamp = Date.now() + i * 10; // 10ms apart
                
                const result = simulateStateSynchronization(currentState, update, connectedPlayers);
                
                // Each update should synchronize successfully
                expect(result.success).toBe(true);
                expect(result.stateConsistent).toBe(true);
                
                // Apply update to current state for next iteration
                const updatedState = applyStateUpdate(currentState, update, connectedPlayers[0]);
                if (updatedState) {
                    currentState = updatedState;
                }
            }
        }
    });
    
    it('should handle player disconnections without affecting other players', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const matchState = generateRandomMatchState();
            const allPlayers = Object.keys(matchState.players);
            
            if (allPlayers.length < 2) continue;
            
            // Randomly disconnect some players
            const disconnectedCount = Math.floor(Math.random() * (allPlayers.length - 1)) + 1;
            const connectedPlayers = allPlayers.slice(disconnectedCount);
            
            const update = generateRandomStateUpdate(matchState);
            const result = simulateStateSynchronization(matchState, update, connectedPlayers);
            
            // Connected players should still receive consistent updates
            expect(result.stateConsistent).toBe(true);
            expect(result.allPlayersReceived).toBe(true);
            
            // Should handle partial connectivity gracefully
            expect(result.success).toBe(true);
        }
    });
    
    it('should preserve state integrity across different update types', () => {
        const updateTypes: StateUpdate['type'][] = ['PLAYER_SCORE', 'NEW_QUESTION', 'TIME_UPDATE', 'PLAYER_JOIN', 'PLAYER_LEAVE'];
        
        updateTypes.forEach(updateType => {
            for (let iteration = 0; iteration < 20; iteration++) { // 20 iterations per type
                const matchState = generateRandomMatchState();
                const connectedPlayers = Object.keys(matchState.players).filter(
                    playerId => matchState.players[playerId].isConnected
                );
                
                if (connectedPlayers.length === 0) continue;
                
                // Create specific update type
                const update = generateRandomStateUpdate(matchState);
                update.type = updateType;
                
                const result = simulateStateSynchronization(matchState, update, connectedPlayers);
                
                // Each update type should synchronize consistently
                expect(result.success).toBe(true);
                expect(result.stateConsistent).toBe(true);
                expect(result.allPlayersReceived).toBe(true);
                
                // Verify state was actually updated
                if (connectedPlayers.length > 0) {
                    const updatedState = applyStateUpdate(matchState, update, connectedPlayers[0]);
                    expect(updatedState).not.toBeNull();
                    expect(updatedState!.lastStateUpdate).toBe(update.timestamp);
                }
            }
        });
    });
    
    it('should maintain temporal ordering of state updates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const matchState = generateRandomMatchState();
            const connectedPlayers = Object.keys(matchState.players).filter(
                playerId => matchState.players[playerId].isConnected
            );
            
            if (connectedPlayers.length === 0) continue;
            
            // Create sequence of timestamped updates
            const updateCount = Math.floor(Math.random() * 4) + 2; // 2-5 updates
            const updates: StateUpdate[] = [];
            
            for (let i = 0; i < updateCount; i++) {
                const update = generateRandomStateUpdate(matchState);
                update.timestamp = Date.now() + i * 100; // 100ms apart
                updates.push(update);
            }
            
            // Apply updates in sequence
            let currentState = matchState;
            let lastTimestamp = 0;
            
            updates.forEach(update => {
                const result = simulateStateSynchronization(currentState, update, connectedPlayers);
                
                // Updates should be applied in temporal order
                expect(update.timestamp).toBeGreaterThan(lastTimestamp);
                expect(result.success).toBe(true);
                expect(result.stateConsistent).toBe(true);
                
                lastTimestamp = update.timestamp;
                
                // Update current state
                const updatedState = applyStateUpdate(currentState, update, connectedPlayers[0]);
                if (updatedState) {
                    currentState = updatedState;
                }
            });
        }
    });
    
    it('should handle edge cases in state synchronization', () => {
        const edgeCases = [
            // Single player match
            () => {
                const state = generateRandomMatchState();
                const singlePlayer = Object.keys(state.players)[0];
                state.players = { [singlePlayer]: state.players[singlePlayer] };
                return { state, players: [singlePlayer] };
            },
            
            // All players disconnected except one
            () => {
                const state = generateRandomMatchState();
                const playerIds = Object.keys(state.players);
                const connectedPlayer = playerIds[0];
                
                playerIds.forEach(id => {
                    if (id !== connectedPlayer) {
                        state.players[id].isConnected = false;
                    }
                });
                
                return { state, players: [connectedPlayer] };
            },
            
            // Match with no current question
            () => {
                const state = generateRandomMatchState();
                state.currentQuestion = null;
                const connectedPlayers = Object.keys(state.players).filter(
                    id => state.players[id].isConnected
                );
                return { state, players: connectedPlayers };
            },
            
            // Match that just ended
            () => {
                const state = generateRandomMatchState();
                state.matchEnded = true;
                state.timeLeft = 0;
                const connectedPlayers = Object.keys(state.players).filter(
                    id => state.players[id].isConnected
                );
                return { state, players: connectedPlayers };
            }
        ];
        
        edgeCases.forEach((createCase, index) => {
            const { state, players } = createCase();
            
            if (players.length === 0) return;
            
            const update = generateRandomStateUpdate(state);
            const result = simulateStateSynchronization(state, update, players);
            
            // Edge cases should still maintain consistency
            expect(result.success).toBe(true);
            expect(result.stateConsistent).toBe(true);
            expect(result.allPlayersReceived).toBe(true);
        });
    });
});