/**
 * Admin MFA Email Template
 * Security verification email for admin console access
 */

import { baseTemplate, emailCode, emailInfoBox } from './base';

export function adminMfaEmailTemplate(username: string, code: string): { html: string; text: string; subject: string } {
    const subject = `${code} - Admin Console Verification`;

    const content = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%">
    <tr>
        <td align="center" style="padding-bottom: 8px;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(168, 85, 247, 0.3)); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; border: 2px solid rgba(139, 92, 246, 0.5);">
                <span style="font-size: 32px;">🛡️</span>
            </div>
        </td>
    </tr>
    <tr>
        <td align="center">
            <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 16px 0 8px 0;">
                Admin Console Access
            </h1>
        </td>
    </tr>
    <tr>
        <td align="center">
            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                Hello <strong style="color: #a855f7;">${username}</strong>,
            </p>
            <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Enter this code to verify your identity and access the admin console.
            </p>
        </td>
    </tr>
</table>

${emailCode(code)}

${emailInfoBox('⏱️', 'This code expires in <strong style="color: #ffffff;">10 minutes</strong>. If you did not request this, please secure your account immediately.')}

${emailInfoBox('🔒', 'For security, this code can only be used once and is tied to your current session.')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin-top: 24px;">
    <tr>
        <td align="center">
            <p style="color: #52525b; font-size: 13px; line-height: 1.6; margin: 0;">
                If you didn't attempt to access the admin console, someone may have your credentials.<br>
                <strong style="color: #ef4444;">Change your password immediately.</strong>
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - Admin Console Verification

Hello ${username},

Your admin console verification code is: ${code}

This code expires in 10 minutes.

If you didn't attempt to access the admin console, someone may have your credentials. Change your password immediately.

---
© ${new Date().getFullYear()} FlashMath
`.trim();

    return {
        subject,
        html: baseTemplate(content, `Your admin verification code is ${code}`),
        text,
    };
}
