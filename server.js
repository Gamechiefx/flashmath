/**
 * Custom Next.js Server with Socket.io
 * Enables WebSocket support for arena matches and real-time presence
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server: SocketIOServer } = require('socket.io');
const Redis = require('ioredis');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store active matches
const activeMatches = new Map();

// Map socket IDs to match IDs
const socketToMatch = new Map();

// =============================================================================
// PRESENCE SYSTEM
// =============================================================================

// Redis client for presence (optional - graceful fallback if unavailable)
let presenceRedis = null;
const PRESENCE_TTL = 300; // 5 minutes presence TTL

// In-memory fallback for presence when Redis unavailable
const inMemoryPresence = new Map(); // userId -> { status, socketId, lastSeen }
const presenceSocketToUser = new Map(); // socketId -> userId

// Redis keys for presence
const PRESENCE_KEYS = {
    USER_STATUS: 'presence:user:',      // + userId -> status JSON
    ONLINE_USERS: 'presence:online',    // Set of online user IDs
};

/**
 * Initialize Redis for presence tracking (optional)
 */
function initPresenceRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
        presenceRedis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
        });
        
        presenceRedis.on('connect', () => {
            console.log('[Presence] Redis connected');
        });
        
        presenceRedis.on('error', (err) => {
            console.error('[Presence] Redis error:', err.message);
        });
        
        return presenceRedis;
    } catch (err) {
        console.warn('[Presence] Redis unavailable, using in-memory fallback');
        return null;
    }
}

/**
 * Set user online status
 */
async function setUserPresence(userId, status, socketId) {
    const data = { status, socketId, lastSeen: Date.now() };
    
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            await presenceRedis.setex(
                PRESENCE_KEYS.USER_STATUS + userId,
                PRESENCE_TTL,
                JSON.stringify(data)
            );
            await presenceRedis.sadd(PRESENCE_KEYS.ONLINE_USERS, userId);
            await presenceRedis.expire(PRESENCE_KEYS.ONLINE_USERS, PRESENCE_TTL);
        } catch (err) {
            console.error('[Presence] Redis setex failed:', err.message);
        }
    } else {
        // In-memory fallback
        inMemoryPresence.set(userId, data);
        presenceSocketToUser.set(socketId, userId);
    }
}

/**
 * Remove user presence
 */
async function removeUserPresence(userId) {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            await presenceRedis.del(PRESENCE_KEYS.USER_STATUS + userId);
            await presenceRedis.srem(PRESENCE_KEYS.ONLINE_USERS, userId);
        } catch (err) {
            console.error('[Presence] Redis del failed:', err.message);
        }
    } else {
        inMemoryPresence.delete(userId);
    }
}

/**
 * Get user presence status
 */
async function getUserPresence(userId) {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            const data = await presenceRedis.get(PRESENCE_KEYS.USER_STATUS + userId);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            return null;
        }
    } else {
        return inMemoryPresence.get(userId) || null;
    }
}

/**
 * Get all online users
 */
async function getOnlineUsers() {
    if (presenceRedis && presenceRedis.status === 'ready') {
        try {
            return await presenceRedis.smembers(PRESENCE_KEYS.ONLINE_USERS);
        } catch (err) {
            return [];
        }
    } else {
        return Array.from(inMemoryPresence.keys());
    }
}

// Math symbol operators
const OPERATORS = {
    addition: { symbol: '+', fn: (a, b) => a + b },
    subtraction: { symbol: '−', fn: (a, b) => a - b },
    multiplication: { symbol: '×', fn: (a, b) => a * b },
    division: { symbol: '÷', fn: (a, b) => Math.floor(a / b) },
};

