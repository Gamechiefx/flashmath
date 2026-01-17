/**
 * Debug & Structured Logging Utilities
 * 
 * Two modes of operation:
 * 
 * 1. DEV-ONLY LOGGING (devLog, devWarn, etc.)
 *    - Enabled in development (NODE_ENV=development)
 *    - Disabled and tree-shaken in production builds
 * 
 * 2. STRUCTURED LOGGING (log.info, log.error, etc.)
 *    - Always enabled (for Loki/Grafana observability)
 *    - Outputs JSON format for easy parsing
 *    - Includes level, timestamp, and structured data
 * 
 * Usage:
 *   // Dev-only (tree-shaken in prod)
 *   import { devLog } from '@/lib/debug';
 *   devLog('[Module] Debug message', { data: value });
 * 
 *   // Structured (always logs, for observability)
 *   import { log } from '@/lib/debug';
 *   log.info('User login', { userId: 'abc', method: 'POST', path: '/auth/login' });
 *   log.error('Database failed', { error: err.message });
 */

const isDev = process.env.NODE_ENV === 'development';

// =============================================================================
// DEV-ONLY LOGGING (tree-shaken in production)
// =============================================================================

/**
 * Log a message only in development mode
 * In production, this is a no-op and will be tree-shaken
 */
export function devLog(...args: unknown[]): void {
    if (isDev) {
        console.log(...args);
    }
}

/**
 * Log a warning only in development mode
 */
export function devWarn(...args: unknown[]): void {
    if (isDev) {
        console.warn(...args);
    }
}

/**
 * Log an error only in development mode
 * Note: Consider using log.error() for production errors
 */
export function devError(...args: unknown[]): void {
    if (isDev) {
        console.error(...args);
    }
}

/**
 * Start a timer only in development mode
 */
export function devTime(label: string): void {
    if (isDev) {
        console.time(label);
    }
}

/**
 * End a timer only in development mode
 */
export function devTimeEnd(label: string): void {
    if (isDev) {
        console.timeEnd(label);
    }
}

/**
 * Structured debug log with timing information
 * Useful for performance instrumentation
 */
export function devInstrument(
    location: string,
    message: string,
    data?: Record<string, unknown>
): void {
    if (isDev) {
        console.log(`[DEBUG] ${location} | ${message}`, data ? JSON.stringify(data) : '');
    }
}

/**
 * Create a scoped logger for a specific module (dev-only)
 * Returns functions that prefix all logs with the module name
 */
export function createDevLogger(moduleName: string) {
    return {
        log: (...args: unknown[]) => devLog(`[${moduleName}]`, ...args),
        warn: (...args: unknown[]) => devWarn(`[${moduleName}]`, ...args),
        error: (...args: unknown[]) => devError(`[${moduleName}]`, ...args),
        time: (label: string) => devTime(`[${moduleName}] ${label}`),
        timeEnd: (label: string) => devTimeEnd(`[${moduleName}] ${label}`),
        instrument: (location: string, message: string, data?: Record<string, unknown>) =>
            devInstrument(`${moduleName}:${location}`, message, data),
    };
}

// =============================================================================
// STRUCTURED LOGGING (always enabled, for Loki/Grafana observability)
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogType = 'http' | 'session' | 'social' | 'arena' | 'game' | 'system' | 'auth';

interface StructuredLogData {
    // Standard fields (per Loki team schema)
    type?: LogType;
    action?: string;
    error?: string;
    
    // HTTP request fields
    method?: string;
    path?: string;
    status?: number;
    duration_ms?: number;
    client_ip?: string;
    user_agent?: string;
    
    // User context (kept as fields, not Loki labels)
    user?: string;
    userId?: string;
    sessionId?: string;
    session_id?: string;
    request_id?: string;
    
    // Session fields
    coins?: number;
    banned?: boolean;
    
    // Arena/Game fields
    arena_id?: string;
    match_id?: string;
    party_id?: string;
    opponent?: string;
    score?: number;
    
