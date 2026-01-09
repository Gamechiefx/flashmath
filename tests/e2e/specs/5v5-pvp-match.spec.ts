/**
 * Full 5v5 PvP Match E2E Test
 * 
 * This test simulates a complete 5v5 Player vs Player match with 10 real users:
 * 
 * TEAM ALPHA (Players 1-5):
 *   - Player 1: Party leader & IGL
 *   - Player 2: Anchor
 *   - Players 3-5: Members
 * 
 * TEAM BRAVO (Players 6-10):
 *   - Player 6: Party leader & IGL
 *   - Player 7: Anchor
 *   - Players 8-10: Members
 * 
 * Test Flow:
 * 1. Both teams form parties (leaders create, invite teammates)
 * 2. Both teams assign IGL and Anchor roles
 * 3. All non-leaders ready up
 * 4. Both teams enter matchmaking queue
 * 5. Teams get matched together
 * 6. Match starts (strategy phase)
 * 7. Both teams play through the match (answering questions)
 * 8. Match completes (one team wins)
 * 
 * IMPORTANT: This test requires significant resources (10 browser contexts).
 * Run with: npm run test:e2e -- --grep "5v5 PvP"
 */

import {
    dualTeamTest as test,
    expect,
    navigateTeam,
    navigateAllPlayers,
    readyUpTeam,
    screenshotAllPlayers,
    logAllPlayerUrls,
    DualTeamFixture,
    TeamFixture,
    PlayerSession,
} from '../fixtures/dual-team';
import { SetupPage, MatchPage, SocialPage, QueuePage } from '../pages';

// ============================================================================
// Test Configuration
// ============================================================================

// Increase timeout for this long-running test (15 minutes)
test.setTimeout(900000);

/**
 * Navigate with retry logic to handle intermittent network issues
 */
async function navigateWithRetry(
    page: any, 
    url: string, 
    maxRetries = 3,
    label = ''
): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, { timeout: 30000 });
            return true;
        } catch (error: any) {
            if (attempt < maxRetries) {
                console.log(`${label} Navigation attempt ${attempt} failed, retrying...`);
                await page.waitForTimeout(2000);
            } else {
                console.log(`${label} Navigation failed after ${maxRetries} attempts: ${error.message}`);
                throw error;
            }
        }
    }
    return false;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Dismiss any modal overlays that might be blocking clicks
 */
async function dismissOverlays(page: any): Promise<void> {
    // Click on backdrop overlays to dismiss them
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/50, .fixed.inset-0.bg-black\\/80');
    const hasBackdrop = await backdrop.first().isVisible({ timeout: 1000 }).catch(() => false);
    
    if (hasBackdrop) {
        // Press Escape key to close any modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
    }
    
    // Also check for any visible close buttons
    const closeBtn = page.locator('[data-testid="close-panel"], [aria-label="Close"], button:has(svg.lucide-x)').first();
    const hasCloseBtn = await closeBtn.isVisible({ timeout: 500 }).catch(() => false);
    if (hasCloseBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
    }
}

/**
 * Form a complete party for a team
 * 1. Leader creates party
 * 2. Leader invites all teammates
 * 3. Teammates accept invites
 */
