import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * Page Object for Social Panel and FAB
 * 
 * Uses data-testid attributes for reliable element selection.
 */
export class SocialPage extends BasePage {
    // FAB
    readonly socialFab: Locator;
    
    // Party actions
    readonly createPartyButton: Locator;
    readonly leavePartyButton: Locator;
    readonly inviteFriendButton: Locator;
    
    constructor(page: Page) {
        super(page);
        
        // FAB button
        this.socialFab = page.locator('[data-testid="social-fab"]');
        
        // Party actions
        this.createPartyButton = page.locator('[data-testid="create-party-social-button"]');
        this.leavePartyButton = page.locator('[data-testid="leave-party-button"]');
        this.inviteFriendButton = page.locator('[data-testid="invite-friend-button"]');
    }
    
    // The panel container selector
    readonly panelContainer = this.page.locator('.fixed.right-0.top-0.bottom-0.z-50');
    
    /**
     * Check if panel is currently open
     */
    async isPanelOpen(): Promise<boolean> {
        return await this.panelContainer.isVisible({ timeout: 500 }).catch(() => false);
    }
    
    /**
     * Open social panel by clicking FAB
     */
    async openPanel(): Promise<void> {
        // Check if panel is already open
        if (await this.isPanelOpen()) {
            return;
        }
        
        // Click FAB
        await this.socialFab.click();
        await this.page.waitForTimeout(800); // Wait for slide-in animation
    }
    
    /**
     * Close social panel by pressing Escape or clicking backdrop
     */
    async closePanel(): Promise<void> {
        if (!await this.isPanelOpen()) {
            return;
        }
        
        // Try clicking on the backdrop first (most reliable)
        const backdrop = this.page.locator('.fixed.inset-0.bg-black\\/50.backdrop-blur-sm.z-50');
        const hasBackdrop = await backdrop.isVisible({ timeout: 500 }).catch(() => false);
        if (hasBackdrop) {
            await backdrop.click({ position: { x: 10, y: 10 } }); // Click top-left corner of backdrop
            await this.page.waitForTimeout(500);
        }
        
        // Also try Escape key as backup
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(800); // Wait for slide-out animation
        
        // Verify it closed
        await this.panelContainer.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
        
        // Extra wait for any lingering animations
        await this.page.waitForTimeout(500);
    }
    
    /**
     * Check if social FAB is visible
     */
    async isFabVisible(): Promise<boolean> {
        return await this.socialFab.isVisible({ timeout: 5000 }).catch(() => false);
    }
    
    /**
     * Create party from social panel
     */
    async createParty(): Promise<void> {
        if (await this.createPartyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await this.createPartyButton.click();
            await this.page.waitForTimeout(1000);
        }
    }
    
    /**
     * Leave current party
     */
    async leaveParty(): Promise<void> {
        if (await this.leavePartyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await this.leavePartyButton.click();
            await this.page.waitForTimeout(1000);
        }
    }
    
    /**
     * Invite a friend to party by their user ID
     */
    async inviteFriend(friendUserId: string): Promise<void> {
        const inviteButton = this.page.locator(`[data-testid="invite-friend-${friendUserId}"]`);
        if (await inviteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await inviteButton.click();
            await this.page.waitForTimeout(500);
        }
    }
    
    /**
     * Check if in a party (leave button visible)
     */
    async isInParty(): Promise<boolean> {
        return await this.leavePartyButton.isVisible({ timeout: 3000 }).catch(() => false);
    }
}

