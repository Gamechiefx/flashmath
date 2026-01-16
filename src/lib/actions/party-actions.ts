'use server';

/**
 * FlashMath Party Server Actions - Redis-Based
 * 
 * These actions wrap the party-redis module for use in server components.
 * Parties are now fully Redis-based (no SQLite).
 * 
 * For Socket.IO real-time events, use the presence namespace in server.js.
 */

import { auth } from "@/auth";
import { getDatabase } from "@/lib/db/sqlite";
import * as partyRedis from "@/lib/party/party-redis";
import type { FullPartyData, PartyQueueState } from "@/lib/party/party-redis";

// Re-export types
export type { FullPartyData, PartyState, PartyMember, PartyQueueState };

// =============================================================================
// PARTY LIFECYCLE
// =============================================================================

/**
 * Create a new party (user becomes leader)
 */
export async function createParty(): Promise<{
    success: boolean;
    partyId?: string;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';

    // Get user data from SQLite (level, equipped items)
    const db = getDatabase();
    const userData = db.prepare(`
        SELECT level, equipped_items FROM users WHERE id = ?
    `).get(userId) as { level?: number; equipped_items?: string | null } | undefined;

    const equipped = userData?.equipped_items ? JSON.parse(userData.equipped_items) : {};

    return await partyRedis.createParty(userId, userName, {
        level: userData?.level || 1,
        equippedFrame: equipped.frame,
        equippedTitle: equipped.title,
    });
}

/**
 * Get current user's party data
 * 
 * This function includes validation to clean up stale party references.
 * If the user has a party reference but the party no longer exists or
 * the user is no longer a member, the stale reference is cleaned up.
 */
export async function getMyParty(): Promise<FullPartyData | null> {
    const session = await auth();
    if (!session?.user) {
        return null;
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);
    
    if (!partyId) {
        return null;
    }

    // Get the party data
    const partyData = await partyRedis.getParty(partyId);
    
    // If party doesn't exist (expired/disbanded), clean up the stale reference
    if (!partyData) {
        console.log(`[PartyActions] Cleaning up stale party reference for user ${userId}, party ${partyId} no longer exists`);
        await partyRedis.clearStaleUserPartyReference(userId);
        return null;
    }
    
    // Verify the user is actually a member of this party
    const isMember = partyData.members.some(m => m.odUserId === userId);
    if (!isMember) {
        console.log(`[PartyActions] User ${userId} has party reference to ${partyId} but is not a member, cleaning up`);
        await partyRedis.clearStaleUserPartyReference(userId);
        return null;
    }
    
    return partyData;
}

/**
 * Get party by ID
 */
export async function getPartyById(partyId: string): Promise<FullPartyData | null> {
    return await partyRedis.getParty(partyId);
}

/**
 * Disband the party (leader only)
 */
export async function disbandParty(): Promise<{
    success: boolean;
    memberIds?: string[];
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.disbandParty(partyId, userId);
}

// =============================================================================
// MEMBER MANAGEMENT
// =============================================================================

/**
 * Join a party by ID
 */
export async function joinParty(partyId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';

    // Get user data from SQLite
    const db = getDatabase();
    const userData = db.prepare(`
        SELECT level, equipped_items FROM users WHERE id = ?
    `).get(userId) as { level?: number; equipped_items?: string | null } | undefined;

    const equipped = userData?.equipped_items ? JSON.parse(userData.equipped_items) : {};

    return await partyRedis.joinParty(partyId, userId, userName, {
        level: userData?.level || 1,
        equippedFrame: equipped.frame,
        equippedTitle: equipped.title,
    });
}

/**
 * Leave the current party
 */
export async function leaveParty(): Promise<{
    success: boolean;
    remainingMemberIds?: string[];
    disbanded?: boolean;
    newLeaderId?: string;
    queueCancelled?: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.leaveParty(partyId, userId);
}

/**
 * Kick a member from the party (leader only)
 */
export async function kickFromParty(targetUserId: string): Promise<{
    success: boolean;
    kickedName?: string;
    queueCancelled?: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.kickMember(partyId, userId, targetUserId);
}

