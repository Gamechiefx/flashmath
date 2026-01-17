/**
 * Email Templates Index
 * Central export for all FlashMath email templates
 */

// Base template components
export {
    baseTemplate,
    emailHero,
    emailButton,
    emailCode,
    emailInfoBox,
    emailDivider,
    emailStats,
    emailFeatureBox,
    emailParagraph,
    emailUsername,
    emailLinkFallback,
    emailFooterNote,
    COLORS,
} from './base';

// Authentication & Security Templates
export { verificationEmailTemplate } from './verification';
export { passwordResetEmailTemplate } from './password-reset';
export { magicLinkEmailTemplate } from './magic-link';
export { adminMfaEmailTemplate } from './admin-mfa';
export { newSigninEmailTemplate } from './new-signin';

// User Journey Templates
export { welcomeEmailTemplate } from './welcome';

// Engagement & Gamification Templates
export { leaguePromotionEmailTemplate } from './league-promotion';
export { achievementEmailTemplate } from './achievement';
export { weeklyStatsEmailTemplate } from './weekly-stats';

// Decay & Returning Player Templates
export { decayWarningEmailTemplate } from './decay-warning';
export { decayStartedEmailTemplate } from './decay-started';
export { severeDecayEmailTemplate } from './severe-decay';
export { returningPlayerEmailTemplate } from './returning-player';
export { placementCompleteEmailTemplate } from './placement-complete';
