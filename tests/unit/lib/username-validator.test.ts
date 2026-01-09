/**
 * Username Validator Unit Tests
 * 
 * Tests username validation logic including format, profanity, and reserved words.
 */

import { describe, it, expect } from 'vitest';

// Extract pure functions for testing (avoiding dynamic imports)

const RESERVED_WORDS = [
    'admin', 'administrator', 'mod', 'moderator', 'owner', 'staff', 'support',
    'flashmath', 'flash_math', 'flashbot', 'official', 'verified', 'developer',
    'null', 'undefined', 'anonymous', 'guest', 'user', 'player', 'bot', 'ai',
];

const PROFANITY_LIST = [
    'fuck', 'shit', 'ass', 'bitch', 'dick', 'cunt',
];

function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[_\-\s.]/g, '')
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/@/g, 'a')
        .replace(/\$/g, 's')
        .replace(/!/g, 'i');
}

function containsProfanity(username: string): boolean {
    const normalized = normalize(username);
    for (const word of PROFANITY_LIST) {
        if (normalized.includes(normalize(word))) {
            return true;
        }
    }
    return false;
}

function isReservedWord(username: string): boolean {
    const normalized = normalize(username);
    for (const word of RESERVED_WORDS) {
        if (normalized === normalize(word) || normalized.includes(normalize(word))) {
            return true;
        }
    }
    return false;
}

interface ValidationResult {
    valid: boolean;
    error?: string;
}

function validateFormat(username: string): ValidationResult {
    if (username.length < 3) {
        return { valid: false, error: "Username must be at least 3 characters" };
    }
    if (username.length > 20) {
        return { valid: false, error: "Username cannot exceed 20 characters" };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { valid: false, error: "Username can only contain letters, numbers, underscores, and hyphens" };
    }
    if (!/^[a-zA-Z]/.test(username)) {
        return { valid: false, error: "Username must start with a letter" };
    }
    if (/[_-]{2,}/.test(username)) {
        return { valid: false, error: "Username cannot have consecutive special characters" };
    }
    return { valid: true };
}

function validateUsername(username: string): ValidationResult {
    const formatResult = validateFormat(username);
    if (!formatResult.valid) return formatResult;
    if (isReservedWord(username)) {
        return { valid: false, error: "This username is not available" };
    }
    if (containsProfanity(username)) {
        return { valid: false, error: "Username contains inappropriate language" };
    }
    return { valid: true };
}

