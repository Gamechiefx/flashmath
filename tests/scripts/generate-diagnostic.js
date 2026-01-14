#!/usr/bin/env node

/**
 * Generate Claude-Friendly Diagnostic Report
 * 
 * Usage: node tests/scripts/generate-diagnostic.js [test-result-dir]
 * 
 * If no directory is specified, finds the most recent failed test.
 */

const fs = require('fs');
const path = require('path');

const testResultsDir = path.join(__dirname, '../../test-results');

function findMostRecentFailedTest() {
    if (!fs.existsSync(testResultsDir)) {
        console.error('No test-results directory found. Run tests first.');
        process.exit(1);
    }
    
    const dirs = fs.readdirSync(testResultsDir)
        .filter(d => fs.statSync(path.join(testResultsDir, d)).isDirectory())
        .map(d => ({
            name: d,
            mtime: fs.statSync(path.join(testResultsDir, d)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
    
    return dirs[0]?.name;
}

function readFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
    }
    return null;
}

function generateReport(testDir) {
    const fullPath = path.join(testResultsDir, testDir);
    
    if (!fs.existsSync(fullPath)) {
        console.error(`Test result directory not found: ${testDir}`);
        process.exit(1);
    }
    
    // Read available files
    const errorContext = readFileIfExists(path.join(fullPath, 'error-context.md'));
    const consoleLogs = readFileIfExists(path.join(fullPath, 'browser-console-logs'));
    const consoleLogsJson = readFileIfExists(path.join(fullPath, 'browser-console-logs.json'));
    
    // Parse test name from directory
    const testName = testDir
        .replace(/-chromium.*$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    
    // Generate report
    let report = `## E2E Test Failure - Diagnostic Report

### Test Information
- **Test Name:** ${testName}
- **Result Directory:** ${testDir}

`;

    if (errorContext) {
        report += `### Page Snapshot at Failure
\`\`\`yaml
${errorContext.substring(0, 2000)}
\`\`\`

`;
    }

    if (consoleLogs) {
        report += `### Browser Console Logs
\`\`\`
${consoleLogs.substring(0, 3000)}
\`\`\`

`;
    } else if (consoleLogsJson) {
        try {
            const logs = JSON.parse(consoleLogsJson);
            const formattedLogs = logs.slice(0, 20).map(log => 
                `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.text.substring(0, 100)}`
            ).join('\n');
            report += `### Browser Console Logs (JSON)
\`\`\`
${formattedLogs}
\`\`\`

`;
        } catch (e) {
            // Skip if parse fails
        }
    }

    // List all files in the result directory
    const files = fs.readdirSync(fullPath);
    report += `### Available Artifacts
${files.map(f => `- ${f}`).join('\n')}

`;

    // Check for screenshots
    const screenshots = files.filter(f => f.endsWith('.png'));
    if (screenshots.length > 0) {
        report += `### Screenshots
${screenshots.map(s => `- \`${path.join(testDir, s)}\``).join('\n')}

`;
    }

    report += `---

### Questions for Claude
1. What is causing this test to fail?
2. What's the root cause based on the console logs?
3. What fix would you recommend?

### How to Use This Report
Copy everything above and paste it into your Claude conversation for diagnosis.
`;

    return report;
}

// Main
const targetDir = process.argv[2] || findMostRecentFailedTest();

if (!targetDir) {
    console.error('No test results found.');
    process.exit(1);
}

console.log(`\n📋 Generating diagnostic report for: ${targetDir}\n`);
console.log('='.repeat(60));

const report = generateReport(targetDir);
console.log(report);

// Also save to file
const outputPath = path.join(testResultsDir, `${targetDir}-diagnostic.md`);
fs.writeFileSync(outputPath, report);
console.log(`\n✅ Report saved to: ${outputPath}`);
console.log('\n💡 Copy the report above and paste it into Claude for diagnosis.');

