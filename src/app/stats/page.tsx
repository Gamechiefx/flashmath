import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDashboardStats } from "@/lib/actions/user";
import { CareerStatsView } from "@/components/career-stats-view";

export default async function StatsPage() {
    const session = await auth();
    if (!session?.user) redirect("/auth");

    const stats = await getDashboardStats();

    return (
        <main className="min-h-screen bg-background text-foreground">
            <CareerStatsView stats={stats} />
        </main>
    );
}