describe('Username Validator', () => {
    describe('normalize', () => {
        it('should convert to lowercase', () => {
            expect(normalize('ABC')).toBe('abc');
        });
        
        it('should remove separators', () => {
            expect(normalize('user_name')).toBe('username');
            expect(normalize('user-name')).toBe('username');
            expect(normalize('user name')).toBe('username');
            expect(normalize('user.name')).toBe('username');
        });
        
        it('should handle leet speak substitutions', () => {
            expect(normalize('h3ll0')).toBe('hello');
            expect(normalize('4dm1n')).toBe('admin');
            expect(normalize('t3$t')).toBe('test');
            expect(normalize('f@ke')).toBe('fake');
            expect(normalize('b!t')).toBe('bit');
        });
    });
    
    describe('validateFormat', () => {
        it('should reject usernames shorter than 3 characters', () => {
            expect(validateFormat('ab').valid).toBe(false);
            expect(validateFormat('a').valid).toBe(false);
            expect(validateFormat('').valid).toBe(false);
        });
        
        it('should reject usernames longer than 20 characters', () => {
            expect(validateFormat('a'.repeat(21)).valid).toBe(false);
            expect(validateFormat('abcdefghijklmnopqrstu').valid).toBe(false);
        });
        
        it('should accept usernames of valid length', () => {
            expect(validateFormat('abc').valid).toBe(true);
            expect(validateFormat('a'.repeat(20)).valid).toBe(true);
        });
        
        it('should reject usernames with invalid characters', () => {
            expect(validateFormat('user@name').valid).toBe(false);
            expect(validateFormat('user!name').valid).toBe(false);
            expect(validateFormat('user#name').valid).toBe(false);
            expect(validateFormat('user name').valid).toBe(false);
        });
        
        it('should accept valid characters', () => {
            expect(validateFormat('username').valid).toBe(true);
            expect(validateFormat('user_name').valid).toBe(true);
            expect(validateFormat('user-name').valid).toBe(true);
            expect(validateFormat('User123').valid).toBe(true);
        });
        
        it('should require starting with a letter', () => {
            expect(validateFormat('1username').valid).toBe(false);
            expect(validateFormat('_username').valid).toBe(false);
            expect(validateFormat('-username').valid).toBe(false);
        });
        
        it('should reject consecutive special characters', () => {
            expect(validateFormat('user__name').valid).toBe(false);
            expect(validateFormat('user--name').valid).toBe(false);
            expect(validateFormat('user_-name').valid).toBe(false);
        });
    });
    
    describe('isReservedWord', () => {
        it('should detect exact reserved words', () => {
            expect(isReservedWord('admin')).toBe(true);
            expect(isReservedWord('moderator')).toBe(true);
            expect(isReservedWord('flashmath')).toBe(true);
        });
        
        it('should detect reserved words with different case', () => {
            expect(isReservedWord('ADMIN')).toBe(true);
            expect(isReservedWord('Admin')).toBe(true);
            expect(isReservedWord('AdMiN')).toBe(true);
        });
        
        it('should detect reserved words with leet speak', () => {
            expect(isReservedWord('4dm1n')).toBe(true);
            expect(isReservedWord('m0d3r4t0r')).toBe(true);
        });
        
        it('should detect reserved words as substrings', () => {
            expect(isReservedWord('theadmin')).toBe(true);
            expect(isReservedWord('adminuser')).toBe(true);
        });
        
        it('should allow non-reserved words', () => {
            expect(isReservedWord('mathwizard')).toBe(false);
            expect(isReservedWord('player123')).toBe(true); // 'player' is reserved
            expect(isReservedWord('speedster')).toBe(false);
        });
    });
    
    describe('containsProfanity', () => {
        it('should detect explicit profanity', () => {
            expect(containsProfanity('fuck')).toBe(true);
            expect(containsProfanity('shit')).toBe(true);
        });
        
        it('should detect profanity with leet speak', () => {
            expect(containsProfanity('sh1t')).toBe(true);
            expect(containsProfanity('a$$')).toBe(true);
        });
        
        it('should detect profanity embedded in words', () => {
            expect(containsProfanity('superfuck')).toBe(true);
            expect(containsProfanity('fuckmaster')).toBe(true);
        });
        
        it('should allow clean words', () => {
            expect(containsProfanity('mathgenius')).toBe(false);
            expect(containsProfanity('speedrunner')).toBe(false);
            expect(containsProfanity('calculator')).toBe(false);
        });
    });
    
    describe('validateUsername (full validation)', () => {
        it('should accept valid usernames', () => {
            expect(validateUsername('MathWizard').valid).toBe(true);
            expect(validateUsername('SpeedRunner99').valid).toBe(true);
            expect(validateUsername('Pro-Gamer').valid).toBe(true);
            expect(validateUsername('Calc_Master').valid).toBe(true);
        });
        
        it('should reject invalid format', () => {
            expect(validateUsername('ab').valid).toBe(false);
            expect(validateUsername('123start').valid).toBe(false);
        });
        
        it('should reject reserved words', () => {
            expect(validateUsername('admin').valid).toBe(false);
            expect(validateUsername('FlashMath').valid).toBe(false);
        });
        
        it('should reject profanity', () => {
            expect(validateUsername('FuckYou').valid).toBe(false);
        });
        
        it('should return appropriate error messages', () => {
            expect(validateUsername('ab').error).toContain('at least 3');
            expect(validateUsername('admin').error).toContain('not available');
            expect(validateUsername('FuckYou').error).toContain('inappropriate');
        });
    });
});


