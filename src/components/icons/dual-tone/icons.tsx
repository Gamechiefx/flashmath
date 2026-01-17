/**
 * Dual-Tone Icons
 * Based on Refactoring UI icon set
 * 
 * Each icon has:
 * - Primary fill (main shape)
 * - Secondary fill (accent/shadow, rendered at lower opacity by default)
 */

import { createDualToneIcon } from './base';

// ============================================================================
// ACHIEVEMENT & REWARD ICONS
// ============================================================================

export const DtTrophy = createDualToneIcon('DtTrophy', (primary, secondary) => (
    <>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M7 4v2H4v4c0 1.1.9 2 2 2h1v2H6a4 4 0 0 1-4-4V6c0-1.1.9-2 2-2h3zm10 2V4h3a2 2 0 0 1 2 2v4a4 4 0 0 1-4 4h-1v-2h1a2 2 0 0 0 2-2V6h-3zm-3 14h2a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2h2a1 1 0 0 0 1-1v-3h2v3a1 1 0 0 0 1 1z"
        />
        <path fill={primary} d="M8 2h8a2 2 0 0 1 2 2v7a6 6 0 1 1-12 0V4c0-1.1.9-2 2-2z" />
    </>
));

export const DtStar = createDualToneIcon('DtStar', (primary, secondary) => (
    <>
        <circle cx="12" cy="12" r="10" fill={primary} />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M9.53 16.93a1 1 0 0 1-1.45-1.05l.47-2.76-2-1.95a1 1 0 0 1 .55-1.7l2.77-.4 1.23-2.51a1 1 0 0 1 1.8 0l1.23 2.5 2.77.4a1 1 0 0 1 .55 1.71l-2 1.95.47 2.76a1 1 0 0 1-1.45 1.05L12 15.63l-2.47 1.3z"
        />
    </>
));

export const DtCertificate = createDualToneIcon('DtCertificate', (primary, secondary) => (
    <>
        <path
            fill={primary}
            d="M4 3h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2zm16 12V7a2 2 0 0 1-2-2H6a2 2 0 0 1-2 2v8a2 2 0 0 1 2 2h12c0-1.1.9-2 2-2zM8 7h8a1 1 0 0 1 0 2H8a1 1 0 1 1 0-2z"
        />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M11.65 18.23a4 4 0 1 1 4.7 0l2.5 3.44-2.23-.18-1.48 1.68-.59-4.2a4.04 4.04 0 0 1-1.1 0l-.6 4.2-1.47-1.68-2.23.18 2.5-3.44zM14 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        />
    </>
));

// ============================================================================
// ACTION & POWER ICONS
// ============================================================================

export const DtBolt = createDualToneIcon('DtBolt', (primary, secondary) => (
    <>
        <circle cx="12" cy="12" r="10" fill={primary} />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M14 10h2a1 1 0 0 1 .81 1.58l-5 7A1 1 0 0 1 10 18v-4H8a1 1 0 0 1-.81-1.58l5-7A1 1 0 0 1 14 6v4z"
        />
    </>
));

export const DtTarget = createDualToneIcon('DtTarget', (primary, secondary) => (
    <>
        <path
            fill={primary}
            d="M15.23 2.53l-.35.35a3 3 0 0 0-.8 1.4 8.01 8.01 0 1 0 5.64 5.63 3 3 0 0 0 1.4-.79l.35-.35A9.99 9.99 0 0 1 12 22a10 10 0 1 1 3.23-19.47zM13.55 6.2L11.75 8a4 4 0 1 0 4.24 4.25l1.8-1.8a6 6 0 1 1-4.24-4.25z"
        />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M16 6.59V5a1 1 0 0 1 .3-.7l2-2A1 1 0 0 1 20 3v1h1a1 1 0 0 1 .7 1.7l-2 2a1 1 0 0 1-.7.3h-1.59l-4.7 4.7a1 1 0 0 1-1.42-1.4L16 6.58z"
        />
    </>
));

