import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Queue Page (/arena/teams/queue)
 * 
 * Handles matchmaking queue operations for 5v5 PvP matches.
 */
export class QueuePage extends BasePage {
    readonly url = '/arena/teams/queue';
    
    // Queue controls
    readonly queueStatus: Locator;
    readonly cancelQueueButton: Locator;
    readonly queueTimer: Locator;
    readonly searchingIndicator: Locator;
    
    // Match found indicators
    readonly matchFoundModal: Locator;
    readonly acceptMatchButton: Locator;
    readonly declineMatchButton: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // Queue status
        this.queueStatus = page.locator('[data-testid="queue-status"]');
        this.cancelQueueButton = page.locator('[data-testid="cancel-queue-button"]');
        this.queueTimer = page.locator('[data-testid="queue-timer"]');
        this.searchingIndicator = page.locator('text=/searching|finding|looking/i');
        
        // Match found
        this.matchFoundModal = page.locator('[data-testid="match-found-modal"]');
        this.acceptMatchButton = page.locator('[data-testid="accept-match-button"]');
        this.declineMatchButton = page.locator('[data-testid="decline-match-button"]');
    }
    
    /**
     * Navigate to queue page
     */
    async goto(): Promise<void> {
        await this.page.goto(this.url);
        await this.waitForLoad();
    }
    
    /**
     * Check if currently in queue
     */
    async isInQueue(): Promise<boolean> {
        const hasSearching = await this.searchingIndicator.isVisible({ timeout: 3000 }).catch(() => false);
        const hasCancelBtn = await this.cancelQueueButton.isVisible({ timeout: 3000 }).catch(() => false);
        return hasSearching || hasCancelBtn;
    }
    
    /**
     * Cancel queue
     */
    async cancelQueue(): Promise<void> {
        const isVisible = await this.cancelQueueButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
            await this.cancelQueueButton.click();
            await this.page.waitForTimeout(500);
        }
    }
    
    /**
     * Wait for match to be found
     */
    async waitForMatchFound(timeout = 120000): Promise<boolean> {
        try {
            // Wait for either match found modal or redirect to match page
            await Promise.race([
                this.acceptMatchButton.waitFor({ state: 'visible', timeout }),
                this.page.waitForURL(/\/arena\/teams\/match\//, { timeout }),
            ]);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Accept the found match
     */
    async acceptMatch(): Promise<void> {
        const isVisible = await this.acceptMatchButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
            await this.acceptMatchButton.click();
            // Wait for navigation to match
            await this.page.waitForURL(/\/arena\/teams\/match\//, { timeout: 30000 });
        }
    }
    
    /**
     * Decline the found match
     */
    async declineMatch(): Promise<void> {
        const isVisible = await this.declineMatchButton.isVisible({ timeout: 5000 }).catch(() => false);
        if (isVisible) {
            await this.declineMatchButton.click();
        }
    }
    
    /**
     * Get current queue time
     */
    async getQueueTime(): Promise<string> {
        return await this.queueTimer.textContent() || '0:00';
    }
    
    /**
     * Verify page is ready
     */
    async verifyLoaded(): Promise<void> {
        await expect(
            this.queueStatus.or(this.searchingIndicator).or(this.cancelQueueButton)
        ).toBeVisible({ timeout: 10000 });
    }
}

