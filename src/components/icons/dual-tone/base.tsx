/**
 * Dual-Tone Icon Base Component
 * Based on Refactoring UI icon system
 * 
 * These icons feature a two-color design with primary and secondary fills,
 * creating a more visually rich appearance suitable for hero sections,
 * achievements, and marketing pages.
 */

import { forwardRef, type SVGProps } from 'react';

export interface DualToneIconProps extends SVGProps<SVGSVGElement> {
    /** Primary (foreground) color - defaults to currentColor */
    primaryColor?: string;
    /** Secondary (background/accent) color - defaults to a lighter variant */
    secondaryColor?: string;
    /** Icon size in pixels - defaults to 24 */
    size?: number | string;
    /** Custom class for the primary path elements */
    primaryClassName?: string;
    /** Custom class for the secondary path elements */
    secondaryClassName?: string;
}

/**
 * Creates a dual-tone icon component from SVG paths
 */
export function createDualToneIcon(
    displayName: string,
    renderPaths: (primaryColor: string, secondaryColor: string) => React.ReactNode
) {
    const Icon = forwardRef<SVGSVGElement, DualToneIconProps>(
        (
            {
                primaryColor = 'currentColor',
                secondaryColor,
                size = 24,
                className,
                style,
                ...props
            },
            ref
        ) => {
            // Default secondary color is a lighter/transparent version of primary
            const resolvedSecondaryColor = secondaryColor || 
                (primaryColor === 'currentColor' ? 'currentColor' : primaryColor);
            
            return (
                <svg
                    ref={ref}
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width={size}
                    height={size}
                    className={className}
                    style={{
                        ...style,
                        // Apply opacity to secondary elements via CSS custom property
                        '--dt-secondary-opacity': secondaryColor ? '1' : '0.4',
                    } as React.CSSProperties}
                    {...props}
                >
                    {renderPaths(primaryColor, resolvedSecondaryColor)}
                </svg>
            );
        }
    );

    Icon.displayName = displayName;
    return Icon;
}

/**
 * CSS classes for dual-tone icon styling
 * Use these with Tailwind or include in your global styles
 */
export const dualToneStyles = `
.dt-primary {
    fill: var(--dt-primary, currentColor);
}

.dt-secondary {
    fill: var(--dt-secondary, currentColor);
    opacity: var(--dt-secondary-opacity, 0.4);
}
`;

/**
 * FlashMath themed color presets for dual-tone icons
 */
export const ICON_THEMES = {
    cyan: {
        primary: '#06b6d4',
        secondary: '#0891b2',
    },
    purple: {
        primary: '#8b5cf6',
        secondary: '#7c3aed',
    },
    green: {
        primary: '#10b981',
        secondary: '#059669',
    },
    amber: {
        primary: '#f59e0b',
        secondary: '#d97706',
    },
    pink: {
        primary: '#ec4899',
        secondary: '#db2777',
    },
    red: {
        primary: '#ef4444',
        secondary: '#dc2626',
    },
    // Gradient-style themes (use secondary as accent)
    cyanPurple: {
        primary: '#06b6d4',
        secondary: '#8b5cf6',
    },
    purplePink: {
        primary: '#8b5cf6',
        secondary: '#ec4899',
    },
    amberOrange: {
        primary: '#f59e0b',
        secondary: '#f97316',
    },
} as const;

export type IconTheme = keyof typeof ICON_THEMES;
