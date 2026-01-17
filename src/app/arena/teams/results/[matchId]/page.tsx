import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamResultsClient } from './team-results-client';
import { checkUserArenaEligibility } from '@/lib/actions/arena';
import { getDatabase } from '@/lib/db/sqlite';
import * as arenaPostgres from '@/lib/arena/postgres';

interface TeamMatchResult {
    match: {
        id: string;
        team1_id: string;
        team2_id: string;
        team1_name: string;
        team2_name: string;
        team1_tag?: string;
        team2_tag?: string;
        winner_team_id?: string | null;
        team1_score: number;
        team2_score: number;
        team1_elo_change?: number;
        team2_elo_change?: number;
        match_type?: string;
        created_at?: string;
    };
    players: Array<{
        match_id?: string;
        user_id: string;
        team_id: string;
        player_name: string;
        was_igl?: boolean;
        was_anchor?: boolean;
        questions_correct: number;
        questions_attempted: number;
        accuracy?: number;
        best_streak?: number;
        avg_answer_time_ms?: number;
        operation_slot?: string;
    }>;
}

async function getMatchResults(matchId: string): Promise<TeamMatchResult | null> {
    try {
        // Get SQLite database for player name lookups
        const sqliteDb = getDatabase();
        // Get match data from PostgreSQL (arena database)
        const result = await arenaPostgres.getTeamMatchById(matchId, sqliteDb);
        return result as TeamMatchResult | null;
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
