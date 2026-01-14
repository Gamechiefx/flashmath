'use client';

/**
 * Social Floating Action Button
 * Fixed position button on right edge that opens the social panel
 *
 * Uses AnimatePresence to properly handle mount/unmount animations when
 * the session status changes (e.g., after login navigation).
 *
 * Position: Center-right normally, bottom-right during matches/results
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Users } from 'lucide-react';
import { useSocial } from './social-provider';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

export function SocialFAB() {
    const { data: session, status } = useSession();
    const { togglePanel, isPanelOpen, stats } = useSocial();
    const pathname = usePathname();

    // Use status to reliably determine authentication state
    // During 'loading', we wait; only hide when confirmed 'unauthenticated'
    // This fixes the issue where the FAB wouldn't show after login until refresh
    const isAuthenticated = status === 'authenticated' && !!session?.user;

    // Move to bottom-right during matches and results pages
    const isMatchPage = pathname?.includes('/arena/teams/match/') ||
                        pathname?.includes('/arena/teams/results/') ||
                        pathname?.includes('/arena/match/');

    // Hide FAB on certain pages where it would interfere
    const hideFAB = pathname?.includes('/auth/') ||
                    pathname?.includes('/admin/');

    // Don't render if explicitly hidden
    if (hideFAB) return null;

    const badgeCount = stats.pendingRequests + stats.friendsOnline;
    const hasBadge = badgeCount > 0;

    return (
        <AnimatePresence mode="wait">
            {isAuthenticated && (
        <motion.button
                    key={`social-fab-${pathname}`}
            data-testid="social-fab"
            onClick={togglePanel}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 100, opacity: 0 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
                "fixed right-0 z-40",
                // Position: bottom-right during matches, center-right otherwise
                isMatchPage
                    ? "bottom-6"
                    : "top-1/2 -translate-y-1/2",
                "flex items-center justify-center",
                "w-12 h-14 rounded-l-xl",
                "bg-black/90 backdrop-blur-xl border border-white/10 border-r-0",
                "text-primary hover:text-accent transition-colors",
                "shadow-[0_0_20px_rgba(0,0,0,0.5)]",
                "group cursor-pointer",
                isPanelOpen && "bg-primary/20 border-primary/30"
            )}
            whileHover={{ 
                x: -4,
                boxShadow: '0 0 30px rgba(34, 211, 238, 0.3)',
            }}
            whileTap={{ scale: 0.95 }}
            aria-label="Open social panel"
        >
            {/* Icon */}
            <Users size={20} className="group-hover:scale-110 transition-transform" />

            {/* Badge */}
            {hasBadge && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn(
                        "absolute -top-1 -left-1",
                        "min-w-[18px] h-[18px] px-1",
                        "flex items-center justify-center",
                        "rounded-full text-[10px] font-bold",
                        stats.pendingRequests > 0
                            ? "bg-accent text-black"
                            : "bg-green-500 text-white"
                    )}
                >
                    {badgeCount > 99 ? '99+' : badgeCount}
                </motion.div>
            )}

            {/* Glow effect on hover */}
            <div className={cn(
                "absolute inset-0 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity",
                "bg-gradient-to-r from-primary/20 to-transparent",
                "pointer-events-none"
            )} />

            {/* Pulse animation when has pending requests */}
            {stats.pendingRequests > 0 && (
                <motion.div
                    className="absolute inset-0 rounded-l-xl border-2 border-accent/50"
                    animate={{
                        scale: [1, 1.1, 1],
                        opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            )}
        </motion.button>
            )}
        </AnimatePresence>
    );
}
