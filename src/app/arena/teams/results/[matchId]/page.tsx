import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamResultsClient } from './team-results-client';
import { checkUserArenaEligibility } from '@/lib/actions/arena';
import { getDatabase } from '@/lib/db/sqlite';

// Import the PostgreSQL module for arena data
const arenaPostgres = require('@/lib/arena/postgres');

/**
 * Fetches team match results for the given arena match ID, using a local SQLite lookup for player names and the arena PostgreSQL data source.
 *
 * @param matchId - The arena match identifier to retrieve results for
 * @returns The match results object from the arena database, or `null` if retrieval fails
 */
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

/**
 * Server page component that displays team match results for a specific match.
 *
 * Authenticates the current user, enforces full arena eligibility, fetches match data for
 * the provided `matchId`, and renders TeamResultsClient populated with the match and player data.
 * Performs redirects to '/auth/login' if the user is not authenticated, to '/arena' if the user
 * is not eligible, and to '/arena/modes' if no match is found.
 *
 * @param params - A promise resolving to an object with the `matchId` route parameter
 * @returns A React element rendering the team results for the requested match
 */
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
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
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