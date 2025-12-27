-- FlashMath SQLite Schema
-- Authentication and User Management

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
    
    -- 2FA
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT,
    
    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT
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

