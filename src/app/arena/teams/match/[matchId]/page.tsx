import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamMatchClient } from './team-match-client';
import { checkUserArenaEligibility } from '@/lib/actions/arena';

export default async function TeamMatchPage({
    params,
    searchParams,
}: {
    params: Promise<{ matchId: string }>;
    searchParams: Promise<{ demoMode?: string; partyId?: string }>;
}) {
    // Await params (Next.js 16+ requirement)
    const { matchId } = await params;
    const { demoMode, partyId } = await searchParams;

    // Allow demo mode to bypass auth for dev/testing
    const isDemoMode = matchId === 'demo' && demoMode === 'true' && process.env.ENABLE_DEV_TOOLS === 'true';

    if (isDemoMode) {
        return (
            <TeamMatchClient
                matchId={matchId}
                currentUserId="demo-user-001"
                partyId={partyId}
            />
        );
    }

    const session = await auth();

    if (!session?.user) {
        redirect('/auth/login');
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
    if (!eligibility.isEligible) {
        redirect('/arena');
    }

    return (
        <TeamMatchClient
            matchId={matchId}
            currentUserId={session.user.id as string}
            partyId={partyId}
        />
    );
}

