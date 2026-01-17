-- FlashMath SQLite Migration: Decay & Returning Player System
-- Adds columns for tracking arena inactivity and decay

-- Add decay columns to users table
ALTER TABLE users ADD COLUMN last_arena_activity TEXT;
ALTER TABLE users ADD COLUMN decay_warning_sent TEXT;
ALTER TABLE users ADD COLUMN is_returning_player INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN placement_matches_required INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN placement_matches_completed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN total_elo_decayed INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_decay_applied TEXT;

-- Initialize last_arena_activity for existing users with arena matches
UPDATE users SET last_arena_activity = created_at 
WHERE last_arena_activity IS NULL 
AND (arena_duel_wins > 0 OR arena_duel_losses > 0 OR arena_team_wins > 0 OR arena_team_losses > 0);
