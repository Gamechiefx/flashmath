import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMatchmakingData } from "@/lib/actions/arena";
import { getArenaStats } from "@/lib/actions/matchmaking";
import { ArenaQueueClient } from "@/components/arena/arena-queue-client";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ mode?: string; operation?: string }>;
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
        <ArenaQueueClient data={data} operation={operation} arenaStats={arenaStats} />
    );
}
