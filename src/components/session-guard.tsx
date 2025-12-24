"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function SessionGuard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // If unauthenticated and on a protected route, kick.
        // Public routes: /, /auth/login, /auth/register
        // We can just rely on the fact that if this runs and status is unauthenticated, 
        // and we ARE NOT on a public page, we kick.

        const isPublic = pathname === "/" || pathname?.startsWith("/auth");

        if (status === "unauthenticated" && !isPublic) {
            console.log("[Guard] Session invalid, signing out...");
            signOut({ callbackUrl: "/auth/login" });
        }

        // Optional: We can also check if the session contains a "error" flag if we put one there
        // But preventing the session from being created in auth.ts (returning null) results in "unauthenticated"
    }, [status, pathname, router]);

    return null; // Invisible component
}
