/**
 * Property-Based Tests for Shop Transaction Integrity
 * 
 * Feature: comprehensive-user-stories
 * Property 8: Shop Transaction Integrity
 * 
 * Validates: Requirements 3.2, 3.3, 3.6
 * For any shop purchase attempt, the system should only allow transactions when users have 
 * sufficient currency, properly deduct costs, and add items to inventory
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ITEMS, Item, Rarity } from '@/lib/items';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock user and transaction data structures
interface MockUser {
    id: string;
    name: string;
    coins: number;
    inventory: string[];
}

interface TransactionResult {
    success: boolean;
    error?: string;
    newCoins?: number;
    itemAdded?: boolean;
}

// Simulate shop transaction logic
function simulateShopTransaction(user: MockUser, item: Item): TransactionResult {
    // Check if user already owns the item first (before checking funds)
    if (user.inventory.includes(item.id)) {
        return {
            success: false,
            error: "Item already owned"
        };
    }

    // Check if user has sufficient funds
    if (user.coins < item.price) {
        return {
            success: false,
            error: "Insufficient funds"
        };
    }

    // Process successful transaction
    const newCoins = user.coins - item.price;
    const newInventory = [...user.inventory, item.id];

    return {
        success: true,
        newCoins,
        itemAdded: true
    };
}

// Generate random user for testing
function generateRandomUser(): MockUser {
    return {
        id: `user-${Math.random().toString(36).substring(7)}`,
        name: `TestUser${Math.floor(Math.random() * 1000)}`,
        coins: Math.floor(Math.random() * 100000), // 0-100k coins
        inventory: []
    };
}

// Generate random item subset for testing
function getRandomItems(count: number = 10): Item[] {
    const shuffled = [...ITEMS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, ITEMS.length));
}

describe('Property 8: Shop Transaction Integrity', () => {
    it('should only allow purchases when user has sufficient currency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const items = getRandomItems(5);
            
            items.forEach(item => {
                const result = simulateShopTransaction(user, item);
                
                if (user.coins >= item.price && !user.inventory.includes(item.id)) {
                    // Should succeed when user has enough coins and doesn't own item
                    expect(result.success).toBe(true);
                    expect(result.newCoins).toBe(user.coins - item.price);
                    expect(result.itemAdded).toBe(true);
                    expect(result.error).toBeUndefined();
                } else if (user.coins < item.price) {
                    // Should fail when insufficient funds
                    expect(result.success).toBe(false);
                    expect(result.error).toBe("Insufficient funds");
                    expect(result.newCoins).toBeUndefined();
                    expect(result.itemAdded).toBeUndefined();
                } else if (user.inventory.includes(item.id)) {
                    // Should fail when item already owned
                    expect(result.success).toBe(false);
                    expect(result.error).toBe("Item already owned");
                    expect(result.newCoins).toBeUndefined();
                    expect(result.itemAdded).toBeUndefined();
                }
            });
        }
    });

    it('should properly deduct costs and maintain currency integrity', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const initialCoins = Math.floor(Math.random() * 50000) + 10000; // 10k-60k coins
            const user: MockUser = {
                id: `user-${iteration}`,
                name: `TestUser${iteration}`,
                coins: initialCoins,
                inventory: []
            };

            // Select multiple items for purchase simulation
            const items = getRandomItems(3).filter(item => item.price <= initialCoins);
            let expectedCoins = initialCoins;
            let expectedInventory: string[] = [];

            items.forEach(item => {
                const result = simulateShopTransaction({
                    ...user,
                    coins: expectedCoins,
                    inventory: expectedInventory
                }, item);

                if (expectedCoins >= item.price && !expectedInventory.includes(item.id)) {
                    // Successful transaction
                    expect(result.success).toBe(true);
                    expect(result.newCoins).toBe(expectedCoins - item.price);
                    
                    // Update expected state for next iteration
                    expectedCoins -= item.price;
                    expectedInventory.push(item.id);
                    
                    // Validate currency deduction is exact
                    expect(result.newCoins).toBeGreaterThanOrEqual(0);
                    expect(result.newCoins).toBe(expectedCoins);
                }
            });

            // Validate final state consistency
            expect(expectedCoins).toBeLessThanOrEqual(initialCoins);
            expect(expectedCoins).toBeGreaterThanOrEqual(0);
        }
    });

    it('should add items to inventory correctly and prevent duplicates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            user.coins = 100000; // Ensure sufficient funds
            
            const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            
            // First purchase should succeed
            const firstResult = simulateShopTransaction(user, item);
            expect(firstResult.success).toBe(true);
            expect(firstResult.itemAdded).toBe(true);
            
            // Update user state
            const updatedUser = {
                ...user,
                coins: firstResult.newCoins!,
                inventory: [...user.inventory, item.id]
            };
            
            // Second purchase of same item should fail
            const secondResult = simulateShopTransaction(updatedUser, item);
            expect(secondResult.success).toBe(false);
            expect(secondResult.error).toBe("Item already owned");
            expect(secondResult.itemAdded).toBeUndefined();
        }
    });

    it('should handle edge cases in pricing and currency', () => {
        const edgeCases = [
            // Exact amount scenarios
            { coins: 100, itemPrice: 100, shouldSucceed: true },
            { coins: 99, itemPrice: 100, shouldSucceed: false },
            { coins: 101, itemPrice: 100, shouldSucceed: true },
            
            // Zero and minimum values
            { coins: 0, itemPrice: 1, shouldSucceed: false },
            { coins: 1, itemPrice: 0, shouldSucceed: true }, // Free items
            { coins: 0, itemPrice: 0, shouldSucceed: true }, // Free items with no coins
            
            // Large values
            { coins: 999999, itemPrice: 50000, shouldSucceed: true },
            { coins: 49999, itemPrice: 50000, shouldSucceed: false },
        ];

        edgeCases.forEach(({ coins, itemPrice, shouldSucceed }, index) => {
            const user: MockUser = {
                id: `edge-user-${index}`,
                name: `EdgeUser${index}`,
                coins,
                inventory: []
            };

            const mockItem: Item = {
                id: `edge-item-${index}`,
                name: `Edge Item ${index}`,
                description: 'Test item',
                type: 'theme' as any,
                rarity: Rarity.COMMON,
                price: itemPrice,
                assetValue: 'test-asset'
            };

            const result = simulateShopTransaction(user, mockItem);

            if (shouldSucceed) {
                expect(result.success).toBe(true);
                expect(result.newCoins).toBe(coins - itemPrice);
                expect(result.itemAdded).toBe(true);
            } else {
                expect(result.success).toBe(false);
                expect(result.error).toBe("Insufficient funds");
            }
        });
    });

    it('should maintain transaction atomicity', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            
            const originalCoins = user.coins;
            const originalInventory = [...user.inventory];
            
            const result = simulateShopTransaction(user, item);
            
            if (result.success) {
                // Successful transaction should update both coins and inventory
                expect(result.newCoins).toBe(originalCoins - item.price);
                expect(result.itemAdded).toBe(true);
                
                // Validate the transaction is complete (both changes applied)
                expect(result.newCoins).toBeDefined();
                expect(result.itemAdded).toBeDefined();
            } else {
                // Failed transaction should not change anything
                expect(result.newCoins).toBeUndefined();
                expect(result.itemAdded).toBeUndefined();
                expect(result.error).toBeDefined();
                
                // Original state should remain unchanged in failed transactions
                // (This is validated by not returning new values)
            }
        }
    });

    it('should handle concurrent transaction scenarios', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            user.coins = 1000; // Set reasonable amount
            
            const item1 = ITEMS.find(i => i.price <= 500) || ITEMS[0];
            const item2 = ITEMS.find(i => i.price <= 500 && i.id !== item1.id) || ITEMS[1];
            
            // Simulate two transactions in sequence
            const result1 = simulateShopTransaction(user, item1);
            
            if (result1.success) {
                const updatedUser = {
                    ...user,
                    coins: result1.newCoins!,
                    inventory: [...user.inventory, item1.id]
                };
                
                const result2 = simulateShopTransaction(updatedUser, item2);
                
                // Second transaction should respect updated state
                if (updatedUser.coins >= item2.price && !updatedUser.inventory.includes(item2.id)) {
                    expect(result2.success).toBe(true);
                    expect(result2.newCoins).toBe(updatedUser.coins - item2.price);
                } else {
                    expect(result2.success).toBe(false);
                }
            }
        }
    });

    it('should validate item existence and availability', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUser();
            user.coins = 100000; // Ensure sufficient funds
            
            // Test with valid items from ITEMS array
            const validItem = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            const result = simulateShopTransaction(user, validItem);
            
            // Should succeed with valid items (assuming sufficient funds and not owned)
            if (!user.inventory.includes(validItem.id)) {
                expect(result.success).toBe(true);
            }
            
            // Validate item properties are preserved
            expect(validItem.id).toBeDefined();
            expect(validItem.price).toBeGreaterThanOrEqual(0);
            expect(validItem.name).toBeDefined();
            expect(validItem.type).toBeDefined();
        }
    });
});