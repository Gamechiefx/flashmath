import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { queryOne, loadData, execute, getDatabase } from "./lib/db";
import { authConfig } from "./auth.config";
import { v4 as uuidv4 } from "uuid";

const now = () => new Date().toISOString();

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
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
                    const nowDate = new Date();
                    console.log("[AUTH] Ban check: until", banDate.toISOString(), "now", nowDate.toISOString());

                    if (banDate > nowDate) {
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
        async signIn({ user, account, profile }) {
            // Handle OAuth sign in
            if (account?.provider === "google") {
                const db = getDatabase();
                const email = user.email;
                const name = user.name || profile?.name || "User";

                console.log("[AUTH] Google sign in for:", email);

                // Check if user exists
                let existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

                if (existingUser) {
                    // Check if banned
                    if (existingUser.banned_until) {
                        const banDate = new Date(existingUser.banned_until);
                        if (banDate > new Date()) {
                            console.log("[AUTH] Google user is banned:", email);
                            return false; // Block sign in
                        }
                    }

                    // Link OAuth account if not already linked
                    const oauthAccount = db.prepare(
                        'SELECT * FROM oauth_accounts WHERE user_id = ? AND provider = ?'
                    ).get(existingUser.id, 'google');

                    if (!oauthAccount) {
                        db.prepare(`
                            INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, access_token, created_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run(uuidv4(), existingUser.id, 'google', account.providerAccountId, account.access_token, now());
                        console.log("[AUTH] Linked Google account to existing user:", email);
                    }

                    // Update user.id to match our DB user id
                    user.id = existingUser.id;
                } else {
                    // Create new user
                    const userId = uuidv4();
                    db.prepare(`
                        INSERT INTO users (id, name, email, email_verified, email_verified_at, created_at)
                        VALUES (?, ?, ?, 1, ?, ?)
                    `).run(userId, name, email, now(), now());

                    // Link OAuth account
                    db.prepare(`
                        INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, access_token, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(uuidv4(), userId, 'google', account.providerAccountId, account.access_token, now());

                    console.log("[AUTH] Created new user from Google:", email);
                    user.id = userId;
                }

                return true;
            }

            return true;
        },
        async jwt({ token, user, account }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            try {
                if (token && session.user) {
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

                        (session.user as any).id = user.id;
                        (session.user as any).level = user.level;
                        (session.user as any).coins = user.coins;
                        console.log(`[SESSION] User ${user.name} coins from DB: ${user.coins}`);
                        (session.user as any).equipped_items = user.equipped_items;
                        (session.user as any).emailVerified = !!user.email_verified;
                        (session.user as any).createdAt = user.created_at;
                        (session.user as any).role = user.role; // For admin bypass
                        (session.user as any).dob = user.dob; // Date of birth for settings

                        // Update last_active timestamp for online tracking
                        const db = getDatabase();
                        db.prepare("UPDATE users SET last_active = ? WHERE id = ?").run(now(), user.id);

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

