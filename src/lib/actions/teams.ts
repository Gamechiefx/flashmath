'use server';

/**
 * FlashMath Arena Teams System - Server Actions
 * Handles persistent teams, team ELO, membership, and team match results
 */

import { auth } from "@/auth";
import { getDatabase, generateId, now } from "@/lib/db/sqlite";

// =============================================================================
// TYPES
// =============================================================================

export interface Team {
    id: string;
    name: string;
    tag: string | null;
    createdBy: string;
    createdAt: string;
    teamWins: number;
    teamLosses: number;
    teamWinStreak: number;
    teamBestWinStreak: number;
}

export interface TeamWithElo extends Team {
    elo5v5: number;
    elo5v5Addition: number;
    elo5v5Subtraction: number;
    elo5v5Multiplication: number;
    elo5v5Division: number;
}

export interface TeamMember {
    id: string;
    odUserId: string;
    odName: string;
    odLevel: number;
    odEquippedFrame: string | null;
    odEquippedTitle: string | null;
    role: 'captain' | 'igl' | 'member';
    primaryOperation: string | null;
    joinedAt: string;
    // Individual arena stats
    odElo5v5: number;
    odElo5v5Addition: number;
    odElo5v5Subtraction: number;
    odElo5v5Multiplication: number;
    odElo5v5Division: number;
}

export interface TeamInvite {
    id: string;
    teamId: string;
    teamName: string;
    teamTag: string | null;
    inviterName: string;
    inviterId: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface TeamWithMembers extends TeamWithElo {
    members: TeamMember[];
    memberCount: number;
    isCurrentUserMember: boolean;
    isCurrentUserCaptain: boolean;
}

export interface TeamLeaderboardEntry {
    rank: number;
    odTeamId: string;
    odTeamName: string;
    odTeamTag: string | null;
    odElo: number;
    odWins: number;
    odLosses: number;
    odWinRate: number;
    odStreak: number;
    odBestStreak: number;
    odMemberCount: number;
    odIsCurrentUserTeam: boolean;
}

// Valid operations for ELO tracking
const VALID_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division'] as const;
type Operation = typeof VALID_OPERATIONS[number];

// =============================================================================
// TEAM CRUD OPERATIONS
// =============================================================================

/**
 * Create a new persistent team
 */
export async function createTeam(
    name: string,
    tag?: string
): Promise<{ teamId: string } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Validate name
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 32) {
        return { error: 'Team name must be between 3 and 32 characters' };
    }

    // Validate tag if provided
    const trimmedTag = tag?.trim().toUpperCase() || null;
    if (trimmedTag && (trimmedTag.length < 2 || trimmedTag.length > 4)) {
        return { error: 'Team tag must be between 2 and 4 characters' };
    }

    // Check if user is already captain of another team
    const existingCaptaincy = db.prepare(`
        SELECT t.id, t.name FROM teams t
        WHERE t.created_by = ?
    `).get(userId) as { id: string; name: string } | undefined;

    if (existingCaptaincy) {
        return { error: `You are already captain of team "${existingCaptaincy.name}"` };
    }

    // Check if name is taken
    const existingName = db.prepare(`
        SELECT id FROM teams WHERE LOWER(name) = LOWER(?)
    `).get(trimmedName);

    if (existingName) {
        return { error: 'Team name is already taken' };
    }

    // Check if tag is taken (if provided)
    if (trimmedTag) {
        const existingTag = db.prepare(`
            SELECT id FROM teams WHERE UPPER(tag) = ?
        `).get(trimmedTag);

        if (existingTag) {
            return { error: 'Team tag is already taken' };
        }
    }

    const teamId = generateId();
    const timestamp = now();

    // Create team
    db.prepare(`
        INSERT INTO teams (id, name, tag, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(teamId, trimmedName, trimmedTag, userId, timestamp);

    // Create team ELO record with defaults
    db.prepare(`
        INSERT INTO team_elo (team_id)
        VALUES (?)
    `).run(teamId);

    // Add creator as captain and first member
    const memberId = generateId();
    db.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, joined_at)
        VALUES (?, ?, ?, 'captain', ?)
    `).run(memberId, teamId, userId, timestamp);

    return { teamId };
}

