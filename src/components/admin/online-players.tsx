"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";

interface OnlinePlayersProps {
    initialCount: number;
}

export function OnlinePlayers({ initialCount }: OnlinePlayersProps) {
    const [count, setCount] = useState(initialCount);

    useEffect(() => {
        // Poll every 10 seconds
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/admin/online-count');
                const data = await res.json();
                if (typeof data.count === 'number') {
                    setCount(data.count);
                }
            } catch (e) {
                // Ignore errors
            }
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <Users size={16} className="text-green-400" />
            <span className="text-green-400 font-bold text-sm">{count}</span>
            <span className="text-green-400/70 text-xs uppercase tracking-widest">Online</span>
        </div>
    );
}
