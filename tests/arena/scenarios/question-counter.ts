/**
 * Question Counter Test Scenarios
 * 
 * Tests the question counting and slot progression logic
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

interface QuestionTestConfig {
    serverUrl: string;
    matchId: string;
    verbose?: boolean;
}

/**
 * Test: Questions per slot should be exactly 5
 */
export async function testQuestionsPerSlot(config: QuestionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'QCountTest');
        players.push(...team.players);
        
        // Join and wait for active phase
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Find the active player (slot 1)
        let activePlayer = players.find(p => {
            const myTeam = p.matchState?.team1.teamId === p.teamId 
                ? p.matchState?.team1 
                : p.matchState?.team2;
            return myTeam?.players[p.config.userId]?.isActive;
        });
        
        if (!activePlayer) {
            // Wait a bit and check again
            await new Promise(resolve => setTimeout(resolve, 1000));
            activePlayer = players.find(p => {
                const myTeam = p.matchState?.team1.teamId === p.teamId 
                    ? p.matchState?.team1 
                    : p.matchState?.team2;
                return myTeam?.players[p.config.userId]?.isActive;
            });
        }
        
        if (!activePlayer) {
            throw new Error('No active player found');
        }
        
        const questionsAnswered: number[] = [];
        
        // Answer exactly 5 questions
        for (let q = 1; q <= 5; q++) {
            // Wait for question
            if (!activePlayer.currentQuestion) {
                await activePlayer.waitForEvent('question_update', 5000);
            }
            
            const questionText = activePlayer.currentQuestion!.questionText;
            const answer = SyntheticPlayer.calculateAnswer(questionText);
            const result = await activePlayer.submitAnswer(answer);
            
            questionsAnswered.push(result.questionsInSlot);
            
            if (config.verbose) {
                console.log(`Q${q}: questionsInSlot=${result.questionsInSlot}`);
            }
            
            // After Q5, questionsInSlot should be 5
            if (q === 5 && result.questionsInSlot !== 5) {
                throw new Error(`After Q5, questionsInSlot should be 5, got ${result.questionsInSlot}`);
            }
            
            // Clear current question for next iteration
            activePlayer.currentQuestion = null;
        }
        
        // Verify the sequence was 1, 2, 3, 4, 5
        for (let i = 0; i < 5; i++) {
            if (questionsAnswered[i] !== i + 1) {
                throw new Error(`Question ${i + 1} had questionsInSlot=${questionsAnswered[i]}, expected ${i + 1}`);
            }
        }
        
        // Verify this player is no longer active (slot should have advanced)
        await new Promise(resolve => setTimeout(resolve, 1000));
        const myTeam = activePlayer.matchState?.team1.teamId === activePlayer.teamId 
            ? activePlayer.matchState?.team1 
            : activePlayer.matchState?.team2;
        
        const stillActive = myTeam?.players[activePlayer.config.userId]?.isActive;
        if (stillActive) {
            throw new Error('Player should not be active after completing slot');
        }
        
        return {
            name: 'testQuestionsPerSlot',
            passed: true,
            duration: Date.now() - startTime,
            details: { questionsAnswered },
        };
    } catch (error: any) {
        return {
            name: 'testQuestionsPerSlot',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: No 6th question should be generated
 */
export async function testNoSixthQuestion(config: QuestionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'NoQ6Test');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Find active player
        const activePlayer = players.find(p => {
            const myTeam = p.matchState?.team1.teamId === p.teamId 
                ? p.matchState?.team1 
                : p.matchState?.team2;
            return myTeam?.players[p.config.userId]?.isActive;
        });
        
        if (!activePlayer) {
            throw new Error('No active player found');
        }
        
        // Answer 5 questions
        for (let q = 1; q <= 5; q++) {
            if (!activePlayer.currentQuestion) {
                await activePlayer.waitForEvent('question_update', 5000);
            }
            const answer = SyntheticPlayer.calculateAnswer(activePlayer.currentQuestion!.questionText);
            await activePlayer.submitAnswer(answer);
            activePlayer.currentQuestion = null;
        }
        
        // Wait a bit to see if 6th question arrives
        let sixthQuestionReceived = false;
        const questionCountBefore = activePlayer.questionsReceived;
        
        try {
            await Promise.race([
                activePlayer.waitForEvent('question_update', 2000),
                new Promise(resolve => setTimeout(resolve, 2000)),
            ]);
            
            // Check if this player received another question
            if (activePlayer.questionsReceived > questionCountBefore) {
                // Could be the next slot's question for another player
                const lastQuestion = activePlayer.getLastEvent('question_update');
                if (lastQuestion?.activePlayerId === activePlayer.config.userId) {
                    sixthQuestionReceived = true;
                }
            }
        } catch {
            // Timeout is expected - no 6th question
        }
        
        if (sixthQuestionReceived) {
            throw new Error('6th question was received for the same player');
        }
        
        return {
            name: 'testNoSixthQuestion',
            passed: true,
            duration: Date.now() - startTime,
            details: { questionsReceived: activePlayer.questionsReceived },
        };
    } catch (error: any) {
        return {
            name: 'testNoSixthQuestion',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Slot advancement happens correctly
 */
export async function testSlotAdvancement(config: QuestionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'SlotAdvTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        const slotChanges: any[] = [];
        
        // Listen for slot_change events
        team.leader.on('slot_change', (data) => {
            slotChanges.push(data);
        });
        
        // Complete 2 slots (10 questions total)
        for (let slot = 1; slot <= 2; slot++) {
            const activePlayer = players.find(p => {
                const myTeam = p.matchState?.team1.teamId === p.teamId 
                    ? p.matchState?.team1 
                    : p.matchState?.team2;
                return myTeam?.players[p.config.userId]?.isActive;
            });
            
            if (!activePlayer) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
            
            for (let q = 1; q <= 5; q++) {
                if (!activePlayer.currentQuestion) {
                    await activePlayer.waitForEvent('question_update', 5000);
                }
                const answer = SyntheticPlayer.calculateAnswer(activePlayer.currentQuestion!.questionText);
                await activePlayer.submitAnswer(answer);
                activePlayer.currentQuestion = null;
            }
            
            // Wait for slot change
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Verify slot changes happened
        if (slotChanges.length < 1) {
            throw new Error('No slot_change events received');
        }
        
        // Verify slot numbers progressed correctly
        for (let i = 0; i < slotChanges.length; i++) {
            const expectedSlot = i + 2; // Starts at 2 after first slot
            if (slotChanges[i].currentSlot !== expectedSlot) {
                throw new Error(`Slot change ${i + 1}: expected slot ${expectedSlot}, got ${slotChanges[i].currentSlot}`);
            }
        }
        
        return {
            name: 'testSlotAdvancement',
            passed: true,
            duration: Date.now() - startTime,
            details: { slotChanges },
        };
    } catch (error: any) {
        return {
            name: 'testSlotAdvancement',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

