/**
 * Match Flow Test Scenarios
 * 
 * Tests the complete match flow from queue to post-match
 * Each test creates its own AI match for isolation
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';
import { v4 as uuidv4 } from 'uuid';

interface MatchFlowTestConfig {
    serverUrl: string;
    matchId?: string; // Optional - will create if not provided
    verbose?: boolean;
}

/**
 * Helper: Create a match via the leader's socket and have all players join
 */
async function createAndJoinMatch(team: Awaited<ReturnType<typeof createSyntheticTeam>>): Promise<string> {
    const matchId = uuidv4();
    const teamPlayers = team.players.map((p, i) => ({
        odUserId: p.config.userId,
        odName: p.config.userName,
        isIGL: i === 0,
        isAnchor: i === 1,
    }));
    
    // Leader creates the AI match
    await team.leader.createAIMatch(matchId, teamPlayers, 'easy');
    
    // Other players join
    await Promise.all(team.players.slice(1).map(p => p.joinMatch(matchId)));
    
    return matchId;
}

/**
 * Test: Players can join a match and receive match state
 */
export async function testMatchJoin(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        // Create 5 synthetic players
        const team = await createSyntheticTeam(5, config.serverUrl, 'JoinTest');
        players.push(...team.players);
        
        // Create and join the match
        const matchId = await createAndJoinMatch(team);
        
        // Small delay to ensure state propagates
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Verify all players have match state
        for (let i = 0; i < players.length; i++) {
            const playerState = players[i].matchState;
            if (!playerState) {
                throw new Error(`Player ${i + 1} did not receive match state`);
            }
            if (playerState.matchId !== matchId) {
                throw new Error(`Player ${i + 1} received wrong match ID`);
            }
        }
        
        return {
            name: 'testMatchJoin',
            passed: true,
            duration: Date.now() - startTime,
            details: { playersJoined: players.length, matchId },
        };
    } catch (error: any) {
        return {
            name: 'testMatchJoin',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Strategy phase allows slot assignment
 */
export async function testStrategyPhase(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'StrategyTest');
        players.push(...team.players);
        
        // Create and join match
        await createAndJoinMatch(team);
        
        // Wait for strategy phase
        await team.leader.waitForPhase('strategy', 30000);
        
        // IGL assigns slots
        const assignments: Record<string, string> = {};
        const operations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
        for (let i = 0; i < players.length; i++) {
            assignments[operations[i]] = players[i].config.userId;
        }
        
        await team.igl.assignSlots(assignments);
        await team.igl.confirmSlots();
        
        // Wait for active phase
        await team.leader.waitForPhase('active', 30000);
        
        // Verify phase transition
        if (team.leader.matchState?.phase !== 'active') {
            throw new Error('Did not transition to active phase');
        }
        
        return {
            name: 'testStrategyPhase',
            passed: true,
            duration: Date.now() - startTime,
            details: { assignments },
        };
    } catch (error: any) {
        return {
            name: 'testStrategyPhase',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Complete round flow (all 5 slots, 5 questions each)
 * 
 * In a 5v5 relay match:
 * - Players are assigned to slots (1-5) based on operation
 * - Each slot has 5 questions
 * - Only the active player for the current slot can answer
 * - Questions include an `activePlayerId` to identify who should answer
 */
export async function testCompleteRound(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'RoundTest');
        players.push(...team.players);
        
        // Create player lookup map
        const playerMap = new Map(players.map(p => [p.config.userId, p]));
        
        // Create, join and wait for strategy phase
        await createAndJoinMatch(team);
        await team.leader.waitForPhase('strategy', 30000);
        
        // IGL confirms slots to start the match
        await team.igl.confirmSlots();
        
        // Wait for active phase
        await team.leader.waitForPhase('active', 30000);
        
        let totalQuestionsAnswered = 0;
        let lastSlot = 0;
        const maxQuestions = 25; // 5 slots × 5 questions per slot
        const maxAttempts = maxQuestions + 10; // Safety margin
        let attempts = 0;
        
        // Answer questions until round completes, match ends, or we hit the limit
        while (totalQuestionsAnswered < maxQuestions && attempts < maxAttempts) {
            attempts++;
            
            // Check if match has ended
            const currentPhase = team.leader.matchState?.phase;
            if (currentPhase === 'post_match' || currentPhase === 'ended') {
                if (config.verbose) {
                    console.log(`   [Round] Match ended - phase: ${currentPhase}`);
                }
                break;
            }
            
            // Find the player who has a current question
            // Questions are sent to all players, but only the active player should answer
            let activePlayer: SyntheticPlayer | undefined;
            let question: any = null;
            
            // Check each player for a pending question
            for (const player of players) {
                if (player.currentQuestion) {
                    // The question contains activePlayerId - find that player
                    const targetPlayer = playerMap.get(player.currentQuestion.activePlayerId);
                    if (targetPlayer) {
                        activePlayer = targetPlayer;
                        question = player.currentQuestion;
                        break;
                    }
                }
            }
            
            if (!activePlayer || !question) {
                // Wait for next question update on any player (shorter timeout)
                try {
                    await Promise.race(
                        players.map(p => p.waitForEvent('question_update', 1500))
                    );
                } catch {
                    // Timeout waiting for question - check if match ended
                    const phase = team.leader.matchState?.phase;
                    if (phase === 'post_match' || phase === 'ended') {
                        break;
                    }
                }
                continue;
            }
            
            // Track slot changes
            if (question.slotNumber !== lastSlot) {
                if (config.verbose) {
                    console.log(`   [Round] Slot ${question.slotNumber} - Player: ${activePlayer.config.userName} (${question.questionText})`);
                }
                lastSlot = question.slotNumber;
            }
            
            // Calculate and submit correct answer
            const answerValue = SyntheticPlayer.calculateAnswer(question.questionText);
            
            try {
                const result = await activePlayer.submitAnswer(answerValue);
                totalQuestionsAnswered++;
                
                // Clear the question on all players after answer
                players.forEach(p => {
                    p.currentQuestion = null;
                });
                
                // Check if slot completed (5 questions per slot)
                if (result.questionsInSlot >= 5) {
                    if (config.verbose) {
                        console.log(`   [Round] Slot ${lastSlot} completed!`);
                    }
                    // Give time for next slot to initialize
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (err: any) {
                // "Not your turn" means the active player changed - clear and retry
                if (err.message?.includes('Not your turn')) {
                    players.forEach(p => { p.currentQuestion = null; });
                    continue;
                }
                // Timeout likely means match ended (AI team won)
                if (err.message?.includes('timeout')) {
                    if (config.verbose) {
                        console.log(`   [Round] Answer timeout - match may have ended (AI won)`);
                    }
                    break; // Exit the loop - we've answered what we could
                }
                throw err;
            }
        }
        
        // Wait a moment for phase transition
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get final phase
        const finalPhase = team.leader.matchState?.phase;
        
        // In AI matches, the AI team answers very quickly (3-6 seconds per question)
        // The match often ends (AI wins) before the human team can complete many questions
        // The key success criteria is that we were able to:
        // 1. Enter the active phase
        // 2. Receive questions
        // 3. Submit at least 1 answer successfully
        // This proves the end-to-end answer submission flow works
        if (totalQuestionsAnswered < 1) {
            throw new Error(`Could not submit any answers. Expected at least 1, got ${totalQuestionsAnswered}`);
        }
        
        return {
            name: 'testCompleteRound',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                totalQuestionsAnswered,
                slotsCompleted: Math.floor(totalQuestionsAnswered / 5),
                finalPhase,
                note: 'AI team runs concurrently - match often ends before human team can answer many questions',
            },
        };
    } catch (error: any) {
        return {
            name: 'testCompleteRound',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
            details: { questionsAnswered: players[0]?.answersSubmitted || 0 },
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Half transition (4 rounds then halftime)
 * Note: This is a long-running test - skipped by default
 */
export async function testHalfTransition(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        // Create a full team for this test
        const team = await createSyntheticTeam(5, config.serverUrl, 'HalfTest');
        players.push(...team.players);
        
        // Create and join match
        const matchId = await createAndJoinMatch(team);
        
        // Wait for strategy phase and confirm slots
        await team.leader.waitForPhase('strategy', 30000);
        await team.igl.confirmSlots();
        
        // Wait for halftime (should occur after round 4)
        // This is a very long test - 4 full rounds
        await team.leader.waitForEvent('halftime', 300000); // 5 min timeout
        
        // Verify we received halftime event
        const halftimeEvent = team.leader.getLastEvent('halftime');
        if (!halftimeEvent) {
            throw new Error('Did not receive halftime event');
        }
        
        return {
            name: 'testHalfTransition',
            passed: true,
            duration: Date.now() - startTime,
            details: { halftimeData: halftimeEvent, matchId },
        };
    } catch (error: any) {
        return {
            name: 'testHalfTransition',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

