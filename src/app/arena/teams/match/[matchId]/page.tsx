import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamMatchClient } from './team-match-client';
import { isEmailVerified } from '@/lib/actions/verification';

export default async function TeamMatchPage({
    params,
}: {
    params: Promise<{ matchId: string }>;
}) {
    const session = await auth();
    
    if (!session?.user) {
        redirect('/auth/login');
    }

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect('/arena/verify-email');
    }

    // Await params (Next.js 16+ requirement)
    const { matchId } = await params;

    return (
        <TeamMatchClient
            matchId={matchId}
            currentUserId={session.user.id as string}
            currentUserName={session.user.name || 'Player'}
        />
    );
}

