'use server';

/**
 * FlashMath Arena - Decay System
 * 
 * Skills decay without practice. This keeps rankings accurate and encourages
 * regular play. Returning players get placement matches for fair re-calibration.
 * 
 * Decay Schedule:
 * - 0-7 days: No decay (grace period)
 * - 8-14 days: -5 ELO/day (warning phase)
 * - 15-30 days: -10 ELO/day (active decay)
 * - 31+ days: -15 ELO/day, -1 tier/week (severe decay)
 * - 60+ days: Flagged as returning player, requires placement matches
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { getDatabase } from '@/lib/db';
import { DECAY, PLACEMENT } from './constants.js';

// =============================================================================
// TYPES
// =============================================================================

export interface DecayStatus {
    daysSinceActivity: number;
    phase: 'active' | 'warning' | 'decaying' | 'severe' | 'returning';
    phaseLabel: string;
    eloAtRisk: number;
    tierAtRisk: number;
    daysUntilNextPhase: number;
    isReturningPlayer: boolean;
    placementMatchesRequired: number;
    placementMatchesCompleted: number;
    totalEloDecayed: number;
    lastDecayApplied: string | null;
}

export interface UserDecayData {
    userId: string;
    lastArenaActivity: string | null;
    decayWarningSent: string | null;
    isReturningPlayer: boolean;
    placementMatchesRequired: number;
    placementMatchesCompleted: number;
    totalEloDecayed: number;
    lastDecayApplied: string | null;
    // Current ELOs for decay calculation
    duelElo: number;
    teamElo: number;
}

// =============================================================================
// DECAY CALCULATION
// =============================================================================

/**
 * Calculate the decay phase based on days since last activity
 * Internal sync version
 */
function getDecayPhaseSync(daysSinceActivity: number): DecayStatus['phase'] {
    if (daysSinceActivity <= DECAY.GRACE_PERIOD_DAYS) {
        return 'active';
    } else if (daysSinceActivity <= DECAY.DECAY_START_DAYS - 1) {
        return 'warning';
    } else if (daysSinceActivity <= DECAY.SEVERE_DECAY_START_DAYS - 1) {
        return 'decaying';
    } else if (daysSinceActivity <= DECAY.RETURNING_PLAYER_DAYS) {
        return 'severe';
    } else {
        return 'returning';
    }
}

/**
 * Calculate the decay phase based on days since last activity
 * Async version for server action compatibility
 */
export async function getDecayPhase(daysSinceActivity: number): Promise<DecayStatus['phase']> {
    return getDecayPhaseSync(daysSinceActivity);
}

/**
 * Get human-readable phase label
 */
function getPhaseLabel(phase: DecayStatus['phase']): string {
    switch (phase) {
        case 'active': return 'Active';
        case 'warning': return 'Decay Warning';
        case 'decaying': return 'Decaying';
        case 'severe': return 'Severe Decay';
        case 'returning': return 'Returning Player';
    }
}

/**
 * Calculate how much ELO would be lost if decay continues
 */
