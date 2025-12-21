import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { query, queryOne } from "./lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                // User lookup in SQLite
                const user = queryOne('SELECT * FROM users WHERE email = ?', [credentials.email]) as any;

                if (user && await bcrypt.compare(credentials.password as string, user.password_hash)) {
                    return { id: user.id, name: user.name, email: user.email };
                }

                console.log("Auth attempt failed for:", credentials.email);
                return null;
            },

        }),
    ],
    pages: {
        signIn: "/auth/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            }
            return true;
        },
    },
});
