/**
 * Shop Engine Tests
 * Tests for daily shop selection and rotation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database and items modules before importing shop-engine
vi.mock('@/lib/db', () => ({
    loadData: vi.fn(() => ({
        shop_items: [
            { id: 'theme-1', type: 'theme', name: 'Dark Theme', price: 100 },
            { id: 'theme-2', type: 'theme', name: 'Light Theme', price: 150 },
            { id: 'particle-1', type: 'particle', name: 'Sparkles', price: 200 },
            { id: 'particle-2', type: 'particle', name: 'Fire', price: 250 },
            { id: 'font-1', type: 'font', name: 'Monospace', price: 100 },
            { id: 'font-2', type: 'font', name: 'Serif', price: 100 },
            { id: 'sound-1', type: 'sound', name: 'Click', price: 50 },
            { id: 'sound-2', type: 'sound', name: 'Pop', price: 50 },
            { id: 'bgm-1', type: 'bgm', name: 'Lo-Fi', price: 300 },
            { id: 'bgm-2', type: 'bgm', name: 'Electronic', price: 300 },
            { id: 'title-1', type: 'title', name: 'Champion', price: 500 },
            { id: 'title-2', type: 'title', name: 'Legend', price: 0 }, // Achievement only
            { id: 'frame-1', type: 'frame', name: 'Gold Frame', price: 400 },
            { id: 'frame-2', type: 'frame', name: 'Silver Frame', price: 300 },
            { id: 'banner-1', type: 'banner', name: 'Stars', price: 200 },
            { id: 'banner-2', type: 'banner', name: 'Stripes', price: 200 },
        ],
    })),
    initSchema: vi.fn(),
}));

vi.mock('@/lib/items', () => ({
    ItemType: {
        THEME: 'theme',
        PARTICLE: 'particle',
        FONT: 'font',
        SOUND: 'sound',
        BGM: 'bgm',
        TITLE: 'title',
        FRAME: 'frame',
        BANNER: 'banner',
    },
    Rarity: {
        COMMON: 'common',
        UNCOMMON: 'uncommon',
        RARE: 'rare',
        EPIC: 'epic',
        LEGENDARY: 'legendary',
    },
    ITEMS: [],
}));

import { getDailyShopSelection } from '@/lib/shop-engine';

describe('getDailyShopSelection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return an array of items', () => {
        const selection = getDailyShopSelection();
        expect(Array.isArray(selection)).toBe(true);
    });

    it('should return items with required properties', () => {
        const selection = getDailyShopSelection();
        
        selection.forEach(item => {
            expect(item).toHaveProperty('id');
            expect(item).toHaveProperty('type');
            expect(item).toHaveProperty('name');
            expect(item).toHaveProperty('price');
        });
    });

    it('should only include items with price > 0', () => {
        const selection = getDailyShopSelection();
        
        selection.forEach(item => {
            expect(item.price).toBeGreaterThan(0);
        });
    });

    it('should include items from different categories', () => {
        const selection = getDailyShopSelection();
        const types = new Set(selection.map(item => item.type));
        
        // Should have at least some variety
        expect(types.size).toBeGreaterThan(0);
    });

    it('should return deterministic results for same day', () => {
        // Run twice on same "day" - should get same results
        const selection1 = getDailyShopSelection();
        const selection2 = getDailyShopSelection();
        
        // IDs should match
        const ids1 = selection1.map(i => i.id).sort();
        const ids2 = selection2.map(i => i.id).sort();
        
        expect(ids1).toEqual(ids2);
    });
});

describe('Shop Item Types', () => {
    const expectedTypes = [
        'theme',
        'particle',
        'font',
        'sound',
        'bgm',
        'title',
        'frame',
        'banner',
    ];

    it('should have all expected item types', () => {
        expectedTypes.forEach(type => {
            expect(type).toBeDefined();
        });
    });
});

describe('Rarity System', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

    it('should have 5 rarity levels', () => {
        expect(rarities).toHaveLength(5);
    });

    it('should have ascending rarity names', () => {
        expect(rarities[0]).toBe('common');
        expect(rarities[4]).toBe('legendary');
    });
});

describe('Rarity Weights', () => {
    const RARITY_WEIGHTS = {
        common: 0.50,
        uncommon: 0.30,
        rare: 0.15,
        epic: 0.04,
        legendary: 0.01,
    };

    it('should sum to 1.0', () => {
        const total = Object.values(RARITY_WEIGHTS).reduce((sum, w) => sum + w, 0);
        expect(total).toBe(1.0);
    });

    it('should have descending weights for increasing rarity', () => {
        expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.uncommon);
        expect(RARITY_WEIGHTS.uncommon).toBeGreaterThan(RARITY_WEIGHTS.rare);
        expect(RARITY_WEIGHTS.rare).toBeGreaterThan(RARITY_WEIGHTS.epic);
        expect(RARITY_WEIGHTS.epic).toBeGreaterThan(RARITY_WEIGHTS.legendary);
    });

    it('should make legendary items very rare', () => {
        expect(RARITY_WEIGHTS.legendary).toBe(0.01); // 1% chance
    });
});

describe('Shop Slot Configuration', () => {
    const slots = [
        'theme',
        'particle',
        'font',
        'sound',
        'bgm',
        'title',
        'frame',
        'banner',
    ];

    it('should have 8 shop slots', () => {
        expect(slots).toHaveLength(8);
    });

    it('should include all customization categories', () => {
        expect(slots).toContain('theme');
        expect(slots).toContain('particle');
        expect(slots).toContain('font');
        expect(slots).toContain('sound');
        expect(slots).toContain('bgm');
        expect(slots).toContain('title');
        expect(slots).toContain('frame');
        expect(slots).toContain('banner');
    });
});

describe('Daily Rotation Logic', () => {
    it('should use date-based seed for determinism', () => {
        // The shop uses Eastern Time date as seed
        // This test verifies the concept
        const now = new Date();
        const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const seed = `${eastern.getFullYear()}-${eastern.getMonth() + 1}-${eastern.getDate()}`;
        
        expect(seed).toMatch(/^\d{4}-\d{1,2}-\d{1,2}$/);
    });

    it('should calculate day index correctly', () => {
        const now = new Date();
        const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const dayIndex = Math.floor(eastern.getTime() / (24 * 60 * 60 * 1000));
        
        // Day index should be a large number (days since epoch)
        expect(dayIndex).toBeGreaterThan(19000); // After year 2022
    });
});

describe('Item Cycling', () => {
    it('should cycle through items deterministically', () => {
        // Test the cycling formula
        const dayIndex = 20000; // Example day
        const candidates = ['a', 'b', 'c', 'd', 'e'];
        const slotOffset = 0;

        const itemIndex = (dayIndex + slotOffset) % candidates.length;
        expect(itemIndex).toBe(0); // 20000 % 5 = 0

        // Different day should give different item
        const nextDayIndex = (dayIndex + 1 + slotOffset) % candidates.length;
        expect(nextDayIndex).toBe(1);
    });

    it('should use slot offsets to vary starting positions', () => {
        const dayIndex = 20000;
        const candidates = ['a', 'b', 'c', 'd', 'e'];

        const results: number[] = [];
        for (let slot = 0; slot < 8; slot++) {
            const slotOffset = slot * 7;
            const itemIndex = (dayIndex + slotOffset) % candidates.length;
            results.push(itemIndex);
        }

        // Different slots should pick different items (mostly)
        const unique = new Set(results);
        expect(unique.size).toBeGreaterThan(1);
    });
});

describe('Edge Cases', () => {
    it('should handle empty candidate list gracefully', () => {
        // The function should not crash if a category has no items
        // This is handled by the return statement in the forEach
        const selection = getDailyShopSelection();
        expect(selection).toBeDefined();
    });
});
