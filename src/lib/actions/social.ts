'use server';

/**
 * FlashMath Social System - Server Actions
 * Handles friends, friend requests, parties, and party invites
 * 
 * Database architecture:
 * - PostgreSQL: Arena ELO (source of truth for ELO data)
 * - SQLite: User profiles, friends, practice data
 * - Redis: Real-time queue state, parties
 */

import { auth } from "@/auth";
import { getDatabase, generateId, now } from "@/lib/db/sqlite";
import { getArenaDisplayStatsBatch, getRankFromElo } from "@/lib/arena/arena-db";
const { getLeagueFromElo } = require('@/lib/arena/leagues.js');

// =============================================================================
// REDIS QUEUE HELPERS
// =============================================================================

let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;
    try {
        const Redis = (await import('ioredis')).default;
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'redis',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        return redisClient;
    } catch (error) {
        console.error('[Social] Redis connection failed:', error);
        return null;
    }
}

/**
 * Cancel all queue entries for a party
 * Called when party membership changes or party is disbanded
 */
async function cancelPartyQueues(partyId: string): Promise<void> {
    try {
        const redis = await getRedis();
        if (!redis) return;

        // Team queue prefixes
        const TEAM_QUEUE_PREFIX = 'team:queue:';
        const TEAMMATE_QUEUE_PREFIX = 'team:teammates:';

        // Get the entry data to find which queue type
        const entryData = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
        if (entryData) {
            const entry = JSON.parse(entryData);
            const queueKey = `${TEAM_QUEUE_PREFIX}${entry.odMatchType}:5v5`;
            await redis.zrem(queueKey, partyId);
            await redis.del(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
            console.log(`[Social] Cancelled team queue for party ${partyId}`);
        }

        // Also check teammate queue
        const teammateData = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
        if (teammateData) {
            await redis.zrem(`${TEAMMATE_QUEUE_PREFIX}5v5`, partyId);
            await redis.del(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
            console.log(`[Social] Cancelled teammate queue for party ${partyId}`);
        }
    } catch (error) {
        console.error('[Social] Failed to cancel party queues:', error);
    }
}

/**
 * Check if party has an active match found (prevent modifications)
 */
async function hasActiveMatch(partyId: string): Promise<boolean> {
    try {
        const redis = await getRedis();
        if (!redis) return false;

        const TEAM_MATCH_PREFIX = 'team:match:';
        const matchData = await redis.get(`${TEAM_MATCH_PREFIX}${partyId}`);
        return !!matchData;
    } catch (error) {
        console.error('[Social] Failed to check active match:', error);
        return false;
    }
}

// =============================================================================
// TYPES
// =============================================================================

export interface Friend {
    id: string;
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string;
    odEquippedTitle: string;
    odOnline: boolean;
    odLastActive: string | null;
    friendshipId: string;
    friendsSince: string;
    // Arena stats (Duel only)
    odDuelElo: number;
    odDuelRank: string;
    odDuelDivision: string;
}

export interface FriendRequest {
    id: string;
    senderId: string;
    senderName: string;
    senderLevel: number;
    senderFrame: string;
    receiverId: string;
    receiverName: string;
    receiverLevel: number;
    receiverFrame: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string;
}

export interface Party {
    id: string;
    leaderId: string;
    leaderName: string;
    maxSize: number;
    inviteMode: 'open' | 'invite_only';
    members: PartyMember[];
    createdAt: string;
    // Arena Teams 5v5 extensions
    iglId: string | null;           // In-Game Leader for team matches
    anchorId: string | null;        // Anchor player for team matches
    targetMode: string | null;      // '5v5', '4v4', '3v3', '2v2' or null
    teamId: string | null;          // Link to persistent team (null for temporary parties)
    // Queue status
    queueStatus: 'idle' | 'finding_teammates' | 'finding_opponents' | null;
    queueStartedAt: string | null;  // ISO timestamp when queue started
}

export interface PartyMember {
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string;
    odEquippedBanner: string;
    odEquippedTitle: string;
    odOnline: boolean;
    isLeader: boolean;
    joinedAt: string;
    // Arena stats (Duel only)
    odDuelElo: number;
    odDuelRank: string;
    odDuelDivision: string;
    // Arena Teams 5v5 extensions
    isReady: boolean;               // Ready state for team queue
    isIgl: boolean;                 // Is this member the IGL?
    isAnchor: boolean;              // Is this member the Anchor?
    preferredOperation: string | null;  // Player's preferred operation slot
    // Team mode ELO
    odElo5v5: number;
}

export interface PartyInvite {
    id: string;
    partyId: string;
    inviterName: string;
    inviterId: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface SocialStats {
    friendsOnline: number;
    friendsTotal: number;
    pendingRequests: number;
    partySize: number;
    partyMaxSize: number;
    inParty: boolean;
}

// =============================================================================
// HELPER: Check if user is online (active in last 5 minutes)
// =============================================================================

function isUserOnline(lastActive: string | null): boolean {
    if (!lastActive) return false;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return new Date(lastActive).getTime() > fiveMinutesAgo;
}

// =============================================================================
// FRIENDS LIST
// =============================================================================

export async function getFriendsList(): Promise<{ friends: Friend[]; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { friends: [], error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Auto-repair: Check for and fix one-way friendships for this user
        // Find users who have this user as a friend (f.friend_id = userId), 
        // but this user doesn't have them as a friend (no matching f.user_id = userId row)
        const missingReverse = db.prepare(`
            SELECT f.user_id as other_user_id, f.created_at
            FROM friendships f
            WHERE f.friend_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM friendships f2 
                WHERE f2.user_id = ? AND f2.friend_id = f.user_id
            )
        `).all(userId, userId) as any[];

        if (missingReverse.length > 0) {
            console.log(`[Social] Auto-repairing ${missingReverse.length} one-way friendships for user ${userId}`);
            for (const f of missingReverse) {
                const newId = generateId();
                // Create userId -> other_user_id friendship
                db.prepare(`
                    INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                    VALUES (?, ?, ?, ?)
                `).run(newId, userId, f.other_user_id, f.created_at || now());
                console.log(`[Social] Auto-repaired: ${userId} -> ${f.other_user_id}`);
            }
        }

        // Get all friends from SQLite (profile data only, no ELO)
        // ELO is fetched from PostgreSQL separately
        const friends = db.prepare(`
            SELECT 
                f.id as friendship_id,
                f.created_at as friends_since,
                u.id as user_id,
                u.name,
                u.level,
                u.equipped_items,
                u.last_active
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ?
            ORDER BY u.last_active DESC NULLS LAST
        `).all(userId) as any[];

        // Batch fetch ELO data from PostgreSQL (source of truth)
        const friendIds = friends.map(f => f.user_id);
        const arenaStats = await getArenaDisplayStatsBatch(friendIds);

        const result: Friend[] = friends.map(f => {
            let equipped: any = {};
            try {
                equipped = typeof f.equipped_items === 'string' 
                    ? JSON.parse(f.equipped_items) 
                    : f.equipped_items || {};
            } catch { }

            // Get arena stats from PostgreSQL (source of truth)
            const stats = arenaStats.get(f.user_id);

            return {
                id: f.user_id,
                odUserId: f.user_id,
                odName: f.name,
                odLevel: f.level || 1,
                odEquippedFrame: equipped.frame || 'default',
                odEquippedTitle: equipped.title || 'default',
                odOnline: isUserOnline(f.last_active),
                odLastActive: f.last_active,
                friendshipId: f.friendship_id,
                friendsSince: f.friends_since,
                // ELO from PostgreSQL (source of truth)
                odDuelElo: stats?.odDuelElo || 300,
                odDuelRank: stats?.odDuelRank || 'BRONZE',
                odDuelDivision: stats?.odDuelDivision || 'IV',
            };
        });

        return { friends: result };
    } catch (error: any) {
        console.error('[Social] getFriendsList error:', error);
        return { friends: [], error: error.message };
    }
}

/**
 * Repair one-way friendships by creating missing bidirectional entries
 * 
 * This fixes data inconsistencies where friendship A->B exists but B->A is missing.
 * Run this if users report asymmetric friend visibility.
 */
export async function repairOneWayFriendships(): Promise<{
    success: boolean;
    repaired: number;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, repaired: 0, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Find friendships where the reverse doesn't exist for this user
        // Case 1: User is in user_id but reverse (friend_id -> user_id) is missing
        const missingReverse1 = db.prepare(`
            SELECT f.id, f.user_id, f.friend_id, f.created_at
            FROM friendships f
            WHERE f.user_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM friendships f2 
                WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
            )
        `).all(userId) as any[];

        // Case 2: User is in friend_id but reverse (user_id -> friend_id) is missing  
        const missingReverse2 = db.prepare(`
            SELECT f.id, f.user_id, f.friend_id, f.created_at
            FROM friendships f
            WHERE f.friend_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM friendships f2 
                WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
            )
        `).all(userId) as any[];

        let repaired = 0;
        const timestamp = now();

        // Repair missing reverse friendships
        for (const f of missingReverse1) {
            const newId = generateId();
            db.prepare(`
                INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                VALUES (?, ?, ?, ?)
            `).run(newId, f.friend_id, f.user_id, f.created_at || timestamp);
            repaired++;
            console.log(`[Social] Repaired friendship: added ${f.friend_id} -> ${f.user_id}`);
        }

        for (const f of missingReverse2) {
            const newId = generateId();
            db.prepare(`
                INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                VALUES (?, ?, ?, ?)
            `).run(newId, f.friend_id, f.user_id, f.created_at || timestamp);
            repaired++;
            console.log(`[Social] Repaired friendship: added ${f.friend_id} -> ${f.user_id}`);
        }

        if (repaired > 0) {
            console.log(`[Social] Repaired ${repaired} one-way friendships for user ${userId}`);
        }

        return { success: true, repaired };
    } catch (error: any) {
        console.error('[Social] repairOneWayFriendships error:', error);
        return { success: false, repaired: 0, error: error.message };
    }
}

/**
 * Repair all one-way friendships in the database (admin only)
 */
export async function repairAllOneWayFriendships(): Promise<{
    success: boolean;
    repaired: number;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, repaired: 0, error: 'Unauthorized' };
    }

    // Check if user is admin
    const userId = (session.user as any).id;
    const db = getDatabase();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
    
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
        return { success: false, repaired: 0, error: 'Admin access required' };
    }

    try {
        // Find ALL one-way friendships in the database
        const oneWayFriendships = db.prepare(`
            SELECT f.id, f.user_id, f.friend_id, f.created_at
            FROM friendships f
            WHERE NOT EXISTS (
                SELECT 1 FROM friendships f2 
                WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
            )
        `).all() as any[];

        let repaired = 0;
        const timestamp = now();

        for (const f of oneWayFriendships) {
            const newId = generateId();
            db.prepare(`
                INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                VALUES (?, ?, ?, ?)
            `).run(newId, f.friend_id, f.user_id, f.created_at || timestamp);
            repaired++;
            console.log(`[Social] Admin repair: added ${f.friend_id} -> ${f.user_id}`);
        }

        console.log(`[Social] Admin repaired ${repaired} one-way friendships globally`);
        return { success: true, repaired };
    } catch (error: any) {
        console.error('[Social] repairAllOneWayFriendships error:', error);
        return { success: false, repaired: 0, error: error.message };
    }
}

