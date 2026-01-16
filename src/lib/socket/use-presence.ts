'use client';

/**
 * Real-time Presence Hook
 * Connects to the presence Socket.io namespace for friend status updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';

export type PresenceStatus = 'online' | 'away' | 'invisible' | 'in-match' | 'offline';

interface FriendPresence {
    userId: string;
    status: PresenceStatus;
    lastUpdated: number;
}

interface UsePresenceOptions {
    autoConnect?: boolean;
    // User info - pass these to avoid useSession dependency during navigation transitions
    // When provided, useSession is not called, preventing SessionProvider errors
    userId?: string;
    userName?: string;
}

interface PartySettingsUpdate {
    inviteMode: 'open' | 'invite_only';
    updaterId: string;
    timestamp: number;
}

interface PartyQueueStatusUpdate {
    queueStatus: 'finding_teammates' | 'finding_opponents' | null;
    partyId: string;
    updaterId: string;
    timestamp: number;
}

interface PartyStepUpdate {
    step: 'party' | 'roles' | 'ready';
    partyId: string;
    updaterId: string;
    timestamp: number;
}

interface UsePresenceReturn {
    isConnected: boolean;
    myStatus: PresenceStatus;
    setMyStatus: (status: PresenceStatus) => void;
    friendStatuses: Map<string, PresenceStatus>;
    getFriendStatus: (friendId: string) => PresenceStatus;
    requestFriendStatuses: (friendIds: string[]) => void;
    // Notifications
    pendingFriendRequests: { senderName: string; timestamp: number }[];
    pendingPartyInvites: { inviterName: string; partyId: string; timestamp: number }[];
    clearFriendRequestNotification: () => void;
    clearPartyInviteNotification: () => void;
    // Party settings real-time update
    latestPartySettingsUpdate: PartySettingsUpdate | null;
    clearPartySettingsUpdate: () => void;
    // Party queue status real-time update
    latestQueueStatusUpdate: PartyQueueStatusUpdate | null;
    clearQueueStatusUpdate: () => void;
    notifyQueueStatusChange: (partyMemberIds: string[], queueStatus: string | null, partyId: string) => void;
    // Party step real-time update (for party/roles/ready flow)
    latestStepUpdate: PartyStepUpdate | null;
    clearStepUpdate: () => void;
    notifyStepChange: (step: 'party' | 'roles' | 'ready', partyId: string) => void;
}

let presenceSocket: Socket | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
let socketConnectionCount = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future use
let handlerRegistrationCount = 0;

export function usePresence(options: UsePresenceOptions = {}): UsePresenceReturn {
    const { autoConnect = true, userId: propsUserId, userName: propsUserName } = options;
    
    // Always call useSession to maintain hook ordering (React rules)
    // Use required: false to prevent throwing when SessionProvider is unavailable during navigation
    // But prefer props when available to avoid SessionProvider timing issues
    const sessionResult = useSession({ required: false });
    const session = sessionResult?.data;
    
    // Prefer props over session (avoids SessionProvider dependency during navigation)
    const effectiveUserId = propsUserId || session?.user?.id;
    const effectiveUserName = propsUserName || (session?.user as { name?: string })?.name || 'Unknown';
    
    const [isConnected, setIsConnected] = useState(false);
    const [myStatus, setMyStatusState] = useState<PresenceStatus>('online');
    const [friendStatuses, setFriendStatuses] = useState<Map<string, PresenceStatus>>(new Map());
    
    // Notification queues
    const [pendingFriendRequests, setPendingFriendRequests] = useState<
        { senderName: string; timestamp: number }[]
    >([]);
    const [pendingPartyInvites, setPendingPartyInvites] = useState<
        { inviterName: string; partyId: string; timestamp: number }[]
    >([]);
    
    // Change notification flags (trigger data refresh)
    const [friendsChanged, setFriendsChanged] = useState(0);
    const [partyChanged, setPartyChanged] = useState(0);
    
    // Direct party settings update for immediate UI update
    const [latestPartySettingsUpdate, setLatestPartySettingsUpdate] = useState<PartySettingsUpdate | null>(null);
    
    // Queue status update for real-time sync when leader changes queue
    const [latestQueueStatusUpdate, setLatestQueueStatusUpdate] = useState<PartyQueueStatusUpdate | null>(null);

    // Step update for real-time sync (party/roles/ready flow)
    const [latestStepUpdate, setLatestStepUpdate] = useState<PartyStepUpdate | null>(null);

    const userIdRef = useRef<string | null>(null);
    const statusRef = useRef<PresenceStatus>('online');
    
    // Keep statusRef in sync with state
    useEffect(() => {
        statusRef.current = myStatus;
    }, [myStatus]);
    
    // Connect to presence socket
    useEffect(() => {
        // #region agent log - H2: Track effect trigger count
        socketConnectionCount++;
        // #endregion
        
        // Use effective user info (props take precedence over session)
        if (!autoConnect || !effectiveUserId) {
            return;
        }
        
        const userId = effectiveUserId;
        const userName = effectiveUserName;
        userIdRef.current = userId;
        
        // Singleton socket connection
        if (!presenceSocket) {
            const socketUrl = typeof window !== 'undefined' 
                ? window.location.origin 
                : 'http://localhost:3000';
            
            presenceSocket = io(`${socketUrl}/presence`, {
                path: '/api/socket/arena',
                autoConnect: false,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });
        }
        
        const socket = presenceSocket;
        
        // Socket event handlers
        const handleConnect = () => {
            console.log('[Presence] Connected');
            setIsConnected(true);
            
            // Announce online status with current status (preserve user's choice)
            // Use ref to get current status value (not stale closure)
            socket.emit('presence:online', { userId, userName, status: statusRef.current });
        };
        
        const handleDisconnect = () => {
            console.log('[Presence] Disconnected');
            setIsConnected(false);
        };
        
        const handlePresenceUpdate = (data: { userId: string; status: PresenceStatus; timestamp: number }) => {
            setFriendStatuses(prev => {
                const next = new Map(prev);
                next.set(data.userId, data.status);
                return next;
            });
        };
        
        const handleFriendsStatus = (data: { statuses: Record<string, PresenceStatus> }) => {
            setFriendStatuses(prev => {
                const next = new Map(prev);
                for (const [friendId, status] of Object.entries(data.statuses)) {
                    next.set(friendId, status);
                }
                return next;
            });
        };
        
        const handleFriendRequest = (data: { senderName: string; timestamp: number }) => {
            setPendingFriendRequests(prev => [...prev, data]);
        };
        
        const handleFriendAccepted = (data: { accepterName: string; timestamp: number }) => {
            // Trigger a refresh by adding to the pending requests (will be detected and cause reload)
            setPendingFriendRequests(prev => [...prev, { senderName: `${data.accepterName} (accepted)`, timestamp: data.timestamp }]);
        };
        
        const handlePartyInvite = (data: { inviterName: string; partyId: string; timestamp: number }) => {
            setPendingPartyInvites(prev => [...prev, data]);
        };
        
        const handleFriendRemoved = (data: { removerName: string; timestamp: number }) => {
            console.log('[Presence] Friend removed by:', data.removerName);
            setFriendsChanged(prev => prev + 1);
        };
        
        const handlePartyMemberJoined = (data: { joinerName: string; joinerId: string; timestamp: number }) => {
            console.log('[Presence] Party member joined:', data.joinerName);
            setPartyChanged(prev => prev + 1);
        };
        
        const handlePartyMemberLeft = (data: { leaverName: string; leaverId: string; disbanded: boolean; timestamp: number }) => {
            console.log('[Presence] Party member left:', data.leaverName, 'Disbanded:', data.disbanded);
            setPartyChanged(prev => prev + 1);
        };
        
        const handlePartySettingsUpdated = (data: { inviteMode: 'open' | 'invite_only'; updaterId: string; timestamp: number }) => {
            setLatestPartySettingsUpdate(data);
            setPartyChanged(prev => prev + 1);
        };
        
        const handlePartyQueueStatusChanged = (data: PartyQueueStatusUpdate) => {
            console.log('[Presence] 🔔 SOCKET RECEIVED: party:queue_status_changed');
            console.log('[Presence] partyId:', data.partyId);
            console.log('[Presence] queueStatus:', data.queueStatus);
            console.log('[Presence] updaterId:', data.updaterId);
            // #region agent log
            // #endregion
            setLatestQueueStatusUpdate(data);
            setPartyChanged(prev => prev + 1);
        };

        const handlePartyStepChanged = (data: PartyStepUpdate) => {
            console.log('[Presence] 🔔 SOCKET RECEIVED: party:step_changed');
            console.log('[Presence] partyId:', data.partyId);
            console.log('[Presence] step:', data.step);
            console.log('[Presence] updaterId:', data.updaterId);
            setLatestStepUpdate(data);
            setPartyChanged(prev => prev + 1);
        };

        // Register handlers
        // #region agent log - H5: Track handler registration
        handlerRegistrationCount++;
        // #endregion
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('presence:update', handlePresenceUpdate);
        socket.on('presence:friends_status', handleFriendsStatus);
        socket.on('friend:accepted', handleFriendAccepted);
        socket.on('friend:request', handleFriendRequest);
        socket.on('friend:removed', handleFriendRemoved);
        socket.on('party:invite', handlePartyInvite);
        socket.on('party:member_joined', handlePartyMemberJoined);
        socket.on('party:member_left', handlePartyMemberLeft);
        socket.on('party:settings_updated', handlePartySettingsUpdated);
        socket.on('party:queue_status_changed', handlePartyQueueStatusChanged);
        socket.on('party:step_changed', handlePartyStepChanged);

        // Connect if not already
        if (!socket.connected) {
            socket.connect();
        } else {
            // Already connected, just update status
            socket.emit('presence:online', { userId, userName });
            setIsConnected(true);
        }
        
        // Cleanup
        return () => {
            // #region agent log - H5: Track handler cleanup
            // #endregion
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('presence:update', handlePresenceUpdate);
            socket.off('presence:friends_status', handleFriendsStatus);
            socket.off('friend:request', handleFriendRequest);
            socket.off('friend:accepted', handleFriendAccepted);
            socket.off('friend:removed', handleFriendRemoved);
            socket.off('party:invite', handlePartyInvite);
            socket.off('party:member_joined', handlePartyMemberJoined);
            socket.off('party:member_left', handlePartyMemberLeft);
            socket.off('party:settings_updated', handlePartySettingsUpdated);
            socket.off('party:queue_status_changed', handlePartyQueueStatusChanged);
            socket.off('party:step_changed', handlePartyStepChanged);
        };
    }, [autoConnect, effectiveUserId, effectiveUserName]);
    
    // Set my status
    const setMyStatus = useCallback((status: PresenceStatus) => {
        setMyStatusState(status);
        if (presenceSocket?.connected) {
            presenceSocket.emit('presence:status', { status });
        }
    }, []);
    
    // Get specific friend status
    const getFriendStatus = useCallback((friendId: string): PresenceStatus => {
        return friendStatuses.get(friendId) || 'offline';
    }, [friendStatuses]);
    
    // Request friend statuses (batch)
    const requestFriendStatuses = useCallback((friendIds: string[]) => {
        if (presenceSocket?.connected && friendIds.length > 0) {
            presenceSocket.emit('presence:get_friends', { friendIds });
        }
    }, []);
    
    // Clear notifications
    const clearFriendRequestNotification = useCallback(() => {
        setPendingFriendRequests(prev => prev.slice(1));
    }, []);
    
    const clearPartyInviteNotification = useCallback(() => {
        setPendingPartyInvites(prev => prev.slice(1));
    }, []);
    
    const clearPartySettingsUpdate = useCallback(() => {
        setLatestPartySettingsUpdate(null);
    }, []);
    
    const clearQueueStatusUpdate = useCallback(() => {
        setLatestQueueStatusUpdate(null);
    }, []);

    const clearStepUpdate = useCallback(() => {
        setLatestStepUpdate(null);
    }, []);

    // Notify all party members of queue status change (called by leader)
    const notifyQueueStatusChange = useCallback((
        partyMemberIds: string[], 
        queueStatus: string | null, 
        partyId: string
    ) => {
        console.log('[Presence] 📤 SOCKET EMIT: presence:notify_party_queue_status');
        console.log('[Presence] partyId:', partyId);
        console.log('[Presence] queueStatus:', queueStatus);
        console.log('[Presence] targets:', partyMemberIds);
        console.log('[Presence] socket connected:', presenceSocket?.connected);
        
        // #region agent log
        // #endregion
        
        if (presenceSocket?.connected && userIdRef.current) {
            presenceSocket.emit('presence:notify_party_queue_status', {
                partyMemberIds,
                queueStatus,
                partyId,
                updaterId: userIdRef.current,
            });
        } else {
            console.log('[Presence] ⚠️ Socket not connected, cannot emit');
        }
    }, []);

    // Notify all party members of step change (called by leader)
    const notifyStepChange = useCallback((
        step: 'party' | 'roles' | 'ready',
        partyId: string
    ) => {
        console.log('[Presence] 📤 SOCKET EMIT: presence:notify_party_step_change');
        console.log('[Presence] partyId:', partyId);
        console.log('[Presence] step:', step);

        if (presenceSocket?.connected && userIdRef.current) {
            presenceSocket.emit('presence:notify_party_step_change', {
                step,
                partyId,
                updaterId: userIdRef.current,
            });
        } else {
            console.log('[Presence] ⚠️ Socket not connected, cannot emit step change');
        }
    }, []);

    return {
        isConnected,
        myStatus,
        setMyStatus,
        friendStatuses,
        getFriendStatus,
        requestFriendStatuses,
        pendingFriendRequests,
        pendingPartyInvites,
        clearFriendRequestNotification,
        clearPartyInviteNotification,
        // Change flags for triggering data refresh
        friendsChanged,
        partyChanged,
        // Direct party settings update
        latestPartySettingsUpdate,
        clearPartySettingsUpdate,
        // Queue status real-time update
        latestQueueStatusUpdate,
        clearQueueStatusUpdate,
        notifyQueueStatusChange,
        // Step real-time update (party/roles/ready flow)
        latestStepUpdate,
        clearStepUpdate,
        notifyStepChange,
    };
}

// Utility to get the presence socket (for direct access if needed)
export function getPresenceSocket(): Socket | null {
    return presenceSocket;
}

// Utility to send friend request notification (called from server action result)
export function notifyFriendRequest(receiverId: string, senderName: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_friend_request', { receiverId, senderName });
    }
}

// Utility to notify when a friend request is accepted
export function notifyFriendRequestAccepted(senderId: string, accepterName: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_friend_accepted', { senderId, accepterName });
    }
}

// Utility to send party invite notification
export function notifyPartyInvite(inviteeId: string, inviterName: string, partyId: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_party_invite', { inviteeId, inviterName, partyId });
    }
}

// Utility to notify when a friend is removed
export function notifyFriendRemoved(removedUserId: string, removerName: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_friend_removed', { removedUserId, removerName });
    }
}

// Utility to notify when someone joins a party
export function notifyPartyJoined(partyMemberIds: string[], joinerName: string, joinerId: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_party_joined', { partyMemberIds, joinerName, joinerId });
    }
}

// Utility to notify when someone leaves a party
export function notifyPartyLeft(partyMemberIds: string[], leaverName: string, leaverId: string, disbanded: boolean = false) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_party_left', { partyMemberIds, leaverName, leaverId, disbanded });
    }
}

// Utility to notify when party settings are updated
export function notifyPartySettingsUpdated(partyMemberIds: string[], inviteMode: 'open' | 'invite_only', updaterId: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_party_settings', { partyMemberIds, inviteMode, updaterId });
    }
}

