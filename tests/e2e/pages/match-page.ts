import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Match Page (/arena/teams/match/[matchId])
 */
export class MatchPage extends BasePage {
    // Phase indicators
    readonly strategyPhase: Locator;
    readonly activePhase: Locator;
    readonly breakPhase: Locator;
    readonly halftimePhase: Locator;
    
    // Strategy phase elements
    readonly slotAssignmentPanel: Locator;
    readonly confirmSlotsButton: Locator;
    readonly strategyTimer: Locator;
    
    // IGL Controls
    readonly iglControlsPanel: Locator;
    readonly doubleCallinButton: Locator;
    readonly timeoutButton: Locator;
    readonly slotSwapButton: Locator;
    
    // Match info
    readonly teamScore: Locator;
    readonly opponentScore: Locator;
    readonly roundIndicator: Locator;
    readonly slotIndicator: Locator;
    readonly gameTimer: Locator;
    
    // Question UI
    readonly questionText: Locator;
    readonly answerInput: Locator;
    readonly submitAnswerButton: Locator;
    readonly questionCounter: Locator;
    
    // Result indicators
    readonly correctResult: Locator;
    readonly incorrectResult: Locator;
    
    // Player info
    readonly activePlayerBadge: Locator;
    readonly iglBadge: Locator;
    readonly anchorBadge: Locator;
    
    // Quit vote
    readonly quitButton: Locator;
    readonly quitVoteModal: Locator;
    readonly voteYesButton: Locator;
    readonly voteNoButton: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // Phases
        this.strategyPhase = page.locator('[data-testid="strategy-phase"]');
        this.activePhase = page.locator('[data-testid="active-phase"]');
        this.breakPhase = page.locator('[data-testid="break-phase"]');
        this.halftimePhase = page.locator('[data-testid="halftime-phase"]');
        
        // Strategy
        this.slotAssignmentPanel = page.locator('[data-testid="slot-assignment-panel"]');
        this.confirmSlotsButton = page.locator('[data-testid="confirm-slots"]');
        this.strategyTimer = page.locator('[data-testid="strategy-timer"]');
        
        // IGL Controls
        this.iglControlsPanel = page.locator('[data-testid="igl-controls"]');
        this.doubleCallinButton = page.locator('[data-testid="double-callin-button"]');
        this.timeoutButton = page.locator('[data-testid="timeout-button"]');
        this.slotSwapButton = page.locator('[data-testid="slot-swap-button"]');
        
        // Match info
        this.teamScore = page.locator('[data-testid="team-score"]');
        this.opponentScore = page.locator('[data-testid="opponent-score"]');
        this.roundIndicator = page.locator('[data-testid="round-indicator"]');
        this.slotIndicator = page.locator('[data-testid="slot-indicator"]');
        this.gameTimer = page.locator('[data-testid="game-timer"]');
        
        // Question
        this.questionText = page.locator('[data-testid="question-text"]');
        this.answerInput = page.locator('[data-testid="answer-input"]');
        this.submitAnswerButton = page.locator('[data-testid="submit-answer"]');
        this.questionCounter = page.locator('[data-testid="question-counter"]');
        
        // Results
        this.correctResult = page.locator('[data-testid="correct-result"]');
        this.incorrectResult = page.locator('[data-testid="incorrect-result"]');
        
        // Player info
        this.activePlayerBadge = page.locator('[data-testid="active-player-badge"]');
        this.iglBadge = page.locator('[data-testid="igl-badge"]');
        this.anchorBadge = page.locator('[data-testid="anchor-badge"]');
        
        // Quit vote
        this.quitButton = page.locator('[data-testid="quit-button"]');
        this.quitVoteModal = page.locator('[data-testid="quit-vote-modal"]');
        this.voteYesButton = page.locator('[data-testid="vote-yes"]');
        this.voteNoButton = page.locator('[data-testid="vote-no"]');
    }
    
    /**
     * Wait for strategy phase to appear
     */
    async waitForStrategyPhase(): Promise<void> {
        await expect(this.strategyPhase).toBeVisible({ timeout: 30000 });
    }
    
    /**
     * Wait for active phase (match started)
     */
    async waitForActivePhase(): Promise<void> {
        await expect(this.activePhase).toBeVisible({ timeout: 60000 });
    }
    
    /**
     * Confirm slot assignments (IGL only)
     */
    async confirmSlots(): Promise<void> {
        await this.confirmSlotsButton.click();
    }
    
    /**
     * Get current phase
     */
    async getCurrentPhase(): Promise<string> {
        if (await this.strategyPhase.isVisible()) return 'strategy';
        if (await this.activePhase.isVisible()) return 'active';
        if (await this.breakPhase.isVisible()) return 'break';
        if (await this.halftimePhase.isVisible()) return 'halftime';
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
     * Check if current user is the active player
     */
    async isActivePlayer(): Promise<boolean> {
        return await this.questionText.isVisible();
    }
    
    /**
     * Check if current user is IGL
     */
    async isIGL(): Promise<boolean> {
        return await this.iglControlsPanel.isVisible();
    }
    
    /**
     * Activate Double Call-In (IGL only)
     */
    async activateDoubleCallin(slotNumber: number): Promise<void> {
        await this.doubleCallinButton.click();
        await this.page.locator(`[data-testid="callin-slot-${slotNumber}"]`).click();
    }
    
    /**
     * Call timeout (IGL only)
     */
    async callTimeout(): Promise<void> {
        await this.timeoutButton.click();
    }
    
    /**
     * Initiate quit vote
     */
    async initiateQuitVote(): Promise<void> {
        await this.quitButton.click();
    }
    
    /**
     * Vote on quit
     */
    async voteQuit(vote: 'yes' | 'no'): Promise<void> {
        if (vote === 'yes') {
            await this.voteYesButton.click();
        } else {
            await this.voteNoButton.click();
        }
    }
    
    /**
     * Get current score
     */
    async getScores(): Promise<{ team: number; opponent: number }> {
        const teamScoreText = await this.teamScore.textContent() || '0';
        const opponentScoreText = await this.opponentScore.textContent() || '0';
        return {
            team: parseInt(teamScoreText),
            opponent: parseInt(opponentScoreText),
        };
    }
    
    /**
     * Get current round
     */
    async getRound(): Promise<number> {
        const text = await this.roundIndicator.textContent() || 'Round 1';
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1]) : 1;
    }
    
    /**
     * Verify match page loaded
     */
    async verifyLoaded(): Promise<void> {
        await expect(
            this.strategyPhase.or(this.activePhase).or(this.breakPhase)
        ).toBeVisible({ timeout: 30000 });
    }
}