function calculateEloAtRisk(daysSinceActivity: number, daysToCalculate: number = 7): number {
    let totalDecay = 0;
    
    for (let i = 0; i < daysToCalculate; i++) {
        const day = daysSinceActivity + i + 1;
        
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
 * Calculate how many tiers would be lost in severe decay
 */
function calculateTierAtRisk(daysSinceActivity: number, daysToCalculate: number = 7): number {
    if (daysSinceActivity < DECAY.SEVERE_DECAY_START_DAYS) {
        return 0;
    }
    
    // In severe decay: 1 tier per week
    const severeDays = Math.max(0, daysSinceActivity - DECAY.SEVERE_DECAY_START_DAYS);
    const futureServereDays = severeDays + daysToCalculate;
    const currentTierLoss = Math.floor(severeDays / 7);
    const futureTierLoss = Math.floor(futureServereDays / 7);
    
    return futureTierLoss - currentTierLoss;
}

/**
 * Calculate days until next decay phase
 */
function getDaysUntilNextPhase(daysSinceActivity: number): number {
    if (daysSinceActivity <= DECAY.GRACE_PERIOD_DAYS) {
        return DECAY.WARNING_START_DAYS - daysSinceActivity;
    } else if (daysSinceActivity < DECAY.DECAY_START_DAYS) {
        return DECAY.DECAY_START_DAYS - daysSinceActivity;
    } else if (daysSinceActivity < DECAY.SEVERE_DECAY_START_DAYS) {
        return DECAY.SEVERE_DECAY_START_DAYS - daysSinceActivity;
    } else if (daysSinceActivity < DECAY.RETURNING_PLAYER_DAYS) {
        return DECAY.RETURNING_PLAYER_DAYS - daysSinceActivity;
    }
    return 0; // Already at max phase
}

/**
 * Get complete decay status for a user
 */
export async function getDecayStatus(userId: string): Promise<DecayStatus> {
    const db = getDatabase();
    
    const user = db.prepare(`
        SELECT 
            last_arena_activity,
            decay_warning_sent,
            is_returning_player,
            placement_matches_required,
            placement_matches_completed,
            total_elo_decayed,
            last_decay_applied,
            arena_elo_duel,
            arena_elo_team
        FROM users WHERE id = ?
    `).get(userId) as {
        last_arena_activity?: string | null;
        decay_warning_sent?: number;
        is_returning_player?: number;
        placement_matches_required?: number;
        placement_matches_completed?: number;
        total_elo_decayed?: number;
        last_decay_applied?: string | null;
        arena_elo_duel?: number;
        arena_elo_team?: number;
    } | undefined;
    
    if (!user) {
        return {
            daysSinceActivity: 0,
            phase: 'active',
            phaseLabel: 'Active',
            eloAtRisk: 0,
            tierAtRisk: 0,
            daysUntilNextPhase: 7,
            isReturningPlayer: false,
            placementMatchesRequired: 0,
            placementMatchesCompleted: 0,
            totalEloDecayed: 0,
            lastDecayApplied: null,
        };
    }
    
    const lastActivity = user.last_arena_activity 
        ? new Date(user.last_arena_activity) 
        : new Date(); // If never played, treat as active
    
    const daysSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const phase = getDecayPhaseSync(daysSinceActivity);
    
    return {
        daysSinceActivity,
        phase,
        phaseLabel: getPhaseLabel(phase),
        eloAtRisk: calculateEloAtRisk(daysSinceActivity),
        tierAtRisk: calculateTierAtRisk(daysSinceActivity),
        daysUntilNextPhase: getDaysUntilNextPhase(daysSinceActivity),
        isReturningPlayer: !!user.is_returning_player,
        placementMatchesRequired: user.placement_matches_required || 0,
        placementMatchesCompleted: user.placement_matches_completed || 0,
        totalEloDecayed: user.total_elo_decayed || 0,
        lastDecayApplied: user.last_decay_applied ?? null,
    };
}

/**
 * Calculate daily decay for a single user
 * Internal sync version
 */
function calculateDailyDecaySync(daysSinceActivity: number): number {
    if (daysSinceActivity <= DECAY.GRACE_PERIOD_DAYS) {
        return 0;
    } else if (daysSinceActivity < DECAY.DECAY_START_DAYS) {
        return DECAY.WARNING_ELO_DECAY_PER_DAY;
    } else if (daysSinceActivity < DECAY.SEVERE_DECAY_START_DAYS) {
        return DECAY.DECAY_ELO_PER_DAY;
    } else {
        return DECAY.SEVERE_ELO_PER_DAY;
    }
}

/**
 * Calculate daily decay for a single user
 * Async version for server action compatibility
 */
export async function calculateDailyDecay(daysSinceActivity: number): Promise<number> {
    return calculateDailyDecaySync(daysSinceActivity);
}

// =============================================================================
// DECAY APPLICATION
// =============================================================================

/**
 * Apply decay to a single user
 * Called by the scheduled decay job
 */
export async function applyDecayToUser(userId: string): Promise<{
    applied: boolean;
    eloDecayed: number;
    tierDecayed: number;
    becameReturning: boolean;
}> {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    const user = db.prepare(`
        SELECT 
            id, last_arena_activity, last_decay_applied,
            is_returning_player, total_elo_decayed,
            arena_elo_duel, arena_elo_team,
            arena_elo_duel_addition, arena_elo_duel_subtraction,
            arena_elo_duel_multiplication, arena_elo_duel_division
        FROM users WHERE id = ?
    `).get(userId) as {
        id: string;
        last_arena_activity?: string | null;
        last_decay_applied?: string | null;
        is_returning_player?: number;
        total_elo_decayed?: number;
        arena_elo_duel?: number;
        arena_elo_team?: number;
        arena_elo_duel_addition?: number;
        arena_elo_duel_subtraction?: number;
        arena_elo_duel_multiplication?: number;
        arena_elo_duel_division?: number;
    } | undefined;
    
    if (!user || !user.last_arena_activity) {
        return { applied: false, eloDecayed: 0, tierDecayed: 0, becameReturning: false };
    }
    
    // Check if decay was already applied today
    if (user.last_decay_applied) {
        const lastDecay = new Date(user.last_decay_applied);
        const today = new Date();
        if (lastDecay.toDateString() === today.toDateString()) {
            return { applied: false, eloDecayed: 0, tierDecayed: 0, becameReturning: false };
        }
    }
    
    const lastActivity = new Date(user.last_arena_activity);
    const daysSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const eloDecay = calculateDailyDecaySync(daysSinceActivity);
    
    if (eloDecay === 0) {
        return { applied: false, eloDecayed: 0, tierDecayed: 0, becameReturning: false };
    }
    
    // Check if user should become returning player
    let becameReturning = false;
    if (daysSinceActivity >= DECAY.RETURNING_PLAYER_DAYS && !user.is_returning_player) {
        becameReturning = true;
    }
    
    // Apply decay to all ELO columns (with floor protection)
    const newDuelElo = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel || 300) - eloDecay);
    const newTeamElo = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_team || 300) - eloDecay);
    const newDuelAdd = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel_addition || 300) - eloDecay);
    const newDuelSub = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel_subtraction || 300) - eloDecay);
    const newDuelMul = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel_multiplication || 300) - eloDecay);
    const newDuelDiv = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel_division || 300) - eloDecay);
    
    const totalDecayed = (user.total_elo_decayed || 0) + eloDecay;
    
    // Build update query
    let updateFields = `
        arena_elo_duel = ?, arena_elo_team = ?,
        arena_elo_duel_addition = ?, arena_elo_duel_subtraction = ?,
        arena_elo_duel_multiplication = ?, arena_elo_duel_division = ?,
        total_elo_decayed = ?, last_decay_applied = ?
    `;
    const params: any[] = [
        newDuelElo, newTeamElo,
        newDuelAdd, newDuelSub, newDuelMul, newDuelDiv,
        totalDecayed, now
    ];
    
    if (becameReturning) {
        updateFields += `, is_returning_player = 1, placement_matches_required = ?, placement_matches_completed = 0`;
        params.push(PLACEMENT.MATCHES_REQUIRED);
    }
    
    params.push(userId);
    
    db.prepare(`UPDATE users SET ${updateFields} WHERE id = ?`).run(...params);
    
    console.log(`[Decay] Applied ${eloDecay} ELO decay to user ${userId} (${daysSinceActivity} days inactive)`);
    
    return {
        applied: true,
        eloDecayed: eloDecay,
        tierDecayed: 0, // Tier decay handled separately
        becameReturning
    };
}

