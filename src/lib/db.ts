/**
 * FlashMath Database Layer - SQLite Backend
 * Maintains backward-compatible API with JSON-based db.ts
 */

import { getDatabase, generateId, now } from './db/sqlite';
import Database from 'better-sqlite3';
import { ITEMS } from './items';

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
            return database.prepare('SELECT * FROM sessions').all();
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

    // INSERT INTO sessions (practice mode stats)
    if (lowerText.includes('insert into sessions')) {
        const [userId, operation, correctCount, totalCount, avgSpeed, xpEarned] = params;
        database.prepare(`
            INSERT INTO sessions (id, user_id, token, operation, correct_count, total_count, avg_speed, xp_earned, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            generateId(),
            userId,
            generateId(), // token placeholder
            operation,
            correctCount,
            totalCount,
            avgSpeed,
            xpEarned,
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // expires_at
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

    // League participants
    if (lowerText.includes('insert into league_participants') || lowerText.includes('update league_participants')) {
        const [leagueId, userId, name, weeklyXp] = params;
        database.prepare(`
            INSERT OR REPLACE INTO league_participants (id, league_id, user_id, name, weekly_xp)
            VALUES (?, ?, ?, ?, ?)
        `).run(generateId(), leagueId, userId, name, weeklyXp);
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

    return { changes: 0 };
};

/**
 * Initialize schema and seed data
 */
export const initSchema = () => {
    const database = ensureDb();

    // Seed shop items if empty
    const itemCount = database.prepare('SELECT COUNT(*) as count FROM shop_items').get() as { count: number };
    if (itemCount.count === 0) {
        const insertItem = database.prepare(`
            INSERT INTO shop_items (id, name, description, type, rarity, price, asset_value)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of ITEMS) {
            insertItem.run(item.id, item.name, item.description, item.type, item.rarity, item.price, item.assetValue);
        }
        console.log(`[DB] Seeded ${ITEMS.length} items into database.`);
    }
};

// Initialize on module load
initSchema();

// Export database getter for direct access when needed
export { getDatabase, generateId, now };
