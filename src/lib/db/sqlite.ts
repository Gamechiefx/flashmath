import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'flashmath.db');

// Create database connection
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
    if (!db) {
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

        // Initialize schema if needed
        initializeSchema();
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
        } catch (e: any) {
            if (!e.message.includes('duplicate column')) {
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
    } catch (e: any) {
        // Table might not exist yet, that's fine
    }

    // Add party invite_mode column for privacy settings
    try {
        database.exec("ALTER TABLE parties ADD COLUMN invite_mode TEXT DEFAULT 'open'");
        console.log('[SQLite] Added invite_mode column to parties');
    } catch (e: any) {
        // Column might already exist, that's fine
    }

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
