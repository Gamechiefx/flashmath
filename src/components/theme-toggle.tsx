"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => setMounted(true), 0);
    }, []);

    if (!mounted) return null;

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-muted-foreground hover:text-primary"
            aria-label="Toggle Theme"
        >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
}
