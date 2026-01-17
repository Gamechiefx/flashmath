#!/usr/bin/env node
/**
 * FlashMath Database Migration Runner (JavaScript version for Docker)
 * 
 * This is a simplified migration runner that works directly in Docker without ts-node.
 * It runs SQL migration files in order and tracks them in a _migrations table.
 * 
 * Features:
 * - Tracks applied migrations in _migrations table
 * - Supports --skip-if-exists for safe production deployments
 * - Handles duplicate column errors gracefully
 * 
 * Usage:
 *   node scripts/migrate.js                    # Run all pending migrations
 *   node scripts/migrate.js status             # Show migration status
 *   node scripts/migrate.js --dry-run          # Preview without applying
 *   node scripts/migrate.js --skip-if-exists   # Check before applying (safest for prod)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
    const dbDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}

function getPostgresPool() {
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

function ensureMigrationsTableSqlite(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    `);
}

async function ensureMigrationsTablePostgres(pool) {
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

function getMigrationFiles(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }
    
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.up.sql'))
        .sort();
    
    return files.map(f => {
        const id = f.split('_')[0];
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
// BACKUP FUNCTIONS
// =============================================================================

/**
 * Create a timestamped backup of the SQLite database
 * @returns {string|null} Path to backup file, or null if backup failed
 */
function backupSqliteDatabase() {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');
    
    if (!fs.existsSync(dbPath)) {
        console.log('[Backup] SQLite database does not exist yet, skipping backup');
        return null;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    const backupPath = path.join(backupDir, `flashmath_${timestamp}.db`);
    
    try {
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Copy the database file
        fs.copyFileSync(dbPath, backupPath);
        
        // Also copy WAL and SHM files if they exist (for consistency)
        const walPath = dbPath + '-wal';
        const shmPath = dbPath + '-shm';
        if (fs.existsSync(walPath)) {
            fs.copyFileSync(walPath, backupPath + '-wal');
        }
        if (fs.existsSync(shmPath)) {
            fs.copyFileSync(shmPath, backupPath + '-shm');
        }
        
        console.log(`[Backup] ✅ SQLite backup created: ${backupPath}`);
        
        // Clean up old backups (keep last 5)
        cleanupOldBackups(backupDir, 5);
        
        return backupPath;
    } catch (error) {
        console.error(`[Backup] ⚠️ SQLite backup failed: ${error.message}`);
        return null;
    }
}

/**
 * Create a backup of PostgreSQL database using pg_dump
 * @returns {string|null} Path to backup file, or null if backup failed
 */
async function backupPostgresDatabase() {
    const dbName = process.env.POSTGRES_DB || 'flashmath_arena';
    const host = process.env.POSTGRES_HOST || 'localhost';
    const port = process.env.POSTGRES_PORT || '5432';
    const user = process.env.POSTGRES_USER || 'flashmath';
    const password = process.env.POSTGRES_PASSWORD || '';
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    const backupPath = path.join(backupDir, `postgres_${timestamp}.sql`);
    
    try {
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Try to use pg_dump if available
        const pgDumpCmd = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} -f "${backupPath}"`;
        
        try {
            execSync(pgDumpCmd, { stdio: 'pipe' });
            console.log(`[Backup] ✅ PostgreSQL backup created: ${backupPath}`);
            cleanupOldBackups(backupDir, 5, 'postgres_');
            return backupPath;
        } catch (pgError) {
            // pg_dump not available or failed - this is OK, just log it
            console.log(`[Backup] ⚠️ PostgreSQL backup skipped (pg_dump not available)`);
            return null;
        }
    } catch (error) {
        console.error(`[Backup] ⚠️ PostgreSQL backup failed: ${error.message}`);
        return null;
    }
}

/**
 * Clean up old backup files, keeping only the most recent ones
 */
function cleanupOldBackups(backupDir, keepCount = 5, prefix = 'flashmath_') {
    try {
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith(prefix) && (f.endsWith('.db') || f.endsWith('.sql')))
            .sort()
            .reverse();
        
        // Delete old backups beyond keepCount
        const toDelete = files.slice(keepCount);
        for (const file of toDelete) {
            const filePath = path.join(backupDir, file);
            fs.unlinkSync(filePath);
            // Also delete associated WAL/SHM files
            if (fs.existsSync(filePath + '-wal')) fs.unlinkSync(filePath + '-wal');
            if (fs.existsSync(filePath + '-shm')) fs.unlinkSync(filePath + '-shm');
            console.log(`[Backup] 🗑️ Deleted old backup: ${file}`);
        }
    } catch (error) {
        // Cleanup failure is not critical
    }
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
// SCHEMA INTROSPECTION - SQLite
// =============================================================================

/**
 * Check if a column exists in a SQLite table
 */
function sqliteColumnExists(db, tableName, columnName) {
    try {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        return columns.some(col => col.name.toLowerCase() === columnName.toLowerCase());
    } catch (e) {
        return false;
    }
}

/**
 * Check if a table exists in SQLite
 */
function sqliteTableExists(db, tableName) {
    try {
        const result = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name=?
        `).get(tableName);
        return !!result;
    } catch (e) {
        return false;
    }
}

