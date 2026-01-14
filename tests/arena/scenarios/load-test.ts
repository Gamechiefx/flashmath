/**
 * Load Testing Scenario
 * 
 * Tests system performance under concurrent load.
 * Uses synthetic clients to simulate multiple simultaneous connections.
 */

import { TestConfig, TestResult, runWithTimeout } from '../test-orchestrator';
import { SyntheticClient } from '../synthetic-client';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CLIENT_COUNT = 10;
const DEFAULT_RAMP_UP_MS = 5000;
const CONNECTION_TIMEOUT_MS = 10000;

interface LoadTestConfig extends TestConfig {
    clientCount?: number;
    rampUpMs?: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

async function createClients(count: number, serverUrl: string): Promise<SyntheticClient[]> {
    const clients: SyntheticClient[] = [];
    
    for (let i = 0; i < count; i++) {
        clients.push(new SyntheticClient(serverUrl, `load-test-${i}`));
    }
    
    return clients;
}

async function connectAllClients(clients: SyntheticClient[], rampUpMs: number): Promise<{
    connected: number;
    failed: number;
    avgConnectTime: number;
}> {
    const startTimes: number[] = [];
    const endTimes: number[] = [];
    const results: boolean[] = [];
    
    const delayPerClient = rampUpMs / clients.length;
    
    await Promise.all(clients.map(async (client, index) => {
        // Stagger connections
        await new Promise(resolve => setTimeout(resolve, index * delayPerClient));
        
        const start = Date.now();
        startTimes.push(start);
        
        try {
            await client.connect();
            endTimes.push(Date.now());
            results.push(true);
        } catch (e) {
            endTimes.push(Date.now());
            results.push(false);
        }
    }));
    
    const connected = results.filter(r => r).length;
    const failed = results.filter(r => !r).length;
    
    // Calculate average connection time for successful connections
    let totalConnectTime = 0;
    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
        if (results[i]) {
            totalConnectTime += (endTimes[i] - startTimes[i]);
            successCount++;
        }
    }
    
    const avgConnectTime = successCount > 0 ? totalConnectTime / successCount : 0;
    
    return { connected, failed, avgConnectTime };
}

async function disconnectAllClients(clients: SyntheticClient[]): Promise<void> {
    await Promise.all(clients.map(client => client.disconnect().catch(() => {})));
}

// ============================================================================
// Load Tests
// ============================================================================

/**
 * Test: Concurrent Connections
 * 
 * Verify the server can handle multiple simultaneous WebSocket connections.
 */
