'use client';

/**
 * FlashAuditor Floating Action Button
 * Opens the FlashAuditor slide-out panel from the left side
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Activity, TrendingDown } from 'lucide-react';
import { useAuditor } from './auditor-provider';
import { cn } from '@/lib/utils';

export function AuditorFab() {
    const { togglePanel, isPanelOpen, stats, hasWarning } = useAuditor();
    const [isHovered, setIsHovered] = React.useState(false);

    // Don't show if panel is open
    if (isPanelOpen) return null;

    // Determine warning level and styling
    const getWarningStyle = () => {
        if (!stats || stats.decay.phase === 'active') {
            return {
                bg: 'bg-gradient-to-br from-primary to-accent',
                pulse: false,
                icon: Zap,
            };
        }

        switch (stats.decay.phase) {
            case 'warning':
                return {
                    bg: 'bg-gradient-to-br from-yellow-500 to-orange-500',
                    pulse: true,
                    icon: AlertTriangle,
                };
            case 'decaying':
                return {
                    bg: 'bg-gradient-to-br from-orange-500 to-red-500',
                    pulse: true,
                    icon: TrendingDown,
                };
            case 'severe':
                return {
                    bg: 'bg-gradient-to-br from-red-500 to-rose-600',
                    pulse: true,
                    icon: AlertTriangle,
                };
            case 'returning':
                return {
                    bg: 'bg-gradient-to-br from-purple-500 to-indigo-600',
                    pulse: true,
                    icon: Activity,
                };
            default:
                return {
                    bg: 'bg-gradient-to-br from-primary to-accent',
                    pulse: false,
                    icon: Zap,
                };
        }
    };

    const style = getWarningStyle();
    const Icon = style.icon;
    const confidencePercent = stats ? Math.round(stats.confidence.overall * 100) : 0;

    return (
        <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={togglePanel}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
                'fixed left-4 bottom-4 z-30 flex items-center gap-2 rounded-2xl',
                'shadow-lg backdrop-blur-sm border border-[var(--glass-border)]',
                'transition-all duration-300 hover:shadow-2xl',
                style.bg,
                isHovered ? 'px-4 py-3' : 'p-3'
            )}
        >
            {/* Pulse ring for warnings */}
            {style.pulse && (
                <motion.div
                    className="absolute inset-0 rounded-2xl border-2 border-current opacity-50"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />
            )}

            {/* Icon */}
            <motion.div
                animate={style.pulse ? { rotate: [0, -10, 10, 0] } : {}}
                transition={{ duration: 0.5, repeat: style.pulse ? Infinity : 0, repeatDelay: 2 }}
            >
                <Icon className="w-5 h-5 text-primary-foreground" />
            </motion.div>

            {/* Confidence percentage - only show on hover */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-start overflow-hidden"
                    >
                        <span className="text-xs text-primary-foreground/70 font-medium leading-none whitespace-nowrap">Confidence</span>
                        <span className="text-lg font-black text-primary-foreground leading-none">{confidencePercent}%</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Warning badge */}
            {hasWarning && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center"
                >
                    <span className="text-[10px] font-black text-red-500">!</span>
                </motion.div>
            )}
        </motion.button>
    );
}

// Compact version that just shows the icon
export function AuditorFabCompact() {
    const { togglePanel, isPanelOpen, hasWarning } = useAuditor();

    if (isPanelOpen) return null;

    return (
        <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={togglePanel}
            className={cn(
                'fixed left-4 bottom-4 z-30 p-3 rounded-xl',
                'shadow-lg backdrop-blur-sm border border-[var(--glass-border)]',
                'bg-gradient-to-br from-primary to-accent',
                hasWarning && 'from-yellow-500 to-orange-500'
            )}
        >
            <Zap className="w-5 h-5 text-primary-foreground" />
            {hasWarning && (
                <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-background"
                />
            )}
        </motion.button>
    );
}
