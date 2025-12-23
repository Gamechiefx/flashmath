import { OperationStatsView } from "@/components/operation-stats-view";
import { getOperationDetails } from "@/lib/actions/user";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
    params: Promise<{
        op: string;
    }>;
}

export default async function OperationStatsPage({ params }: PageProps) {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    const { op } = await params;
    const stats = await getOperationDetails(op);

    if (!stats) {
        redirect("/dashboard");
    }

    return <OperationStatsView stats={stats} />;
}
