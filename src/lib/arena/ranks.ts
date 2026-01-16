/**
 * Arena Rank System
 *
 * Per-mode ELO: Each game mode has its own ELO rating
 * Competitive Rank: Based on wins + practice band progression
 *
 * Rank Brackets (based on highest practice band):
 * - Foundation (1-20): Bronze/Silver
 * - Intermediate (21-40): Silver/Gold
 * - Advanced (41-60): Gold/Platinum
 * - Expert (61-80): Platinum/Diamond
 * - Master (81-100): Diamond/Master
 *
 * Division Progression (every 10 wins moves you up):
 * - Division I (0-9 wins in current rank)
 * - Division II (10-19 wins in current rank)
 * - Division III (20-29 wins in current rank)
 * - Then promote to next rank and reset
 */

 

import { getBandForTier } from '@/lib/tier-system';

export interface ArenaRank {
    rank: string;
    division: string;
    winsInRank: number;
    winsToNextDivision: number;
    winsToNextRank: number;
}

export interface ArenaStats {
    // Per-mode ELO
    elo1v1: number;
    elo2v2: number;
    elo3v3: number;

    // Overall arena stats
    totalWins: number;
    totalLosses: number;
    totalMatches: number;
    winStreak: number;
    bestWinStreak: number;

    // Rank info
    rank: string;
    division: string;
}

// Mode base ELO values
export const MODE_BASE_ELO: Record<string, number> = {
    '1v1': 500,
    '2v2': 400,
    '3v3': 350,
    '4v4': 300,
    '5v5': 250,
};

// Rank order (lowest to highest)
const RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'];
const DIVISIONS = ['I', 'II', 'III'];

// Band to rank bracket mapping (based on 100-tier system)
const BAND_TO_RANK_BRACKET: Record<number, string[]> = {
    1: ['Bronze', 'Silver'],       // Foundation (tiers 1-20)
    2: ['Silver', 'Gold'],         // Intermediate (tiers 21-40)
    3: ['Gold', 'Platinum'],       // Advanced (tiers 41-60)
    4: ['Platinum', 'Diamond'],    // Expert (tiers 61-80)
    5: ['Diamond', 'Master'],      // Master (tiers 81-100)
};

/**
 * Get rank bracket based on tier (1-100)
 */
function getRankBracketForTier(tier: number): string[] {
    const band = getBandForTier(tier);
    return BAND_TO_RANK_BRACKET[band.id] || ['Bronze', 'Silver'];
}

/**
 * Calculate competitive rank from wins and practice tier
 */
export function calculateArenaRank(totalWins: number, highestTier: number): ArenaRank {
    // Get rank bracket based on tier (now supports 1-100 tier range)
    const bracket = getRankBracketForTier(highestTier);

    // Calculate wins needed per rank: 30 wins per rank (3 divisions × 10 wins each)
    const WINS_PER_RANK = 30;
    const WINS_PER_DIVISION = 10;

    // Determine which rank within the bracket
    const ranksInBracket = bracket.length;
    const winsPerBracketRank = WINS_PER_RANK;

    // Calculate position within bracket
    let winsRemaining = totalWins;
    let rankIndex = 0;

    // Move through ranks
    while (winsRemaining >= winsPerBracketRank && rankIndex < ranksInBracket - 1) {
        winsRemaining -= winsPerBracketRank;
        rankIndex++;
    }

    // Calculate division (I, II, III based on wins in current rank)
    const divisionIndex = Math.min(Math.floor(winsRemaining / WINS_PER_DIVISION), 2);
    const winsInDivision = winsRemaining % WINS_PER_DIVISION;

    const rank = bracket[rankIndex];
    const division = DIVISIONS[divisionIndex];

    return {
        rank,
        division,
        winsInRank: winsRemaining,
        winsToNextDivision: divisionIndex < 2 ? WINS_PER_DIVISION - winsInDivision : 0,
        winsToNextRank: rankIndex < ranksInBracket - 1 ? winsPerBracketRank - winsRemaining : 0,
    };
}

/**
 * Get display string for rank
 */
export function getRankDisplay(rank: string, division: string): string {
    return `${rank} ${division}`;
}

/**
 * Get rank color classes for UI
 */
export function getRankColors(rank: string): { bg: string; border: string; text: string; glow: string } {
    const colors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
        Bronze: {
            bg: 'from-amber-700 to-amber-900',
            border: 'border-amber-500/50',
            text: 'text-amber-400',
            glow: 'shadow-amber-500/20'
        },
        Silver: {
            bg: 'from-slate-400 to-slate-600',
            border: 'border-slate-300/50',
            text: 'text-slate-300',
            glow: 'shadow-slate-300/20'
        },
        Gold: {
            bg: 'from-yellow-400 to-yellow-600',
            border: 'border-yellow-300/50',
            text: 'text-yellow-400',
            glow: 'shadow-yellow-300/20'
        },
        Platinum: {
            bg: 'from-cyan-400 to-cyan-600',
            border: 'border-cyan-300/50',
            text: 'text-cyan-400',
            glow: 'shadow-cyan-300/20'
        },
        Diamond: {
            bg: 'from-blue-400 to-indigo-600',
            border: 'border-blue-300/50',
            text: 'text-blue-400',
            glow: 'shadow-blue-300/20'
        },
        Master: {
            bg: 'from-purple-400 to-pink-600',
            border: 'border-purple-300/50',
            text: 'text-purple-400',
            glow: 'shadow-purple-300/20'
        },
    };

    return colors[rank] || colors.Bronze;
}

/**
 * Calculate ELO change for a match
 */
export function calculateEloChange(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    kFactor: number = 32
): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actualScore = won ? 1 : 0;
    return Math.round(kFactor * (actualScore - expectedScore));
}

/**
 * Get highest tier from math_tiers JSON
 */
export function getHighestTier(mathTiers: Record<string, number>): number {
    const tiers = Object.values(mathTiers);
    return Math.max(...tiers, 0);
}
