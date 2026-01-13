"use client";

import { useState } from "react";
import { loadData } from "@/lib/db"; // Use server component data loading pattern? No, use client for interactivity or simple RSC table.
// Let's make the page RSC and client components for row editing.

import { Item, Rarity } from "@/lib/items";
import { updateItem } from "@/lib/actions/admin";
import { NeonButton } from "@/components/ui/neon-button";
import { GlassCard } from "@/components/ui/glass-card";
import { useRouter } from "next/navigation";
import { toast } from "sonner"; // If we have it? Or just alert.

// We need a way to fetch items in Client Component? 
// Or better: Server Component Page passes data to Client Table.

// SERVER COMPONENT (page.tsx)
/*
export default async function AdminPage() {
    // ... fetch stuff ...
    return <AdminClientView items={items} />
}
*/
// Let's implement that structure.

// Wait, I can't export default function in write_to_file if I want split files.
// I will write the page.tsx as Server Component and define a client component inline or separate?
// Let's keep it simple: Page is Client Component using useEffect to fetch? 
// No, Next.js 13+ prefers Server Components.

// Let's try to query db in page.tsx (Server) and pass to a client component.
// I need "loadData" ... which reads file. OK for server.

// This file content will be the Client Component wrapper or just the page if I use "use client"?
// Actually the DB read must be server side. 
// So I will write page.tsx (server) and a separate component "admin-table.tsx"?
// Or just put "use client" grid row component in a separate file.
// Let's stick everything in page.tsx but ensure DB read is Server Action or passed from Server?
// Mixing Server and Client in one file is only possible if the Client part is a separate component imported.
// I'll make a unified solution if I can, or separate.

// I will create `src/components/admin/item-editor.tsx` first, then the page.
import { Check, Save, Loader2 } from "lucide-react";

export function ItemEditorRow({ item }: { item: Item }) {
    const [name, setName] = useState(item.name);
    const [priceStr, setPriceStr] = useState(String(item.price));
    const [rarity, setRarity] = useState(item.rarity);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        const price = parseInt(priceStr) || 0;
        const res = await updateItem(item.id, { name, price, rarity });
        setIsSaving(false);
        if (res.success) {
            setIsDirty(false);
            // flash success?
        } else {
            alert("Failed to save");
        }
    };

    return (
        <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
            <td className="p-4 font-mono text-xs text-muted-foreground">{item.id}</td>
            <td className="p-4">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setIsDirty(true); }}
                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm w-full font-bold text-accent"
                />
            </td>
            <td className="p-4 text-xs text-muted-foreground max-w-xs truncate">{item.type}</td>
            <td className="p-4">
                <select
                    value={rarity}
                    onChange={(e) => { setRarity(e.target.value as Rarity); setIsDirty(true); }}
                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm w-full"
                >
                    {Object.values(Rarity).map(r => (
                        <option key={r} value={r}>{r.toUpperCase()}</option>
                    ))}
                </select>
            </td>
            <td className="p-4">
                <input
                    type="number"
                    value={priceStr}
                    onChange={(e) => {
                        setPriceStr(e.target.value);
                        setIsDirty(true);
                    }}
                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm w-24"
                />
            </td>
            <td className="p-4 text-center">
                {isDirty && (
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="p-2 bg-primary/20 hover:bg-primary/40 text-primary rounded-full transition-colors"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>
                )}
            </td>
        </tr>
    );
}