// =============================================================================
// FRIEND REQUESTS
// =============================================================================

export async function sendFriendRequest(email: string): Promise<{ 
    success: boolean; 
    error?: string;
    receiverId?: string;
    senderName?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const senderId = (session.user as any).id;
    const senderName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        // Find user by email
        const receiver = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email) as any;
        if (!receiver) {
            return { success: false, error: 'User not found with that email' };
        }

        if (receiver.id === senderId) {
            return { success: false, error: "You can't add yourself as a friend" };
        }

        // Check if already friends
        const existingFriendship = db.prepare(`
            SELECT id FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `).get(senderId, receiver.id, receiver.id, senderId);

        if (existingFriendship) {
            return { success: false, error: 'You are already friends with this user' };
        }

        // Check if request already exists (in either direction)
        const existingRequest = db.prepare(`
            SELECT id, status, sender_id FROM friend_requests 
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        `).get(senderId, receiver.id, receiver.id, senderId) as any;

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                if (existingRequest.sender_id === receiver.id) {
                    // They already sent us a request - auto-accept it
                    return await acceptFriendRequest(existingRequest.id);
                }
                return { success: false, error: 'Friend request already pending' };
            }
            // Delete old declined/accepted requests to allow re-adding
            db.prepare(`DELETE FROM friend_requests WHERE id = ?`).run(existingRequest.id);
        }

        // Create the friend request
        db.prepare(`
            INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        `).run(generateId(), senderId, receiver.id, now());

        console.log(`[Social] Friend request sent from ${senderId} to ${receiver.id}`);
        return { success: true, receiverId: receiver.id, senderName };
    } catch (error: any) {
        console.error('[Social] sendFriendRequest error:', error);
        return { success: false, error: error.message };
    }
}

