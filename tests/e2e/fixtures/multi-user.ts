/**
 * Multi-User Browser Fixture
 * 
 * Provides 5 concurrent browser sessions for 5v5 arena testing.
 * Each user has their own browser context with persistent authentication.
 */

import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Player role definitions
export type PlayerRole = 'igl' | 'anchor' | 'member';

export interface PlayerSession {
    context: BrowserContext;
    page: Page;
    credentials: {
        id: string;
        email: string;
        password: string;
        name: string;
    };
    role: PlayerRole;
    playerNumber: number;
}

export interface TeamFixture {
    player1: PlayerSession; // IGL
    player2: PlayerSession; // Anchor
    player3: PlayerSession; // Member
    player4: PlayerSession; // Member
    player5: PlayerSession; // Member
    allPlayers: PlayerSession[];
    igl: PlayerSession;
    anchor: PlayerSession;
    members: PlayerSession[];
}

// Load credentials from generated file
function loadCredentials() {
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
    // Fallback
    return {
        player1: { email: 'e2e-player1@test.flashmath.local', password: 'TestPassword123', name: 'E2E_Player1' },
        player2: { email: 'e2e-player2@test.flashmath.local', password: 'TestPassword123', name: 'E2E_Player2' },
        player3: { email: 'e2e-player3@test.flashmath.local', password: 'TestPassword123', name: 'E2E_Player3' },
        player4: { email: 'e2e-player4@test.flashmath.local', password: 'TestPassword123', name: 'E2E_Player4' },
        player5: { email: 'e2e-player5@test.flashmath.local', password: 'TestPassword123', name: 'E2E_Player5' },
    };
}

