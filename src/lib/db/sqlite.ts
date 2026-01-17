/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */
/**
 * FlashMath SQLite Database Layer
 * 
 * DATABASE MIGRATIONS:
 * ====================
 * Schema changes are now managed by the migration system in src/lib/db/migrations/
 * 
 * To add a new migration:
 * 1. Create a new file: src/lib/db/migrations/sqlite/XXX_description.up.sql
 * 2. Optionally create: src/lib/db/migrations/sqlite/XXX_description.down.sql
 * 3. Run: npm run migrate (or it runs automatically on Docker container start)
 * 
 * The legacy inline migrations below are kept for backwards compatibility
 * and will be skipped if the migration system has already applied them.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');

// Lock file for preventing concurrent schema initialization
const LOCK_FILE = DB_PATH + '.init.lock';

// Create database connection
let db: Database.Database | null = null;
let schemaInitialized = false;

/**
 * Check if we're in a Next.js build phase.
 * During build, we should not initialize the database schema to avoid
 * multiple workers causing "database is locked" errors.
 * 
 * Uses multiple detection methods for robustness:
 * 1. NEXT_PHASE environment variable (set by Next.js during build)
 * 2. npm_lifecycle_event (set during npm script execution)
 * 3. SKIP_DB_INIT environment variable (explicit opt-out)
 * 4. Check if we're running under multiple workers (Next.js build uses workers)
 * 5. Check for CI environment variables
 */
function isBuildPhase(): boolean {
    // Explicit skip via environment variable
    if (process.env.SKIP_DB_INIT === 'true' || process.env.SKIP_DB_INIT === '1') {
        return true;
    }
    
    // NEXT_PHASE is set during next build
    // 'phase-production-build' indicates we're building
    const phase = process.env.NEXT_PHASE;
    if (phase === 'phase-production-build') {
        return true;
    }
    
    // Check npm lifecycle event (covers "npm run build")
    const npmEvent = process.env.npm_lifecycle_event;
    if (npmEvent === 'build') {
        return true;
    }
    
    // Check for CI environments where build might be happening
    // In CI, we should skip schema init and let migrations handle it
    if (process.env.CI === 'true' || process.env.CI === '1') {
        return true;
    }
    
    // Gitea Actions detection
    if (process.env.GITEA_ACTIONS === 'true') {
        return true;
    }
    
    // GitHub Actions detection
    if (process.env.GITHUB_ACTIONS === 'true') {
        return true;
    }
    
    // Generic build environment check
    if (process.env.BUILD_ENV === 'true' || process.env.IS_BUILD === 'true') {
        return true;
    }
    
    return false;
}

/**
 * Acquire a file-based lock for schema initialization.
 * This prevents multiple Next.js workers from initializing the schema concurrently.
 * Returns true if lock was acquired, false if another process holds the lock.
 */
function acquireSchemaLock(): boolean {
    try {
        // Check if lock file exists and is recent (within last 60 seconds)
        if (fs.existsSync(LOCK_FILE)) {
            const stats = fs.statSync(LOCK_FILE);
            const ageMs = Date.now() - stats.mtimeMs;
            
            // If lock is fresh (< 60 seconds old), another process is initializing
            if (ageMs < 60000) {
                return false;
            }
            
            // Lock is stale, remove it
            fs.unlinkSync(LOCK_FILE);
        }
        
        // Create lock file with our PID
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
        return true;
    } catch (e: any) {
        // EEXIST means another process created the lock between our check and write
        if (e.code === 'EEXIST') {
            return false;
        }
        // Other errors - proceed cautiously
        return true;
    }
}

/**
 * Release the schema initialization lock
 */
function releaseSchemaLock(): void {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const content = fs.readFileSync(LOCK_FILE, 'utf-8');
            // Only remove if we own the lock
            if (content === String(process.pid)) {
                fs.unlinkSync(LOCK_FILE);
            }
        }
    } catch (_e) {
        // Ignore errors during cleanup
    }
}

export function getDatabase(): Database.Database {
    if (!db) {
        // During build phase, we still need to return a database connection
        // for static analysis, but we should skip heavy schema initialization
        const skipSchemaInit = isBuildPhase();
        
        // Ensure the parent directory exists before opening the database
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(`[SQLite] Created database directory: ${dbDir}`);
        }

        db = new Database(DB_PATH);
        // Enable foreign keys
        db.pragma('foreign_keys = ON');
        // Enable WAL mode for better concurrency
        db.pragma('journal_mode = WAL');
        // Set busy timeout to wait for locks (30 seconds) - important for concurrent access
        db.pragma('busy_timeout = 30000');

        // Initialize schema if needed (skip during build phase)
        if (!skipSchemaInit && !schemaInitialized) {
            // Try to acquire lock - if we can't, another process is initializing
            if (acquireSchemaLock()) {
                try {
                    initializeSchema();
                    schemaInitialized = true;
                } finally {
                    releaseSchemaLock();
                }
            } else {
                console.log('[SQLite] Another process is initializing schema, waiting...');
                // Wait a bit and mark as initialized (the other process will do it)
                schemaInitialized = true;
            }
        } else if (skipSchemaInit) {
            console.log('[SQLite] Skipping schema initialization during build phase');
        }
    }
    return db;
}