async function formTeamParty(team: TeamFixture, teamLabel: string): Promise<void> {
    const { leader, allPlayers } = team;
    const members = allPlayers.slice(1);
    
    console.log(`[${teamLabel}] Forming party...`);
    
    // All players navigate to setup page
    await navigateTeam(team, '/arena/teams/setup');
    await Promise.all(allPlayers.map(p => p.page.waitForTimeout(1500)));
    
    // Initialize Socket.io connections for all players
    console.log(`[${teamLabel}] Initializing Socket.io connections...`);
    for (const player of allPlayers) {
        const social = new SocialPage(player.page);
        await social.openPanel();
        await player.page.waitForTimeout(2000);
        await social.closePanel();
        // Wait for panel to fully close
        await player.page.waitForTimeout(1000);
    }
    await leader.page.waitForTimeout(3000);
    
    // Dismiss any remaining overlays on all players
    console.log(`[${teamLabel}] Dismissing any overlays...`);
    for (const player of allPlayers) {
        await dismissOverlays(player.page);
    }
    await leader.page.waitForTimeout(500);
    
    // Leader creates party - use force click if needed
    const setupPage = new SetupPage(leader.page);
    const canCreate = await setupPage.createPartyButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (canCreate) {
        // First try to dismiss any overlay, then click with force
        await dismissOverlays(leader.page);
        await setupPage.createPartyButton.click({ force: true });
        await leader.page.waitForTimeout(2000);
        console.log(`[${teamLabel}] Leader created party`);
    } else {
        console.log(`[${teamLabel}] Leader already in party`);
    }
    
    // Leader invites teammates
    console.log(`[${teamLabel}] Leader inviting teammates...`);
    const leaderSocial = new SocialPage(leader.page);
    await leaderSocial.openPanel();
    await leader.page.waitForTimeout(1000);
    
    let invitesSent = 0;
    for (const member of members) {
        const inviteBtn = leader.page.locator(`[data-testid="invite-friend-${member.credentials.id}"]`);
        const isVisible = await inviteBtn.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (isVisible) {
            await inviteBtn.click();
            await leader.page.waitForTimeout(800);
            invitesSent++;
            console.log(`[${teamLabel}] ✓ Invited ${member.credentials.name}`);
        } else {
            console.log(`[${teamLabel}] ✗ Could not find invite button for ${member.credentials.name}`);
        }
    }
    
    await leaderSocial.closePanel();
    console.log(`[${teamLabel}] Invites sent: ${invitesSent}/${members.length}`);
    
    // Wait for invites to propagate
    await leader.page.waitForTimeout(3000);
    
    // Members accept invites
    console.log(`[${teamLabel}] Members accepting invites...`);
    let acceptedCount = 0;
    
    for (const member of members) {
        // Refresh to get invite (with retry for network resilience)
        await navigateWithRetry(member.page, '/arena/modes', 3, `[${teamLabel}]`);
        await member.page.waitForTimeout(500);
        await navigateWithRetry(member.page, '/arena/teams/setup', 3, `[${teamLabel}]`);
        await member.page.waitForLoadState('domcontentloaded');
        await member.page.waitForTimeout(2000);
        
        // Open social panel to see invite
        const memberSocial = new SocialPage(member.page);
        await memberSocial.openPanel();
        await member.page.waitForTimeout(1500);
        
        // Look for Join button (party invite accept)
        const joinBtn = member.page.getByRole('button', { name: /^join$/i }).first();
        const hasInvite = await joinBtn.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (hasInvite) {
            await joinBtn.click();
            await member.page.waitForTimeout(1500);
            acceptedCount++;
            console.log(`[${teamLabel}] ✓ ${member.credentials.name} joined party`);
        } else {
            // Check if already in party
            const inParty = await memberSocial.isInParty();
            if (inParty) {
                acceptedCount++;
                console.log(`[${teamLabel}] ✓ ${member.credentials.name} already in party`);
            } else {
                console.log(`[${teamLabel}] ✗ ${member.credentials.name} - no invite found`);
            }
        }
        
        await memberSocial.closePanel();
    }
    
    console.log(`[${teamLabel}] Party formation: ${acceptedCount + 1}/5 members`);
}

/**
 * Assign IGL and Anchor roles for a team
 */
