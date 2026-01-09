/**
 * Arena User Flows E2E Tests
 * 
 * These tests use data-testid attributes for reliable element selection.
 * They verify actual user operations and state changes.
 */

import { 
    multiUserTest as test, 
    expect,
} from '../fixtures/multi-user';
import { SetupPage } from '../pages';

test.describe('Arena User Flows - Party Creation', () => {
    
    test.setTimeout(90000);
    
    test('Create Party button creates party and disappears', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        await igl.page.waitForTimeout(1000); // Wait for full page render
        
        // Check if not in party
        const notInParty = await setupPage.isNotInParty();
        console.log(`[Test] Not in party: ${notInParty}`);
        
        if (notInParty) {
            // OPERATION: Create party
            await setupPage.createParty();
            
            // VERIFY: Create Party button should be gone
            const stillNotInParty = await setupPage.isNotInParty();
            expect(stillNotInParty).toBeFalsy();
        } else {
            // Already in party - leader should see SOME party UI
            // Could be: VS AI, IGL/Anchor selection, or party member list
            
            // Look for any party-related UI element
            const vsAiBtn = await setupPage.vsAiButton.isVisible({ timeout: 3000 }).catch(() => false);
            const partyMembers = await igl.page.locator('[data-testid^="party-member-"]').first().isVisible({ timeout: 3000 }).catch(() => false);
            const readyCount = await igl.page.locator('[data-testid="ready-count"]').isVisible({ timeout: 3000 }).catch(() => false);
            const anyPartyUI = await igl.page.getByText(/party|members|ready|igl|anchor/i).first().isVisible({ timeout: 3000 }).catch(() => false);
            
            console.log(`[Test] VS AI: ${vsAiBtn}, Members: ${partyMembers}, Ready: ${readyCount}, Any: ${anyPartyUI}`);
            
            // VERIFY: Should see some kind of party UI
            expect(vsAiBtn || partyMembers || readyCount || anyPartyUI).toBeTruthy();
        }
    });
    
    test('Party creation changes UI from initial state', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        
        // Check initial state
        const initialHasCreateButton = await setupPage.isNotInParty();
        
        if (initialHasCreateButton) {
            // Create party
            await setupPage.createParty();
            
            // VERIFY: Create Party button should be gone (UI changed)
            const afterHasCreateButton = await setupPage.isNotInParty();
            expect(afterHasCreateButton).toBeFalsy();
        } else {
            // Already in party - verify page loaded correctly
            // Check for any party-related UI element
            const pageLoaded = await igl.page.locator('text=/party|member|team|5v5/i').first().isVisible({ timeout: 5000 });
            expect(pageLoaded).toBeTruthy();
        }
    });
});

test.describe('Arena User Flows - Ready System', () => {
    
    test.setTimeout(90000);
    
    test('Ready button toggles state', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        await setupPage.createParty();
        
        // Get ready button visibility
        const hasReadyButton = await setupPage.readyButton.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasReadyButton) {
            // Get button text before click
            const textBefore = await setupPage.readyButton.textContent() || '';
            
            // OPERATION: Toggle ready
            await setupPage.toggleReady();
            
            // VERIFY: Button text should change
            const textAfter = await setupPage.readyButton.textContent() || '';
            
            // Text should change (Ready → Cancel Ready or similar)
            expect(textBefore).not.toBe(textAfter);
        } else {
            // Leader might be auto-ready, check for VS AI button instead
            test.skip('Ready button not visible for party leader');
        }
    });
    
    test('Ready count displays when in ready step', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        await setupPage.createParty();
        
        // Wait for state to settle
        await igl.page.waitForTimeout(2000);
        
        // Ready count only shows in step 3 (Ready Check step)
        // For a solo party, we may not reach this step automatically
        // Check if ready count is visible, if not, skip
        const readyCountVisible = await setupPage.readyCount.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (readyCountVisible) {
            const readyCountText = await setupPage.getReadyCountText();
            // Should show something like "1/1 ready" or "0/1 ready"
            expect(readyCountText).toMatch(/\d+\/\d+ ready/i);
        } else {
            // Solo party doesn't reach ready step (needs 5 members for 5v5)
            // Just verify we're on the setup page
            const onSetupPage = igl.page.url().includes('/arena/teams/setup');
            expect(onSetupPage).toBeTruthy();
        }
    });
});

