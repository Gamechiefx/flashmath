/**
 * FlashMath Database Layer - SQLite Backend
 * Maintains backward-compatible API with JSON-based db.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { getDatabase, generateId, now } from './db/sqlite';
import Database from 'better-sqlite3';
import { ITEMS } from './items';

/**
 * Database user row type - represents a row from the users table
 * All fields are optional to handle SELECT * queries and schema evolution
 */
export interface UserRow {
    id: string;
    email: string;
    email_verified?: number;
    email_verified_at?: string | null;
    name: string;
    password_hash?: string | null;
    level?: number;
    total_xp?: number;
    coins?: number;
    current_league_id?: string | null;
    theme_preferences?: string | null;
    math_tiers?: string | null;
    skill_points?: string | null;
    equipped_items?: string | null;
    is_admin?: number;
    role?: string | null;
    is_banned?: number;
    banned_until?: string | null;
    failed_login_attempts?: number;
    locked_until?: string | null;
    created_at?: string;
    last_active?: string | null;
    dob?: string | null;
    [key: string]: unknown; // Allow additional fields for schema evolution
}

// Get database instance
let db: Database.Database;

function ensureDb() {
    if (!db) {
        db = getDatabase();
    }
    return db;
}

// ============================================
// BACKWARD-COMPATIBLE API
// ============================================

/**
 * Load data - for backward compatibility
 * Returns a proxy object that mimics the old JSON structure
 */
export const loadData = () => {
    const database = ensureDb();

    return {
        get users() {
            return database.prepare('SELECT * FROM users').all().map(parseUser);
        },
        get mastery_stats() {
            return database.prepare('SELECT * FROM mastery_stats').all();
        },
        get sessions() {
            return database.prepare('SELECT * FROM practice_sessions').all();
        },
        get leagues() {
            return database.prepare('SELECT * FROM leagues').all();
        },
        get league_participants() {
            return database.prepare('SELECT * FROM league_participants').all();
        },
        get shop_items() {
            return database.prepare('SELECT * FROM shop_items').all().map(parseShopItem);
        },
        get inventory() {
            return database.prepare('SELECT * FROM inventory').all();
        }
    };
};

// Parse user from DB format to app format
function parseUser(row: any) {
    return {
        ...row,
        math_tiers: row.math_tiers ? JSON.parse(row.math_tiers) : {},
        equipped_items: row.equipped_items ? JSON.parse(row.equipped_items) : {},
        is_admin: !!row.is_admin,
        is_banned: !!row.is_banned,
        email_verified: !!row.email_verified,
        two_factor_enabled: !!row.two_factor_enabled
    };
}

// Parse shop item from DB format to app format
function parseShopItem(row: any) {
    return {
        ...row,
        assetValue: row.asset_value
    };
}

// saveData is no longer needed with SQLite (auto-persisted)
export const saveData = () => {
    // No-op for backward compatibility
};

/**
 * Query multiple rows
 */
export const query = (text: string, params: any[] = []): any[] => {
    const database = ensureDb();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('from users')) {
        return database.prepare('SELECT * FROM users').all().map(parseUser);
    }
    if (lowerText.includes('from mastery_stats')) {
        const userId = params[0];
        let sql = 'SELECT * FROM mastery_stats WHERE user_id = ?';
        const sqlParams = [userId];

        if (lowerText.includes('operation = ?') && params[1]) {
            sql += ' AND operation = ?';
            sqlParams.push(params[1]);
        }
        if (lowerText.includes('fact = ?') && params[2]) {
            sql += ' AND fact = ?';
            sqlParams.push(params[2]);
        }
        return database.prepare(sql).all(...sqlParams);
    }
    if (lowerText.includes('from leagues')) {
        return database.prepare('SELECT * FROM leagues').all();
    }
    if (lowerText.includes('from league_participants')) {
        const leagueId = params[0];
        return database.prepare('SELECT * FROM league_participants WHERE league_id = ?').all(leagueId);
    }
    if (lowerText.includes('from items') || lowerText.includes('from shop_items')) {
        return database.prepare('SELECT * FROM shop_items').all().map(parseShopItem);
    }
    return [];
};

/**
 * Query single row
 */
