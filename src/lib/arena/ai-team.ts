/**
 * AI Team Generator for 5v5 Arena Testing
 * Generates bot teams with themed names and behaviors
 */

import { TeamQueueEntry, TeamQueueMember } from '@/lib/actions/team-matchmaking';

// Bot name themes
const BOT_TEAM_NAMES = [
    { name: 'Neural Network', tag: 'NN', theme: 'tech' },
    { name: 'Matrix Runners', tag: 'MX', theme: 'cyber' },
    { name: 'Quantum Minds', tag: 'QM', theme: 'science' },
    { name: 'Binary Blazers', tag: 'BB', theme: 'tech' },
    { name: 'Algorithm Elite', tag: 'AE', theme: 'math' },
    { name: 'Circuit Breakers', tag: 'CB', theme: 'tech' },
    { name: 'Digital Storm', tag: 'DS', theme: 'cyber' },
    { name: 'Byte Force', tag: 'BF', theme: 'tech' },
];

const BOT_NAMES_BY_THEME = {
    tech: [
        'ByteMaster', 'CyberNova', 'TechWiz', 'DigitalAce', 'CodeSlayer',
        'SiliconSage', 'DataDruid', 'NetRunner', 'ChipChamp', 'LogicLord',
    ],
    cyber: [
        'NeonGhost', 'VirtualViper', 'CyberPhantom', 'GridGlitch', 'PixelProwler',
        'MatrixMind', 'SynthStrike', 'HoloHunter', 'VectorVolt', 'WireWraith',
    ],
    science: [
        'QuantumQuark', 'AtomAce', 'NeutronNinja', 'ProtonPrime', 'FusionForce',
        'PlasmaPhenom', 'PhotonPilot', 'GravityGuru', 'CosmicCalc', 'StarSolver',
    ],
    math: [
        'PrimePredator', 'FractalFury', 'IntegralIce', 'VectorVanguard', 'TangentTitan',
        'DerivaDemon', 'SigmaSage', 'PiProwler', 'CalcCrusher', 'AlgebraAce',
    ],
};

const BOT_TITLES = [
    'AI Overlord',
    'Machine Mind',
    'Digital Champion',
    'Binary Beast',
    'Algorithm Master',
    'Neural Navigator',
    'Quantum Calculator',
    'Logic Engine',
];

const BOT_FRAMES = [
    'matrix',
    'cyber',
    'neon',
    'hologram',
    'circuit',
    'digital',
];

// Bot difficulty settings affect answer speed and accuracy
export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

export interface BotConfig {
    difficulty: BotDifficulty;
    // Milliseconds range for answer time (min, max)
    answerTimeRange: [number, number];
    // Probability of correct answer (0-1)
    accuracy: number;
    // Streak bonus multiplier
    streakMultiplier: number;
}

export const BOT_DIFFICULTY_CONFIGS: Record<BotDifficulty, BotConfig> = {
    easy: {
        difficulty: 'easy',
        answerTimeRange: [3000, 6000],
        accuracy: 0.6,
        streakMultiplier: 0.8,
    },
    medium: {
        difficulty: 'medium',
        answerTimeRange: [2000, 4000],
        accuracy: 0.75,
        streakMultiplier: 1.0,
    },
    hard: {
        difficulty: 'hard',
        answerTimeRange: [1500, 3000],
        accuracy: 0.85,
        streakMultiplier: 1.2,
    },
    impossible: {
        difficulty: 'impossible',
        answerTimeRange: [800, 1500],
        accuracy: 0.95,
        streakMultiplier: 1.5,
    },
};

/**
 * Generate a unique bot user ID
 */
function generateBotId(matchId: string, botIndex: number): string {
    return `ai_bot_${matchId}_${botIndex}`;
}

/**
 * Select random items from array without duplicates
 */
function _selectRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Generate a single bot player
 */
