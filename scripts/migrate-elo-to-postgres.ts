#!/usr/bin/env npx ts-node

/**
 * ELO Migration Script: SQLite → PostgreSQL
 * 
 * This script migrates existing ELO data from SQLite (users table) to PostgreSQL (arena_players table).
 * Run this once after deploying the PostgreSQL per-operation ELO schema.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-elo-to-postgres.ts
 * 
 * What it does:
 * 1. Reads all users with arena ELO data from SQLite
 * 2. Creates/updates arena_players records in PostgreSQL
 * 3. Copies per-operation ELO values
 * 4. Logs progress and any errors
 */

import { getDatabase } from '../src/lib/db/sqlite';

// PostgreSQL connection
const { Pool } = require('pg');

// Validate PostgreSQL credentials are set (no hardcoded defaults for security)
if (!process.env.POSTGRES_PASSWORD) {
    console.error('❌ ERROR: POSTGRES_PASSWORD environment variable is required.');
    console.error('   Set POSTGRES_PASSWORD before running this migration script.');
    console.error('   Example: POSTGRES_PASSWORD=your_secure_password npx ts-node scripts/migrate-elo-to-postgres.ts');
    process.exit(1);
}

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'flashmath_arena',
    user: process.env.POSTGRES_USER || 'flashmath',
    password: process.env.POSTGRES_PASSWORD,
});

