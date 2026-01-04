# FlashMath Testing Strategy

This document outlines the comprehensive testing strategy for FlashMath Arena, including socket-based integration tests and browser-based E2E tests.

## Testing Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Strategy                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SOCKET TESTS (Backend/Integration)                         │
│     ├── Run on every commit                                    │
│     ├── Fast (~20 seconds total)                               │
│     ├── Verify server logic                                    │
│     └── No browser needed                                       │
│                                                                 │
│  2. E2E TESTS (Browser/UI)                                     │
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
              /     █     \     Integration/Socket Tests
             /      █      \    (Medium, Fast, Good Coverage)
            /       █       \   ~20-50 tests
           /────────█────────\
          /         █         \  Unit Tests
         /          █          \ (Many, Very Fast, Isolated)
        /           █           \~100+ tests
       ─────────────█────────────
```

## Directory Structure

```
tests/
├── arena/                    # Socket/Integration tests
│   ├── synthetic-client.ts   # Headless Socket.io client
│   ├── test-orchestrator.ts  # Test management
│   ├── runner.ts             # CLI entry point
│   ├── Dockerfile            # Docker test runner
│   └── scenarios/
│       ├── connection.ts     # WebSocket connectivity
│       ├── party-to-match.ts # Full party → match flow
│       ├── roles.ts          # IGL & Anchor roles
│       ├── match-flow.ts     # Match progression
│       ├── question-counter.ts
│       ├── timeout.ts
│       ├── double-callin.ts
│       └── quit-vote.ts
│
├── e2e/                      # Browser E2E tests (Playwright)
│   ├── playwright.config.ts  # Playwright configuration
│   ├── global-setup.ts       # Test account setup
│   ├── pages/                # Page Object Model
│   │   ├── base-page.ts
│   │   ├── setup-page.ts
│   │   ├── queue-page.ts
│   │   └── match-page.ts
│   └── specs/
│       ├── auth.spec.ts
│       ├── party-creation.spec.ts
│       ├── match-flow.spec.ts
│       └── igl-abilities.spec.ts
│
└── README.md
```

## What Each Test Type Verifies

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

## Commands

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

# View the HTML report (after tests complete)
npm run test:e2e:report
```

### Combined (CI/CD)

```bash
# Run all tests (socket + e2e)
npm run test:all

# CI mode with reporters
npm run test:ci
```

## When to Run Each Test Type

| Trigger | Socket Tests | E2E Tests |
|---------|--------------|-----------|
| Every commit | ✅ Yes | ❌ No |
| Pull request | ✅ Yes | ⚠️ Critical paths only |
| Nightly build | ✅ Yes | ✅ Full suite |
| Before release | ✅ Yes | ✅ Full suite |
| After production deploy | ⚠️ Smoke test | ✅ Smoke test |

## Socket Test Scenarios

| Scenario | Tests | Duration | Purpose |
|----------|-------|----------|---------|
| `connection` | 2 | ~0.03s | WebSocket connectivity |
| `party-to-match` | 4 | ~7s | Full party → match flow |
| `roles` | 6 | ~13s | IGL & Anchor selection |
| `match-flow` | 3 | TBD | Match progression |
| `question-counter` | 3 | TBD | Question counting |
| `timeout` | 3 | TBD | IGL timeout |
| `double-callin` | 4 | TBD | Double Call-In ability |
| `quit-vote` | 4 | TBD | Quit voting system |

**Total: 29 tests**

## E2E Test Scenarios (Critical Paths)

| Test | Purpose | Priority |
|------|---------|----------|
| `auth-flow.spec.ts` | Login → See dashboard | P0 |
| `party-creation.spec.ts` | Create party → Invite → Join | P0 |
| `vs-ai-match.spec.ts` | Start AI match → Strategy phase | P0 |
| `igl-slot-assignment.spec.ts` | IGL assigns slots visually | P1 |
| `match-gameplay.spec.ts` | Answer questions → Slot advances | P1 |
| `double-callin-ui.spec.ts` | IGL activates Double Call-In | P1 |
| `quit-vote-ui.spec.ts` | Quit vote modal and flow | P2 |

## Confidence Levels

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
  socket-tests:
    runs-on: ubuntu-latest
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
import { test, expect } from '@playwright/test';
import { MatchPage } from '../pages/match-page';

