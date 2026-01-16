"use server";

/**
 * Two-Factor Authentication Actions
 */

import { getDatabase, type UserRow } from "@/lib/db";
import { auth } from "@/auth";
import {
    generateTOTPSecret,
    generateTOTPQRCode,
    verifyTOTPCode,
    generateRecoveryCodes,
    hashRecoveryCodes,
    verifyRecoveryCode
} from "@/lib/auth/totp";
import { revalidatePath } from "next/cache";

/**
 * Start 2FA setup - generate secret and QR code
 */
export async function setup2FA(): Promise<{
    success: boolean;
    secret?: string;
    qrCode?: string;
    error?: string
}> {
    const session = await auth();
    if (!session?.user?.email) {
        return { success: false, error: "Not authenticated" };
    }

    const db = getDatabase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(session.user.email) as UserRow | undefined;

    if (!user) {
        return { success: false, error: "User not found" };
    }

    if (user.two_factor_enabled) {
        return { success: false, error: "2FA is already enabled" };
    }

    // Generate new secret
    const { secret, uri } = generateTOTPSecret(session.user.email);
    const qrCode = await generateTOTPQRCode(uri);

    // Store pending secret (not enabled yet)
    db.prepare("UPDATE users SET two_factor_secret = ? WHERE id = ?").run(secret, user.id);

    return { success: true, secret, qrCode };
}

/**
 * Verify and enable 2FA
 */
export async function enable2FA(code: string): Promise<{
    success: boolean;
    recoveryCodes?: string[];
    error?: string;
}> {
    const session = await auth();
    if (!session?.user?.email) {
        return { success: false, error: "Not authenticated" };
    }

    const db = getDatabase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(session.user.email) as UserRow | undefined;

    if (!user || !user.two_factor_secret) {
        return { success: false, error: "2FA setup not started" };
    }

    if (user.two_factor_enabled) {
        return { success: false, error: "2FA is already enabled" };
    }

    // Verify the code
    if (!verifyTOTPCode(user.two_factor_secret, code)) {
        return { success: false, error: "Invalid verification code" };
    }

    // Generate recovery codes
    const recoveryCodes = generateRecoveryCodes(8);
    const hashedCodes = hashRecoveryCodes(recoveryCodes);

    // Enable 2FA
    db.prepare(`
        UPDATE users 
        SET two_factor_enabled = 1, two_factor_recovery_codes = ?
        WHERE id = ?
    `).run(JSON.stringify(hashedCodes), user.id);

    revalidatePath("/settings");
    console.log(`[2FA] Enabled for user ${session.user.email}`);

    return { success: true, recoveryCodes };
}

/**
 * Disable 2FA
 */
export async function disable2FA(code: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.email) {
        return { success: false, error: "Not authenticated" };
    }

    const db = getDatabase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(session.user.email) as UserRow | undefined;

    if (!user || !user.two_factor_enabled) {
        return { success: false, error: "2FA is not enabled" };
    }

    // Verify the code
    if (!verifyTOTPCode(user.two_factor_secret, code)) {
        return { success: false, error: "Invalid verification code" };
    }

    // Disable 2FA
    db.prepare(`
        UPDATE users 
        SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_recovery_codes = NULL
        WHERE id = ?
    `).run(user.id);

    revalidatePath("/settings");
    console.log(`[2FA] Disabled for user ${session.user.email}`);

    return { success: true };
}

/**
 * Verify 2FA code during login
 */
export async function verify2FACode(
    userId: string,
    code: string
): Promise<{ success: boolean; error?: string }> {
    const db = getDatabase();
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;

    if (!user || !user.two_factor_enabled) {
        return { success: false, error: "2FA is not enabled" };
    }

    // Try TOTP code first
    if (verifyTOTPCode(user.two_factor_secret, code)) {
        return { success: true };
    }

    // Try recovery code
    const recoveryCodes = user.two_factor_recovery_codes
        ? JSON.parse(user.two_factor_recovery_codes)
        : [];

    const recoveryIndex = verifyRecoveryCode(code, recoveryCodes);

    if (recoveryIndex >= 0) {
        // Remove used recovery code
        recoveryCodes.splice(recoveryIndex, 1);
        db.prepare("UPDATE users SET two_factor_recovery_codes = ? WHERE id = ?")
            .run(JSON.stringify(recoveryCodes), user.id);

        console.log(`[2FA] Recovery code used for user ${user.email}`);
        return { success: true };
    }

    return { success: false, error: "Invalid code" };
}

/**
 * Get 2FA status for current user
 */
export async function get2FAStatus(): Promise<{
    enabled: boolean;
    hasRecoveryCodes: boolean;
}> {
    const session = await auth();
    if (!session?.user?.email) {
        return { enabled: false, hasRecoveryCodes: false };
    }

    const db = getDatabase();
    const user = db.prepare("SELECT two_factor_enabled, two_factor_recovery_codes FROM users WHERE email = ?")
        .get(session.user.email) as {
            two_factor_enabled?: number;
            two_factor_recovery_codes?: string | null;
        } | undefined;

    if (!user) {
        return { enabled: false, hasRecoveryCodes: false };
    }

    const recoveryCodes = user.two_factor_recovery_codes
        ? JSON.parse(user.two_factor_recovery_codes)
        : [];

    return {
        enabled: !!user.two_factor_enabled,
        hasRecoveryCodes: recoveryCodes.length > 0
    };
}

/**
 * Regenerate recovery codes
 */
export async function regenerateRecoveryCodes(code: string): Promise<{
    success: boolean;
    recoveryCodes?: string[];
    error?: string;
}> {
    const session = await auth();
    if (!session?.user?.email) {
        return { success: false, error: "Not authenticated" };
    }

    const db = getDatabase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(session.user.email) as UserRow | undefined;

    if (!user || !user.two_factor_enabled) {
        return { success: false, error: "2FA is not enabled" };
    }

    // Verify current code
    if (!verifyTOTPCode(user.two_factor_secret, code)) {
        return { success: false, error: "Invalid verification code" };
    }

    // Generate new recovery codes
    const recoveryCodes = generateRecoveryCodes(8);
    const hashedCodes = hashRecoveryCodes(recoveryCodes);

    db.prepare("UPDATE users SET two_factor_recovery_codes = ? WHERE id = ?")
        .run(JSON.stringify(hashedCodes), user.id);

    console.log(`[2FA] Recovery codes regenerated for user ${session.user.email}`);

    return { success: true, recoveryCodes };
}
