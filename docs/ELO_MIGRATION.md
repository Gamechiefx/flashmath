# ELO Data Migration: SQLite → PostgreSQL

## Current State: PostgreSQL is Source of Truth ✅

As of this migration, **PostgreSQL is the single source of truth for all ELO data**.

- ✅ All ELO reads come from PostgreSQL
- ✅ All ELO writes go to PostgreSQL
- ⚠️ SQLite ELO columns still exist (can be removed after verification)

---

## Database Comparison

| Feature | SQLite (`users` table) | PostgreSQL (`arena_players`) |
|---------|------------------------|------------------------------|
| Aggregate 1v1 ELO | `arena_elo_duel` | `elo` ✅ |
| Per-operation 1v1 ELO | `arena_elo_duel_{op}` | ❌ Not implemented |
| Aggregate 5v5 ELO | `arena_elo_5v5` | `elo_5v5` ✅ |
| Per-operation 5v5 ELO | `arena_elo_5v5_{op}` | ❌ Not implemented |
| 2v2/3v3/4v4 ELO | `arena_elo_{mode}_{op}` | ❌ Not implemented |
| Win/Loss tracking | `arena_duel_wins/losses` | `matches_won/lost` ✅ |
| Streak tracking | `arena_duel_win_streak` | `current_streak` ✅ |
| Practice tier | `math_tiers` (JSON) | `practice_tier` (int) ✅ |
| Peak ELO | ❌ Not tracked | `peak_elo` ✅ |
| Match history | ❌ Not tracked | `arena_matches` ✅ |

---

## Migration Phases

### Phase 1: Display & Social (✅ Completed)

Functions updated to read from PostgreSQL:
- `social.ts → getFriendsList()` - Friend ELO display
- `social.ts → getPartyData()` - Party member ELO display
- `arena-db.ts → getArenaDisplayStats()` - Generic ELO fetch
- `arena-db.ts → getArenaDisplayStatsBatch()` - Batch ELO fetch

### Phase 2: Matchmaking Queue (✅ Completed)

Functions using PostgreSQL for matchmaking:
- `matchmaking.ts → joinQueue()` - Uses `getPlayerElo()` from PostgreSQL
- `team-matchmaking.ts → joinTeamQueue()` - Uses `getPlayerElo()` from PostgreSQL

### Phase 3: Match Results (✅ Completed)

Match completion writes to PostgreSQL:
- `server.js → recordDuelMatchToPostgres()` - Records 1v1 results
- `server.js → recordTeamMatchToPostgres()` - Records 5v5 results

### Phase 4: Per-Operation ELO (✅ Completed)

**Status**: Fully implemented

**Changes made**:
1. Added per-operation columns to PostgreSQL (`postgres.js`)
2. Updated `getArenaStats()` in matchmaking.ts → `getFullArenaStats()` from PostgreSQL
3. Updated `saveMatchResult()` to write per-operation ELO to PostgreSQL via `updatePlayerOperationElo()`
4. Added `arena-db.ts` functions: `updatePlayerOperationElo()`, `updatePlayerTeamOperationElo()`, `getFullArenaStats()`

### Phase 5: Remove SQLite ELO Columns (🚧 Ready for Removal)

**Status**: SQLite ELO columns are now unused and can be safely removed.

**Migration script**: `scripts/migrate-elo-to-postgres.ts`

Run this to copy any remaining SQLite ELO data to PostgreSQL before removing columns:
```bash
npx ts-node scripts/migrate-elo-to-postgres.ts
```

---

## Current Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CURRENT HYBRID STATE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  DISPLAY (Social Panel, Mode Cards)                                     │
│  ┌─────────────┐                                                         │
│  │ PostgreSQL  │◀─── getArenaDisplayStats() ✅                          │
│  │ (aggregate) │                                                         │
│  └─────────────┘                                                         │
│                                                                          │
│  ARENA STATS PAGE (Per-operation ELO)                                   │
│  ┌─────────────┐                                                         │
│  │   SQLite    │◀─── getArenaStats() ⚠️ (still reads per-op ELO)       │
│  │ (per-op)    │                                                         │
│  └─────────────┘                                                         │
│                                                                          │
│  MATCHMAKING QUEUE                                                       │
│  ┌─────────────┐                                                         │
│  │ PostgreSQL  │◀─── getPlayerElo() ✅                                  │
│  │ (aggregate) │                                                         │
│  └─────────────┘                                                         │
│                                                                          │
│  MATCH COMPLETION                                                        │
│  ┌─────────────┐     ┌─────────────┐                                    │
│  │ PostgreSQL  │     │   SQLite    │                                    │
│  │ (aggregate) │◀───▶│ (per-op)    │◀─── saveMatchResult() ⚠️          │
│  └─────────────┘     └─────────────┘     (dual-writes per-op to SQLite) │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Affected Files

