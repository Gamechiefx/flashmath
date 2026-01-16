/**
 * Base Email Template
 * FlashMath branded HTML email template with premium gaming aesthetic
 * Inspired by SimpleApp professional email patterns with responsive design
 */

// FlashMath Brand Colors
const COLORS = {
    // Primary
    bgDark: '#0a0a0f',
    bgCard: 'rgba(255,255,255,0.04)',
    cardBorder: 'rgba(255,255,255,0.08)',
    
    // Accents
    cyan: '#06b6d4',
    cyanDark: '#0891b2',
    purple: '#8b5cf6',
    purpleDark: '#7c3aed',
    pink: '#ec4899',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    
    // Text
    textWhite: '#ffffff',
    textLight: '#a1a1aa',
    textMuted: '#71717a',
    textDark: '#52525b',
};

/**
 * Responsive CSS styles for email clients
 * Based on SimpleApp patterns for maximum compatibility
 */
function getResponsiveStyles(): string {
    return `
    <style type="text/css">
        /* Reset */
        a { text-decoration: none; outline: none; }
        table { border-collapse: collapse; }
        img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        
        /* Mobile responsive */
        @media (max-width: 600px) {
            .fm-container { width: 100% !important; padding: 16px !important; }
            .fm-content { padding: 32px 24px !important; }
            .fm-heading { font-size: 24px !important; line-height: 32px !important; }
            .fm-button { width: 100% !important; }
            .fm-code { font-size: 28px !important; letter-spacing: 6px !important; padding: 20px 16px !important; }
            .fm-footer { padding: 24px !important; }
            .fm-social-link { margin: 0 8px !important; }
        }
        
        /* Web fonts */
        @media screen {
            @font-face {
                font-family: 'Outfit';
                font-style: normal;
                font-weight: 400;
                src: url(https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4S-EiAou6Y.woff2) format('woff2');
            }
            @font-face {
                font-family: 'Outfit';
                font-style: normal;
                font-weight: 700;
                src: url(https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4W-yC4S-EiAou6Y.woff2) format('woff2');
            }
            @font-face {
                font-family: 'Outfit';
                font-style: normal;
                font-weight: 800;
                src: url(https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4QGyC4S-EiAou6Y.woff2) format('woff2');
            }
            .fm-font { font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; }
            .fm-mono { font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace !important; }
        }
        
        /* Apple link color fix */
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    </style>
    <!--[if mso]>
    <style type="text/css">
        table { border-collapse: collapse; }
        a { color: #06b6d4; }
        .fm-button { padding: 14px 36px !important; }
    </style>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    `.trim();
}

/**
 * Email header with FlashMath logo
 */
function emailHeader(): string {
    return `
<!-- Header -->
<tr>
    <td align="center" style="padding: 40px 20px 32px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
                <!-- Logo Icon -->
                <td style="width: 52px; height: 52px; background: linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.purple}); border-radius: 14px; text-align: center; vertical-align: middle; box-shadow: 0 8px 32px rgba(6, 182, 212, 0.3);">
                    <span style="color: white; font-size: 26px; line-height: 52px;">⚡</span>
                </td>
                <td style="padding-left: 14px;">
                    <span class="fm-font" style="color: ${COLORS.textWhite}; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">FLASHMATH</span>
                </td>
            </tr>
        </table>
    </td>
</tr>
`.trim();
}

/**
 * Email footer with copyright and links
 */
function emailFooter(): string {
    const year = new Date().getFullYear();
    return `
<!-- Footer -->
<tr>
    <td align="center" style="padding: 32px 24px 40px 24px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 480px;">
            <tr>
                <td align="center" style="padding-bottom: 20px;">
                    <!-- Social Links -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td class="fm-social-link" style="padding: 0 6px;">
                                <a href="https://twitter.com/flashmath" style="display: inline-block; width: 32px; height: 32px; background: rgba(255,255,255,0.06); border-radius: 8px; text-align: center; line-height: 32px; font-size: 14px; text-decoration: none;">
                                    <span style="color: ${COLORS.textMuted};">𝕏</span>
                                </a>
                            </td>
                            <td class="fm-social-link" style="padding: 0 6px;">
                                <a href="https://discord.gg/flashmath" style="display: inline-block; width: 32px; height: 32px; background: rgba(255,255,255,0.06); border-radius: 8px; text-align: center; line-height: 32px; font-size: 14px; text-decoration: none;">
                                    <span style="color: ${COLORS.textMuted};">💬</span>
                                </a>
                            </td>
                            <td class="fm-social-link" style="padding: 0 6px;">
                                <a href="https://github.com/flashmath" style="display: inline-block; width: 32px; height: 32px; background: rgba(255,255,255,0.06); border-radius: 8px; text-align: center; line-height: 32px; font-size: 14px; text-decoration: none;">
                                    <span style="color: ${COLORS.textMuted};">⚙</span>
                                </a>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td align="center">
                    <p class="fm-font" style="color: ${COLORS.textMuted}; font-size: 13px; line-height: 1.6; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        © ${year} FlashMath. All rights reserved.
                    </p>
                    <p class="fm-font" style="color: ${COLORS.textDark}; font-size: 12px; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        You're receiving this because you have a FlashMath account.<br>
                        <a href="https://flashmath.io/settings/notifications" style="color: ${COLORS.cyan}; text-decoration: none;">Manage preferences</a>
                        <span style="color: ${COLORS.textDark};"> · </span>
                        <a href="https://flashmath.io" style="color: ${COLORS.cyan}; text-decoration: none;">flashmath.io</a>
                    </p>
                </td>
            </tr>
        </table>
    </td>
</tr>
`.trim();
}

