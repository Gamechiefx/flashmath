/**
 * New Sign-in Alert Template
 * Security notification when user signs in from a new device or location
 * Used for: Security awareness and account protection
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailInfoBox,
    emailParagraph,
    emailUsername,
    emailDivider,
    COLORS
} from './base';

interface SignInDetails {
    device?: string;
    browser?: string;
    location?: string;
    ip?: string;
    time: string;
}

export function newSigninEmailTemplate(
    username: string,
    details: SignInDetails,
    securityUrl: string = 'https://flashmath.io/settings/security'
): { html: string; text: string; subject: string } {
    const subject = 'New sign-in to your FlashMath account';
    const preheader = `New sign-in detected on ${details.device || 'a device'}. Was this you?`;

    // Format details table
    const detailsHtml = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 24px 0; background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 12px;">
    ${details.device ? `
    <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder};">
            <span style="color: ${COLORS.textMuted}; font-size: 13px;">Device</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder}; text-align: right;">
            <span style="color: ${COLORS.textWhite}; font-size: 14px;">${details.device}</span>
        </td>
    </tr>
    ` : ''}
    ${details.browser ? `
    <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder};">
            <span style="color: ${COLORS.textMuted}; font-size: 13px;">Browser</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder}; text-align: right;">
            <span style="color: ${COLORS.textWhite}; font-size: 14px;">${details.browser}</span>
        </td>
    </tr>
    ` : ''}
    ${details.location ? `
    <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder};">
            <span style="color: ${COLORS.textMuted}; font-size: 13px;">Location</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder}; text-align: right;">
            <span style="color: ${COLORS.textWhite}; font-size: 14px;">${details.location}</span>
        </td>
    </tr>
    ` : ''}
    ${details.ip ? `
    <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder};">
            <span style="color: ${COLORS.textMuted}; font-size: 13px;">IP Address</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${COLORS.cardBorder}; text-align: right;">
            <span style="color: ${COLORS.textWhite}; font-size: 14px; font-family: monospace;">${details.ip}</span>
        </td>
    </tr>
    ` : ''}
    <tr>
        <td style="padding: 12px 16px;">
            <span style="color: ${COLORS.textMuted}; font-size: 13px;">Time</span>
        </td>
        <td style="padding: 12px 16px; text-align: right;">
            <span style="color: ${COLORS.textWhite}; font-size: 14px;">${details.time}</span>
        </td>
    </tr>
</table>
`.trim();

    const content = `
${emailHero('🔔', 'New Sign-in Detected', `Hello ${emailUsername(username)},`, COLORS.amber)}

${emailParagraph('We noticed a new sign-in to your FlashMath account. Here are the details:')}

${detailsHtml}

${emailInfoBox('✅', 'If this was you, you can safely ignore this email.', 'success')}

${emailInfoBox('⚠️', 'If you didn\'t sign in, your account may be compromised. Change your password immediately.', 'warning')}

${emailDivider()}

${emailButton('Review Security Settings', securityUrl, 'secondary')}
`.trim();

    const text = `
FLASHMATH - New Sign-in Detected

Hello ${username},

We noticed a new sign-in to your FlashMath account:

${details.device ? `Device: ${details.device}` : ''}
${details.browser ? `Browser: ${details.browser}` : ''}
${details.location ? `Location: ${details.location}` : ''}
${details.ip ? `IP Address: ${details.ip}` : ''}
Time: ${details.time}

If this was you, you can safely ignore this email.

If you didn't sign in, your account may be compromised. Change your password immediately:
${securityUrl}

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
