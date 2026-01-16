/**
 * League Promotion Email Template
 * Celebration email when user advances to a higher league
 * Used when: User's weekly XP qualifies them for promotion
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailStats,
    emailParagraph,
    emailUsername,
    emailDivider,
    COLORS
} from './base';

// League configuration with themed colors
const LEAGUES = {
    neon: { name: 'Neon', icon: '💫', color: '#22d3ee', next: 'Plasma' },
    plasma: { name: 'Plasma', icon: '🔮', color: '#a855f7', next: 'Quantum' },
    quantum: { name: 'Quantum', icon: '⚛️', color: '#3b82f6', next: 'Nova' },
    nova: { name: 'Nova', icon: '🌟', color: '#f59e0b', next: 'Apex' },
    apex: { name: 'Apex', icon: '👑', color: '#ef4444', next: null },
} as const;

type LeagueTier = keyof typeof LEAGUES;

interface PromotionStats {
    weeklyXp: number;
    rank: number;
    totalPlayers: number;
    winRate?: number;
}

export function leaguePromotionEmailTemplate(
    username: string,
    newLeague: LeagueTier,
    stats: PromotionStats,
    leaderboardUrl: string = 'https://flashmath.io/leaderboard'
): { html: string; text: string; subject: string } {
    const league = LEAGUES[newLeague];
    const subject = `${league.icon} You've been promoted to ${league.name} League!`;
    const preheader = `Congratulations! You advanced to ${league.name} League. Keep climbing!`;

    // Build stats display
    const statsArray = [
        { label: 'Weekly XP', value: stats.weeklyXp.toLocaleString(), icon: '⚡' },
        { label: 'Rank', value: `#${stats.rank}`, icon: '🏅' },
    ];
    
    if (stats.winRate !== undefined) {
        statsArray.push({ label: 'Win Rate', value: `${stats.winRate}%`, icon: '🎯' });
    }

    const content = `
${emailHero(league.icon, `${league.name} League!`, `Congratulations ${emailUsername(username)}!`, league.color)}

${emailParagraph('Your hard work has paid off! You\'ve been promoted to a higher league. Here\'s how you performed this week:')}

${emailStats(statsArray)}

${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 15px; line-height: 1.6; margin: 0;">
                You finished in the <strong style="color: ${league.color};">top ${Math.round((stats.rank / stats.totalPlayers) * 100)}%</strong> of ${stats.totalPlayers.toLocaleString()} players!
            </p>
        </td>
    </tr>
</table>

${league.next ? `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px; padding: 16px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 14px; margin: 0;">
                Keep climbing! Next up: <strong style="color: ${COLORS.textWhite};">${league.next} League</strong> ${LEAGUES[league.next.toLowerCase() as LeagueTier]?.icon || ''}
            </p>
        </td>
    </tr>
</table>
` : `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: linear-gradient(135deg, ${league.color}20, ${COLORS.purple}20); border: 2px solid ${league.color}40; border-radius: 12px; padding: 16px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textWhite}; font-size: 16px; font-weight: 700; margin: 0;">
                👑 You've reached the highest league! You're among the elite!
            </p>
        </td>
    </tr>
</table>
`}

${emailButton('View Leaderboard', leaderboardUrl, 'primary')}
`.trim();

    const text = `
FLASHMATH - League Promotion!

Congratulations ${username}!

You've been promoted to ${league.name} League! ${league.icon}

Your stats this week:
- Weekly XP: ${stats.weeklyXp.toLocaleString()}
- Rank: #${stats.rank}
${stats.winRate !== undefined ? `- Win Rate: ${stats.winRate}%` : ''}

You finished in the top ${Math.round((stats.rank / stats.totalPlayers) * 100)}% of ${stats.totalPlayers.toLocaleString()} players!

${league.next ? `Keep climbing! Next up: ${league.next} League` : 'You\'ve reached the highest league! You\'re among the elite!'}

View Leaderboard: ${leaderboardUrl}

---
© ${new Date().getFullYear()} FlashMath
https://flashmath.io
`.trim();

    return {
        subject,
        html: baseTemplate(content, preheader),
        text,
    };
}
