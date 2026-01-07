/**
 * Test Account Definitions and Credentials
 * 
 * Central location for test user data used by E2E tests.
 * Accounts are created in global-setup.ts and cleaned up in global-teardown.ts.
 */

import path from 'path';

// Test account definitions with full data
export const TEST_ACCOUNTS = {
    primary: {
        id: 'e2e-test-primary-user',
        email: 'e2e-primary@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2EPrimary',
    },
    secondary: {
        id: 'e2e-test-secondary-user',
        email: 'e2e-secondary@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2ESecondary',
    },
    igl: {
        id: 'e2e-test-igl-user',
        email: 'e2e-igl@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2EIGL',
    },
};

// Credentials for login (subset of TEST_ACCOUNTS)
export const TEST_CREDENTIALS = {
    primary: { 
        email: TEST_ACCOUNTS.primary.email, 
        password: TEST_ACCOUNTS.primary.password 
    },
    secondary: { 
        email: TEST_ACCOUNTS.secondary.email, 
        password: TEST_ACCOUNTS.secondary.password 
    },
    igl: { 
        email: TEST_ACCOUNTS.igl.email, 
        password: TEST_ACCOUNTS.igl.password 
    },
};

// Storage state paths for authenticated sessions
export const STORAGE_STATE_PATHS = {
    primary: path.resolve(process.cwd(), 'tests/e2e/.auth-state-primary.json'),
    secondary: path.resolve(process.cwd(), 'tests/e2e/.auth-state-secondary.json'),
    igl: path.resolve(process.cwd(), 'tests/e2e/.auth-state-igl.json'),
};


