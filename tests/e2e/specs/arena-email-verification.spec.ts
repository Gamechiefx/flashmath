/**
 * Arena Email Verification E2E Tests
 * 
 * Tests that users without verified emails are blocked from arena access
 * and redirected to the verification page.
 */

import { test, expect } from '@playwright/test';
import { TEST_CREDENTIALS } from '../global-setup';

// Test account with UNVERIFIED email
const UNVERIFIED_USER = TEST_CREDENTIALS.unverified;

// Test account with VERIFIED email
const VERIFIED_USER = TEST_CREDENTIALS.player1;

test.describe('Arena Email Verification', () => {
    
    test.describe('Unverified User Access', () => {
        
        test.beforeEach(async ({ page }) => {
            // Create unverified test user if needed
            // This would typically be done in global setup, but for isolation:
            await page.goto('/');
        });

        test('unverified user is redirected from /arena/modes to verification page', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            // Wait for login to complete
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Try to access arena modes
            await page.goto('/arena/modes');
            
            // Should be redirected to verification page
            await expect(page).toHaveURL(/\/arena\/verify-email/);
            
            // Verify the verification page content
            await expect(page.locator('text=Email Verification Required')).toBeVisible();
            await expect(page.locator('text=Resend Verification Email')).toBeVisible();
        });

        test('unverified user is redirected from /arena/teams/setup', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Try to access team setup
            await page.goto('/arena/teams/setup?mode=5v5');
            
            // Should be redirected to verification page
            await expect(page).toHaveURL(/\/arena\/verify-email/);
        });

        test('unverified user is redirected from /arena/queue', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Try to access queue
            await page.goto('/arena/queue?mode=1v1&operation=mixed');
            
            // Should be redirected to verification page
            await expect(page).toHaveURL(/\/arena\/verify-email/);
        });

        test('unverified user is redirected from /arena/leaderboard', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Try to access leaderboard
            await page.goto('/arena/leaderboard');
            
            // Should be redirected to verification page
            await expect(page).toHaveURL(/\/arena\/verify-email/);
        });

        test('unverified user is redirected from /practice', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Try to access practice
            await page.goto('/practice');
            
            // Should be redirected to verification page
            await expect(page).toHaveURL(/\/arena\/verify-email/);
        });
    });

    test.describe('Verification Page UI', () => {
        
        test('verification page displays correct elements', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Navigate to verification page
            await page.goto('/arena/verify-email');
            
            // Check all UI elements are present
            await expect(page.locator('text=Email Verification Required')).toBeVisible();
            await expect(page.locator('text=Back to Dashboard')).toBeVisible();
            await expect(page.locator('button:has-text("Resend Verification Email")')).toBeVisible();
            await expect(page.locator('button:has-text("I\'ve Verified - Refresh")')).toBeVisible();
            
            // Check instructions are present
            await expect(page.locator('text=Check your inbox')).toBeVisible();
            await expect(page.locator('text=Click the verification link')).toBeVisible();
        });

        test('back to dashboard link works', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Navigate to verification page
            await page.goto('/arena/verify-email');
            
            // Click back to dashboard
            await page.click('text=Back to Dashboard');
            
            // Should be on dashboard
            await expect(page).toHaveURL(/\/dashboard/);
        });

        test('refresh button reloads the page', async ({ page }) => {
            // Login as unverified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', UNVERIFIED_USER.email);
            await page.fill('input[name="password"]', UNVERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard|verify/, { timeout: 15000 });
            
            // Navigate to verification page
            await page.goto('/arena/verify-email');
            
            // Get current URL before click
            const urlBefore = page.url();
            
            // Click refresh button
            await page.click('button:has-text("I\'ve Verified - Refresh")');
            
            // Page should reload (URL stays same but page reloads)
            await page.waitForLoadState('domcontentloaded');
            
            // Still on verification page (user is still unverified)
            await expect(page).toHaveURL(/\/arena\/verify-email/);
        });
    });

    test.describe('Verified User Access', () => {
        
        test('verified user can access /arena/modes', async ({ page }) => {
            // Login as verified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', VERIFIED_USER.email);
            await page.fill('input[name="password"]', VERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard/, { timeout: 15000 });
            
            // Navigate to arena modes
            await page.goto('/arena/modes');
            
            // Wait for page to fully stabilize
            await page.waitForLoadState('networkidle');
            
            // Should stay on arena modes (not redirected)
            await expect(page).toHaveURL(/\/arena\/modes/);
            
            // Verify arena content is visible - look for FLASHARENA heading or mode cards
            const arenaContent = page.locator('h1:has-text("FLASHARENA")').or(
                page.getByRole('button', { name: /Find Match/ })
            ).or(
                page.locator('[data-testid^="operation-button-"]').first()
            );
            await expect(arenaContent).toBeVisible({ timeout: 10000 });
        });

        test('verified user can access /arena/teams/setup', async ({ page }) => {
            // Login as verified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', VERIFIED_USER.email);
            await page.fill('input[name="password"]', VERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard/, { timeout: 15000 });
            
            // Navigate to team setup
            await page.goto('/arena/teams/setup?mode=5v5');
            
            // Should stay on team setup (not redirected)
            await expect(page).toHaveURL(/\/arena\/teams\/setup/);
        });

        test('verified user visiting /arena/verify-email is redirected to modes', async ({ page }) => {
            // Login as verified user
            await page.goto('/auth/login');
            await page.fill('input[name="email"]', VERIFIED_USER.email);
            await page.fill('input[name="password"]', VERIFIED_USER.password);
            await page.click('button[type="submit"]');
            
            await page.waitForURL(/dashboard/, { timeout: 15000 });
            
            // Try to access verification page directly
            await page.goto('/arena/verify-email');
            
            // Should be redirected to arena modes (already verified)
            await expect(page).toHaveURL(/\/arena\/modes/);
        });
    });

    test.describe('Unauthenticated Access', () => {
        
        test('unauthenticated user is redirected to login from /arena/modes', async ({ page }) => {
            // Try to access arena modes without logging in
            await page.goto('/arena/modes');
            
            // Should be redirected to login
            await expect(page).toHaveURL(/\/auth\/login/);
        });

        test('unauthenticated user is redirected to login from /arena/verify-email', async ({ page }) => {
            // Try to access verification page without logging in
            await page.goto('/arena/verify-email');
            
            // Should be redirected to login
            await expect(page).toHaveURL(/\/auth\/login/);
        });
    });
});
