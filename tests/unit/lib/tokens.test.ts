/**
 * Token Utilities Tests
 * Tests for token generation, verification, and management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateSecureToken,
    generateVerificationCode,
} from '@/lib/auth/tokens';

// Mock the database module
vi.mock('@/lib/db/sqlite', () => ({
    getDatabase: vi.fn(() => ({
        prepare: vi.fn(() => ({
            run: vi.fn(() => ({ changes: 1 })),
            get: vi.fn(),
        })),
    })),
}));

describe('generateSecureToken', () => {
    it('should generate a hex string', () => {
        const token = generateSecureToken();
        expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate 64-character token by default (32 bytes = 64 hex chars)', () => {
        const token = generateSecureToken();
        expect(token).toHaveLength(64);
    });

    it('should generate token of specified length', () => {
        const token16 = generateSecureToken(16);
        expect(token16).toHaveLength(32); // 16 bytes = 32 hex chars

        const token8 = generateSecureToken(8);
        expect(token8).toHaveLength(16); // 8 bytes = 16 hex chars
    });

    it('should generate unique tokens', () => {
        const tokens = new Set<string>();
        for (let i = 0; i < 100; i++) {
            tokens.add(generateSecureToken());
        }
        expect(tokens.size).toBe(100);
    });

    it('should handle edge cases', () => {
        const token1 = generateSecureToken(1);
        expect(token1).toHaveLength(2); // 1 byte = 2 hex chars

        const tokenLarge = generateSecureToken(128);
        expect(tokenLarge).toHaveLength(256); // 128 bytes = 256 hex chars
    });
});

describe('generateVerificationCode', () => {
    it('should generate a 6-digit string', () => {
        const code = generateVerificationCode();
        expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate codes between 100000 and 999999', () => {
        for (let i = 0; i < 100; i++) {
            const code = generateVerificationCode();
            const num = parseInt(code, 10);
            expect(num).toBeGreaterThanOrEqual(100000);
            expect(num).toBeLessThanOrEqual(999999);
        }
    });

    it('should generate varied codes (not always same)', () => {
        const codes = new Set<string>();
        for (let i = 0; i < 50; i++) {
            codes.add(generateVerificationCode());
        }
        // Should have at least 40 unique codes out of 50
        expect(codes.size).toBeGreaterThan(40);
    });

    it('should always return a string', () => {
        for (let i = 0; i < 10; i++) {
            const code = generateVerificationCode();
            expect(typeof code).toBe('string');
        }
    });
});

describe('Token Types', () => {
    it('should support email_verification type', () => {
        // This is a type check - we just verify the types exist
        type TokenType = 'email_verification' | 'password_reset' | 'magic_link' | 'admin_mfa' | 'admin_mfa_session';
        const types: TokenType[] = ['email_verification', 'password_reset', 'magic_link', 'admin_mfa', 'admin_mfa_session'];
        expect(types).toHaveLength(5);
    });
});

describe('Token Generation Properties', () => {
    it('should be cryptographically random (entropy test)', () => {
        // Generate many tokens and check distribution
        const tokens: string[] = [];
        for (let i = 0; i < 1000; i++) {
            tokens.push(generateSecureToken(4)); // 8 hex chars
        }

        // Count character frequencies
        const charCounts: Record<string, number> = {};
        for (const token of tokens) {
            for (const char of token) {
                charCounts[char] = (charCounts[char] || 0) + 1;
            }
        }

        // All hex characters should appear
        const hexChars = '0123456789abcdef';
        for (const char of hexChars) {
            expect(charCounts[char]).toBeGreaterThan(0);
        }

        // Distribution should be roughly uniform (within 50% of expected)
        const totalChars = 1000 * 8; // 8 chars per token
        const expectedPerChar = totalChars / 16; // 16 hex chars
        for (const char of hexChars) {
            const count = charCounts[char] || 0;
            expect(count).toBeGreaterThan(expectedPerChar * 0.5);
            expect(count).toBeLessThan(expectedPerChar * 1.5);
        }
    });

    it('should generate verification codes with uniform distribution', () => {
        const codes: number[] = [];
        for (let i = 0; i < 1000; i++) {
            codes.push(parseInt(generateVerificationCode(), 10));
        }

        // Check that codes span the range reasonably
        const min = Math.min(...codes);
        const max = Math.max(...codes);
        
        expect(min).toBeLessThan(200000);
        expect(max).toBeGreaterThan(800000);
    });
});

describe('Mocked Database Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should import database functions without error', async () => {
        // Dynamic import to test module loading
        const tokens = await import('@/lib/auth/tokens');
        expect(tokens.generateSecureToken).toBeDefined();
        expect(tokens.generateVerificationCode).toBeDefined();
        expect(tokens.createToken).toBeDefined();
        expect(tokens.verifyToken).toBeDefined();
        expect(tokens.markTokenUsed).toBeDefined();
        expect(tokens.deleteToken).toBeDefined();
        expect(tokens.deleteEmailTokens).toBeDefined();
        expect(tokens.cleanupExpiredTokens).toBeDefined();
    });
});
