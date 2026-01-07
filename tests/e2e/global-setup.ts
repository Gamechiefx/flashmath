/**
 * Playwright Global Setup
 * 
 * Creates test accounts before all tests run.
 * Uses Docker exec to insert into the CORRECT database (/app/data/flashmath.db).
 * These accounts are cleaned up in global-teardown.ts
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// Test account definitions - 10 users for 5v5 PvP arena testing (2 teams of 5)
export const TEST_ACCOUNTS = {
    // ========================================
    // TEAM ALPHA (players 1-5)
    // ========================================
    // Player 1 - Team Alpha leader and IGL
    player1: {
        id: 'e2e-test-player1',
        email: 'e2e-player1@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player1',
        role: 'igl',
        team: 'alpha',
    },
    // Player 2 - Team Alpha Anchor
    player2: {
        id: 'e2e-test-player2',
        email: 'e2e-player2@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player2',
        role: 'anchor',
        team: 'alpha',
    },
    // Player 3 - Team Alpha member
    player3: {
        id: 'e2e-test-player3',
        email: 'e2e-player3@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player3',
        role: 'member',
        team: 'alpha',
    },
    // Player 4 - Team Alpha member
    player4: {
        id: 'e2e-test-player4',
        email: 'e2e-player4@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player4',
        role: 'member',
        team: 'alpha',
    },
    // Player 5 - Team Alpha member
    player5: {
        id: 'e2e-test-player5',
        email: 'e2e-player5@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player5',
        role: 'member',
        team: 'alpha',
    },
    
    // ========================================
    // TEAM BRAVO (players 6-10)
    // ========================================
    // Player 6 - Team Bravo leader and IGL
    player6: {
        id: 'e2e-test-player6',
        email: 'e2e-player6@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player6',
        role: 'igl',
        team: 'bravo',
    },
    // Player 7 - Team Bravo Anchor
    player7: {
        id: 'e2e-test-player7',
        email: 'e2e-player7@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player7',
        role: 'anchor',
        team: 'bravo',
    },
    // Player 8 - Team Bravo member
    player8: {
        id: 'e2e-test-player8',
        email: 'e2e-player8@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player8',
        role: 'member',
        team: 'bravo',
    },
    // Player 9 - Team Bravo member
    player9: {
        id: 'e2e-test-player9',
        email: 'e2e-player9@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player9',
        role: 'member',
        team: 'bravo',
    },
    // Player 10 - Team Bravo member
    player10: {
        id: 'e2e-test-player10',
        email: 'e2e-player10@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player10',
        role: 'member',
        team: 'bravo',
    },
    
    // ========================================
    // SPECIAL TEST ACCOUNTS
    // ========================================
    unverified: {
        id: 'e2e-test-unverified',
        email: 'e2e-unverified@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Unverified',
        role: 'unverified',
        emailVerified: false,
    },
    
    // ========================================
    // LEGACY ALIASES (backward compatibility)
    // ========================================
    primary: {
        id: 'e2e-test-player1',
        email: 'e2e-player1@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player1',
    },
    secondary: {
        id: 'e2e-test-player2',
        email: 'e2e-player2@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player2',
    },
    igl: {
        id: 'e2e-test-player1',
        email: 'e2e-player1@test.flashmath.local',
        password: 'TestPassword123',
        name: 'E2E_Player1',
    },
};

// Export for use in tests - individual player credentials (including IDs for invite buttons)
export const TEST_CREDENTIALS = {
    // Team Alpha (players 1-5)
    player1: { id: TEST_ACCOUNTS.player1.id, email: TEST_ACCOUNTS.player1.email, password: TEST_ACCOUNTS.player1.password, name: TEST_ACCOUNTS.player1.name, team: 'alpha' },
    player2: { id: TEST_ACCOUNTS.player2.id, email: TEST_ACCOUNTS.player2.email, password: TEST_ACCOUNTS.player2.password, name: TEST_ACCOUNTS.player2.name, team: 'alpha' },
    player3: { id: TEST_ACCOUNTS.player3.id, email: TEST_ACCOUNTS.player3.email, password: TEST_ACCOUNTS.player3.password, name: TEST_ACCOUNTS.player3.name, team: 'alpha' },
    player4: { id: TEST_ACCOUNTS.player4.id, email: TEST_ACCOUNTS.player4.email, password: TEST_ACCOUNTS.player4.password, name: TEST_ACCOUNTS.player4.name, team: 'alpha' },
    player5: { id: TEST_ACCOUNTS.player5.id, email: TEST_ACCOUNTS.player5.email, password: TEST_ACCOUNTS.player5.password, name: TEST_ACCOUNTS.player5.name, team: 'alpha' },
    // Team Bravo (players 6-10)
    player6: { id: TEST_ACCOUNTS.player6.id, email: TEST_ACCOUNTS.player6.email, password: TEST_ACCOUNTS.player6.password, name: TEST_ACCOUNTS.player6.name, team: 'bravo' },
    player7: { id: TEST_ACCOUNTS.player7.id, email: TEST_ACCOUNTS.player7.email, password: TEST_ACCOUNTS.player7.password, name: TEST_ACCOUNTS.player7.name, team: 'bravo' },
    player8: { id: TEST_ACCOUNTS.player8.id, email: TEST_ACCOUNTS.player8.email, password: TEST_ACCOUNTS.player8.password, name: TEST_ACCOUNTS.player8.name, team: 'bravo' },
    player9: { id: TEST_ACCOUNTS.player9.id, email: TEST_ACCOUNTS.player9.email, password: TEST_ACCOUNTS.player9.password, name: TEST_ACCOUNTS.player9.name, team: 'bravo' },
    player10: { id: TEST_ACCOUNTS.player10.id, email: TEST_ACCOUNTS.player10.email, password: TEST_ACCOUNTS.player10.password, name: TEST_ACCOUNTS.player10.name, team: 'bravo' },
    // Unverified user for email verification tests
    unverified: { id: TEST_ACCOUNTS.unverified.id, email: TEST_ACCOUNTS.unverified.email, password: TEST_ACCOUNTS.unverified.password, name: TEST_ACCOUNTS.unverified.name },
    // Legacy aliases
    primary: { id: TEST_ACCOUNTS.player1.id, email: TEST_ACCOUNTS.player1.email, password: TEST_ACCOUNTS.player1.password, name: TEST_ACCOUNTS.player1.name },
    secondary: { id: TEST_ACCOUNTS.player2.id, email: TEST_ACCOUNTS.player2.email, password: TEST_ACCOUNTS.player2.password, name: TEST_ACCOUNTS.player2.name },
    igl: { id: TEST_ACCOUNTS.player1.id, email: TEST_ACCOUNTS.player1.email, password: TEST_ACCOUNTS.player1.password, name: TEST_ACCOUNTS.player1.name },
};

// The CORRECT database path inside Docker container
const DOCKER_DB_PATH = '/app/data/flashmath.db';
const DOCKER_CONTAINER = 'flashmath-dev';

async function globalSetup() {
    console.log('\n🔧 [E2E Setup] Creating test accounts...\n');
    
    // Check if Docker container is running
    try {
        execSync(`docker ps | grep ${DOCKER_CONTAINER}`, { stdio: 'pipe' });
    } catch {
        console.error(`   ❌ Docker container "${DOCKER_CONTAINER}" is not running!`);
        console.error('   Please start it with: docker-compose up -d');
        return;
    }
    
    // IMPORTANT: Clean up any leftover party state from previous test runs
    // This prevents "already in party" issues between retries and test runs
    console.log('   🧹 Cleaning up any leftover party state...');
    try {
        // Clean up party memberships for test users
        const cleanMembersSql = `DELETE FROM party_members WHERE user_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${cleanMembersSql}"`, { stdio: 'pipe' });
        
        // Clean up parties led by test users
        const cleanPartiesSql = `DELETE FROM parties WHERE leader_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${cleanPartiesSql}"`, { stdio: 'pipe' });
        
        // Clean up party invites for test users
        const cleanInvitesSql = `DELETE FROM party_invites WHERE inviter_id LIKE 'e2e-test-%' OR invitee_id LIKE 'e2e-test-%'`;
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "${cleanInvitesSql}"`, { stdio: 'pipe' });
        
        console.log('   ✅ Cleaned up leftover party state');
    } catch (e) {
        // Tables might not exist, that's ok
        console.log('   ℹ️  No party state to clean up');
    }
    
    // Create accounts for player1-5 AND the unverified test account
    const accountsToCreate = Object.entries(TEST_ACCOUNTS).filter(([key]) => 
        key.startsWith('player') || key === 'unverified'
    );
    
    for (const [key, account] of accountsToCreate) {
        try {
            // Generate bcrypt hash INSIDE the container to avoid shell escaping issues
            const hashCmd = `docker exec ${DOCKER_CONTAINER} node -e "console.log(require('bcryptjs').hashSync('${account.password}', 10))"`;
            const hash = execSync(hashCmd, { encoding: 'utf-8' }).trim();
            
            const now = new Date().toISOString();
            
            // Determine email_verified status - unverified account gets 0, others get 1
            const emailVerified = (account as any).emailVerified === false ? 0 : 1;
            
            // CRITICAL: Write SQL to a file to avoid bash $ expansion issues
            // Bcrypt hashes contain $2b$10$ which bash interprets as variables
            
            // Assign different banners to test players for visual testing
            const banners = ['default', 'caution', 'matrices', 'synthwave', 'royal', 'legendary', 'plasma', 'default', 'caution', 'matrices'];
            const frames = ['default', 'gold', 'default', 'nebula', 'default', 'rainbow', 'default', 'hologram', 'default', 'wanted'];
            const playerNum = parseInt(key.replace('player', '')) || 1;
            const equippedItems = JSON.stringify({
                banner: banners[(playerNum - 1) % banners.length],
                frame: frames[(playerNum - 1) % frames.length],
                title: `Test ${(account as any).role || 'Player'}`,
            });
            
            const sql = `INSERT OR REPLACE INTO users (id, name, email, password_hash, level, total_xp, coins, current_league_id, theme_preferences, math_tiers, equipped_items, role, email_verified, created_at, updated_at) VALUES ('${account.id}', '${account.name}', '${account.email}', '${hash}', 10, 1000, 500, 'neon-league', 'dark', '{}', '${equippedItems.replace(/'/g, "''")}', 'user', ${emailVerified}, '${now}', '${now}');`;
            
            const tmpFile = `/tmp/e2e-insert-${key}.sql`;
            fs.writeFileSync(tmpFile, sql);
            
            // Copy SQL file to container and execute
            execSync(`docker cp ${tmpFile} ${DOCKER_CONTAINER}:/tmp/insert.sql`, { stdio: 'pipe' });
            execSync(`docker exec ${DOCKER_CONTAINER} sh -c 'sqlite3 ${DOCKER_DB_PATH} < /tmp/insert.sql'`, { stdio: 'pipe' });
            
            // Clean up local temp file
            fs.unlinkSync(tmpFile);
            
            // Verify user was created
            const verifyCmd = `docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "SELECT COUNT(*) FROM users WHERE id='${account.id}'"`;
            const count = execSync(verifyCmd, { encoding: 'utf-8' }).trim();
            
            if (count === '1') {
                const verifiedLabel = emailVerified ? '✓ verified' : '✗ unverified';
                console.log(`   ✅ Created test account: ${account.email} (${verifiedLabel})`);
            } else {
                console.log(`   ⚠️  Could not verify: ${account.email}`);
            }
        } catch (error: any) {
            console.log(`   ❌ Failed to create ${account.email}: ${error.message}`);
        }
    }
    
    // Create friendships between test players
    // Team Alpha (1-5) members are friends with each other
    // Team Bravo (6-10) members are friends with each other
    console.log('\n   🤝 Creating friendships between test players...');
    
    const teamAlphaIds = ['e2e-test-player1', 'e2e-test-player2', 'e2e-test-player3', 'e2e-test-player4', 'e2e-test-player5'];
    const teamBravoIds = ['e2e-test-player6', 'e2e-test-player7', 'e2e-test-player8', 'e2e-test-player9', 'e2e-test-player10'];
    const allPlayerIds = [...teamAlphaIds, ...teamBravoIds];
    
    const friendshipSql: string[] = [];
    const now = new Date().toISOString();
    
    // Helper to create bidirectional friendship
    const addFriendship = (id1: string, id2: string) => {
        const friendshipId1 = `friend-${id1}-${id2}`;
        const friendshipId2 = `friend-${id2}-${id1}`;
        friendshipSql.push(
            `INSERT OR REPLACE INTO friendships (id, user_id, friend_id, created_at) VALUES ('${friendshipId1}', '${id1}', '${id2}', '${now}');`,
            `INSERT OR REPLACE INTO friendships (id, user_id, friend_id, created_at) VALUES ('${friendshipId2}', '${id2}', '${id1}', '${now}');`
        );
    };
    
    // Create friendships within Team Alpha (all 5 members)
    for (let i = 0; i < teamAlphaIds.length; i++) {
        for (let j = i + 1; j < teamAlphaIds.length; j++) {
            addFriendship(teamAlphaIds[i], teamAlphaIds[j]);
        }
    }
    
    // Create friendships within Team Bravo (all 5 members)
    for (let i = 0; i < teamBravoIds.length; i++) {
        for (let j = i + 1; j < teamBravoIds.length; j++) {
            addFriendship(teamBravoIds[i], teamBravoIds[j]);
        }
    }
    
    try {
        const friendshipFile = '/tmp/e2e-friendships.sql';
        fs.writeFileSync(friendshipFile, friendshipSql.join('\n'));
        execSync(`docker cp ${friendshipFile} ${DOCKER_CONTAINER}:/tmp/friendships.sql`, { stdio: 'pipe' });
        execSync(`docker exec ${DOCKER_CONTAINER} sh -c 'sqlite3 ${DOCKER_DB_PATH} < /tmp/friendships.sql'`, { stdio: 'pipe' });
        fs.unlinkSync(friendshipFile);
        console.log(`   ✅ Created ${friendshipSql.length / 2} friendships (${teamAlphaIds.length * (teamAlphaIds.length - 1) / 2} for Team Alpha, ${teamBravoIds.length * (teamBravoIds.length - 1) / 2} for Team Bravo)`);
    } catch (error: any) {
        console.log(`   ⚠️  Could not create friendships: ${error.message}`);
    }
    
    // Write credentials to a temp file for tests to read
    const credentialsPath = path.resolve(process.cwd(), 'tests/e2e/.test-credentials.json');
    fs.writeFileSync(credentialsPath, JSON.stringify(TEST_CREDENTIALS, null, 2));
    console.log(`   📝 Credentials written to ${credentialsPath}`);
    
    // Force WAL checkpoint to flush all changes to the main database file
    console.log('   🔄 Forcing WAL checkpoint...');
    try {
        execSync(`docker exec ${DOCKER_CONTAINER} sqlite3 "${DOCKER_DB_PATH}" "PRAGMA wal_checkpoint(FULL);"`, { stdio: 'pipe' });
        console.log('   ✅ WAL checkpoint complete');
    } catch (error: any) {
        console.log(`   ⚠️  WAL checkpoint failed: ${error.message}`);
    }
    
    // CRITICAL: Restart the container so the server sees the new users
    // SQLite WAL mode caches reads - the running server won't see external inserts
    console.log('   🔄 Restarting server to pick up new accounts (WAL mode workaround)...');
    try {
        execSync(`docker restart ${DOCKER_CONTAINER}`, { stdio: 'pipe' });
        
        // Initial wait for container to start
        await new Promise(r => setTimeout(r, 5000));
        
        // Wait for server to be fully ready (multiple successful requests)
        let consecutiveSuccesses = 0;
        const requiredSuccesses = 3;
        
        for (let i = 0; i < 60; i++) {
            try {
                execSync('curl -sf https://dev.flashmath.io/auth/login -o /dev/null', { timeout: 5000 });
                consecutiveSuccesses++;
                if (consecutiveSuccesses >= requiredSuccesses) {
                    break;
                }
            } catch {
                consecutiveSuccesses = 0;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        
        if (consecutiveSuccesses >= requiredSuccesses) {
            // Extra buffer for full stability
            await new Promise(r => setTimeout(r, 2000));
            console.log('   ✅ Server restarted and stable');
        } else {
            console.log('   ⚠️  Server may not be fully ready');
        }
    } catch (err: any) {
        console.log(`   ⚠️  Could not restart server: ${err.message}`);
    }
    
    console.log('\n✅ [E2E Setup] Test accounts ready!\n');
}

export default globalSetup;