/**
 * Main base template wrapper
 */
export function baseTemplate(content: string, preheader?: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <title>FlashMath</title>
    ${getResponsiveStyles()}
</head>
<body class="fm-font" style="margin: 0; padding: 0; background-color: ${COLORS.bgDark}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
    <!-- Preheader -->
    ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${COLORS.bgDark};">${preheader}${'&nbsp;'.repeat(100)}</div>` : ''}
    
    <!-- Email Wrapper -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: ${COLORS.bgDark};">
        <tr>
            <td class="fm-container" align="center" style="padding: 24px;">
                <!-- Main Content Table -->
                <table role="presentation" class="fm-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px;">
                    ${emailHeader()}
                    
                    <!-- Content Card -->
                    <tr>
                        <td class="fm-content" style="background: linear-gradient(180deg, ${COLORS.bgCard} 0%, rgba(255,255,255,0.02) 100%); border: 1px solid ${COLORS.cardBorder}; border-radius: 24px; padding: 48px 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                            ${content}
                        </td>
                    </tr>
                    
                    ${emailFooter()}
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`.trim();
}

/**
 * Hero section with icon and decorative lines (inspired by SimpleApp)
 */
export function emailHero(icon: string, title: string, subtitle?: string, accentColor: string = COLORS.cyan): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
    <tr>
        <td align="center" style="padding-bottom: 24px;">
            <!-- Decorative icon with lines -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                    <td style="width: 40px; height: 1px; background: linear-gradient(90deg, transparent, ${accentColor}40);"></td>
                    <td style="padding: 0 16px;">
                        <div style="width: 72px; height: 72px; background: linear-gradient(135deg, ${accentColor}25, ${COLORS.purple}25); border: 2px solid ${accentColor}40; border-radius: 20px; display: inline-block; text-align: center; line-height: 68px;">
                            <span style="font-size: 36px;">${icon}</span>
                        </div>
                    </td>
                    <td style="width: 40px; height: 1px; background: linear-gradient(90deg, ${accentColor}40, transparent);"></td>
                </tr>
            </table>
        </td>
    </tr>
    <tr>
        <td align="center">
            <h1 class="fm-heading fm-font" style="color: ${COLORS.textWhite}; font-size: 28px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${title}
            </h1>
            ${subtitle ? `
            <p class="fm-font" style="color: ${COLORS.textLight}; font-size: 16px; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${subtitle}
            </p>
            ` : ''}
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Premium gradient button component
 */
export function emailButton(text: string, url: string, variant: 'primary' | 'secondary' | 'success' | 'warning' = 'primary'): string {
    const gradients = {
        primary: `linear-gradient(135deg, ${COLORS.cyan}, ${COLORS.cyanDark})`,
        secondary: `linear-gradient(135deg, ${COLORS.purple}, ${COLORS.purpleDark})`,
        success: `linear-gradient(135deg, ${COLORS.green}, #059669)`,
        warning: `linear-gradient(135deg, ${COLORS.amber}, #d97706)`,
    };
    
    const shadows = {
        primary: `0 8px 24px ${COLORS.cyan}40`,
        secondary: `0 8px 24px ${COLORS.purple}40`,
        success: `0 8px 24px ${COLORS.green}40`,
        warning: `0 8px 24px ${COLORS.amber}40`,
    };
    
    return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 32px auto;">
    <tr>
        <td class="fm-button" align="center" style="background: ${gradients[variant]}; border-radius: 14px; box-shadow: ${shadows[variant]};">
            <a href="${url}" target="_blank" class="fm-font" style="display: inline-block; padding: 16px 44px; color: ${COLORS.textWhite}; font-size: 15px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${text}
            </a>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Verification/OTP code display component
 */
export function emailCode(code: string, label?: string): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 28px 0;">
    ${label ? `
    <tr>
        <td align="center" style="padding-bottom: 12px;">
            <p class="fm-font" style="color: ${COLORS.textMuted}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${label}
            </p>
        </td>
    </tr>
    ` : ''}
    <tr>
        <td align="center">
            <div class="fm-code fm-mono" style="background: linear-gradient(135deg, ${COLORS.cyan}15, ${COLORS.purple}15); border: 2px solid ${COLORS.cyan}30; border-radius: 16px; padding: 24px 40px; display: inline-block;">
                <span style="color: ${COLORS.cyan}; font-size: 44px; font-weight: 800; letter-spacing: 12px; font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;">
                    ${code}
                </span>
            </div>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Info/warning box component
 */
export function emailInfoBox(icon: string, text: string, variant: 'info' | 'warning' | 'success' | 'security' = 'info'): string {
    const colors = {
        info: { bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.2)', accent: COLORS.cyan },
        warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)', accent: COLORS.amber },
        success: { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.2)', accent: COLORS.green },
        security: { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.2)', accent: COLORS.purple },
    };
    
    const { bg, border, accent } = colors[variant];
    
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td style="background: ${bg}; border: 1px solid ${border}; border-radius: 12px; padding: 16px 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
                <tr>
                    <td style="width: 28px; vertical-align: top; padding-right: 12px;">
                        <span style="font-size: 18px; line-height: 24px;">${icon}</span>
                    </td>
                    <td class="fm-font" style="color: ${COLORS.textLight}; font-size: 14px; line-height: 1.6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                        ${text.replace(/<strong>/g, `<strong style="color: ${accent};">`)}
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Divider component
 */
export function emailDivider(): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 24px 0;">
    <tr>
        <td style="height: 1px; background: linear-gradient(90deg, transparent, ${COLORS.cardBorder}, transparent);"></td>
    </tr>
</table>
`.trim();
}

/**
 * Stats/metrics row component
 */
export function emailStats(stats: Array<{ label: string; value: string; icon?: string }>): string {
    const statCells = stats.map(stat => `
        <td align="center" style="padding: 16px 12px; background: ${COLORS.bgCard}; border-radius: 12px;">
            ${stat.icon ? `<div style="font-size: 20px; margin-bottom: 4px;">${stat.icon}</div>` : ''}
            <div class="fm-font" style="color: ${COLORS.textWhite}; font-size: 24px; font-weight: 700; margin-bottom: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${stat.value}</div>
            <div class="fm-font" style="color: ${COLORS.textMuted}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${stat.label}</div>
        </td>
    `).join('<td style="width: 12px;"></td>');
    
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 24px 0;">
    <tr>
        ${statCells}
    </tr>
</table>
`.trim();
}