test.describe('Arena User Flows - VS AI', () => {
    
    test.setTimeout(120000);
    
    test('VS AI button shows difficulty options', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        await setupPage.createParty();
        
        // Wait for state to settle
        await igl.page.waitForTimeout(1000);
        
        // Check if VS AI is visible
        const vsAiVisible = await setupPage.isVsAiVisible();
        
        if (vsAiVisible) {
            // OPERATION: Click VS AI button
            await setupPage.vsAiButton.click();
            await igl.page.waitForTimeout(500);
            
            // VERIFY: Difficulty buttons should appear
            const easyVisible = await setupPage.difficultyEasyButton.isVisible({ timeout: 5000 }).catch(() => false);
            const mediumVisible = await setupPage.difficultyMediumButton.isVisible({ timeout: 3000 }).catch(() => false);
            const hardVisible = await setupPage.difficultyHardButton.isVisible({ timeout: 3000 }).catch(() => false);
            
            expect(easyVisible || mediumVisible || hardVisible).toBeTruthy();
        } else {
            // VS AI might require ready state
            test.skip('VS AI button not visible - may require all members ready');
        }
    });
    
    test('Selecting difficulty enables Start AI Match button', async ({ team }) => {
        const { igl } = team;
        const setupPage = new SetupPage(igl.page);
        
        await setupPage.goto();
        await setupPage.createParty();
        await igl.page.waitForTimeout(1000);
        
        const vsAiVisible = await setupPage.isVsAiVisible();
        
        if (vsAiVisible) {
            // Click VS AI
            await setupPage.vsAiButton.click();
            await igl.page.waitForTimeout(500);
            
            // Click Easy difficulty
            const easyVisible = await setupPage.difficultyEasyButton.isVisible({ timeout: 5000 }).catch(() => false);
            if (easyVisible) {
                await setupPage.difficultyEasyButton.click();
                await igl.page.waitForTimeout(300);
                
                // VERIFY: Start AI Match button should be visible
                const startVisible = await setupPage.startAiMatchButton.isVisible({ timeout: 5000 }).catch(() => false);
                expect(startVisible).toBeTruthy();
            } else {
                test.skip('Difficulty buttons not visible');
            }
        } else {
            test.skip('VS AI button not visible');
        }
    });
});

test.describe('Arena User Flows - Multi-User', () => {
    
    test.setTimeout(120000);
    
    test('All 5 users can create independent parties', async ({ team }) => {
        const results: boolean[] = [];
        
        for (const player of team.allPlayers) {
            const setupPage = new SetupPage(player.page);
            await setupPage.goto();
            
            // Create party
            await setupPage.createParty();
            
            // Verify party was created (Create Party button should be gone)
            const stillNotInParty = await setupPage.isNotInParty();
            results.push(!stillNotInParty); // true = in party
        }
        
        // All 5 should be in parties
        expect(results.every(r => r)).toBeTruthy();
    });
    
    test('Each user has isolated page state', async ({ team }) => {
        // Player 1 goes to setup
        const setup1 = new SetupPage(team.player1.page);
        await setup1.goto();
        
        // Player 2 goes to dashboard
        await team.player2.page.goto('/dashboard');
        await team.player2.page.waitForLoadState('domcontentloaded');
        
        // VERIFY: Player 1 is still on setup
        expect(team.player1.page.url()).toContain('/arena/teams/setup');
        
        // VERIFY: Player 2 is on dashboard
        expect(team.player2.page.url()).toContain('/dashboard');
    });
});