    // Module identifier
    module?: string;
    
    // Any additional fields
    [key: string]: unknown;
}

/**
 * Output a structured JSON log line
 * Format: {"level":"info","msg":"...","timestamp":"...","field":"value"}
 */
function structuredLog(level: LogLevel, message: string, data?: StructuredLogData): void {
    const logEntry = {
        level,
        msg: message,
        timestamp: new Date().toISOString(),
        ...data,
    };
    
    // Use appropriate console method based on level
    const output = JSON.stringify(logEntry);
    switch (level) {
        case 'error':
            console.error(output);
            break;
        case 'warn':
            console.warn(output);
            break;
        case 'debug':
            // Debug only in development
            if (isDev) {
                console.log(output);
            }
            break;
        default:
            console.log(output);
    }
}

/**
 * Structured logger for production observability
 * Outputs JSON format compatible with Loki/Grafana
 * 
 * @example
 * log.info('Request completed', { method: 'POST', path: '/api/user', status: 200, duration_ms: 45 });
 * log.error('Database connection failed', { error: err.message });
 */
export const log = {
    /**
     * Debug level - only outputs in development
     */
    debug: (message: string, data?: StructuredLogData) => structuredLog('debug', message, data),
    
    /**
     * Info level - general operational messages
     * Example: log.info('User logged in', { userId: 'abc123' });
     */
    info: (message: string, data?: StructuredLogData) => structuredLog('info', message, data),
    
    /**
     * Warning level - potential issues
     * Example: log.warn('Rate limit approaching', { current: 95, limit: 100 });
     */
    warn: (message: string, data?: StructuredLogData) => structuredLog('warn', message, data),
    
    /**
     * Error level - errors that need attention
     * Example: log.error('Payment failed', { error: err.message, userId: 'abc' });
     */
    error: (message: string, data?: StructuredLogData) => structuredLog('error', message, data),
    
    /**
     * HTTP request logging helper
     * Example: log.http('POST', '/api/practice', 200, 79);
     */
    http: (method: string, path: string, status: number, duration_ms: number, extra?: StructuredLogData) => {
        const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
        structuredLog(level, `${method} ${path} ${status}`, { method, path, status, duration_ms, ...extra });
    },
};

/**
 * Create a scoped structured logger for a specific module
 * Adds 'module' field to all log entries
 * 
 * @example
 * const logger = createLogger('ArenaSocket');
 * logger.info('Connected', { playerId: 'abc' });
 * // Output: {"level":"info","msg":"Connected","module":"ArenaSocket","playerId":"abc",...}
 */
export function createLogger(moduleName: string) {
    return {
        debug: (message: string, data?: StructuredLogData) => 
            structuredLog('debug', message, { module: moduleName, ...data }),
        info: (message: string, data?: StructuredLogData) => 
            structuredLog('info', message, { module: moduleName, ...data }),
        warn: (message: string, data?: StructuredLogData) => 
            structuredLog('warn', message, { module: moduleName, ...data }),
        error: (message: string, data?: StructuredLogData) => 
            structuredLog('error', message, { module: moduleName, ...data }),
        http: (method: string, path: string, status: number, duration_ms: number, extra?: StructuredLogData) => {
            const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            structuredLog(level, `${method} ${path} ${status}`, { module: moduleName, type: 'http', method, path, status, duration_ms, ...extra });
        },
    };
}

// =============================================================================
// SPECIALIZED LOGGERS (per Loki team schema)
// =============================================================================

/**
 * Session logging - for auth and session events
 * 
 * @example
 * sessionLog.userLoaded('josh_hill', 'sess_123', { coins: 531, banned: false });
 * sessionLog.loginSuccess('josh_hill', 'sess_123');
 * sessionLog.loginFailed('unknown', 'Invalid password');
 */
