'use server';

/**
 * Migration Script: 4-Tier to 100-Tier System
 *
 * This script migrates all users from the old 4-tier system to the new 100-tier system.
 *
 * Migration mapping:
 * - Tier 0 (unplaced) → Tier 1 (Foundation 1)
 * - Tier 1 → Tier 5 (Foundation 5)
 * - Tier 2 → Tier 21 (Intermediate 1)
 * - Tier 3 → Tier 41 (Advanced 1)
 * - Tier 4 → Tier 61 (Expert 1)
 */

import { getDatabase } from '@/lib/db';
import { migrateTier, migrateMathTiers, MathOperation } from '@/lib/tier-system';
import { auth } from '@/auth';

interface MigrationResult {
    success: boolean;
    usersProcessed: number;
    usersUpdated: number;
    errors: string[];
}

/**
 * Check if migration is needed (any user has tier <= 4)
 */
export async function checkMigrationNeeded(): Promise<{
    needed: boolean;
    usersToMigrate: number;
    alreadyMigrated: number;
}> {
    const db = getDatabase();

    // Count users with old-style tiers (0-4)
    const oldStyleUsers = db.prepare(`
        SELECT COUNT(*) as count FROM users
        WHERE json_extract(math_tiers, '$.addition') <= 4
        OR json_extract(math_tiers, '$.subtraction') <= 4
        OR json_extract(math_tiers, '$.multiplication') <= 4
        OR json_extract(math_tiers, '$.division') <= 4
    `).get() as { count: number };

    // Count users with new-style tiers (> 4)
    const newStyleUsers = db.prepare(`
        SELECT COUNT(*) as count FROM users
        WHERE json_extract(math_tiers, '$.addition') > 4
        OR json_extract(math_tiers, '$.subtraction') > 4
        OR json_extract(math_tiers, '$.multiplication') > 4
        OR json_extract(math_tiers, '$.division') > 4
    `).get() as { count: number };

    return {
        needed: oldStyleUsers.count > 0,
        usersToMigrate: oldStyleUsers.count,
        alreadyMigrated: newStyleUsers.count,
    };
}

/**
 * Run the tier migration for all users
 * This should only be run once when upgrading to the 100-tier system
 */
export async function runTierMigration(): Promise<MigrationResult> {
    const session = await auth();

    // Only allow admins to run migration
    const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin;
    if (!session?.user || !isAdmin) {
        return {
            success: false,
            usersProcessed: 0,
            usersUpdated: 0,
            errors: ['Unauthorized: Admin access required'],
        };
    }

    const db = getDatabase();
    const errors: string[] = [];
    let usersProcessed = 0;
    let usersUpdated = 0;

    try {
        // Get all users with their math_tiers
        const users = db.prepare(`
            SELECT id, name, math_tiers FROM users
        `).all() as { id: string; name: string; math_tiers: string }[];

        const updateStmt = db.prepare(`
            UPDATE users SET math_tiers = ? WHERE id = ?
        `);

        const transaction = db.transaction(() => {
            for (const user of users) {
                usersProcessed++;

                try {
                    // Parse existing tiers
                    let oldTiers: Record<string, number>;
                    try {
                        oldTiers = typeof user.math_tiers === 'string'
                            ? JSON.parse(user.math_tiers)
                            : user.math_tiers || {};
                    } catch {
                        oldTiers = { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
                    }

                    // Check if already migrated (any tier > 4)
                    const maxTier = Math.max(
                        oldTiers.addition || 0,
                        oldTiers.subtraction || 0,
                        oldTiers.multiplication || 0,
                        oldTiers.division || 0
                    );

                    if (maxTier > 4) {
                        // Already migrated, skip
                        continue;
                    }

                    // Migrate each operation's tier
                    const newTiers = {
                        addition: migrateTier(oldTiers.addition ?? 0),
                        subtraction: migrateTier(oldTiers.subtraction ?? 0),
                        multiplication: migrateTier(oldTiers.multiplication ?? 0),
                        division: migrateTier(oldTiers.division ?? 0),
                    };

                    // Update user
                    updateStmt.run(JSON.stringify(newTiers), user.id);
                    usersUpdated++;

                    console.log(`[Migration] ${user.name || user.id}: ${JSON.stringify(oldTiers)} → ${JSON.stringify(newTiers)}`);
                } catch (err) {
                    const errorMsg = `Failed to migrate user ${user.id}: ${err instanceof Error ? err.message : 'Unknown error'}`;
                    errors.push(errorMsg);
                    console.error(`[Migration] ${errorMsg}`);
                }
            }
        });

        transaction();

        console.log(`[Migration] Complete. Processed: ${usersProcessed}, Updated: ${usersUpdated}, Errors: ${errors.length}`);

        return {
            success: errors.length === 0,
            usersProcessed,
            usersUpdated,
            errors,
        };
    } catch (err) {
        const errorMsg = `Migration failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[Migration] ${errorMsg}`);

        return {
            success: false,
            usersProcessed,
            usersUpdated,
            errors,
        };
    }
}