export async function sendFriendRequestToUser(targetUserId: string): Promise<{ 
    success: boolean; 
    error?: string;
    receiverId?: string;
    senderName?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const senderId = (session.user as any).id;
    const senderName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        if (targetUserId === senderId) {
            return { success: false, error: "You can't add yourself as a friend" };
        }

        // Check if target user exists
        const receiver = db.prepare('SELECT id, name FROM users WHERE id = ?').get(targetUserId) as any;
        if (!receiver) {
            return { success: false, error: 'User not found' };
        }

        // Check if already friends
        const existingFriendship = db.prepare(`
            SELECT id FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `).get(senderId, targetUserId, targetUserId, senderId);

        if (existingFriendship) {
            return { success: false, error: 'Already friends' };
        }

        // Check if request already exists
        const existingRequest = db.prepare(`
            SELECT id, status, sender_id FROM friend_requests 
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        `).get(senderId, targetUserId, targetUserId, senderId) as any;

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                if (existingRequest.sender_id === targetUserId) {
                    return await acceptFriendRequest(existingRequest.id);
                }
                return { success: false, error: 'Request already pending' };
            }
            // Delete old declined/accepted requests to allow re-adding
            db.prepare(`DELETE FROM friend_requests WHERE id = ?`).run(existingRequest.id);
        }

        // Create the friend request
        db.prepare(`
            INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        `).run(generateId(), senderId, targetUserId, now());

        console.log(`[Social] Friend request sent from ${senderId} to ${targetUserId}`);
        return { success: true, receiverId: targetUserId, senderName };
    } catch (error: any) {
        console.error('[Social] sendFriendRequestToUser error:', error);
        return { success: false, error: error.message };
    }
}

export async function getPendingRequests(): Promise<{ 
    incoming: FriendRequest[]; 
    outgoing: FriendRequest[]; 
    error?: string 
}> {
    const session = await auth();
    if (!session?.user) {
        return { incoming: [], outgoing: [], error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Incoming requests
        const incoming = db.prepare(`
            SELECT 
                fr.id,
                fr.sender_id,
                fr.receiver_id,
                fr.status,
                fr.created_at,
                sender.name as sender_name,
                sender.level as sender_level,
                sender.equipped_items as sender_equipped
            FROM friend_requests fr
            JOIN users sender ON fr.sender_id = sender.id
            WHERE fr.receiver_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
        `).all(userId) as any[];

        // Outgoing requests
        const outgoing = db.prepare(`
            SELECT 
                fr.id,
                fr.sender_id,
                fr.receiver_id,
                fr.status,
                fr.created_at,
                receiver.name as receiver_name,
                receiver.level as receiver_level,
                receiver.equipped_items as receiver_equipped
            FROM friend_requests fr
            JOIN users receiver ON fr.receiver_id = receiver.id
            WHERE fr.sender_id = ? AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
        `).all(userId) as any[];

        const mapRequest = (r: any, isIncoming: boolean): FriendRequest => {
            let senderEquipped: any = {};
            let receiverEquipped: any = {};
            try {
                if (r.sender_equipped) senderEquipped = JSON.parse(r.sender_equipped);
                if (r.receiver_equipped) receiverEquipped = JSON.parse(r.receiver_equipped);
            } catch { }

            return {
                id: r.id,
                senderId: r.sender_id,
                senderName: r.sender_name || 'Unknown',
                senderLevel: r.sender_level || 1,
                senderFrame: senderEquipped.frame || 'default',
                receiverId: r.receiver_id,
                receiverName: r.receiver_name || 'Unknown',
                receiverLevel: r.receiver_level || 1,
                receiverFrame: receiverEquipped.frame || 'default',
                status: r.status,
                createdAt: r.created_at,
            };
        };

        return {
            incoming: incoming.map(r => mapRequest(r, true)),
            outgoing: outgoing.map(r => mapRequest(r, false)),
        };
    } catch (error: any) {
        console.error('[Social] getPendingRequests error:', error);
        return { incoming: [], outgoing: [], error: error.message };
    }
}

export async function acceptFriendRequest(requestId: string): Promise<{ 
    success: boolean; 
    error?: string;
    senderId?: string;
    accepterName?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const accepterName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        // Get the request
        const request = db.prepare(`
            SELECT id, sender_id, receiver_id, status 
            FROM friend_requests 
            WHERE id = ?
        `).get(requestId) as any;

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.receiver_id !== userId) {
            return { success: false, error: 'Not authorized to accept this request' };
        }

        if (request.status !== 'pending') {
            return { success: false, error: 'Request already processed' };
        }

        // Create bidirectional friendship entries in a transaction
        // This ensures both directions are created atomically
        const friendshipId1 = generateId();
        const friendshipId2 = generateId();
        const timestamp = now();

        const createFriendship = db.transaction(() => {
            // Update request status
            db.prepare(`
                UPDATE friend_requests 
                SET status = 'accepted', responded_at = ?
                WHERE id = ?
            `).run(timestamp, requestId);

            // Create A -> B friendship (use INSERT OR IGNORE to handle existing)
            db.prepare(`
                INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                VALUES (?, ?, ?, ?)
            `).run(friendshipId1, request.sender_id, request.receiver_id, timestamp);

            // Create B -> A friendship (use INSERT OR IGNORE to handle existing)
            db.prepare(`
                INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
                VALUES (?, ?, ?, ?)
            `).run(friendshipId2, request.receiver_id, request.sender_id, timestamp);
        });

        createFriendship();

        console.log(`[Social] Friend request ${requestId} accepted (bidirectional)`);
        return { success: true, senderId: request.sender_id, accepterName };
    } catch (error: any) {
        console.error('[Social] acceptFriendRequest error:', error);
        return { success: false, error: error.message };
    }
}

export async function declineFriendRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        const request = db.prepare(`
            SELECT id, receiver_id, status 
            FROM friend_requests 
            WHERE id = ?
        `).get(requestId) as any;

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.receiver_id !== userId) {
            return { success: false, error: 'Not authorized' };
        }

        db.prepare(`
            UPDATE friend_requests 
            SET status = 'declined', responded_at = ?
            WHERE id = ?
        `).run(now(), requestId);

        console.log(`[Social] Friend request ${requestId} declined`);
        return { success: true };
    } catch (error: any) {
        console.error('[Social] declineFriendRequest error:', error);
        return { success: false, error: error.message };
    }
}

