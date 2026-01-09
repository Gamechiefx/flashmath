/**
 * E2E Test Fixtures
 * 
 * Custom fixtures that extend Playwright's base test with additional functionality.
 * 
 * Usage:
 *   import { test, expect } from '../fixtures';
 *   import { multiUserTest, TeamFixture } from '../fixtures/multi-user';
 *   import { dualTeamTest, DualTeamFixture } from '../fixtures/dual-team';
 * 
 * Features:
 * - Automatic console log capture and attachment to test reports
 * - Network error tracking
 * - Page error capture
 * - Multi-user browser sessions for 5v5 testing (5 players)
 * - Dual-team browser sessions for 5v5 PvP testing (10 players)
 */

export { test, expect } from './console-capture';

// Single team fixture (5 players)
export { 
    multiUserTest, 
    expect as multiUserExpect,
    TeamFixture,
    PlayerSession,
    navigateAllPlayers,
    waitForAllPlayers,
    createParty,
    openSocialPanel,
    inviteToParty,
    acceptPartyInvite,
    markReady,
    waitForAllReady,
} from './multi-user';

// Dual team fixture (10 players for PvP)
export {
    dualTeamTest,
    expect as dualTeamExpect,
    DualTeamFixture,
    TeamFixture as DualTeamTeamFixture,
    PlayerSession as DualTeamPlayerSession,
    navigateTeam,
    navigateAllPlayers as navigateAllDualTeamPlayers,
    waitForTeamElement,
    forEachTeamPlayer,
    forEachTeamPlayerParallel,
    createTeamParty,
    readyUpTeam,
    screenshotAllPlayers,
    logAllPlayerUrls,
} from './dual-team';