export const DtLaunch = createDualToneIcon('DtLaunch', (primary, secondary) => (
    <g>
        <path
            fill={primary}
            d="M14.57 6.96a2 2 0 0 1 2.47 2.47c.29.17.5.47.5.86v7.07a1 1 0 0 1-.3.71L13 22.31a1 1 0 0 1-1.7-.7v-3.58l-.49.19a1 1 0 0 1-1.17-.37 14.1 14.1 0 0 0-3.5-3.5 1 1 0 0 1-.36-1.16l.19-.48H2.39A1 1 0 0 1 1.7 11l4.24-4.24a1 1 0 0 1 .7-.3h7.08c.39 0 .7.21.86.5zM13.19 9.4l-2.15 2.15a3 3 0 0 1 .84.57 3 3 0 0 1 .57.84l2.15-2.15A2 2 0 0 1 13.2 9.4zm6.98-6.61a1 1 0 0 1 1.04 1.04c-.03.86-.13 1.71-.3 2.55-.47-.6-1.99-.19-2.55-.74-.55-.56-.14-2.08-.74-2.55.84-.17 1.7-.27 2.55-.3z"
        />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M7.23 10.26A16.05 16.05 0 0 1 17.62 3.1a19.2 19.2 0 0 1 3.29 3.29 15.94 15.94 0 0 1-7.17 10.4 19.05 19.05 0 0 0-6.51-6.52zm-.86 5.5a16.2 16.2 0 0 1 1.87 1.87 1 1 0 0 1-.47 1.6c-.79.25-1.6.42-2.4.54a1 1 0 0 1-1.14-1.13c.12-.82.3-1.62.53-2.41a1 1 0 0 1 1.6-.47zm7.34-5.47a2 2 0 1 0 2.83-2.83 2 2 0 0 0-2.83 2.83z"
        />
    </g>
));

export const DtTrendingUp = createDualToneIcon('DtTrendingUp', (primary, secondary) => (
    <>
        <path
            fill={primary}
            d="M3.7 20.7a1 1 0 1 1-1.4-1.4l6-6a1 1 0 0 1 1.4 0l3.3 3.29 4.3-4.3a1 1 0 0 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0L9 15.4l-5.3 5.3z"
        />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M16.59 8l-2.3-2.3A1 1 0 0 1 15 4h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1.7.7L18 9.42l-4.3 4.3a1 1 0 0 1-1.4 0L9 10.4l-5.3 5.3a1 1 0 1 1-1.4-1.42l6-6a1 1 0 0 1 1.4 0l3.3 3.3L16.59 8z"
        />
    </>
));

// ============================================================================
// TOOL & UTILITY ICONS
// ============================================================================

export const DtCalculator = createDualToneIcon('DtCalculator', (primary, secondary) => (
    <>
        <path
            fill={primary}
            d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.1.9-2 2-2zm2 3a1 1 0 1 0 0 2h8a1 1 0 0 0 0-2H8zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-8 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-4 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
        />
        <rect
            width="2"
            height="6"
            x="15"
            y="13"
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            rx="1"
        />
    </>
));

export const DtDashboard = createDualToneIcon('DtDashboard', (primary, secondary) => (
    <>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M3 11h2a1 1 0 0 1 0 2H3v-2zm3.34-6.07l1.42 1.41a1 1 0 0 1-1.42 1.42L4.93 6.34l1.41-1.41zM13 3v2a1 1 0 0 1-2 0V3h2zm6.07 3.34l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.42-1.41 1.41 1.41zM21 13h-2a1 1 0 0 1 0-2h2v2z"
        />
        <path fill={primary} d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm-6.93-6h13.86a8 8 0 1 0-13.86 0z" />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M11 14.27V9a1 1 0 0 1 2 0v5.27a2 2 0 1 1-2 0z"
        />
    </>
));

export const DtCog = createDualToneIcon('DtCog', (primary, secondary) => (
    <>
        <path
            fill={primary}
            d="M6.8 3.45c.87-.52 1.82-.92 2.83-1.17a2.5 2.5 0 0 0 4.74 0c1.01.25 1.96.65 2.82 1.17a2.5 2.5 0 0 0 3.36 3.36c.52.86.92 1.8 1.17 2.82a2.5 2.5 0 0 0 0 4.74c-.25 1.01-.65 1.96-1.17 2.82a2.5 2.5 0 0 0-3.36 3.36c-.86.52-1.8.92-2.82 1.17a2.5 2.5 0 0 0-4.74 0c-1.01-.25-1.96-.65-2.82-1.17a2.5 2.5 0 0 0-3.36-3.36 9.94 9.94 0 0 1-1.17-2.82 2.5 2.5 0 0 0 0-4.74c.25-1.01.65-1.96 1.17-2.82a2.5 2.5 0 0 0 3.36-3.36zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
        />
        <circle cx="12" cy="12" r="2" fill={secondary} style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }} />
    </>
));

// ============================================================================
// COMMUNICATION ICONS
// ============================================================================

export const DtMail = createDualToneIcon('DtMail', (primary, secondary) => (
    <>
        <path fill={primary} d="M22 8.62V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.62l9.55 4.77a1 1 0 0 0 .9 0L22 8.62z" />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M12 11.38l-10-5V6c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v.38l-10 5z"
        />
    </>
));

export const DtNotification = createDualToneIcon('DtNotification', (primary, secondary) => (
    <>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M15 19a3 3 0 1 1-6 0h6z"
        />
        <path
            fill={primary}
            d="M12 2a7 7 0 0 1 7 7v5.5l1.41 1.41A1 1 0 0 1 19.7 18H4.3a1 1 0 0 1-.71-1.7L5 14.58V9a7 7 0 0 1 7-7z"
        />
    </>
));

