/**
 * Party to Match Flow Test Scenarios
 * 
 * Tests the complete flow from party creation to match start
 */

import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';
import { v4 as uuidv4 } from 'uuid';

interface PartyToMatchTestConfig {
    serverUrl: string;
    verbose?: boolean;
}

/**
 * Test: Full party-to-match flow with AI opponent
 */
export async function testPartyToMatchFlow(config: PartyToMatchTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        console.log('   [1/7] Creating synthetic team...');
        
        // Create 5 synthetic players
        const team = await createSyntheticTeam(5, config.serverUrl, 'PartyFlow');
        players.push(...team.players);
        
        if (config.verbose) {
            console.log(`   [1/7] Created ${players.length} players`);
        }
        
        // Generate a unique match ID
        const matchId = uuidv4();
        
        console.log('   [2/7] Leader creating AI match...');
        
        // Leader creates the AI match
        const teamPlayers = players.map((p, i) => ({
            odUserId: p.config.userId,
            odName: p.config.userName,
            isIGL: i === 0,
            isAnchor: i === 1,
        }));
        
        await team.leader.createAIMatch(matchId, teamPlayers, 'easy');
        
        if (config.verbose) {
            console.log(`   [2/7] AI match created: ${matchId}`);
        }
        
        console.log('   [3/7] Other players joining match...');
        
        // Other players join the match
        const joinPromises = players.slice(1).map(p => p.joinMatch(matchId));
        await Promise.all(joinPromises);
        
        if (config.verbose) {
            console.log(`   [3/7] All ${players.length} players joined`);
        }
        
        console.log('   [4/7] Waiting for strategy phase...');
        
        // Wait for ALL players to reach strategy phase (not just the leader)
        await Promise.all(players.map(p => p.waitForPhase('strategy', 30000)));
        
        if (config.verbose) {
            console.log('   [4/7] All players in strategy phase');
        }
        
        // Verify all players see strategy phase
        for (const player of players) {
            if (player.matchState?.phase !== 'strategy') {
                throw new Error(`Player ${player.config.userName} not in strategy phase: ${player.matchState?.phase}`);
            }
        }
        
        console.log('   [5/7] Using default slot assignments...');
        
        // Skip manual slot assignment - server uses defaults from odPreferredOperation
        // which we set during team creation
        
        if (config.verbose) {
            console.log('   [5/7] Using default slots based on preferred operations');
        }
        
        console.log('   [6/7] IGL confirming slots...');
        
        // IGL confirms slots (uses default assignments)
        await team.igl.confirmSlots();
        
        console.log('   [7/7] Waiting for active phase...');
        
        // Wait for match to start (active phase)
        await team.leader.waitForPhase('active', 30000);
        
        if (config.verbose) {
            console.log('   [7/7] Match started! Phase:', team.leader.matchState?.phase);
        }
        
        // Wait a bit for match state to propagate
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify match state
        const matchState = team.leader.matchState;
        if (!matchState) {
            throw new Error('No match state after start');
        }
        
        if (matchState.phase !== 'active') {
            throw new Error(`Expected active phase, got: ${matchState.phase}`);
        }
        
        if (matchState.round !== 1) {
            throw new Error(`Expected round 1, got: ${matchState.round}`);
        }
        
        // Find the active player (should be slot 1 player)
        const myTeam = matchState.team1?.teamId === team.leader.teamId 
            ? matchState.team1 
            : matchState.team2;
        
        if (!myTeam || !myTeam.players) {
            throw new Error('Team or players not found in match state');
        }
        
        let activePlayer: any = null;
        for (const [odUserId, player] of Object.entries(myTeam.players)) {
            if ((player as any).isActive) {
                activePlayer = { odUserId, ...(player as any) };
                break;
            }
        }
        
        // If no active player, log the team state for debugging
        if (!activePlayer && config.verbose) {
            console.log('   [DEBUG] Team state:', JSON.stringify(myTeam, null, 2));
        }
        
        // For now, just check that match started successfully
        // Active player is set by the match_start event which updates player.isActive
        
        return {
            name: 'testPartyToMatchFlow',
            passed: true,
            duration: Date.now() - startTime,
            details: {
                matchId,
                phase: matchState.phase,
                round: matchState.round,
                activePlayer: activePlayer.odName,
                teamScore: myTeam.score,
            },
        };
    } catch (error: any) {
        return {
            name: 'testPartyToMatchFlow',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: All players receive match state after joining
 */
export async function testAllPlayersReceiveState(config: PartyToMatchTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'StateTest');
        players.push(...team.players);
        
        const matchId = uuidv4();
        
        // Leader creates match
        const teamPlayers = players.map((p, i) => ({
            odUserId: p.config.userId,
            odName: p.config.userName,
            isIGL: i === 0,
            isAnchor: i === 1,
        }));
        
        await team.leader.createAIMatch(matchId, teamPlayers, 'easy');
        
        // Other players join
        await Promise.all(players.slice(1).map(p => p.joinMatch(matchId)));
        
        // Small delay to ensure state propagates
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify all players have match state
        for (const player of players) {
            if (!player.matchState) {
                throw new Error(`Player ${player.config.userName} has no match state`);
            }
            if (player.matchState.matchId !== matchId) {
                throw new Error(`Player ${player.config.userName} has wrong match ID`);
            }
        }
        
        return {
            name: 'testAllPlayersReceiveState',
            passed: true,
            duration: Date.now() - startTime,
            details: { playersWithState: players.length },
        };
    } catch (error: any) {
        return {
            name: 'testAllPlayersReceiveState',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: Strategy phase countdown works
 */
export async function testStrategyPhaseCountdown(config: PartyToMatchTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'CountdownTest');
        players.push(...team.players);
        
        const matchId = uuidv4();
        
        const teamPlayers = players.map((p, i) => ({
            odUserId: p.config.userId,
            odName: p.config.userName,
            isIGL: i === 0,
            isAnchor: i === 1,
        }));
        
        await team.leader.createAIMatch(matchId, teamPlayers, 'easy');
        await Promise.all(players.slice(1).map(p => p.joinMatch(matchId)));
        
        // Wait for strategy phase
        await team.leader.waitForPhase('strategy', 30000);
        
        // Check that strategy phase has countdown info
        const strategyEvent = team.leader.getLastEvent('strategy_phase_start');
        
        if (!strategyEvent) {
            throw new Error('No strategy_phase_start event received');
        }
        
        if (typeof strategyEvent.durationMs !== 'number' || strategyEvent.durationMs <= 0) {
            throw new Error(`Invalid strategy duration: ${strategyEvent.durationMs}`);
        }
        
        return {
            name: 'testStrategyPhaseCountdown',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                strategyDurationMs: strategyEvent.durationMs,
                currentSlotAssignments: strategyEvent.slotAssignments,
            },
        };
    } catch (error: any) {
        return {
            name: 'testStrategyPhaseCountdown',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

/**
 * Test: AI team is visible after match starts
 */
export async function testAITeamVisible(config: PartyToMatchTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        const team = await createSyntheticTeam(5, config.serverUrl, 'AIVisibleTest');
        players.push(...team.players);
        
        const matchId = uuidv4();
        
        const teamPlayers = players.map((p, i) => ({
            odUserId: p.config.userId,
            odName: p.config.userName,
            isIGL: i === 0,
            isAnchor: i === 1,
        }));
        
        await team.leader.createAIMatch(matchId, teamPlayers, 'medium');
        await Promise.all(players.slice(1).map(p => p.joinMatch(matchId)));
        await team.leader.waitForPhase('strategy', 30000);
        
        // Check for AI team
        const matchState = team.leader.matchState;
        if (!matchState) {
            throw new Error('No match state');
        }
        
        // Determine which team is ours and which is AI
        const humanTeam = matchState.team1.teamId === team.leader.teamId 
            ? matchState.team1 
            : matchState.team2;
        const aiTeam = matchState.team1.teamId === team.leader.teamId 
            ? matchState.team2 
            : matchState.team1;
        
        if (!aiTeam) {
            throw new Error('AI team not found in match state');
        }
        
        if (!aiTeam.teamName) {
            throw new Error('AI team has no name');
        }
        
        const aiPlayerCount = Object.keys(aiTeam.players || {}).length;
        if (aiPlayerCount !== 5) {
            throw new Error(`AI team has ${aiPlayerCount} players, expected 5`);
        }
        
        return {
            name: 'testAITeamVisible',
            passed: true,
            duration: Date.now() - startTime,
            details: { 
                aiTeamName: aiTeam.teamName,
                aiPlayerCount,
                humanTeamName: humanTeam.teamName,
            },
        };
    } catch (error: any) {
        return {
            name: 'testAITeamVisible',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}

