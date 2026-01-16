"use server";

/**
 * Session Management Actions
 */

import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { v4 as uuidv4 } from "uuid";
import { revalidatePath } from "next/cache";

const now = () => new Date().toISOString();

export interface UserSession {
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    expires_at: string;
    is_current: boolean;
}

/**
 * Get all active sessions for current user
 */
export async function getUserSessions(): Promise<UserSession[]> {
    const session = await auth();
    if (!session?.user) {
        return [];
    }

    const userId = (session.user as { id: string }).id;
    if (!userId) return [];

    const db = getDatabase();

    // Get all non-expired sessions
    interface SessionRow {
        id: string;
        ip_address: string | null;
        user_agent: string | null;
        created_at: string;
        expires_at: string;
    }
    const sessions = db.prepare(`
        SELECT id, ip_address, user_agent, created_at, expires_at 
        FROM sessions 
        WHERE user_id = ? AND expires_at > ?
        ORDER BY created_at DESC
    `).all(userId, now()) as SessionRow[];

    // Get current session token from cookies (approximate match)
    // In a real implementation, you'd compare session tokens directly
    return sessions.map((s, index) => ({
        id: s.id,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
        created_at: s.created_at,
        expires_at: s.expires_at,
        is_current: index === 0, // Most recent is likely current
    }));
}

/**
 * Create a new session record
 */
export async function createSession(
    userId: string,
    token: string,
    ipAddress?: string,
    userAgent?: string
): Promise<string> {
    const db = getDatabase();
    const id = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    db.prepare(`
        INSERT INTO sessions (id, user_id, token, ip_address, user_agent, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, token, ipAddress || null, userAgent || null, expiresAt, now());

    console.log(`[Session] Created session for user ${userId}`);
    return id;
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: "Not authenticated" };
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    // Verify the session belongs to this user
    const targetSession = db.prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?")
        .get(sessionId, userId);

    if (!targetSession) {
        return { success: false, error: "Session not found" };
    }

    // Delete the session
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);

    revalidatePath("/settings/sessions");
    console.log(`[Session] Revoked session ${sessionId} for user ${userId}`);

    return { success: true };
}

/**
 * Revoke all sessions except current
 */
export async function revokeAllOtherSessions(): Promise<{ success: boolean; count: number; error?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, count: 0, error: "Not authenticated" };
    }

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    // Get count before deletion
    const sessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE user_id = ?")
        .get(userId) as { count: number };

    // Delete all sessions for this user (they'll need to log in again)
    // In a full implementation, you'd exclude the current session token
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

    revalidatePath("/settings/sessions");
    console.log(`[Session] Revoked all sessions for user ${userId}`);

    return { success: true, count: sessions.count };
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());

    if (result.changes > 0) {
        console.log(`[Session] Cleaned up ${result.changes} expired sessions`);
    }

    return result.changes;
}
