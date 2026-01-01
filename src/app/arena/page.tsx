import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { ArenaEligibility } from "@/components/arena/arena-eligibility";
import { getArenaEligibilityData } from "@/lib/actions/arena";

export const dynamic = 'force-dynamic';

export default async function ArenaPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    const eligibilityData = await getArenaEligibilityData();

    return (
        <main className="h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
            {/* Auth Header */}
            <div className="w-full max-w-7xl mx-auto shrink-0">
                <AuthHeader session={session} />
            </div>

            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64 text-transparent" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64 text-transparent" />

            {/* Arena-specific decorative element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] 
                            bg-gradient-radial from-primary/10 to-transparent rounded-full blur-[100px] opacity-50" />

            <div className="flex-1 p-6 lg:p-12 w-full max-w-2xl mx-auto relative z-10 overflow-auto">
                <ArenaEligibility
                    practiceStats={eligibilityData.practiceStats}
                    userAge={eligibilityData.userAge}
                    isAdmin={eligibilityData.isAdmin}
                />
            </div>
        </main>
    );
}
