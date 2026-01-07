'use client';

/**
 * Party Context Provider
 * 
 * Provides real-time party state to the entire application via React Context.
 * Uses Socket.IO for instant updates - no polling required.
 * 
 * Usage:
 * 1. Wrap your app with <PartyProvider> (in layout or app)
 * 2. Use usePartyContext() in any component to access party state
 * 
 * Benefits over polling:
 * - Instant updates when members join/leave/ready
 * - All party members see changes simultaneously
 * - Reduced server load (no periodic fetches)
 * - Better UX with real-time feedback
 */

import React, { createContext, useContext, useMemo } from 'react';
import { usePartySocket, UsePartySocketReturn } from './use-party-socket';

// =============================================================================
// CONTEXT
// =============================================================================

const PartyContext = createContext<UsePartySocketReturn | null>(null);

// =============================================================================
// PROVIDER
// =============================================================================

interface PartyProviderProps {
    children: React.ReactNode;
    userId?: string;
    userName?: string;
}

export function PartyProvider({ children, userId, userName }: PartyProviderProps) {
    const partySocket = usePartySocket({
        autoConnect: true,
        userId,
        userName,
    });
    
    return (
        <PartyContext.Provider value={partySocket}>
            {children}
        </PartyContext.Provider>
    );
}

// =============================================================================
// HOOK
// =============================================================================

export function usePartyContext(): UsePartySocketReturn {
    const context = useContext(PartyContext);
    
    if (!context) {
        // Return a default/noop implementation if not in provider
        // This allows components to work outside the provider (e.g., in tests)
        return {
            isConnected: false,
            party: null,
            isInParty: false,
            isLeader: false,
            createParty: () => {},
            joinParty: () => {},
            leaveParty: () => {},
            disbandParty: () => {},
            kickMember: () => {},
            toggleReady: () => {},
            setIGL: () => {},
            setAnchor: () => {},
            setPreferredOperation: () => {},
            inviteFriend: () => {},
            acceptInvite: () => {},
            transferLeadership: () => {},
            pendingInvites: [],
            lastError: null,
            clearError: () => {},
            refreshParty: () => {},
        };
    }
    
    return context;
}

// =============================================================================
// SELECTOR HOOKS (for performance)
// =============================================================================

/**
 * Get just the party state (memoized)
 */
export function usePartyState() {
    const context = useContext(PartyContext);
    return useMemo(() => ({
        party: context?.party ?? null,
        isInParty: context?.isInParty ?? false,
        isLeader: context?.isLeader ?? false,
    }), [context?.party, context?.isInParty, context?.isLeader]);
}

/**
 * Get just the party members
 */
export function usePartyMembers() {
    const context = useContext(PartyContext);
    return context?.party?.members ?? [];
}

/**
 * Get party queue state
 */
export function usePartyQueueState() {
    const context = useContext(PartyContext);
    return context?.party?.queueState ?? null;
}

/**
 * Get pending invites
 */
export function usePendingInvites() {
    const context = useContext(PartyContext);
    return context?.pendingInvites ?? [];
}

