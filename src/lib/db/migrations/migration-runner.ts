/**
 * FlashMath Database Migration Runner
 * 
 * A lightweight migration system for SQLite and PostgreSQL that:
 * - Tracks applied migrations in a _migrations table
 * - Runs numbered SQL files in order
 * - Supports both up and down migrations
 * - Works in Docker containers
 * 
 * Usage:
 *   npm run migrate              # Run all pending migrations
 *   npm run migrate:status       # Show migration status
 *   npm run migrate:down 003     # Rollback migration 003
 *   npm run migrate -- --dry-run # Preview without applying
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

interface Migration {
    id: string;
    name: string;
    appliedAt: string | null;
    pending: boolean;
}

interface MigrationResult {
    success: boolean;
    applied: string[];
    errors: string[];
}

type DatabaseType = 'sqlite' | 'postgres';

// =============================================================================
// DATABASE CONNECTIONS
// =============================================================================

function getSqliteDb(): Database.Database {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');
    const dbDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}

function getPostgresPool(): Pool {
    const connectionString = process.env.ARENA_DATABASE_URL || process.env.DATABASE_URL;
    
    return new Pool(connectionString ? {
        connectionString,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    } : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'flashmath_arena',
        user: process.env.POSTGRES_USER || 'flashmath',
        password: process.env.POSTGRES_PASSWORD || '',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });
}

// =============================================================================
// MIGRATIONS TABLE
// =============================================================================

function ensureMigrationsTableSqlite(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    `);
}

async function ensureMigrationsTablePostgres(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            checksum VARCHAR(64)
        )
    `);
}

// =============================================================================
// GET MIGRATION FILES
// =============================================================================

function getMigrationFiles(dbType: DatabaseType): { id: string; name: string; upPath: string; downPath: string | null }[] {
    const migrationsDir = path.join(__dirname, dbType);
    
    if (!fs.existsSync(migrationsDir)) {
        console.log(`[Migrate] No migrations directory found at ${migrationsDir}`);
        return [];
    }
    
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.up.sql'))
        .sort();
    
    return files.map(f => {
        const id = f.split('_')[0]; // e.g., "001" from "001_initial.up.sql"
        const name = f.replace('.up.sql', '');
        const upPath = path.join(migrationsDir, f);
        const downFile = f.replace('.up.sql', '.down.sql');
        const downPath = fs.existsSync(path.join(migrationsDir, downFile)) 
            ? path.join(migrationsDir, downFile) 
            : null;
        
        return { id, name, upPath, downPath };
    });
}

// =============================================================================
// GET APPLIED MIGRATIONS
// =============================================================================

function getAppliedMigrationsSqlite(db: Database.Database): Set<string> {
    ensureMigrationsTableSqlite(db);
    const rows = db.prepare('SELECT id FROM _migrations').all() as { id: string }[];
    return new Set(rows.map(r => r.id));
}

async function getAppliedMigrationsPostgres(pool: Pool): Promise<Set<string>> {
    await ensureMigrationsTablePostgres(pool);
    const result = await pool.query('SELECT id FROM _migrations');
    return new Set(result.rows.map((r: { id: string }) => r.id));
}

// =============================================================================
// APPLY MIGRATIONS
// =============================================================================

function applyMigrationSqlite(
    db: Database.Database, 
    migration: { id: string; name: string; upPath: string },
    dryRun: boolean
): boolean {
    const sql = fs.readFileSync(migration.upPath, 'utf-8');
    
    if (dryRun) {
        console.log(`[Migrate] [DRY-RUN] Would apply: ${migration.name}`);
        console.log(sql.slice(0, 200) + (sql.length > 200 ? '...' : ''));
        return true;
    }
    
    try {
        db.exec('BEGIN TRANSACTION');
        
        // Execute migration SQL
        db.exec(sql);
        
        // Record migration
        db.prepare(`
            INSERT INTO _migrations (id, name, checksum) VALUES (?, ?, ?)
        `).run(migration.id, migration.name, hashString(sql));
        
        db.exec('COMMIT');
        console.log(`[Migrate] ✅ Applied: ${migration.name}`);
        return true;
    } catch (error) {
        db.exec('ROLLBACK');
        console.error(`[Migrate] ❌ Failed: ${migration.name}`, error);
        return false;
    }
}

async function applyMigrationPostgres(
    pool: Pool,
    migration: { id: string; name: string; upPath: string },
    dryRun: boolean
): Promise<boolean> {
    const sql = fs.readFileSync(migration.upPath, 'utf-8');
    
    if (dryRun) {
        console.log(`[Migrate] [DRY-RUN] Would apply: ${migration.name}`);
        console.log(sql.slice(0, 200) + (sql.length > 200 ? '...' : ''));
        return true;
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Execute migration SQL
        await client.query(sql);
        
        // Record migration
        await client.query(
            'INSERT INTO _migrations (id, name, checksum) VALUES ($1, $2, $3)',
            [migration.id, migration.name, hashString(sql)]
        );
        
        await client.query('COMMIT');
        console.log(`[Migrate] ✅ Applied: ${migration.name}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] ❌ Failed: ${migration.name}`, error);
        return false;
    } finally {
        client.release();
    }
}

// =============================================================================
// ROLLBACK MIGRATIONS
// =============================================================================

function rollbackMigrationSqlite(
    db: Database.Database,
    migration: { id: string; name: string; downPath: string | null },
    dryRun: boolean
): boolean {
    if (!migration.downPath) {
        console.error(`[Migrate] ❌ No down migration for: ${migration.name}`);
        return false;
    }
    
    const sql = fs.readFileSync(migration.downPath, 'utf-8');
    
    if (dryRun) {
        console.log(`[Migrate] [DRY-RUN] Would rollback: ${migration.name}`);
        console.log(sql.slice(0, 200) + (sql.length > 200 ? '...' : ''));
        return true;
    }
    
    try {
        db.exec('BEGIN TRANSACTION');
        
        // Execute rollback SQL
        db.exec(sql);
        
        // Remove migration record
        db.prepare('DELETE FROM _migrations WHERE id = ?').run(migration.id);
        
        db.exec('COMMIT');
        console.log(`[Migrate] ⬇️ Rolled back: ${migration.name}`);
        return true;
    } catch (error) {
        db.exec('ROLLBACK');
        console.error(`[Migrate] ❌ Rollback failed: ${migration.name}`, error);
        return false;
    }
}

async function rollbackMigrationPostgres(
    pool: Pool,
    migration: { id: string; name: string; downPath: string | null },
    dryRun: boolean
): Promise<boolean> {
    if (!migration.downPath) {
        console.error(`[Migrate] ❌ No down migration for: ${migration.name}`);
        return false;
    }
    
    const sql = fs.readFileSync(migration.downPath, 'utf-8');
    
    if (dryRun) {
        console.log(`[Migrate] [DRY-RUN] Would rollback: ${migration.name}`);
        console.log(sql.slice(0, 200) + (sql.length > 200 ? '...' : ''));
        return true;
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Execute rollback SQL
        await client.query(sql);
        
        // Remove migration record
        await client.query('DELETE FROM _migrations WHERE id = $1', [migration.id]);
        
        await client.query('COMMIT');
        console.log(`[Migrate] ⬇️ Rolled back: ${migration.name}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] ❌ Rollback failed: ${migration.name}`, error);
        return false;
    } finally {
        client.release();
    }
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

export async function runMigrations(options: {
    dryRun?: boolean;
    sqlite?: boolean;
    postgres?: boolean;
} = {}): Promise<MigrationResult> {
    const { dryRun = false, sqlite = true, postgres = true } = options;
    const result: MigrationResult = { success: true, applied: [], errors: [] };
    
    console.log('[Migrate] Starting migrations...');
    if (dryRun) console.log('[Migrate] 🔍 DRY RUN MODE - No changes will be made');
    
    // SQLite migrations
    if (sqlite) {
        console.log('\n[Migrate] === SQLite Migrations ===');
        const db = getSqliteDb();
        const applied = getAppliedMigrationsSqlite(db);
        const migrations = getMigrationFiles('sqlite');
        
        for (const migration of migrations) {
            if (applied.has(migration.id)) {
                console.log(`[Migrate] ⏭️ Skipping (already applied): ${migration.name}`);
                continue;
            }
            
            const success = applyMigrationSqlite(db, migration, dryRun);
            if (success) {
                result.applied.push(`sqlite:${migration.name}`);
            } else {
                result.errors.push(`sqlite:${migration.name}`);
                result.success = false;
                break; // Stop on first error
            }
        }
        
        db.close();
    }
    
    // PostgreSQL migrations
    if (postgres) {
        console.log('\n[Migrate] === PostgreSQL Migrations ===');
        const pool = getPostgresPool();
        
        try {
            const applied = await getAppliedMigrationsPostgres(pool);
            const migrations = getMigrationFiles('postgres');
            
            for (const migration of migrations) {
                if (applied.has(migration.id)) {
                    console.log(`[Migrate] ⏭️ Skipping (already applied): ${migration.name}`);
                    continue;
                }
                
                const success = await applyMigrationPostgres(pool, migration, dryRun);
                if (success) {
                    result.applied.push(`postgres:${migration.name}`);
                } else {
                    result.errors.push(`postgres:${migration.name}`);
                    result.success = false;
                    break; // Stop on first error
                }
            }
        } finally {
            await pool.end();
        }
    }
    
    console.log('\n[Migrate] Migration complete!');
    console.log(`[Migrate] Applied: ${result.applied.length}, Errors: ${result.errors.length}`);
    
    return result;
}

export async function rollbackMigration(
    migrationId: string,
    options: { dryRun?: boolean; sqlite?: boolean; postgres?: boolean } = {}
): Promise<boolean> {
    const { dryRun = false, sqlite = true, postgres = true } = options;
    let success = true;
    
    console.log(`[Migrate] Rolling back migration ${migrationId}...`);
    if (dryRun) console.log('[Migrate] 🔍 DRY RUN MODE');
    
    if (sqlite) {
        const db = getSqliteDb();
        const migrations = getMigrationFiles('sqlite');
        const migration = migrations.find(m => m.id === migrationId);
        
        if (migration) {
            success = rollbackMigrationSqlite(db, migration, dryRun) && success;
        }
        
        db.close();
    }
    
    if (postgres) {
        const pool = getPostgresPool();
        const migrations = getMigrationFiles('postgres');
        const migration = migrations.find(m => m.id === migrationId);
        
        if (migration) {
            success = await rollbackMigrationPostgres(pool, migration, dryRun) && success;
        }
        
        await pool.end();
    }
    
    return success;
}

export async function getMigrationStatus(): Promise<{
    sqlite: Migration[];
    postgres: Migration[];
}> {
    const status = { sqlite: [] as Migration[], postgres: [] as Migration[] };
    
    // SQLite status
    const sqliteDb = getSqliteDb();
    const sqliteApplied = getAppliedMigrationsSqlite(sqliteDb);
    const sqliteMigrations = getMigrationFiles('sqlite');
    
    status.sqlite = sqliteMigrations.map(m => ({
        id: m.id,
        name: m.name,
        appliedAt: sqliteApplied.has(m.id) ? 'applied' : null,
        pending: !sqliteApplied.has(m.id)
    }));
    
    sqliteDb.close();
    
    // PostgreSQL status
    const pool = getPostgresPool();
    try {
        const pgApplied = await getAppliedMigrationsPostgres(pool);
        const pgMigrations = getMigrationFiles('postgres');
        
        status.postgres = pgMigrations.map(m => ({
            id: m.id,
            name: m.name,
            appliedAt: pgApplied.has(m.id) ? 'applied' : null,
            pending: !pgApplied.has(m.id)
        }));
    } finally {
        await pool.end();
    }
    
    return status;
}

// =============================================================================
// UTILITIES
// =============================================================================

function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'up';
    const dryRun = args.includes('--dry-run');
    const sqliteOnly = args.includes('--sqlite');
    const postgresOnly = args.includes('--postgres');
    
    const options = {
        dryRun,
        sqlite: sqliteOnly || (!sqliteOnly && !postgresOnly),
        postgres: postgresOnly || (!sqliteOnly && !postgresOnly)
    };
    
    switch (command) {
        case 'up':
            const result = await runMigrations(options);
            process.exit(result.success ? 0 : 1);
            break;
            
        case 'down':
            const migrationId = args[1];
            if (!migrationId) {
                console.error('Usage: migrate down <migration_id>');
                process.exit(1);
            }
            const success = await rollbackMigration(migrationId, options);
            process.exit(success ? 0 : 1);
            break;
            
        case 'status':
            const status = await getMigrationStatus();
            console.log('\n=== SQLite Migrations ===');
            status.sqlite.forEach(m => {
                console.log(`  ${m.pending ? '⏳' : '✅'} ${m.id} - ${m.name}`);
            });
            console.log('\n=== PostgreSQL Migrations ===');
            status.postgres.forEach(m => {
                console.log(`  ${m.pending ? '⏳' : '✅'} ${m.id} - ${m.name}`);
            });
            break;
            
        default:
            console.log('Usage: migrate [up|down|status] [options]');
            console.log('Options:');
            console.log('  --dry-run   Preview changes without applying');
            console.log('  --sqlite    Only run SQLite migrations');
            console.log('  --postgres  Only run PostgreSQL migrations');
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
