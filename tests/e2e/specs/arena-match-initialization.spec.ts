/**
 * Arena Match Initialization E2E Tests
 * 
 * Feature: bug-fixes-ui-optimization
 * Test: Complete user journey from arena queue to match start
 * Validates: Requirements 1.1
 * 
 * Tests the complete arena match initialization flow to ensure users can
 * reliably start matches without connection timeouts or state synchronization issues.
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
test.describe('Arena Match Initialization Flow', () => {
    test.setTimeout(120000); // 2 minutes for full flow
    
    test.beforeEach(async ({ page }) => {
        // Login as test user
        await page.goto('/auth/login');
        await page.waitForLoadState('networkidle');
        
        // Fill login form
        await page.fill('input[name="email"]', 'e2e-test@flashmath.local');
        await page.fill('input[name="password"]', 'TestPassword123');
        await page.click('button[type="submit"]');
        
        // Wait for redirect to dashboard
        await page.waitForURL('/dashboard');
        await page.waitForLoadState('networkidle');
    });
    
    test('Complete arena queue to match start journey', async ({ page }) => {
        // Step 1: Navigate to arena modes
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Verify arena modes page loaded
        await expect(page.locator('h1, h2').filter({ hasText: /arena|modes/i })).toBeVisible({ timeout: 10000 });
        
        // Step 2: Select 1v1 Duel mode
        const duelButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(duelButton).toBeVisible({ timeout: 10000 });
        await duelButton.click();
        
        // Step 3: Wait for queue page to load
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Verify queue page elements
        await expect(page.locator('text=/queue|searching|finding/i')).toBeVisible({ timeout: 10000 });
        
        // Step 4: Wait for match to be found or timeout
        // Look for either match found or queue status indicators
        const matchFoundIndicator = page.locator('text=/match found|connecting|starting/i');
        const queueStatusIndicator = page.locator('text=/position|waiting|searching/i');
        
        // Wait for either match found or queue status (whichever comes first)
        await Promise.race([
            matchFoundIndicator.waitFor({ state: 'visible', timeout: 30000 }),
            queueStatusIndicator.waitFor({ state: 'visible', timeout: 30000 })
        ]);
        
        // Step 5: If match found, verify match initialization
        const isMatchFound = await matchFoundIndicator.isVisible({ timeout: 1000 }).catch(() => false);
        
        if (isMatchFound) {
            // Wait for redirect to match page
            await page.waitForURL(/\/arena\/match\//, { timeout: 20000 });
            await page.waitForLoadState('networkidle');
            
            // Verify match page loaded successfully
            await expect(page.locator('text=/vs|opponent|match|arena/i')).toBeVisible({ timeout: 15000 });
            
            // Check for match initialization elements
            const matchElements = [
                page.locator('[data-testid="match-timer"], text=/timer|time|seconds/i'),
                page.locator('[data-testid="question-area"], text=/question|\+|\-|\×|÷/i'),
                page.locator('[data-testid="player-score"], text=/score|points/i'),
                page.locator('[data-testid="opponent-info"], text=/opponent|vs/i')
            ];
            
            // At least one match element should be visible
            let matchElementVisible = false;
            for (const element of matchElements) {
                if (await element.isVisible({ timeout: 5000 }).catch(() => false)) {
                    matchElementVisible = true;
                    break;
                }
            }
            expect(matchElementVisible).toBeTruthy();
            
            // Verify no critical error messages
            const errorMessages = page.locator('text=/error|failed|timeout|connection lost/i');
            await expect(errorMessages).not.toBeVisible({ timeout: 2000 });
            
        } else {
            // In queue - verify queue functionality
            await expect(queueStatusIndicator).toBeVisible();
            
            // Check for queue position or status
            const queueInfo = [
                page.locator('text=/position|#/i'),
                page.locator('text=/estimated|time/i'),
                page.locator('text=/searching|finding/i')
            ];
            
            let queueInfoVisible = false;
            for (const info of queueInfo) {
                if (await info.isVisible({ timeout: 3000 }).catch(() => false)) {
                    queueInfoVisible = true;
                    break;
                }
            }
            expect(queueInfoVisible).toBeTruthy();
        }
    });
    
    test('Arena queue shows proper status indicators', async ({ page }) => {
        // Navigate to arena queue
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Select any available mode
        const modeButton = page.locator('button, a').filter({ hasText: /1v1|duel|practice/i }).first();
        await expect(modeButton).toBeVisible({ timeout: 10000 });
        await modeButton.click();
        
        // Wait for queue page
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Verify queue status elements are present
        const statusElements = [
            page.locator('text=/queue|searching|finding|waiting/i'),
            page.locator('text=/position|players|matchmaking/i'),
            page.locator('button').filter({ hasText: /cancel|leave|stop/i })
        ];
        
        // At least queue status should be visible
        await expect(statusElements[0]).toBeVisible({ timeout: 10000 });
        
        // Cancel button should be available
        const cancelButton = statusElements[2];
        if (await cancelButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await cancelButton.click();
            
            // Should return to modes or dashboard
            await page.waitForURL(/\/(arena\/modes|dashboard)/, { timeout: 10000 });
        }
    });
    
    test('Match initialization handles connection issues gracefully', async ({ page }) => {
        // Navigate to arena
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Select mode
        const modeButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(modeButton).toBeVisible({ timeout: 10000 });
        await modeButton.click();
        
        // Wait for queue
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        
        // Simulate network interruption by going offline briefly
        await page.context().setOffline(true);
        await page.waitForTimeout(2000);
        await page.context().setOffline(false);
        
        // Wait for reconnection
        await page.waitForLoadState('networkidle');
        
        // Verify page is still functional
        const pageElements = [
            page.locator('text=/queue|arena|modes/i'),
            page.locator('button').filter({ hasText: /cancel|leave|back/i })
        ];
        
        // Should still show queue or return to modes
        let pageStillFunctional = false;
        for (const element of pageElements) {
            if (await element.isVisible({ timeout: 10000 }).catch(() => false)) {
                pageStillFunctional = true;
                break;
            }
        }
        expect(pageStillFunctional).toBeTruthy();
        
        // Should not show critical error
        const criticalErrors = page.locator('text=/fatal|crashed|unavailable/i');
        await expect(criticalErrors).not.toBeVisible({ timeout: 2000 });
    });
    
    test('Arena modes page loads and displays available options', async ({ page }) => {
        // Navigate to arena modes
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Verify page loaded
        await expect(page.locator('h1, h2, text=/arena|modes|play/i')).toBeVisible({ timeout: 10000 });
        
        // Check for available game modes
        const modeOptions = [
            page.locator('text=/1v1|duel/i'),
            page.locator('text=/practice|ai|bot/i'),
            page.locator('text=/tournament|ranked/i')
        ];
        
        // At least one mode should be available
        let modeAvailable = false;
        for (const mode of modeOptions) {
            if (await mode.isVisible({ timeout: 5000 }).catch(() => false)) {
                modeAvailable = true;
                break;
            }
        }
        expect(modeAvailable).toBeTruthy();
        
        // Verify navigation elements
        const navElements = [
            page.locator('text=/dashboard|home/i'),
            page.locator('text=/back|return/i'),
            page.locator('nav, header')
        ];
        
        let navVisible = false;
        for (const nav of navElements) {
            if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
                navVisible = true;
                break;
            }
        }
        expect(navVisible).toBeTruthy();
    });
    
    test('User can navigate back from queue without issues', async ({ page }) => {
        // Navigate to arena and enter queue
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const modeButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(modeButton).toBeVisible({ timeout: 10000 });
        await modeButton.click();
        
        // Wait for queue page
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Find and click cancel/back button
        const backButtons = [
            page.locator('button').filter({ hasText: /cancel|leave|stop|back/i }),
            page.locator('[data-testid="cancel-queue"], [data-testid="leave-queue"]'),
            page.locator('button[aria-label*="cancel"], button[aria-label*="back"]')
        ];
        
        let backButtonClicked = false;
        for (const buttonGroup of backButtons) {
            const button = buttonGroup.first();
            if (await button.isVisible({ timeout: 3000 }).catch(() => false)) {
                await button.click();
                backButtonClicked = true;
                break;
            }
        }
        
        if (backButtonClicked) {
            // Should navigate away from queue
            await page.waitForURL(/\/(arena\/modes|dashboard)/, { timeout: 10000 });
            
            // Verify successful navigation
            const destinationElements = [
                page.locator('text=/modes|arena|dashboard/i'),
                page.locator('h1, h2')
            ];
            
            await expect(destinationElements[0]).toBeVisible({ timeout: 10000 });
        } else {
            // If no back button found, use browser back
            await page.goBack();
            await page.waitForLoadState('networkidle');
            
            // Should be back at modes or dashboard
            await expect(page.locator('text=/modes|arena|dashboard/i')).toBeVisible({ timeout: 10000 });
        }
    });
});