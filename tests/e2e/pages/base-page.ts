import { Page, Locator, expect } from '@playwright/test';

/**
 * Base Page Object Model
 * 
 * Common functionality shared across all page objects
 */
export class BasePage {
    readonly page: Page;
    
    // Common elements
    readonly loadingSpinner: Locator;
    readonly errorMessage: Locator;
    readonly toastNotification: Locator;
    
    constructor(page: Page) {
        this.page = page;
        this.loadingSpinner = page.locator('[data-testid="loading-spinner"]');
        this.errorMessage = page.locator('[data-testid="error-message"]');
        this.toastNotification = page.locator('[data-sonner-toast]');
    }
    
    /**
     * Wait for page to be fully loaded (no loading spinners)
     */
    async waitForLoad(): Promise<void> {
        await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    }
    
    /**
     * Wait for a toast notification with specific text
     */
    async waitForToast(text: string): Promise<void> {
        await expect(this.toastNotification.filter({ hasText: text })).toBeVisible({ timeout: 10000 });
    }
    
    /**
     * Check if an error message is displayed
     */
    async hasError(): Promise<boolean> {
        return await this.errorMessage.isVisible().catch(() => false);
    }
    
    /**
     * Get error message text
     */
    async getErrorText(): Promise<string> {
        if (await this.hasError()) {
            return await this.errorMessage.textContent() || '';
        }
        return '';
    }
    
    /**
     * Take a screenshot with a descriptive name
     */
    async screenshot(name: string): Promise<void> {
        await this.page.screenshot({ 
            path: `tests/e2e/screenshots/${name}-${Date.now()}.png`,
            fullPage: true,
        });
    }
    
    /**
     * Wait for navigation to complete
     */
    async waitForNavigation(urlPattern: string | RegExp): Promise<void> {
        await this.page.waitForURL(urlPattern, { timeout: 30000 });
    }
}

