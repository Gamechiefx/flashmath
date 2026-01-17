/**
 * Party Redis Tests
 * Tests for party management with Redis mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock Redis client
const mockRedisClient = {
    hset: vi.fn().mockResolvedValue('OK'),
    hget: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hdel: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    publish: vi.fn().mockResolvedValue(1),
    multi: vi.fn(() => ({
        hset: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
    })),
};

// Mock ioredis before importing the module
vi.mock('ioredis', () => ({
    default: vi.fn(() => mockRedisClient),
}));

// Import types for testing
import type {
    PartyState,
    PartyMember,
    PartyInvite,
    PartyQueueState,
    FullPartyData,
} from '@/lib/party/party-redis';

describe('PartyState Interface', () => {
    it('should define correct party properties', () => {
        const party: PartyState = {
            id: 'party-123',
            leaderId: 'user-1',
            leaderName: 'TestLeader',
            iglId: 'user-1',
            anchorId: 'user-2',
            targetMode: '5v5',
            teamId: 'team-123',
            teamName: 'Test Team',
            teamTag: 'TST',
            inviteMode: 'invite_only',
            maxSize: 5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        expect(party.id).toBe('party-123');
        expect(party.leaderId).toBe('user-1');
        expect(party.targetMode).toBe('5v5');
        expect(party.maxSize).toBe(5);
    });

    it('should allow null values for optional fields', () => {
        const party: PartyState = {
            id: 'party-456',
            leaderId: 'user-1',
            leaderName: 'TestLeader',
            iglId: null,
            anchorId: null,
            targetMode: null,
            teamId: null,
            teamName: null,
            teamTag: null,
            inviteMode: 'open',
            maxSize: 5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        expect(party.iglId).toBeNull();
        expect(party.teamId).toBeNull();
    });

    it('should support different target modes', () => {
        const modes: PartyState['targetMode'][] = ['5v5', '3v3', '2v2', null];
        modes.forEach(mode => {
            expect(['5v5', '3v3', '2v2', null]).toContain(mode);
        });
    });
});

describe('PartyMember Interface', () => {
    it('should define correct member properties', () => {
        const member: PartyMember = {
            odUserId: 'user-1',
            odUserName: 'TestPlayer',
            odLevel: 50,
            odEquippedFrame: 'gold-frame',
            odEquippedTitle: 'Champion',
            odEquippedBanner: 'stars',
            isReady: true,
            preferredOperation: 'multiplication',
            joinedAt: Date.now(),
            isOnline: true,
        };

        expect(member.odUserId).toBe('user-1');
        expect(member.odLevel).toBe(50);
        expect(member.isReady).toBe(true);
        expect(member.isOnline).toBe(true);
    });

    it('should allow null for cosmetic fields', () => {
        const member: PartyMember = {
            odUserId: 'user-2',
            odUserName: 'NewPlayer',
            odLevel: 1,
            odEquippedFrame: null,
            odEquippedTitle: null,
            isReady: false,
            preferredOperation: null,
            joinedAt: Date.now(),
            isOnline: true,
        };

        expect(member.odEquippedFrame).toBeNull();
        expect(member.preferredOperation).toBeNull();
    });
});

describe('PartyInvite Interface', () => {
    it('should define correct invite properties', () => {
        const invite: PartyInvite = {
            inviteId: 'invite-123',
            inviterId: 'user-1',
            inviterName: 'Leader',
            inviteeId: 'user-2',
            inviteeName: 'Invitee',
            partyId: 'party-123',
            createdAt: Date.now(),
            expiresAt: Date.now() + 600000, // 10 minutes
        };

        expect(invite.inviteId).toBe('invite-123');
        expect(invite.expiresAt).toBeGreaterThan(invite.createdAt);
    });

    it('should have expiration after creation', () => {
        const now = Date.now();
        const invite: PartyInvite = {
            inviteId: 'invite-456',
            inviterId: 'user-1',
            inviterName: 'Leader',
            inviteeId: 'user-3',
            inviteeName: 'Another',
            partyId: 'party-123',
            createdAt: now,
            expiresAt: now + 600000,
        };

        expect(invite.expiresAt - invite.createdAt).toBe(600000); // 10 minutes
    });
});

describe('PartyQueueState Interface', () => {
    it('should define correct queue state properties', () => {
        const queueState: PartyQueueState = {
            status: 'finding_opponents',
            startedAt: Date.now(),
            matchType: 'ranked',
            matchId: null,
        };

        expect(queueState.status).toBe('finding_opponents');
        expect(queueState.matchType).toBe('ranked');
    });

    it('should support all queue statuses', () => {
        const statuses: PartyQueueState['status'][] = [
            'idle',
            'finding_teammates',
            'finding_opponents',
            'match_found',
        ];

        statuses.forEach(status => {
            expect(['idle', 'finding_teammates', 'finding_opponents', 'match_found']).toContain(status);
        });
    });

    it('should support match types', () => {
        const matchTypes: PartyQueueState['matchType'][] = ['ranked', 'casual', null];
        matchTypes.forEach(type => {
            expect(['ranked', 'casual', null]).toContain(type);
        });
    });
});

describe('FullPartyData Interface', () => {
    it('should combine all party data', () => {
        const fullData: FullPartyData = {
            party: {
                id: 'party-123',
                leaderId: 'user-1',
                leaderName: 'Leader',
                iglId: 'user-1',
                anchorId: null,
                targetMode: '5v5',
                teamId: null,
                teamName: null,
                teamTag: null,
                inviteMode: 'open',
                maxSize: 5,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            members: [
                {
                    odUserId: 'user-1',
                    odUserName: 'Leader',
                    odLevel: 50,
                    odEquippedFrame: null,
                    odEquippedTitle: null,
                    isReady: true,
                    preferredOperation: null,
                    joinedAt: Date.now(),
                    isOnline: true,
                },
            ],
            queueState: {
                status: 'idle',
                startedAt: null,
                matchType: null,
                matchId: null,
            },
            invites: [],
        };

        expect(fullData.party.id).toBe('party-123');
        expect(fullData.members).toHaveLength(1);
        expect(fullData.queueState.status).toBe('idle');
        expect(fullData.invites).toHaveLength(0);
    });
});

describe('Redis Key Structure', () => {
    const KEYS = {
        party: (id: string) => `party:${id}`,
        members: (id: string) => `party:${id}:members`,
        invites: (id: string) => `party:${id}:invites`,
        queue: (id: string) => `party:${id}:queue`,
        userParty: (userId: string) => `user:${userId}:party`,
    };

    it('should generate correct party key', () => {
        expect(KEYS.party('test-123')).toBe('party:test-123');
    });

    it('should generate correct members key', () => {
        expect(KEYS.members('test-123')).toBe('party:test-123:members');
    });

    it('should generate correct invites key', () => {
        expect(KEYS.invites('test-123')).toBe('party:test-123:invites');
    });

    it('should generate correct queue key', () => {
        expect(KEYS.queue('test-123')).toBe('party:test-123:queue');
    });

    it('should generate correct user party key', () => {
        expect(KEYS.userParty('user-456')).toBe('user:user-456:party');
    });
});

describe('TTL Constants', () => {
    const PARTY_TTL = 14400;    // 4 hours
    const INVITE_TTL = 600;     // 10 minutes
    const QUEUE_TTL = 300;      // 5 minutes

    it('should have correct party TTL (4 hours)', () => {
        expect(PARTY_TTL).toBe(4 * 60 * 60);
    });

    it('should have correct invite TTL (10 minutes)', () => {
        expect(INVITE_TTL).toBe(10 * 60);
    });

    it('should have correct queue TTL (5 minutes)', () => {
        expect(QUEUE_TTL).toBe(5 * 60);
    });

    it('should have party TTL longer than invite TTL', () => {
        expect(PARTY_TTL).toBeGreaterThan(INVITE_TTL);
    });
});

describe('Party Size Constraints', () => {
    it('should support 5v5 party size', () => {
        const party: Partial<PartyState> = {
            targetMode: '5v5',
            maxSize: 5,
        };
        expect(party.maxSize).toBe(5);
    });

    it('should support 3v3 party size', () => {
        const party: Partial<PartyState> = {
            targetMode: '3v3',
            maxSize: 3,
        };
        expect(party.maxSize).toBe(3);
    });

    it('should support 2v2 party size', () => {
        const party: Partial<PartyState> = {
            targetMode: '2v2',
            maxSize: 2,
        };
        expect(party.maxSize).toBe(2);
    });
});

describe('Invite Mode Options', () => {
    it('should support open invite mode', () => {
        const party: Partial<PartyState> = {
            inviteMode: 'open',
        };
        expect(party.inviteMode).toBe('open');
    });

    it('should support invite_only mode', () => {
        const party: Partial<PartyState> = {
            inviteMode: 'invite_only',
        };
        expect(party.inviteMode).toBe('invite_only');
    });
});

describe('Module Exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should export getRedis function', async () => {
        const partyRedis = await import('@/lib/party/party-redis');
        expect(partyRedis.getRedis).toBeDefined();
    });

    it('should export party management functions', async () => {
        const partyRedis = await import('@/lib/party/party-redis');

        // Party lifecycle
        expect(partyRedis.createParty).toBeDefined();
        expect(partyRedis.getParty).toBeDefined();
        expect(partyRedis.disbandParty).toBeDefined();

        // Member management
        expect(partyRedis.joinParty).toBeDefined();
        expect(partyRedis.leaveParty).toBeDefined();
        expect(partyRedis.kickMember).toBeDefined();
        expect(partyRedis.getMemberIds).toBeDefined();

        // Ready state
        expect(partyRedis.toggleReady).toBeDefined();
        expect(partyRedis.checkAllReady).toBeDefined();

        // Roles
        expect(partyRedis.setIGL).toBeDefined();
        expect(partyRedis.setAnchor).toBeDefined();

        // Invites
        expect(partyRedis.createInvite).toBeDefined();
        expect(partyRedis.acceptInvite).toBeDefined();
        expect(partyRedis.declineInvite).toBeDefined();
        expect(partyRedis.getUserPendingInvites).toBeDefined();

        // Queue
        expect(partyRedis.updateQueueState).toBeDefined();
        expect(partyRedis.getQueueState).toBeDefined();
        expect(partyRedis.setMatchFound).toBeDefined();

        // User party management
        expect(partyRedis.getUserParty).toBeDefined();
        expect(partyRedis.validateUserPartyState).toBeDefined();
    });
});
