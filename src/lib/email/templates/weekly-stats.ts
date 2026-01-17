/**
 * Weekly Stats Summary Email Template
 * Weekly performance report sent to active users
 * Used when: End of week stats summary (e.g., Sunday night)
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailStats,
    emailDivider,
    emailFeatureBox,
    COLORS
} from './base';

interface WeeklyStats {
    totalSessions: number;
    problemsSolved: number;
    accuracy: number;
    averageSpeed: number; // in seconds
    bestStreak: number;
    xpEarned: number;
    leagueRank?: number;
    leagueName?: string;
    leagueIcon?: string;
    improvement?: {
        accuracy?: number; // positive = improved, negative = declined
        speed?: number;
    };
}

interface WeeklyChallenge {
    name: string;
    progress: number; // percentage 0-100
    reward?: string;
}

export function weeklyStatsEmailTemplate(
    username: string,
    stats: WeeklyStats,
    challenges?: WeeklyChallenge[],
    dashboardUrl: string = 'https://flashmath.io/dashboard'
): { html: string; text: string; subject: string } {
    const subject = `📊 Your FlashMath Week in Review`;
    const preheader = `You solved ${stats.problemsSolved} problems with ${stats.accuracy}% accuracy this week!`;

    // Format speed nicely
    const formatSpeed = (seconds: number) => {
        if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
        return `${seconds.toFixed(1)}s`;
    };

    // Improvement indicators
    const getImprovementText = (value: number | undefined, label: string, isSpeedBetter: boolean = false) => {
        if (value === undefined) return '';
        const improved = isSpeedBetter ? value < 0 : value > 0;
        const icon = improved ? '📈' : '📉';
        const color = improved ? COLORS.green : COLORS.red;
        const sign = value > 0 ? '+' : '';
        return `<span style="color: ${color};">${icon} ${sign}${Math.abs(value).toFixed(1)}% ${label}</span>`;
    };

    // Primary stats row
    const primaryStats = [
        { label: 'Problems', value: stats.problemsSolved.toLocaleString(), icon: '🧮' },
        { label: 'Accuracy', value: `${stats.accuracy}%`, icon: '🎯' },
        { label: 'XP Earned', value: stats.xpEarned.toLocaleString(), icon: '⚡' },
    ];

    // Secondary stats row
    const secondaryStats = [
        { label: 'Sessions', value: stats.totalSessions.toString(), icon: '📚' },
        { label: 'Avg Speed', value: formatSpeed(stats.averageSpeed), icon: '⏱️' },
        { label: 'Best Streak', value: stats.bestStreak.toString(), icon: '🔥' },
    ];

    // Challenges progress
    const challengesHtml = challenges && challenges.length > 0 ? `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td>
            <h3 style="color: ${COLORS.textWhite}; font-size: 16px; font-weight: 700; margin: 0 0 16px 0;">Weekly Challenges</h3>
        </td>
    </tr>
    ${challenges.map(challenge => `
    <tr>
        <td style="padding: 8px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
                <tr>
                    <td>
                        <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0 0 6px 0;">${challenge.name}</p>
                        <div style="background: ${COLORS.bgCard}; border-radius: 8px; height: 8px; overflow: hidden;">
                            <div style="background: linear-gradient(90deg, ${COLORS.cyan}, ${COLORS.purple}); height: 100%; width: ${Math.min(challenge.progress, 100)}%; border-radius: 8px;"></div>
                        </div>
                    </td>
                    <td style="width: 60px; text-align: right; vertical-align: top;">
                        <span style="color: ${challenge.progress >= 100 ? COLORS.green : COLORS.textMuted}; font-size: 13px; font-weight: 600;">${challenge.progress}%</span>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    `).join('')}
</table>
` : '';

    const content = `
${emailHero('📊', 'Your Week in Review', `Great work this week, <strong style="color: #ffffff;">${username}</strong>!`, COLORS.cyan)}

${emailStats(primaryStats)}

${emailStats(secondaryStats)}

${stats.improvement && (stats.improvement.accuracy !== undefined || stats.improvement.speed !== undefined) ? `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0;">
                Week over week: 
                ${getImprovementText(stats.improvement.accuracy, 'accuracy')}
                ${stats.improvement.accuracy !== undefined && stats.improvement.speed !== undefined ? ' · ' : ''}
                ${getImprovementText(stats.improvement.speed, 'speed', true)}
            </p>
        </td>
    </tr>
</table>
` : ''}

${stats.leagueName ? `
${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center" style="background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px; padding: 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">${stats.leagueIcon || '🏆'}</div>
            <p style="color: ${COLORS.textWhite}; font-size: 18px; font-weight: 700; margin: 0 0 4px 0;">${stats.leagueName} League</p>
            ${stats.leagueRank ? `<p style="color: ${COLORS.textMuted}; font-size: 14px; margin: 0;">Current Rank: #${stats.leagueRank}</p>` : ''}
        </td>
    </tr>
</table>
` : ''}

${challengesHtml ? `${emailDivider()}${challengesHtml}` : ''}

${emailDivider()}

${emailFeatureBox('💪', 'Keep the momentum!', 'Consistent practice is the key to mastery. See you in the arena!', COLORS.green)}

${emailButton('Continue Training', dashboardUrl, 'primary')}
`.trim();

    const text = `
FLASHMATH - Your Week in Review

Great work this week, ${username}!

YOUR STATS:
- Problems Solved: ${stats.problemsSolved.toLocaleString()}
- Accuracy: ${stats.accuracy}%
- XP Earned: ${stats.xpEarned.toLocaleString()}
- Sessions: ${stats.totalSessions}
- Average Speed: ${formatSpeed(stats.averageSpeed)}
- Best Streak: ${stats.bestStreak}

${stats.leagueName ? `LEAGUE: ${stats.leagueName}${stats.leagueRank ? ` (Rank #${stats.leagueRank})` : ''}` : ''}

${challenges && challenges.length > 0 ? `WEEKLY CHALLENGES:\n${challenges.map(c => `- ${c.name}: ${c.progress}%`).join('\n')}` : ''}

Keep the momentum! Consistent practice is the key to mastery.

Continue Training: ${dashboardUrl}

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