/**
 * Disband (delete) a team - captain only
 */
export async function disbandTeam(
    teamId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Verify user is captain
    const team = db.prepare(`
        SELECT id, created_by FROM teams WHERE id = ?
    `).get(teamId) as { id: string; created_by: string } | undefined;

    if (!team) {
        return { error: 'Team not found' };
    }

    if (team.created_by !== userId) {
        return { error: 'Only the team captain can disband the team' };
    }

    // Delete team (cascades to team_elo, team_members, team_invites)
    db.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId);

    return { success: true };
}

/**
 * Get a team by ID with all members
 */
export async function getTeam(
    teamId: string
): Promise<TeamWithMembers | null> {
    const session = await auth();
    const currentUserId = session?.user?.id || null;

    const db = getDatabase();

    // Get team with ELO
    const team = db.prepare(`
        SELECT 
            t.id, t.name, t.tag, t.created_by, t.created_at,
            t.team_wins, t.team_losses, t.team_win_streak, t.team_best_win_streak,
            e.elo_5v5, e.elo_5v5_addition, e.elo_5v5_subtraction,
            e.elo_5v5_multiplication, e.elo_5v5_division
        FROM teams t
        LEFT JOIN team_elo e ON e.team_id = t.id
        WHERE t.id = ?
    `).get(teamId) as {
        id: string;
        name: string;
        tag?: string | null;
        created_by: string;
        team_wins?: number;
        team_losses?: number;
        team_win_streak?: number;
        team_best_win_streak?: number;
        elo_5v5?: number;
        elo_5v5_addition?: number;
        elo_5v5_subtraction?: number;
        elo_5v5_multiplication?: number;
        elo_5v5_division?: number;
        [key: string]: unknown;
    } | undefined;

    if (!team) {
        return null;
    }

    // Get members
    const members = db.prepare(`
        SELECT 
            tm.id, tm.user_id, tm.role, tm.primary_operation, tm.joined_at,
            u.name, u.level, u.equipped_items,
            u.arena_elo_5v5, u.arena_elo_5v5_addition, u.arena_elo_5v5_subtraction,
            u.arena_elo_5v5_multiplication, u.arena_elo_5v5_division
        FROM team_members tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ?
        ORDER BY 
            CASE tm.role WHEN 'captain' THEN 0 WHEN 'igl' THEN 1 ELSE 2 END,
            tm.joined_at ASC
    `).all(teamId) as Array<{
        id: string;
        user_id: string;
        role?: string;
        primary_operation?: string | null;
        joined_at?: string;
        name: string;
        level?: number;
        equipped_items?: string | null;
        arena_elo_5v5?: number;
        arena_elo_5v5_addition?: number;
        arena_elo_5v5_subtraction?: number;
        arena_elo_5v5_multiplication?: number;
        arena_elo_5v5_division?: number;
        [key: string]: unknown;
    }>;

    const memberList: TeamMember[] = members.map(m => {
        const equipped = m.equipped_items ? JSON.parse(m.equipped_items) : {};
        return {
            id: m.id,
            odUserId: m.user_id,
            odName: m.name,
            odLevel: m.level,
            odEquippedFrame: equipped.frame || null,
            odEquippedTitle: equipped.title || null,
            role: m.role,
            primaryOperation: m.primary_operation,
            joinedAt: m.joined_at,
            odElo5v5: m.arena_elo_5v5 || 300,
            odElo5v5Addition: m.arena_elo_5v5_addition || 300,
            odElo5v5Subtraction: m.arena_elo_5v5_subtraction || 300,
            odElo5v5Multiplication: m.arena_elo_5v5_multiplication || 300,
            odElo5v5Division: m.arena_elo_5v5_division || 300,
        };
    });

    const isCurrentUserMember = currentUserId 
        ? memberList.some(m => m.odUserId === currentUserId)
        : false;
    const isCurrentUserCaptain = currentUserId === team.created_by;

    return {
        id: team.id,
        name: team.name,
        tag: team.tag,
        createdBy: team.created_by,
        createdAt: team.created_at,
        teamWins: team.team_wins || 0,
        teamLosses: team.team_losses || 0,
        teamWinStreak: team.team_win_streak || 0,
        teamBestWinStreak: team.team_best_win_streak || 0,
        elo5v5: team.elo_5v5 || 300,
        elo5v5Addition: team.elo_5v5_addition || 300,
        elo5v5Subtraction: team.elo_5v5_subtraction || 300,
        elo5v5Multiplication: team.elo_5v5_multiplication || 300,
        elo5v5Division: team.elo_5v5_division || 300,
        members: memberList,
        memberCount: memberList.length,
        isCurrentUserMember,
        isCurrentUserCaptain,
    };
}

