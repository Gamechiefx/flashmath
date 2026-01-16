/**
 * Achievement Unlocked Email Template
 * Celebration email when user unlocks a new achievement
 * Used when: User completes an achievement milestone
 */

import { 
    baseTemplate, 
    emailHero, 
    emailButton, 
    emailParagraph,
    emailUsername,
    emailDivider,
    emailInfoBox,
    COLORS
} from './base';

// Achievement rarity configuration
const RARITY = {
    common: { name: 'Common', color: '#71717a', glow: 'none' },
    uncommon: { name: 'Uncommon', color: '#22c55e', glow: '0 0 20px #22c55e40' },
    rare: { name: 'Rare', color: '#3b82f6', glow: '0 0 20px #3b82f640' },
    epic: { name: 'Epic', color: '#a855f7', glow: '0 0 30px #a855f750' },
    legendary: { name: 'Legendary', color: '#f59e0b', glow: '0 0 40px #f59e0b60' },
} as const;

type AchievementRarity = keyof typeof RARITY;

interface Achievement {
    name: string;
    description: string;
    icon: string;
    rarity: AchievementRarity;
    xpReward?: number;
    unlockedAt?: string;
}

export function achievementEmailTemplate(
    username: string,
    achievement: Achievement,
    profileUrl: string = 'https://flashmath.io/profile'
): { html: string; text: string; subject: string } {
    const rarity = RARITY[achievement.rarity];
    const subject = `🏆 Achievement Unlocked: ${achievement.name}`;
    const preheader = `You unlocked "${achievement.name}"! ${achievement.xpReward ? `+${achievement.xpReward} XP` : ''}`;

    // Achievement badge display
    const badgeHtml = `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 28px 0;">
    <tr>
        <td align="center">
            <div style="display: inline-block; background: linear-gradient(135deg, ${rarity.color}20, ${COLORS.purple}15); border: 3px solid ${rarity.color}60; border-radius: 24px; padding: 32px 48px; box-shadow: ${rarity.glow};">
                <div style="font-size: 64px; line-height: 1; margin-bottom: 16px;">${achievement.icon}</div>
                <h2 style="color: ${COLORS.textWhite}; font-size: 22px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.5px;">${achievement.name}</h2>
                <p style="color: ${COLORS.textLight}; font-size: 14px; margin: 0 0 12px 0; max-width: 280px;">${achievement.description}</p>
                <div style="display: inline-block; background: ${rarity.color}20; border: 1px solid ${rarity.color}40; border-radius: 100px; padding: 4px 14px;">
                    <span style="color: ${rarity.color}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${rarity.name}</span>
                </div>
            </div>
        </td>
    </tr>
</table>
`.trim();

    const content = `
${emailHero('🏆', 'Achievement Unlocked!', `Way to go, ${emailUsername(username)}!`, rarity.color)}

${badgeHtml}

${achievement.xpReward ? `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td align="center">
            <div style="display: inline-block; background: linear-gradient(135deg, ${COLORS.cyan}15, ${COLORS.green}15); border: 1px solid ${COLORS.cyan}30; border-radius: 12px; padding: 12px 24px;">
                <span style="color: ${COLORS.cyan}; font-size: 18px; font-weight: 700;">+${achievement.xpReward.toLocaleString()} XP</span>
            </div>
        </td>
    </tr>
</table>
` : ''}

${emailDivider()}

${emailInfoBox('🎯', 'Keep unlocking achievements to earn XP, climb the leaderboards, and collect exclusive rewards!', 'success')}

${emailButton('View All Achievements', profileUrl, 'primary')}
`.trim();

    const text = `
FLASHMATH - Achievement Unlocked!

Way to go, ${username}!

🏆 ${achievement.name}
${achievement.description}

Rarity: ${rarity.name}
${achievement.xpReward ? `XP Reward: +${achievement.xpReward}` : ''}
${achievement.unlockedAt ? `Unlocked: ${achievement.unlockedAt}` : ''}

Keep unlocking achievements to earn XP, climb the leaderboards, and collect exclusive rewards!

View All Achievements: ${profileUrl}

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
