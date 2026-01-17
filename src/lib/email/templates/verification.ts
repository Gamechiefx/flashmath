/**
 * Email Verification Template
 * Premium styled verification email with 6-digit code
 * Used when: User registers a new account
 */

import { 
    baseTemplate, 
    emailHero, 
    emailCode, 
    emailInfoBox, 
    emailFooterNote,
    emailParagraph,
    emailUsername,
    COLORS
} from './base';

export function verificationEmailTemplate(
    username: string, 
    code: string
): { html: string; text: string; subject: string } {
    const subject = `${code} is your FlashMath verification code`;
    const preheader = `Welcome to FlashMath! Use code ${code} to verify your email.`;

    const content = `
${emailHero('✉️', 'Verify Your Email', `Welcome to FlashMath, ${emailUsername(username)}!`, COLORS.cyan)}

${emailParagraph('Enter this code to verify your email and unlock your account.')}

${emailCode(code, 'Your verification code')}

${emailInfoBox('⏱️', 'This code expires in <strong>15 minutes</strong>. Request a new one if needed.', 'info')}

${emailInfoBox('🎮', 'Once verified, you\'ll unlock <strong>Practice Mode</strong>, <strong>Achievements</strong>, and <strong>Leaderboards</strong>!', 'success')}

${emailFooterNote('Didn\'t create an account? You can safely ignore this email.')}
`.trim();

    const text = `
FLASHMATH - Verify Your Email

Welcome to FlashMath, ${username}!

Your verification code is: ${code}

This code expires in 15 minutes. Request a new one if needed.

Once verified, you'll unlock Practice Mode, Achievements, and Leaderboards!

If you didn't create an account on FlashMath, you can safely ignore this email.

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