/**
 * Get all teams a user is a member of
 */
export async function getUserTeams(
    userId?: string
): Promise<TeamWithElo[]> {
    const session = await auth();
    const targetUserId = userId || session?.user?.id;

    if (!targetUserId) {
        return [];
    }

    const db = getDatabase();

    const teams = db.prepare(`
        SELECT 
            t.id, t.name, t.tag, t.created_by, t.created_at,
            t.team_wins, t.team_losses, t.team_win_streak, t.team_best_win_streak,
            e.elo_5v5, e.elo_5v5_addition, e.elo_5v5_subtraction,
            e.elo_5v5_multiplication, e.elo_5v5_division
        FROM teams t
        LEFT JOIN team_elo e ON e.team_id = t.id
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY t.team_wins DESC
    `).all(targetUserId) as Array<{
        id: string;
        name: string;
        team_wins?: number;
        team_losses?: number;
        [key: string]: unknown;
    }>;

    return teams.map(t => ({
        id: t.id,
        name: t.name,
        tag: t.tag,
        createdBy: t.created_by,
        createdAt: t.created_at,
        teamWins: t.team_wins || 0,
        teamLosses: t.team_losses || 0,
        teamWinStreak: t.team_win_streak || 0,
        teamBestWinStreak: t.team_best_win_streak || 0,
        elo5v5: t.elo_5v5 || 300,
        elo5v5Addition: t.elo_5v5_addition || 300,
        elo5v5Subtraction: t.elo_5v5_subtraction || 300,
        elo5v5Multiplication: t.elo_5v5_multiplication || 300,
        elo5v5Division: t.elo_5v5_division || 300,
    }));
}

// =============================================================================
// TEAM MEMBERSHIP
// =============================================================================

/**
 * Invite a user to join the team
 */
