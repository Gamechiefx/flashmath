---
inclusion: always
---

# Technology Stack & Build System

## Core Stack

- **Framework**: Next.js 16+ (App Router)
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS 4 with custom CSS variables
- **Animations**: Framer Motion
- **Database**: SQLite (better-sqlite3) with custom abstraction layer
- **Authentication**: NextAuth.js 5 (beta) with custom session handling
- **Real-time**: Socket.IO with Redis adapter
- **State Management**: React hooks + Server Actions

## Key Dependencies

- **UI**: Lucide React icons, Recharts for analytics
- **Utils**: clsx + tailwind-merge for className handling
- **Security**: bcryptjs, OTPAuth for 2FA
- **Email**: Nodemailer + Resend
- **Testing**: Vitest (unit), Playwright (e2e), custom arena testing

## Common Commands

```bash
# Development
npm run dev              # Start Next.js dev server
npm run dev:server       # Start Socket.IO server

# Building
npm run build           # Production build
npm run start           # Production server
npm run start:server    # Production Socket.IO server

# Testing
npm run test:unit           # Unit tests with Vitest
npm run test:unit:watch     # Watch mode
npm run test:unit:coverage  # Coverage report
npm run test:e2e           # Playwright e2e tests
npm run test:arena         # Custom arena/socket tests
npm run test:all           # All test suites

# Linting
npm run lint            # ESLint check
```

## Database

- Uses SQLite with custom abstraction layer in `src/lib/db.ts`
- Backward-compatible API that mimics JSON-based storage
- Auto-migration and seeding on startup
- Batch query helpers for performance optimization

## Architecture Notes

- Server Actions for data mutations
- Custom Socket.IO server for real-time features
- Glass morphism UI with CSS custom properties
- Theme system with CSS variables for easy customization