function generateQuestion(operation) {
    const ops = ['addition', 'subtraction', 'multiplication', 'division'];
    const op = operation === 'mixed' ? ops[Math.floor(Math.random() * ops.length)] : operation;
    const opConfig = OPERATORS[op] || OPERATORS.addition;

    let a, b, answer;

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

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    });

    // Initialize Socket.io
    const io = new SocketIOServer(httpServer, {
        path: '/api/socket/arena',
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log(`[Arena Socket] Client connected: ${socket.id}`);

        // Player joins a match
        socket.on('join_match', (data) => {
            const { matchId, userId, userName, operation, isAiMatch } = data;

            socket.join(matchId);
            socketToMatch.set(socket.id, matchId);

            // Get or create match state
            let match = activeMatches.get(matchId);
            if (!match) {
                match = {
                    matchId,
                    players: {},
                    currentQuestion: generateQuestion(operation),
                    odTimeLeft: 60,
                    odStarted: false,
                    odEnded: false,
                    odOperation: operation,
                    timer: null,
                    botInterval: null,
                    isAiMatch: !!isAiMatch,
                };
                activeMatches.set(matchId, match);
            } else {
                // Update isAiMatch if provided (in case match was created before socket joined)
                if (isAiMatch) {
                    match.isAiMatch = true;
                }
            }

            // Add player to match with their own question
            const playerQuestion = generateQuestion(match.odOperation);
            match.players[userId] = {
                odName: userName,
                odScore: 0,
                odStreak: 0,
                odQuestionsAnswered: 0,
                odLastAnswerCorrect: null,
                odSocketId: socket.id,
                odCurrentQuestion: playerQuestion,
            };

            console.log(`[Arena Socket] ${userName} joined match ${matchId} (AI: ${match.isAiMatch}, ${Object.keys(match.players).length} players)`);

            // Notify all players in match
            io.to(matchId).emit('player_joined', {
                players: match.players,
                playerId: userId,
                playerName: userName,
            });

            // Handle AI Match or 2nd Player
            const shouldStart = (match.isAiMatch && Object.keys(match.players).length >= 1) ||
                (!match.isAiMatch && Object.keys(match.players).length >= 2);

            if (shouldStart && !match.odStarted) {
                match.odStarted = true;

                // Add Bot if AI match
                if (match.isAiMatch) {
                    const botId = 'ai_bot_' + matchId;
                    const botQuestion = generateQuestion(match.odOperation);
                    match.players[botId] = {
                        odName: 'FlashBot 3000',
                        odScore: 0,
                        odStreak: 0,
                        odQuestionsAnswered: 0,
                        odLastAnswerCorrect: null,
                        odSocketId: 'bot',
                        odCurrentQuestion: botQuestion,
                        isBot: true,
                        // Visuals
                        odEquippedBanner: 'matrix',
                        odEquippedTitle: 'AI Overlord',
                        odLevel: 99,
                        odTier: 'Diamond'
                    };

                    // Notify about bot
                    io.to(matchId).emit('player_joined', {
                        players: match.players,
                        playerId: botId,
                        playerName: 'FlashBot 3000',
                    });

                    // Bot Logic Loop
                    match.botInterval = setInterval(() => {
                        if (match.odEnded) {
                            clearInterval(match.botInterval);
                            return;
                        }

                        // Bot answers every 3-6 seconds
                        if (Math.random() > 0.7) {
                            const botData = match.players[botId];
                            if (!botData) return;

                            // 80% chance to be correct
                            const isCorrect = Math.random() > 0.2;
                            const answer = isCorrect ? botData.odCurrentQuestion.answer : botData.odCurrentQuestion.answer + 1;

                            if (isCorrect) {
                                botData.odScore += 100;
                                botData.odStreak++;
                            } else {
                                botData.odStreak = 0;
                            }
                            botData.odCurrentQuestion = generateQuestion(match.odOperation);

                            io.to(matchId).emit('answer_result', {
                                odUserId: botId,
                                odIsCorrect: isCorrect,
                                odPlayers: match.players,
                            });

                            socket.emit('opponent_question_update', {
                                odUserId: botId,
                                question: botData.odCurrentQuestion,
                            });
                        }
                    }, 2000);
                }

                // Send match_start to each player with their own question
                for (const [playerId, playerData] of Object.entries(match.players)) {
                    if (playerData.isBot) continue;

                    const playerSocket = io.sockets.sockets.get(playerData.odSocketId);
                    if (playerSocket) {
                        playerSocket.emit('match_start', {
                            question: playerData.odCurrentQuestion,
                            timeLeft: match.odTimeLeft,
                            players: match.players,
                        });
                    }
                }

                // Start the timer
                match.timer = setInterval(() => {
                    const m = activeMatches.get(matchId);
                    if (!m || m.odEnded) {
                        if (m) {
                            if (m.timer) clearInterval(m.timer);
                            if (m.botInterval) clearInterval(m.botInterval);
                        }
                        return;
                    }

                    m.odTimeLeft--;
                    io.to(matchId).emit('time_update', { timeLeft: m.odTimeLeft });

                    if (m.odTimeLeft <= 0) {
                        clearInterval(m.timer);
                        if (m.botInterval) clearInterval(m.botInterval);
                        m.odEnded = true;
                        io.to(matchId).emit('match_end', { players: m.players });

                        // Clean up match after 30 seconds
                        setTimeout(() => {
                            activeMatches.delete(matchId);
                            console.log(`[Arena Socket] Match ${matchId} cleaned up`);
                        }, 30000);
                    }
                }, 1000);
            }

            // Send current state to the joining player (their own question)
            const playerData = match.players[userId];
            socket.emit('match_state', {
                players: match.players,
                question: playerData?.odCurrentQuestion || match.currentQuestion,
                timeLeft: match.odTimeLeft,
                started: match.odStarted,
                ended: match.odEnded,
            });
        });

        // Player submits an answer
        socket.on('submit_answer', (data) => {
            const { matchId, odUserId, userAnswer } = data;
            console.log(`[Arena Socket] Answer submitted: user=${odUserId}, answer=${userAnswer}, match=${matchId}`);

            const match = activeMatches.get(matchId);
            if (!match || match.odEnded) {
                console.log(`[Arena Socket] Match not found or ended: ${matchId}`);
                return;
            }

            const player = match.players[odUserId];
            if (!player) {
                console.log(`[Arena Socket] Player not found in match: ${odUserId}`);
                return;
            }

            // Check against PLAYER'S own question, not shared question
            const playerQuestion = player.odCurrentQuestion;
            const isCorrect = userAnswer === playerQuestion.answer;
            console.log(`[Arena Socket] Answer ${isCorrect ? 'CORRECT' : 'WRONG'} (expected: ${playerQuestion.answer}, got: ${userAnswer})`);

            // Update player stats
            if (isCorrect) {
                player.odScore += 100;
                player.odStreak++;
            } else {
                player.odStreak = 0;
            }
            player.odQuestionsAnswered++;
            player.odLastAnswerCorrect = isCorrect;

            // Generate new question for this player
            const newQuestion = generateQuestion(match.odOperation);
            player.odCurrentQuestion = newQuestion;

            // Broadcast score update to all players
            io.to(matchId).emit('answer_result', {
                odUserId,
                odIsCorrect: isCorrect,
                odPlayers: match.players,
            });

            // Send new question only to the player who answered
            socket.emit('new_question', {
                question: newQuestion,
            });

            // Send new question to opponent(s) so they can see what this player is working on
            socket.to(matchId).emit('opponent_question_update', {
                odUserId,
                question: newQuestion,
            });
        });

        // Player disconnects
        socket.on('disconnect', () => {
            const matchId = socketToMatch.get(socket.id);
            if (matchId) {
                const match = activeMatches.get(matchId);
                if (match) {
                    // Find and remove the disconnected player
                    for (const [odUserId, player] of Object.entries(match.players)) {
                        if (player.odSocketId === socket.id) {
                            delete match.players[odUserId];
                            io.to(matchId).emit('player_left', { odUserId });
                            console.log(`[Arena Socket] Player ${odUserId} left match ${matchId}`);
                            break;
                        }
                    }

                    // Clean up empty matches
                    if (Object.keys(match.players).length === 0) {
                        if (match.timer) clearInterval(match.timer);
                        activeMatches.delete(matchId);
                        console.log(`[Arena Socket] Match ${matchId} cleaned up (no players)`);
                    }
                }
                socketToMatch.delete(socket.id);
            }
            console.log(`[Arena Socket] Client disconnected: ${socket.id}`);
        });

        // Leave match explicitly (forfeit)
        socket.on('leave_match', (data) => {
            const { matchId, userId } = data;
            const match = activeMatches.get(matchId);
            if (match && match.players[userId]) {
                const forfeitingPlayer = match.players[userId];
                delete match.players[userId];
                socket.leave(matchId);
                socketToMatch.delete(socket.id);

                // If match was active, notify remaining player they won
                if (match.odStarted && !match.odEnded) {
                    match.odEnded = true;
                    if (match.timer) clearInterval(match.timer);

                    // Notify remaining players about the forfeit
                    io.to(matchId).emit('player_forfeit', {
                        odForfeitedUserId: userId,
                        odForfeitedUserName: forfeitingPlayer.odName,
                        odPlayers: match.players,
                    });

                    console.log(`[Arena Socket] Player ${forfeitingPlayer.odName} forfeited match ${matchId}`);
                } else {
                    io.to(matchId).emit('player_left', { odUserId: userId });
                }
            }
        });
    });

    console.log('[Arena Socket] WebSocket server initialized');

    // =============================================================================
    // PRESENCE NAMESPACE
    // =============================================================================
    
    // Initialize presence Redis (optional)
    initPresenceRedis();
    
    const presenceNs = io.of('/presence');
    
    presenceNs.on('connection', (socket) => {
        console.log(`[Presence] Client connected: ${socket.id}`);
        let currentUserId = null;
        
        // User comes online
        socket.on('presence:online', async (data) => {
            const { userId, userName, status } = data;
            if (!userId) return;
            
            currentUserId = userId;
            presenceSocketToUser.set(socket.id, userId);
            
            // Use provided status or default to 'online'
            const userStatus = status || 'online';
            await setUserPresence(userId, userStatus, socket.id);
            
            // Join a room for this user to receive direct messages
            socket.join(`user:${userId}`);
            
            console.log(`[Presence] ${userName || userId} is now ${userStatus}`);
            
            // Notify friends (broadcast to all - clients will filter)
            // Don't broadcast if invisible
            if (userStatus !== 'invisible') {
                socket.broadcast.emit('presence:update', {
                    userId,
                    status: userStatus,
                    timestamp: Date.now(),
                });
            }
        });
        
        // User changes status
        socket.on('presence:status', async (data) => {
            const { status } = data; // 'online', 'away', 'invisible', 'in-match'
            if (!currentUserId) return;
            
            await setUserPresence(currentUserId, status, socket.id);
            
            console.log(`[Presence] ${currentUserId} status: ${status}`);
            
            // Broadcast status update to friends
            // If going invisible, broadcast 'offline' to hide from friends
            // If coming back from invisible, broadcast actual status
            socket.broadcast.emit('presence:update', {
                userId: currentUserId,
                status: status === 'invisible' ? 'offline' : status,
                timestamp: Date.now(),
            });
        });
        
        // Request friend statuses
        socket.on('presence:get_friends', async (data) => {
            const { friendIds } = data;
            if (!friendIds || !Array.isArray(friendIds)) return;
            
            const statuses = {};
            for (const friendId of friendIds) {
                const presence = await getUserPresence(friendId);
                // Return 'offline' for invisible users (they don't want to be seen)
                if (presence) {
                    statuses[friendId] = presence.status === 'invisible' ? 'offline' : presence.status;
                } else {
                    statuses[friendId] = 'offline';
                }
            }
            
            socket.emit('presence:friends_status', { statuses });
        });
        
        // Friend request notification (from server action)
        socket.on('presence:notify_friend_request', async (data) => {
            const { receiverId, senderName } = data;
            // Send to specific user's room
            presenceNs.to(`user:${receiverId}`).emit('friend:request', {
                senderName,
                timestamp: Date.now(),
            });
        });
        
        // Friend request accepted notification
        socket.on('presence:notify_friend_accepted', async (data) => {
            const { senderId, accepterName } = data;
            // Notify the original sender that their request was accepted
            presenceNs.to(`user:${senderId}`).emit('friend:accepted', {
                accepterName,
                timestamp: Date.now(),
            });
        });
        
        // Party invite notification
        socket.on('presence:notify_party_invite', async (data) => {
            const { inviteeId, inviterName, partyId } = data;
            presenceNs.to(`user:${inviteeId}`).emit('party:invite', {
                inviterName,
                partyId,
                timestamp: Date.now(),
            });
        });
        
        // Friend removed notification
        socket.on('presence:notify_friend_removed', async (data) => {
            const { removedUserId, removerName } = data;
            presenceNs.to(`user:${removedUserId}`).emit('friend:removed', {
                removerName,
                timestamp: Date.now(),
            });
        });
        
        // Party member joined notification (notify all party members)
        socket.on('presence:notify_party_joined', async (data) => {
            const { partyMemberIds, joinerName, joinerId } = data;
            // Notify all party members except the joiner
            for (const memberId of partyMemberIds) {
                if (memberId !== joinerId) {
                    presenceNs.to(`user:${memberId}`).emit('party:member_joined', {
                        joinerName,
                        joinerId,
                        timestamp: Date.now(),
                    });
                }
            }
        });
        
        // Party member left notification (notify all remaining party members)
        socket.on('presence:notify_party_left', async (data) => {
            const { partyMemberIds, leaverName, leaverId, disbanded } = data;
            for (const memberId of partyMemberIds) {
                presenceNs.to(`user:${memberId}`).emit('party:member_left', {
                    leaverName,
                    leaverId,
                    disbanded: disbanded || false,
                    timestamp: Date.now(),
                });
            }
        });
        
        // Party settings updated notification (notify all party members)
        socket.on('presence:notify_party_settings', async (data) => {
            const { partyMemberIds, inviteMode, updaterId } = data;
            for (const memberId of partyMemberIds) {
                // Notify all members including the updater (for confirmation)
                presenceNs.to(`user:${memberId}`).emit('party:settings_updated', {
                    inviteMode,
                    updaterId,
                    timestamp: Date.now(),
                });
            }
        });
        
        // Disconnect
        socket.on('disconnect', async () => {
            const userId = presenceSocketToUser.get(socket.id);
            if (userId) {
                await removeUserPresence(userId);
                presenceSocketToUser.delete(socket.id);
                
                // Notify others
                socket.broadcast.emit('presence:update', {
                    userId,
                    status: 'offline',
                    timestamp: Date.now(),
                });
                
                console.log(`[Presence] ${userId} went offline`);
            }
            console.log(`[Presence] Client disconnected: ${socket.id}`);
        });
    });
    
    console.log('[Presence Socket] Presence namespace initialized at /presence');

    httpServer.listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> WebSocket server running on /api/socket/arena`);
        console.log(`> Presence server running on /presence`);
    });
});