export const queryOne = (text: string, params: any[] = []): any | null => {
    const database = ensureDb();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('select * from users where email = ?')) {
        const row = database.prepare('SELECT * FROM users WHERE email = ?').get(params[0]);
        return row ? parseUser(row) : null;
    }

    if (lowerText.includes('select id from users where email = ?')) {
        const row = database.prepare('SELECT id FROM users WHERE email = ?').get(params[0]);
        return row || null;
    }

    if (lowerText.includes('select * from users where id = ?')) {
        const row = database.prepare('SELECT * FROM users WHERE id = ?').get(params[0]);
        return row ? parseUser(row) : null;
    }

    // Support for email verification checks
    if (lowerText.includes('select email_verified from users where id = ?')) {
        const row = database.prepare('SELECT email_verified FROM users WHERE id = ?').get(params[0]) as { email_verified?: number } | undefined;
        return row || null;
    }

    if (lowerText.includes('select email, email_verified, email_verified_at from users where id = ?')) {
        const row = database.prepare('SELECT email, email_verified, email_verified_at FROM users WHERE id = ?').get(params[0]) as any;
        return row || null;
    }

    if (lowerText.includes('select * from leagues where id = ?')) {
        return database.prepare('SELECT * FROM leagues WHERE id = ?').get(params[0]) || null;
    }

    if (lowerText.includes('select * from items where id = ?') || lowerText.includes('select * from shop_items where id = ?')) {
        const row = database.prepare('SELECT * FROM shop_items WHERE id = ?').get(params[0]);
        return row ? parseShopItem(row) : null;
    }

    return null;
};

/**
 * Execute statement (INSERT, UPDATE, DELETE)
 */
