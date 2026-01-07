import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TeamResultsClient } from './team-results-client';
import { getDatabase } from '@/lib/db/sqlite';
import { isEmailVerified } from '@/lib/actions/verification';

async function getMatchResults(matchId: string) {
    const db = getDatabase();
    
    // Get match data
    const match = db.prepare(`
        SELECT 
            tm.*,
            t1.name as team1_name, t1.tag as team1_tag,
            t2.name as team2_name, t2.tag as team2_tag
        FROM team_matches tm
        LEFT JOIN teams t1 ON t1.id = tm.team1_id
        LEFT JOIN teams t2 ON t2.id = tm.team2_id
        WHERE tm.id = ?
    `).get(matchId) as any;
    
    if (!match) return null;
    
    // Get player stats
    const players = db.prepare(`
        SELECT 
            tmp.*,
            u.name as player_name, u.level,
            t.name as team_name
        FROM team_match_players tmp
        JOIN users u ON u.id = tmp.user_id
        LEFT JOIN teams t ON t.id = tmp.team_id
        WHERE tmp.match_id = ?
        ORDER BY tmp.team_id, tmp.questions_correct DESC
    `).all(matchId) as any[];
    
    return { match, players };
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

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect('/arena/verify-email');
    }

    // Await params (Next.js 16+ requirement)
    const { matchId } = await params;

    const results = await getMatchResults(matchId);
    
    if (!results) {
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

