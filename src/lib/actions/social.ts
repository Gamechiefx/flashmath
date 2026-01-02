'use server';

/**
 * FlashMath Social System - Server Actions
 * Handles friends, friend requests, parties, and party invites
 */

import { auth } from "@/auth";
import { getDatabase, generateId, now } from "@/lib/db/sqlite";

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
}

export interface PartyMember {
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string;
    odOnline: boolean;
    isLeader: boolean;
    joinedAt: string;
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
        // Get all friends - only query where user_id = current user to avoid duplicates
        // (friendships are stored bidirectionally, so each friendship has 2 rows)
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

        const result: Friend[] = friends.map(f => {
            let equipped: any = {};
            try {
                equipped = typeof f.equipped_items === 'string' 
                    ? JSON.parse(f.equipped_items) 
                    : f.equipped_items || {};
            } catch { }

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
            };
        });

        return { friends: result };
    } catch (error: any) {
        console.error('[Social] getFriendsList error:', error);
        return { friends: [], error: error.message };
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

        // Update request status
        db.prepare(`
            UPDATE friend_requests 
            SET status = 'accepted', responded_at = ?
            WHERE id = ?
        `).run(now(), requestId);

        // Create bidirectional friendship entries
        const friendshipId1 = generateId();
        const friendshipId2 = generateId();
        const timestamp = now();

        db.prepare(`
            INSERT INTO friendships (id, user_id, friend_id, created_at)
            VALUES (?, ?, ?, ?)
        `).run(friendshipId1, request.sender_id, request.receiver_id, timestamp);

        db.prepare(`
            INSERT INTO friendships (id, user_id, friend_id, created_at)
            VALUES (?, ?, ?, ?)
        `).run(friendshipId2, request.receiver_id, request.sender_id, timestamp);

        console.log(`[Social] Friend request ${requestId} accepted`);
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
                SELECT p.id, p.leader_id, p.max_size, p.invite_mode, p.created_at, u.name as leader_name
                FROM parties p
                JOIN users u ON p.leader_id = u.id
                WHERE p.id = ?
            `).get(membership.party_id) as any;

            if (partyData) {
                // Get all members
                const members = db.prepare(`
                    SELECT pm.user_id, pm.joined_at, u.name, u.level, u.equipped_items, u.last_active
                    FROM party_members pm
                    JOIN users u ON pm.user_id = u.id
                    WHERE pm.party_id = ?
                    ORDER BY pm.joined_at ASC
                `).all(membership.party_id) as any[];

                party = {
                    id: partyData.id,
                    leaderId: partyData.leader_id,
                    leaderName: partyData.leader_name,
                    maxSize: partyData.max_size,
                    inviteMode: partyData.invite_mode || 'open',
                    createdAt: partyData.created_at,
                    members: members.map(m => {
                        let equipped: any = {};
                        try {
                            equipped = JSON.parse(m.equipped_items || '{}');
                        } catch { }

                        return {
                            odUserId: m.user_id,
                            odName: m.name,
                            odLevel: m.level || 1,
                            odEquippedFrame: equipped.frame || 'default',
                            odOnline: isUserOnline(m.last_active),
                            isLeader: m.user_id === partyData.leader_id,
                            joinedAt: m.joined_at,
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

        return {
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
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON pm.party_id = p.id
            WHERE pm.user_id = ?
        `).get(userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in a party' };
        }

        const partyId = membership.party_id;
        const isLeader = membership.leader_id === userId;

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
        }

        console.log(`[Social] ${userId} left party ${partyId}`);
        return { success: true, remainingMemberIds, leaverName, leaverId: userId, disbanded };
    } catch (error: any) {
        console.error('[Social] leaveParty error:', error);
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

        // Get party info
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