/**
 * Run decay for all eligible users
 * Should be called by a scheduled job (e.g., daily cron)
 */
export async function runDecayJob(): Promise<{
    usersProcessed: number;
    usersDecayed: number;
    totalEloDecayed: number;
    newReturningPlayers: number;
}> {
    const db = getDatabase();
    
    // Find all users who have played arena and haven't had decay applied today
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DECAY.GRACE_PERIOD_DAYS);
    
    const eligibleUsers = db.prepare(`
        SELECT id FROM users 
        WHERE last_arena_activity IS NOT NULL
        AND last_arena_activity < ?
        AND (last_decay_applied IS NULL OR date(last_decay_applied) < date('now'))
    `).all(cutoffDate.toISOString()) as { id: string }[];
    
    let usersDecayed = 0;
    let totalEloDecayed = 0;
    let newReturningPlayers = 0;
    
    for (const user of eligibleUsers) {
        const result = await applyDecayToUser(user.id);
        if (result.applied) {
            usersDecayed++;
            totalEloDecayed += result.eloDecayed;
            if (result.becameReturning) {
                newReturningPlayers++;
            }
        }
    }
    
    console.log(`[Decay Job] Processed ${eligibleUsers.length} users, decayed ${usersDecayed}, total ELO: ${totalEloDecayed}`);
    
    return {
        usersProcessed: eligibleUsers.length,
        usersDecayed,
        totalEloDecayed,
        newReturningPlayers
    };
}

// =============================================================================
// RETURNING PLAYER SYSTEM
// =============================================================================

/**
 * Check if user is in placement mode
 * Note: This is a pure helper function, not a server action
 */
function isInPlacementModeSync(user: { 
    is_returning_player: number; 
    placement_matches_required: number; 
    placement_matches_completed: number 
}): boolean {
    return !!(user.is_returning_player && user.placement_matches_completed < user.placement_matches_required);
}

/**
 * Async version for server action compatibility
 */
export async function isInPlacementMode(user: { 
    is_returning_player: number; 
    placement_matches_required: number; 
    placement_matches_completed: number 
}): Promise<boolean> {
    return isInPlacementModeSync(user);
}

/**
 * Get placement progress for a returning player
 */