function initializeSchema() {
    const database = db!;

    // Read and execute schema - try multiple paths for production/dev compatibility
    const schemaPaths = [
        path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql'),
        path.join(__dirname, 'schema.sql'),
        path.join(process.cwd(), 'schema.sql')
    ];

    let schemaLoaded = false;
    for (const schemaPath of schemaPaths) {
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            database.exec(schema);
            console.log(`[SQLite] Schema initialized from: ${schemaPath}`);
            schemaLoaded = true;
            break;
        }
    }

    if (!schemaLoaded) {
        console.warn('[SQLite] No schema.sql file found, tables must already exist or be created manually');
    }

    // Ensure user_achievements table exists (for achievements system)
    database.exec(`
        CREATE TABLE IF NOT EXISTS user_achievements (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            achievement_id TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            unlocked_at TEXT,
            claimed_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, achievement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
    `);

    // RBAC: Add role column if missing (migration for existing databases)
    try {
        database.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
        console.log('[SQLite] Added role column to users table');
        // Update existing admins to super_admin role
        database.exec("UPDATE users SET role = 'super_admin' WHERE is_admin = 1 AND (role IS NULL OR role = 'user')");
    } catch (e: any) {
        // Column already exists - this is expected
        if (!e.message.includes('duplicate column')) {
            console.warn('[SQLite] Role column migration error:', e.message);
        }
    }

    // Add two_factor_recovery_codes column if missing
    try {
        database.exec("ALTER TABLE users ADD COLUMN two_factor_recovery_codes TEXT");
        console.log('[SQLite] Added two_factor_recovery_codes column');
    } catch (e: any) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[SQLite] two_factor_recovery_codes column migration error:', e.message);
        }
    }

    // Add last_active column for tracking online users
    try {
        database.exec("ALTER TABLE users ADD COLUMN last_active TEXT");
        console.log('[SQLite] Added last_active column');
    } catch (e: any) {
        if (!e.message.includes('duplicate column')) {
            // Expected if column already exists
        }
    }

    // Add new arena ELO structure - Duel (1v1) per-operation + Team per-mode per-operation
    const arenaColumns = [
        // Duel (1v1) stats
        { name: 'arena_elo_duel', default: 300 },
        { name: 'arena_elo_duel_addition', default: 300 },
        { name: 'arena_elo_duel_subtraction', default: 300 },
        { name: 'arena_elo_duel_multiplication', default: 300 },
        { name: 'arena_elo_duel_division', default: 300 },
        { name: 'arena_duel_wins', default: 0 },
        { name: 'arena_duel_losses', default: 0 },
        { name: 'arena_duel_win_streak', default: 0 },
        { name: 'arena_duel_best_win_streak', default: 0 },
        
        // Team overall
        { name: 'arena_elo_team', default: 300 },
        { name: 'arena_team_wins', default: 0 },
        { name: 'arena_team_losses', default: 0 },
        { name: 'arena_team_win_streak', default: 0 },
        { name: 'arena_team_best_win_streak', default: 0 },
        
        // 2v2 per-operation
        { name: 'arena_elo_2v2', default: 300 },
        { name: 'arena_elo_2v2_addition', default: 300 },
        { name: 'arena_elo_2v2_subtraction', default: 300 },
        { name: 'arena_elo_2v2_multiplication', default: 300 },
        { name: 'arena_elo_2v2_division', default: 300 },
        
        // 3v3 per-operation
        { name: 'arena_elo_3v3', default: 300 },
        { name: 'arena_elo_3v3_addition', default: 300 },
        { name: 'arena_elo_3v3_subtraction', default: 300 },
        { name: 'arena_elo_3v3_multiplication', default: 300 },
        { name: 'arena_elo_3v3_division', default: 300 },
        
        // 4v4 per-operation
        { name: 'arena_elo_4v4', default: 300 },
        { name: 'arena_elo_4v4_addition', default: 300 },
        { name: 'arena_elo_4v4_subtraction', default: 300 },
        { name: 'arena_elo_4v4_multiplication', default: 300 },
        { name: 'arena_elo_4v4_division', default: 300 },
        
        // 5v5 per-operation
        { name: 'arena_elo_5v5', default: 300 },
        { name: 'arena_elo_5v5_addition', default: 300 },
        { name: 'arena_elo_5v5_subtraction', default: 300 },
        { name: 'arena_elo_5v5_multiplication', default: 300 },
        { name: 'arena_elo_5v5_division', default: 300 },
        
        // Legacy columns (kept for backwards compatibility during migration)
        { name: 'arena_win_streak', default: 0 },
        { name: 'arena_best_win_streak', default: 0 },
    ];
    for (const col of arenaColumns) {
        try {
            database.exec(`ALTER TABLE users ADD COLUMN ${col.name} INTEGER DEFAULT ${col.default}`);
            console.log(`[SQLite] Added ${col.name} column`);
        } catch (_e: any) {
            if (!_e.message.includes('duplicate column')) {
                // Expected if column already exists
            }
        }
    }

    // Ensure security_activity table exists
    database.exec(`
        CREATE TABLE IF NOT EXISTS security_activity (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_security_activity_user ON security_activity(user_id);
    `);

    // Migrate party max_size from 3 to 5 (for existing parties)
    try {
        database.exec("UPDATE parties SET max_size = 5 WHERE max_size = 3");
        console.log('[SQLite] Updated party max_size to 5');
    } catch (_e: any) {
        // Table might not exist yet, that's fine
    }

    // Add party invite_mode column for privacy settings
    try {
        database.exec("ALTER TABLE parties ADD COLUMN invite_mode TEXT DEFAULT 'open'");
        console.log('[SQLite] Added invite_mode column to parties');
    } catch (_e: any) {
        // Column might already exist, that's fine
    }

    // Add party team mode columns (for 5v5 Arena Teams)
    const partyTeamColumns = [
        { name: 'igl_id', type: 'TEXT' },      // In-Game Leader
        { name: 'anchor_id', type: 'TEXT' },   // Anchor player
        { name: 'target_mode', type: 'TEXT' }, // '5v5', '2v2', etc.
        { name: 'team_id', type: 'TEXT' },     // Link to persistent team
        { name: 'queue_status', type: 'TEXT' }, // 'idle', 'finding_teammates', 'finding_opponents'
        { name: 'queue_started_at', type: 'TEXT' }, // ISO timestamp when queue started
    ];
    for (const col of partyTeamColumns) {
        try {
            database.exec(`ALTER TABLE parties ADD COLUMN ${col.name} ${col.type}`);
            console.log(`[SQLite] Added ${col.name} column to parties`);
        } catch (_e: any) {
            if (!_e.message.includes('duplicate column')) {
                // Expected if column already exists
            }
        }
    }

    // Add party_members team mode columns
    const partyMemberTeamColumns = [
        { name: 'is_ready', type: 'INTEGER', default: 0 },
        { name: 'preferred_operation', type: 'TEXT' },
    ];
    for (const col of partyMemberTeamColumns) {
        try {
            const defaultClause = col.default !== undefined ? ` DEFAULT ${col.default}` : '';
            database.exec(`ALTER TABLE party_members ADD COLUMN ${col.name} ${col.type}${defaultClause}`);
            console.log(`[SQLite] Added ${col.name} column to party_members`);
        } catch (e: any) {
            if (!e.message.includes('duplicate column')) {
                // Expected if column already exist
            }
        }
    }

    // Add arena_matches performance stats columns for speed/accuracy ELO integration
    const arenaMatchesColumns = [
        { name: 'winner_accuracy', type: 'REAL' },
        { name: 'winner_avg_speed_ms', type: 'INTEGER' },
        { name: 'winner_max_streak', type: 'INTEGER' },
        { name: 'winner_aps', type: 'INTEGER' },
        { name: 'loser_accuracy', type: 'REAL' },
        { name: 'loser_avg_speed_ms', type: 'INTEGER' },
        { name: 'loser_max_streak', type: 'INTEGER' },
        { name: 'loser_aps', type: 'INTEGER' },
    ];
    for (const col of arenaMatchesColumns) {
        try {
            database.exec(`ALTER TABLE arena_matches ADD COLUMN ${col.name} ${col.type}`);
            console.log(`[SQLite] Added ${col.name} column to arena_matches`);
        } catch (_e: any) {
            if (!_e.message.includes('duplicate column')) {
                // Expected if column already exists
            }
        }
    }

    // Add match_reasoning column for storing matchmaking rationale (FlashAuditor Match History)
    try {
        database.exec("ALTER TABLE arena_matches ADD COLUMN match_reasoning TEXT");
        console.log('[SQLite] Added match_reasoning column to arena_matches');
    } catch (e: any) {
        if (!e.message.includes('duplicate column')) {
            // Expected if column already exists
        }
    }

    // Add decay & returning player system columns
    const decayColumns = [
        { name: 'last_arena_activity', type: 'TEXT' },
        { name: 'decay_warning_sent', type: 'TEXT' },
        { name: 'decay_started_email_sent', type: 'TEXT' },
        { name: 'severe_decay_email_sent', type: 'TEXT' },
        { name: 'is_returning_player', type: 'INTEGER', default: 0 },
        { name: 'placement_matches_required', type: 'INTEGER', default: 0 },
        { name: 'placement_matches_completed', type: 'INTEGER', default: 0 },
        { name: 'total_elo_decayed', type: 'INTEGER', default: 0 },
        { name: 'last_decay_applied', type: 'TEXT' },
    ];
    for (const col of decayColumns) {
        try {
            const defaultClause = col.default !== undefined ? ` DEFAULT ${col.default}` : '';
            database.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}${defaultClause}`);
            console.log(`[SQLite] Added ${col.name} column for decay system`);
        } catch (_e: any) {
            if (!_e.message.includes('duplicate column')) {
                // Expected if column already exists
            }
        }
    }
    
    // Initialize last_arena_activity for existing users with arena matches
    try {
        database.exec(`
            UPDATE users SET last_arena_activity = created_at 
            WHERE last_arena_activity IS NULL 
            AND (arena_duel_wins > 0 OR arena_duel_losses > 0 OR arena_team_wins > 0 OR arena_team_losses > 0)
        `);
    } catch (_e: any) {
        // Expected if no users match
    }

    // Add leaderboard indexes for efficient ranking queries
    const leaderboardIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_duel_elo ON users(arena_elo_duel DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_team_elo ON users(arena_elo_team DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_duel_addition ON users(arena_elo_duel_addition DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_duel_subtraction ON users(arena_elo_duel_subtraction DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_duel_multiplication ON users(arena_elo_duel_multiplication DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_duel_division ON users(arena_elo_duel_division DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_operation ON arena_matches(operation, created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_mode ON arena_matches(mode, created_at DESC)'
    ];
    for (const indexSql of leaderboardIndexes) {
        try {
            database.exec(indexSql);
        } catch (_e: any) {
            // Index might already exist
        }
    }
    console.log('[SQLite] Ensured leaderboard indexes exist');

    // Seed default leagues if empty
    const leagueCount = database.prepare('SELECT COUNT(*) as count FROM leagues').get() as { count: number };
    if (leagueCount.count === 0) {
        const insertLeague = database.prepare(`
            INSERT INTO leagues (id, name, min_rank, end_time) VALUES (?, ?, ?, ?)
        `);

        const leagues = [
            ['neon-league', 'NEON', 1],
            ['cobalt-league', 'COBALT', 2],
            ['plasma-league', 'PLASMA', 3],
            ['void-league', 'VOID', 4],
            ['apex-league', 'APEX', 5]
        ];

        const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        for (const [id, name, rank] of leagues) {
            insertLeague.run(id, name, rank, endTime);
        }
        console.log('[SQLite] Seeded leagues');
    }

    // Seed admin user if not exists
    const adminEmail = 'admin@flashmath.io';
    const existingAdmin = database.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!existingAdmin) {
        const adminHash = '$2b$10$oUmu3ok39yQLiORP47FcTe3/udpjrmXYffj/50drWX7tbK1KG5/oq'; // flashadmin!
        database.prepare(`
            INSERT INTO users (id, email, email_verified, name, password_hash, level, total_xp, coins, current_league_id, is_admin, created_at)
            VALUES (?, ?, 1, ?, ?, 99, 999999, 999999999, 'apex-league', 1, ?)
        `).run('super-admin-001', adminEmail, 'FlashAdmin', adminHash, new Date().toISOString());
        console.log('[SQLite] Seeded admin account');
    }

    // Auto-promote user to admin via environment variable (useful for Docker deployments)
    const autoAdminEmail = process.env.AUTO_ADMIN_EMAIL;
    if (autoAdminEmail) {
        const user = database.prepare('SELECT id, is_admin, role FROM users WHERE email = ?').get(autoAdminEmail) as { id: string; is_admin?: number; role?: string | null } | undefined;
        if (user && (!user.is_admin || user.role !== 'super_admin')) {
            database.prepare('UPDATE users SET is_admin = 1, role = ? WHERE email = ?')
                .run('super_admin', autoAdminEmail);
            console.log(`[SQLite] Auto-promoted ${autoAdminEmail} to super_admin via AUTO_ADMIN_EMAIL`);
        } else if (!user) {
            console.log(`[SQLite] AUTO_ADMIN_EMAIL set but user ${autoAdminEmail} not found`);
        }
    }
}

// Close database connection (for cleanup)
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

// Helper: Generate UUID
export function generateId(): string {
    return crypto.randomUUID();
}

// Helper: Get current ISO timestamp
export function now(): string {
    return new Date().toISOString();
}

// Export the database instance getter
export { DB_PATH };
