/**
 * Arena Test Runner
 * 
 * CLI tool to run synthetic tests against the FlashMath arena server
 * 
 * Usage:
 *   npx ts-node tests/arena/runner.ts --server=http://localhost:3000
 *   npx ts-node tests/arena/runner.ts --scenario=question-counter
 *   npx ts-node tests/arena/runner.ts --all
 *   npx ts-node tests/arena/runner.ts --list
 */

import { 
    runAllTests, 
    runScenario, 
    runMultipleScenarios,
    printResults, 
    printSummary,
    listScenarios,
    TestSuite,
    AVAILABLE_SCENARIOS,
} from './test-orchestrator';

interface CLIOptions {
    server: string;
    scenario?: string;
    scenarios?: string[];
    runAll: boolean;
    verbose: boolean;
    matchId?: string;
    output: 'console' | 'json';
    outputFile?: string;
    list: boolean;
    stopOnFail: boolean;
}

function parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    const options: CLIOptions = {
        server: process.env.TEST_SERVER_URL || 'http://localhost:3000',
        verbose: false,
        output: 'console',
        runAll: false,
        list: false,
        stopOnFail: false,
    };
    
    for (const arg of args) {
        if (arg.startsWith('--server=')) {
            options.server = arg.split('=')[1];
        } else if (arg.startsWith('--scenario=')) {
            options.scenario = arg.split('=')[1];
        } else if (arg.startsWith('--scenarios=')) {
            // Allow comma-separated list: --scenarios=connection,roles,party-to-match
            options.scenarios = arg.split('=')[1].split(',').map(s => s.trim());
        } else if (arg.startsWith('--match-id=')) {
            options.matchId = arg.split('=')[1];
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--json') {
            options.output = 'json';
        } else if (arg.startsWith('--output=')) {
            options.outputFile = arg.split('=')[1];
        } else if (arg === '--all' || arg === '-a') {
            options.runAll = true;
        } else if (arg === '--list' || arg === '-l') {
            options.list = true;
        } else if (arg === '--stop-on-fail') {
            options.stopOnFail = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        }
    }
    
    return options;
}

function printHelp(): void {
    console.log(`
FlashMath Arena Test Runner
===========================

Usage:
  npx ts-node tests/arena/runner.ts [options]

Options:
  --server=URL       Server URL (default: http://localhost:3000)
  --scenario=NAME    Run single scenario
  --scenarios=A,B,C  Run multiple scenarios (comma-separated)
  --all, -a          Run ALL available scenarios sequentially
  --list, -l         List all available scenarios
  --verbose, -v      Enable verbose output
  --json             Output results as JSON
  --stop-on-fail     Stop running tests after first failure
  --help, -h         Show this help message

Orchestration Modes:
  1. Unit Test (single scenario):
     npm run test:arena -- --scenario=roles

  2. Multiple Scenarios:
     npm run test:arena -- --scenarios=connection,roles,party-to-match

  3. Run All (sequential):
     npm run test:arena -- --all

  4. List Available:
     npm run test:arena -- --list

Examples:
  # List all scenarios
  npm run test:arena -- --list

  # Run just connection tests
  npm run test:arena -- --scenario=connection

  # Run connection + roles tests
  npm run test:arena -- --scenarios=connection,roles

  # Run ALL tests sequentially
  npm run test:arena -- --all --verbose

  # Run all, stop on first failure
  npm run test:arena -- --all --stop-on-fail

  # Output JSON for CI
  npm run test:arena -- --all --json
`);
}

async function main() {
    const options = parseArgs();
    
    // Handle --list flag
    if (options.list) {
        listScenarios();
        process.exit(0);
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           FlashMath Arena Synthetic Test Runner              ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Server: ${options.server}`);
    
    if (options.runAll) {
        console.log(`Mode: Run ALL scenarios sequentially`);
    } else if (options.scenarios) {
        console.log(`Mode: Run multiple scenarios: ${options.scenarios.join(', ')}`);
    } else if (options.scenario) {
        console.log(`Mode: Single scenario: ${options.scenario}`);
    }
    
    console.log(`Verbose: ${options.verbose}`);
    console.log(`Stop on Fail: ${options.stopOnFail}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    try {
        let results: TestSuite;
        
        if (options.runAll) {
            // Run ALL scenarios sequentially
            results = await runAllTests({
                serverUrl: options.server,
                verbose: options.verbose,
                stopOnFail: options.stopOnFail,
            });
        } else if (options.scenarios && options.scenarios.length > 0) {
            // Run multiple specific scenarios
            results = await runMultipleScenarios(options.scenarios, {
                serverUrl: options.server,
                verbose: options.verbose,
                stopOnFail: options.stopOnFail,
            });
        } else if (options.scenario) {
            // Run single scenario
            results = await runScenario(options.scenario, {
                serverUrl: options.server,
                matchId: options.matchId,
                verbose: options.verbose,
            });
        } else {
            // Default: show help
            console.log('No scenario specified. Use --scenario, --scenarios, or --all\n');
            console.log('Available scenarios:');
            listScenarios();
            process.exit(0);
        }
        
        if (options.output === 'json') {
            const jsonOutput = JSON.stringify(results, null, 2);
            
            if (options.outputFile) {
                // Write to file
                const fs = require('fs');
                const path = require('path');
                fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
                fs.writeFileSync(options.outputFile, jsonOutput);
                console.log(`\n📁 Results written to: ${options.outputFile}`);
            } else {
                console.log(jsonOutput);
            }
        } else {
            printResults(results);
            printSummary(results);
            
            // Also write to file if specified
            if (options.outputFile) {
                const fs = require('fs');
                const path = require('path');
                fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
                fs.writeFileSync(options.outputFile, JSON.stringify(results, null, 2));
                console.log(`\n📁 Results also written to: ${options.outputFile}`);
            }
        }
        
        // Exit with appropriate code
        const allPassed = results.results.every(r => r.passed);
        process.exit(allPassed ? 0 : 1);
        
    } catch (error: any) {
        console.error('\n❌ Fatal error:', error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(2);
    }
}

main();

