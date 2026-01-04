/**
 * Global Setup for Playwright E2E Tests
 * 
 * Runs once before all tests to:
 * - Verify server is accessible
 * - Create test accounts if needed
 * - Set up authentication state
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
    const baseURL = config.projects[0].use?.baseURL || 'http://localhost:3001';
    
    console.log('\n🔧 E2E Global Setup');
    console.log(`   Base URL: ${baseURL}`);
    
    // 1. Verify server is accessible
    console.log('   Checking server connectivity...');
    try {
        const response = await fetch(baseURL);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        console.log('   ✅ Server is accessible');
    } catch (error: any) {
        console.error(`   ❌ Server not accessible: ${error.message}`);
        console.error('\n   Make sure the server is running:');
        console.error('   npm run dev:server\n');
        throw new Error('Server not accessible. Start the server and try again.');
    }
    
    // 2. Create test account and save auth state (optional)
    // This creates a logged-in browser state that can be reused across tests
    const storageStatePath = 'tests/e2e/.auth/user.json';
    
    if (process.env.SETUP_AUTH) {
        console.log('   Setting up authenticated state...');
        
        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();
        
        try {
            // Navigate to login page
            await page.goto(`${baseURL}/auth/login`);
            
            // Fill in test credentials
            // Using a known test account
            await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'test@flashmath.io');
            await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'testpassword123');
            
            // Submit login
            await page.click('[type="submit"]');
            
            // Wait for navigation to dashboard
            await page.waitForURL('**/dashboard');
            
            // Save authentication state
            await context.storageState({ path: storageStatePath });
            
            console.log('   ✅ Authentication state saved');
        } catch (error: any) {
            console.log('   ⚠️ Could not set up auth state:', error.message);
            console.log('   Tests will need to login manually');
        } finally {
            await browser.close();
        }
    }
    
    console.log('   ✅ Global setup complete\n');
}

export default globalSetup;