export async function cancelFriendRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        const request = db.prepare(`
            SELECT id, sender_id FROM friend_requests WHERE id = ?
        `).get(requestId) as any;

        if (!request) {
            return { success: false, error: 'Request not found' };
        }

        if (request.sender_id !== userId) {
            return { success: false, error: 'Not authorized' };
        }

        db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
        console.log(`[Social] Friend request ${requestId} cancelled`);
        return { success: true };
    } catch (error: any) {
        console.error('[Social] cancelFriendRequest error:', error);
        return { success: false, error: error.message };
    }
}

export async function removeFriend(friendId: string): Promise<{ 
    success: boolean; 
    error?: string;
    removedUserId?: string;
    removerName?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const removerName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        // Remove both directions of the friendship
        db.prepare(`
            DELETE FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `).run(userId, friendId, friendId, userId);
        
        // Also delete any friend_request entries to allow re-adding later
        db.prepare(`
            DELETE FROM friend_requests 
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        `).run(userId, friendId, friendId, userId);

        console.log(`[Social] Friendship removed between ${userId} and ${friendId}`);
        return { success: true, removedUserId: friendId, removerName };
    } catch (error: any) {
        console.error('[Social] removeFriend error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// PARTY SYSTEM
// =============================================================================

export async function getPartyData(): Promise<{ party: Party | null; invites: PartyInvite[]; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { party: null, invites: [], error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Check if user is in a party
        const membership = db.prepare(`
            SELECT pm.party_id
            FROM party_members pm
            WHERE pm.user_id = ?
        `).get(userId) as any;

        let party: Party | null = null;

        if (membership) {
            const partyData = db.prepare(`
                SELECT p.id, p.leader_id, p.max_size, p.invite_mode, p.created_at,
                       p.igl_id, p.anchor_id, p.target_mode, p.team_id,
                       p.queue_status, p.queue_started_at,
                       u.name as leader_name
                FROM parties p
                JOIN users u ON p.leader_id = u.id
                WHERE p.id = ?
            `).get(membership.party_id) as any;

            // Clean up stale party membership if party no longer exists
            if (!partyData) {
                console.log(`[Social] getPartyData: Cleaning up orphaned party membership for user ${userId}, party ${membership.party_id} no longer exists`);
                db.prepare(`DELETE FROM party_members WHERE user_id = ? AND party_id = ?`).run(userId, membership.party_id);
            }

            if (partyData) {
                // Get all members (profile data only, no ELO from SQLite)
                const members = db.prepare(`
                    SELECT pm.user_id, pm.joined_at, pm.is_ready, pm.preferred_operation,
                           u.name, u.level, u.equipped_items, u.last_active
                    FROM party_members pm
                    JOIN users u ON pm.user_id = u.id
                    WHERE pm.party_id = ?
                    ORDER BY pm.joined_at ASC
                `).all(membership.party_id) as any[];

                // Batch fetch ELO data from PostgreSQL (source of truth)
                const memberIds = members.map(m => m.user_id);
                const arenaStats = await getArenaDisplayStatsBatch(memberIds);

                party = {
                    id: partyData.id,
                    leaderId: partyData.leader_id,
                    leaderName: partyData.leader_name,
                    maxSize: partyData.max_size,
                    inviteMode: partyData.invite_mode || 'open',
                    createdAt: partyData.created_at,
                    // Arena Teams 5v5 extensions
                    iglId: partyData.igl_id || null,
                    anchorId: partyData.anchor_id || null,
                    targetMode: partyData.target_mode || null,
                    teamId: partyData.team_id || null,
                    // Queue status
                    queueStatus: partyData.queue_status || null,
                    queueStartedAt: partyData.queue_started_at || null,
                    members: members.map(m => {
                        let equipped: any = {};
                        try {
                            equipped = JSON.parse(m.equipped_items || '{}');
                        } catch { }

                        // Get arena stats from PostgreSQL (source of truth)
                        const stats = arenaStats.get(m.user_id);

                        return {
                            odUserId: m.user_id,
                            odName: m.name,
                            odLevel: m.level || 1,
                            odEquippedFrame: equipped.frame || 'default',
                            odEquippedBanner: equipped.banner || 'default',
                            odEquippedTitle: equipped.title || 'default',
                            odOnline: isUserOnline(m.last_active),
                            // ELO from PostgreSQL (source of truth)
                            odDuelElo: stats?.odDuelElo || 300,
                            odDuelRank: stats?.odDuelRank || 'BRONZE',
                            odDuelDivision: stats?.odDuelDivision || 'IV',
                            isLeader: m.user_id === partyData.leader_id,
                            joinedAt: m.joined_at,
                            // Arena Teams 5v5 extensions
                            isReady: !!m.is_ready,
                            isIgl: m.user_id === partyData.igl_id,
                            isAnchor: m.user_id === partyData.anchor_id,
                            preferredOperation: m.preferred_operation || null,
                            odElo5v5: stats?.odElo5v5 || 300,
                        };
                    }),
                };
            }
        }

        // Get pending party invites
        const invites = db.prepare(`
            SELECT 
                pi.id, pi.party_id, pi.inviter_id, pi.status, pi.created_at, pi.expires_at,
                u.name as inviter_name
            FROM party_invites pi
            JOIN users u ON pi.inviter_id = u.id
            WHERE pi.invitee_id = ? AND pi.status = 'pending' AND pi.expires_at > ?
            ORDER BY pi.created_at DESC
        `).all(userId, now()) as any[];

        const result = {
            party,
            invites: invites.map(i => ({
                id: i.id,
                partyId: i.party_id,
                inviterName: i.inviter_name,
                inviterId: i.inviter_id,
                status: i.status,
                createdAt: i.created_at,
                expiresAt: i.expires_at,
            })),
        };
        
        // #region agent log - Log what we're returning
        console.log(`[Social] getPartyData returning: partyId=${party?.id}, queueStatus=${party?.queueStatus}`);
        try {
            const fs = require('fs');
            const logEntry = JSON.stringify({
                location: 'social.ts:getPartyData',
                message: 'Returning party data',
                data: { partyId: party?.id, queueStatus: party?.queueStatus, userId, hasParty: !!party },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'SERVER_RETURN'
            }) + '\n';
            fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', logEntry);
        } catch (e) { /* ignore logging errors */ }
        // #endregion
        
        return result;
    } catch (error: any) {
        console.error('[Social] getPartyData error:', error);
        return { party: null, invites: [], error: error.message };
    }
}

export async function createParty(inviteMode: 'open' | 'invite_only' = 'open'): Promise<{ success: boolean; partyId?: string; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Check if already in a party
        const existingMembership = db.prepare(`
            SELECT party_id FROM party_members WHERE user_id = ?
        `).get(userId);

        if (existingMembership) {
            return { success: false, error: 'Already in a party' };
        }

        const partyId = generateId();
        const timestamp = now();

        // Create party (max 5 members, with invite_mode)
        db.prepare(`
            INSERT INTO parties (id, leader_id, max_size, invite_mode, created_at)
            VALUES (?, ?, 5, ?, ?)
        `).run(partyId, userId, inviteMode, timestamp);

        // Add leader as first member
        db.prepare(`
            INSERT INTO party_members (id, party_id, user_id, joined_at)
            VALUES (?, ?, ?, ?)
        `).run(generateId(), partyId, userId, timestamp);

        console.log(`[Social] Party ${partyId} created by ${userId} with invite_mode=${inviteMode}`);
        return { success: true, partyId };
    } catch (error: any) {
        console.error('[Social] createParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update party settings (leader only)
 */
export async function updatePartySettings(settings: { inviteMode?: 'open' | 'invite_only' }): Promise<{ 
    success: boolean; 
    error?: string;
    partyMemberIds?: string[];
    newInviteMode?: 'open' | 'invite_only';
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party and verify they're the leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can change settings' };
        }

        // Update settings
        if (settings.inviteMode) {
            db.prepare(`UPDATE parties SET invite_mode = ? WHERE id = ?`).run(settings.inviteMode, membership.party_id);
            console.log(`[Social] Party ${membership.party_id} invite_mode updated to ${settings.inviteMode}`);
        }

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];
        const partyMemberIds = members.map(m => m.user_id);

        return { 
            success: true, 
            partyMemberIds,
            newInviteMode: settings.inviteMode
        };
    } catch (error: any) {
        console.error('[Social] updatePartySettings error:', error);
        return { success: false, error: error.message };
    }
}

