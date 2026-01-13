import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEmailVerificationStatus } from '@/lib/actions/verification';
import { VerifyEmailClient } from './verify-email-client';

export const dynamic = 'force-dynamic';

/**
 * Server-side page that enforces authentication, checks the user's email verification status, and renders the email verification client.
 *
 * Redirects unauthenticated users to `/auth/login?callbackUrl=/arena/modes` and redirects users whose email is already verified to `/arena/modes`.
 *
 * @returns A React element rendering `VerifyEmailClient` for the current user (email derived from verification status, session, or a fallback; username derived from session or `'Player'`).
 */
export default async function ArenaVerifyEmailPage() {
    const session = await auth();
    
    if (!session?.user) {
        redirect('/auth/login?callbackUrl=/arena/modes');
    }
    
    const verificationStatus = await getEmailVerificationStatus();
    
    // If already verified, redirect to arena
    if (verificationStatus.isVerified) {
        redirect('/arena/modes');
    }
    
    return (
        <VerifyEmailClient 
            email={verificationStatus.email || session.user.email || 'your email'}
            userName={session.user.name || 'Player'}
        />
    );
}
