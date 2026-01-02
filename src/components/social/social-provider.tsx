'use client';

/**
 * Social System Context Provider
 * Manages global state for the social panel (friends, party, presence)
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getSocialStats, type SocialStats } from '@/lib/actions/social';
import { useSession } from 'next-auth/react';

interface SocialContextType {
    isPanelOpen: boolean;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    stats: SocialStats;
    refreshStats: () => Promise<void>;
    isLoading: boolean;
}

const defaultStats: SocialStats = {
    friendsOnline: 0,
    friendsTotal: 0,
    pendingRequests: 0,
    partySize: 0,
    partyMaxSize: 0,
    inParty: false,
};

const SocialContext = createContext<SocialContextType>({
    isPanelOpen: false,
    openPanel: () => {},
    closePanel: () => {},
    togglePanel: () => {},
    stats: defaultStats,
    refreshStats: async () => {},
    isLoading: false,
});

export function SocialProvider({ children }: { children: ReactNode }) {
    const { data: session } = useSession();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [stats, setStats] = useState<SocialStats>(defaultStats);
    const [isLoading, setIsLoading] = useState(false);

    const openPanel = useCallback(() => setIsPanelOpen(true), []);
    const closePanel = useCallback(() => setIsPanelOpen(false), []);
    const togglePanel = useCallback(() => setIsPanelOpen(prev => !prev), []);

    const refreshStats = useCallback(async () => {
        if (!session?.user) return;
        setIsLoading(true);
        try {
            const newStats = await getSocialStats();
            setStats(newStats);
        } catch (error) {
            console.error('[Social] Failed to refresh stats:', error);
        } finally {
            setIsLoading(false);
        }
    }, [session]);

    // Load stats on mount and when session changes
    useEffect(() => {
        if (session?.user) {
            refreshStats();
            // Refresh stats every 30 seconds
            const interval = setInterval(refreshStats, 30000);
            return () => clearInterval(interval);
        }
    }, [session, refreshStats]);

    // Refresh stats when panel opens
    useEffect(() => {
        if (isPanelOpen && session?.user) {
            refreshStats();
        }
    }, [isPanelOpen, session, refreshStats]);

    return (
        <SocialContext.Provider
            value={{
                isPanelOpen,
                openPanel,
                closePanel,
                togglePanel,
                stats,
                refreshStats,
                isLoading,
            }}
        >
            {children}
        </SocialContext.Provider>
    );
}

export function useSocial() {
    return useContext(SocialContext);
}

