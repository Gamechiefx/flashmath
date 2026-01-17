"use client";

import { SessionProvider } from "next-auth/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- NextAuth session type
export function AuthProvider({ children, session }: { children: React.ReactNode, session?: any }) {
    return <SessionProvider session={session} refetchInterval={300}>{children}</SessionProvider>;
}