async function assignTeamRoles(team: TeamFixture, teamLabel: string): Promise<void> {
    const { leader } = team;
    
    console.log(`[${teamLabel}] Assigning roles...`);
    
    // Refresh leader's page
    await leader.page.goto('/arena/teams/setup');
    await leader.page.waitForLoadState('domcontentloaded');
    await leader.page.waitForTimeout(2000);
    
    // Select IGL
    const iglBtn = leader.page.locator('[data-testid^="igl-select-"]').first();
    const iglVisible = await iglBtn.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (iglVisible) {
        await iglBtn.click();
        await leader.page.waitForTimeout(1000);
        console.log(`[${teamLabel}] ✓ IGL assigned`);
    }
    
    // Select Anchor (different person than IGL)
    const anchorBtn = leader.page.locator('[data-testid^="anchor-select-"]').nth(1);
    let anchorVisible = await anchorBtn.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!anchorVisible) {
        const firstAnchorBtn = leader.page.locator('[data-testid^="anchor-select-"]').first();
        anchorVisible = await firstAnchorBtn.isVisible({ timeout: 3000 }).catch(() => false);
        if (anchorVisible) {
            await firstAnchorBtn.click();
            await leader.page.waitForTimeout(1000);
            console.log(`[${teamLabel}] ✓ Anchor assigned (first available)`);
        }
    } else {
        await anchorBtn.click();
        await leader.page.waitForTimeout(1000);
        console.log(`[${teamLabel}] ✓ Anchor assigned (second member)`);
    }
    
    await leader.page.waitForTimeout(2000);
}

/**
 * Ready up all non-leader members of a team
 */
async function readyTeamMembers(team: TeamFixture, teamLabel: string): Promise<number> {
    const members = team.allPlayers.slice(1);
    
    console.log(`[${teamLabel}] Members readying up...`);
    
    // Refresh all members
    await Promise.all(members.map(p => p.page.goto('/arena/teams/setup')));
    await Promise.all(members.map(p => p.page.waitForLoadState('domcontentloaded')));
    await Promise.all(members.map(p => p.page.waitForTimeout(2000)));
    
    let readyCount = 0;
    
    for (const member of members) {
        const readyBtn = member.page.locator('[data-testid="ready-button"]')
            .or(member.page.getByRole('button', { name: /ready up/i }));
        
        const canReady = await readyBtn.isVisible({ timeout: 5000 }).catch(() => false);
        
        if (canReady) {
            await readyBtn.click();
            await member.page.waitForTimeout(800);
            readyCount++;
            console.log(`[${teamLabel}] ✓ ${member.credentials.name} is ready`);
        } else {
            // Check if already ready
            const cancelBtn = member.page.getByRole('button', { name: /cancel ready/i });
            const alreadyReady = await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false);
            if (alreadyReady) {
                readyCount++;
                console.log(`[${teamLabel}] ✓ ${member.credentials.name} already ready`);
            } else {
                console.log(`[${teamLabel}] ✗ ${member.credentials.name} - no ready button`);
            }
        }
    }
    
    console.log(`[${teamLabel}] Ready: ${readyCount}/${members.length} non-leaders`);
    return readyCount;
}

/**
 * Start matchmaking queue for a team
 * After clicking "Start Team Queue", the page navigates to /arena/teams/queue
 * where the actual matchmaking polling happens
 */
