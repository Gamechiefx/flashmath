import { test, expect } from '../fixtures/console-capture';
import { SetupPage, MatchPage } from '../pages';
import path from 'path';
import fs from 'fs';

// Load test credentials
function getCredentials() {
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
    return {
        primary: { email: 'e2e-primary@test.flashmath.local', password: 'TestPassword123' },
    };
}

// Login helper
async function login(page: any, credentials: { email: string; password: string }) {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);
    
    await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
    
    await page.waitForURL((url: URL) => !url.pathname.includes('/auth/login'), { timeout: 15000 });
}

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
        // Login before each test
        const creds = getCredentials();
        await login(page, creds.primary);
    });
    
    test('should navigate to team setup page', async ({ page }) => {
        await page.goto('/arena/teams/setup');
        await page.waitForLoadState('networkidle');
        
        // Should see setup page elements
        // The page shows "Start a 5v5 Party" heading and "Create Party" button
        // Use .first() since multiple elements may match
        await expect(
            page.getByRole('heading', { name: /5v5/i })
            .or(page.getByRole('button', { name: /create party/i }))
            .or(page.locator('text=Form Your Party'))
            .first()
        ).toBeVisible({ timeout: 10000 });
    });
    
    test.describe('VS AI Match', () => {
        
        // VS AI button only appears when in a party with all members ready
        // This test requires full party setup which is tested separately
        test.skip('should display AI difficulty options', async ({ page }) => {
            const setupPage = new SetupPage(page);
            await setupPage.goto();
            
            // First need to create a party and have all members ready
            // Then click VS AI button
            await page.click('text=VS AI', { timeout: 10000 }).catch(async () => {
                await page.click('[data-testid="vs-ai-button"]');
            });
            
            // Should show difficulty options
            await expect(
                page.locator('text=easy')
                .or(page.locator('text=medium'))
                .or(page.locator('text=hard'))
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

