import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ArenaModesClient } from "@/components/arena/arena-modes-client";
import { checkUserArenaEligibility } from "@/lib/actions/arena";

export const dynamic = 'force-dynamic';

export default async function ArenaModesPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check full arena eligibility (email, age, practice sessions)
    const eligibility = await checkUserArenaEligibility((session.user as any).id);
    if (!eligibility.isEligible) {
        // Redirect to arena page which shows requirements
        redirect("/arena");
    }

    // Get user's arena stats from database
    const { getArenaStats } = await import("@/lib/actions/matchmaking");
    const arenaStats = await getArenaStats();

    return (
        <ArenaModesClient session={session} arenaStats={arenaStats} />
    );
}
