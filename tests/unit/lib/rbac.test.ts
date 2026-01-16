/**
 * RBAC (Role-Based Access Control) Tests
 * Tests for role permissions and hierarchy
 */

import { describe, it, expect } from 'vitest';
import {
    Role,
    ROLE_HIERARCHY,
    ROLE_LABELS,
    ROLE_COLORS,
    Permission,
    ROLE_PERMISSIONS,
    hasPermission,
    canManageRole,
    getPromotableRoles,
    getAssignableRoles,
    parseRole,
} from '@/lib/rbac';

describe('Role Constants', () => {
    it('should have all role types defined', () => {
        expect(Role.USER).toBe('user');
        expect(Role.MODERATOR).toBe('moderator');
        expect(Role.ADMIN).toBe('admin');
        expect(Role.SUPER_ADMIN).toBe('super_admin');
    });

    it('should have correct hierarchy levels', () => {
        expect(ROLE_HIERARCHY[Role.USER]).toBe(0);
        expect(ROLE_HIERARCHY[Role.MODERATOR]).toBe(1);
        expect(ROLE_HIERARCHY[Role.ADMIN]).toBe(2);
        expect(ROLE_HIERARCHY[Role.SUPER_ADMIN]).toBe(3);
    });

    it('should have labels for all roles', () => {
        expect(ROLE_LABELS[Role.USER]).toBe('User');
        expect(ROLE_LABELS[Role.MODERATOR]).toBe('Moderator');
        expect(ROLE_LABELS[Role.ADMIN]).toBe('Platform Admin');
        expect(ROLE_LABELS[Role.SUPER_ADMIN]).toBe('Super Admin');
    });

    it('should have color classes for all roles', () => {
        expect(ROLE_COLORS[Role.USER]).toContain('zinc');
        expect(ROLE_COLORS[Role.MODERATOR]).toContain('blue');
        expect(ROLE_COLORS[Role.ADMIN]).toContain('purple');
        expect(ROLE_COLORS[Role.SUPER_ADMIN]).toContain('amber');
    });
});

describe('Permission Constants', () => {
    it('should define user management permissions', () => {
        expect(Permission.VIEW_USERS).toBeDefined();
        expect(Permission.BAN_USERS).toBeDefined();
        expect(Permission.UNBAN_USERS).toBeDefined();
        expect(Permission.PROMOTE_TO_MODERATOR).toBeDefined();
    });

    it('should define content management permissions', () => {
        expect(Permission.EDIT_SHOP_ITEMS).toBeDefined();
        expect(Permission.SEED_DATABASE).toBeDefined();
    });

    it('should define system permissions', () => {
        expect(Permission.VIEW_ADMIN_CONSOLE).toBeDefined();
        expect(Permission.DELETE_USERS).toBeDefined();
    });
});

describe('ROLE_PERMISSIONS', () => {
    it('should give users no permissions', () => {
        expect(ROLE_PERMISSIONS[Role.USER]).toEqual([]);
    });

    it('should give moderators limited permissions', () => {
        const modPerms = ROLE_PERMISSIONS[Role.MODERATOR];
        expect(modPerms).toContain(Permission.VIEW_ADMIN_CONSOLE);
        expect(modPerms).toContain(Permission.VIEW_USERS);
        expect(modPerms).toContain(Permission.BAN_USERS);
        expect(modPerms).not.toContain(Permission.DELETE_USERS);
    });

    it('should give admins more permissions', () => {
        const adminPerms = ROLE_PERMISSIONS[Role.ADMIN];
        expect(adminPerms).toContain(Permission.PROMOTE_TO_MODERATOR);
        expect(adminPerms).toContain(Permission.EDIT_SHOP_ITEMS);
        expect(adminPerms).not.toContain(Permission.DELETE_USERS);
    });

    it('should give super admin all permissions', () => {
        const superAdminPerms = ROLE_PERMISSIONS[Role.SUPER_ADMIN];
        expect(superAdminPerms).toContain(Permission.DELETE_USERS);
        expect(superAdminPerms).toContain(Permission.SEED_DATABASE);
        expect(superAdminPerms).toContain(Permission.RESET_USER_DATA);
        // Super admin should have all permissions
        const allPermissions = Object.values(Permission);
        allPermissions.forEach(perm => {
            expect(superAdminPerms).toContain(perm);
        });
    });
});

describe('hasPermission', () => {
    it('should return false for user with any permission', () => {
        expect(hasPermission(Role.USER, Permission.VIEW_USERS)).toBe(false);
        expect(hasPermission(Role.USER, Permission.VIEW_ADMIN_CONSOLE)).toBe(false);
    });

    it('should return true for moderator with their permissions', () => {
        expect(hasPermission(Role.MODERATOR, Permission.VIEW_USERS)).toBe(true);
        expect(hasPermission(Role.MODERATOR, Permission.BAN_USERS)).toBe(true);
    });

    it('should return false for moderator with admin-only permissions', () => {
        expect(hasPermission(Role.MODERATOR, Permission.PROMOTE_TO_MODERATOR)).toBe(false);
        expect(hasPermission(Role.MODERATOR, Permission.EDIT_SHOP_ITEMS)).toBe(false);
    });

    it('should return true for admin with their permissions', () => {
        expect(hasPermission(Role.ADMIN, Permission.PROMOTE_TO_MODERATOR)).toBe(true);
        expect(hasPermission(Role.ADMIN, Permission.EDIT_SHOP_ITEMS)).toBe(true);
    });

    it('should return false for admin with super-admin-only permissions', () => {
        expect(hasPermission(Role.ADMIN, Permission.DELETE_USERS)).toBe(false);
        expect(hasPermission(Role.ADMIN, Permission.SEED_DATABASE)).toBe(false);
    });

    it('should return true for super admin with all permissions', () => {
        expect(hasPermission(Role.SUPER_ADMIN, Permission.DELETE_USERS)).toBe(true);
        expect(hasPermission(Role.SUPER_ADMIN, Permission.SEED_DATABASE)).toBe(true);
        expect(hasPermission(Role.SUPER_ADMIN, Permission.VIEW_USERS)).toBe(true);
    });
});

