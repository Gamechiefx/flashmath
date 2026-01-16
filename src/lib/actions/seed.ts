"use server";

import { getDatabase } from "@/lib/db";
import { ITEMS } from "@/lib/items";
import { revalidatePath } from "next/cache";

export async function forceSeedShop() {
    try {
        const db = getDatabase();
        console.log(`[SEED] Force seeding shop. Static ITEMS count: ${ITEMS.length}`);

        // Run in transaction for performance and safety
        db.transaction(() => {
            // 1. Clear existing shop items
            db.prepare('DELETE FROM shop_items').run();

            // 2. Insert all items from ITEMS array
            const insertItem = db.prepare(`
                INSERT INTO shop_items (id, name, description, type, rarity, price, asset_value)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of ITEMS) {
                insertItem.run(
                    item.id,
                    item.name,
                    item.description,
                    item.type,
                    item.rarity,
                    item.price,
                    item.assetValue
                );
            }
        })();

        console.log(`[SEED] Success. Seeded ${ITEMS.length} items.`);
        revalidatePath("/shop");
        revalidatePath("/admin");
        return { success: true, count: ITEMS.length };
    } catch (e) {
        console.error("[SEED] Failed:", e);
        return { error: "Failed to seed shop items" };
    }
}
