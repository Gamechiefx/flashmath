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

/**
 * Runs the daily ELO decay cron job, enforcing the configured CRON_SECRET when present and returning the job outcome.
 *
 * @param request - Incoming request; when `process.env.CRON_SECRET` is set the request must include `Authorization: Bearer <CRON_SECRET>`.
 * @returns On success, a JSON object containing `success: true`, the properties returned by the decay job, and a `timestamp`. If authentication fails, returns `{ error: 'Unauthorized' }` with HTTP 401. If the job fails, returns `{ error: 'Decay job failed', details: string }` with HTTP 500.
 */
export async function POST(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
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

/**
 * Executes the decay job when invoked in development for testing; in production it instructs clients to use POST.
 *
 * @returns On success (development): a JSON object with `success: true`, the properties returned by `runDecayJob()`, `timestamp` as an ISO string, and `mode: 'development'`. On job failure: a JSON object `{ error: 'Decay job failed', details: string }` with HTTP status 500. In production: a JSON object `{ error: 'Use POST method in production' }` with HTTP status 405.
 */
export async function GET(request: NextRequest) {
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

