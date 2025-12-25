import fs from 'fs';
import path from 'path';

// Define the database file path
const dbPath = path.join(process.cwd(), 'flashmath_db.json');

// Memory cache of the database - using a stable object reference
const data: {
    users: any[];
    mastery_stats: any[];
    sessions: any[];
    leagues: any[];
    league_participants: any[];
    shop_items: any[];
    inventory: any[];
} = {
    users: [],
    mastery_stats: [],
    sessions: [],
    leagues: [],
    league_participants: [],
    shop_items: [],
    inventory: []
};

// HELPER: Load data from file
export const loadData = () => {
    if (fs.existsSync(dbPath)) {
        try {
            const content = fs.readFileSync(dbPath, 'utf8');
            if (!content || content.trim() === '') return data;

            const parsed = JSON.parse(content);

            // Update the stable object properties instead of reassigning 'data'
            data.users = (parsed.users || []).map((u: any) => ({
                level: 1,
                coins: 100,
                current_league_id: 'neon-league',
                math_tiers: {
                    addition: 0,
                    subtraction: 0,
                    multiplication: 0,
                    division: 0
                },
                ...u,
                // Ensure math_tiers exists even if ...u overwrites it with nothing (if u comes from old DB)
                // Actually ...u comes from parsed JSON which MIGHT have math_tiers.
                // If it doesn't, we want the default.
                // So...
            }));

            // Second pass to ensure math_tiers is set if it was missing in the file
            data.users = data.users.map(u => ({
                ...u,
                math_tiers: u.math_tiers || {
                    addition: 0,
                    subtraction: 0,
                    multiplication: 0,
                    division: 0
                },
                equipped_items: u.equipped_items || {
                    theme: 'default',
                    particle: 'default',
                    font: 'default',
                    sound: 'default',
                    bgm: 'default',
                    title: 'default',
                    frame: 'default'
                }
            }));
            data.leagues = parsed.leagues || [];
            data.league_participants = parsed.league_participants || [];
            data.shop_items = parsed.shop_items || [];
            data.inventory = parsed.inventory || [];

            // Critical: Heal orphaned data missing user_id
            const defaultId = data.users[0]?.id || "unknown";
            data.mastery_stats = (parsed.mastery_stats || []).map((s: any) => ({
                ...s,
                user_id: s.user_id || defaultId
            }));
            data.sessions = (parsed.sessions || []).map((s: any) => ({
                ...s,
                user_id: s.user_id || defaultId
            }));

            console.log(`[DB] Sync: ${data.users.length} users, ${data.sessions.length} sessions`);
        } catch (e) {
            console.error("Failed to parse DB file", e);
        }
    }
    return data;
};

// HELPER: Save data to file
export const saveData = () => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Critical: Failed to save DB file", e);
    }
};

// Initial load
loadData();

// Seed items logic helper
import { ITEMS } from './items';

/**
 * Executes a query that returns multiple rows.
 */
export const query = (text: string, params: any[] = []) => {
    loadData();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('from users')) {
        return data.users;
    }
    if (lowerText.includes('from mastery_stats')) {
        const userId = params[0];
        let results = data.mastery_stats.filter(s => s.user_id === userId);

        if (lowerText.includes('operation = ?') && params[1]) {
            results = results.filter(s => s.operation === params[1]);
        }
        if (lowerText.includes('fact = ?') && params[2]) {
            results = results.filter(s => s.fact === params[2]);
        }
        return results;
    }
    if (lowerText.includes('from leagues')) {
        return data.leagues;
    }
    if (lowerText.includes('from league_participants')) {
        const leagueId = params[0];
        return data.league_participants.filter(p => p.league_id === leagueId);
    }
    if (lowerText.includes('from items')) { // NEW
        return data.shop_items;
    }
    return [];
};

/**
 * Executes a query that returns a single row.
 */