export const sessionLog = {
    // === Login/Logout ===
    userLoaded: (user: string, session_id: string, extra?: { coins?: number; banned?: boolean }) =>
        structuredLog('info', 'User loaded', { type: 'session', action: 'user_loaded', user, session_id, ...extra }),
    
    loginAttempt: (email: string) =>
        structuredLog('info', 'Login attempt', { type: 'session', action: 'login_attempt', email }),
    
    loginSuccess: (user: string, email: string) =>
        structuredLog('info', 'Login successful', { type: 'session', action: 'login', user, email }),
    
    loginFailed: (email: string, reason: string) =>
        structuredLog('warn', 'Login failed', { type: 'session', action: 'login_failed', email, reason }),
    
    logout: (user: string, session_id: string) =>
        structuredLog('info', 'User logged out', { type: 'session', action: 'logout', user, session_id }),
    
    // === Session Lifecycle ===
    sessionCreated: (user: string, session_id: string) =>
        structuredLog('info', 'Session created', { type: 'session', action: 'session_created', user, session_id }),
    
    sessionValidated: (user: string, session_id: string) =>
        structuredLog('debug', 'Session validated', { type: 'session', action: 'validate', user, session_id }),
    
    sessionExpired: (user: string, session_id: string) =>
        structuredLog('info', 'Session expired', { type: 'session', action: 'expired', user, session_id }),
    
    sessionRevoked: (user: string, session_id: string) =>
        structuredLog('info', 'Session revoked', { type: 'session', action: 'session_revoked', user, session_id }),
    
    allSessionsRevoked: (user: string, count: number) =>
        structuredLog('info', 'All sessions revoked', { type: 'session', action: 'all_sessions_revoked', user, count }),
    
    sessionsCleanedUp: (count: number) =>
        structuredLog('info', 'Expired sessions cleaned up', { type: 'session', action: 'sessions_cleanup', count }),
    
    // === Ban System ===
    banCheck: (user: string, banned: boolean, until?: string) =>
        structuredLog(banned ? 'warn' : 'debug', banned ? 'User is banned' : 'Ban check passed', 
            { type: 'session', action: 'ban_check', user, banned, banned_until: until }),
    
    sessionBanned: (user: string, until: string) =>
        structuredLog('warn', 'Session invalidated due to ban', { type: 'session', action: 'session_banned', user, banned_until: until }),
    
    // === Registration ===
    registrationAttempt: (email: string) =>
        structuredLog('info', 'Registration attempt', { type: 'session', action: 'registration_attempt', email }),
    
    registrationSuccess: (user: string, email: string) =>
        structuredLog('info', 'Registration successful', { type: 'session', action: 'registration', user, email }),
    
    registrationFailed: (email: string, reason: string) =>
        structuredLog('warn', 'Registration failed', { type: 'session', action: 'registration_failed', email, reason }),
    
    // === OAuth ===
    oauthAttempt: (provider: string, email: string) =>
        structuredLog('info', 'OAuth sign-in attempt', { type: 'session', action: 'oauth_attempt', provider, email }),
    
    oauthSuccess: (provider: string, user: string, email: string, isNewUser: boolean) =>
        structuredLog('info', isNewUser ? 'OAuth registration' : 'OAuth sign-in', 
            { type: 'session', action: isNewUser ? 'oauth_registration' : 'oauth_login', provider, user, email }),
    
    oauthLinked: (provider: string, user: string, email: string) =>
        structuredLog('info', 'OAuth account linked', { type: 'session', action: 'oauth_linked', provider, user, email }),
    
    oauthBlocked: (provider: string, email: string, reason: string) =>
        structuredLog('warn', 'OAuth sign-in blocked', { type: 'session', action: 'oauth_blocked', provider, email, reason }),
    
    // === Email Verification ===
    verificationSent: (email: string) =>
        structuredLog('info', 'Verification email sent', { type: 'session', action: 'verification_sent', email }),
    
    verificationSuccess: (email: string) =>
        structuredLog('info', 'Email verified', { type: 'session', action: 'email_verified', email }),
    
    verificationFailed: (email: string, reason: string) =>
        structuredLog('warn', 'Email verification failed', { type: 'session', action: 'verification_failed', email, reason }),
    
    // === Password Reset ===
    passwordResetRequested: (email: string, exists: boolean) =>
        structuredLog('info', 'Password reset requested', { type: 'session', action: 'password_reset_requested', email, user_exists: exists }),
    
    passwordResetSuccess: (email: string) =>
        structuredLog('info', 'Password reset successful', { type: 'session', action: 'password_reset', email }),
    
    // === Magic Link ===
    magicLinkSent: (email: string) =>
        structuredLog('info', 'Magic link sent', { type: 'session', action: 'magic_link_sent', email }),
    
    // === 2FA ===
    twoFactorEnabled: (user: string) =>
        structuredLog('info', '2FA enabled', { type: 'session', action: '2fa_enabled', user }),
    
    twoFactorDisabled: (user: string) =>
        structuredLog('info', '2FA disabled', { type: 'session', action: '2fa_disabled', user }),
    
    twoFactorRecoveryUsed: (user: string) =>
        structuredLog('warn', '2FA recovery code used', { type: 'session', action: '2fa_recovery_used', user }),
    
    twoFactorRecoveryRegenerated: (user: string) =>
        structuredLog('info', '2FA recovery codes regenerated', { type: 'session', action: '2fa_recovery_regen', user }),
    
    // === Tokens ===
    tokenCreated: (type: string, email: string) =>
        structuredLog('debug', 'Token created', { type: 'session', action: 'token_created', token_type: type, email }),
    
    tokensCleanedUp: (count: number) =>
        structuredLog('info', 'Expired tokens cleaned up', { type: 'session', action: 'tokens_cleanup', count }),
    
    // === Account Security ===
    failedAttemptsHigh: (email: string, count: number) =>
        structuredLog('warn', 'High failed login attempts', { type: 'session', action: 'high_failed_attempts', email, count }),
    
    newSigninAlert: (user: string, email: string) =>
        structuredLog('info', 'New sign-in alert sent', { type: 'session', action: 'new_signin_alert', user, email }),
    
    // === Admin MFA ===
    adminMfaCodeSent: (user: string, email: string) =>
        structuredLog('info', 'Admin MFA code sent', { type: 'session', action: 'admin_mfa_sent', user, email }),
    
    adminMfaSessionCreated: (user: string) =>
        structuredLog('info', 'Admin MFA session created', { type: 'session', action: 'admin_mfa_session', user }),
    
    adminMfaFailed: (user: string, reason: string) =>
        structuredLog('warn', 'Admin MFA failed', { type: 'session', action: 'admin_mfa_failed', user, reason }),
};

