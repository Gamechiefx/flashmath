/**
 * TOTP (Two-Factor Authentication) Tests
 * Tests for TOTP generation and verification
 */

import { describe, it, expect } from 'vitest';
import {
    generateTOTPSecret,
    verifyTOTPCode,
    generateRecoveryCodes,
    hashRecoveryCodes,
    verifyRecoveryCode,
} from '@/lib/auth/totp';

describe('generateTOTPSecret', () => {
    it('should generate a secret and URI', () => {
        const result = generateTOTPSecret('test@example.com');
        expect(result.secret).toBeDefined();
        expect(result.uri).toBeDefined();
    });

    it('should generate a base32 encoded secret', () => {
        const result = generateTOTPSecret('test@example.com');
        // Base32 characters are A-Z and 2-7
        expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should include email in the URI', () => {
        const result = generateTOTPSecret('test@example.com');
        expect(result.uri).toContain('test%40example.com');
    });

    it('should include FlashMath issuer in the URI', () => {
        const result = generateTOTPSecret('test@example.com');
        expect(result.uri).toContain('FlashMath');
    });

    it('should use otpauth:// protocol', () => {
        const result = generateTOTPSecret('test@example.com');
        expect(result.uri).toMatch(/^otpauth:\/\/totp\//);
    });

    it('should generate different secrets for different calls', () => {
        const result1 = generateTOTPSecret('test@example.com');
        const result2 = generateTOTPSecret('test@example.com');
        expect(result1.secret).not.toBe(result2.secret);
    });
});

describe('verifyTOTPCode', () => {
    it('should return false for invalid code format', () => {
        const { secret } = generateTOTPSecret('test@example.com');
        expect(verifyTOTPCode(secret, 'abc123')).toBe(false);
        expect(verifyTOTPCode(secret, '12345')).toBe(false); // Too short
        expect(verifyTOTPCode(secret, '1234567')).toBe(false); // Too long
    });

    it('should return false for completely wrong code', () => {
        const { secret } = generateTOTPSecret('test@example.com');
        // Unless we're extremely lucky, 000000 won't be valid
        expect(verifyTOTPCode(secret, '000000')).toBe(false);
    });

    it('should accept 6-digit numeric codes', () => {
        // We can't test a valid code without knowing the current time
        // but we can ensure it accepts the format and returns boolean
        const { secret } = generateTOTPSecret('test@example.com');
        const result = verifyTOTPCode(secret, '123456');
        expect(typeof result).toBe('boolean');
    });
});

describe('generateRecoveryCodes', () => {
    it('should generate 8 codes by default', () => {
        const codes = generateRecoveryCodes();
        expect(codes).toHaveLength(8);
    });

    it('should generate specified number of codes', () => {
        const codes = generateRecoveryCodes(5);
        expect(codes).toHaveLength(5);
    });

    it('should generate codes in XXXXX-XXXXX format', () => {
        const codes = generateRecoveryCodes();
        codes.forEach(code => {
            expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
        });
    });

    it('should generate unique codes', () => {
        const codes = generateRecoveryCodes(100);
        const uniqueCodes = new Set(codes);
        expect(uniqueCodes.size).toBe(codes.length);
    });
});

describe('hashRecoveryCodes', () => {
    it('should hash all codes', () => {
        const codes = ['ABCDE-12345', 'FGHIJ-67890'];
        const hashed = hashRecoveryCodes(codes);
        expect(hashed).toHaveLength(2);
    });

    it('should produce different hashes for different codes', () => {
        const codes = ['ABCDE-12345', 'FGHIJ-67890'];
        const hashed = hashRecoveryCodes(codes);
        expect(hashed[0]).not.toBe(hashed[1]);
    });

    it('should produce 64-character hex hashes (SHA-256)', () => {
        const codes = ['ABCDE-12345'];
        const hashed = hashRecoveryCodes(codes);
        expect(hashed[0]).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same input', () => {
        const code = 'ABCDE-12345';
        const hash1 = hashRecoveryCodes([code])[0];
        const hash2 = hashRecoveryCodes([code])[0];
        expect(hash1).toBe(hash2);
    });

    it('should normalize codes by removing dashes and lowercasing', () => {
        // Both should hash to the same value
        const hash1 = hashRecoveryCodes(['ABCDE-12345'])[0];
        const hash2 = hashRecoveryCodes(['ABCDE12345'])[0];
        // They should be the same because the function removes dashes
        expect(hash1).toBe(hash2);
    });
});

describe('verifyRecoveryCode', () => {
    it('should return index when code is valid', () => {
        const codes = generateRecoveryCodes(3);
        const hashedCodes = hashRecoveryCodes(codes);
        
        expect(verifyRecoveryCode(codes[0], hashedCodes)).toBe(0);
        expect(verifyRecoveryCode(codes[1], hashedCodes)).toBe(1);
        expect(verifyRecoveryCode(codes[2], hashedCodes)).toBe(2);
    });

    it('should return -1 for invalid code', () => {
        const codes = generateRecoveryCodes(3);
        const hashedCodes = hashRecoveryCodes(codes);
        
        expect(verifyRecoveryCode('ZZZZZ-ZZZZZ', hashedCodes)).toBe(-1);
    });

    it('should be case-insensitive', () => {
        const codes = generateRecoveryCodes(1);
        const hashedCodes = hashRecoveryCodes(codes);
        
        expect(verifyRecoveryCode(codes[0].toLowerCase(), hashedCodes)).toBe(0);
    });

    it('should work with or without dash', () => {
        const codes = generateRecoveryCodes(1);
        const hashedCodes = hashRecoveryCodes(codes);
        const codeWithoutDash = codes[0].replace('-', '');
        
        expect(verifyRecoveryCode(codeWithoutDash, hashedCodes)).toBe(0);
    });
});

describe('Full 2FA Flow', () => {
    it('should generate secret, create recovery codes, hash them, and verify them', () => {
        // Generate TOTP secret
        const { secret } = generateTOTPSecret('user@example.com');
        expect(secret).toBeDefined();
        
        // Generate recovery codes
        const recoveryCodes = generateRecoveryCodes(8);
        expect(recoveryCodes).toHaveLength(8);
        
        // Hash codes for storage
        const hashedCodes = hashRecoveryCodes(recoveryCodes);
        expect(hashedCodes).toHaveLength(8);
        
        // Verify each code works
        recoveryCodes.forEach((code, index) => {
            expect(verifyRecoveryCode(code, hashedCodes)).toBe(index);
        });
        
        // Verify invalid code doesn't work
        expect(verifyRecoveryCode('INVALID-CODE1', hashedCodes)).toBe(-1);
    });
});
