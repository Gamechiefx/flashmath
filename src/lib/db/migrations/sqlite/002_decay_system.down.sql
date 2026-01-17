-- FlashMath SQLite Migration Rollback: Decay & Returning Player System
-- Note: SQLite doesn't support DROP COLUMN directly
-- This creates a new table without the columns and copies data

-- Create temporary table without decay columns
CREATE TABLE users_backup AS SELECT 
    id, email, email_verified, email_verified_at, name, password_hash,
    level, total_xp, coins, current_league_id, theme_preferences,
    math_tiers, skill_points, equipped_items,
    is_admin, role, is_banned, banned_until, failed_login_attempts, locked_until,
    arena_elo_duel, arena_elo_duel_addition, arena_elo_duel_subtraction,
    arena_elo_duel_multiplication, arena_elo_duel_division,
    arena_duel_wins, arena_duel_losses, arena_duel_win_streak, arena_duel_best_win_streak,
    arena_elo_team, arena_elo_2v2, arena_elo_2v2_addition, arena_elo_2v2_subtraction,
    arena_elo_2v2_multiplication, arena_elo_2v2_division,
    arena_elo_3v3, arena_elo_3v3_addition, arena_elo_3v3_subtraction,
    arena_elo_3v3_multiplication, arena_elo_3v3_division,
    arena_elo_4v4, arena_elo_4v4_addition, arena_elo_4v4_subtraction,
    arena_elo_4v4_multiplication, arena_elo_4v4_division,
    arena_elo_5v5, arena_elo_5v5_addition, arena_elo_5v5_subtraction,
    arena_elo_5v5_multiplication, arena_elo_5v5_division,
    arena_team_wins, arena_team_losses, arena_team_win_streak, arena_team_best_win_streak,
    two_factor_enabled, two_factor_secret, two_factor_recovery_codes,
    dob, created_at, updated_at, last_active
FROM users;

-- Drop original table
DROP TABLE users;

-- Rename backup to users
ALTER TABLE users_backup RENAME TO users;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_duel_elo ON users(arena_elo_duel DESC);
CREATE INDEX IF NOT EXISTS idx_users_team_elo ON users(arena_elo_team DESC);
