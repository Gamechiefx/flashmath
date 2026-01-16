/**
 * Password Reset Template
 * Premium styled password reset email with secure link
 * Used when: User requests a password reset
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailInfoBox, 
    emailLinkFallback,
    emailParagraph,
    emailUsername,
    COLORS
} from './base';

export function passwordResetEmailTemplate(
    username: string, 
    resetUrl: string
): { html: string; text: string; subject: string } {
    const subject = 'Reset your FlashMath password';
    const preheader = 'You requested a password reset. Click the link to create a new password.';

    const content = `
${emailHero('🔐', 'Reset Your Password', `Hey ${emailUsername(username)},`, COLORS.purple)}

${emailParagraph('We received a request to reset your password. Click the button below to create a new one.')}

${emailButton('Reset Password', resetUrl, 'secondary')}

${emailInfoBox('⏱️', 'This link expires in <strong>1 hour</strong> for your security.', 'warning')}

${emailInfoBox('🛡️', 'If you didn\'t request this, your account is still secure. No action needed.', 'security')}

${emailLinkFallback(resetUrl)}
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
https://flashmath.io
`.trim();

    return {
        subject,
        html: baseTemplate(content, preheader),
        text,
    };
}
