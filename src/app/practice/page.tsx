import { auth } from "@/auth";
import { PracticeView } from "@/components/practice-view";
import { Suspense } from "react";

export default async function PracticePage() {
    const session = await auth();

    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary animate-pulse">LOADING SIMULATION...</div>}>
            <PracticeView session={session} />
        </Suspense>
    );
}
