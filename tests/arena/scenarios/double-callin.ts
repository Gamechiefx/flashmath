/**
 * Double Call-In Test Scenarios
 * 
 * Tests the IGL Double Call-In (Anchor plays 2 slots) functionality
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

interface DoubleCallinTestConfig {
    serverUrl: string;
    matchId: string;
    verbose?: boolean;
}

/**
 * Test: IGL can activate Double Call-In during strategy phase
 */
export async function testDoubleCallinStrategy(config: DoubleCallinTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'DCStratTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('strategy', 30000);
        
        // IGL activates Double Call-In for slot 5 (Mixed)
        await team.igl.activateDoubleCallin(5);
        
        // Verify event was received
        const dcEvent = team.igl.getLastEvent('double_callin_activated');
        if (!dcEvent) {
            throw new Error('Did not receive double_callin_activated event');
        }
        
        return {
            name: 'testDoubleCallinStrategy',
            passed: true,
            duration: Date.now() - startTime,
            details: { doubleCallinEvent: dcEvent },
        };
    } catch (error: any) {
        return {
            name: 'testDoubleCallinStrategy',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Double Call-In causes anchor to play the benched slot
 */
export async function testAnchorPlaysSlot(config: DoubleCallinTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'AnchorSlotTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('strategy', 30000);
        
        // Get the player assigned to slot 5 (will be benched)
        const myTeam = team.leader.matchState?.team1.teamId === team.leader.teamId 
            ? team.leader.matchState?.team1 
            : team.leader.matchState?.team2;
        
        const slot5PlayerId = myTeam?.slotAssignments['mixed'];
        const anchorId = team.anchor.config.userId;
        
        if (slot5PlayerId === anchorId) {
            // Anchor is already in slot 5, use slot 4
            await team.igl.activateDoubleCallin(4);
        } else {
            await team.igl.activateDoubleCallin(5);
        }
        
        // Confirm slots to start match
        await team.igl.confirmSlots();
        await team.leader.waitForPhase('active', 30000);
        
        // Complete slots 1-4 to get to slot 5 (or 1-3 for slot 4)
        const targetSlot = slot5PlayerId === anchorId ? 4 : 5;
        
        for (let slot = 1; slot < targetSlot; slot++) {
            const activePlayer = players.find(p => {
                const pTeam = p.matchState?.team1.teamId === p.teamId 
                    ? p.matchState?.team1 
                    : p.matchState?.team2;
                return pTeam?.players[p.config.userId]?.isActive;
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
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Now at the target slot - check who is active
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const anchorTeam = team.anchor.matchState?.team1.teamId === team.anchor.teamId 
            ? team.anchor.matchState?.team1 
            : team.anchor.matchState?.team2;
        
        const anchorIsActive = anchorTeam?.players[anchorId]?.isActive;
        
        if (!anchorIsActive) {
            throw new Error('Anchor should be active in the Double Call-In slot');
        }
        
        return {
            name: 'testAnchorPlaysSlot',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                targetSlot,
                anchorIsActive,
            },
        };
    } catch (error: any) {
        return {
            name: 'testAnchorPlaysSlot',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Double Call-In only available during correct phases
 */
export async function testDoubleCallinPhaseRestriction(config: DoubleCallinTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'DCPhaseTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Try to activate during active phase (should fail)
        let errorReceived = false;
        team.igl.on('error', (error) => {
            if (error.message?.includes('break') || error.message?.includes('strategy')) {
                errorReceived = true;
            }
        });
        
        try {
            await team.igl.activateDoubleCallin(5);
        } catch {
            // Expected
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Should not have received activation
        const dcEvent = team.igl.getLastEvent('double_callin_activated');
        
        if (dcEvent && !errorReceived) {
            throw new Error('Double Call-In should not be allowed during active phase');
        }
        
        return {
            name: 'testDoubleCallinPhaseRestriction',
            passed: true,
            duration: Date.now() - startTime,
            details: { errorReceived },
        };
    } catch (error: any) {
        return {
            name: 'testDoubleCallinPhaseRestriction',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Double Call-In can only be used once per half
 */
export async function testDoubleCallinOncePerHalf(config: DoubleCallinTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'DCOnceTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('strategy', 30000);
        
        // First activation should succeed
        await team.igl.activateDoubleCallin(5);
        
        const firstEvent = team.igl.getLastEvent('double_callin_activated');
        if (!firstEvent) {
            throw new Error('First Double Call-In should succeed');
        }
        
        // Second activation should fail
        let secondSucceeded = true;
        try {
            await team.igl.activateDoubleCallin(4);
        } catch {
            secondSucceeded = false;
        }
        
        // Wait a bit for potential event
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if we got a second activation event
        const allDCEvents = team.igl.receivedEvents.filter(e => e.event === 'double_callin_activated');
        
        if (allDCEvents.length > 1) {
            throw new Error('Should not be able to use Double Call-In twice in same half');
        }
        
        return {
            name: 'testDoubleCallinOncePerHalf',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                firstActivation: !!firstEvent,
                totalActivations: allDCEvents.length,
            },
        };
    } catch (error: any) {
        return {
            name: 'testDoubleCallinOncePerHalf',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

