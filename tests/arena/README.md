# FlashMath Arena Synthetic Tests

Automated testing for the 5v5 Arena using headless synthetic clients.

## Overview

This test suite uses Socket.io clients running in Node.js (no browser/GUI required) to simulate player behavior and verify arena functionality.

## Quick Start

### Run Locally

```bash
# Start the main server
npm run dev:server

# In another terminal...

# List all available scenarios
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
npm run test:arena -- --server=http://localhost:3001 --scenario=roles --verbose
```

## Orchestration Modes

| Mode | Command | Use Case |
|------|---------|----------|
| **List** | `--list` | View all available scenarios |
| **Unit Test** | `--scenario=X` | Test single scenario |
| **Multi-Scenario** | `--scenarios=A,B,C` | Test selected scenarios |
| **Full Suite** | `--all` | Run all tests sequentially |
| **Stop on Fail** | `--stop-on-fail` | Debug first failure |

### Run with Docker

```bash
# Build and run tests
docker-compose -f docker-compose.test.yml up --build

# Run specific scenario
docker-compose -f docker-compose.test.yml run test --scenario=timeout

# Run against external server
TEST_SERVER_URL=https://dev.flashmath.io docker-compose -f docker-compose.test.yml run test
```

## Test Scenarios

| Scenario | Description | Tests |
|----------|-------------|-------|
| `match-flow` | End-to-end match flow | Join, strategy phase, round completion |
| `question-counter` | Question counting logic | 5 questions/slot, no Q6, slot advancement |
| `timeout` | IGL timeout functionality | Break extension, 60s timeout, IGL-only |
| `double-callin` | Double Call-In ability | Strategy phase, anchor plays slot, once/half |
| `quit-vote` | Quit voting system | Initiate, pass, fail, forfeit notification |

## Architecture

```
tests/arena/
├── synthetic-client.ts    # SyntheticPlayer class - headless test client
├── test-orchestrator.ts   # Test management and reporting
├── runner.ts              # CLI entry point
├── Dockerfile             # Docker image for test runner
├── scenarios/
│   ├── match-flow.ts      # Match flow tests
│   ├── question-counter.ts # Question counting tests
│   ├── timeout.ts         # Timeout tests
│   ├── double-callin.ts   # Double Call-In tests
│   └── quit-vote.ts       # Quit vote tests
└── README.md              # This file
```

## CLI Options

```
npx ts-node tests/arena/runner.ts [options]

Options:
  --server=URL     Server URL (default: http://localhost:3000)
  --scenario=NAME  Run specific scenario
  --match-id=ID    Use existing match ID
  --verbose, -v    Enable verbose output
  --json           Output results as JSON
  --parallel       Run tests in parallel
  --help, -h       Show help
```

## Writing New Tests

### 1. Create Test Function

```typescript
// tests/arena/scenarios/my-feature.ts
import { SyntheticPlayer, createSyntheticTeam, cleanupPlayers, TestResult } from '../synthetic-client';

export async function testMyFeature(config: { serverUrl: string; matchId: string }): Promise<TestResult> {
    const startTime = Date.now();
    const players: SyntheticPlayer[] = [];
    
    try {
        // Create synthetic players
        const team = await createSyntheticTeam(5, config.serverUrl, 'MyTest');
        players.push(...team.players);
        
        // Join match
        await Promise.all(players.map(p => p.joinMatch(config.matchId)));
        
        // Perform actions...
        await team.leader.waitForPhase('active', 60000);
        
        // Assert expected behavior
        if (!team.leader.matchState) {
            throw new Error('Expected match state');
        }
        
        return {
            name: 'testMyFeature',
            passed: true,
            duration: Date.now() - startTime,
        };
    } catch (error: any) {
        return {
            name: 'testMyFeature',
            passed: false,
            duration: Date.now() - startTime,
            error: error.message,
        };
    } finally {
        cleanupPlayers(players);
    }
}
```

### 2. Add to Scenario Index

```typescript
// tests/arena/scenarios/index.ts
export * from './my-feature';
```

### 3. Register in Orchestrator

```typescript
// tests/arena/test-orchestrator.ts
import * as MyFeatureTests from './scenarios/my-feature';

const SCENARIOS = {
    // ... existing
    'my-feature': {
        name: 'My Feature',
        tests: [
            MyFeatureTests.testMyFeature,
        ],
    },
};
```

## SyntheticPlayer API

### Connection
- `connect()` - Connect to arena namespace
- `disconnect()` - Disconnect
- `joinMatch(matchId)` - Join a match

### Actions
- `submitAnswer(answer)` - Submit question answer
- `assignSlots(assignments)` - IGL: assign player slots
- `confirmSlots()` - IGL: confirm slot assignments
- `callTimeout()` - IGL: call timeout
- `activateDoubleCallin(slot)` - IGL: activate double call-in
- `initiateQuitVote()` - Leader: start quit vote
- `castQuitVote(vote)` - Cast quit vote

### Waiting
- `waitForEvent(eventName, timeoutMs)` - Wait for specific event
- `waitForPhase(phase, timeoutMs)` - Wait for match phase

### Assertions
- `hasReceivedEvent(eventName)` - Check if event was received
- `getLastEvent(eventName)` - Get last event data
- `receivedEvents` - Array of all received events

### Utilities
- `SyntheticPlayer.calculateAnswer(questionText)` - Parse and calculate answer

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Arena Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build and test
        run: |
          docker-compose -f docker-compose.test.yml up --build --exit-code-from test
        
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results.json
```

### JSON Output

```bash
npm run test:arena -- --json > test-results.json
```

Output format:
```json
{
  "name": "All Arena Tests",
  "startTime": 1704391200000,
  "endTime": 1704391260000,
  "duration": 60000,
  "passed": 15,
  "failed": 0,
  "skipped": 0,
  "results": [
    {
      "name": "testMatchJoin",
      "passed": true,
      "duration": 1234,
      "details": { "playersJoined": 5 }
    }
  ]
}
```

## Troubleshooting

### Connection Issues
- Ensure the server is running (`npm run dev:server`)
- Check server URL (`--server=http://localhost:3000`)
- Verify Socket.io path (`/arena/teams`)

### Test Timeouts
- Increase timeout values in test scenarios
- Check server logs for errors
- Ensure Redis is running for matchmaking

### Docker Issues
- Rebuild images: `docker-compose -f docker-compose.test.yml build --no-cache`
- Check network: `docker network ls`
- View logs: `docker-compose -f docker-compose.test.yml logs`

