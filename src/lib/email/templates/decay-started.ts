/**
 * Decay Started Email Template
 * Notification when active decay begins (15+ days inactive)
 * Used when: User enters active decay phase
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

interface DecayStartedData {
    daysInactive: number;
    currentElo: number;
    eloLostSoFar: number;
    dailyDecayRate: number;
    daysUntilSevere: number;
}

export function decayStartedEmailTemplate(
    username: string,
    data: DecayStartedData,
    arenaUrl: string = 'https://flashmath.io/arena'
): { html: string; text: string; subject: string } {
    const subject = `🔻 Your arena ELO is decaying, ${username}`;
    const preheader = `Your ELO is dropping by ${data.dailyDecayRate} points daily. Come back and stop the decay!`;

    const content = `
${emailHero('🔻', 'ELO Decay Active', `${emailUsername(username)}, your ranking needs you!`, COLORS.orange)}

${emailParagraph(`Your arena inactivity has triggered <strong style="color: ${COLORS.orange};">active ELO decay</strong>. Every day you don't play, you lose ranking points!`)}

${emailInfoBox(`
    <p style="margin: 0; font-size: 14px;">
        <span style="color: ${COLORS.orange};">📉 Losing</span> <strong style="color: ${COLORS.textWhite};">${data.dailyDecayRate} ELO per day</strong>
    </p>
`, 'warning')}

${emailStats([
    { label: 'Current ELO', value: data.currentElo.toLocaleString(), icon: '🎯' },
    { label: 'Days Inactive', value: `${data.daysInactive}`, icon: '📅' },
    { label: 'ELO Lost', value: `-${data.eloLostSoFar}`, icon: '📉' },
    { label: 'Daily Loss', value: `-${data.dailyDecayRate}`, icon: '⏰' },
])}

${emailDivider()}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0; background: linear-gradient(135deg, ${COLORS.orange}15, ${COLORS.red}15); border: 1px solid ${COLORS.orange}40; border-radius: 12px; padding: 16px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0 0 8px 0;">
                ⚠️ <strong style="color: ${COLORS.orange};">Severe decay</strong> starts in <strong style="color: ${COLORS.textWhite};">${data.daysUntilSevere} days</strong>
            </p>
            <p style="color: ${COLORS.textMuted}; font-size: 12px; margin: 0;">
                Severe decay: -15 ELO/day + potential tier demotion
            </p>
        </td>
    </tr>
</table>

${emailParagraph('The good news? <strong>One match is all it takes</strong> to stop the decay and protect your hard-earned rank!')}

${emailButton('Stop Decay Now', arenaUrl, 'primary')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 20px 0; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px; padding: 16px;">
    <tr>
        <td align="center">
            <p style="color: ${COLORS.textMuted}; font-size: 13px; margin: 0;">
                🏆 <strong>Remember:</strong> Your skills are still sharp! Come back and prove it.
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - ELO Decay Active!

${username}, your ranking needs you!

Your arena inactivity has triggered active ELO decay.
Every day you don't play, you lose ranking points!

📉 Losing ${data.dailyDecayRate} ELO per day

Your stats:
- Current ELO: ${data.currentElo.toLocaleString()}
- Days Inactive: ${data.daysInactive}
- ELO Lost So Far: -${data.eloLostSoFar}
- Daily Loss: -${data.dailyDecayRate}

⚠️ Severe decay starts in ${data.daysUntilSevere} days
(Severe decay: -15 ELO/day + potential tier demotion)

The good news? One match is all it takes to stop the decay!

Stop Decay Now: ${arenaUrl}

🏆 Remember: Your skills are still sharp! Come back and prove it.

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
