import { test, expect } from '@playwright/test';
import { MatchPage } from '../pages';

/**
 * IGL Abilities E2E Tests
 * 
 * Tests IGL-specific controls and abilities:
 * - Double Call-In
 * - Timeout
 * - Slot rotation
 */

test.describe('IGL Abilities', () => {
    
    test.describe('Strategy Phase', () => {
        
        test.skip('should display IGL controls panel for IGL', async ({ page }) => {
            // Requires active match as IGL
            const matchPage = new MatchPage(page);
            
            // Navigate to match as IGL
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.waitForStrategyPhase();
            
            if (await matchPage.isIGL()) {
                await expect(matchPage.iglControlsPanel).toBeVisible();
            }
        });
        
        test.skip('should allow IGL to confirm slot assignments', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.waitForStrategyPhase();
            
            if (await matchPage.isIGL()) {
                // Should see confirm button
                await expect(matchPage.confirmSlotsButton).toBeVisible();
                
                // Click confirm
                await matchPage.confirmSlots();
                
                // Should transition to active phase
                await matchPage.waitForActivePhase();
            }
        });
    });
    
    test.describe('Double Call-In', () => {
        
        test.skip('should display Double Call-In button for IGL', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            
            // Wait for a break or strategy phase
            await expect(
                matchPage.breakPhase.or(matchPage.strategyPhase)
            ).toBeVisible({ timeout: 120000 });
            
            if (await matchPage.isIGL()) {
                await expect(matchPage.doubleCallinButton).toBeVisible();
            }
        });
        
        test.skip('should show slot options when Double Call-In clicked', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.waitForStrategyPhase();
            
            if (await matchPage.isIGL()) {
                await matchPage.doubleCallinButton.click();
                
                // Should show slot selection options
                await expect(page.locator('[data-testid*="callin-slot"]')).toBeVisible();
            }
        });
    });
    
    test.describe('Timeout', () => {
        
        test.skip('should allow IGL to call timeout during break', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            
            // Wait for break phase
            await expect(matchPage.breakPhase).toBeVisible({ timeout: 180000 });
            
            if (await matchPage.isIGL()) {
                // Should see timeout button
                await expect(matchPage.timeoutButton).toBeVisible();
                
                // Click timeout
                await matchPage.callTimeout();
                
                // Timer should extend to ~60 seconds
                // This would need verification of timer display
            }
        });
    });
});

test.describe('Non-IGL Player', () => {
    
    test.skip('should NOT display IGL controls for non-IGL', async ({ page }) => {
        const matchPage = new MatchPage(page);
        
        // Navigate as non-IGL player
        await page.goto('/arena/teams/match/test-match-id');
        await matchPage.waitForStrategyPhase();
        
        if (!(await matchPage.isIGL())) {
            await expect(matchPage.iglControlsPanel).not.toBeVisible();
            await expect(matchPage.doubleCallinButton).not.toBeVisible();
            await expect(matchPage.timeoutButton).not.toBeVisible();
        }
    });
});

