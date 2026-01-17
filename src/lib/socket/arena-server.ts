/**
 * Arena WebSocket Server
 * Handles real-time sync for arena matches with enhanced reliability
 * 
 * Enhanced Features:
 * - Connection timeout handling
 * - State synchronization recovery
 * - Comprehensive logging for diagnostics
 * - Robust error recovery for failed match initialization
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

// Extend global to store arena logs
declare global {
    var arenaLogs: Array<{
        timestamp: string;
        level: string;
        event: string;
        matchId: string;
        details?: unknown;
    }> | undefined;
}

interface MatchState {
    matchId: string;
    players: {
        [odUserId: string]: {
            odName: string;
            odScore: number;
            odStreak: number;
            odQuestionsAnswered: number;
            odLastAnswerCorrect: boolean | null;
            odSocketId: string;
            odConnectedAt: number;
            odLastActivity: number;
            odConnectionState: 'GREEN' | 'YELLOW' | 'RED';
        };
    };
    currentQuestion: {
        question: string;
        answer: number;
        operation: string;
    };
    odTimeLeft: number;
    odStarted: boolean;
    odEnded: boolean;
    odOperation: string;
    odCreatedAt: number;
    odLastStateUpdate: number;
    odInitializationAttempts: number;
    odConnectionIssues: string[];
}

// Enhanced connection tracking
interface ConnectionMetrics {
    playerId: string;
    socketId: string;
    rtt: number;
    lastPing: number;
    disconnectCount: number;
    state: 'GREEN' | 'YELLOW' | 'RED';
}

// Store active matches with enhanced state
const activeMatches = new Map<string, MatchState>();

// Map socket IDs to match IDs
const socketToMatch = new Map<string, string>();

// Connection quality tracking
const connectionMetrics = new Map<string, ConnectionMetrics>();

// Match initialization timeouts
const initializationTimeouts = new Map<string, NodeJS.Timeout>();

// Enhanced logging function
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Logging details can be any type
function logArenaEvent(level: 'info' | 'warn' | 'error', matchId: string, event: string, details?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        matchId,
        event,
        details: details || {}
    };
    
    console.log(`[Arena ${level.toUpperCase()}] ${timestamp} - Match ${matchId}: ${event}`, 
                details ? JSON.stringify(details, null, 2) : '');
    
    // Store diagnostic logs for debugging
    if (!global.arenaLogs) global.arenaLogs = [];
    global.arenaLogs.push(logEntry);
    
    // Keep only last 1000 log entries
    if (global.arenaLogs.length > 1000) {
        global.arenaLogs = global.arenaLogs.slice(-1000);
    }
}

// Connection quality monitoring
function updateConnectionMetrics(playerId: string, socketId: string, rtt?: number) {
    const existing = connectionMetrics.get(playerId);
    const now = Date.now();
    
    const metrics: ConnectionMetrics = {
        playerId,
        socketId,
        rtt: rtt || existing?.rtt || 0,
        lastPing: now,
        disconnectCount: existing?.disconnectCount || 0,
        state: 'GREEN'
    };
    
    // Determine connection state based on RTT
    if (metrics.rtt > 200) {
        metrics.state = 'RED';
    } else if (metrics.rtt > 100) {
        metrics.state = 'YELLOW';
    }
    
    connectionMetrics.set(playerId, metrics);
    return metrics;
}

// Enhanced match initialization with timeout handling
function initializeMatch(matchId: string, operation: string): MatchState {
    logArenaEvent('info', matchId, 'Match initialization started', { operation });
    
    const match: MatchState = {
        matchId,
        players: {},
        currentQuestion: generateQuestion(operation),
        odTimeLeft: 60,
        odStarted: false,
        odEnded: false,
        odOperation: operation,
        odCreatedAt: Date.now(),
        odLastStateUpdate: Date.now(),
        odInitializationAttempts: 1,
        odConnectionIssues: []
    };
    
    activeMatches.set(matchId, match);
    
    // Set initialization timeout (30 seconds)
    const timeout = setTimeout(() => {
        const currentMatch = activeMatches.get(matchId);
        if (currentMatch && !currentMatch.odStarted) {
            logArenaEvent('warn', matchId, 'Match initialization timeout', {
                playerCount: Object.keys(currentMatch.players).length,
                attempts: currentMatch.odInitializationAttempts
            });
            
            // Try to recover or clean up
            if (Object.keys(currentMatch.players).length === 0) {
                activeMatches.delete(matchId);
                logArenaEvent('info', matchId, 'Empty match cleaned up after timeout');
            } else {
                // Attempt to restart initialization
                attemptMatchRecovery(matchId);
            }
        }
        initializationTimeouts.delete(matchId);
    }, 30000);
    
    initializationTimeouts.set(matchId, timeout);
    return match;
}

// Match recovery mechanism
function attemptMatchRecovery(matchId: string) {
    const match = activeMatches.get(matchId);
    if (!match) return;
    
    logArenaEvent('info', matchId, 'Attempting match recovery', {
        playerCount: Object.keys(match.players).length,
        attempts: match.odInitializationAttempts
    });
    
    match.odInitializationAttempts++;
    match.odLastStateUpdate = Date.now();
    
    // Resync all players
    Object.keys(match.players).forEach(playerId => {
        const player = match.players[playerId];
        const socket = io?.sockets.sockets.get(player.odSocketId);
        
        if (socket) {
            // Send fresh match state
            socket.emit('match_state', {
                players: match.players,
                question: match.currentQuestion,
                timeLeft: match.odTimeLeft,
                started: match.odStarted,
                ended: match.odEnded,
            });
            
            logArenaEvent('info', matchId, 'Player resynced', { playerId, playerName: player.odName });
        } else {
            logArenaEvent('warn', matchId, 'Player socket not found during recovery', { playerId });
            match.odConnectionIssues.push(`Player ${playerId} socket lost during recovery`);
        }
    });
    
    // Try to start match if we have enough players
    if (Object.keys(match.players).length >= 2 && !match.odStarted) {
        startMatch(matchId);
    }
}

// Enhanced match start with better synchronization
function startMatch(matchId: string) {
    const match = activeMatches.get(matchId);
    if (!match || match.odStarted) return;
    
    logArenaEvent('info', matchId, 'Starting match', {
        playerCount: Object.keys(match.players).length,
        players: Object.keys(match.players)
    });
    
    match.odStarted = true;
    match.odLastStateUpdate = Date.now();
    
    // Clear initialization timeout
    const timeout = initializationTimeouts.get(matchId);
    if (timeout) {
        clearTimeout(timeout);
        initializationTimeouts.delete(matchId);
    }
    
    // Broadcast match start with enhanced synchronization
    const startData = {
        question: match.currentQuestion,
        timeLeft: match.odTimeLeft,
        players: match.players,
        timestamp: Date.now()
    };
    
    io!.to(matchId).emit('match_start', startData);
    
    // Start the timer with enhanced error handling
    const timerInterval = setInterval(() => {
        const m = activeMatches.get(matchId);
        if (!m || m.odEnded) {
            clearInterval(timerInterval);
            return;
        }
        
        try {
            m.odTimeLeft--;
            m.odLastStateUpdate = Date.now();
            
            const timeData = { 
                timeLeft: m.odTimeLeft,
                timestamp: Date.now()
            };
            
            io!.to(matchId).emit('time_update', timeData);
            
            if (m.odTimeLeft <= 0) {
                clearInterval(timerInterval);
                endMatch(matchId);
            }
        } catch (error) {
            logArenaEvent('error', matchId, 'Timer error', { error: (error as Error)?.message || String(error) });
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Enhanced match end handling
function endMatch(matchId: string) {
    const match = activeMatches.get(matchId);
    if (!match) return;
    
    logArenaEvent('info', matchId, 'Ending match', {
        playerCount: Object.keys(match.players).length,
        duration: Date.now() - match.odCreatedAt
    });
    
    match.odEnded = true;
    match.odLastStateUpdate = Date.now();
    
    io!.to(matchId).emit('match_end', { 
        players: match.players,
        timestamp: Date.now()
    });
    
    // Clean up after delay to allow final state sync
    setTimeout(() => {
        activeMatches.delete(matchId);
        logArenaEvent('info', matchId, 'Match cleaned up');
    }, 5000);
}
// Math symbol operators
const OPERATORS = {
    addition: { symbol: '+', fn: (a: number, b: number) => a + b },
    subtraction: { symbol: '−', fn: (a: number, b: number) => a - b },
    multiplication: { symbol: '×', fn: (a: number, b: number) => a * b },
    division: { symbol: '÷', fn: (a: number, b: number) => Math.floor(a / b) },
};

function generateQuestion(operation: string): { question: string; answer: number; operation: string } {
    const ops = ['addition', 'subtraction', 'multiplication', 'division'];
    const op = operation === 'mixed' ? ops[Math.floor(Math.random() * ops.length)] : operation;
    const opConfig = OPERATORS[op as keyof typeof OPERATORS] || OPERATORS.addition;

    let a: number, b: number, answer: number;

    switch (op) {
        case 'addition':
            a = Math.floor(Math.random() * 50) + 1;
            b = Math.floor(Math.random() * 50) + 1;
            answer = a + b;
            break;
        case 'subtraction':
            a = Math.floor(Math.random() * 50) + 20;
            b = Math.floor(Math.random() * Math.min(a - 1, 30)) + 1;
            answer = a - b;
            break;
        case 'multiplication':
            a = Math.floor(Math.random() * 12) + 1;
            b = Math.floor(Math.random() * 12) + 1;
            answer = a * b;
            break;
        case 'division':
            b = Math.floor(Math.random() * 10) + 2;
            answer = Math.floor(Math.random() * 10) + 1;
            a = b * answer;
            break;
        default:
            a = Math.floor(Math.random() * 20) + 1;
            b = Math.floor(Math.random() * 20) + 1;
            answer = a + b;
    }

    return {
        question: `${a} ${opConfig.symbol} ${b}`,
        answer,
        operation: op,
    };
}

let io: SocketIOServer | null = null;

export function initializeSocketServer(httpServer: HTTPServer): SocketIOServer {
    if (io) return io;

    io = new SocketIOServer(httpServer, {
        path: '/api/socket/arena',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        // Enhanced connection settings for reliability
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        allowEIO3: true,
    });

    io.on('connection', (socket: Socket) => {
        logArenaEvent('info', 'server', 'Client connected', { socketId: socket.id });

        // Connection quality monitoring
        socket.on('connection_pong', (data: { t: number; matchId: string; userId: string }) => {
            const rtt = Date.now() - data.t;
            updateConnectionMetrics(data.userId, socket.id, rtt);
            
            // Broadcast connection states to match
            if (data.matchId) {
                const match = activeMatches.get(data.matchId);
                if (match) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match state can be any type
                    const states: Record<string, any> = {};
                    Object.keys(match.players).forEach(playerId => {
                        const metrics = connectionMetrics.get(playerId);
                        if (metrics) {
                            states[playerId] = {
                                state: metrics.state,
                                rtt: metrics.rtt
                            };
                        }
                    });
                    
                    io!.to(data.matchId).emit('connection_states', { states });
                }
            }
        });

        // Enhanced player join with better error handling
        socket.on('join_match', async (data: { 
            matchId: string; 
            userId: string; 
            userName: string; 
            operation: string;
            userRank?: string;
            userDivision?: string;
            userLevel?: number;
            userBanner?: string;
            userTitle?: string;
        }) => {
            try {
                const { matchId, userId, userName, operation } = data;

                logArenaEvent('info', matchId, 'Player joining match', { 
                    userId, 
                    userName, 
                    socketId: socket.id 
                });

                socket.join(matchId);
                socketToMatch.set(socket.id, matchId);

                // Get or create match state with enhanced initialization
                let match = activeMatches.get(matchId);
                if (!match) {
                    match = initializeMatch(matchId, operation);
                }

                // Add player to match with enhanced tracking
                const now = Date.now();
                match.players[userId] = {
                    odName: userName,
                    odScore: 0,
                    odStreak: 0,
                    odQuestionsAnswered: 0,
                    odLastAnswerCorrect: null,
                    odSocketId: socket.id,
                    odConnectedAt: now,
                    odLastActivity: now,
                    odConnectionState: 'GREEN'
                };

                // Initialize connection metrics
                updateConnectionMetrics(userId, socket.id);

                logArenaEvent('info', matchId, 'Player joined successfully', {
                    userId,
                    userName,
                    totalPlayers: Object.keys(match.players).length
                });

                // Notify all players in match
                io!.to(matchId).emit('player_joined', {
                    players: match.players,
                    playerId: userId,
                    playerName: userName,
                });

                // Send current state to the joining player
                socket.emit('match_state', {
                    players: match.players,
                    question: match.currentQuestion,
                    timeLeft: match.odTimeLeft,
                    started: match.odStarted,
                    ended: match.odEnded,
                });

                // Start match if we have enough players
                if (Object.keys(match.players).length >= 2 && !match.odStarted) {
                    // Small delay to ensure all clients are ready
                    setTimeout(() => {
                        startMatch(matchId);
                    }, 1000);
                }

                // Start connection quality monitoring
                const pingInterval = setInterval(() => {
                    const currentMatch = activeMatches.get(matchId);
                    if (!currentMatch || currentMatch.odEnded || !currentMatch.players[userId]) {
                        clearInterval(pingInterval);
                        return;
                    }
                    
                    socket.emit('connection_ping', { t: Date.now() });
                }, 5000);

            } catch (error) {
                logArenaEvent('error', data.matchId || 'unknown', 'Join match error', {
                    error: (error as Error)?.message || String(error),
                    userId: data.userId,
                    socketId: socket.id
                });
                
                socket.emit('match_error', {
                    type: 'JOIN_FAILED',
                    message: 'Failed to join match. Please try again.',
                    error: (error as Error)?.message || String(error)
                });
            }
        });

        // Enhanced answer submission with better error handling
        socket.on('submit_answer', (data: { matchId: string; odUserId: string; userAnswer: number }) => {
            try {
                const { matchId, odUserId, userAnswer } = data;
                const match = activeMatches.get(matchId);
                
                if (!match || match.odEnded) {
                    logArenaEvent('warn', matchId, 'Answer submitted to invalid match', { 
                        userId: odUserId, 
                        matchExists: !!match,
                        matchEnded: match?.odEnded 
                    });
                    return;
                }

                const player = match.players[odUserId];
                if (!player) {
                    logArenaEvent('warn', matchId, 'Answer submitted by unknown player', { userId: odUserId });
                    return;
                }

                const isCorrect = userAnswer === match.currentQuestion.answer;

                logArenaEvent('info', matchId, 'Answer submitted', {
                    userId: odUserId,
                    answer: userAnswer,
                    correct: isCorrect,
                    expectedAnswer: match.currentQuestion.answer
                });

                // Update player stats
                if (isCorrect) {
                    player.odScore += 100;
                    player.odStreak++;
                } else {
                    player.odStreak = 0;
                }
                player.odQuestionsAnswered++;
                player.odLastAnswerCorrect = isCorrect;
                player.odLastActivity = Date.now();

                match.odLastStateUpdate = Date.now();

                // Generate new question for this player (personal progression)
                const newQuestion = generateQuestion(match.odOperation);

                // Broadcast update to all players with enhanced synchronization
                const answerData = {
                    odUserId,
                    odIsCorrect: isCorrect,
                    odPlayers: match.players,
                    timestamp: Date.now()
                };

                io!.to(matchId).emit('answer_result', answerData);

                // Send new question only to the player who answered
                socket.emit('new_question', {
                    question: newQuestion,
                    timestamp: Date.now()
                });

                // Update opponent's question display
                Object.keys(match.players).forEach(playerId => {
                    if (playerId !== odUserId) {
                        const otherSocket = io?.sockets.sockets.get(match.players[playerId].odSocketId);
                        if (otherSocket) {
                            otherSocket.emit('opponent_question_update', {
                                odUserId,
                                question: newQuestion
                            });
                        }
                    }
                });

            } catch (error) {
                logArenaEvent('error', data.matchId, 'Submit answer error', {
                    error: (error as Error)?.message || String(error),
                    userId: data.odUserId
                });
            }
        });

        // Enhanced disconnect handling
        socket.on('disconnect', (reason) => {
            const matchId = socketToMatch.get(socket.id);
            
            logArenaEvent('info', matchId || 'unknown', 'Client disconnected', {
                socketId: socket.id,
                reason
            });
            
            if (matchId) {
                const match = activeMatches.get(matchId);
                if (match) {
                    // Find and handle the disconnected player
                    for (const [odUserId, player] of Object.entries(match.players)) {
                        if (player.odSocketId === socket.id) {
                            logArenaEvent('info', matchId, 'Player disconnected', {
                                userId: odUserId,
                                playerName: player.odName,
                                reason
                            });

                            // Update connection metrics
                            const metrics = connectionMetrics.get(odUserId);
                            if (metrics) {
                                metrics.disconnectCount++;
                                metrics.state = 'RED';
                            }

                            // Mark player as disconnected but keep in match for potential reconnection
                            player.odConnectionState = 'RED';
                            match.odConnectionIssues.push(`Player ${odUserId} disconnected: ${reason}`);
                            match.odLastStateUpdate = Date.now();

                            // Notify other players
                            io!.to(matchId).emit('player_left', { 
                                odUserId,
                                reason: 'disconnect',
                                timestamp: Date.now()
                            });

                            // Set timeout for player removal (30 seconds to reconnect)
                            setTimeout(() => {
                                const currentMatch = activeMatches.get(matchId);
                                if (currentMatch && currentMatch.players[odUserId] && 
                                    currentMatch.players[odUserId].odConnectionState === 'RED') {
                                    
                                    delete currentMatch.players[odUserId];
                                    connectionMetrics.delete(odUserId);
                                    
                                    logArenaEvent('info', matchId, 'Player removed after disconnect timeout', {
                                        userId: odUserId
                                    });

                                    // End match if no players left
                                    if (Object.keys(currentMatch.players).length === 0) {
                                        activeMatches.delete(matchId);
                                        logArenaEvent('info', matchId, 'Match cleaned up - no players remaining');
                                    }
                                }
                            }, 30000);

                            break;
                        }
                    }
                }
                socketToMatch.delete(socket.id);
            }
        });

        // Enhanced leave match handling
        socket.on('leave_match', (data: { matchId: string; userId: string }) => {
            try {
                const { matchId, userId } = data;
                
                logArenaEvent('info', matchId, 'Player leaving match', { userId });
                
                const match = activeMatches.get(matchId);
                if (match && match.players[userId]) {
                    delete match.players[userId];
                    connectionMetrics.delete(userId);
                    
                    socket.leave(matchId);
                    socketToMatch.delete(socket.id);
                    
                    match.odLastStateUpdate = Date.now();
                    
                    io!.to(matchId).emit('player_left', { 
                        odUserId: userId,
                        reason: 'leave',
                        timestamp: Date.now()
                    });

                    logArenaEvent('info', matchId, 'Player left successfully', {
                        userId,
                        remainingPlayers: Object.keys(match.players).length
                    });

                    // Clean up empty matches
                    if (Object.keys(match.players).length === 0) {
                        activeMatches.delete(matchId);
                        logArenaEvent('info', matchId, 'Match cleaned up - player left');
                    }
                }
            } catch (error) {
                logArenaEvent('error', data.matchId, 'Leave match error', {
                    error: (error as Error)?.message || String(error),
                    userId: data.userId
                });
            }
        });

        // Player forfeit handling
        socket.on('forfeit_match', (data: { matchId: string; userId: string }) => {
            try {
                const { matchId, userId } = data;
                
                logArenaEvent('info', matchId, 'Player forfeiting match', { userId });
                
                const match = activeMatches.get(matchId);
                if (match && match.players[userId]) {
                    const player = match.players[userId];
                    
                    // Notify other players of forfeit
                    io!.to(matchId).emit('player_forfeit', {
                        odForfeitedUserId: userId,
                        odForfeitedUserName: player.odName,
                        timestamp: Date.now()
                    });

                    // End the match
                    endMatch(matchId);
                }
            } catch (error) {
                logArenaEvent('error', data.matchId, 'Forfeit match error', {
                    error: (error as Error)?.message || String(error),
                    userId: data.userId
                });
            }
        });
    });

    console.log('[Arena Socket] Enhanced WebSocket server initialized with reliability features');
    return io;
}

// Enhanced diagnostic functions
export function getArenaServerDiagnostics() {
    return {
        activeMatches: activeMatches.size,
        connectedSockets: socketToMatch.size,
        connectionMetrics: Array.from(connectionMetrics.values()),
        recentLogs: global.arenaLogs?.slice(-50) || [],
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage()
    };
}

export function getMatchDiagnostics(matchId: string) {
    const match = activeMatches.get(matchId);
    if (!match) return null;
    
    return {
        matchId: match.matchId,
        playerCount: Object.keys(match.players).length,
        started: match.odStarted,
        ended: match.odEnded,
        timeLeft: match.odTimeLeft,
        createdAt: match.odCreatedAt,
        lastStateUpdate: match.odLastStateUpdate,
        initializationAttempts: match.odInitializationAttempts,
        connectionIssues: match.odConnectionIssues,
        players: Object.keys(match.players).map(playerId => ({
            id: playerId,
            name: match.players[playerId].odName,
            connectionState: match.players[playerId].odConnectionState,
            lastActivity: match.players[playerId].odLastActivity,
            score: match.players[playerId].odScore
        }))
    };
}

export function getSocketServer(): SocketIOServer | null {
    return io;
}
