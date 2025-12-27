/**
 * SMTP Email Provider
 * Fallback email provider using nodemailer
 */

import nodemailer from 'nodemailer';
import type { EmailProvider, EmailOptions, EmailResult } from '../types';

export class SmtpProvider implements EmailProvider {
    name = 'smtp';
    private transporter: nodemailer.Transporter;
    private defaultFrom: string;

    constructor(config: {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure?: boolean;
        defaultFrom: string;
    }) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure ?? config.port === 465,
            auth: {
                user: config.user,
                pass: config.pass,
            },
        });
        this.defaultFrom = config.defaultFrom;
    }

    async send(options: EmailOptions): Promise<EmailResult> {
        try {
            const info = await this.transporter.sendMail({
                from: options.from || this.defaultFrom,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            });

            console.log(`[SMTP] Email sent successfully: ${info.messageId}`);
            return {
                success: true,
                messageId: info.messageId,
            };
        } catch (err) {
            console.error('[SMTP] Error sending email:', err);
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }
}
