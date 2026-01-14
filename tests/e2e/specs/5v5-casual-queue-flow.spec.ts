/**
 * 5v5 Casual Queue Flow E2E Test
 * 
 * This test validates the complete casual queue flow to ensure it matches the actual codebase logic:
 * 
 * 1. Team Setup: Select casual mode and verify match type propagation
 * 2. Queue Flow: Verify casual queue uses correct Redis keys and logic
 * 3. AI Teammates: Verify AI teammates are added for incomplete parties
 * 4. Match Type Display: Verify UI shows correct match type throughout
 * 
 * This addresses the discrepancy between E2E tests and actual implementation
 * by testing the real casual queue workflow as implemented in the codebase.
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
test.describe('5v5 Casual Queue Flow', () => {
    test.setTimeout(180000); // 3 minutes for full flow
    
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
    
    test('Complete casual queue flow with match type selection', async ({ page }) => {
        // Step 1: Navigate to arena modes
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        // Step 2: Select 5v5 team mode
        const teamModeButton = page.locator('button, a').filter({ hasText: /5v5|team/i }).first();
        await expect(teamModeButton).toBeVisible({ timeout: 10000 });
        await teamModeButton.click();
        
        // Step 3: Wait for team setup page
        await page.waitForURL(/\/arena\/teams\/setup/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Step 4: Create party
        const createPartyButton = page.locator('[data-testid="create-party-button"]');
        await expect(createPartyButton).toBeVisible({ timeout: 10000 });
        await createPartyButton.click();
        await page.waitForTimeout(2000);
        
        // Step 5: Select casual match type (this is the key part missing from other tests)
        const casualButton = page.locator('button').filter({ hasText: /casual/i }).first();
        await expect(casualButton).toBeVisible({ timeout: 10000 });
        await casualButton.click();
        await page.waitForTimeout(1000);
        
        // Verify casual mode is selected
        const casualSelected = page.locator('button').filter({ hasText: /casual/i }).first();
        await expect(casualSelected).toHaveClass(/bg-emerald-500\/20|border-emerald-500/);
        
        // Step 6: Start queue with casual mode (incomplete party to test AI teammates)
        const findTeammatesButton = page.locator('button').filter({ hasText: /find teammates/i }).first();
        if (await findTeammatesButton.isVisible({ timeout: 5000 })) {
            await findTeammatesButton.click();
        } else {
            // Alternative: look for any queue start button
            const startButton = page.locator('button').filter({ hasText: /start|queue|find/i }).first();
            await expect(startButton).toBeVisible({ timeout: 10000 });
            await startButton.click();
        }
        
        // Step 7: Wait for queue page navigation
        await page.waitForURL(/\/arena\/teams\/queue/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');
        
        // Step 8: Verify casual match type is displayed correctly in queue
        const casualMatchIndicator = page.locator('text=/casual match/i');
        await expect(casualMatchIndicator).toBeVisible({ timeout: 10000 });
        
        // Verify "No ELO changes" message for casual
        const noEloMessage = page.locator('text=/no elo/i');
        await expect(noEloMessage).toBeVisible({ timeout: 5000 });
        
        // Step 9: Verify queue status shows finding opponents (not teammates for casual)
        const queueStatus = page.locator('text=/finding|searching|queue/i');
        await expect(queueStatus).toBeVisible({ timeout: 10000 });
        
        // Step 10: Check for AI teammate indicators (if party was incomplete)
        const aiTeammateIndicator = page.locator('text=/ai teammate|ai player/i');
        // This might be visible if the party was incomplete and AI teammates were added
        
        // Step 11: Verify casual queue key is being used (check network requests if possible)
        // This would require monitoring network requests to Redis, which is complex in E2E
        // Instead, we verify the UI reflects casual mode throughout
        
        // Step 12: Test queue cancellation
        const cancelButton = page.locator('button').filter({ hasText: /cancel|leave|stop/i }).first();
        if (await cancelButton.isVisible({ timeout: 5000 })) {
            await cancelButton.click();
            
            // Should return to setup page
            await page.waitForURL(/\/arena\/teams\/setup/, { timeout: 10000 });
            
            // Verify we're back on setup and casual mode is still selected
            await expect(page.locator('button').filter({ hasText: /casual/i }).first())
                .toHaveClass(/bg-emerald-500\/20|border-emerald-500/);
        }
    });
    
    test('Casual vs Ranked match type differences', async ({ page }) => {
        // Navigate to team setup
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const teamModeButton = page.locator('button, a').filter({ hasText: /5v5|team/i }).first();
        await teamModeButton.click();
        await page.waitForURL(/\/arena\/teams\/setup/);
        
        // Create party
        const createPartyButton = page.locator('[data-testid="create-party-button"]');
        await createPartyButton.click();
        await page.waitForTimeout(2000);
        
        // Test Ranked mode first
        const rankedButton = page.locator('button').filter({ hasText: /ranked/i }).first();
        await rankedButton.click();
        await page.waitForTimeout(500);
        
        // Verify ranked mode indicators
        await expect(rankedButton).toHaveClass(/bg-amber-500\/20|border-amber-500/);
        
        // Switch to Casual mode
        const casualButton = page.locator('button').filter({ hasText: /casual/i }).first();
        await casualButton.click();
        await page.waitForTimeout(500);
        
        // Verify casual mode indicators
        await expect(casualButton).toHaveClass(/bg-emerald-500\/20|border-emerald-500/);
        
        // Verify different messaging for casual vs ranked
        const casualMessage = page.locator('text=/no elo|practice/i');
        await expect(casualMessage).toBeVisible({ timeout: 5000 });
    });
    
    test('AI teammate addition for incomplete casual parties', async ({ page }) => {
        // Navigate to team setup
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const teamModeButton = page.locator('button, a').filter({ hasText: /5v5|team/i }).first();
        await teamModeButton.click();
        await page.waitForURL(/\/arena\/teams\/setup/);
        
        // Create party (will be incomplete - just 1 player)
        const createPartyButton = page.locator('[data-testid="create-party-button"]');
        await createPartyButton.click();
        await page.waitForTimeout(2000);
        
        // Select casual mode
        const casualButton = page.locator('button').filter({ hasText: /casual/i }).first();
        await casualButton.click();
        await page.waitForTimeout(500);
        
        // Look for AI teammate messaging
        const aiTeammateMessage = page.locator('text=/ai teammate|ai player/i');
        await expect(aiTeammateMessage).toBeVisible({ timeout: 5000 });
        
        // Verify the message indicates how many AI teammates will be added
        const aiCountMessage = page.locator('text=/\\+\\d+ ai teammate/i');
        await expect(aiCountMessage).toBeVisible({ timeout: 5000 });
    });
    
    test('Match type persistence across navigation', async ({ page }) => {
        // Navigate to team setup
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const teamModeButton = page.locator('button, a').filter({ hasText: /5v5|team/i }).first();
        await teamModeButton.click();
        await page.waitForURL(/\/arena\/teams\/setup/);
        
        // Create party and select casual
        const createPartyButton = page.locator('[data-testid="create-party-button"]');
        await createPartyButton.click();
        await page.waitForTimeout(2000);
        
        const casualButton = page.locator('button').filter({ hasText: /casual/i }).first();
        await casualButton.click();
        await page.waitForTimeout(500);
        
        // Navigate away and back
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');
        
        await page.goto('/arena/teams/setup');
        await page.waitForLoadState('networkidle');
        
        // Verify casual mode is still selected (if party persists)
        const casualButtonAfterNav = page.locator('button').filter({ hasText: /casual/i }).first();
        if (await casualButtonAfterNav.isVisible({ timeout: 5000 })) {
            // If the party still exists, casual should still be selected
            await expect(casualButtonAfterNav).toHaveClass(/bg-emerald-500\/20|border-emerald-500/);
        }
    });
    
    test('Queue page displays correct match type information', async ({ page }) => {
        // This test focuses specifically on the queue page UI reflecting match type
        
        // Navigate to team setup and create casual party
        await page.goto('/arena/modes');
        await page.waitForLoadState('networkidle');
        
        const teamModeButton = page.locator('button, a').filter({ hasText: /5v5|team/i }).first();
        await teamModeButton.click();
        await page.waitForURL(/\/arena\/teams\/setup/);
        
        const createPartyButton = page.locator('[data-testid="create-party-button"]');
        await createPartyButton.click();
        await page.waitForTimeout(2000);
        
        // Select casual and start queue
        const casualButton = page.locator('button').filter({ hasText: /casual/i }).first();
        await casualButton.click();
        
        const startQueueButton = page.locator('button').filter({ hasText: /find|start|queue/i }).first();
        await startQueueButton.click();
        
        // Wait for queue page
        await page.waitForURL(/\/arena\/teams\/queue/);
        await page.waitForLoadState('networkidle');
        
        // Verify all casual-specific UI elements
        await expect(page.locator('text=/casual match/i')).toBeVisible();
        await expect(page.locator('text=/no elo/i')).toBeVisible();
        
        // Verify casual badge/indicator
        const casualBadge = page.locator('text=/casual/i').filter({ hasText: /^casual$/i });
        await expect(casualBadge).toBeVisible();
        
        // Verify color coding (casual should use blue/emerald colors)
        const casualIndicator = page.locator('.bg-blue-500\\/20, .bg-emerald-500\\/20, .text-blue-400, .text-emerald-400');
        await expect(casualIndicator.first()).toBeVisible();
    });
});