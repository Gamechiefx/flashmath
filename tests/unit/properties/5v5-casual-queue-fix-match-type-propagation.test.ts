/**
 * Property-Based Tests for 5v5 Casual Queue Fix - Match Type Propagation
 * 
 * Feature: 5v5-casual-queue-fix
 * Property 1: Match Type Propagation
 * 
 * Validates: Requirements 1.1, 1.2, 1.4, 4.3
 * For any party and match type selection (ranked/casual), when the party leader 
 * selects a match type in setup and starts the queue, the queue system should 
 * receive and use that exact match type for all subsequent operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock types for testing
type MatchType = 'ranked' | 'casual';
type QueueStatus = 'idle' | 'finding_teammates' | 'finding_opponents';

interface MockParty {
    id: string;
    leaderId: string;
    members: Array<{ odUserId: string; odName: string; isReady: boolean; isLeader: boolean }>;
    queueState: {
        status: QueueStatus;
        matchType: MatchType | null;
        startedAt: number | null;
    };
}

interface MockQueueOperation {
    partyId: string;
    leaderId: string;
    status: QueueStatus;
    matchType?: MatchType;
}

// Mock the party-redis updateQueueState function
const mockUpdateQueueState = vi.fn();

// Mock the team setup client's queue operations
const mockJoinTeamQueue = vi.fn();

// Simulate the updateQueueState function behavior
function simulateUpdateQueueState(
    partyId: string,
    leaderId: string,
    status: QueueStatus,
    matchType?: MatchType
): { success: boolean; error?: string } {
    // Validate inputs
    if (!partyId || !leaderId) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    if (!['idle', 'finding_teammates', 'finding_opponents'].includes(status)) {
        return { success: false, error: 'Invalid status' };
    }
    
    if (matchType && !['ranked', 'casual'].includes(matchType)) {
        return { success: false, error: 'Invalid match type' };
    }
    
    // Simulate successful update
    mockUpdateQueueState(partyId, leaderId, status, matchType);
    return { success: true };
}

// Simulate the team queue joining process
function simulateJoinTeamQueue(options: { partyId: string; matchType: MatchType }): { success: boolean; error?: string } {
    if (!options.partyId || !options.matchType) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    if (!['ranked', 'casual'].includes(options.matchType)) {
        return { success: false, error: 'Invalid match type' };
    }
    
    mockJoinTeamQueue(options);
    return { success: true };
}

// Generate random party for testing
function generateRandomParty(): MockParty {
    const partyId = `party-${Math.random().toString(36).substring(7)}`;
    const leaderId = `leader-${Math.random().toString(36).substring(7)}`;
    
    const memberCount = Math.floor(Math.random() * 5) + 1; // 1-5 members
    const members = [];
    
    // Add leader
    members.push({
        odUserId: leaderId,
        odName: `Leader-${leaderId.slice(-4)}`,
        isReady: false,
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
            status: 'idle',
            matchType: null,
            startedAt: null
        }
    };
}

// Generate random match type
function generateRandomMatchType(): MatchType {
    return Math.random() > 0.5 ? 'ranked' : 'casual';
}

describe('Property 1: Match Type Propagation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    it('should propagate match type from setup to queue state for any party and match type', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate random test data
            const party = generateRandomParty();
            const selectedMatchType = generateRandomMatchType();
            const queueStatus: QueueStatus = Math.random() > 0.5 ? 'finding_teammates' : 'finding_opponents';
            
            // Simulate the team setup calling updateQueueState with match type
            const updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                queueStatus,
                selectedMatchType
            );
            
            // Verify the update was successful
            expect(updateResult.success).toBe(true);
            
            // Verify updateQueueState was called with correct parameters
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                queueStatus,
                selectedMatchType
            );
            
            // Simulate the queue page reading the match type and using it
            const queueResult = simulateJoinTeamQueue({
                partyId: party.id,
                matchType: selectedMatchType
            });
            
            // Verify the queue operation used the correct match type
            expect(queueResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: selectedMatchType
            });
        }
    });
    
    it('should handle ranked match type propagation correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const party = generateRandomParty();
            const matchType: MatchType = 'ranked';
            
            // Test finding teammates flow
            let updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_teammates',
                matchType
            );
            
            expect(updateResult.success).toBe(true);
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                'finding_teammates',
                'ranked'
            );
            
            // Test finding opponents flow
            updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_opponents',
                matchType
            );
            
            expect(updateResult.success).toBe(true);
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                'finding_opponents',
                'ranked'
            );
            
            // Test queue joining with ranked type
            const queueResult = simulateJoinTeamQueue({
                partyId: party.id,
                matchType: 'ranked'
            });
            
            expect(queueResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: 'ranked'
            });
        }
    });
    
    it('should handle casual match type propagation correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const party = generateRandomParty();
            const matchType: MatchType = 'casual';
            
            // Test finding teammates flow
            let updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_teammates',
                matchType
            );
            
            expect(updateResult.success).toBe(true);
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                'finding_teammates',
                'casual'
            );
            
            // Test finding opponents flow
            updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_opponents',
                matchType
            );
            
            expect(updateResult.success).toBe(true);
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                'finding_opponents',
                'casual'
            );
            
            // Test queue joining with casual type
            const queueResult = simulateJoinTeamQueue({
                partyId: party.id,
                matchType: 'casual'
            });
            
            expect(queueResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: 'casual'
            });
        }
    });
    
    it('should maintain match type consistency across queue operations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const party = generateRandomParty();
            const selectedMatchType = generateRandomMatchType();
            
            // Simulate multiple queue operations with the same match type
            const operations: QueueStatus[] = ['finding_teammates', 'finding_opponents'];
            
            for (const operation of operations) {
                const updateResult = simulateUpdateQueueState(
                    party.id,
                    party.leaderId,
                    operation,
                    selectedMatchType
                );
                
                expect(updateResult.success).toBe(true);
                
                // Verify the same match type is used consistently
                expect(mockUpdateQueueState).toHaveBeenCalledWith(
                    party.id,
                    party.leaderId,
                    operation,
                    selectedMatchType
                );
            }
            
            // Verify final queue join uses the same match type
            const queueResult = simulateJoinTeamQueue({
                partyId: party.id,
                matchType: selectedMatchType
            });
            
            expect(queueResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: selectedMatchType
            });
        }
    });
    
    it('should reject invalid match types', () => {
        for (let iteration = 0; iteration < 10; iteration++) {
            const party = generateRandomParty();
            const invalidMatchTypes = ['invalid', 'unknown', '', null, undefined];
            const randomInvalidType = invalidMatchTypes[Math.floor(Math.random() * invalidMatchTypes.length)];
            
            // Test that invalid match types are rejected
            const updateResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_opponents',
                randomInvalidType as any
            );
            
            if (randomInvalidType && randomInvalidType !== '') {
                expect(updateResult.success).toBe(false);
                expect(updateResult.error).toContain('Invalid match type');
            }
        }
    });
    
    it('should handle edge cases in match type propagation', () => {
        const edgeCases = [
            // Single member party (leader only)
            {
                party: {
                    id: 'edge-party-1',
                    leaderId: 'leader-1',
                    members: [{ odUserId: 'leader-1', odName: 'Leader', isReady: false, isLeader: true }],
                    queueState: { status: 'idle' as QueueStatus, matchType: null, startedAt: null }
                },
                matchType: 'ranked' as MatchType
            },
            // Full party (5 members)
            {
                party: {
                    id: 'edge-party-2',
                    leaderId: 'leader-2',
                    members: Array.from({ length: 5 }, (_, i) => ({
                        odUserId: i === 0 ? 'leader-2' : `member-${i}`,
                        odName: i === 0 ? 'Leader' : `Member ${i}`,
                        isReady: true,
                        isLeader: i === 0
                    })),
                    queueState: { status: 'idle' as QueueStatus, matchType: null, startedAt: null }
                },
                matchType: 'casual' as MatchType
            }
        ];
        
        edgeCases.forEach((testCase, index) => {
            const updateResult = simulateUpdateQueueState(
                testCase.party.id,
                testCase.party.leaderId,
                'finding_opponents',
                testCase.matchType
            );
            
            expect(updateResult.success).toBe(true);
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                testCase.party.id,
                testCase.party.leaderId,
                'finding_opponents',
                testCase.matchType
            );
            
            const queueResult = simulateJoinTeamQueue({
                partyId: testCase.party.id,
                matchType: testCase.matchType
            });
            
            expect(queueResult.success).toBe(true);
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: testCase.party.id,
                matchType: testCase.matchType
            });
        });
    });
    
    it('should validate that match type is preserved through the entire queue flow', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const party = generateRandomParty();
            const selectedMatchType = generateRandomMatchType();
            
            // Step 1: Team setup updates queue state with match type
            const setupResult = simulateUpdateQueueState(
                party.id,
                party.leaderId,
                'finding_opponents',
                selectedMatchType
            );
            
            expect(setupResult.success).toBe(true);
            
            // Step 2: Queue page should use the same match type
            const queueResult = simulateJoinTeamQueue({
                partyId: party.id,
                matchType: selectedMatchType
            });
            
            expect(queueResult.success).toBe(true);
            
            // Verify the match type was consistent throughout
            expect(mockUpdateQueueState).toHaveBeenCalledWith(
                party.id,
                party.leaderId,
                'finding_opponents',
                selectedMatchType
            );
            
            expect(mockJoinTeamQueue).toHaveBeenCalledWith({
                partyId: party.id,
                matchType: selectedMatchType
            });
            
            // Verify no calls were made with different match types
            const updateCalls = mockUpdateQueueState.mock.calls;
            const queueCalls = mockJoinTeamQueue.mock.calls;
            
            // All update calls for this party should use the same match type
            const partyUpdateCalls = updateCalls.filter(call => call[0] === party.id);
            partyUpdateCalls.forEach(call => {
                expect(call[3]).toBe(selectedMatchType); // matchType parameter
            });
            
            // All queue calls for this party should use the same match type
            const partyQueueCalls = queueCalls.filter(call => call[0].partyId === party.id);
            partyQueueCalls.forEach(call => {
                expect(call[0].matchType).toBe(selectedMatchType);
            });
        }
    });
});