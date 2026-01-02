'use server';

import { auth } from "@/auth";
import { queryOne, query, getDatabase } from "@/lib/db";
import { ITEMS } from "@/lib/items";

/**
 * Get arena eligibility data for the current user
 */
export async function getArenaEligibilityData() {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            practiceStats: {
                totalSessions: 0,
                recentAccuracy: null,
                daysSinceLastPractice: 30,
                confidence: 0
            },
            userAge: null
        };
    }

    const userId = session.user.id;
    const userRole = (session.user as any)?.role;

    // Admin bypass - flashadmin skips requirements
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    // Get user data
    const db = getDatabase();

    // User data query
    // User data query
    let user;
    try {
        user = db.prepare(
            "SELECT total_xp, level, created_at, last_active, dob FROM users WHERE id = ?"
        ).get(userId) as any;
    } catch (error: any) {
        // If column doesn't exist, add it and retry
        if (error.message && error.message.includes('no such column: dob')) {
            try {
                db.prepare("ALTER TABLE users ADD COLUMN dob TEXT").run();
                user = db.prepare(
                    "SELECT total_xp, level, created_at, last_active, dob FROM users WHERE id = ?"
                ).get(userId) as any;
            } catch (e) {
                // Fallback to query without dob if migration fails (concurrency safe-ish)
                user = db.prepare(
                    "SELECT total_xp, level, created_at, last_active FROM users WHERE id = ?"
                ).get(userId) as any;
            }
        } else {
            throw error;
        }
    }

    let userAge: number | null = null;
    if (user?.dob) {
        // Parse DOB as local time to avoid timezone shift
        const [year, month, day] = user.dob.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day); // Month is 0-indexed
        const today = new Date();
        userAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            userAge--;
        }
    }

    // Count practice sessions
    const sessionCount = db.prepare(
        "SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = ?"
    ).get(userId) as any;

    // Get recent practice stats (last 7 days)
    const recentStats = db.prepare(`
        SELECT 
            SUM(correct_count) as total_correct,
            SUM(total_count) as total_questions,
            MAX(created_at) as last_session
        FROM practice_sessions
        WHERE user_id = ? AND created_at > datetime('now', '-7 days')
    `).get(userId) as any;

    // Calculate days since last practice
    let daysSinceLastPractice = 30;
    if (recentStats?.last_session) {
        const lastDate = new Date(recentStats.last_session);
        const now = new Date();
        daysSinceLastPractice = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Calculate recent accuracy
    const recentAccuracy = recentStats?.total_questions > 0
        ? Math.round((recentStats.total_correct / recentStats.total_questions) * 100)
        : null;

    // Calculate confidence score (same formula as sqlite-bridge.js)
    const totalSessions = sessionCount?.count || 0;
    const accountAgeDays = user?.created_at
        ? Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)))
        : 1;

    const volumeFactor = Math.min(1, Math.log10(totalSessions + 1) / Math.log10(51));
    const weeksActive = Math.max(1, accountAgeDays / 7);
    const sessionsPerWeek = totalSessions / weeksActive;
    const consistencyFactor = Math.min(1, sessionsPerWeek / 7);
    const recencyFactor = daysSinceLastPractice <= 7
        ? 1
        : Math.max(0, 1 - (daysSinceLastPractice - 7) / 30);

    const confidence = (volumeFactor * 0.4) + (consistencyFactor * 0.3) + (recencyFactor * 0.3);

    return {
        practiceStats: {
            totalSessions,
            recentAccuracy,
            daysSinceLastPractice,
            confidence: Math.round(confidence * 100) / 100
        },
        userAge,
        isAdmin // Admin bypasses all requirements
    };
}

/**
 * Get full matchmaking data for queue join
 */
export async function getMatchmakingData() {
    const session = await auth();

    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const userId = session.user.id;

    // Get user data including math_tiers and equipped_items
    const user = queryOne(
        "SELECT * FROM users WHERE id = ?",
        [userId]
    ) as any;

    if (!user) {
        return { success: false, error: 'User not found' };
    }

    // Parse math_tiers
    let mathTiers = { addition: 0, subtraction: 0, multiplication: 0, division: 0 };
    try {
        mathTiers = JSON.parse(user.math_tiers || '{}');
    } catch (e) {
        // Keep defaults
    }

    // Parse equipped_items for banner data
    let equipped: Record<string, string> = {};
    try {
        equipped = typeof user.equipped_items === 'string'
            ? JSON.parse(user.equipped_items)
            : user.equipped_items || {};
    } catch {
        equipped = {};
    }

    // Get confidence data
    const eligibilityData = await getArenaEligibilityData();

    // Look up title display name from ITEMS
    const titleId = equipped.title || 'default';
    const titleItem = ITEMS.find(i => i.id === titleId);
    const titleDisplayName = titleItem?.assetValue || titleItem?.name || 'Challenger';

    return {
        success: true,
        userId: user.id,
        name: user.name,
        practiceXP: user.total_xp || 0,
        mathTiers,
        confidence: eligibilityData.practiceStats.confidence,
        level: user.level,
        // Banner customization data - resolve Item ID to Style ID
        equippedBanner: (() => {
            const id = equipped.banner || 'default';
            // If it's a raw style ID (legacy), return it
            if (!id.startsWith('banner_') && id !== 'default') return id;
            // Otherwise resolve from ITEMS
            const item = ITEMS.find(i => i.id === id);
            return item?.assetValue || 'default';
        })(),
        equippedTitle: titleDisplayName,
        equippedFrame: equipped.frame || 'default'
    };
}
