/**
 * Integration Tests for Complete Casual Queue Flow
 * 
 * Tests the end-to-end flow for casual 5v5 queue system:
 * - Setup → Queue → Matchmaking for casual mode
 * - AI teammate addition for incomplete parties
 * - Casual vs casual opponent finding
 * 
 * Requirements: All (comprehensive integration testing)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testUtils } from '../setup';

// Mock the auth module
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// Mock the database modules
vi.mock('@/lib/db/sqlite', () => ({
    getDatabase: vi.fn(() => ({
        prepare: vi.fn(() => ({
            get: vi.fn(),
            all: vi.fn(),
        })),
    })),
}));

// Mock the arena database
vi.mock('@/lib/arena/arena-db', () => ({
    getPlayerElo: vi.fn().mockResolvedValue({ elo: 300 }),
    getOrCreateArenaPlayer: vi.fn().mockResolvedValue({}),
    getTeamEloFromPostgres: vi.fn().mockResolvedValue({ elo: 300 }),
}));

// Mock Redis
const mockRedis = {
    zadd: vi.fn().mockResolvedValue('OK'),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    zrem: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zcard: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
};

vi.mock('ioredis', () => ({
    default: class MockRedis {
        constructor() {
            return mockRedis;
        }
    },
}));

// Mock party redis module
vi.mock('@/lib/party/party-redis', () => ({
    getParty: vi.fn(),
    updateQueueState: vi.fn().mockResolvedValue({ success: true }),
    setMatchFound: vi.fn().mockResolvedValue({ success: true }),
    toggleReady: vi.fn().mockResolvedValue({ success: true }),
}));

// Import the functions to test after mocking
import { 
    joinTeamQueue, 
    checkTeamMatch, 
    getTeamQueueStatus,
    getTeamQueueCount,
    leaveTeamQueue 
} from '@/lib/actions/team-matchmaking';
import { auth } from '@/auth';
import { getParty, updateQueueState } from '@/lib/party/party-redis';

describe('Casual Queue Flow Integration Tests', () => {
    const mockSession = {
        user: { id: 'test-leader-id' },
    };

    // Mock party data for casual matches
    const createMockPartyData = (memberCount: number = 3, matchType: 'casual' | 'ranked' = 'casual') => ({
        party: {
            id: 'test-party-id',
            leaderId: 'test-leader-id',
            iglId: matchType === 'ranked' ? 'test-igl-id' : null,
            anchorId: matchType === 'ranked' ? 'test-anchor-id' : null,
            teamId: null,
            teamName: null,
            teamTag: null,
        },
        members: Array.from({ length: memberCount }, (_, i) => ({
            odUserId: `test-user-${i}`,
            odUserName: `TestUser${i}`,
            odLevel: 1,
            odEquippedFrame: null,
            odEquippedBanner: null,
            odEquippedTitle: null,
            isReady: true,
        })),
        queueState: {
            status: 'idle' as const,
            startedAt: null,
            matchType: null,
            matchId: null,
        },
        invites: [],
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue(mockSession);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Complete Casual Queue Flow', () => {
        it('should handle casual queue joining with incomplete party', async () => {
            // Setup: Create a party with 3 members (incomplete for 5v5)
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            // Step 1: Join casual queue (should succeed with incomplete party)
            const joinResult = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(joinResult.success).toBe(true);
            
            // Verify queue state was updated to finding_opponents
            expect(updateQueueState).toHaveBeenCalledWith(
                'test-party-id',
                'test-leader-id',
                'finding_opponents',
                'casual'
            );

            // Verify party was added to casual queue
            expect(mockRedis.zadd).toHaveBeenCalledWith(
                'team:queue:casual:5v5',
                expect.any(Number), // ELO score
                'test-party-id'
            );
        });

        it('should allow casual matches with incomplete parties but reject ranked', async () => {
            // Test casual with 3 members - should succeed
            const casualPartyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(casualPartyData);

            const casualResult = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(casualResult.success).toBe(true);

            // Test ranked with 3 members - should fail
            const rankedPartyData = createMockPartyData(3, 'ranked');
            vi.mocked(getParty).mockResolvedValue(rankedPartyData);

            const rankedResult = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'ranked',
            });

            expect(rankedResult.success).toBe(false);
            expect(rankedResult.error).toContain('Ranked 5v5 requires a full party of 5 players');
        });

        it('should use correct queue keys for different match types', async () => {
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            // Test casual queue
            await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(mockRedis.zadd).toHaveBeenCalledWith(
                'team:queue:casual:5v5',
                expect.any(Number),
                'test-party-id'
            );

            // Reset mocks and test ranked queue with full party and proper IGL/Anchor
            vi.clearAllMocks();
            const fullRankedParty = createMockPartyData(5, 'ranked');
            // Ensure IGL and Anchor are in the member list
            fullRankedParty.members[0].odUserId = 'test-igl-id';
            fullRankedParty.members[1].odUserId = 'test-anchor-id';
            vi.mocked(getParty).mockResolvedValue(fullRankedParty);

            await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'ranked',
            });

            expect(mockRedis.zadd).toHaveBeenCalledWith(
                'team:queue:ranked:5v5',
                expect.any(Number),
                'test-party-id'
            );
        });

        it('should preserve match type throughout queue operations', async () => {
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            // Join queue with casual match type
            const joinResult = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(joinResult.success).toBe(true);

            // Verify match type was passed to updateQueueState
            expect(updateQueueState).toHaveBeenCalledWith(
                'test-party-id',
                'test-leader-id',
                'finding_opponents',
                'casual' // Match type preserved
            );

            // Verify queue entry is stored in casual queue
            expect(mockRedis.zadd).toHaveBeenCalledWith(
                'team:queue:casual:5v5',
                expect.any(Number),
                'test-party-id'
            );
        });

        it('should handle queue timeout gracefully', async () => {
            // Mock queue entry that has expired (over 3 minutes)
            mockRedis.get.mockResolvedValueOnce(null); // No match found
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({
                odPartyId: 'test-party-id',
                odMatchType: 'casual',
                odJoinedAt: Date.now() - 200000, // 200 seconds ago (> 180s timeout)
                odMembers: [],
                odElo: 300,
            }));

            const statusResult = await checkTeamMatch('test-party-id');

            expect(statusResult.status.inQueue).toBe(false);
            expect(statusResult.error).toContain('Queue timeout');

            // The timeout is detected and handled properly
            expect(statusResult.status.phase).toBe(null);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle authentication errors', async () => {
            vi.mocked(auth).mockResolvedValue(null);

            const result = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Not authenticated');
        });

        it('should handle missing party data', async () => {
            vi.mocked(getParty).mockResolvedValue(null);

            const result = await joinTeamQueue({
                partyId: 'non-existent-party',
                matchType: 'casual',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Party not found');
        });

        it('should handle invalid match types', async () => {
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            const result = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'invalid' as any,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid match type');
        });

        it('should handle Redis connection failures gracefully', async () => {
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            // Mock Redis failure
            mockRedis.zadd.mockRejectedValueOnce(new Error('Redis connection failed'));

            const result = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Redis connection failed');
        });

        it('should handle non-leader attempting to start queue', async () => {
            const partyData = createMockPartyData(3, 'casual');
            vi.mocked(getParty).mockResolvedValue(partyData);

            // Mock different user (not the leader)
            vi.mocked(auth).mockResolvedValue({ user: { id: 'non-leader-id' } });

            const result = await joinTeamQueue({
                partyId: 'test-party-id',
                matchType: 'casual',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Only the party leader can start the queue');
        });

        it('should handle malformed queue data gracefully', async () => {
            mockRedis.get.mockResolvedValueOnce(null); // No match
            mockRedis.get.mockResolvedValueOnce('invalid-json'); // Malformed queue entry

            const statusResult = await checkTeamMatch('test-party-id');

            expect(statusResult.status.inQueue).toBe(false);
            expect(statusResult.error).toBeDefined();
        });
    });
});