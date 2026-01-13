import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamSetupClient } from './team-setup-client';
import { getPartyData } from '@/lib/actions/social';
import { getUserTeams } from '@/lib/actions/teams';
import { checkUserArenaEligibility } from '@/lib/actions/arena';

// Disable Next.js router cache to prevent stale queueStatus during navigation
export const dynamic = 'force-dynamic';

/**
 * Render the team setup page after enforcing authentication and arena eligibility.
 *
 * Awaits runtime search parameters, fetches party data and the user's teams in parallel,
 * and returns the TeamSetupClient initialized with the resolved mode, party, invites,
 * user teams, and current user information.
 *
 * @param searchParams - A Promise that resolves to runtime query parameters. Supported keys:
 *   - `mode`: optional game mode string (defaults to `"5v5"` if omitted)
 *   - `fromQueue`: optional string `"true"` when the user just left a queue (treated as boolean)
 * @returns A JSX element that renders the team setup UI with fetched party data, invites,
 *          user teams, and the current user's id and display name.
 */
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
