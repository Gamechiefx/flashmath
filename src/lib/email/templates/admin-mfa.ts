/**
 * Admin MFA Email Template
 * Security verification email for admin console access
 * Used when: Admin logs in and requires MFA verification
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

export function adminMfaEmailTemplate(
    username: string, 
    code: string
): { html: string; text: string; subject: string } {
    const subject = `${code} - Admin Console Verification`;
    const preheader = `Your FlashMath admin verification code is ${code}. Don't share this code.`;

    const content = `
${emailHero('🛡️', 'Admin Console Access', `Hello ${emailUsername(username)},`, COLORS.purple)}

${emailParagraph('Enter this code to verify your identity and access the admin console.')}

${emailCode(code, 'Admin verification code')}

${emailInfoBox('⏱️', 'This code expires in <strong>10 minutes</strong>. If you did not request this, please secure your account immediately.', 'warning')}

${emailInfoBox('🔒', 'For security, this code can only be used <strong>once</strong> and is tied to your current session.', 'security')}

${emailFooterNote('If you didn\'t attempt to access the admin console, someone may have your credentials.<br><strong style="color: ' + COLORS.red + ';">Change your password immediately.</strong>')}
`.trim();

    const text = `
FLASHMATH - Admin Console Verification

Hello ${username},

Your admin console verification code is: ${code}

This code expires in 10 minutes.

If you didn't attempt to access the admin console, someone may have your credentials. Change your password immediately.

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