test('user can complete my feature', async ({ page }) => {
    const matchPage = new MatchPage(page);
    await matchPage.goto();
    await matchPage.doSomething();
    await expect(matchPage.resultElement).toBeVisible();
});
```

## Troubleshooting

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

### Running Socket Tests in Docker

```bash
# Full stack: app + redis + test runner
docker-compose -f docker-compose.test.yml up --build

# Run tests against external server
docker-compose -f docker-compose.test.yml run test --server=http://dev.flashmath.io

# Run specific scenario
docker-compose -f docker-compose.test.yml run test --scenario=roles

# Run all tests with verbose output
docker-compose -f docker-compose.test.yml run test --all --verbose

# Run concurrent clients (for load testing)
docker-compose -f docker-compose.test.yml --profile concurrent up
```

### Test Report Viewer Container

```bash
# Start the report viewer
docker-compose -f docker-compose.reports.yml up -d

# View at http://localhost:9400

# Check status
docker-compose -f docker-compose.reports.yml ps

# View logs
docker-compose -f docker-compose.reports.yml logs -f

# Rebuild after changes
docker-compose -f docker-compose.reports.yml build --no-cache

# Stop
docker-compose -f docker-compose.reports.yml down
```

### npm Scripts for Docker

```bash
# Report viewer management
npm run reports:start      # Start viewer at http://localhost:9400
npm run reports:stop       # Stop viewer
npm run reports:build      # Rebuild container
npm run reports:logs       # View container logs
```

### Volume Mounts (Report Viewer)

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `tests/e2e/playwright-report/` | `/reports/e2e/` | Playwright HTML reports |
| `tests/arena/results/` | `/reports/socket/` | Socket test JSON results |
| `tests/history/` | `/reports/history/` | Archived test runs |

### Environment Variables

#### Socket Test Container (`docker-compose.test.yml`)

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_SERVER_URL` | `http://flashmath:3000` | Server to test against |
| `CLIENT_ID` | (none) | Unique ID for concurrent clients |

#### Report Viewer Container (`docker-compose.reports.yml`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9400` | Server port |
| `E2E_REPORT_PATH` | `/reports/e2e` | Playwright report location |
| `SOCKET_RESULTS_PATH` | `/reports/socket` | Socket results location |
| `HISTORY_PATH` | `/reports/history` | History archive location |

### Dockerfile Locations

| File | Base Image | Purpose |
|------|------------|---------|
| `tests/arena/Dockerfile` | `node:20-alpine` | Headless Socket.io test runner |
| `tests/report-viewer/Dockerfile` | `node:20-alpine` | Express.js report server |
| `Dockerfile.dev` | `node:20` | Development app container |

### Troubleshooting Docker

```bash
# Check running containers
docker ps

# View container logs
docker logs flashmath-dev
docker logs flashmath-test-reports

# Exec into container
docker exec -it flashmath-dev sh

# Clean up test containers
docker-compose -f docker-compose.test.yml down -v

# Remove all test images
docker rmi $(docker images 'flashmath*' -q)

# Check network connectivity
docker network inspect flashmath_test-network
```

### Health Checks

Both containers include health checks:

**FlashMath App:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 10s
  timeout: 5s
  retries: 5
```

**Report Viewer:**
```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:9400/health"]
  interval: 30s
  timeout: 3s
  retries: 3
```

## Console Log Capture

E2E tests automatically capture browser console logs and attach them to the test report for debugging.

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                   Console Log Capture Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Browser ──► console.log()  ──► Playwright Fixture ──► Report  │
│          ──► console.error()                                    │
│          ──► Network failures                                   │
│          ──► Page errors                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What's Captured

| Log Type | Icon | Example |
|----------|------|---------|
| `console.log()` | 📝 LOG | `[HMR] connected` |
| `console.info()` | ℹ️ INFO | `React DevTools...` |
| `console.warn()` | ⚠️ WARN | Deprecation warnings |
| `console.error()` | ❌ ERROR | JavaScript exceptions |
| Network failures | 🌐 NET-ERR | `Request failed: ...` |
| Page errors | 💥 PAGE-ERR | Uncaught exceptions |

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
5. Click `browser-console-logs.json` for structured data

## Diagnosing Failures with Claude

Use captured console logs and error context to get AI-powered diagnosis of test failures.

### Quick Commands

```bash
# 1. Run tests (failures will generate artifacts)
npm run test:e2e

