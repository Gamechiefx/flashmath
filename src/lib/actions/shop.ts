"use server";

import { query, queryOne, execute, loadData, saveData } from "@/lib/db";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

export async function getShopData() {
    const session = await auth();
    if (!session?.user) return null;
    const userId = (session.user as any).id;

    const user = queryOne("SELECT * FROM users WHERE id = ?", [userId]) as any;

    // Seed items if empty
    const db = loadData();
    if (db.shop_items.length === 0) {
        db.shop_items = [
            { id: 'glow-cyan', name: 'CYBER CYAN', cost: 500, description: 'Exclusive cyan interface glow', type: 'theme' },
            { id: 'glow-pink', name: 'NEON PINK', cost: 750, description: 'Vibrant pink interface glow', type: 'theme' },
            { id: 'glow-gold', name: 'VOID GOLD', cost: 1500, description: 'Legendary gold interface glow', type: 'theme' },
            { id: 'rank-badge', name: 'ALPHA BADGE', cost: 300, description: 'Show off your veteran status', type: 'badge' }
        ];
        saveData();
    }

    const inventory = db.inventory.filter(i => i.user_id === userId);

    return {
        coins: user?.coins || 0,
        items: db.shop_items,
        inventory: inventory.map(i => i.item_id),
        userId
    };
}

export async function buyItem(itemId: string) {
    const session = await auth();
    if (!session?.user) return { error: "Unauthorized" };
    const userId = (session.user as any).id;

    const db = loadData();
    const item = db.shop_items.find(i => i.id === itemId);
    const user = db.users.find(u => u.id === userId);

    if (!item || !user) return { error: "Item or User not found" };
    if (user.coins < item.cost) return { error: "Insufficient Neural Credits" };

    // Check if already owned
    const alreadyOwned = db.inventory.some(i => i.user_id === userId && i.item_id === itemId);
    if (alreadyOwned) return { error: "Already owned" };

    // Process Transaction
    user.coins -= item.cost;
    db.inventory.push({
        user_id: userId,
        item_id: itemId,
        purchased_at: new Date().toISOString()
    });

    saveData();
    revalidatePath("/shop");
    revalidatePath("/dashboard");
    return { success: true };
}
