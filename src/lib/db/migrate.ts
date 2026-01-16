/**
 * Migration script: JSON to SQLite
 * Run this once to migrate existing flashmath_db.json to SQLite
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Migration script uses any for JSON data */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getDatabase, generateId, now } from './sqlite';

const JSON_DB_PATH = path.join(process.cwd(), 'flashmath_db.json');

interface JsonDatabase {
    users: any[];
    mastery_stats: any[];
    sessions: any[];
    leagues: any[];
    league_participants: any[];
    shop_items: any[];
    inventory: any[];
}

export function migrateFromJson(): { success: boolean; error?: string; stats?: Record<string, number> } {
    // Check if JSON file exists
    if (!fs.existsSync(JSON_DB_PATH)) {
        return { success: false, error: 'JSON database file not found' };
    }

    try {
        const jsonData: JsonDatabase = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
        const db = getDatabase();
        const stats: Record<string, number> = {};

        // Disable foreign keys during migration to avoid constraint issues
        db.pragma('foreign_keys = OFF');

        // Begin transaction
        const migrate = db.transaction(() => {
            // Migrate users
            if (jsonData.users && jsonData.users.length > 0) {
                const insertUser = db.prepare(`
                    INSERT OR REPLACE INTO users (
                        id, email, email_verified, name, password_hash,
                        level, total_xp, coins, current_league_id, theme_preferences,
                        math_tiers, equipped_items, is_admin, is_banned, banned_until,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const user of jsonData.users) {
                    insertUser.run(
                        user.id,
                        user.email,
                        user.email_verified ? 1 : 0,
                        user.name,
                        user.password_hash,
                        user.level || 1,
                        user.total_xp || 0,
                        user.coins || 100,
                        user.current_league_id || 'neon-league',
                        user.theme_preferences || 'dark',
                        JSON.stringify(user.math_tiers || {}),
                        JSON.stringify(user.equipped_items || {}),
                        user.is_admin ? 1 : 0,
                        user.is_banned ? 1 : 0,
                        user.banned_until || null,
                        user.created_at || now(),
                        now()
                    );
                }
                stats.users = jsonData.users.length;
            }

            // Migrate mastery_stats
            if (jsonData.mastery_stats && jsonData.mastery_stats.length > 0) {
                const insertMastery = db.prepare(`
                    INSERT OR REPLACE INTO mastery_stats (id, user_id, operation, fact, last_response_time, mastery_level, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (const stat of jsonData.mastery_stats) {
                    insertMastery.run(
                        stat.id?.toString() || generateId(),
                        stat.user_id,
                        stat.operation,
                        stat.fact,
                        stat.last_response_time,
                        stat.mastery_level || 0,
                        stat.updated_at || now()
                    );
                }
                stats.mastery_stats = jsonData.mastery_stats.length;
            }

            // Migrate leagues
            if (jsonData.leagues && jsonData.leagues.length > 0) {
                const insertLeague = db.prepare(`
                    INSERT OR REPLACE INTO leagues (id, name, min_rank, end_time)
                    VALUES (?, ?, ?, ?)
                `);

                for (const league of jsonData.leagues) {
                    insertLeague.run(league.id, league.name, league.min_rank, league.end_time);
                }
                stats.leagues = jsonData.leagues.length;
            }

            // Migrate league_participants
            if (jsonData.league_participants && jsonData.league_participants.length > 0) {
                const insertParticipant = db.prepare(`
                    INSERT OR REPLACE INTO league_participants (id, league_id, user_id, name, weekly_xp)
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const p of jsonData.league_participants) {
                    insertParticipant.run(
                        generateId(),
                        p.league_id,
                        p.user_id,
                        p.name,
                        p.weekly_xp || 0
                    );
                }
                stats.league_participants = jsonData.league_participants.length;
            }

            // Migrate shop_items
            if (jsonData.shop_items && jsonData.shop_items.length > 0) {
                const insertItem = db.prepare(`
                    INSERT OR REPLACE INTO shop_items (id, name, description, type, rarity, price, asset_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (const item of jsonData.shop_items) {
                    insertItem.run(
                        item.id,
                        item.name,
                        item.description || '',
                        item.type,
                        item.rarity,
                        item.price,
                        item.assetValue || item.asset_value || ''
                    );
                }
                stats.shop_items = jsonData.shop_items.length;
            }

            // Migrate inventory
            if (jsonData.inventory && jsonData.inventory.length > 0) {
                const insertInventory = db.prepare(`
                    INSERT OR REPLACE INTO inventory (id, user_id, item_id, acquired_at)
                    VALUES (?, ?, ?, ?)
                `);

                for (const inv of jsonData.inventory) {
                    insertInventory.run(
                        inv.id?.toString() || generateId(),
                        inv.user_id,
                        inv.item_id,
                        inv.acquired_at || now()
                    );
                }
                stats.inventory = jsonData.inventory.length;
            }
        });

        // Execute migration
        migrate();

        // Re-enable foreign keys
        db.pragma('foreign_keys = ON');

        // Verify integrity
        const integrityCheck = db.pragma('integrity_check');
        console.log('[Migration] Integrity check:', integrityCheck);

        console.log('[Migration] Successfully migrated from JSON to SQLite:', stats);
        return { success: true, stats };

    } catch (error: any) {
        console.error('[Migration] Failed:', error);
        return { success: false, error: error.message };
    }
}

// CLI entry point
if (require.main === module) {
    console.log('Starting migration from JSON to SQLite...');
    const result = migrateFromJson();
    if (result.success) {
        console.log('Migration completed successfully!');
        console.log('Stats:', result.stats);
    } else {
        console.error('Migration failed:', result.error);
        process.exit(1);
    }
}