export async function testConcurrentConnections(config: LoadTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const clientCount = config.clientCount || DEFAULT_CLIENT_COUNT;
    const rampUpMs = config.rampUpMs || DEFAULT_RAMP_UP_MS;
    let clients: SyntheticClient[] = [];
    
    try {
        console.log(`[LoadTest] Creating ${clientCount} clients...`);
        clients = await createClients(clientCount, config.serverUrl);
        
        console.log(`[LoadTest] Connecting with ${rampUpMs}ms ramp-up...`);
        const { connected, failed, avgConnectTime } = await connectAllClients(clients, rampUpMs);
        
        console.log(`[LoadTest] Connected: ${connected}/${clientCount}, Avg time: ${avgConnectTime.toFixed(0)}ms`);
        
        // Allow 10% failure rate
        const successRate = connected / clientCount;
        
        if (successRate < 0.9) {
            return {
                name: 'testConcurrentConnections',
                passed: false,
                duration: Date.now() - startTime,
                error: `Only ${connected}/${clientCount} clients connected (${(successRate * 100).toFixed(0)}% success rate)`,
            };
        }
        
        return {
            name: 'testConcurrentConnections',
            passed: true,
            duration: Date.now() - startTime,
            details: {
                clientCount,
                connected,
                failed,
                avgConnectTime: Math.round(avgConnectTime),
                successRate: (successRate * 100).toFixed(1) + '%',
            },
        };
        
    } catch (error: any) {
        return {
            name: 'testConcurrentConnections',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        await disconnectAllClients(clients);
    }
}

/**
 * Test: Connection Stability
 * 
 * Verify connections remain stable over a period of time.
 */
export async function testConnectionStability(config: LoadTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const clientCount = Math.min(config.clientCount || 5, 10); // Cap for stability test
    const testDurationMs = 10000; // 10 seconds
    let clients: SyntheticClient[] = [];
    
    try {
        clients = await createClients(clientCount, config.serverUrl);
        
        // Connect all
        await connectAllClients(clients, 2000);
        
        // Wait and check for disconnections
        let disconnections = 0;
        const checkInterval = setInterval(() => {
            for (const client of clients) {
                if (!client.isConnected()) {
                    disconnections++;
                }
            }
        }, 1000);
        
        await new Promise(resolve => setTimeout(resolve, testDurationMs));
        clearInterval(checkInterval);
        
        // Check final state
        const stillConnected = clients.filter(c => c.isConnected()).length;
        
        if (stillConnected < clientCount) {
            return {
                name: 'testConnectionStability',
                passed: false,
                duration: Date.now() - startTime,
                error: `${clientCount - stillConnected} clients disconnected during ${testDurationMs}ms test`,
            };
        }
        
        return {
            name: 'testConnectionStability',
            passed: true,
            duration: Date.now() - startTime,
            details: {
                clientCount,
                stillConnected,
                testDurationMs,
                disconnections: 0,
            },
        };
        
    } catch (error: any) {
        return {
            name: 'testConnectionStability',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        await disconnectAllClients(clients);
    }
}

/**
 * Test: Rapid Connect/Disconnect
 * 
 * Verify server handles rapid connection churn.
 */
export async function testRapidConnectDisconnect(config: LoadTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const iterations = 20;
    let successCount = 0;
    
    try {
        for (let i = 0; i < iterations; i++) {
            const client = new SyntheticClient(config.serverUrl, `rapid-${i}`);
            
            try {
                await client.connect();
                await client.disconnect();
                successCount++;
            } catch (e) {
                // Count failures but continue
            }
            
            // Small delay between iterations
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const successRate = successCount / iterations;
        
        if (successRate < 0.95) {
            return {
                name: 'testRapidConnectDisconnect',
                passed: false,
                duration: Date.now() - startTime,
                error: `Only ${successCount}/${iterations} cycles completed successfully`,
            };
        }
        
        return {
            name: 'testRapidConnectDisconnect',
            passed: true,
            duration: Date.now() - startTime,
            details: {
                iterations,
                successCount,
                successRate: (successRate * 100).toFixed(1) + '%',
            },
        };
        
    } catch (error: any) {
        return {
            name: 'testRapidConnectDisconnect',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

// ============================================================================
// Memory/Performance Metrics
// ============================================================================

/**
 * Test: Connection Memory Impact
 * 
 * Note: This test collects metrics but doesn't fail based on memory.
 * Useful for benchmarking.
 */
export async function testConnectionMetrics(config: LoadTestConfig): Promise<TestResult> {
    const startTime = Date.now();
    const clientCount = config.clientCount || 20;
    let clients: SyntheticClient[] = [];
    
    try {
        // Record start memory (if available via Node)
        const startMemory = process.memoryUsage?.()?.heapUsed || 0;
        
        clients = await createClients(clientCount, config.serverUrl);
        await connectAllClients(clients, 3000);
        
        // Wait for stable state
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const endMemory = process.memoryUsage?.()?.heapUsed || 0;
        const memoryDelta = endMemory - startMemory;
        const memoryPerClient = clientCount > 0 ? memoryDelta / clientCount : 0;
        
        return {
            name: 'testConnectionMetrics',
            passed: true,
            duration: Date.now() - startTime,
            details: {
                clientCount,
                memoryDeltaKB: Math.round(memoryDelta / 1024),
                memoryPerClientKB: Math.round(memoryPerClient / 1024),
                note: 'Memory metrics are client-side only; server memory requires external monitoring',
            },
        };
        
    } catch (error: any) {
        return {
            name: 'testConnectionMetrics',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        await disconnectAllClients(clients);
    }
}

// ============================================================================
// Export All Tests
// ============================================================================

export const loadTests = {
    testConcurrentConnections,
    testConnectionStability,
    testRapidConnectDisconnect,
    testConnectionMetrics,
};

export default loadTests;


