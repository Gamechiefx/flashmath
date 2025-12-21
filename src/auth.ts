import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne } from "./lib/db";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null;

                // User lookup in SQLite
                console.log("[AUTH] Attempting lookup for:", credentials.email);
                const user = queryOne('SELECT * FROM users WHERE email = ?', [credentials.email]) as any;

                if (!user) {
                    console.log("[AUTH] User not found:", credentials.email);
                    return null;
                }

                const isPasswordValid = await bcrypt.compare(credentials.password as string, user.password_hash);
                if (isPasswordValid) {
                    console.log("[AUTH] Password valid for:", credentials.email);
                    return { id: user.id, name: user.name, email: user.email };
                }

                console.log("[AUTH] Invalid password for:", credentials.email);
                return null;
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                (session.user as any).id = token.id;

                // Get freshest data from DB for header display
                const user = queryOne("SELECT * FROM users WHERE id = ?", [token.id]) as any;
                if (user) {
                    (session.user as any).level = user.level;
                    (session.user as any).coins = user.coins;
                }
            }
            return session;
        },
    },
});
