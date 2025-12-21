import Database from 'better-sqlite3';
import path from 'path';

// Define the database file path
const dbPath = path.join(process.cwd(), 'flashmath.db');

// Initialize the database
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

/**
 * Executes a query that returns multiple rows.
 */
export const query = (text: string, params: any[] = []) => {
    return db.prepare(text).all(...params);
};

/**
 * Executes a query that returns a single row.
 */
export const queryOne = (text: string, params: any[] = []) => {
    return db.prepare(text).get(...params);
};

/**
 * Executes a statement (INSERT, UPDATE, DELETE).
 */
export const execute = (text: string, params: any[] = []) => {
    return db.prepare(text).run(...params);
};

// Initialize schema
export const initSchema = () => {
    console.log('Initializing SQLite Schema...');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password_hash TEXT,
            theme_preferences TEXT DEFAULT 'dark',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mastery_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            operation TEXT,
            fact TEXT,
            last_response_time INTEGER,
            mastery_level INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            operation TEXT,
            correct_count INTEGER,
            total_count INTEGER,
            avg_speed REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    console.log('Schema ready.');
};

export default db;