export async function inviteToTeam(
    teamId: string,
    inviteeId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Check if inviter is a member with invite permissions (captain or igl)
    const inviterMember = db.prepare(`
        SELECT role FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, userId) as { role: string } | undefined;

    if (!inviterMember) {
        return { error: 'You are not a member of this team' };
    }

    if (inviterMember.role === 'member') {
        return { error: 'Only captains and IGLs can invite new members' };
    }

    // Check if invitee is already a member
    const existingMember = db.prepare(`
        SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, inviteeId);

    if (existingMember) {
        return { error: 'User is already a member of this team' };
    }

    // Check for existing pending invite
    const existingInvite = db.prepare(`
        SELECT id FROM team_invites 
        WHERE team_id = ? AND invitee_id = ? AND status = 'pending'
    `).get(teamId, inviteeId);

    if (existingInvite) {
        return { error: 'User already has a pending invite' };
    }

    // Check team size (max 10 members per team)
    const memberCount = db.prepare(`
        SELECT COUNT(*) as count FROM team_members WHERE team_id = ?
    `).get(teamId) as { count: number };

    if (memberCount.count >= 10) {
        return { error: 'Team is at maximum capacity (10 members)' };
    }

    // Create invite (expires in 7 days)
    const inviteId = generateId();
    const timestamp = now();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO team_invites (id, team_id, inviter_id, invitee_id, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(inviteId, teamId, userId, inviteeId, timestamp, expiresAt);

    return { success: true };
}

/**
 * Accept a team invite
 */
export async function acceptTeamInvite(
    inviteId: string
): Promise<{ success: boolean; teamId: string } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Get invite
    const invite = db.prepare(`
        SELECT id, team_id, invitee_id, expires_at, status
        FROM team_invites WHERE id = ?
    `).get(inviteId) as {
        id: string;
        team_id: string;
        invitee_id: string;
        expires_at?: string | null;
        status?: string;
        [key: string]: unknown;
    } | undefined;

    if (!invite) {
        return { error: 'Invite not found' };
    }

    if (invite.invitee_id !== userId) {
        return { error: 'This invite is not for you' };
    }

    if (invite.status !== 'pending') {
        return { error: 'Invite is no longer pending' };
    }

    if (new Date(invite.expires_at) < new Date()) {
        db.prepare(`UPDATE team_invites SET status = 'expired' WHERE id = ?`).run(inviteId);
        return { error: 'Invite has expired' };
    }

    // Check team still exists and has space
    const memberCount = db.prepare(`
        SELECT COUNT(*) as count FROM team_members WHERE team_id = ?
    `).get(invite.team_id) as { count: number };

    if (memberCount.count >= 10) {
        return { error: 'Team is at maximum capacity' };
    }

    const timestamp = now();

    // Add as member
    const memberId = generateId();
    db.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, joined_at)
        VALUES (?, ?, ?, 'member', ?)
    `).run(memberId, invite.team_id, userId, timestamp);

    // Mark invite as accepted
    db.prepare(`UPDATE team_invites SET status = 'accepted' WHERE id = ?`).run(inviteId);

    return { success: true, teamId: invite.team_id };
}

/**
 * Decline a team invite
 */
export async function declineTeamInvite(
    inviteId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Database query result
    const invite = (db.prepare(`
        SELECT id, invitee_id, status FROM team_invites WHERE id = ?
    `).get(inviteId) as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Database query result

    if (!invite) {
        return { error: 'Invite not found' };
    }

    if (invite.invitee_id !== userId) {
        return { error: 'This invite is not for you' };
    }

    if (invite.status !== 'pending') {
        return { error: 'Invite is no longer pending' };
    }

    db.prepare(`UPDATE team_invites SET status = 'declined' WHERE id = ?`).run(inviteId);

    return { success: true };
}

/**
 * Get pending team invites for current user
 */
export async function getTeamInvites(): Promise<TeamInvite[]> {
    const session = await auth();
    if (!session?.user?.id) {
        return [];
    }

    const db = getDatabase();

    const invites = db.prepare(`
        SELECT 
            ti.id, ti.team_id, ti.inviter_id, ti.status, ti.created_at, ti.expires_at,
            t.name as team_name, t.tag as team_tag,
            u.name as inviter_name
        FROM team_invites ti
        JOIN teams t ON t.id = ti.team_id
        JOIN users u ON u.id = ti.inviter_id
        WHERE ti.invitee_id = ? AND ti.status = 'pending'
        ORDER BY ti.created_at DESC
    `).all(session.user.id) as Array<{
        id: string;
        team_id: string;
        inviter_id: string;
        created_at?: string;
        team_name?: string;
        inviter_name?: string;
        [key: string]: unknown;
    }>;

    return invites.map(i => ({
        id: i.id,
        teamId: i.team_id,
        teamName: i.team_name,
        teamTag: i.team_tag,
        inviterName: i.inviter_name,
        inviterId: i.inviter_id,
        status: i.status,
        createdAt: i.created_at,
        expiresAt: i.expires_at,
    }));
}

/**
 * Leave a team
 */
export async function leaveTeam(
    teamId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Check membership
    const member = db.prepare(`
        SELECT id, role FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, userId) as { id: string; role: string } | undefined;

    if (!member) {
        return { error: 'You are not a member of this team' };
    }

    if (member.role === 'captain') {
        // Captain must transfer ownership or disband
        const otherMembers = db.prepare(`
            SELECT COUNT(*) as count FROM team_members WHERE team_id = ? AND user_id != ?
        `).get(teamId, userId) as { count: number };

        if (otherMembers.count > 0) {
            return { error: 'Transfer captaincy to another member before leaving, or disband the team' };
        }

        // No other members, disband the team
        db.prepare(`DELETE FROM teams WHERE id = ?`).run(teamId);
        return { success: true };
    }

    // Remove member
    db.prepare(`DELETE FROM team_members WHERE id = ?`).run(member.id);

    return { success: true };
}

