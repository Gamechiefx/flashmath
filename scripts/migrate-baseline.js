#!/usr/bin/env node
/**
 * FlashMath Migration Baseline Script
 * 
 * This script marks existing migrations as "applied" without actually running them.
 * Use this when converting an existing database to use the migration system.
 * 
 * Usage:
 *   node scripts/migrate-baseline.js              # Baseline all migrations
 *   node scripts/migrate-baseline.js 001 002      # Baseline specific migrations
 *   node scripts/migrate-baseline.js --dry-run    # Preview without applying
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

// =============================================================================
// CONFIGURATION
// =============================================================================

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'lib', 'db', 'migrations');
const SQLITE_MIGRATIONS_DIR = path.join(MIGRATIONS_DIR, 'sqlite');
const POSTGRES_MIGRATIONS_DIR = path.join(MIGRATIONS_DIR, 'postgres');

// =============================================================================
// DATABASE CONNECTIONS
// =============================================================================

function getSqliteDb() {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
}

function getPostgresPool() {
    return new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'flashmath_arena',
        user: process.env.POSTGRES_USER || 'flashmath',
        password: process.env.POSTGRES_PASSWORD || '',
        max: 5
    });
}

// =============================================================================
// HASH FUNCTION
// =============================================================================

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// =============================================================================
// GET MIGRATION FILES
// =============================================================================

function getMigrationFiles(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }
    
    return fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.up.sql'))
        .sort()
        .map(f => {
            const id = f.split('_')[0];
            const name = f.replace('.up.sql', '');
            const upPath = path.join(migrationsDir, f);
            return { id, name, upPath };
        });
}

// =============================================================================
// BASELINE
// =============================================================================

async function baselineSqlite(migrationIds, dryRun) {
    console.log('\n=== Baselining SQLite ===');
    
    let db;
    try {
        db = getSqliteDb();
    } catch (error) {
        console.log('[SQLite] ⚠️ Could not connect:', error.message);
        return;
    }
    
    // Ensure _migrations table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    `);
    
    const migrations = getMigrationFiles(SQLITE_MIGRATIONS_DIR);
    const toBaseline = migrationIds.length > 0 
        ? migrations.filter(m => migrationIds.includes(m.id))
        : migrations;
    
    for (const migration of toBaseline) {
        const exists = db.prepare('SELECT 1 FROM _migrations WHERE id = ?').get(migration.id);
        
        if (exists) {
            console.log(`[SQLite] ⏭️  Already baselined: ${migration.name}`);
            continue;
        }
        
        if (dryRun) {
            console.log(`[SQLite] 🔍 Would baseline: ${migration.name}`);
            continue;
        }
        
        const sql = fs.readFileSync(migration.upPath, 'utf-8');
        db.prepare(`
            INSERT INTO _migrations (id, name, checksum) VALUES (?, ?, ?)
        `).run(migration.id, migration.name, hashString(sql));
        
        console.log(`[SQLite] ✅ Baselined: ${migration.name}`);
    }
    
    db.close();
}

async function baselinePostgres(migrationIds, dryRun) {
    console.log('\n=== Baselining PostgreSQL ===');
    
    let pool;
    try {
        pool = getPostgresPool();
        await pool.query('SELECT 1'); // Test connection
    } catch (error) {
        console.log('[Postgres] ⚠️ Could not connect:', error.message);
        return;
    }
    
    // Ensure _migrations table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            checksum VARCHAR(64)
        )
    `);
    
    const migrations = getMigrationFiles(POSTGRES_MIGRATIONS_DIR);
    const toBaseline = migrationIds.length > 0 
        ? migrations.filter(m => migrationIds.includes(m.id))
        : migrations;
    
    for (const migration of toBaseline) {
        const exists = await pool.query('SELECT 1 FROM _migrations WHERE id = $1', [migration.id]);
        
        if (exists.rows.length > 0) {
            console.log(`[Postgres] ⏭️  Already baselined: ${migration.name}`);
            continue;
        }
        
        if (dryRun) {
            console.log(`[Postgres] 🔍 Would baseline: ${migration.name}`);
            continue;
        }
        
        const sql = fs.readFileSync(migration.upPath, 'utf-8');
        await pool.query(
            'INSERT INTO _migrations (id, name, checksum) VALUES ($1, $2, $3)',
            [migration.id, migration.name, hashString(sql)]
        );
        
        console.log(`[Postgres] ✅ Baselined: ${migration.name}`);
    }
    
    await pool.end();
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const migrationIds = args.filter(a => !a.startsWith('-'));
    
    console.log('========================================');
    console.log('FlashMath Migration Baseline');
    console.log('========================================');
    console.log('');
    console.log('This marks migrations as applied WITHOUT running them.');
    console.log('Use this to initialize the migration system on existing databases.');
    
    if (dryRun) {
        console.log('\n🔍 DRY RUN MODE - No changes will be made');
    }
    
    if (migrationIds.length > 0) {
        console.log(`\nBaselining specific migrations: ${migrationIds.join(', ')}`);
    } else {
        console.log('\nBaselining ALL migrations');
    }
    
    await baselineSqlite(migrationIds, dryRun);
    await baselinePostgres(migrationIds, dryRun);
    
    console.log('\n========================================');
    console.log('Baseline complete!');
    console.log('========================================');
}

main().catch(error => {
    console.error('Baseline error:', error);
    process.exit(1);
});
