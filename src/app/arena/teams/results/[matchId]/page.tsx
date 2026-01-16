import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamResultsClient } from './team-results-client';
import { checkUserArenaEligibility } from '@/lib/actions/arena';
import { getDatabase } from '@/lib/db/sqlite';
import * as arenaPostgres from '@/lib/arena/postgres';

async function getMatchResults(matchId: string) {
    try {
        // Get SQLite database for player name lookups
        const sqliteDb = getDatabase();
        // Get match data from PostgreSQL (arena database)
        const result = await arenaPostgres.getTeamMatchById(matchId, sqliteDb);
        return result;
    } catch (err) {
        console.error('[TeamResults] Error fetching match results:', err);
        return null;
    }
}

export default async function TeamResultsPage({
    params,
}: {
    params: Promise<{ matchId: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/auth/login');
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as { id: string }).id);
    if (!eligibility.isEligible) {
        redirect('/arena');
    }

    // Await params (Next.js 16+ requirement)
    const { matchId } = await params;

    const results = await getMatchResults(matchId);

    if (!results) {
        console.log('[TeamResults] No match found for ID:', matchId);
        redirect('/arena/modes');
    }

    return (
        <TeamResultsClient
            matchId={matchId}
            match={results.match}
            players={results.players}
            currentUserId={session.user.id as string}
        />
    );
}