/**
 * Migrate a single user's tiers (can be used for testing or individual fixes)
 */
export async function migrateUserTiers(userId: string): Promise<{
    success: boolean;
    oldTiers: Record<string, number>;
    newTiers: Record<string, number>;
    error?: string;
}> {
    const session = await auth();

    // Only allow admins or the user themselves
    const currentUserId = (session?.user as { id?: string })?.id;
    const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;

    if (!currentUserId || (currentUserId !== userId && !isAdmin)) {
        return {
            success: false,
            oldTiers: {},
            newTiers: {},
            error: 'Unauthorized',
        };
    }

    const db = getDatabase();

    try {
        const user = db.prepare(`
            SELECT math_tiers FROM users WHERE id = ?
        `).get(userId) as { math_tiers: string } | undefined;

        if (!user) {
            return {
                success: false,
                oldTiers: {},
                newTiers: {},
                error: 'User not found',
            };
        }

        // Parse existing tiers
        const oldTiers = typeof user.math_tiers === 'string'
            ? JSON.parse(user.math_tiers)
            : user.math_tiers || {};

        // Migrate
        const newTiers = {
            addition: migrateTier(oldTiers.addition ?? 0),
            subtraction: migrateTier(oldTiers.subtraction ?? 0),
            multiplication: migrateTier(oldTiers.multiplication ?? 0),
            division: migrateTier(oldTiers.division ?? 0),
        };

        // Update
        db.prepare(`
            UPDATE users SET math_tiers = ? WHERE id = ?
        `).run(JSON.stringify(newTiers), userId);

        return {
            success: true,
            oldTiers,
            newTiers,
        };
    } catch (err) {
        return {
            success: false,
            oldTiers: {},
            newTiers: {},
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

/**
 * Rollback migration for testing (converts new tiers back to old)
 * WARNING: This is destructive and should only be used for testing
 */
export async function rollbackTierMigration(): Promise<MigrationResult> {
    const session = await auth();

    const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin;
    if (!session?.user || !isAdmin) {
        return {
            success: false,
            usersProcessed: 0,
            usersUpdated: 0,
            errors: ['Unauthorized: Admin access required'],
        };
    }

    const db = getDatabase();
    const errors: string[] = [];
    let usersProcessed = 0;
    let usersUpdated = 0;

    // Reverse mapping
    const reverseMigrate = (newTier: number): number => {
        if (newTier <= 20) return 1;
        if (newTier <= 40) return 2;
        if (newTier <= 60) return 3;
        return 4;
    };

    try {
        const users = db.prepare(`
            SELECT id, math_tiers FROM users
        `).all() as { id: string; math_tiers: string }[];

        const updateStmt = db.prepare(`
            UPDATE users SET math_tiers = ? WHERE id = ?
        `);

        const transaction = db.transaction(() => {
            for (const user of users) {
                usersProcessed++;

                try {
                    const currentTiers = typeof user.math_tiers === 'string'
                        ? JSON.parse(user.math_tiers)
                        : user.math_tiers || {};

                    // Only rollback if already migrated (tier > 4)
                    const maxTier = Math.max(
                        currentTiers.addition || 0,
                        currentTiers.subtraction || 0,
                        currentTiers.multiplication || 0,
                        currentTiers.division || 0
                    );

                    if (maxTier <= 4) continue;

                    const oldTiers = {
                        addition: reverseMigrate(currentTiers.addition ?? 1),
                        subtraction: reverseMigrate(currentTiers.subtraction ?? 1),
                        multiplication: reverseMigrate(currentTiers.multiplication ?? 1),
                        division: reverseMigrate(currentTiers.division ?? 1),
                    };

                    updateStmt.run(JSON.stringify(oldTiers), user.id);
                    usersUpdated++;
                } catch (err) {
                    errors.push(`Failed to rollback user ${user.id}`);
                }
            }
        });

        transaction();

        return {
            success: errors.length === 0,
            usersProcessed,
            usersUpdated,
            errors,
        };
    } catch (err) {
        return {
            success: false,
            usersProcessed,
            usersUpdated,
            errors: [err instanceof Error ? err.message : 'Unknown error'],
        };
    }
}
