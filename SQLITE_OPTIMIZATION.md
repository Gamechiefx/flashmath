# SQLite at Scale: FlashMath Optimization Guide

## Immediate Checklist (Do These Now)

```ts
// src/lib/db/sqlite.ts - Add these pragmas after connection
const db = new Database(DB_PATH);

// CRITICAL: WAL mode (do this first, only needs to be set once)
db.pragma('journal_mode = WAL');

// Performance optimizations
db.pragma('synchronous = NORMAL');      // Durability tradeoff: FULL = safest, NORMAL = 10x faster
db.pragma('cache_size = -64000');       // 64MB cache (negative = KB)
db.pragma('temp_store = MEMORY');       // Keep temp tables in RAM
db.pragma('mmap_size = 268435456');     // 256MB memory-mapped I/O
db.pragma('busy_timeout = 5000');       // 5 second wait on locks

// Integrity
db.pragma('foreign_keys = ON');

// WAL management
db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages (~4MB)
```

**Files to verify indexes exist:**
- [ ] `mastery_stats(user_id, operation, fact)` - composite index
- [ ] `sessions(user_id, created_at)` - for recent sessions
- [ ] `league_participants(league_id, weekly_xp DESC)` - for leaderboards
- [ ] `inventory(user_id, item_id)` - for ownership checks

---

## 1. Workload Assumptions & Risks

### FlashMath Hotspots

| Area | Pattern | Risk Level |
|------|---------|------------|
| **Answer submissions** | Write-heavy, many small INSERTs | 🔴 High - bottleneck |
| **Mastery updates** | Read-modify-write per answer | 🔴 High - contention |
| **Session saves** | Bulk INSERT at end of practice | 🟡 Medium |
| **Leaderboard queries** | Read-heavy, sorted aggregates | 🟡 Medium |
| **User profile/dashboard** | Read-heavy, multiple JOINs | 🟢 Low |
| **Shop/inventory** | Infrequent reads/writes | 🟢 Low |

### What Breaks First
1. **Write contention**: SQLite has a single writer. Fast answer submissions will queue.
2. **Mastery table growth**: Without indexes, queries degrade O(n).
3. **Leaderboard sorting**: Full table scans for `ORDER BY weekly_xp DESC`.

---

## 2. PRAGMA Configuration

```ts
// src/lib/db/sqlite.ts - Complete production config
import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH || './flashmath.db';

export function createDatabase(): Database.Database {
    const db = new Database(DB_PATH);
    
    // ===== DURABILITY vs THROUGHPUT TRADEOFFS =====
    
    // WAL mode: enables concurrent reads during writes
    // Set once, persists in database file
    db.pragma('journal_mode = WAL');
    
    // synchronous: controls fsync behavior
    // FULL (2): safest, fsync every commit - use for financial/medical
    // NORMAL (1): fsync at checkpoints only - 10x faster, safe for most apps
    // OFF (0): no fsync - dangerous, only for ephemeral data
    db.pragma('synchronous = NORMAL');  // RECOMMENDED
    
    // ===== PERFORMANCE =====
    
    // cache_size: pages in memory (negative = KB)
    // Default: -2000 (2MB). Set based on RAM available.
    db.pragma('cache_size = -64000');  // 64MB for production
    
    // temp_store: where temp tables live
    // MEMORY = faster sorts/joins, uses RAM
    db.pragma('temp_store = MEMORY');
    
    // mmap_size: memory-mapped I/O size
    // Reduces syscalls, improves read performance
    // Set to ~1-2x expected hot dataset size
    db.pragma('mmap_size = 268435456');  // 256MB
    
    // ===== CONCURRENCY =====
    
    // busy_timeout: ms to wait for write lock before SQLITE_BUSY
    db.pragma('busy_timeout = 5000');  // 5 seconds
    
    // ===== INTEGRITY =====
    
    db.pragma('foreign_keys = ON');
    
    // ===== WAL MANAGEMENT =====
    
    // wal_autocheckpoint: pages before auto-checkpoint
    // Default: 1000 (~4MB). Higher = better write throughput, larger WAL
    db.pragma('wal_autocheckpoint = 1000');
    
    // journal_size_limit: max WAL file size (bytes)
    // After this, checkpoint is forced
    db.pragma('journal_size_limit = 67108864');  // 64MB max WAL
    
    return db;
}
```

