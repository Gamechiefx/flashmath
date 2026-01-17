-- FlashMath SQLite Initial Schema Migration
-- This migration establishes the baseline schema
-- All tables use CREATE TABLE IF NOT EXISTS for idempotency

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
    skill_points TEXT DEFAULT '{"addition":0,"subtraction":0,"multiplication":0,"division":0}',
    equipped_items TEXT DEFAULT '{"theme":"default","particle":"default","font":"default","sound":"default","bgm":"default","title":"default","frame":"default"}',
    
    -- Admin flags and RBAC
    is_admin INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user',
    
    -- Security
    is_banned INTEGER DEFAULT 0,
    banned_until TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    
    -- Arena Duel Stats
    arena_elo_duel INTEGER DEFAULT 300,
    arena_elo_duel_addition INTEGER DEFAULT 300,
    arena_elo_duel_subtraction INTEGER DEFAULT 300,
    arena_elo_duel_multiplication INTEGER DEFAULT 300,
    arena_elo_duel_division INTEGER DEFAULT 300,
    arena_duel_wins INTEGER DEFAULT 0,
    arena_duel_losses INTEGER DEFAULT 0,
    arena_duel_win_streak INTEGER DEFAULT 0,
    arena_duel_best_win_streak INTEGER DEFAULT 0,
    
    -- Arena Team Stats
    arena_elo_team INTEGER DEFAULT 300,
    arena_elo_2v2 INTEGER DEFAULT 300,
    arena_elo_2v2_addition INTEGER DEFAULT 300,
    arena_elo_2v2_subtraction INTEGER DEFAULT 300,
    arena_elo_2v2_multiplication INTEGER DEFAULT 300,
    arena_elo_2v2_division INTEGER DEFAULT 300,
    arena_elo_3v3 INTEGER DEFAULT 300,
    arena_elo_3v3_addition INTEGER DEFAULT 300,
    arena_elo_3v3_subtraction INTEGER DEFAULT 300,
    arena_elo_3v3_multiplication INTEGER DEFAULT 300,
    arena_elo_3v3_division INTEGER DEFAULT 300,
    arena_elo_4v4 INTEGER DEFAULT 300,
    arena_elo_4v4_addition INTEGER DEFAULT 300,
    arena_elo_4v4_subtraction INTEGER DEFAULT 300,
    arena_elo_4v4_multiplication INTEGER DEFAULT 300,
    arena_elo_4v4_division INTEGER DEFAULT 300,
    arena_elo_5v5 INTEGER DEFAULT 300,
    arena_elo_5v5_addition INTEGER DEFAULT 300,
    arena_elo_5v5_subtraction INTEGER DEFAULT 300,
    arena_elo_5v5_multiplication INTEGER DEFAULT 300,
    arena_elo_5v5_division INTEGER DEFAULT 300,
    arena_team_wins INTEGER DEFAULT 0,
    arena_team_losses INTEGER DEFAULT 0,
    arena_team_win_streak INTEGER DEFAULT 0,
    arena_team_best_win_streak INTEGER DEFAULT 0,
    
    -- 2FA
    two_factor_enabled INTEGER DEFAULT 0,
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT,
    
    -- Date of Birth
    dob TEXT,
    
    -- Timestamps
    created_at TEXT NOT NULL,
    updated_at TEXT,
    last_active TEXT
);

-- Sessions table
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

-- Verification tokens
CREATE TABLE IF NOT EXISTS verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
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
    identifier TEXT NOT NULL,
    action TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    window_start TEXT NOT NULL,
    UNIQUE(identifier, action)
);

-- Security activity log
CREATE TABLE IF NOT EXISTS security_activity (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

-- Practice sessions
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

-- Leagues
CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_rank INTEGER,
    end_time TEXT
);

-- League participants
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

-- AI Learning Sessions
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

-- Echo Queue
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

-- Skill Mastery
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

-- Arena Matches (SQLite version)
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
    winner_accuracy REAL,
    winner_avg_speed_ms INTEGER,
    winner_max_streak INTEGER,
    winner_aps INTEGER,
    loser_accuracy REAL,
    loser_avg_speed_ms INTEGER,
    loser_max_streak INTEGER,
    loser_aps INTEGER,
    connection_quality TEXT DEFAULT 'GREEN',
    is_void INTEGER DEFAULT 0,
    void_reason TEXT,
    winner_coins INTEGER DEFAULT 0,
    loser_coins INTEGER DEFAULT 0,
    match_reasoning TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (loser_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Social: Friendships
CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, friend_id)
);

