/**
 * Email Service Factory
 * Creates and manages email providers based on configuration
 */

import type { EmailProvider, EmailOptions, EmailResult } from './types';
import { ResendProvider } from './providers/resend';
import { SmtpProvider } from './providers/smtp';
import { ConsoleProvider } from './providers/console';

let emailProvider: EmailProvider | null = null;

/**
 * Get the email provider instance (singleton)
 */
export function getEmailProvider(): EmailProvider {
    if (emailProvider) {
        return emailProvider;
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const smtpHost = process.env.SMTP_HOST;
    const fromEmail = process.env.EMAIL_FROM || 'FlashMath <noreply@flashmath.io>';

    // Priority: Resend > SMTP > Console (dev)
    if (resendApiKey) {
        console.log('[Email] Using Resend provider');
        emailProvider = new ResendProvider(resendApiKey, fromEmail);
    } else if (smtpHost) {
        console.log('[Email] Using SMTP provider');
        emailProvider = new SmtpProvider({
            host: smtpHost,
            port: parseInt(process.env.SMTP_PORT || '587'),
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || '',
            secure: process.env.SMTP_SECURE === 'true',
            defaultFrom: fromEmail,
            replyTo: process.env.EMAIL_REPLY_TO || 'support@flashmath.io',
        });
    } else {
        console.log('[Email] Using Console provider (development mode)');
        emailProvider = new ConsoleProvider();
    }

    return emailProvider;
}

/**
 * Send an email using the configured provider
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
    const provider = getEmailProvider();
    return provider.send(options);
}

// Export types
export type { EmailProvider, EmailOptions, EmailResult } from './types';
