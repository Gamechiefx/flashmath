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
                const user = queryOne('SELECT * FROM users WHERE email = ?', [credentials.email]) as any;

                if (user && await bcrypt.compare(credentials.password as string, user.password_hash)) {
                    return { id: user.id, name: user.name, email: user.email };
                }

                console.log("Auth attempt failed for:", credentials.email);
                return null;
            },
        }),
    ],
});
