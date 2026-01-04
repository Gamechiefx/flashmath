import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Team Setup Page (/arena/teams/setup)
 */
export class SetupPage extends BasePage {
    // Page URL
    readonly url = '/arena/teams/setup';
    
    // Mode selection
    readonly mode5v5Button: Locator;
    
    // VS AI section
    readonly vsAiButton: Locator;
    readonly difficultyEasyButton: Locator;
    readonly difficultyMediumButton: Locator;
    readonly difficultyHardButton: Locator;
    readonly startAiMatchButton: Locator;
    
    // Party section
    readonly partyMembersList: Locator;
    readonly inviteButton: Locator;
    readonly leavePartyButton: Locator;
    
    // Queue section
    readonly findMatchButton: Locator;
    readonly cancelQueueButton: Locator;
    readonly queueStatus: Locator;
    
    // Role assignment
    readonly iglSelector: Locator;
    readonly anchorSelector: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // Mode buttons
        this.mode5v5Button = page.locator('[data-testid="mode-5v5"]');
        
        // VS AI
        this.vsAiButton = page.locator('[data-testid="vs-ai-button"]');
        this.difficultyEasyButton = page.locator('[data-testid="difficulty-easy"]');
        this.difficultyMediumButton = page.locator('[data-testid="difficulty-medium"]');
        this.difficultyHardButton = page.locator('[data-testid="difficulty-hard"]');
        this.startAiMatchButton = page.locator('[data-testid="start-ai-match"]');
        
        // Party
        this.partyMembersList = page.locator('[data-testid="party-members"]');
        this.inviteButton = page.locator('[data-testid="invite-button"]');
        this.leavePartyButton = page.locator('[data-testid="leave-party"]');
        
        // Queue
        this.findMatchButton = page.locator('[data-testid="find-match"]');
        this.cancelQueueButton = page.locator('[data-testid="cancel-queue"]');
        this.queueStatus = page.locator('[data-testid="queue-status"]');
        
        // Roles
        this.iglSelector = page.locator('[data-testid="igl-selector"]');
        this.anchorSelector = page.locator('[data-testid="anchor-selector"]');
    }
    
    /**
     * Navigate to setup page
     */
    async goto(): Promise<void> {
        await this.page.goto(this.url);
        await this.waitForLoad();
    }
    
    /**
     * Select 5v5 mode
     */
    async select5v5Mode(): Promise<void> {
        await this.mode5v5Button.click();
        await this.waitForLoad();
    }
    
    /**
     * Start a match against AI
     */
    async startAIMatch(difficulty: 'easy' | 'medium' | 'hard' = 'easy'): Promise<void> {
        // Click VS AI button to show difficulty options
        await this.vsAiButton.click();
        
        // Select difficulty
        switch (difficulty) {
            case 'easy':
                await this.difficultyEasyButton.click();
                break;
            case 'medium':
                await this.difficultyMediumButton.click();
                break;
            case 'hard':
                await this.difficultyHardButton.click();
                break;
        }
        
        // Wait for navigation to match page
        await this.waitForNavigation(/\/arena\/teams\/match\//);
    }
    
    /**
     * Get number of party members
     */
    async getPartyMemberCount(): Promise<number> {
        const members = await this.partyMembersList.locator('[data-testid="party-member"]').all();
        return members.length;
    }
    
    /**
     * Check if in queue
     */
    async isInQueue(): Promise<boolean> {
        return await this.queueStatus.isVisible();
    }
    
    /**
     * Verify page is ready
     */
    async verifyLoaded(): Promise<void> {
        await expect(this.vsAiButton.or(this.findMatchButton)).toBeVisible({ timeout: 10000 });
    }
}

