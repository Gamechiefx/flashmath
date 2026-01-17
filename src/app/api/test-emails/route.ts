/**
 * Test Email Templates API
 * Sends all email templates to a specified address for testing/preview
 * 
 * Usage: POST /api/test-emails?to=email@example.com
 */

import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { verificationEmailTemplate } from "@/lib/email/templates/verification";
import { passwordResetEmailTemplate } from "@/lib/email/templates/password-reset";
import { magicLinkEmailTemplate } from "@/lib/email/templates/magic-link";
import { adminMfaEmailTemplate } from "@/lib/email/templates/admin-mfa";
import { welcomeEmailTemplate } from "@/lib/email/templates/welcome";
import { newSigninEmailTemplate } from "@/lib/email/templates/new-signin";
import { leaguePromotionEmailTemplate } from "@/lib/email/templates/league-promotion";
import { achievementEmailTemplate } from "@/lib/email/templates/achievement";
import { weeklyStatsEmailTemplate } from "@/lib/email/templates/weekly-stats";

// Secret for authorization (use env var in production)
const TEST_SECRET = process.env.CRON_SECRET || 'test-emails-secret';

export async function POST(request: NextRequest) {
    // Get recipient from query params
    const { searchParams } = new URL(request.url);
    const to = searchParams.get('to');
    
    // Optional auth check
    const authHeader = request.headers.get("authorization");
    if (TEST_SECRET && authHeader && authHeader !== `Bearer ${TEST_SECRET}`) {
        // Allow without auth for now during testing
    }
    
    if (!to || !to.includes('@')) {
        return NextResponse.json({ error: "Valid 'to' email required" }, { status: 400 });
    }
    
    console.log(`[TestEmails] Sending all templates to ${to}...`);
    
    const results: { template: string; success: boolean; error?: string }[] = [];
    const baseUrl = process.env.NEXTAUTH_URL || 'https://flashmath.io';
    
    // 1. Verification Email
    try {
        const template = verificationEmailTemplate('FlashMath User', '847291');
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'verification', success: result.success, error: result.error });
        console.log(`[TestEmails] Verification: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'verification', success: false, error: String(e) });
    }
    
    // Small delay between emails to avoid rate limiting
    await delay(1000);
    
    // 2. Password Reset Email
    try {
        const template = passwordResetEmailTemplate('FlashMath User', `${baseUrl}/reset-password?token=abc123`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'password-reset', success: result.success, error: result.error });
        console.log(`[TestEmails] Password Reset: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'password-reset', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 3. Magic Link Email
    try {
        const template = magicLinkEmailTemplate(to, `${baseUrl}/api/auth/magic-link?token=abc123`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'magic-link', success: result.success, error: result.error });
        console.log(`[TestEmails] Magic Link: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'magic-link', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 4. Admin MFA Email
    try {
        const template = adminMfaEmailTemplate('Admin User', '582019');
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'admin-mfa', success: result.success, error: result.error });
        console.log(`[TestEmails] Admin MFA: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'admin-mfa', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 5. Welcome Email
    try {
        const template = welcomeEmailTemplate('FlashMath User', `${baseUrl}/dashboard`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'welcome', success: result.success, error: result.error });
        console.log(`[TestEmails] Welcome: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'welcome', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 6. New Sign-in Alert
    try {
        const template = newSigninEmailTemplate('FlashMath User', {
            device: 'MacBook Pro',
            browser: 'Chrome 120',
            location: 'San Francisco, CA, USA',
            ip: '192.168.1.100',
            time: new Date().toLocaleString(),
        }, `${baseUrl}/settings/security`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'new-signin', success: result.success, error: result.error });
        console.log(`[TestEmails] New Sign-in: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'new-signin', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 7. League Promotion Email
    try {
        const template = leaguePromotionEmailTemplate('FlashMath User', 'plasma', {
            weeklyXp: 2847,
            rank: 2,
            totalPlayers: 156,
            winRate: 78,
        }, `${baseUrl}/leaderboard`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'league-promotion', success: result.success, error: result.error });
        console.log(`[TestEmails] League Promotion: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'league-promotion', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 8. Achievement Unlocked Email
    try {
        const template = achievementEmailTemplate('FlashMath User', {
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
        }, `${baseUrl}/profile`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'achievement', success: result.success, error: result.error });
        console.log(`[TestEmails] Achievement: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'achievement', success: false, error: String(e) });
    }
    
    await delay(1000);
    
    // 9. Weekly Stats Email
    try {
        const template = weeklyStatsEmailTemplate('FlashMath User', {
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
        ], `${baseUrl}/dashboard`);
        const result = await sendEmail({
            to,
            subject: `[TEST] ${template.subject}`,
            html: template.html,
            text: template.text,
        });
        results.push({ template: 'weekly-stats', success: result.success, error: result.error });
        console.log(`[TestEmails] Weekly Stats: ${result.success ? 'OK' : result.error}`);
    } catch (e) {
        results.push({ template: 'weekly-stats', success: false, error: String(e) });
    }
    
    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`[TestEmails] Complete. Success: ${successCount}, Failed: ${failCount}`);
    
    return NextResponse.json({
        success: failCount === 0,
        to,
        sent: successCount,
        failed: failCount,
        results,
    });
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET() {
    return NextResponse.json({
        endpoint: 'test-emails',
        description: 'Send all email templates to a specified address for testing',
        usage: 'POST /api/test-emails?to=email@example.com',
        templates: [
            'verification',
            'password-reset',
            'magic-link',
            'admin-mfa',
            'welcome',
            'new-signin',
            'league-promotion',
            'achievement',
            'weekly-stats',
        ],
    });
}
