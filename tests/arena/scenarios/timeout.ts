/**
 * Timeout Test Scenarios
 * 
 * Tests the IGL timeout functionality
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

interface TimeoutTestConfig {
    serverUrl: string;
    matchId: string;
    verbose?: boolean;
}

/**
 * Test: IGL can call timeout during break
 */
export async function testTimeoutDuringBreak(config: TimeoutTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'TimeoutTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        
        // Complete round 1 to get to break
        await team.leader.waitForPhase('active', 60000);
        
        // Answer all questions for round 1 (all 5 slots, 5 questions each = 25 questions)
        for (let slot = 1; slot <= 5; slot++) {
            const activePlayer = players.find(p => {
                const myTeam = p.matchState?.team1.teamId === p.teamId 
                    ? p.matchState?.team1 
                    : p.matchState?.team2;
                return myTeam?.players[p.config.userId]?.isActive;
            });
            
            if (!activePlayer) {
                await new Promise(resolve => setTimeout(resolve, 500));
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
        }
        
        // Wait for break phase
        await team.leader.waitForPhase('break', 30000);
        
        // Record time when break started
        const breakStartTime = Date.now();
        
        // IGL calls timeout
        await team.igl.callTimeout();
        
        // Verify timeout_called event was received
        const timeoutEvent = team.igl.getLastEvent('timeout_called');
        if (!timeoutEvent) {
            throw new Error('Did not receive timeout_called event');
        }
        
        // Wait for next round to start (should take > 60 seconds now)
        await team.leader.waitForPhase('active', 120000);
        
        const breakDuration = Date.now() - breakStartTime;
        
        // Verify break was extended (should be at least 60 seconds)
        if (breakDuration < 55000) { // Allow 5s tolerance
            throw new Error(`Break duration was ${breakDuration}ms, expected at least 60000ms`);
        }
        
        return {
            name: 'testTimeoutDuringBreak',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                breakDuration,
                timeoutEvent,
            },
        };
    } catch (error: any) {
        return {
            name: 'testTimeoutDuringBreak',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Timeout extends break by 60 seconds
 */
export async function testTimeoutExtension(config: TimeoutTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'TimeExtTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('break', 180000);
        
        // Call timeout and verify extension amount
        const timeoutPromise = team.igl.callTimeout();
        
        const timeoutEvent = await team.igl.waitForEvent('timeout_called', 5000);
        
        // Verify extension amount
        if (timeoutEvent.extensionMs !== 60000) {
            throw new Error(`Extension was ${timeoutEvent.extensionMs}ms, expected 60000ms`);
        }
        
        return {
            name: 'testTimeoutExtension',
            passed: true,
            duration: Date.now() - startTime,
            details: { timeoutEvent },
        };
    } catch (error: any) {
        return {
            name: 'testTimeoutExtension',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Non-IGL cannot call timeout
 */
export async function testNonIglCannotTimeout(config: TimeoutTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'NonIglTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.anchor.waitForPhase('break', 180000);
        
        // Try to call timeout as non-IGL (anchor)
        let errorReceived = false;
        team.anchor.on('error', (error) => {
            if (error.message?.includes('Only IGL')) {
                errorReceived = true;
            }
        });
        
        // This should fail
        try {
            await team.anchor.callTimeout();
        } catch {
            // Expected to fail
        }
        
        // Wait a bit to receive error event
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify no timeout_called event for this player
        const timeoutEvent = team.anchor.getLastEvent('timeout_called');
        
        // If timeout was called, the test failed
        if (timeoutEvent && !errorReceived) {
            throw new Error('Non-IGL was able to call timeout');
        }
        
        return {
            name: 'testNonIglCannotTimeout',
            passed: true,
            duration: Date.now() - startTime,
            details: { errorReceived },
        };
    } catch (error: any) {
        return {
            name: 'testNonIglCannotTimeout',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

