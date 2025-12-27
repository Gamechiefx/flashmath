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

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        database.exec(schema);
        console.log('[SQLite] Schema initialized');
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
