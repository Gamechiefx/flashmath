import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamMatchClient } from './team-match-client';
import { checkUserArenaEligibility } from '@/lib/actions/arena';

/**
 * Render the team match page, handling demo-mode shortcut, authentication, and arena eligibility.
 *
 * If `matchId` is "demo" and demo mode is enabled via query and environment, the page renders
 * TeamMatchClient with a synthetic demo user. Otherwise the function requires an authenticated
 * session and checks arena eligibility; unauthenticated requests are redirected to '/auth/login'
 * and ineligible users are redirected to '/arena'.
 *
 * @param params - Promise resolving to an object with `matchId`
 * @param searchParams - Promise resolving to an object that may include `demoMode` and `partyId`
 * @returns A React element that renders `TeamMatchClient` configured for the requested match and current user
 */
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
                currentUserName="Demo Player"
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
            currentUserName={session.user.name || 'Player'}
            partyId={partyId}
        />
    );
}
