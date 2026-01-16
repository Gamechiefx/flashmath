
import { Item, ItemType, Rarity, ITEMS } from "./items";
import seedrandom from "seedrandom";
// Import db query logic - we need to read from the live DB now
import { loadData, initSchema } from "./db";

// Pricing/Rarity Weights for Selection
// We want to ensure the shop has a mix of items.
// Daily Shop Layout:
// 1. Theme Slot
// 2. Particle Slot
// 3. Font Slot
// 4. Sound Slot
// 5. BGM Slot
// 6. Wildcard (Title or Frame)

 
const _RARITY_WEIGHTS = {
    [Rarity.COMMON]: 0.50,
    [Rarity.UNCOMMON]: 0.30,
    [Rarity.RARE]: 0.15,
    [Rarity.EPIC]: 0.04,
    [Rarity.LEGENDARY]: 0.01
};

export function getDailyShopSelection(): Item[] {
    // 1. Generate Seed from Date (Eastern Time YYYY-MM-DD)
    // Shop rotates daily at midnight Eastern timezone.
    const now = new Date();

    // Convert to Eastern Time
    const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const seed = `${eastern.getFullYear()}-${eastern.getMonth() + 1}-${eastern.getDate()}`;
    const rng = seedrandom(seed);

    // 2. Select Items: One per Category, Cycling through available items
    // "Ensure ALL items get cycled" means we shouldn't just pick random. 
    // We should pick (Seed % Length) to deterministically walk through the list.

    const selection: Item[] = [];

    // --- CHANGED: Fetch from DB instead of static ITEMS ---
    const db = loadData();
    let dbItems = db.shop_items as Item[];

    // Fallback if DB is empty (shouldn't happen with initSchema, but safety first)
    if (!dbItems || dbItems.length === 0) {
        console.warn("[ShopEngine] DB items empty. Attempting to seed...");
        initSchema(); // Force seed
        const freshDb = loadData(); // Reload
        dbItems = freshDb.shop_items as Item[];

        // Final fallback if still empty
        if (!dbItems || dbItems.length === 0) {
            console.warn("[ShopEngine] Seeding failed, using static fallback.");
            dbItems = ITEMS;
        }
    }

    // Calculate day index for cycling (days since epoch)
    const dayIndex = Math.floor(eastern.getTime() / (24 * 60 * 60 * 1000));
    console.log(`[ShopEngine] Selecting from ${dbItems.length} items. Day: ${seed}`);

    const slots = [
        ItemType.THEME,
        ItemType.PARTICLE,
        ItemType.FONT,
        ItemType.SOUND,
        ItemType.BGM,
        ItemType.TITLE,
        ItemType.FRAME,
        ItemType.BANNER
    ];

    slots.forEach((slotType, index) => {
        // Filter items by type from DB list
        // Exclude items with price 0 (achievement-only titles)
        const candidates = dbItems.filter(i => i.type === slotType && i.price > 0);
        if (candidates.length === 0) {
            console.log(`[ShopEngine] No candidates for slot ${slotType}`);
            return;
        }

        // Deterministic Daily Cycle:
        // Use the day index to cycle through items
        // Add a slot-specific offset to scramble the starting positions
        const slotOffset = index * 7;

        // Pick index
        const itemIndex = (dayIndex + slotOffset) % candidates.length;

        selection.push(candidates[itemIndex]);
    });

    return selection;
}
