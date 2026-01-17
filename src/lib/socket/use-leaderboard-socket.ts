'use client';

/**
 * Real-time Leaderboard Hook
 * Connects to the presence Socket.io namespace for leaderboard updates
 */

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import type { Operation, TimeFilter, LeaderboardType } from '@/lib/actions/leaderboard';

interface LeaderboardUpdate {
    type: LeaderboardType;
    operation: Operation;
    timeFilter: TimeFilter;
    affectedUserIds: string[];
    timestamp: number;
}

interface UseLeaderboardSocketOptions {
    type: LeaderboardType;
    operation: Operation;
    timeFilter: TimeFilter;
    onUpdate?: (update: LeaderboardUpdate) => void;
}

interface UseLeaderboardSocketReturn {
    isConnected: boolean;
    lastUpdate: LeaderboardUpdate | null;
    updateCount: number;
}

let leaderboardSocket: Socket | null = null;

export function useLeaderboardSocket(options: UseLeaderboardSocketOptions): UseLeaderboardSocketReturn {
    const { type, operation, timeFilter, onUpdate } = options;
    const { data: session } = useSession();
    
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<LeaderboardUpdate | null>(null);
    const [updateCount, setUpdateCount] = useState(0);
    
    const subscriptionRef = useRef<{ type: string; operation: string; timeFilter: string } | null>(null);
    const onUpdateRef = useRef(onUpdate);
    
    // Keep callback ref up to date
    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);
    
    // Connect to presence socket for leaderboard updates
    useEffect(() => {
        if (!session?.user?.id) return;

        // Create socket connection if not exists
        if (!leaderboardSocket) {
            const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
            leaderboardSocket = io(`${socketUrl}/presence`, {
                path: '/api/socket/arena',
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });
        }

        const socket = leaderboardSocket;

        const handleConnect = () => {
            setIsConnected(true);
            console.log('[Leaderboard Socket] Connected');
            
            // Subscribe to the leaderboard
            socket.emit('leaderboard:subscribe', { type, operation, timeFilter });
            subscriptionRef.current = { type, operation, timeFilter };
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            console.log('[Leaderboard Socket] Disconnected');
        };

        const handleUpdate = (data: LeaderboardUpdate) => {
            // Only process updates for our subscribed leaderboard
            if (data.type === type && data.operation === operation && data.timeFilter === timeFilter) {
                console.log('[Leaderboard Socket] Update received:', data);
                setLastUpdate(data);
                setUpdateCount(prev => prev + 1);
                onUpdateRef.current?.(data);
            }
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('leaderboard:update', handleUpdate);

        // If already connected, subscribe immediately
        if (socket.connected) {
            socket.emit('leaderboard:subscribe', { type, operation, timeFilter });
            subscriptionRef.current = { type, operation, timeFilter };
            // Defer to avoid setState in effect warning
            setTimeout(() => {
                setIsConnected(true);
            }, 0);
        }

        return () => {
            // Unsubscribe when component unmounts or subscription changes
            if (subscriptionRef.current) {
                socket.emit('leaderboard:unsubscribe', subscriptionRef.current);
                subscriptionRef.current = null;
            }
            
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('leaderboard:update', handleUpdate);
        };
    }, [session?.user?.id, type, operation, timeFilter]);

    // Handle subscription changes without reconnecting
    useEffect(() => {
        if (!leaderboardSocket || !leaderboardSocket.connected) return;
        
        const socket = leaderboardSocket;
        
        // Unsubscribe from old subscription
        if (subscriptionRef.current) {
            socket.emit('leaderboard:unsubscribe', subscriptionRef.current);
        }
        
        // Subscribe to new subscription
        socket.emit('leaderboard:subscribe', { type, operation, timeFilter });
        subscriptionRef.current = { type, operation, timeFilter };
        
        console.log(`[Leaderboard Socket] Switched subscription to ${type}:${operation}:${timeFilter}`);
    }, [type, operation, timeFilter]);

    return {
        isConnected,
        lastUpdate,
        updateCount,
    };
}

/**
 * Disconnect the leaderboard socket (call on page leave)
 */
export function disconnectLeaderboardSocket() {
    if (leaderboardSocket) {
        leaderboardSocket.disconnect();
        leaderboardSocket = null;
    }
}


