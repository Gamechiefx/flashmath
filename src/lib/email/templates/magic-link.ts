/**
 * Magic Link Template
 * Premium styled passwordless login email
 */

import { baseTemplate, emailButton, emailInfoBox } from './base';

export function magicLinkEmailTemplate(email: string, magicUrl: string): { html: string; text: string; subject: string } {
    const subject = 'Sign in to FlashMath';

    const content = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%">
    <tr>
        <td align="center" style="padding-bottom: 8px;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(16, 185, 129, 0.2)); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🚀</span>
            </div>
        </td>
    </tr>
    <tr>
        <td align="center">
            <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 16px 0 8px 0;">
                Sign In to FlashMath
            </h1>
        </td>
    </tr>
    <tr>
        <td align="center">
            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                Click the button below to securely sign in to your account.
            </p>
            <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0;">
                No password needed — this is a secure magic link.
            </p>
        </td>
    </tr>
</table>

<div style="text-align: center;">
    ${emailButton('Sign In Now', magicUrl, '#06b6d4')}
</div>

${emailInfoBox('⏱️', 'This link expires in <strong style="color: #ffffff;">15 minutes</strong> and can only be used once.')}

${emailInfoBox('🛡️', 'If you didn\'t request this link, someone may have entered your email by mistake. You can ignore this.')}

<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);">
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        <tr>
            <td align="center">
                <p style="color: #52525b; font-size: 12px; line-height: 1.5; margin: 0;">
                    Button not working? Copy and paste this link:
                </p>
                <p style="margin: 8px 0 0 0;">
                    <a href="${magicUrl}" style="color: #06b6d4; font-size: 12px; word-break: break-all; text-decoration: none;">${magicUrl}</a>
                </p>
            </td>
        </tr>
    </table>
</div>
`.trim();

    const text = `
FLASHMATH - Sign In

Click this link to securely sign in to FlashMath:
${magicUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

---
© ${new Date().getFullYear()} FlashMath
`.trim();

    return {
        subject,
        html: baseTemplate(content, 'Sign in to FlashMath with this secure link'),
        text,
    };
}
