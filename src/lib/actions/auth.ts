"use server";

import { execute, queryOne, initSchema, getDatabase } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createToken, verifyToken, markTokenUsed, deleteToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email";
import { verificationEmailTemplate } from "@/lib/email/templates/verification";
import { passwordResetEmailTemplate } from "@/lib/email/templates/password-reset";
import { unlockEmailVerifiedAchievement } from "@/lib/actions/achievements";

// Ensure schema exists on first action call
initSchema();

const now = () => new Date().toISOString();

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
    await signIn("google", { redirectTo: "/dashboard" });
}

export async function registerUser(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const dob = formData.get("dob") as string;

    if (!name || !email || !password || !dob) {
        return { error: "Missing required fields" };
    }

    // Check if signups are enabled
    const { isSignupEnabled } = await import("@/lib/actions/system");
    const signupEnabled = await isSignupEnabled();
    if (!signupEnabled) {
        return { error: "Registration is currently disabled. Please try again later." };
    }

    // Validate username
    const { validateUsername, isUsernameAvailable } = await import("@/lib/username-validator");

    const usernameValidation = validateUsername(name);
    if (!usernameValidation.valid) {
        return { error: usernameValidation.error || "Invalid username" };
    }

    const usernameAvailable = await isUsernameAvailable(name);
    if (!usernameAvailable) {
        return { error: "Username is already taken" };
    }

    try {
        const db = getDatabase();

        // Check if user exists
        const existing = queryOne("SELECT id FROM users WHERE email = ?", [email]);
        if (existing) {
            return { error: "Email already registered" };
        }

        // Ensure dob column exists (for databases created before this column was added)
        try {
            db.prepare("ALTER TABLE users ADD COLUMN dob TEXT").run();
            console.log('[Auth] Added dob column to users table');
        } catch (e) {
            // Column likely already exists - this is expected
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();

        console.log(`[Auth] Registering user: ${email}, DOB: ${dob}`);

        // Insert user with DOB
        db.prepare(
            "INSERT INTO users (id, name, email, password_hash, created_at, dob) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, name, email, hashedPassword, now(), dob);

        console.log(`[Auth] User registered successfully with DOB: ${dob}`);

        // Send verification email (fire-and-forget to avoid slow registration)
        sendVerificationEmail(email).catch(err => {
            console.error('[Auth] Failed to send verification email:', err);
        });

        // Sign them in and redirect to verify-email page
        await signIn("credentials", {
            email,
            password,
            redirectTo: `/verify-email?email=${encodeURIComponent(email)}`,
        });

    } catch (error) {
        if (error instanceof AuthError) {
            return { error: "Registration successful, but login failed." };
        }
        // Rethrow Next.js redirect errors (success)
        throw error;
    }
}

export async function loginUser(formData: FormData) {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    console.log("[ACTION] loginUser called for:", email);

    // Check if account is locked
    const lockStatus = await isAccountLocked(email);
    if (lockStatus.locked) {
        return { error: `Account locked. Try again after ${lockStatus.until?.toLocaleTimeString()}` };
    }

    try {
        await signIn("credentials", {
            email,
            password,
            redirectTo: "/dashboard",
        });

        // Reset failed attempts on success
        await resetFailedAttempts(email);
        console.log("[ACTION] signIn successful for:", email);
    } catch (error) {
        if (error instanceof AuthError) {
            // Increment failed attempts
            const lockResult = await incrementFailedAttempts(email);

            // Check if it's our custom ban error (nested in cause usually)
            const cause = error.cause?.err?.message || (error.cause as any)?.message;
            if (cause && cause.includes("Account suspended")) {
                return { error: cause };
            }

            switch (error.type) {
                case "CredentialsSignin":
                    if (lockResult.locked) {
                        return { error: "Too many failed attempts. Account locked for 15 minutes." };
                    }
                    return { error: "Invalid email or password." };
                case "CallbackRouteError":
                    // Sometimes the ban error comes through here if thrown in authorize
                    if (error.message.includes("Account suspended")) {
                        return { error: error.message };
                    }
                    // Fallback to trying to read the cause again just in case
                    const deepCause = (error.cause?.err as Error)?.message;
                    if (deepCause && deepCause.includes("Account suspended")) {
                        return { error: deepCause };
                    }
                    return { error: "Authentication failed" };
                default:
                    return { error: "Authentication failed" };
            }
        }
        throw error;
    }
}

// ============================================
// EMAIL VERIFICATION
// ============================================

export async function sendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const user = db.prepare('SELECT id, name, email_verified FROM users WHERE email = ?').get(email) as any;

    if (!user) {
        return { success: false, error: "User not found" };
    }

    if (user.email_verified) {
        return { success: false, error: "Email is already verified" };
    }

    const code = await createToken(email, 'email_verification', user.id, 15);

    const template = verificationEmailTemplate(user.name, code);
    const result = await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
    });

    if (!result.success) {
        console.error("[Auth] Failed to send verification email:", result.error);
        return { success: false, error: "Failed to send email" };
    }

    console.log(`[Auth] Verification email sent to ${email}`);
    return { success: true };
}

export async function verifyEmailCode(
    email: string,
    code: string
): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const result = await verifyToken(code, 'email_verification');

    if (!result.valid) {
        return { success: false, error: result.error };
    }

    if (result.email !== email) {
        return { success: false, error: "Invalid verification code" };
    }

    db.prepare(`
        UPDATE users 
        SET email_verified = 1, email_verified_at = ? 
        WHERE email = ?
    `).run(now(), email);

    await markTokenUsed(code);

    // Get user ID to unlock achievement
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
    if (user) {
        await unlockEmailVerifiedAchievement(user.id);
    }

    console.log(`[Auth] Email verified for ${email}`);
    return { success: true };
}

export async function resendVerificationCode(email: string): Promise<{ success: boolean; error?: string }> {
    return sendVerificationEmail(email);
}

// ============================================
// PASSWORD RESET
// ============================================

export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email) as any;

    if (!user) {
        // Don't reveal if user exists
        console.log(`[Auth] Password reset requested for unknown email: ${email}`);
        return { success: true };
    }

    const token = await createToken(email, 'password_reset', user.id, 60);

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const template = passwordResetEmailTemplate(user.name, resetUrl);
    const result = await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
    });

    if (!result.success) {
        console.error("[Auth] Failed to send reset email:", result.error);
        return { success: false, error: "Failed to send email" };
    }

    console.log(`[Auth] Password reset email sent to ${email}`);
    return { success: true };
}

export async function resetPassword(
    token: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    if (newPassword.length < 8) {
        return { success: false, error: "Password must be at least 8 characters" };
    }

    const db = getDatabase();

    const result = await verifyToken(token, 'password_reset');

    if (!result.valid) {
        return { success: false, error: result.error };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    db.prepare(`
        UPDATE users 
        SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE email = ?
    `).run(passwordHash, now(), result.email);

    await deleteToken(token);

    console.log(`[Auth] Password reset for ${result.email}`);
    return { success: true };
}

// ============================================
// MAGIC LINK (Passwordless Login)
// ============================================

export async function requestMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();

    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email) as any;

    if (!user) {
        // Don't reveal if user exists - still show success
        console.log(`[Auth] Magic link requested for unknown email: ${email}`);
        return { success: true };
    }

    // Check if account is locked
    const lockStatus = await isAccountLocked(email);
    if (lockStatus.locked) {
        return { success: false, error: `Account locked. Try again after ${lockStatus.until?.toLocaleTimeString()}` };
    }

    // Create magic link token (15 min expiry)
    const token = await createToken(email, 'magic_link', user.id, 15);

    // Build magic link URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const magicUrl = `${baseUrl}/api/auth/magic-link?token=${token}`;

    // Import template dynamically to avoid circular deps
    const { magicLinkEmailTemplate } = await import("@/lib/email/templates/magic-link");

    // Send email
    const template = magicLinkEmailTemplate(email, magicUrl);
    const result = await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
    });

    if (!result.success) {
        console.error("[Auth] Failed to send magic link email:", result.error);
        return { success: false, error: "Failed to send email" };
    }

    console.log(`[Auth] Magic link email sent to ${email}`);
    return { success: true };
}

// ============================================
// ACCOUNT LOCKOUT
// ============================================

export async function incrementFailedAttempts(email: string): Promise<{ locked: boolean; attemptsRemaining?: number }> {
    const db = getDatabase();

    const user = db.prepare('SELECT id, failed_login_attempts FROM users WHERE email = ?').get(email) as any;

    if (!user) {
        return { locked: false };
    }

    const newAttempts = (user.failed_login_attempts || 0) + 1;
    const maxAttempts = 5;

    if (newAttempts >= maxAttempts) {
        const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare(`
            UPDATE users 
            SET failed_login_attempts = ?, locked_until = ?
            WHERE id = ?
        `).run(newAttempts, lockedUntil, user.id);

        console.log(`[Auth] Account locked for ${email} until ${lockedUntil}`);
        return { locked: true };
    }

    db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(newAttempts, user.id);

    return { locked: false, attemptsRemaining: maxAttempts - newAttempts };
}

export async function resetFailedAttempts(email: string): Promise<void> {
    const db = getDatabase();
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?').run(email);
}

export async function isAccountLocked(email: string): Promise<{ locked: boolean; until?: Date }> {
    const db = getDatabase();

    const user = db.prepare('SELECT locked_until FROM users WHERE email = ?').get(email) as any;

    if (!user?.locked_until) {
        return { locked: false };
    }

    const lockedUntil = new Date(user.locked_until);

    if (lockedUntil > new Date()) {
        return { locked: true, until: lockedUntil };
    }

    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?').run(email);
    return { locked: false };
}
