'use server';

/**
 * Decay Email Actions
 * Server actions for sending decay-related emails to users
 */

import { getDatabase } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { DECAY } from '@/lib/arena/constants.js';
import {
    decayWarningEmailTemplate,
    decayStartedEmailTemplate,
    severeDecayEmailTemplate,
    returningPlayerEmailTemplate,
    placementCompleteEmailTemplate,
} from '@/lib/email/templates';

// =============================================================================
// TYPES
// =============================================================================

interface DecayEmailUser {
    id: string;
    email: string;
    username: string;
    last_arena_activity: string | null;
    decay_warning_sent: string | null;
    decay_started_email_sent: string | null;
    severe_decay_email_sent: string | null;
    arena_elo_duel: number;
    total_elo_decayed: number;
    is_returning_player: number;
    placement_matches_required: number;
    placement_matches_completed: number;
}

interface EmailSendResult {
    userId: string;
    emailType: string;
    success: boolean;
    error?: string;
}

// =============================================================================
// EMAIL SENDING FUNCTIONS
// =============================================================================

/**
 * Send decay warning email (first warning at day 8)
 */
export async function sendDecayWarningEmail(
    user: DecayEmailUser,
    daysInactive: number
): Promise<EmailSendResult> {
    const eloAtRisk = calculateEloAtRisk(daysInactive, 7);
    const daysUntilDecay = Math.max(0, DECAY.DECAY_START_DAYS - daysInactive);
    
    const { subject, html, text } = decayWarningEmailTemplate(
        user.username,
        {
            daysInactive,
            currentElo: user.arena_elo_duel || 300,
            eloAtRisk,
            daysUntilDecay,
        }
    );
    
    const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
    });
    
    if (result.success) {
        // Update that we sent the warning
        const db = getDatabase();
        db.prepare(`
            UPDATE users SET decay_warning_sent = ? WHERE id = ?
        `).run(new Date().toISOString(), user.id);
    }
    
    return {
        userId: user.id,
        emailType: 'decay_warning',
        success: result.success,
        error: result.error,
    };
}

/**
 * Send decay started email (day 15 - active decay begins)
 */
export async function sendDecayStartedEmail(
    user: DecayEmailUser,
    daysInactive: number
): Promise<EmailSendResult> {
    const daysUntilSevere = Math.max(0, DECAY.SEVERE_DECAY_START_DAYS - daysInactive);
    
    const { subject, html, text } = decayStartedEmailTemplate(
        user.username,
        {
            daysInactive,
            currentElo: user.arena_elo_duel || 300,
            eloLostSoFar: user.total_elo_decayed || 0,
            dailyDecayRate: DECAY.DECAY_ELO_PER_DAY,
            daysUntilSevere,
        }
    );
    
    const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
    });
    
    if (result.success) {
        const db = getDatabase();
        db.prepare(`
            UPDATE users SET decay_started_email_sent = ? WHERE id = ?
        `).run(new Date().toISOString(), user.id);
    }
    
    return {
        userId: user.id,
        emailType: 'decay_started',
        success: result.success,
        error: result.error,
    };
}

/**
 * Send severe decay email (day 31 - critical alert)
 */
export async function sendSevereDecayEmail(
    user: DecayEmailUser,
    daysInactive: number,
    originalElo: number
): Promise<EmailSendResult> {
    const daysUntilReturning = Math.max(0, DECAY.RETURNING_PLAYER_DAYS - daysInactive);
    const tierAtRisk = Math.ceil((DECAY.RETURNING_PLAYER_DAYS - daysInactive) / 7);
    
    const { subject, html, text } = severeDecayEmailTemplate(
        user.username,
        {
            daysInactive,
            currentElo: user.arena_elo_duel || 300,
            originalElo: originalElo,
            totalEloLost: user.total_elo_decayed || 0,
            tierAtRisk: Math.min(tierAtRisk, 4), // Max 4 tiers
            daysUntilReturning,
        }
    );
    
    const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
    });
    
    if (result.success) {
        const db = getDatabase();
        db.prepare(`
            UPDATE users SET severe_decay_email_sent = ? WHERE id = ?
        `).run(new Date().toISOString(), user.id);
    }
    
    return {
        userId: user.id,
        emailType: 'severe_decay',
        success: result.success,
        error: result.error,
    };
}

