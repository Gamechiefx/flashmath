"use client";

import { cn } from "@/lib/utils";
import { User } from "next-auth";

interface UserAvatarProps {
    user: any; // Using any for now as our user type is extended with DB fields
    className?: string;
    size?: "sm" | "md" | "lg" | "xl";
}

export function UserAvatar({ user, className, size = "md" }: UserAvatarProps) {
    const frameId = user?.equipped_items?.frame || 'default';
    const name = user?.name || "Pilot";
    const initial = name.charAt(0).toUpperCase();

    const sizeClasses = {
        sm: "w-8 h-8 text-xs",
        md: "w-12 h-12 text-base",
        lg: "w-16 h-16 text-xl",
        xl: "w-24 h-24 text-3xl"
    };

    // Frame-specific styling logic
    // We can rely on CSS classes defined in global.css matching the assetValue from items.ts
    // ITEMS defines: frame-bronze, frame-circuit, frame-camo, frame-glitch, frame-gold-hex, frame-nebula

    // However, since we don't have the full Item object here efficiently without looking it up, 
    // we can map frameId to the expected class if we want to be safe, 
    // OR we can assume frameId matches the convention 'frame_xxx' -> 'frame-xxx' or just use the assetValue if passed?
    // The user object from DB has { equipped_items: { frame: 'frame_bronze' } }
    // The assetValue in items.ts is 'frame-bronze'.
    // Let's create a helper map or just a switch to be safe and simple for now.

    const getFrameClass = (id: string) => {
        switch (id) {
            case 'frame_bronze': return 'frame-bronze';
            case 'frame_circuit': return 'frame-circuit';
            case 'frame_camo': return 'frame-camo';
            case 'frame_glitch_ring': return 'frame-glitch';
            case 'frame_gold_hex': return 'frame-gold-hex';
            case 'frame_nebula': return 'frame-nebula';
            default: return '';
        }
    };

    const frameClass = getFrameClass(frameId);

    return (
        <div className={cn("relative flex items-center justify-center shrink-0", sizeClasses[size], className)}>
            {/* The Avatar Circle */}
            <div className={cn(
                "rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 z-10 w-full h-full overflow-hidden",
                // Specific shape overrides for frames like Hexagon
                frameClass === 'frame-gold-hex' && "rounded-none [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]"
            )}>
                {initial}
            </div>

            {/* The Frame Overlay/Container */}
            {frameClass && (
                <div className={cn("absolute inset-[-4px] pointer-events-none z-20", frameClass)} />
            )}
        </div>
    );
}
