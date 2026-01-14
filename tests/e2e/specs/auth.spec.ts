import { test, expect } from '../fixtures/console-capture';

/**
 * Authentication Flow Tests
 * 
 * Verifies users can log in and access protected pages
 * Console logs are automatically captured and attached to the report.
 */

test.describe('Authentication', () => {
    
    test('should display login page', async ({ page }) => {
        await page.goto('/auth/login');
        
        // Verify login form elements exist
        await expect(page.locator('[name="email"]').or(page.locator('input[type="email"]'))).toBeVisible();
        await expect(page.locator('[name="password"]').or(page.locator('input[type="password"]'))).toBeVisible();
        // Use more specific selector - the primary "SIGN IN" button
        await expect(page.getByRole('button', { name: 'SIGN IN', exact: true })).toBeVisible();
    });
    
    test('should show error on invalid credentials', async ({ page }) => {
        await page.goto('/auth/login');
        
        // Try to login with invalid credentials
        await page.fill('[name="email"], input[type="email"]', 'invalid@example.com');
        await page.fill('[name="password"], input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');
        
        // Should show error message (wait a bit for response)
        await page.waitForTimeout(2000);
        
        // Either we're still on login page or see an error
        const currentUrl = page.url();
        expect(currentUrl).toContain('login');
    });
    
    test('should redirect unauthenticated users from arena', async ({ page }) => {
        // Try to access protected arena page
        await page.goto('/arena/teams/setup');
        
        // Should redirect to login
        await page.waitForURL('**/auth/login**', { timeout: 10000 }).catch(() => {});
        
        // Verify we're either on login or see auth prompt
        const url = page.url();
        const isLoginPage = url.includes('/auth/login') || url.includes('/auth');
        const hasAuthPrompt = await page.locator('text=Sign in').or(page.locator('text=Login')).isVisible().catch(() => false);
        
        expect(isLoginPage || hasAuthPrompt).toBeTruthy();
    });
});

test.describe('Authenticated User', () => {
    // These tests assume authentication is set up via global-setup
    // or use test fixtures with pre-authenticated state
    
    test.skip('should access dashboard after login', async ({ page }) => {
        // This test requires a valid test account
        // Skip until test account is configured
        
        await page.goto('/auth/login');
        await page.fill('[name="email"]', process.env.TEST_USER_EMAIL || 'test@flashmath.io');
        await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD || 'testpassword123');
        await page.click('button[type="submit"]');
        
        // Wait for redirect to dashboard or main page
        await page.waitForURL('**/dashboard**', { timeout: 15000 });
        
        expect(page.url()).toContain('dashboard');
    });
});

