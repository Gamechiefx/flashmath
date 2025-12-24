"use client";

import { useState } from "react";
import { forceSeedShop } from "@/lib/actions/seed";
import { RefreshCw } from "lucide-react";

export function SeedButton() {
    const [loading, setLoading] = useState(false);

    const handleSeed = async () => {
        if (!confirm("Overwrite all shop items with default catalog? This will reset prices.")) return;

        setLoading(true);
        const res = await forceSeedShop();
        setLoading(false);

        if (res.success) {
            alert(`Seeded ${res.count} items successfully! Refresh page.`);
            window.location.reload();
        } else {
            alert("Failed to seed items.");
        }
    };

    return (
        <button
            onClick={handleSeed}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
        >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Seeding..." : "Reset Item DB"}
        </button>
    );
}
