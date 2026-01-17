-- FlashMath PostgreSQL Migration Rollback: Initial Schema
-- WARNING: This will delete all arena data!

DROP TABLE IF EXISTS arena_team_match_players CASCADE;
DROP TABLE IF EXISTS arena_team_matches CASCADE;
DROP TABLE IF EXISTS arena_match_questions CASCADE;
DROP TABLE IF EXISTS arena_matches CASCADE;
DROP TABLE IF EXISTS arena_teams CASCADE;
DROP TABLE IF EXISTS arena_players CASCADE;
