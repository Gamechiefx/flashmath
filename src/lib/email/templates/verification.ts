/**
 * Email Verification Template
 * Premium styled verification email with 6-digit code
 */

import { baseTemplate, emailCode, emailInfoBox } from './base';

export function verificationEmailTemplate(username: string, code: string): { html: string; text: string; subject: string } {
    const subject = `${code} is your FlashMath verification code`;

    const content = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%">
    <tr>
        <td align="center" style="padding-bottom: 8px;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2)); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">✉️</span>
            </div>
        </td>
    </tr>
    <tr>
        <td align="center">
            <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 16px 0 8px 0;">
                Verify Your Email
            </h1>
        </td>
    </tr>
    <tr>
        <td align="center">
            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
                Welcome to FlashMath, <strong style="color: #ffffff;">${username}</strong>!
            </p>
            <p style="color: #71717a; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Enter this code to verify your email and activate your account.
            </p>
        </td>
    </tr>
</table>

${emailCode(code)}

${emailInfoBox('⏱️', 'This code expires in <strong style="color: #ffffff;">15 minutes</strong>. Request a new one if needed.')}

<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin-top: 24px;">
    <tr>
        <td align="center">
            <p style="color: #52525b; font-size: 13px; line-height: 1.6; margin: 0;">
                Didn't create an account? You can safely ignore this email.
            </p>
        </td>
    </tr>
</table>
`.trim();

    const text = `
FLASHMATH - Verify Your Email

Welcome to FlashMath, ${username}!

Your verification code is: ${code}

This code expires in 15 minutes.

If you didn't create an account on FlashMath, you can safely ignore this email.

---
© ${new Date().getFullYear()} FlashMath
`.trim();

    return {
        subject,
        html: baseTemplate(content, `Your verification code is ${code}`),
        text,
    };
}