function generateBotPlayer(
    matchId: string,
    botIndex: number,
    theme: string,
    elo: number,
    preferredOperation?: string
): TeamQueueMember & { isBot: true; botConfig: BotConfig } {
    const names = BOT_NAMES_BY_THEME[theme as keyof typeof BOT_NAMES_BY_THEME] || BOT_NAMES_BY_THEME.tech;
    const name = names[botIndex % names.length];
    
    // Vary ELO slightly for each bot (-50 to +50)
    const botElo = elo + Math.floor(Math.random() * 100) - 50;
    
    // Determine difficulty based on ELO
    let difficulty: BotDifficulty = 'medium';
    if (botElo < 400) difficulty = 'easy';
    else if (botElo >= 400 && botElo < 600) difficulty = 'medium';
    else if (botElo >= 600 && botElo < 800) difficulty = 'hard';
    else difficulty = 'impossible';
    
    return {
        odUserId: generateBotId(matchId, botIndex),
        odUserName: name,
        odElo: botElo,
        odLevel: Math.floor(Math.random() * 50) + 50, // Level 50-99
        odEquippedFrame: BOT_FRAMES[Math.floor(Math.random() * BOT_FRAMES.length)],
        odEquippedTitle: BOT_TITLES[Math.floor(Math.random() * BOT_TITLES.length)],
        odPreferredOperation: preferredOperation,
        isBot: true,
        botConfig: BOT_DIFFICULTY_CONFIGS[difficulty],
    };
}

/**
 * Generate a complete AI team for 5v5
 */
export function generateAITeam(
    matchId: string,
    targetElo: number,
    difficulty?: BotDifficulty
): TeamQueueEntry {
    // Select a random team identity
    const teamIdentity = BOT_TEAM_NAMES[Math.floor(Math.random() * BOT_TEAM_NAMES.length)];
    
    // Generate 5 bot players
    const operations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
    const botMembers = operations.map((op, index) => 
        generateBotPlayer(matchId, index, teamIdentity.theme, targetElo, op)
    );
    
    // If difficulty is specified, override all bots
    if (difficulty) {
        botMembers.forEach(bot => {
            bot.botConfig = BOT_DIFFICULTY_CONFIGS[difficulty];
        });
    }
    
    // First bot is IGL, second is Anchor
    const iglBot = botMembers[0];
    const anchorBot = botMembers[1];
    
    const aiTeamEntry: TeamQueueEntry = {
        odPartyId: `ai_party_${matchId}`,
        odTeamId: `ai_team_${matchId}`,
        odTeamName: teamIdentity.name,
        odTeamTag: teamIdentity.tag,
        odElo: targetElo,
        odMode: '5v5',
        odMatchType: 'casual', // AI matches are always casual for testing
        odIglId: iglBot.odUserId,
        odIglName: iglBot.odUserName,
        odAnchorId: anchorBot.odUserId,
        odAnchorName: anchorBot.odUserName,
        odMembers: botMembers,
        odJoinedAt: Date.now(),
    };
    
    return aiTeamEntry;
}

/**
 * Check if a user ID belongs to an AI bot
 */
export function isAIBot(userId: string): boolean {
    return userId.startsWith('ai_bot_');
}

/**
 * Check if a team is an AI team
 */
export function isAITeam(teamId: string | null): boolean {
    return teamId?.startsWith('ai_team_') || teamId?.startsWith('ai_party_') || false;
}

/**
 * Get bot config from a member (if it's a bot)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Member type from team data
export function getBotConfig(member: any): BotConfig | null {
    if (member?.isBot && member?.botConfig) {
        return member.botConfig;
    }
    return null;
}

/**
 * Calculate bot answer time based on config
 */
export function calculateBotAnswerTime(config: BotConfig): number {
    const [min, max] = config.answerTimeRange;
    return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Determine if bot answers correctly based on config and streak
 */
export function botAnswersCorrectly(config: BotConfig, currentStreak: number): boolean {
    // Streak affects accuracy slightly
    const streakBonus = Math.min(currentStreak * 0.02, 0.1); // Max 10% bonus from streak
    const effectiveAccuracy = Math.min(config.accuracy + streakBonus, 0.98);
    return Math.random() < effectiveAccuracy;
}