/**
 * Remove a member from the team (captain only)
 */
export async function removeMember(
    teamId: string,
    memberId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Verify requester is captain
    const team = db.prepare(`
        SELECT created_by FROM teams WHERE id = ?
    `).get(teamId) as { created_by: string } | undefined;

    if (!team) {
        return { error: 'Team not found' };
    }

    if (team.created_by !== userId) {
        return { error: 'Only the team captain can remove members' };
    }

    if (memberId === userId) {
        return { error: 'Captain cannot remove themselves' };
    }

    // Remove member
    const result = db.prepare(`
        DELETE FROM team_members WHERE team_id = ? AND user_id = ?
    `).run(teamId, memberId);

    if (result.changes === 0) {
        return { error: 'Member not found' };
    }

    return { success: true };
}

/**
 * Set a member's role (captain only)
 */
export async function setMemberRole(
    teamId: string,
    memberId: string,
    role: 'igl' | 'member'
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Verify requester is captain
    const team = db.prepare(`
        SELECT created_by FROM teams WHERE id = ?
    `).get(teamId) as { created_by: string } | undefined;

    if (!team) {
        return { error: 'Team not found' };
    }

    if (team.created_by !== userId) {
        return { error: 'Only the team captain can change roles' };
    }

    if (memberId === userId) {
        return { error: 'Captain cannot change their own role' };
    }

    // Update role
    const result = db.prepare(`
        UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?
    `).run(role, teamId, memberId);

    if (result.changes === 0) {
        return { error: 'Member not found' };
    }

    return { success: true };
}

/**
 * Transfer captaincy to another member
 */
