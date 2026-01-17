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

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results and error handling use any types */
import { auth } from "@/auth";
import { getDatabase, generateId, now } from "@/lib/db/sqlite";
import { getArenaDisplayStatsBatch } from "@/lib/arena/arena-db";
import { checkUserArenaEligibility } from "@/lib/actions/arena";
import { ITEMS, ItemType } from "@/lib/items";
 
// const { getLeagueFromElo } = require('@/lib/arena/leagues.js');

/**
 * Resolve banner item ID to style ID
 * e.g., "banner_synthwave" -> "synthwave"
 */
 
function resolveBannerStyle(bannerId: string): string {
    if (!bannerId || bannerId === 'default') return 'default';
    // If it's a raw style ID (legacy), return it
    if (!bannerId.startsWith('banner_') && bannerId !== 'default') return bannerId;
    // Otherwise resolve from ITEMS
    const item = ITEMS.find(i => i.id === bannerId && i.type === ItemType.BANNER);
    return item?.assetValue || 'default';
}

// =============================================================================
// REDIS QUEUE HELPERS
// =============================================================================

let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;
    try {
        const Redis = (await import('ioredis')).default;
        // IMPORTANT: Must match server-redis.js default ('localhost') for local development
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
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
async function _cancelPartyQueues(partyId: string): Promise<void> {
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
async function _hasActiveMatch(partyId: string): Promise<boolean> {
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
    queueStatus: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found' | null;
    queueStartedAt: string | null;  // ISO timestamp when queue started
    queueState?: {
        status: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';
        startedAt: number | null;
        matchType: 'ranked' | 'casual' | null;
        matchId: string | null;
    };
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
    // Arena eligibility (for queue validation)
    arenaEligible?: boolean;        // Is this member eligible for arena play?
    arenaEligibilityReason?: string; // Reason if not eligible (e.g., "needs email verification")
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

    const userId = (session.user as { id: string }).id;
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
        `).all(userId, userId) as Array<{
            other_user_id: string;
            created_at?: string;
            [key: string]: unknown;
        }>;

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
        `).all(userId) as Array<{
            friendship_id: string;
            friends_since: string;
            user_id: string;
            name: string;
            level: number;
            equipped_items: string | null;
            last_active: string | null;
        }>;

        // Batch fetch ELO data from PostgreSQL (source of truth)
        const friendIds = friends.map(f => f.user_id);
        const arenaStats = await getArenaDisplayStatsBatch(friendIds);

        const result: Friend[] = friends.map(f => {
            let equipped: Record<string, string> = {};
            try {
                equipped = typeof f.equipped_items === 'string' 
                    ? JSON.parse(f.equipped_items) 
                    : {};
            } catch { /* ignore */ }

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

    const userId = (session.user as { id: string }).id;
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
        `).all(userId) as Array<{
            id: string;
            sender_id: string;
            receiver_id: string;
            status?: string;
            created_at?: string;
            sender_name?: string;
            sender_level?: number;
            sender_equipped?: string | null;
            receiver_name?: string;
            receiver_level?: number;
            receiver_equipped?: string | null;
            [key: string]: unknown;
        }>;

        // Case 2: User is in friend_id but reverse (user_id -> friend_id) is missing  
        const missingReverse2 = db.prepare(`
            SELECT f.id, f.user_id, f.friend_id, f.created_at
            FROM friendships f
            WHERE f.friend_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM friendships f2 
                WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
            )
        `).all(userId) as Array<{
            id: string;
            sender_id: string;
            receiver_id: string;
            status?: string;
            created_at?: string;
            sender_name?: string;
            sender_level?: number;
            sender_equipped?: string | null;
            receiver_name?: string;
            receiver_level?: number;
            receiver_equipped?: string | null;
            [key: string]: unknown;
        }>;

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
    const userId = (session.user as { id: string }).id;
    const db = getDatabase();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role?: string | null } | undefined;
    
    if (!user || !['admin', 'super_admin'].includes(user.role ?? '')) {
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
    const senderName = (session.user as { name?: string }).name || 'Someone';
    const db = getDatabase();

    try {
        // Find user by email
        const receiver = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email) as { id: string; name: string } | undefined;
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
        `).get(senderId, receiver.id, receiver.id, senderId) as {
            id: string;
            status?: string;
            sender_id: string;
            [key: string]: unknown;
        } | undefined;

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
    const senderName = (session.user as { name?: string }).name || 'Someone';
    const db = getDatabase();

    try {
        if (targetUserId === senderId) {
            return { success: false, error: "You can't add yourself as a friend" };
        }

        // Check if target user exists
        const receiver = db.prepare('SELECT id, name FROM users WHERE id = ?').get(targetUserId) as { id: string; name: string } | undefined;
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
        `).get(senderId, targetUserId, targetUserId, senderId) as {
            id: string;
            status?: string;
            sender_id: string;
            [key: string]: unknown;
        } | undefined;

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

    const userId = (session.user as { id: string }).id;
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
        `).all(userId) as Array<{
            id: string;
            sender_id: string;
            receiver_id: string;
            status: 'pending' | 'accepted' | 'declined';
            created_at: string;
            sender_name?: string;
            sender_level?: number;
            sender_equipped?: string | null;
            receiver_name?: string;
            receiver_level?: number;
            receiver_equipped?: string | null;
        }>;

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
        `).all(userId) as Array<{
            id: string;
            sender_id: string;
            receiver_id: string;
            status: 'pending' | 'accepted' | 'declined';
            created_at: string;
            sender_name?: string;
            sender_level?: number;
            sender_equipped?: string | null;
            receiver_name?: string;
            receiver_level?: number;
            receiver_equipped?: string | null;
        }>;

        interface FriendRequestRow {
            id: string;
            sender_id: string;
            receiver_id: string;
            status: 'pending' | 'accepted' | 'declined';
            created_at: string;
            sender_name?: string;
            sender_level?: number;
            sender_equipped?: string | null;
            receiver_name?: string;
            receiver_level?: number;
            receiver_equipped?: string | null;
        }
        const mapRequest = (r: FriendRequestRow, _isIncoming: boolean): FriendRequest => {
            let senderEquipped: Record<string, string> = {};
            let receiverEquipped: Record<string, string> = {};
            try {
                if (r.sender_equipped) senderEquipped = JSON.parse(r.sender_equipped);
                if (r.receiver_equipped) receiverEquipped = JSON.parse(r.receiver_equipped);
            } catch { /* ignore */ }

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

    const userId = (session.user as { id: string }).id;
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

    const userId = (session.user as { id: string }).id;
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

    const userId = (session.user as { id: string }).id;
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

    const userId = (session.user as { id: string }).id;
    const removerName = (session.user as { name?: string }).name || 'Someone';
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
// PARTY SYSTEM - Redis-Based (Primary Storage)
// =============================================================================

import {
    getParty as getRedisParty,
    getUserParty as getRedisUserParty,
    createParty as createRedisParty,
    leaveParty as leaveRedisParty,
    kickMember as kickRedisPartyMember,
    toggleReady as toggleRedisPartyReady,
    setIGL as setRedisPartyIGL,
    setAnchor as setRedisPartyAnchor,
    updateQueueState as updateRedisPartyQueueState,
    createInvite as createRedisPartyInvite,
    acceptInvite as acceptRedisPartyInvite,
    declineInvite as declineRedisPartyInvite,
    getUserPendingInvites as getRedisUserPendingInvites,
    validateUserPartyState,
    type PartyInvite as RedisPartyInvite,
} from "@/lib/party/party-redis";

export async function getPartyData(): Promise<{ party: Party | null; invites: PartyInvite[]; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { party: null, invites: [], error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    try {
        // #region agent log
        // #endregion
        // Get party from Redis (primary source)
        const redisPartyData = await validateUserPartyState(userId);
        
        let party: Party | null = null;

        if (redisPartyData) {
            const { party: redisParty, members: redisMembers, queueState } = redisPartyData;

            // Batch fetch ELO data from PostgreSQL (source of truth for ELO)
            const memberIds = redisMembers.map(m => m.odUserId);
            const arenaStats = await getArenaDisplayStatsBatch(memberIds);

            // Batch fetch equipped_items from SQLite (for banners which aren't stored in Redis)
            const placeholders = memberIds.map(() => '?').join(',');
            const memberEquipmentRows = memberIds.length > 0 ? db.prepare(`
                SELECT id, equipped_items FROM users WHERE id IN (${placeholders})
            `).all(...memberIds) as { id: string; equipped_items: string }[] : [];

            const memberEquipment = new Map<string, any>();
            for (const row of memberEquipmentRows) {
                try {
                    const equipped = JSON.parse(row.equipped_items || '{}');
                    memberEquipment.set(row.id, equipped);
                } catch {
                    memberEquipment.set(row.id, {});
                }
            }

            // Batch fetch arena eligibility for all party members
            const memberEligibility = new Map<string, { isEligible: boolean; reason?: string }>();
            for (const memberId of memberIds) {
                const eligibility = await checkUserArenaEligibility(memberId);
                memberEligibility.set(memberId, {
                    isEligible: eligibility.isEligible,
                    reason: eligibility.reason
                });
            }

            // Convert queue state to legacy format
            const queueStatus = queueState.status === 'idle' ? null : queueState.status;
            const queueStartedAt = queueState.startedAt ? new Date(queueState.startedAt).toISOString() : null;

            party = {
                id: redisParty.id,
                leaderId: redisParty.leaderId,
                leaderName: redisParty.leaderName,
                maxSize: redisParty.maxSize,
                inviteMode: redisParty.inviteMode || 'open',
                createdAt: new Date(redisParty.createdAt).toISOString(),
                // Arena Teams 5v5 extensions
                iglId: redisParty.iglId || null,
                anchorId: redisParty.anchorId || null,
                targetMode: redisParty.targetMode || null,
                teamId: redisParty.teamId || null,
                // Queue status
                queueStatus,
                queueStartedAt,
                queueState,
                members: redisMembers.map(m => {
                    // Get arena stats from PostgreSQL (source of truth)
                    const stats = arenaStats.get(m.odUserId);
                    // Get equipped items from SQLite (for banners)
                    const equipped = memberEquipment.get(m.odUserId) || {};
                    // Get arena eligibility
                    const eligibility = memberEligibility.get(m.odUserId);

                    return {
                        odUserId: m.odUserId,
                        odName: m.odUserName,
                        odLevel: m.odLevel || 1,
                        odEquippedFrame: equipped.frame || m.odEquippedFrame || 'default',
                        odEquippedBanner: resolveBannerStyle(equipped.banner),
                        odEquippedTitle: equipped.title || m.odEquippedTitle || 'default',
                        odOnline: m.isOnline,
                        // ELO from PostgreSQL (source of truth)
                        odDuelElo: stats?.odDuelElo || 300,
                        odDuelRank: stats?.odDuelRank || 'BRONZE',
                        odDuelDivision: stats?.odDuelDivision || 'IV',
                        isLeader: m.odUserId === redisParty.leaderId,
                        joinedAt: new Date(m.joinedAt).toISOString(),
                        // Arena Teams 5v5 extensions
                        isReady: m.isReady,
                        isIgl: m.odUserId === redisParty.iglId,
                        isAnchor: m.odUserId === redisParty.anchorId,
                        preferredOperation: m.preferredOperation || null,
                        odElo5v5: stats?.odElo5v5 || 300,
                        // Arena eligibility for queue validation
                        arenaEligible: eligibility?.isEligible ?? false,
                        arenaEligibilityReason: eligibility?.reason,
                    };
                }),
            };
        }

        // Get pending party invites from Redis
        const redisInvites = await getRedisUserPendingInvites(userId);
        const invites = redisInvites || [];

        const result = {
            party,
            invites: invites.map((i: RedisPartyInvite) => ({
                id: i.inviteId,
                partyId: i.partyId,
                inviterName: i.inviterName,
                inviterId: i.inviterId,
                status: 'pending' as const,
                createdAt: new Date(i.createdAt).toISOString(),
                expiresAt: new Date(i.expiresAt).toISOString(),
            })),
        };
        
        // #region agent log - Log what we're returning
        console.log(`[Social] getPartyData returning: partyId=${party?.id}, queueStatus=${party?.queueStatus}`);
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Debug logging
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
        } catch (_e) { /* ignore logging errors */ }
        // #endregion
        
        return result;
    } catch (error: any) {
        // #region agent log
        // #endregion
        console.error('[Social] getPartyData error:', error);
        return { party: null, invites: [], error: error.message };
    }
}

export async function createParty(inviteMode: 'open' | 'invite_only' = 'open'): Promise<{ success: boolean; partyId?: string; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';
    const db = getDatabase();

    try {
        // Get user data for leader info
        const userData = db.prepare(`
            SELECT level, equipped_items FROM users WHERE id = ?
        `).get(userId) as { level: number; equipped_items: string } | undefined;
        
        let equipped: any = {};
        try {
            equipped = JSON.parse(userData?.equipped_items || '{}');
        } catch { }

        // Create party in Redis (primary storage)
        const result = await createRedisParty(userId, userName, {
            level: userData?.level || 1,
            equippedFrame: equipped.frame,
            equippedTitle: equipped.title,
        });

        if (!result.success || !result.partyId) {
            return { success: false, error: result.error || 'Failed to create party' };
        }

        console.log(`[Social] Party ${result.partyId} created by ${userId} (Redis) with invite_mode=${inviteMode}`);
        return { success: true, partyId: result.partyId };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        const partyData = await getRedisParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        if (partyData.party.leaderId !== userId) {
            return { success: false, error: 'Only the party leader can change settings' };
        }

        // Update settings in Redis
        // Note: inviteMode is stored in party hash
        if (settings.inviteMode) {
            const { getRedis } = await import('@/lib/party/party-redis');
            const redis = await getRedis();
            if (redis) {
                await redis.hset(`party:${partyId}`, 'inviteMode', settings.inviteMode);
            }
            console.log(`[Social] Party ${partyId} invite_mode updated to ${settings.inviteMode} (Redis)`);
        }

        // Get all party member IDs for broadcasting
        const partyMemberIds = partyData.members.map(m => m.odUserId);

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

    const userId = (session.user as { id: string }).id;
    const inviterName = (session.user as { name?: string }).name || 'Someone';
    const db = getDatabase();

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        const partyData = await getRedisParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        const { party, members } = partyData;

        // Check if user can invite based on invite_mode
        const isLeader = party.leaderId === userId;
        const inviteMode = party.inviteMode || 'open';

        if (inviteMode === 'invite_only' && !isLeader) {
            return { success: false, error: 'Only the party leader can invite in this party' };
        }

        // Check party size
        if (members.length >= party.maxSize) {
            return { success: false, error: 'Party is full' };
        }

        // Check if friend is already in a party (Redis)
        const friendParty = await getRedisUserParty(friendId);
        if (friendParty) {
            return { success: false, error: 'Friend is already in a party' };
        }

        // Get friend name from SQLite (user profile data)
        const friendData = db.prepare(`SELECT name FROM users WHERE id = ?`).get(friendId) as { name: string } | undefined;
        const inviteeName = friendData?.name || 'Player';

        // Create invite in Redis
        const result = await createRedisPartyInvite(partyId, userId, inviterName, friendId, inviteeName);
        
        if (!result.success) {
            return { success: false, error: result.error || 'Failed to create invite' };
        }

        console.log(`[Social] Party invite sent from ${userId} to ${friendId} (Redis)`);
        return { success: true, inviteeId: friendId, inviterName, partyId };
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

    const userId = (session.user as { id: string }).id;
    const joinerName = (session.user as { name?: string }).name || 'Someone';
    const db = getDatabase();

    try {
        // Get user data for member info
        const userData = db.prepare(`
            SELECT level, equipped_items FROM users WHERE id = ?
        `).get(userId) as { level: number; equipped_items: string } | undefined;
        
        let equipped: any = {};
        try {
            equipped = JSON.parse(userData?.equipped_items || '{}');
        } catch { }

        // Accept invite via Redis
        const result = await acceptRedisPartyInvite(inviteId, userId, joinerName, {
            level: userData?.level || 1,
            equippedFrame: equipped.frame,
            equippedTitle: equipped.title,
        });

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to accept invite' };
        }

        console.log(`[Social] ${userId} joined party ${result.partyId} (Redis)`);
        return { 
            success: true, 
            partyMemberIds: result.memberIds, 
            joinerName, 
            joinerId: userId 
        };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Decline invite via Redis
        const result = await declineRedisPartyInvite(inviteId, userId);
        
        if (!result.success) {
            return { success: false, error: result.error || 'Failed to decline invite' };
        }

        console.log(`[Social] User ${userId} declined party invite ${inviteId} (Redis)`);
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

    const userId = (session.user as { id: string }).id;
    const leaverName = (session.user as { name?: string }).name || 'Someone';

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Leave party via Redis (handles queue cancellation, leadership transfer, disband)
        const result = await leaveRedisParty(partyId, userId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to leave party' };
        }

        console.log(`[Social] ${userId} left party ${partyId} (Redis), disbanded=${result.disbanded}`);
        return { 
            success: true, 
            remainingMemberIds: result.remainingMemberIds, 
            leaverName, 
            leaverId: userId, 
            disbanded: result.disbanded,
            queueCancelled: result.queueCancelled,
        };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'You are not in a party' };
        }

        // Kick via Redis (handles queue cancellation, IGL/Anchor cleanup)
        const result = await kickRedisPartyMember(partyId, userId, targetUserId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to kick member' };
        }

        console.log(`[Social] ${userId} kicked ${targetUserId} from party ${partyId} (Redis)`);
        return { 
            success: true, 
            remainingMemberIds: result.remainingMemberIds, 
            kickedName: result.kickedName,
            kickedId: targetUserId,
            queueCancelled: result.queueCancelled,
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Import and use transferLeadership from Redis module
        const { transferLeadership } = await import('@/lib/party/party-redis');
        const result = await transferLeadership(partyId, userId, newLeaderId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to transfer leadership' };
        }

        // Get updated party for member IDs
        const partyData = await getRedisParty(partyId);
        const partyMemberIds = partyData?.members.map(m => m.odUserId) || [];

        console.log(`[Social] Party ${partyId} leadership transferred from ${userId} to ${newLeaderId} (Redis)`);
        return { 
            success: true, 
            partyMemberIds,
            newLeaderName: result.newLeaderName,
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

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    try {
        // Count friends and online friends - only query one direction to avoid duplicates
        const friends = db.prepare(`
            SELECT u.last_active
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ?
        `).all(userId) as Array<{
            user_id: string;
            name: string;
            level: number;
            equipped_items?: string | null;
            last_active?: string | null;
        }>;

        const friendsOnline = friends.filter(f => isUserOnline(f.last_active ?? null)).length;

        // Count pending incoming requests
        const pendingCount = db.prepare(`
            SELECT COUNT(*) as count FROM friend_requests 
            WHERE receiver_id = ? AND status = 'pending'
        `).get(userId) as {
            count: number;
        } | undefined;

        // Get party info from Redis (validates and cleans up stale references)
        const partyData = await validateUserPartyState(userId);
        let partySize = 0;
        let partyMaxSize = 0;
        const inParty = !!partyData;
        
        if (partyData) {
            partySize = partyData.members.length;
            partyMaxSize = partyData.party.maxSize;
        }

        return {
            friendsOnline,
            friendsTotal: friends.length,
            pendingRequests: pendingCount?.count ?? 0,
            partySize,
            partyMaxSize,
            inParty,
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

    const userId = (session.user as { id: string }).id;
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
        `).get(userId, targetUserId, targetUserId, userId) as {
            sender_id?: string;
            [key: string]: unknown;
        } | undefined;

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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Set IGL via Redis
        const result = await setRedisPartyIGL(partyId, userId, iglUserId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to set IGL' };
        }

        console.log(`[Social] Party ${partyId} IGL set to ${iglUserId} (Redis)`);
        return { success: true, partyMemberIds: result.memberIds };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Set Anchor via Redis
        const result = await setRedisPartyAnchor(partyId, userId, anchorUserId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to set Anchor' };
        }

        console.log(`[Social] Party ${partyId} Anchor set to ${anchorUserId} (Redis)`);
        return { success: true, partyMemberIds: result.memberIds };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Toggle ready via Redis (handles queue cancellation if un-readying)
        const result = await toggleRedisPartyReady(partyId, userId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to toggle ready state' };
        }

        console.log(`[Social] User ${userId} ready state toggled to ${result.isReady} in party ${partyId} (Redis)`);
        return { 
            success: true, 
            isReady: result.isReady, 
            partyMemberIds: result.memberIds, 
            queueCancelled: result.queueCancelled,
        };
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
    // #region agent log - HA: Track updatePartyQueueStatus calls
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Debug logging
    const fs = require('fs');
    try {
        fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({location:'social.ts:updatePartyQueueStatus',message:'updatePartyQueueStatus CALLED',data:{partyId,status,callerStack:new Error().stack?.split('\n').slice(0,5).join('|')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'}) + '\n');
    } catch {}
    // #endregion
    
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;

    try {
        // Get party from Redis to get member IDs
        const partyData = await getRedisParty(partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        // Map null to 'idle' for Redis
        const redisStatus = status === null ? 'idle' : status;
        
        // #region agent log
        try {
            fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({location:'social.ts:updatePartyQueueStatus',message:'About to call Redis updateQueueState',data:{partyId,redisStatus,userId:userId?.slice(-8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'}) + '\n');
        } catch {}
        // #endregion

        // Update queue status via Redis (includes leadership check)
        const result = await updateRedisPartyQueueState(partyId, userId, redisStatus);

        if (!result.success) {
            // #region agent log
            try {
                fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({location:'social.ts:updatePartyQueueStatus',message:'Redis updateQueueState FAILED',data:{partyId,redisStatus,error:result.error},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'}) + '\n');
            } catch {}
            // #endregion
            return { success: false, error: result.error || 'Failed to update queue status' };
        }
        
        // #region agent log
        try {
            fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', JSON.stringify({location:'social.ts:updatePartyQueueStatus',message:'Redis updateQueueState SUCCESS',data:{partyId,redisStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'}) + '\n');
        } catch {}
        // #endregion

        // Get member IDs for notification
        const memberIds = partyData.members.map(m => m.odUserId);

        console.log(`[Social] Party ${partyId} queue status updated to: ${status} (Redis)`);
        console.log(`[Social] Party members to notify:`, memberIds);
        
        return { success: true, partyMemberIds: memberIds };
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

    const userId = (session.user as { id: string }).id;

    // Validate mode
    const validModes = ['2v2', '3v3', '4v4', '5v5', null];
    if (!validModes.includes(mode)) {
        return { success: false, error: 'Invalid mode' };
    }

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Use setTargetMode from Redis module
        const { setTargetMode } = await import('@/lib/party/party-redis');
        const result = await setTargetMode(partyId, userId, mode as '5v5' | '3v3' | '2v2' | null);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to set target mode' };
        }

        // Get updated party for member IDs
        const partyData = await getRedisParty(partyId);
        const memberIds = partyData?.members.map(m => m.odUserId) || [];

        console.log(`[Social] Party ${partyId} target mode set to ${mode} (Redis)`);
        return { success: true, partyMemberIds: memberIds };
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

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // If linking to a team, verify the user is a member of that team (SQLite for teams)
        if (teamId) {
            const teamMembership = db.prepare(`
                SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
            `).get(teamId, userId);

            if (!teamMembership) {
                return { success: false, error: 'You are not a member of this team' };
            }
        }

        // Use linkToTeam from Redis module
        const { linkToTeam } = await import('@/lib/party/party-redis');
        const result = await linkToTeam(partyId, userId, teamId);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to link to team' };
        }

        // Get updated party for member IDs
        const partyData = await getRedisParty(partyId);
        const memberIds = partyData?.members.map(m => m.odUserId) || [];

        console.log(`[Social] Party ${partyId} linked to team ${teamId || 'none'} (Redis)`);
        return { success: true, partyMemberIds: memberIds };
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

    const userId = (session.user as { id: string }).id;

    // Validate operation
    const validOperations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed', null];
    if (!validOperations.includes(operation)) {
        return { success: false, error: 'Invalid operation' };
    }

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { success: false, error: 'Not in a party' };
        }

        // Use setPreferredOperation from Redis module
        const { setPreferredOperation: setRedisPreferredOp } = await import('@/lib/party/party-redis');
        const result = await setRedisPreferredOp(partyId, userId, operation);

        if (!result.success) {
            return { success: false, error: result.error || 'Failed to set preferred operation' };
        }

        // Get updated party for member IDs
        const partyData = await getRedisParty(partyId);
        const memberIds = partyData?.members.map(m => m.odUserId) || [];

        console.log(`[Social] User ${userId} preferred operation set to ${operation} (Redis)`);
        return { success: true, partyMemberIds: memberIds };
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

    const userId = (session.user as { id: string }).id;

    try {
        // Get user's party from Redis
        const partyId = await getRedisUserParty(userId);
        if (!partyId) {
            return { allReady: false, readyCount: 0, totalCount: 0, error: 'Not in a party' };
        }

        // Use checkAllReady from Redis module
        const { checkAllReady } = await import('@/lib/party/party-redis');
        const result = await checkAllReady(partyId);

        return {
            allReady: result.allReady,
            readyCount: result.readyCount,
            totalCount: result.totalCount,
        };
    } catch (error: any) {
        console.error('[Social] checkPartyReady error:', error);
        return { allReady: false, readyCount: 0, totalCount: 0, error: error.message };
    }
}


