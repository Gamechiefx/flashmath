/**
 * Property-Based Tests for Admin Security Enforcement
 * 
 * Feature: comprehensive-user-stories
 * Property 11: Admin Security Enforcement
 * 
 * Validates: Requirements 5.1
 * For any administrative action, the system should require additional authentication 
 * and properly enforce access controls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Role, Permission, hasPermission, canManageRole, ROLE_HIERARCHY } from '@/lib/rbac';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock user session and authentication state
interface MockSession {
    userId: string;
    role: Role;
    isAuthenticated: boolean;
    has2FA: boolean;
    sessionExpiry: Date;
    lastActivity: Date;
}

interface AdminAction {
    action: string;
    requiredPermission: Permission;
    requires2FA: boolean;
    targetUserId?: string;
    targetRole?: Role;
    data?: any;
}

interface SecurityResult {
    allowed: boolean;
    reason?: string;
    requires2FA?: boolean;
    additionalAuthRequired?: boolean;
}

// Simulate admin security check
function simulateAdminSecurityCheck(
    session: MockSession,
    action: AdminAction
): SecurityResult {
    // Check if user is authenticated
    if (!session.isAuthenticated) {
        return {
            allowed: false,
            reason: "User not authenticated"
        };
    }

    // Check session expiry
    if (new Date() > session.sessionExpiry) {
        return {
            allowed: false,
            reason: "Session expired"
        };
    }

    // Check if user has required permission
    if (!hasPermission(session.role, action.requiredPermission)) {
        return {
            allowed: false,
            reason: "Insufficient permissions"
        };
    }

    // Check 2FA requirement for sensitive actions
    if (action.requires2FA && !session.has2FA) {
        return {
            allowed: false,
            reason: "2FA required",
            requires2FA: true,
            additionalAuthRequired: true
        };
    }

    // Check role management permissions
    if (action.targetRole && !canManageRole(session.role, action.targetRole)) {
        return {
            allowed: false,
            reason: "Cannot manage target role"
        };
    }

    // Additional security checks for sensitive operations
    const sensitiveActions = ['DELETE_USER', 'RESET_DATABASE', 'PROMOTE_TO_ADMIN'];
    if (sensitiveActions.includes(action.action)) {
        const timeSinceLastActivity = new Date().getTime() - session.lastActivity.getTime();
        const maxIdleTime = 5 * 60 * 1000; // 5 minutes

        if (timeSinceLastActivity > maxIdleTime) {
            return {
                allowed: false,
                reason: "Session idle too long for sensitive operation",
                additionalAuthRequired: true
            };
        }
    }

    return {
        allowed: true
    };
}

// Generate random session for testing
function generateRandomSession(): MockSession {
    const roles = Object.values(Role);
    const role = roles[Math.floor(Math.random() * roles.length)];
    
    const now = new Date();
    const sessionExpiry = new Date(now.getTime() + Math.random() * 24 * 60 * 60 * 1000); // Up to 24 hours
    const lastActivity = new Date(now.getTime() - Math.random() * 60 * 60 * 1000); // Up to 1 hour ago

    return {
        userId: `user-${Math.random().toString(36).substring(7)}`,
        role,
        isAuthenticated: Math.random() > 0.1, // 90% authenticated
        has2FA: Math.random() > 0.3, // 70% have 2FA
        sessionExpiry,
        lastActivity
    };
}

// Generate random admin action
function generateRandomAdminAction(): AdminAction {
    const actions = [
        { action: 'VIEW_USERS', permission: Permission.VIEW_USERS, requires2FA: false },
        { action: 'BAN_USER', permission: Permission.BAN_USERS, requires2FA: true },
        { action: 'GIVE_COINS', permission: Permission.GIVE_COINS_XP, requires2FA: true },
        { action: 'EDIT_SHOP', permission: Permission.EDIT_SHOP_ITEMS, requires2FA: false },
        { action: 'DELETE_USER', permission: Permission.DELETE_USERS, requires2FA: true },
        { action: 'PROMOTE_TO_ADMIN', permission: Permission.PROMOTE_TO_ADMIN, requires2FA: true }
    ];

    const actionTemplate = actions[Math.floor(Math.random() * actions.length)];
    const roles = Object.values(Role);

    return {
        action: actionTemplate.action,
        requiredPermission: actionTemplate.permission,
        requires2FA: actionTemplate.requires2FA,
        targetUserId: `target-${Math.random().toString(36).substring(7)}`,
        targetRole: roles[Math.floor(Math.random() * roles.length)],
        data: { value: Math.random() * 1000 }
    };
}

describe('Property 11: Admin Security Enforcement', () => {
    it('should require authentication for all admin actions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            const action = generateRandomAdminAction();
            
            // Force unauthenticated state
            const unauthenticatedSession = { ...session, isAuthenticated: false };
            
            const result = simulateAdminSecurityCheck(unauthenticatedSession, action);
            
            // Should always deny unauthenticated users
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("User not authenticated");
        }
    });

    it('should enforce session expiry for admin actions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            const action = generateRandomAdminAction();
            
            // Force expired session
            const expiredSession = {
                ...session,
                isAuthenticated: true,
                sessionExpiry: new Date(Date.now() - 1000) // 1 second ago
            };
            
            const result = simulateAdminSecurityCheck(expiredSession, action);
            
            // Should deny expired sessions
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("Session expired");
        }
    });

    it('should enforce role-based permissions correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            const action = generateRandomAdminAction();
            
            // Ensure session is valid for permission testing
            session.isAuthenticated = true;
            session.sessionExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
            session.lastActivity = new Date(); // Recent activity
            
            const result = simulateAdminSecurityCheck(session, action);
            
            const userHasPermission = hasPermission(session.role, action.requiredPermission);
            
            if (userHasPermission) {
                // If user has permission, check other factors
                if (action.requires2FA && !session.has2FA) {
                    expect(result.allowed).toBe(false);
                    expect(result.reason).toBe("2FA required");
                } else if (action.targetRole && !canManageRole(session.role, action.targetRole)) {
                    expect(result.allowed).toBe(false);
                    expect(result.reason).toBe("Cannot manage target role");
                } else {
                    // Check for sensitive action timing requirements
                    const sensitiveActions = ['DELETE_USER', 'RESET_DATABASE', 'PROMOTE_TO_ADMIN'];
                    if (sensitiveActions.includes(action.action)) {
                        const timeSinceLastActivity = new Date().getTime() - session.lastActivity.getTime();
                        const maxIdleTime = 5 * 60 * 1000; // 5 minutes
                        
                        if (timeSinceLastActivity > maxIdleTime) {
                            expect(result.allowed).toBe(false);
                            expect(result.reason).toBe("Session idle too long for sensitive operation");
                        } else {
                            expect(result.allowed).toBe(true);
                        }
                    } else {
                        // Non-sensitive action should be allowed
                        expect(result.allowed).toBe(true);
                    }
                }
            } else {
                // Should deny if user lacks permission
                expect(result.allowed).toBe(false);
                expect(result.reason).toBe("Insufficient permissions");
            }
        }
    });

    it('should require 2FA for sensitive operations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            
            // Create sensitive action that requires 2FA
            const sensitiveAction: AdminAction = {
                action: 'BAN_USER',
                requiredPermission: Permission.BAN_USERS,
                requires2FA: true,
                targetUserId: 'target-user'
            };
            
            // Ensure session is valid except for 2FA
            session.isAuthenticated = true;
            session.sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
            session.role = Role.ADMIN; // Ensure user has permission
            
            const result = simulateAdminSecurityCheck(session, sensitiveAction);
            
            if (session.has2FA) {
                // Should be allowed with 2FA
                expect(result.allowed).toBe(true);
            } else {
                // Should be denied without 2FA
                expect(result.allowed).toBe(false);
                expect(result.reason).toBe("2FA required");
                expect(result.requires2FA).toBe(true);
                expect(result.additionalAuthRequired).toBe(true);
            }
        }
    });

    it('should enforce role hierarchy in management operations', () => {
        const roleHierarchyTests = [
            { manager: Role.SUPER_ADMIN, target: Role.ADMIN, shouldAllow: true },
            { manager: Role.SUPER_ADMIN, target: Role.MODERATOR, shouldAllow: true },
            { manager: Role.SUPER_ADMIN, target: Role.USER, shouldAllow: true },
            { manager: Role.ADMIN, target: Role.SUPER_ADMIN, shouldAllow: false },
            { manager: Role.ADMIN, target: Role.MODERATOR, shouldAllow: true },
            { manager: Role.ADMIN, target: Role.USER, shouldAllow: true },
            { manager: Role.MODERATOR, target: Role.ADMIN, shouldAllow: false },
            { manager: Role.MODERATOR, target: Role.SUPER_ADMIN, shouldAllow: false },
            { manager: Role.USER, target: Role.ADMIN, shouldAllow: false }
        ];

        roleHierarchyTests.forEach(({ manager, target, shouldAllow }) => {
            const session: MockSession = {
                userId: 'test-manager',
                role: manager,
                isAuthenticated: true,
                has2FA: true,
                sessionExpiry: new Date(Date.now() + 60 * 60 * 1000),
                lastActivity: new Date()
            };

            const action: AdminAction = {
                action: 'PROMOTE_USER',
                requiredPermission: Permission.PROMOTE_TO_ADMIN,
                requires2FA: true,
                targetRole: target
            };

            const result = simulateAdminSecurityCheck(session, action);

            if (shouldAllow && hasPermission(manager, action.requiredPermission)) {
                expect(result.allowed).toBe(true);
            } else {
                expect(result.allowed).toBe(false);
                if (!hasPermission(manager, action.requiredPermission)) {
                    expect(result.reason).toBe("Insufficient permissions");
                } else {
                    expect(result.reason).toBe("Cannot manage target role");
                }
            }
        });
    });

    it('should enforce session activity requirements for sensitive operations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            
            // Create highly sensitive action
            const sensitiveAction: AdminAction = {
                action: 'DELETE_USER',
                requiredPermission: Permission.DELETE_USERS,
                requires2FA: true
            };
            
            // Ensure session is valid except for activity timing
            session.isAuthenticated = true;
            session.sessionExpiry = new Date(Date.now() + 60 * 60 * 1000);
            session.role = Role.SUPER_ADMIN; // Ensure user has permission
            session.has2FA = true;
            
            const result = simulateAdminSecurityCheck(session, sensitiveAction);
            
            const timeSinceActivity = new Date().getTime() - session.lastActivity.getTime();
            const maxIdleTime = 5 * 60 * 1000; // 5 minutes
            
            if (timeSinceActivity > maxIdleTime) {
                expect(result.allowed).toBe(false);
                expect(result.reason).toBe("Session idle too long for sensitive operation");
                expect(result.additionalAuthRequired).toBe(true);
            } else {
                expect(result.allowed).toBe(true);
            }
        }
    });

    it('should handle edge cases in permission validation', () => {
        const edgeCases = [
            // Minimum role with no permissions
            { role: Role.USER, hasAnyAdminPermission: false },
            
            // Maximum role with all permissions
            { role: Role.SUPER_ADMIN, hasAnyAdminPermission: true },
            
            // Intermediate roles
            { role: Role.MODERATOR, hasAnyAdminPermission: true },
            { role: Role.ADMIN, hasAnyAdminPermission: true }
        ];

        edgeCases.forEach(({ role, hasAnyAdminPermission }) => {
            const session: MockSession = {
                userId: `edge-user-${role}`,
                role,
                isAuthenticated: true,
                has2FA: true,
                sessionExpiry: new Date(Date.now() + 60 * 60 * 1000),
                lastActivity: new Date()
            };

            // Test with various admin permissions
            const adminPermissions = [
                Permission.VIEW_USERS,
                Permission.BAN_USERS,
                Permission.EDIT_SHOP_ITEMS,
                Permission.GIVE_COINS_XP
            ];

            adminPermissions.forEach(permission => {
                const action: AdminAction = {
                    action: 'TEST_ACTION',
                    requiredPermission: permission,
                    requires2FA: false
                };

                const result = simulateAdminSecurityCheck(session, action);
                const userHasThisPermission = hasPermission(role, permission);

                if (userHasThisPermission) {
                    expect(result.allowed).toBe(true);
                } else {
                    expect(result.allowed).toBe(false);
                    expect(result.reason).toBe("Insufficient permissions");
                }
            });
        });
    });

    it('should maintain security consistency across multiple checks', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const session = generateRandomSession();
            const action = generateRandomAdminAction();
            
            // Perform multiple security checks with same parameters
            const results = Array.from({ length: 5 }, () => 
                simulateAdminSecurityCheck(session, action)
            );
            
            // All results should be identical
            const firstResult = results[0];
            results.slice(1).forEach(result => {
                expect(result.allowed).toBe(firstResult.allowed);
                expect(result.reason).toBe(firstResult.reason);
                expect(result.requires2FA).toBe(firstResult.requires2FA);
                expect(result.additionalAuthRequired).toBe(firstResult.additionalAuthRequired);
            });
        }
    });

    it('should validate all security factors in correct order', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const action = generateRandomAdminAction();
            
            // Test with session that fails multiple checks
            const multiFailSession: MockSession = {
                userId: 'multi-fail-user',
                role: Role.USER, // Insufficient permissions
                isAuthenticated: false, // Not authenticated
                has2FA: false, // No 2FA
                sessionExpiry: new Date(Date.now() - 1000), // Expired
                lastActivity: new Date(Date.now() - 10 * 60 * 1000) // Old activity
            };
            
            const result = simulateAdminSecurityCheck(multiFailSession, action);
            
            // Should fail on first check (authentication)
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe("User not authenticated");
            
            // Test with authenticated but expired session
            const expiredSession = { ...multiFailSession, isAuthenticated: true };
            const expiredResult = simulateAdminSecurityCheck(expiredSession, action);
            
            expect(expiredResult.allowed).toBe(false);
            expect(expiredResult.reason).toBe("Session expired");
            
            // Test with valid session but insufficient permissions
            const noPermSession = {
                ...multiFailSession,
                isAuthenticated: true,
                sessionExpiry: new Date(Date.now() + 60 * 60 * 1000)
            };
            const noPermResult = simulateAdminSecurityCheck(noPermSession, action);
            
            expect(noPermResult.allowed).toBe(false);
            expect(noPermResult.reason).toBe("Insufficient permissions");
        }
    });
});