/**
 * Feature/highlight box component
 */
export function emailFeatureBox(icon: string, title: string, description: string, accentColor: string = COLORS.cyan): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin: 16px 0;">
    <tr>
        <td style="background: ${COLORS.bgCard}; border: 1px solid ${COLORS.cardBorder}; border-radius: 16px; padding: 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
                <tr>
                    <td style="width: 48px; vertical-align: top; padding-right: 16px;">
                        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${accentColor}20, ${COLORS.purple}20); border-radius: 12px; text-align: center; line-height: 48px;">
                            <span style="font-size: 24px;">${icon}</span>
                        </div>
                    </td>
                    <td>
                        <h3 class="fm-font" style="color: ${COLORS.textWhite}; font-size: 16px; font-weight: 700; margin: 0 0 4px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${title}</h3>
                        <p class="fm-font" style="color: ${COLORS.textLight}; font-size: 14px; line-height: 1.5; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${description}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Plain text paragraph
 */
export function emailParagraph(text: string, align: 'left' | 'center' = 'center'): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0">
    <tr>
        <td align="${align}" class="fm-font" style="color: ${COLORS.textLight}; font-size: 16px; line-height: 1.7; padding: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
            ${text}
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Username/greeting highlight
 */
export function emailUsername(name: string): string {
    return `<strong style="color: ${COLORS.textWhite};">${name}</strong>`;
}

/**
 * Link fallback section (for when buttons don't work)
 */
export function emailLinkFallback(url: string): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin-top: 28px; padding-top: 20px; border-top: 1px solid ${COLORS.cardBorder};">
    <tr>
        <td align="center">
            <p class="fm-font" style="color: ${COLORS.textDark}; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                Button not working? Copy and paste this link:
            </p>
            <p style="margin: 0;">
                <a href="${url}" class="fm-font" style="color: ${COLORS.cyan}; font-size: 11px; word-break: break-all; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${url}</a>
            </p>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Footer note/disclaimer text
 */
export function emailFooterNote(text: string): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" border="0" style="margin-top: 24px;">
    <tr>
        <td align="center">
            <p class="fm-font" style="color: ${COLORS.textDark}; font-size: 13px; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${text}
            </p>
        </td>
    </tr>
</table>
`.trim();
}

// Export colors for use in specific templates
export { COLORS };
