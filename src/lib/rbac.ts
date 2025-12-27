/**
 * FlashMath Role-Based Access Control (RBAC) System
 * Defines roles, permissions, and hierarchy
 */

export enum Role {
    USER = 'user',
    MODERATOR = 'moderator',
    ADMIN = 'admin',
    SUPER_ADMIN = 'super_admin'
}

export const ROLE_HIERARCHY: Record<Role, number> = {
    [Role.USER]: 0,
    [Role.MODERATOR]: 1,
    [Role.ADMIN]: 2,
    [Role.SUPER_ADMIN]: 3
};

export const ROLE_LABELS: Record<Role, string> = {
    [Role.USER]: 'User',
    [Role.MODERATOR]: 'Moderator',
    [Role.ADMIN]: 'Platform Admin',
    [Role.SUPER_ADMIN]: 'Super Admin'
};

export const ROLE_COLORS: Record<Role, string> = {
    [Role.USER]: 'text-zinc-400 bg-zinc-500/10',
    [Role.MODERATOR]: 'text-blue-400 bg-blue-500/10',
    [Role.ADMIN]: 'text-purple-400 bg-purple-500/10',
    [Role.SUPER_ADMIN]: 'text-amber-400 bg-amber-500/10'
};

// Permissions for each role
export enum Permission {
    // User Management
    VIEW_USERS = 'view_users',
    BAN_USERS = 'ban_users',
    UNBAN_USERS = 'unban_users',
    PROMOTE_TO_MODERATOR = 'promote_to_moderator',
    DEMOTE_FROM_MODERATOR = 'demote_from_moderator',
    PROMOTE_TO_ADMIN = 'promote_to_admin',
    DEMOTE_FROM_ADMIN = 'demote_from_admin',

    // Content Management
    EDIT_SHOP_ITEMS = 'edit_shop_items',
    SEED_DATABASE = 'seed_database',

    // System
    VIEW_ADMIN_CONSOLE = 'view_admin_console',
    GIVE_COINS_XP = 'give_coins_xp',
    RESET_USER_DATA = 'reset_user_data',
    DELETE_USERS = 'delete_users',

    // Analytics
    VIEW_ANALYTICS = 'view_analytics',
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    [Role.USER]: [],

    [Role.MODERATOR]: [
        Permission.VIEW_ADMIN_CONSOLE,
        Permission.VIEW_USERS,
        Permission.BAN_USERS,
        Permission.UNBAN_USERS,
        Permission.VIEW_ANALYTICS,
    ],

    [Role.ADMIN]: [
        Permission.VIEW_ADMIN_CONSOLE,
        Permission.VIEW_USERS,
        Permission.BAN_USERS,
        Permission.UNBAN_USERS,
        Permission.PROMOTE_TO_MODERATOR,
        Permission.DEMOTE_FROM_MODERATOR,
        Permission.EDIT_SHOP_ITEMS,
        Permission.GIVE_COINS_XP,
        Permission.VIEW_ANALYTICS,
    ],

    [Role.SUPER_ADMIN]: [
        // Super admin has ALL permissions
        ...Object.values(Permission)
    ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if roleA can manage roleB (promote/demote)
 * A role can only manage roles below it in the hierarchy
 */
export function canManageRole(managerRole: Role, targetRole: Role): boolean {
    return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Get all roles that a user can promote others to
 */
export function getPromotableRoles(managerRole: Role): Role[] {
    const managerLevel = ROLE_HIERARCHY[managerRole];
    return Object.entries(ROLE_HIERARCHY)
        .filter(([_, level]) => level < managerLevel && level > 0) // Exclude USER and roles at/above manager
        .map(([role, _]) => role as Role);
}

/**
 * Get all assignable roles for a manager (including User for demotion)
 */
export function getAssignableRoles(managerRole: Role): Role[] {
    const managerLevel = ROLE_HIERARCHY[managerRole];
    return Object.entries(ROLE_HIERARCHY)
        .filter(([_, level]) => level < managerLevel)
        .map(([role, _]) => role as Role);
}

/**
 * Parse role from database (handle legacy is_admin field)
 */
export function parseRole(role: string | null | undefined, isAdmin?: boolean): Role {
    if (role && Object.values(Role).includes(role as Role)) {
        return role as Role;
    }
    // Legacy fallback: check is_admin flag
    if (isAdmin) {
        return Role.SUPER_ADMIN;
    }
    return Role.USER;
}
