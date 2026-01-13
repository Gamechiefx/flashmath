import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMatchmakingData, checkUserArenaEligibility } from "@/lib/actions/arena";
import { getArenaStats } from "@/lib/actions/matchmaking";
import { ArenaQueueClient } from "@/components/arena/arena-queue-client";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ mode?: string; operation?: string }>;
}

/**
 * Render the Arena queue page, preparing user, matchmaking, and arena stats for the queue client.
 *
 * If there is no authenticated user this page redirects to `/auth/login`. If the user is not eligible
 * for full arena access this page redirects to `/arena`.
 *
 * @param searchParams - URL query parameters with optional `operation` (e.g., 'mixed', 'addition') and `mode` (e.g., '1v1', '2v2')
 * @returns A React element that renders ArenaQueueClient with the resolved user/matchmaking data, chosen operation and mode, and computed arena statistics (ELO, rank, rank division, and whether the operation is ranked).
 */
export default async function ArenaQueuePage({ searchParams }: PageProps) {
    const session = await auth();
    const params = await searchParams;

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
    if (!eligibility.isEligible) {
        redirect("/arena");
    }

    const matchmakingData = await getMatchmakingData();
    const arenaStats = await getArenaStats();
    const operation = params.operation || 'mixed';
    const mode = params.mode || '1v1';

    // Get operation-specific ELO for matchmaking (mixed uses overall average)
    const getOperationElo = () => {
        const op = operation;
        if (mode === '1v1') {
            // Duel mode - use operation-specific ELO
            if (op === 'mixed') return arenaStats.duel.elo; // Unranked, use average for display
            if (op === 'addition') return arenaStats.duel.addition;
            if (op === 'subtraction') return arenaStats.duel.subtraction;
            if (op === 'multiplication') return arenaStats.duel.multiplication;
            if (op === 'division') return arenaStats.duel.divisionOp;
            return arenaStats.duel.elo;
        } else {
            // Team mode - use mode + operation-specific ELO
            const modeKey = mode as '2v2' | '3v3' | '4v4' | '5v5';
            const modeStats = arenaStats.team.modes[modeKey];
            if (!modeStats) return 300;
            if (op === 'mixed') return modeStats.elo;
            if (op === 'addition') return modeStats.addition;
            if (op === 'subtraction') return modeStats.subtraction;
            if (op === 'multiplication') return modeStats.multiplication;
            if (op === 'division') return modeStats.divisionOp;
            return modeStats.elo;
        }
    };
    const operationElo = getOperationElo();

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

    // Get rank info for the mode type (duel vs team)
    const isDuel = mode === '1v1';
    const rank = isDuel ? arenaStats.duel.rank : arenaStats.team.rank;
    const rankDivision = isDuel ? arenaStats.duel.rankDivision : arenaStats.team.rankDivision;

    return (
        <ArenaQueueClient 
            data={data} 
            operation={operation} 
            arenaStats={{
                elo: operationElo, // Operation-specific ELO for matchmaking
                rank,
                rankDivision,
                isRanked: operation !== 'mixed' // Mixed is unranked
            }}
            mode={mode}
        />
    );
}