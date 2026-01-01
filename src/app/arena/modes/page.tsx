import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { ModeSelection } from "@/components/arena/mode-selection";

export const dynamic = 'force-dynamic';

export default async function ArenaModesPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Get user's arena stats from database
    const { getArenaStats } = await import("@/lib/actions/matchmaking");
    const arenaStats = await getArenaStats();

    return (
        <main className="h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Auth Header */}
            <div className="w-full shrink-0">
                <AuthHeader session={session} />
            </div>

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            {/* Main Content Filler */}
            <div className="flex-1 w-full relative z-10 overflow-hidden">
                <ModeSelection
                    userRank={arenaStats.rank}
                    userDivision={arenaStats.division}
                    userElo={arenaStats.elo}
                />
            </div>
        </main>
    );
}