### Already Migrated to PostgreSQL ✅

| File | Function | Status |
|------|----------|--------|
| `src/lib/actions/social.ts` | `getFriendsList()` | ✅ Reads from PostgreSQL |
| `src/lib/actions/social.ts` | `getPartyData()` | ✅ Reads from PostgreSQL |
| `src/lib/arena/arena-db.ts` | `getArenaDisplayStats()` | ✅ Reads from PostgreSQL |
| `src/lib/actions/matchmaking.ts` | `joinQueue()` | ✅ Reads from PostgreSQL |
| `src/lib/actions/team-matchmaking.ts` | `joinTeamQueue()` | ✅ Reads from PostgreSQL |
| `server.js` | `recordDuelMatchToPostgres()` | ✅ Writes to PostgreSQL |
| `server.js` | `recordTeamMatchToPostgres()` | ✅ Writes to PostgreSQL |

### Still Using SQLite ⚠️

| File | Function | Reason |
|------|----------|--------|
| `src/lib/actions/matchmaking.ts` | `getArenaStats()` | Reads per-operation ELO |
| `src/lib/actions/matchmaking.ts` | `saveMatchResult()` | Writes per-operation ELO |
| `src/components/arena/mode-selection.tsx` | ELO display on cards | Uses `getArenaStats()` |

---

## SQLite Columns to Remove

After running the migration script, these columns can be removed from `src/lib/db/schema.sql`:

```sql
-- REMOVE THESE COLUMNS FROM users TABLE:

-- Duel ELO (now in PostgreSQL arena_players)
arena_elo_duel,
arena_elo_duel_addition,
arena_elo_duel_subtraction,
arena_elo_duel_multiplication,
arena_elo_duel_division,
arena_duel_wins,
arena_duel_losses,
arena_duel_win_streak,
arena_duel_best_win_streak,

-- Team ELO (now in PostgreSQL arena_players)
arena_elo_team,
arena_team_wins,
arena_team_losses,
arena_team_win_streak,
arena_team_best_win_streak,

-- 2v2 ELO
arena_elo_2v2,
arena_elo_2v2_addition,
arena_elo_2v2_subtraction,
arena_elo_2v2_multiplication,
arena_elo_2v2_division,

-- 3v3 ELO
arena_elo_3v3,
arena_elo_3v3_addition,
arena_elo_3v3_subtraction,
arena_elo_3v3_multiplication,
arena_elo_3v3_division,

-- 4v4 ELO
arena_elo_4v4,
arena_elo_4v4_addition,
arena_elo_4v4_subtraction,
arena_elo_4v4_multiplication,
arena_elo_4v4_division,

-- 5v5 ELO
arena_elo_5v5,
arena_elo_5v5_addition,
arena_elo_5v5_subtraction,
arena_elo_5v5_multiplication,
arena_elo_5v5_division,

-- ALSO REMOVE team_elo TABLE (now in PostgreSQL arena_teams)
```

**⚠️ Important**: Before removing columns:
1. Run migration script: `npx ts-node scripts/migrate-elo-to-postgres.ts`
2. Verify data in PostgreSQL: `SELECT COUNT(*) FROM arena_players;`
3. Backup SQLite database
4. Remove columns from schema.sql
5. Re-seed or migrate database

## Final Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FINAL ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PostgreSQL (arena_players)                                     │
│  ├── elo, elo_addition, elo_subtraction, elo_multiplication... │
│  ├── elo_5v5, elo_5v5_addition, ...                             │
│  ├── elo_2v2, elo_3v3, elo_4v4 + per-op                        │
│  ├── duel_wins, duel_losses, duel_win_streak, ...              │
│  ├── team_wins, team_losses, team_win_streak, ...              │
│  └── practice_tier, matches_played, matches_won                 │
│                                                                  │
│  SQLite (users)                                                  │
│  ├── id, name, email, password_hash                             │
│  ├── level, xp, coins                                           │
│  ├── math_tiers (practice progress)                             │
│  ├── equipped_items, inventory                                  │
│  └── NO ELO DATA                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

