/**
 * Match Gameplay User Operations E2E Tests
 * 
 * Tests in-match operations:
 * - Question display and answer submission
 * - Answer result feedback
 * - IGL controls (Double Call-In, Timeout)
 * - Phase transitions
 * 
 * Note: These tests require an active match to be meaningful.
 * They use data-testid selectors for reliable element identification.
 */

import { test, expect } from '../fixtures/console-capture';
import { MatchPage, SetupPage } from '../pages';

test.describe('Match Gameplay Operations', () => {
    
    test.setTimeout(180000);
    
    test.describe('Question UI', () => {
        
        test.skip('question text displays when active player', async ({ page }) => {
            // This test requires navigating to an active match as the active player
            const matchPage = new MatchPage(page);
            
            // Navigate to a test match (would need real match ID)
            await page.goto('/arena/teams/match/test-match-id');
            
            // Wait for match to load
            await matchPage.verifyLoaded();
            
            // If active player, question should be visible
            if (await matchPage.isActivePlayer()) {
                const questionText = await matchPage.getQuestionText();
                expect(questionText).toBeTruthy();
                expect(questionText).toMatch(/\d+\s*[+\-×÷]\s*\d+/);
            }
        });
        
        test.skip('answer input accepts numeric input', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            if (await matchPage.isActivePlayer()) {
                // OPERATION: Type into answer input
                await matchPage.answerInput.fill('42');
                
                // VERIFY: Input has value
                const value = await matchPage.answerInput.inputValue();
                expect(value).toBe('42');
            }
        });
        
        test.skip('submitting answer shows result', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            if (await matchPage.isActivePlayer()) {
                // Submit answer
                await matchPage.submitAnswer('42');
                
                // VERIFY: Should see result (correct or incorrect)
                const gotResult = await matchPage.waitForAnswerResult();
                expect(gotResult !== null).toBeTruthy();
            }
        });
        
        test.skip('correct answer shows green result', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            if (await matchPage.isActivePlayer()) {
                // Calculate and submit correct answer
                const success = await matchPage.submitCorrectAnswer();
                
                if (success) {
                    // VERIFY: Should see correct result
                    await expect(matchPage.correctResult).toBeVisible({ timeout: 5000 });
                }
            }
        });
    });
    
    test.describe('IGL Controls', () => {
        
        test.skip('IGL sees control panel during break', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            // Wait for break phase
            await matchPage.waitForPhase('break', 120000);
            
            // VERIFY: IGL should see controls
            if (await matchPage.isIGL()) {
                await expect(matchPage.iglControlsPanel).toBeVisible({ timeout: 5000 });
            }
        });
        
        test.skip('Double Call-In button shows slot selection', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            if (await matchPage.isIGL() && await matchPage.isDoubleCallinAvailable()) {
                // OPERATION: Click Double Call-In
                await matchPage.doubleCallinButton.click();
                await page.waitForTimeout(500);
                
                // VERIFY: Slot selection panel appears
                await expect(matchPage.slotSelectionPanel).toBeVisible({ timeout: 5000 });
            }
        });
        
        test.skip('Timeout button calls timeout', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            if (await matchPage.isIGL() && await matchPage.isTimeoutAvailable()) {
                // OPERATION: Click Timeout
                await matchPage.callTimeout();
                
                // VERIFY: Should see timeout indicator or confirmation
                // (This would require a testid on the timeout confirmation)
                await page.waitForTimeout(1000);
            }
        });
    });
    
    test.describe('Phase Transitions', () => {
        
        test.skip('phase indicator shows current phase', async ({ page }) => {
            const matchPage = new MatchPage(page);
            
            await page.goto('/arena/teams/match/test-match-id');
            await matchPage.verifyLoaded();
            
            const phase = await matchPage.getCurrentPhase();
            expect(['strategy', 'active', 'break', 'halftime', 'post_match']).toContain(phase);
        });
    });
});

test.describe('VS AI Match Flow - Integration', () => {
    
    test.setTimeout(300000); // 5 minutes for full match
    
    test.skip('full VS AI match flow from setup to completion', async ({ page }) => {
        // This test goes through the complete flow:
        // 1. Create party
        // 2. Ready up
        // 3. Start VS AI match
        // 4. Complete strategy phase
        // 5. Answer questions
        // 6. Complete match
        
        const setupPage = new SetupPage(page);
        const matchPage = new MatchPage(page);
        
        // Navigate to setup
        await setupPage.goto();
        
        // Create party
        await setupPage.createParty();
        
        // Toggle ready
        await setupPage.toggleReady();
        
        // Start AI match (if available)
        if (await setupPage.isVsAiVisible()) {
            await setupPage.startAIMatch('easy');
            
            // Wait for match to load
            await matchPage.verifyLoaded();
            
            // Log phase
            const phase = await matchPage.getCurrentPhase();
            console.log(`Match started in phase: ${phase}`);
        }
    });
});


