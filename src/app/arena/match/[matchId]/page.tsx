import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RealTimeMatch } from "@/components/arena/real-time-match";
import { getMatch } from "@/lib/actions/matchmaking";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ matchId: string }>;
    searchParams: Promise<{ operation?: string }>;
}

export default async function ArenaMatchPage({ params, searchParams }: PageProps) {
    const { matchId } = await params;
    const { operation = 'mixed' } = await searchParams;
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    const userId = session.user.id as string;
    const userName = session.user.name || 'Player';

    // Try to get match data from matchmaking service
    const matchResult = await getMatch(matchId);

    let isAiMatch = false;
    let matchOperation = operation;

    if (matchResult.match) {
        isAiMatch = matchResult.match.odIsAiMatch;
        matchOperation = matchResult.match.odPlayer1?.odOperation || operation;
    }

    const initialPlayers: Record<string, any> = {};
    if (matchResult.match) {
        const p1 = matchResult.match.odPlayer1;
        initialPlayers[p1.odUserId] = {
            name: p1.odUserName,
            elo: p1.odElo,
            tier: p1.odTier,
            banner: p1.odEquippedBanner,
            title: p1.odEquippedTitle,
            level: p1.odLevel
        };

        const p2 = matchResult.match.odPlayer2;
        if (p2) {
            initialPlayers[p2.odUserId] = {
                name: p2.odUserName,
                elo: p2.odElo,
                tier: p2.odTier,
                banner: p2.odEquippedBanner,
                title: p2.odEquippedTitle,
                level: p2.odLevel
            };
        }
    }

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Minimal Header during match */}
            <div className="w-full max-w-7xl mx-auto p-4">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>Match {matchId.slice(0, 8)}...</span>
                    {isAiMatch && <span className="text-xs text-amber-400 px-2 py-0.5 bg-amber-500/20 rounded">vs AI</span>}
                    <span className="text-xs text-primary/60 px-2 py-0.5 bg-primary/10 rounded">LIVE</span>
                </div>
            </div>

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            <div className="flex-1 p-6 w-full max-w-[1400px] mx-auto relative z-10 flex flex-col items-center justify-center">
                <RealTimeMatch
                    matchId={matchId}
                    currentUserId={userId}
                    userName={userName}
                    operation={matchOperation}
                    isAiMatch={isAiMatch}
                    initialPlayers={initialPlayers}
                />
            </div>
        </main>
    );
}
