import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamQueueClient } from './team-queue-client';
import { getPartyData } from '@/lib/actions/social';
import { checkUserArenaEligibility } from '@/lib/actions/arena';

// Disable Next.js router cache to prevent stale queueStatus during navigation
export const dynamic = 'force-dynamic';

export default async function TeamQueuePage({
    searchParams,
}: {
    searchParams: Promise<{ partyId?: string; phase?: string; mode?: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/auth/login?callbackUrl=/arena/teams/queue');
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as { id: string }).id);
    if (!eligibility.isEligible) {
        redirect('/arena');
    }

    // Await searchParams (Next.js 16+ requirement)
    const params = await searchParams;
    const partyId = params.partyId;
    const initialPhase = (params.phase as 'teammates' | 'opponent') || 'opponent';
    // Get mode from URL params or default to 5v5
    const mode = (params.mode as '5v5' | '2v2') || '5v5';
    
    if (!partyId) {
        redirect(`/arena/teams/setup?mode=${mode}`);
    }

    // Get party data to verify user is in the party
    const partyResult = await getPartyData();
    
    if (!partyResult.party || partyResult.party.id !== partyId) {
        redirect(`/arena/teams/setup?mode=${mode}`);
    }
    
    // CRITICAL: If the party is NOT in the queue, redirect back to setup
    // This prevents the redirect loop where client detects null queueStatus and redirects
    if (!partyResult.party.queueStatus) {
        redirect(`/arena/teams/setup?mode=${mode}&fromQueue=true`);
    }

    return (
        <TeamQueueClient
            partyId={partyId}
            party={partyResult.party}
            currentUserId={session.user.id as string}
            currentUserName={session.user.name || 'Player'}
            initialPhase={initialPhase}
            mode={mode}
        />
    );
}