export async function getPlacementProgress(userId: string): Promise<{
    isReturningPlayer: boolean;
    inPlacementMode: boolean;
    matchesRequired: number;
    matchesCompleted: number;
    matchesRemaining: number;
    eloMultiplier: number;
}> {
    const db = getDatabase();
    
    const user = db.prepare(`
        SELECT is_returning_player, placement_matches_required, placement_matches_completed
        FROM users WHERE id = ?
    `).get(userId) as {
        last_arena_activity?: string | null;
        decay_warning_sent?: number;
        is_returning_player?: number;
        placement_matches_required?: number;
        placement_matches_completed?: number;
        total_elo_decayed?: number;
        last_decay_applied?: string | null;
        arena_elo_duel?: number;
        arena_elo_team?: number;
    } | undefined;
    
    if (!user || !user.is_returning_player) {
        return {
            isReturningPlayer: false,
            inPlacementMode: false,
            matchesRequired: 0,
            matchesCompleted: 0,
            matchesRemaining: 0,
            eloMultiplier: 1.0
        };
    }
    
    const placementCompleted = user.placement_matches_completed || 0;
    const placementRequired = user.placement_matches_required || 0;
    const inPlacement = placementCompleted < placementRequired;
    
    return {
        isReturningPlayer: true,
        inPlacementMode: inPlacement,
        matchesRequired: placementRequired,
        matchesCompleted: placementCompleted,
        matchesRemaining: Math.max(0, placementRequired - placementCompleted),
        eloMultiplier: inPlacement ? PLACEMENT.ELO_MULTIPLIER : 1.0
    };
}

/**
 * Record a completed placement match
 */
export async function recordPlacementMatch(userId: string): Promise<{
    placementComplete: boolean;
    matchesRemaining: number;
}> {
    const db = getDatabase();
    
    const user = db.prepare(`
        SELECT is_returning_player, placement_matches_required, placement_matches_completed
        FROM users WHERE id = ?
    `).get(userId) as {
        last_arena_activity?: string | null;
        decay_warning_sent?: number;
        is_returning_player?: number;
        placement_matches_required?: number;
        placement_matches_completed?: number;
        total_elo_decayed?: number;
        last_decay_applied?: string | null;
        arena_elo_duel?: number;
        arena_elo_team?: number;
    } | undefined;
    
    if (!user || !user.is_returning_player) {
        return { placementComplete: true, matchesRemaining: 0 };
    }
    
    const newCompleted = (user.placement_matches_completed || 0) + 1;
    const placementRequired = user.placement_matches_required || 0;
    const isComplete = newCompleted >= placementRequired;
    
    if (isComplete) {
        // Exit returning player mode
        db.prepare(`
            UPDATE users SET 
                placement_matches_completed = ?,
                is_returning_player = 0
            WHERE id = ?
        `).run(newCompleted, userId);
        
        console.log(`[Placement] User ${userId} completed placement matches`);
    } else {
        db.prepare(`
            UPDATE users SET placement_matches_completed = ?
            WHERE id = ?
        `).run(newCompleted, userId);
    }
    
    return {
        placementComplete: isComplete,
        matchesRemaining: Math.max(0, placementRequired - newCompleted)
    };
}

/**
 * Update last arena activity timestamp
 * Called after every arena match
 */
export async function updateArenaActivity(userId: string): Promise<void> {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    db.prepare(`
        UPDATE users SET last_arena_activity = ?
        WHERE id = ?
    `).run(now, userId);
}

/**
 * Apply soft reset for moderate inactivity (30-60 days)
 * Called when player returns after moderate absence
 */
export async function applySoftReset(userId: string): Promise<{
    applied: boolean;
    eloReduction: number;
}> {
    const db = getDatabase();
    
    const user = db.prepare(`
        SELECT last_arena_activity, arena_elo_duel, arena_elo_team
        FROM users WHERE id = ?
    `).get(userId) as {
        last_arena_activity?: string | null;
        arena_elo_duel?: number;
        arena_elo_team?: number;
    } | undefined;
    
    if (!user || !user.last_arena_activity) {
        return { applied: false, eloReduction: 0 };
    }
    
    const lastActivity = new Date(user.last_arena_activity);
    const daysSinceActivity = Math.floor(
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Only apply soft reset for moderate inactivity (30-60 days)
    if (daysSinceActivity < PLACEMENT.SOFT_RESET_DAYS || daysSinceActivity >= DECAY.RETURNING_PLAYER_DAYS) {
        return { applied: false, eloReduction: 0 };
    }
    
    const reduction = PLACEMENT.SOFT_RESET_ELO_PENALTY;
    const newDuelElo = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_duel || 300) - reduction);
    const newTeamElo = Math.max(DECAY.MIN_ELO_FLOOR, (user.arena_elo_team || 300) - reduction);
    
    db.prepare(`
        UPDATE users SET 
            arena_elo_duel = ?,
            arena_elo_team = ?,
            total_elo_decayed = COALESCE(total_elo_decayed, 0) + ?
        WHERE id = ?
    `).run(newDuelElo, newTeamElo, reduction, userId);
    
    console.log(`[Soft Reset] Applied ${reduction} ELO reduction to user ${userId}`);
    
    return { applied: true, eloReduction: reduction };
}

