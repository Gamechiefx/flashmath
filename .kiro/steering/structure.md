---
inclusion: always
---

# Project Structure & Organization

## Directory Layout

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── arena/             # Arena/multiplayer pages
│   ├── auth/              # Authentication pages
│   └── [feature]/         # Feature-based page organization
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   ├── arena/            # Arena-specific components
│   ├── admin/            # Admin panel components
│   └── [feature]/        # Feature-grouped components
├── lib/                  # Core business logic
│   ├── actions/          # Server Actions
│   ├── ai-engine/        # AI coaching system
│   ├── arena/            # Arena/matchmaking logic
│   ├── auth/             # Authentication utilities
│   ├── db/               # Database layer
│   └── [feature]/        # Feature-specific logic
└── middleware.ts         # Next.js middleware
```

## Naming Conventions

- **Files**: kebab-case (`user-avatar.tsx`, `arena-queue.ts`)
- **Components**: PascalCase (`UserAvatar`, `ArenaQueue`)
- **Functions**: camelCase (`getUserStats`, `calculateElo`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_PLAYERS`, `DEFAULT_THEME`)
- **Types/Interfaces**: PascalCase (`User`, `MatchResult`)

## Component Organization

- **UI Components**: Generic, reusable components in `components/ui/`
- **Feature Components**: Grouped by domain (arena, admin, auth, etc.)
- **Page Components**: Co-located with their routes in `app/`
- **Client Components**: Marked with `"use client"` directive
- **Server Components**: Default, no directive needed

## Code Patterns

- **Server Actions**: Located in `lib/actions/` with proper error handling
- **Database Access**: Through abstraction layer in `lib/db.ts`
- **Styling**: Tailwind classes with `cn()` utility for conditional styling
- **Animations**: Framer Motion with consistent spring configurations
- **Theming**: CSS custom properties with theme classes

## File Conventions

- **Page Files**: `page.tsx` in app directory structure
- **Layout Files**: `layout.tsx` for shared layouts
- **Loading States**: `loading.tsx` for loading UI
- **Error Boundaries**: `error.tsx` for error handling
- **Not Found**: `not-found.tsx` for 404 pages

## Import Organization

1. React/Next.js imports
2. Third-party libraries
3. Internal components (@ alias)
4. Relative imports
5. Type-only imports last

## Testing Structure

- **Unit Tests**: `tests/unit/` mirroring `src/lib/` structure
- **E2E Tests**: `tests/e2e/` with page objects pattern
- **Arena Tests**: `tests/arena/` for real-time functionality
- **Test Utilities**: Shared fixtures and helpers