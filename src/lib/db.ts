import fs from 'fs';
import path from 'path';

// Define the database file path
const dbPath = path.join(process.cwd(), 'flashmath_db.json');

// Memory cache of the database - using a stable object reference
const data: {
    users: any[];
    mastery_stats: any[];
    sessions: any[];
} = {
    users: [],
    mastery_stats: [],
    sessions: []
};

// HELPER: Load data from file
export const loadData = () => {
    if (fs.existsSync(dbPath)) {
        try {
            const content = fs.readFileSync(dbPath, 'utf8');
            if (!content || content.trim() === '') return data;

            const parsed = JSON.parse(content);

            // Update the stable object properties instead of reassigning 'data'
            data.users = parsed.users || [];

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
            created_at: new Date().toISOString()
        });
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

    saveData();
    return { changes: 1 };
};

export const initSchema = () => {
    loadData(); // Trigger healing
    saveData(); // Persist healing
};

export default data;