export const execute = (text: string, params: any[] = []): { changes: number } => {
    const database = ensureDb();
    const lowerText = text.toLowerCase();

    // INSERT INTO users
    if (lowerText.includes('insert into users')) {
        const [id, name, email, password_hash] = params;
        database.prepare(`
            INSERT INTO users (id, name, email, password_hash, level, total_xp, coins, current_league_id, theme_preferences, math_tiers, equipped_items, created_at)
            VALUES (?, ?, ?, ?, 1, 0, 100, 'neon-league', 'dark', '{}', '{}', ?)
        `).run(id, name, email, password_hash, now());
        return { changes: 1 };
    }

    // INSERT INTO sessions (practice mode stats) - use practice_sessions table
    if (lowerText.includes('insert into sessions') && lowerText.includes('operation')) {
        const [userId, operation, correctCount, totalCount, avgSpeed, xpEarned] = params;
        database.prepare(`
            INSERT INTO practice_sessions (id, user_id, operation, correct_count, total_count, avg_speed, xp_earned, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            generateId(),
            userId,
            operation,
            correctCount,
            totalCount,
            avgSpeed,
            xpEarned,
            now()
        );
        return { changes: 1 };
    }

    // UPDATE users
    if (lowerText.includes('update users')) {
        const id = params[params.length - 1];

        if (lowerText.includes('total_xp = ?, level = ?, coins = ?')) {
            const [xp, level, coins] = params;
            database.prepare('UPDATE users SET total_xp = ?, level = ?, coins = ?, updated_at = ? WHERE id = ?')
                .run(xp, level, coins, now(), id);
        } else if (lowerText.includes('set coins = ?') && !lowerText.includes('total_xp')) {
            database.prepare('UPDATE users SET coins = ?, updated_at = ? WHERE id = ?')
                .run(params[0], now(), id);
        } else if (lowerText.includes('current_league_id = ?')) {
            database.prepare('UPDATE users SET current_league_id = ?, updated_at = ? WHERE id = ?')
                .run(params[0], now(), id);
        } else if (lowerText.includes('math_tiers = ?')) {
            database.prepare('UPDATE users SET math_tiers = ?, updated_at = ? WHERE id = ?')
                .run(JSON.stringify(params[0]), now(), id);
        } else if (lowerText.includes('equipped_items = ?')) {
            database.prepare('UPDATE users SET equipped_items = ?, updated_at = ? WHERE id = ?')
                .run(JSON.stringify(params[0]), now(), id);
        } else if (lowerText.includes('banned_until = ?')) {
            database.prepare('UPDATE users SET banned_until = ?, is_banned = ?, updated_at = ? WHERE id = ?')
                .run(params[0], params[0] ? 1 : 0, now(), id);
        } else if (lowerText.includes('is_banned = ?')) {
            database.prepare('UPDATE users SET is_banned = ?, banned_until = ?, updated_at = ? WHERE id = ?')
                .run(params[0] ? 1 : 0, params[0] ? null : null, now(), id);
        } else if (lowerText.includes('skill_points = ?')) {
            database.prepare('UPDATE users SET skill_points = ?, updated_at = ? WHERE id = ?')
                .run(params[0], now(), id);
            console.log(`[DB] Updated skill_points for user ${id}: ${params[0]}`);
        }
        return { changes: 1 };
    }

    // UPDATE items / shop_items
    if (lowerText.includes('update items') || lowerText.includes('update shop_items')) {
        const id = params[params.length - 1];
        if (params.length === 3) {
            database.prepare('UPDATE shop_items SET rarity = ?, price = ? WHERE id = ?')
                .run(params[0], params[1], id);
        }
        return { changes: 1 };
    }

    // INSERT/UPDATE mastery_stats
    if (lowerText.includes('insert into mastery') || lowerText.includes('update mastery')) {
        // Upsert mastery stat
        if (lowerText.includes('insert')) {
            const [id, userId, operation, fact, responseTime, masteryLevel] = params;
            database.prepare(`
                INSERT OR REPLACE INTO mastery_stats (id, user_id, operation, fact, last_response_time, mastery_level, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id || generateId(), userId, operation, fact, responseTime, masteryLevel, now());
        }
        return { changes: 1 };
    }

    // League participants - add XP to existing or insert new
    if (lowerText.includes('insert into league_participants') || lowerText.includes('update league_participants')) {
        const [leagueId, userId, name, weeklyXp] = params;

        // Check if user already exists in this league
        const existing = database.prepare(
            'SELECT id, weekly_xp FROM league_participants WHERE league_id = ? AND user_id = ?'
        ).get(leagueId, userId) as { id: string; weekly_xp: number } | undefined;

        if (existing) {
            // Add to existing XP
            database.prepare(
                'UPDATE league_participants SET weekly_xp = weekly_xp + ?, name = ? WHERE id = ?'
            ).run(weeklyXp, name, existing.id);
        } else {
            // Insert new participant
            database.prepare(`
                INSERT INTO league_participants (id, league_id, user_id, name, weekly_xp)
                VALUES (?, ?, ?, ?, ?)
            `).run(generateId(), leagueId, userId, name, weeklyXp);
        }
        return { changes: 1 };
    }

    if (lowerText.includes('delete from league_participants')) {
        database.prepare('DELETE FROM league_participants WHERE league_id = ?').run(params[0]);
        return { changes: 1 };
    }

    if (lowerText.includes('update leagues')) {
        const id = params[params.length - 1];
        if (lowerText.includes('end_time = ?')) {
            database.prepare('UPDATE leagues SET end_time = ? WHERE id = ?').run(params[0], id);
        }
        return { changes: 1 };
    }

    // Arena stats updates - execute directly
    if (lowerText.includes('arena_elo') || lowerText.includes('arena_wins') || lowerText.includes('arena_losses') || lowerText.includes('arena_win_streak')) {
        console.log('[DB] Executing arena stats update:', text.substring(0, 100));
        const result = database.prepare(text).run(...params);
        console.log('[DB] Arena update result:', result);
        return { changes: result.changes };
    }

    // Arena matches table
    if (lowerText.includes('arena_matches')) {
        const result = database.prepare(text).run(...params);
        return { changes: result.changes };
    }

    // Fallback: try to execute the SQL directly for any unrecognized patterns
    console.warn('[DB] Unrecognized SQL pattern, attempting direct execution:', text.substring(0, 80));
    try {
        const result = database.prepare(text).run(...params);
        return { changes: result.changes };
    } catch (e) {
        console.error('[DB] Direct execution failed:', e);
        return { changes: 0 };
    }
};

/**
 * Initialize schema and seed data
 */
