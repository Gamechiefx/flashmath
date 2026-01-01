/**
 * FlashMath Arena - League System
 * 
 * Cosmetic + motivational league rankings based on ELO.
 * Each league has 3 divisions (I, II, III).
 * 
 * Per spec: "Leagues are cosmetic + motivational, not raw math."
 * 
 * @module leagues
 */

const { LEAGUES, LEAGUE_CONFIG } = require('./constants.js');

// =============================================================================
// LEAGUE CALCULATION
// =============================================================================

/**
 * Get league and division from ELO
 * Each league spans 300 ELO, divided into 3 divisions of 100 each
 * 
 * @param {number} elo - Player's ELO rating
 * @returns {Object} { league, division, displayName, progress }
 */
function getLeagueFromElo(elo) {
    // Find the league
    let currentLeague = LEAGUES.BRONZE;
    let leagueName = 'BRONZE';

    for (const [name, league] of Object.entries(LEAGUES)) {
        if (elo >= league.minElo && elo <= league.maxElo) {
            currentLeague = league;
            leagueName = name;
            break;
        }
    }

    // Calculate division within league (I, II, III)
    // Division I = lowest, Division III = highest (about to promote)
    const leagueRange = currentLeague.maxElo - currentLeague.minElo;
    const divisionSize = Math.floor(leagueRange / LEAGUE_CONFIG.DIVISIONS_PER_LEAGUE);
    const eloInLeague = elo - currentLeague.minElo;

    let division;
    if (eloInLeague < divisionSize) {
        division = 1;  // Division I
    } else if (eloInLeague < divisionSize * 2) {
        division = 2;  // Division II
    } else {
        division = 3;  // Division III (about to promote)
    }

    // Progress within division (0-100%)
    const divisionStart = currentLeague.minElo + (division - 1) * divisionSize;
    const progressInDivision = ((elo - divisionStart) / divisionSize) * 100;

    // Roman numeral for division
    const divisionRoman = ['I', 'II', 'III'][division - 1];

    return {
        league: leagueName,
        leagueId: currentLeague.id,
        leagueName: currentLeague.name,
        division: division,
        divisionRoman: divisionRoman,
        displayName: `${currentLeague.name} ${divisionRoman}`,
        elo: elo,
        progress: Math.round(Math.min(100, Math.max(0, progressInDivision))),
        minElo: currentLeague.minElo,
        maxElo: currentLeague.maxElo,
        divisionMinElo: divisionStart,
        divisionMaxElo: divisionStart + divisionSize
    };
}

// =============================================================================
// PROMOTION / DEMOTION
// =============================================================================

/**
 * Check promotion eligibility
 * Per spec: Promotion requires ELO threshold + minimum practice tier
 * 
 * @param {number} currentElo - Current ELO
 * @param {number} practiceTierLevel - Practice tier level (0-4)
 * @returns {Object} Promotion status
 */
function checkPromotion(currentElo, practiceTierLevel) {
    const current = getLeagueFromElo(currentElo);

    // Check if at top of current league (Division III, high progress)
    const atPromotionThreshold = current.division === 3 && current.progress >= 80;

    // Get next league
    const nextLeagueId = current.leagueId + 1;
    const nextLeague = Object.values(LEAGUES).find(l => l.id === nextLeagueId);

    if (!nextLeague) {
        return {
            eligible: false,
            reason: 'Already at highest league',
            current: current
        };
    }

    // Check practice tier requirement (league level must match practice tier)
    const requiresTier = LEAGUE_CONFIG.MIN_PRACTICE_TIER_FOR_PROMOTION;
    const hasRequiredTier = practiceTierLevel >= nextLeagueId;

    if (atPromotionThreshold && requiresTier && !hasRequiredTier) {
        return {
            eligible: false,
            reason: `Practice Tier must be ${nextLeague.name} or higher to promote`,
            blockedByPracticeTier: true,
            requiredTier: nextLeagueId,
            current: current
        };
    }

    return {
        eligible: atPromotionThreshold && (!requiresTier || hasRequiredTier),
        nextLeague: nextLeague.name,
        eloNeeded: nextLeague.minElo,
        current: current
    };
}

/**
 * Check demotion status
 * Per spec: Demotion is slower than promotion (loss protection)
 * 
 * @param {number} currentElo - Current ELO
 * @param {number} gamesAtCurrentDivision - Games played since last division change
 * @returns {Object} Demotion status
 */
function checkDemotion(currentElo, gamesAtCurrentDivision = 0) {
    const current = getLeagueFromElo(currentElo);

    // Can't demote from Bronze I
    if (current.leagueId === 0 && current.division === 1) {
        return {
            protected: true,
            reason: 'Cannot demote below Bronze I',
            current: current
        };
    }

    // Check demotion protection
    const protectionGames = LEAGUE_CONFIG.DEMOTION_PROTECTION_GAMES;
    const hasProtection = gamesAtCurrentDivision < protectionGames;

    // Check if at bottom of division
    const atDemotionThreshold = current.division === 1 && current.progress <= 10;

    return {
        protected: hasProtection,
        protectionGamesLeft: hasProtection ? protectionGames - gamesAtCurrentDivision : 0,
        atRisk: atDemotionThreshold && !hasProtection,
        current: current
    };
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Get league icon/color for display
 */
function getLeagueDisplay(leagueName) {
    const displays = {
        BRONZE: { color: '#CD7F32', icon: '🥉', gradient: 'linear-gradient(135deg, #CD7F32, #8B4513)' },
        SILVER: { color: '#C0C0C0', icon: '🥈', gradient: 'linear-gradient(135deg, #C0C0C0, #808080)' },
        GOLD: { color: '#FFD700', icon: '🥇', gradient: 'linear-gradient(135deg, #FFD700, #FFA500)' },
        PLATINUM: { color: '#E5E4E2', icon: '💎', gradient: 'linear-gradient(135deg, #E5E4E2, #A9A9A9)' },
        DIAMOND: { color: '#B9F2FF', icon: '💠', gradient: 'linear-gradient(135deg, #B9F2FF, #00CED1)' }
    };

    return displays[leagueName] || displays.BRONZE;
}

/**
 * Get leaderboard position description
 */
function getLeaderboardDescription(rank, totalPlayers) {
    const percentile = ((totalPlayers - rank) / totalPlayers) * 100;

    if (percentile >= 99) return 'Top 1%';
    if (percentile >= 95) return 'Top 5%';
    if (percentile >= 90) return 'Top 10%';
    if (percentile >= 75) return 'Top 25%';
    if (percentile >= 50) return 'Top 50%';
    return `Rank #${rank}`;
}

module.exports = {
    getLeagueFromElo,
    checkPromotion,
    checkDemotion,
    getLeagueDisplay,
    getLeaderboardDescription
};
