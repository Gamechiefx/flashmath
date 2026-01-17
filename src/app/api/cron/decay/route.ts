/**
 * Decay Cron Job API Route
 * 
 * This endpoint should be called daily by a cron job (e.g., Vercel Cron, GitHub Actions, etc.)
 * to apply ELO decay to inactive players and send appropriate notification emails.
 * 
 * Authentication: Requires CRON_SECRET header to prevent unauthorized access.
 * 
 * Usage (cURL):
 * curl -X POST https://your-domain.com/api/cron/decay \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDecayJob } from '@/lib/arena/decay';
import { processDecayEmails } from '@/lib/actions/decay-emails';

export async function POST(request: NextRequest) {
    // Verify cron secret - CRON_SECRET must be configured
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (!expectedSecret) {
        console.error('[Cron/Decay] CRON_SECRET not configured');
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    
    if (authHeader !== `Bearer ${expectedSecret}`) {
        console.log('[Cron/Decay] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    try {
        console.log('[Cron/Decay] Starting decay job...');
        
        // Step 1: Apply ELO decay
        const decayResult = await runDecayJob();
        console.log('[Cron/Decay] Decay applied:', decayResult);
        
        // Step 2: Send decay notification emails (including to new returning players)
        console.log('[Cron/Decay] Processing decay emails...');
        const emailResult = await processDecayEmails(decayResult.newReturningPlayerIds);
        console.log('[Cron/Decay] Emails sent:', emailResult);
        
        return NextResponse.json({
            success: true,
            decay: {
                usersProcessed: decayResult.usersProcessed,
                usersDecayed: decayResult.usersDecayed,
                totalEloDecayed: decayResult.totalEloDecayed,
                newReturningPlayers: decayResult.newReturningPlayers,
            },
            emails: {
                warningsSent: emailResult.warningsSent,
                decayStartedSent: emailResult.decayStartedSent,
                severeSent: emailResult.severeSent,
                returningSent: emailResult.returningSent,
                errorCount: emailResult.errors.length,
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Cron/Decay] Job failed:', error);
        return NextResponse.json(
            { error: 'Decay job failed', details: String(error) },
            { status: 500 }
        );
    }
}

// Also support GET for easier testing (with same auth)
export async function GET() {
    // In development, allow GET without auth for testing
    if (process.env.NODE_ENV === 'development') {
        try {
            // Step 1: Apply ELO decay
            const decayResult = await runDecayJob();
            
            // Step 2: Send decay notification emails (including to new returning players)
            const emailResult = await processDecayEmails(decayResult.newReturningPlayerIds);
            
            return NextResponse.json({
                success: true,
                decay: {
                    usersProcessed: decayResult.usersProcessed,
                    usersDecayed: decayResult.usersDecayed,
                    totalEloDecayed: decayResult.totalEloDecayed,
                    newReturningPlayers: decayResult.newReturningPlayers,
                },
                emails: {
                    warningsSent: emailResult.warningsSent,
                    decayStartedSent: emailResult.decayStartedSent,
                    severeSent: emailResult.severeSent,
                    returningSent: emailResult.returningSent,
                    errorCount: emailResult.errors.length,
                },
                timestamp: new Date().toISOString(),
                mode: 'development'
            });
        } catch (error) {
            return NextResponse.json(
                { error: 'Decay job failed', details: String(error) },
                { status: 500 }
            );
        }
    }
    
    return NextResponse.json({ error: 'Use POST method in production' }, { status: 405 });
}


