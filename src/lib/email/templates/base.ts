/**
 * Base Email Template
 * FlashMath branded HTML email template with premium styling
 */

export function baseTemplate(content: string, preheader?: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>FlashMath</title>
    <!--[if mso]>
    <style type="text/css">
        table { border-collapse: collapse; }
        .button { padding: 12px 30px !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${preheader}</div>` : ''}
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0f;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px;">
                    <!-- Logo/Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="width: 48px; height: 48px; background: linear-gradient(135deg, #06b6d4, #8b5cf6); border-radius: 12px; text-align: center; vertical-align: middle;">
                                        <span style="color: white; font-size: 24px;">⚡</span>
                                    </td>
                                    <td style="padding-left: 12px;">
                                        <span style="color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: -1px;">FLASHMATH</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content Card -->
                    <tr>
                        <td style="background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 48px 40px;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding-top: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <p style="color: #71717a; font-size: 13px; margin: 0; line-height: 1.5;">
                                            © ${new Date().getFullYear()} FlashMath. All rights reserved.
                                        </p>
                                        <p style="color: #52525b; font-size: 12px; margin: 12px 0 0 0; line-height: 1.5;">
                                            You received this email because you have an account on FlashMath.<br>
                                            <a href="https://flashmath.io" style="color: #06b6d4; text-decoration: none;">flashmath.io</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`.trim();
}

/**
 * Premium button component for emails
 */
export function emailButton(text: string, url: string, color: string = '#06b6d4'): string {
    const gradientEnd = color === '#8b5cf6' ? '#7c3aed' : '#0891b2';
    return `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px auto;">
    <tr>
        <td align="center" style="background: linear-gradient(135deg, ${color}, ${gradientEnd}); border-radius: 12px; box-shadow: 0 4px 14px ${color}40;">
            <a href="${url}" target="_blank" style="display: inline-block; padding: 16px 40px; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 1px;">
                ${text}
            </a>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Code display component for verification codes
 */
export function emailCode(code: string): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="margin: 28px 0;">
    <tr>
        <td align="center">
            <div style="background: linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15)); border: 2px solid rgba(6, 182, 212, 0.3); border-radius: 16px; padding: 24px 32px; display: inline-block;">
                <span style="color: #06b6d4; font-size: 40px; font-weight: 800; letter-spacing: 10px; font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;">
                    ${code}
                </span>
            </div>
        </td>
    </tr>
</table>
`.trim();
}

/**
 * Info box component
 */
export function emailInfoBox(icon: string, text: string): string {
    return `
<div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
        <tr>
            <td style="width: 24px; vertical-align: top; padding-right: 12px;">
                <span style="font-size: 16px;">${icon}</span>
            </td>
            <td style="color: #a1a1aa; font-size: 14px; line-height: 1.5;">
                ${text}
            </td>
        </tr>
    </table>
</div>
`.trim();
}
