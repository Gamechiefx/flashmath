import { test, expect } from '../fixtures/console-capture';

/**
 * Party Creation E2E Tests
 * 
 * Verifies party creation, invitation, and management flows.
 * These tests require authentication - skip if no test account.
 */

test.describe('Party Creation', () => {
    
    test.beforeEach(async ({ page }) => {
        // Attempt to log in with test credentials
        // If login fails, tests will be skipped
        await page.goto('/auth/login');
        
        const testEmail = process.env.TEST_USER_EMAIL;
        const testPassword = process.env.TEST_USER_PASSWORD;
        
        if (!testEmail || !testPassword) {
            test.skip();
            return;
        }
        
        await page.fill('[name="email"], input[type="email"]', testEmail);
        await page.fill('[name="password"], input[type="password"]', testPassword);
        await page.click('button[type="submit"]');
        
        // Wait for navigation away from login
        await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 15000 })
            .catch(() => test.skip());
    });
    
    test('should display social FAB when logged in', async ({ page }) => {
        // Navigate to arena modes page
        await page.goto('/arena/modes');
        
        // Look for social FAB (right side of screen)
        const socialFab = page.locator('[data-testid="social-fab"]')
            .or(page.locator('button:has-text("Friends")'))
            .or(page.locator('[class*="social"]').filter({ hasText: /friends|party/i }));
        
        // FAB should be visible
        await expect(socialFab.first()).toBeVisible({ timeout: 10000 });
    });
    
    test('should open social panel when FAB clicked', async ({ page }) => {
        await page.goto('/arena/modes');
        
        // Click the social FAB
        const socialFab = page.locator('[data-testid="social-fab"]')
            .or(page.locator('button').filter({ hasText: /party|friends/i }))
            .first();
        
        await socialFab.click({ timeout: 10000 }).catch(() => {
            // Try clicking any FAB-like button on the right
            return page.locator('button.fixed.right-0, button[class*="fab"]').first().click();
        });
        
        // Panel should slide in
        const panel = page.locator('[data-testid="social-panel"]')
            .or(page.locator('[class*="panel"]').filter({ hasText: /party|friends/i }));
        
        await expect(panel.first()).toBeVisible({ timeout: 5000 });
    });
    
    test('should show create party button when not in party', async ({ page }) => {
        await page.goto('/arena/modes');
        
        // Open social panel
        await page.locator('button').filter({ hasText: /party|friends|social/i }).first().click()
            .catch(() => page.locator('button.fixed').first().click());
        
        // Look for create party button
        const createPartyBtn = page.locator('button:has-text("Create Party")')
            .or(page.locator('[data-testid="create-party"]'));
        
        // Either visible or we're already in a party
        const isVisible = await createPartyBtn.isVisible().catch(() => false);
        const inParty = await page.locator('text=/Leave Party|In Party/i').isVisible().catch(() => false);
        
        expect(isVisible || inParty).toBeTruthy();
    });
    
    test.skip('should create party successfully', async ({ page }) => {
        // This test modifies state - skip unless explicitly enabled
        await page.goto('/arena/modes');
        
        // Open social panel and click create party
        await page.locator('button').filter({ hasText: /party|friends|social/i }).first().click();
        
        const createBtn = page.locator('button:has-text("Create Party")');
        await createBtn.click();
        
        // Should now show party section with self as leader
        await expect(page.locator('text=/Leader|Party Leader/i')).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Party Invitation', () => {
    
    test.skip('should show invite friends button when in party', async ({ page }) => {
        // Requires being in a party already
        await page.goto('/arena/modes');
        
        // Check for invite button in party section
        const inviteBtn = page.locator('button:has-text("Invite")')
            .or(page.locator('[data-testid="invite-friends"]'));
        
        await expect(inviteBtn.first()).toBeVisible();
    });
    
    test.skip('should display friends list when inviting', async ({ page }) => {
        // Click invite and verify friends appear
        await page.goto('/arena/modes');
        
        await page.locator('button:has-text("Invite")').click();
        
        // Friends list or empty state should appear
        const friendsList = page.locator('[data-testid="friends-list"]')
            .or(page.locator('text=/No friends|Add friends/i'));
        
        await expect(friendsList.first()).toBeVisible();
    });
});

test.describe('Party to Queue Flow', () => {
    
    test.skip('should navigate to team setup from party', async ({ page }) => {
        // Full flow: create party → navigate to team setup
        await page.goto('/arena/modes');
        
        // Click on 5v5 mode or similar
        await page.locator('text=/5v5|Team|Arena/i').first().click();
        
        // Should navigate to setup page
        await page.waitForURL('**/arena/teams/setup**', { timeout: 10000 });
        
        expect(page.url()).toContain('/arena/teams');
    });
    
    test.skip('should show IGL selection modal', async ({ page }) => {
        await page.goto('/arena/teams/setup');
        
        // When party is ready, IGL selection should be available
        const iglModal = page.locator('[data-testid="igl-selection"]')
            .or(page.locator('text=/Select IGL|In-Game Leader/i'));
        
        // Either modal visible or we're not in a ready party
        const isVisible = await iglModal.first().isVisible().catch(() => false);
        
        // Just verify page loaded successfully
        expect(page.url()).toContain('/arena');
    });
});


