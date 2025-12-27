/**
 * Password Reset Template
 * Premium styled password reset email with secure link
 */

import { baseTemplate, emailButton, emailInfoBox } from './base';

export function passwordResetEmailTemplate(username: string, resetUrl: string): { html: string; text: string; subject: string } {
    const subject = 'Reset your FlashMath password';

    const content = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%">
    <tr>
        <td align="center" style="padding-bottom: 8px;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2)); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🔐</span>
            </div>
        </td>
    </tr>
    <tr>
        <td align="center">
            <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 16px 0 8px 0;">
                Reset Your Password
            </h1>
        </td>
    </tr>
    <tr>
        <td align="center">
            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                Hey <strong style="color: #ffffff;">${username}</strong>,
            </p>
            <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0;">
                We received a request to reset your password. Click the button below to create a new one.
            </p>
        </td>
    </tr>
</table>

<div style="text-align: center;">
    ${emailButton('Reset Password', resetUrl, '#8b5cf6')}
</div>

${emailInfoBox('⏱️', 'This link expires in <strong style="color: #ffffff;">1 hour</strong> for security.')}

${emailInfoBox('🛡️', 'If you didn\'t request this, your account is still secure. No action needed.')}

<div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);">
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        <tr>
            <td align="center">
                <p style="color: #52525b; font-size: 12px; line-height: 1.5; margin: 0;">
                    Button not working? Copy and paste this link:
                </p>
                <p style="margin: 8px 0 0 0;">
                    <a href="${resetUrl}" style="color: #06b6d4; font-size: 12px; word-break: break-all; text-decoration: none;">${resetUrl}</a>
                </p>
            </td>
        </tr>
    </table>
</div>
`.trim();

    const text = `
FLASHMATH - Reset Your Password

Hey ${username},

We received a request to reset your password.

Reset your password here:
${resetUrl}

This link expires in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your account is still secure.

---
© ${new Date().getFullYear()} FlashMath
`.trim();

    return {
        subject,
        html: baseTemplate(content, 'Reset your FlashMath password'),
        text,
    };
}