### Durability Decision Matrix

| Priority | `synchronous` | `wal_autocheckpoint` | Tradeoff |
|----------|---------------|----------------------|----------|
| **Safety first** | FULL | 500 | Slower, crash-safe |
| **Balanced** (recommended) | NORMAL | 1000 | Fast, durable at checkpoints |
| **Speed first** | NORMAL | 5000 | Faster, larger WAL |

---

## 3. Concurrency Model

### How WAL Works
- **WAL mode**: Writes append to WAL file; reads use main DB + WAL
- **Many readers, one writer**: No blocking between reads
- **Writer blocks other writers**: Use `busy_timeout` to wait

### Architecture Pattern for Node.js

```ts
// RECOMMENDED: Single connection per process
// better-sqlite3 is synchronous - no connection pool needed

// src/lib/db/index.ts
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
    if (!db) {
        db = createDatabase();
    }
    return db;
}

// For write-heavy paths, serialize writes:
// Option 1: Use transactions (automatic serialization)
// Option 2: Use a write queue for high-contention paths
```

### Write Queue Pattern (for extreme contention)

```ts
// src/lib/db/write-queue.ts
import { AsyncLocalStorage } from 'async_hooks';

const writeQueue: Array<() => Promise<void>> = [];
let processing = false;

export async function enqueueWrite<T>(fn: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
        writeQueue.push(async () => {
            try {
                resolve(fn());
            } catch (e) {
                reject(e);
            }
        });
        processQueue();
    });
}

async function processQueue() {
    if (processing) return;
    processing = true;
    while (writeQueue.length > 0) {
        const task = writeQueue.shift()!;
        await task();
    }
    processing = false;
}
```

### Busy Timeout & Retry

```ts
// Wrap writes with retry logic for SQLITE_BUSY
export function withRetry<T>(fn: () => T, maxRetries = 3): T {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return fn();
        } catch (e: any) {
            if (e.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
                // busy_timeout should handle this, but just in case
                continue;
            }
            throw e;
        }
    }
    throw new Error('Max retries exceeded');
}
```

---

## 4. Transaction Strategy

### Batching Writes

```ts
// GOOD: Batch related operations in a transaction
const saveAnswerBatch = db.transaction((answers: Answer[]) => {
    const insertAnswer = db.prepare(`
        INSERT INTO answers (id, user_id, fact, operation, correct, response_time, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const updateMastery = db.prepare(`
        INSERT INTO mastery_stats (id, user_id, operation, fact, mastery_level, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, operation, fact) DO UPDATE SET
            mastery_level = MAX(0, MIN(5, mastery_level + ?)),
            updated_at = ?
    `);
    
    for (const answer of answers) {
        insertAnswer.run(answer.id, answer.userId, answer.fact, 
                         answer.operation, answer.correct ? 1 : 0, 
                         answer.responseTime, answer.createdAt);
        
        const delta = answer.correct ? 1 : -1;
        updateMastery.run(generateId(), answer.userId, answer.operation, 
                         answer.fact, delta, now(), delta, now());
    }
});

// Usage: saveAnswerBatch(answers);
```

### When to Use IMMEDIATE Transactions

```ts
// Use IMMEDIATE for reads that MUST see latest writes
// (e.g., checking coin balance before purchase)