async function migrateEloData() {
    console.log('🚀 Starting ELO migration: SQLite → PostgreSQL\n');
    
    const db = getDatabase();
    
    // Get all users with any arena ELO data
    const users = db.prepare(`
        SELECT 
            id, name,
            -- Duel ELOs
            arena_elo_duel, arena_elo_duel_addition, arena_elo_duel_subtraction,
            arena_elo_duel_multiplication, arena_elo_duel_division,
            arena_duel_wins, arena_duel_losses, arena_duel_win_streak, arena_duel_best_win_streak,
            -- Team ELOs
            arena_elo_team, arena_team_wins, arena_team_losses,
            arena_team_win_streak, arena_team_best_win_streak,
            -- 2v2
            arena_elo_2v2, arena_elo_2v2_addition, arena_elo_2v2_subtraction,
            arena_elo_2v2_multiplication, arena_elo_2v2_division,
            -- 3v3
            arena_elo_3v3, arena_elo_3v3_addition, arena_elo_3v3_subtraction,
            arena_elo_3v3_multiplication, arena_elo_3v3_division,
            -- 4v4
            arena_elo_4v4, arena_elo_4v4_addition, arena_elo_4v4_subtraction,
            arena_elo_4v4_multiplication, arena_elo_4v4_division,
            -- 5v5
            arena_elo_5v5, arena_elo_5v5_addition, arena_elo_5v5_subtraction,
            arena_elo_5v5_multiplication, arena_elo_5v5_division,
            -- Tier
            math_tiers
        FROM users
        WHERE arena_elo_duel > 300 
           OR arena_duel_wins > 0 
           OR arena_team_wins > 0
           OR arena_elo_duel_addition > 300
           OR arena_elo_duel_subtraction > 300
           OR arena_elo_duel_multiplication > 300
           OR arena_elo_duel_division > 300
    `).all() as any[];

    console.log(`📊 Found ${users.length} users with arena data to migrate\n`);

    let migrated = 0;
    let errors = 0;

    for (const user of users) {
        try {
            // Calculate practice tier from math_tiers
            let practiceTier = 50;
            if (user.math_tiers) {
                try {
                    const tiers = typeof user.math_tiers === 'string' 
                        ? JSON.parse(user.math_tiers) 
                        : user.math_tiers;
                    const tierValues = Object.values(tiers).filter((t): t is number => typeof t === 'number' && t > 0);
                    if (tierValues.length > 0) {
                        practiceTier = Math.max(...tierValues);
                    }
                } catch { /* ignore */ }
            }

            // Upsert into PostgreSQL
            await pool.query(`
                INSERT INTO arena_players (
                    user_id, username,
                    -- Duel
                    elo, peak_elo,
                    elo_addition, elo_subtraction, elo_multiplication, elo_division,
                    duel_wins, duel_losses, duel_win_streak, duel_best_win_streak,
                    -- Team
                    elo_team,
                    team_wins, team_losses, team_win_streak, team_best_win_streak,
                    -- 2v2
                    elo_2v2, elo_2v2_addition, elo_2v2_subtraction, elo_2v2_multiplication, elo_2v2_division,
                    -- 3v3
                    elo_3v3, elo_3v3_addition, elo_3v3_subtraction, elo_3v3_multiplication, elo_3v3_division,
                    -- 4v4
                    elo_4v4, elo_4v4_addition, elo_4v4_subtraction, elo_4v4_multiplication, elo_4v4_division,
                    -- 5v5
                    elo_5v5, elo_5v5_addition, elo_5v5_subtraction, elo_5v5_multiplication, elo_5v5_division,
                    -- Tier
                    practice_tier,
                    -- Stats
                    matches_played, matches_won
                ) VALUES (
                    $1, $2,
                    $3, $3,
                    $4, $5, $6, $7,
                    $8, $9, $10, $11,
                    $12,
                    $13, $14, $15, $16,
                    $17, $18, $19, $20, $21,
                    $22, $23, $24, $25, $26,
                    $27, $28, $29, $30, $31,
                    $32, $33, $34, $35, $36,
                    $37,
                    $38, $39
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    elo = GREATEST(arena_players.elo, EXCLUDED.elo),
                    peak_elo = GREATEST(arena_players.peak_elo, EXCLUDED.elo),
                    elo_addition = GREATEST(arena_players.elo_addition, EXCLUDED.elo_addition),
                    elo_subtraction = GREATEST(arena_players.elo_subtraction, EXCLUDED.elo_subtraction),
                    elo_multiplication = GREATEST(arena_players.elo_multiplication, EXCLUDED.elo_multiplication),
                    elo_division = GREATEST(arena_players.elo_division, EXCLUDED.elo_division),
                    duel_wins = GREATEST(arena_players.duel_wins, EXCLUDED.duel_wins),
                    duel_losses = GREATEST(arena_players.duel_losses, EXCLUDED.duel_losses),
                    duel_win_streak = GREATEST(arena_players.duel_win_streak, EXCLUDED.duel_win_streak),
                    duel_best_win_streak = GREATEST(arena_players.duel_best_win_streak, EXCLUDED.duel_best_win_streak),
                    elo_team = GREATEST(arena_players.elo_team, EXCLUDED.elo_team),
                    team_wins = GREATEST(arena_players.team_wins, EXCLUDED.team_wins),
                    team_losses = GREATEST(arena_players.team_losses, EXCLUDED.team_losses),
                    team_win_streak = GREATEST(arena_players.team_win_streak, EXCLUDED.team_win_streak),
                    team_best_win_streak = GREATEST(arena_players.team_best_win_streak, EXCLUDED.team_best_win_streak),
                    elo_2v2 = GREATEST(arena_players.elo_2v2, EXCLUDED.elo_2v2),
                    elo_2v2_addition = GREATEST(arena_players.elo_2v2_addition, EXCLUDED.elo_2v2_addition),
                    elo_2v2_subtraction = GREATEST(arena_players.elo_2v2_subtraction, EXCLUDED.elo_2v2_subtraction),
                    elo_2v2_multiplication = GREATEST(arena_players.elo_2v2_multiplication, EXCLUDED.elo_2v2_multiplication),
                    elo_2v2_division = GREATEST(arena_players.elo_2v2_division, EXCLUDED.elo_2v2_division),
                    elo_3v3 = GREATEST(arena_players.elo_3v3, EXCLUDED.elo_3v3),
                    elo_3v3_addition = GREATEST(arena_players.elo_3v3_addition, EXCLUDED.elo_3v3_addition),
                    elo_3v3_subtraction = GREATEST(arena_players.elo_3v3_subtraction, EXCLUDED.elo_3v3_subtraction),
                    elo_3v3_multiplication = GREATEST(arena_players.elo_3v3_multiplication, EXCLUDED.elo_3v3_multiplication),
                    elo_3v3_division = GREATEST(arena_players.elo_3v3_division, EXCLUDED.elo_3v3_division),
                    elo_4v4 = GREATEST(arena_players.elo_4v4, EXCLUDED.elo_4v4),
                    elo_4v4_addition = GREATEST(arena_players.elo_4v4_addition, EXCLUDED.elo_4v4_addition),
                    elo_4v4_subtraction = GREATEST(arena_players.elo_4v4_subtraction, EXCLUDED.elo_4v4_subtraction),
                    elo_4v4_multiplication = GREATEST(arena_players.elo_4v4_multiplication, EXCLUDED.elo_4v4_multiplication),
                    elo_4v4_division = GREATEST(arena_players.elo_4v4_division, EXCLUDED.elo_4v4_division),
                    elo_5v5 = GREATEST(arena_players.elo_5v5, EXCLUDED.elo_5v5),
                    elo_5v5_addition = GREATEST(arena_players.elo_5v5_addition, EXCLUDED.elo_5v5_addition),
                    elo_5v5_subtraction = GREATEST(arena_players.elo_5v5_subtraction, EXCLUDED.elo_5v5_subtraction),
                    elo_5v5_multiplication = GREATEST(arena_players.elo_5v5_multiplication, EXCLUDED.elo_5v5_multiplication),
                    elo_5v5_division = GREATEST(arena_players.elo_5v5_division, EXCLUDED.elo_5v5_division),
                    practice_tier = GREATEST(arena_players.practice_tier, EXCLUDED.practice_tier),
                    matches_played = GREATEST(arena_players.matches_played, EXCLUDED.matches_played),
                    matches_won = GREATEST(arena_players.matches_won, EXCLUDED.matches_won),
                    updated_at = CURRENT_TIMESTAMP
            `, [
                user.id, 
                user.name || 'Player',
                // Duel
                user.arena_elo_duel || 300,
                user.arena_elo_duel_addition || 300,
                user.arena_elo_duel_subtraction || 300,
                user.arena_elo_duel_multiplication || 300,
                user.arena_elo_duel_division || 300,
                user.arena_duel_wins || 0,
                user.arena_duel_losses || 0,
                user.arena_duel_win_streak || 0,
                user.arena_duel_best_win_streak || 0,
                // Team
                user.arena_elo_team || 300,
                user.arena_team_wins || 0,
                user.arena_team_losses || 0,
                user.arena_team_win_streak || 0,
                user.arena_team_best_win_streak || 0,
                // 2v2
                user.arena_elo_2v2 || 300,
                user.arena_elo_2v2_addition || 300,
                user.arena_elo_2v2_subtraction || 300,
                user.arena_elo_2v2_multiplication || 300,
                user.arena_elo_2v2_division || 300,
                // 3v3
                user.arena_elo_3v3 || 300,
                user.arena_elo_3v3_addition || 300,
                user.arena_elo_3v3_subtraction || 300,
                user.arena_elo_3v3_multiplication || 300,
                user.arena_elo_3v3_division || 300,
                // 4v4
                user.arena_elo_4v4 || 300,
                user.arena_elo_4v4_addition || 300,
                user.arena_elo_4v4_subtraction || 300,
                user.arena_elo_4v4_multiplication || 300,
                user.arena_elo_4v4_division || 300,
                // 5v5
                user.arena_elo_5v5 || 300,
                user.arena_elo_5v5_addition || 300,
                user.arena_elo_5v5_subtraction || 300,
                user.arena_elo_5v5_multiplication || 300,
                user.arena_elo_5v5_division || 300,
                // Tier
                practiceTier,
                // Stats (calculated)
                (user.arena_duel_wins || 0) + (user.arena_duel_losses || 0) + (user.arena_team_wins || 0) + (user.arena_team_losses || 0),
                (user.arena_duel_wins || 0) + (user.arena_team_wins || 0),
            ]);

            migrated++;
            if (migrated % 100 === 0) {
                console.log(`  ✓ Migrated ${migrated}/${users.length} users...`);
            }
        } catch (error) {
            console.error(`  ✗ Error migrating user ${user.id} (${user.name}):`, error);
            errors++;
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${users.length}`);

    await pool.end();
}

// Run migration
migrateEloData()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });

