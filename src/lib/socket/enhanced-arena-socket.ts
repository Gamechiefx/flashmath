'use client';

/* eslint-disable react-hooks/immutability, react-hooks/purity */
/* eslint-disable @typescript-eslint/no-explicit-any -- Socket.IO event handlers and state use any types */
// TODO: Refactor callback order - callbacks are used before declaration due to complex interdependencies
// This requires architectural changes to use refs for callbacks or restructure the hook

/**
 * Enhanced Arena WebSocket Hook with Improved Synchronization
 * 
 * Feature: bug-fixes-ui-optimization
 * Task: 2. Real-Time Match Synchronization Enhancement
 * 
 * Enhancements:
 * - Optimized Socket.IO state updates for consistent player synchronization
 * - Lag compensation and state reconciliation algorithms
 * - Connection quality monitoring and adaptive performance
 * - Enhanced reconnection handling with state preservation
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Player {
    odName: string;
    odScore: number;
    odStreak: number;
    odQuestionsAnswered: number;
    odLastAnswerCorrect: boolean | null;
    odCurrentQuestion?: Question;
    odEquippedBanner?: string;
    odEquippedTitle?: string;
    odLevel?: number;
    odTier?: string;
    odRank?: string;
    odDivision?: string;
    odLastUpdateTime?: number;
    odSyncVersion?: number;
}

interface Question {
    question: string;
    answer: number;
    operation: string;
    distributedAt?: number;
    syncId?: string;
}

interface PerformanceStats {
    accuracy: number;
    avgSpeedMs: number;
    maxStreak: number;
    aps: number;
}

export type ConnectionState = 'GREEN' | 'YELLOW' | 'RED';

interface ConnectionMetrics {
    rtt: number;
    jitter: number;
    loss: number;
    state: ConnectionState;
    disconnects: number;
    lastPing?: number;
    stability?: number;
}

interface ConnectionStates {
    [playerId: string]: ConnectionMetrics;
}

interface SyncState {
    version: number;
    lastUpdate: number;
    pendingUpdates: Map<string, any>;
    conflictResolution: 'server' | 'client' | 'merge';
}

interface LagCompensation {
    enabled: boolean;
    averageLatency: number;
    timeOffset: number;
    predictionBuffer: number;
}

interface UseEnhancedArenaSocketOptions {
    matchId: string;
    userId: string;
    userName: string;
    operation: string;
    userRank?: string;
    userDivision?: string;
    userLevel?: number;
    userBanner?: string;
    userTitle?: string;
    isAiMatch?: boolean;
    
    // Enhanced options
    enableLagCompensation?: boolean;
    maxReconnectAttempts?: number;
    syncUpdateInterval?: number;
    connectionQualityThreshold?: {
        green: number;
        yellow: number;
    };
    
    // Callbacks
    onMatchStart?: (data: any) => void;
    onAnswerResult?: (data: any) => void;
    onNewQuestion?: (data: any) => void;
    onTimeUpdate?: (data: any) => void;
    onMatchEnd?: (data: any) => void;
    onPlayerJoined?: (data: any) => void;
    onPlayerLeft?: (data: any) => void;
    onPlayerForfeit?: (data: any) => void;
    onConnectionStatesUpdate?: (states: ConnectionStates) => void;
    onSyncConflict?: (conflict: any) => void;
    onReconnectionAttempt?: (attempt: number) => void;
}

export function useEnhancedArenaSocket(options: UseEnhancedArenaSocketOptions) {
    const {
        matchId,
        userId,
        userName,
        operation,
        userRank,
        userDivision,
        userLevel,
        userBanner,
        userTitle,
        isAiMatch,
        enableLagCompensation = true,
        maxReconnectAttempts = 5,
        syncUpdateInterval = 1000,
        connectionQualityThreshold: _connectionQualityThreshold = { green: 100, yellow: 300 },
        onMatchStart,
        onAnswerResult,
        onNewQuestion,
        onTimeUpdate,
        onMatchEnd,
        onPlayerJoined: _onPlayerJoined,
        onPlayerLeft: _onPlayerLeft,
        onPlayerForfeit,
        onConnectionStatesUpdate,
        onSyncConflict,
        onReconnectionAttempt,
    } = options;

    // Socket and connection state
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    
    // Match state
    const [players, setPlayers] = useState<Record<string, Player>>({});
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [timeLeft, setTimeLeft] = useState(60);
    const [matchStarted, setMatchStarted] = useState(false);
    const [matchEnded, setMatchEnded] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(true);
    const [opponentForfeited, setOpponentForfeited] = useState<string | null>(null);
    
    // Enhanced synchronization state
    const [syncState, setSyncState] = useState<SyncState>({
        version: 0,
        lastUpdate: Date.now(),
        pendingUpdates: new Map(),
        conflictResolution: 'server'
    });
    
    const [lagCompensation, setLagCompensation] = useState<LagCompensation>({
        enabled: enableLagCompensation,
        averageLatency: 0,
        timeOffset: 0,
        predictionBuffer: 100
    });
    
    // Performance and connection monitoring
    const [performanceStats, setPerformanceStats] = useState<Record<string, PerformanceStats>>({});
    const [connectionStates, setConnectionStates] = useState<ConnectionStates>({});
    const [matchIntegrity, setMatchIntegrity] = useState<ConnectionState>('GREEN');
    
    // Connection quality monitoring
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const latencyHistoryRef = useRef<number[]>([]);
    const lastPingTimeRef = useRef<number>(0);
    const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    // State preservation for reconnection
    const preservedStateRef = useRef<{
        players: Record<string, Player>;
        currentQuestion: Question | null;
        timeLeft: number;
        matchStarted: boolean;
        syncVersion: number;
    } | null>(null);
    
    // Refs for callbacks to avoid dependency issues
    const callbacksRef = useRef({
        onMatchStart,
        onAnswerResult,
        onNewQuestion,
        onTimeUpdate,
        onMatchEnd,
        onPlayerForfeit,
        onConnectionStatesUpdate,
        onReconnectionAttempt,
    });
    
    // Keep callbacks ref up to date
    useEffect(() => {
        callbacksRef.current = {
            onMatchStart,
            onAnswerResult,
            onNewQuestion,
            onTimeUpdate,
            onMatchEnd,
            onPlayerForfeit,
            onConnectionStatesUpdate,
            onReconnectionAttempt,
        };
    }, [onMatchStart, onAnswerResult, onNewQuestion, onTimeUpdate, onMatchEnd, onPlayerForfeit, onConnectionStatesUpdate, onReconnectionAttempt]);

    // Enhanced connection with improved retry logic and state preservation
    const connectWithEnhancedRetry = useCallback((attempt = 1) => {
        console.log(`[Enhanced Arena Socket] Connection attempt ${attempt}/${maxReconnectAttempts}`);
        callbacksRef.current.onReconnectionAttempt?.(attempt);
        
        const socket = io({
            path: '/api/socket/arena',
            transports: ['websocket', 'polling'],
            timeout: 20000,
            reconnection: true,
            reconnectionAttempts: maxReconnectAttempts,
            reconnectionDelay: Math.min(1000 * Math.pow(2, attempt - 1), 10000), // Exponential backoff
            reconnectionDelayMax: 10000,
            forceNew: attempt > 1,
        });

        socketRef.current = socket;

        // Connection timeout with adaptive timing
        connectionTimeoutRef.current = setTimeout(() => {
            if (!connected) {
                console.log('[Enhanced Arena Socket] Connection timeout, retrying...');
                socket.disconnect();
                
                if (attempt < maxReconnectAttempts) {
                    setReconnectAttempts(attempt);
                    setTimeout(() => connectWithEnhancedRetry(attempt + 1), 2000 * attempt);
                } else {
                    console.error('[Enhanced Arena Socket] Max reconnection attempts reached');
                    // Preserve state for manual reconnection
                    preserveCurrentState();
                }
            }
        }, 15000 + (attempt * 5000)); // Increase timeout with attempts

        socket.on('connect', () => {
            console.log('[Enhanced Arena Socket] Connected successfully');
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            setConnected(true);
            setReconnectAttempts(0);

            // Join match with enhanced data and state restoration request
            socket.emit('join_match', {
                matchId,
                userId,
                userName,
                operation,
                isAiMatch,
                userRank: userRank || 'Bronze',
                userDivision: userDivision || 'I',
                userLevel: userLevel || 1,
                userBanner: userBanner || 'default',
                userTitle: userTitle || 'Challenger',
                timestamp: Date.now(),
                syncVersion: syncState.version,
                requestStateRestore: preservedStateRef.current !== null,
                preservedState: preservedStateRef.current
            });

            // Start connection quality monitoring
            startConnectionMonitoring();
        });

        socket.on('connect_error', (error) => {
            console.error('[Enhanced Arena Socket] Connection error:', error.message);
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            setConnected(false);
            
            if (attempt < maxReconnectAttempts) {
                setTimeout(() => connectWithEnhancedRetry(attempt + 1), 2000 * attempt);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('[Enhanced Arena Socket] Disconnected:', reason);
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            setConnected(false);
            
            // Preserve current state before attempting reconnection
            preserveCurrentState();
            
            // Stop connection monitoring
            stopConnectionMonitoring();
            
            // Auto-reconnect for certain disconnect reasons
            if (reason === 'io server disconnect' || reason === 'transport close') {
                setTimeout(() => connectWithEnhancedRetry(1), 1000);
            }
        });

        // Enhanced state synchronization handlers
        socket.on('match_state_sync', (data) => {
            console.log('[Enhanced Arena Socket] Received state sync:', data);
            handleStateSynchronization(data);
        });

        socket.on('state_conflict', (data) => {
            console.log('[Enhanced Arena Socket] State conflict detected:', data);
            handleStateConflict(data);
        });

        // Enhanced match event handlers with lag compensation
        socket.on('match_start', (data) => {
            console.log('[Enhanced Arena Socket] Match started:', data);
            const compensatedData = applyLagCompensation(data);
            
            setMatchStarted(true);
            setWaitingForOpponent(false);
            setPlayers(compensatedData.players);
            setCurrentQuestion(compensatedData.question);
            setTimeLeft(compensatedData.timeLeft);
            
            updateSyncState(data.syncVersion || syncState.version + 1);
            callbacksRef.current.onMatchStart?.(compensatedData);
        });

        socket.on('answer_result', (data) => {
            console.log('[Enhanced Arena Socket] Answer result:', data);
            const compensatedData = applyLagCompensation(data);
            
            // Enhanced player state update with conflict resolution
            setPlayers(prev => {
                const newPlayers = { ...compensatedData.odPlayers };
                
                // Preserve local knowledge and resolve conflicts
                Object.keys(prev).forEach(pid => {
                    if (newPlayers[pid] && prev[pid]) {
                        // Merge states with server authority for scores
                        newPlayers[pid] = {
                            ...prev[pid],
                            ...newPlayers[pid],
                            odLastUpdateTime: Date.now(),
                            odSyncVersion: data.syncVersion || (prev[pid].odSyncVersion || 0) + 1
                        };
                        
                        // Preserve current question if not in update
                        if (!newPlayers[pid].odCurrentQuestion && prev[pid].odCurrentQuestion) {
                            newPlayers[pid].odCurrentQuestion = prev[pid].odCurrentQuestion;
                        }
                    }
                });
                
                return newPlayers;
            });
            
            updateSyncState(data.syncVersion);
            callbacksRef.current.onAnswerResult?.(compensatedData);
        });

        socket.on('new_question', (data) => {
            console.log('[Enhanced Arena Socket] New question:', data);
            const compensatedData = applyLagCompensation(data);
            
            // Add sync metadata to question
            const enhancedQuestion = {
                ...compensatedData.question,
                distributedAt: Date.now(),
                syncId: data.syncId || `q-${Date.now()}-${Math.random().toString(36).substring(7)}`
            };
            
            setCurrentQuestion(enhancedQuestion);
            updateSyncState(data.syncVersion);
            callbacksRef.current.onNewQuestion?.(compensatedData);
        });

        socket.on('time_update', (data) => {
            const compensatedTime = applyTimeCompensation(data.timeLeft);
            setTimeLeft(compensatedTime);
            callbacksRef.current.onTimeUpdate?.({ ...data, timeLeft: compensatedTime });
        });

        // Connection quality monitoring
        socket.on('connection_ping', (data: { t: number; syncVersion?: number }) => {
            const now = Date.now();
            const rtt = now - data.t;
            
            // Update latency history
            latencyHistoryRef.current.push(rtt);
            if (latencyHistoryRef.current.length > 10) {
                latencyHistoryRef.current.shift();
            }
            
            // Calculate average latency for lag compensation
            const avgLatency = latencyHistoryRef.current.reduce((sum, lat) => sum + lat, 0) / latencyHistoryRef.current.length;
            
            setLagCompensation(prev => ({
                ...prev,
                averageLatency: avgLatency,
                timeOffset: avgLatency / 2
            }));
            
            // Respond with pong including sync version
            socket.emit('connection_pong', { 
                t: data.t, 
                matchId, 
                userId,
                syncVersion: syncState.version,
                clientTime: now
            });
        });

        socket.on('connection_states', (data: { states: ConnectionStates }) => {
            setConnectionStates(data.states);
            
            // Update match integrity based on connection states
            const playerStates = Object.values(data.states);
            const redConnections = playerStates.filter(s => s.state === 'RED').length;
            const yellowConnections = playerStates.filter(s => s.state === 'YELLOW').length;
            
            let integrity: ConnectionState = 'GREEN';
            if (redConnections > 0) {
                integrity = 'RED';
            } else if (yellowConnections > 0) {
                integrity = 'YELLOW';
            }
            
            setMatchIntegrity(integrity);
            callbacksRef.current.onConnectionStatesUpdate?.(data.states);
        });

        // Other event handlers remain the same but with enhanced error handling
        socket.on('match_end', (data) => {
            console.log('[Enhanced Arena Socket] Match ended:', data);
            setMatchEnded(true);
            setPlayers(data.players);
            if (data.performanceStats) {
                setPerformanceStats(data.performanceStats);
            }
            if (data.matchIntegrity) {
                setMatchIntegrity(data.matchIntegrity);
            }
            
            // Clear preserved state on match end
            preservedStateRef.current = null;
            
            callbacksRef.current.onMatchEnd?.(data);
        });

        socket.on('player_forfeit', (data) => {
            console.log('[Enhanced Arena Socket] Player forfeited:', data);
            setMatchEnded(true);
            setOpponentForfeited(data.odForfeitedUserName);
            callbacksRef.current.onPlayerForfeit?.(data);
        });

        return () => {
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            stopConnectionMonitoring();
            socket.emit('leave_match', { matchId, userId });
            socket.disconnect();
        };
    }, [matchId, userId, userName, operation, isAiMatch, maxReconnectAttempts, syncState.version, stopConnectionMonitoring, connected, preserveCurrentState, applyLagCompensation, handleStateSynchronization, handleStateConflict, applyTimeCompensation, updateSyncState, userRank, userDivision, userLevel, userBanner, userTitle, startConnectionMonitoring]);

    // State preservation for reconnection
    const preserveCurrentState = useCallback(() => {
        preservedStateRef.current = {
            players,
            currentQuestion,
            timeLeft,
            matchStarted,
            syncVersion: syncState.version
        };
        console.log('[Enhanced Arena Socket] State preserved for reconnection');
    }, [players, currentQuestion, timeLeft, matchStarted, syncState.version]);

    // Enhanced state synchronization
    const handleStateSynchronization = useCallback((data: any) => {
        const { syncVersion, players: serverPlayers, question, timeLeft: serverTimeLeft } = data;
        
        // Check for sync conflicts
        if (syncVersion < syncState.version) {
            console.warn('[Enhanced Arena Socket] Received outdated sync data');
            return;
        }
        
        // Apply server state with conflict resolution
        setPlayers(prev => {
            const merged = { ...prev };
            
            Object.keys(serverPlayers).forEach(playerId => {
                const serverPlayer = serverPlayers[playerId];
                const localPlayer = prev[playerId];
                
                if (!localPlayer) {
                    merged[playerId] = serverPlayer;
                } else {
                    // Merge with server authority for critical fields
                    merged[playerId] = {
                        ...localPlayer,
                        odScore: serverPlayer.odScore, // Server authority
                        odQuestionsAnswered: serverPlayer.odQuestionsAnswered, // Server authority
                        odStreak: serverPlayer.odStreak, // Server authority
                        odName: serverPlayer.odName || localPlayer.odName,
                        odEquippedBanner: serverPlayer.odEquippedBanner || localPlayer.odEquippedBanner,
                        odEquippedTitle: serverPlayer.odEquippedTitle || localPlayer.odEquippedTitle,
                        odLastUpdateTime: Date.now(),
                        odSyncVersion: syncVersion
                    };
                }
            });
            
            return merged;
        });
        
        if (question) {
            setCurrentQuestion(question);
        }
        
        if (serverTimeLeft !== undefined) {
            setTimeLeft(applyTimeCompensation(serverTimeLeft));
        }
        
        updateSyncState(syncVersion);
    }, [syncState.version, applyTimeCompensation, updateSyncState]);

    // Handle state conflicts
    const handleStateConflict = useCallback((conflict: any) => {
        console.warn('[Enhanced Arena Socket] Handling state conflict:', conflict);
        
        // Default to server resolution
        switch (syncState.conflictResolution) {
            case 'server':
                // Accept server state
                handleStateSynchronization(conflict.serverState);
                break;
            case 'client':
                // Keep client state (risky)
                console.warn('[Enhanced Arena Socket] Keeping client state despite conflict');
                break;
            case 'merge':
                // Attempt to merge states
                // Implementation would depend on specific conflict type
                break;
        }
        
        onSyncConflict?.(conflict);
    }, [syncState.conflictResolution, handleStateSynchronization, onSyncConflict]);

    // Lag compensation
    const applyLagCompensation = useCallback((data: any) => {
        if (!lagCompensation.enabled) return data;
        
        // Apply time-based compensation for time-sensitive data
        const compensated = { ...data };
        
        if (data.timestamp) {
            const networkDelay = lagCompensation.averageLatency;
            const timeDiff = Date.now() - data.timestamp - networkDelay;
            
            // Adjust time-sensitive values
            if (data.timeLeft !== undefined) {
                compensated.timeLeft = Math.max(0, data.timeLeft - Math.floor(timeDiff / 1000));
            }
        }
        
        return compensated;
    }, [lagCompensation]);

    // Time compensation for timer updates
    const applyTimeCompensation = useCallback((serverTime: number) => {
        if (!lagCompensation.enabled) return serverTime;
        
        // Compensate for network latency
        const compensatedTime = serverTime - Math.floor(lagCompensation.timeOffset / 1000);
        return Math.max(0, compensatedTime);
    }, [lagCompensation]);

    // Update sync state
    const updateSyncState = useCallback((newVersion?: number) => {
        if (newVersion && newVersion > syncState.version) {
            setSyncState(prev => ({
                ...prev,
                version: newVersion,
                lastUpdate: Date.now()
            }));
        }
    }, [syncState.version]);

    // Connection quality monitoring
    const startConnectionMonitoring = useCallback(() => {
        if (pingIntervalRef.current) return;
        
        pingIntervalRef.current = setInterval(() => {
            if (socketRef.current?.connected) {
                lastPingTimeRef.current = Date.now();
                socketRef.current.emit('connection_ping', { t: lastPingTimeRef.current });
            }
        }, syncUpdateInterval);
    }, [syncUpdateInterval]);

    const stopConnectionMonitoring = useCallback(() => {
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
        }
    }, []);

    // Enhanced submit answer with optimistic updates and conflict resolution
    const submitAnswer = useCallback((userAnswer: number) => {
        if (socketRef.current && connected && currentQuestion) {
            const timestamp = Date.now();
            
            // Optimistic update for immediate feedback
            const optimisticUpdate = {
                timestamp,
                answer: userAnswer,
                questionId: currentQuestion.syncId || 'unknown',
                predicted: true
            };
            
            // Add to pending updates for conflict resolution
            setSyncState(prev => {
                const newPending = new Map(prev.pendingUpdates);
                newPending.set(`answer-${timestamp}`, optimisticUpdate);
                return {
                    ...prev,
                    pendingUpdates: newPending
                };
            });
            
            socketRef.current.emit('submit_answer', {
                matchId,
                odUserId: userId,
                userAnswer,
                timestamp,
                syncVersion: syncState.version,
                lagCompensation: lagCompensation.averageLatency
            });
        }
    }, [matchId, userId, connected, currentQuestion, syncState.version, lagCompensation.averageLatency]);

    const leaveMatch = useCallback(() => {
        if (socketRef.current) {
            socketRef.current.emit('leave_match', { matchId, userId });
            socketRef.current.disconnect();
        }
        stopConnectionMonitoring();
    }, [matchId, userId, stopConnectionMonitoring]);

    // Initialize connection
    useEffect(() => {
        if (!userId) return;
        
        const cleanup = connectWithEnhancedRetry(1);
        
        return () => {
            cleanup();
            stopConnectionMonitoring();
        };
    }, [connectWithEnhancedRetry, stopConnectionMonitoring, userId]);

    return {
        // Basic state
        connected,
        players,
        currentQuestion,
        timeLeft,
        matchStarted,
        matchEnded,
        waitingForOpponent,
        opponentForfeited,
        performanceStats,
        connectionStates,
        matchIntegrity,
        
        // Enhanced state
        syncState,
        lagCompensation,
        reconnectAttempts,
        
        // Actions
        submitAnswer,
        leaveMatch,
        
        // Enhanced actions
        preserveCurrentState,
        forceSync: () => {
            if (socketRef.current?.connected) {
                socketRef.current.emit('request_sync', { 
                    matchId, 
                    userId, 
                    syncVersion: syncState.version 
                });
            }
        }
    };
}