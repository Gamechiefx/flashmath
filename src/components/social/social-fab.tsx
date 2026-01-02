'use client';

/**
 * Social Floating Action Button
 * Fixed position button on right edge that opens the social panel
 */

import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useSocial } from './social-provider';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';

export function SocialFAB() {
    const { data: session } = useSession();
    const { togglePanel, isPanelOpen, stats } = useSocial();

    // Don't render if not logged in
    if (!session?.user) return null;

    const badgeCount = stats.pendingRequests + stats.friendsOnline;
    const hasBadge = badgeCount > 0;

    return (
        <motion.button
            onClick={togglePanel}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
                "fixed right-0 top-1/2 -translate-y-1/2 z-40",
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
    );
}

