"use server";

import { execute, loadData, saveData } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

// We should probably check if user is admin, but for now we'll just check if they are logged in.
// In a real app we'd have a role field.

export async function updateItem(itemId: string, data: { name: string; rarity: string; price: number }) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };

    try {
        console.log(`[ADMIN] Updating item ${itemId}:`, data);
        const db = loadData();

        const existingItem = db.shop_items.find((i: any) => i.id === itemId);
        if (!existingItem) return { error: "Item not found" };

        // STATIC ID UPDATE Strategy
        // We only update the properties, NEVER the ID.
        existingItem.name = data.name;
        existingItem.rarity = data.rarity;
        existingItem.price = data.price;

        saveData(); // Persist to JSON

        revalidatePath("/shop");
        revalidatePath("/admin");
        return { success: true };
    } catch (error) {
        console.error("Failed to update item:", error);
        return { error: "Failed to update item" };
    }
}
