/**
 * FlashMath Arena - PostgreSQL Database Layer
 * 
 * Handles persistent storage for Arena:
 * - Player Elo ratings
 * - Match history
 * - Arena statistics
 * 
 * @module postgres
 */

const { Pool } = require('pg');

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

let pool = null;

/**
 * Get or create PostgreSQL connection pool
 */
function getPool() {
    if (pool) {
        return pool;
    }

    pool = new Pool({
        connectionString: process.env.ARENA_DATABASE_URL || process.env.DATABASE_URL,
        max: 10,                    // Max connections in pool
        idleTimeoutMillis: 30000,   // Close idle connections after 30s
        connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
        console.error('[PostgreSQL] Unexpected error:', err);
    });

    pool.on('connect', () => {
        console.log('[PostgreSQL] New client connected');
    });

    return pool;
}

/**
 * Initialize database schema
 */
async function initSchema() {
    const client = await getPool().connect();

    try {
        await client.query('BEGIN');

        // Arena player stats table
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_players (
                user_id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                elo INTEGER DEFAULT 1000,
                peak_elo INTEGER DEFAULT 1000,
                matches_played INTEGER DEFAULT 0,
                matches_won INTEGER DEFAULT 0,
                matches_lost INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                best_streak INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                practice_tier VARCHAR(50) DEFAULT 'BRONZE',
                confidence_score DECIMAL(3,2) DEFAULT 0.00,
                last_match_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Match history table
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_matches (
                id VARCHAR(255) PRIMARY KEY,
                player1_id VARCHAR(255) NOT NULL,
                player2_id VARCHAR(255) NOT NULL,
                winner_id VARCHAR(255),
                player1_score INTEGER DEFAULT 0,
                player2_score INTEGER DEFAULT 0,
                player1_elo_before INTEGER,
                player2_elo_before INTEGER,
                player1_elo_change INTEGER DEFAULT 0,
                player2_elo_change INTEGER DEFAULT 0,
                questions_count INTEGER,
                match_duration_ms INTEGER,
                is_draw BOOLEAN DEFAULT FALSE,
                is_forfeit BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (player1_id) REFERENCES arena_players(user_id) ON DELETE CASCADE,
                FOREIGN KEY (player2_id) REFERENCES arena_players(user_id) ON DELETE CASCADE
            )
        `);

        // Match questions (for analytics)
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_match_questions (
                id SERIAL PRIMARY KEY,
                match_id VARCHAR(255) NOT NULL,
                question_number INTEGER NOT NULL,
                question_text VARCHAR(255),
                correct_answer INTEGER,
                player1_answer INTEGER,
                player2_answer INTEGER,
                player1_time_ms INTEGER,
                player2_time_ms INTEGER,
                player1_correct BOOLEAN,
                player2_correct BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES arena_matches(id) ON DELETE CASCADE
            )
        `);

        // Indexes for common queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_arena_players_elo ON arena_players(elo DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_player1 ON arena_matches(player1_id);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_player2 ON arena_matches(player2_id);
        `);

        await client.query('COMMIT');
        console.log('[PostgreSQL] Arena schema initialized');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[PostgreSQL] Schema initialization error:', err);
        throw err;
    } finally {
        client.release();
    }
}

// =============================================================================
// PLAYER OPERATIONS
// =============================================================================

/**
 * Get or create arena player record
 * @param {string} userId - User ID
 * @param {string} username - Display name
 */
async function getOrCreatePlayer(userId, username) {
    const pool = getPool();

    // Try to get existing player
    let result = await pool.query(
        'SELECT * FROM arena_players WHERE user_id = $1',
        [userId]
    );

    if (result.rows.length > 0) {
        return result.rows[0];
    }

    // Create new player
    result = await pool.query(`
        INSERT INTO arena_players (user_id, username)
        VALUES ($1, $2)
        RETURNING *
    `, [userId, username]);

    return result.rows[0];
}

/**
 * Get player by ID
 */
async function getPlayer(userId) {
    const result = await getPool().query(
        'SELECT * FROM arena_players WHERE user_id = $1',
        [userId]
    );
    return result.rows[0] || null;
}

/**
 * Update player Elo after a match
 * @param {string} userId - Player ID
 * @param {number} eloChange - Elo change (positive or negative)
 * @param {boolean} won - Whether player won
 */
async function updatePlayerElo(userId, eloChange, won) {
    const pool = getPool();

    await pool.query(`
        UPDATE arena_players
        SET 
            elo = GREATEST(0, elo + $2),
            peak_elo = GREATEST(peak_elo, elo + $2),
            matches_played = matches_played + 1,
            matches_won = matches_won + CASE WHEN $3 THEN 1 ELSE 0 END,
            matches_lost = matches_lost + CASE WHEN $3 THEN 0 ELSE 1 END,
            current_streak = CASE WHEN $3 THEN current_streak + 1 ELSE 0 END,
            best_streak = CASE WHEN $3 THEN GREATEST(best_streak, current_streak + 1) ELSE best_streak END,
            last_match_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, eloChange, won]);
}

