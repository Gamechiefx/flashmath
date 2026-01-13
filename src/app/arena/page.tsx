import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeader } from "@/components/auth-header";
import { ArenaEligibility } from "@/components/arena/arena-eligibility";
import { getArenaEligibilityData } from "@/lib/actions/arena";
import { isEmailVerified } from "@/lib/actions/verification";

export const dynamic = 'force-dynamic';

/**
 * Render the Arena page and enforce access control, providing eligibility data to the UI.
 *
 * Redirects to "/auth/login" when there is no authenticated user and to "/arena/verify-email" when the user's email is not verified. When access is allowed, fetches arena eligibility data and renders the page layout containing the AuthHeader and ArenaEligibility components populated with that data.
 *
 * @returns A React element representing the Arena page layout populated with the user's eligibility data.
 */
export default async function ArenaPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check email verification - required for Arena access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect("/arena/verify-email");
    }

    const eligibilityData = await getArenaEligibilityData();

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col relative overflow-x-hidden">
            {/* Auth Header */}
            <AuthHeader session={session} />

            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64 text-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64 text-transparent pointer-events-none" />

            {/* Arena-specific decorative element */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] 
                            bg-gradient-radial from-primary/10 to-transparent rounded-full blur-[100px] opacity-50 pointer-events-none" />

            <div className="flex-1 w-full max-w-2xl mx-auto relative z-10 p-6 lg:p-12">
                <ArenaEligibility
                    practiceStats={eligibilityData.practiceStats}
                    userAge={eligibilityData.userAge}
                    isAdmin={eligibilityData.isAdmin}
                    confidenceBreakdown={eligibilityData.confidenceBreakdown}
                    decayInfo={eligibilityData.decayInfo}
                />
            </div>
        </main>
    );
}