/**
 * Placement Complete Email Template
 * Celebration email when returning player finishes placement matches
 * Used when: Returning player completes all required placement matches
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

interface PlacementCompleteData {
    finalElo: number;
    startingElo: number;
    eloChange: number;
    wins: number;
    losses: number;
    averageTime: number; // seconds per question
    bestStreak: number;
}

export function placementCompleteEmailTemplate(
    username: string,
    data: PlacementCompleteData,
    arenaUrl: string = 'https://flashmath.io/arena'
): { html: string; text: string; subject: string } {
    const isPositive = data.eloChange >= 0;
    const winRate = Math.round((data.wins / (data.wins + data.losses)) * 100);
    
    const subject = isPositive 
        ? `🎯 Placement complete! You're ranked ${data.finalElo} ELO, ${username}`
        : `🎯 Placement complete! Your new rank: ${data.finalElo} ELO`;
    
    const preheader = `You've been recalibrated! ${isPositive ? 'Great job' : 'Ready'} for competitive arena matches.`;

    const heroEmoji = isPositive ? '🏆' : '🎯';
    const heroTitle = isPositive ? 'Recalibrated!' : 'Placement Complete';
    const heroColor = isPositive ? COLORS.cyan : COLORS.purple;

    const content = `
${emailHero(heroEmoji, heroTitle, `${emailUsername(username)}, you're back in action!`, heroColor)}

${emailParagraph(`You've completed your placement matches and have been <strong style="color: ${heroColor};">recalibrated</strong> to your new skill level. Time to climb the ranks!`)}

${emailInfoBox(`
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
        <tr>
            <td align="center">
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: ${heroColor};">
                    ${data.finalElo.toLocaleString()} ELO
                </p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: ${isPositive ? COLORS.green : COLORS.textMuted};">
                    ${isPositive ? '▲' : '▼'} ${Math.abs(data.eloChange)} from placement start
                </p>
            </td>
        </tr>
    </table>
`, 'info')}

${emailStats([
    { label: 'Record', value: `${data.wins}W - ${data.losses}L`, icon: '📊' },
    { label: 'Win Rate', value: `${winRate}%`, icon: '🎯' },
    { label: 'Best Streak', value: `${data.bestStreak}`, icon: '🔥' },
    { label: 'Avg Speed', value: `${data.averageTime.toFixed(1)}s`, icon: '⚡' },
])}

${emailDivider()}

${isPositive ? `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: linear-gradient(135deg, ${COLORS.cyan}20, ${COLORS.green}20); border: 1px solid ${COLORS.cyan}40; border-radius: 12px; padding: 20px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textWhite}; font-size: 16px; font-weight: 700; margin: 0;">
                🌟 Impressive comeback! You've proven your skills are sharper than ever.
            </p>
        </td>
    </tr>
</table>
` : `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px; padding: 20px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 15px; margin: 0 0 8px 0;">
                💪 Don't worry—every champion starts somewhere!
            </p>
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                Regular practice will help you climb back up in no time.
            </p>
        </td>
    </tr>
</table>
`}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 15px; line-height: 1.6; margin: 0;">
                You're now back in the <strong style="color: ${COLORS.cyan};">competitive matchmaking pool</strong>. Good luck out there!
            </p>
        </td>
    </tr>
</table>

${emailButton('Continue Playing', arenaUrl, 'primary')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                🎮 Remember: Playing regularly keeps your rank stable and prevents future decay!
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - Placement Complete!

${username}, you're back in action!

You've completed your placement matches and have been recalibrated.

YOUR NEW RANK: ${data.finalElo.toLocaleString()} ELO
${isPositive ? '▲' : '▼'} ${Math.abs(data.eloChange)} from placement start

Placement Stats:
- Record: ${data.wins}W - ${data.losses}L
- Win Rate: ${winRate}%
- Best Streak: ${data.bestStreak}
- Average Speed: ${data.averageTime.toFixed(1)}s

${isPositive 
    ? '🌟 Impressive comeback! You\'ve proven your skills are sharper than ever.'
    : '💪 Don\'t worry—every champion starts somewhere! Regular practice will help you climb back up.'
}

You're now back in the competitive matchmaking pool. Good luck out there!

Continue Playing: ${arenaUrl}

🎮 Remember: Playing regularly keeps your rank stable and prevents future decay!

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
