#!/usr/bin/env node

/**
 * Script to repair one-way friendships in the database
 * Run with: node scripts/repair-friendships.js
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'flashmath.db');
const db = new Database(dbPath);

console.log('[Repair] Connected to database:', dbPath);

// Find all one-way friendships
const oneWayFriendships = db.prepare(`
    SELECT f.id, f.user_id, f.friend_id, f.created_at,
           u1.name as user_name, u2.name as friend_name
    FROM friendships f
    LEFT JOIN users u1 ON f.user_id = u1.id
    LEFT JOIN users u2 ON f.friend_id = u2.id
    WHERE NOT EXISTS (
        SELECT 1 FROM friendships f2 
        WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
    )
`).all();

console.log(`[Repair] Found ${oneWayFriendships.length} one-way friendships to repair`);

if (oneWayFriendships.length === 0) {
    console.log('[Repair] No repairs needed!');
    process.exit(0);
}

// Show what will be repaired
console.log('\n[Repair] One-way friendships found:');
for (const f of oneWayFriendships) {
    console.log(`  ${f.user_name || f.user_id} -> ${f.friend_name || f.friend_id} (missing reverse)`);
}

// Repair in a transaction
const timestamp = new Date().toISOString();
let repaired = 0;

const repair = db.transaction(() => {
    for (const f of oneWayFriendships) {
        const newId = uuidv4();
        const result = db.prepare(`
            INSERT OR IGNORE INTO friendships (id, user_id, friend_id, created_at)
            VALUES (?, ?, ?, ?)
        `).run(newId, f.friend_id, f.user_id, f.created_at || timestamp);
        if (result.changes > 0) {
            repaired++;
            console.log(`[Repair] Created: ${f.friend_name || f.friend_id} -> ${f.user_name || f.user_id}`);
        } else {
            console.log(`[Repair] Skipped (already exists): ${f.friend_name || f.friend_id} -> ${f.user_name || f.user_id}`);
        }
    }
});

repair();

console.log(`\n[Repair] Successfully repaired ${repaired} friendships!`);

// Verify the repair
const remaining = db.prepare(`
    SELECT COUNT(*) as count
    FROM friendships f
    WHERE NOT EXISTS (
        SELECT 1 FROM friendships f2 
        WHERE f2.user_id = f.friend_id AND f2.friend_id = f.user_id
    )
`).get();

console.log(`[Repair] Remaining one-way friendships: ${remaining.count}`);

db.close();

