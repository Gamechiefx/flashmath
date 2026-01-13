import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDashboardStats } from "@/lib/actions/user";
import { getArenaStats } from "@/lib/actions/matchmaking";
import { CareerStatsView } from "@/components/career-stats-view";

export const dynamic = 'force-dynamic';

/**
 * Render the career statistics page by fetching dashboard and arena statistics and enforcing authentication.
 *
 * If the user is not authenticated, redirects to "/auth". Otherwise fetches dashboard and arena stats and
 * renders a view populated with a merged stats object.
 *
 * @returns A React element containing CareerStatsView populated with merged dashboard and arena statistics.
 */
export default async function StatsPage() {
    const session = await auth();
    if (!session?.user) redirect("/auth");

    const stats = await getDashboardStats();
    const arenaStats = await getArenaStats();

    return (
        <main className="min-h-screen bg-background text-foreground">
            <CareerStatsView stats={{ ...stats, arenaStats }} />
        </main>
    );
}