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
        redirect({ url, baseUrl }) {
            // Fix localhost redirect issue - always use relative paths or NEXTAUTH_URL
            const nextAuthUrl = process.env.NEXTAUTH_URL || baseUrl;

            // If URL contains localhost, replace with proper base URL
            if (url.includes('localhost')) {
                const urlPath = new URL(url).pathname;
                return `${nextAuthUrl}${urlPath}`;
            }

            // If it's a relative URL, prepend the base URL
            if (url.startsWith('/')) {
                return `${nextAuthUrl}${url}`;
            }

            // If it's the same origin, allow it
            if (url.startsWith(nextAuthUrl)) {
                return url;
            }

            // Default to dashboard
            return `${nextAuthUrl}/dashboard`;
        },
    },
    trustHost: true,
    providers: [], // Empty array, we'll add it in auth.ts
} satisfies NextAuthConfig;
