/**
 * Resend Email Provider
 * Primary email provider using Resend API
 */

import { Resend } from 'resend';
import type { EmailProvider, EmailOptions, EmailResult } from '../types';

export class ResendProvider implements EmailProvider {
    name = 'resend';
    private client: Resend;
    private defaultFrom: string;

    constructor(apiKey: string, defaultFrom: string) {
        this.client = new Resend(apiKey);
        this.defaultFrom = defaultFrom;
    }

    async send(options: EmailOptions): Promise<EmailResult> {
        try {
            const { data, error } = await this.client.emails.send({
                from: options.from || this.defaultFrom,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            });

            if (error) {
                console.error('[Resend] Error sending email:', error);
                return {
                    success: false,
                    error: error.message,
                };
            }

            console.log(`[Resend] Email sent successfully: ${data?.id}`);
            return {
                success: true,
                messageId: data?.id,
            };
        } catch (err) {
            console.error('[Resend] Exception sending email:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }
}
