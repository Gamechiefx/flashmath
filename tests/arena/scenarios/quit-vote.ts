/**
 * Quit Vote Test Scenarios
 * 
 * Tests the quit voting system
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

interface QuitVoteTestConfig {
    serverUrl: string;
    matchId: string;
    verbose?: boolean;
}

/**
 * Test: Party leader can initiate quit vote
 */
export async function testInitiateQuitVote(config: QuitVoteTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'QuitVoteTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Leader initiates quit vote
        await team.leader.initiateQuitVote();
        
        // All players should receive quit_vote_started
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        for (const player of players) {
            const voteStarted = player.hasReceivedEvent('quit_vote_started');
            if (!voteStarted) {
                throw new Error(`Player ${player.config.userName} did not receive quit_vote_started`);
            }
        }
        
        return {
            name: 'testInitiateQuitVote',
            passed: true,
            duration: Date.now() - startTime,
        };
    } catch (error: any) {
        return {
            name: 'testInitiateQuitVote',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Quit vote passes with majority yes
 */
export async function testQuitVotePasses(config: QuitVoteTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'QuitPassTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Leader initiates quit vote
        await team.leader.initiateQuitVote();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 3 players vote yes (majority)
        await players[0].castQuitVote('yes');
        await players[1].castQuitVote('yes');
        await players[2].castQuitVote('yes');
        await players[3].castQuitVote('no');
        await players[4].castQuitVote('no');
        
        // Wait for result
        const result = await team.leader.waitForEvent('quit_vote_result', 10000);
        
        if (result.result !== 'quit') {
            throw new Error(`Expected 'quit' result, got '${result.result}'`);
        }
        
        return {
            name: 'testQuitVotePasses',
            passed: true,
            duration: Date.now() - startTime,
            details: { result },
        };
    } catch (error: any) {
        return {
            name: 'testQuitVotePasses',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Quit vote fails with majority no
 */
export async function testQuitVoteFails(config: QuitVoteTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'QuitFailTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Leader initiates quit vote
        await team.leader.initiateQuitVote();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 2 players vote yes, 3 vote no
        await players[0].castQuitVote('yes');
        await players[1].castQuitVote('yes');
        await players[2].castQuitVote('no');
        await players[3].castQuitVote('no');
        await players[4].castQuitVote('no');
        
        // Wait for result
        const result = await team.leader.waitForEvent('quit_vote_result', 10000);
        
        if (result.result !== 'stay') {
            throw new Error(`Expected 'stay' result, got '${result.result}'`);
        }
        
        return {
            name: 'testQuitVoteFails',
            passed: true,
            duration: Date.now() - startTime,
            details: { result },
        };
    } catch (error: any) {
        return {
            name: 'testQuitVoteFails',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: All team members receive forfeit notification
 */
export async function testForfeitNotification(config: QuitVoteTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'ForfeitTest');
        players.push(...team.players);
        
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        await team.leader.waitForPhase('active', 60000);
        
        // Initiate and pass quit vote
        await team.leader.initiateQuitVote();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // All players vote yes
        for (const player of players) {
            await player.castQuitVote('yes');
        }
        
        // Wait for forfeit notification
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // All players should receive team_forfeit
        for (const player of players) {
            const forfeit = player.hasReceivedEvent('team_forfeit');
            if (!forfeit) {
                throw new Error(`Player ${player.config.userName} did not receive team_forfeit`);
            }
        }
        
        return {
            name: 'testForfeitNotification',
            passed: true,
            duration: Date.now() - startTime,
        };
    } catch (error: any) {
        return {
            name: 'testForfeitNotification',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

