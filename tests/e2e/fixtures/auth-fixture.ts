/**
 * Authentication Fixture for E2E Tests
 * 
 * Provides pre-authenticated browser contexts for tests.
 */

import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Test credentials interface
interface TestCredentials {
    email: string;
    password: string;
}

interface AuthFixtures {
    /** Credentials for the primary test account */
    primaryCredentials: TestCredentials;
    /** Credentials for the secondary test account */
    secondaryCredentials: TestCredentials;
    /** Credentials for the IGL test account */
    iglCredentials: TestCredentials;
    /** Login helper function */
    login: (page: Page, credentials: TestCredentials) => Promise<void>;
    /** Check if user is logged in */
    isLoggedIn: (page: Page) => Promise<boolean>;
}

// Load credentials from file (created by global-setup)
function loadCredentials(): { primary: TestCredentials; secondary: TestCredentials; igl: TestCredentials } {
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    
    if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
    
    // Fallback credentials (won't work without global-setup)
    console.warn('⚠️  Test credentials file not found. Using fallback (tests may fail).');
    return {
        primary: { email: 'e2e-primary@test.flashmath.local', password: 'TestPassword123!' },
        secondary: { email: 'e2e-secondary@test.flashmath.local', password: 'TestPassword123!' },
        igl: { email: 'e2e-igl@test.flashmath.local', password: 'TestPassword123!' },
    };
}

// Extend Playwright's base test with auth fixtures
export const test = base.extend<AuthFixtures>({
    primaryCredentials: async ({}, use) => {
        const creds = loadCredentials();
        await use(creds.primary);
    },
    
    secondaryCredentials: async ({}, use) => {
        const creds = loadCredentials();
        await use(creds.secondary);
    },
    
    iglCredentials: async ({}, use) => {
        const creds = loadCredentials();
        await use(creds.igl);
    },
    
    login: async ({}, use) => {
        const loginFn = async (page: Page, credentials: TestCredentials) => {
            await page.goto('/auth/login');
            
            // Wait for login form to be ready
            await page.waitForSelector('input[type="email"], [name="email"]', { timeout: 10000 });
            
            // Fill in credentials
            await page.fill('input[type="email"], [name="email"]', credentials.email);
            await page.fill('input[type="password"], [name="password"]', credentials.password);
            
            // Submit form
            await page.click('button[type="submit"]');
            
            // Wait for navigation away from login page
            await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { 
                timeout: 15000 
            }).catch(() => {
                throw new Error(`Login failed for ${credentials.email} - still on login page`);
            });
            
            // Additional wait for page to settle
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        };
        
        await use(loginFn);
    },
    
    isLoggedIn: async ({}, use) => {
        const checkFn = async (page: Page): Promise<boolean> => {
            // Check for common logged-in indicators
            const loggedInIndicators = [
                '[data-testid="user-menu"]',
                '[data-testid="logout-button"]',
                'button:has-text("Sign Out")',
                'button:has-text("Logout")',
                '[aria-label="User menu"]',
            ];
            
            for (const selector of loggedInIndicators) {
                const isVisible = await page.locator(selector).isVisible().catch(() => false);
                if (isVisible) return true;
            }
            
            // Check URL is not login page
            return !page.url().includes('/auth/login');
        };
        
        await use(checkFn);
    },
});

export { expect };

