/**
 * Dual-Tone Icon Library
 * Based on Refactoring UI icon set
 * 
 * Usage:
 * ```tsx
 * import { DtTrophy, ICON_THEMES } from '@/components/icons/dual-tone';
 * 
 * // Basic usage (uses currentColor)
 * <DtTrophy size={32} />
 * 
 * // With theme
 * <DtTrophy 
 *   primaryColor={ICON_THEMES.amber.primary}
 *   secondaryColor={ICON_THEMES.amber.secondary}
 *   size={48}
 * />
 * 
 * // Custom colors
 * <DtTrophy 
 *   primaryColor="#f59e0b"
 *   secondaryColor="#fbbf24"
 *   size={64}
 * />
 * ```
 */

// Base types and utilities
export {
    createDualToneIcon,
    dualToneStyles,
    ICON_THEMES,
    type DualToneIconProps,
    type IconTheme,
} from './base';

// Icon components
export {
    // Achievement & Reward
    DtTrophy,
    DtStar,
    DtCertificate,
    
    // Action & Power
    DtBolt,
    DtTarget,
    DtLaunch,
    DtTrendingUp,
    
    // Tool & Utility
    DtCalculator,
    DtDashboard,
    DtCog,
    
    // Communication
    DtMail,
    DtNotification,
    
    // Security
    DtLock,
    DtSecurityCheck,
    
    // User & Profile
    DtUserCircle,
    
    // League & Competition
    DtFlag,
    DtChart,
    
    // Misc
    DtHeart,
    DtCheck,
    DtTime,
    DtHelp,
    DtInformation,
} from './icons';

// Icon name to component mapping for dynamic usage
import {
    DtTrophy,
    DtStar,
    DtCertificate,
    DtBolt,
    DtTarget,
    DtLaunch,
    DtTrendingUp,
    DtCalculator,
    DtDashboard,
    DtCog,
    DtMail,
    DtNotification,
    DtLock,
    DtSecurityCheck,
    DtUserCircle,
    DtFlag,
    DtChart,
    DtHeart,
    DtCheck,
    DtTime,
    DtHelp,
    DtInformation,
} from './icons';

export const DualToneIconMap = {
    trophy: DtTrophy,
    star: DtStar,
    certificate: DtCertificate,
    bolt: DtBolt,
    zap: DtBolt, // Alias for Lucide compatibility
    target: DtTarget,
    launch: DtLaunch,
    rocket: DtLaunch, // Alias
    'trending-up': DtTrendingUp,
    trendingUp: DtTrendingUp, // Camel case alias
    calculator: DtCalculator,
    dashboard: DtDashboard,
    cog: DtCog,
    settings: DtCog, // Alias
    mail: DtMail,
    email: DtMail, // Alias
    notification: DtNotification,
    bell: DtNotification, // Alias
    lock: DtLock,
    'security-check': DtSecurityCheck,
    shield: DtSecurityCheck, // Alias
    'user-circle': DtUserCircle,
    user: DtUserCircle, // Alias
    flag: DtFlag,
    chart: DtChart,
    heart: DtHeart,
    check: DtCheck,
    time: DtTime,
    clock: DtTime, // Alias
    help: DtHelp,
    information: DtInformation,
    info: DtInformation, // Alias
} as const;

export type DualToneIconName = keyof typeof DualToneIconMap;

/**
 * Get a dual-tone icon component by name
 */
export function getDualToneIcon(name: string) {
    return DualToneIconMap[name as DualToneIconName] || DtStar;
}
