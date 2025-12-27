/**
 * Two-Factor Authentication (TOTP) Utilities
 */

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import crypto from "crypto";

const APP_NAME = "FlashMath";

/**
 * Generate a new TOTP secret for a user
 */
export function generateTOTPSecret(email: string): { secret: string; uri: string } {
    const totp = new OTPAuth.TOTP({
        issuer: APP_NAME,
        label: email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }),
    });

    return {
        secret: totp.secret.base32,
        uri: totp.toString(),
    };
}

/**
 * Generate QR code data URL for TOTP setup
 */
export async function generateTOTPQRCode(uri: string): Promise<string> {
    return QRCode.toDataURL(uri, {
        width: 256,
        margin: 2,
        color: {
            dark: "#06b6d4",
            light: "#0a0a0f",
        },
    });
}

/**
 * Verify a TOTP code against a secret
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
        issuer: APP_NAME,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
    });

    // Allow 1 period window for clock drift
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
}

/**
 * Generate recovery codes
 */
export function generateRecoveryCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        // Generate 10-character alphanumeric codes
        const code = crypto.randomBytes(5).toString("hex").toUpperCase();
        // Format as XXXXX-XXXXX
        codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
    }
    return codes;
}

/**
 * Hash recovery codes for storage
 */
export function hashRecoveryCodes(codes: string[]): string[] {
    return codes.map(code =>
        crypto.createHash("sha256").update(code.replace("-", "").toLowerCase()).digest("hex")
    );
}

/**
 * Verify a recovery code against hashed codes
 */
export function verifyRecoveryCode(code: string, hashedCodes: string[]): number {
    const normalizedCode = code.replace("-", "").toLowerCase();
    const hash = crypto.createHash("sha256").update(normalizedCode).digest("hex");
    return hashedCodes.indexOf(hash);
}