const purchaseItem = db.transaction((userId: string, itemId: string, price: number) => {
    const user = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
    if (!user || user.coins < price) {
        throw new Error('Insufficient funds');
    }
    
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(price, userId);
    db.prepare('INSERT INTO inventory (id, user_id, item_id, acquired_at) VALUES (?, ?, ?, ?)')
      .run(generateId(), userId, itemId, now());
}).immediate();  // <-- Forces write lock at start
```

---

## 5. Schema + Indexing Strategy

### Checklist

- [x] Use INTEGER PRIMARY KEY (auto-increment, efficient B-tree)
- [x] Use TEXT for UUIDs only when needed (hashing, cross-system refs)
- [ ] Add composite indexes matching WHERE + ORDER BY shapes
- [ ] Verify with `EXPLAIN QUERY PLAN`

### Recommended Indexes for FlashMath

```sql
-- Hot path: mastery lookups (answer submissions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mastery_user_op_fact 
ON mastery_stats(user_id, operation, fact);

-- Recent sessions (dashboard)
CREATE INDEX IF NOT EXISTS idx_sessions_user_date 
ON sessions(user_id, created_at DESC);

-- Leaderboard rankings
CREATE INDEX IF NOT EXISTS idx_league_participants_leaderboard 
ON league_participants(league_id, weekly_xp DESC);

-- Inventory ownership checks
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_item 
ON inventory(user_id, item_id);

-- User lookups by email (auth)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
ON users(email);
```

### Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `LIKE '%term%'` | Full table scan | Use FTS5 for search |
| Index per column | Write overhead | Composite indexes |
| Missing ORDER BY index | Filesort for every query | Add `(col1, col2 DESC)` |
| TEXT primary keys | Slower comparisons, larger indexes | Use INTEGER PK |

### Validate with EXPLAIN

```ts
// Check query plan before deploying
const plan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT * FROM mastery_stats 
    WHERE user_id = ? AND operation = ?
`).all('test-user', 'addition');

console.log(plan);
// Should show: SEARCH mastery_stats USING INDEX idx_mastery_user_op_fact
```

---

## 6. Prepared Statements

```ts
// src/lib/db/statements.ts
// Prepare once, reuse many times

let _statements: ReturnType<typeof createStatements> | null = null;

export function getStatements() {
    if (!_statements) {
        _statements = createStatements(getDatabase());
    }
    return _statements;
}

function createStatements(db: Database.Database) {
    return {
        // Upsert mastery (hot path!)
        upsertMastery: db.prepare(`
            INSERT INTO mastery_stats (id, user_id, operation, fact, last_response_time, mastery_level, updated_at)
            VALUES (@id, @userId, @operation, @fact, @responseTime, @mastery, @now)
            ON CONFLICT(user_id, operation, fact) DO UPDATE SET
                last_response_time = @responseTime,
                mastery_level = MAX(0, MIN(5, mastery_level + @delta)),
                updated_at = @now
        `),
        
        // Insert answer event (append-only)
        insertAnswer: db.prepare(`
            INSERT INTO answers (id, user_id, session_id, fact, operation, correct, response_time, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `),
        
        // Get user by ID
        getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
        
        // Get leaderboard
        getLeaderboard: db.prepare(`
            SELECT * FROM league_participants 
            WHERE league_id = ? 
            ORDER BY weekly_xp DESC 
            LIMIT 50
        `),
    };
}
```

---

## 7. Write Amplification Control

### Event Sourcing Pattern

```sql
-- Append-only events table (immutable)
CREATE TABLE IF NOT EXISTS answer_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT,
    fact TEXT NOT NULL,
    operation TEXT NOT NULL,
    correct INTEGER NOT NULL,
    response_time_ms INTEGER,
    created_at TEXT NOT NULL
);

-- Rollup table (updated periodically)
CREATE TABLE IF NOT EXISTS mastery_rollups (
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    fact TEXT NOT NULL,
    total_attempts INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    avg_response_time REAL,
    mastery_level INTEGER DEFAULT 0,
    last_updated TEXT,
    PRIMARY KEY (user_id, operation, fact)
);
```

### Rollup Process (run hourly or on-demand)

```ts
const rollupMastery = db.transaction(() => {
    db.exec(`
        INSERT OR REPLACE INTO mastery_rollups 
        SELECT 
            user_id,
            operation,
            fact,
            COUNT(*) as total_attempts,
            SUM(correct) as correct_count,
            AVG(response_time_ms) as avg_response_time,
            -- Calculate mastery from accuracy
            CASE 
                WHEN COUNT(*) >= 10 AND (SUM(correct) * 100.0 / COUNT(*)) >= 90 THEN 5
                WHEN COUNT(*) >= 5 AND (SUM(correct) * 100.0 / COUNT(*)) >= 80 THEN 4
                WHEN COUNT(*) >= 3 AND (SUM(correct) * 100.0 / COUNT(*)) >= 70 THEN 3
                ELSE 2
            END as mastery_level,
            datetime('now') as last_updated
        FROM answer_events
        GROUP BY user_id, operation, fact
    `);
});
```

---

## 8. Growth Management

### WAL Checkpointing

```ts
// Manual checkpoint (call during low-traffic periods)
export function checkpointWAL() {
    const result = db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[DB] WAL checkpoint:', result);
    return result;
}

// Schedule: Run every night at 3 AM
// Or after large batch imports
```

### Vacuum Strategy

```ts
// Auto-vacuum modes:
// 0 = NONE (default, must VACUUM manually)
// 1 = FULL (reclaims after deletes, slower writes)
// 2 = INCREMENTAL (partial, call incremental_vacuum)

// RECOMMENDED: Incremental vacuum
db.pragma('auto_vacuum = INCREMENTAL');

// Run during maintenance window:
export function incrementalVacuum(pages = 1000) {
    db.pragma(`incremental_vacuum(${pages})`);
}

// Full vacuum (rare, requires exclusive lock):
// db.exec('VACUUM');  // Only during downtime!
```

### Safe Online Backups

```ts
import { execSync } from 'child_process';

export function backupDatabase(backupPath: string) {
    // better-sqlite3 backup API (safe with WAL)
    db.backup(backupPath)
        .then(() => console.log('[DB] Backup complete:', backupPath))
        .catch(err => console.error('[DB] Backup failed:', err));
}

// Backup cadence: hourly to cloud storage
// Test restores: weekly
```

---

## 9. Operational Guardrails

### Monitoring Checklist

```ts
export function getDbStats() {
    return {
        pageCount: db.pragma('page_count')[0].page_count,
        pageSize: db.pragma('page_size')[0].page_size,
        walPages: db.pragma('wal_checkpoint')[0],
        cacheHitRatio: db.pragma('cache_stats'),
        freelistCount: db.pragma('freelist_count')[0].freelist_count,
    };
}

// Log these metrics periodically:
// - DB file size (target: < 1GB for SQLite comfort zone)
// - WAL file size (should stay < journal_size_limit)
// - Query latency P95
// - Write queue depth (if using queue pattern)
```

### Corruption Prevention

1. **Filesystem**: Use ext4/XFS, avoid NFS/network drives
2. **Docker**: Mount DB as volume, use `--init` for signal handling
3. **Power loss**: `synchronous = FULL` if on unreliable power

### Migration Strategy

```sql
-- Version table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

-- Migration pattern (run in transaction)
BEGIN;
-- Check version
-- Apply migration
-- Update version
INSERT INTO schema_migrations VALUES (2, datetime('now'));
COMMIT;
```

---

## 10. Load Testing Plan

### Simple Load Test Script

```ts
// scripts/load-test.ts
import Database from 'better-sqlite3';

const db = new Database('./flashmath.db');
const iterations = 10000;

console.time('Write test');
const insert = db.prepare(`INSERT INTO answer_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const insertMany = db.transaction((count: number) => {
    for (let i = 0; i < count; i++) {
        insert.run(
            `test-${i}`, 'user-1', 'session-1', '2+2', 'addition', 1, 150, new Date().toISOString()
        );
    }
});
insertMany(iterations);
console.timeEnd('Write test');  // Target: < 1 second for 10K inserts

console.time('Read test');
for (let i = 0; i < 1000; i++) {
    db.prepare('SELECT * FROM answer_events WHERE user_id = ? LIMIT 100').all('user-1');
}
console.timeEnd('Read test');  // Target: < 500ms for 1000 queries
```

### When to Migrate Away from SQLite

| Metric | SQLite OK | Consider Postgres |
|--------|-----------|-------------------|
| DB size | < 1 GB | > 10 GB |
| Concurrent writers | 1 process | Multiple servers |
| Write rate | < 1000/sec | > 5000/sec sustained |
| Replicas needed | No | Yes |
| Full-text search | Simple | Complex |

**Rule of thumb**: SQLite handles 100+ concurrent readers and 1000s of writes/second easily. Migrate when you need horizontal scaling or complex replication.

---

## Summary

The key to SQLite at scale:

1. **WAL mode + NORMAL sync** = 10x faster writes, safe enough
2. **Prepared statements** = reuse compiled queries
3. **Transactions for batches** = atomic + faster
4. **Composite indexes** = match your query shapes
5. **Event sourcing** = append-only writes, rollup reads
6. **Monitor WAL size** = checkpoint regularly
7. **Backup with .backup()** = safe online backups

For FlashMath's workload (education app, 100s of concurrent users), SQLite will serve you well into the tens of thousands of DAU with proper optimization.