// Login helper for a specific page with retry logic
async function loginPlayer(page: Page, credentials: { email: string; password: string }, timeout = 60000) {
    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Navigate to login with retry for network errors
            try {
                await page.goto('/auth/login', { timeout: 30000 });
            } catch (navError: any) {
                if (navError.message.includes('ERR_NETWORK_CHANGED') && attempt < MAX_RETRIES) {
                    console.log(`   ⚠️ Network changed during navigation (attempt ${attempt}), retrying...`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw navError;
            }
            
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
            
            // CRITICAL: Reload to get fresh Server Action IDs after server restart
            await page.reload({ waitUntil: 'networkidle' });
            
            // Check if already logged in (redirected away from login)
            if (!page.url().includes('/auth/login')) {
                return;
            }
            
            // Wait for the email input to be visible
            const emailInput = page.locator('input[name="email"]');
            const passwordInput = page.locator('input[name="password"]');
            
            await emailInput.waitFor({ state: 'visible', timeout: 20000 });
            
            // Fill in credentials
            await emailInput.click();
            await emailInput.fill(credentials.email);
            await passwordInput.fill(credentials.password);
            
            // Submit the form
            await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
            
            // Wait for redirect away from login with generous timeout
            await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout });
            return; // Success!
            
        } catch (error: any) {
            if (attempt === MAX_RETRIES) {
                throw error;
            }
            console.log(`   ⚠️ Login attempt ${attempt} failed: ${error.message.substring(0, 100)}, retrying...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// Create a player session with its own browser context
async function createPlayerSession(
    browser: Browser,
    playerNumber: number,
    credentials: { email: string; password: string; name: string },
    role: PlayerRole
): Promise<PlayerSession> {
    // Create isolated browser context for this player
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
    });
    
    const page = await context.newPage();
    
    // Login the player
    await loginPlayer(page, credentials);
    
    return {
        context,
        page,
        credentials,
        role,
        playerNumber,
    };
}

// Cleanup all player sessions
async function cleanupSessions(sessions: PlayerSession[]) {
    for (const session of sessions) {
        try {
            await session.page.close();
            await session.context.close();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Clear any leftover party state for a player
 * This ensures tests start with a clean slate even after retries
 */
async function clearPartyState(page: Page, playerName: string): Promise<void> {
    try {
        // Navigate to team setup and check for party state
        await page.goto('/arena/teams/setup');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        
        // Check if player is in a party (look for "Leave Party" button)
        const leavePartyBtn = page.locator('button:has-text("Leave Party"), [data-testid="leave-party"]').first();
        const isInParty = await leavePartyBtn.isVisible({ timeout: 2000 }).catch(() => false);
        
        if (isInParty) {
            console.log(`   🧹 ${playerName} leaving existing party...`);
            await leavePartyBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) {
        // Ignore errors - player might not be in party
    }
}

/**
 * Multi-user test fixture
 * 
 * Provides 5 concurrent browser sessions for testing 5v5 arena flows.
 */
export const multiUserTest = base.extend<{
    team: TeamFixture;
}>({
    team: async ({ browser }, use) => {
        const creds = loadCredentials();
        
        console.log('\n   🎮 Creating 5 player sessions...');
        
        // Create all 5 player sessions in parallel
        const [p1, p2, p3, p4, p5] = await Promise.all([
            createPlayerSession(browser, 1, creds.player1, 'igl'),
            createPlayerSession(browser, 2, creds.player2, 'anchor'),
            createPlayerSession(browser, 3, creds.player3, 'member'),
            createPlayerSession(browser, 4, creds.player4, 'member'),
            createPlayerSession(browser, 5, creds.player5, 'member'),
        ]);
        
        console.log('   ✅ All 5 players logged in');
        
        // Clear any leftover party state from previous test runs/retries
        console.log('   🧹 Clearing leftover party state...');
        await Promise.all([
            clearPartyState(p1.page, p1.credentials.name),
            clearPartyState(p2.page, p2.credentials.name),
            clearPartyState(p3.page, p3.credentials.name),
            clearPartyState(p4.page, p4.credentials.name),
            clearPartyState(p5.page, p5.credentials.name),
        ]);
        console.log('   ✅ Party state cleared\n');
        
        const team: TeamFixture = {
            player1: p1,
            player2: p2,
            player3: p3,
            player4: p4,
            player5: p5,
            allPlayers: [p1, p2, p3, p4, p5],
            igl: p1,
            anchor: p2,
            members: [p3, p4, p5],
        };
        
        // Use the fixture
        await use(team);
        
        // Cleanup after test
        console.log('\n   🧹 Cleaning up player sessions...');
        await cleanupSessions(team.allPlayers);
    },
});

// Re-export expect for convenience
export { expect };

/**
 * Helper: Navigate all players to a specific URL
 */
export async function navigateAllPlayers(team: TeamFixture, url: string) {
    await Promise.all(team.allPlayers.map(p => p.page.goto(url)));
}

/**
 * Helper: Wait for all players to see a specific element
 */
export async function waitForAllPlayers(
    team: TeamFixture, 
    locatorFn: (page: Page) => any, 
    options?: { timeout?: number }
) {
    const timeout = options?.timeout || 10000;
    await Promise.all(
        team.allPlayers.map(p => 
            expect(locatorFn(p.page)).toBeVisible({ timeout })
        )
    );
}

/**
 * Helper: Create party as player 1 (IGL)
 */
export async function createParty(team: TeamFixture): Promise<void> {
    const { igl } = team;
    
    // Navigate to team setup
    await igl.page.goto('/arena/teams/setup');
    await igl.page.waitForLoadState('networkidle');
    
    // Click Create Party button
    const createPartyBtn = igl.page.getByRole('button', { name: /create party/i });
    await createPartyBtn.click();
    
    // Wait for party to be created (social panel should update)
    await igl.page.waitForTimeout(1000);
}

/**
 * Helper: Open social panel
 */
export async function openSocialPanel(page: Page): Promise<void> {
    const socialBtn = page.getByRole('button', { name: /open social panel/i });
    if (await socialBtn.isVisible()) {
        await socialBtn.click();
        await page.waitForTimeout(500);
    }
}

/**
 * Helper: Invite a player to party
 */
export async function inviteToParty(igl: PlayerSession, targetName: string): Promise<void> {
    await openSocialPanel(igl.page);
    
    // Look for invite button next to the friend's name
    const friendRow = igl.page.locator(`text=${targetName}`).first();
    const inviteBtn = friendRow.locator('xpath=ancestor::*[contains(@class, "flex")]//button[contains(@title, "Invite")]').first();
    
    if (await inviteBtn.isVisible()) {
        await inviteBtn.click();
    }
}

/**
 * Helper: Accept party invite
 */
export async function acceptPartyInvite(player: PlayerSession): Promise<void> {
    await openSocialPanel(player.page);
    
    // Look for accept button in invite
    const acceptBtn = player.page.getByRole('button', { name: /accept/i }).first();
    if (await acceptBtn.isVisible({ timeout: 5000 })) {
        await acceptBtn.click();
    }
}

/**
 * Helper: Mark player as ready
 */
export async function markReady(player: PlayerSession): Promise<void> {
    const readyBtn = player.page.getByRole('button', { name: /ready/i });
    if (await readyBtn.isVisible()) {
        await readyBtn.click();
    }
}

/**
 * Helper: Wait for all players to be ready
 */
export async function waitForAllReady(team: TeamFixture): Promise<void> {
    // Mark all players as ready in parallel
    await Promise.all(team.allPlayers.map(p => markReady(p)));
    
    // Wait for UI to update
    await team.igl.page.waitForTimeout(1000);
}