export const initSchema = () => {
    const database = ensureDb();

    // Sync shop items from static definition to database
    const insertItem = database.prepare(`
        INSERT OR REPLACE INTO shop_items (id, name, description, type, rarity, price, asset_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    database.transaction(() => {
        for (const item of ITEMS) {
            insertItem.run(item.id, item.name, item.description, item.type, item.rarity, item.price, item.assetValue);
        }
    })();
    console.log(`[DB] Synced ${ITEMS.length} shop items to database.`);

};

// Initialize on module load
initSchema();

// =============================================================================
// BATCH QUERY HELPERS (N→1 query optimization)
// =============================================================================

/**
 * Batch get multiple users by ID in a single query
 * Much more efficient than N separate queries
 * 
 * @param userIds - Array of user IDs
 * @returns Array of parsed user objects
 */
export const getUsersBatch = (userIds: string[]): any[] => {
    if (!userIds || userIds.length === 0) return [];
    
    const database = ensureDb();
    const placeholders = userIds.map(() => '?').join(',');
    const rows = database.prepare(`SELECT * FROM users WHERE id IN (${placeholders})`).all(...userIds);
    return rows.map(parseUser);
};

/**
 * Batch get user IDs by email in a single query
 * 
 * @param emails - Array of email addresses
 * @returns Array of { id, email } objects
 */
export const getUserIdsByEmailBatch = (emails: string[]): { id: string; email: string }[] => {
    if (!emails || emails.length === 0) return [];
    
    const database = ensureDb();
    const placeholders = emails.map(() => '?').join(',');
    return database.prepare(`SELECT id, email FROM users WHERE email IN (${placeholders})`).all(...emails) as Array<{ id: string; email: string }>;
};

/**
 * Batch get friendships for multiple users
 * 
 * @param userIds - Array of user IDs
 * @returns Array of friendship records
 */
export const getFriendshipsBatch = (userIds: string[]): any[] => {
    if (!userIds || userIds.length === 0) return [];
    
    const database = ensureDb();
    const placeholders = userIds.map(() => '?').join(',');
    return database.prepare(`
        SELECT f.*, u.name as friend_name, u.level as friend_level
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id IN (${placeholders})
    `).all(...userIds) as any[];
};

/**
 * Batch get practice sessions for multiple users
 * 
 * @param userIds - Array of user IDs
 * @param limit - Max sessions per user (default 10)
 * @returns Array of session records
 */
export const getPracticeSessionsBatch = (userIds: string[], limit: number = 10): Array<{
    id: string;
    user_id: string;
    [key: string]: unknown;
}> => {
    if (!userIds || userIds.length === 0) return [];
    
    const database = ensureDb();
    const placeholders = userIds.map(() => '?').join(',');
    // Get most recent sessions per user using ROW_NUMBER
    return database.prepare(`
        SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
            FROM practice_sessions
            WHERE user_id IN (${placeholders})
        ) WHERE rn <= ?
    `).all(...userIds, limit) as any[];
};

/**
 * Batch get inventory for multiple users
 * 
 * @param userIds - Array of user IDs
 * @returns Array of inventory records
 */
export const getInventoryBatch = (userIds: string[]): Array<{
    id: string;
    user_id: string;
    item_id: string;
    item_name?: string;
    item_type?: string;
    item_rarity?: string;
    [key: string]: unknown;
}> => {
    if (!userIds || userIds.length === 0) return [];
    
    const database = ensureDb();
    const placeholders = userIds.map(() => '?').join(',');
    return database.prepare(`
        SELECT i.*, s.name as item_name, s.type as item_type, s.rarity as item_rarity
        FROM inventory i
        JOIN shop_items s ON i.item_id = s.id
        WHERE i.user_id IN (${placeholders})
    `).all(...userIds) as any[];
};

/**
 * Batch update user coins (e.g., after match rewards)
 * 
 * @param updates - Array of { userId, coinsToAdd }
 * @returns Number of rows updated
 */
export const updateCoinsBatch = (updates: { userId: string; coinsToAdd: number }[]): number => {
    if (!updates || updates.length === 0) return 0;
    
    const database = ensureDb();
    const stmt = database.prepare('UPDATE users SET coins = coins + ?, updated_at = ? WHERE id = ?');
    const timestamp = now();
    
    let totalChanges = 0;
    database.transaction(() => {
        for (const { userId, coinsToAdd } of updates) {
            const result = stmt.run(coinsToAdd, timestamp, userId);
            totalChanges += result.changes;
        }
    })();
    
    return totalChanges;
};

// Export database getter for direct access when needed
export { getDatabase, generateId, now };
