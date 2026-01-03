'use server';

/**
 * Confidence Calculation Server Actions
 * 
 * Provides detailed confidence breakdown for the FlashAuditor UI.
 */

import { auth } from "@/auth";
import { getDatabase } from "@/lib/db";
import { getDecayStatus, DecayStatus } from "@/lib/arena/decay";

// =============================================================================
// TYPES
// =============================================================================

export interface ConfidenceBreakdown {
    overall: number;           // 0-1 overall confidence
    volume: number;            // 0-1 volume factor
    consistency: number;       // 0-1 consistency factor
    recency: number;           // 0-1 recency factor
    totalSessions: number;     // Total practice sessions
    sessionsPerWeek: number;   // Average sessions per week
    daysSinceLastPractice: number;
    bracket: 'NEWCOMER' | 'DEVELOPING' | 'ESTABLISHED';
}

export interface ConfidenceResult {
    confidence: ConfidenceBreakdown;
    decay: DecayStatus;
}

// =============================================================================
// CONFIDENCE CALCULATION
// =============================================================================

/**
 * Calculate confidence score with full breakdown
 * 
 * Confidence Components:
 * - Volume (40%): Total practice sessions (logarithmic scale, max at 50 sessions)
 * - Consistency (30%): Sessions per week (max at 7 sessions/week)
 * - Recency (30%): Days since last practice (100% if ≤7 days, decays to 0 at 37 days)
 */
export async function getConfidenceBreakdown(userId?: string): Promise<ConfidenceResult | null> {
    const session = await auth();
    const targetId = userId || (session?.user as any)?.id;
    
    if (!targetId) {
        return null;
    }
    
    try {
        const db = getDatabase();
        
        // Get user data
        const user = db.prepare(`
            SELECT created_at, last_arena_activity
            FROM users WHERE id = ?
        `).get(targetId) as any;
        
        if (!user) {
            return null;
        }
        
        // Count practice sessions
        const sessionCount = db.prepare(`
            SELECT COUNT(*) as count 
            FROM practice_sessions 
            WHERE user_id = ?
        `).get(targetId) as { count: number } | undefined;
        
        // Get last practice session
        const lastSession = db.prepare(`
            SELECT created_at 
            FROM practice_sessions 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `).get(targetId) as { created_at: string } | undefined;
        
        const totalSessions = sessionCount?.count || 0;
        
        // Calculate days since last practice
        const daysSinceLastPractice = lastSession?.created_at
            ? Math.max(0, Math.floor((Date.now() - new Date(lastSession.created_at).getTime()) / (1000 * 60 * 60 * 24)))
            : 999; // Never practiced
        
        // Calculate account age for consistency
        const accountAgeDays = user?.created_at
            ? Math.max(1, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)))
            : 1;
        
        // =================================================================
        // VOLUME FACTOR (40%)
        // Logarithmic scale: reaches 100% at 50 sessions
        // =================================================================
        const volumeFactor = Math.min(1, Math.log10(totalSessions + 1) / Math.log10(51));
        
        // =================================================================
        // CONSISTENCY FACTOR (30%)
        // Based on sessions per week, max at 7/week (daily practice)
        // =================================================================
        const weeksActive = Math.max(1, accountAgeDays / 7);
        const sessionsPerWeek = totalSessions / weeksActive;
        const consistencyFactor = Math.min(1, sessionsPerWeek / 7);
        
        // =================================================================
        // RECENCY FACTOR (30%)
        // 100% if ≤7 days, decays to 0 at 37 days
        // =================================================================
        const recencyFactor = daysSinceLastPractice <= 7
            ? 1
            : Math.max(0, 1 - (daysSinceLastPractice - 7) / 30);
        
        // =================================================================
        // OVERALL CONFIDENCE
        // =================================================================
        const overall = (volumeFactor * 0.4) + (consistencyFactor * 0.3) + (recencyFactor * 0.3);
        
        // Determine bracket
        let bracket: ConfidenceBreakdown['bracket'];
        if (overall >= 0.7) {
            bracket = 'ESTABLISHED';
        } else if (overall >= 0.3) {
            bracket = 'DEVELOPING';
        } else {
            bracket = 'NEWCOMER';
        }
        
        // Get decay status
        const decay = await getDecayStatus(targetId);
        
        return {
            confidence: {
                overall: Math.round(overall * 100) / 100,
                volume: Math.round(volumeFactor * 100) / 100,
                consistency: Math.round(consistencyFactor * 100) / 100,
                recency: Math.round(recencyFactor * 100) / 100,
                totalSessions,
                sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10,
                daysSinceLastPractice: daysSinceLastPractice === 999 ? -1 : daysSinceLastPractice,
                bracket
            },
            decay
        };
    } catch (error) {
        console.error('[Confidence] Error calculating breakdown:', error);
        return null;
    }
}

/**
 * Get simple confidence score (0-1)
 * For use in matchmaking and quick checks
 */
export async function getConfidenceScore(userId?: string): Promise<number> {
    const result = await getConfidenceBreakdown(userId);
    return result?.confidence.overall ?? 0.5;
}

/**
 * Check if user needs placement matches
 */
export async function needsPlacementMatches(userId?: string): Promise<{
    needsPlacement: boolean;
    matchesRequired: number;
    matchesCompleted: number;
}> {
    const result = await getConfidenceBreakdown(userId);
    
    if (!result || !result.decay.isReturningPlayer) {
        return { needsPlacement: false, matchesRequired: 0, matchesCompleted: 0 };
    }
    
    const inPlacement = result.decay.placementMatchesCompleted < result.decay.placementMatchesRequired;
    
    return {
        needsPlacement: inPlacement,
        matchesRequired: result.decay.placementMatchesRequired,
        matchesCompleted: result.decay.placementMatchesCompleted
    };
}


