'use server';

import { auth } from '@/auth';
import { queryOne, type UserRow } from '@/lib/db';

/**
 * Check if the current user has verified their email
 * Returns true if verified, false otherwise
 */
export async function isEmailVerified(): Promise<boolean> {
    const session = await auth();
    if (!session?.user) return false;
    
    const userId = (session.user as { id: string }).id;
    if (!userId) return false;
    
    const user = queryOne('SELECT email_verified FROM users WHERE id = ?', [userId]) as { email_verified?: number } | null;
    
    return user?.email_verified === 1;
}

/**
 * Get user's email verification status with details
 */
export async function getEmailVerificationStatus(): Promise<{
    isVerified: boolean;
    email: string | null;
    verifiedAt: string | null;
}> {
    const session = await auth();
    if (!session?.user) {
        return { isVerified: false, email: null, verifiedAt: null };
    }
    
    const userId = (session.user as { id: string }).id;
    if (!userId) {
        return { isVerified: false, email: null, verifiedAt: null };
    }
    
    const user = queryOne(
        'SELECT email, email_verified, email_verified_at FROM users WHERE id = ?', 
        [userId]
    ) as { email?: string; email_verified?: number; email_verified_at?: string | null } | null;
    
    return {
        isVerified: user?.email_verified === 1,
        email: user?.email || null,
        verifiedAt: user?.email_verified_at || null,
    };
}