-- Social: Friend Requests
CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    responded_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(sender_id, receiver_id)
);

-- Social: Parties
CREATE TABLE IF NOT EXISTS parties (
    id TEXT PRIMARY KEY,
    leader_id TEXT NOT NULL,
    max_size INTEGER DEFAULT 5,
    invite_mode TEXT DEFAULT 'open' CHECK(invite_mode IN ('open', 'invite_only')),
    igl_id TEXT,
    anchor_id TEXT,
    target_mode TEXT,
    team_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Social: Party Members
CREATE TABLE IF NOT EXISTS party_members (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    is_ready INTEGER DEFAULT 0,
    preferred_operation TEXT,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(party_id, user_id)
);

-- Social: Party Invites
CREATE TABLE IF NOT EXISTS party_invites (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    tag TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    team_wins INTEGER DEFAULT 0,
    team_losses INTEGER DEFAULT 0,
    team_win_streak INTEGER DEFAULT 0,
    team_best_win_streak INTEGER DEFAULT 0,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Team ELO
CREATE TABLE IF NOT EXISTS team_elo (
    team_id TEXT PRIMARY KEY,
    elo_5v5 INTEGER DEFAULT 300,
    elo_5v5_addition INTEGER DEFAULT 300,
    elo_5v5_subtraction INTEGER DEFAULT 300,
    elo_5v5_multiplication INTEGER DEFAULT 300,
    elo_5v5_division INTEGER DEFAULT 300,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    primary_operation TEXT,
    joined_at TEXT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
);

-- Team Invites
CREATE TABLE IF NOT EXISTS team_invites (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Team Matches
CREATE TABLE IF NOT EXISTS team_matches (
    id TEXT PRIMARY KEY,
    team1_id TEXT NOT NULL,
    team2_id TEXT NOT NULL,
    team1_score INTEGER NOT NULL,
    team2_score INTEGER NOT NULL,
    winner_team_id TEXT,
    mode TEXT NOT NULL,
    match_type TEXT NOT NULL,
    operation TEXT NOT NULL,
    team1_elo_before INTEGER,
    team2_elo_before INTEGER,
    team1_elo_change INTEGER DEFAULT 0,
    team2_elo_change INTEGER DEFAULT 0,
    individual_elo_multiplier REAL DEFAULT 0.5,
    connection_quality TEXT DEFAULT 'GREEN',
    is_void INTEGER DEFAULT 0,
    void_reason TEXT,
    round_scores TEXT,
    match_duration_ms INTEGER,
    created_at TEXT NOT NULL
);

-- Team Match Players
CREATE TABLE IF NOT EXISTS team_match_players (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    operation_slot TEXT NOT NULL,
    questions_attempted INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy REAL DEFAULT 0,
    avg_speed_ms INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    contribution_percent REAL DEFAULT 0,
    individual_elo_change INTEGER DEFAULT 0,
    was_igl INTEGER DEFAULT 0,
    was_anchor INTEGER DEFAULT 0,
    used_double_callin INTEGER DEFAULT 0,
    used_anchor_solo INTEGER DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Team Match Roles
CREATE TABLE IF NOT EXISTS team_match_roles (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    igl_user_id TEXT NOT NULL,
    anchor_user_id TEXT NOT NULL,
    slot_assignments TEXT NOT NULL,
    decisions TEXT,
    FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mastery_stats_user_id ON mastery_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_security_activity_user ON security_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learner_sessions_user ON learner_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_echo_queue_user ON echo_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_skill_mastery_user ON skill_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_winner ON arena_matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_loser ON arena_matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at);
CREATE INDEX IF NOT EXISTS idx_arena_matches_operation ON arena_matches(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_mode ON arena_matches(mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_duel_elo ON users(arena_elo_duel DESC);
CREATE INDEX IF NOT EXISTS idx_users_team_elo ON users(arena_elo_team DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_parties_leader ON parties(leader_id);
CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id);
CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_party_invites_invitee ON party_invites(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_wins ON teams(team_wins DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_invitee ON team_invites(invitee_id, status);
CREATE INDEX IF NOT EXISTS idx_team_elo_5v5 ON team_elo(elo_5v5 DESC);
CREATE INDEX IF NOT EXISTS idx_team_matches_created ON team_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_match_players_match ON team_match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_team_match_players_user ON team_match_players(user_id);
