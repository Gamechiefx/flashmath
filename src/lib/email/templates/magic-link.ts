/**
 * Magic Link Template
 * Premium styled passwordless login email
 * Used when: User requests magic link sign-in
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailInfoBox, 
    emailLinkFallback,
    emailParagraph,
    COLORS
} from './base';

export function magicLinkEmailTemplate(
    email: string, 
    magicUrl: string
): { html: string; text: string; subject: string } {
    const subject = 'Sign in to FlashMath';
    const preheader = 'Click the link to securely sign in to your FlashMath account.';

    const content = `
${emailHero('🚀', 'Sign In to FlashMath', 'Click the button below to securely sign in.', COLORS.cyan)}

${emailParagraph('No password needed — this is a secure magic link just for you.')}

${emailButton('Sign In Now', magicUrl, 'primary')}

${emailInfoBox('⏱️', 'This link expires in <strong>15 minutes</strong> and can only be used once.', 'info')}

${emailInfoBox('🛡️', 'If you didn\'t request this link, someone may have entered your email by mistake. You can ignore this.', 'security')}

${emailLinkFallback(magicUrl)}
`.trim();

    const text = `
FLASHMATH - Sign In

Click this link to securely sign in to FlashMath:
${magicUrl}

This link expires in 15 minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

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