export async function inviteToParty(friendId: string): Promise<{ 
    success: boolean; 
    error?: string;
    inviteeId?: string;
    inviterName?: string;
    partyId?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const inviterName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        // Get user's party including invite_mode
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id, p.max_size, p.invite_mode
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        // Check if user can invite based on invite_mode
        const isLeader = membership.leader_id === userId;
        const inviteMode = membership.invite_mode || 'open';

        if (inviteMode === 'invite_only' && !isLeader) {
            return { success: false, error: 'Only the party leader can invite in this party' };
        }

        // Check party size
        const memberCount = db.prepare(`
            SELECT COUNT(*) as count FROM party_members WHERE party_id = ?
        `).get(membership.party_id) as any;

        if (memberCount.count >= membership.max_size) {
            return { success: false, error: 'Party is full' };
        }

        // Check if friend is already in a party
        const friendInParty = db.prepare(`
            SELECT party_id FROM party_members WHERE user_id = ?
        `).get(friendId);

        if (friendInParty) {
            return { success: false, error: 'Friend is already in a party' };
        }

        // Check if invite already pending
        const existingInvite = db.prepare(`
            SELECT id FROM party_invites 
            WHERE party_id = ? AND invitee_id = ? AND status = 'pending' AND expires_at > ?
        `).get(membership.party_id, friendId, now());

        if (existingInvite) {
            return { success: false, error: 'Invite already pending' };
        }

        // Create invite (expires in 5 minutes)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare(`
            INSERT INTO party_invites (id, party_id, inviter_id, invitee_id, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).run(generateId(), membership.party_id, userId, friendId, now(), expiresAt);

        console.log(`[Social] Party invite sent from ${userId} to ${friendId}`);
        return { success: true, inviteeId: friendId, inviterName, partyId: membership.party_id };
    } catch (error: any) {
        console.error('[Social] inviteToParty error:', error);
        return { success: false, error: error.message };
    }
}

export async function acceptPartyInvite(inviteId: string): Promise<{ 
    success: boolean; 
    error?: string;
    partyMemberIds?: string[];
    joinerName?: string;
    joinerId?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const joinerName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        const invite = db.prepare(`
            SELECT pi.id, pi.party_id, pi.invitee_id, pi.expires_at, p.max_size
            FROM party_invites pi
            JOIN parties p ON pi.party_id = p.id
            WHERE pi.id = ? AND pi.status = 'pending'
        `).get(inviteId) as any;

        if (!invite) {
            return { success: false, error: 'Invite not found or expired' };
        }

        if (invite.invitee_id !== userId) {
            return { success: false, error: 'Not authorized' };
        }

        if (new Date(invite.expires_at) < new Date()) {
            db.prepare(`UPDATE party_invites SET status = 'expired' WHERE id = ?`).run(inviteId);
            return { success: false, error: 'Invite expired' };
        }

        // Check if already in a party
        const existingMembership = db.prepare(`
            SELECT party_id FROM party_members WHERE user_id = ?
        `).get(userId);

        if (existingMembership) {
            return { success: false, error: 'You are already in a party. Leave your current party first.' };
        }

        // Check party size
        const memberCount = db.prepare(`
            SELECT COUNT(*) as count FROM party_members WHERE party_id = ?
        `).get(invite.party_id) as any;

        if (memberCount.count >= invite.max_size) {
            return { success: false, error: 'Party is full' };
        }

        // Get current party members BEFORE adding new member (for notification)
        const existingMembers = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(invite.party_id) as any[];
        const partyMemberIds = existingMembers.map(m => m.user_id);

        // Accept invite
        db.prepare(`UPDATE party_invites SET status = 'accepted' WHERE id = ?`).run(inviteId);

        // Add to party
        db.prepare(`
            INSERT INTO party_members (id, party_id, user_id, joined_at)
            VALUES (?, ?, ?, ?)
        `).run(generateId(), invite.party_id, userId, now());

        console.log(`[Social] ${userId} joined party ${invite.party_id}`);
        return { success: true, partyMemberIds, joinerName, joinerId: userId };
    } catch (error: any) {
        console.error('[Social] acceptPartyInvite error:', error);
        return { success: false, error: error.message };
    }
}

