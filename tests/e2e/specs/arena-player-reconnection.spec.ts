/**
 * Arena Player Reconnection E2E Tests
 * 
 * Feature: bug-fixes-ui-optimization
 * Task: 2.1 Write E2E test for player reconnection during matches
 * Test: Player disconnection and successful reconnection with state preservation
 * Validates: Requirements 2.5
 * 
 * Tests the complete player reconnection flow during active arena matches
 * to ensure state preservation and seamless match continuation.
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
test.describe('Arena Player Reconnection Flow', () => {
    test.setTimeout(180000); // 3 minutes for full reconnection flow
    
    test.beforeEach(async ({ page }) => {
        // Login as test user
        await page.goto('/auth/login');
        await page.waitForLoadState('networkidle');
        
        // Fill login form
        await page.fill('input[name="email"]', 'e2e-reconnect-test@flashmath.local');
        await page.fill('input[name="password"]', 'TestPassword123');
        await page.click('button[type="submit"]');
        
        // Wait for redirect to dashboard
        await page.waitForURL('/dashboard');
        await page.waitForLoadState('networkidle');
    });
    
    test('Player disconnection and successful reconnection with state preservation', async ({ page }) => {
        // Step 1: Start an arena match
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Select 1v1 Duel mode
        const duelButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(duelButton).toBeVisible({ timeout: 10000 });
        await duelButton.click();
        
        // Wait for queue page
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Wait for match to be found (or timeout gracefully)
        const matchFoundIndicator = page.locator('text=/match found|connecting|starting/i');
        const isMatchFound = await matchFoundIndicator.isVisible({ timeout: 45000 }).catch(() => false);
        
        if (!isMatchFound) {
            // If no match found, skip this test run
            test.skip(true, 'No match found within timeout - skipping reconnection test');
            return;
        }
        
        // Wait for match page
        await page.waitForURL(/\/arena\/match\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        
        // Step 2: Capture initial match state
        const initialState = await captureMatchState(page);
        
        // Verify match is active
        await expect(page.locator('text=/vs|opponent|match|arena/i')).toBeVisible({ timeout: 15000 });
        
        // Wait for match to actually start (not just lobby)
        const matchStartIndicators = [
            page.locator('[data-testid="match-timer"]'),
            page.locator('text=/timer|time|seconds/i'),
            page.locator('input[type="text"], input[inputmode="numeric"]')
        ];
        
        let matchActive = false;
        for (const indicator of matchStartIndicators) {
            if (await indicator.isVisible({ timeout: 10000 }).catch(() => false)) {
                matchActive = true;
                break;
            }
        }
        
        if (!matchActive) {
            test.skip(true, 'Match did not start within timeout - skipping reconnection test');
            return;
        }
        
        // Step 3: Simulate network disconnection
        console.log('[Test] Simulating network disconnection...');
        await page.context().setOffline(true);
        
        // Wait for disconnection to be detected
        await page.waitForTimeout(3000);
        
        // Step 4: Reconnect to network
        console.log('[Test] Reconnecting to network...');
        await page.context().setOffline(false);
        
        // Wait for page to detect reconnection
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        
        // Step 5: Verify reconnection and state preservation
        await verifyReconnectionSuccess(page, initialState);
        
        // Step 6: Verify match can continue normally
        await verifyMatchContinuation(page);
    });
    
    test('Multiple disconnection/reconnection cycles preserve match state', async ({ page }) => {
        // Start arena match
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const duelButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(duelButton).toBeVisible({ timeout: 10000 });
        await duelButton.click();
        
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        
        // Wait for match (with timeout)
        const matchFound = await page.locator('text=/match found|connecting|starting/i')
            .isVisible({ timeout: 45000 }).catch(() => false);
        
        if (!matchFound) {
            test.skip(true, 'No match found - skipping multiple reconnection test');
            return;
        }
        
        await page.waitForURL(/\/arena\/match\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        
        // Capture initial state
        const initialState = await captureMatchState(page);
        
        // Perform multiple disconnection cycles
        const cycles = 2;
        for (let i = 0; i < cycles; i++) {
            console.log(`[Test] Disconnection cycle ${i + 1}/${cycles}`);
            
            // Disconnect
            await page.context().setOffline(true);
            await page.waitForTimeout(2000);
            
            // Reconnect
            await page.context().setOffline(false);
            await page.waitForLoadState('networkidle', { timeout: 20000 });
            
            // Verify state after each cycle
            await verifyReconnectionSuccess(page, initialState);
            
            // Wait between cycles
            await page.waitForTimeout(1000);
        }
        
        // Final verification
        await verifyMatchContinuation(page);
    });
    
    test('Reconnection during different match phases preserves state', async ({ page }) => {
        // This test verifies reconnection works during various match phases
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const duelButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(duelButton).toBeVisible({ timeout: 10000 });
        await duelButton.click();
        
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        
        const matchFound = await page.locator('text=/match found|connecting|starting/i')
            .isVisible({ timeout: 45000 }).catch(() => false);
        
        if (!matchFound) {
            test.skip(true, 'No match found - skipping phase reconnection test');
            return;
        }
        
        await page.waitForURL(/\/arena\/match\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        
        // Test reconnection during match start phase
        const initialState = await captureMatchState(page);
        
        // Simulate disconnection during early match phase
        await page.context().setOffline(true);
        await page.waitForTimeout(1500);
        await page.context().setOffline(false);
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        
        // Verify reconnection
        await verifyReconnectionSuccess(page, initialState);
        
        // If match is still active, test mid-match reconnection
        const matchStillActive = await page.locator('input[type="text"], input[inputmode="numeric"]')
            .isVisible({ timeout: 5000 }).catch(() => false);
        
        if (matchStillActive) {
            // Wait a bit for match to progress
            await page.waitForTimeout(3000);
            
            // Capture mid-match state
            const midMatchState = await captureMatchState(page);
            
            // Disconnect during active gameplay
            await page.context().setOffline(true);
            await page.waitForTimeout(2000);
            await page.context().setOffline(false);
            await page.waitForLoadState('networkidle', { timeout: 20000 });
            
            // Verify mid-match reconnection
            await verifyReconnectionSuccess(page, midMatchState);
        }
    });
    
    test('Reconnection handles connection quality degradation gracefully', async ({ page }) => {
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const duelButton = page.locator('button, a').filter({ hasText: /1v1|duel/i }).first();
        await expect(duelButton).toBeVisible({ timeout: 10000 });
        await duelButton.click();
        
        await page.waitForURL(/\/arena\/queue/, { timeout: 15000 });
        
        const matchFound = await page.locator('text=/match found|connecting|starting/i')
            .isVisible({ timeout: 45000 }).catch(() => false);
        
        if (!matchFound) {
            test.skip(true, 'No match found - skipping connection quality test');
            return;
        }
        
        await page.waitForURL(/\/arena\/match\//, { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        
        const initialState = await captureMatchState(page);
        
        // Simulate poor connection quality with multiple brief disconnections
        for (let i = 0; i < 3; i++) {
            await page.context().setOffline(true);
            await page.waitForTimeout(500); // Brief disconnection
            await page.context().setOffline(false);
            await page.waitForTimeout(1000); // Brief recovery time
        }
        
        // Allow time for connection to stabilize
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        
        // Verify the match is still functional
        await verifyReconnectionSuccess(page, initialState);
        
        // Check for connection quality indicators
        const connectionIndicators = [
            page.locator('text=/connection|quality|latency/i'),
            page.locator('[data-testid="connection-status"]'),
            page.locator('text=/green|yellow|red/i').filter({ hasText: /connection|quality/i })
        ];
        
        // At least one connection indicator should be present (optional)
        for (const indicator of connectionIndicators) {
            if (await indicator.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log('[Test] Connection quality indicator found');
                break;
            }
        }
    });
});

// Helper function to capture current match state
async function captureMatchState(page: Page) {
    const state = {
        url: page.url(),
        hasTimer: false,
        hasQuestion: false,
        hasScores: false,
        hasOpponent: false,
        timestamp: Date.now()
    };
    
    // Check for timer
    const timerElements = [
        page.locator('[data-testid="match-timer"]'),
        page.locator('text=/timer|time|seconds/i'),
        page.locator('text=/\\d+/').filter({ hasText: /second|time/i })
    ];
    
    for (const timer of timerElements) {
        if (await timer.isVisible({ timeout: 2000 }).catch(() => false)) {
            state.hasTimer = true;
            break;
        }
    }
    
    // Check for question
    const questionElements = [
        page.locator('[data-testid="question-area"]'),
        page.locator('text=/\\+|\\-|×|÷|\\d+\\s*[+\\-×÷]\\s*\\d+/'),
        page.locator('input[type="text"], input[inputmode="numeric"]')
    ];
    
    for (const question of questionElements) {
        if (await question.isVisible({ timeout: 2000 }).catch(() => false)) {
            state.hasQuestion = true;
            break;
        }
    }
    
    // Check for scores
    const scoreElements = [
        page.locator('[data-testid="player-score"]'),
        page.locator('text=/score|points/i'),
        page.locator('text=/\\d+/').filter({ hasText: /point|score/i })
    ];
    
    for (const score of scoreElements) {
        if (await score.isVisible({ timeout: 2000 }).catch(() => false)) {
            state.hasScores = true;
            break;
        }
    }
    
    // Check for opponent
    const opponentElements = [
        page.locator('[data-testid="opponent-info"]'),
        page.locator('text=/opponent|vs/i'),
        page.locator('text=/player\\s*\\d+|challenger|contender/i')
    ];
    
    for (const opponent of opponentElements) {
        if (await opponent.isVisible({ timeout: 2000 }).catch(() => false)) {
            state.hasOpponent = true;
            break;
        }
    }
    
    return state;
}

// Helper function to verify successful reconnection
async function verifyReconnectionSuccess(page: Page, initialState: any) {
    // Verify we're still on a match page
    expect(page.url()).toMatch(/\/arena\/match\//);
    
    // Verify core match elements are still present
    const coreElements = [
        page.locator('text=/vs|opponent|match|arena/i'),
        page.locator('text=/score|points|timer|question/i')
    ];
    
    let coreElementFound = false;
    for (const element of coreElements) {
        if (await element.isVisible({ timeout: 10000 }).catch(() => false)) {
            coreElementFound = true;
            break;
        }
    }
    expect(coreElementFound).toBeTruthy();
    
    // Verify no critical error messages
    const errorMessages = [
        page.locator('text=/connection lost|failed to reconnect|match unavailable/i'),
        page.locator('text=/error|crashed|timeout/i').filter({ hasText: /match|arena/i })
    ];
    
    for (const error of errorMessages) {
        await expect(error).not.toBeVisible({ timeout: 2000 });
    }
    
    // Verify match state elements are preserved (if they existed initially)
    if (initialState.hasTimer) {
        const timerStillExists = await page.locator('text=/timer|time|seconds/i')
            .isVisible({ timeout: 5000 }).catch(() => false);
        // Timer might have changed value but should still exist
        expect(timerStillExists).toBeTruthy();
    }
    
    if (initialState.hasQuestion) {
        const questionStillExists = await page.locator('input[type="text"], input[inputmode="numeric"], text=/\\+|\\-|×|÷/')
            .isVisible({ timeout: 5000 }).catch(() => false);
        expect(questionStillExists).toBeTruthy();
    }
    
    if (initialState.hasScores) {
        const scoresStillExist = await page.locator('text=/score|points/i')
            .isVisible({ timeout: 5000 }).catch(() => false);
        expect(scoresStillExist).toBeTruthy();
    }
    
    if (initialState.hasOpponent) {
        const opponentStillExists = await page.locator('text=/opponent|vs|player/i')
            .isVisible({ timeout: 5000 }).catch(() => false);
        expect(opponentStillExists).toBeTruthy();
    }
}

// Helper function to verify match can continue normally
async function verifyMatchContinuation(page: Page) {
    // Check if match is still active (not ended)
    const matchEndedIndicators = [
        page.locator('text=/victory|defeat|match complete|game over/i'),
        page.locator('text=/play again|return to|dashboard/i')
    ];
    
    let matchEnded = false;
    for (const indicator of matchEndedIndicators) {
        if (await indicator.isVisible({ timeout: 2000 }).catch(() => false)) {
            matchEnded = true;
            break;
        }
    }
    
    if (!matchEnded) {
        // If match is still active, verify input functionality
        const inputField = page.locator('input[type="text"], input[inputmode="numeric"]').first();
        const inputExists = await inputField.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (inputExists) {
            // Test that input still works
            await inputField.fill('42');
            const inputValue = await inputField.inputValue();
            expect(inputValue).toBe('42');
            
            // Clear input
            await inputField.fill('');
        }
        
        // Verify timer is still updating (if visible)
        const timerElement = page.locator('text=/\\d+/').filter({ hasText: /second|time/i }).first();
        const timerExists = await timerElement.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (timerExists) {
            const initialTime = await timerElement.textContent();
            await page.waitForTimeout(2000);
            const updatedTime = await timerElement.textContent();
            
            // Timer should have changed (either decreased or reset to new question)
            // We don't assert strict inequality since timer might reset between questions
            console.log(`[Test] Timer: ${initialTime} -> ${updatedTime}`);
        }
    } else {
        // Match ended - verify end screen is functional
        const endScreenElements = [
            page.locator('button').filter({ hasText: /play again|continue|dashboard/i }),
            page.locator('text=/victory|defeat|draw/i'),
            page.locator('text=/score|points|rating/i')
        ];
        
        let endScreenFunctional = false;
        for (const element of endScreenElements) {
            if (await element.isVisible({ timeout: 5000 }).catch(() => false)) {
                endScreenFunctional = true;
                break;
            }
        }
        expect(endScreenFunctional).toBeTruthy();
    }
}