# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlashMath is a gamified math training platform with real-time multiplayer arena matches, competitive leagues, and cosmetic customization. Built with Next.js 16, React 19, SQLite, and Socket.io.

## Commands

```bash
# Development (with Socket.io server for arena)
npm run dev:server

# Standard Next.js dev (no real-time features)
npm run dev

# Build
npm run build

# Production
npm run start:server

# Lint
npm run lint

# Seed database
npm run seed
```

## Architecture

### Server Structure

- **server.js**: Custom HTTP server wrapping Next.js with Socket.io for real-time arena matches
- **Socket.io path**: `/api/socket/arena`
- Next.js handles all HTTP requests; Socket.io handles WebSocket connections on the same port

### Database (SQLite)

- **File**: `flashmath.db` (WAL mode)
- **Schema**: `src/lib/db/schema.sql`
- **Access**: Use `src/lib/db.ts` API (`queryOne()`, `query()`, `execute()`)
- **Direct access**: `getDatabase()` returns the better-sqlite3 instance
- JSON fields store complex data: `math_tiers`, `equipped_items`, `skill_points`

### Authentication (NextAuth v5)

- **Config**: `src/auth.ts` and `src/auth.config.ts`
- **Providers**: Credentials (email/password) and Google OAuth
- **Session callback** refreshes user data from DB and checks ban status
- **2FA**: TOTP support via `src/lib/auth/totp.ts`

### Real-Time Arena (Socket.io)

- **Server logic**: `server.js` (match management, question generation, AI opponents)
- **Client hook**: `src/lib/socket/use-arena-socket.ts`
- **Matchmaking**: Redis-based queue in `src/lib/actions/matchmaking.ts`
- Active matches stored in-memory; cleanup after 30 seconds

**Socket Events**:
- Client→Server: `join_match`, `submit_answer`, `leave_match`
- Server→Client: `match_state`, `match_start`, `answer_result`, `new_question`, `match_end`

### Key Directories

```
src/lib/
├── actions/      # Server actions ('use server') - main business logic
├── db/           # Database schema and initialization
├── socket/       # Arena WebSocket hook
├── auth/         # TOTP, tokens
├── email/        # Email templates and providers
└── *.ts          # Engines: math, league, shop, sound, achievements

src/components/
├── arena/        # Real-time match UI
├── shop/         # Shop item cards
├── locker/       # Cosmetic inventory
├── effects/      # Particles, BGM player
└── admin/        # User management, system controls

src/app/
├── arena/        # Match flow: /modes → /queue → /lobby/[id] → /match/[id]
├── auth/         # Login, register, 2FA flows
├── admin/        # Admin dashboard
└── api/          # NextAuth routes
```

## Patterns

### Server Actions
All business logic lives in `src/lib/actions/*.ts` files with `'use server'` directive. Called directly from components. Auth via `auth()` from NextAuth.

### Client Components
Use `'use client'` sparingly—mainly for real-time features and animations. `useArenaSocket()` for arena state, `useSession()` for auth.

### Arena Player Fields
Arena code uses `od` prefix for player properties: `odScore`, `odName`, `odStreak`, `odCurrentQuestion`.

### Cosmetics
- Items defined in `shop_items` table
- Owned items tracked in `inventory` table
- Equipped items stored as JSON in `users.equipped_items`
- Types: theme, particle, font, sound, bgm, title, frame, banner

## Key Systems

- **Matchmaking**: Redis sorted sets by ELO, ±200 range matching, AI fallback after 15s
- **Leagues**: 5 tiers (Neon→Apex), weekly XP tracking, promotion/relegation
- **Ban system**: `banned_until` timestamp, checked on login and in session callback
- **RBAC**: Roles (user, moderator, admin, super_admin) in addition to legacy `is_admin`
- **Arena eligibility**: Requires minimum practice sessions + accuracy, age verification (13+)
