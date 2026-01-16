'use client';

/**
 * FlashAuditor Context Provider
 * Manages global state for the FlashAuditor panel (confidence, decay, stats)
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { getConfidenceBreakdown } from '@/lib/actions/confidence';

// Types for the auditor context
export interface AuditorStats {
    confidence: {
        overall: number;
        volume: number;
        consistency: number;
        recency: number;
        totalSessions: number;
        sessionsPerWeek: number;
        daysSinceLastPractice: number;
        bracket: 'NEWCOMER' | 'DEVELOPING' | 'ESTABLISHED';
    };
    decay: {
        phase: 'active' | 'warning' | 'decaying' | 'severe' | 'returning';
        phaseLabel: string;
        daysUntilNextPhase: number;
        eloAtRisk: number;
        isReturningPlayer: boolean;
        placementMatchesRequired: number;
        placementMatchesCompleted: number;
        totalEloDecayed: number;
    };
}

interface AuditorContextType {
    isPanelOpen: boolean;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    stats: AuditorStats | null;
    refreshStats: () => Promise<void>;
    isLoading: boolean;
    hasWarning: boolean; // True if decay phase is not 'active'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- defaultStats may be used in future
const defaultStats: AuditorStats = {
    confidence: {
        overall: 0,
        volume: 0,
        consistency: 0,
        recency: 0,
        totalSessions: 0,
        sessionsPerWeek: 0,
        daysSinceLastPractice: 0,
        bracket: 'NEWCOMER'
    },
    decay: {
        phase: 'active',
        phaseLabel: 'Active',
        daysUntilNextPhase: 7,
        eloAtRisk: 0,
        isReturningPlayer: false,
        placementMatchesRequired: 0,
        placementMatchesCompleted: 0,
        totalEloDecayed: 0
    }
};

const AuditorContext = createContext<AuditorContextType>({
    isPanelOpen: false,
    openPanel: () => {},
    closePanel: () => {},
    togglePanel: () => {},
    stats: null,
    refreshStats: async () => {},
    isLoading: false,
    hasWarning: false,
});

export function AuditorProvider({ children }: { children: ReactNode }) {
    const { data: session } = useSession();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [stats, setStats] = useState<AuditorStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const openPanel = useCallback(() => setIsPanelOpen(true), []);
    const closePanel = useCallback(() => setIsPanelOpen(false), []);
    const togglePanel = useCallback(() => setIsPanelOpen(prev => !prev), []);

    const refreshStats = useCallback(async () => {
        if (!session?.user) return;
        setIsLoading(true);
        try {
            const result = await getConfidenceBreakdown();
            if (result) {
                setStats({
                    confidence: result.confidence,
                    decay: {
                        phase: result.decay.phase,
                        phaseLabel: result.decay.phaseLabel,
                        daysUntilNextPhase: result.decay.daysUntilNextPhase,
                        eloAtRisk: result.decay.eloAtRisk,
                        isReturningPlayer: result.decay.isReturningPlayer,
                        placementMatchesRequired: result.decay.placementMatchesRequired,
                        placementMatchesCompleted: result.decay.placementMatchesCompleted,
                        totalEloDecayed: result.decay.totalEloDecayed
                    }
                });
            }
        } catch (error) {
            console.error('[Auditor] Failed to refresh stats:', error);
        } finally {
            setIsLoading(false);
        }
    }, [session]);

    // Load stats on mount and when session changes
    useEffect(() => {
        if (session?.user) {
            refreshStats();
            // Refresh stats every 60 seconds
            const interval = setInterval(refreshStats, 60000);
            return () => clearInterval(interval);
        }
    }, [session, refreshStats]);

    // Refresh stats when panel opens
    useEffect(() => {
        if (isPanelOpen && session?.user) {
            refreshStats();
        }
    }, [isPanelOpen, session, refreshStats]);

    const hasWarning = stats?.decay.phase !== 'active';

    return (
        <AuditorContext.Provider
            value={{
                isPanelOpen,
                openPanel,
                closePanel,
                togglePanel,
                stats,
                refreshStats,
                isLoading,
                hasWarning,
            }}
        >
            {children}
        </AuditorContext.Provider>
    );
}

export function useAuditor() {
    return useContext(AuditorContext);
}


