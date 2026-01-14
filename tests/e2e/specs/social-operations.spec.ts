/**
 * Social Panel User Operations E2E Tests
 * 
 * Tests the social panel interactions:
 * - Opening/closing social panel
 * - Party creation from social panel
 * - Friend list visibility
 * - Party invite flow
 */

import { 
    multiUserTest as test, 
    expect,
} from '../fixtures/multi-user';
import { SocialPage } from '../pages';

test.describe('Social Panel Operations', () => {
    
    test.setTimeout(90000);
    
    test.describe('Social FAB', () => {
        
        test('Social FAB is visible on arena pages', async ({ team }) => {
            const { igl } = team;
            const socialPage = new SocialPage(igl.page);
            
            await igl.page.goto('/arena/modes');
            await igl.page.waitForLoadState('domcontentloaded');
            
            // VERIFY: Social FAB should be visible
            const fabVisible = await socialPage.isFabVisible();
            expect(fabVisible).toBeTruthy();
        });
        
        test('Clicking FAB opens social panel', async ({ team }) => {
            const { igl } = team;
            const socialPage = new SocialPage(igl.page);
            
            await igl.page.goto('/arena/modes');
            await igl.page.waitForLoadState('domcontentloaded');
            
            // OPERATION: Click FAB
            await socialPage.openPanel();
            
            // VERIFY: Panel content should be visible
            const panelContent = igl.page.locator('text=/friends|party|online/i').first();
            await expect(panelContent).toBeVisible({ timeout: 5000 });
        });
    });
    
    test.describe('Party Operations', () => {
        
        test('Can create party from social panel', async ({ team }) => {
            const { igl } = team;
            const socialPage = new SocialPage(igl.page);
            
            await igl.page.goto('/arena/modes');
            await igl.page.waitForLoadState('domcontentloaded');
            
            // Open panel
            await socialPage.openPanel();
            await igl.page.waitForTimeout(500);
            
            // Check if create party button exists
            const createVisible = await socialPage.createPartyButton.isVisible({ timeout: 3000 }).catch(() => false);
            
            if (createVisible) {
                // OPERATION: Create party
                await socialPage.createParty();
                
                // VERIFY: Should now be in party (leave button visible)
                const inParty = await socialPage.isInParty();
                expect(inParty).toBeTruthy();
            } else {
                // Already in party - verify leave button exists
                const inParty = await socialPage.isInParty();
                expect(inParty).toBeTruthy();
            }
        });
        
        test('Can leave party from social panel', async ({ team }) => {
            const { igl } = team;
            const socialPage = new SocialPage(igl.page);
            
            await igl.page.goto('/arena/modes');
            await igl.page.waitForLoadState('domcontentloaded');
            
            // Open panel
            await socialPage.openPanel();
            await igl.page.waitForTimeout(1000);
            
            // Create party if needed
            if (!await socialPage.isInParty()) {
                await socialPage.createParty();
                await igl.page.waitForTimeout(1000);
            }
            
            // Verify we're in party before leaving
            const wasInParty = await socialPage.isInParty();
            console.log(`[Test] Was in party before leave: ${wasInParty}`);
            
            // OPERATION: Leave party
            await socialPage.leaveParty();
            await igl.page.waitForTimeout(2000); // Wait for state refresh
            
            // Panel should still be open - check state directly
            // After leaving, the leave button should be gone
            const stillHasLeaveBtn = await socialPage.leavePartyButton.isVisible({ timeout: 3000 }).catch(() => false);
            console.log(`[Test] Leave button still visible: ${stillHasLeaveBtn}`);
            
            // VERIFY: Leave button should be gone (not in party anymore)
            // OR create button should appear
            const createVisible = await socialPage.createPartyButton.isVisible({ timeout: 5000 }).catch(() => false);
            console.log(`[Test] Create button visible: ${createVisible}`);
            
            expect(!stillHasLeaveBtn || createVisible).toBeTruthy();
        });
    });
    
    test.describe('Multi-User Social', () => {
        
        test('All players can open social panel', async ({ team }) => {
            for (const player of team.allPlayers) {
                const socialPage = new SocialPage(player.page);
                
                await player.page.goto('/arena/modes');
                await player.page.waitForLoadState('domcontentloaded');
                
                // VERIFY: FAB visible
                const fabVisible = await socialPage.isFabVisible();
                expect(fabVisible).toBeTruthy();
                
                // OPERATION: Open panel
                await socialPage.openPanel();
                
                // VERIFY: Panel opens
                const content = player.page.locator('text=/friends|party/i').first();
                const hasContent = await content.isVisible({ timeout: 5000 }).catch(() => false);
                expect(hasContent).toBeTruthy();
                
                // Close panel (press Escape)
                await player.page.keyboard.press('Escape');
            }
        });
    });
});