export async function transferCaptaincy(
    teamId: string,
    newCaptainId: string
): Promise<{ success: boolean } | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    // Verify requester is captain
    const team = db.prepare(`
        SELECT id, created_by FROM teams WHERE id = ?
    `).get(teamId) as { id: string; created_by: string } | undefined;

    if (!team) {
        return { error: 'Team not found' };
    }

    if (team.created_by !== userId) {
        return { error: 'Only the team captain can transfer captaincy' };
    }

    if (newCaptainId === userId) {
        return { error: 'You are already the captain' };
    }

    // Verify new captain is a member
    const newCaptainMember = db.prepare(`
        SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, newCaptainId);

    if (!newCaptainMember) {
        return { error: 'User is not a member of this team' };
    }

    // Transfer captaincy
    db.prepare(`UPDATE teams SET created_by = ? WHERE id = ?`).run(newCaptainId, teamId);
    db.prepare(`UPDATE team_members SET role = 'captain' WHERE team_id = ? AND user_id = ?`).run(teamId, newCaptainId);
    db.prepare(`UPDATE team_members SET role = 'member' WHERE team_id = ? AND user_id = ?`).run(teamId, userId);

    return { success: true };
}

// =============================================================================
// TEAM ELO MANAGEMENT
// =============================================================================

/**
 * Get team ELO for a specific operation
 */
export async function getTeamElo(
    teamId: string,
    operation: string = 'overall'
): Promise<number> {
    const db = getDatabase();

    const elo = db.prepare(`
        SELECT 
            elo_5v5, elo_5v5_addition, elo_5v5_subtraction,
            elo_5v5_multiplication, elo_5v5_division
        FROM team_elo WHERE team_id = ?
    `).get(teamId) as {
        elo_5v5?: number;
        elo_5v5_addition?: number;
        elo_5v5_subtraction?: number;
        elo_5v5_multiplication?: number;
        elo_5v5_division?: number;
    } | undefined;

    if (!elo) {
        return 300; // Default ELO
    }

    switch (operation) {
        case 'addition':
            return elo.elo_5v5_addition || 300;
        case 'subtraction':
            return elo.elo_5v5_subtraction || 300;
        case 'multiplication':
            return elo.elo_5v5_multiplication || 300;
        case 'division':
            return elo.elo_5v5_division || 300;
        default:
            return elo.elo_5v5 || 300;
    }
}

/**
 * Update team ELO after a match
 * Also updates the overall 5v5 ELO (average of all operations)
 */
export async function updateTeamElo(
    teamId: string,
    operation: string,
    change: number
): Promise<void> {
    const db = getDatabase();

    // Determine column to update
    let column: string;
    switch (operation) {
        case 'addition':
            column = 'elo_5v5_addition';
            break;
        case 'subtraction':
            column = 'elo_5v5_subtraction';
            break;
        case 'multiplication':
            column = 'elo_5v5_multiplication';
            break;
        case 'division':
            column = 'elo_5v5_division';
            break;
        default:
            return; // Invalid operation
    }

    // Update the operation-specific ELO
    db.prepare(`
        UPDATE team_elo 
        SET ${column} = MAX(100, ${column} + ?)
        WHERE team_id = ?
    `).run(change, teamId);

    // Recalculate overall 5v5 ELO (average of all operations)
    db.prepare(`
        UPDATE team_elo 
        SET elo_5v5 = (
            elo_5v5_addition + elo_5v5_subtraction + 
            elo_5v5_multiplication + elo_5v5_division
        ) / 4
        WHERE team_id = ?
    `).run(teamId);
}

/**
 * Calculate average ELO for a set of values
 */
function calculateAverageElo(elos: Record<string, number>): number {
    const values = Object.values(elos).filter(v => v > 0);
    if (values.length === 0) return 300;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Update team stats after a match (wins, losses, streaks)
 */
export async function updateTeamStats(
    teamId: string,
    won: boolean
): Promise<void> {
    const db = getDatabase();

    if (won) {
        db.prepare(`
            UPDATE teams SET 
                team_wins = team_wins + 1,
                team_win_streak = team_win_streak + 1,
                team_best_win_streak = MAX(team_best_win_streak, team_win_streak + 1)
            WHERE id = ?
        `).run(teamId);
    } else {
        db.prepare(`
            UPDATE teams SET 
                team_losses = team_losses + 1,
                team_win_streak = 0
            WHERE id = ?
        `).run(teamId);
    }
}

/**
 * Update individual user's team mode ELO (50% of team change)
 */
export async function updateUserTeamElo(
    userId: string,
    mode: string,
    operation: string,
    change: number
): Promise<void> {
    const db = getDatabase();

    // Calculate 50% change for individuals
    const individualChange = Math.round(change * 0.5);

    // Determine column to update
    let column: string;
    switch (operation) {
        case 'addition':
            column = `arena_elo_${mode}_addition`;
            break;
        case 'subtraction':
            column = `arena_elo_${mode}_subtraction`;
            break;
        case 'multiplication':
            column = `arena_elo_${mode}_multiplication`;
            break;
        case 'division':
            column = `arena_elo_${mode}_division`;
            break;
        default:
            return; // Invalid operation
    }

    // Update the operation-specific ELO
    db.prepare(`
        UPDATE users 
        SET ${column} = MAX(100, ${column} + ?)
        WHERE id = ?
    `).run(individualChange, userId);

    // Recalculate overall mode ELO (average of all operations)
    const avgColumn = `arena_elo_${mode}`;
    db.prepare(`
        UPDATE users 
        SET ${avgColumn} = (
            arena_elo_${mode}_addition + arena_elo_${mode}_subtraction + 
            arena_elo_${mode}_multiplication + arena_elo_${mode}_division
        ) / 4
        WHERE id = ?
    `).run(userId);

    // Recalculate overall team ELO (average of all modes)
    db.prepare(`
        UPDATE users 
        SET arena_elo_team = (
            arena_elo_2v2 + arena_elo_3v3 + arena_elo_4v4 + arena_elo_5v5
        ) / 4
        WHERE id = ?
    `).run(userId);
}

/**
 * Update individual user's team stats (wins, losses, streaks)
 */
export async function updateUserTeamStats(
    userId: string,
    won: boolean
): Promise<void> {
    const db = getDatabase();

    if (won) {
        db.prepare(`
            UPDATE users SET 
                arena_team_wins = arena_team_wins + 1,
                arena_team_win_streak = arena_team_win_streak + 1,
                arena_team_best_win_streak = MAX(arena_team_best_win_streak, arena_team_win_streak + 1)
            WHERE id = ?
        `).run(userId);
    } else {
        db.prepare(`
            UPDATE users SET 
                arena_team_losses = arena_team_losses + 1,
                arena_team_win_streak = 0
            WHERE id = ?
        `).run(userId);
    }
}

// =============================================================================
// TEAM MATCH RECORDING
// =============================================================================

export interface SaveTeamMatchParams {
    matchId: string;
    team1Id: string;
    team2Id: string;
    team1Score: number;
    team2Score: number;
    winnerTeamId: string | null;  // null for draw
    operation: string;
    matchType: 'ranked' | 'casual';
    roundScores?: { round: number; team1: number; team2: number }[];
    matchDurationMs?: number;
    connectionQuality?: 'GREEN' | 'YELLOW' | 'RED';
    playerStats: {
        odUserId: string;
        odTeamId: string;
        operationSlot: string;
        questionsAttempted: number;
        questionsCorrect: number;
        avgSpeedMs: number;
        maxStreak: number;
        wasIgl: boolean;
        wasAnchor: boolean;
        usedDoubleCallin?: boolean;
        usedAnchorSolo?: boolean;
    }[];
}

/**
 * Save team match result and update ELOs
 */
export async function saveTeamMatchResult(
    params: SaveTeamMatchParams
): Promise<{ success: boolean; team1EloChange: number; team2EloChange: number } | { error: string }> {
    const db = getDatabase();

    // Get team ELOs
    const team1Elo = await getTeamElo(params.team1Id, params.operation);
    const team2Elo = await getTeamElo(params.team2Id, params.operation);

    // Calculate ELO changes (only for ranked)
    let team1EloChange = 0;
    let team2EloChange = 0;

    if (params.matchType === 'ranked' && params.winnerTeamId) {
        const K = 32; // K-factor
        const expectedTeam1 = 1 / (1 + Math.pow(10, (team2Elo - team1Elo) / 400));
        const expectedTeam2 = 1 / (1 + Math.pow(10, (team1Elo - team2Elo) / 400));

        const team1Won = params.winnerTeamId === params.team1Id;
        const actualTeam1 = team1Won ? 1 : 0;
        const actualTeam2 = team1Won ? 0 : 1;

        team1EloChange = Math.round(K * (actualTeam1 - expectedTeam1));
        team2EloChange = Math.round(K * (actualTeam2 - expectedTeam2));
    }

    const timestamp = now();

    // Insert team match record
    db.prepare(`
        INSERT INTO team_matches (
            id, team1_id, team2_id, team1_score, team2_score, winner_team_id,
            mode, match_type, operation,
            team1_elo_before, team2_elo_before, team1_elo_change, team2_elo_change,
            connection_quality, round_scores, match_duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, '5v5', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        params.matchId,
        params.team1Id,
        params.team2Id,
        params.team1Score,
        params.team2Score,
        params.winnerTeamId,
        params.matchType,
        params.operation,
        team1Elo,
        team2Elo,
        team1EloChange,
        team2EloChange,
        params.connectionQuality || 'GREEN',
        params.roundScores ? JSON.stringify(params.roundScores) : null,
        params.matchDurationMs || null,
        timestamp
    );

    // Insert player stats
    for (const player of params.playerStats) {
        const accuracy = player.questionsAttempted > 0 
            ? player.questionsCorrect / player.questionsAttempted 
            : 0;
        
        const contribution = params.team1Score + params.team2Score > 0
            ? (player.odTeamId === params.team1Id ? params.team1Score : params.team2Score) > 0
                ? (player.questionsCorrect * 100) / (player.odTeamId === params.team1Id ? params.team1Score : params.team2Score)
                : 0
            : 0;

        // Calculate individual ELO change (50% of team change)
        const teamChange = player.odTeamId === params.team1Id ? team1EloChange : team2EloChange;
        const individualEloChange = Math.round(teamChange * 0.5);

        const playerId = generateId();
        db.prepare(`
            INSERT INTO team_match_players (
                id, match_id, user_id, team_id, operation_slot,
                questions_attempted, questions_correct, accuracy, avg_speed_ms, max_streak,
                contribution_percent, individual_elo_change,
                was_igl, was_anchor, used_double_callin, used_anchor_solo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            playerId,
            params.matchId,
            player.odUserId,
            player.odTeamId,
            player.operationSlot,
            player.questionsAttempted,
            player.questionsCorrect,
            accuracy,
            player.avgSpeedMs,
            player.maxStreak,
            contribution,
            individualEloChange,
            player.wasIgl ? 1 : 0,
            player.wasAnchor ? 1 : 0,
            player.usedDoubleCallin ? 1 : 0,
            player.usedAnchorSolo ? 1 : 0
        );

        // Update individual user ELO and stats (only for ranked)
        if (params.matchType === 'ranked') {
            const playerWon = player.odTeamId === params.winnerTeamId;
            await updateUserTeamElo(player.odUserId, '5v5', params.operation, teamChange);
            await updateUserTeamStats(player.odUserId, playerWon);
        }
    }

    // Update team ELOs and stats (only for ranked)
    if (params.matchType === 'ranked') {
        await updateTeamElo(params.team1Id, params.operation, team1EloChange);
        await updateTeamElo(params.team2Id, params.operation, team2EloChange);
        
        if (params.winnerTeamId) {
            await updateTeamStats(params.team1Id, params.winnerTeamId === params.team1Id);
            await updateTeamStats(params.team2Id, params.winnerTeamId === params.team2Id);
        }
    }

    return { success: true, team1EloChange, team2EloChange };
}

// =============================================================================
// TEAM SEARCH
// =============================================================================

/**
 * Search for teams by name or tag
 */
export async function searchTeams(
    query: string,
    limit: number = 20
): Promise<TeamWithElo[]> {
    const db = getDatabase();
    const searchQuery = `%${query.trim()}%`;

    const teams = db.prepare(`
        SELECT 
            t.id, t.name, t.tag, t.created_by, t.created_at,
            t.team_wins, t.team_losses, t.team_win_streak, t.team_best_win_streak,
            e.elo_5v5, e.elo_5v5_addition, e.elo_5v5_subtraction,
            e.elo_5v5_multiplication, e.elo_5v5_division
        FROM teams t
        LEFT JOIN team_elo e ON e.team_id = t.id
        WHERE t.name LIKE ? OR t.tag LIKE ?
        ORDER BY t.team_wins DESC
        LIMIT ?
    `).all(searchQuery, searchQuery, limit) as Array<{
        id: string;
        name: string;
        tag?: string | null;
        team_wins?: number;
        team_losses?: number;
        elo_5v5?: number;
        [key: string]: unknown;
    }>;

    return teams.map(t => ({
        id: t.id,
        name: t.name,
        tag: t.tag,
        createdBy: t.created_by,
        createdAt: t.created_at,
        teamWins: t.team_wins || 0,
        teamLosses: t.team_losses || 0,
        teamWinStreak: t.team_win_streak || 0,
        teamBestWinStreak: t.team_best_win_streak || 0,
        elo5v5: t.elo_5v5 || 300,
        elo5v5Addition: t.elo_5v5_addition || 300,
        elo5v5Subtraction: t.elo_5v5_subtraction || 300,
        elo5v5Multiplication: t.elo_5v5_multiplication || 300,
        elo5v5Division: t.elo_5v5_division || 300,
    }));
}