/**
 * Check if an index exists in SQLite
 */
function sqliteIndexExists(db, indexName) {
    try {
        const result = db.prepare(`
            SELECT name FROM sqlite_master 
            WHERE type='index' AND name=?
        `).get(indexName);
        return !!result;
    } catch (e) {
        return false;
    }
}

/**
 * Parse ALTER TABLE ADD COLUMN statement
 * Returns { table, column } or null
 */
function parseAlterTableAddColumn(sql) {
    const match = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/i);
    if (match) {
        return { table: match[1], column: match[2] };
    }
    return null;
}

/**
 * Parse CREATE TABLE statement
 * Returns table name or null
 */
function parseCreateTable(sql) {
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    return match ? match[1] : null;
}

/**
 * Parse CREATE INDEX statement
 * Returns index name or null
 */
function parseCreateIndex(sql) {
    const match = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    return match ? match[1] : null;
}

// =============================================================================
// SCHEMA INTROSPECTION - PostgreSQL
// =============================================================================

/**
 * Check if a column exists in a PostgreSQL table
 */
async function postgresColumnExists(pool, tableName, columnName) {
    try {
        const result = await pool.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = $2
        `, [tableName.toLowerCase(), columnName.toLowerCase()]);
        return result.rows.length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Check if a table exists in PostgreSQL
 */
async function postgresTableExists(pool, tableName) {
    try {
        const result = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_name = $1 AND table_schema = 'public'
        `, [tableName.toLowerCase()]);
        return result.rows.length > 0;
    } catch (e) {
        return false;
    }
}

/**
 * Check if an index exists in PostgreSQL
 */
async function postgresIndexExists(pool, indexName) {
    try {
        const result = await pool.query(`
            SELECT indexname FROM pg_indexes 
            WHERE indexname = $1
        `, [indexName.toLowerCase()]);
        return result.rows.length > 0;
    } catch (e) {
        return false;
    }
}

// =============================================================================
// SQLITE MIGRATIONS
// =============================================================================