export async function declinePartyInvite(inviteId: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        const invite = db.prepare(`
            SELECT id, invitee_id FROM party_invites WHERE id = ?
        `).get(inviteId) as any;

        if (!invite || invite.invitee_id !== userId) {
            return { success: false, error: 'Not authorized' };
        }

        db.prepare(`UPDATE party_invites SET status = 'declined' WHERE id = ?`).run(inviteId);
        return { success: true };
    } catch (error: any) {
        console.error('[Social] declinePartyInvite error:', error);
        return { success: false, error: error.message };
    }
}

export async function leaveParty(): Promise<{ 
    success: boolean; 
    error?: string;
    remainingMemberIds?: string[];
    leaverName?: string;
    leaverId?: string;
    disbanded?: boolean;
    queueCancelled?: boolean;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const leaverName = (session.user as any).name || 'Someone';
    const db = getDatabase();

    try {
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id, p.queue_status
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        const partyId = membership.party_id;
        const isLeader = membership.leader_id === userId;
        const wasInQueue = !!membership.queue_status;

        // Check if a match has already been found (prevent leaving)
        if (await hasActiveMatch(partyId)) {
            return { success: false, error: 'Cannot leave party while a match is in progress. Please complete or decline the match first.' };
        }

        // Cancel any active Redis queue entries BEFORE removing from party
        let queueCancelled = false;
        if (wasInQueue) {
            await cancelPartyQueues(partyId);
            // Clear SQLite queue status
            db.prepare(`UPDATE parties SET queue_status = NULL, queue_started_at = NULL WHERE id = ?`).run(partyId);
            queueCancelled = true;
            console.log(`[Social] Queue cancelled for party ${partyId} because ${userId} left`);
        }

        // Remove from party
        db.prepare(`DELETE FROM party_members WHERE user_id = ? AND party_id = ?`).run(userId, partyId);

        // Check remaining members
        const remaining = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ? ORDER BY joined_at ASC
        `).all(partyId) as any[];
        
        const remainingMemberIds = remaining.map(m => m.user_id);
        let disbanded = false;

        if (remaining.length === 0) {
            // Delete empty party and its invites
            db.prepare(`DELETE FROM party_invites WHERE party_id = ?`).run(partyId);
            db.prepare(`DELETE FROM parties WHERE id = ?`).run(partyId);
            disbanded = true;
            console.log(`[Social] Party ${partyId} disbanded`);
        } else if (isLeader) {
            // Transfer leadership to next member
            const newLeader = remaining[0].user_id;
            db.prepare(`UPDATE parties SET leader_id = ? WHERE id = ?`).run(newLeader, partyId);
            console.log(`[Social] Party ${partyId} leadership transferred to ${newLeader}`);
            
            // Clear IGL/Anchor if they were the leaving player
            db.prepare(`
                UPDATE parties 
                SET igl_id = CASE WHEN igl_id = ? THEN NULL ELSE igl_id END,
                    anchor_id = CASE WHEN anchor_id = ? THEN NULL ELSE anchor_id END
                WHERE id = ?
            `).run(userId, userId, partyId);
        }

        console.log(`[Social] ${userId} left party ${partyId}`);
        return { success: true, remainingMemberIds, leaverName, leaverId: userId, disbanded, queueCancelled };
    } catch (error: any) {
        console.error('[Social] leaveParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Kick a member from the party
 * Only the party leader can kick members
 */
export async function kickFromParty(targetUserId: string): Promise<{
    success: boolean;
    error?: string;
    remainingMemberIds?: string[];
    kickedName?: string;
    kickedId?: string;
    queueCancelled?: boolean;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Verify current user is the party leader
        const leaderMembership = db.prepare(`
            SELECT pm.party_id, p.leader_id, p.queue_status, p.igl_id, p.anchor_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!leaderMembership) {
            return { success: false, error: 'You are not in a party' };
        }

        if (leaderMembership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can kick members' };
        }

        if (targetUserId === userId) {
            return { success: false, error: 'You cannot kick yourself. Use leave party instead.' };
        }

        const partyId = leaderMembership.party_id;

        // Verify target is in the same party
        const targetMembership = db.prepare(`
            SELECT pm.id, u.name
            FROM party_members pm
            JOIN users u ON u.id = pm.user_id
            WHERE pm.party_id = ? AND pm.user_id = ?
        `).get(partyId, targetUserId) as any;

        if (!targetMembership) {
            return { success: false, error: 'Player is not in your party' };
        }

        // Check if a match has already been found (prevent kicking)
        if (await hasActiveMatch(partyId)) {
            return { success: false, error: 'Cannot kick members while a match is in progress' };
        }

        // Cancel queue if party was queuing
        let queueCancelled = false;
        if (leaderMembership.queue_status) {
            await cancelPartyQueues(partyId);
            db.prepare(`UPDATE parties SET queue_status = NULL, queue_started_at = NULL WHERE id = ?`).run(partyId);
            queueCancelled = true;
            console.log(`[Social] Queue cancelled for party ${partyId} because ${targetUserId} was kicked`);
        }

        // Remove target from party
        db.prepare(`DELETE FROM party_members WHERE user_id = ? AND party_id = ?`).run(targetUserId, partyId);

        // Clear IGL/Anchor if they were the kicked player
        if (leaderMembership.igl_id === targetUserId || leaderMembership.anchor_id === targetUserId) {
            db.prepare(`
                UPDATE parties 
                SET igl_id = CASE WHEN igl_id = ? THEN NULL ELSE igl_id END,
                    anchor_id = CASE WHEN anchor_id = ? THEN NULL ELSE anchor_id END
                WHERE id = ?
            `).run(targetUserId, targetUserId, partyId);
        }

        // Get remaining member IDs for notification
        const remaining = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(partyId) as { user_id: string }[];

        console.log(`[Social] ${userId} kicked ${targetUserId} (${targetMembership.name}) from party ${partyId}`);
        return { 
            success: true, 
            remainingMemberIds: remaining.map(m => m.user_id), 
            kickedName: targetMembership.name,
            kickedId: targetUserId,
            queueCancelled
        };
    } catch (error: any) {
        console.error('[Social] kickFromParty error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Transfer party leadership to another member
 * Only the current party leader can transfer leadership
 */
export async function transferPartyLeadership(newLeaderId: string): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
    newLeaderName?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Check if current user is the party leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can transfer leadership' };
        }

        const partyId = membership.party_id;

        // Verify new leader is in the party
        const newLeaderMembership = db.prepare(`
            SELECT pm.user_id, u.name 
            FROM party_members pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.party_id = ? AND pm.user_id = ?
        `).get(partyId, newLeaderId) as any;

        if (!newLeaderMembership) {
            return { success: false, error: 'User is not in your party' };
        }

        // Can't transfer to yourself
        if (newLeaderId === userId) {
            return { success: false, error: 'You are already the party leader' };
        }

        // Transfer leadership
        db.prepare(`UPDATE parties SET leader_id = ? WHERE id = ?`).run(newLeaderId, partyId);

        // Get all party member IDs for real-time notification
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(partyId) as any[];
        const partyMemberIds = members.map(m => m.user_id);

        console.log(`[Social] Party ${partyId} leadership transferred from ${userId} to ${newLeaderId}`);
        return { 
            success: true, 
            partyMemberIds,
            newLeaderName: newLeaderMembership.name,
        };
    } catch (error: any) {
        console.error('[Social] transferPartyLeadership error:', error);
        return { success: false, error: error.message };
    }
}

