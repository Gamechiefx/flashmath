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
    private replyTo: string;

    constructor(config: {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure?: boolean;
        defaultFrom: string;
        replyTo?: string;
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
        this.replyTo = config.replyTo || 'support@flashmath.io';
    }

    async send(options: EmailOptions): Promise<EmailResult> {
        try {
            const info = await this.transporter.sendMail({
                from: options.from || this.defaultFrom,
                to: options.to,
                replyTo: this.replyTo,
                subject: options.subject,
                html: options.html,
                text: options.text,
                headers: {
                    'Auto-Submitted': 'auto-generated',
                    'X-Auto-Response-Suppress': 'All',
                },
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

