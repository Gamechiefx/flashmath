/**
 * Dual Team Browser Fixture
 * 
 * Provides 10 concurrent browser sessions for 5v5 PvP arena testing.
 * Two teams of 5 players each, all with persistent authentication.
 * 
 * This is a RESOURCE-INTENSIVE fixture that runs 10 browser contexts simultaneously.
 * Use with caution and ensure adequate system resources.
 */

import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export type PlayerRole = 'igl' | 'anchor' | 'member';
export type TeamName = 'alpha' | 'bravo';

export interface PlayerSession {
    context: BrowserContext;
    page: Page;
    credentials: {
        id: string;
        email: string;
        password: string;
        name: string;
        team?: string;
    };
    role: PlayerRole;
    playerNumber: number;
    teamName: TeamName;
}

export interface TeamFixture {
    leader: PlayerSession;
    igl: PlayerSession;
    anchor: PlayerSession;
    members: PlayerSession[];
    allPlayers: PlayerSession[];
    teamName: TeamName;
}

export interface DualTeamFixture {
    // Team Alpha (players 1-5)
    teamAlpha: TeamFixture;
    // Team Bravo (players 6-10)
    teamBravo: TeamFixture;
    // All 10 players
    allPlayers: PlayerSession[];
    // Helpers
    getPlayer: (num: number) => PlayerSession;
}

// ============================================================================
// Credential Loading
// ============================================================================

function loadCredentials() {
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
    // Fallback - all 10 players
    const fallback: Record<string, any> = {};
    for (let i = 1; i <= 10; i++) {
        fallback[`player${i}`] = {
            id: `e2e-test-player${i}`,
            email: `e2e-player${i}@test.flashmath.local`,
            password: 'TestPassword123',
            name: `E2E_Player${i}`,
            team: i <= 5 ? 'alpha' : 'bravo',
        };
    }
    return fallback;
}

// ============================================================================
// Session Management
// ============================================================================

async function loginPlayer(page: Page, credentials: { email: string; password: string }, timeout = 15000) {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    
    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(credentials.email);
    await passwordInput.fill(credentials.password);
    
    await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
    
    // Wait for redirect away from login
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout });
}

async function createPlayerSession(
    browser: Browser,
    playerNumber: number,
    credentials: { id: string; email: string; password: string; name: string; team?: string },
    role: PlayerRole,
    teamName: TeamName
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
        teamName,
    };
}

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

// ============================================================================
// Fixture Definition
// ============================================================================

/**
 * Dual-team test fixture
 * 
 * Provides 10 concurrent browser sessions for testing 5v5 PvP matches.
 * - Team Alpha: players 1-5
 * - Team Bravo: players 6-10
 */
