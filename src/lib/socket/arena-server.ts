/**
 * Arena WebSocket Server
 * Handles real-time sync for arena matches
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

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
}

// Store active matches
const activeMatches = new Map<string, MatchState>();

// Map socket IDs to match IDs
const socketToMatch = new Map<string, string>();

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
    });

    io.on('connection', (socket: Socket) => {
        console.log(`[Arena Socket] Client connected: ${socket.id}`);

        // Player joins a match
        socket.on('join_match', (data: { matchId: string; userId: string; userName: string; operation: string }) => {
            const { matchId, userId, userName, operation } = data;

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
                };
                activeMatches.set(matchId, match);
            }

            // Add player to match
            match.players[userId] = {
                odName: userName,
                odScore: 0,
                odStreak: 0,
                odQuestionsAnswered: 0,
                odLastAnswerCorrect: null,
                odSocketId: socket.id,
            };

            console.log(`[Arena Socket] ${userName} joined match ${matchId} (${Object.keys(match.players).length} players)`);

            // Notify all players in match
            io!.to(matchId).emit('player_joined', {
                players: match.players,
                playerId: userId,
                playerName: userName,
            });

            // If 2 players, start the match
            if (Object.keys(match.players).length >= 2 && !match.odStarted) {
                match.odStarted = true;

                // Broadcast match start with synced question
                io!.to(matchId).emit('match_start', {
                    question: match.currentQuestion,
                    timeLeft: match.odTimeLeft,
                    players: match.players,
                });

                // Start the timer
                const timerInterval = setInterval(() => {
                    const m = activeMatches.get(matchId);
                    if (!m || m.odEnded) {
                        clearInterval(timerInterval);
                        return;
                    }

                    m.odTimeLeft--;
                    io!.to(matchId).emit('time_update', { timeLeft: m.odTimeLeft });

                    if (m.odTimeLeft <= 0) {
                        clearInterval(timerInterval);
                        m.odEnded = true;
                        io!.to(matchId).emit('match_end', { players: m.players });
                    }
                }, 1000);
            }

            // Send current state to the joining player
            socket.emit('match_state', {
                players: match.players,
                question: match.currentQuestion,
                timeLeft: match.odTimeLeft,
                started: match.odStarted,
                ended: match.odEnded,
            });
        });

        // Player submits an answer
        socket.on('submit_answer', (data: { matchId: string; odUserId: string; userAnswer: number }) => {
            const { matchId, odUserId, userAnswer } = data;
            const match = activeMatches.get(matchId);
            if (!match || match.odEnded) return;

            const player = match.players[odUserId];
            if (!player) return;

            const isCorrect = userAnswer === match.currentQuestion.answer;

            // Update player stats
            if (isCorrect) {
                player.odScore += 100;
                player.odStreak++;
            } else {
                player.odStreak = 0;
            }
            player.odQuestionsAnswered++;
            player.odLastAnswerCorrect = isCorrect;

            // Generate new question for this player (personal progression)
            const newQuestion = generateQuestion(match.odOperation);

            // Broadcast update to all players
            io!.to(matchId).emit('answer_result', {
                odUserId,
                odIsCorrect: isCorrect,
                odPlayers: match.players,
            });

            // Send new question only to the player who answered
            socket.emit('new_question', {
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
                            io!.to(matchId).emit('player_left', { odUserId });
                            console.log(`[Arena Socket] Player ${odUserId} left match ${matchId}`);
                            break;
                        }
                    }

                    // Clean up empty matches
                    if (Object.keys(match.players).length === 0) {
                        activeMatches.delete(matchId);
                        console.log(`[Arena Socket] Match ${matchId} cleaned up (no players)`);
                    }
                }
                socketToMatch.delete(socket.id);
            }
            console.log(`[Arena Socket] Client disconnected: ${socket.id}`);
        });

        // Leave match explicitly
        socket.on('leave_match', (data: { matchId: string; userId: string }) => {
            const { matchId, userId } = data;
            const match = activeMatches.get(matchId);
            if (match && match.players[userId]) {
                delete match.players[userId];
                socket.leave(matchId);
                socketToMatch.delete(socket.id);
                io!.to(matchId).emit('player_left', { odUserId: userId });
            }
        });
    });

    console.log('[Arena Socket] WebSocket server initialized');
    return io;
}

export function getSocketServer(): SocketIOServer | null {
    return io;
}
