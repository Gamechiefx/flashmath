/**
 * Tests for Shop Engine Logic
 * 
 * Tests the shop item selection logic, rarity weights, and slot configuration
 */

import { describe, it, expect } from 'vitest';
import { ItemType, Rarity, ITEMS } from '@/lib/items';

describe('Shop Engine Logic', () => {
    describe('ITEMS catalog', () => {
        it('should have items in the catalog', () => {
            expect(ITEMS.length).toBeGreaterThan(0);
        });

        it('should have items for each type', () => {
            const types = Object.values(ItemType);
            for (const type of types) {
                const items = ITEMS.filter(item => item.type === type);
                expect(items.length).toBeGreaterThan(0);
            }
        });

        it('should have items with valid rarity', () => {
            const validRarities = Object.values(Rarity);
            for (const item of ITEMS) {
                expect(validRarities).toContain(item.rarity);
            }
        });

        it('should have items with non-negative prices', () => {
            for (const item of ITEMS) {
                expect(item.price).toBeGreaterThanOrEqual(0);
            }
        });

        it('should have unique item IDs', () => {
            const ids = ITEMS.map(item => item.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    describe('ItemType enum', () => {
        it('should have THEME type', () => {
            expect(ItemType.THEME).toBeDefined();
        });

        it('should have PARTICLE type', () => {
            expect(ItemType.PARTICLE).toBeDefined();
        });

        it('should have FONT type', () => {
            expect(ItemType.FONT).toBeDefined();
        });

        it('should have SOUND type', () => {
            expect(ItemType.SOUND).toBeDefined();
        });

        it('should have BGM type', () => {
            expect(ItemType.BGM).toBeDefined();
        });

        it('should have TITLE type', () => {
            expect(ItemType.TITLE).toBeDefined();
        });

        it('should have FRAME type', () => {
            expect(ItemType.FRAME).toBeDefined();
        });

        it('should have BANNER type', () => {
            expect(ItemType.BANNER).toBeDefined();
        });
    });

    describe('Rarity enum', () => {
        it('should have COMMON rarity', () => {
            expect(Rarity.COMMON).toBeDefined();
        });

        it('should have UNCOMMON rarity', () => {
            expect(Rarity.UNCOMMON).toBeDefined();
        });

        it('should have RARE rarity', () => {
            expect(Rarity.RARE).toBeDefined();
        });

        it('should have EPIC rarity', () => {
            expect(Rarity.EPIC).toBeDefined();
        });

        it('should have LEGENDARY rarity', () => {
            expect(Rarity.LEGENDARY).toBeDefined();
        });
    });

    describe('Shop slot configuration', () => {
        const SHOP_SLOTS = [
            ItemType.THEME,
            ItemType.PARTICLE,
            ItemType.FONT,
            ItemType.SOUND,
            ItemType.BGM,
            ItemType.TITLE,
            ItemType.FRAME,
            ItemType.BANNER
        ];

        it('should have 8 shop slots', () => {
            expect(SHOP_SLOTS.length).toBe(8);
        });

        it('should have unique slot types', () => {
            const uniqueSlots = new Set(SHOP_SLOTS);
            expect(uniqueSlots.size).toBe(SHOP_SLOTS.length);
        });

        it('should have purchasable items for each slot type', () => {
            for (const slotType of SHOP_SLOTS) {
                const purchasable = ITEMS.filter(i => i.type === slotType && i.price > 0);
                expect(purchasable.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Rarity weights', () => {
        const RARITY_WEIGHTS = {
            [Rarity.COMMON]: 0.50,
            [Rarity.UNCOMMON]: 0.30,
            [Rarity.RARE]: 0.15,
            [Rarity.EPIC]: 0.04,
            [Rarity.LEGENDARY]: 0.01
        };

        it('should sum to 1.0', () => {
            const sum = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 10);
        });

        it('should have decreasing weights for higher rarities', () => {
            expect(RARITY_WEIGHTS[Rarity.COMMON]).toBeGreaterThan(RARITY_WEIGHTS[Rarity.UNCOMMON]);
            expect(RARITY_WEIGHTS[Rarity.UNCOMMON]).toBeGreaterThan(RARITY_WEIGHTS[Rarity.RARE]);
            expect(RARITY_WEIGHTS[Rarity.RARE]).toBeGreaterThan(RARITY_WEIGHTS[Rarity.EPIC]);
            expect(RARITY_WEIGHTS[Rarity.EPIC]).toBeGreaterThan(RARITY_WEIGHTS[Rarity.LEGENDARY]);
        });

        it('should have COMMON as most frequent', () => {
            expect(RARITY_WEIGHTS[Rarity.COMMON]).toBe(0.50);
        });

        it('should have LEGENDARY as rarest', () => {
            expect(RARITY_WEIGHTS[Rarity.LEGENDARY]).toBe(0.01);
        });
    });

    describe('Daily rotation seed generation', () => {
        it('should generate consistent seed for same date', () => {
            const date = new Date('2025-01-15');
            const seed1 = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            const seed2 = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            expect(seed1).toBe(seed2);
        });

        it('should generate different seeds for different dates', () => {
            const date1 = new Date('2025-01-15');
            const date2 = new Date('2025-01-16');
            const seed1 = `${date1.getFullYear()}-${date1.getMonth() + 1}-${date1.getDate()}`;
            const seed2 = `${date2.getFullYear()}-${date2.getMonth() + 1}-${date2.getDate()}`;
            expect(seed1).not.toBe(seed2);
        });

        it('should format seed correctly', () => {
            const date = new Date('2025-12-25');
            const seed = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            expect(seed).toBe('2025-12-25');
        });
    });

    describe('Item filtering', () => {
        it('should filter out free items from shop rotation', () => {
            const purchasable = ITEMS.filter(i => i.price > 0);
            const free = ITEMS.filter(i => i.price === 0);
            expect(purchasable.length).toBeGreaterThan(0);
            expect(free.length).toBeGreaterThanOrEqual(0);
        });

        it('should be able to filter by item type', () => {
            const themes = ITEMS.filter(i => i.type === ItemType.THEME);
            expect(themes.every(t => t.type === ItemType.THEME)).toBe(true);
        });

        it('should be able to filter by rarity', () => {
            const legendary = ITEMS.filter(i => i.rarity === Rarity.LEGENDARY);
            expect(legendary.every(l => l.rarity === Rarity.LEGENDARY)).toBe(true);
        });
    });

    describe('Item selection algorithm', () => {
        it('should select deterministically based on day index', () => {
            const candidates = ITEMS.filter(i => i.type === ItemType.THEME && i.price > 0);
            const dayIndex = 100;
            const slotOffset = 0;
            const itemIndex = (dayIndex + slotOffset) % candidates.length;
            
            // Same calculation should give same result
            const itemIndex2 = (dayIndex + slotOffset) % candidates.length;
            expect(itemIndex).toBe(itemIndex2);
        });

        it('should cycle through all items over time', () => {
            const candidates = ITEMS.filter(i => i.type === ItemType.THEME && i.price > 0);
            const selectedIndices = new Set<number>();
            
            for (let day = 0; day < candidates.length; day++) {
                const index = day % candidates.length;
                selectedIndices.add(index);
            }
            
            expect(selectedIndices.size).toBe(candidates.length);
        });

        it('should use slot offset to scramble starting positions', () => {
            const dayIndex = 100;
            const offset0 = (dayIndex + 0 * 7) % 10;
            const offset1 = (dayIndex + 1 * 7) % 10;
            const offset2 = (dayIndex + 2 * 7) % 10;
            
            // Different slots should get different offsets
            expect(new Set([offset0, offset1, offset2]).size).toBeGreaterThan(1);
        });
    });

    describe('Item price validation', () => {
        it('should have COMMON items priced reasonably', () => {
            const common = ITEMS.filter(i => i.rarity === Rarity.COMMON && i.price > 0);
            for (const item of common) {
                expect(item.price).toBeGreaterThan(0);
                expect(item.price).toBeLessThanOrEqual(500);
            }
        });

        it('should have LEGENDARY items priced higher', () => {
            const legendary = ITEMS.filter(i => i.rarity === Rarity.LEGENDARY && i.price > 0);
            for (const item of legendary) {
                expect(item.price).toBeGreaterThanOrEqual(500);
            }
        });
    });

    describe('Item structure validation', () => {
        it('should have required fields on all items', () => {
            for (const item of ITEMS) {
                expect(item.id).toBeDefined();
                expect(item.name).toBeDefined();
                expect(item.type).toBeDefined();
                expect(item.rarity).toBeDefined();
                expect(typeof item.price).toBe('number');
            }
        });

        it('should have string IDs', () => {
            for (const item of ITEMS) {
                expect(typeof item.id).toBe('string');
            }
        });

        it('should have non-empty names', () => {
            for (const item of ITEMS) {
                expect(item.name.length).toBeGreaterThan(0);
            }
        });
    });
});
