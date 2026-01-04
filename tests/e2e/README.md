# FlashMath E2E Tests (Playwright)

Browser-based End-to-End tests for FlashMath Arena using Playwright.

## Overview

These tests use **Playwright** to automate a real browser and verify critical user journeys. They complement the socket-based integration tests by validating the UI/UX layer.

## Prerequisites

1. **Node.js 18+** installed
2. **Server running** on `http://localhost:3001` (or specify with `TEST_BASE_URL`)
3. **Playwright browsers** installed

## Setup

```bash
# Install dependencies (including Playwright)
npm install

# Install Playwright browsers (one-time setup)
npx playwright install

# Or install with system dependencies (for CI/Linux)
npx playwright install --with-deps
```

## Running Tests

### Basic Commands

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Debug mode (step-by-step)
npm run test:e2e:debug

# Open HTML report
npm run test:e2e:report
```

### Running Specific Tests

```bash
# Run specific test file
npm run test:e2e -- tests/e2e/specs/auth.spec.ts

# Run tests matching name pattern
npm run test:e2e -- --grep "login"

# Run specific browser only
npm run test:e2e -- --project=chromium
```

### Code Generation

```bash
# Generate tests by recording browser actions
npm run test:e2e:codegen
```

## Test Structure

```
tests/e2e/
├── playwright.config.ts   # Playwright configuration
├── global-setup.ts        # Runs once before all tests
├── pages/                 # Page Object Models
│   ├── base-page.ts       # Common page functionality
│   ├── setup-page.ts      # Team setup page
│   ├── match-page.ts      # Match page
│   └── index.ts           # Exports
└── specs/                 # Test specifications
    ├── auth.spec.ts       # Authentication tests
    ├── match-flow.spec.ts # Match flow tests
    ├── igl-abilities.spec.ts
    └── quit-vote.spec.ts
```

## Page Object Model

We use the **Page Object Model (POM)** pattern for maintainability. Each page has:

1. **Locators**: Elements on the page
2. **Actions**: Methods to interact with the page
3. **Assertions**: Methods to verify page state

### Example Usage

```typescript
import { test, expect } from '@playwright/test';
import { SetupPage, MatchPage } from '../pages';

test('start AI match', async ({ page }) => {
    const setupPage = new SetupPage(page);
    const matchPage = new MatchPage(page);
    
    // Navigate to setup
    await setupPage.goto();
    
    // Start AI match
    await setupPage.startAIMatch('easy');
    
    // Verify match started
    await matchPage.verifyLoaded();
});
```

## Adding Test IDs

For reliable E2E testing, add `data-testid` attributes to components:

```tsx
// In your React component
<button data-testid="vs-ai-button" onClick={handleClick}>
    VS AI
</button>
```

Then use in tests:

```typescript
await page.click('[data-testid="vs-ai-button"]');
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_BASE_URL` | Server URL to test against | `http://localhost:3001` |
| `CI` | Set automatically in CI environments | - |
| `TEST_USER_EMAIL` | Test account email | - |
| `TEST_USER_PASSWORD` | Test account password | - |
| `SETUP_AUTH` | Run auth setup in global-setup | - |

### Example: Test Against Staging

```bash
TEST_BASE_URL=https://staging.flashmath.io npm run test:e2e
```

## Debugging

### Visual Debugging

```bash
# Step through test with Playwright Inspector
npm run test:e2e:debug
```

### View Traces

```bash
# Run tests with trace
npm run test:e2e -- --trace on

# View trace (after test failure)
npx playwright show-trace tests/e2e/test-results/*/trace.zip
```

### Screenshots

Failed tests automatically capture screenshots in:
```
tests/e2e/test-results/
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E Tests
  run: npm run test:e2e
  env:
    TEST_BASE_URL: ${{ secrets.STAGING_URL }}

- name: Upload Report
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: tests/e2e/playwright-report/
```

## Test Status

| Test File | Status | Description |
|-----------|--------|-------------|
| `auth.spec.ts` | 🟡 Partial | Basic auth tests |
| `match-flow.spec.ts` | ⏸️ Skipped | Requires auth setup |
| `igl-abilities.spec.ts` | ⏸️ Skipped | Requires active match |
| `quit-vote.spec.ts` | ⏸️ Skipped | Requires multi-user |

**Legend:**
- 🟢 Complete
- 🟡 Partial (some tests work)
- ⏸️ Skipped (needs setup/fixtures)

## Best Practices

1. **Use test IDs**: Prefer `[data-testid="x"]` over CSS selectors
2. **Keep tests independent**: Each test should work in isolation
3. **Use Page Objects**: Encapsulate page logic for maintainability
4. **Minimize E2E tests**: Focus on critical paths; use socket tests for edge cases
5. **Avoid flaky tests**: Use explicit waits, not arbitrary timeouts

