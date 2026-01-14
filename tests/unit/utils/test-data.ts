/**
 * Test Data Factory
 * 
 * Utilities for creating consistent test data across all test types.
 * Used by unit tests, socket tests, and E2E tests.
 */

import { v4 as uuid } from 'uuid';

// ============================================================================
// User Data Factories
// ============================================================================

export interface TestUser {
    id: string;
    name: string;
    email: string;
    level: number;
    total_xp: number;
    coins: number;
    duel_elo: number;
    team_elo: number;
    current_league_id: string;
    role: 'user' | 'moderator' | 'admin' | 'super_admin';
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    const id = overrides.id || `user-${uuid().slice(0, 8)}`;
    return {
        id,
        name: overrides.name || `TestUser${Math.floor(Math.random() * 9999)}`,
        email: overrides.email || `${id}@test.flashmath.io`,
        level: overrides.level ?? 1,
        total_xp: overrides.total_xp ?? 0,
        coins: overrides.coins ?? 100,
        duel_elo: overrides.duel_elo ?? 300,
        team_elo: overrides.team_elo ?? 300,
        current_league_id: overrides.current_league_id || 'neon-league',
        role: overrides.role || 'user',
    };
}

// ============================================================================
// Team Data Factories
// ============================================================================

export interface TestTeamMember {
    odUserId: string;
    odName: string;
    odLevel: number;
    odDuelElo: number;
    odElo5v5: number;
    odDuelRank: string;
    odDuelDivision: string;
    isLeader: boolean;
    isIGL: boolean;
    isAnchor: boolean;
    odOnline: boolean;
}

export function createTestTeamMember(overrides: Partial<TestTeamMember> = {}): TestTeamMember {
    return {
        odUserId: overrides.odUserId || `user-${uuid().slice(0, 8)}`,
        odName: overrides.odName || `Player${Math.floor(Math.random() * 9999)}`,
        odLevel: overrides.odLevel ?? 10,
        odDuelElo: overrides.odDuelElo ?? 500,
        odElo5v5: overrides.odElo5v5 ?? 500,
        odDuelRank: overrides.odDuelRank || 'bronze',
        odDuelDivision: overrides.odDuelDivision || 'I',
        isLeader: overrides.isLeader ?? false,
        isIGL: overrides.isIGL ?? false,
        isAnchor: overrides.isAnchor ?? false,
        odOnline: overrides.odOnline ?? true,
    };
}

export function createTestTeam(size: 2 | 3 | 4 | 5 = 5): TestTeamMember[] {
    const team: TestTeamMember[] = [];
    
    for (let i = 0; i < size; i++) {
        team.push(createTestTeamMember({
            odName: `Player${i + 1}`,
            isLeader: i === 0,
            isIGL: i === 0,
            isAnchor: i === 1,
            odDuelElo: 400 + (i * 50),
            odElo5v5: 400 + (i * 50),
        }));
    }
    
    return team;
}

// ============================================================================
// Match Data Factories
// ============================================================================

export interface TestQuestion {
    id: string;
    num1: number;
    num2: number;
    operation: '+' | '-' | '×' | '÷';
    answer: number;
    difficulty: 1 | 2 | 3 | 4 | 5;
}

export function createTestQuestion(operation: '+' | '-' | '×' | '÷' = '×'): TestQuestion {
    const num1 = Math.floor(Math.random() * 10) + 2;
    const num2 = Math.floor(Math.random() * 10) + 2;
    
    let answer: number;
    switch (operation) {
        case '+': answer = num1 + num2; break;
        case '-': answer = Math.max(num1, num2) - Math.min(num1, num2); break;
        case '×': answer = num1 * num2; break;
        case '÷': answer = num2; break; // num1 will be product
    }
    
    return {
        id: uuid(),
        num1: operation === '÷' ? num1 * num2 : num1,
        num2: operation === '÷' ? num1 : num2,
        operation,
        answer,
        difficulty: 2,
    };
}

