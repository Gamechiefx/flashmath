"use server";

import { getDatabase } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

export async function updateItem(itemId: string, data: { name: string; rarity: string; price: number }) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    try {
        console.log(`[ADMIN] Updating item ${itemId}:`, data);
        const db = getDatabase();

        // Check if item exists
        const existingItem = db.prepare('SELECT id FROM shop_items WHERE id = ?').get(itemId);
        if (!existingItem) return { error: "Item not found" };

        // Update using SQLite
        db.prepare(`
            UPDATE shop_items 
            SET name = ?, rarity = ?, price = ?
            WHERE id = ?
        `).run(data.name, data.rarity, data.price, itemId);

        console.log(`[ADMIN] Successfully updated item ${itemId}`);

        revalidatePath("/shop");
        revalidatePath("/admin");
        revalidatePath("/locker");
        return { success: true };
    } catch (error) {
        console.error("Failed to update item:", error);
        return { error: "Failed to update item" };
    }
}
