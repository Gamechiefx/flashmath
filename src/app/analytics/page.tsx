import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { 
    getAdvancedAnalytics, 
    generateShareableAchievements, 
    generateProgressSummary 
} from "@/lib/actions/analytics";
import { AdvancedAnalyticsView } from "@/components/advanced-analytics-view";
import { AuthHeader } from "@/components/auth-header";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

/**
 * Render the Advanced Analytics page and enforce authenticated access.
 *
 * Renders a "Not Enough Data Yet" screen when analytics are unavailable, an "Unable to Load Analytics" message when the monthly progress summary cannot be loaded, or the full analytics UI when required data (analytics, shareable achievements, and monthly progress summary) is available. If the user is not authenticated, redirects to `/auth/login`.
 *
 * @returns A React element representing the Advanced Analytics page or a redirect to `/auth/login`.
 */
export default async function AnalyticsPage() {
    const session = await auth();
    if (!session?.user) redirect("/auth/login");

    // Get analytics data
    const analytics = await getAdvancedAnalytics();
    const achievements = await generateShareableAchievements();
    const progressSummary = await generateProgressSummary('month');

    // If no analytics data available, show message
    if (!analytics) {
        return (
            <main className="min-h-screen bg-background text-foreground">
                <AuthHeader session={session} />
                
                <div className="p-6 lg:p-12 max-w-4xl mx-auto">
                    <div className="flex items-center gap-4 mb-8">
                        <Link href="/dashboard">
                            <button className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                <ArrowLeft size={20} />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter">Advanced Analytics</h1>
                            <p className="text-muted-foreground text-sm">Deep insights into your performance</p>
                        </div>
                    </div>

                    <div className="text-center py-12">
                        <div className="text-6xl mb-4">📊</div>
                        <h2 className="text-2xl font-bold mb-4">Not Enough Data Yet</h2>
                        <p className="text-muted-foreground mb-6">
                            Complete at least 3 practice sessions to unlock advanced analytics and personalized insights.
                        </p>
                        <Link href="/practice">
                            <button className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors">
                                Start Practicing
                            </button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    if (!progressSummary) {
        return (
            <main className="min-h-screen bg-background text-foreground">
                <AuthHeader session={session} />
                <div className="p-6 lg:p-12 max-w-4xl mx-auto">
                    <div className="text-center py-12">
                        <h2 className="text-2xl font-bold mb-4">Unable to Load Analytics</h2>
                        <p className="text-muted-foreground">Please try again later.</p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
            <AuthHeader session={session} />
            
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -mr-64 -mt-64" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] -ml-64 -mb-64" />

            <div className="p-6 lg:p-12 max-w-7xl mx-auto relative z-10">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/dashboard">
                        <button className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter">Advanced Analytics</h1>
                        <p className="text-muted-foreground text-sm">Deep insights and personalized recommendations</p>
                    </div>
                </div>

                <AdvancedAnalyticsView 
                    analytics={analytics}
                    achievements={achievements}
                    progressSummary={progressSummary}
                />
            </div>
        </main>
    );
}