/**
 * Token Utilities
 * Secure token generation and validation for auth flows
 */

import crypto from 'crypto';
import { getDatabase } from '@/lib/db/sqlite';

export type TokenType = 'email_verification' | 'password_reset' | 'magic_link';

/**
 * Generate a secure token
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create and store a token in the database
 */
export async function createToken(
    email: string,
    type: TokenType,
    userId?: string,
    expiresInMinutes: number = 15
): Promise<string> {
    const db = getDatabase();
    const token = type === 'email_verification' ? generateVerificationCode() : generateSecureToken();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    // Delete any existing tokens of this type for this email
    db.prepare('DELETE FROM verification_tokens WHERE email = ? AND type = ?').run(email, type);

    // Create new token
    db.prepare(`
        INSERT INTO verification_tokens (id, user_id, email, token, type, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId || null, email, token, type, expiresAt, createdAt);

    console.log(`[Token] Created ${type} token for ${email}`);
    return token;
}

/**
 * Verify a token and return the payload if valid
 */
export async function verifyToken(
    token: string,
    type: TokenType
): Promise<{ valid: boolean; userId?: string; email?: string; error?: string }> {
    const db = getDatabase();

    const row = db.prepare(`
        SELECT user_id, email, expires_at, used_at FROM verification_tokens
        WHERE token = ? AND type = ?
    `).get(token, type) as { user_id: string | null; email: string; expires_at: string; used_at: string | null } | undefined;

    if (!row) {
        return { valid: false, error: 'Invalid or expired token' };
    }

    if (row.used_at) {
        return { valid: false, error: 'Token has already been used' };
    }

    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
        db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(token);
        return { valid: false, error: 'Token has expired' };
    }

    return {
        valid: true,
        userId: row.user_id || undefined,
        email: row.email
    };
}

/**
 * Mark a token as used
 */
export async function markTokenUsed(token: string): Promise<void> {
    const db = getDatabase();
    const usedAt = new Date().toISOString();
    db.prepare('UPDATE verification_tokens SET used_at = ? WHERE token = ?').run(usedAt, token);
}

/**
 * Delete a token
 */
export async function deleteToken(token: string): Promise<void> {
    const db = getDatabase();
    db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(token);
}

/**
 * Delete all tokens for an email
 */
export async function deleteEmailTokens(email: string, type?: TokenType): Promise<void> {
    const db = getDatabase();

    if (type) {
        db.prepare('DELETE FROM verification_tokens WHERE email = ? AND type = ?').run(email, type);
    } else {
        db.prepare('DELETE FROM verification_tokens WHERE email = ?').run(email);
    }
}

/**
 * Clean up expired tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
    const db = getDatabase();
    const now = new Date().toISOString();

    const result = db.prepare('DELETE FROM verification_tokens WHERE expires_at < ?').run(now);

    if (result.changes > 0) {
        console.log(`[Token] Cleaned up ${result.changes} expired tokens`);
    }

    return result.changes;
}
