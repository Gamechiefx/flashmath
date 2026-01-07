/**
 * Test Orchestrator
 * 
 * Manages test execution, match creation, and result reporting
 */

import { SyntheticPlayer, TestResult } from './synthetic-client';
import * as ConnectionTests from './scenarios/connection';
import * as PartyToMatchTests from './scenarios/party-to-match';
import * as RolesTests from './scenarios/roles';
import * as MatchFlowTests from './scenarios/match-flow';
import * as QuestionCounterTests from './scenarios/question-counter';
import * as TimeoutTests from './scenarios/timeout';
import * as DoubleCallinTests from './scenarios/double-callin';
import * as QuitVoteTests from './scenarios/quit-vote';

export interface TestSuite {
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    passed: number;
    failed: number;
    skipped: number;
    results: TestResult[];
}

export interface TestConfig {
    serverUrl: string;
    matchId?: string;
    verbose?: boolean;
    parallel?: boolean;
    stopOnFail?: boolean;
}

// Scenario definitions
const SCENARIOS: Record<string, { name: string; tests: ((config: any) => Promise<TestResult>)[]; requiresMatch?: boolean }> = {
    'connection': {
        name: 'Connection',
        tests: [
            ConnectionTests.testBasicConnection,
            ConnectionTests.testMultipleConnections,
        ],
        requiresMatch: false,
    },
    'party-to-match': {
        name: 'Party to Match Flow',
        tests: [
            PartyToMatchTests.testPartyToMatchFlow,
            PartyToMatchTests.testAllPlayersReceiveState,
            PartyToMatchTests.testStrategyPhaseCountdown,
            PartyToMatchTests.testAITeamVisible,
        ],
        requiresMatch: false, // Creates its own matches
    },
    'roles': {
        name: 'IGL & Anchor Roles',
        tests: [
            RolesTests.testIGLSelection,
            RolesTests.testAnchorSelection,
            RolesTests.testIGLStrategyPhaseDecisions,
            RolesTests.testNonIGLCannotMakeDecisions,
            RolesTests.testDoubleCallinRound1,
            RolesTests.testCustomRoleAssignment,
        ],
        requiresMatch: false, // Creates its own matches
    },
    'match-flow': {
        name: 'Match Flow',
        tests: [
            MatchFlowTests.testMatchJoin,
            MatchFlowTests.testStrategyPhase,
            MatchFlowTests.testCompleteRound,
        ],
        requiresMatch: false, // Each test creates its own match
    },
    'question-counter': {
        name: 'Question Counter',
        tests: [
            QuestionCounterTests.testQuestionsPerSlot,
            QuestionCounterTests.testNoSixthQuestion,
            QuestionCounterTests.testSlotAdvancement,
        ],
    },
    'timeout': {
        name: 'Timeout',
        tests: [
            TimeoutTests.testTimeoutDuringBreak,
            TimeoutTests.testTimeoutExtension,
            TimeoutTests.testNonIglCannotTimeout,
        ],
    },
    'double-callin': {
        name: 'Double Call-In',
        tests: [
            DoubleCallinTests.testDoubleCallinStrategy,
            DoubleCallinTests.testAnchorPlaysSlot,
            DoubleCallinTests.testDoubleCallinPhaseRestriction,
            DoubleCallinTests.testDoubleCallinOncePerHalf,
        ],
    },
    'quit-vote': {
        name: 'Quit Vote',
        tests: [
            QuitVoteTests.testInitiateQuitVote,
            QuitVoteTests.testQuitVotePasses,
            QuitVoteTests.testQuitVoteFails,
            QuitVoteTests.testForfeitNotification,
        ],
    },
};

// Export scenario names for CLI
export const AVAILABLE_SCENARIOS = Object.keys(SCENARIOS);

/**
 * List all available scenarios
 */
export function listScenarios(): void {
    console.log('\n📋 Available Test Scenarios:\n');
    console.log('┌──────────────────────┬────────────────────────────┬───────┐');
    console.log('│ Scenario Key         │ Name                       │ Tests │');
    console.log('├──────────────────────┼────────────────────────────┼───────┤');
    
    for (const [key, scenario] of Object.entries(SCENARIOS)) {
        const keyPad = key.padEnd(20);
        const namePad = scenario.name.padEnd(26);
        const testCount = scenario.tests.length.toString().padStart(5);
        console.log(`│ ${keyPad} │ ${namePad} │${testCount} │`);
    }
    
    console.log('└──────────────────────┴────────────────────────────┴───────┘');
    
    const totalTests = Object.values(SCENARIOS).reduce((sum, s) => sum + s.tests.length, 0);
    console.log(`\nTotal: ${Object.keys(SCENARIOS).length} scenarios, ${totalTests} tests\n`);
}

