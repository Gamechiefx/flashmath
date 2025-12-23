"use server";

import { auth } from "@/auth";
import { execute, queryOne, loadData } from "@/lib/db";
import { Item, ITEMS } from "@/lib/items";
import { revalidatePath } from "next/cache";

export async function purchaseItem(itemId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (!user) return { error: "User not found" };

    const item = ITEMS.find(i => i.id === itemId);
    if (!item) return { error: "Item not found" };

    // Check funds
    if (user.coins < item.price) {
        return { error: "Insufficient funds" };
    }

    // Check if already owned
    const db = loadData();
    const isOwned = db.inventory.some(i => i.user_id === userId && i.item_id === itemId);
    if (isOwned) return { error: "Item already owned" };

    // Deduct coins
    execute("UPDATE users SET coins = ? WHERE id = ?", [user.coins - item.price, userId]);

    // Add to inventory
    // Inventory definition in db.ts: { id, user_id, item_id, acquired_at }
    // execute INSERT INTO inventory
    // wait, execute helper is generic.
    // Let's modify execute to handle inventory insert or use generic push
    // Actually, execute handles "insert into sessions", "insert into mastery", "insert into users".
    // Does it handle custom?
    // Not really. I should add "insert into inventory" support to db.ts OR just access db directly?
    // Accessing db directly via loadData isn't enough, we need to save.
    // I should update db.ts to support this.

    // For now, I will add the logic here if I can import saveData?
    // But `execute` is the exposed API.
    // I'll assume I can just use a raw `db.inventory.push` then `saveData`?
    // Yes, `loadData` returns the mutable object reference!

    db.inventory.push({
        id: Date.now() + Math.random(),
        user_id: userId,
        item_id: item.id,
        acquired_at: new Date().toISOString()
    });

    // Save DB
    // I need to import saveData from db.ts. I did.
    // But wait, the `saveData` in db.ts is exported? Yes.
    const { saveData } = require("@/lib/db"); // Using require to avoid top-level if circular, but standard import works.
    saveData();

    revalidatePath("/shop");
    revalidatePath("/locker");
    revalidatePath("/dashboard"); // coins updated

    return { success: true };
}

export async function equipItem(type: string, itemId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;
    if (!user) return { error: "User not found" };

    // Verify ownership
    const db = loadData();
    const isOwned = db.inventory.some(i => i.user_id === userId && i.item_id === itemId);

    // Allow equipping "default" items even if not in inventory?
    // Or users start with defaults in inventory?
    // Let's assume if itemId is 'default', it is allowed.
    if (!isOwned && itemId !== 'default') {
        // Double check if it's a default item (e.g. Bronze frame might be free?)
        // If not free, error.
        return { error: "You do not own this item" };
    }

    // Update equipped_items
    const currentEquipped = user.equipped_items || {};
    let targetItemId = itemId;

    // Toggle logic: if already equipped, unequip (set to default)
    if (currentEquipped[type] === itemId) {
        targetItemId = 'default';
    }

    const updatedEquipped = { ...currentEquipped, [type]: targetItemId };

    execute("UPDATE users SET equipped_items = ? WHERE id = ?", [updatedEquipped, userId]);

    revalidatePath("/", "layout"); // Update global theme
    revalidatePath("/locker");

    return { success: true };
}

export async function getInventory() {
    const session = await auth();
    if (!session?.user) return [];

    const userId = (session.user as any).id;
    const db = loadData();

    const ownedIds = db.inventory
        .filter(i => i.user_id === userId)
        .map(i => i.item_id);

    return ownedIds;
}
