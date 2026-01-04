import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for FlashMath E2E Tests
 * 
 * Run all tests:     npm run test:e2e
 * Run with browser:  npm run test:e2e:headed
 * Debug mode:        npm run test:e2e:debug
 */

export default defineConfig({
    // Test directory
    testDir: './specs',
    
    // Run tests in parallel
    fullyParallel: true,
    
    // Fail the build on CI if you accidentally left test.only
    forbidOnly: !!process.env.CI,
    
    // Retry failed tests (2 retries on CI, 0 locally)
    retries: process.env.CI ? 2 : 0,
    
    // Limit parallel workers on CI
    workers: process.env.CI ? 1 : undefined,
    
    // Reporter configuration
    // 'never' = don't auto-open, 'always' = always open, 'on-failure' = open on failure
    reporter: [
        ['html', { 
            outputFolder: 'playwright-report',
            open: 'never',  // Don't auto-open, use npm run test:e2e:report to view
        }],
        ['list'],  // Console output
        ['json', { outputFile: 'playwright-report/results.json' }],  // Machine-readable results
        ...(process.env.CI ? [['github'] as const] : []),
    ],
    
    // Shared settings for all projects
    use: {
        // Base URL - can be overridden with TEST_BASE_URL env var
        baseURL: process.env.TEST_BASE_URL || 'http://localhost:3001',
        
        // Collect trace on first retry
        trace: 'on-first-retry',
        
        // Screenshot on failure
        screenshot: 'only-on-failure',
        
        // Video on failure
        video: 'on-first-retry',
        
        // Default timeout for actions
        actionTimeout: 10000,
        
        // Default navigation timeout
        navigationTimeout: 30000,
    },
    
    // Test timeout
    timeout: 60000,
    
    // Expect timeout
    expect: {
        timeout: 10000,
    },
    
    // Configure projects for different browsers
    // Only Chromium is installed by default - add others with: npx playwright install firefox
    projects: [
        // Desktop Chrome (primary - always available)
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        
        // Uncomment after running: npx playwright install firefox
        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        // },
        
        // Uncomment for mobile testing
        // {
        //     name: 'mobile-chrome',
        //     use: { ...devices['Pixel 5'] },
        // },
    ],
    
    // Global setup - runs once before all tests
    // globalSetup: require.resolve('./global-setup'),
    
    // Web server configuration (optional - start server before tests)
    // Uncomment if you want Playwright to start the server
    // webServer: {
    //     command: 'npm run dev:server',
    //     url: 'http://localhost:3000',
    //     reuseExistingServer: !process.env.CI,
    //     timeout: 120000,
    // },
});

