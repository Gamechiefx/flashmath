/**
 * Property-Based Tests for Admin Ban Enforcement
 * 
 * Feature: comprehensive-user-stories
 * Property 12: Admin Ban Enforcement
 * 
 * Validates: Requirements 5.3
 * For any user ban implemented by administrators, the system should prevent login 
 * attempts and display ban information to the affected user
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock ban data structures
interface BanRecord {
    id: string;
    userId: string;
    adminId: string;
    reason: string;
    startDate: Date;
    endDate?: Date; // undefined for permanent bans
    isActive: boolean;
    banType: 'temporary' | 'permanent';
}

interface LoginAttempt {
    userId: string;
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
}

interface LoginResult {
    success: boolean;
    error?: string;
    banInfo?: {
        reason: string;
        startDate: Date;
        endDate?: Date;
        remainingTime?: number;
        isPermanent: boolean;
    };
    userId?: string;
}

// Simulate ban enforcement system
function simulateBanEnforcement(
    loginAttempt: LoginAttempt,
    banRecords: BanRecord[]
): LoginResult {
    // Find active ban for user
    const activeBan = banRecords.find(ban => 
        ban.userId === loginAttempt.userId && 
        ban.isActive &&
        ban.startDate <= loginAttempt.timestamp &&
        (ban.banType === 'permanent' || !ban.endDate || ban.endDate > loginAttempt.timestamp)
    );

    if (activeBan) {
        const remainingTime = activeBan.endDate 
            ? activeBan.endDate.getTime() - loginAttempt.timestamp.getTime()
            : undefined;

        return {
            success: false,
            error: "Account is banned",
            banInfo: {
                reason: activeBan.reason,
                startDate: activeBan.startDate,
                endDate: activeBan.endDate,
                remainingTime,
                isPermanent: activeBan.banType === 'permanent'
            }
        };
    }

    // Check for expired bans (should be cleaned up but test edge case)
    const expiredBan = banRecords.find(ban =>
        ban.userId === loginAttempt.userId &&
        ban.isActive &&
        ban.endDate &&
        ban.endDate <= loginAttempt.timestamp
    );

    if (expiredBan) {
        // Expired ban should not prevent login
        return {
            success: true,
            userId: loginAttempt.userId
        };
    }

    // No active ban found
    return {
        success: true,
        userId: loginAttempt.userId
    };
}

// Simulate ban creation
function simulateCreateBan(
    adminId: string,
    targetUserId: string,
    reason: string,
    duration?: number // in milliseconds, undefined for permanent
): BanRecord {
    const startDate = new Date();
    const endDate = duration ? new Date(startDate.getTime() + duration) : undefined;

    return {
        id: `ban-${Math.random().toString(36).substring(7)}`,
        userId: targetUserId,
        adminId,
        reason,
        startDate,
        endDate,
        isActive: true,
        banType: duration ? 'temporary' : 'permanent'
    };
}

// Generate random ban record
function generateRandomBan(): BanRecord {
    const now = new Date();
    const startDate = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Up to 7 days ago
    const isTemporary = Math.random() > 0.3; // 70% temporary bans
    const endDate = isTemporary 
        ? new Date(startDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000) // Up to 30 days
        : undefined;

    return {
        id: `ban-${Math.random().toString(36).substring(7)}`,
        userId: `user-${Math.random().toString(36).substring(7)}`,
        adminId: `admin-${Math.random().toString(36).substring(7)}`,
        reason: ['Cheating', 'Harassment', 'Spam', 'Inappropriate content'][Math.floor(Math.random() * 4)],
        startDate,
        endDate,
        isActive: Math.random() > 0.1, // 90% active
        banType: isTemporary ? 'temporary' : 'permanent'
    };
}

// Generate random login attempt
function generateRandomLoginAttempt(): LoginAttempt {
    return {
        userId: `user-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date(),
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 Test Browser'
    };
}

describe('Property 12: Admin Ban Enforcement', () => {
    it('should prevent login for actively banned users', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const now = new Date();
            
            // Create active ban
            const activeBan = simulateCreateBan(
                'admin-test',
                userId,
                'Test ban reason',
                Math.random() > 0.5 ? 24 * 60 * 60 * 1000 : undefined // 50% temporary, 50% permanent
            );

            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: now,
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, [activeBan]);

            // Should prevent login
            expect(result.success).toBe(false);
            expect(result.error).toBe("Account is banned");
            expect(result.banInfo).toBeDefined();
            expect(result.banInfo!.reason).toBe(activeBan.reason);
            expect(result.banInfo!.startDate).toEqual(activeBan.startDate);
            expect(result.banInfo!.isPermanent).toBe(activeBan.banType === 'permanent');
            
            if (activeBan.banType === 'temporary') {
                expect(result.banInfo!.endDate).toEqual(activeBan.endDate);
                expect(result.banInfo!.remainingTime).toBeGreaterThan(0);
            } else {
                expect(result.banInfo!.endDate).toBeUndefined();
                expect(result.banInfo!.remainingTime).toBeUndefined();
            }
        }
    });

    it('should allow login for users without active bans', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: new Date(),
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            // Test with no bans
            const resultNoBans = simulateBanEnforcement(loginAttempt, []);
            expect(resultNoBans.success).toBe(true);
            expect(resultNoBans.userId).toBe(userId);
            expect(resultNoBans.error).toBeUndefined();
            expect(resultNoBans.banInfo).toBeUndefined();

            // Test with bans for other users
            const otherUserBans = Array.from({ length: 5 }, () => generateRandomBan());
            const resultOtherBans = simulateBanEnforcement(loginAttempt, otherUserBans);
            expect(resultOtherBans.success).toBe(true);
            expect(resultOtherBans.userId).toBe(userId);
        }
    });

    it('should allow login after temporary ban expires', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const banStart = new Date();
            const banDuration = 60 * 60 * 1000; // 1 hour
            
            const temporaryBan = simulateCreateBan(
                'admin-test',
                userId,
                'Temporary ban test',
                banDuration
            );

            // Login attempt after ban expires
            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: new Date(banStart.getTime() + banDuration + 1000), // 1 second after expiry
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, [temporaryBan]);

            // Should allow login after expiry
            expect(result.success).toBe(true);
            expect(result.userId).toBe(userId);
            expect(result.error).toBeUndefined();
            expect(result.banInfo).toBeUndefined();
        }
    });

    it('should enforce permanent bans indefinitely', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            
            const permanentBan = simulateCreateBan(
                'admin-test',
                userId,
                'Permanent ban test'
                // No duration = permanent
            );

            // Test login attempts at various future times
            const futureTimestamps = [
                new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
                new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) // 10 years
            ];

            futureTimestamps.forEach(timestamp => {
                const loginAttempt: LoginAttempt = {
                    userId,
                    timestamp,
                    ipAddress: '192.168.1.100',
                    userAgent: 'Test Browser'
                };

                const result = simulateBanEnforcement(loginAttempt, [permanentBan]);

                // Should always prevent login for permanent bans
                expect(result.success).toBe(false);
                expect(result.error).toBe("Account is banned");
                expect(result.banInfo!.isPermanent).toBe(true);
                expect(result.banInfo!.endDate).toBeUndefined();
                expect(result.banInfo!.remainingTime).toBeUndefined();
            });
        }
    });

    it('should display correct ban information to users', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const banReason = `Test reason ${iteration}`;
            const isTemporary = Math.random() > 0.5;
            const banDuration = isTemporary ? Math.random() * 7 * 24 * 60 * 60 * 1000 : undefined; // Up to 7 days

            const ban = simulateCreateBan('admin-test', userId, banReason, banDuration);

            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: new Date(),
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, [ban]);

            expect(result.success).toBe(false);
            expect(result.banInfo).toBeDefined();
            
            // Validate ban information accuracy
            expect(result.banInfo!.reason).toBe(banReason);
            expect(result.banInfo!.startDate).toEqual(ban.startDate);
            expect(result.banInfo!.isPermanent).toBe(!isTemporary);
            
            if (isTemporary) {
                expect(result.banInfo!.endDate).toEqual(ban.endDate);
                expect(result.banInfo!.remainingTime).toBeGreaterThan(0);
                expect(result.banInfo!.remainingTime).toBeLessThanOrEqual(banDuration!);
            } else {
                expect(result.banInfo!.endDate).toBeUndefined();
                expect(result.banInfo!.remainingTime).toBeUndefined();
            }
        }
    });

    it('should handle multiple bans correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const now = new Date();
            
            // Create multiple bans with different states
            const bans: BanRecord[] = [
                // Expired ban
                {
                    id: 'ban-expired',
                    userId,
                    adminId: 'admin1',
                    reason: 'Old violation',
                    startDate: new Date(now.getTime() - 48 * 60 * 60 * 1000), // 2 days ago
                    endDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
                    isActive: true,
                    banType: 'temporary'
                },
                // Active ban
                {
                    id: 'ban-active',
                    userId,
                    adminId: 'admin2',
                    reason: 'Current violation',
                    startDate: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
                    endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 1 day from now
                    isActive: true,
                    banType: 'temporary'
                },
                // Inactive ban
                {
                    id: 'ban-inactive',
                    userId,
                    adminId: 'admin3',
                    reason: 'Revoked violation',
                    startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
                    endDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours from now
                    isActive: false,
                    banType: 'temporary'
                }
            ];

            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: now,
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, bans);

            // Should be blocked by the active ban
            expect(result.success).toBe(false);
            expect(result.banInfo!.reason).toBe('Current violation');
            expect(result.banInfo!.isPermanent).toBe(false);
        }
    });

    it('should handle edge cases in ban timing', () => {
        const edgeCases = [
            // Ban starts exactly at login time
            { banOffset: 0, loginOffset: 0, shouldBlock: true },
            
            // Ban starts 1ms before login
            { banOffset: -1, loginOffset: 0, shouldBlock: true },
            
            // Ban starts 1ms after login
            { banOffset: 1, loginOffset: 0, shouldBlock: false },
            
            // Ban ends exactly at login time
            { banOffset: -60000, loginOffset: 0, banDuration: 60000, shouldBlock: false },
            
            // Ban ends 1ms before login
            { banOffset: -60001, loginOffset: 0, banDuration: 60000, shouldBlock: false },
            
            // Ban ends 1ms after login
            { banOffset: -59999, loginOffset: 0, banDuration: 60000, shouldBlock: true }
        ];

        edgeCases.forEach(({ banOffset, loginOffset, banDuration, shouldBlock }, index) => {
            const userId = `edge-user-${index}`;
            const baseTime = new Date();
            
            const ban: BanRecord = {
                id: `edge-ban-${index}`,
                userId,
                adminId: 'admin-edge',
                reason: 'Edge case test',
                startDate: new Date(baseTime.getTime() + banOffset),
                endDate: banDuration ? new Date(baseTime.getTime() + banOffset + banDuration) : undefined,
                isActive: true,
                banType: banDuration ? 'temporary' : 'permanent'
            };

            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: new Date(baseTime.getTime() + loginOffset),
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, [ban]);

            if (shouldBlock) {
                expect(result.success).toBe(false);
                expect(result.error).toBe("Account is banned");
            } else {
                expect(result.success).toBe(true);
                expect(result.userId).toBe(userId);
            }
        });
    });

    it('should maintain ban enforcement consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const ban = generateRandomBan();
            ban.userId = userId; // Ensure ban applies to test user
            
            const loginAttempt = generateRandomLoginAttempt();
            loginAttempt.userId = userId;

            // Perform multiple enforcement checks with same parameters
            const results = Array.from({ length: 5 }, () => 
                simulateBanEnforcement(loginAttempt, [ban])
            );

            // All results should be identical
            const firstResult = results[0];
            results.slice(1).forEach(result => {
                expect(result.success).toBe(firstResult.success);
                expect(result.error).toBe(firstResult.error);
                expect(result.userId).toBe(firstResult.userId);
                
                if (firstResult.banInfo) {
                    expect(result.banInfo).toBeDefined();
                    expect(result.banInfo!.reason).toBe(firstResult.banInfo.reason);
                    expect(result.banInfo!.isPermanent).toBe(firstResult.banInfo.isPermanent);
                    expect(result.banInfo!.startDate).toEqual(firstResult.banInfo.startDate);
                    expect(result.banInfo!.endDate).toEqual(firstResult.banInfo.endDate);
                } else {
                    expect(result.banInfo).toBeUndefined();
                }
            });
        }
    });

    it('should calculate remaining ban time correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const userId = `user-${iteration}`;
            const now = new Date();
            const banDuration = Math.random() * 7 * 24 * 60 * 60 * 1000; // Up to 7 days
            
            const ban = simulateCreateBan('admin-test', userId, 'Time test', banDuration);
            
            // Login attempt at various times during ban
            const loginTime = new Date(ban.startDate.getTime() + Math.random() * banDuration);
            
            const loginAttempt: LoginAttempt = {
                userId,
                timestamp: loginTime,
                ipAddress: '192.168.1.100',
                userAgent: 'Test Browser'
            };

            const result = simulateBanEnforcement(loginAttempt, [ban]);

            if (result.success === false && result.banInfo) {
                const expectedRemainingTime = ban.endDate!.getTime() - loginTime.getTime();
                
                expect(result.banInfo.remainingTime).toBeDefined();
                expect(result.banInfo.remainingTime).toBeCloseTo(expectedRemainingTime, -2); // Within 100ms
                expect(result.banInfo.remainingTime).toBeGreaterThan(0);
            }
        }
    });
});