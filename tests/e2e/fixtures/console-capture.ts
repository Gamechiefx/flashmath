import { test as base, Page } from '@playwright/test';

/**
 * Console Log Capture Fixture
 * 
 * Automatically captures all browser console messages during tests
 * and attaches them to the test report for debugging.
 */

interface ConsoleMessage {
    type: string;
    text: string;
    location: string;
    timestamp: string;
}

// Extend the base test to include console capture
export const test = base.extend<{
    consoleLogs: ConsoleMessage[];
}>({
    // Auto-fixture that captures console logs
    consoleLogs: async ({ page }, use, testInfo) => {
        const logs: ConsoleMessage[] = [];
        
        // Capture all console messages
        page.on('console', (msg) => {
            logs.push({
                type: msg.type(),
                text: msg.text(),
                location: msg.location().url || 'unknown',
                timestamp: new Date().toISOString(),
            });
        });
        
        // Capture page errors
        page.on('pageerror', (error) => {
            logs.push({
                type: 'error',
                text: `PAGE ERROR: ${error.message}\n${error.stack || ''}`,
                location: 'page',
                timestamp: new Date().toISOString(),
            });
        });
        
        // Capture request failures
        page.on('requestfailed', (request) => {
            logs.push({
                type: 'network-error',
                text: `Request failed: ${request.url()} - ${request.failure()?.errorText || 'unknown'}`,
                location: request.url(),
                timestamp: new Date().toISOString(),
            });
        });
        
        // Use the logs in the test
        await use(logs);
        
        // After test: attach logs to report
        if (logs.length > 0) {
            // Format logs as readable text
            const formattedLogs = logs.map(log => {
                const prefix = getLogPrefix(log.type);
                return `[${log.timestamp}] ${prefix} ${log.text}`;
            }).join('\n');
            
            // Attach to test report
            await testInfo.attach('browser-console-logs', {
                body: formattedLogs,
                contentType: 'text/plain',
            });
            
            // Also attach as JSON for machine parsing
            await testInfo.attach('browser-console-logs.json', {
                body: JSON.stringify(logs, null, 2),
                contentType: 'application/json',
            });
        }
        
        // Optionally print error logs to terminal on failure
        if (testInfo.status !== 'passed') {
            const errors = logs.filter(l => 
                l.type === 'error' || 
                l.type === 'pageerror' || 
                l.type === 'network-error'
            );
            
            if (errors.length > 0) {
                console.log('\n📋 Console Errors from Test:');
                errors.forEach(e => {
                    console.log(`  ❌ [${e.type}] ${e.text.substring(0, 200)}`);
                });
            }
        }
    },
});

function getLogPrefix(type: string): string {
    const prefixes: Record<string, string> = {
        'log': '📝 LOG',
        'info': 'ℹ️ INFO',
        'warn': '⚠️ WARN',
        'error': '❌ ERROR',
        'debug': '🔍 DEBUG',
        'trace': '📍 TRACE',
        'network-error': '🌐 NET-ERR',
    };
    return prefixes[type] || `[${type}]`;
}

// Re-export expect for convenience
export { expect } from '@playwright/test';

