#!/usr/bin/env node

/**
 * ELO Migration Script: SQLite → PostgreSQL
 * 
 * This script migrates existing ELO data from SQLite (users table) to PostgreSQL (arena_players table).
 * Run this once after deploying the PostgreSQL per-operation ELO schema.
 * 
 * Usage:
 *   node scripts/migrate-elo-to-postgres.js
 * 
 * What it does:
 * 1. Reads all users with arena ELO data from SQLite
 * 2. Creates/updates arena_players records in PostgreSQL
 * 3. Copies per-operation ELO values
 * 4. Logs progress and any errors
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');

// Database paths
const SQLITE_PATH = process.env.DATABASE_URL || '/app/flashmath.db';

// PostgreSQL connection
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'flashmath_arena',
    user: process.env.POSTGRES_USER || 'flashmath',
    password: process.env.POSTGRES_PASSWORD || 'flashmath_password',
});

async function ensurePostgresSchema() {
    console.log('📋 Ensuring PostgreSQL schema exists...\n');
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS arena_players (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            
            -- Main duel ELO
            elo INTEGER DEFAULT 300,
            peak_elo INTEGER DEFAULT 300,
            
            -- Per-operation duel ELO
            elo_addition INTEGER DEFAULT 300,
            elo_subtraction INTEGER DEFAULT 300,
            elo_multiplication INTEGER DEFAULT 300,
            elo_division INTEGER DEFAULT 300,
            
            -- Duel stats
            duel_wins INTEGER DEFAULT 0,
            duel_losses INTEGER DEFAULT 0,
            duel_win_streak INTEGER DEFAULT 0,
            duel_best_win_streak INTEGER DEFAULT 0,
            
            -- Team ELO
            elo_team INTEGER DEFAULT 300,
            team_wins INTEGER DEFAULT 0,
            team_losses INTEGER DEFAULT 0,
            team_win_streak INTEGER DEFAULT 0,
            team_best_win_streak INTEGER DEFAULT 0,
            
            -- 2v2 ELO
            elo_2v2 INTEGER DEFAULT 300,
            elo_2v2_addition INTEGER DEFAULT 300,
            elo_2v2_subtraction INTEGER DEFAULT 300,
            elo_2v2_multiplication INTEGER DEFAULT 300,
            elo_2v2_division INTEGER DEFAULT 300,
            
            -- 3v3 ELO
            elo_3v3 INTEGER DEFAULT 300,
            elo_3v3_addition INTEGER DEFAULT 300,
            elo_3v3_subtraction INTEGER DEFAULT 300,
            elo_3v3_multiplication INTEGER DEFAULT 300,
            elo_3v3_division INTEGER DEFAULT 300,
            
            -- 4v4 ELO
            elo_4v4 INTEGER DEFAULT 300,
            elo_4v4_addition INTEGER DEFAULT 300,
            elo_4v4_subtraction INTEGER DEFAULT 300,
            elo_4v4_multiplication INTEGER DEFAULT 300,
            elo_4v4_division INTEGER DEFAULT 300,
            
            -- 5v5 ELO
            elo_5v5 INTEGER DEFAULT 300,
            elo_5v5_addition INTEGER DEFAULT 300,
            elo_5v5_subtraction INTEGER DEFAULT 300,
            elo_5v5_multiplication INTEGER DEFAULT 300,
            elo_5v5_division INTEGER DEFAULT 300,
            
            -- Tier from practice
            practice_tier INTEGER DEFAULT 50,
            
            -- General stats
            matches_played INTEGER DEFAULT 0,
            matches_won INTEGER DEFAULT 0,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    console.log('✓ PostgreSQL schema ready\n');
}

async function migrateEloData() {
    console.log('🚀 Starting ELO migration: SQLite → PostgreSQL\n');
    
    // Ensure schema exists first
    await ensurePostgresSchema();
    
    // Connect to SQLite
    console.log(`📂 Opening SQLite: ${SQLITE_PATH}`);
    const db = new Database(SQLITE_PATH);
    
    // Check what columns exist in SQLite
    const columns = db.pragma('table_info(users)').map(c => c.name);
    console.log(`📊 SQLite users table has ${columns.length} columns\n`);
    
    // Build dynamic query based on available columns
    const eloColumns = [
        'arena_elo_duel', 'arena_elo_duel_addition', 'arena_elo_duel_subtraction',
        'arena_elo_duel_multiplication', 'arena_elo_duel_division',
        'arena_duel_wins', 'arena_duel_losses', 'arena_duel_win_streak', 'arena_duel_best_win_streak',
        'arena_elo_team', 'arena_team_wins', 'arena_team_losses',
        'arena_team_win_streak', 'arena_team_best_win_streak',
        'arena_elo_2v2', 'arena_elo_2v2_addition', 'arena_elo_2v2_subtraction',
        'arena_elo_2v2_multiplication', 'arena_elo_2v2_division',
        'arena_elo_3v3', 'arena_elo_3v3_addition', 'arena_elo_3v3_subtraction',
        'arena_elo_3v3_multiplication', 'arena_elo_3v3_division',
        'arena_elo_4v4', 'arena_elo_4v4_addition', 'arena_elo_4v4_subtraction',
        'arena_elo_4v4_multiplication', 'arena_elo_4v4_division',
        'arena_elo_5v5', 'arena_elo_5v5_addition', 'arena_elo_5v5_subtraction',
        'arena_elo_5v5_multiplication', 'arena_elo_5v5_division',
    ];
    
    const availableEloColumns = eloColumns.filter(c => columns.includes(c));
    console.log(`📊 Found ${availableEloColumns.length} ELO columns in SQLite\n`);
    
    if (availableEloColumns.length === 0) {
        console.log('ℹ️  No ELO columns found in SQLite. This may be a fresh database.');
        console.log('   Migration complete (nothing to migrate).\n');
        await pool.end();
        return;
    }
    
    // Build select query
    const selectColumns = ['id', 'name', 'math_tiers', ...availableEloColumns];
    const selectQuery = `SELECT ${selectColumns.join(', ')} FROM users`;
    
    // Get all users - we'll filter in code
    const allUsers = db.prepare(selectQuery).all();
    
    // Filter to users with arena data
    const users = allUsers.filter(user => {
        return (user.arena_elo_duel && user.arena_elo_duel > 300) ||
               (user.arena_duel_wins && user.arena_duel_wins > 0) ||
               (user.arena_team_wins && user.arena_team_wins > 0) ||
               (user.arena_elo_duel_addition && user.arena_elo_duel_addition > 300) ||
               (user.arena_elo_duel_subtraction && user.arena_elo_duel_subtraction > 300) ||
               (user.arena_elo_duel_multiplication && user.arena_elo_duel_multiplication > 300) ||
               (user.arena_elo_duel_division && user.arena_elo_duel_division > 300);
    });

    console.log(`📊 Found ${users.length} users with arena data to migrate (out of ${allUsers.length} total)\n`);

    if (users.length === 0) {
        console.log('ℹ️  No users with arena data found. Migration complete.\n');
        db.close();
        await pool.end();
        return;
    }

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
                    const tierValues = Object.values(tiers).filter(t => typeof t === 'number' && t > 0);
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
            console.error(`  ✗ Error migrating user ${user.id} (${user.name}):`, error.message);
            errors++;
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total: ${users.length}`);

    db.close();
    await pool.end();
}

// Run migration
migrateEloData()
    .then(() => {
        console.log('\n🎉 Migration finished successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    });

