import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamMatchClient } from './team-match-client';

export default async function TeamMatchPage({
    params,
}: {
    params: Promise<{ matchId: string }>;
}) {
    const session = await auth();
    
    if (!session?.user) {
        redirect('/auth/login');
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

