/**
 * Health Check Endpoint
 * Used by Docker healthchecks and load balancers
 * 
 * Verifies that:
 * 1. Next.js is ready to handle requests
 * 2. Database connections are available (optional deep check)
 */

import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

// PostgreSQL check (lazy import to avoid build issues)
let arenaPostgres: any = null;
try {
    arenaPostgres = require('@/lib/arena/postgres.js');
} catch {
    // PostgreSQL not available during build
}

/**
 * Handle GET requests for the service health endpoint, supporting shallow and deep checks.
 *
 * When the query parameter `deep=true` is provided, performs connectivity checks for the
 * configured SQLite database and, if available, the optional PostgreSQL pool and includes
 * per-component results in `checks`. Without `deep=true` returns a basic health object.
 *
 * @returns A JSON object with `status` (`'ok' | 'degraded' | 'error'`), `timestamp`, and
 * optional `checks` detailing `sqlite` and `postgres` booleans. Responds with HTTP 200 when
 * `status` is `'ok'` or `'degraded'`, and HTTP 503 when `status` is `'error'`.
 */
export async function GET(request: Request) {
    const url = new URL(request.url);
    const deep = url.searchParams.get('deep') === 'true';
    
    const health: {
        status: 'ok' | 'degraded' | 'error';
        timestamp: string;
        checks?: {
            sqlite?: boolean;
            postgres?: boolean;
        };
    } = {
        status: 'ok',
        timestamp: new Date().toISOString(),
    };
    
    // Basic health check - just verify the server is responding
    if (!deep) {
        return NextResponse.json(health);
    }
    
    // Deep health check - verify database connections
    health.checks = {};
    
    // Check SQLite
    try {
        const db = getDatabase();
        db.prepare('SELECT 1').get();
        health.checks.sqlite = true;
    } catch {
        health.checks.sqlite = false;
        health.status = 'degraded';
    }
    
    // Check PostgreSQL (if available)
    if (arenaPostgres) {
        try {
            const pool = arenaPostgres.getPool();
            await pool.query('SELECT 1');
            health.checks.postgres = true;
        } catch {
            health.checks.postgres = false;
            health.status = 'degraded';
        }
    }
    
    // Return appropriate status code
    const statusCode = health.status === 'ok' ? 200 : (health.status === 'degraded' ? 200 : 503);
    return NextResponse.json(health, { status: statusCode });
}