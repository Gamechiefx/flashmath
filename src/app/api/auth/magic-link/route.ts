import { NextRequest, NextResponse } from "next/server";
import { verifyToken, markTokenUsed } from "@/lib/auth/tokens";
import { getDatabase, type UserRow } from "@/lib/db";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
        return NextResponse.redirect(new URL("/auth/login?error=InvalidLink", request.url));
    }

    try {
        // Verify the magic link token
        const result = await verifyToken(token, "magic_link");

        if (!result.valid || !result.email) {
            console.log("[MagicLink] Invalid token:", result.error);
            return NextResponse.redirect(new URL("/auth/login?error=InvalidOrExpiredLink", request.url));
        }

        const db = getDatabase();

        // Get the user
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(result.email) as UserRow | undefined;

        if (!user) {
            console.log("[MagicLink] User not found:", result.email);
            return NextResponse.redirect(new URL("/auth/login?error=UserNotFound", request.url));
        }

        // Check if banned
        if (user.banned_until) {
            const banDate = new Date(user.banned_until);
            if (banDate > new Date()) {
                console.log("[MagicLink] User is banned:", result.email);
                return NextResponse.redirect(new URL("/auth/login?error=AccountSuspended", request.url));
            }
        }

        // Mark token as used
        await markTokenUsed(token);

        // Mark email as verified if not already
        if (!user.email_verified) {
            db.prepare(`
                UPDATE users 
                SET email_verified = 1, email_verified_at = ? 
                WHERE id = ?
            `).run(new Date().toISOString(), user.id);
        }

        // Reset failed login attempts
        db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?").run(user.id);

        // Create a JWT session token
        const sessionToken = await encode({
            token: {
                id: user.id,
                name: user.name,
                email: user.email,
                sub: user.id,
            },
            secret: process.env.AUTH_SECRET!,
            salt: "authjs.session-token",
        });

        // Set the session cookie
        const cookieStore = await cookies();
        cookieStore.set("authjs.session-token", sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60,
            path: "/",
        });

        console.log("[MagicLink] Login successful for:", result.email);

        // Redirect to dashboard
        return NextResponse.redirect(new URL("/dashboard", request.url));
    } catch (error) {
        console.error("[MagicLink] Error:", error);
        return NextResponse.redirect(new URL("/auth/login?error=ServerError", request.url));
    }
}
