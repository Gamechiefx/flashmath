import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MatchLobby } from "@/components/arena/match-lobby";
import { getMatch, getArenaStats } from "@/lib/actions/matchmaking";
import { checkUserArenaEligibility } from "@/lib/actions/arena";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ matchId: string }>;
    searchParams: Promise<{ operation?: string }>;
}

export default async function ArenaLobbyPage({ params, searchParams }: PageProps) {
    const { matchId } = await params;
    const { operation = 'mixed' } = await searchParams;
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
    if (!eligibility.isEligible) {
        redirect("/arena");
    }

    const userId = session.user.id as string;

    // Get real stats for the current user to ensure rank/division is up to date
    const userStats = await getArenaStats(userId);
    const matchResult = await getMatch(matchId);

    // Helper to get operation-specific ELO
    const getOperationElo = (mode: string, op: string): number => {
        const isDuel = mode === '1v1';
        if (op === 'mixed') {
            // Mixed is unranked, show average
            return isDuel ? userStats.duel.elo : userStats.team.elo;
        }
        if (isDuel) {
            if (op === 'addition') return userStats.duel.addition;
            if (op === 'subtraction') return userStats.duel.subtraction;
            if (op === 'multiplication') return userStats.duel.multiplication;
            if (op === 'division') return userStats.duel.divisionOp;
            return userStats.duel.elo;
        }
        const modeKey = mode as '2v2' | '3v3' | '4v4' | '5v5';
        const modeStats = userStats.team.modes[modeKey];
        if (!modeStats) return 300;
        if (op === 'addition') return modeStats.addition;
        if (op === 'subtraction') return modeStats.subtraction;
        if (op === 'multiplication') return modeStats.multiplication;
        if (op === 'division') return modeStats.divisionOp;
        return modeStats.elo;
    };

    let players;

    if (matchResult.match) {
        const match = matchResult.match;
        const isPlayer1 = match.odPlayer1.odUserId === userId;
        const currentPlayer = isPlayer1 ? match.odPlayer1 : match.odPlayer2;
        const opponent = isPlayer1 ? match.odPlayer2 : match.odPlayer1;

        const mode = currentPlayer?.odMode || '1v1';
        const isDuel = mode === '1v1';
        const operationElo = getOperationElo(mode, operation);

        players = [
            {
                id: userId,
                name: currentPlayer?.odUserName || session.user.name || 'You',
                rank: isDuel ? userStats.duel.rank : userStats.team.rank,
                division: isDuel ? userStats.duel.rankDivision : userStats.team.rankDivision,
                elo: operationElo || 300,
                ready: true,
                banner: currentPlayer?.odEquippedBanner || 'default',
                title: currentPlayer?.odEquippedTitle || 'Challenger',
                level: currentPlayer?.odLevel || 1
            },
            {
                id: opponent?.odUserId || 'ai-opponent',
                name: opponent?.odUserName || 'AI Challenger',
                rank: opponent?.odRank || 'Bronze',
                division: opponent?.odDivision || 'I',
                elo: opponent?.odElo || 300,
                ready: true,
                banner: opponent?.odEquippedBanner || 'default',
                title: opponent?.odEquippedTitle || 'Challenger',
                level: opponent?.odLevel || 1
            }
        ];
    } else {
        // Fallback - use duel stats by default
        players = [
            {
                id: userId,
                name: session.user.name || 'You',
                rank: userStats.duel.rank || 'Bronze',
                division: userStats.duel.rankDivision || 'I',
                elo: userStats.duel.elo || 300,
                ready: true,
                banner: 'default',
                title: 'Challenger',
                level: 1
            },
            {
                id: 'ai-opponent',
                name: 'AI Challenger',
                rank: 'Bronze',
                division: 'I',
                elo: 300,
                ready: true,
                banner: 'default',
                title: 'Challenger',
                level: 1
            }
        ];
    }

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            <div className="flex-1 p-6 lg:p-12 w-full max-w-6xl mx-auto relative z-10 flex items-center justify-center">
                <MatchLobby
                    matchId={matchId}
                    players={players}
                    currentUserId={userId}
                    operation={operation}
                />
            </div>
        </main>
    );
}
