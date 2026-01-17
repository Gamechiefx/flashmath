"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Hammer } from "lucide-react";

/**
 * DevFooter - A subtle development environment indicator
 * Only renders when NEXT_PUBLIC_SHOW_DEV_BANNER is set to "true"
 * This helps differentiate dev from production environments
 */
export function DevFooter() {
    const [isVisible, setIsVisible] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const [isOnLeft, setIsOnLeft] = useState(false);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Only show if the env variable is explicitly set to "true"
    const showDevBanner = process.env.NEXT_PUBLIC_SHOW_DEV_BANNER === "true";

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            setIsMounted(true);
            const hidden = localStorage.getItem("flashmath_dev_footer_hidden");
            if (hidden === "true") {
                setIsVisible(false);
            }
        }, 0);
    }, []);

    const toggleVisibility = () => {
        const nextState = !isVisible;
        setIsVisible(nextState);
        localStorage.setItem("flashmath_dev_footer_hidden", (!nextState).toString());
    };

    if (!showDevBanner || !isMounted) {
        return null;
    }

    const handleMouseEnter = () => {
        hoverTimerRef.current = setTimeout(() => {
            setIsOnLeft(prev => !prev);
        }, 2000);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    if (!isVisible) {
        return (
            <button
                onClick={toggleVisibility}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`fixed bottom-4 ${isOnLeft ? 'left-4' : 'right-4'} z-[9999] flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg transition-all duration-300 hover:scale-110 active:scale-95`}
                title="Show Dev Banner"
            >
                <Hammer size={16} />
            </button>
        );
    }

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-[9999]"
            style={{
                background: "linear-gradient(90deg, rgba(234, 88, 12, 0.9) 0%, rgba(249, 115, 22, 0.9) 50%, rgba(234, 88, 12, 0.9) 100%)",
                backdropFilter: "blur(4px)",
            }}
        >
            <div className="flex items-center justify-between gap-2 py-1.5 px-4 max-w-screen-2xl mx-auto">
                <div className="flex items-center gap-2">
                    {/* Pulsing dot indicator */}
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                    </span>

                    {/* Dev environment text */}
                    <span
                        className="text-white text-[10px] md:text-xs font-semibold tracking-wider uppercase"
                        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                    >
                        🛠️ Development Environment
                    </span>

                    {/* Separator */}
                    <span className="hidden md:inline text-white/60 text-xs">•</span>

                    {/* Additional info */}
                    <span className="hidden md:inline text-white/90 text-[10px] md:text-xs">
                        dev.flashmath.io
                    </span>
                </div>

                <button
                    onClick={toggleVisibility}
                    className="flex items-center gap-1 text-white/80 hover:text-white transition-colors text-[10px] uppercase font-bold tracking-tight"
                >
                    <span>Hide</span>
                    <ChevronDown size={14} />
                </button>
            </div>
        </div>
    );
}
