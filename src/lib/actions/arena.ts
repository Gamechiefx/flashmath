'use server';

import { auth } from "@/auth";
import { queryOne, query, getDatabase } from "@/lib/db";
import { ITEMS } from "@/lib/items";
import { getDecayStatus } from "@/lib/arena/decay";

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

    // Admin and moderator bypass - skip requirements
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'moderator';

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

    // Get decay status for the user
    const decayStatus = await getDecayStatus(userId);

    // Determine confidence bracket
    let bracket: 'NEWCOMER' | 'DEVELOPING' | 'ESTABLISHED';
    if (confidence >= 0.7) {
        bracket = 'ESTABLISHED';
    } else if (confidence >= 0.3) {
        bracket = 'DEVELOPING';
    } else {
        bracket = 'NEWCOMER';
    }

    return {
        practiceStats: {
            totalSessions,
            recentAccuracy,
            daysSinceLastPractice,
            confidence: Math.round(confidence * 100) / 100
        },
        // Full confidence breakdown for FlashAuditor
        confidenceBreakdown: {
            overall: Math.round(confidence * 100) / 100,
            volume: Math.round(volumeFactor * 100) / 100,
            consistency: Math.round(consistencyFactor * 100) / 100,
            recency: Math.round(recencyFactor * 100) / 100,
            totalSessions,
            sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10,
            daysSinceLastPractice,
            bracket
        },
        // Decay status
        decayInfo: {
            phase: decayStatus.phase,
            phaseLabel: decayStatus.phaseLabel,
            daysUntilNextPhase: decayStatus.daysUntilNextPhase,
            eloAtRisk: decayStatus.eloAtRisk,
            isReturningPlayer: decayStatus.isReturningPlayer,
            placementMatchesRequired: decayStatus.placementMatchesRequired,
            placementMatchesCompleted: decayStatus.placementMatchesCompleted
        },
        userAge,
        isAdmin // Admin bypasses all requirements
    };
}

/**
 * Check if a specific user is eligible for arena play
 * Used for party eligibility checks when queuing
 */
export async function checkUserArenaEligibility(userId: string): Promise<{
    isEligible: boolean;
    reason?: string;
    details: {
        hasEnoughPractice: boolean;
        meetsAgeRequirement: boolean;
        hasVerifiedEmail: boolean;
        totalSessions: number;
        requiredSessions: number;
        userAge: number | null;
        requiredAge: number;
    };
}> {
    const db = getDatabase();
    
    // Requirements
    const MIN_SESSIONS = 1;
    const MIN_AGE = 13;
    
    // Get user data
    let user;
    try {
        user = db.prepare(`
            SELECT id, name, role, is_admin, dob, email_verified 
            FROM users WHERE id = ?
        `).get(userId) as any;
    } catch (error: any) {
        // Handle missing dob column
        if (error.message?.includes('no such column: dob')) {
            user = db.prepare(`
                SELECT id, name, role, is_admin, email_verified 
                FROM users WHERE id = ?
            `).get(userId) as any;
        } else {
            throw error;
        }
    }
    
    if (!user) {
        return {
            isEligible: false,
            reason: 'User not found',
            details: {
                hasEnoughPractice: false,
                meetsAgeRequirement: false,
                hasVerifiedEmail: false,
                totalSessions: 0,
                requiredSessions: MIN_SESSIONS,
                userAge: null,
                requiredAge: MIN_AGE,
            }
        };
    }
    
    // Admin/moderator bypass
    const isAdmin = user.role === 'admin' || user.role === 'super_admin' || 
                    user.role === 'moderator' || user.is_admin;
    
    if (isAdmin) {
        return {
            isEligible: true,
            details: {
                hasEnoughPractice: true,
                meetsAgeRequirement: true,
                hasVerifiedEmail: true,
                totalSessions: 999,
                requiredSessions: MIN_SESSIONS,
                userAge: 99,
                requiredAge: MIN_AGE,
            }
        };
    }
    
    // Count practice sessions
    const sessionCount = db.prepare(
        "SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = ?"
    ).get(userId) as any;
    const totalSessions = sessionCount?.count || 0;
    const hasEnoughPractice = totalSessions >= MIN_SESSIONS;
    
    // Check age
    let userAge: number | null = null;
    if (user?.dob) {
        const [year, month, day] = user.dob.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day);
        const today = new Date();
        userAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            userAge--;
        }
    }
    const meetsAgeRequirement = userAge !== null && userAge >= MIN_AGE;
    
    // Check email verification (new requirement)
    const hasVerifiedEmail = !!user.email_verified;
    
    // Determine eligibility
    const isEligible = hasEnoughPractice && meetsAgeRequirement && hasVerifiedEmail;
    
    // Build reason if not eligible
    let reason: string | undefined;
    if (!isEligible) {
        const issues = [];
        if (!hasVerifiedEmail) issues.push('email not verified');
        if (!meetsAgeRequirement) issues.push('age requirement not met');
        if (!hasEnoughPractice) issues.push(`needs ${MIN_SESSIONS - totalSessions} more practice session(s)`);
        reason = issues.join(', ');
    }
    
    return {
        isEligible,
        reason,
        details: {
            hasEnoughPractice,
            meetsAgeRequirement,
            hasVerifiedEmail,
            totalSessions,
            requiredSessions: MIN_SESSIONS,
            userAge,
            requiredAge: MIN_AGE,
        }
    };
}

/**
 * Check arena eligibility for all members of a party
 * Returns list of ineligible members with reasons
 */
export async function checkPartyArenaEligibility(memberIds: string[]): Promise<{
    allEligible: boolean;
    ineligibleMembers: Array<{
        userId: string;
        userName?: string;
        reason: string;
    }>;
}> {
    const db = getDatabase();
    const ineligibleMembers: Array<{ userId: string; userName?: string; reason: string }> = [];
    
    for (const memberId of memberIds) {
        const eligibility = await checkUserArenaEligibility(memberId);
        
        if (!eligibility.isEligible) {
            // Get user name for display
            const user = db.prepare('SELECT name FROM users WHERE id = ?').get(memberId) as any;
            ineligibleMembers.push({
                userId: memberId,
                userName: user?.name,
                reason: eligibility.reason || 'Does not meet arena requirements'
            });
        }
    }
    
    return {
        allEligible: ineligibleMembers.length === 0,
        ineligibleMembers
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
