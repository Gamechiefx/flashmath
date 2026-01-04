/**
 * Match Flow Test Scenarios
 * 
 * Tests the complete match flow from queue to post-match
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

interface MatchFlowTestConfig {
    serverUrl: string;
    matchId: string;
    verbose?: boolean;
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
        
        // All players join the match
        const joinPromises = players.map(p => p.joinMatch(config.matchId));
        const states = await Promise.all(joinPromises);
        
        // Verify all players received match state
        for (let i = 0; i < players.length; i++) {
            if (!states[i]) {
                throw new Error(`Player ${i + 1} did not receive match state`);
            }
            if (states[i].matchId !== config.matchId) {
                throw new Error(`Player ${i + 1} received wrong match ID`);
            }
        }
        
        return {
            name: 'testMatchJoin',
            passed: true,
            duration: Date.now() - startTime,
            details: { playersJoined: players.length },
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
        
        // Join match
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        
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
 */
export async function testCompleteRound(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'RoundTest');
        players.push(...team.players);
        
        // Join and wait for active phase
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        let totalQuestionsAnswered = 0;
        let currentSlot = 1;
        
        // Answer all questions for all slots
        while (currentSlot <= 5) {
            // Find the active player
            const activePlayer = players.find(p => {
                const myTeam = p.matchState?.team1.teamId === p.teamId 
                    ? p.matchState?.team1 
                    : p.matchState?.team2;
                return myTeam?.players[p.config.userId]?.isActive;
            });
            
            if (!activePlayer) {
                // Wait for question update
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            
            // Wait for question
            if (!activePlayer.currentQuestion) {
                await activePlayer.waitForEvent('question_update', 5000);
            }
            
            // Calculate and submit correct answer
            const answer = SyntheticPlayer.calculateAnswer(activePlayer.currentQuestion!.questionText);
            const result = await activePlayer.submitAnswer(answer);
            
            totalQuestionsAnswered++;
            
            // Check for slot advancement
            if (result.questionsInSlot >= 5) {
                currentSlot++;
            }
        }
        
        // Verify round break or round end
        const finalPhase = team.leader.matchState?.phase;
        if (finalPhase !== 'break' && finalPhase !== 'halftime' && finalPhase !== 'post_match') {
            throw new Error(`Unexpected phase after round: ${finalPhase}`);
        }
        
        return {
            name: 'testCompleteRound',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                totalQuestionsAnswered,
                slotsCompleted: currentSlot - 1,
                finalPhase,
            },
        };
    } catch (error: any) {
        return {
            name: 'testCompleteRound',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Half transition (4 rounds then halftime)
 */
export async function testHalfTransition(config: MatchFlowTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
        // This is a long test - just verify the event sequence
        const player = new SyntheticPlayer({
            userId: `test-half-${Date.now()}`,
            userName: 'HalfTester',
        }, config.serverUrl);
        
        await player.connect();
        await player.joinMatch(config.matchId);
        
        // Wait for halftime (should occur after round 4)
        await player.waitForEvent('halftime', 300000); // 5 min timeout
        
        // Verify we received halftime event
        const halftimeEvent = player.getLastEvent('halftime');
        if (!halftimeEvent) {
            throw new Error('Did not receive halftime event');
        }
        
        player.disconnect();
        
        return {
            name: 'testHalfTransition',
            passed: true,
            duration: Date.now() - startTime,
            details: { halftimeData: halftimeEvent },
        };
    } catch (error: any) {
        return {
            name: 'testHalfTransition',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