/**
 * Arena logging - for match and competitive events
 * 
 * @example
 * arenaLog.matchStart('match_123', 'josh_hill', 'opponent_1');
 * arenaLog.answer('match_123', 'josh_hill', true, 1500);
 * arenaLog.matchEnd('match_123', 'josh_hill', 'win', 150);
 */
export const arenaLog = {
    // === Match Lifecycle ===
    matchStart: (arena_id: string, user: string, opponent: string) =>
        structuredLog('info', 'Match started', { type: 'arena', action: 'match_start', arena_id, user, opponent }),
    
    matchEnd: (arena_id: string, user: string, result: 'win' | 'loss' | 'draw', score: number) =>
        structuredLog('info', 'Match ended', { type: 'arena', action: 'match_end', arena_id, user, result, score }),
    
    matchCreated: (arena_id: string, player1: string, player2: string, is_ai: boolean) =>
        structuredLog('info', 'Match created', { type: 'arena', action: 'match_created', arena_id, player1, player2, is_ai }),
    
    matchSaved: (arena_id: string, winner: string, loser: string, winner_elo_change: number, loser_elo_change: number) =>
        structuredLog('info', 'Match result saved', { type: 'arena', action: 'match_saved', arena_id, winner, loser, winner_elo_change, loser_elo_change }),
    
    // === Answers ===
    answer: (arena_id: string, user: string, correct: boolean, duration_ms: number) =>
        structuredLog('info', 'Answer submitted', { type: 'arena', action: 'answer', arena_id, user, correct, duration_ms }),
    
    // === Queue Events ===
    queueJoin: (user: string, mode: string, elo: number, operation?: string, confidence?: number) =>
        structuredLog('info', 'Joined queue', { type: 'arena', action: 'queue_join', user, mode, elo, operation, confidence }),
    
    queueLeave: (user: string, mode: string) =>
        structuredLog('info', 'Left queue', { type: 'arena', action: 'queue_leave', user, mode }),
    
    queueMatch: (arena_id: string, user: string, opponent: string, wait_time_ms: number) =>
        structuredLog('info', 'Match found', { type: 'arena', action: 'queue_match', arena_id, user, opponent, wait_time_ms }),
    
    queueExpanded: (user: string, elo_range: number, queue_time_s: number) =>
        structuredLog('debug', 'Queue range expanded', { type: 'arena', action: 'queue_expanded', user, elo_range, queue_time_s }),
    
    queueAiFallback: (user: string, queue_time_s: number) =>
        structuredLog('info', 'AI fallback triggered', { type: 'arena', action: 'queue_ai_fallback', user, queue_time_s }),
    
    // === Matchmaking Events ===
    matchmakingCheck: (user: string, elo: number, candidates: number, queue_time_s: number) =>
        structuredLog('debug', 'Checking for match', { type: 'arena', action: 'matchmaking_check', user, elo, candidates, queue_time_s }),
    
    matchmakingSkip: (user: string, candidate: string, reason: string) =>
        structuredLog('debug', 'Candidate skipped', { type: 'arena', action: 'matchmaking_skip', user, candidate, reason }),
    
    // === Team Matchmaking ===
    teamQueueJoin: (party_id: string, leader: string, mode: string, elo: number, member_count: number) =>
        structuredLog('info', 'Team joined queue', { type: 'arena', action: 'team_queue_join', party_id, leader, mode, elo, member_count }),
    
    teamQueueLeave: (party_id: string, leader: string, mode: string) =>
        structuredLog('info', 'Team left queue', { type: 'arena', action: 'team_queue_leave', party_id, leader, mode }),
    
    teamMatchCreated: (arena_id: string, team1_id: string, team2_id: string) =>
        structuredLog('info', 'Team match created', { type: 'arena', action: 'team_match_created', arena_id, team1_id, team2_id }),
    
    teamAssembled: (assembled_id: string, party_ids: string[], member_count: number) =>
        structuredLog('info', 'Team assembled', { type: 'arena', action: 'team_assembled', assembled_id, party_count: party_ids.length, member_count }),
    
    // === Forfeit & Connection ===
    forfeit: (arena_id: string, user: string) =>
        structuredLog('info', 'Player forfeited', { type: 'arena', action: 'forfeit', arena_id, user }),
    
    connectionDegraded: (arena_id: string, user: string, state: 'YELLOW' | 'RED') =>
        structuredLog('warn', 'Connection degraded', { type: 'arena', action: 'connection_degraded', arena_id, user, state }),
    
    matchVoided: (arena_id: string, reason: string) =>
        structuredLog('warn', 'Match voided', { type: 'arena', action: 'match_voided', arena_id, reason }),
    
    // === ELO & Ranking ===
    eloUpdated: (user: string, operation: string, old_elo: number, new_elo: number, change: number) =>
        structuredLog('info', 'ELO updated', { type: 'arena', action: 'elo_updated', user, operation, old_elo, new_elo, change }),
    
    // === Redis/Infrastructure ===
    redisError: (operation: string, error: string) =>
        structuredLog('error', 'Redis operation failed', { type: 'arena', action: 'redis_error', operation, error }),
};

