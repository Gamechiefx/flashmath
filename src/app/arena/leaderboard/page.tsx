import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { ArenaLeaderboard } from "@/components/arena/arena-leaderboard";
import { getArenaLeaderboard } from "@/lib/actions/leaderboard";
import { isEmailVerified } from "@/lib/actions/verification";

export const dynamic = 'force-dynamic';

export default async function ArenaLeaderboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect("/arena/verify-email");
    }

    // Fetch initial leaderboard data (duel, overall, alltime)
    const initialData = await getArenaLeaderboard('duel', 'overall', 'alltime', 100);

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Auth Header */}
            <AuthHeader session={session} />

            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Top right glow */}
                <div className="absolute -top-64 -right-64 w-[700px] h-[700px] bg-primary/10 rounded-full blur-[150px]" />
                
                {/* Bottom left glow */}
                <div className="absolute -bottom-64 -left-64 w-[700px] h-[700px] bg-amber-500/10 rounded-full blur-[150px]" />
                
                {/* Center radial */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] 
                                bg-gradient-radial from-cyan-500/5 via-transparent to-transparent rounded-full blur-[80px]" />
                
                {/* Grid pattern overlay */}
                <div 
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: `
                            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                        `,
                        backgroundSize: '50px 50px'
                    }}
                />
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full max-w-7xl mx-auto relative z-10 p-4 lg:p-8 pt-20 lg:pt-24">
                <ArenaLeaderboard initialData={initialData} />
            </div>
        </main>
    );
}


