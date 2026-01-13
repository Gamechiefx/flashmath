import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamSetupClient } from './team-setup-client';
import { getPartyData } from '@/lib/actions/social';
import { getUserTeams } from '@/lib/actions/teams';
import { checkUserArenaEligibility } from '@/lib/actions/arena';

// Disable Next.js router cache to prevent stale queueStatus during navigation
export const dynamic = 'force-dynamic';

export default async function TeamSetupPage({
    searchParams,
}: {
    searchParams: Promise<{ mode?: string; fromQueue?: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/auth/login?callbackUrl=/arena/teams/setup');
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
    if (!eligibility.isEligible) {
        redirect('/arena');
    }

    // Await searchParams (Next.js 16+ requirement)
    const params = await searchParams;
    const mode = params.mode || '5v5';
    // fromQueue=true means user just left the queue, so don't auto-redirect back
    const fromQueue = params.fromQueue === 'true';
    
    // Get party data and user's teams
    const [partyResult, userTeams] = await Promise.all([
        getPartyData(),
        getUserTeams(),
    ]);

    // #region agent log - Server-side logging for hypothesis A
    console.log('[TeamSetup:Server] Page render - partyId:', partyResult.party?.id, 'queueStatus:', partyResult.party?.queueStatus, 'fromQueue:', fromQueue);
    // #endregion

    return (
        <TeamSetupClient
            mode={mode}
            initialParty={partyResult.party}
            partyInvites={partyResult.invites}
            userTeams={userTeams}
            currentUserId={session.user.id as string}
            currentUserName={session.user.name || 'Player'}
            fromQueue={fromQueue}
        />
    );
}

