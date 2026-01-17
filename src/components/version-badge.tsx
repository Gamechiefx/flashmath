'use client';

import { useState } from 'react';

/**
 * VersionBadge - Displays the application version in the bottom-right corner
 * 
 * Features:
 * - Shows version from package.json (injected at build time via env)
 * - Subtle, unobtrusive design
 * - Expands on hover to show more details
 * - Works on both dev and production
 */

// Version is injected at build time
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.1.0';
const BUILD_ENV = process.env.NEXT_PUBLIC_SHOW_DEV_BANNER === 'true' ? 'dev' : 'prod';

export function VersionBadge() {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="fixed bottom-3 right-3 z-[9998] select-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-md
                    bg-black/40 backdrop-blur-sm border border-white/10
                    text-[10px] font-mono text-white/50
                    transition-all duration-200 ease-out
                    hover:bg-black/60 hover:text-white/70 hover:border-white/20
                    ${isHovered ? 'pr-3' : ''}
                `}
            >
                {/* Version indicator dot */}
                <span 
                    className={`
                        w-1.5 h-1.5 rounded-full
                        ${BUILD_ENV === 'dev' ? 'bg-orange-500' : 'bg-emerald-500'}
                    `}
                    title={BUILD_ENV === 'dev' ? 'Development' : 'Production'}
                />
                
                {/* Version number */}
                <span>v{APP_VERSION}</span>
                
                {/* Expanded info on hover */}
                {isHovered && (
                    <span className="text-white/40 ml-1">
                        {BUILD_ENV}
                    </span>
                )}
            </div>
        </div>
    );
}
