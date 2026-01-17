/**
 * Decay Warning Email Template
 * First warning when user enters decay warning phase (8+ days inactive)
 * Used when: User hasn't played arena for 8 days
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

interface DecayWarningData {
    daysInactive: number;
    currentElo: number;
    eloAtRisk: number;
    daysUntilDecay: number;
}

export function decayWarningEmailTemplate(
    username: string,
    data: DecayWarningData,
    arenaUrl: string = 'https://flashmath.io/arena'
): { html: string; text: string; subject: string } {
    const subject = `⚠️ Your arena rank is at risk, ${username}!`;
    const preheader = `You haven't played in ${data.daysInactive} days. Play now to prevent ELO decay!`;

    const content = `
${emailHero('⚠️', 'Decay Warning', `Hey ${emailUsername(username)}, we miss you!`, COLORS.yellow)}

${emailParagraph(`You haven't played an arena match in <strong style="color: ${COLORS.yellow};">${data.daysInactive} days</strong>. Your ranking is about to enter decay mode!`)}

${emailInfoBox(`
    <p style="margin: 0; font-size: 14px;">
        <strong style="color: ${COLORS.yellow};">⏰ ${data.daysUntilDecay} days</strong> until your ELO starts decaying
    </p>
`, 'warning')}

${emailStats([
    { label: 'Current ELO', value: data.currentElo.toLocaleString(), icon: '🎯' },
    { label: 'Days Inactive', value: `${data.daysInactive}`, icon: '📅' },
    { label: 'ELO at Risk', value: `-${data.eloAtRisk}`, icon: '⚠️' },
])}

${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 15px; line-height: 1.6; margin: 0;">
                Play just <strong style="color: ${COLORS.cyan};">one arena match</strong> to reset the decay timer and protect your ranking!
            </p>
        </td>
    </tr>
</table>

${emailButton('Play Now & Stop Decay', arenaUrl, 'primary')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px; padding: 16px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                💡 <strong>Tip:</strong> Regular practice not only prevents decay but improves your matchmaking confidence score!
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - Decay Warning!

Hey ${username}, we miss you!

You haven't played an arena match in ${data.daysInactive} days.
Your ranking is about to enter decay mode!

⏰ ${data.daysUntilDecay} days until your ELO starts decaying

Your stats:
- Current ELO: ${data.currentElo.toLocaleString()}
- Days Inactive: ${data.daysInactive}
- ELO at Risk: -${data.eloAtRisk}

Play just one arena match to reset the decay timer and protect your ranking!

Play Now: ${arenaUrl}

💡 Tip: Regular practice not only prevents decay but improves your matchmaking confidence score!

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
