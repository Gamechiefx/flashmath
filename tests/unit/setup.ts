/**
 * Vitest Global Setup
 * 
 * Runs before each test file. Sets up mocks and test utilities.
 */

import { vi, beforeEach, afterAll } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file::memory:?cache=shared';

// Global test utilities
export const testUtils = {
    /**
     * Wait for a specified duration (use sparingly in unit tests)
     */
    wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    
    /**
     * Generate a random test ID
     */
    randomId: () => `test-${Math.random().toString(36).substring(7)}`,
    
    /**
     * Create mock user data
     */
    mockUser: (overrides?: Partial<TestUser>) => ({
        id: `user-${Math.random().toString(36).substring(7)}`,
        name: 'TestUser',
        email: 'test@example.com',
        level: 1,
        total_xp: 0,
        coins: 100,
        duel_elo: 300,
        team_elo: 300,
        ...overrides,
    }),
};

// Type declarations for test utilities
export interface TestUser {
    id: string;
    name: string;
    email: string;
    level: number;
    total_xp: number;
    coins: number;
    duel_elo: number;
    team_elo: number;
}

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
    vi.restoreAllMocks();
});

