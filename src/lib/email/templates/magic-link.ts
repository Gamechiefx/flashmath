/**
 * Magic Link Template
 */

import { baseTemplate, emailButton } from './base';

export function magicLinkEmailTemplate(email: string, magicUrl: string): { html: string; text: string; subject: string } {
    const subject = 'Your FlashMath login link';

    const content = `
<h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
    Sign In to FlashMath
</h1>

<p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
    Click the button below to sign in to your FlashMath account. No password needed!
</p>

<div style="text-align: center;">
    ${emailButton('Sign In to FlashMath', magicUrl, '#06b6d4')}
</div>

<p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
    This link expires in <strong style="color: #a1a1aa;">15 minutes</strong> and can only be used once.
</p>

<p style="color: #52525b; font-size: 13px; line-height: 1.6; margin: 16px 0 0 0; text-align: center;">
    If you didn't request this login link, you can safely ignore this email.
</p>

<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
    <p style="color: #52525b; font-size: 12px; line-height: 1.5; margin: 0; text-align: center;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${magicUrl}" style="color: #06b6d4; word-break: break-all;">${magicUrl}</a>
    </p>
</div>
`.trim();

    const text = `
FlashMath - Sign In Link

Click the link below to sign in to your FlashMath account:

${magicUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this login link, you can safely ignore this email.
`.trim();

    return {
        subject,
        html: baseTemplate(content, 'Your FlashMath login link'),
        text,
    };
}
