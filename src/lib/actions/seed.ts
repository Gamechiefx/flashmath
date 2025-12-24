"use server";

import { loadData, saveData } from "@/lib/db";
import { ITEMS } from "@/lib/items";
import { revalidatePath } from "next/cache";

export async function forceSeedShop() {
    try {
        const data = loadData();
        console.log(`[SEED] Logic requested. Static ITEMS count: ${ITEMS.length}`);

        // Strip icons for DB
        const dbItems = ITEMS.map(({ icon, ...rest }) => rest);
        data.shop_items = dbItems;

        saveData();

        console.log(`[SEED] Success. DB shop_items count: ${data.shop_items.length}`);
        revalidatePath("/shop");
        revalidatePath("/admin");
        return { success: true, count: data.shop_items.length };
    } catch (e) {
        console.error("[SEED] Failed:", e);
        return { error: "Failed to seed shop items" };
    }
}
