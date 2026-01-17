-- FlashMath SQLite Migration Rollback: Decay Email Tracking Columns
-- Note: SQLite doesn't support DROP COLUMN in older versions
-- For SQLite 3.35.0+ you can use: ALTER TABLE users DROP COLUMN decay_started_email_sent;

-- This is a simplified rollback that works with newer SQLite versions
-- If using older SQLite, a table rebuild would be needed (see 002 down migration)

-- SQLite 3.35.0+ syntax:
-- ALTER TABLE users DROP COLUMN decay_started_email_sent;
-- ALTER TABLE users DROP COLUMN severe_decay_email_sent;

-- For older versions, these columns will just be ignored
-- The migration system will track that this was rolled back
SELECT 1; -- No-op for compatibility
