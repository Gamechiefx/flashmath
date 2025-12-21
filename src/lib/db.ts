import fs from 'fs';
import path from 'path';

// Define the database file path
const dbPath = path.join(process.cwd(), 'flashmath_db.json');

// Memory cache of the database
let data: {
    users: any[];
    mastery_stats: any[];
    sessions: any[];
} = {
    users: [],
    mastery_stats: [],
    sessions: []
};

// HELPER: Load data from file
const loadData = () => {
    if (fs.existsSync(dbPath)) {
        try {
            const content = fs.readFileSync(dbPath, 'utf8');
            data = JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse DB file, resetting to empty state", e);
        }
    }
};

// HELPER: Save data to file
const saveData = () => {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// Initial load
loadData();

/**
 * Executes a query that returns multiple rows.
 * Pure JS Implementation
 */
export const query = (text: string, params: any[] = []) => {
    loadData();
    const lowerText = text.toLowerCase();

    if (lowerText.includes('from users')) {
        return data.users;
    }
    if (lowerText.includes('from mastery_stats')) {
        const userId = params[0];
        return data.mastery_stats.filter(s => s.user_id === userId);
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
        return data.users.find(u => u.email === email) || null;
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
 * Mimics SQL behavior using JS arrays.
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
        // This is a simplification for the prototype
        const [user_id, operation, fact, speed, mastery] = params;
        data.mastery_stats.push({
            id: Date.now(),
            user_id,
            operation,
            fact,
            last_response_time: speed,
            mastery_level: mastery,
            updated_at: new Date().toISOString()
        });
    }

    saveData();
    return { changes: 1 };
};

// Initialize schema (No-op in JSON version, but kept for compatibility)
export const initSchema = () => {
    console.log('Initializing JSON Storage Engine...');
    if (!fs.existsSync(dbPath)) {
        saveData();
    }
    console.log('JSON Engine ready.');
};

export default data;
