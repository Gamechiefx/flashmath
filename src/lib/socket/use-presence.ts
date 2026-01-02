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
}

let presenceSocket: Socket | null = null;

export function usePresence(options: UsePresenceOptions = {}): UsePresenceReturn {
    const { autoConnect = true } = options;
    const { data: session } = useSession();
    
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
    
    const userIdRef = useRef<string | null>(null);
    
    // Connect to presence socket
    useEffect(() => {
        if (!autoConnect || !session?.user) {
            return;
        }
        
        const user = session.user as any;
        const userId = user.id;
        const userName = user.name || 'Unknown';
        userIdRef.current = userId;
        
        // Singleton socket connection
        if (!presenceSocket) {
            const socketUrl = typeof window !== 'undefined' 
                ? window.location.origin 
                : 'http://localhost:3000';
            
            presenceSocket = io(`${socketUrl}/presence`, {
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
            
            // Announce online status
            socket.emit('presence:online', { userId, userName });
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
        
        const handlePartyInvite = (data: { inviterName: string; partyId: string; timestamp: number }) => {
            setPendingPartyInvites(prev => [...prev, data]);
        };
        
        // Register handlers
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('presence:update', handlePresenceUpdate);
        socket.on('presence:friends_status', handleFriendsStatus);
        socket.on('friend:request', handleFriendRequest);
        socket.on('party:invite', handlePartyInvite);
        
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
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('presence:update', handlePresenceUpdate);
            socket.off('presence:friends_status', handleFriendsStatus);
            socket.off('friend:request', handleFriendRequest);
            socket.off('party:invite', handlePartyInvite);
        };
    }, [autoConnect, session]);
    
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

// Utility to send party invite notification
export function notifyPartyInvite(inviteeId: string, inviterName: string, partyId: string) {
    if (presenceSocket?.connected) {
        presenceSocket.emit('presence:notify_party_invite', { inviteeId, inviterName, partyId });
    }
}

