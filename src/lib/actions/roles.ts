"use server";

import { auth } from "@/auth";
import { getDatabase, generateId, now, type UserRow } from "@/lib/db";
import { Role, Permission, hasPermission, canManageRole, parseRole, ROLE_HIERARCHY } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

/**
 * Get the current user's role
 */
export async function getCurrentUserRole(): Promise<Role> {
    const session = await auth();
    if (!session?.user) return Role.USER;

    const db = getDatabase();
    // Use SELECT * to handle databases without role column
    const user = db.prepare('SELECT * FROM users WHERE id = ?')
        .get((session.user as { id: string }).id) as UserRow | undefined;

    if (!user) return Role.USER;
    return parseRole(user.role, !!user.is_admin);
}

/**
 * Check if current user has a specific permission
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
    const role = await getCurrentUserRole();
    return hasPermission(role, permission);
}

/**
 * Change a user's role
 */
export async function changeUserRole(
    targetUserId: string,
    newRole: Role
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const currentUserId = (session.user as { id: string }).id;
    const db = getDatabase();

    // Get current user's role (SELECT * to handle missing role column)
    const currentUser = db.prepare('SELECT * FROM users WHERE id = ?')
        .get(currentUserId) as UserRow | undefined;
    if (!currentUser) return { success: false, error: "User not found" };

    const currentUserRole = parseRole(currentUser.role, !!currentUser.is_admin);

    // Get target user's current role
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?')
        .get(targetUserId) as UserRow | undefined;
    if (!targetUser) return { success: false, error: "Target user not found" };

    const targetUserRole = parseRole(targetUser.role, !!targetUser.is_admin);

    // Cannot change own role
    if (currentUserId === targetUserId) {
        return { success: false, error: "Cannot change your own role" };
    }

    // Check if current user can manage the target user's current role
    if (!canManageRole(currentUserRole, targetUserRole)) {
        return { success: false, error: "Insufficient permissions to manage this user" };
    }

    // Check if current user can assign the new role
    if (!canManageRole(currentUserRole, newRole) && newRole !== Role.USER) {
        return { success: false, error: "Cannot assign a role equal to or higher than your own" };
    }

    // Check specific permissions
    if (newRole === Role.ADMIN && !hasPermission(currentUserRole, Permission.PROMOTE_TO_ADMIN)) {
        return { success: false, error: "No permission to promote to Admin" };
    }
    if (newRole === Role.MODERATOR && !hasPermission(currentUserRole, Permission.PROMOTE_TO_MODERATOR)) {
        return { success: false, error: "No permission to promote to Moderator" };
    }
    if (targetUserRole === Role.ADMIN && newRole !== Role.ADMIN && !hasPermission(currentUserRole, Permission.DEMOTE_FROM_ADMIN)) {
        return { success: false, error: "No permission to demote Admin" };
    }
    if (targetUserRole === Role.MODERATOR && newRole !== Role.MODERATOR && !hasPermission(currentUserRole, Permission.DEMOTE_FROM_MODERATOR)) {
        return { success: false, error: "No permission to demote Moderator" };
    }

    // Update the role
    db.prepare('UPDATE users SET role = ?, is_admin = ? WHERE id = ?')
        .run(
            newRole,
            newRole === Role.SUPER_ADMIN || newRole === Role.ADMIN ? 1 : 0,
            targetUserId
        );

    console.log(`[RBAC] User ${currentUserId} changed role of ${targetUserId} from ${targetUserRole} to ${newRole}`);

    revalidatePath('/admin');
    return { success: true };
}

/**
 * Get all users with their roles (for admin panel)
 */
export async function getUsersWithRoles(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    role: Role;
    is_banned: boolean;
    created_at: string;
}>> {
    const hasAccess = await checkPermission(Permission.VIEW_USERS);
    if (!hasAccess) return [];

    const db = getDatabase();
    // Use SELECT * to handle databases without role column
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC')
        .all() as UserRow[];

    return users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: parseRole(user.role, !!user.is_admin),
        is_banned: !!user.is_banned,
        created_at: user.created_at
    }));
}

/**
 * Log role change to security activity
 */
async function logRoleChange(
    actorId: string,
    targetUserId: string,
    oldRole: Role,
    newRole: Role
) {
    const db = getDatabase();
    db.prepare(`
        INSERT INTO security_activity (id, user_id, action, details, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        generateId(),
        targetUserId,
        'role_change',
        JSON.stringify({
            changed_by: actorId,
            old_role: oldRole,
            new_role: newRole
        }),
        now()
    );
}
