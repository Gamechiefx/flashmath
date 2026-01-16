"use server";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { auth } from "@/auth";
import { queryOne, loadData, getDatabase, generateId, now, type UserRow } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { ACHIEVEMENTS, getAchievementById } from "@/lib/achievements";

// Serializable version for client components (no icon functions)
export interface SerializedAchievement {
    id: string;
    name: string;
    description: string;
    iconName: string;
    category: string;
    reward: {
        type: 'title' | 'coins' | 'both';
        coins?: number;
        titleName?: string;
    };
    requirement: {
        type: string;
        target: number;
        operation?: string;
    };
    hidden?: boolean;
}

export interface UserAchievement {
    achievement: SerializedAchievement;
    progress: number;
    unlocked: boolean;
    unlockedAt: string | null;
    claimed: boolean;
    claimedAt: string | null;
}

/**
 * Get all achievements with user progress
 */
export async function getUserAchievements(): Promise<UserAchievement[]> {
    const session = await auth();
    if (!session?.user) return [];
    const userId = (session.user as { id: string }).id;

    const db = getDatabase();
    interface UserAchievementRow {
        id: string;
        user_id: string;
        achievement_id: string;
        progress: number;
        unlocked_at?: string | null;
        claimed_at?: string | null;
    }
    const userAchievements = db.prepare(
        'SELECT * FROM user_achievements WHERE user_id = ?'
    ).all(userId) as UserAchievementRow[];

    return ACHIEVEMENTS.map(achievement => {
        const userAch = userAchievements.find(ua => ua.achievement_id === achievement.id);
        // Serialize achievement data (convert icon to string name)
        const serializedAchievement: SerializedAchievement = {
            id: achievement.id,
            name: achievement.name,
            description: achievement.description,
            iconName: achievement.icon.displayName || achievement.icon.name || 'Trophy',
            category: achievement.category,
            reward: achievement.reward,
            requirement: achievement.requirement,
            hidden: achievement.hidden
        };
        return {
            achievement: serializedAchievement,
            progress: userAch?.progress || 0,
            unlocked: !!userAch?.unlocked_at,
            unlockedAt: userAch?.unlocked_at || null,
            claimed: !!userAch?.claimed_at,
            claimedAt: userAch?.claimed_at || null
        };
    });
}

/**
 * Check for unclaimed achievements count (for notification badge)
 */
export async function getUnclaimedAchievementsCount(): Promise<number> {
    const session = await auth();
    if (!session?.user) return 0;
    const userId = (session.user as { id: string }).id;

    const db = getDatabase();
    const result = db.prepare(
        'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = ? AND unlocked_at IS NOT NULL AND claimed_at IS NULL'
    ).get(userId) as { count: number };

    return result?.count || 0;
}

/**
 * Claim an achievement reward
 */