/**
 * Create an AI test match via server action
 */
export async function createAITestMatch(serverUrl: string): Promise<string> {
    // In a real implementation, this would call the server action
    // For now, we'll use a direct HTTP call
    
    const testPartyId = `test-party-${Date.now()}`;
    
    try {
        const response = await fetch(`${serverUrl}/api/arena/test/create-match`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                partyId: testPartyId,
                difficulty: 'easy',
                testMode: true,
            }),
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create test match: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.matchId;
    } catch (error: any) {
        // Fallback: generate a test match ID
        console.warn('Could not create AI match via API, using test ID');
        return `test-match-${Date.now()}`;
    }
}

/**
 * Run a specific test scenario
 */
export async function runScenario(
    scenarioName: string,
    config: TestConfig
): Promise<TestSuite> {
    const scenario = SCENARIOS[scenarioName];
    
    if (!scenario) {
        throw new Error(`Unknown scenario: ${scenarioName}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
    }
    
    const suite: TestSuite = {
        name: scenario.name,
        startTime: Date.now(),
        endTime: 0,
        duration: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        results: [],
    };
    
    // Create match if scenario requires it
    let matchId: string | undefined;
    if (scenario.requiresMatch !== false) {
        matchId = config.matchId || await createAITestMatch(config.serverUrl);
    }
    
    console.log(`\n📋 Running scenario: ${scenario.name}`);
    if (matchId) {
        console.log(`   Match ID: ${matchId}`);
    }
    console.log(`   Tests: ${scenario.tests.length}`);
    console.log('');
    
    for (const testFn of scenario.tests) {
        const testName = testFn.name;
        
        if (config.verbose) {
            console.log(`   ⏳ ${testName}...`);
        }
        
        try {
            const result = await testFn({
                serverUrl: config.serverUrl,
                matchId,
                verbose: config.verbose,
            });
            
            suite.results.push(result);
            
            if (result.passed) {
                suite.passed++;
                console.log(`   ✅ ${testName} (${result.duration}ms)`);
            } else {
                suite.failed++;
                console.log(`   ❌ ${testName}: ${result.error}`);
            }
        } catch (error: any) {
            suite.failed++;
            suite.results.push({
                name: testName,
                passed: false,
                duration: 0,
                error: error.message,
            });
            console.log(`   ❌ ${testName}: ${error.message}`);
        }
    }
    
    suite.endTime = Date.now();
    suite.duration = suite.endTime - suite.startTime;
    
    return suite;
}

/**
 * Run multiple specific scenarios
 */
export async function runMultipleScenarios(
    scenarioNames: string[],
    config: TestConfig
): Promise<TestSuite> {
    const suite: TestSuite = {
        name: `Selected Scenarios (${scenarioNames.length})`,
        startTime: Date.now(),
        endTime: 0,
        duration: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        results: [],
    };
    
    // Validate all scenario names first
    for (const name of scenarioNames) {
        if (!SCENARIOS[name]) {
            throw new Error(`Unknown scenario: ${name}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
        }
    }
    
    console.log(`\n🎯 Running ${scenarioNames.length} scenarios: ${scenarioNames.join(', ')}\n`);
    
    for (let i = 0; i < scenarioNames.length; i++) {
        const scenarioName = scenarioNames[i];
        console.log(`\n[${i + 1}/${scenarioNames.length}] ─────────────────────────────────────────`);
        
        const scenarioSuite = await runScenario(scenarioName, config);
        
        suite.passed += scenarioSuite.passed;
        suite.failed += scenarioSuite.failed;
        suite.skipped += scenarioSuite.skipped;
        suite.results.push(...scenarioSuite.results);
        
        // Stop on first failure if requested
        if (config.stopOnFail && scenarioSuite.failed > 0) {
            console.log('\n⛔ Stopping due to --stop-on-fail flag');
            // Mark remaining scenarios as skipped
            for (let j = i + 1; j < scenarioNames.length; j++) {
                suite.skipped += SCENARIOS[scenarioNames[j]].tests.length;
            }
            break;
        }
    }
    
    suite.endTime = Date.now();
    suite.duration = suite.endTime - suite.startTime;
    
    return suite;
}

/**
 * Run all test scenarios
 */
