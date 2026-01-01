import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MatchmakingQueue } from "@/components/arena/matchmaking-queue";
import { getMatchmakingData } from "@/lib/actions/arena";
import { getArenaStats } from "@/lib/actions/matchmaking";
import { Suspense } from "react";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ mode?: string; operation?: string }>;
}

interface QueueContentProps {
    data: any;
    operation: string;
    arenaStats: {
        elo: number;
        rank: string;
        division: string;
    };
}

function QueueContent({ data, operation, arenaStats }: QueueContentProps) {
    return (
        <MatchmakingQueue
            userId={data.userId}
            userName={data.name || 'Player'}
            level={data.level || 1}
            tier={arenaStats.rank}
            elo={arenaStats.elo}
            operation={operation}
            equippedBanner={data.equippedBanner || 'default'}
            equippedTitle={data.equippedTitle || 'Challenger'}
        />
    );
}

export default async function ArenaQueuePage({ searchParams }: PageProps) {
    const session = await auth();
    const params = await searchParams;

    if (!session?.user) {
        redirect("/auth/login");
    }

    const matchmakingData = await getMatchmakingData();
    const arenaStats = await getArenaStats();
    const operation = params.operation || 'mixed';

    // Use defaults if data fetch fails - ensure all Banner fields are present
    const data = matchmakingData.success ? matchmakingData : {
        userId: (session.user as any).id,
        name: session.user.name || 'Player',
        practiceXP: 0,
        mathTiers: {},
        confidence: 1.0,
        level: 1,
        equippedBanner: 'default',
        equippedTitle: 'Challenger'
    };

    return (
        <main className="h-screen bg-background text-foreground flex flex-col relative">
            {/* Main Content - Full Screen Immersive */}
            <div className="flex-1 w-full max-w-7xl mx-auto relative z-10 flex items-center justify-center">
                <Suspense fallback={<div className="text-center font-black text-white/20 uppercase tracking-widest">Entering Queue...</div>}>
                    <QueueContent data={data} operation={operation} arenaStats={arenaStats} />
                </Suspense>
            </div>
        </main>
    );
}
