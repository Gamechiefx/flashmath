import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { getLeagueData } from "@/lib/actions/leagues";
import { LeaderboardView } from "@/components/leaderboard-view";

/**
 * Render the authenticated leaderboard page and display league standings or an initializing message.
 *
 * If there is no authenticated user session, redirects the client to /auth/login. Fetches league data and renders
 * an AuthHeader and either the LeaderboardView when data is available or a centered "INITIALIZING CIRCUIT..." placeholder while data is absent.
 *
 * @returns A React element representing the leaderboard page.
 */
export default async function LeaderboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    const data = await getLeagueData();

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            <AuthHeader session={session} />

            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            <div className="flex-1 p-6 lg:p-12 w-full max-w-7xl mx-auto relative z-10">
                {data ? (
                    <LeaderboardView data={data} />
                ) : (
                    <div className="text-center py-20 animate-pulse font-mono text-primary">INITIALIZING CIRCUIT...</div>
                )}
            </div>
        </main>
    );
}