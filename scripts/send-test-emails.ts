/**
 * Send Test Emails Script
 * Sends all email templates to a specified address for testing
 * 
 * Usage: npx tsx scripts/send-test-emails.ts gamechief1@gmail.com
 */

import * as fs from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';

// Load .env file manually
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex > 0) {
                    const key = trimmed.substring(0, eqIndex).trim();
                    const value = trimmed.substring(eqIndex + 1).trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        });
    }
}
loadEnv();

// Import templates
import { verificationEmailTemplate } from '../src/lib/email/templates/verification';
import { passwordResetEmailTemplate } from '../src/lib/email/templates/password-reset';
import { magicLinkEmailTemplate } from '../src/lib/email/templates/magic-link';
import { adminMfaEmailTemplate } from '../src/lib/email/templates/admin-mfa';
import { welcomeEmailTemplate } from '../src/lib/email/templates/welcome';
import { newSigninEmailTemplate } from '../src/lib/email/templates/new-signin';
import { leaguePromotionEmailTemplate } from '../src/lib/email/templates/league-promotion';
import { achievementEmailTemplate } from '../src/lib/email/templates/achievement';
import { weeklyStatsEmailTemplate } from '../src/lib/email/templates/weekly-stats';

// Get recipient from command line
const to = process.argv[2];
if (!to || !to.includes('@')) {
    console.error('Usage: npx tsx scripts/send-test-emails.ts <email@example.com>');
    process.exit(1);
}

console.log(`\n🚀 Sending test emails to: ${to}\n`);

// Create SMTP transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const baseUrl = process.env.NEXTAUTH_URL || 'https://flashmath.io';
const fromEmail = process.env.EMAIL_FROM || 'FlashMath <noreply@flashmath.io>';

interface EmailTemplate {
    name: string;
    subject: string;
    html: string;
    text: string;
}

async function sendEmail(template: EmailTemplate): Promise<boolean> {
    try {
        await transporter.sendMail({
            from: fromEmail,
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        console.log(`  ✅ ${template.name}`);
        return true;
    } catch (error) {
        console.error(`  ❌ ${template.name}: ${error}`);
        return false;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    let sent = 0;
    let failed = 0;

    // 1. Verification Email
    console.log('📧 Sending email templates...\n');
    
    const templates: EmailTemplate[] = [
        {
            name: '1. Email Verification',
            ...verificationEmailTemplate('FlashMath User', '847291'),
        },
        {
            name: '2. Password Reset',
            ...passwordResetEmailTemplate('FlashMath User', `${baseUrl}/reset-password?token=abc123`),
        },
        {
            name: '3. Magic Link',
            ...magicLinkEmailTemplate(to, `${baseUrl}/api/auth/magic-link?token=abc123`),
        },
        {
            name: '4. Admin MFA',
            ...adminMfaEmailTemplate('Admin User', '582019'),
        },
        {
            name: '5. Welcome',
            ...welcomeEmailTemplate('FlashMath User', `${baseUrl}/dashboard`),
        },
        {
            name: '6. New Sign-in Alert',
            ...newSigninEmailTemplate('FlashMath User', {
                device: 'MacBook Pro',
                browser: 'Chrome 120',
                location: 'San Francisco, CA, USA',
                ip: '192.168.1.100',
                time: new Date().toLocaleString(),
            }, `${baseUrl}/settings/security`),
        },
        {
            name: '7. League Promotion',
            ...leaguePromotionEmailTemplate('FlashMath User', 'plasma', {
                weeklyXp: 2847,
                rank: 2,
                totalPlayers: 156,
                winRate: 78,
            }, `${baseUrl}/leaderboard`),
        },
        {
            name: '8. Achievement Unlocked',
            ...achievementEmailTemplate('FlashMath User', {
                name: 'Speed Demon',
                description: 'Answer 100 problems in under 1 second each',
                icon: '⚡',
                rarity: 'legendary',
                xpReward: 500,
                unlockedAt: new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
            }, `${baseUrl}/profile`),
        },
        {
            name: '9. Weekly Stats',
            ...weeklyStatsEmailTemplate('FlashMath User', {
                totalSessions: 12,
                problemsSolved: 847,
                accuracy: 94,
                averageSpeed: 1.2,
                bestStreak: 42,
                xpEarned: 3250,
                leagueName: 'Quantum',
                leagueIcon: '⚛️',
                leagueRank: 15,
                improvement: {
                    accuracy: 2.5,
                    speed: -0.3,
                },
            }, [
                { name: 'Solve 500 problems', progress: 85 },
                { name: 'Win 10 arena matches', progress: 60 },
                { name: 'Reach 95% accuracy', progress: 100 },
            ], `${baseUrl}/dashboard`),
        },
    ];

    for (const template of templates) {
        const success = await sendEmail(template);
        if (success) sent++;
        else failed++;
        
        // Small delay between emails
        await delay(1500);
    }

    console.log(`\n📊 Summary: ${sent} sent, ${failed} failed`);
    console.log(`\n📬 Check your inbox at ${to}!\n`);
    
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
