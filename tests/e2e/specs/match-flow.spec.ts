import { test, expect } from '../fixtures/console-capture';
import { SetupPage, MatchPage } from '../pages';

/**
 * Match Flow E2E Tests
 * 
 * Tests the complete flow from setup to match gameplay
 * Console logs are automatically captured and attached to the report.
 * 
 * Prerequisites:
 * - User must be authenticated
 * - Server must be running with dev:server
 */

test.describe('Match Flow', () => {
    
    test.beforeEach(async ({ page }) => {
        // TODO: Add authentication setup
        // For now, these tests assume user is logged in via test fixtures
    });
    
    test('should navigate to team setup page', async ({ page }) => {
        await page.goto('/arena/teams/setup');
        
        // Should see setup page elements
        // Look for common elements that indicate setup page
        await expect(
            page.locator('text=5v5')
            .or(page.locator('text=VS AI'))
            .or(page.locator('[data-testid="vs-ai-button"]'))
        ).toBeVisible({ timeout: 10000 });
    });
    
    test.describe('VS AI Match', () => {
        
        test('should display AI difficulty options', async ({ page }) => {
            const setupPage = new SetupPage(page);
            await setupPage.goto();
            
            // Click VS AI button (may need to wait for page load)
            await page.click('text=VS AI', { timeout: 10000 }).catch(async () => {
                // Try alternative selector
                await page.click('[data-testid="vs-ai-button"]');
            });
            
            // Should show difficulty options
            await expect(
                page.locator('text=Easy')
                .or(page.locator('text=Medium'))
                .or(page.locator('text=Hard'))
            ).toBeVisible({ timeout: 5000 });
        });
        
        test.skip('should start AI match and reach strategy phase', async ({ page }) => {
            // This test requires full authentication and party setup
            // Skip until test infrastructure is complete
            
            const setupPage = new SetupPage(page);
            const matchPage = new MatchPage(page);
            
            await setupPage.goto();
            await setupPage.startAIMatch('easy');
            
            // Should navigate to match page
            await matchPage.verifyLoaded();
            
            // Should be in strategy phase
            const phase = await matchPage.getCurrentPhase();
            expect(['strategy', 'active']).toContain(phase);
        });
    });
    
    test.describe('Match Gameplay', () => {
        
        test.skip('should display question when active player', async ({ page }) => {
            // Requires active match
            const matchPage = new MatchPage(page);
            
            // Navigate to active match
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.waitForActivePhase();
            
            // If active player, should see question
            if (await matchPage.isActivePlayer()) {
                await expect(matchPage.questionText).toBeVisible();
                await expect(matchPage.answerInput).toBeVisible();
            }
        });
        
        test.skip('should submit answer and see result', async ({ page }) => {
            // Requires active match as active player
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.waitForActivePhase();
            
            if (await matchPage.isActivePlayer()) {
                // Submit correct answer
                const success = await matchPage.submitCorrectAnswer();
                expect(success).toBeTruthy();
                
                // Should see result indicator
                await expect(
                    matchPage.correctResult.or(matchPage.incorrectResult)
                ).toBeVisible({ timeout: 5000 });
            }
        });
    });
});

