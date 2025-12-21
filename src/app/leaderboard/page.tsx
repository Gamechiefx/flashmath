import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { getLeagueData } from "@/lib/actions/leagues";
import { LeaderboardView } from "@/components/leaderboard-view";

export default async function LeaderboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    const data = await getLeagueData();

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader session={session} />
            </div>

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