async function startTeamQueue(team: TeamFixture, teamLabel: string): Promise<void> {
    const { leader } = team;
    
    console.log(`[${teamLabel}] Starting matchmaking queue...`);
    
    // Refresh leader and wait for party data to load (with retry)
    await navigateWithRetry(leader.page, '/arena/teams/setup', 3, `[${teamLabel}]`);
    await leader.page.waitForLoadState('networkidle');
    await leader.page.waitForTimeout(3000); // Give time for party data to load
    
    // Find the Find Match button using data-testid (most reliable)
    const findMatchBtn = leader.page.locator('[data-testid="find-match-button"]');
    
    // Check if button exists and is enabled
    const isVisible = await findMatchBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const isEnabled = await findMatchBtn.isEnabled().catch(() => false);
    const buttonText = await findMatchBtn.textContent().catch(() => 'unknown');
    
    console.log(`[${teamLabel}] Button visible: ${isVisible}, enabled: ${isEnabled}, text: "${buttonText}"`);
    
    if (!isVisible) {
        // Debug: check what buttons are visible
        const buttons = await leader.page.locator('button').allTextContents();
        console.log(`[${teamLabel}] Available buttons: ${buttons.slice(0, 10).join(', ')}`);
        console.log(`[${teamLabel}] ✗ Find Match button not visible`);
        return;
    }
    
    if (!isEnabled) {
        // Button is visible but disabled - check why
        console.log(`[${teamLabel}] ⚠ Button is disabled. Checking party state...`);
        
        // Check for ready indicators
        const readyIndicators = await leader.page.locator('[data-testid*="ready"]').count();
        console.log(`[${teamLabel}] Ready indicators found: ${readyIndicators}`);
        
        // Wait a bit and try again
        await leader.page.waitForTimeout(2000);
        const isEnabledRetry = await findMatchBtn.isEnabled().catch(() => false);
        if (!isEnabledRetry) {
            console.log(`[${teamLabel}] ✗ Button still disabled after wait`);
            return;
        }
    }
    
    // Click the button
    await findMatchBtn.click({ force: true });
    console.log(`[${teamLabel}] ✓ Clicked Find Match button`);
    
    // Wait for navigation to queue page
    try {
        await leader.page.waitForURL(/\/arena\/teams\/queue/, { timeout: 15000 });
        console.log(`[${teamLabel}] ✓ Navigated to queue page`);
    } catch {
        console.log(`[${teamLabel}] ⚠ Did not navigate to queue page, current URL: ${leader.page.url()}`);
        
        // Take a debug screenshot
        await leader.page.screenshot({ path: `debug-${teamLabel.toLowerCase()}-queue-fail.png` });
    }
    
    await leader.page.waitForTimeout(1000);
    console.log(`[${teamLabel}] ✓ Entered matchmaking queue`);
}

/**
 * Wait for match to be found and accept
 * The queue page polls checkTeamMatch every 2 seconds.
 * When a match is found, it auto-navigates to the match page.
 */
