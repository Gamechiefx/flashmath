# FlashMath Arena Matchmaking System

## Overview

The Arena matchmaking system provides real-time 1v1 math battles between players using WebSockets (Socket.io) for live synchronization.

## Architecture

### Components

| Component | File | Description |
|-----------|------|-------------|
| WebSocket Server | `server.js` | Custom Next.js server with Socket.io integration |
| Socket Hook | `src/lib/socket/use-arena-socket.ts` | React hook for client-side WebSocket connectivity |
| Match Interface | `src/components/arena/real-time-match.tsx` | Real-time match UI with live scores |
| Matchmaking Service | `src/lib/actions/matchmaking.ts` | Server actions for queue management via Redis |
| Match Lobby | `src/components/arena/match-lobby.tsx` | 20-second pre-match lobby with chat |
| Matchmaking Queue | `src/components/arena/matchmaking-queue.tsx` | Queue UI and opponent finding logic |

### Data Flow

```
Player Joins Queue
       ↓
Redis Queue (Sorted by ELO)
       ↓
Match Found → Creates Match ID
       ↓
Both Players → Lobby (20 sec countdown)
       ↓
Both Players → Match Page
       ↓
WebSocket Connection → Socket.io Server
       ↓
Real-time Sync (questions, scores, timer)
       ↓
Match Ends → Save Results to DB
       ↓
ELO Updated → Victory/Defeat Screen
```

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_match` | `{ matchId, userId, userName, operation }` | Join a match room |
| `submit_answer` | `{ matchId, odUserId, userAnswer }` | Submit an answer |
| `leave_match` | `{ matchId, userId }` | Forfeit/leave match |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `match_state` | `{ players, question, timeLeft, started, ended }` | Initial state on join |
| `player_joined` | `{ players, playerId, playerName }` | New player joined |
| `match_start` | `{ question, timeLeft, players }` | Match begins |
| `answer_result` | `{ odUserId, odIsCorrect, odPlayers }` | Score update after answer |
| `new_question` | `{ question }` | New question for player |
| `time_update` | `{ timeLeft }` | Timer sync (every second) |
| `match_end` | `{ players }` | Match ended normally |
| `player_forfeit` | `{ odForfeitedUserId, odForfeitedUserName }` | Opponent forfeited |
| `player_left` | `{ odUserId }` | Player disconnected |

## Database Schema

### Users Table (Arena Fields)

```sql
arena_elo INTEGER DEFAULT 1000,
arena_wins INTEGER DEFAULT 0,
arena_losses INTEGER DEFAULT 0,
```

### Arena Matches Table

```sql
CREATE TABLE arena_matches (
    id TEXT PRIMARY KEY,
    winner_id TEXT NOT NULL,
    loser_id TEXT NOT NULL,
    winner_score INTEGER NOT NULL,
    loser_score INTEGER NOT NULL,
    operation TEXT NOT NULL,
    mode TEXT NOT NULL,
    winner_elo_change INTEGER DEFAULT 0,
    loser_elo_change INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
```

## ELO System

Uses standard Elo rating formula:

```javascript
K = 32  // K-factor
expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
eloChange = K * (actualScore - expectedScore)
```

### Rank Tiers

| Rank | ELO Range |
|------|-----------|
| Bronze | 0 - 999 |
| Silver | 1000 - 1399 |
| Gold | 1400 - 1799 |
| Platinum | 1800 - 2199 |
| Diamond | 2200 - 2599 |
| Master | 2600+ |

Each rank has 4 divisions (IV, III, II, I) worth 100 ELO each.

## Coin Rewards

Players earn Flux Coins (§) for Arena matches based on performance:

| Reward Type | Amount |
|-------------|--------|
| Per Correct Answer | 2 § |
| Victory Bonus | +10 § |

**Example**: A player who wins with a score of 800 (8 correct answers) earns:
- Base: 8 × 2 = 16 §
- Win Bonus: +10 §
- **Total: 26 §**

The losing player still earns coins for their correct answers (no win bonus).

## Match Flow

### 1. Queue Phase
- Player selects operation (addition, subtraction, multiplication, division, mixed)
- Joins Redis queue sorted by ELO
- Polls for opponents within ±200 ELO
- AI opponent generated after 15 seconds if no human found

### 2. Lobby Phase (20 seconds)
- Shows matched players
- Emoji chat available
- Countdown timer
- Auto-navigates to match when timer ends

### 3. Match Phase (60 seconds)
- Each player gets their own questions
- Real-time score sync via WebSocket
- Streak tracking
- Back button protection with forfeit warning

### 4. End Phase
- Winner/loser determined by score
- ELO changes calculated and saved
- Match history recorded
- Play Again / Back to Arena options

## Forfeit Handling

When a player forfeits (leaves during active match):
1. Server emits `player_forfeit` to remaining player
2. Remaining player sees "Victory!" with "{name} forfeited" message
3. Forfeiting player loses ELO, winner gains ELO
4. Match recorded in history

## Redis Keys

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `arena:queue:1v1:{operation}` | Sorted Set | Players waiting for match |
| `arena:match:{matchId}` | Hash | Match data |
| `arena:match:player:{userId}` | String | Player's current match ID |

## Configuration

### Environment Variables

```env
REDIS_HOST=redis
REDIS_PORT=6379
```

### Running with WebSockets

Development uses custom server:
```bash
npm run dev:server  # Uses server.js with Socket.io
```

Production:
```bash
npm run build
npm run start:server
```

## Known Limitations

1. **AI Opponents**: Currently simulated locally, not using actual AI logic
2. **Spectating**: Not implemented
3. **Ranked Seasons**: Not implemented (no season resets)
4. **Tournament Mode**: Not implemented

## Future Improvements

- [ ] Ranked seasons with ELO resets
- [ ] Match replay system
- [ ] Spectator mode
- [ ] Tournament brackets
- [ ] Voice chat in lobby
- [ ] Custom match invites
- [ ] Leaderboard integration
