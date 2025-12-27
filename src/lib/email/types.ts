/**
 * Email Provider Types and Interfaces
 */

export interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
}

export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

export interface EmailProvider {
    name: string;
    send(options: EmailOptions): Promise<EmailResult>;
}

export type EmailProviderType = 'resend' | 'smtp' | 'console';

export interface EmailConfig {
    provider: EmailProviderType;
    from: string;

    // Resend config
    resendApiKey?: string;

    // SMTP config
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpSecure?: boolean;
}
