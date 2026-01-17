import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    secret: process.env.AUTH_SECRET || "94f17709-3ca3-465a-b7a0-eecf410d5504", // Fallback for dev
    pages: {
        signIn: "/auth/login",
    },
    // NOTE: When behind a reverse proxy (nginx) that terminates SSL:
    // - External connection: Browser → Nginx (HTTPS)
    // - Internal connection: Nginx → App (HTTP)
    // We do NOT use __Secure- or __Host- cookie prefixes because the app
    // sees HTTP connections internally. The cookies will still be secure
    // because nginx serves them over HTTPS to the browser.
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
            // Simple redirect logic - avoid complex URL manipulation that can cause loops
            // When behind a reverse proxy, trust the URLs as they come
            
            // Handle relative URLs
            if (url.startsWith('/')) {
                return url;
            }
            
            // Allow same-origin redirects
            try {
                const urlObj = new URL(url);
                const baseObj = new URL(baseUrl);
                
                // Allow if same origin as baseUrl
                if (urlObj.origin === baseObj.origin) {
                    return url;
                }
                
                // Allow if matches NEXTAUTH_URL
                const nextAuthUrl = process.env.NEXTAUTH_URL;
                if (nextAuthUrl) {
                    const nextAuthObj = new URL(nextAuthUrl);
                    if (urlObj.origin === nextAuthObj.origin) {
                        return url;
                    }
                }
            } catch {
                // If URL parsing fails, use relative path
            }
            
            // Default to dashboard (relative path to avoid domain issues)
            return '/dashboard';
        },
    },
    trustHost: true,
    providers: [], // Empty array, we'll add it in auth.ts
} satisfies NextAuthConfig;
