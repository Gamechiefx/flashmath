#!/usr/bin/env node

/**
 * Database Optimization Script
 * 
 * Low-effort, high-impact optimizations for FlashMath
 * Run: node scripts/optimize-databases.js
 */

const Database = require('better-sqlite3');
const { Pool } = require('pg');

// Configuration
const SQLITE_PATH = process.env.DATABASE_URL || '/app/flashmath.db';

// Validate PostgreSQL credentials are set (no hardcoded defaults for security)
if (!process.env.POSTGRES_PASSWORD) {
    console.warn('⚠️  WARNING: POSTGRES_PASSWORD environment variable is not set.');
    console.warn('   Set POSTGRES_PASSWORD before running this script in production.');
    console.warn('   Example: POSTGRES_PASSWORD=your_secure_password node scripts/optimize-databases.js\n');
}

const pgPool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'flashmath_arena',
    user: process.env.POSTGRES_USER || 'flashmath',
    password: process.env.POSTGRES_PASSWORD,
});

async function optimizeSQLite() {
    console.log('📊 Optimizing SQLite...\n');
    
    const db = new Database(SQLITE_PATH);
    
    // 1. Enable WAL mode (if not already)
    const walMode = db.pragma('journal_mode = WAL');
    console.log(`  ✓ Journal mode: ${walMode[0].journal_mode}`);
    
    // 2. Set synchronous to NORMAL (faster, still safe)
    db.pragma('synchronous = NORMAL');
    console.log('  ✓ Synchronous mode: NORMAL');
    
    // 3. Increase cache size (default is 2MB, set to 64MB)
    db.pragma('cache_size = -65536'); // Negative = KB
    console.log('  ✓ Cache size: 64MB');
    
    // 4. Enable memory-mapped I/O (256MB)
    db.pragma('mmap_size = 268435456');
    console.log('  ✓ Memory-mapped I/O: 256MB');
    
    // 5. Set temp store to memory
    db.pragma('temp_store = MEMORY');
    console.log('  ✓ Temp store: MEMORY');
    
    // 6. Create missing indexes
    console.log('\n  Creating indexes...');
    
    const indexes = [
        // Users
        { name: 'idx_users_email', sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)' },
        { name: 'idx_users_role', sql: 'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)' },
        { name: 'idx_users_created_at', sql: 'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)' },
        { name: 'idx_users_total_xp', sql: 'CREATE INDEX IF NOT EXISTS idx_users_total_xp ON users(total_xp DESC)' },
        { name: 'idx_users_level', sql: 'CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC)' },
        
        // Friendships
        { name: 'idx_friendships_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id)' },
        { name: 'idx_friendships_friend_id', sql: 'CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id)' },
        { name: 'idx_friendships_composite', sql: 'CREATE INDEX IF NOT EXISTS idx_friendships_composite ON friendships(user_id, friend_id)' },
        
        // Friend requests
        { name: 'idx_friend_requests_to', sql: 'CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id, status)' },
        { name: 'idx_friend_requests_from', sql: 'CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id, status)' },
        
        // Practice sessions
        { name: 'idx_practice_user_date', sql: 'CREATE INDEX IF NOT EXISTS idx_practice_user_date ON practice_sessions(user_id, created_at DESC)' },
        { name: 'idx_practice_operation', sql: 'CREATE INDEX IF NOT EXISTS idx_practice_operation ON practice_sessions(operation)' },
        
        // Inventory
        { name: 'idx_inventory_user', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id)' },
        { name: 'idx_inventory_item', sql: 'CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id)' },
        
        // Parties
        { name: 'idx_parties_leader', sql: 'CREATE INDEX IF NOT EXISTS idx_parties_leader ON parties(leader_id)' },
        { name: 'idx_party_members_user', sql: 'CREATE INDEX IF NOT EXISTS idx_party_members_user ON party_members(user_id)' },
        { name: 'idx_party_members_party', sql: 'CREATE INDEX IF NOT EXISTS idx_party_members_party ON party_members(party_id)' },
    ];
    
    let created = 0;
    for (const idx of indexes) {
        try {
            db.exec(idx.sql);
            created++;
        } catch (err) {
            // Table might not exist, skip
        }
    }
    console.log(`  ✓ Created/verified ${created} indexes`);
    
    // 7. Analyze for query optimizer
    db.exec('ANALYZE');
    console.log('  ✓ Analyzed tables for query optimizer');
    
    // 8. Vacuum to reclaim space (optional, can be slow)
    // Uncomment if needed:
    // db.exec('VACUUM');
    // console.log('  ✓ Vacuumed database');
    
    db.close();
    console.log('\n✅ SQLite optimization complete!\n');
}