/**
 * Send returning player welcome email (day 60+)
 */
export async function sendReturningPlayerEmail(
    user: DecayEmailUser,
    daysAway: number,
    previousElo: number
): Promise<EmailSendResult> {
    const { subject, html, text } = returningPlayerEmailTemplate(
        user.username,
        {
            daysAway,
            previousElo,
            currentElo: user.arena_elo_duel || 300,
            totalDecayed: user.total_elo_decayed || 0,
            placementMatchesRequired: user.placement_matches_required || 3,
        }
    );
    
    const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
    });
    
    return {
        userId: user.id,
        emailType: 'returning_player',
        success: result.success,
        error: result.error,
    };
}

/**
 * Send placement complete celebration email
 */
export async function sendPlacementCompleteEmail(
    userId: string,
    placementStats: {
        finalElo: number;
        startingElo: number;
        wins: number;
        losses: number;
        averageTime: number;
        bestStreak: number;
    }
): Promise<EmailSendResult> {
    const db = getDatabase();
    
    const user = db.prepare(`
        SELECT id, email, username FROM users WHERE id = ?
    `).get(userId) as { id: string; email: string; username: string } | undefined;
    
    if (!user || !user.email) {
        return {
            userId,
            emailType: 'placement_complete',
            success: false,
            error: 'User not found or no email',
        };
    }
    
    const eloChange = placementStats.finalElo - placementStats.startingElo;
    
    const { subject, html, text } = placementCompleteEmailTemplate(
        user.username,
        {
            ...placementStats,
            eloChange,
        }
    );
    
    const result = await sendEmail({
        to: user.email,
        subject,
        html,
        text,
    });
    
    return {
        userId: user.id,
        emailType: 'placement_complete',
        success: result.success,
        error: result.error,
    };
}

// =============================================================================
// DECAY PHASE EMAIL PROCESSING
// =============================================================================

/**
 * Process and send decay emails for all users based on their inactivity phase
 * Called by the decay cron job
 * @param newReturningPlayerIds - IDs of users who just became returning players
 */
