"use server";

/**
 * Security Activity Log Actions
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { v4 as uuidv4 } from "uuid";

const now = () => new Date().toISOString();

export interface SecurityActivity {
    id: string;
    action: string;
    ip_address: string | null;
    user_agent: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Security log details can be any type
    details: any;
    created_at: string;
}

/**
 * Log a security event
 */
export async function logSecurityActivity(
    userId: string,
    action: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
): Promise<void> {
    const db = getDatabase();

    db.prepare(`
        INSERT INTO security_activity (id, user_id, action, ip_address, user_agent, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        uuidv4(),
        userId,
        action,
        ipAddress || null,
        userAgent || null,
        details ? JSON.stringify(details) : null,
        now()
    );
}

/**
 * Get recent security activity for current user
 */
export async function getSecurityActivity(limit: number = 20): Promise<SecurityActivity[]> {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    const activities = db.prepare(`
        SELECT id, action, ip_address, user_agent, details, created_at 
        FROM security_activity 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `).all(userId, limit) as Array<{
        id: string;
        action: string;
        ip_address: string | null;
        user_agent: string | null;
        details: string | null;
        created_at: string;
    }>;

    return activities.map(a => ({
        ...a,
        details: a.details ? JSON.parse(a.details) : null,
    }));
}

/**
 * Get linked OAuth accounts for current user
 */
export async function getLinkedAccounts(): Promise<Array<{
    provider: string;
    provider_account_id: string;
    created_at: string;
}>> {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    return db.prepare(`
        SELECT provider, provider_account_id, created_at 
        FROM oauth_accounts 
        WHERE user_id = ?
    `).all(userId) as Array<{
        provider: string;
        provider_account_id: string;
        created_at?: string;
        [key: string]: unknown;
    }>;
}

/**
 * Unlink an OAuth account
 */
export async function unlinkAccount(provider: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: "Not authenticated" };
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    // Check if user has a password (can't unlink if it's their only login method)
    const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash?: string | null } | undefined;
    const linkedAccounts = db.prepare("SELECT COUNT(*) as count FROM oauth_accounts WHERE user_id = ?").get(userId) as { count: number } | undefined;

    if (!user.password_hash && linkedAccounts.count <= 1) {
        return { success: false, error: "Cannot unlink your only login method. Set a password first." };
    }

    // Delete the OAuth account link
    db.prepare("DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?").run(userId, provider);

    // Log the activity
    await logSecurityActivity(userId, "oauth_unlinked", undefined, undefined, { provider });

    console.log(`[Security] Unlinked ${provider} account for user ${userId}`);
    return { success: true };
}