/**
 * Update player's practice tier and confidence
 */
async function updatePlayerTier(userId, tier, confidence) {
    await getPool().query(`
        UPDATE arena_players
        SET practice_tier = $2, confidence_score = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, tier, confidence]);
}

/**
 * Get leaderboard
 * @param {number} limit - Number of players to return
 */
async function getLeaderboard(limit = 100) {
    const result = await getPool().query(`
        SELECT 
            user_id, username, elo, peak_elo, 
            matches_played, matches_won, matches_lost,
            current_streak, best_streak, practice_tier,
            CASE WHEN matches_played > 0 
                THEN ROUND(matches_won::numeric / matches_played * 100, 1) 
                ELSE 0 
            END as win_rate
        FROM arena_players
        WHERE matches_played >= 5
        ORDER BY elo DESC
        LIMIT $1
    `, [limit]);

    return result.rows;
}

// =============================================================================
// MATCH OPERATIONS
// =============================================================================

/**
 * Record a completed match
 */
async function recordMatch(matchData) {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Insert match record
        await client.query(`
            INSERT INTO arena_matches (
                id, player1_id, player2_id, winner_id,
                player1_score, player2_score,
                player1_elo_before, player2_elo_before,
                player1_elo_change, player2_elo_change,
                questions_count, match_duration_ms,
                is_draw, is_forfeit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
            matchData.id,
            matchData.player1.id,
            matchData.player2.id,
            matchData.winner?.id || null,
            matchData.player1.score,
            matchData.player2.score,
            matchData.player1.eloBefore,
            matchData.player2.eloBefore,
            matchData.player1.eloChange,
            matchData.player2.eloChange,
            matchData.questionsCount,
            matchData.durationMs,
            matchData.isDraw || false,
            matchData.isForfeit || false
        ]);

        // Update player Elos
        const p1Won = matchData.winner?.id === matchData.player1.id;
        const p2Won = matchData.winner?.id === matchData.player2.id;

        await updatePlayerElo(matchData.player1.id, matchData.player1.eloChange, p1Won);
        await updatePlayerElo(matchData.player2.id, matchData.player2.eloChange, p2Won);

        // Add total score
        await client.query(`
            UPDATE arena_players SET total_score = total_score + $2 WHERE user_id = $1
        `, [matchData.player1.id, matchData.player1.score]);

        await client.query(`
            UPDATE arena_players SET total_score = total_score + $2 WHERE user_id = $1
        `, [matchData.player2.id, matchData.player2.score]);

        await client.query('COMMIT');

        return { success: true };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[PostgreSQL] Error recording match:', err);
        return { success: false, error: err.message };
    } finally {
        client.release();
    }
}

/**
 * Get player's match history
 */
async function getPlayerMatchHistory(userId, limit = 20) {
    const result = await getPool().query(`
        SELECT 
            m.*,
            p1.username as player1_name,
            p2.username as player2_name
        FROM arena_matches m
        JOIN arena_players p1 ON m.player1_id = p1.user_id
        JOIN arena_players p2 ON m.player2_id = p2.user_id
        WHERE m.player1_id = $1 OR m.player2_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
    `, [userId, limit]);

    return result.rows;
}

/**
 * Get global arena statistics
 */
async function getGlobalStats() {
    const pool = getPool();

    const result = await pool.query(`
        SELECT 
            COUNT(DISTINCT user_id) as total_players,
            COALESCE(SUM(matches_played), 0) / 2 as total_matches,
            COALESCE(AVG(elo), 1000) as average_elo,
            MAX(peak_elo) as highest_elo
        FROM arena_players
    `);

    return result.rows[0];
}

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

/**
 * Close pool (for graceful shutdown)
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[PostgreSQL] Connection pool closed');
    }
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        const result = await getPool().query('SELECT NOW()');
        console.log('[PostgreSQL] Connection test successful:', result.rows[0].now);
        return true;
    } catch (err) {
        console.error('[PostgreSQL] Connection test failed:', err.message);
        return false;
    }
}

module.exports = {
    getPool,
    initSchema,
    testConnection,
    closePool,
    // Player operations
    getOrCreatePlayer,
    getPlayer,
    updatePlayerElo,
    updatePlayerTier,
    getLeaderboard,
    // Match operations
    recordMatch,
    getPlayerMatchHistory,
    getGlobalStats
};
