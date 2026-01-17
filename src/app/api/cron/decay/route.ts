/**
 * Decay Cron Job API Route
 * 
 * This endpoint should be called daily by a cron job (e.g., Vercel Cron, GitHub Actions, etc.)
 * to apply ELO decay to inactive players.
 * 
 * Authentication: Requires CRON_SECRET header to prevent unauthorized access.
 * 
 * Usage (cURL):
 * curl -X POST https://your-domain.com/api/cron/decay \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDecayJob } from '@/lib/arena/decay';

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
        
        const result = await runDecayJob();
        
        console.log('[Cron/Decay] Job completed:', result);
        
        return NextResponse.json({
            success: true,
            ...result,
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
            const result = await runDecayJob();
            return NextResponse.json({
                success: true,
                ...result,
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


