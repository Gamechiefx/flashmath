/**
 * Playwright Global Teardown
 * 
 * Cleans up test accounts after all tests complete.
 * Uses Docker exec to delete from the CORRECT database (/app/data/flashmath.db).
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// Import test account definitions
import { TEST_ACCOUNTS } from './global-setup';

// The CORRECT database path inside Docker container
const DOCKER_DB_PATH = '/app/data/flashmath.db';
const DOCKER_CONTAINER = 'flashmath-dev';

async function globalTeardown() {
    console.log('\n🧹 [E2E Teardown] Cleaning up test accounts...\n');
    
    // Check if Docker container is running
    try {
        execSync(`docker ps | grep ${DOCKER_CONTAINER}`, { stdio: 'pipe' });
    } catch {
        console.log(`   ⚠️  Docker container "${DOCKER_CONTAINER}" is not running. Skipping cleanup.`);
        return;
    }
    
    // Delete player1-5 accounts AND unverified account (skip legacy aliases which point to same IDs)
    const accountsToDelete = Object.entries(TEST_ACCOUNTS).filter(([key]) => 
        key.startsWith('player') || key === 'unverified'
    );
    
    for (const [key, account] of accountsToDelete) {
        try {
            const sql = `DELETE FROM users WHERE id = '${account.id}'`;
            execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${sql}"`, { stdio: 'pipe' });
            console.log(`   🗑️  Deleted test account: ${account.email}`);
        } catch {
            console.log(`   ℹ️  Account may not exist: ${account.email}`);
        }
    }
    
    // Clean up friendships between test players
    console.log('   🗑️  Cleaning up test friendships...');
    try {
        const sql = `DELETE FROM friendships WHERE user_id LIKE 'e2e-test-%' OR friend_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${sql}"`, { stdio: 'pipe' });
        console.log('   🗑️  Cleaned up test friendships');
    } catch {
        // Table might not exist
    }
    
    // Clean up parties created by test users
    try {
        const sql = `DELETE FROM parties WHERE leader_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${sql}"`, { stdio: 'pipe' });
        console.log('   🗑️  Cleaned up test parties');
    } catch {
        // Table might not exist
    }
    
    // Clean up party memberships
    try {
        const sql = `DELETE FROM party_members WHERE user_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${sql}"`, { stdio: 'pipe' });
        console.log('   🗑️  Cleaned up test party memberships');
    } catch {
        // Table might not exist
    }
    
    // Remove credentials file
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    if (fs.existsSync(credentialsPath)) {
        fs.unlinkSync(credentialsPath);
        console.log('   🗑️  Removed credentials file');
    }
    
    console.log('\n✅ [E2E Teardown] Cleanup complete!\n');
}

export default globalTeardown;