export async function processDecayEmails(
    newReturningPlayerIds: string[] = []
): Promise<{
    warningsSent: number;
    decayStartedSent: number;
    severeSent: number;
    returningSent: number;
    errors: EmailSendResult[];
}> {
    const db = getDatabase();
    const now = new Date();
    const results = {
        warningsSent: 0,
        decayStartedSent: 0,
        severeSent: 0,
        returningSent: 0,
        errors: [] as EmailSendResult[],
    };
    
    // Get all users with arena activity who might need emails
    const users = db.prepare(`
        SELECT 
            id, email, username,
            last_arena_activity,
            decay_warning_sent,
            decay_started_email_sent,
            severe_decay_email_sent,
            arena_elo_duel,
            total_elo_decayed,
            is_returning_player,
            placement_matches_required,
            placement_matches_completed
        FROM users
        WHERE last_arena_activity IS NOT NULL
        AND email IS NOT NULL
        AND email_verified IS NOT NULL
    `).all() as DecayEmailUser[];
    
    for (const user of users) {
        if (!user.last_arena_activity) continue;
        
        const lastActivity = new Date(user.last_arena_activity);
        const daysInactive = Math.floor(
            (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Skip active users
        if (daysInactive <= DECAY.GRACE_PERIOD_DAYS) continue;
        
        try {
            // Check each phase and send appropriate email if not already sent
            
            // Warning phase (8-14 days) - send once
            if (daysInactive >= DECAY.WARNING_START_DAYS && 
                daysInactive < DECAY.DECAY_START_DAYS &&
                !user.decay_warning_sent) {
                const result = await sendDecayWarningEmail(user, daysInactive);
                if (result.success) {
                    results.warningsSent++;
                } else {
                    results.errors.push(result);
                }
            }
            
            // Decay phase (15-30 days) - send once when entering
            if (daysInactive >= DECAY.DECAY_START_DAYS && 
                daysInactive < DECAY.SEVERE_DECAY_START_DAYS &&
                !user.decay_started_email_sent) {
                const result = await sendDecayStartedEmail(user, daysInactive);
                if (result.success) {
                    results.decayStartedSent++;
                } else {
                    results.errors.push(result);
                }
            }
            
            // Severe decay phase (31-60 days) - send once when entering
            if (daysInactive >= DECAY.SEVERE_DECAY_START_DAYS && 
                daysInactive < DECAY.RETURNING_PLAYER_DAYS &&
                !user.severe_decay_email_sent) {
                // Estimate original ELO (current + decayed)
                const estimatedOriginalElo = (user.arena_elo_duel || 300) + (user.total_elo_decayed || 0);
                const result = await sendSevereDecayEmail(user, daysInactive, estimatedOriginalElo);
                if (result.success) {
                    results.severeSent++;
                } else {
                    results.errors.push(result);
                }
            }
            
        } catch (error) {
            results.errors.push({
                userId: user.id,
                emailType: 'unknown',
                success: false,
                error: String(error),
            });
        }
    }
    
    // Send returning player emails to newly flagged returning players
    for (const returningUserId of newReturningPlayerIds) {
        try {
            const returningUser = db.prepare(`
                SELECT 
                    id, email, username,
                    last_arena_activity,
                    arena_elo_duel,
                    total_elo_decayed,
                    placement_matches_required
                FROM users WHERE id = ?
            `).get(returningUserId) as {
                id: string;
                email: string;
                username: string;
                last_arena_activity: string;
                arena_elo_duel: number;
                total_elo_decayed: number;
                placement_matches_required: number;
            } | undefined;
            
            if (returningUser && returningUser.email) {
                const lastActivity = new Date(returningUser.last_arena_activity);
                const daysAway = Math.floor(
                    (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
                );
                const previousElo = (returningUser.arena_elo_duel || 300) + (returningUser.total_elo_decayed || 0);
                
                const result = await sendReturningPlayerEmail(
                    returningUser as DecayEmailUser,
                    daysAway,
                    previousElo
                );
                
                if (result.success) {
                    results.returningSent++;
                } else {
                    results.errors.push(result);
                }
            }
        } catch (error) {
            results.errors.push({
                userId: returningUserId,
                emailType: 'returning_player',
                success: false,
                error: String(error),
            });
        }
    }
    
    console.log(`[Decay Emails] Sent - Warnings: ${results.warningsSent}, ` +
        `Decay Started: ${results.decayStartedSent}, Severe: ${results.severeSent}, ` +
        `Returning: ${results.returningSent}, Errors: ${results.errors.length}`);
    
    return results;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate how much ELO would be lost over a period
 */
function calculateEloAtRisk(currentDaysInactive: number, futureDays: number): number {
    let totalDecay = 0;
    
    for (let i = 0; i < futureDays; i++) {
        const day = currentDaysInactive + i + 1;
        
        if (day <= DECAY.GRACE_PERIOD_DAYS) {
            // No decay
        } else if (day < DECAY.DECAY_START_DAYS) {
            totalDecay += DECAY.WARNING_ELO_DECAY_PER_DAY;
        } else if (day < DECAY.SEVERE_DECAY_START_DAYS) {
            totalDecay += DECAY.DECAY_ELO_PER_DAY;
        } else {
            totalDecay += DECAY.SEVERE_ELO_PER_DAY;
        }
    }
    
    return totalDecay;
}

/**
 * Reset decay email flags when user becomes active again
 * Should be called when a user completes an arena match
 */
export async function resetDecayEmailFlags(userId: string): Promise<void> {
    const db = getDatabase();
    
    db.prepare(`
        UPDATE users SET 
            decay_warning_sent = NULL,
            decay_started_email_sent = NULL,
            severe_decay_email_sent = NULL
        WHERE id = ?
    `).run(userId);
}