// ============================================================================
// SECURITY ICONS
// ============================================================================

export const DtLock = createDualToneIcon('DtLock', (primary, secondary) => (
    <g>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M12 10v3a2 2 0 0 0-1 3.73V18a1 1 0 0 0 1 1v3H5a2 2 0 0 1-2-2v-8c0-1.1.9-2 2-2h7z"
        />
        <path
            fill={primary}
            d="M12 19a1 1 0 0 0 1-1v-1.27A2 2 0 0 0 12 13v-3h3V7a3 3 0 0 0-6 0v3H7V7a5 5 0 1 1 10 0v3h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7v-3z"
        />
    </g>
));

export const DtSecurityCheck = createDualToneIcon('DtSecurityCheck', (primary, secondary) => (
    <>
        <path fill={primary} d="M4 4l8-2 8 2v9.06a8 8 0 0 1-4.42 7.15L12 22l-3.58-1.79A8 8 0 0 1 4 13.06V4z" />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M10.5 12.59l4.3-4.3a1 1 0 0 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 0 1 1.4-1.42l1.3 1.3z"
        />
    </>
));

// ============================================================================
// USER & PROFILE ICONS
// ============================================================================

export const DtUserCircle = createDualToneIcon('DtUserCircle', (primary, secondary) => (
    <g>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M3.66 17.52a10 10 0 1 1 16.68 0C19.48 16.02 17.86 16 16 16H8c-1.86 0-3.48.01-4.34 1.52z"
        />
        <path
            fill={primary}
            d="M3.66 17.52A5 5 0 0 1 8 15h8a5 5 0 0 1 4.34 2.52 10 10 0 0 1-16.68 0zM12 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"
        />
    </g>
));

// ============================================================================
// LEAGUE & COMPETITION ICONS
// ============================================================================

export const DtFlag = createDualToneIcon('DtFlag', (primary, secondary) => (
    <g>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M4 15a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a1 1 0 0 1 .7.3L13.42 5H21a1 1 0 0 1 .9 1.45L19.61 11l2.27 4.55A1 1 0 0 1 21 17h-8a1 1 0 0 1-.7-.3L10.58 15H4z"
        />
        <rect width="2" height="20" x="2" y="2" fill={primary} rx="1" />
    </g>
));

export const DtChart = createDualToneIcon('DtChart', (primary, secondary) => (
    <>
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2z"
        />
        <path
            fill={primary}
            d="M11 14.59V6a1 1 0 0 1 2 0v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.42l2.3 2.3z"
        />
    </>
));

// ============================================================================
// MISC ICONS
// ============================================================================

export const DtHeart = createDualToneIcon('DtHeart', (primary, secondary) => (
    <>
        <circle
            cx="12"
            cy="12"
            r="10"
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
        />
        <path
            fill={primary}
            d="M12.88 8.88a3 3 0 1 1 4.24 4.24l-4.41 4.42a1 1 0 0 1-1.42 0l-4.41-4.42a3 3 0 1 1 4.24-4.24l.88.88.88-.88z"
        />
    </>
));

export const DtCheck = createDualToneIcon('DtCheck', (primary, secondary) => (
    <>
        <circle cx="12" cy="12" r="10" fill={primary} />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M10 14.59l6.3-6.3a1 1 0 0 1 1.4 1.42l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.42l2.3 2.3z"
        />
    </>
));

export const DtTime = createDualToneIcon('DtTime', (primary, secondary) => (
    <>
        <circle cx="12" cy="12" r="10" fill={primary} />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M13 11.59l3.2 3.2a1 1 0 0 1-1.4 1.42l-3.5-3.5A1 1 0 0 1 11 12V7a1 1 0 0 1 2 0v4.59z"
        />
    </>
));

export const DtHelp = createDualToneIcon('DtHelp', (primary, secondary) => (
    <>
        <path fill={primary} d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z" />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M12 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-5a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1 1.5 1.5 0 1 0-1.5-1.5 1 1 0 0 1-2 0 3.5 3.5 0 1 1 4.5 3.36V14z"
        />
    </>
));

export const DtInformation = createDualToneIcon('DtInformation', (primary, secondary) => (
    <>
        <circle cx="12" cy="12" r="10" fill={primary} />
        <path
            fill={secondary}
            style={{ opacity: 'var(--dt-secondary-opacity, 0.4)' }}
            d="M11 10h2a1 1 0 0 1 0 2h-1v5a1 1 0 0 1-2 0v-6a1 1 0 0 1 1-1zm1-2a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
        />
    </>
));
