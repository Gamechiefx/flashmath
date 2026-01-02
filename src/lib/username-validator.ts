/**
 * Username Validation Utility
 * Checks for profanity, reserved words, and invalid patterns
 */

// Reserved words that cannot be used as usernames
const RESERVED_WORDS = [
    // Admin/moderation terms
    'admin', 'administrator', 'mod', 'moderator', 'owner', 'staff', 'support',
    'helpdesk', 'system', 'sysadmin', 'root', 'superuser', 'super_admin',

    // FlashMath specific
    'flashmath', 'flash_math', 'flashbot', 'flash_bot', 'official',
    'verified', 'developer', 'dev', 'flashadmin',

    // Generic reserved
    'null', 'undefined', 'anonymous', 'unknown', 'guest', 'user', 'player',
    'everyone', 'here', 'channel', 'server', 'bot', 'ai', 'assistant',

    // Impersonation prevention
    'ceo', 'founder', 'creator', 'team', 'official', 'real', 'the_real',
];

// Basic profanity list (common English profanity and slurs)
// This is intentionally not exhaustive - add more as needed
const PROFANITY_LIST = [
    // Common profanity
    'fuck', 'fck', 'fuk', 'f*ck', 'f**k', 'fucker', 'fucking', 'fking',
    'shit', 'sh1t', 'sh!t', 's**t', 'shitting', 'bullshit',
    'ass', 'asshole', 'a**hole', 'a$$', 'assh0le',
    'bitch', 'b1tch', 'b!tch', 'btch',
    'damn', 'dammit', 'goddamn',
    'bastard', 'b@stard',
    'crap', 'piss', 'pissed',
    'dick', 'd1ck', 'd!ck', 'dck',
    'cock', 'c0ck', 'cck',
    'cunt', 'c*nt', 'cnt',
    'whore', 'wh0re', 'slut', 'sl*t',
    'penis', 'vagina', 'boob', 'boobs', 'tits', 'titties',

    // Slurs and hate speech (abbreviated to avoid listing explicitly)
    'nigger', 'n1gger', 'n!gger', 'nigg3r', 'nigga', 'n1gga',
    'faggot', 'fag', 'f@g', 'f@ggot',
    'retard', 'retarded', 'r3tard',
    'spic', 'sp1c', 'wetback', 'beaner',
    'chinaman', 'chink', 'gook', 'jap',
    'kike', 'k1ke',
    'nazi', 'n@zi', 'hitler', 'h1tler',

    // Sexual terms
    'porn', 'p0rn', 'xxx', 'sex', 's3x', 'sexy',
    'horny', 'h0rny', 'cum', 'jizz',

    // Violence
    'kill', 'murder', 'rape', 'r@pe', 'terrorist', 'terror',
];

interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Normalize a string for comparison (lowercase, remove special chars)
 */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .replace(/[_\-\s.]/g, '') // Remove separators
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

/**
 * Check if username contains profanity
 */
function containsProfanity(username: string): boolean {
    const normalized = normalize(username);

    for (const word of PROFANITY_LIST) {
        const normalizedWord = normalize(word);
        if (normalized.includes(normalizedWord)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if username is a reserved word
 */
function isReservedWord(username: string): boolean {
    const normalized = normalize(username);

    for (const word of RESERVED_WORDS) {
        const normalizedWord = normalize(word);
        // Exact match or username contains the reserved word
        if (normalized === normalizedWord || normalized.includes(normalizedWord)) {
            return true;
        }
    }

    return false;
}

/**
 * Validate username format
 */
function validateFormat(username: string): ValidationResult {
    // Length check
    if (username.length < 3) {
        return { valid: false, error: "Username must be at least 3 characters" };
    }

    if (username.length > 20) {
        return { valid: false, error: "Username cannot exceed 20 characters" };
    }

    // Only allow alphanumeric, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { valid: false, error: "Username can only contain letters, numbers, underscores, and hyphens" };
    }

    // Must start with a letter
    if (!/^[a-zA-Z]/.test(username)) {
        return { valid: false, error: "Username must start with a letter" };
    }

    // No consecutive special characters
    if (/[_-]{2,}/.test(username)) {
        return { valid: false, error: "Username cannot have consecutive special characters" };
    }

    return { valid: true };
}

/**
 * Full username validation
 */
export function validateUsername(username: string): ValidationResult {
    // Format validation
    const formatResult = validateFormat(username);
    if (!formatResult.valid) {
        return formatResult;
    }

    // Reserved word check
    if (isReservedWord(username)) {
        return { valid: false, error: "This username is not available" };
    }

    // Profanity check
    if (containsProfanity(username)) {
        return { valid: false, error: "Username contains inappropriate language" };
    }

    return { valid: true };
}

/**
 * Check if username is available (not taken by another user)
 */
export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
    const { getDatabase } = await import("@/lib/db");
    const db = getDatabase();

    const query = excludeUserId
        ? 'SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?'
        : 'SELECT id FROM users WHERE LOWER(name) = LOWER(?)';

    const params = excludeUserId ? [username, excludeUserId] : [username];
    const existing = db.prepare(query).get(...params);

    return !existing;
}