function runSqliteMigrations(dryRun = false, skipIfExists = false) {
    console.log('\n=== SQLite Migrations ===');
    if (skipIfExists) {
        console.log('[SQLite] 🛡️ Skip-if-exists mode enabled (safe for production)');
    }
    
    let db;
    try {
        db = getSqliteDb();
        ensureMigrationsTableSqlite(db);
    } catch (error) {
        console.log('[SQLite] ⚠️ Could not connect to SQLite:', error.message);
        return { applied: [], errors: [], skipped: [] };
    }
    
    const applied = new Set(
        db.prepare('SELECT id FROM _migrations').all().map(r => r.id)
    );
    
    const migrations = getMigrationFiles(SQLITE_MIGRATIONS_DIR);
    const result = { applied: [], errors: [], skipped: [] };
    
    for (const migration of migrations) {
        if (applied.has(migration.id)) {
            console.log(`[SQLite] ⏭️  Skip (applied): ${migration.name}`);
            continue;
        }
        
        const sql = fs.readFileSync(migration.upPath, 'utf-8');
        
        if (dryRun) {
            console.log(`[SQLite] 🔍 Would apply: ${migration.name}`);
            result.applied.push(migration.name);
            continue;
        }
        
        try {
            db.exec('BEGIN TRANSACTION');
            
            // Split by semicolon and execute each statement
            const statements = sql.split(';').filter(s => s.trim());
            let statementsExecuted = 0;
            let statementsSkipped = 0;
            
            for (const stmt of statements) {
                const trimmedStmt = stmt.trim();
                if (!trimmedStmt) continue;
                
                // Skip-if-exists checks
                if (skipIfExists) {
                    // Check ALTER TABLE ADD COLUMN
                    const alterInfo = parseAlterTableAddColumn(trimmedStmt);
                    if (alterInfo) {
                        if (sqliteColumnExists(db, alterInfo.table, alterInfo.column)) {
                            console.log(`[SQLite]   ⏭️  Column exists: ${alterInfo.table}.${alterInfo.column}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                    
                    // Check CREATE TABLE (without IF NOT EXISTS)
                    if (trimmedStmt.match(/CREATE\s+TABLE\s+(?!IF)/i)) {
                        const tableName = parseCreateTable(trimmedStmt);
                        if (tableName && sqliteTableExists(db, tableName)) {
                            console.log(`[SQLite]   ⏭️  Table exists: ${tableName}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                    
                    // Check CREATE INDEX (without IF NOT EXISTS)
                    if (trimmedStmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF)/i)) {
                        const indexName = parseCreateIndex(trimmedStmt);
                        if (indexName && sqliteIndexExists(db, indexName)) {
                            console.log(`[SQLite]   ⏭️  Index exists: ${indexName}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                }
                
                try {
                    db.exec(trimmedStmt);
                    statementsExecuted++;
                } catch (stmtError) {
                    // Ignore "duplicate column" errors for ALTER TABLE
                    if (stmtError.message.includes('duplicate column')) {
                        console.log(`[SQLite]   ⏭️  Column already exists (caught error)`);
                        statementsSkipped++;
                    } else {
                        throw stmtError;
                    }
                }
            }
            
            db.prepare(`
                INSERT INTO _migrations (id, name, checksum) VALUES (?, ?, ?)
            `).run(migration.id, migration.name, hashString(sql));
            
            db.exec('COMMIT');
            
            if (statementsSkipped > 0) {
                console.log(`[SQLite] ✅ Applied: ${migration.name} (${statementsExecuted} executed, ${statementsSkipped} skipped)`);
            } else {
                console.log(`[SQLite] ✅ Applied: ${migration.name}`);
            }
            result.applied.push(migration.name);
        } catch (error) {
            db.exec('ROLLBACK');
            console.error(`[SQLite] ❌ Failed: ${migration.name}`, error.message);
            result.errors.push(migration.name);
            break;
        }
    }
    
    db.close();
    return result;
}

// =============================================================================
// POSTGRESQL MIGRATIONS
// =============================================================================

async function runPostgresMigrations(dryRun = false, skipIfExists = false) {
    console.log('\n=== PostgreSQL Migrations ===');
    if (skipIfExists) {
        console.log('[Postgres] 🛡️ Skip-if-exists mode enabled (safe for production)');
    }
    
    let pool;
    try {
        pool = getPostgresPool();
        await ensureMigrationsTablePostgres(pool);
    } catch (error) {
        console.log('[Postgres] ⚠️ Could not connect to PostgreSQL:', error.message);
        return { applied: [], errors: [], skipped: [] };
    }
    
    const appliedResult = await pool.query('SELECT id FROM _migrations');
    const applied = new Set(appliedResult.rows.map(r => r.id));
    
    const migrations = getMigrationFiles(POSTGRES_MIGRATIONS_DIR);
    const result = { applied: [], errors: [], skipped: [] };
    
    for (const migration of migrations) {
        if (applied.has(migration.id)) {
            console.log(`[Postgres] ⏭️  Skip (applied): ${migration.name}`);
            continue;
        }
        
        let sql = fs.readFileSync(migration.upPath, 'utf-8');
        
        if (dryRun) {
            console.log(`[Postgres] 🔍 Would apply: ${migration.name}`);
            result.applied.push(migration.name);
            continue;
        }
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            if (skipIfExists) {
                // Process statements individually for skip-if-exists mode
                const statements = sql.split(';').filter(s => s.trim());
                let statementsExecuted = 0;
                let statementsSkipped = 0;
                
                for (const stmt of statements) {
                    const trimmedStmt = stmt.trim();
                    if (!trimmedStmt) continue;
                    
                    // Check ALTER TABLE ADD COLUMN
                    const alterInfo = parseAlterTableAddColumn(trimmedStmt);
                    if (alterInfo) {
                        if (await postgresColumnExists(pool, alterInfo.table, alterInfo.column)) {
                            console.log(`[Postgres]   ⏭️  Column exists: ${alterInfo.table}.${alterInfo.column}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                    
                    // Check CREATE TABLE (without IF NOT EXISTS)
                    if (trimmedStmt.match(/CREATE\s+TABLE\s+(?!IF)/i)) {
                        const tableName = parseCreateTable(trimmedStmt);
                        if (tableName && await postgresTableExists(pool, tableName)) {
                            console.log(`[Postgres]   ⏭️  Table exists: ${tableName}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                    
                    // Check CREATE INDEX (without IF NOT EXISTS)
                    if (trimmedStmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF)/i)) {
                        const indexName = parseCreateIndex(trimmedStmt);
                        if (indexName && await postgresIndexExists(pool, indexName)) {
                            console.log(`[Postgres]   ⏭️  Index exists: ${indexName}`);
                            statementsSkipped++;
                            continue;
                        }
                    }
                    
                    await client.query(trimmedStmt);
                    statementsExecuted++;
                }
                
                await client.query(
                    'INSERT INTO _migrations (id, name, checksum) VALUES ($1, $2, $3)',
                    [migration.id, migration.name, hashString(sql)]
                );
                await client.query('COMMIT');
                
                if (statementsSkipped > 0) {
                    console.log(`[Postgres] ✅ Applied: ${migration.name} (${statementsExecuted} executed, ${statementsSkipped} skipped)`);
                } else {
                    console.log(`[Postgres] ✅ Applied: ${migration.name}`);
                }
            } else {
                // Run entire migration as one query
                await client.query(sql);
                await client.query(
                    'INSERT INTO _migrations (id, name, checksum) VALUES ($1, $2, $3)',
                    [migration.id, migration.name, hashString(sql)]
                );
                await client.query('COMMIT');
                console.log(`[Postgres] ✅ Applied: ${migration.name}`);
            }
            
            result.applied.push(migration.name);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`[Postgres] ❌ Failed: ${migration.name}`, error.message);
            result.errors.push(migration.name);
            break;
        } finally {
            client.release();
        }
    }
    
    await pool.end();
    return result;
}

// =============================================================================
// STATUS
// =============================================================================

async function showStatus() {
    console.log('\n=== Migration Status ===\n');
    
    // SQLite status
    console.log('SQLite:');
    try {
        const db = getSqliteDb();
        ensureMigrationsTableSqlite(db);
        const applied = new Set(
            db.prepare('SELECT id FROM _migrations').all().map(r => r.id)
        );
        const migrations = getMigrationFiles(SQLITE_MIGRATIONS_DIR);
        
        migrations.forEach(m => {
            const status = applied.has(m.id) ? '✅' : '⏳';
            console.log(`  ${status} ${m.id} - ${m.name}`);
        });
        
        if (migrations.length === 0) {
            console.log('  (no migration files found)');
        }
        
        db.close();
    } catch (error) {
        console.log('  ⚠️ Could not connect:', error.message);
    }
    
    // PostgreSQL status
    console.log('\nPostgreSQL:');
    try {
        const pool = getPostgresPool();
        await ensureMigrationsTablePostgres(pool);
        const appliedResult = await pool.query('SELECT id FROM _migrations');
        const applied = new Set(appliedResult.rows.map(r => r.id));
        const migrations = getMigrationFiles(POSTGRES_MIGRATIONS_DIR);
        
        migrations.forEach(m => {
            const status = applied.has(m.id) ? '✅' : '⏳';
            console.log(`  ${status} ${m.id} - ${m.name}`);
        });
        
        if (migrations.length === 0) {
            console.log('  (no migration files found)');
        }
        
        await pool.end();
    } catch (error) {
        console.log('  ⚠️ Could not connect:', error.message);
    }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    const args = process.argv.slice(2);
    const command = args.find(a => !a.startsWith('-')) || 'up';
    const dryRun = args.includes('--dry-run');
    const skipIfExists = args.includes('--skip-if-exists') || args.includes('--safe');
    const noBackup = args.includes('--no-backup');
    const backupOnly = args.includes('--backup-only');
    
    console.log('========================================');
    console.log('FlashMath Database Migration Runner');
    console.log('========================================');
    
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made');
    }
    if (skipIfExists) {
        console.log('🛡️ SAFE MODE - Will check if objects exist before creating');
    }
    
    switch (command) {
        case 'up':
            // Create backups before migration (unless --no-backup or --dry-run)
            if (!dryRun && !noBackup) {
                console.log('\n=== Pre-Migration Backup ===');
                const sqliteBackup = backupSqliteDatabase();
                const postgresBackup = await backupPostgresDatabase();
                
                if (backupOnly) {
                    console.log('\n========================================');
                    console.log('Backup complete (--backup-only specified)');
                    console.log('========================================');
                    return;
                }
                
                if (!sqliteBackup && !postgresBackup) {
                    console.log('[Backup] No backups created (databases may not exist yet)');
                }
            }
            
            const sqliteResult = runSqliteMigrations(dryRun, skipIfExists);
            const postgresResult = await runPostgresMigrations(dryRun, skipIfExists);
            
            console.log('\n========================================');
            console.log('Migration Summary:');
            console.log(`  SQLite:     ${sqliteResult.applied.length} applied, ${sqliteResult.errors.length} errors`);
            console.log(`  PostgreSQL: ${postgresResult.applied.length} applied, ${postgresResult.errors.length} errors`);
            if (!dryRun && !noBackup) {
                console.log('  Backup:     Created before migration');
            }
            console.log('========================================');
            
            if (sqliteResult.errors.length > 0 || postgresResult.errors.length > 0) {
                process.exit(1);
            }
            break;
            
        case 'backup':
            console.log('\n=== Database Backup ===');
            backupSqliteDatabase();
            await backupPostgresDatabase();
            break;
            
        case 'status':
            await showStatus();
            break;
            
        default:
            console.log('Usage: node scripts/migrate.js [up|status|backup] [options]');
            console.log('');
            console.log('Commands:');
            console.log('  up      Run all pending migrations (default)');
            console.log('  status  Show migration status');
            console.log('  backup  Create database backups only');
            console.log('');
            console.log('Options:');
            console.log('  --dry-run        Preview changes without applying');
            console.log('  --skip-if-exists Check if columns/tables exist before creating (safest)');
            console.log('  --safe           Alias for --skip-if-exists');
            console.log('  --no-backup      Skip pre-migration backup');
            console.log('  --backup-only    Only create backup, don\'t run migrations');
    }
}

main().catch(error => {
    console.error('Migration error:', error);
    process.exit(1);
});
