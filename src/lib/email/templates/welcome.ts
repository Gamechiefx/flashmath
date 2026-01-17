/**
 * Welcome Email Template
 * Sent after user successfully verifies their email
 * Introduces them to FlashMath features and gets them started
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailFeatureBox,
    emailParagraph,
    emailUsername,
    emailDivider,
    COLORS
} from './base';

export function welcomeEmailTemplate(
    username: string,
    dashboardUrl: string = 'https://flashmath.io/dashboard'
): { html: string; text: string; subject: string } {
    const subject = `Welcome to FlashMath, ${username}! 🎉`;
    const preheader = 'Your account is ready! Start training your math skills and climb the leaderboards.';

    const content = `
${emailHero('🎉', `Welcome, ${emailUsername(username)}!`, 'Your FlashMath journey begins now.', COLORS.cyan)}

${emailParagraph('You\'re all set! Your email is verified and your account is ready to go. Here\'s what you can do:')}

${emailFeatureBox('🧮', 'Practice Mode', 'Train with customizable sessions. Choose difficulty, operations, and track your progress.', COLORS.cyan)}

${emailFeatureBox('⚔️', 'Arena Battles', 'Challenge players in real-time matches. Climb the ELO rankings and prove your skills.', COLORS.purple)}

${emailFeatureBox('🏆', 'Leagues & Ranks', 'Compete weekly to advance through Neon, Plasma, Quantum, Nova, and Apex leagues.', COLORS.amber)}

${emailFeatureBox('🎨', 'Customization', 'Unlock themes, particles, and titles. Make your profile uniquely yours.', COLORS.green)}

${emailDivider()}

${emailButton('Start Training', dashboardUrl, 'primary')}

${emailParagraph('See you in the arena!')}
`.trim();

    const text = `
FLASHMATH - Welcome, ${username}!

Your FlashMath journey begins now. Your email is verified and your account is ready to go!

Here's what you can do:

🧮 PRACTICE MODE
Train with customizable sessions. Choose difficulty, operations, and track your progress.

⚔️ ARENA BATTLES
Challenge players in real-time matches. Climb the ELO rankings and prove your skills.

🏆 LEAGUES & RANKS
Compete weekly to advance through Neon, Plasma, Quantum, Nova, and Apex leagues.

🎨 CUSTOMIZATION
Unlock themes, particles, and titles. Make your profile uniquely yours.

Start Training: ${dashboardUrl}

See you in the arena!

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
