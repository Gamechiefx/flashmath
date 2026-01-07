import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getEmailVerificationStatus } from '@/lib/actions/verification';
import { VerifyEmailClient } from './verify-email-client';

export const dynamic = 'force-dynamic';

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

