"use client";

import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { soundEngine } from "@/lib/sound-engine";

export function SoundToggle() {
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            setEnabled(soundEngine.isEnabled());
        }, 0);
    }, []);

    const toggle = () => {
        const next = !enabled;
        soundEngine.setEnabled(next);
        setEnabled(next);
    };

    return (
        <button
            onClick={toggle}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-primary transition-all"
            title={enabled ? "Mute Sounds" : "Unmute Sounds"}
        >
            {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
    );
}