describe('canManageRole', () => {
    it('should allow higher roles to manage lower roles', () => {
        expect(canManageRole(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
        expect(canManageRole(Role.SUPER_ADMIN, Role.MODERATOR)).toBe(true);
        expect(canManageRole(Role.SUPER_ADMIN, Role.USER)).toBe(true);
        expect(canManageRole(Role.ADMIN, Role.MODERATOR)).toBe(true);
        expect(canManageRole(Role.ADMIN, Role.USER)).toBe(true);
        expect(canManageRole(Role.MODERATOR, Role.USER)).toBe(true);
    });

    it('should not allow managing same level roles', () => {
        expect(canManageRole(Role.ADMIN, Role.ADMIN)).toBe(false);
        expect(canManageRole(Role.MODERATOR, Role.MODERATOR)).toBe(false);
    });

    it('should not allow lower roles to manage higher roles', () => {
        expect(canManageRole(Role.USER, Role.MODERATOR)).toBe(false);
        expect(canManageRole(Role.MODERATOR, Role.ADMIN)).toBe(false);
        expect(canManageRole(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
    });
});

describe('getPromotableRoles', () => {
    it('should return empty array for users', () => {
        expect(getPromotableRoles(Role.USER)).toEqual([]);
    });

    it('should return empty array for moderators', () => {
        // Moderators can't promote anyone
        expect(getPromotableRoles(Role.MODERATOR)).toEqual([]);
    });

    it('should return moderator for admins', () => {
        const promotable = getPromotableRoles(Role.ADMIN);
        expect(promotable).toContain(Role.MODERATOR);
        expect(promotable).not.toContain(Role.ADMIN);
        expect(promotable).not.toContain(Role.USER); // Excludes level 0
    });

    it('should return admin and moderator for super admins', () => {
        const promotable = getPromotableRoles(Role.SUPER_ADMIN);
        expect(promotable).toContain(Role.ADMIN);
        expect(promotable).toContain(Role.MODERATOR);
        expect(promotable).not.toContain(Role.SUPER_ADMIN);
    });
});

describe('getAssignableRoles', () => {
    it('should return empty array for users', () => {
        expect(getAssignableRoles(Role.USER)).toEqual([]);
    });

    it('should include User for moderators', () => {
        const assignable = getAssignableRoles(Role.MODERATOR);
        expect(assignable).toContain(Role.USER);
        expect(assignable).not.toContain(Role.MODERATOR);
    });

    it('should include User and Moderator for admins', () => {
        const assignable = getAssignableRoles(Role.ADMIN);
        expect(assignable).toContain(Role.USER);
        expect(assignable).toContain(Role.MODERATOR);
        expect(assignable).not.toContain(Role.ADMIN);
    });

    it('should include all roles below for super admins', () => {
        const assignable = getAssignableRoles(Role.SUPER_ADMIN);
        expect(assignable).toContain(Role.USER);
        expect(assignable).toContain(Role.MODERATOR);
        expect(assignable).toContain(Role.ADMIN);
        expect(assignable).not.toContain(Role.SUPER_ADMIN);
    });
});

describe('parseRole', () => {
    it('should parse valid role strings', () => {
        expect(parseRole('user')).toBe(Role.USER);
        expect(parseRole('moderator')).toBe(Role.MODERATOR);
        expect(parseRole('admin')).toBe(Role.ADMIN);
        expect(parseRole('super_admin')).toBe(Role.SUPER_ADMIN);
    });

    it('should return USER for null or undefined', () => {
        expect(parseRole(null)).toBe(Role.USER);
        expect(parseRole(undefined)).toBe(Role.USER);
    });

    it('should return USER for invalid role strings', () => {
        expect(parseRole('invalid')).toBe(Role.USER);
        expect(parseRole('root')).toBe(Role.USER);
        expect(parseRole('')).toBe(Role.USER);
    });

    it('should use isAdmin fallback for legacy support', () => {
        expect(parseRole(null, true)).toBe(Role.SUPER_ADMIN);
        expect(parseRole(undefined, true)).toBe(Role.SUPER_ADMIN);
        expect(parseRole('invalid', true)).toBe(Role.SUPER_ADMIN);
    });

    it('should prioritize valid role over isAdmin flag', () => {
        expect(parseRole('user', true)).toBe(Role.USER);
        expect(parseRole('moderator', true)).toBe(Role.MODERATOR);
    });
});
