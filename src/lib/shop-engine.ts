
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

const RARITY_WEIGHTS = {
    [Rarity.COMMON]: 0.50,
    [Rarity.UNCOMMON]: 0.30,
    [Rarity.RARE]: 0.15,
    [Rarity.EPIC]: 0.04,
    [Rarity.LEGENDARY]: 0.01
};

export function getDailyShopSelection(): Item[] {
    // 1. Generate Seed from Date (UTC YYYY-MM-DD-HH-mm/5)
    // User requested 5 minute rotation.
    const now = new Date();
    const minutes = Math.floor(now.getUTCMinutes() / 5);
    const seed = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}-${minutes}`;
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

    console.log(`[ShopEngine] Selecting from ${dbItems.length} items. Seed: ${minutes}`);

    const slots = [
        ItemType.THEME,
        ItemType.PARTICLE,
        ItemType.FONT,
        ItemType.SOUND,
        ItemType.BGM,
        ItemType.TITLE,
        ItemType.FRAME
    ];

    slots.forEach((slotType, index) => {
        // Filter items by type from DB list
        const candidates = dbItems.filter(i => i.type === slotType);
        // console.log(`[ShopEngine] Slot ${slotType}: ${candidates.length} candidates`); // Debug log
        if (candidates.length === 0) {
            console.log(`[ShopEngine] No candidates for slot ${slotType}`);
            return;
        }

        // Deterministic Cycle:
        // Use the seed (minutes/5) as an incremental counter.
        // We add an offset based on the slot index so they don't all cycle in sync (if counts are same)
        // Actually, just using rng() gives us a stable random float for this seed.
        // But pure random might repeat.
        // User wants "Cycled". "Cycled" implies A -> B -> C -> A.
        // Let's use the raw time components from the seed construction logic to create a counter.

        const now = new Date();
        const globalCycleIndex = Math.floor(now.getTime() / (5 * 60 * 1000)); // Number of 5-min intervals since Epoch

        // Add a slot-specific offset to scramble the starting positions
        const slotOffset = index * 7;

        // Pick index
        const itemIndex = (globalCycleIndex + slotOffset) % candidates.length;

        selection.push(candidates[itemIndex]);
    });

    return selection;
}
