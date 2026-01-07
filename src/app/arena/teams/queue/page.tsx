import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamQueueClient } from './team-queue-client';
import { getPartyData } from '@/lib/actions/social';
import { isEmailVerified } from '@/lib/actions/verification';

// Disable Next.js router cache to prevent stale queueStatus during navigation
export const dynamic = 'force-dynamic';

export default async function TeamQueuePage({
    searchParams,
}: {
    searchParams: Promise<{ partyId?: string; phase?: string }>;
}) {
    const session = await auth();
    
    if (!session?.user) {
        redirect('/auth/login?callbackUrl=/arena/teams/queue');
    }

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect('/arena/verify-email');
    }

    // Await searchParams (Next.js 16+ requirement)
    const params = await searchParams;
    const partyId = params.partyId;
    const initialPhase = (params.phase as 'teammates' | 'opponent') || 'opponent';
    
    if (!partyId) {
        redirect('/arena/teams/setup?mode=5v5');
    }

    // Get party data to verify user is in the party
    const partyResult = await getPartyData();
    
    if (!partyResult.party || partyResult.party.id !== partyId) {
        redirect('/arena/teams/setup?mode=5v5');
    }
    
    // CRITICAL: If the party is NOT in the queue, redirect back to setup
    // This prevents the redirect loop where client detects null queueStatus and redirects
    if (!partyResult.party.queueStatus) {
        redirect('/arena/teams/setup?mode=5v5&fromQueue=true');
    }

    return (
        <TeamQueueClient
            partyId={partyId}
            party={partyResult.party}
            currentUserId={session.user.id as string}
            currentUserName={session.user.name || 'Player'}
            initialPhase={initialPhase}
        />
    );
}
