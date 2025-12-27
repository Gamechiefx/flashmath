/**
 * Base Email Template
 * FlashMath branded HTML email template
 */

export function baseTemplate(content: string, preheader?: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlashMath</title>
    <!--[if mso]>
    <style type="text/css">
        table { border-collapse: collapse; }
        .button { padding: 12px 30px !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ''}
    
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0a0a0f;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px;">
                    <!-- Logo/Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 30px;">
                            <div style="display: inline-flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #06b6d4, #8b5cf6); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                    <span style="color: white; font-size: 20px; font-weight: bold;">⚡</span>
                                </div>
                                <span style="color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -1px;">FLASHMATH</span>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Main Content Card -->
                    <tr>
                        <td style="background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding-top: 30px;">
                            <p style="color: #71717a; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} FlashMath. All rights reserved.
                            </p>
                            <p style="color: #52525b; font-size: 11px; margin: 8px 0 0 0;">
                                This email was sent to you because you have an account on FlashMath.
                            </p>
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
 * Button component for emails
 */
export function emailButton(text: string, url: string, color: string = '#06b6d4'): string {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
    <tr>
        <td align="center" style="background: ${color}; border-radius: 12px;">
            <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">
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
<div style="background: rgba(6, 182, 212, 0.1); border: 2px dashed rgba(6, 182, 212, 0.3); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
    <span style="color: #06b6d4; font-size: 36px; font-weight: 800; letter-spacing: 8px; font-family: monospace;">
        ${code}
    </span>
</div>
`.trim();
}