# 2. Generate diagnostic report for Claude
npm run test:e2e:diagnose

# 3. Copy the output and paste to Claude for diagnosis
```

### Diagnostic Report Contents

| Section | Purpose |
|---------|---------|
| **Test Information** | Which test failed |
| **Page Snapshot** | DOM state at failure (reveals redirects, missing elements) |
| **Browser Console Logs** | JavaScript errors, network failures, app state |
| **Available Artifacts** | Screenshots, traces, other files |
| **Questions for Claude** | Pre-formatted prompts |

### Example Claude Conversation Template

````markdown
## E2E Test Failure - Need Help Diagnosing

### Test Information
- **Test Name:** Match Flow › should navigate to team setup page
- **File:** tests/e2e/specs/match-flow.spec.ts:22

### Expected Behavior
Navigate to `/arena/teams/setup` and see "VS AI" or "5v5" button

### Actual Behavior
Test timed out waiting for elements to be visible

### Playwright Error
```
Error: expect(locator).toBeVisible() failed
Locator: locator('text=5v5').or(locator('text=VS AI'))
Expected: visible
Timeout: 10000ms
```

### Page Snapshot at Failure
```yaml
- heading "ACCESS TERMINAL" [level=1]
- paragraph: Enter your credentials to continue mastery.
- textbox "name@nexus.com"
- button "SIGN IN"
```

### Browser Console Logs
```
[2026-01-04T14:13:55.153Z] ℹ️ INFO Download the React DevTools...
[2026-01-04T14:13:55.262Z] 📝 LOG [HMR] connected
[2026-01-04T14:13:55.406Z] 🌐 NET-ERR Request failed: http://127.0.0.1:7244/...
```

### My Analysis
The page snapshot shows the LOGIN page instead of the setup page.
User is not authenticated and got redirected.

### Question
How do I authenticate the test user before running this test?
````

### What Claude Can Diagnose

| Information | What It Reveals |
|-------------|-----------------|
| Error message | What assertion failed and why |
| Page snapshot | Actual page state (redirects, wrong page) |
| Console logs | JavaScript errors, network failures |
| NET-ERR logs | API endpoints that failed |
| Test code | What the test is trying to do |

## Test History & Archiving

Test results are automatically archived with timestamps for tracking trends over time.

### Commands

```bash
# Run tests with automatic archiving
npm run test:history           # Archive both E2E and socket results
npm run test:history:e2e       # Archive E2E only
npm run test:history:socket    # Archive socket only

# Manual archive of current results
npm run test:archive

# Start the test report viewer (Docker)
npm run reports:start          # Start on http://localhost:9400
npm run reports:stop           # Stop the viewer
npm run reports:logs           # View container logs
```

### Report Viewer Dashboard

Access at `http://localhost:9400` after running `npm run reports:start`

Features:
- **Dashboard**: View latest E2E and Socket test results
- **History**: Browse all archived test runs with timestamps
- **Pass Rate**: Track success/failure trends over time
- **Auto-refresh**: Updates every 30 seconds

### Archive Structure

```
tests/history/
├── index.json                    # History metadata
├── latest/                       # Symlink to most recent run
├── 2026-01-04_14-04-05/
│   ├── e2e/                      # Playwright HTML report
│   └── playwright-results.json   # Machine-readable results
├── 2026-01-04_13-56-17/
│   └── ...
└── ...
```

## Best Practices

1. **Socket tests first**: Fast feedback, run on every commit
2. **E2E for critical paths**: 5-10 tests covering main user journeys
3. **Don't duplicate**: If socket test covers logic, E2E just verifies UI
4. **Use Page Objects**: Makes E2E tests maintainable
5. **Fail fast**: Use `--stop-on-fail` when debugging
6. **Keep E2E minimal**: More E2E tests = slower pipeline
7. **Use console capture**: Import from `../fixtures/console-capture` for debugging
8. **Generate diagnostics**: Run `npm run test:e2e:diagnose` for Claude-friendly reports
9. **Archive regularly**: Use `npm run test:history` to track trends

