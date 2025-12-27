/**
 * Email Verification Template
 */

import { baseTemplate, emailCode } from './base';

export function verificationEmailTemplate(username: string, code: string): { html: string; text: string; subject: string } {
    const subject = `Your FlashMath verification code: ${code}`;

    const content = `
<h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
    Verify Your Email
</h1>

<p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0; text-align: center;">
    Hey <strong style="color: #ffffff;">${username}</strong>,
</p>

<p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
    Enter the code below to verify your email address and complete your registration.
</p>

${emailCode(code)}

<p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
    This code expires in <strong style="color: #a1a1aa;">15 minutes</strong>.
</p>

<p style="color: #52525b; font-size: 13px; line-height: 1.6; margin: 16px 0 0 0; text-align: center;">
    If you didn't create an account on FlashMath, you can safely ignore this email.
</p>
`.trim();

    const text = `
FlashMath - Verify Your Email

Hey ${username},

Your verification code is: ${code}

This code expires in 15 minutes.

If you didn't create an account on FlashMath, you can safely ignore this email.
`.trim();

    return {
        subject,
        html: baseTemplate(content, `Your verification code is ${code}`),
        text,
    };
}