export const queryOne = (text: string, params: any[] = []) => {
    loadData();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('select * from users where email = ?')) {
        const email = params[0];
        const user = data.users.find(u => u.email === email);
        return user || null;
    }

    if (lowerText.includes('select id from users where email = ?')) {
        const email = params[0];
        const user = data.users.find(u => u.email === email);
        return user ? { id: user.id } : null;
    }

    if (lowerText.includes('select * from users where id = ?')) {
        const id = params[0];
        const user = data.users.find(u => u.id === id);
        return user || null;
    }

    if (lowerText.includes('select * from leagues where id = ?')) {
        const id = params[0];
        return data.leagues.find(l => l.id === id) || null;
    }

    if (lowerText.includes('select * from items where id = ?')) { // NEW
        const id = params[0];
        return data.shop_items.find(i => i.id === id) || null;
    }

    return null;
};

/**
 * Executes a statement (INSERT, UPDATE, DELETE).
 */
export const execute = (text: string, params: any[] = []) => {
    loadData();
    const lowerText = text.toLowerCase();

    // INSERT INTO users
    if (lowerText.includes('insert into users')) {
        const [id, name, email, password_hash] = params;
        data.users.push({
            id,
            name,
            email,
            password_hash,
            theme_preferences: 'dark',
            level: 1,
            total_xp: 0,
            coins: 100,
            current_league_id: 'neon-league',
            math_tiers: {
                addition: 0,
                subtraction: 0,
                multiplication: 0,
                division: 0
            },
            equipped_items: {
                theme: 'default',
                particle: 'default',
                font: 'default',
                sound: 'default',
                bgm: 'default',
                title: 'default',
                frame: 'default'
            },
            created_at: new Date().toISOString()
        });
    }

    // UPDATE users (for xp, coins, level)
    if (lowerText.includes('update users')) {
        const id = params[params.length - 1];
        const user = data.users.find(u => u.id === id);
        if (user) {
            if (lowerText.includes('total_xp = ?, level = ?, coins = ?')) {
                const [xp, level, coins] = params;
                user.total_xp = xp;
                user.level = level;
                user.coins = coins;
            } else if (lowerText.includes('set coins = ?') && !lowerText.includes('total_xp')) {
                // Handle simple "UPDATE users SET coins = ? WHERE id = ?"
                user.coins = params[0];
            } else if (lowerText.includes('current_league_id = ?')) {
                user.current_league_id = params[0];
            } else if (lowerText.includes('math_tiers = ?')) {
                user.math_tiers = params[0];
            } else if (lowerText.includes('equipped_items = ?')) {
                user.equipped_items = params[0];
            } else if (lowerText.includes('banned_until = ?')) {
                user.banned_until = params[0]; // ISO string or null
                // Also sync is_banned boolean for backward compat/easy checks
                user.is_banned = !!params[0];
            } else if (lowerText.includes('is_banned = ?')) {
                user.is_banned = !!params[0];
                if (!user.is_banned) user.banned_until = null;
            }
        }
    }

    // UPDATE items (for Admin editing)
    if (lowerText.includes('update items')) {
        const id = params[params.length - 1];
        const item = data.shop_items.find(i => i.id === id);
        if (item) {
            if (lowerText.includes('rarity = ?')) {
                item.rarity = params[0];
            }
            if (lowerText.includes('price = ?')) {
                item.price = params[0]; // Or params[1] depending on SQL structure, but let's assume simple updates
                // Actually usually execute logic parses the exact SET string. 
                // We'll simplify: "UPDATE items SET rarity = ?, price = ? WHERE id = ?"
                // Params: [newRarity, newPrice, id]
                if (params.length === 3) {
                    item.rarity = params[0];
                    item.price = params[1];
                }
            }
        }
    }


    // INSERT INTO mastery_stats
    if (lowerText.includes('insert into mastery_stats')) {
        const [user_id, operation, fact, speed, mastery] = params;
        data.mastery_stats.push({
            id: Date.now() + Math.random(),
            user_id,
            operation,
            fact,
            last_response_time: speed,
            mastery_level: mastery,
            updated_at: new Date().toISOString()
        });
    }

    // INSERT INTO sessions
    if (lowerText.includes('insert into sessions')) {
        const [user_id, operation, correct_count, total_count, avg_speed, xp_earned] = params;
        data.sessions.push({
            id: Date.now(),
            user_id,
            operation,
            correct_count,
            total_count,
            avg_speed,
            xp_earned: xp_earned || 0,
            created_at: new Date().toISOString()
        });
    }

    // LEAGUE STATEMENTS
    if (lowerText.includes('insert into league_participants')) {
        const [league_id, user_id, name, weekly_xp] = params;
        const existing = data.league_participants.find(p => p.league_id === league_id && p.user_id === user_id);
        if (existing) {
            existing.weekly_xp += weekly_xp;
        } else {
            data.league_participants.push({ league_id, user_id, name, weekly_xp });
        }
    }

    if (lowerText.includes('delete from league_participants')) {
        const leagueId = params[0];
        data.league_participants = data.league_participants.filter(p => p.league_id !== leagueId);
    }

    if (lowerText.includes('update leagues')) {
        const id = params[params.length - 1];
        const league = data.leagues.find(l => l.id === id);
        if (league && lowerText.includes('end_time = ?')) {
            league.end_time = params[0];
        }
    }

    saveData();
    return { changes: 1 };
};

