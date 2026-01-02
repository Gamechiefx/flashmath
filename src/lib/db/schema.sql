-- FlashMath SQLite Schema
-- Authentication and User Management

-- System settings (maintenance mode, signup toggle, etc)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT
);

-- Default system settings
INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES
    ('maintenance_mode', 'false', datetime('now')),
    ('maintenance_message', 'We are currently performing scheduled maintenance. Please check back soon!', datetime('now')),
    ('signup_enabled', 'true', datetime('now'));

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER DEFAULT 0,
    email_verified_at TEXT,
    name TEXT NOT NULL,
    password_hash TEXT,
    
    -- Profile
    level INTEGER DEFAULT 1,
    total_xp INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    current_league_id TEXT DEFAULT 'neon-league',
    theme_preferences TEXT DEFAULT 'dark',
    
    -- Math progress (stored as JSON)
    math_tiers TEXT DEFAULT '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
    
    -- Skill mastery points per operation (+1 correct, -1 wrong)
    -- Points needed to complete a tier: 100 points
    skill_points TEXT DEFAULT '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
    
    -- Equipped items (stored as JSON)

    equipped_items TEXT DEFAULT '{"theme":"default","particle":"default","font":"default","sound":"default","bgm":"default","title":"default","frame":"default"}',
    
    -- Admin flags and RBAC
    is_admin INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user', -- 'user', 'moderator', 'admin', 'super_admin'
    
    -- Security
    is_banned INTEGER DEFAULT 0,
    banned_until TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    
    -- Arena stats
    arena_elo INTEGER DEFAULT 500,
    arena_elo_1v1 INTEGER DEFAULT 500,
    arena_elo_2v2 INTEGER DEFAULT 400,
    arena_elo_3v3 INTEGER DEFAULT 350,
    arena_wins INTEGER DEFAULT 0,
    arena_losses INTEGER DEFAULT 0,
    arena_win_streak INTEGER DEFAULT 0,
    arena_best_win_streak INTEGER DEFAULT 0,
    
    -- 2FA
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT,
    
    -- Date of Birth (set once during registration, cannot be changed)
    dob TEXT,

    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT,
    last_active TEXT
);

-- Sessions table (for session management)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Verification tokens (email verification, password reset, magic link)
CREATE TABLE IF NOT EXISTS verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- 'email_verification', 'password_reset', 'magic_link'
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth accounts (for linking Google, etc.)
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'google', 'github', etc.
    provider_account_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(provider, provider_account_id)
);

-- Rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL, -- IP address or user ID
    action TEXT NOT NULL, -- 'login', 'password_reset', etc.
    count INTEGER DEFAULT 1,
    window_start TEXT NOT NULL,
    UNIQUE(identifier, action)
);

-- Security activity log
CREATE TABLE IF NOT EXISTS security_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'login', 'logout', 'password_change', '2fa_enabled', etc.
    ip_address TEXT,
    user_agent TEXT,
    details TEXT, -- JSON for extra info
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_security_activity_user ON security_activity(user_id);

-- Mastery stats
CREATE TABLE IF NOT EXISTS mastery_stats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    fact TEXT NOT NULL,
    last_response_time INTEGER,
    mastery_level INTEGER DEFAULT 0,
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, operation, fact)
);

-- Practice sessions (game stats)
CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    correct_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    avg_speed REAL DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id, created_at DESC);

-- Leagues
CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_rank INTEGER,
    end_time TEXT
);

-- League participants (no user FK - ghost players have fake IDs)
CREATE TABLE IF NOT EXISTS league_participants (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT,
    weekly_xp INTEGER DEFAULT 0,
    FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
    UNIQUE(league_id, user_id)
);

-- Shop items
CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    price INTEGER NOT NULL,
    asset_value TEXT
);

-- User inventory
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES shop_items(id),
    UNIQUE(user_id, item_id)
);

-- User achievements
CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    unlocked_at TEXT,
    claimed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, achievement_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mastery_stats_user_id ON mastery_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- ==============================================
-- AI ADAPTIVE LEARNING SYSTEM TABLES
-- ==============================================

-- AI Learning Sessions (telemetry tracking)
CREATE TABLE IF NOT EXISTS learner_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    session_start TEXT NOT NULL,
    session_end TEXT,
    telemetry_json TEXT,
    directives_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Echo Queue (scheduled remediation)
CREATE TABLE IF NOT EXISTS echo_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    concept_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    due_after_n INTEGER DEFAULT 3,
    max_attempts INTEGER DEFAULT 3,
    attempts INTEGER DEFAULT 0,
    variant_policy TEXT DEFAULT 'direct',
    status TEXT DEFAULT 'scheduled',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Skill Mastery (Bayesian probabilities per skill)
CREATE TABLE IF NOT EXISTS skill_mastery (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    mastery_prob REAL DEFAULT 0.5,
    uncertainty REAL DEFAULT 0.3,
    last_seen_at TEXT,
    error_signatures TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, skill_id)
);

-- AI Engine indexes
CREATE INDEX IF NOT EXISTS idx_learner_sessions_user ON learner_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_echo_queue_user ON echo_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_mastery_user ON skill_mastery(user_id);

-- Arena Matches history
CREATE TABLE IF NOT EXISTS arena_matches (
    id TEXT PRIMARY KEY,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    winner_score INTEGER NOT NULL,
    loser_score INTEGER NOT NULL,
    operation TEXT NOT NULL,
    mode TEXT NOT NULL,
    winner_elo_change INTEGER DEFAULT 0,
    loser_elo_change INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (loser_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_arena_matches_winner ON arena_matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_loser ON arena_matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at);

-- ==============================================
-- SOCIAL SYSTEM TABLES (Friends, Parties)
-- ==============================================

-- Friendships (bidirectional after acceptance)
CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, friend_id)
);

-- Friend Requests (pending invites)
CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    created_at TEXT NOT NULL,
    responded_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
);

-- Parties (temporary groups for matchmaking)
CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    leader_id TEXT NOT NULL,
    max_size INTEGER DEFAULT 5,
    created_at TEXT NOT NULL,
    FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Party Members
CREATE TABLE IF NOT EXISTS party_members (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(party_id, user_id)
);

-- Party Invites
CREATE TABLE IF NOT EXISTS party_invites (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Social system indexes
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_parties_leader ON parties(leader_id);
CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id);
CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_party_invites_invitee ON party_invites(invitee_id, status);
