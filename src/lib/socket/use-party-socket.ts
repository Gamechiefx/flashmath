'use client';

/**
 * Real-time Party Socket Hook
 * 
 * Connects to the presence Socket.io namespace for real-time party state.
 * Replaces polling-based party updates with instant Socket.IO events.
 * 
 * Benefits:
 * - Instant party state updates (no polling)
 * - All members see changes simultaneously
 * - Member online/offline detection
 * - Queue status sync across all clients
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';

// =============================================================================
// TYPES
// =============================================================================

export interface PartyMember {
    odUserId: string;
    odUserName: string;
    odLevel: number;
    odEquippedFrame: string | null;
    odEquippedTitle: string | null;
    isReady: boolean;
    preferredOperation: string | null;
    joinedAt: number;
    isOnline: boolean;
}

export interface PartyState {
    id: string;
    leaderId: string;
    leaderName: string;
    iglId: string | null;
    anchorId: string | null;
    targetMode: '5v5' | '3v3' | '2v2' | null;
    teamId: string | null;
    teamName: string | null;
    teamTag: string | null;
    inviteMode: 'open' | 'invite_only';
    maxSize: number;
}

export interface PartyQueueState {
    status: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';
    startedAt: number | null;
    matchType: 'ranked' | 'casual' | null;
    matchId: string | null;
}

export interface FullPartyData {
    party: PartyState;
    members: PartyMember[];
    queueState: PartyQueueState;
}

export interface UsePartySocketOptions {
    autoConnect?: boolean;
    userId?: string;
    userName?: string;
}

export interface UsePartySocketReturn {
    // Connection
    isConnected: boolean;
    
    // Party State (real-time)
    party: FullPartyData | null;
    isInParty: boolean;
    isLeader: boolean;
    
    // Actions (via Socket.IO - instant updates)
    createParty: () => void;
    joinParty: (partyId: string) => void;
    leaveParty: () => void;
    disbandParty: () => void;
    kickMember: (targetUserId: string) => void;
    toggleReady: () => void;
    setIGL: (iglUserId: string) => void;
    setAnchor: (anchorUserId: string) => void;
    setPreferredOperation: (operation: string | null) => void;
    inviteFriend: (friendId: string, friendName: string) => void;
    acceptInvite: (partyId: string) => void;
    transferLeadership: (newLeaderId: string) => void;
    
    // Pending invites received
    pendingInvites: { partyId: string; inviterName: string; expiresAt: number }[];
    
    // Error handling
    lastError: string | null;
    clearError: () => void;
    
    // Refresh (fetch from Redis if needed)
    refreshParty: () => void;
}

// =============================================================================
// SOCKET SINGLETON
// =============================================================================

let partySocket: Socket | null = null;

function getOrCreateSocket(): Socket {
    if (!partySocket) {
        const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
        partySocket = io(`${socketUrl}/presence`, {
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });
    }
    return partySocket;
}

// =============================================================================
// HOOK
// =============================================================================

export function usePartySocket(options: UsePartySocketOptions = {}): UsePartySocketReturn {
    const { autoConnect = true, userId: propsUserId, userName: propsUserName } = options;
    
    const sessionResult = useSession({ required: false });
    const session = sessionResult?.data;
    
    const effectiveUserId = propsUserId || (session?.user as any)?.id;
    const effectiveUserName = propsUserName || (session?.user as any)?.name || 'Unknown';
    const effectiveLevel = (session?.user as any)?.level || 1;
    const effectiveFrame = (session?.user as any)?.equippedFrame || null;
    const effectiveTitle = (session?.user as any)?.equippedTitle || null;
    
    // State
    const [isConnected, setIsConnected] = useState(false);
    const [party, setParty] = useState<FullPartyData | null>(null);
    const [pendingInvites, setPendingInvites] = useState<
        { partyId: string; inviterName: string; expiresAt: number }[]
    >([]);
    const [lastError, setLastError] = useState<string | null>(null);
    
    const socketRef = useRef<Socket | null>(null);
    const userIdRef = useRef<string | null>(null);
    
    // Derived state
    const isInParty = party !== null;
    const isLeader = party?.party.leaderId === effectiveUserId;
    
    // ==========================================================================
    // SOCKET CONNECTION
    // ==========================================================================
    
    useEffect(() => {
        if (!autoConnect || !effectiveUserId) return;
        
        const socket = getOrCreateSocket();
        socketRef.current = socket;
        userIdRef.current = effectiveUserId;
        
        // Connection handlers
        const handleConnect = () => {
            console.log('[PartySocket] Connected');
            setIsConnected(true);
            
            // Auto-join party room if user is in a party
            socket.emit('presence:online', {
                userId: effectiveUserId,
                userName: effectiveUserName,
                status: 'online',
            });
        };
        
        const handleDisconnect = () => {
            console.log('[PartySocket] Disconnected');
            setIsConnected(false);
        };
        
        const handleError = (error: any) => {
            console.error('[PartySocket] Error:', error);
            setLastError(error.error || error.message || 'Unknown error');
        };
        
        // =======================================================================
        // PARTY EVENT HANDLERS
        // =======================================================================
        
        const handlePartyCreated = (data: { partyId: string }) => {
            console.log('[PartySocket] Party created:', data.partyId);
            socket.emit('party:get', { partyId: data.partyId });
        };
        
        const handlePartyJoined = (data: { partyId: string }) => {
            console.log('[PartySocket] Joined party:', data.partyId);
            socket.emit('party:get', { partyId: data.partyId });
        };
        
        const handlePartyLeft = (data: { disbanded: boolean }) => {
            console.log('[PartySocket] Left party', data.disbanded ? '(disbanded)' : '');
            setParty(null);
        };
        
        const handlePartyData = (data: FullPartyData | null) => {
            console.log('[PartySocket] Party data received:', data?.party?.id);
            setParty(data);
        };
        
        const handleMemberJoined = (data: { odUserId: string; odUserName: string }) => {
            console.log('[PartySocket] Member joined:', data.odUserName);
            // Refresh party data for complete state
            if (party?.party.id) {
                socket.emit('party:get', { partyId: party.party.id });
            }
        };
        
        const handleMemberLeft = (data: { odUserId: string; disbanded: boolean; newLeaderId?: string }) => {
            console.log('[PartySocket] Member left:', data.odUserId);
            if (data.disbanded) {
                setParty(null);
            } else if (party?.party.id) {
                socket.emit('party:get', { partyId: party.party.id });
            }
        };
        
        const handleMemberKicked = (data: { kickedUserId: string; kickedName: string }) => {
            console.log('[PartySocket] Member kicked:', data.kickedName);
            if (party?.party.id) {
                socket.emit('party:get', { partyId: party.party.id });
            }
        };
        
        const handleYouWereKicked = () => {
            console.log('[PartySocket] You were kicked from the party');
            setParty(null);
            setLastError('You were kicked from the party');
        };
        
        const handleReadyChanged = (data: { odUserId: string; isReady: boolean }) => {
            console.log('[PartySocket] Ready changed:', data.odUserId, data.isReady);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    members: prev.members.map(m =>
                        m.odUserId === data.odUserId ? { ...m, isReady: data.isReady } : m
                    ),
                };
            });
        };
        
        const handleIGLChanged = (data: { iglUserId: string }) => {
            console.log('[PartySocket] IGL changed:', data.iglUserId);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    party: { ...prev.party, iglId: data.iglUserId },
                };
            });
        };
        
        const handleAnchorChanged = (data: { anchorUserId: string }) => {
            console.log('[PartySocket] Anchor changed:', data.anchorUserId);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    party: { ...prev.party, anchorId: data.anchorUserId },
                };
            });
        };
        
        const handlePreferredOpChanged = (data: { odUserId: string; operation: string | null }) => {
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    members: prev.members.map(m =>
                        m.odUserId === data.odUserId ? { ...m, preferredOperation: data.operation } : m
                    ),
                };
            });
        };
        
        const handleQueueStatusChanged = (data: { queueStatus: string; partyId: string }) => {
            console.log('[PartySocket] Queue status:', data.queueStatus);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    queueState: {
                        ...prev.queueState,
                        status: data.queueStatus as any,
                        startedAt: data.queueStatus !== 'idle' ? Date.now() : null,
                    },
                };
            });
        };
        
        const handleLeaderChanged = (data: { newLeaderId: string; newLeaderName: string }) => {
            console.log('[PartySocket] Leader changed:', data.newLeaderName);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    party: {
                        ...prev.party,
                        leaderId: data.newLeaderId,
                        leaderName: data.newLeaderName,
                    },
                };
            });
        };
        
        const handlePartyDisbanded = () => {
            console.log('[PartySocket] Party disbanded');
            setParty(null);
        };
        
        const handleMemberOffline = (data: { odUserId: string }) => {
            console.log('[PartySocket] Member went offline:', data.odUserId);
            setParty(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    members: prev.members.map(m =>
                        m.odUserId === data.odUserId ? { ...m, isOnline: false } : m
                    ),
                };
            });
        };
        
        const handleInviteReceived = (data: { partyId: string; inviterName: string; timestamp: number }) => {
            console.log('[PartySocket] Invite received from:', data.inviterName);
            setPendingInvites(prev => [
                ...prev.filter(i => i.partyId !== data.partyId), // Remove duplicate
                { partyId: data.partyId, inviterName: data.inviterName, expiresAt: data.timestamp + 600000 },
            ]);
        };
        
        // Register event listeners
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('party:error', handleError);
        socket.on('party:created', handlePartyCreated);
        socket.on('party:joined', handlePartyJoined);
        socket.on('party:left', handlePartyLeft);
        socket.on('party:data', handlePartyData);
        socket.on('party:member_joined', handleMemberJoined);
        socket.on('party:member_left', handleMemberLeft);
        socket.on('party:member_kicked', handleMemberKicked);
        socket.on('party:you_were_kicked', handleYouWereKicked);
        socket.on('party:ready_changed', handleReadyChanged);
        socket.on('party:igl_changed', handleIGLChanged);
        socket.on('party:anchor_changed', handleAnchorChanged);
        socket.on('party:preferred_op_changed', handlePreferredOpChanged);
        socket.on('party:queue_status_changed', handleQueueStatusChanged);
        socket.on('party:leader_changed', handleLeaderChanged);
        socket.on('party:disbanded', handlePartyDisbanded);
        socket.on('party:member_offline', handleMemberOffline);
        socket.on('party:invite_received', handleInviteReceived);
        
        // Connect if not already
        if (!socket.connected) {
            socket.connect();
        } else {
            handleConnect();
        }
        
        // Cleanup
        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('party:error', handleError);
            socket.off('party:created', handlePartyCreated);
            socket.off('party:joined', handlePartyJoined);
            socket.off('party:left', handlePartyLeft);
            socket.off('party:data', handlePartyData);
            socket.off('party:member_joined', handleMemberJoined);
            socket.off('party:member_left', handleMemberLeft);
            socket.off('party:member_kicked', handleMemberKicked);
            socket.off('party:you_were_kicked', handleYouWereKicked);
            socket.off('party:ready_changed', handleReadyChanged);
            socket.off('party:igl_changed', handleIGLChanged);
            socket.off('party:anchor_changed', handleAnchorChanged);
            socket.off('party:preferred_op_changed', handlePreferredOpChanged);
            socket.off('party:queue_status_changed', handleQueueStatusChanged);
            socket.off('party:leader_changed', handleLeaderChanged);
            socket.off('party:disbanded', handlePartyDisbanded);
            socket.off('party:member_offline', handleMemberOffline);
            socket.off('party:invite_received', handleInviteReceived);
        };
    }, [autoConnect, effectiveUserId, effectiveUserName]);
    
    // ==========================================================================
    // ACTIONS
    // ==========================================================================
    
    const createParty = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId) return;
        
        socket.emit('party:create', {
            userId: effectiveUserId,
            userName: effectiveUserName,
            level: effectiveLevel,
            equippedFrame: effectiveFrame,
            equippedTitle: effectiveTitle,
        });
    }, [effectiveUserId, effectiveUserName, effectiveLevel, effectiveFrame, effectiveTitle]);
    
    const joinParty = useCallback((partyId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId) return;
        
        socket.emit('party:join', {
            partyId,
            userId: effectiveUserId,
            userName: effectiveUserName,
            level: effectiveLevel,
            equippedFrame: effectiveFrame,
            equippedTitle: effectiveTitle,
        });
    }, [effectiveUserId, effectiveUserName, effectiveLevel, effectiveFrame, effectiveTitle]);
    
    const leaveParty = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:leave', {
            partyId: party.party.id,
            userId: effectiveUserId,
        });
    }, [effectiveUserId, party]);
    
    const disbandParty = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:disband', {
            partyId: party.party.id,
            userId: effectiveUserId,
        });
    }, [effectiveUserId, party]);
    
    const kickMember = useCallback((targetUserId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:kick', {
            partyId: party.party.id,
            leaderId: effectiveUserId,
            targetUserId,
        });
    }, [effectiveUserId, party]);
    
    const toggleReady = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:toggle_ready', {
            partyId: party.party.id,
            userId: effectiveUserId,
        });
    }, [effectiveUserId, party]);
    
    const setIGL = useCallback((iglUserId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:set_igl', {
            partyId: party.party.id,
            leaderId: effectiveUserId,
            iglUserId,
        });
    }, [effectiveUserId, party]);
    
    const setAnchor = useCallback((anchorUserId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:set_anchor', {
            partyId: party.party.id,
            leaderId: effectiveUserId,
            anchorUserId,
        });
    }, [effectiveUserId, party]);
    
    const setPreferredOperation = useCallback((operation: string | null) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:set_preferred_op', {
            partyId: party.party.id,
            userId: effectiveUserId,
            operation,
        });
    }, [effectiveUserId, party]);
    
    const inviteFriend = useCallback((friendId: string, friendName: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:invite', {
            partyId: party.party.id,
            inviterId: effectiveUserId,
            inviterName: effectiveUserName,
            inviteeId: friendId,
            inviteeName: friendName,
        });
    }, [effectiveUserId, effectiveUserName, party]);
    
    const acceptInvite = useCallback((partyId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId) return;
        
        socket.emit('party:accept_invite', {
            partyId,
            userId: effectiveUserId,
            userName: effectiveUserName,
            level: effectiveLevel,
            equippedFrame: effectiveFrame,
            equippedTitle: effectiveTitle,
        });
        
        // Remove from pending invites
        setPendingInvites(prev => prev.filter(i => i.partyId !== partyId));
    }, [effectiveUserId, effectiveUserName, effectiveLevel, effectiveFrame, effectiveTitle]);
    
    const transferLeadership = useCallback((newLeaderId: string) => {
        const socket = socketRef.current;
        if (!socket || !effectiveUserId || !party) return;
        
        socket.emit('party:transfer_leadership', {
            partyId: party.party.id,
            currentLeaderId: effectiveUserId,
            newLeaderId,
        });
    }, [effectiveUserId, party]);
    
    const refreshParty = useCallback(() => {
        const socket = socketRef.current;
        if (!socket || !party) return;
        
        socket.emit('party:get', { partyId: party.party.id });
    }, [party]);
    
    const clearError = useCallback(() => {
        setLastError(null);
    }, []);
    
    return {
        isConnected,
        party,
        isInParty,
        isLeader,
        createParty,
        joinParty,
        leaveParty,
        disbandParty,
        kickMember,
        toggleReady,
        setIGL,
        setAnchor,
        setPreferredOperation,
        inviteFriend,
        acceptInvite,
        transferLeadership,
        pendingInvites,
        lastError,
        clearError,
        refreshParty,
    };
}

