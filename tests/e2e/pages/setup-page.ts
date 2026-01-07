import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Team Setup Page (/arena/teams/setup)
 * 
 * Uses data-testid attributes added to team-setup-client.tsx for reliable element selection.
 */
export class SetupPage extends BasePage {
    // Page URL
    readonly url = '/arena/teams/setup';
    
    // Party creation
    readonly createPartyButton: Locator;
    
    // VS AI section
    readonly vsAiButton: Locator;
    readonly difficultyEasyButton: Locator;
    readonly difficultyMediumButton: Locator;
    readonly difficultyHardButton: Locator;
    readonly startAiMatchButton: Locator;
    
    // Ready system
    readonly readyButton: Locator;
    readonly readyCount: Locator;
    
    // Queue section
    readonly findMatchButton: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // Party creation
        this.createPartyButton = page.locator('[data-testid="create-party-button"]');
        
        // VS AI (now with correct data-testid)
        this.vsAiButton = page.locator('[data-testid="vs-ai-button"]');
        this.difficultyEasyButton = page.locator('[data-testid="difficulty-easy"]');
        this.difficultyMediumButton = page.locator('[data-testid="difficulty-medium"]');
        this.difficultyHardButton = page.locator('[data-testid="difficulty-hard"]');
        this.startAiMatchButton = page.locator('[data-testid="start-ai-match"]');
        
        // Ready system
        this.readyButton = page.locator('[data-testid="ready-button"]');
        this.readyCount = page.locator('[data-testid="ready-count"]');
        
        // Queue
        this.findMatchButton = page.locator('[data-testid="find-match-button"]');
    }
    
    /**
     * Navigate to setup page
     */
    async goto(): Promise<void> {
        await this.page.goto(this.url);
        await this.waitForLoad();
    }
    
    /**
     * Create a party if not already in one
     */
    async createParty(): Promise<void> {
        const isVisible = await this.createPartyButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
            // Dismiss any overlays first by pressing Escape
            await this.page.keyboard.press('Escape');
            await this.page.waitForTimeout(500);
            
            // Use force click to bypass any remaining overlays
            await this.createPartyButton.click({ force: true });
            // Wait for state update
            await this.page.waitForTimeout(2000);
        }
    }
    
    /**
     * Toggle ready state
     */
    async toggleReady(): Promise<void> {
        const isVisible = await this.readyButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
            await this.readyButton.click();
            await this.page.waitForTimeout(500);
        }
    }
    
    /**
     * Get ready count text (e.g., "1/5 ready")
     */
    async getReadyCountText(): Promise<string> {
        return await this.readyCount.textContent() || '';
    }
    
    /**
     * Check if VS AI button is visible
     */
    async isVsAiVisible(): Promise<boolean> {
        return await this.vsAiButton.isVisible({ timeout: 5000 }).catch(() => false);
    }
    
    /**
     * Start a match against AI
     */
    async startAIMatch(difficulty: 'easy' | 'medium' | 'hard' = 'easy'): Promise<void> {
        // Click VS AI button to show difficulty options
        await this.vsAiButton.click();
        await this.page.waitForTimeout(500);
        
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
        
        // Click start button
        await this.startAiMatchButton.click();
        
        // Wait for navigation to match page
        await this.waitForNavigation(/\/arena\/teams\/match\//);
    }
    
    /**
     * Check if Create Party button is visible (meaning user is not in a party)
     */
    async isNotInParty(): Promise<boolean> {
        return await this.createPartyButton.isVisible({ timeout: 3000 }).catch(() => false);
    }
    
    /**
     * Verify page is ready
     */
    async verifyLoaded(): Promise<void> {
        // Either Create Party button or VS AI button should be visible
        await expect(
            this.createPartyButton.or(this.vsAiButton).or(this.findMatchButton)
        ).toBeVisible({ timeout: 10000 });
    }
}

