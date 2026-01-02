import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MatchLobby } from "@/components/arena/match-lobby";
import { getMatch, getArenaStats } from "@/lib/actions/matchmaking";

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

    const userId = session.user.id as string;

    // Get real stats for the current user to ensure rank/division is up to date
    const userStats = await getArenaStats(userId);
    const matchResult = await getMatch(matchId);

    let players;

    if (matchResult.match) {
        const match = matchResult.match;
        const isPlayer1 = match.odPlayer1.odUserId === userId;
        const currentPlayer = isPlayer1 ? match.odPlayer1 : match.odPlayer2;
        const opponent = isPlayer1 ? match.odPlayer2 : match.odPlayer1;

        players = [
            {
                id: userId,
                name: currentPlayer?.odUserName || session.user.name || 'You',
                rank: userStats.rank || 'Bronze',
                division: userStats.division || 'I',
                elo: userStats.elo || 500,
                ready: true,
                banner: currentPlayer?.odEquippedBanner || 'default',
                title: currentPlayer?.odEquippedTitle || 'Challenger',
                level: currentPlayer?.odLevel || 1
            },
            {
                id: opponent?.odUserId || 'ai-opponent',
                name: opponent?.odUserName || 'AI Challenger',
                rank: opponent?.odTier || 'Bronze', // AI uses tier as rank
                division: 'I', // AI defaults to division I for now
                elo: opponent?.odElo || 500,
                ready: true,
                banner: opponent?.odEquippedBanner || 'default',
                title: opponent?.odEquippedTitle || 'Challenger',
                level: opponent?.odLevel || 1
            }
        ];
    } else {
        // Fallback
        players = [
            {
                id: userId,
                name: session.user.name || 'You',
                rank: userStats.rank || 'Bronze',
                division: userStats.division || 'I',
                elo: userStats.elo || 500,
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
                elo: 500,
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
