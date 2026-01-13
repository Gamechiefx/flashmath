import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PracticeView } from "@/components/practice-view";
import { Suspense } from "react";
import { isEmailVerified } from "@/lib/actions/verification";

export const dynamic = 'force-dynamic';

/**
 * Ensures the user is authenticated and email-verified, then renders the practice UI.
 *
 * If there is no authenticated user, redirects to "/auth/login". If the user's email is not verified, redirects to "/arena/verify-email".
 *
 * @returns The React element that renders PracticeView wrapped in a Suspense fallback.
 */
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