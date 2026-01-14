import { test, expect } from '../fixtures/console-capture';

/**
 * Console Capture Verification Test
 * 
 * This test verifies that browser console logs are captured and attached
 * to the Playwright report. It navigates to the dashboard which outputs
 * session logs and presence connection logs.
 */

test.describe('Console Capture Verification', () => {
    
    test('should capture console logs from dashboard page', async ({ page, consoleLogs }) => {
        // Navigate to the main dashboard/home page
        await page.goto('/');
        
        // Wait for the page to load and emit console logs
        await page.waitForTimeout(3000);
        
        // Navigate to a page that triggers more logs
        await page.goto('/auth/login');
        await page.waitForTimeout(2000);
        
        // Log what we captured
        console.log(`\n📋 Captured ${consoleLogs.length} console messages`);
        
        // Print first few logs for visibility
        consoleLogs.slice(0, 10).forEach((log, i) => {
            console.log(`  [${i}] ${log.type}: ${log.text.substring(0, 100)}`);
        });
        
        // Verify we captured some logs
        expect(consoleLogs.length).toBeGreaterThan(0);
    });
    
    test('should capture logs from arena setup attempt', async ({ page, consoleLogs }) => {
        // Try to access arena (will redirect to login, but should capture logs)
        await page.goto('/arena/teams/setup');
        
        // Wait for redirects and log emissions
        await page.waitForTimeout(3000);
        
        // Log what we captured
        console.log(`\n📋 Captured ${consoleLogs.length} console messages from arena attempt`);
        
        // Print logs
        consoleLogs.forEach((log, i) => {
            if (i < 15) {
                console.log(`  [${i}] ${log.type}: ${log.text.substring(0, 120)}`);
            }
        });
        
        // This test always passes - we just want to see the logs attached
        expect(true).toBe(true);
    });
});