export async function runAllTests(config: TestConfig): Promise<TestSuite> {
    const scenarioNames = Object.keys(SCENARIOS);
    
    const suite: TestSuite = {
        name: 'All Arena Tests',
        startTime: Date.now(),
        endTime: 0,
        duration: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        results: [],
    };
    
    console.log(`\n🚀 Running ALL ${scenarioNames.length} scenarios sequentially\n`);
    
    for (let i = 0; i < scenarioNames.length; i++) {
        const scenarioName = scenarioNames[i];
        console.log(`\n[${i + 1}/${scenarioNames.length}] ─────────────────────────────────────────`);
        
        const scenarioSuite = await runScenario(scenarioName, config);
        
        suite.passed += scenarioSuite.passed;
        suite.failed += scenarioSuite.failed;
        suite.skipped += scenarioSuite.skipped;
        suite.results.push(...scenarioSuite.results);
        
        // Stop on first failure if requested
        if (config.stopOnFail && scenarioSuite.failed > 0) {
            console.log('\n⛔ Stopping due to --stop-on-fail flag');
            // Mark remaining scenarios as skipped
            for (let j = i + 1; j < scenarioNames.length; j++) {
                suite.skipped += SCENARIOS[scenarioNames[j]].tests.length;
            }
            break;
        }
    }
    
    suite.endTime = Date.now();
    suite.duration = suite.endTime - suite.startTime;
    
    return suite;
}

/**
 * Print formatted test results
 */
export function printResults(suite: TestSuite): void {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                        TEST RESULTS                           ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nSuite: ${suite.name}`);
    console.log(`Duration: ${(suite.duration / 1000).toFixed(2)}s`);
    console.log(`Total: ${suite.results.length}`);
    console.log(`Passed: ${suite.passed} ✅`);
    console.log(`Failed: ${suite.failed} ❌`);
    console.log(`Skipped: ${suite.skipped} ⏭️`);
    
    if (suite.failed > 0) {
        console.log('\n─────────────────────────────────────────────────────────────');
        console.log('                       FAILED TESTS                          ');
        console.log('─────────────────────────────────────────────────────────────');
        
        for (const result of suite.results) {
            if (!result.passed) {
                console.log(`\n❌ ${result.name}`);
                console.log(`   Error: ${result.error}`);
                if (result.details) {
                    console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
                }
            }
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    
    const passRate = suite.results.length > 0 
        ? ((suite.passed / suite.results.length) * 100).toFixed(1)
        : '0';
    
    console.log(`Pass Rate: ${passRate}%`);
    console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Print a final summary with recommendations
 */
export function printSummary(suite: TestSuite): void {
    const passRate = suite.results.length > 0 
        ? (suite.passed / suite.results.length) * 100
        : 0;
    
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│                      EXECUTION SUMMARY                      │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    
    // Status emoji based on results
    let statusEmoji = '🎉';
    let statusText = 'All tests passed!';
    if (suite.failed > 0) {
        statusEmoji = '⚠️';
        statusText = `${suite.failed} test(s) failed`;
    }
    if (passRate < 50) {
        statusEmoji = '❌';
        statusText = 'Critical: Most tests failed';
    }
    
    console.log(`│ ${statusEmoji} Status: ${statusText.padEnd(47)} │`);
    console.log(`│ ⏱️  Duration: ${(suite.duration / 1000).toFixed(2)}s${''.padEnd(44 - (suite.duration / 1000).toFixed(2).length)} │`);
    console.log(`│ 📊 Pass Rate: ${passRate.toFixed(1)}%${''.padEnd(44 - passRate.toFixed(1).length)} │`);
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ ✅ Passed:  ${suite.passed.toString().padEnd(5)} │ ❌ Failed: ${suite.failed.toString().padEnd(5)} │ ⏭️  Skipped: ${suite.skipped.toString().padEnd(4)}│`);
    console.log('└─────────────────────────────────────────────────────────────┘');
    
    if (suite.failed > 0) {
        console.log('\n💡 Next steps:');
        console.log('   1. Run failed scenarios with --verbose for more details');
        console.log('   2. Check server logs for errors');
        console.log('   3. Use --stop-on-fail to debug one failure at a time');
    }
    
    console.log('');
}

/**
 * Quick test connection to server
 */
export async function testConnection(serverUrl: string): Promise<boolean> {
    try {
        const player = new SyntheticPlayer({
            userId: 'connection-test',
            userName: 'ConnectionTest',
        }, serverUrl);
        
        await player.connect();
        player.disconnect();
        
        return true;
    } catch {
        return false;
    }
}