// =============================================================================
// READY STATE & ROLES
// =============================================================================

/**
 * Toggle ready state
 */
export async function togglePartyReady(): Promise<{
    success: boolean;
    isReady?: boolean;
    queueCancelled?: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.toggleReady(partyId, userId);
}

/**
 * Set IGL (In-Game Leader) - leader only
 */
export async function setPartyIGL(iglUserId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.setIGL(partyId, userId, iglUserId);
}

/**
 * Set Anchor - leader only
 */
export async function setPartyAnchor(anchorUserId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.setAnchor(partyId, userId, anchorUserId);
}

/**
 * Set preferred operation for current user
 */
export async function setPreferredOperation(operation: string | null): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.setPreferredOperation(partyId, userId, operation);
}

// =============================================================================
// QUEUE STATE
// =============================================================================

/**
 * Update queue status (leader only)
 */
export async function updatePartyQueueStatus(
    status: 'idle' | 'finding_teammates' | 'finding_opponents',
    matchType?: 'ranked' | 'casual'
): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.updateQueueState(partyId, userId, status, matchType);
}

/**
 * Check if all party members are ready
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
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { allReady: false, readyCount: 0, totalCount: 0, error: 'Not in a party' };
    }

    return await partyRedis.checkAllReady(partyId);
}

// =============================================================================
// INVITES
// =============================================================================

/**
 * Send a party invite
 */
export async function sendPartyInvite(inviteeId: string): Promise<{
    success: boolean;
    inviteId?: string;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    // Get invitee name from SQLite
    const db = getDatabase();
    const invitee = db.prepare(`SELECT name FROM users WHERE id = ?`).get(inviteeId) as { name: string } | undefined;
    const inviteeName = invitee?.name || 'Player';

    return await partyRedis.createInvite(partyId, userId, userName, inviteeId, inviteeName);
}

/**
 * Accept a party invite
 */
export async function acceptPartyInvite(partyId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';

    // Get user data from SQLite
    const db = getDatabase();
    const userData = db.prepare(`
        SELECT level, equipped_items FROM users WHERE id = ?
    `).get(userId) as { level?: number; equipped_items?: string | null } | undefined;

    const equipped = userData?.equipped_items ? JSON.parse(userData.equipped_items) : {};

    return await partyRedis.acceptInvite(partyId, userId, userName, {
        level: userData?.level || 1,
        equippedFrame: equipped.frame,
        equippedTitle: equipped.title,
    });
}

/**
 * Decline a party invite
 */
export async function declinePartyInvite(partyId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;

    return await partyRedis.declineInvite(partyId, userId);
}

// =============================================================================
// PARTY SETTINGS
// =============================================================================

/**
 * Transfer leadership to another member
 */
export async function transferPartyLeadership(newLeaderId: string): Promise<{
    success: boolean;
    newLeaderName?: string;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.transferLeadership(partyId, userId, newLeaderId);
}

/**
 * Link party to a persistent team
 */
export async function linkPartyToTeam(teamId: string | null): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    // Get team info from SQLite if linking
    let teamName: string | undefined;
    let teamTag: string | undefined;
    
    if (teamId) {
        const db = getDatabase();
        const team = db.prepare(`SELECT name, tag FROM teams WHERE id = ?`).get(teamId) as { name: string; tag?: string | null } | undefined;
        if (!team) {
            return { success: false, error: 'Team not found' };
        }
        
        // Verify user is a member of the team
        const membership = db.prepare(`
            SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
        `).get(teamId, userId);
        
        if (!membership) {
            return { success: false, error: 'You are not a member of this team' };
        }
        
        teamName = team.name;
        teamTag = team.tag;
    }

    return await partyRedis.linkToTeam(partyId, userId, teamId, teamName, teamTag);
}

/**
 * Set target mode (5v5, 3v3, etc.)
 */
export async function setPartyTargetMode(mode: '5v5' | '3v3' | '2v2' | null): Promise<{
    success: boolean;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const partyId = await partyRedis.getUserParty(userId);

    if (!partyId) {
        return { success: false, error: 'Not in a party' };
    }

    return await partyRedis.setTargetMode(partyId, userId, mode);
}

