/**
 * Console Email Provider
 * Development provider that logs emails to console
 */

import type { EmailProvider, EmailOptions, EmailResult } from '../types';

export class ConsoleProvider implements EmailProvider {
    name = 'console';

    async send(options: EmailOptions): Promise<EmailResult> {
        console.log('\n========== EMAIL (Console Provider) ==========');
        console.log(`To: ${options.to}`);
        console.log(`From: ${options.from || 'default'}`);
        console.log(`Subject: ${options.subject}`);
        console.log('--- HTML Content ---');
        console.log(options.html);
        if (options.text) {
            console.log('--- Text Content ---');
            console.log(options.text);
        }
        console.log('================================================\n');

        return {
            success: true,
            messageId: `console-${Date.now()}`,
        };
    }
}
