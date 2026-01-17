-- FlashMath PostgreSQL Initial Schema Migration
-- Arena-specific tables for ELO, matches, and team data

-- Arena player stats table
CREATE TABLE IF NOT EXISTS arena_players (
    user_id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    
    -- 1v1 Duel Aggregate ELO
    elo INTEGER DEFAULT 300,
    peak_elo INTEGER DEFAULT 300,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    
    -- 1v1 Per-Operation ELO
    elo_addition INTEGER DEFAULT 300,
    elo_subtraction INTEGER DEFAULT 300,
    elo_multiplication INTEGER DEFAULT 300,
    elo_division INTEGER DEFAULT 300,
    
    -- 5v5 Team ELO
    elo_5v5 INTEGER DEFAULT 300,
    peak_elo_5v5 INTEGER DEFAULT 300,
    matches_played_5v5 INTEGER DEFAULT 0,
    matches_won_5v5 INTEGER DEFAULT 0,
    matches_lost_5v5 INTEGER DEFAULT 0,
    
    -- 5v5 Per-Operation ELO
    elo_5v5_addition INTEGER DEFAULT 300,
    elo_5v5_subtraction INTEGER DEFAULT 300,
    elo_5v5_multiplication INTEGER DEFAULT 300,
    elo_5v5_division INTEGER DEFAULT 300,
    
    -- 2v2/3v3/4v4 Mode ELOs
    elo_2v2 INTEGER DEFAULT 300,
    elo_3v3 INTEGER DEFAULT 300,
    elo_4v4 INTEGER DEFAULT 300,
    
    -- 2v2 Per-Operation ELO
    elo_2v2_addition INTEGER DEFAULT 300,
    elo_2v2_subtraction INTEGER DEFAULT 300,
    elo_2v2_multiplication INTEGER DEFAULT 300,
    elo_2v2_division INTEGER DEFAULT 300,
    
    -- 3v3 Per-Operation ELO
    elo_3v3_addition INTEGER DEFAULT 300,
    elo_3v3_subtraction INTEGER DEFAULT 300,
    elo_3v3_multiplication INTEGER DEFAULT 300,
    elo_3v3_division INTEGER DEFAULT 300,
    
    -- 4v4 Per-Operation ELO
    elo_4v4_addition INTEGER DEFAULT 300,
    elo_4v4_subtraction INTEGER DEFAULT 300,
    elo_4v4_multiplication INTEGER DEFAULT 300,
    elo_4v4_division INTEGER DEFAULT 300,
    
    -- Win/Loss streaks per mode
    duel_win_streak INTEGER DEFAULT 0,
    duel_best_win_streak INTEGER DEFAULT 0,
    duel_wins INTEGER DEFAULT 0,
    duel_losses INTEGER DEFAULT 0,
    team_win_streak INTEGER DEFAULT 0,
    team_best_win_streak INTEGER DEFAULT 0,
    team_wins INTEGER DEFAULT 0,
    team_losses INTEGER DEFAULT 0,
    
    -- Team aggregate ELO
    elo_team INTEGER DEFAULT 300,
    
    -- Tier system
    practice_tier INTEGER DEFAULT 50,
    confidence_score DECIMAL(5,2) DEFAULT 0.00,
    last_match_at TIMESTAMP,
    last_match_5v5_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Team ELO table
CREATE TABLE IF NOT EXISTS arena_teams (
    team_id VARCHAR(255) PRIMARY KEY,
    team_name VARCHAR(255) NOT NULL,
    team_tag VARCHAR(10),
    elo INTEGER DEFAULT 1200,
    peak_elo INTEGER DEFAULT 1200,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    avg_member_tier INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Match history table
CREATE TABLE IF NOT EXISTS arena_matches (
    id VARCHAR(255) PRIMARY KEY,
    player1_id VARCHAR(255) NOT NULL,
    player2_id VARCHAR(255) NOT NULL,
    winner_id VARCHAR(255),
    player1_score INTEGER DEFAULT 0,
    player2_score INTEGER DEFAULT 0,
    player1_elo_before INTEGER,
    player2_elo_before INTEGER,
    player1_elo_change INTEGER DEFAULT 0,
    player2_elo_change INTEGER DEFAULT 0,
    questions_count INTEGER,
    match_duration_ms INTEGER,
    is_draw BOOLEAN DEFAULT FALSE,
    is_forfeit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_id) REFERENCES arena_players(user_id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES arena_players(user_id) ON DELETE CASCADE
);

-- Match questions (for analytics)
CREATE TABLE IF NOT EXISTS arena_match_questions (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    question_number INTEGER NOT NULL,
    question_text VARCHAR(255),
    correct_answer INTEGER,
    player1_answer INTEGER,
    player2_answer INTEGER,
    player1_time_ms INTEGER,
    player2_time_ms INTEGER,
    player1_correct BOOLEAN,
    player2_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES arena_matches(id) ON DELETE CASCADE
);

-- 5v5 Team matches
CREATE TABLE IF NOT EXISTS arena_team_matches (
    id VARCHAR(255) PRIMARY KEY,
    team1_id VARCHAR(255),
    team2_id VARCHAR(255),
    team1_name VARCHAR(255) NOT NULL,
    team2_name VARCHAR(255) NOT NULL,
    winner_team INTEGER,
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    team1_elo_before INTEGER,
    team2_elo_before INTEGER,
    team1_elo_change INTEGER DEFAULT 0,
    team2_elo_change INTEGER DEFAULT 0,
    match_type VARCHAR(20) DEFAULT 'ranked',
    questions_count INTEGER,
    match_duration_ms INTEGER,
    is_forfeit BOOLEAN DEFAULT FALSE,
    is_ai_match BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5v5 Team match participants
CREATE TABLE IF NOT EXISTS arena_team_match_players (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    team_number INTEGER NOT NULL,
    is_igl BOOLEAN DEFAULT FALSE,
    is_anchor BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    elo_before INTEGER,
    elo_change INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES arena_team_matches(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arena_players_elo ON arena_players(elo DESC);
CREATE INDEX IF NOT EXISTS idx_arena_players_elo_5v5 ON arena_players(elo_5v5 DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_player1 ON arena_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_arena_matches_player2 ON arena_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_arena_teams_elo ON arena_teams(elo DESC);
CREATE INDEX IF NOT EXISTS idx_arena_team_matches_created ON arena_team_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_team_match_players_user ON arena_team_match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_arena_team_match_players_match ON arena_team_match_players(match_id);
