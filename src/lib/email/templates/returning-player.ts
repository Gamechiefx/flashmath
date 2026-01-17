/**
 * Returning Player Welcome Email Template
 * Welcome back email when user is flagged as returning player (60+ days)
 * Used when: User returns after extended absence
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailStats,
    emailParagraph,
    emailUsername,
    emailInfoBox,
    emailDivider,
    COLORS
} from './base';

interface ReturningPlayerData {
    daysAway: number;
    previousElo: number;
    currentElo: number;
    totalDecayed: number;
    placementMatchesRequired: number;
}

export function returningPlayerEmailTemplate(
    username: string,
    data: ReturningPlayerData,
    arenaUrl: string = 'https://flashmath.io/arena'
): { html: string; text: string; subject: string } {
    const subject = `🎉 Welcome back to FlashMath, ${username}!`;
    const preheader = `It's been ${data.daysAway} days! Complete ${data.placementMatchesRequired} placement matches to recalibrate your rank.`;

    const content = `
${emailHero('🎉', 'Welcome Back!', `${emailUsername(username)}, we missed you!`, COLORS.purple)}

${emailParagraph(`It's been <strong style="color: ${COLORS.purple};">${data.daysAway} days</strong> since your last arena match. A lot can change—including your math skills! That's why we have a quick recalibration process to ensure fair matchmaking.`)}

${emailInfoBox(`
    <p style="margin: 0; font-size: 15px;">
        🎮 Complete <strong style="color: ${COLORS.purple};">${data.placementMatchesRequired} placement matches</strong> to recalibrate your rank
    </p>
`, 'info')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Here's what happened while you were away:
            </p>
        </td>
    </tr>
</table>

${emailStats([
    { label: 'Peak ELO', value: data.previousElo.toLocaleString(), icon: '⭐' },
    { label: 'Current ELO', value: data.currentElo.toLocaleString(), icon: '📊' },
    { label: 'ELO Decayed', value: `-${data.totalDecayed}`, icon: '📉' },
    { label: 'Placements', value: `0/${data.placementMatchesRequired}`, icon: '🎯' },
])}

${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: linear-gradient(135deg, ${COLORS.purple}15, ${COLORS.cyan}15); border: 1px solid ${COLORS.purple}40; border-radius: 12px; padding: 20px;">
    <tr>
        <td>
            <p style="color: ${COLORS.textWhite}; font-size: 15px; font-weight: 700; margin: 0 0 12px 0; text-align: center;">
                ✨ Placement Match Benefits
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
                <tr>
                    <td style="padding: 4px 0;">
                        <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0;">
                            🚀 <strong style="color: ${COLORS.cyan};">2x ELO gains</strong> during placement matches
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 4px 0;">
                        <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0;">
                            🎯 Matched with similar returning players
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 4px 0;">
                        <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0;">
                            📈 Quick recalibration to your true skill level
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>

${emailParagraph('Your math skills may be rustier—or sharper—than before. Let\'s find out together!')}

${emailButton('Start Placement Matches', arenaUrl, 'primary')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                💡 <strong>Pro tip:</strong> Warm up with a few practice sessions before jumping into placements!
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - Welcome Back!

${username}, we missed you!

It's been ${data.daysAway} days since your last arena match.

Complete ${data.placementMatchesRequired} placement matches to recalibrate your rank.

What happened while you were away:
- Peak ELO: ${data.previousElo.toLocaleString()}
- Current ELO: ${data.currentElo.toLocaleString()}
- ELO Decayed: -${data.totalDecayed}
- Placements: 0/${data.placementMatchesRequired}

✨ Placement Match Benefits:
- 2x ELO gains during placement matches
- Matched with similar returning players
- Quick recalibration to your true skill level

Your math skills may be rustier—or sharper—than before. Let's find out together!

Start Placement Matches: ${arenaUrl}

💡 Pro tip: Warm up with a few practice sessions before jumping into placements!

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