async function optimizePostgreSQL() {
    console.log('🐘 Optimizing PostgreSQL...\n');
    
    // 1. Create missing indexes
    const indexes = [
        // arena_players
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo ON arena_players(elo DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo_addition ON arena_players(elo_addition DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo_subtraction ON arena_players(elo_subtraction DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo_multiplication ON arena_players(elo_multiplication DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo_division ON arena_players(elo_division DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_elo_5v5 ON arena_players(elo_5v5 DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_duel_wins ON arena_players(duel_wins DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_matches ON arena_players(matches_played DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_players_username ON arena_players(username)',
        
        // arena_matches (if exists)
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_player1 ON arena_matches(player1_id)',
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_player2 ON arena_matches(player2_id)',
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_arena_matches_winner ON arena_matches(winner_id)',
    ];
    
    let created = 0;
    for (const sql of indexes) {
        try {
            await pgPool.query(sql);
            created++;
        } catch (err) {
            // Table/column might not exist
        }
    }
    console.log(`  ✓ Created/verified ${created} indexes`);
    
    // 2. Update statistics for query planner
    try {
        await pgPool.query('ANALYZE arena_players');
        console.log('  ✓ Analyzed arena_players table');
    } catch (err) {
        console.log('  ⚠ Could not analyze arena_players');
    }
    
    // 3. Check connection pool settings
    const poolStats = await pgPool.query('SHOW max_connections');
    console.log(`  ✓ Max connections: ${poolStats.rows[0].max_connections}`);
    
    console.log('\n✅ PostgreSQL optimization complete!\n');
}

async function showStats() {
    console.log('📈 Database Statistics\n');
    
    // SQLite stats
    const db = new Database(SQLITE_PATH);
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const sessionCount = db.prepare('SELECT COUNT(*) as count FROM practice_sessions').get();
    const friendCount = db.prepare('SELECT COUNT(*) as count FROM friendships').get();
    
    console.log('  SQLite:');
    console.log(`    Users: ${userCount.count}`);
    console.log(`    Practice sessions: ${sessionCount.count}`);
    console.log(`    Friendships: ${friendCount.count}`);
    
    // Database size
    const pageCount = db.pragma('page_count')[0].page_count;
    const pageSize = db.pragma('page_size')[0].page_size;
    const dbSize = (pageCount * pageSize / 1024 / 1024).toFixed(2);
    console.log(`    Database size: ${dbSize} MB`);
    
    db.close();
    
    // PostgreSQL stats
    try {
        const arenaPlayers = await pgPool.query('SELECT COUNT(*) as count FROM arena_players');
        console.log('\n  PostgreSQL:');
        console.log(`    Arena players: ${arenaPlayers.rows[0].count}`);
        
        const dbSize = await pgPool.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        console.log(`    Database size: ${dbSize.rows[0].size}`);
    } catch (err) {
        console.log('\n  PostgreSQL: Could not fetch stats');
    }
    
    console.log('');
}

async function main() {
    console.log('🚀 FlashMath Database Optimization\n');
    console.log('═'.repeat(50) + '\n');
    
    let exitCode = 0;
    try {
        await optimizeSQLite();
        await optimizePostgreSQL();
        await showStats();
        
        console.log('═'.repeat(50));
        console.log('\n🎉 All optimizations complete!\n');
        console.log('Additional recommendations:');
        console.log('  • Run this script weekly or after major data changes');
        console.log('  • Monitor slow queries in production');
        console.log('  • Consider VACUUM FULL for SQLite if size grows significantly\n');
        
    } catch (error) {
        console.error('❌ Optimization failed:', error);
        exitCode = 1;
    }
    
    await pgPool.end();
    process.exit(exitCode);
}

main();

