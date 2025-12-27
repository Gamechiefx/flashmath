import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne, loadData } from "./lib/db";
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

                console.log("[AUTH] Found user:", user.id, "Banned:", user.is_banned, "Until:", user.banned_until);

                // CHECK BAN STATUS
                if (user.banned_until) {
                    const banDate = new Date(user.banned_until);
                    const now = new Date();
                    console.log("[AUTH] Ban check: until", banDate.toISOString(), "now", now.toISOString());

                    if (banDate > now) {
                        console.log("[AUTH] User is banned until:", user.banned_until);
                        throw new Error(`Account suspended until ${banDate.toLocaleString()}`);
                    }
                }

                const isPasswordValid = await bcrypt.compare(credentials.password as string, user.password_hash);
                console.log("[AUTH] Password valid:", isPasswordValid);

                if (isPasswordValid) {
                    console.log("[AUTH] Login successful for:", credentials.email);
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
            try {
                if (token && session.user) {
                    // (session.user as any).id = token.id; // Moved below logging usually

                    console.log("[SESSION] Processing session for token:", token.id);
                    // Get freshest data from DB for header display
                    const user = queryOne("SELECT * FROM users WHERE id = ?", [token.id]) as any;

                    if (user) {
                        console.log("[SESSION] Found user:", user.name, "BannedUntil:", user.banned_until);
                        // SESSION KICK CHECK
                        if (user.banned_until) {
                            const banDate = new Date(user.banned_until);
                            if (banDate > new Date()) {
                                console.log("[AUTH] Session invalidated due to ban:", user.banned_until);
                                return null as any; // Force logout
                            }
                        }

                        (session.user as any).id = user.id; // Ensure ID is set from DB
                        (session.user as any).level = user.level;
                        (session.user as any).coins = user.coins;
                        (session.user as any).equipped_items = user.equipped_items;

                        // Lookup equipped title name from database
                        const titleId = user.equipped_items?.title;
                        if (titleId && titleId !== 'default') {
                            const db = loadData();
                            const titleItem = db.shop_items.find((i: any) => i.id === titleId);
                            (session.user as any).equippedTitleName = titleItem?.name || null;
                        } else {
                            (session.user as any).equippedTitleName = null;
                        }
                    } else {
                        console.log("[SESSION] User not found for token:", token.id, "Invalidating.");
                        // User was deleted/not found - invalidate session
                        return null as any;
                    }
                }
                return session;
            } catch (error) {
                console.error("[SESSION CALLBACK ERROR]", error);
                return session; // Return potentially stale session rather than crashing
            }
        },
    },
});