export const initSchema = () => {
    loadData();

    // Seed Leagues if empty
    if (data.leagues.length === 0) {
        data.leagues = [
            { id: 'neon-league', name: 'NEON', min_rank: 1, end_time: new Date(Date.now() + 5 * 60000).toISOString() },
            { id: 'cobalt-league', name: 'COBALT', min_rank: 2, end_time: new Date(Date.now() + 5 * 60000).toISOString() },
            { id: 'plasma-league', name: 'PLASMA', min_rank: 3, end_time: new Date(Date.now() + 5 * 60000).toISOString() },
            { id: 'void-league', name: 'VOID', min_rank: 4, end_time: new Date(Date.now() + 5 * 60000).toISOString() },
            { id: 'apex-league', name: 'APEX', min_rank: 5, end_time: new Date(Date.now() + 5 * 60000).toISOString() }
        ];
    }

    // Seed Items if empty
    if (data.shop_items.length === 0) {
        // Strip out React icons (they don't serialize well to JSON/DB)
        // We'll hydrate the icons on the frontend based on ItemType/ID if needed, or store simple string identifiers
        // Actually ITEMS are just static data in items.ts, we want to migrate them to DB.
        // We can store everything EXCEPT the icon function.
        const dbItems = ITEMS.map(({ icon, ...rest }) => rest);
        data.shop_items = dbItems;
        console.log(`[DB] Seeded ${data.shop_items.length} items into database.`);
    }

    // Seed Super Admin if not exists
    const ADMIN_EMAIL = 'admin@flashmath.io';
    const adminExists = data.users.some(u => u.email === ADMIN_EMAIL);
    if (!adminExists) {
        // bcrypt hash for 'flashadmin!'
        const ADMIN_PASSWORD_HASH = '$2b$10$oUmu3ok39yQLiORP47FcTe3/udpjrmXYffj/50drWX7tbK1KG5/oq';
        data.users.push({
            id: 'super-admin-001',
            name: 'FlashAdmin',
            email: ADMIN_EMAIL,
            password_hash: ADMIN_PASSWORD_HASH,
            theme_preferences: 'dark',
            level: 99,
            total_xp: 999999,
            coins: 999999999,
            current_league_id: 'apex-league',
            is_admin: true,
            math_tiers: {
                addition: 4,
                subtraction: 4,
                multiplication: 4,
                division: 4
            },
            equipped_items: {
                theme: 'default',
                particle: 'default',
                font: 'default',
                sound: 'default',
                bgm: 'default',
                title: 'default',
                frame: 'default'
            },
            created_at: new Date().toISOString()
        });
        console.log(`[DB] Seeded super admin account: ${ADMIN_EMAIL}`);
    }

    saveData();
};

// Initial load
initSchema();

export default data;
