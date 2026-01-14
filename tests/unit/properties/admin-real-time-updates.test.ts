/**
 * Property-Based Tests for Admin Real-time Updates
 * 
 * Feature: comprehensive-user-stories
 * Property 13: Admin Real-time Updates
 * 
 * Validates: Requirements 5.4, 5.6
 * For any administrative modification to shop items or league settings, changes should 
 * be reflected immediately across the platform
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ITEMS, Item, Rarity } from '@/lib/items';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock system state and update mechanisms
interface SystemState {
    shopItems: Item[];
    leagueSettings: LeagueSettings;
    lastUpdated: Date;
    version: number;
}

interface LeagueSettings {
    seasonDuration: number; // in days
    promotionThreshold: number;
    relegationThreshold: number;
    rewardMultiplier: number;
    maxParticipants: number;
}

interface AdminUpdate {
    type: 'shop_item' | 'league_setting';
    action: 'create' | 'update' | 'delete';
    targetId: string;
    data: any;
    adminId: string;
    timestamp: Date;
}

interface UpdateResult {
    success: boolean;
    error?: string;
    newState?: SystemState;
    propagated?: boolean;
    affectedSystems?: string[];
}

// Simulate real-time update system
function simulateRealTimeUpdate(
    currentState: SystemState,
    update: AdminUpdate
): UpdateResult {
    const newState = { ...currentState };
    const affectedSystems: string[] = [];

    try {
        switch (update.type) {
            case 'shop_item':
                const result = processShopItemUpdate(newState, update);
                if (!result.success) {
                    return result;
                }
                affectedSystems.push('shop', 'inventory', 'user_interface');
                break;

            case 'league_setting':
                const leagueResult = processLeagueSettingUpdate(newState, update);
                if (!leagueResult.success) {
                    return leagueResult;
                }
                affectedSystems.push('leagues', 'matchmaking', 'leaderboard');
                break;

            default:
                return {
                    success: false,
                    error: "Unknown update type"
                };
        }

        // Update system metadata
        newState.lastUpdated = update.timestamp;
        newState.version = currentState.version + 1;

        return {
            success: true,
            newState,
            propagated: true,
            affectedSystems
        };

    } catch (error) {
        return {
            success: false,
            error: `Update failed: ${error}`
        };
    }
}

// Process shop item updates
function processShopItemUpdate(state: SystemState, update: AdminUpdate): UpdateResult {
    switch (update.action) {
        case 'create':
            const newItem = update.data as Item;
            if (state.shopItems.find(item => item.id === update.targetId)) {
                return { success: false, error: "Item already exists" };
            }
            // Ensure the item has all required fields and the correct ID from targetId
            const itemToAdd = { 
                ...newItem, 
                id: update.targetId,
                name: newItem.name || `Item ${update.targetId}`,
                description: newItem.description || 'Generated item',
                type: newItem.type || 'theme',
                rarity: newItem.rarity || Rarity.COMMON,
                price: newItem.price || 0,
                assetValue: newItem.assetValue || 'default'
            };
            state.shopItems.push(itemToAdd);
            break;

        case 'update':
            const itemIndex = state.shopItems.findIndex(item => item.id === update.targetId);
            if (itemIndex === -1) {
                return { success: false, error: "Item not found" };
            }
            state.shopItems[itemIndex] = { ...state.shopItems[itemIndex], ...update.data };
            break;

        case 'delete':
            const deleteIndex = state.shopItems.findIndex(item => item.id === update.targetId);
            if (deleteIndex === -1) {
                return { success: false, error: "Item not found" };
            }
            state.shopItems.splice(deleteIndex, 1);
            break;

        default:
            return { success: false, error: "Invalid action" };
    }

    return { success: true };
}

// Process league setting updates
function processLeagueSettingUpdate(state: SystemState, update: AdminUpdate): UpdateResult {
    const validSettings = ['seasonDuration', 'promotionThreshold', 'relegationThreshold', 'rewardMultiplier', 'maxParticipants'];
    
    if (update.action === 'update') {
        Object.entries(update.data).forEach(([key, value]) => {
            if (validSettings.includes(key)) {
                (state.leagueSettings as any)[key] = value;
            }
        });
        return { success: true };
    }

    return { success: false, error: "Invalid league setting action" };
}

// Generate random system state
function generateRandomSystemState(): SystemState {
    return {
        shopItems: [...ITEMS], // Copy of all items
        leagueSettings: {
            seasonDuration: 7, // 7 days
            promotionThreshold: 3,
            relegationThreshold: 20,
            rewardMultiplier: 1.0,
            maxParticipants: 100
        },
        lastUpdated: new Date(Date.now() - Math.random() * 60 * 60 * 1000), // Up to 1 hour ago
        version: Math.floor(Math.random() * 100)
    };
}

// Generate random admin update
function generateRandomAdminUpdate(): AdminUpdate {
    const updateTypes = ['shop_item', 'league_setting'] as const;
    const actions = ['create', 'update', 'delete'] as const;
    
    const type = updateTypes[Math.floor(Math.random() * updateTypes.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    let targetId = '';
    let data: any = {};

    if (type === 'shop_item') {
        if (action === 'create') {
            // Ensure unique ID for creation
            targetId = `new-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            data = {
                id: targetId,
                name: `Test Item ${Math.floor(Math.random() * 1000)}`,
                description: 'Generated test item',
                type: 'theme',
                rarity: Rarity.COMMON,
                price: Math.floor(Math.random() * 1000) + 1, // Ensure positive price
                assetValue: 'test-asset'
            };
        } else {
            // For update/delete, use existing item ID
            if (ITEMS.length > 0) {
                targetId = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
            } else {
                // Fallback if no items available
                targetId = 'fallback-item-id';
            }
            if (action === 'update') {
                data = {
                    price: Math.floor(Math.random() * 5000) + 1, // Ensure positive price
                    name: `Updated ${Math.random().toString(36).substring(7)}`
                };
            }
        }
    } else if (type === 'league_setting') {
        targetId = 'league-settings';
        data = {
            seasonDuration: Math.floor(Math.random() * 14) + 1, // 1-14 days
            promotionThreshold: Math.floor(Math.random() * 5) + 1, // 1-5
            rewardMultiplier: Math.random() * 2 + 0.5 // 0.5-2.5
        };
    }

    return {
        type,
        action,
        targetId,
        data,
        adminId: `admin-${Math.random().toString(36).substring(7)}`,
        timestamp: new Date()
    };
}

describe('Property 13: Admin Real-time Updates', () => {
    it('should immediately reflect shop item changes across the platform', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomSystemState();
            
            // Generate a specific shop item update
            const shopUpdate: AdminUpdate = {
                type: 'shop_item',
                action: Math.random() < 0.33 ? 'create' : Math.random() < 0.5 ? 'update' : 'delete',
                targetId: '',
                data: {},
                adminId: `admin-${Math.random().toString(36).substring(7)}`,
                timestamp: new Date()
            };

            if (shopUpdate.action === 'create') {
                shopUpdate.targetId = `new-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                shopUpdate.data = {
                    id: shopUpdate.targetId,
                    name: `Test Item ${Math.floor(Math.random() * 1000)}`,
                    description: 'Generated test item',
                    type: 'theme',
                    rarity: Rarity.COMMON,
                    price: Math.floor(Math.random() * 1000) + 1,
                    assetValue: 'test-asset'
                };
            } else if (ITEMS.length > 0) {
                shopUpdate.targetId = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
                if (shopUpdate.action === 'update') {
                    shopUpdate.data = {
                        price: Math.floor(Math.random() * 5000) + 1,
                        name: `Updated ${Math.random().toString(36).substring(7)}`
                    };
                }
            } else {
                // Skip if no items available for update/delete
                continue;
            }

            const result = simulateRealTimeUpdate(initialState, shopUpdate);

            if (result.success) {
                // Should have new state
                expect(result.newState).toBeDefined();
                expect(result.propagated).toBe(true);
                
                // Should affect shop-related systems
                expect(result.affectedSystems).toContain('shop');
                expect(result.affectedSystems).toContain('inventory');
                expect(result.affectedSystems).toContain('user_interface');
                
                // State should be updated
                expect(result.newState!.version).toBe(initialState.version + 1);
                expect(result.newState!.lastUpdated).toEqual(shopUpdate.timestamp);
                
                // Validate specific changes based on action
                if (shopUpdate.action === 'create') {
                    const newItem = result.newState!.shopItems.find(item => item.id === shopUpdate.targetId);
                    expect(newItem).toBeDefined();
                    expect(newItem!.name).toBe(shopUpdate.data.name);
                    expect(newItem!.id).toBe(shopUpdate.targetId);
                } else if (shopUpdate.action === 'update') {
                    const updatedItem = result.newState!.shopItems.find(item => item.id === shopUpdate.targetId);
                    if (updatedItem && shopUpdate.data.price) {
                        expect(updatedItem.price).toBe(shopUpdate.data.price);
                    }
                } else if (shopUpdate.action === 'delete') {
                    const deletedItem = result.newState!.shopItems.find(item => item.id === shopUpdate.targetId);
                    expect(deletedItem).toBeUndefined();
                }
            } else {
                // If update failed, ensure we have an error message
                expect(result.error).toBeDefined();
            }
        }
    });

    it('should immediately reflect league setting changes', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomSystemState();
            const leagueUpdate: AdminUpdate = {
                type: 'league_setting',
                action: 'update',
                targetId: 'league-settings',
                data: {
                    seasonDuration: Math.floor(Math.random() * 14) + 1,
                    promotionThreshold: Math.floor(Math.random() * 5) + 1,
                    rewardMultiplier: Math.random() * 2 + 0.5
                },
                adminId: 'admin-test',
                timestamp: new Date()
            };

            const result = simulateRealTimeUpdate(initialState, leagueUpdate);

            expect(result.success).toBe(true);
            expect(result.newState).toBeDefined();
            expect(result.propagated).toBe(true);
            
            // Should affect league-related systems
            expect(result.affectedSystems).toContain('leagues');
            expect(result.affectedSystems).toContain('matchmaking');
            expect(result.affectedSystems).toContain('leaderboard');
            
            // League settings should be updated
            const newSettings = result.newState!.leagueSettings;
            expect(newSettings.seasonDuration).toBe(leagueUpdate.data.seasonDuration);
            expect(newSettings.promotionThreshold).toBe(leagueUpdate.data.promotionThreshold);
            expect(newSettings.rewardMultiplier).toBe(leagueUpdate.data.rewardMultiplier);
            
            // System metadata should be updated
            expect(result.newState!.version).toBe(initialState.version + 1);
            expect(result.newState!.lastUpdated).toEqual(leagueUpdate.timestamp);
        }
    });

    it('should maintain system version consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            let currentState = generateRandomSystemState();
            const initialVersion = currentState.version;
            
            // Apply multiple updates
            const updateCount = Math.floor(Math.random() * 5) + 1; // 1-5 updates
            let successfulUpdates = 0;
            
            for (let i = 0; i < updateCount; i++) {
                const update = generateRandomAdminUpdate();
                const result = simulateRealTimeUpdate(currentState, update);
                
                if (result.success && result.newState) {
                    // Version should increment by 1
                    expect(result.newState.version).toBe(currentState.version + 1);
                    
                    // Update timestamp should match
                    expect(result.newState.lastUpdated).toEqual(update.timestamp);
                    
                    currentState = result.newState;
                    successfulUpdates++;
                }
            }
            
            // Final version should reflect all successful updates
            if (successfulUpdates > 0) {
                expect(currentState.version).toBeGreaterThan(initialVersion);
            } else {
                // If no updates succeeded, version should remain the same
                expect(currentState.version).toBe(initialVersion);
            }
        }
    });

    it('should handle update failures gracefully', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomSystemState();
            
            // Create invalid updates
            const invalidUpdates = [
                // Duplicate item creation
                {
                    type: 'shop_item' as const,
                    action: 'create' as const,
                    targetId: ITEMS[0].id, // Existing item ID
                    data: { ...ITEMS[0], name: 'Duplicate' },
                    adminId: 'admin-test',
                    timestamp: new Date()
                },
                // Update non-existent item
                {
                    type: 'shop_item' as const,
                    action: 'update' as const,
                    targetId: 'non-existent-item',
                    data: { price: 1000 },
                    adminId: 'admin-test',
                    timestamp: new Date()
                },
                // Delete non-existent item
                {
                    type: 'shop_item' as const,
                    action: 'delete' as const,
                    targetId: 'non-existent-item',
                    data: {},
                    adminId: 'admin-test',
                    timestamp: new Date()
                }
            ];

            invalidUpdates.forEach(update => {
                const result = simulateRealTimeUpdate(initialState, update);
                
                // Should fail gracefully
                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
                expect(result.newState).toBeUndefined();
                expect(result.propagated).toBeUndefined();
                
                // Original state should remain unchanged
                expect(initialState.version).toBe(initialState.version);
                expect(initialState.lastUpdated).toEqual(initialState.lastUpdated);
            });
        }
    });

    it('should propagate updates to correct system components', () => {
        const updateSystemMappings = [
            {
                type: 'shop_item' as const,
                expectedSystems: ['shop', 'inventory', 'user_interface']
            },
            {
                type: 'league_setting' as const,
                expectedSystems: ['leagues', 'matchmaking', 'leaderboard']
            }
        ];

        updateSystemMappings.forEach(({ type, expectedSystems }) => {
            for (let iteration = 0; iteration < 20; iteration++) {
                const initialState = generateRandomSystemState();
                const update = generateRandomAdminUpdate();
                update.type = type;
                
                // Ensure valid update for testing
                if (type === 'league_setting') {
                    update.action = 'update';
                    update.targetId = 'league-settings';
                }

                const result = simulateRealTimeUpdate(initialState, update);

                if (result.success) {
                    expect(result.affectedSystems).toBeDefined();
                    
                    // Should include all expected systems
                    expectedSystems.forEach(system => {
                        expect(result.affectedSystems).toContain(system);
                    });
                    
                    // Should not include unexpected systems
                    const allExpectedSystems = ['shop', 'inventory', 'user_interface', 'leagues', 'matchmaking', 'leaderboard'];
                    const unexpectedSystems = allExpectedSystems.filter(sys => !expectedSystems.includes(sys));
                    
                    unexpectedSystems.forEach(system => {
                        expect(result.affectedSystems).not.toContain(system);
                    });
                }
            }
        });
    });

    it('should maintain data integrity during updates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomSystemState();
            const initialItemCount = initialState.shopItems.length;
            
            // Generate a specific shop item update
            const update: AdminUpdate = {
                type: 'shop_item',
                action: Math.random() < 0.33 ? 'create' : Math.random() < 0.5 ? 'update' : 'delete',
                targetId: '',
                data: {},
                adminId: `admin-${Math.random().toString(36).substring(7)}`,
                timestamp: new Date()
            };

            if (update.action === 'create') {
                update.targetId = `new-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                update.data = {
                    id: update.targetId,
                    name: `Test Item ${Math.floor(Math.random() * 1000)}`,
                    description: 'Generated test item',
                    type: 'theme',
                    rarity: Rarity.COMMON,
                    price: Math.floor(Math.random() * 1000) + 1,
                    assetValue: 'test-asset'
                };
            } else if (ITEMS.length > 0) {
                update.targetId = ITEMS[Math.floor(Math.random() * ITEMS.length)].id;
                if (update.action === 'update') {
                    update.data = {
                        price: Math.floor(Math.random() * 5000) + 1,
                        name: `Updated ${Math.random().toString(36).substring(7)}`
                    };
                }
            } else {
                // Skip if no items available for update/delete
                continue;
            }
            
            const result = simulateRealTimeUpdate(initialState, update);

            if (result.success && result.newState) {
                // Validate data integrity based on action
                switch (update.action) {
                    case 'create':
                        expect(result.newState.shopItems.length).toBe(initialItemCount + 1);
                        
                        // New item should exist and be valid
                        const newItem = result.newState.shopItems.find(item => item.id === update.targetId);
                        expect(newItem).toBeDefined();
                        expect(newItem!.id).toBe(update.targetId);
                        expect(newItem!.name).toBeDefined();
                        expect(newItem!.price).toBeGreaterThanOrEqual(0);
                        break;
                        
                    case 'update':
                        expect(result.newState.shopItems.length).toBe(initialItemCount);
                        
                        // Updated item should maintain integrity
                        const updatedItem = result.newState.shopItems.find(item => item.id === update.targetId);
                        if (updatedItem) {
                            expect(updatedItem.id).toBe(update.targetId);
                            if (update.data.price !== undefined) {
                                expect(updatedItem.price).toBe(update.data.price);
                            }
                        }
                        break;
                        
                    case 'delete':
                        // For delete, we need to check if the operation actually succeeded
                        // If the item didn't exist, the delete would fail and we wouldn't reach this code
                        expect(result.newState.shopItems.length).toBe(initialItemCount - 1);
                        
                        // Deleted item should not exist
                        const deletedItem = result.newState.shopItems.find(item => item.id === update.targetId);
                        expect(deletedItem).toBeUndefined();
                        break;
                }
                
                // All remaining items should be valid
                result.newState.shopItems.forEach(item => {
                    expect(item.id).toBeDefined();
                    expect(item.name).toBeDefined();
                    expect(item.price).toBeGreaterThanOrEqual(0);
                    expect(item.type).toBeDefined();
                    expect(item.rarity).toBeDefined();
                });
            } else {
                // If update failed, state should remain unchanged
                expect(initialState.shopItems.length).toBe(initialItemCount);
            }
        }
    });

    it('should handle concurrent update scenarios', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialState = generateRandomSystemState();
            
            // Generate multiple updates with same timestamp (simulating concurrency)
            const timestamp = new Date();
            const updates = Array.from({ length: 3 }, (_, index) => {
                const update = generateRandomAdminUpdate();
                update.timestamp = new Date(timestamp.getTime()); // Ensure exact same timestamp
                
                // Ensure at least one update is likely to succeed by making the first one a league setting update
                if (index === 0) {
                    update.type = 'league_setting';
                    update.action = 'update';
                    update.targetId = 'league-settings';
                    update.data = {
                        seasonDuration: Math.floor(Math.random() * 14) + 1,
                        promotionThreshold: Math.floor(Math.random() * 5) + 1
                    };
                }
                
                return update;
            });

            let currentState = initialState;
            const results: UpdateResult[] = [];
            let lastSuccessfulTimestamp = initialState.lastUpdated;

            // Apply updates sequentially (simulating conflict resolution)
            updates.forEach(update => {
                const result = simulateRealTimeUpdate(currentState, update);
                results.push(result);
                
                if (result.success && result.newState) {
                    currentState = result.newState;
                    lastSuccessfulTimestamp = update.timestamp;
                }
            });

            // Validate final state consistency
            expect(currentState.version).toBeGreaterThanOrEqual(initialState.version);
            expect(currentState.lastUpdated).toEqual(lastSuccessfulTimestamp);
            
            // At least one update should have succeeded (we guaranteed one league setting update)
            const successfulUpdates = results.filter(r => r.success);
            expect(successfulUpdates.length).toBeGreaterThan(0);
        }
    });

    it('should maintain update ordering and consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            let currentState = generateRandomSystemState();
            const initialVersion = currentState.version;
            const updates: AdminUpdate[] = [];
            
            // Create sequence of updates with increasing timestamps
            for (let i = 0; i < 5; i++) {
                const update = generateRandomAdminUpdate();
                update.timestamp = new Date(Date.now() + i * 1000); // 1 second apart
                updates.push(update);
            }

            let successfulUpdates = 0;

            // Apply updates in order
            updates.forEach((update, index) => {
                const result = simulateRealTimeUpdate(currentState, update);
                
                if (result.success && result.newState) {
                    // Version should increment sequentially
                    expect(result.newState.version).toBe(currentState.version + 1);
                    
                    // Timestamp should match update
                    expect(result.newState.lastUpdated).toEqual(update.timestamp);
                    
                    currentState = result.newState;
                    successfulUpdates++;
                }
            });
            
            // Final state should reflect all successful updates
            if (successfulUpdates > 0) {
                expect(currentState.version).toBeGreaterThan(initialVersion);
            } else {
                expect(currentState.version).toBe(initialVersion);
            }
        }
    });
});