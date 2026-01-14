# FlashMath Testing Strategy

This document outlines the comprehensive testing strategy for FlashMath Arena, including unit tests, socket-based integration tests, and browser-based E2E tests.

---

## Quick Start

Get up and running with tests in under 2 minutes:

```bash
# 1. Install dependencies
npm ci

# 2. Run unit tests (fastest feedback)
npm run test:unit

# 3. Start the dev server (required for socket/E2E tests)
npm run dev:server

# 4. Run socket tests (in another terminal)
npm run test:arena:quick -- --server=http://localhost:3001

# 5. Run E2E tests (optional, slower)
npm run test:e2e
```

### One-Liner for CI

```bash
# Run unit + quick socket tests
npm run test:unit && npm run test:arena:quick -- --server=http://localhost:3001
```

### Test Status Badges

Add these to your README for visibility:

```markdown
![Unit Tests](https://img.shields.io/badge/unit_tests-passing-brightgreen)
![Socket Tests](https://img.shields.io/badge/socket_tests-passing-brightgreen)
![E2E Tests](https://img.shields.io/badge/e2e_tests-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-70%25-yellow)
```

---

## Testing Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Strategy                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. UNIT TESTS (Isolated Logic)                                │
│     ├── Run on every commit                                    │
│     ├── Very fast (~5 seconds)                                 │
│     ├── Verify pure functions                                  │
│     └── Uses Vitest                                            │
│                                                                 │
│  2. SOCKET TESTS (Backend/Integration)                         │
│     ├── Run on every commit                                    │
│     ├── Fast (~60-70s full suite, ~20s quick tests)            │
│     ├── Verify server logic                                    │
│     └── No browser needed                                      │
│                                                                 │
│  3. E2E TESTS (Browser/UI)                                     │
│     ├── Run nightly or before releases                         │
│     ├── Slower (~5-10 minutes)                                 │
│     ├── Verify critical user journeys                          │
│     └── Uses real browser (Playwright)                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## The Testing Pyramid

```
                    ▲
                   /█\          E2E Browser Tests
                  / █ \         (Few, Slow, High Confidence)
                 /  █  \        ~5-10 critical flows
                /   █   \
               /────█────\
              /     █     \     Socket/Integration Tests
             /      █      \    (Medium, Fast, Good Coverage)
            /       █       \   ~20-50 tests
           /────────█────────\
          /         █         \  Unit Tests
         /          █          \ (Many, Very Fast, Isolated)
        /           █           \~100+ tests (Vitest)
       ─────────────█────────────
```

## Test Environment Setup

Before running tests, ensure your environment is properly configured.

### Prerequisites

```bash
# Install Node.js dependencies
npm ci

# Install Playwright browsers (for E2E tests)
npx playwright install --with-deps
```

### Database Setup

Tests use an isolated test database to prevent interference with development data:

```bash
# Create and seed the test database
npm run db:test:setup

# Reset test database (clean and reseed)
npm run db:test:reset

# View test database state
npm run db:test:status
```

**Important**: The test database (`flashmath-test.db`) is separate from development (`flashmath.db`).

### Environment Variables

Create a `.env.test` file for test-specific configuration:

```bash
# .env.test
DATABASE_URL="file:./flashmath-test.db"
NEXTAUTH_SECRET="test-secret-key-for-testing-only"
REDIS_URL="redis://localhost:6379"
NODE_ENV="test"
```

### Redis Setup (for Socket Tests)

Socket tests require Redis for matchmaking queue simulation:

