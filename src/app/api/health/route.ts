/**
 * Health Check Endpoint
 * Used by Docker healthchecks and load balancers
 */

import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
