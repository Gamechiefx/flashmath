'use server';

import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { getDatabase } from '@/lib/db/sqlite';
import { createToken, verifyToken, markTokenUsed } from '@/lib/auth/tokens';
import { sendEmail } from '@/lib/email';
import { adminMfaEmailTemplate } from '@/lib/email/templates/admin-mfa';
import { parseRole, hasPermission, Permission } from '@/lib/rbac';
import crypto from 'crypto';

const ADMIN_MFA_COOKIE = 'admin_mfa_session';
const ADMIN_MFA_EXPIRY_HOURS = 1; // Session valid for 1 hour

interface AdminMfaResult {
    success: boolean;
    error?: string;
}

/**
 * Send admin MFA verification code to user's email
 */
export async function sendAdminMfaCode(): Promise<AdminMfaResult> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Not authenticated' };
    }

    const userId = (session.user as any).id;
    const email = session.user.email;
    const name = session.user.name || 'Admin';

    if (!email) {
        return { success: false, error: 'No email associated with account' };
    }

    // Verify user has admin permissions
    const db = getDatabase();
    const user = db.prepare('SELECT role, is_admin FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
        return { success: false, error: 'User not found' };
    }

    const userRole = parseRole(user.role, !!user.is_admin);
    if (!hasPermission(userRole, Permission.VIEW_ADMIN_CONSOLE)) {
        return { success: false, error: 'Insufficient permissions' };
    }

    try {
        // Create MFA token (10 minute expiry)
        const code = await createToken(email, 'admin_mfa', userId, 10);

        // Send email
        const emailTemplate = adminMfaEmailTemplate(name, code);
        const result = await sendEmail({
            to: email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
        });

        if (!result.success) {
            console.error('[Admin MFA] Failed to send email:', result.error);
            return { success: false, error: 'Failed to send verification email' };
        }

        console.log(`[Admin MFA] Code sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error('[Admin MFA] Error:', error);
        return { success: false, error: 'Failed to send verification code' };
    }
}

/**
 * Verify admin MFA code and create session
 */
export async function verifyAdminMfaCode(code: string): Promise<AdminMfaResult> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Not authenticated' };
    }

    const userId = (session.user as any).id;

    // Verify the token
    const result = await verifyToken(code, 'admin_mfa');

    if (!result.valid) {
        return { success: false, error: result.error || 'Invalid code' };
    }

    // Ensure token belongs to this user
    if (result.userId !== userId) {
        return { success: false, error: 'Invalid code' };
    }

    // Mark token as used
    await markTokenUsed(code);

    // Create admin MFA session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ADMIN_MFA_EXPIRY_HOURS * 60 * 60 * 1000);

    // Store session in database
    const db = getDatabase();
    const sessionId = crypto.randomUUID();

    // Clean up old admin MFA sessions for this user
    db.prepare('DELETE FROM verification_tokens WHERE user_id = ? AND type = ?').run(userId, 'admin_mfa_session');

    // Create new session token
    db.prepare(`
        INSERT INTO verification_tokens (id, user_id, email, token, type, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        userId,
        session.user.email,
        sessionToken,
        'admin_mfa_session',
        expiresAt.toISOString(),
        new Date().toISOString()
    );

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_MFA_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/admin',
    });

    console.log(`[Admin MFA] Session created for user ${userId}`);
    return { success: true };
}

/**
 * Check if current user has valid admin MFA session
 */
export async function checkAdminMfaSession(): Promise<boolean> {
    const session = await auth();
    if (!session?.user) {
        return false;
    }

    const userId = (session.user as any).id;

    // Check cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_MFA_COOKIE)?.value;

    if (!sessionToken) {
        return false;
    }

    // Verify session in database
    const db = getDatabase();
    const storedSession = db.prepare(`
        SELECT expires_at FROM verification_tokens
        WHERE token = ? AND type = 'admin_mfa_session' AND user_id = ?
    `).get(sessionToken, userId) as { expires_at: string } | undefined;

    if (!storedSession) {
        // Clean up invalid cookie
        cookieStore.delete(ADMIN_MFA_COOKIE);
        return false;
    }

    // Check expiry
    if (new Date(storedSession.expires_at) < new Date()) {
        // Clean up expired session
        db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(sessionToken);
        cookieStore.delete(ADMIN_MFA_COOKIE);
        return false;
    }

    return true;
}

/**
 * Clear admin MFA session (logout from admin)
 */
export async function clearAdminMfaSession(): Promise<void> {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_MFA_COOKIE)?.value;

    if (sessionToken) {
        const db = getDatabase();
        db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(sessionToken);
    }

    cookieStore.delete(ADMIN_MFA_COOKIE);
}
