/**
 * Severe Decay Alert Email Template
 * Critical alert when user enters severe decay phase (31+ days inactive)
 * Used when: User's inactivity causes major ranking impact
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

interface SevereDecayData {
    daysInactive: number;
    currentElo: number;
    originalElo: number;
    totalEloLost: number;
    tierAtRisk: number;
    daysUntilReturning: number;
}

export function severeDecayEmailTemplate(
    username: string,
    data: SevereDecayData,
    arenaUrl: string = 'https://flashmath.io/arena'
): { html: string; text: string; subject: string } {
    const subject = `🚨 URGENT: Severe decay active for ${username}`;
    const preheader = `Your arena rank is dropping fast! ${data.totalEloLost} ELO lost. Act now!`;

    const eloDropPercent = Math.round((data.totalEloLost / data.originalElo) * 100);

    const content = `
${emailHero('🚨', 'Severe Decay Alert', `${emailUsername(username)}, this is urgent!`, COLORS.red)}

${emailParagraph(`Your account has entered <strong style="color: ${COLORS.red};">severe decay mode</strong>. Your ranking is dropping at an accelerated rate!`)}

${emailInfoBox(`
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
        <tr>
            <td style="padding: 8px 0;">
                <p style="margin: 0; font-size: 14px; color: ${COLORS.textLight};">
                    📉 <strong style="color: ${COLORS.red};">-15 ELO per day</strong> + tier demotion risk
                </p>
            </td>
        </tr>
        <tr>
            <td style="padding: 8px 0;">
                <p style="margin: 0; font-size: 14px; color: ${COLORS.textLight};">
                    💔 You've lost <strong style="color: ${COLORS.red};">${data.totalEloLost} ELO</strong> (${eloDropPercent}% of your peak)
                </p>
            </td>
        </tr>
    </table>
`, 'error')}

${emailStats([
    { label: 'Current ELO', value: data.currentElo.toLocaleString(), icon: '📉' },
    { label: 'Peak ELO', value: data.originalElo.toLocaleString(), icon: '⭐' },
    { label: 'Days Inactive', value: `${data.daysInactive}`, icon: '📅' },
    { label: 'Tiers at Risk', value: `${data.tierAtRisk}`, icon: '🏆' },
])}

${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0; background: linear-gradient(135deg, ${COLORS.red}20, ${COLORS.purple}20); border: 2px solid ${COLORS.red}50; border-radius: 12px; padding: 20px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.yellow}; font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">
                ⚠️ ${data.daysUntilReturning} days until "Returning Player" status
            </p>
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                Returning players must complete placement matches to recalibrate their rank
            </p>
        </td>
    </tr>
</table>

${emailParagraph('Don\'t let all your hard work fade away. <strong style="color: ' + COLORS.cyan + ';">One match</strong> is all it takes to stop the bleeding and start your comeback!')}

${emailButton('🎮 Return to Arena', arenaUrl, 'primary')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 14px; margin: 0;">
                💪 We believe in you! Your math skills are still there—time to show them off.
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - SEVERE DECAY ALERT!

${username}, this is urgent!

Your account has entered SEVERE decay mode.
Your ranking is dropping at an accelerated rate!

📉 -15 ELO per day + tier demotion risk
💔 You've lost ${data.totalEloLost} ELO (${eloDropPercent}% of your peak)

Your stats:
- Current ELO: ${data.currentElo.toLocaleString()}
- Peak ELO: ${data.originalElo.toLocaleString()}
- Days Inactive: ${data.daysInactive}
- Tiers at Risk: ${data.tierAtRisk}

⚠️ ${data.daysUntilReturning} days until "Returning Player" status
(Returning players must complete placement matches to recalibrate)

Don't let all your hard work fade away.
One match is all it takes to stop the bleeding!

Return to Arena: ${arenaUrl}

💪 We believe in you! Your math skills are still there—time to show them off.

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