// =============================================================================
// SOCIAL STATS (for badge/header display)
// =============================================================================

export async function getSocialStats(): Promise<SocialStats> {
    const session = await auth();
    if (!session?.user) {
        return {
            friendsOnline: 0,
            friendsTotal: 0,
            pendingRequests: 0,
            partySize: 0,
            partyMaxSize: 0,
            inParty: false,
        };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Clean up any orphaned party memberships (where party no longer exists)
        // This handles cases where a user logs in and has stale party references
        const orphanedMembership = db.prepare(`
            SELECT pm.party_id 
            FROM party_members pm
            LEFT JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ? AND p.id IS NULL
        `).get(userId) as any;
        
        if (orphanedMembership) {
            console.log(`[Social] getSocialStats: Cleaning up orphaned party membership for user ${userId}, party ${orphanedMembership.party_id}`);
            db.prepare(`DELETE FROM party_members WHERE user_id = ? AND party_id = ?`).run(userId, orphanedMembership.party_id);
        }

        // Count friends and online friends - only query one direction to avoid duplicates
        const friends = db.prepare(`
            SELECT u.last_active
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ?
        `).all(userId) as any[];

        const friendsOnline = friends.filter(f => isUserOnline(f.last_active)).length;

        // Count pending incoming requests
        const pendingCount = db.prepare(`
            SELECT COUNT(*) as count FROM friend_requests 
            WHERE receiver_id = ? AND status = 'pending'
        `).get(userId) as any;

        // Get party info (only valid parties with existing party record)
        const membership = db.prepare(`
            SELECT pm.party_id, p.max_size
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        let partySize = 0;
        let partyMaxSize = 0;
        if (membership) {
            const memberCount = db.prepare(`
                SELECT COUNT(*) as count FROM party_members WHERE party_id = ?
            `).get(membership.party_id) as any;
            partySize = memberCount.count;
            partyMaxSize = membership.max_size;
        }

        return {
            friendsOnline,
            friendsTotal: friends.length,
            pendingRequests: pendingCount.count,
            partySize,
            partyMaxSize,
            inParty: !!membership,
        };
    } catch (error: any) {
        console.error('[Social] getSocialStats error:', error);
        return {
            friendsOnline: 0,
            friendsTotal: 0,
            pendingRequests: 0,
            partySize: 0,
            partyMaxSize: 0,
            inParty: false,
        };
    }
}

// =============================================================================
// CHECK FRIENDSHIP STATUS (for post-match UI)
// =============================================================================

export async function checkFriendshipStatus(targetUserId: string): Promise<{
    isFriend: boolean;
    requestPending: boolean;
    requestDirection?: 'sent' | 'received';
}> {
    const session = await auth();
    if (!session?.user) {
        return { isFriend: false, requestPending: false };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Check if friends
        const friendship = db.prepare(`
            SELECT id FROM friendships 
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        `).get(userId, targetUserId, targetUserId, userId);

        if (friendship) {
            return { isFriend: true, requestPending: false };
        }

        // Check for pending request
        const request = db.prepare(`
            SELECT sender_id FROM friend_requests 
            WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
            AND status = 'pending'
        `).get(userId, targetUserId, targetUserId, userId) as any;

        if (request) {
            return {
                isFriend: false,
                requestPending: true,
                requestDirection: request.sender_id === userId ? 'sent' : 'received',
            };
        }

        return { isFriend: false, requestPending: false };
    } catch (error: any) {
        console.error('[Social] checkFriendshipStatus error:', error);
        return { isFriend: false, requestPending: false };
    }
}

// =============================================================================
// ARENA TEAMS 5v5 PARTY EXTENSIONS
// =============================================================================

/**
 * Set the In-Game Leader (IGL) for the party
 * Only the party leader can set the IGL
 */
export async function setPartyIGL(iglUserId: string): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party and verify they're the leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can set the IGL' };
        }

        // Verify target user is in the party
        const targetMember = db.prepare(`
            SELECT id FROM party_members WHERE party_id = ? AND user_id = ?
        `).get(membership.party_id, iglUserId);

        if (!targetMember) {
            return { success: false, error: 'User is not in your party' };
        }

        // Set IGL
        db.prepare(`UPDATE parties SET igl_id = ? WHERE id = ?`).run(iglUserId, membership.party_id);

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] Party ${membership.party_id} IGL set to ${iglUserId}`);
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] setPartyIGL error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set the Anchor for the party
 * Only the party leader can set the Anchor
 */
export async function setPartyAnchor(anchorUserId: string): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party and verify they're the leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can set the Anchor' };
        }

        // Verify target user is in the party
        const targetMember = db.prepare(`
            SELECT id FROM party_members WHERE party_id = ? AND user_id = ?
        `).get(membership.party_id, anchorUserId);

        if (!targetMember) {
            return { success: false, error: 'User is not in your party' };
        }

        // Set Anchor
        db.prepare(`UPDATE parties SET anchor_id = ? WHERE id = ?`).run(anchorUserId, membership.party_id);

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] Party ${membership.party_id} Anchor set to ${anchorUserId}`);
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] setPartyAnchor error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Toggle the current user's ready state in the party
 */
export async function togglePartyReady(): Promise<{
    success: boolean;
    isReady?: boolean;
    error?: string;
    partyMemberIds?: string[];
    queueCancelled?: boolean;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party membership with party queue status and role info
        const membership = db.prepare(`
            SELECT pm.id, pm.party_id, pm.is_ready,
                   p.queue_status, p.igl_id, p.anchor_id
            FROM party_members pm
            JOIN parties p ON p.id = pm.party_id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        const isCurrentlyReady = !!membership.is_ready;
        const wantsToUnready = isCurrentlyReady;

        // Check if a match has been found - prevent un-readying
        if (wantsToUnready && await hasActiveMatch(membership.party_id)) {
            return { success: false, error: 'Cannot change ready state while a match is in progress' };
        }

        // Toggle ready state
        const newReadyState = membership.is_ready ? 0 : 1;
        db.prepare(`UPDATE party_members SET is_ready = ? WHERE id = ?`).run(newReadyState, membership.id);

        // If player is un-readying AND the party is currently in queue, cancel the queue
        let queueCancelled = false;
        if (newReadyState === 0 && membership.queue_status) {
            // Cancel Redis queue entries
            await cancelPartyQueues(membership.party_id);
            
            // Clear SQLite queue status
            db.prepare(`
                UPDATE parties SET queue_status = NULL, queue_started_at = NULL 
                WHERE id = ?
            `).run(membership.party_id);
            queueCancelled = true;
            console.log(`[Social] Queue cancelled for party ${membership.party_id} because user ${userId} un-readied`);
        }

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] User ${userId} ready state toggled to ${newReadyState} in party ${membership.party_id}`);
        return { success: true, isReady: !!newReadyState, partyMemberIds: members.map(m => m.user_id), queueCancelled };
    } catch (error: any) {
        console.error('[Social] togglePartyReady error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update the party's queue status
 * Called when leader starts queue, or queue is cancelled
 */
export async function updatePartyQueueStatus(
    partyId: string,
    status: 'idle' | 'finding_teammates' | 'finding_opponents' | null
): Promise<{ success: boolean; error?: string; partyMemberIds?: string[] }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Verify user is the party leader
        const party = db.prepare(`
            SELECT id, leader_id FROM parties WHERE id = ?
        `).get(partyId) as any;

        if (!party) {
            return { success: false, error: 'Party not found' };
        }

        if (party.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can update queue status' };
        }

        // Update queue status
        const startedAt = status ? new Date().toISOString() : null;
        db.prepare(`
            UPDATE parties SET queue_status = ?, queue_started_at = ? WHERE id = ?
        `).run(status, startedAt, partyId);

        // Get all party member IDs for notification
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(partyId) as { user_id: string }[];

        console.log(`[Social] Party ${partyId} queue status updated to: ${status}`);
        console.log(`[Social] Party members to notify:`, members.map(m => m.user_id));
        
        // #region agent log - Server-side logging
        try {
            const fs = require('fs');
            const logEntry = JSON.stringify({
                location: 'social.ts:updatePartyQueueStatus',
                message: 'Updated party queue status in DB - returning member IDs for notification',
                data: { partyId, status, memberIds: members.map(m => m.user_id), memberCount: members.length, leaderId: userId },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'C'
            }) + '\n';
            fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', logEntry);
        } catch (e) { /* ignore logging errors */ }
        // #endregion
        
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] updatePartyQueueStatus error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set the target mode for the party (5v5, 4v4, etc.)
 * Only the party leader can set the target mode
 */
export async function setPartyTargetMode(mode: string | null): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    // Validate mode
    const validModes = ['2v2', '3v3', '4v4', '5v5', null];
    if (!validModes.includes(mode)) {
        return { success: false, error: 'Invalid mode' };
    }

    try {
        // Get user's party and verify they're the leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can set the target mode' };
        }

        // Set target mode
        db.prepare(`UPDATE parties SET target_mode = ? WHERE id = ?`).run(mode, membership.party_id);

        // Reset all member ready states when mode changes
        db.prepare(`UPDATE party_members SET is_ready = 0 WHERE party_id = ?`).run(membership.party_id);

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] Party ${membership.party_id} target mode set to ${mode}`);
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] setPartyTargetMode error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Link a party to a persistent team
 * Only the party leader can link to a team they're a member of
 */