export const dualTeamTest = base.extend<{
    dualTeam: DualTeamFixture;
}>({
    dualTeam: async ({ browser }, use) => {
        const creds = loadCredentials();
        
        console.log('\n   🎮 Creating 10 player sessions (2 teams × 5 players)...');
        const startTime = Date.now();
        
        // Create all 10 player sessions in parallel
        // This is resource-intensive but faster than sequential
        const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10] = await Promise.all([
            // Team Alpha
            createPlayerSession(browser, 1, creds.player1, 'igl', 'alpha'),
            createPlayerSession(browser, 2, creds.player2, 'anchor', 'alpha'),
            createPlayerSession(browser, 3, creds.player3, 'member', 'alpha'),
            createPlayerSession(browser, 4, creds.player4, 'member', 'alpha'),
            createPlayerSession(browser, 5, creds.player5, 'member', 'alpha'),
            // Team Bravo
            createPlayerSession(browser, 6, creds.player6, 'igl', 'bravo'),
            createPlayerSession(browser, 7, creds.player7, 'anchor', 'bravo'),
            createPlayerSession(browser, 8, creds.player8, 'member', 'bravo'),
            createPlayerSession(browser, 9, creds.player9, 'member', 'bravo'),
            createPlayerSession(browser, 10, creds.player10, 'member', 'bravo'),
        ]);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ✅ All 10 players logged in (${duration}s)`);
        
        // Clear any leftover party state from previous test runs/retries
        console.log('   🧹 Clearing leftover party state...');
        await Promise.all([
            clearPartyState(p1.page, p1.credentials.name),
            clearPartyState(p2.page, p2.credentials.name),
            clearPartyState(p3.page, p3.credentials.name),
            clearPartyState(p4.page, p4.credentials.name),
            clearPartyState(p5.page, p5.credentials.name),
            clearPartyState(p6.page, p6.credentials.name),
            clearPartyState(p7.page, p7.credentials.name),
            clearPartyState(p8.page, p8.credentials.name),
            clearPartyState(p9.page, p9.credentials.name),
            clearPartyState(p10.page, p10.credentials.name),
        ]);
        console.log('   ✅ Party state cleared\n');
        
        const teamAlpha: TeamFixture = {
            leader: p1,
            igl: p1,
            anchor: p2,
            members: [p3, p4, p5],
            allPlayers: [p1, p2, p3, p4, p5],
            teamName: 'alpha',
        };
        
        const teamBravo: TeamFixture = {
            leader: p6,
            igl: p6,
            anchor: p7,
            members: [p8, p9, p10],
            allPlayers: [p6, p7, p8, p9, p10],
            teamName: 'bravo',
        };
        
        const allPlayers = [...teamAlpha.allPlayers, ...teamBravo.allPlayers];
        
        const dualTeam: DualTeamFixture = {
            teamAlpha,
            teamBravo,
            allPlayers,
            getPlayer: (num: number) => allPlayers[num - 1],
        };
        
        // Use the fixture
        await use(dualTeam);
        
        // Cleanup after test
        console.log('\n   🧹 Cleaning up 10 player sessions...');
        await cleanupSessions(allPlayers);
    },
});

// Re-export expect for convenience
export { expect };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Navigate all players on a team to a specific URL
 */
export async function navigateTeam(team: TeamFixture, url: string): Promise<void> {
    await Promise.all(team.allPlayers.map(p => p.page.goto(url)));
    await Promise.all(team.allPlayers.map(p => p.page.waitForLoadState('domcontentloaded')));
}

/**
 * Navigate ALL 10 players to a specific URL
 */
export async function navigateAllPlayers(dualTeam: DualTeamFixture, url: string): Promise<void> {
    await Promise.all(dualTeam.allPlayers.map(p => p.page.goto(url)));
    await Promise.all(dualTeam.allPlayers.map(p => p.page.waitForLoadState('domcontentloaded')));
}

/**
 * Wait for all players on a team to see a specific element
 */
export async function waitForTeamElement(
    team: TeamFixture,
    locatorFn: (page: Page) => any,
    options?: { timeout?: number }
): Promise<void> {
    const timeout = options?.timeout || 10000;
    await Promise.all(
        team.allPlayers.map(p =>
            expect(locatorFn(p.page)).toBeVisible({ timeout })
        )
    );
}

/**
 * Execute an action for each player on a team sequentially
 */
export async function forEachTeamPlayer(
    team: TeamFixture,
    action: (player: PlayerSession, index: number) => Promise<void>
): Promise<void> {
    for (let i = 0; i < team.allPlayers.length; i++) {
        await action(team.allPlayers[i], i);
    }
}

/**
 * Execute an action for each player on a team in parallel
 */
export async function forEachTeamPlayerParallel(
    team: TeamFixture,
    action: (player: PlayerSession, index: number) => Promise<void>
): Promise<void> {
    await Promise.all(
        team.allPlayers.map((player, index) => action(player, index))
    );
}

/**
 * Create a party for a team (leader creates, members join)
 */
export async function createTeamParty(team: TeamFixture): Promise<void> {
    const { leader, allPlayers } = team;
    
    // Navigate all to setup
    await navigateTeam(team, '/arena/teams/setup');
    await Promise.all(allPlayers.map(p => p.page.waitForTimeout(1000)));
    
    // Leader creates party
    const createBtn = leader.page.locator('[data-testid="create-party-button"]');
    const canCreate = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (canCreate) {
        await createBtn.click();
        await leader.page.waitForTimeout(1500);
    }
    
    // Members need to be invited and accept
    // This depends on your party invite system
}

/**
 * Have all non-leaders on a team ready up
 */
export async function readyUpTeam(team: TeamFixture): Promise<number> {
    let readyCount = 0;
    
    // Skip leader (index 0), ready up everyone else
    for (const player of team.allPlayers.slice(1)) {
        const readyBtn = player.page.locator('[data-testid="ready-button"]')
            .or(player.page.getByRole('button', { name: /ready up/i }));
        
        const canReady = await readyBtn.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (canReady) {
            await readyBtn.click();
            await player.page.waitForTimeout(500);
            readyCount++;
        }
    }
    
    return readyCount;
}

/**
 * Take screenshots of all players (useful for debugging)
 */
export async function screenshotAllPlayers(
    dualTeam: DualTeamFixture,
    prefix: string
): Promise<void> {
    const screenshotPromises = dualTeam.allPlayers.map(async (player) => {
        const filename = `test-results/${prefix}-player${player.playerNumber}.png`;
        await player.page.screenshot({ path: filename, fullPage: true });
    });
    
    await Promise.all(screenshotPromises);
    console.log(`   📸 Screenshots saved: ${prefix}-player*.png`);
}

/**
 * Log the current URL of all players (debugging)
 */
export function logAllPlayerUrls(dualTeam: DualTeamFixture): void {
    console.log('   Current player URLs:');
    for (const player of dualTeam.allPlayers) {
        console.log(`     Player ${player.playerNumber} (${player.teamName}): ${player.page.url()}`);
    }
}
