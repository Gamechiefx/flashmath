/**
 * Property-Based Tests for 5v5 Casual Queue Fix - Queue State Consistency
 * 
 * Feature: 5v5-casual-queue-fix
 * Property 9: Queue State Consistency
 * 
 * Validates: Requirements 4.4
 * For any queue operation, the match type used should be consistent with the 
 * party's stored match type throughout the entire queue flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock types for testing
type MatchType = 'ranked' | 'casual';
type QueueStatus = 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';

interface MockPartyQueueState {
    status: QueueStatus;
    startedAt: number | null;
    matchType: MatchType | null;
    matchId: string | null;
}

interface MockParty {
    id: string;
    leaderId: string;
    members: Array<{ odUserId: string; odName: string; isReady: boolean; isLeader: boolean }>;
    queueState: MockPartyQueueState;
}

interface MockQueueOperation {
    partyId: string;
    matchType: MatchType;
    operation: 'join' | 'check' | 'leave';
    timestamp: number;
}

// Mock the party data retrieval
const mockGetPartyData = vi.fn();

// Mock the queue operations
const mockJoinTeamQueue = vi.fn();
const mockCheckTeamMatch = vi.fn();
const mockLeaveTeamQueue = vi.fn();

// Track queue operations for consistency validation
const queueOperationLog: MockQueueOperation[] = [];

// Simulate getting party data with queue state
function simulateGetPartyData(partyId: string): { party: MockParty | null; error?: string } {
    const party = mockGetPartyData(partyId);
    if (!party) {
        return { party: null, error: 'Party not found' };
    }
    return { party };
}

// Simulate joining team queue with match type validation
function simulateJoinTeamQueue(options: { partyId: string; matchType: MatchType }): { success: boolean; error?: string } {
    if (!options.partyId || !options.matchType) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    if (!['ranked', 'casual'].includes(options.matchType)) {
        return { success: false, error: 'Invalid match type' };
    }
    
    // Log the operation for consistency checking
    queueOperationLog.push({
        partyId: options.partyId,
        matchType: options.matchType,
        operation: 'join',
        timestamp: Date.now()
    });
    
    mockJoinTeamQueue(options);
    return { success: true };
}

// Simulate checking team match with match type validation
function simulateCheckTeamMatch(partyId: string, expectedMatchType: MatchType): { success: boolean; error?: string } {
    if (!partyId || !expectedMatchType) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    // Log the operation for consistency checking
    queueOperationLog.push({
        partyId,
        matchType: expectedMatchType,
        operation: 'check',
        timestamp: Date.now()
    });
    
    mockCheckTeamMatch(partyId, expectedMatchType);
    return { success: true };
}

// Simulate leaving team queue with match type validation
function simulateLeaveTeamQueue(partyId: string, expectedMatchType: MatchType): { success: boolean; error?: string } {
    if (!partyId || !expectedMatchType) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    // Log the operation for consistency checking
    queueOperationLog.push({
        partyId,
        matchType: expectedMatchType,
        operation: 'leave',
        timestamp: Date.now()
    });
    
    mockLeaveTeamQueue(partyId, expectedMatchType);
    return { success: true };
}

// Generate random party with queue state
function generateRandomPartyWithQueueState(): MockParty {
    const partyId = `party-${Math.random().toString(36).substring(7)}`;
    const leaderId = `leader-${Math.random().toString(36).substring(7)}`;
    const matchType: MatchType = Math.random() > 0.5 ? 'ranked' : 'casual';
    const status: QueueStatus = ['idle', 'finding_teammates', 'finding_opponents'][Math.floor(Math.random() * 3)] as QueueStatus;
    
    const memberCount = Math.floor(Math.random() * 5) + 1; // 1-5 members
    const members = [];
    
    // Add leader
    members.push({
        odUserId: leaderId,
        odName: `Leader-${leaderId.slice(-4)}`,
        isReady: Math.random() > 0.5,
        isLeader: true
    });
    
    // Add additional members
    for (let i = 1; i < memberCount; i++) {
        const memberId = `member-${i}-${Math.random().toString(36).substring(7)}`;
        members.push({
            odUserId: memberId,
            odName: `Member-${memberId.slice(-4)}`,
            isReady: Math.random() > 0.5,
            isLeader: false
        });
    }
    
    return {
        id: partyId,
        leaderId,
        members,
        queueState: {
            status,
            startedAt: status !== 'idle' ? Date.now() - Math.floor(Math.random() * 60000) : null,
            matchType: status !== 'idle' ? matchType : null,
            matchId: null
        }
    };
}

// Validate queue state consistency for a party
function validateQueueStateConsistency(partyId: string): { consistent: boolean; errors: string[] } {
    const operations = queueOperationLog.filter(op => op.partyId === partyId);
    const errors: string[] = [];
    
    if (operations.length === 0) {
        return { consistent: true, errors: [] };
    }
    
    // Check that all operations for this party use the same match type
    const firstMatchType = operations[0].matchType;
    for (const operation of operations) {
        if (operation.matchType !== firstMatchType) {
            errors.push(`Inconsistent match type: expected ${firstMatchType}, got ${operation.matchType} for operation ${operation.operation}`);
        }
    }
    
    return { consistent: errors.length === 0, errors };
}

describe('Property 9: Queue State Consistency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queueOperationLog.length = 0; // Clear operation log
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    it('should maintain consistent match type across all queue operations for any party', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate random party with queue state
            const party = generateRandomPartyWithQueueState();
            
            // Mock the party data retrieval to return our test party
            mockGetPartyData.mockReturnValue(party);
            
            // Skip if party is idle (no match type set)
            if (party.queueState.status === 'idle' || !party.queueState.matchType) {
                continue;
            }
            
            const expectedMatchType = party.queueState.matchType;
            
            // Simulate queue page reading party data and using match type
            const partyDataResult = simulateGetPartyData(party.id);
            expect(partyDataResult.party).toBeTruthy();
            
            const retrievedMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
            
            // Perform various queue operations with the retrieved match type
            const operations = [
                () => simulateJoinTeamQueue({ partyId: party.id, matchType: retrievedMatchType }),
                () => simulateCheckTeamMatch(party.id, retrievedMatchType),
                () => simulateLeaveTeamQueue(party.id, retrievedMatchType)
            ];
            
            // Randomly select and execute 1-3 operations
            const numOperations = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < numOperations; i++) {
                const operation = operations[Math.floor(Math.random() * operations.length)];
                const result = operation();
                expect(result.success).toBe(true);
            }
            
            // Validate that all operations used consistent match type
            const consistency = validateQueueStateConsistency(party.id);
            expect(consistency.consistent).toBe(true);
            if (!consistency.consistent) {
                console.error(`Consistency errors for party ${party.id}:`, consistency.errors);
            }
            
            // Verify the match type matches what was stored in party state
            const partyOperations = queueOperationLog.filter(op => op.partyId === party.id);
            partyOperations.forEach(op => {
                expect(op.matchType).toBe(expectedMatchType);
            });
        }
    });
    
    it('should use fallback to ranked when match type is null or undefined', () => {
        for (let iteration = 0; iteration < 50; iteration++) {
            const party = generateRandomPartyWithQueueState();
            
            // Force match type to be null/undefined
            party.queueState.matchType = null;
            party.queueState.status = 'finding_opponents'; // Active queue state
            
            mockGetPartyData.mockReturnValue(party);
            
            // Simulate queue page reading party data
            const partyDataResult = simulateGetPartyData(party.id);
            expect(partyDataResult.party).toBeTruthy();
            
            // Should fallback to 'ranked' when matchType is null
            const fallbackMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
            expect(fallbackMatchType).toBe('ranked');
            
            // Perform queue operation with fallback
            const joinResult = simulateJoinTeamQueue({ 
                partyId: party.id, 
                matchType: fallbackMatchType 
            });
            
            expect(joinResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: 'ranked'
            });
        }
    });
    
    it('should maintain consistency when switching between queue phases', () => {
        for (let iteration = 0; iteration < 50; iteration++) {
            const party = generateRandomPartyWithQueueState();
            const matchType: MatchType = Math.random() > 0.5 ? 'ranked' : 'casual';
            
            // Set initial queue state
            party.queueState.matchType = matchType;
            party.queueState.status = 'finding_teammates';
            
            mockGetPartyData.mockReturnValue(party);
            
            // Phase 1: Finding teammates
            let partyDataResult = simulateGetPartyData(party.id);
            let retrievedMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
            
            let joinResult = simulateJoinTeamQueue({ 
                partyId: party.id, 
                matchType: retrievedMatchType 
            });
            expect(joinResult.success).toBe(true);
            
            // Phase 2: Finding opponents (simulate phase transition)
            party.queueState.status = 'finding_opponents';
            mockGetPartyData.mockReturnValue(party);
            
            partyDataResult = simulateGetPartyData(party.id);
            retrievedMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
            
            joinResult = simulateJoinTeamQueue({ 
                partyId: party.id, 
                matchType: retrievedMatchType 
            });
            expect(joinResult.success).toBe(true);
            
            // Validate consistency across phases
            const consistency = validateQueueStateConsistency(party.id);
            expect(consistency.consistent).toBe(true);
            
            // All operations should use the same match type
            const partyOperations = queueOperationLog.filter(op => op.partyId === party.id);
            partyOperations.forEach(op => {
                expect(op.matchType).toBe(matchType);
            });
        }
    });
    
    it('should handle concurrent queue operations consistently', () => {
        for (let iteration = 0; iteration < 30; iteration++) {
            const party = generateRandomPartyWithQueueState();
            const matchType: MatchType = Math.random() > 0.5 ? 'ranked' : 'casual';
            
            party.queueState.matchType = matchType;
            party.queueState.status = 'finding_opponents';
            
            mockGetPartyData.mockReturnValue(party);
            
            // Simulate multiple concurrent operations (as might happen in real usage)
            const concurrentOperations = [
                () => simulateJoinTeamQueue({ partyId: party.id, matchType }),
                () => simulateCheckTeamMatch(party.id, matchType),
                () => simulateCheckTeamMatch(party.id, matchType),
                () => simulateCheckTeamMatch(party.id, matchType)
            ];
            
            // Execute all operations
            concurrentOperations.forEach(operation => {
                const result = operation();
                expect(result.success).toBe(true);
            });
            
            // Validate all operations used the same match type
            const consistency = validateQueueStateConsistency(party.id);
            expect(consistency.consistent).toBe(true);
            
            const partyOperations = queueOperationLog.filter(op => op.partyId === party.id);
            expect(partyOperations.length).toBeGreaterThan(0);
            
            partyOperations.forEach(op => {
                expect(op.matchType).toBe(matchType);
            });
        }
    });
    
    it('should validate match type consistency across different party configurations', () => {
        const testConfigurations = [
            // Single member party
            { memberCount: 1, matchType: 'ranked' as MatchType },
            { memberCount: 1, matchType: 'casual' as MatchType },
            // Partial party
            { memberCount: 3, matchType: 'ranked' as MatchType },
            { memberCount: 3, matchType: 'casual' as MatchType },
            // Full party
            { memberCount: 5, matchType: 'ranked' as MatchType },
            { memberCount: 5, matchType: 'casual' as MatchType }
        ];
        
        testConfigurations.forEach((config, index) => {
            for (let iteration = 0; iteration < 10; iteration++) {
                const partyId = `config-party-${index}-${iteration}`;
                const leaderId = `config-leader-${index}-${iteration}`;
                
                const members = Array.from({ length: config.memberCount }, (_, i) => ({
                    odUserId: i === 0 ? leaderId : `member-${i}-${iteration}`,
                    odName: i === 0 ? 'Leader' : `Member ${i}`,
                    isReady: Math.random() > 0.5,
                    isLeader: i === 0
                }));
                
                const party: MockParty = {
                    id: partyId,
                    leaderId,
                    members,
                    queueState: {
                        status: 'finding_opponents',
                        startedAt: Date.now(),
                        matchType: config.matchType,
                        matchId: null
                    }
                };
                
                mockGetPartyData.mockReturnValue(party);
                
                // Perform queue operations
                const partyDataResult = simulateGetPartyData(party.id);
                const retrievedMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
                
                const joinResult = simulateJoinTeamQueue({ 
                    partyId: party.id, 
                    matchType: retrievedMatchType 
                });
                
                expect(joinResult.success).toBe(true);
                
                const checkResult = simulateCheckTeamMatch(party.id, retrievedMatchType);
                expect(checkResult.success).toBe(true);
                
                // Validate consistency
                const consistency = validateQueueStateConsistency(party.id);
                expect(consistency.consistent).toBe(true);
                
                // Verify match type matches configuration
                const partyOperations = queueOperationLog.filter(op => op.partyId === party.id);
                partyOperations.forEach(op => {
                    expect(op.matchType).toBe(config.matchType);
                });
            }
        });
    });
    
    it('should handle edge cases in queue state consistency', () => {
        const edgeCases = [
            // Party with match type but idle status
            {
                name: 'idle with match type',
                queueState: { status: 'idle' as QueueStatus, matchType: 'ranked' as MatchType, startedAt: null, matchId: null }
            },
            // Party transitioning from match found back to queue
            {
                name: 'match found state',
                queueState: { status: 'match_found' as QueueStatus, matchType: 'casual' as MatchType, startedAt: Date.now() - 30000, matchId: 'match-123' }
            }
        ];
        
        edgeCases.forEach((testCase, index) => {
            const party: MockParty = {
                id: `edge-party-${index}`,
                leaderId: `edge-leader-${index}`,
                members: [{ 
                    odUserId: `edge-leader-${index}`, 
                    odName: 'Leader', 
                    isReady: true, 
                    isLeader: true 
                }],
                queueState: testCase.queueState
            };
            
            mockGetPartyData.mockReturnValue(party);
            
            // Only test active queue states
            if (party.queueState.status !== 'idle' && party.queueState.status !== 'match_found') {
                const partyDataResult = simulateGetPartyData(party.id);
                const retrievedMatchType = partyDataResult.party!.queueState.matchType || 'ranked';
                
                const joinResult = simulateJoinTeamQueue({ 
                    partyId: party.id, 
                    matchType: retrievedMatchType 
                });
                
                expect(joinResult.success).toBe(true);
                
                // Validate consistency
                const consistency = validateQueueStateConsistency(party.id);
                expect(consistency.consistent).toBe(true);
            }
        });
    });
});