export async function linkPartyToTeam(teamId: string | null): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party and verify they're the leader
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can link to a team' };
        }

        // If linking to a team, verify the user is a member of that team
        if (teamId) {
            const teamMembership = db.prepare(`
                SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
            `).get(teamId, userId);

            if (!teamMembership) {
                return { success: false, error: 'You are not a member of this team' };
            }
        }

        // Link party to team
        db.prepare(`UPDATE parties SET team_id = ? WHERE id = ?`).run(teamId, membership.party_id);

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] Party ${membership.party_id} linked to team ${teamId || 'none'}`);
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] linkPartyToTeam error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Set preferred operation slot for the current user
 */
export async function setPreferredOperation(operation: string | null): Promise<{
    success: boolean;
    error?: string;
    partyMemberIds?: string[];
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    // Validate operation
    const validOperations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed', null];
    if (!validOperations.includes(operation)) {
        return { success: false, error: 'Invalid operation' };
    }

    try {
        // Get user's party membership
        const membership = db.prepare(`
            SELECT pm.id, pm.party_id
            FROM party_members pm
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        // Set preferred operation
        db.prepare(`UPDATE party_members SET preferred_operation = ? WHERE id = ?`).run(operation, membership.id);

        // Get all party member IDs for broadcasting
        const members = db.prepare(`
            SELECT user_id FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { user_id: string }[];

        console.log(`[Social] User ${userId} preferred operation set to ${operation}`);
        return { success: true, partyMemberIds: members.map(m => m.user_id) };
    } catch (error: any) {
        console.error('[Social] setPreferredOperation error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if all party members are ready for queue
 */
export async function checkPartyReady(): Promise<{
    allReady: boolean;
    readyCount: number;
    totalCount: number;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { allReady: false, readyCount: 0, totalCount: 0, error: 'Unauthorized' };
    }

    const userId = (session.user as any).id;
    const db = getDatabase();

    try {
        // Get user's party
        const membership = db.prepare(`
            SELECT pm.party_id
            FROM party_members pm
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { allReady: false, readyCount: 0, totalCount: 0, error: 'Not in a party' };
        }

        // Get member ready states
        const members = db.prepare(`
            SELECT is_ready FROM party_members WHERE party_id = ?
        `).all(membership.party_id) as { is_ready: number }[];

        const readyCount = members.filter(m => m.is_ready).length;
        const totalCount = members.length;

        return {
            allReady: readyCount === totalCount,
            readyCount,
            totalCount,
        };
    } catch (error: any) {
        console.error('[Social] checkPartyReady error:', error);
        return { allReady: false, readyCount: 0, totalCount: 0, error: error.message };
    }
}

