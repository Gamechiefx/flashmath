/**
 * Authenticated User Flow E2E Tests
 * 
 * Tests that require a logged-in user.
 * Uses dynamically created test accounts (setup in global-setup.ts).
 */

import { test, expect } from '../fixtures/console-capture';
import path from 'path';
import fs from 'fs';

// Load test credentials
function getCredentials() {
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    if (fs.existsSync(credentialsPath)) {
        const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
        console.log('[Test] Loaded credentials from file:', Object.keys(creds));
        return creds;
    }
    console.log('[Test] Using fallback credentials');
    return {
        primary: { email: 'e2e-primary@test.flashmath.local', password: 'TestPassword123' },
        secondary: { email: 'e2e-secondary@test.flashmath.local', password: 'TestPassword123' },
        igl: { email: 'e2e-igl@test.flashmath.local', password: 'TestPassword123' },
    };
}

// Login helper
async function login(page: any, credentials: { email: string; password: string }) {
    console.log(`[Login] Attempting login with: ${credentials.email}`);
    
    await page.goto('/auth/login');
    
    // Wait for the form to be ready
    await page.waitForLoadState('networkidle');
    
    // Use name attributes which are reliable
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);
    
    console.log('[Login] Filled credentials, clicking SIGN IN');
    
    // Click the main SIGN IN button (not Google)
    await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
    
    // Wait for navigation or error
    await page.waitForURL((url: URL) => !url.pathname.includes('/auth/login'), { timeout: 15000 }).catch(async () => {
        // Check for error message if still on login page
        const errorText = await page.locator('.text-red-500').textContent().catch(() => 'Unknown error');
        console.log(`[Login] Failed - still on login page. Error: ${errorText}`);
        throw new Error(`Login failed: ${errorText}`);
    });
    
    console.log(`[Login] Success - redirected to: ${page.url()}`);
}

test.describe('Authenticated User Flow', () => {
    
    test('should login with test account and see dashboard', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        
        // Should be redirected away from login
        expect(page.url()).not.toContain('/auth/login');
        
        // Should see some indication of being logged in (dashboard, home, or arena)
        const validDestinations = ['/dashboard', '/home', '/arena', '/'];
        const currentPath = new URL(page.url()).pathname;
        
        const isValidDestination = validDestinations.some(dest => 
            currentPath === dest || currentPath.startsWith(dest + '/')
        );
        
        expect(isValidDestination || currentPath === '/').toBeTruthy();
    });
    
    test('should access arena modes page when logged in', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        
        // Navigate to arena modes
        await page.goto('/arena/modes');
        
        // Should see mode selection UI
        const modeElements = page.locator('text=/1v1|5v5|Team|Duel|Arena/i');
        await expect(modeElements.first()).toBeVisible({ timeout: 10000 });
    });
    
    test('should display social FAB when logged in', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        await page.goto('/arena/modes');
        
        // Look for social panel button - actual button says "Open social panel"
        const socialFab = page.getByRole('button', { name: /open social panel/i })
            .or(page.locator('[data-testid="social-fab"]'))
            .or(page.locator('button').filter({ hasText: /social/i }));
        
        // Should be visible somewhere on the page
        await expect(socialFab.first()).toBeVisible({ timeout: 10000 });
    });
    
    test('should access team setup page when logged in', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        
        // Navigate to team setup
        await page.goto('/arena/teams/setup');
        
        // Should not redirect to login
        await page.waitForLoadState('networkidle');
        expect(page.url()).not.toContain('/auth/login');
        
        // Should see setup page elements or party-related UI
        const setupElements = page.locator('text=/Team|Party|Setup|Create|5v5|VS AI/i');
        await expect(setupElements.first()).toBeVisible({ timeout: 10000 });
    });
    
    test('should display user info or menu when logged in', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        await page.goto('/dashboard');
        
        // Should see user-related elements
        const userElements = page.locator('text=/E2E-Primary|Level|XP|Profile/i')
            .or(page.locator('[data-testid="user-info"]'))
            .or(page.locator('[aria-label*="user"], [aria-label*="profile"]'));
        
        await expect(userElements.first()).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Party System UI', () => {
    
    test('should be able to create a party', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        await page.goto('/arena/modes');
        
        // Open social panel (click FAB or party button)
        const socialTrigger = page.locator('button').filter({ hasText: /party|friends|social/i }).first();
        await socialTrigger.click().catch(() => {
            // Try clicking any FAB-like button
            return page.locator('button.fixed').first().click();
        });
        
        // Look for create party button or indication we're already in party
        const createPartyBtn = page.locator('button:has-text("Create Party")');
        const alreadyInParty = page.locator('text=/Leave Party|Your Party|Party Leader/i');
        
        // Wait for either state
        await Promise.race([
            expect(createPartyBtn).toBeVisible({ timeout: 5000 }),
            expect(alreadyInParty.first()).toBeVisible({ timeout: 5000 }),
        ]).catch(() => {
            // If neither visible, that's still useful info
        });
        
        // Verify we're in party-related UI
        const isCreateVisible = await createPartyBtn.isVisible();
        const isInParty = await alreadyInParty.first().isVisible();
        
        expect(isCreateVisible || isInParty).toBeTruthy();
    });
});