export async function claimAchievement(achievementId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as { id: string }).id;

    const achievement = getAchievementById(achievementId);
    if (!achievement) return { error: "Achievement not found" };

    const db = getDatabase();

    // Check if unlocked and not claimed
    interface UserAchievementRow {
        id: string;
        user_id: string;
        achievement_id: string;
        progress: number;
        unlocked_at?: string | null;
        claimed_at?: string | null;
    }
    const userAch = db.prepare(
        'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
    ).get(userId, achievementId) as UserAchievementRow | undefined;

    if (!userAch || !userAch.unlocked_at) {
        return { error: "Achievement not unlocked" };
    }

    if (userAch.claimed_at) {
        return { error: "Already claimed" };
    }

    // Grant rewards
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    if (!user) return { error: "User not found" };

    let coinsAwarded = 0;
    let titleAwarded: string | null = null;

    // Grant coins
    if (achievement.reward.coins && (achievement.reward.type === 'coins' || achievement.reward.type === 'both')) {
        coinsAwarded = achievement.reward.coins;
        const newCoins = (user.coins || 0) + coinsAwarded;
        db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(newCoins, userId);
    }

    // Grant title (add to inventory if not owned)
    if (achievement.reward.titleName && (achievement.reward.type === 'title' || achievement.reward.type === 'both')) {
        titleAwarded = achievement.reward.titleName;

        // Find the matching title item ID (convert titleName to item id format)
        // Title names like "Rising Star" → "title_rising_star"
        const titleId = 'title_' + achievement.reward.titleName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_');

        // Ensure the title exists in shop_items (for foreign key constraint)
        const existingItem = db.prepare('SELECT id FROM shop_items WHERE id = ?').get(titleId);
        if (!existingItem) {
            // Import ITEMS to get the title data
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Dynamic import for items
            const { ITEMS } = require('@/lib/items');
            const titleItem = ITEMS.find((i: any) => i.id === titleId);
            if (titleItem) {
                db.prepare(`
                    INSERT INTO shop_items (id, name, description, type, rarity, price, asset_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(titleId, titleItem.name, titleItem.description || '', titleItem.type, titleItem.rarity, 0, titleItem.assetValue);
            } else {
                // Create a basic title entry if not found in ITEMS
                db.prepare(`
                    INSERT INTO shop_items (id, name, description, type, rarity, price, asset_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(titleId, achievement.reward.titleName, 'Achievement reward', 'title', 'rare', 0, achievement.reward.titleName);
            }
        }

        // Check if already owned
        const alreadyOwned = db.prepare(
            'SELECT id FROM inventory WHERE user_id = ? AND item_id = ?'
        ).get(userId, titleId);

        if (!alreadyOwned) {
            // Add title to inventory
            db.prepare(`
                INSERT INTO inventory (id, user_id, item_id, acquired_at)
                VALUES (?, ?, ?, ?)
            `).run(generateId(), userId, titleId, now());
        }
    }

    // Mark as claimed
    db.prepare(
        'UPDATE user_achievements SET claimed_at = ? WHERE user_id = ? AND achievement_id = ?'
    ).run(now(), userId, achievementId);

    revalidatePath("/");
    return {
        success: true,
        coinsAwarded,
        titleAwarded
    };
}

/**
 * Check and unlock achievements based on current user state
 * Called after relevant actions (level up, session complete, etc.)
 */
export async function checkAndUnlockAchievements(userId: string) {
    const db = getDatabase();
    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    if (!user) return;

    const data = loadData();
    interface SessionRow {
        user_id: string;
        [key: string]: unknown;
    }
    interface InventoryRow {
        user_id: string;
        [key: string]: unknown;
    }
    const userSessions = (data.sessions as SessionRow[]).filter((s: SessionRow) => s.user_id === userId);
    const userInventory = (data.inventory as InventoryRow[]).filter((i: InventoryRow) => i.user_id === userId);

    // Calculate stats
    const totalSessions = userSessions.length;
    const totalCorrect = userSessions.reduce((acc: number, s: any) => acc + (s.correct_count || 0), 0);
    const userLevel = user.level || 1;
    const userTiers = user.math_tiers || { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
    const itemsOwned = userInventory.length;
    const lifetimeCoins = user.total_xp || 0; // Using XP as proxy for lifetime coins earned

    for (const achievement of ACHIEVEMENTS) {
        // Skip if already unlocked
        interface UserAchievementRow {
            id: string;
            user_id: string;
            achievement_id: string;
            progress: number;
            unlocked_at?: string | null;
            claimed_at?: string | null;
        }
        const existing = db.prepare(
            'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
        ).get(userId, achievement.id) as UserAchievementRow | undefined;

        if (existing?.unlocked_at) continue;

        let shouldUnlock = false;

        switch (achievement.requirement.type) {
            case 'level':
                shouldUnlock = userLevel >= achievement.requirement.target;
                break;

            case 'sessions':
                shouldUnlock = totalSessions >= achievement.requirement.target;
                break;

            case 'correct_answers':
                shouldUnlock = totalCorrect >= achievement.requirement.target;
                break;

            case 'items_owned':
                shouldUnlock = itemsOwned >= achievement.requirement.target;
                break;

            case 'lifetime_coins':
                shouldUnlock = lifetimeCoins >= achievement.requirement.target;
                break;

            case 'tier':
                if (achievement.id === 'math_wizard') {
                    // Special case: all operations at tier 4
                    shouldUnlock = userTiers.addition >= 4 &&
                        userTiers.subtraction >= 4 &&
                        userTiers.multiplication >= 4 &&
                        userTiers.division >= 4;
                } else if (achievement.requirement.operation) {
                    const opTier = userTiers[achievement.requirement.operation] || 0;
                    shouldUnlock = opTier >= achievement.requirement.target;
                }
                break;

            // These are checked during gameplay, not here
            case 'streak':
            case 'speed_answers':
            case 'avg_speed':
            case 'perfect_session':
            case 'league_rank':
                // Skip - handled separately
                break;
        }

        if (shouldUnlock) {
            if (existing) {
                // Update existing record
                db.prepare(
                    'UPDATE user_achievements SET unlocked_at = ? WHERE user_id = ? AND achievement_id = ?'
                ).run(now(), userId, achievement.id);
            } else {
                // Create new record
                db.prepare(`
                    INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(generateId(), userId, achievement.id, achievement.requirement.target, now());
            }
        }
    }
}

/**
 * Update progress for a specific achievement (for incremental achievements)
 */
export async function updateAchievementProgress(userId: string, achievementId: string, progress: number) {
    const db = getDatabase();
    const achievement = getAchievementById(achievementId);
    if (!achievement) return;

    interface UserAchievementRow {
        id: string;
        user_id: string;
        achievement_id: string;
        progress: number;
        unlocked_at?: string | null;
        claimed_at?: string | null;
    }
    const existing = db.prepare(
        'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
    ).get(userId, achievementId) as UserAchievementRow | undefined;

    const newProgress = (existing?.progress || 0) + progress;
    const shouldUnlock = newProgress >= achievement.requirement.target;

    if (existing) {
        if (shouldUnlock && !existing.unlocked_at) {
            db.prepare(
                'UPDATE user_achievements SET progress = ?, unlocked_at = ? WHERE id = ?'
            ).run(newProgress, now(), existing.id);
        } else {
            db.prepare(
                'UPDATE user_achievements SET progress = ? WHERE id = ?'
            ).run(newProgress, existing.id);
        }
    } else {
        db.prepare(`
            INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            generateId(),
            userId,
            achievementId,
            newProgress,
            shouldUnlock ? now() : null
        );
    }
}

/**
 * Check session-specific achievements after a practice session
 */
export async function checkSessionAchievements(
    userId: string,
    correctCount: number,
    totalCount: number,
    avgSpeed: number,
    maxStreak: number
) {
    const db = getDatabase();

    // Perfect session (100% accuracy, min 20 questions)
    if (totalCount >= 20 && correctCount === totalCount) {
        const existing = db.prepare(
            'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
        ).get(userId, 'perfect_session') as {
            id: string;
            user_id: string;
            achievement_id: string;
            unlocked_at?: string | null;
            [key: string]: unknown;
        } | undefined;

        if (!existing?.unlocked_at) {
            if (existing) {
                db.prepare(
                    'UPDATE user_achievements SET unlocked_at = ? WHERE id = ?'
                ).run(now(), existing.id);
            } else {
                db.prepare(`
                    INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(generateId(), userId, 'perfect_session', 1, now());
            }
        }
    }

    // Speed demon (avg under 2 seconds)
    if (avgSpeed > 0 && avgSpeed < 2) {
        const existing = db.prepare(
            'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
        ).get(userId, 'speed_demon') as any;

        if (!existing?.unlocked_at) {
            if (existing) {
                db.prepare(
                    'UPDATE user_achievements SET unlocked_at = ? WHERE id = ?'
                ).run(now(), existing.id);
            } else {
                db.prepare(`
                    INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(generateId(), userId, 'speed_demon', 1, now());
            }
        }
    }

    // Streak master (25+ streak)
    if (maxStreak >= 25) {
        const existing = db.prepare(
            'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
        ).get(userId, 'streak_master') as any;

        if (!existing?.unlocked_at) {
            if (existing) {
                db.prepare(
                    'UPDATE user_achievements SET unlocked_at = ? WHERE id = ?'
                ).run(now(), existing.id);
            } else {
                db.prepare(`
                    INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(generateId(), userId, 'streak_master', maxStreak, now());
            }
        }
    }

    // Also run general achievement check
    await checkAndUnlockAchievements(userId);
}

/**
 * Unlock the "Welcome to FlashMath" achievement when email is verified
 */
export async function unlockEmailVerifiedAchievement(userId: string) {
    const db = getDatabase();
    const achievementId = 'welcome';

    // Check if already unlocked
    interface UserAchievementRow {
        id: string;
        user_id: string;
        achievement_id: string;
        progress: number;
        unlocked_at?: string | null;
        claimed_at?: string | null;
    }
    const existing = db.prepare(
        'SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?'
    ).get(userId, achievementId) as UserAchievementRow | undefined;

    if (existing?.unlocked_at) {
        return; // Already unlocked
    }

    if (existing) {
        // Update existing record
        db.prepare(
            'UPDATE user_achievements SET progress = 1, unlocked_at = ? WHERE id = ?'
        ).run(now(), existing.id);
    } else {
        // Create new record
        db.prepare(`
            INSERT INTO user_achievements (id, user_id, achievement_id, progress, unlocked_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(generateId(), userId, achievementId, 1, now());
    }

    console.log(`[Achievements] Unlocked "Welcome to FlashMath" for user ${userId}`);
}
