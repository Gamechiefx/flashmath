/**
 * Password Reset Template
 */

import { baseTemplate, emailButton } from './base';

export function passwordResetEmailTemplate(username: string, resetUrl: string): { html: string; text: string; subject: string } {
    const subject = 'Reset your FlashMath password';

    const content = `
<h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
    Reset Your Password
</h1>

<p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0; text-align: center;">
    Hey <strong style="color: #ffffff;">${username}</strong>,
</p>

<p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
    We received a request to reset your password. Click the button below to create a new password.
</p>

<div style="text-align: center;">
    ${emailButton('Reset Password', resetUrl, '#8b5cf6')}
</div>

<p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
    This link expires in <strong style="color: #a1a1aa;">1 hour</strong>.
</p>

<p style="color: #52525b; font-size: 13px; line-height: 1.6; margin: 16px 0 0 0; text-align: center;">
    If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
</p>

<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
    <p style="color: #52525b; font-size: 12px; line-height: 1.5; margin: 0; text-align: center;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetUrl}" style="color: #06b6d4; word-break: break-all;">${resetUrl}</a>
    </p>
</div>
`.trim();

    const text = `
FlashMath - Reset Your Password

Hey ${username},

We received a request to reset your password. Visit the link below to create a new password:

${resetUrl}

This link expires in 1 hour.

If you didn't request a password reset, you can safely ignore this email.
`.trim();

    return {
        subject,
        html: baseTemplate(content, 'Reset your FlashMath password'),
        text,
    };
}
