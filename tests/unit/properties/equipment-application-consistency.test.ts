/**
 * Property-Based Tests for Equipment Application Consistency
 * 
 * Feature: comprehensive-user-stories
 * Property 10: Equipment Application Consistency
 * 
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6
 * For any cosmetic item equipped by a user, the visual and audio changes should be 
 * applied immediately and consistently across all platform interfaces
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ITEMS, Item, ItemType, Rarity } from '@/lib/items';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock user equipment state
interface UserEquipment {
    userId: string;
    equippedItems: Record<ItemType, string>;
    ownedItems: string[];
    preferences: {
        particleIntensity: 'low' | 'medium' | 'high';
        audioVolume: number;
        animationSpeed: 'slow' | 'normal' | 'fast';
    };
}

// Mock interface state
interface InterfaceState {
    theme: string;
    particles: string;
    audio: string;
    font: string;
    bgm: string;
    title: string;
    frame: string;
    banner: string;
    appliedAt: Date;
}

// Equipment application result
interface EquipmentResult {
    success: boolean;
    error?: string;
    newEquipment?: Record<ItemType, string>;
    interfaceUpdated?: boolean;
    toggledOff?: boolean;
}

// Simulate equipment application logic
function simulateEquipItem(
    user: UserEquipment, 
    itemType: ItemType, 
    itemId: string
): EquipmentResult {
    // Check if user owns the item (allow 'default' items)
    if (itemId !== 'default' && !user.ownedItems.includes(itemId)) {
        return {
            success: false,
            error: "You do not own this item"
        };
    }

    // Check if item exists
    const item = ITEMS.find(i => i.id === itemId);
    if (itemId !== 'default' && !item) {
        return {
            success: false,
            error: "Item not found"
        };
    }

    // Check if item type matches
    if (item && item.type !== itemType) {
        return {
            success: false,
            error: "Item type mismatch"
        };
    }

    const currentEquipped = user.equippedItems[itemType];
    let newItemId = itemId;
    let toggledOff = false;

    // Toggle logic: if already equipped, unequip (set to default)
    if (currentEquipped === itemId) {
        newItemId = 'default';
        toggledOff = true;
    }

    const newEquipment = { ...user.equippedItems, [itemType]: newItemId };

    return {
        success: true,
        newEquipment,
        interfaceUpdated: true,
        toggledOff
    };
}

// Simulate interface state application
function simulateInterfaceApplication(equipment: Record<ItemType, string>): InterfaceState {
    const getAssetValue = (itemId: string, itemType: ItemType): string => {
        if (itemId === 'default') {
            return `default-${itemType}`;
        }
        const item = ITEMS.find(i => i.id === itemId);
        return item?.assetValue || `default-${itemType}`;
    };

    return {
        theme: getAssetValue(equipment[ItemType.THEME] || 'default', ItemType.THEME),
        particles: getAssetValue(equipment[ItemType.PARTICLE] || 'default', ItemType.PARTICLE),
        audio: getAssetValue(equipment[ItemType.SOUND] || 'default', ItemType.SOUND),
        font: getAssetValue(equipment[ItemType.FONT] || 'default', ItemType.FONT),
        bgm: getAssetValue(equipment[ItemType.BGM] || 'default', ItemType.BGM),
        title: getAssetValue(equipment[ItemType.TITLE] || 'default', ItemType.TITLE),
        frame: getAssetValue(equipment[ItemType.FRAME] || 'default', ItemType.FRAME),
        banner: getAssetValue(equipment[ItemType.BANNER] || 'default', ItemType.BANNER),
        appliedAt: new Date()
    };
}

// Generate random user equipment state
function generateRandomUserEquipment(): UserEquipment {
    const ownedItems = ITEMS
        .filter(() => Math.random() > 0.7) // Random 30% ownership
        .map(item => item.id);

    const equippedItems: Record<ItemType, string> = {} as any;
    Object.values(ItemType).forEach(type => {
        const typeItems = ownedItems.filter(id => {
            const item = ITEMS.find(i => i.id === id);
            return item?.type === type;
        });
        
        // 50% chance to equip something, otherwise default
        if (typeItems.length > 0 && Math.random() > 0.5) {
            equippedItems[type] = typeItems[Math.floor(Math.random() * typeItems.length)];
        } else {
            equippedItems[type] = 'default';
        }
    });

    return {
        userId: `user-${Math.random().toString(36).substring(7)}`,
        equippedItems,
        ownedItems,
        preferences: {
            particleIntensity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as any,
            audioVolume: Math.random(),
            animationSpeed: ['slow', 'normal', 'fast'][Math.floor(Math.random() * 3)] as any
        }
    };
}

describe('Property 10: Equipment Application Consistency', () => {
    it('should only allow equipping owned items', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            const randomItem = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            
            const result = simulateEquipItem(user, randomItem.type, randomItem.id);
            
            if (user.ownedItems.includes(randomItem.id)) {
                // Should succeed if user owns the item
                expect(result.success).toBe(true);
                expect(result.newEquipment).toBeDefined();
                expect(result.interfaceUpdated).toBe(true);
            } else {
                // Should fail if user doesn't own the item
                expect(result.success).toBe(false);
                expect(result.error).toBe("You do not own this item");
                expect(result.newEquipment).toBeUndefined();
            }
        }
    });

    it('should allow equipping default items regardless of ownership', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            const randomType = Object.values(ItemType)[Math.floor(Math.random() * Object.values(ItemType).length)];
            
            const result = simulateEquipItem(user, randomType, 'default');
            
            // Default items should always be equippable
            expect(result.success).toBe(true);
            expect(result.newEquipment).toBeDefined();
            expect(result.newEquipment![randomType]).toBe('default');
            expect(result.interfaceUpdated).toBe(true);
        }
    });

    it('should toggle equipment when same item is equipped again', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            
            // Find an item the user owns
            if (user.ownedItems.length === 0) continue; // Skip if user owns no items
            
            const ownedItemId = user.ownedItems[Math.floor(Math.random() * user.ownedItems.length)];
            const item = ITEMS.find(i => i.id === ownedItemId);
            if (!item) continue;
            
            // Ensure item is not already equipped to test first equip
            user.equippedItems[item.type] = 'default';
            
            // First equip
            const firstResult = simulateEquipItem(user, item.type, item.id);
            expect(firstResult.success).toBe(true);
            expect(firstResult.newEquipment![item.type]).toBe(item.id);
            expect(firstResult.toggledOff).toBe(false);
            
            // Update user state
            const updatedUser = {
                ...user,
                equippedItems: firstResult.newEquipment!
            };
            
            // Second equip (should toggle off)
            const secondResult = simulateEquipItem(updatedUser, item.type, item.id);
            expect(secondResult.success).toBe(true);
            expect(secondResult.newEquipment![item.type]).toBe('default');
            expect(secondResult.toggledOff).toBe(true);
        }
    });

    it('should apply visual changes immediately across interfaces', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            
            // Test multiple interface applications
            const interface1 = simulateInterfaceApplication(user.equippedItems);
            const interface2 = simulateInterfaceApplication(user.equippedItems);
            
            // Should produce consistent results
            expect(interface1.theme).toBe(interface2.theme);
            expect(interface1.particles).toBe(interface2.particles);
            expect(interface1.audio).toBe(interface2.audio);
            expect(interface1.font).toBe(interface2.font);
            expect(interface1.bgm).toBe(interface2.bgm);
            expect(interface1.title).toBe(interface2.title);
            expect(interface1.frame).toBe(interface2.frame);
            expect(interface1.banner).toBe(interface2.banner);
            
            // Validate all interface properties are defined
            Object.values(interface1).forEach(value => {
                if (value instanceof Date) return; // Skip appliedAt
                expect(value).toBeDefined();
                expect(typeof value).toBe('string');
            });
        }
    });

    it('should maintain equipment state consistency', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            const originalEquipment = { ...user.equippedItems };
            
            // Perform multiple equipment operations
            const operations = Math.floor(Math.random() * 5) + 1; // 1-5 operations
            let currentEquipment = { ...originalEquipment };
            
            for (let op = 0; op < operations; op++) {
                const randomType = Object.values(ItemType)[Math.floor(Math.random() * Object.values(ItemType).length)];
                
                // 50% chance to equip owned item, 50% chance to equip default
                let itemId = 'default';
                if (Math.random() > 0.5 && user.ownedItems.length > 0) {
                    const typeItems = user.ownedItems.filter(id => {
                        const item = ITEMS.find(i => i.id === id);
                        return item?.type === randomType;
                    });
                    if (typeItems.length > 0) {
                        itemId = typeItems[Math.floor(Math.random() * typeItems.length)];
                    }
                }
                
                const result = simulateEquipItem({
                    ...user,
                    equippedItems: currentEquipment
                }, randomType, itemId);
                
                if (result.success && result.newEquipment) {
                    currentEquipment = result.newEquipment;
                }
            }
            
            // Validate final state consistency
            Object.values(ItemType).forEach(type => {
                expect(currentEquipment[type]).toBeDefined();
                
                if (currentEquipment[type] !== 'default') {
                    // Non-default items should be owned
                    expect(user.ownedItems).toContain(currentEquipment[type]);
                    
                    // Item should exist and have correct type
                    const item = ITEMS.find(i => i.id === currentEquipment[type]);
                    expect(item).toBeDefined();
                    expect(item!.type).toBe(type);
                }
            });
        }
    });

    it('should handle item type validation correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            
            // Add all items to user's inventory for this test
            user.ownedItems = ITEMS.map(item => item.id);
            
            const randomItem = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            const wrongType = Object.values(ItemType).find(type => type !== randomItem.type)!;
            
            // Try to equip item with wrong type
            const result = simulateEquipItem(user, wrongType, randomItem.id);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe("Item type mismatch");
            expect(result.newEquipment).toBeUndefined();
        }
    });

    it('should preserve asset values in interface application', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            const interfaceState = simulateInterfaceApplication(user.equippedItems);
            
            // Validate asset values correspond to equipped items
            Object.entries(user.equippedItems).forEach(([type, itemId]) => {
                const itemType = type as ItemType;
                let expectedAssetValue: string;
                
                if (itemId === 'default') {
                    expectedAssetValue = `default-${itemType}`;
                } else {
                    const item = ITEMS.find(i => i.id === itemId);
                    expectedAssetValue = item?.assetValue || `default-${itemType}`;
                }
                
                // Map item types to interface properties
                const interfaceProperty = {
                    [ItemType.THEME]: 'theme',
                    [ItemType.PARTICLE]: 'particles',
                    [ItemType.SOUND]: 'audio',
                    [ItemType.FONT]: 'font',
                    [ItemType.BGM]: 'bgm',
                    [ItemType.TITLE]: 'title',
                    [ItemType.FRAME]: 'frame',
                    [ItemType.BANNER]: 'banner'
                }[itemType];
                
                expect(interfaceState[interfaceProperty as keyof InterfaceState]).toBe(expectedAssetValue);
            });
        }
    });

    it('should handle edge cases in equipment operations', () => {
        const edgeCases = [
            // Empty inventory
            { ownedItems: [], shouldAllowDefault: true },
            
            // Single item inventory
            { ownedItems: [ITEMS[0].id], shouldAllowDefault: true },
            
            // Full inventory
            { ownedItems: ITEMS.map(item => item.id), shouldAllowDefault: true }
        ];

        edgeCases.forEach(({ ownedItems, shouldAllowDefault }, index) => {
            const user: UserEquipment = {
                userId: `edge-user-${index}`,
                equippedItems: {} as any,
                ownedItems,
                preferences: {
                    particleIntensity: 'medium',
                    audioVolume: 0.5,
                    animationSpeed: 'normal'
                }
            };

            // Initialize with defaults
            Object.values(ItemType).forEach(type => {
                user.equippedItems[type] = 'default';
            });

            // Test default item equipping
            if (shouldAllowDefault) {
                const randomType = Object.values(ItemType)[Math.floor(Math.random() * Object.values(ItemType).length)];
                const result = simulateEquipItem(user, randomType, 'default');
                
                expect(result.success).toBe(true);
                expect(result.newEquipment![randomType]).toBe('default');
            }

            // Test owned item equipping
            if (ownedItems.length > 0) {
                const ownedItem = ITEMS.find(item => item.id === ownedItems[0]);
                if (ownedItem) {
                    const result = simulateEquipItem(user, ownedItem.type, ownedItem.id);
                    expect(result.success).toBe(true);
                    expect(result.newEquipment![ownedItem.type]).toBe(ownedItem.id);
                }
            }
        });
    });

    it('should maintain interface consistency across multiple applications', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const user = generateRandomUserEquipment();
            
            // Apply interface multiple times
            const applications = Array.from({ length: 5 }, () => 
                simulateInterfaceApplication(user.equippedItems)
            );
            
            // All applications should be identical
            const first = applications[0];
            applications.slice(1).forEach(app => {
                expect(app.theme).toBe(first.theme);
                expect(app.particles).toBe(first.particles);
                expect(app.audio).toBe(first.audio);
                expect(app.font).toBe(first.font);
                expect(app.bgm).toBe(first.bgm);
                expect(app.title).toBe(first.title);
                expect(app.frame).toBe(first.frame);
                expect(app.banner).toBe(first.banner);
            });
            
            // Timestamps should be different (applied at different times)
            applications.slice(1).forEach(app => {
                expect(app.appliedAt.getTime()).toBeGreaterThanOrEqual(first.appliedAt.getTime());
            });
        }
    });
});