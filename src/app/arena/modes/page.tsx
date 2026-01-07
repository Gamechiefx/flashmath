import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ArenaModesClient } from "@/components/arena/arena-modes-client";
import { isEmailVerified } from "@/lib/actions/verification";

export const dynamic = 'force-dynamic';

export default async function ArenaModesPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect("/arena/verify-email");
    }

    // Get user's arena stats from database
    const { getArenaStats } = await import("@/lib/actions/matchmaking");
    const arenaStats = await getArenaStats();

    return (
        <ArenaModesClient session={session} arenaStats={arenaStats} />
    );
}
