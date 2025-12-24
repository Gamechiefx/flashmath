import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authConfig = {
    secret: process.env.AUTH_SECRET || "94f17709-3ca3-465a-b7a0-eecf410d5504", // Fallback for dev
    pages: {
        signIn: "/auth/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false;
            }
            return true;
        },
    },
    trustHost: true,
    providers: [], // Empty array, we'll add it in auth.ts
} satisfies NextAuthConfig;