export function createTestQuestionSet(count: number = 25): TestQuestion[] {
    const operations: Array<'+' | '-' | '×' | '÷'> = ['+', '-', '×', '÷'];
    return Array.from({ length: count }, (_, i) => 
        createTestQuestion(operations[i % 4])
    );
}

// ============================================================================
// Party Data Factories
// ============================================================================

export interface TestParty {
    id: string;
    leaderId: string;
    members: TestTeamMember[];
    inviteMode: 'open' | 'invite_only';
    targetMode: '2v2' | '3v3' | '4v4' | '5v5' | null;
    iglId: string | null;
    anchorId: string | null;
    queueStatus: 'idle' | 'queuing' | 'in_match';
}

export function createTestParty(memberCount: number = 5): TestParty {
    const members = createTestTeam(memberCount as 2 | 3 | 4 | 5);
    const leader = members[0];
    
    return {
        id: `party-${uuid().slice(0, 8)}`,
        leaderId: leader.odUserId,
        members,
        inviteMode: 'invite_only',
        targetMode: memberCount === 5 ? '5v5' : null,
        iglId: leader.odUserId,
        anchorId: members[1]?.odUserId || null,
        queueStatus: 'idle',
    };
}

// ============================================================================
// Match State Factories
// ============================================================================

export interface TestMatchState {
    matchId: string;
    phase: 'strategy' | 'active' | 'break' | 'halftime' | 'anchor_decision' | 'post_match';
    half: 1 | 2;
    round: number;
    gameClockMs: number;
    team1Score: number;
    team2Score: number;
    currentSlot: number;
    questionsInSlot: number;
}

export function createTestMatchState(overrides: Partial<TestMatchState> = {}): TestMatchState {
    return {
        matchId: overrides.matchId || `match-${uuid().slice(0, 8)}`,
        phase: overrides.phase || 'active',
        half: overrides.half ?? 1,
        round: overrides.round ?? 1,
        gameClockMs: overrides.gameClockMs ?? 360000,
        team1Score: overrides.team1Score ?? 0,
        team2Score: overrides.team2Score ?? 0,
        currentSlot: overrides.currentSlot ?? 1,
        questionsInSlot: overrides.questionsInSlot ?? 0,
    };
}

// ============================================================================
// Test Account Constants (for E2E tests)
// ============================================================================

export const TEST_ACCOUNTS = {
    primary: {
        email: 'e2e-test-primary@flashmath.io',
        password: 'TestPass123!',
        name: 'E2E-Primary',
    },
    secondary: {
        email: 'e2e-test-secondary@flashmath.io',
        password: 'TestPass123!',
        name: 'E2E-Secondary',
    },
    igl: {
        email: 'e2e-test-igl@flashmath.io',
        password: 'TestPass123!',
        name: 'E2E-IGL',
    },
    anchor: {
        email: 'e2e-test-anchor@flashmath.io',
        password: 'TestPass123!',
        name: 'E2E-Anchor',
    },
    admin: {
        email: 'e2e-test-admin@flashmath.io',
        password: 'AdminPass123!',
        name: 'E2E-Admin',
    },
};

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that an ELO value is within valid range
 */
export function isValidElo(elo: number): boolean {
    return elo >= 100 && elo <= 3000 && Number.isInteger(elo);
}

/**
 * Assert that a score is positive and reasonable
 */
export function isValidScore(score: number): boolean {
    return score >= 0 && score <= 50000 && Number.isInteger(score);
}

/**
 * Assert that accuracy is between 0 and 1
 */
export function isValidAccuracy(accuracy: number): boolean {
    return accuracy >= 0 && accuracy <= 1;
}

export default {
    createTestUser,
    createTestTeamMember,
    createTestTeam,
    createTestQuestion,
    createTestQuestionSet,
    createTestParty,
    createTestMatchState,
    TEST_ACCOUNTS,
    isValidElo,
    isValidScore,
    isValidAccuracy,
};