```bash
# Option 1: Docker (recommended)
docker run -d --name redis-test -p 6379:6379 redis:alpine

# Option 2: Local Redis
brew install redis && redis-server

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

### Test Isolation

| Test Type | Database | Redis | Browser |
|-----------|----------|-------|---------|
| Unit | ❌ None | ❌ None | ❌ None |
| Socket | ❌ None (in-memory) | ✅ Required | ❌ None |
| E2E | ✅ Test DB | ✅ Required | ✅ Required |

---

## Directory Structure

```
tests/
├── unit/                     # Unit tests (Vitest)
│   ├── setup.ts              # Global setup for unit tests
│   ├── lib/                  # Library function tests
│   │   ├── math-engine.test.ts         → src/lib/math-engine.ts
│   │   ├── username-validator.test.ts  → src/lib/username-validator.ts
│   │   ├── elo-calculator.test.ts      → src/lib/elo-calculator.ts
│   │   └── team-scoring.test.ts        → src/lib/team-scoring.ts
│   ├── utils/                # Test data utilities
│   │   ├── test-data.ts      # Test data factories
│   │   └── test-data.test.ts # Factory tests
│   └── components/           # Component unit tests (future)
│
├── arena/                    # Socket/Integration tests
│   ├── synthetic-client.ts   # Headless Socket.io client
│   ├── test-orchestrator.ts  # Test management
│   ├── runner.ts             # CLI entry point
│   ├── Dockerfile            # Docker test runner
│   └── scenarios/            # → server.js (Socket.io handlers)
│       ├── connection.ts     # WebSocket connectivity
│       ├── party-to-match.ts # Full party → match flow
│       ├── roles.ts          # IGL & Anchor roles
│       ├── match-flow.ts     # Match progression
│       ├── question-counter.ts
│       ├── timeout.ts
│       ├── double-callin.ts
│       ├── quit-vote.ts
│       └── load-test.ts      # Performance/load testing
│
├── e2e/                      # Browser E2E tests (Playwright)
│   ├── playwright.config.ts  # Playwright configuration
│   ├── global-setup.ts       # Test account setup
│   ├── fixtures/             # Custom test fixtures
│   │   └── console-capture.ts
│   ├── pages/                # Page Object Model
│   │   ├── base-page.ts      # → Base page utilities
│   │   ├── setup-page.ts     # → src/app/arena/modes/
│   │   ├── queue-page.ts     # → src/app/arena/queue/
│   │   └── match-page.ts     # → src/app/arena/match/[id]/
│   └── specs/
│       ├── auth.spec.ts              # → src/app/auth/
│       ├── party-creation.spec.ts    # → src/app/arena/lobby/
│       ├── vs-ai-match.spec.ts       # → AI opponent flow
│       ├── match-flow.spec.ts        # → Full match lifecycle
│       ├── igl-abilities.spec.ts     # → IGL slot assignment
│       ├── double-callin.spec.ts     # → Double Call-In ability
│       └── quit-vote.spec.ts         # → Quit voting modal
│
├── api/                      # API tests (future)
│   └── README.md
│
└── README.md
```

### Key File References

| Test File | Tests This Source |
|-----------|-------------------|
| `tests/unit/lib/math-engine.test.ts` | `src/lib/math-engine.ts` |
| `tests/unit/lib/elo-calculator.test.ts` | `src/lib/elo-calculator.ts` |
| `tests/arena/scenarios/roles.ts` | `server.js` (IGL/Anchor logic) |
| `tests/e2e/specs/auth.spec.ts` | `src/app/auth/**`, `src/auth.ts` |
| `tests/e2e/pages/match-page.ts` | `src/app/arena/match/[id]/page.tsx` |

## Commands

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm run test:unit

# Run with coverage report
npm run test:unit:coverage

# Run in watch mode (development)
npm run test:unit:watch

# Run with UI dashboard
npm run test:unit:ui
```

### Socket Tests

```bash
# List all scenarios
npm run test:arena:list

# Run quick tests (connection + roles + party-to-match)
npm run test:arena:quick -- --server=http://localhost:3001

# Run ALL tests sequentially
npm run test:arena:all -- --server=http://localhost:3001

# Run specific scenario
npm run test:arena -- --server=http://localhost:3001 --scenario=roles

# Run multiple scenarios
npm run test:arena -- --server=http://localhost:3001 --scenarios=connection,roles

# Run with verbose output
npm run test:arena -- --server=http://localhost:3001 --all --verbose

# Stop on first failure
npm run test:arena -- --server=http://localhost:3001 --all --stop-on-fail
```

### E2E Tests

```bash
# Run all E2E tests (non-blocking, CI mode)
npm run test:e2e

# Run with visible browser (interactive)
npm run test:e2e:headed

# Debug mode (step-by-step with inspector)
npm run test:e2e:debug

# Run with interactive HTML report at end
npm run test:e2e:interactive

# Run specific test file
npm run test:e2e -- tests/e2e/specs/match-flow.spec.ts

# Run 5v5 PvP test (10 players)
npm run test:e2e -- --grep "5v5 PvP"

# Run full party match test (5 players vs AI)
npm run test:e2e -- tests/e2e/specs/full-5v5-party-match.spec.ts

# View the HTML report (after tests complete)
npm run test:e2e:report
```

### Combined (CI/CD)

```bash
# Run all tests (unit + socket + e2e)
npm run test:all

# CI mode with coverage and reporters
npm run test:ci
```

## When to Run Each Test Type

| Trigger | Unit Tests | Socket Tests | E2E Tests |
|---------|------------|--------------|-----------|
| Every commit | ✅ Yes | ✅ Yes | ❌ No |
| Pull request | ✅ Yes | ✅ Yes | ⚠️ Critical paths only |
| Nightly build | ✅ Yes | ✅ Yes | ✅ Full suite |
| Before release | ✅ Yes | ✅ Yes | ✅ Full suite |
| After production deploy | ❌ No | ⚠️ Smoke test | ✅ Smoke test |

### Smoke Test Definition

A **smoke test** is a quick sanity check to verify that critical functionality works after deployment. It answers: "Is the app fundamentally broken?"

#### Smoke Test Suite (Post-Deploy)

Run these tests against production immediately after each deploy:

| Test | What It Verifies | Max Duration |
|------|------------------|--------------|
| Health check | Server responds on `/api/health` | 5s |
| Homepage loads | Static assets, SSR working | 10s |
| Login flow | Auth system, database connection | 15s |
| Socket connection | WebSocket server, Redis connection | 10s |
| Create party | Core arena feature works | 20s |

**Total smoke test time: < 60 seconds**

#### Running Smoke Tests

```bash
# Against staging
npm run test:smoke -- --url=https://staging.flashmath.io

# Against production (post-deploy)
npm run test:smoke -- --url=https://flashmath.io

# Socket smoke test only
npm run test:arena -- --server=https://flashmath.io --scenario=connection
```

#### Smoke Test vs Full Suite

| Aspect | Smoke Test | Full Suite |
|--------|------------|------------|
| Purpose | "Is it working?" | "Is everything correct?" |
| Duration | < 1 minute | 5-10 minutes |
| Coverage | 5-10 critical paths | All features |
| When to run | After every deploy | Nightly/pre-release |
| Failure action | Rollback immediately | Investigate, fix, redeploy |

## What Each Test Type Verifies

### Unit Tests (Vitest) ✅

| Verified | Not Verified |
|----------|--------------|
| Math engine logic | Database queries |
| ELO calculations | WebSocket events |
| Username validation | API endpoints |
| Scoring algorithms | UI rendering |
| Pure utility functions | Authentication flows |

### Socket Tests (Backend) ✅

| Verified | Not Verified |
|----------|--------------|
| WebSocket connection | React rendering |
| Match creation | CSS/styling |
| Player join/leave | Button clicks |
| Phase transitions | Animations |
| IGL/Anchor enforcement | Error messages display |
| Slot assignments | Loading states |
| Event emission | Sound effects |
| State sanitization | Mobile layout |

### E2E Tests (Browser) ✅

| Verified | Not Verified |
|----------|--------------|
| Full user journey | Server-side edge cases |
| UI button functionality | Performance under load |
| Visual element display | Database integrity |
| Form submissions | API rate limiting |
| Page navigation | Security vulnerabilities |
| Error message display | |
| Responsive layout | |

## Test Scenarios

### Unit Test Scenarios

| Module | Tests | Purpose |
|--------|-------|---------|
| `math-engine` | 15 | Question generation, performance calculation |
| `username-validator` | 20 | Format, profanity, reserved words |
| `elo-calculator` | 12 | ELO math, floors/ceilings |
| `team-scoring` | 18 | Points, streaks, tiebreakers |
| `test-data` | 10 | Factory function validation |

**Total: 75+ unit tests** *(Run `npm run test:unit -- --reporter=verbose` for current count)*

### Socket Test Scenarios

| Scenario | Tests | Duration | Purpose |
|----------|-------|----------|---------|
| `connection` | 2 | ~0.03s | WebSocket connectivity |
| `party-to-match` | 4 | ~7s | Full party → match flow |
| `roles` | 6 | ~13s | IGL & Anchor selection |
| `match-flow` | 3 | ~5s | Match progression |
| `question-counter` | 3 | ~3s | Question counting |
| `timeout` | 3 | ~8s | IGL timeout |
| `double-callin` | 4 | ~6s | Double Call-In ability |
| `quit-vote` | 4 | ~5s | Quit voting system |
| `load-test` | 4 | ~15s | Performance under load |

**Total: ~33 socket tests**

### E2E Test Scenarios (Critical Paths)

| Test | Purpose | Priority | Players |
|------|---------|----------|---------|
| `auth.spec.ts` | Login → See dashboard | P0 | 1 |
| `party-creation.spec.ts` | Create party → Invite → Join | P0 | 5 |
| `vs-ai-match.spec.ts` | Start AI match → Strategy phase | P0 | 5 |
| `full-5v5-party-match.spec.ts` | Complete 5v5 match vs AI | P0 | 5 |
| `5v5-pvp-match.spec.ts` | **Full 5v5 PvP match (10 players)** | P0 | **10** |
| `match-flow.spec.ts` | Navigate through match flow | P1 | 5 |
| `igl-abilities.spec.ts` | IGL slot assignment | P1 | 5 |
| `double-callin.spec.ts` | IGL Double Call-In UI | P1 | 5 |
| `quit-vote.spec.ts` | Quit vote modal flow | P2 | 5 |

**Total: ~9 E2E spec files**

### 10-Player PvP E2E Testing

The `5v5-pvp-match.spec.ts` test runs **10 concurrent browser sessions** to simulate a complete 5v5 Player vs Player match:

```
┌─────────────────────────────────────────────────────────────────┐
│                   10-Player PvP E2E Test                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  TEAM ALPHA (Players 1-5)      TEAM BRAVO (Players 6-10)       │
│  ┌─────────────────────┐       ┌─────────────────────┐         │
│  │ Player 1 (IGL)      │       │ Player 6 (IGL)      │         │
│  │ Player 2 (Anchor)   │   VS  │ Player 7 (Anchor)   │         │
│  │ Player 3 (Member)   │       │ Player 8 (Member)   │         │
│  │ Player 4 (Member)   │       │ Player 9 (Member)   │         │
│  │ Player 5 (Member)   │       │ Player 10 (Member)  │         │
│  └─────────────────────┘       └─────────────────────┘         │
│                                                                 │
│  Test Flow:                                                     │
│  1. Both teams form parties (leaders create, invite members)    │
│  2. Both teams assign IGL and Anchor roles                      │
│  3. All non-leaders ready up                                    │
│  4. Both teams enter matchmaking queue                          │
│  5. Teams get matched together                                  │
│  6. Match starts (strategy phase)                               │
│  7. Both teams play (answer questions)                          │
│  8. Match completes (one team wins)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Running the 10-Player Test:**

```bash
# Full 10-player PvP test
npm run test:e2e -- --grep "5v5 PvP"

# Quick party formation validation only
npm run test:e2e -- --grep "party formation only"
```

**System Requirements:**

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 8GB | 16GB |
| CPU Cores | 4 | 8 |
| Test Duration | ~15 min | ~10 min |

**Test Accounts:**

The 10 test accounts are automatically created during E2E setup:

| Team | Players | Email Pattern |
|------|---------|---------------|
| Alpha | 1-5 | `e2e-player{1-5}@test.flashmath.local` |
| Bravo | 6-10 | `e2e-player{6-10}@test.flashmath.local` |

## Test Data Management

### Test Data Factory

Located in `tests/unit/utils/test-data.ts`, provides consistent test data:

```typescript
import { createTestUser, createTestTeam, createTestParty } from '../utils/test-data';

// Create test user
const user = createTestUser({ name: 'TestPlayer', level: 10 });

// Create 5-player team
const team = createTestTeam(5);

// Create party with members
const party = createTestParty(5);
```

### Test Account Constants

For E2E tests requiring authentication (10 accounts for PvP testing):

```typescript
import { TEST_CREDENTIALS } from './global-setup';

// Team Alpha (players 1-5)
await page.fill('[name="email"]', TEST_CREDENTIALS.player1.email);
await page.fill('[name="password"]', TEST_CREDENTIALS.player1.password);

// Team Bravo (players 6-10)
await page.fill('[name="email"]', TEST_CREDENTIALS.player6.email);
await page.fill('[name="password"]', TEST_CREDENTIALS.player6.password);
```

| Account | Email | Team | Role |
|---------|-------|------|------|
| player1 | `e2e-player1@test.flashmath.local` | Alpha | IGL |
| player2 | `e2e-player2@test.flashmath.local` | Alpha | Anchor |
| player3-5 | `e2e-player{3-5}@test.flashmath.local` | Alpha | Member |
| player6 | `e2e-player6@test.flashmath.local` | Bravo | IGL |
| player7 | `e2e-player7@test.flashmath.local` | Bravo | Anchor |
| player8-10 | `e2e-player{8-10}@test.flashmath.local` | Bravo | Member |

### Test Isolation

- **Unit tests**: No shared state, each test is independent
- **Socket tests**: Each scenario gets fresh connections
- **E2E tests**: Use isolated browser contexts

### Test Data Cleanup

- Unit tests: No cleanup needed (pure functions)
- Socket tests: Cleanup handled by test orchestrator
- E2E tests: Consider using test-specific accounts

## Mocking Strategy

### When to Mock

| Scenario | Mock? | Reason |
|----------|-------|--------|
| External APIs (email, OAuth) | ✅ Yes | Avoid network calls, rate limits |
| Database in unit tests | ✅ Yes | Keep tests fast and isolated |
| Database in E2E tests | ❌ No | Test real integration |
| Redis in unit tests | ✅ Yes | Not testing Redis itself |
| Time/Date functions | ✅ Yes | Deterministic results |
| Socket.io in components | ✅ Yes | Test UI in isolation |

### Unit Test Mocking (Vitest)

```typescript
// tests/unit/lib/email-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendWelcomeEmail } from '@/lib/email/sender';

// Mock the email provider
vi.mock('@/lib/email/provider', () => ({
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('sendWelcomeEmail', () => {
    it('should call provider with correct template', async () => {
        const result = await sendWelcomeEmail('user@test.com');
        expect(result.success).toBe(true);
    });
});
```

### Database Mocking

For unit tests that touch database logic, mock the `db.ts` module:

```typescript
// tests/unit/lib/user-service.test.ts
import { vi } from 'vitest';

vi.mock('@/lib/db', () => ({
    queryOne: vi.fn(),
    query: vi.fn(),
    execute: vi.fn(),
}));

import { queryOne } from '@/lib/db';
import { getUserById } from '@/lib/actions/users';

describe('getUserById', () => {
    it('should return user when found', async () => {
        vi.mocked(queryOne).mockResolvedValue({ id: 1, name: 'Test' });
        const user = await getUserById(1);
        expect(user?.name).toBe('Test');
    });
});
```

### Socket.io Mocking (Component Tests)

```typescript
// tests/unit/components/arena-display.test.tsx
import { vi } from 'vitest';

// Mock the arena socket hook
vi.mock('@/lib/socket/use-arena-socket', () => ({
    useArenaSocket: () => ({
        connected: true,
        matchState: mockMatchState,
        submitAnswer: vi.fn(),
    }),
}));
```

### Time Mocking

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-06T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

it('should calculate time correctly', () => {
    expect(getMatchDuration()).toBe(0); // Frozen time
    vi.advanceTimersByTime(60000); // Advance 1 minute
    expect(getMatchDuration()).toBe(60);
});
```

### What NOT to Mock

- **Core business logic**: Test the real implementation
- **Database in E2E**: The point is integration testing
- **Internal utilities**: Mock at boundaries, not internals
- **Things you're testing**: Don't mock the subject under test

## Coverage Requirements

### Current Thresholds (Informational)

| Layer | Target | Current |
|-------|--------|---------|
| Unit Tests | 70% | Tracking |
| Integration | N/A | Tracking |
| E2E | N/A | Tracking |

### Enabling Coverage Enforcement

In `vitest.config.ts`, uncomment thresholds:

```typescript
coverage: {
    // ...
    thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
    },
},
```

## Performance/Load Testing

### Load Test Scenarios

Located in `tests/arena/scenarios/load-test.ts`:

| Test | Purpose |
|------|---------|
| `testConcurrentConnections` | Verify server handles N simultaneous WebSocket connections |
| `testConnectionStability` | Verify connections remain stable over time |
| `testRapidConnectDisconnect` | Verify server handles connection churn |
| `testConnectionMetrics` | Collect memory/performance metrics |

### Running Load Tests

```bash
# Run load tests with custom client count
npm run test:arena -- --scenario=load-test --server=http://localhost:3001

# In Docker with concurrent clients
docker-compose -f docker-compose.test.yml --profile concurrent up
```

### Performance Baselines

| Metric | Expected | Acceptable |
|--------|----------|------------|
| Connection time | <100ms | <500ms |
| Concurrent connections | 100+ | 50+ |
| Memory per connection | <1MB | <5MB |

## Security Testing

While comprehensive security audits are beyond automated testing, critical security boundaries should be verified.

### Authentication Boundary Tests

```typescript
// tests/unit/lib/auth-boundaries.test.ts
import { describe, it, expect } from 'vitest';

describe('Authentication Boundaries', () => {
    it('should reject expired JWT tokens', async () => {
        const expiredToken = createExpiredToken();
        const result = await validateToken(expiredToken);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('TOKEN_EXPIRED');
    });

    it('should reject malformed tokens', async () => {
        const result = await validateToken('not.a.valid.token');
        expect(result.valid).toBe(false);
    });

    it('should reject tokens with invalid signatures', async () => {
        const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
        const result = await validateToken(tamperedToken);
        expect(result.valid).toBe(false);
    });
});
```

### Authorization Tests

```typescript
// tests/unit/lib/authorization.test.ts
describe('Role-Based Access Control', () => {
    it('should deny admin actions to regular users', async () => {
        const user = createTestUser({ role: 'user' });
        await expect(banUser(user, targetUserId)).rejects.toThrow('FORBIDDEN');
    });

    it('should allow moderators to mute users', async () => {
        const mod = createTestUser({ role: 'moderator' });
        const result = await muteUser(mod, targetUserId);
        expect(result.success).toBe(true);
    });

    it('should prevent users from accessing other user data', async () => {
        const user = createTestUser({ id: 1 });
        await expect(getUserPrivateData(user, 2)).rejects.toThrow('FORBIDDEN');
    });
});
```

### Input Sanitization Tests

```typescript
// tests/unit/lib/input-sanitization.test.ts
describe('Input Sanitization', () => {
    const maliciousInputs = [
        '<script>alert("xss")</script>',
        '"; DROP TABLE users; --',
        '{{constructor.constructor("return this")()}}',
        '../../../etc/passwd',
    ];

    it.each(maliciousInputs)('should sanitize malicious input: %s', (input) => {
        const sanitized = sanitizeUsername(input);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('DROP TABLE');
        expect(sanitized).not.toContain('../');
    });

    it('should escape HTML in user-generated content', () => {
        const input = '<img src=x onerror=alert(1)>';
        const escaped = escapeHtml(input);
        expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });
});
```

### Security Test Checklist

| Area | Test Type | What to Verify |
|------|-----------|----------------|
| Authentication | Unit | Token validation, expiry, signatures |
| Authorization | Unit + E2E | Role checks, ownership verification |
| Input validation | Unit | XSS, SQL injection, path traversal |
| Rate limiting | Integration | API throttling (manual/load test) |
| Session management | E2E | Logout invalidation, session expiry |
| Ban enforcement | Unit + E2E | Banned users cannot access resources |

### What Requires Manual Security Review

- Dependency vulnerabilities (`npm audit`)
- HTTPS/TLS configuration
- Cookie security flags (HttpOnly, Secure, SameSite)
- CORS policy verification
- Content Security Policy headers
- Penetration testing

## Flaky Test Handling

### Retry Configuration

**Vitest (unit tests):**
```typescript
// vitest.config.ts
test: {
    retry: process.env.CI ? 2 : 0,
}
```

**Playwright (E2E):**
```typescript
// playwright.config.ts
export default defineConfig({
    retries: process.env.CI ? 2 : 0,
});
```

### Common Flaky Test Causes

| Cause | Solution |
|-------|----------|
| Race conditions | Add explicit waits |
| Network timeouts | Increase timeouts |
| Test order dependencies | Ensure test isolation |
| Stale elements | Use proper locators |

### Timeout Guidelines

| Test Type | Default Timeout | When to Increase |
|-----------|-----------------|------------------|
| Unit | 10s | Never needed |
| Socket | 30s | For matchmaking tests |
| E2E | 60s | For full match flows |

## Confidence Levels

### If Unit Tests Pass:
- **80%+ confidence** that core algorithms work
- Math calculations are correct
- Validation logic is sound
- Scoring is accurate

### If Socket Tests Pass:
- **90%+ confidence** that server logic works correctly
- Match creation, player joining, phase transitions will work
- IGL/Anchor roles are correctly enforced
- Socket events are emitted properly

### If E2E Tests Pass:
- **95%+ confidence** that critical user journeys work
- Users can navigate through the app
- Buttons are clickable and functional
- Visual elements render correctly

### What Still Requires Manual Testing:
- Complex edge cases
- "Feel" and usability
- Performance under real-world conditions
- Cross-browser quirks (Safari, Firefox)
- Mobile device testing

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit:coverage
      - uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/

  socket-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:arena:all -- --server=${{ secrets.TEST_SERVER_URL }} --json > socket-results.json
      - uses: actions/upload-artifact@v3
        with:
          name: socket-test-results
          path: socket-results.json

  e2e-tests:
    runs-on: ubuntu-latest
    needs: socket-tests  # Only run if socket tests pass
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Adding New Tests

### Adding a Unit Test

1. Create file in `tests/unit/lib/` or `tests/unit/utils/`
2. Import from Vitest
3. Use `describe` and `it` blocks

```typescript
// tests/unit/lib/my-module.test.ts
import { describe, it, expect } from 'vitest';

describe('MyModule', () => {
    it('should do something', () => {
        expect(myFunction()).toBe(expected);
    });
});
```

### Adding a Socket Test

1. Create new file in `tests/arena/scenarios/`
2. Export test functions that return `TestResult`
3. Add to `SCENARIOS` in `test-orchestrator.ts`

```typescript
// tests/arena/scenarios/my-feature.ts
export async function testMyFeature(config: TestConfig): Promise<TestResult> {
    const startTime = Date.now();
    try {
        // Test logic here
        return { name: 'testMyFeature', passed: true, duration: Date.now() - startTime };
    } catch (error) {
        return { name: 'testMyFeature', passed: false, duration: Date.now() - startTime, error: error.message };
    }
}
```

### Adding an E2E Test

1. Create new file in `tests/e2e/specs/`
2. Use Page Object Model for maintainability
3. Focus on critical user paths

```typescript
// tests/e2e/specs/my-feature.spec.ts
import { test, expect } from '../fixtures/console-capture';
import { MatchPage } from '../pages/match-page';

test('user can complete my feature', async ({ page }) => {
    const matchPage = new MatchPage(page);
    await matchPage.goto();
    await matchPage.doSomething();
    await expect(matchPage.resultElement).toBeVisible();
});
```

## Test Naming Conventions

Consistent naming makes tests discoverable and self-documenting.

### File Naming

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit tests | `{module}.test.ts` | `math-engine.test.ts` |
| Socket tests | `{feature}.ts` | `party-to-match.ts` |
| E2E tests | `{feature}.spec.ts` | `match-flow.spec.ts` |

### Describe Block Naming

Use hierarchical `describe` blocks that read like documentation:

```typescript
// ✅ Good: Clear hierarchy
describe('MathEngine', () => {
    describe('generateQuestion', () => {
        describe('when difficulty is "hard"', () => {
            it('should include multiplication and division', () => {});
            it('should use numbers greater than 10', () => {});
        });
    });
});

// ❌ Bad: Flat, no context
describe('MathEngine tests', () => {
    it('test1', () => {});
    it('test2', () => {});
});
```

### Test Case Naming (it blocks)

Use the format: `should [expected behavior] when [condition]`

```typescript
// ✅ Good: Descriptive, reads like a sentence
it('should return 0 when input is empty string', () => {});
it('should throw ValidationError when username contains spaces', () => {});
it('should increment streak when answer is correct', () => {});

// ❌ Bad: Vague or implementation-focused
it('works', () => {});
it('test the function', () => {});
it('calls the API', () => {});
```

### Socket Test Function Naming

Prefix with `test` and use camelCase:

```typescript
// ✅ Good
export async function testPlayerCanJoinParty() {}
export async function testIGLCanAssignSlots() {}
export async function testMatchEndsAfter15Questions() {}

// ❌ Bad
export async function joinParty() {}  // Not clear it's a test
export async function test_player_join() {}  // Wrong case
```

### E2E Test Naming

Use user-centric language:

```typescript
// ✅ Good: Describes user journey
test('user can create party and invite friends', async () => {});
test('player sees victory screen after winning match', async () => {});

// ❌ Bad: Technical implementation details
test('PartyComponent renders with inviteModal', async () => {});
```

### Test Data Variable Naming

```typescript
// ✅ Good: Clear intent
const validUser = createTestUser({ name: 'Alice' });
const bannedUser = createTestUser({ banned_until: futureDate });
const expiredToken = createToken({ expiresIn: -1 });

// ❌ Bad: Generic names
const user1 = createTestUser();
const testData = createToken();
```

## Troubleshooting

### Unit Test Failures

1. Run specific test: `npx vitest run tests/unit/lib/my-test.test.ts`
2. Run with verbose: `npx vitest --reporter=verbose`
3. Check for import issues (module resolution)

### Socket Test Failures

1. Check server is running: `docker ps`
2. Verify server URL: `--server=http://localhost:3001`
3. Run with verbose: `--verbose`
4. Check server logs: `docker logs flashmath-dev`

### E2E Test Failures

1. Run with visible browser: `npm run test:e2e:headed`
2. Use debug mode: `npm run test:e2e:debug`
3. Check Playwright report: `npm run test:e2e:report`
4. Screenshot on failure is auto-captured

## Docker Test Infrastructure

The testing infrastructure uses Docker containers for isolated, reproducible test environments.

### Docker Compose Files

| File | Purpose | Port |
|------|---------|------|
| `docker-compose.test.yml` | Socket test runner + app + Redis | 3000 |
| `docker-compose.reports.yml` | Test report viewer dashboard | 9400 |
| `docker-compose.dev.yml` | Development environment | 3001 |

### Container Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Test Infrastructure                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  docker-compose.test.yml:                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  flashmath   │  │    redis     │  │     test     │          │
│  │   (app)      │◄─│  (queue)     │  │   (runner)   │          │
│  │  :3000       │  │  :6379       │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  docker-compose.reports.yml:                                    │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              report-viewer                            │      │
│  │   Serves: Playwright HTML reports, History, Socket    │      │
│  │   Port: 9400                                          │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Running Tests in Docker

```bash
# Full stack: app + redis + test runner
docker-compose -f docker-compose.test.yml up --build

# Run tests against external server
docker-compose -f docker-compose.test.yml run test --server=http://dev.flashmath.io

# Run specific scenario
docker-compose -f docker-compose.test.yml run test --scenario=roles

# Run concurrent clients (for load testing)
docker-compose -f docker-compose.test.yml --profile concurrent up
```

### npm Scripts for Docker

```bash
# Report viewer management
npm run reports:start      # Start viewer at http://localhost:9400
npm run reports:stop       # Stop viewer
npm run reports:build      # Rebuild container
npm run reports:logs       # View container logs
```

## Console Log Capture

E2E tests automatically capture browser console logs and attach them to the test report for debugging.

### Using Console Capture in Tests

```typescript
// Import from fixtures instead of @playwright/test
import { test, expect } from '../fixtures/console-capture';

test('my test', async ({ page, consoleLogs }) => {
    await page.goto('/some-page');
    
    // consoleLogs array is available during test
    console.log('Captured:', consoleLogs.length, 'messages');
});
```

### Viewing Console Logs in Report

1. Open the Playwright HTML report
2. Click on a test
3. Scroll to "Attachments" section
4. Click `browser-console-logs` to view formatted logs

## Test History & Archiving

Test results are automatically archived with timestamps for tracking trends over time.

### Commands

```bash
# Run tests with automatic archiving
npm run test:history           # Archive both E2E and socket results
npm run test:history:e2e       # Archive E2E only
npm run test:history:socket    # Archive socket only

# Start the test report viewer (Docker)
npm run reports:start          # Start on http://localhost:9400
npm run reports:stop           # Stop the viewer
```

## Best Practices

1. **Unit tests first**: Write unit tests for new pure functions
2. **Socket tests for integration**: Test WebSocket logic in isolation
3. **E2E for critical paths**: 5-10 tests covering main user journeys
4. **Don't duplicate**: If unit test covers logic, socket/E2E just verifies integration
5. **Use Page Objects**: Makes E2E tests maintainable
6. **Fail fast**: Use `--stop-on-fail` when debugging
7. **Keep E2E minimal**: More E2E tests = slower pipeline
8. **Use test data factories**: Consistent, reusable test data
9. **Use console capture**: Import from `../fixtures/console-capture` for debugging
10. **Archive regularly**: Use `npm run test:history` weekly (or after major changes) to track trends