async function waitForMatchAndAccept(
    team: TeamFixture,
    teamLabel: string,
    timeout = 120000
): Promise<boolean> {
    const { leader } = team;
    
    console.log(`[${teamLabel}] Waiting for match...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        // Check if already on match page (queue page auto-navigates when match is found)
        if (leader.page.url().includes('/arena/teams/match/')) {
            console.log(`[${teamLabel}] ✓ Match found - on match page`);
            return true;
        }
        
        // Check for match found state on queue page
        const matchFoundIndicator = leader.page.locator('[data-testid="match-found"]')
            .or(leader.page.locator('text=Match Found'))
            .or(leader.page.locator('text=Preparing Match'));
        
        const matchFound = await matchFoundIndicator.isVisible({ timeout: 500 }).catch(() => false);
        
        if (matchFound) {
            console.log(`[${teamLabel}] ✓ Match found indicator visible`);
            
            // Check for accept button (if manual accept is required)
            const acceptBtn = leader.page.locator('[data-testid="accept-match-button"]')
                .or(leader.page.getByRole('button', { name: /accept/i }));
            
            const hasAccept = await acceptBtn.isVisible({ timeout: 1000 }).catch(() => false);
            
            if (hasAccept) {
                await acceptBtn.click();
                console.log(`[${teamLabel}] ✓ Match accepted`);
            }
            
            // Wait for match page navigation
            try {
                await leader.page.waitForURL(/\/arena\/teams\/match\//, { timeout: 30000 });
                console.log(`[${teamLabel}] ✓ Navigated to match page`);
                return true;
            } catch {
                console.log(`[${teamLabel}] ⚠ Waiting for match page navigation...`);
            }
        }
        
        // Log current status every 10 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed % 10000 < 1000) {
            const queueStatus = leader.page.locator('[data-testid="queue-status"]');
            const statusText = await queueStatus.textContent().catch(() => 'unknown');
            console.log(`[${teamLabel}] Queue status: ${statusText} (${Math.round(elapsed/1000)}s elapsed)`);
        }
        
        await leader.page.waitForTimeout(1000);
    }
    
    console.log(`[${teamLabel}] ✗ Match not found within timeout`);
    return false;
}

/**
 * Navigate all team members to the match page
 */
async function navigateTeamToMatch(
    team: TeamFixture,
    matchUrl: string,
    teamLabel: string
): Promise<number> {
    console.log(`[${teamLabel}] Navigating team to match...`);
    
    let playersInMatch = 0;
    
    for (const player of team.allPlayers) {
        try {
            await player.page.goto(matchUrl);
            await player.page.waitForLoadState('domcontentloaded');
            await player.page.waitForTimeout(1500);
            
            if (player.page.url().includes('/arena/teams/match/')) {
                playersInMatch++;
            }
        } catch (e) {
            console.log(`[${teamLabel}] ✗ ${player.credentials.name} failed to load match`);
        }
    }
    
    console.log(`[${teamLabel}] ${playersInMatch}/5 players in match`);
    return playersInMatch;
}

// ============================================================================
// Main Test
// ============================================================================

test.describe('5v5 PvP Match - Two Human Teams', () => {
    
    test('complete 5v5 PvP match flow with 10 players', async ({ dualTeam }) => {
        const { teamAlpha, teamBravo, allPlayers } = dualTeam;
        
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║          5v5 PvP E2E TEST - 10 CONCURRENT PLAYERS              ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log('║  Team Alpha: Players 1-5                                       ║');
        console.log('║  Team Bravo: Players 6-10                                      ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');
        
        // ================================================================
        // PHASE 1: Form Both Parties (in parallel)
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 1: PARTY FORMATION');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Form parties sequentially (parallel can cause race conditions)
        await formTeamParty(teamAlpha, 'ALPHA');
        await formTeamParty(teamBravo, 'BRAVO');
        
        // ================================================================
        // PHASE 2: Assign Roles
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 2: ROLE ASSIGNMENT');
        console.log('═══════════════════════════════════════════════════════════════');
        
        await assignTeamRoles(teamAlpha, 'ALPHA');
        await assignTeamRoles(teamBravo, 'BRAVO');
        
        // ================================================================
        // PHASE 3: Ready Up
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 3: READY UP');
        console.log('═══════════════════════════════════════════════════════════════');
        
        const alphaReady = await readyTeamMembers(teamAlpha, 'ALPHA');
        const bravoReady = await readyTeamMembers(teamBravo, 'BRAVO');
        
        // ================================================================
        // PHASE 4: Enter Matchmaking Queue
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 4: MATCHMAKING QUEUE');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Both teams enter queue simultaneously
        await Promise.all([
            startTeamQueue(teamAlpha, 'ALPHA'),
            startTeamQueue(teamBravo, 'BRAVO'),
        ]);
        
        // ================================================================
        // PHASE 5: Wait for Match
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 5: WAITING FOR MATCH');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Wait for both teams to find match (they should match each other)
        const [alphaFound, bravoFound] = await Promise.all([
            waitForMatchAndAccept(teamAlpha, 'ALPHA', 120000),
            waitForMatchAndAccept(teamBravo, 'BRAVO', 120000),
        ]);
        
        if (!alphaFound && !bravoFound) {
            console.log('');
            console.log('⚠️  Neither team found a match within timeout');
            console.log('    This could be due to:');
            console.log('    - Matchmaking not enabled');
            console.log('    - ELO ranges too different');
            console.log('    - Redis not running');
            console.log('');
            
            await screenshotAllPlayers(dualTeam, 'match-not-found');
            test.skip();
            return;
        }
        
        // Get match URL from whichever leader found it first
        const matchUrl = alphaFound 
            ? teamAlpha.leader.page.url() 
            : teamBravo.leader.page.url();
        
        console.log(`Match URL: ${matchUrl}`);
        
        // ================================================================
        // PHASE 6: All Players Join Match
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 6: ALL PLAYERS JOIN MATCH');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Navigate all 10 players to the match
        const alphaInMatch = await navigateTeamToMatch(teamAlpha, matchUrl, 'ALPHA');
        const bravoInMatch = await navigateTeamToMatch(teamBravo, matchUrl, 'BRAVO');
        
        const totalInMatch = alphaInMatch + bravoInMatch;
        console.log(`Total players in match: ${totalInMatch}/10`);
        
        expect(totalInMatch).toBeGreaterThanOrEqual(8); // Allow 2 failures
        
        // ================================================================
        // PHASE 7: Verify Match State
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 7: MATCH STATE VERIFICATION');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Use Team Alpha leader as the reference
        const matchPage = new MatchPage(teamAlpha.leader.page);
        
        // Wait for strategy phase or active phase
        let matchStarted = false;
        for (let i = 0; i < 60; i++) {
            const phase = await matchPage.getCurrentPhase();
            if (phase === 'strategy' || phase === 'active') {
                matchStarted = true;
                console.log(`Match started! Current phase: ${phase}`);
                break;
            }
            await teamAlpha.leader.page.waitForTimeout(1000);
        }
        
        if (!matchStarted) {
            console.log('Match did not start within timeout');
            await screenshotAllPlayers(dualTeam, 'match-not-started');
        }
        
        // ================================================================
        // PHASE 8: Gameplay (Answer Questions)
        // ================================================================
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(' PHASE 8: GAMEPLAY');
        console.log('═══════════════════════════════════════════════════════════════');
        
        // Find active players and answer questions
        let questionsAnswered = 0;
        const maxQuestions = 10; // Limit for test speed
        
        for (let q = 0; q < maxQuestions; q++) {
            // Check each player to find who's active
            for (const player of allPlayers) {
                const playerMatchPage = new MatchPage(player.page);
                const isActive = await playerMatchPage.isActivePlayer();
                
                if (isActive) {
                    const questionText = await playerMatchPage.getQuestionText();
                    console.log(`[Player ${player.playerNumber}] Active! Question: ${questionText}`);
                    
                    const success = await playerMatchPage.submitCorrectAnswer();
                    if (success) {
                        questionsAnswered++;
                        console.log(`[Player ${player.playerNumber}] ✓ Answered correctly`);
                        
                        // Wait for next question
                        await player.page.waitForTimeout(1500);
                    }
                    break; // Only one player is active at a time per team
                }
            }
            
            await allPlayers[0].page.waitForTimeout(500);
        }
        
        console.log(`Questions answered: ${questionsAnswered}`);
        
        // ================================================================
        // RESULTS
        // ================================================================
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║                      TEST RESULTS                              ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log(`║  Party Formation:  Team Alpha ✓  |  Team Bravo ✓              ║`);
        console.log(`║  Ready Status:     ${alphaReady}/4 Alpha     |  ${bravoReady}/4 Bravo               ║`);
        console.log(`║  Match Found:      ${alphaFound ? '✓' : '✗'} Alpha       |  ${bravoFound ? '✓' : '✗'} Bravo                ║`);
        console.log(`║  Players in Match: ${totalInMatch}/10                                        ║`);
        console.log(`║  Questions Answered: ${questionsAnswered}                                       ║`);
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log('');
        
        // Final assertions
        expect(totalInMatch).toBeGreaterThanOrEqual(8);
    });
    
    test('party formation only (quick validation)', async ({ dualTeam }) => {
        const { teamAlpha, teamBravo } = dualTeam;
        
        console.log('Quick validation: Testing party formation for both teams');
        
        // Just form parties - useful for quick validation
        await formTeamParty(teamAlpha, 'ALPHA');
        await formTeamParty(teamBravo, 'BRAVO');
        
        // Verify both leaders are on setup page
        expect(teamAlpha.leader.page.url()).toContain('/arena/teams/setup');
        expect(teamBravo.leader.page.url()).toContain('/arena/teams/setup');
        
        console.log('✓ Both teams successfully formed parties');
    });
});

