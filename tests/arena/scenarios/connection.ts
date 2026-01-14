/**
 * Connection Test Scenarios
 * 
 * Basic tests to verify WebSocket connectivity
 */

import { SyntheticPlayer, TestResult } from '../synthetic-client';

interface ConnectionTestConfig {
    serverUrl: string;
    verbose?: boolean;
}

/**
 * Test: Can connect to the arena namespace
 */
export async function testBasicConnection(config: ConnectionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
        const player = new SyntheticPlayer({
            userId: `test-conn-${Date.now()}`,
            userName: 'ConnectionTest',
        }, config.serverUrl);
        
        await player.connect();
        
        if (!player.connected) {
            throw new Error('Player did not connect');
        }
        
        player.disconnect();
        
        return {
            name: 'testBasicConnection',
            passed: true,
            duration: Date.now() - startTime,
            details: { connected: true },
        };
    } catch (error: any) {
        return {
            name: 'testBasicConnection',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

/**
 * Test: Multiple clients can connect simultaneously
 */
export async function testMultipleConnections(config: ConnectionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        // Create 5 players
        for (let i = 0; i < 5; i++) {
            const player = new SyntheticPlayer({
                userId: `test-multi-${i}-${Date.now()}`,
                userName: `MultiTest${i + 1}`,
            }, config.serverUrl);
            
            await player.connect();
            players.push(player);
        }
        
        // Verify all connected
        const allConnected = players.every(p => p.connected);
        if (!allConnected) {
            throw new Error('Not all players connected');
        }
        
        // Cleanup
        players.forEach(p => p.disconnect());
        
        return {
            name: 'testMultipleConnections',
            passed: true,
            duration: Date.now() - startTime,
            details: { playersConnected: players.length },
        };
    } catch (error: any) {
        players.forEach(p => p.disconnect());
        return {
            name: 'testMultipleConnections',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

/**
 * Test: Connection timeout handling
 */
export async function testConnectionTimeout(config: ConnectionTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
        const player = new SyntheticPlayer({
            userId: `test-timeout-${Date.now()}`,
            userName: 'TimeoutTest',
        }, 'http://localhost:9999'); // Non-existent server
        
        try {
            await player.connect();
            // If we get here, connection succeeded unexpectedly
            player.disconnect();
            throw new Error('Connection should have failed');
        } catch (error: any) {
            // Expected to fail
            if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
                return {
                    name: 'testConnectionTimeout',
                    passed: true,
                    duration: Date.now() - startTime,
                    details: { correctlyFailed: true },
                };
            }
            throw error;
        }
    } catch (error: any) {
        return {
            name: 'testConnectionTimeout',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