test.describe('Arena Navigation', () => {
    
    test('should navigate through arena mode selection', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        await page.goto('/arena/modes');
        
        // Wait for page to fully stabilize (React hydration + network requests)
        await page.waitForLoadState('networkidle');
        
        // Additional wait for React components to settle
        await page.waitForTimeout(1000);
        
        // First, we need to see the mode cards (1v1, 2v2, etc.)
        // The 1v1 mode card should be visible
        const modeCards = page.locator('[data-testid*="mode-card"], .aspect-\\[4\\/5\\], h3:has-text("1v1")');
        await expect(modeCards.first()).toBeVisible({ timeout: 10000 });
        
        // Click on the 1v1 mode card to select it (operation buttons only show when mode is selected)
        const soloModeCard = page.locator('h3:has-text("1v1")').first();
        const cardExists = await soloModeCard.isVisible({ timeout: 2000 }).catch(() => false);
        
        if (cardExists) {
            await soloModeCard.click();
            await page.waitForTimeout(500);
        }
        
        // Now operation buttons should be visible (only for non-team modes when selected)
        const operationButtons = page.locator('[data-testid^="operation-button-"]');
        
        // At least one operation should be selectable
        await expect(operationButtons.first()).toBeVisible({ timeout: 15000 });
        
        // Wait a moment for any animations to complete
        await page.waitForTimeout(500);
        
        // Click on the addition operation using force to bypass stability check
        const addButton = page.locator('[data-testid="operation-button-addition"]');
        await addButton.click({ force: true });
        
        // Should update selection (button style should change or become selected)
        await page.waitForTimeout(500);
        
        // Verify button is now selected (has white/active styling)
        await expect(addButton).toHaveClass(/bg-white/, { timeout: 5000 });
    });
    
    test('should show rank FAB on arena page', async ({ page }) => {
        const creds = getCredentials();
        await login(page, creds.primary);
        await page.goto('/arena/modes');
        
        // Look for rank/trophy FAB
        const rankFab = page.locator('[data-testid="rank-fab"]')
            .or(page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: /rank|trophy/i }))
            .or(page.locator('button.fixed').filter({ has: page.locator('text=/ELO|Rank/i') }));
        
        // Should be visible (either collapsed or expanded)
        await expect(rankFab.first()).toBeVisible({ timeout: 10000 }).catch(async () => {
            // Might be in trophy icon form
            const trophyIcon = page.locator('svg.lucide-trophy, [data-lucide="trophy"]');
            await expect(trophyIcon.first()).toBeVisible({ timeout: 5000 });
        });
    });
});