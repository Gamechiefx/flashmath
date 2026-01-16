'use server';

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results and Redis operations use any types */

/**
 * FlashMath Party System - Redis-Based
 * 
 * Complete party management using Redis as the primary (and only) storage.
 * Parties are transient arena constructs - no SQLite persistence needed.
 * 
 * Architecture:
 * - Redis: All party state (members, ready status, invites, queue)
 * - PostgreSQL: Match history only (after match completes)
 * - Socket.IO: Real-time broadcasts via rooms
 * 
 * Key Structure:
 * - party:{id}              - Party core state (Hash)
 * - party:{id}:members      - Member data (Hash)
 * - party:{id}:invites      - Pending invites (Hash)
 * - user:{id}:party         - User's current party (String)
 * - party:queue:{id}        - Queue state (String)
 */

import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: any = null;

export async function getRedis() {
    // #region agent log
    const startTime = Date.now();
    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'party-redis.ts:getRedis',message:'getRedis called',data:{hasExistingClient:!!redisClient},timestamp:startTime,sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (redisClient) return redisClient;

    try {
        const Redis = (await import('ioredis')).default;
        // IMPORTANT: Must match server-redis.js default ('localhost') for local development
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'party-redis.ts:getRedis',message:'Redis client created',data:{durationMs:Date.now()-startTime,host:process.env.REDIS_HOST||'localhost'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return redisClient;
    } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'party-redis.ts:getRedis',message:'Redis connection FAILED',data:{error:String(error),durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error('[PartyRedis] Redis connection failed:', error);
        return null;
    }
}

// =============================================================================
// TYPES
// =============================================================================

export interface PartyState {
    id: string;
    leaderId: string;
    leaderName: string;
    iglId: string | null;
    anchorId: string | null;
    targetMode: '5v5' | '3v3' | '2v2' | null;
    teamId: string | null;           // Link to persistent team
    teamName: string | null;
    teamTag: string | null;
    inviteMode: 'open' | 'invite_only';
    maxSize: number;
    createdAt: number;
    updatedAt: number;
}

export interface PartyMember {
    odUserId: string;
    odUserName: string;
    odLevel: number;
    odEquippedFrame: string | null;
    odEquippedTitle: string | null;
    isReady: boolean;
    preferredOperation: string | null;
    joinedAt: number;
    isOnline: boolean;
}

export interface PartyInvite {
    inviteId: string;
    inviterId: string;
    inviterName: string;
    inviteeId: string;
    inviteeName: string;
    partyId: string;
    createdAt: number;
    expiresAt: number;
}

export interface PartyQueueState {
    status: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';
    startedAt: number | null;
    matchType: 'ranked' | 'casual' | null;
    matchId: string | null;
}

export interface FullPartyData {
    party: PartyState;
    members: PartyMember[];
    queueState: PartyQueueState;
    invites: PartyInvite[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PARTY_TTL = 14400;        // 4 hours
const INVITE_TTL = 600;         // 10 minutes
const QUEUE_TTL = 300;          // 5 minutes

const KEYS = {
    party: (id: string) => `party:${id}`,
    members: (id: string) => `party:${id}:members`,
    invites: (id: string) => `party:${id}:invites`,
    queue: (id: string) => `party:${id}:queue`,
    userParty: (userId: string) => `user:${userId}:party`,
};

const PUBSUB_CHANNEL = 'party:events';

// =============================================================================
// PUB/SUB FOR CROSS-SERVER EVENTS
// =============================================================================

let pubClient: any = null;

async function getPubClient() {
    if (pubClient) return pubClient;

    try {
        const Redis = (await import('ioredis')).default;
        // IMPORTANT: Must match server-redis.js default ('localhost') for local development
        pubClient = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        return pubClient;
    } catch (error) {
        console.error('[PartyRedis] Pub client connection failed:', error);
        return null;
    }
}

/**
 * Publish a party event for cross-server synchronization
 */
async function publishPartyEvent(
    partyId: string,
    eventType: string,
    data: Record<string, any>
): Promise<void> {
    try {
        const pub = await getPubClient();
        if (!pub) return;

        const event = {
            partyId,
            eventType,
            data,
            timestamp: Date.now(),
            serverId: process.env.SERVER_ID || 'default',
        };

        await pub.publish(PUBSUB_CHANNEL, JSON.stringify(event));
    } catch (error) {
        console.error('[PartyRedis] Failed to publish event:', error);
    }
}

// =============================================================================
// PARTY LIFECYCLE
// =============================================================================

/**
 * Create a new party
 */
export async function createParty(
    leaderId: string,
    leaderName: string,
    leaderData: { level: number; equippedFrame?: string; equippedTitle?: string }
): Promise<{ success: boolean; partyId?: string; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        // Check if user is already in a party
        const existingParty = await redis.get(KEYS.userParty(leaderId));
        if (existingParty) {
            return { success: false, error: 'Already in a party' };
        }

        const partyId = uuidv4();
        const now = Date.now();

        const party: PartyState = {
            id: partyId,
            leaderId,
            leaderName,
            iglId: null,
            anchorId: null,
            targetMode: '5v5',
            teamId: null,
            teamName: null,
            teamTag: null,
            inviteMode: 'open',
            maxSize: 5,
            createdAt: now,
            updatedAt: now,
        };

        const leaderMember: PartyMember = {
            odUserId: leaderId,
            odUserName: leaderName,
            odLevel: leaderData.level || 1,
            odEquippedFrame: leaderData.equippedFrame || null,
            odEquippedTitle: leaderData.equippedTitle || null,
            isReady: false,
            preferredOperation: null,
            joinedAt: now,
            isOnline: true,
        };

        const queueState: PartyQueueState = {
            status: 'idle',
            startedAt: null,
            matchType: null,
            matchId: null,
        };

        // Use pipeline for atomic creation
        const pipeline = redis.pipeline();
        
        // Store party state
        pipeline.hset(KEYS.party(partyId), {
            ...party,
            createdAt: party.createdAt.toString(),
            updatedAt: party.updatedAt.toString(),
        });
        pipeline.expire(KEYS.party(partyId), PARTY_TTL);

        // Store leader as first member
        pipeline.hset(KEYS.members(partyId), leaderId, JSON.stringify(leaderMember));
        pipeline.expire(KEYS.members(partyId), PARTY_TTL);

        // Store queue state
        pipeline.set(KEYS.queue(partyId), JSON.stringify(queueState), 'EX', PARTY_TTL);

        // Link user to party
        pipeline.set(KEYS.userParty(leaderId), partyId, 'EX', PARTY_TTL);

        await pipeline.exec();

        // Publish event for cross-server sync
        await publishPartyEvent(partyId, 'party_created', {
            leaderId,
            leaderName,
        });

        console.log(`[PartyRedis] Party ${partyId} created by ${leaderName}`);
        return { success: true, partyId };

    } catch (error: any) {
        console.error('[PartyRedis] createParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get full party data
 */
export async function getParty(partyId: string): Promise<FullPartyData | null> {
    const redis = await getRedis();
    if (!redis) return null;

    try {
        const [partyData, membersData, queueData, invitesData] = await Promise.all([
            redis.hgetall(KEYS.party(partyId)),
            redis.hgetall(KEYS.members(partyId)),
            redis.get(KEYS.queue(partyId)),
            redis.hgetall(KEYS.invites(partyId)),
        ]);

        if (!partyData || Object.keys(partyData).length === 0) {
            return null;
        }

        const party: PartyState = {
            id: partyData.id,
            leaderId: partyData.leaderId,
            leaderName: partyData.leaderName,
            iglId: partyData.iglId || null,
            anchorId: partyData.anchorId || null,
            targetMode: (partyData.targetMode as '5v5' | '3v3' | '2v2' | null) || null,
            teamId: partyData.teamId || null,
            teamName: partyData.teamName || null,
            teamTag: partyData.teamTag || null,
            inviteMode: (partyData.inviteMode as 'open' | 'invite_only') || 'open',
            maxSize: parseInt(partyData.maxSize) || 5,
            createdAt: parseInt(partyData.createdAt) || Date.now(),
            updatedAt: parseInt(partyData.updatedAt) || Date.now(),
        };

        const members: PartyMember[] = Object.values(membersData).map((m: string) => JSON.parse(m));

        const queueState: PartyQueueState = queueData 
            ? JSON.parse(queueData) 
            : { status: 'idle', startedAt: null, matchType: null, matchId: null };

        const invites: PartyInvite[] = Object.values(invitesData).map((i: string) => JSON.parse(i));

        return { party, members, queueState, invites };

    } catch (error: any) {
        console.error('[PartyRedis] getParty error:', error);
        return null;
    }
}

/**
 * Get user's current party ID
 */
export async function getUserParty(userId: string): Promise<string | null> {
    const redis = await getRedis();
    if (!redis) return null;

    return await redis.get(KEYS.userParty(userId));
}

/**
 * Clear a stale user party reference
 * 
 * This is used when a user has a party reference but the party no longer exists
 * (e.g., expired due to TTL or disbanded without proper cleanup).
 */
export async function clearStaleUserPartyReference(userId: string): Promise<boolean> {
    const redis = await getRedis();
    if (!redis) return false;

    try {
        await redis.del(KEYS.userParty(userId));
        console.log(`[PartyRedis] Cleared stale party reference for user ${userId}`);
        return true;
    } catch (error: any) {
        console.error('[PartyRedis] clearStaleUserPartyReference error:', error);
        return false;
    }
}

/**
 * Validate and clean up user's party state
 * 
 * Call this on login or session start to ensure the user's party state is valid.
 * Returns the valid party data or null if no valid party exists.
 */
export async function validateUserPartyState(userId: string): Promise<FullPartyData | null> {
    const redis = await getRedis();
    if (!redis) return null;

    try {
        const partyId = await getUserParty(userId);
        if (!partyId) {
            return null;
        }

        // Get the party data
        const partyData = await getParty(partyId);
        
        // If party doesn't exist (expired/disbanded), clean up the reference
        if (!partyData) {
            console.log(`[PartyRedis] validateUserPartyState: Party ${partyId} no longer exists, cleaning up reference for user ${userId}`);
            await clearStaleUserPartyReference(userId);
            return null;
        }
        
        // Verify the user is actually a member of this party
        const isMember = partyData.members.some(m => m.odUserId === userId);
        if (!isMember) {
            console.log(`[PartyRedis] validateUserPartyState: User ${userId} is not a member of party ${partyId}, cleaning up reference`);
            await clearStaleUserPartyReference(userId);
            return null;
        }
        
        return partyData;
    } catch (error: any) {
        console.error('[PartyRedis] validateUserPartyState error:', error);
        return null;
    }
}

/**
 * Disband a party (leader only)
 */
export async function disbandParty(
    partyId: string,
    userId: string
): Promise<{ success: boolean; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== userId) {
            return { success: false, error: 'Only the leader can disband the party' };
        }

        // Get all member IDs before cleanup
        const memberIds = partyData.members.map(m => m.odUserId);

        // Remove all party data
        const pipeline = redis.pipeline();
        pipeline.del(KEYS.party(partyId));
        pipeline.del(KEYS.members(partyId));
        pipeline.del(KEYS.queue(partyId));
        pipeline.del(KEYS.invites(partyId));

        // Unlink all users from this party
        for (const memberId of memberIds) {
            pipeline.del(KEYS.userParty(memberId));
        }

        await pipeline.exec();

        console.log(`[PartyRedis] Party ${partyId} disbanded`);
        return { success: true, memberIds };

    } catch (error: any) {
        console.error('[PartyRedis] disbandParty error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// MEMBER MANAGEMENT
// =============================================================================

/**
 * Join a party
 */
export async function joinParty(
    partyId: string,
    userId: string,
    userName: string,
    userData: { level: number; equippedFrame?: string; equippedTitle?: string }
): Promise<{ success: boolean; partyId?: string; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        // Check if user is already in a party
        const existingParty = await redis.get(KEYS.userParty(userId));
        if (existingParty) {
            return { success: false, error: 'Already in a party' };
        }

        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.members.length >= partyData.party.maxSize) {
            return { success: false, error: 'Party is full' };
        }

        if (partyData.queueState.status !== 'idle') {
            return { success: false, error: 'Cannot join party while in queue' };
        }

        const member: PartyMember = {
            odUserId: userId,
            odUserName: userName,
            odLevel: userData.level || 1,
            odEquippedFrame: userData.equippedFrame || null,
            odEquippedTitle: userData.equippedTitle || null,
            isReady: false,
            preferredOperation: null,
            joinedAt: Date.now(),
            isOnline: true,
        };

        const pipeline = redis.pipeline();
        pipeline.hset(KEYS.members(partyId), userId, JSON.stringify(member));
        pipeline.set(KEYS.userParty(userId), partyId, 'EX', PARTY_TTL);
        
        // Refresh party TTL
        pipeline.expire(KEYS.party(partyId), PARTY_TTL);
        pipeline.expire(KEYS.members(partyId), PARTY_TTL);

        await pipeline.exec();

        // Publish event for cross-server sync
        await publishPartyEvent(partyId, 'member_joined', {
            userId,
            userName,
        });

        // Refetch to get updated member list
        const updatedParty = await getParty(partyId);
        const memberIds = updatedParty?.members.map(m => m.odUserId) || [];

        console.log(`[PartyRedis] ${userName} joined party ${partyId}`);
        return { success: true, partyId, memberIds };

    } catch (error: any) {
        console.error('[PartyRedis] joinParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Leave a party
 */
export async function leaveParty(
    partyId: string,
    userId: string
): Promise<{ 
    success: boolean; 
    remainingMemberIds?: string[]; 
    disbanded?: boolean;
    newLeaderId?: string;
    queueCancelled?: boolean;
    error?: string 
}> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            // Party doesn't exist, just clean up user link
            await redis.del(KEYS.userParty(userId));
            return { success: true, disbanded: true, remainingMemberIds: [] };
        }

        // Check if user is in this party
        const isMember = partyData.members.some(m => m.odUserId === userId);
        if (!isMember) {
            return { success: false, error: 'Not in this party' };
        }

        // Prevent leaving if match is in progress
        if (partyData.queueState.status === 'match_found') {
            return { success: false, error: 'Cannot leave while match is in progress' };
        }

        const isLeader = partyData.party.leaderId === userId;
        const remainingMembers = partyData.members.filter(m => m.odUserId !== userId);
        const queueCancelled = partyData.queueState.status !== 'idle';

        const pipeline = redis.pipeline();

        // Remove user from party
        pipeline.hdel(KEYS.members(partyId), userId);
        pipeline.del(KEYS.userParty(userId));

        // Cancel queue if active
        if (queueCancelled) {
            pipeline.set(KEYS.queue(partyId), JSON.stringify({
                status: 'idle',
                startedAt: null,
                matchType: null,
                matchId: null,
            }), 'EX', PARTY_TTL);
        }

        let disbanded = false;
        let newLeaderId: string | undefined;

        if (remainingMembers.length === 0) {
            // Disband empty party
            pipeline.del(KEYS.party(partyId));
            pipeline.del(KEYS.members(partyId));
            pipeline.del(KEYS.queue(partyId));
            pipeline.del(KEYS.invites(partyId));
            disbanded = true;
        } else if (isLeader) {
            // Transfer leadership
            newLeaderId = remainingMembers[0].odUserId;
            pipeline.hset(KEYS.party(partyId), 'leaderId', newLeaderId);
            pipeline.hset(KEYS.party(partyId), 'leaderName', remainingMembers[0].odUserName);
            
            // Clear IGL/Anchor if they were the leaving player
            if (partyData.party.iglId === userId) {
                pipeline.hset(KEYS.party(partyId), 'iglId', '');
            }
            if (partyData.party.anchorId === userId) {
                pipeline.hset(KEYS.party(partyId), 'anchorId', '');
            }
        }

        await pipeline.exec();

        // Publish event for cross-server sync
        await publishPartyEvent(partyId, disbanded ? 'party_disbanded' : 'member_left', {
            userId,
            disbanded,
            newLeaderId,
            queueCancelled,
        });

        console.log(`[PartyRedis] ${userId} left party ${partyId}${disbanded ? ' (disbanded)' : ''}`);
        return { 
            success: true, 
            remainingMemberIds: remainingMembers.map(m => m.odUserId),
            disbanded,
            newLeaderId,
            queueCancelled,
        };

    } catch (error: any) {
        console.error('[PartyRedis] leaveParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Kick a member from the party (leader only)
 */
export async function kickMember(
    partyId: string,
    leaderId: string,
    targetUserId: string
): Promise<{ success: boolean; kickedName?: string; queueCancelled?: boolean; remainingMemberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            return { success: false, error: 'Only the leader can kick members' };
        }

        if (targetUserId === leaderId) {
            return { success: false, error: 'Cannot kick yourself' };
        }

        const targetMember = partyData.members.find(m => m.odUserId === targetUserId);
        if (!targetMember) {
            return { success: false, error: 'Player not in party' };
        }

        if (partyData.queueState.status === 'match_found') {
            return { success: false, error: 'Cannot kick while match is in progress' };
        }

        const queueCancelled = partyData.queueState.status !== 'idle';

        const pipeline = redis.pipeline();
        pipeline.hdel(KEYS.members(partyId), targetUserId);
        pipeline.del(KEYS.userParty(targetUserId));

        // Cancel queue if active
        if (queueCancelled) {
            pipeline.set(KEYS.queue(partyId), JSON.stringify({
                status: 'idle',
                startedAt: null,
                matchType: null,
                matchId: null,
            }), 'EX', PARTY_TTL);
        }

        // Clear IGL/Anchor if kicked
        if (partyData.party.iglId === targetUserId) {
            pipeline.hset(KEYS.party(partyId), 'iglId', '');
        }
        if (partyData.party.anchorId === targetUserId) {
            pipeline.hset(KEYS.party(partyId), 'anchorId', '');
        }

        await pipeline.exec();

        // Publish event for cross-server sync
        await publishPartyEvent(partyId, 'member_kicked', {
            kickedUserId: targetUserId,
            kickedName: targetMember.odUserName,
            queueCancelled,
        });

        // Get remaining members
        const updatedParty = await getParty(partyId);
        const remainingMemberIds = updatedParty?.members.map(m => m.odUserId) || [];

        console.log(`[PartyRedis] ${targetUserId} kicked from party ${partyId}`);
        return { success: true, kickedName: targetMember.odUserName, queueCancelled, remainingMemberIds };

    } catch (error: any) {
        console.error('[PartyRedis] kickMember error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// READY STATE & ROLES
// =============================================================================

/**
 * Toggle ready state
 */
export async function toggleReady(
    partyId: string,
    userId: string
): Promise<{ success: boolean; isReady?: boolean; queueCancelled?: boolean; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        const member = partyData.members.find(m => m.odUserId === userId);
        if (!member) {
            return { success: false, error: 'Not in party' };
        }

        // Prevent unready if match is in progress
        if (member.isReady && partyData.queueState.status === 'match_found') {
            return { success: false, error: 'Cannot unready while match is in progress' };
        }

        const newReadyState = !member.isReady;
        member.isReady = newReadyState;

        const pipeline = redis.pipeline();
        pipeline.hset(KEYS.members(partyId), userId, JSON.stringify(member));

        // Cancel queue if unreadying
        let queueCancelled = false;
        if (!newReadyState && partyData.queueState.status !== 'idle') {
            pipeline.set(KEYS.queue(partyId), JSON.stringify({
                status: 'idle',
                startedAt: null,
                matchType: null,
                matchId: null,
            }), 'EX', PARTY_TTL);
            queueCancelled = true;
        }

        await pipeline.exec();

        // Publish event for cross-server sync
        await publishPartyEvent(partyId, 'ready_changed', {
            userId,
            isReady: newReadyState,
            queueCancelled,
        });

        const memberIds = partyData.members.map(m => m.odUserId);
        return { success: true, isReady: newReadyState, queueCancelled, memberIds };

    } catch (error: any) {
        console.error('[PartyRedis] toggleReady error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set IGL (In-Game Leader)
 */
export async function setIGL(
    partyId: string,
    leaderId: string,
    iglUserId: string
): Promise<{ success: boolean; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            return { success: false, error: 'Only the leader can set IGL' };
        }

        const isMember = partyData.members.some(m => m.odUserId === iglUserId);
        if (!isMember) {
            return { success: false, error: 'Target is not in party' };
        }

        await redis.hset(KEYS.party(partyId), 'iglId', iglUserId);

        const memberIds = partyData.members.map(m => m.odUserId);
        return { success: true, memberIds };

    } catch (error: any) {
        console.error('[PartyRedis] setIGL error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set Anchor
 */
export async function setAnchor(
    partyId: string,
    leaderId: string,
    anchorUserId: string
): Promise<{ success: boolean; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            return { success: false, error: 'Only the leader can set Anchor' };
        }

        const isMember = partyData.members.some(m => m.odUserId === anchorUserId);
        if (!isMember) {
            return { success: false, error: 'Target is not in party' };
        }

        await redis.hset(KEYS.party(partyId), 'anchorId', anchorUserId);

        const memberIds = partyData.members.map(m => m.odUserId);
        return { success: true, memberIds };

    } catch (error: any) {
        console.error('[PartyRedis] setAnchor error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set preferred operation for a member
 */
export async function setPreferredOperation(
    partyId: string,
    userId: string,
    operation: string | null
): Promise<{ success: boolean; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const memberData = await redis.hget(KEYS.members(partyId), userId);
        if (!memberData) {
            return { success: false, error: 'Not in party' };
        }

        const member: PartyMember = JSON.parse(memberData);
        member.preferredOperation = operation;

        await redis.hset(KEYS.members(partyId), userId, JSON.stringify(member));

        return { success: true };

    } catch (error: any) {
        console.error('[PartyRedis] setPreferredOperation error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// QUEUE STATE
// =============================================================================

/**
 * Update queue state
 */
export async function updateQueueState(
    partyId: string,
    leaderId: string,
    status: 'idle' | 'finding_teammates' | 'finding_opponents',
    matchType?: 'ranked' | 'casual'
): Promise<{ success: boolean; error?: string }> {
    // #region agent log - HA: Track queue state updates at Redis level
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Debug logging
    const fs = require('fs');
    const logPath = '/home/evan.hill/FlashMath/.cursor/debug.log';
    const logEntry = (msg: string, data: any, hypothesisId: string) => {
        try {
            fs.appendFileSync(logPath, JSON.stringify({location:'party-redis.ts:updateQueueState',message:msg,data,timestamp:Date.now(),sessionId:'debug-session',hypothesisId}) + '\n');
        } catch {}
    };
    logEntry('ENTRY - updateQueueState called', { partyId, leaderId: leaderId?.slice(-8), status, matchType }, 'A');
    // #endregion
    
    const redis = await getRedis();
    if (!redis) {
        logEntry('REDIS UNAVAILABLE', { partyId }, 'A');
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            logEntry('PARTY NOT FOUND', { partyId }, 'A');
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            logEntry('NOT LEADER - REJECTED', { partyId, actualLeader: partyData.party.leaderId?.slice(-8), callerUserId: leaderId?.slice(-8) }, 'A');
            return { success: false, error: 'Only the leader can update queue status' };
        }

        const queueState: PartyQueueState = {
            status,
            startedAt: status !== 'idle' ? Date.now() : null,
            matchType: matchType || null,
            matchId: null,
        };

        // Auto-ready the leader when starting queue
        if (status !== 'idle') {
            const leaderMember = partyData.members.find(m => m.odUserId === leaderId);
            if (leaderMember && !leaderMember.isReady) {
                leaderMember.isReady = true;
                await redis.hset(KEYS.members(partyId), leaderId, JSON.stringify(leaderMember));
            }
        }

        await redis.set(KEYS.queue(partyId), JSON.stringify(queueState), 'EX', QUEUE_TTL);
        
        logEntry('SUCCESS - Queue state updated in Redis', { partyId, status, matchType }, 'A');

        return { success: true };

    } catch (error: any) {
        console.error('[PartyRedis] updateQueueState error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set match found state
 */
export async function setMatchFound(
    partyId: string,
    matchId: string
): Promise<{ success: boolean; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const queueData = await redis.get(KEYS.queue(partyId));
        if (!queueData) {
            return { success: false, error: 'Party not in queue' };
        }

        const queueState: PartyQueueState = JSON.parse(queueData);
        queueState.status = 'match_found';
        queueState.matchId = matchId;

        await redis.set(KEYS.queue(partyId), JSON.stringify(queueState), 'EX', QUEUE_TTL);

        return { success: true };

    } catch (error: any) {
        console.error('[PartyRedis] setMatchFound error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get queue state
 */
export async function getQueueState(partyId: string): Promise<PartyQueueState | null> {
    const redis = await getRedis();
    if (!redis) return null;

    try {
        const queueData = await redis.get(KEYS.queue(partyId));
        const parsed = queueData ? JSON.parse(queueData) : null;
        
        // #region agent log - Track queue state reads
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Debug logging
        const fs = require('fs');
        try {
            fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({location:'party-redis.ts:getQueueState',message:'Queue state read from Redis',data:{partyId,status:parsed?.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'}) + '\n');
        } catch {}
        // #endregion
        
        return parsed;
    } catch (error) {
        return null;
    }
}

// =============================================================================
// INVITES
// =============================================================================

/**
 * Create a party invite
 */
export async function createInvite(
    partyId: string,
    inviterId: string,
    inviterName: string,
    inviteeId: string,
    inviteeName: string
): Promise<{ success: boolean; inviteId?: string; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        // Check if invitee is already in a party
        const existingParty = await redis.get(KEYS.userParty(inviteeId));
        if (existingParty) {
            return { success: false, error: 'Player is already in a party' };
        }

        // Check if already invited
        const existingInvite = partyData.invites.find(i => i.inviteeId === inviteeId);
        if (existingInvite && existingInvite.expiresAt > Date.now()) {
            return { success: false, error: 'Player already has a pending invite' };
        }

        const invite: PartyInvite = {
            inviteId: uuidv4(),
            inviterId,
            inviterName,
            inviteeId,
            inviteeName,
            partyId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (INVITE_TTL * 1000),
        };

        await redis.hset(KEYS.invites(partyId), inviteeId, JSON.stringify(invite));
        await redis.expire(KEYS.invites(partyId), INVITE_TTL);

        return { success: true, inviteId: invite.inviteId };

    } catch (error: any) {
        console.error('[PartyRedis] createInvite error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Accept a party invite
 * inviteId format: "{partyId}:{inviteeId}" or just use the partyId
 */
export async function acceptInvite(
    inviteId: string,
    userId: string,
    userName: string,
    userData: { level: number; equippedFrame?: string; equippedTitle?: string }
): Promise<{ success: boolean; partyId?: string; memberIds?: string[]; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        // Find the invite across all parties for this user
        // Scan for invites where this user is the invitee
        const partyKeys = await redis.keys('party:*:invites');
        
        let foundInvite: PartyInvite | null = null;
        let foundPartyId: string | null = null;
        
        for (const key of partyKeys) {
            const inviteData = await redis.hget(key, userId);
            if (inviteData) {
                const invite: PartyInvite = JSON.parse(inviteData);
                // Check if inviteId matches or if we're just accepting any invite for this user
                if (invite.inviteId === inviteId || invite.partyId === inviteId) {
                    foundInvite = invite;
                    foundPartyId = invite.partyId;
                    break;
                }
            }
        }
        
        if (!foundInvite || !foundPartyId) {
            return { success: false, error: 'No invite found or invite expired' };
        }

        if (foundInvite.expiresAt < Date.now()) {
            await redis.hdel(KEYS.invites(foundPartyId), userId);
            return { success: false, error: 'Invite has expired' };
        }

        // Remove invite
        await redis.hdel(KEYS.invites(foundPartyId), userId);

        // Join the party
        return await joinParty(foundPartyId, userId, userName, userData);

    } catch (error: any) {
        console.error('[PartyRedis] acceptInvite error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Decline a party invite
 * inviteId can be the actual invite ID or the partyId
 */
export async function declineInvite(
    inviteId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        // Find and remove the invite
        const partyKeys = await redis.keys('party:*:invites');
        
        for (const key of partyKeys) {
            const inviteData = await redis.hget(key, userId);
            if (inviteData) {
                const invite: PartyInvite = JSON.parse(inviteData);
                if (invite.inviteId === inviteId || invite.partyId === inviteId) {
                    await redis.hdel(key, userId);
                    return { success: true };
                }
            }
        }
        
        return { success: false, error: 'Invite not found' };
    } catch (error: any) {
        console.error('[PartyRedis] declineInvite error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all pending invites for a user
 */
export async function getUserPendingInvites(userId: string): Promise<PartyInvite[]> {
    const redis = await getRedis();
    if (!redis) return [];

    try {
        const partyKeys = await redis.keys('party:*:invites');
        const invites: PartyInvite[] = [];
        
        for (const key of partyKeys) {
            const inviteData = await redis.hget(key, userId);
            if (inviteData) {
                const invite: PartyInvite = JSON.parse(inviteData);
                // Only include non-expired invites
                if (invite.expiresAt > Date.now()) {
                    invites.push(invite);
                }
            }
        }
        
        return invites;
    } catch (error: any) {
        console.error('[PartyRedis] getUserPendingInvites error:', error);
        return [];
    }
}

// =============================================================================
// PARTY SETTINGS
// =============================================================================

/**
 * Transfer leadership
 */
export async function transferLeadership(
    partyId: string,
    currentLeaderId: string,
    newLeaderId: string
): Promise<{ success: boolean; newLeaderName?: string; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== currentLeaderId) {
            return { success: false, error: 'Only the leader can transfer leadership' };
        }

        const newLeader = partyData.members.find(m => m.odUserId === newLeaderId);
        if (!newLeader) {
            return { success: false, error: 'Target is not in party' };
        }

        await redis.hset(KEYS.party(partyId), {
            leaderId: newLeaderId,
            leaderName: newLeader.odUserName,
        });

        return { success: true, newLeaderName: newLeader.odUserName };

    } catch (error: any) {
        console.error('[PartyRedis] transferLeadership error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Link party to a persistent team
 */
export async function linkToTeam(
    partyId: string,
    leaderId: string,
    teamId: string | null,
    teamName?: string,
    teamTag?: string
): Promise<{ success: boolean; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            return { success: false, error: 'Only the leader can link to a team' };
        }

        await redis.hset(KEYS.party(partyId), {
            teamId: teamId || '',
            teamName: teamName || '',
            teamTag: teamTag || '',
        });

        return { success: true };

    } catch (error: any) {
        console.error('[PartyRedis] linkToTeam error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set target mode (5v5, 3v3, etc.)
 */
export async function setTargetMode(
    partyId: string,
    leaderId: string,
    mode: '5v5' | '3v3' | '2v2' | null
): Promise<{ success: boolean; error?: string }> {
    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Redis unavailable' };
    }

    try {
        const partyData = await getParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== leaderId) {
            return { success: false, error: 'Only the leader can set target mode' };
        }

        // Reset all ready states when mode changes
        const pipeline = redis.pipeline();
        pipeline.hset(KEYS.party(partyId), 'targetMode', mode || '');

        for (const member of partyData.members) {
            member.isReady = false;
            pipeline.hset(KEYS.members(partyId), member.odUserId, JSON.stringify(member));
        }

        await pipeline.exec();

        return { success: true };

    } catch (error: any) {
        console.error('[PartyRedis] setTargetMode error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Refresh party TTL (call on activity)
 * IMPORTANT: Also refreshes user:{userId}:party references to prevent users from losing
 * their party reference while the party itself still exists.
 */
export async function refreshPartyTTL(partyId: string): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        // First, get all member IDs to refresh their user-party references
        const membersData = await redis.hgetall(KEYS.members(partyId));
        const memberIds = Object.keys(membersData);

        const pipeline = redis.pipeline();
        pipeline.expire(KEYS.party(partyId), PARTY_TTL);
        pipeline.expire(KEYS.members(partyId), PARTY_TTL);
        pipeline.expire(KEYS.queue(partyId), PARTY_TTL);
        
        // CRITICAL: Also refresh user-party references for all members
        // This prevents the user's party reference from expiring before the party does
        for (const memberId of memberIds) {
            pipeline.expire(KEYS.userParty(memberId), PARTY_TTL);
        }
        
        await pipeline.exec();
    } catch (error: any) {
        console.error('[PartyRedis] refreshPartyTTL error:', error);
    }
}

/**
 * Check if all members are ready
 */
export async function checkAllReady(partyId: string): Promise<{ allReady: boolean; readyCount: number; totalCount: number }> {
    const partyData = await getParty(partyId);
    if (!partyData) {
        return { allReady: false, readyCount: 0, totalCount: 0 };
    }

    const readyCount = partyData.members.filter(m => m.isReady).length;
    const totalCount = partyData.members.length;

    return {
        allReady: readyCount === totalCount,
        readyCount,
        totalCount,
    };
}

/**
 * Get all member IDs (for Socket.IO broadcasts)
 */
export async function getMemberIds(partyId: string): Promise<string[]> {
    const partyData = await getParty(partyId);
    if (!partyData) return [];
    return partyData.members.map(m => m.odUserId);
}

