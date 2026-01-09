import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Match Page (/arena/teams/match/[matchId])
 * 
 * Uses data-testid attributes for reliable element selection.
 */
export class MatchPage extends BasePage {
    // Phase indicators (dynamic testid based on phase)
    readonly phaseIndicator: (phase: string) => Locator;
    
    // IGL Controls
    readonly iglControlsPanel: Locator;
    readonly doubleCallinButton: Locator;
    readonly timeoutButton: Locator;
    readonly slotSelectionPanel: Locator;
    
    // Question UI
    readonly questionText: Locator;
    readonly answerInput: Locator;
    readonly submitAnswerButton: Locator;
    
    // Result indicators
    readonly correctResult: Locator;
    readonly incorrectResult: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // Phase indicator - dynamically select based on phase
        this.phaseIndicator = (phase: string) => page.locator(`[data-testid="phase-${phase}"]`);
        
        // IGL Controls (now with real data-testid)
        this.iglControlsPanel = page.locator('[data-testid="igl-controls"]');
        this.doubleCallinButton = page.locator('[data-testid="double-callin-button"]');
        this.timeoutButton = page.locator('[data-testid="timeout-button"]');
        this.slotSelectionPanel = page.locator('[data-testid="slot-selection-panel"]');
        
        // Question (now with real data-testid)
        this.questionText = page.locator('[data-testid="question-text"]');
        this.answerInput = page.locator('[data-testid="answer-input"]');
        this.submitAnswerButton = page.locator('[data-testid="submit-answer"]');
        
        // Results (now with real data-testid)
        this.correctResult = page.locator('[data-testid="correct-result"]');
        this.incorrectResult = page.locator('[data-testid="incorrect-result"]');
    }
    
    /**
     * Wait for a specific phase
     */
    async waitForPhase(phase: string, timeout = 60000): Promise<void> {
        await expect(this.phaseIndicator(phase)).toBeVisible({ timeout });
    }
    
    /**
     * Get current phase
     */
    async getCurrentPhase(): Promise<string> {
        for (const phase of ['strategy', 'active', 'break', 'halftime', 'post_match']) {
            if (await this.phaseIndicator(phase).isVisible({ timeout: 1000 }).catch(() => false)) {
                return phase;
            }
        }
        return 'unknown';
    }
    
    /**
     * Submit an answer to the current question
     */
    async submitAnswer(answer: string | number): Promise<void> {
        await this.answerInput.fill(String(answer));
        await this.submitAnswerButton.click();
    }
    
    /**
     * Get the current question text
     */
    async getQuestionText(): Promise<string> {
        return await this.questionText.textContent() || '';
    }
    
    /**
     * Check if question is visible (is active player)
     */
    async isActivePlayer(): Promise<boolean> {
        return await this.questionText.isVisible({ timeout: 3000 }).catch(() => false);
    }
    
    /**
     * Calculate and submit the correct answer
     */
    async submitCorrectAnswer(): Promise<boolean> {
        const questionText = await this.getQuestionText();
        const answer = this.calculateAnswer(questionText);
        if (answer !== null) {
            await this.submitAnswer(answer);
            return true;
        }
        return false;
    }
    
    /**
     * Parse question and calculate answer
     */
    calculateAnswer(questionText: string): number | null {
        const cleaned = questionText.replace('×', '*').replace('÷', '/').replace('−', '-');
        const match = cleaned.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
        
        if (!match) return null;
        
        const a = parseInt(match[1]);
        const op = match[2];
        const b = parseInt(match[3]);
        
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return Math.floor(a / b);
            default: return null;
        }
    }
    
    /**
     * Check if current user is IGL (can see IGL controls)
     */
    async isIGL(): Promise<boolean> {
        return await this.iglControlsPanel.isVisible({ timeout: 3000 }).catch(() => false);
    }
    
    /**
     * Activate Double Call-In (IGL only)
     */
    async activateDoubleCallin(slotNumber: number): Promise<void> {
        await this.doubleCallinButton.click();
        await this.page.waitForTimeout(500);
        await this.page.locator(`[data-testid="callin-slot-${slotNumber}"]`).click();
    }
    
    /**
     * Call timeout (IGL only)
     */
    async callTimeout(): Promise<void> {
        await this.timeoutButton.click();
    }
    
    /**
     * Check if Double Call-In button is visible
     */
    async isDoubleCallinAvailable(): Promise<boolean> {
        return await this.doubleCallinButton.isVisible({ timeout: 3000 }).catch(() => false);
    }
    
    /**
     * Check if Timeout button is visible
     */
    async isTimeoutAvailable(): Promise<boolean> {
        return await this.timeoutButton.isVisible({ timeout: 3000 }).catch(() => false);
    }
    
    /**
     * Wait for answer result
     */
    async waitForAnswerResult(expectedCorrect?: boolean): Promise<boolean> {
        if (expectedCorrect === true) {
            await expect(this.correctResult).toBeVisible({ timeout: 5000 });
            return true;
        } else if (expectedCorrect === false) {
            await expect(this.incorrectResult).toBeVisible({ timeout: 5000 });
            return false;
        }
        // Wait for either
        await expect(this.correctResult.or(this.incorrectResult)).toBeVisible({ timeout: 5000 });
        return await this.correctResult.isVisible();
    }
    
    /**
     * Verify match page loaded
     */
    async verifyLoaded(): Promise<void> {
        // Wait for any phase indicator to appear
        const hasPhase = await this.page.locator('[data-testid^="phase-"]').isVisible({ timeout: 30000 }).catch(() => false);
        expect(hasPhase).toBeTruthy();
    }
}

