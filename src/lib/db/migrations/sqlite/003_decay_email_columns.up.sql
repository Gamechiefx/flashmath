-- FlashMath SQLite Migration: Decay Email Tracking Columns
-- Adds columns for tracking decay-related email notifications

ALTER TABLE users ADD COLUMN decay_started_email_sent TEXT;
ALTER TABLE users ADD COLUMN severe_decay_email_sent TEXT;
