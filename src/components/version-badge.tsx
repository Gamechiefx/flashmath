'use client';

import { useState } from 'react';

/**
 * VersionBadge - Displays the application version in the bottom-left corner
 * 
 * Features:
 * - Shows version from package.json (injected at build time via env)
 * - Subtle, unobtrusive design
 * - Positioned to avoid overlap with Social FAB (right) and Auditor FAB (bottom-left)
 * - Works on both dev and production
 * 
 * Position: Bottom-left, above the Auditor FAB and Dev Footer
 */

// Version is injected at build time
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.1.0';
const BUILD_ENV = process.env.NEXT_PUBLIC_SHOW_DEV_BANNER === 'true' ? 'dev' : 'prod';

export function VersionBadge() {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="fixed bottom-16 left-4 z-20 select-none pointer-events-auto"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-md
                    bg-black/30 backdrop-blur-sm border border-white/5
                    text-[10px] font-mono text-white/40
                    transition-all duration-200 ease-out
                    hover:bg-black/50 hover:text-white/60 hover:border-white/15
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
                    <span className="text-white/30 ml-1">
                        {BUILD_ENV}
                    </span>
                )}
            </div>
        </div>
    );
}
