/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS file, require() is legitimate */
/**
 * FlashMath Arena - PostgreSQL Database Layer
 * 
 * Handles persistent storage for Arena:
 * - Player ELO ratings (1v1 and 5v5)
 * - Match history (1v1 and 5v5 team matches)
 * - Arena statistics
 * - Team ELO ratings
 * 
 * This is the PRIMARY database for arena competitive data.
 * SQLite is used for user profiles, parties (social features).
 * Redis is used for real-time queue state and active matches.
 * 
 * @module postgres
 */

const { Pool } = require('pg');

// Dev-only logging (tree-shaken in production)
const isDev = process.env.NODE_ENV === 'development';
const devLog = (...args) => isDev && console.log(...args);

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

let pool = null;

/**
 * Get or create PostgreSQL connection pool
 */
function getPool() {
    // #region agent log
    const startTime = Date.now();
    const hasExistingPool = !!pool;
    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'postgres.js:getPool',message:'getPool called',data:{hasExistingPool},timestamp:startTime,sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (pool) {
        return pool;
    }

    // Support both connection string and individual env vars
    const connectionString = process.env.ARENA_DATABASE_URL || process.env.DATABASE_URL;

    const poolConfig = connectionString
        ? {
            connectionString,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        }
        : {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            database: process.env.POSTGRES_DB || 'flashmath_arena',
            user: process.env.POSTGRES_USER || 'flashmath',
            password: process.env.POSTGRES_PASSWORD || '',
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        };

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
        devLog('[PostgreSQL] Unexpected error:', err);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'postgres.js:pool.error',message:'PostgreSQL pool error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
    });

    pool.on('connect', () => {
        devLog('[PostgreSQL] New client connected');
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'postgres.js:pool.connect',message:'PostgreSQL client connected',data:{durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
    });

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'postgres.js:getPool',message:'PostgreSQL pool created',data:{host:poolConfig.host||'via-connection-string',durationMs:Date.now()-startTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    return pool;
}

/**
 * Initialize database schema
 */
async function initSchema() {
    const client = await getPool().connect();

    try {
        await client.query('BEGIN');

        // Arena player stats table (1v1 duel stats + per-operation ELO)
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_players (
                user_id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                
                -- 1v1 Duel Aggregate ELO
                elo INTEGER DEFAULT 300,
                peak_elo INTEGER DEFAULT 300,
                matches_played INTEGER DEFAULT 0,
                matches_won INTEGER DEFAULT 0,
                matches_lost INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                best_streak INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                
                -- 1v1 Per-Operation ELO
                elo_addition INTEGER DEFAULT 300,
                elo_subtraction INTEGER DEFAULT 300,
                elo_multiplication INTEGER DEFAULT 300,
                elo_division INTEGER DEFAULT 300,
                
                -- 5v5 Team ELO (individual rating for team modes)
                elo_5v5 INTEGER DEFAULT 300,
                peak_elo_5v5 INTEGER DEFAULT 300,
                matches_played_5v5 INTEGER DEFAULT 0,
                matches_won_5v5 INTEGER DEFAULT 0,
                matches_lost_5v5 INTEGER DEFAULT 0,
                
                -- 5v5 Per-Operation ELO
                elo_5v5_addition INTEGER DEFAULT 300,
                elo_5v5_subtraction INTEGER DEFAULT 300,
                elo_5v5_multiplication INTEGER DEFAULT 300,
                elo_5v5_division INTEGER DEFAULT 300,
                
                -- 2v2/3v3/4v4 Mode ELOs (aggregate per mode)
                elo_2v2 INTEGER DEFAULT 300,
                elo_3v3 INTEGER DEFAULT 300,
                elo_4v4 INTEGER DEFAULT 300,
                
                -- 2v2 Per-Operation ELO
                elo_2v2_addition INTEGER DEFAULT 300,
                elo_2v2_subtraction INTEGER DEFAULT 300,
                elo_2v2_multiplication INTEGER DEFAULT 300,
                elo_2v2_division INTEGER DEFAULT 300,
                
                -- 3v3 Per-Operation ELO
                elo_3v3_addition INTEGER DEFAULT 300,
                elo_3v3_subtraction INTEGER DEFAULT 300,
                elo_3v3_multiplication INTEGER DEFAULT 300,
                elo_3v3_division INTEGER DEFAULT 300,
                
                -- 4v4 Per-Operation ELO
                elo_4v4_addition INTEGER DEFAULT 300,
                elo_4v4_subtraction INTEGER DEFAULT 300,
                elo_4v4_multiplication INTEGER DEFAULT 300,
                elo_4v4_division INTEGER DEFAULT 300,
                
                -- Win/Loss streaks per mode
                duel_win_streak INTEGER DEFAULT 0,
                duel_best_win_streak INTEGER DEFAULT 0,
                duel_wins INTEGER DEFAULT 0,
                duel_losses INTEGER DEFAULT 0,
                team_win_streak INTEGER DEFAULT 0,
                team_best_win_streak INTEGER DEFAULT 0,
                team_wins INTEGER DEFAULT 0,
                team_losses INTEGER DEFAULT 0,
                
                -- Team aggregate ELO (average of 2v2/3v3/4v4/5v5)
                elo_team INTEGER DEFAULT 300,
                
                -- Tier system (1-100 scale)
                practice_tier INTEGER DEFAULT 50,
                confidence_score DECIMAL(5,2) DEFAULT 0.00,
                last_match_at TIMESTAMP,
                last_match_5v5_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add columns if they don't exist (for existing databases)
        const columnsToAdd = [
            // Per-operation 1v1 ELO
            { name: 'elo_addition', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_subtraction', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_multiplication', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_division', type: 'INTEGER DEFAULT 300' },
            // Per-operation 5v5 ELO
            { name: 'elo_5v5_addition', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_5v5_subtraction', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_5v5_multiplication', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_5v5_division', type: 'INTEGER DEFAULT 300' },
            // Mode ELOs
            { name: 'elo_2v2', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_3v3', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_4v4', type: 'INTEGER DEFAULT 300' },
            // 2v2 per-op
            { name: 'elo_2v2_addition', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_2v2_subtraction', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_2v2_multiplication', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_2v2_division', type: 'INTEGER DEFAULT 300' },
            // 3v3 per-op
            { name: 'elo_3v3_addition', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_3v3_subtraction', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_3v3_multiplication', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_3v3_division', type: 'INTEGER DEFAULT 300' },
            // 4v4 per-op
            { name: 'elo_4v4_addition', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_4v4_subtraction', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_4v4_multiplication', type: 'INTEGER DEFAULT 300' },
            { name: 'elo_4v4_division', type: 'INTEGER DEFAULT 300' },
            // Win/loss tracking
            { name: 'duel_win_streak', type: 'INTEGER DEFAULT 0' },
            { name: 'duel_best_win_streak', type: 'INTEGER DEFAULT 0' },
            { name: 'duel_wins', type: 'INTEGER DEFAULT 0' },
            { name: 'duel_losses', type: 'INTEGER DEFAULT 0' },
            { name: 'team_win_streak', type: 'INTEGER DEFAULT 0' },
            { name: 'team_best_win_streak', type: 'INTEGER DEFAULT 0' },
            { name: 'team_wins', type: 'INTEGER DEFAULT 0' },
            { name: 'team_losses', type: 'INTEGER DEFAULT 0' },
            { name: 'elo_team', type: 'INTEGER DEFAULT 300' },
        ];

        for (const col of columnsToAdd) {
            try {
                await client.query(`ALTER TABLE arena_players ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
            } catch (_e) {
                // Column might already exist, ignore error
            }
        }

        // Team ELO table (for persistent teams)
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_teams (
                team_id VARCHAR(255) PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL,
                team_tag VARCHAR(10),
                elo INTEGER DEFAULT 1200,
                peak_elo INTEGER DEFAULT 1200,
                matches_played INTEGER DEFAULT 0,
                matches_won INTEGER DEFAULT 0,
                matches_lost INTEGER DEFAULT 0,
                current_streak INTEGER DEFAULT 0,
                best_streak INTEGER DEFAULT 0,
                total_score INTEGER DEFAULT 0,
                avg_member_tier INTEGER DEFAULT 50,
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

        // 5v5 Team matches
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_team_matches (
                id VARCHAR(255) PRIMARY KEY,
                team1_id VARCHAR(255),
                team2_id VARCHAR(255),
                team1_name VARCHAR(255) NOT NULL,
                team2_name VARCHAR(255) NOT NULL,
                winner_team INTEGER,
                team1_score INTEGER DEFAULT 0,
                team2_score INTEGER DEFAULT 0,
                team1_elo_before INTEGER,
                team2_elo_before INTEGER,
                team1_elo_change INTEGER DEFAULT 0,
                team2_elo_change INTEGER DEFAULT 0,
                match_type VARCHAR(20) DEFAULT 'ranked',
                questions_count INTEGER,
                match_duration_ms INTEGER,
                is_forfeit BOOLEAN DEFAULT FALSE,
                is_ai_match BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5v5 Team match participants (links players to team matches)
        await client.query(`
            CREATE TABLE IF NOT EXISTS arena_team_match_players (
                id SERIAL PRIMARY KEY,
                match_id VARCHAR(255) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                team_number INTEGER NOT NULL,
                is_igl BOOLEAN DEFAULT FALSE,
                is_anchor BOOLEAN DEFAULT FALSE,
                score INTEGER DEFAULT 0,
                questions_answered INTEGER DEFAULT 0,
                correct_answers INTEGER DEFAULT 0,
                elo_before INTEGER,
                elo_change INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (match_id) REFERENCES arena_team_matches(id) ON DELETE CASCADE
            )
        `);

        // Indexes for common queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_arena_players_elo ON arena_players(elo DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_players_elo_5v5 ON arena_players(elo_5v5 DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_created ON arena_matches(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_player1 ON arena_matches(player1_id);
            CREATE INDEX IF NOT EXISTS idx_arena_matches_player2 ON arena_matches(player2_id);
            CREATE INDEX IF NOT EXISTS idx_arena_teams_elo ON arena_teams(elo DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_team_matches_created ON arena_team_matches(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_arena_team_match_players_user ON arena_team_match_players(user_id);
            CREATE INDEX IF NOT EXISTS idx_arena_team_match_players_match ON arena_team_match_players(match_id);
        `);

        await client.query('COMMIT');
        devLog('[PostgreSQL] Arena schema initialized');
    } catch (err) {
        await client.query('ROLLBACK');
        devLog('[PostgreSQL] Schema initialization error:', err);
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
 * Get multiple players by IDs (batch query for efficiency)
 * @param {string[]} userIds - Array of player IDs
 * @returns {Promise<Object[]>} Array of player records
 */
async function getPlayersBatch(userIds) {
    if (!userIds || userIds.length === 0) return [];
    
    const result = await getPool().query(
        'SELECT * FROM arena_players WHERE user_id = ANY($1)',
        [userIds]
    );
    return result.rows;
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
 * @param {string} userId - Player ID
 * @param {number} tier - Tier level (1-100)
 * @param {number} confidence - Confidence score
 */
async function updatePlayerTier(userId, tier, confidence) {
    await getPool().query(`
        UPDATE arena_players
        SET practice_tier = $2, confidence_score = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, tier, confidence]);
}

/**
 * Update player per-operation ELO after a 1v1 match
 * @param {string} userId - Player ID
 * @param {string} operation - Operation type (addition, subtraction, multiplication, division)
 * @param {number} newElo - New ELO value for this operation
 * @param {number} eloChange - ELO change amount
 * @param {boolean} won - Whether player won
 */
async function updatePlayerOperationElo(userId, operation, newElo, eloChange, won) {
    const pool = getPool();
    const eloColumn = `elo_${operation}`;
    
    // First update the operation-specific ELO
    // IMPORTANT: Also update matches_played for leaderboard filtering (WHERE matches_played >= 5)
    await pool.query(`
        UPDATE arena_players
        SET 
            ${eloColumn} = $2,
            matches_played = matches_played + 1,
            matches_won = matches_won + CASE WHEN $3 THEN 1 ELSE 0 END,
            matches_lost = matches_lost + CASE WHEN $3 THEN 0 ELSE 1 END,
            current_streak = CASE WHEN $3 THEN current_streak + 1 ELSE 0 END,
            best_streak = CASE WHEN $3 THEN GREATEST(best_streak, current_streak + 1) ELSE best_streak END,
            duel_wins = duel_wins + CASE WHEN $3 THEN 1 ELSE 0 END,
            duel_losses = duel_losses + CASE WHEN $3 THEN 0 ELSE 1 END,
            duel_win_streak = CASE WHEN $3 THEN duel_win_streak + 1 ELSE 0 END,
            duel_best_win_streak = CASE WHEN $3 THEN GREATEST(duel_best_win_streak, duel_win_streak + 1) ELSE duel_best_win_streak END,
            last_match_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, newElo, won]);

    // Recalculate aggregate duel ELO (average of all operations)
    await pool.query(`
        UPDATE arena_players
        SET 
            elo = ROUND((COALESCE(elo_addition, 300) + COALESCE(elo_subtraction, 300) + COALESCE(elo_multiplication, 300) + COALESCE(elo_division, 300)) / 4),
            peak_elo = GREATEST(peak_elo, ROUND((COALESCE(elo_addition, 300) + COALESCE(elo_subtraction, 300) + COALESCE(elo_multiplication, 300) + COALESCE(elo_division, 300)) / 4))
        WHERE user_id = $1
    `, [userId]);
}

/**
 * Update player per-operation ELO for team modes (2v2/3v3/4v4/5v5)
 * @param {string} userId - Player ID
 * @param {string} mode - Mode (2v2, 3v3, 4v4, 5v5)
 * @param {string} operation - Operation type
 * @param {number} newElo - New ELO value for this mode/operation
 * @param {boolean} won - Whether player's team won
 */
async function updatePlayerTeamOperationElo(userId, mode, operation, newElo, won) {
    const pool = getPool();
    const eloColumn = `elo_${mode}_${operation}`;
    const modeColumn = `elo_${mode}`;
    
    // Update operation-specific ELO for this mode
    await pool.query(`
        UPDATE arena_players
        SET 
            ${eloColumn} = $2,
            team_wins = team_wins + CASE WHEN $3 THEN 1 ELSE 0 END,
            team_losses = team_losses + CASE WHEN $3 THEN 0 ELSE 1 END,
            team_win_streak = CASE WHEN $3 THEN team_win_streak + 1 ELSE 0 END,
            team_best_win_streak = CASE WHEN $3 THEN GREATEST(team_best_win_streak, team_win_streak + 1) ELSE team_best_win_streak END,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, newElo, won]);

    // Recalculate mode aggregate ELO
    const opCols = ['addition', 'subtraction', 'multiplication', 'division']
        .map(op => `COALESCE(elo_${mode}_${op}, 300)`)
        .join(' + ');
    
    await pool.query(`
        UPDATE arena_players
        SET 
            ${modeColumn} = ROUND((${opCols}) / 4)
        WHERE user_id = $1
    `, [userId]);

    // Recalculate overall team ELO (average of all modes)
    await pool.query(`
        UPDATE arena_players
        SET 
            elo_team = ROUND((COALESCE(elo_2v2, 300) + COALESCE(elo_3v3, 300) + COALESCE(elo_4v4, 300) + COALESCE(elo_5v5, 300)) / 4)
        WHERE user_id = $1
    `, [userId]);
}

/**
 * Get all player ELO data (for display on stats page)
 * @param {string} userId - Player ID
 * @returns {Object} Complete ELO stats object
 */
async function getPlayerFullStats(userId) {
    const result = await getPool().query(
        'SELECT * FROM arena_players WHERE user_id = $1',
        [userId]
    );
    
    const player = result.rows[0];
    if (!player) return null;

    return {
        // Duel stats
        duel: {
            elo: player.elo || 300,
            addition: player.elo_addition || 300,
            subtraction: player.elo_subtraction || 300,
            multiplication: player.elo_multiplication || 300,
            divisionOp: player.elo_division || 300,
            wins: player.duel_wins || 0,
            losses: player.duel_losses || 0,
            winStreak: player.duel_win_streak || 0,
            bestWinStreak: player.duel_best_win_streak || 0,
        },
        // Team stats
        team: {
            elo: player.elo_team || 300,
            wins: player.team_wins || 0,
            losses: player.team_losses || 0,
            winStreak: player.team_win_streak || 0,
            bestWinStreak: player.team_best_win_streak || 0,
            modes: {
                '2v2': {
                    elo: player.elo_2v2 || 300,
                    addition: player.elo_2v2_addition || 300,
                    subtraction: player.elo_2v2_subtraction || 300,
                    multiplication: player.elo_2v2_multiplication || 300,
                    divisionOp: player.elo_2v2_division || 300,
                },
                '3v3': {
                    elo: player.elo_3v3 || 300,
                    addition: player.elo_3v3_addition || 300,
                    subtraction: player.elo_3v3_subtraction || 300,
                    multiplication: player.elo_3v3_multiplication || 300,
                    divisionOp: player.elo_3v3_division || 300,
                },
                '4v4': {
                    elo: player.elo_4v4 || 300,
                    addition: player.elo_4v4_addition || 300,
                    subtraction: player.elo_4v4_subtraction || 300,
                    multiplication: player.elo_4v4_multiplication || 300,
                    divisionOp: player.elo_4v4_division || 300,
                },
                '5v5': {
                    elo: player.elo_5v5 || 300,
                    addition: player.elo_5v5_addition || 300,
                    subtraction: player.elo_5v5_subtraction || 300,
                    multiplication: player.elo_5v5_multiplication || 300,
                    divisionOp: player.elo_5v5_division || 300,
                },
            },
        },
        // General stats
        practiceTier: player.practice_tier || 50,
        peakElo: player.peak_elo || 300,
        peakElo5v5: player.peak_elo_5v5 || 300,
        matchesPlayed: player.matches_played || 0,
        matchesWon: player.matches_won || 0,
        totalScore: player.total_score || 0,
    };
}

/**
 * Update player 5v5 ELO after a team match
 * @param {string} userId - Player ID
 * @param {number} eloChange - Elo change (positive or negative)
 * @param {boolean} won - Whether player's team won
 */
async function updatePlayer5v5Elo(userId, eloChange, won) {
    await getPool().query(`
        UPDATE arena_players
        SET 
            elo_5v5 = GREATEST(0, elo_5v5 + $2),
            peak_elo_5v5 = GREATEST(peak_elo_5v5, elo_5v5 + $2),
            matches_played_5v5 = matches_played_5v5 + 1,
            matches_won_5v5 = matches_won_5v5 + CASE WHEN $3 THEN 1 ELSE 0 END,
            matches_lost_5v5 = matches_lost_5v5 + CASE WHEN $3 THEN 0 ELSE 1 END,
            last_match_5v5_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
    `, [userId, eloChange, won]);
}

/**
 * Get player's arena ELO (for matchmaking)
 * @param {string} userId - Player ID
 * @param {string} mode - '1v1' or '5v5'
 */
async function getPlayerElo(userId, mode = '1v1') {
    const column = mode === '5v5' ? 'elo_5v5' : 'elo';
    const result = await getPool().query(
        `SELECT ${column} as elo, practice_tier, confidence_score FROM arena_players WHERE user_id = $1`,
        [userId]
    );
    if (result.rows.length === 0) {
        return { elo: mode === '5v5' ? 300 : 1000, practice_tier: 50, confidence_score: 0 };
    }
    return result.rows[0];
}

// =============================================================================
// TEAM OPERATIONS
// =============================================================================

/**
 * Get or create arena team record
 * @param {string} teamId - Team ID
 * @param {string} teamName - Team name
 * @param {string} teamTag - Team tag
 */
async function getOrCreateTeam(teamId, teamName, teamTag = null) {
    const pool = getPool();

    let result = await pool.query(
        'SELECT * FROM arena_teams WHERE team_id = $1',
        [teamId]
    );

    if (result.rows.length > 0) {
        return result.rows[0];
    }

    result = await pool.query(`
        INSERT INTO arena_teams (team_id, team_name, team_tag)
        VALUES ($1, $2, $3)
        RETURNING *
    `, [teamId, teamName, teamTag]);

    return result.rows[0];
}

/**
 * Get team by ID
 */
async function getTeam(teamId) {
    const result = await getPool().query(
        'SELECT * FROM arena_teams WHERE team_id = $1',
        [teamId]
    );
    return result.rows[0] || null;
}

/**
 * Get team ELO (for matchmaking)
 * @param {string} teamId - Team ID
 */
async function getTeamElo(teamId) {
    const result = await getPool().query(
        'SELECT elo, avg_member_tier FROM arena_teams WHERE team_id = $1',
        [teamId]
    );
    if (result.rows.length === 0) {
        return { elo: 1200, avg_member_tier: 50 };
    }
    return result.rows[0];
}

/**
 * Update team ELO after a match
 * @param {string} teamId - Team ID
 * @param {number} eloChange - Elo change
 * @param {boolean} won - Whether team won
 * @param {number} score - Team's score in the match
 */
async function updateTeamElo(teamId, eloChange, won, score = 0) {
    await getPool().query(`
        UPDATE arena_teams
        SET 
            elo = GREATEST(0, elo + $2),
            peak_elo = GREATEST(peak_elo, elo + $2),
            matches_played = matches_played + 1,
            matches_won = matches_won + CASE WHEN $3 THEN 1 ELSE 0 END,
            matches_lost = matches_lost + CASE WHEN $3 THEN 0 ELSE 1 END,
            current_streak = CASE WHEN $3 THEN current_streak + 1 ELSE 0 END,
            best_streak = CASE WHEN $3 THEN GREATEST(best_streak, current_streak + 1) ELSE best_streak END,
            total_score = total_score + $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE team_id = $1
    `, [teamId, eloChange, won, score]);
}

/**
 * Update team's average member tier
 */
async function updateTeamAvgTier(teamId, avgTier) {
    await getPool().query(`
        UPDATE arena_teams
        SET avg_member_tier = $2, updated_at = CURRENT_TIMESTAMP
        WHERE team_id = $1
    `, [teamId, avgTier]);
}

/**
 * Get team leaderboard
 */
async function getTeamLeaderboard(limit = 50) {
    const result = await getPool().query(`
        SELECT 
            team_id, team_name, team_tag, elo, peak_elo,
            matches_played, matches_won, matches_lost,
            current_streak, best_streak,
            CASE WHEN matches_played > 0 
                THEN ROUND(matches_won::numeric / matches_played * 100, 1) 
                ELSE 0 
            END as win_rate
        FROM arena_teams
        WHERE matches_played >= 3
        ORDER BY elo DESC
        LIMIT $1
    `, [limit]);

    return result.rows;
}

/**
 * Get leaderboard filtered by operation
 * @param {number} limit - Number of players to return
 * @param {string} operation - Operation filter: 'overall', 'addition', 'subtraction', 'multiplication', 'division'
 */
async function getLeaderboard(limit = 100, operation = 'overall') {
    // Determine which ELO column to use based on operation
    let eloColumn = 'elo';
    let filterCondition = 'matches_played >= 1';
    
    if (operation !== 'overall') {
        eloColumn = `elo_${operation}`;
        // Only show players who have played this specific operation
        // A player has played an operation if their ELO differs from 300 (default)
        // This works because ELO changes after every match (+/- some amount)
        filterCondition = `${eloColumn} != 300`;
    }
    
    const result = await getPool().query(`
        SELECT 
            user_id, username, ${eloColumn} as elo, peak_elo, 
            matches_played, matches_won, matches_lost,
            current_streak, best_streak, practice_tier,
            CASE WHEN matches_played > 0 
                THEN ROUND(matches_won::numeric / matches_played * 100, 1) 
                ELSE 0 
            END as win_rate
        FROM arena_players
        WHERE ${filterCondition}
        ORDER BY ${eloColumn} DESC
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
        devLog('[PostgreSQL] Error recording match:', err);
        return { success: false, error: err.message };
    } finally {
        client.release();
    }
}

/**
 * Get player's 1v1 match history
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
 * Record a completed 5v5 team match
 * @param {Object} matchData - Match data including teams and players
 */
async function recordTeamMatch(matchData) {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Insert team match record
        await client.query(`
            INSERT INTO arena_team_matches (
                id, team1_id, team2_id, team1_name, team2_name,
                winner_team, team1_score, team2_score,
                team1_elo_before, team2_elo_before,
                team1_elo_change, team2_elo_change,
                match_type, questions_count, match_duration_ms,
                is_forfeit, is_ai_match
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
            matchData.id,
            matchData.team1.id || null,
            matchData.team2.id || null,
            matchData.team1.name,
            matchData.team2.name,
            matchData.winnerTeam,
            matchData.team1.score,
            matchData.team2.score,
            matchData.team1.eloBefore,
            matchData.team2.eloBefore,
            matchData.team1.eloChange,
            matchData.team2.eloChange,
            matchData.matchType || 'ranked',
            matchData.questionsCount,
            matchData.durationMs,
            matchData.isForfeit || false,
            matchData.isAIMatch || false
        ]);

        // Insert player records for team 1
        for (const player of matchData.team1.players) {
            await client.query(`
                INSERT INTO arena_team_match_players (
                    match_id, user_id, team_number, is_igl, is_anchor,
                    score, questions_answered, correct_answers,
                    elo_before, elo_change
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                matchData.id,
                player.userId,
                1,
                player.isIgl || false,
                player.isAnchor || false,
                player.score || 0,
                player.questionsAnswered || 0,
                player.correctAnswers || 0,
                player.eloBefore,
                player.eloChange
            ]);

            // Update individual 5v5 ELO
            const won = matchData.winnerTeam === 1;
            await updatePlayer5v5Elo(player.userId, player.eloChange, won);
        }

        // Insert player records for team 2
        for (const player of matchData.team2.players) {
            await client.query(`
                INSERT INTO arena_team_match_players (
                    match_id, user_id, team_number, is_igl, is_anchor,
                    score, questions_answered, correct_answers,
                    elo_before, elo_change
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                matchData.id,
                player.userId,
                2,
                player.isIgl || false,
                player.isAnchor || false,
                player.score || 0,
                player.questionsAnswered || 0,
                player.correctAnswers || 0,
                player.eloBefore,
                player.eloChange
            ]);

            // Update individual 5v5 ELO
            const won = matchData.winnerTeam === 2;
            await updatePlayer5v5Elo(player.userId, player.eloChange, won);
        }

        // Update team ELOs if persistent teams
        if (matchData.team1.id) {
            await updateTeamElo(
                matchData.team1.id,
                matchData.team1.eloChange,
                matchData.winnerTeam === 1,
                matchData.team1.score
            );
        }
        if (matchData.team2.id) {
            await updateTeamElo(
                matchData.team2.id,
                matchData.team2.eloChange,
                matchData.winnerTeam === 2,
                matchData.team2.score
            );
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (err) {
        await client.query('ROLLBACK');
        devLog('[PostgreSQL] Error recording team match:', err);
        return { success: false, error: err.message };
    } finally {
        client.release();
    }
}

/**
 * Get player's 5v5 match history
 */
async function getPlayerTeamMatchHistory(userId, limit = 20) {
    const result = await getPool().query(`
        SELECT 
            m.*,
            p.team_number, p.is_igl, p.is_anchor, p.score as player_score,
            p.elo_before as player_elo_before, p.elo_change as player_elo_change
        FROM arena_team_matches m
        JOIN arena_team_match_players p ON m.id = p.match_id
        WHERE p.user_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
    `, [userId, limit]);

    return result.rows;
}

/**
 * Get team's match history
 */
async function getTeamMatchHistory(teamId, limit = 20) {
    const result = await getPool().query(`
        SELECT *
        FROM arena_team_matches
        WHERE team1_id = $1 OR team2_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [teamId, limit]);

    return result.rows;
}

/**
 * Get team match results by match ID (for results page)
 * @param {string} matchId - The match ID to look up
 * @param {Object} sqliteDb - Optional SQLite database for fallback name lookups
 * @returns {Object} Match data with players
 */
async function getTeamMatchById(matchId, sqliteDb = null) {
    const pool = getPool();

    try {
        // Get match data
        const matchResult = await pool.query(`
            SELECT
                id,
                team1_id, team2_id,
                team1_name, team2_name,
                winner_team,
                team1_score, team2_score,
                team1_elo_before, team2_elo_before,
                team1_elo_change, team2_elo_change,
                match_type,
                questions_count,
                match_duration_ms,
                is_forfeit, is_ai_match,
                created_at
            FROM arena_team_matches
            WHERE id = $1
        `, [matchId]);

        if (matchResult.rows.length === 0) {
            return null;
        }

        const match = matchResult.rows[0];

        // Get player data
        const playersResult = await pool.query(`
            SELECT
                tmp.match_id, tmp.user_id, tmp.team_number,
                tmp.is_igl as was_igl, tmp.is_anchor as was_anchor,
                tmp.score as questions_correct,
                tmp.questions_answered as questions_attempted,
                tmp.correct_answers,
                tmp.elo_before, tmp.elo_change,
                ap.username as player_name
            FROM arena_team_match_players tmp
            LEFT JOIN arena_players ap ON tmp.user_id = ap.user_id
            WHERE tmp.match_id = $1
            ORDER BY tmp.team_number, tmp.score DESC
        `, [matchId]);

        // Transform to expected format
        const transformedMatch = {
            id: match.id,
            team1_id: match.team1_id || 'team1',
            team2_id: match.team2_id || 'team2',
            team1_name: match.team1_name,
            team2_name: match.team2_name,
            team1_tag: null, // PostgreSQL doesn't store tags currently
            team2_tag: null,
            winner_team_id: match.winner_team === 1 ? (match.team1_id || 'team1') :
                            match.winner_team === 2 ? (match.team2_id || 'team2') : null,
            team1_score: match.team1_score,
            team2_score: match.team2_score,
            team1_elo_change: match.team1_elo_change,
            team2_elo_change: match.team2_elo_change,
            match_type: match.match_type,
            created_at: match.created_at,
        };

        // If we have SQLite DB, try to get player names from there as fallback
        let sqliteNames = {};
        if (sqliteDb) {
            try {
                const userIds = playersResult.rows.map(p => p.user_id).filter(id => id);
                if (userIds.length > 0) {
                    const placeholders = userIds.map(() => '?').join(',');
                    const users = sqliteDb.prepare(`SELECT id, name FROM users WHERE id IN (${placeholders})`).all(...userIds);
                    for (const u of users) {
                        sqliteNames[u.id] = u.name;
                    }
                }
            } catch (err) {
                devLog('[PostgreSQL] Could not get names from SQLite:', err.message);
            }
        }

        const transformedPlayers = playersResult.rows.map(p => {
            // Try postgres name, then sqlite name, then fallback
            let playerName = p.player_name;
            if (!playerName && sqliteNames[p.user_id]) {
                playerName = sqliteNames[p.user_id];
            }
            if (!playerName) {
                // Check if it's an AI player
                if (p.user_id && (p.user_id.startsWith('ai_') || p.user_id.startsWith('ai-'))) {
                    playerName = `AI ${p.user_id.slice(-4)}`;
                } else {
                    playerName = `Player_${(p.user_id || 'unknown').slice(-4)}`;
                }
            }

            return {
                match_id: p.match_id,
                user_id: p.user_id,
                team_id: p.team_number === 1 ? (match.team1_id || 'team1') : (match.team2_id || 'team2'),
                player_name: playerName,
                was_igl: p.was_igl,
                was_anchor: p.was_anchor,
                questions_correct: p.questions_correct || 0,
                questions_attempted: p.questions_attempted || 0,
                accuracy: p.questions_attempted > 0 ? p.correct_answers / p.questions_attempted : 0,
                best_streak: 0, // Not tracked in current schema
                avg_answer_time_ms: null, // Not tracked in current schema
                operation_slot: p.was_anchor ? 'Anchor' : p.was_igl ? 'IGL' : 'Player',
            };
        });

        return {
            match: transformedMatch,
            players: transformedPlayers,
        };
    } catch (err) {
        devLog('[PostgreSQL] Error getting team match by ID:', err);
        return null;
    }
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
        devLog('[PostgreSQL] Connection pool closed');
    }
}

/**
 * Test database connection
 */
async function testConnection() {
    try {
        const result = await getPool().query('SELECT NOW()');
        devLog('[PostgreSQL] Connection test successful:', result.rows[0].now);
        return true;
    } catch (err) {
        devLog('[PostgreSQL] Connection test failed:', err.message);
        return false;
    }
}

module.exports = {
    // Connection
    getPool,
    initSchema,
    testConnection,
    closePool,
    
    // Player operations (1v1)
    getOrCreatePlayer,
    getPlayer,
    getPlayersBatch,
    getPlayerElo,
    updatePlayerElo,
    updatePlayerTier,
    getLeaderboard,
    
    // Per-operation ELO (NEW)
    updatePlayerOperationElo,
    updatePlayerTeamOperationElo,
    getPlayerFullStats,
    
    // Player operations (5v5)
    updatePlayer5v5Elo,
    
    // Team operations
    getOrCreateTeam,
    getTeam,
    getTeamElo,
    updateTeamElo,
    updateTeamAvgTier,
    getTeamLeaderboard,
    
    // Match operations (1v1)
    recordMatch,
    getPlayerMatchHistory,
    getGlobalStats,
    
    // Match operations (5v5)
    recordTeamMatch,
    getPlayerTeamMatchHistory,
    getTeamMatchHistory,
    getTeamMatchById
};
