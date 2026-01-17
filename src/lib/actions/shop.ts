"use server";

import { auth } from "@/auth";
import { execute, queryOne, getDatabase, generateId, now, type UserRow } from "@/lib/db";
import { ITEMS } from "@/lib/items";
import { revalidatePath } from "next/cache";

export async function purchaseItem(itemId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as { id: string }).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    if (!user) return { error: "User not found" };

    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { error: "Item not found" };

    // Check funds
    if ((user.coins || 0) < item.price) {
        return { error: "Insufficient funds" };
    }

    // Check if already owned
    const db = getDatabase();
    const existingInventory = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId);
    if (existingInventory) return { error: "Item already owned" };

    // Deduct coins
    execute("UPDATE users SET coins = ? WHERE id = ?", [(user.coins || 0) - item.price, userId]);

    // Add to inventory using SQLite
    db.prepare(`
        INSERT INTO inventory (id, user_id, item_id, acquired_at)
        VALUES (?, ?, ?, ?)
    `).run(generateId(), userId, itemId, now());

    revalidatePath("/shop");
    revalidatePath("/locker");
    revalidatePath("/dashboard"); // coins updated

    return { success: true };
}

export async function equipItem(type: string, itemId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as { id: string }).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as UserRow | null;
    if (!user) return { error: "User not found" };

    // Verify ownership using SQLite
    const db = getDatabase();
    const isOwned = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId);

    // Allow equipping "default" items even if not in inventory
    if (!isOwned && itemId !== 'default') {
        return { error: "You do not own this item" };
    }

    // Update equipped_items
    let currentEquipped: Record<string, string> = {};
    if (user.equipped_items) {
        try {
            currentEquipped = typeof user.equipped_items === 'string' 
                ? JSON.parse(user.equipped_items) 
                : user.equipped_items;
        } catch {
            currentEquipped = {};
        }
    }
    let targetItemId = itemId;

    // Toggle logic: if already equipped, unequip (set to default)
    if (currentEquipped[type] === itemId) {
        targetItemId = 'default';
    }

    const updatedEquipped = { ...currentEquipped, [type]: targetItemId };

    execute("UPDATE users SET equipped_items = ? WHERE id = ?", [updatedEquipped, userId]);

    revalidatePath("/", "layout"); // Update global theme
    revalidatePath("/locker");
    revalidatePath("/league");
    revalidatePath("/dashboard");

    return { success: true };
}

export async function getInventory() {
    const session = await auth();
    if (!session?.user) return [];

    const userId = (session.user as { id: string }).id;
    const db = getDatabase();

    const inventory = db.prepare('SELECT item_id FROM inventory WHERE user_id = ?').all(userId) as { item_id: string }[];
    return inventory.map(i => i.item_id);
}
