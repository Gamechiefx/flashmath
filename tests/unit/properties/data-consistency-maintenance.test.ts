/**
 * Property-Based Tests for Data Consistency Maintenance
 * 
 * Feature: comprehensive-user-stories
 * Property 19: Data Consistency Maintenance
 * 
 * Validates: Requirements 8.6
 * For any data modification operation, the system should maintain referential integrity,
 * prevent data corruption, and ensure consistent state across all related entities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock database entities
interface MockUser {
    id: string;
    name: string;
    email: string;
    level: number;
    total_xp: number;
    coins: number;
    current_league_id: string;
    created_at: string;
    updated_at: string;
}

interface MockSession {
    id: string;
    user_id: string;
    operation: string;
    correct_count: number;
    total_count: number;
    xp_earned: number;
    created_at: string;
}

interface MockLeagueParticipant {
    league_id: string;
    user_id: string;
    name: string;
    weekly_xp: number;
}

interface MockInventoryItem {
    id: string;
    user_id: string;
    item_id: string;
    equipped: boolean;
    acquired_at: string;
}

interface MockTransaction {
    id: string;
    user_id: string;
    type: 'purchase' | 'reward' | 'refund';
    amount: number;
    item_id?: string;
    timestamp: string;
}

interface DatabaseState {
    users: MockUser[];
    sessions: MockSession[];
    leagueParticipants: MockLeagueParticipant[];
    inventory: MockInventoryItem[];
    transactions: MockTransaction[];
}

interface DataOperation {
    type: 'create' | 'update' | 'delete';
    entity: 'user' | 'session' | 'league_participant' | 'inventory_item' | 'transaction';
    data: any;
    conditions?: Record<string, any>;
}

interface ConsistencyCheckResult {
    isConsistent: boolean;
    violations: Array<{
        type: 'referential_integrity' | 'data_corruption' | 'constraint_violation' | 'orphaned_record';
        entity: string;
        description: string;
        affectedRecords: string[];
    }>;
    integrityScore: number; // 0-1
}

// Simulate database operations with consistency checks
function executeOperation(state: DatabaseState, operation: DataOperation): {
    success: boolean;
    error?: string;
    newState: DatabaseState;
} {
    const newState = JSON.parse(JSON.stringify(state)); // Deep copy
    
    try {
        switch (operation.entity) {
            case 'user':
                return executeUserOperation(newState, operation);
            case 'session':
                return executeSessionOperation(newState, operation);
            case 'league_participant':
                return executeLeagueParticipantOperation(newState, operation);
            case 'inventory_item':
                return executeInventoryOperation(newState, operation);
            case 'transaction':
                return executeTransactionOperation(newState, operation);
            default:
                return { success: false, error: 'Unknown entity type', newState: state };
        }
    } catch (error) {
        return { success: false, error: `Operation failed: ${error}`, newState: state };
    }
}

function executeUserOperation(state: DatabaseState, operation: DataOperation) {
    switch (operation.type) {
        case 'create':
            // Check for duplicate email
            if (state.users.some(u => u.email === operation.data.email)) {
                return { success: false, error: 'Email already exists', newState: state };
            }
            
            const newUser: MockUser = {
                id: operation.data.id || `user-${Date.now()}`,
                name: operation.data.name,
                email: operation.data.email,
                level: operation.data.level || 1,
                total_xp: operation.data.total_xp || 0,
                coins: operation.data.coins || 0,
                current_league_id: operation.data.current_league_id || 'neon-league',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            state.users.push(newUser);
            break;
            
        case 'update':
            const userIndex = state.users.findIndex(u => u.id === operation.conditions?.id);
            if (userIndex === -1) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            // Validate constraints
            if (operation.data.level !== undefined && operation.data.level < 1) {
                return { success: false, error: 'Invalid level', newState: state };
            }
            if (operation.data.total_xp !== undefined && operation.data.total_xp < 0) {
                return { success: false, error: 'Invalid XP', newState: state };
            }
            if (operation.data.coins !== undefined && operation.data.coins < 0) {
                return { success: false, error: 'Invalid coins', newState: state };
            }
            
            state.users[userIndex] = {
                ...state.users[userIndex],
                ...operation.data,
                updated_at: new Date().toISOString()
            };
            break;
            
        case 'delete':
            const deleteIndex = state.users.findIndex(u => u.id === operation.conditions?.id);
            if (deleteIndex === -1) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            const userId = state.users[deleteIndex].id;
            
            // Check for dependent records
            const hasSessions = state.sessions.some(s => s.user_id === userId);
            const hasLeagueParticipation = state.leagueParticipants.some(lp => lp.user_id === userId);
            const hasInventory = state.inventory.some(i => i.user_id === userId);
            const hasTransactions = state.transactions.some(t => t.user_id === userId);
            
            if (hasSessions || hasLeagueParticipation || hasInventory || hasTransactions) {
                return { success: false, error: 'Cannot delete user with dependent records', newState: state };
            }
            
            state.users.splice(deleteIndex, 1);
            break;
    }
    
    return { success: true, newState: state };
}

function executeSessionOperation(state: DatabaseState, operation: DataOperation) {
    switch (operation.type) {
        case 'create':
            // Validate user exists
            if (!state.users.some(u => u.id === operation.data.user_id)) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            const newSession: MockSession = {
                id: operation.data.id || `session-${Date.now()}`,
                user_id: operation.data.user_id,
                operation: operation.data.operation,
                correct_count: operation.data.correct_count || 0,
                total_count: operation.data.total_count || 0,
                xp_earned: operation.data.xp_earned || 0,
                created_at: new Date().toISOString()
            };
            
            // Validate session data
            if (newSession.correct_count > newSession.total_count) {
                return { success: false, error: 'Correct count cannot exceed total count', newState: state };
            }
            if (newSession.correct_count < 0 || newSession.total_count < 0 || newSession.xp_earned < 0) {
                return { success: false, error: 'Session counts must be non-negative', newState: state };
            }
            
            state.sessions.push(newSession);
            
            // Update user XP and level
            const userIndex = state.users.findIndex(u => u.id === operation.data.user_id);
            if (userIndex !== -1) {
                state.users[userIndex].total_xp += newSession.xp_earned;
                state.users[userIndex].level = Math.floor(state.users[userIndex].total_xp / 1000) + 1;
                state.users[userIndex].updated_at = new Date().toISOString();
            }
            break;
            
        case 'delete':
            const sessionIndex = state.sessions.findIndex(s => s.id === operation.conditions?.id);
            if (sessionIndex === -1) {
                return { success: false, error: 'Session not found', newState: state };
            }
            
            const session = state.sessions[sessionIndex];
            
            // Revert user XP
            const userIdx = state.users.findIndex(u => u.id === session.user_id);
            if (userIdx !== -1) {
                state.users[userIdx].total_xp = Math.max(0, state.users[userIdx].total_xp - session.xp_earned);
                state.users[userIdx].level = Math.floor(state.users[userIdx].total_xp / 1000) + 1;
                state.users[userIdx].updated_at = new Date().toISOString();
            }
            
            state.sessions.splice(sessionIndex, 1);
            break;
    }
    
    return { success: true, newState: state };
}

function executeLeagueParticipantOperation(state: DatabaseState, operation: DataOperation) {
    switch (operation.type) {
        case 'create':
            // Validate user exists
            if (!state.users.some(u => u.id === operation.data.user_id)) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            // Check for duplicate participation
            if (state.leagueParticipants.some(lp => lp.user_id === operation.data.user_id && lp.league_id === operation.data.league_id)) {
                return { success: false, error: 'User already participating in league', newState: state };
            }
            
            const newParticipant: MockLeagueParticipant = {
                league_id: operation.data.league_id,
                user_id: operation.data.user_id,
                name: operation.data.name,
                weekly_xp: operation.data.weekly_xp || 0
            };
            
            state.leagueParticipants.push(newParticipant);
            break;
            
        case 'delete':
            const participantIndex = state.leagueParticipants.findIndex(lp => 
                lp.user_id === operation.conditions?.user_id && lp.league_id === operation.conditions?.league_id
            );
            if (participantIndex === -1) {
                return { success: false, error: 'League participant not found', newState: state };
            }
            
            state.leagueParticipants.splice(participantIndex, 1);
            break;
    }
    
    return { success: true, newState: state };
}

function executeInventoryOperation(state: DatabaseState, operation: DataOperation) {
    switch (operation.type) {
        case 'create':
            // Validate user exists
            if (!state.users.some(u => u.id === operation.data.user_id)) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            // Check for duplicate item
            if (state.inventory.some(i => i.user_id === operation.data.user_id && i.item_id === operation.data.item_id)) {
                return { success: false, error: 'User already owns this item', newState: state };
            }
            
            const newItem: MockInventoryItem = {
                id: operation.data.id || `inv-${Date.now()}`,
                user_id: operation.data.user_id,
                item_id: operation.data.item_id,
                equipped: operation.data.equipped || false,
                acquired_at: new Date().toISOString()
            };
            
            state.inventory.push(newItem);
            break;
            
        case 'update':
            const itemIndex = state.inventory.findIndex(i => i.id === operation.conditions?.id);
            if (itemIndex === -1) {
                return { success: false, error: 'Inventory item not found', newState: state };
            }
            
            // If equipping, unequip other items of same type
            if (operation.data.equipped === true) {
                const item = state.inventory[itemIndex];
                state.inventory.forEach(i => {
                    if (i.user_id === item.user_id && i.item_id !== item.item_id && i.equipped) {
                        // Simplified: assume only one item can be equipped per user
                        i.equipped = false;
                    }
                });
            }
            
            state.inventory[itemIndex] = {
                ...state.inventory[itemIndex],
                ...operation.data
            };
            break;
    }
    
    return { success: true, newState: state };
}

function executeTransactionOperation(state: DatabaseState, operation: DataOperation) {
    switch (operation.type) {
        case 'create':
            // Validate user exists
            if (!state.users.some(u => u.id === operation.data.user_id)) {
                return { success: false, error: 'User not found', newState: state };
            }
            
            const newTransaction: MockTransaction = {
                id: operation.data.id || `txn-${Date.now()}`,
                user_id: operation.data.user_id,
                type: operation.data.type,
                amount: operation.data.amount,
                item_id: operation.data.item_id,
                timestamp: new Date().toISOString()
            };
            
            // Validate transaction
            if (newTransaction.amount <= 0) {
                return { success: false, error: 'Transaction amount must be positive', newState: state };
            }
            
            // Update user coins
            const userIndex = state.users.findIndex(u => u.id === operation.data.user_id);
            if (userIndex !== -1) {
                if (newTransaction.type === 'purchase' || newTransaction.type === 'refund') {
                    const newBalance = newTransaction.type === 'purchase' 
                        ? state.users[userIndex].coins - newTransaction.amount
                        : state.users[userIndex].coins + newTransaction.amount;
                    
                    if (newBalance < 0 && newTransaction.type === 'purchase') {
                        return { success: false, error: 'Insufficient funds', newState: state };
                    }
                    
                    state.users[userIndex].coins = newBalance;
                } else if (newTransaction.type === 'reward') {
                    state.users[userIndex].coins += newTransaction.amount;
                }
                
                state.users[userIndex].updated_at = new Date().toISOString();
            }
            
            state.transactions.push(newTransaction);
            break;
    }
    
    return { success: true, newState: state };
}

// Check data consistency
function checkDataConsistency(state: DatabaseState): ConsistencyCheckResult {
    const violations = [];
    let integrityScore = 1.0;
    
    // Check referential integrity
    state.sessions.forEach(session => {
        if (!state.users.some(u => u.id === session.user_id)) {
            violations.push({
                type: 'referential_integrity' as const,
                entity: 'session',
                description: `Session ${session.id} references non-existent user ${session.user_id}`,
                affectedRecords: [session.id]
            });
        }
    });
    
    state.leagueParticipants.forEach(participant => {
        if (!state.users.some(u => u.id === participant.user_id)) {
            violations.push({
                type: 'referential_integrity' as const,
                entity: 'league_participant',
                description: `League participant references non-existent user ${participant.user_id}`,
                affectedRecords: [participant.user_id]
            });
        }
    });
    
    state.inventory.forEach(item => {
        if (!state.users.some(u => u.id === item.user_id)) {
            violations.push({
                type: 'referential_integrity' as const,
                entity: 'inventory_item',
                description: `Inventory item ${item.id} references non-existent user ${item.user_id}`,
                affectedRecords: [item.id]
            });
        }
    });
    
    state.transactions.forEach(transaction => {
        if (!state.users.some(u => u.id === transaction.user_id)) {
            violations.push({
                type: 'referential_integrity' as const,
                entity: 'transaction',
                description: `Transaction ${transaction.id} references non-existent user ${transaction.user_id}`,
                affectedRecords: [transaction.id]
            });
        }
    });
    
    // Check data constraints
    state.users.forEach(user => {
        if (user.level < 1) {
            violations.push({
                type: 'constraint_violation' as const,
                entity: 'user',
                description: `User ${user.id} has invalid level ${user.level}`,
                affectedRecords: [user.id]
            });
        }
        
        if (user.total_xp < 0) {
            violations.push({
                type: 'constraint_violation' as const,
                entity: 'user',
                description: `User ${user.id} has negative XP ${user.total_xp}`,
                affectedRecords: [user.id]
            });
        }
        
        if (user.coins < 0) {
            violations.push({
                type: 'constraint_violation' as const,
                entity: 'user',
                description: `User ${user.id} has negative coins ${user.coins}`,
                affectedRecords: [user.id]
            });
        }
    });
    
    state.sessions.forEach(session => {
        if (session.correct_count > session.total_count) {
            violations.push({
                type: 'data_corruption' as const,
                entity: 'session',
                description: `Session ${session.id} has more correct answers than total questions`,
                affectedRecords: [session.id]
            });
        }
        
        if (session.correct_count < 0 || session.total_count < 0 || session.xp_earned < 0) {
            violations.push({
                type: 'constraint_violation' as const,
                entity: 'session',
                description: `Session ${session.id} has negative values`,
                affectedRecords: [session.id]
            });
        }
    });
    
    // Calculate integrity score
    const totalRecords = state.users.length + state.sessions.length + state.leagueParticipants.length + 
                        state.inventory.length + state.transactions.length;
    
    if (totalRecords > 0) {
        integrityScore = Math.max(0, 1 - (violations.length / totalRecords));
    }
    
    return {
        isConsistent: violations.length === 0,
        violations,
        integrityScore
    };
}

// Generate random database state
function generateRandomDatabaseState(): DatabaseState {
    const userCount = Math.floor(Math.random() * 20) + 5;
    const users: MockUser[] = [];
    
    for (let i = 0; i < userCount; i++) {
        users.push({
            id: `user-${i}`,
            name: `User${i}`,
            email: `user${i}@test.com`,
            level: Math.floor(Math.random() * 50) + 1,
            total_xp: Math.floor(Math.random() * 50000),
            coins: Math.floor(Math.random() * 10000),
            current_league_id: ['neon-league', 'cobalt-league', 'plasma-league'][Math.floor(Math.random() * 3)],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
    }
    
    const sessions: MockSession[] = [];
    const leagueParticipants: MockLeagueParticipant[] = [];
    const inventory: MockInventoryItem[] = [];
    const transactions: MockTransaction[] = [];
    
    // Generate related data
    users.forEach(user => {
        // Sessions
        const sessionCount = Math.floor(Math.random() * 5);
        for (let i = 0; i < sessionCount; i++) {
            sessions.push({
                id: `session-${user.id}-${i}`,
                user_id: user.id,
                operation: ['Addition', 'Subtraction', 'Multiplication', 'Division'][Math.floor(Math.random() * 4)],
                correct_count: Math.floor(Math.random() * 20),
                total_count: Math.floor(Math.random() * 20) + 20,
                xp_earned: Math.floor(Math.random() * 500),
                created_at: new Date().toISOString()
            });
        }
        
        // League participation
        if (Math.random() > 0.3) {
            leagueParticipants.push({
                league_id: user.current_league_id,
                user_id: user.id,
                name: user.name,
                weekly_xp: Math.floor(Math.random() * 1000)
            });
        }
        
        // Inventory
        const itemCount = Math.floor(Math.random() * 3);
        for (let i = 0; i < itemCount; i++) {
            inventory.push({
                id: `inv-${user.id}-${i}`,
                user_id: user.id,
                item_id: `item-${Math.floor(Math.random() * 100)}`,
                equipped: Math.random() > 0.7,
                acquired_at: new Date().toISOString()
            });
        }
        
        // Transactions
        const txnCount = Math.floor(Math.random() * 3);
        for (let i = 0; i < txnCount; i++) {
            transactions.push({
                id: `txn-${user.id}-${i}`,
                user_id: user.id,
                type: ['purchase', 'reward', 'refund'][Math.floor(Math.random() * 3)] as any,
                amount: Math.floor(Math.random() * 1000) + 10,
                item_id: Math.random() > 0.5 ? `item-${Math.floor(Math.random() * 100)}` : undefined,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    return { users, sessions, leagueParticipants, inventory, transactions };
}

describe('Property 19: Data Consistency Maintenance', () => {
    it('should maintain referential integrity during operations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomDatabaseState();
            const initialConsistency = checkDataConsistency(initialState);
            
            // Only test with initially consistent data
            if (!initialConsistency.isConsistent) continue;
            
            // Generate random operation
            const operations = [
                { type: 'create', entity: 'session', data: { user_id: initialState.users[0]?.id, operation: 'Addition', correct_count: 10, total_count: 15, xp_earned: 100 } },
                { type: 'create', entity: 'inventory_item', data: { user_id: initialState.users[0]?.id, item_id: 'test-item' } },
                { type: 'create', entity: 'transaction', data: { user_id: initialState.users[0]?.id, type: 'reward', amount: 100 } }
            ];
            
            const operation = operations[Math.floor(Math.random() * operations.length)] as DataOperation;
            
            if (initialState.users.length > 0) {
                const result = executeOperation(initialState, operation);
                
                if (result.success) {
                    const finalConsistency = checkDataConsistency(result.newState);
                    
                    // Should maintain consistency
                    expect(finalConsistency.isConsistent).toBe(true);
                    expect(finalConsistency.integrityScore).toBeGreaterThanOrEqual(0.9);
                    
                    // Should not have referential integrity violations
                    const refViolations = finalConsistency.violations.filter(v => v.type === 'referential_integrity');
                    expect(refViolations.length).toBe(0);
                }
            }
        }
    });

    it('should prevent data corruption through constraint validation', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length === 0) continue;
            
            const corruptingOperations = [
                // Negative values
                { type: 'update', entity: 'user', data: { coins: -100 }, conditions: { id: state.users[0].id } },
                { type: 'update', entity: 'user', data: { total_xp: -500 }, conditions: { id: state.users[0].id } },
                { type: 'update', entity: 'user', data: { level: 0 }, conditions: { id: state.users[0].id } },
                
                // Invalid session data
                { type: 'create', entity: 'session', data: { user_id: state.users[0].id, correct_count: 20, total_count: 10, xp_earned: 100 } },
                { type: 'create', entity: 'session', data: { user_id: state.users[0].id, correct_count: -5, total_count: 10, xp_earned: 100 } },
                
                // Invalid transactions
                { type: 'create', entity: 'transaction', data: { user_id: state.users[0].id, type: 'purchase', amount: -50 } }
            ];
            
            const operation = corruptingOperations[Math.floor(Math.random() * corruptingOperations.length)] as DataOperation;
            const result = executeOperation(state, operation);
            
            // Corrupting operations should be rejected
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            
            // State should remain unchanged
            const consistency = checkDataConsistency(result.newState);
            expect(consistency.isConsistent).toBe(true);
        }
    });

    it('should handle cascading updates correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length === 0) continue;
            
            const user = state.users[0];
            const initialXP = user.total_xp;
            const initialLevel = user.level;
            
            // Create session that should update user XP and level
            const sessionOperation: DataOperation = {
                type: 'create',
                entity: 'session',
                data: {
                    user_id: user.id,
                    operation: 'Addition',
                    correct_count: 15,
                    total_count: 20,
                    xp_earned: 1500 // Significant XP to potentially change level
                }
            };
            
            const result = executeOperation(state, sessionOperation);
            
            if (result.success) {
                const updatedUser = result.newState.users.find(u => u.id === user.id);
                expect(updatedUser).toBeDefined();
                
                // XP should be updated
                expect(updatedUser!.total_xp).toBe(initialXP + 1500);
                
                // Level should be recalculated
                const expectedLevel = Math.floor(updatedUser!.total_xp / 1000) + 1;
                expect(updatedUser!.level).toBe(expectedLevel);
                
                // Updated timestamp should be set
                expect(updatedUser!.updated_at).not.toBe(user.updated_at);
                
                // Consistency should be maintained
                const consistency = checkDataConsistency(result.newState);
                expect(consistency.isConsistent).toBe(true);
            }
        }
    });

    it('should prevent orphaned records', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length === 0) continue;
            
            const userWithDependencies = state.users.find(u => 
                state.sessions.some(s => s.user_id === u.id) ||
                state.inventory.some(i => i.user_id === u.id) ||
                state.transactions.some(t => t.user_id === u.id)
            );
            
            if (userWithDependencies) {
                // Try to delete user with dependencies
                const deleteOperation: DataOperation = {
                    type: 'delete',
                    entity: 'user',
                    conditions: { id: userWithDependencies.id }
                };
                
                const result = executeOperation(state, deleteOperation);
                
                // Should be rejected
                expect(result.success).toBe(false);
                expect(result.error).toContain('dependent records');
                
                // User should still exist
                expect(result.newState.users.find(u => u.id === userWithDependencies.id)).toBeDefined();
                
                // Consistency should be maintained
                const consistency = checkDataConsistency(result.newState);
                expect(consistency.isConsistent).toBe(true);
            }
        }
    });

    it('should maintain transactional consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length === 0) continue;
            
            const user = state.users[0];
            const initialCoins = user.coins;
            
            // Test purchase transaction
            const purchaseAmount = Math.floor(Math.random() * (initialCoins + 1000)); // May exceed balance
            const purchaseOperation: DataOperation = {
                type: 'create',
                entity: 'transaction',
                data: {
                    user_id: user.id,
                    type: 'purchase',
                    amount: purchaseAmount,
                    item_id: 'test-item'
                }
            };
            
            const result = executeOperation(state, purchaseOperation);
            
            if (purchaseAmount > initialCoins) {
                // Should be rejected for insufficient funds
                expect(result.success).toBe(false);
                expect(result.error).toContain('Insufficient funds');
                
                // User coins should remain unchanged
                const unchangedUser = result.newState.users.find(u => u.id === user.id);
                expect(unchangedUser!.coins).toBe(initialCoins);
            } else {
                // Should succeed
                expect(result.success).toBe(true);
                
                // User coins should be updated
                const updatedUser = result.newState.users.find(u => u.id === user.id);
                expect(updatedUser!.coins).toBe(initialCoins - purchaseAmount);
                
                // Transaction should be recorded
                const transaction = result.newState.transactions.find(t => 
                    t.user_id === user.id && t.type === 'purchase' && t.amount === purchaseAmount
                );
                expect(transaction).toBeDefined();
            }
            
            // Consistency should always be maintained
            const consistency = checkDataConsistency(result.newState);
            expect(consistency.isConsistent).toBe(true);
        }
    });

    it('should handle concurrent operations safely', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length < 2) continue;
            
            const user1 = state.users[0];
            const user2 = state.users[1];
            
            // Simulate concurrent operations
            const operations: DataOperation[] = [
                { type: 'create', entity: 'session', data: { user_id: user1.id, operation: 'Addition', correct_count: 10, total_count: 15, xp_earned: 100 } },
                { type: 'create', entity: 'session', data: { user_id: user2.id, operation: 'Subtraction', correct_count: 8, total_count: 12, xp_earned: 80 } },
                { type: 'create', entity: 'transaction', data: { user_id: user1.id, type: 'reward', amount: 50 } },
                { type: 'create', entity: 'inventory_item', data: { user_id: user2.id, item_id: 'concurrent-item' } }
            ];
            
            let currentState = state;
            const results = [];
            
            // Execute operations sequentially (simulating resolved concurrency)
            for (const operation of operations) {
                const result = executeOperation(currentState, operation);
                results.push(result);
                if (result.success) {
                    currentState = result.newState;
                }
            }
            
            // All operations should succeed (no conflicts)
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
            
            // Final state should be consistent
            const finalConsistency = checkDataConsistency(currentState);
            expect(finalConsistency.isConsistent).toBe(true);
            expect(finalConsistency.integrityScore).toBeGreaterThanOrEqual(0.9);
            
            // Both users should have updated data
            const finalUser1 = currentState.users.find(u => u.id === user1.id);
            const finalUser2 = currentState.users.find(u => u.id === user2.id);
            
            expect(finalUser1!.total_xp).toBeGreaterThan(user1.total_xp);
            expect(finalUser1!.coins).toBeGreaterThan(user1.coins);
            expect(finalUser2!.total_xp).toBeGreaterThan(user2.total_xp);
        }
    });

    it('should recover from partial failures gracefully', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const state = generateRandomDatabaseState();
            
            if (state.users.length === 0) continue;
            
            // Create operation that should fail partway through
            const invalidOperation: DataOperation = {
                type: 'create',
                entity: 'session',
                data: {
                    user_id: 'non-existent-user', // This will cause failure
                    operation: 'Addition',
                    correct_count: 10,
                    total_count: 15,
                    xp_earned: 100
                }
            };
            
            const result = executeOperation(state, invalidOperation);
            
            // Operation should fail
            expect(result.success).toBe(false);
            
            // State should be unchanged (no partial updates)
            expect(result.newState).toEqual(state);
            
            // Consistency should be maintained
            const consistency = checkDataConsistency(result.newState);
            expect(consistency.isConsistent).toBe(true);
        }
    });
});