/**
 * Social logging - for party and friend events
 * 
 * @example
 * socialLog.partyCreated('party_123', 'josh_hill');
 * socialLog.friendRequest('josh_hill', 'new_friend');
 */
export const socialLog = {
    // === Party Events ===
    partyCreated: (party_id: string, user: string, invite_mode?: string) =>
        structuredLog('info', 'Party created', { type: 'social', action: 'party_created', party_id, user, invite_mode }),
    
    partyJoined: (party_id: string, user: string) =>
        structuredLog('info', 'Joined party', { type: 'social', action: 'party_joined', party_id, user }),
    
    partyLeft: (party_id: string, user: string, disbanded: boolean) =>
        structuredLog('info', 'Left party', { type: 'social', action: 'party_left', party_id, user, disbanded }),
    
    partyInviteSent: (party_id: string, from_user: string, to_user: string) =>
        structuredLog('info', 'Party invite sent', { type: 'social', action: 'party_invite_sent', party_id, from_user, to_user }),
    
    partyInviteDeclined: (party_id: string, user: string) =>
        structuredLog('info', 'Party invite declined', { type: 'social', action: 'party_invite_declined', party_id, user }),
    
    partySettingsUpdated: (party_id: string, user: string, setting: string) =>
        structuredLog('info', 'Party settings updated', { type: 'social', action: 'party_settings_updated', party_id, user, setting }),
    
    partyQueueCancelled: (party_id: string, queue_type: string) =>
        structuredLog('info', 'Party queue cancelled', { type: 'social', action: 'party_queue_cancelled', party_id, queue_type }),
    
    // === Friend Events ===
    friendRequest: (from_user: string, to_user: string) =>
        structuredLog('info', 'Friend request sent', { type: 'social', action: 'friend_request', from_user, to_user }),
    
    friendAccepted: (user: string, friend: string) =>
        structuredLog('info', 'Friend request accepted', { type: 'social', action: 'friend_accepted', user, friend }),
    
    friendDeclined: (user: string, from_user: string) =>
        structuredLog('info', 'Friend request declined', { type: 'social', action: 'friend_declined', user, from_user }),
    
    friendCancelled: (user: string, to_user: string) =>
        structuredLog('info', 'Friend request cancelled', { type: 'social', action: 'friend_cancelled', user, to_user }),
    
    friendRemoved: (user: string, friend: string) =>
        structuredLog('info', 'Friend removed', { type: 'social', action: 'friend_removed', user, friend }),
    
    friendshipRepaired: (user: string, friend: string) =>
        structuredLog('debug', 'Friendship repaired', { type: 'social', action: 'friendship_repaired', user, friend }),
    
    // === Redis Events ===
    redisError: (operation: string, error: string) =>
        structuredLog('error', 'Social Redis error', { type: 'social', action: 'redis_error', operation, error }),
};

/**
 * Game/Practice logging - for practice session events
 * 
 * @example
 * gameLog.sessionStart('josh_hill', 'multiplication', 5);
 * gameLog.answer('josh_hill', true, 1200, 10);
 */
export const gameLog = {
    sessionStart: (user: string, operation: string, tier: number) =>
        structuredLog('info', 'Practice session started', { type: 'game', action: 'session_start', user, operation, tier }),
    
    sessionEnd: (user: string, operation: string, correct: number, total: number, xp_earned: number) =>
        structuredLog('info', 'Practice session ended', { type: 'game', action: 'session_end', user, operation, correct, total, xp_earned }),
    
    answer: (user: string, correct: boolean, duration_ms: number, streak: number) =>
        structuredLog('info', 'Answer submitted', { type: 'game', action: 'answer', user, correct, duration_ms, streak }),
    
    tierAdvance: (user: string, operation: string, from_tier: number, to_tier: number) =>
        structuredLog('info', 'Tier advanced', { type: 'game', action: 'tier_advance', user, operation, from_tier, to_tier }),
    
    hintRequested: (user: string, operation: string) =>
        structuredLog('info', 'Hint requested', { type: 'game', action: 'hint_requested', user, operation }),
};
