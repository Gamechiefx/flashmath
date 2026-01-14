import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PracticeView } from "@/components/practice-view";
import { Suspense } from "react";
import { isEmailVerified } from "@/lib/actions/verification";

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/auth/login");
    }

    // Check email verification - required for Practice access
    const verified = await isEmailVerified();
    if (!verified) {
        redirect("/arena/verify-email");
    }

    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary animate-pulse">LOADING SIMULATION...</div>}>
            <PracticeView session={session} />
        </Suspense>
    );
}
