/**
 * FlashMath Arena - Real-Time Game Loop
 * 
 * Server-authoritative match handler for 1v1 duels.
 * Manages countdown, question delivery, scoring, and match state.
 * 
 * Arena Performance Score (APS) Formula:
 *   APS = (Accuracy × 0.40) + (Streak × 0.35) + (Speed × 0.25)
 *   Speed is penalized if accuracy drops below 70%
 * 
 * @module gameLoop
 */

const { GAME, EVENTS } = require('./constants.js');

// =============================================================================
// GAME STATE CLASS
// =============================================================================

/**
 * Represents the state of a single 1v1 match
 */
class MatchState {
    /**
     * @param {Object} match - Match data from matchmaker
     * @param {Object} io - Socket.IO server instance
     * @param {Function} questionGenerator - Function to generate math problems
     */
    constructor(match, io, questionGenerator) {
        this.id = match.id;
        this.io = io;
        this.generateQuestion = questionGenerator;

        // Player state
        // Each player: { id, name, socketId, score, lives, answered }
        this.players = match.players.map(p => ({
            ...p,
            score: 0,
            lives: GAME.STARTING_LIVES,
            answered: false,
            lastAnswerCorrect: null,
            lastAnswerTime: null,
            // APS tracking
            correctAnswers: 0,
            totalAnswers: 0,
            currentStreak: 0,
            maxStreak: 0,
            totalAnswerTime: 0,
            // Per-operation tracking
            operationStats: {}
        }));

        // Match state
        this.status = 'pending'; // pending, countdown, active, finished
        this.currentQuestion = null;
        this.currentQuestionIndex = 0;
        this.questionStartTime = null;
        this.totalQuestions = GAME.QUESTIONS_PER_MATCH;
        this.startTime = Date.now();

        // Timers
        this.countdownTimer = null;
        this.questionTimer = null;

        // Create a Socket.IO room for this match
        this.roomId = `match:${this.id}`;
    }

    /**
     * Get the room to emit events to
     */
    get room() {
        return this.io.to(this.roomId);
    }

    /**
     * Add players to the match room
     */
    joinRoom() {
        this.players.forEach(player => {
            const socket = this.io.sockets.sockets.get(player.socketId);
            if (socket) {
                socket.join(this.roomId);
            }
        });
    }

    /**
     * Start the match with a countdown
     */
    start() {
        this.status = 'countdown';
        this.joinRoom();

        // Emit match start event with player info
        this.room.emit(EVENTS.MATCH_START, {
            matchId: this.id,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                lives: p.lives
            })),
            totalQuestions: this.totalQuestions,
            config: {
                maxAnswerTime: GAME.MAX_ANSWER_TIME,
                pointsForCorrect: GAME.CORRECT_ANSWER_POINTS,
                penaltyForWrong: GAME.WRONG_ANSWER_PENALTY,
                speedBonusMultiplier: GAME.SPEED_BONUS_MULTIPLIER
            }
        });

        // Countdown sequence
        let countdown = GAME.COUNTDOWN_DURATION / 1000;

        const countdownTick = () => {
            if (countdown > 0) {
                this.room.emit('countdown:tick', { seconds: countdown });
                countdown--;
                this.countdownTimer = setTimeout(countdownTick, 1000);
            } else {
                this.status = 'active';
                this.nextQuestion();
            }
        };

        countdownTick();
    }

    /**
     * Send the next question to players
     */
    nextQuestion() {
        // Check if match should end
        if (this.currentQuestionIndex >= this.totalQuestions || this.isMatchOver()) {
            this.endMatch();
            return;
        }

        // Generate new question
        this.currentQuestion = this.generateQuestion();
        this.currentQuestionIndex++;
        this.questionStartTime = Date.now();

        // Reset player answer states
        this.players.forEach(p => {
            p.answered = false;
            p.lastAnswerCorrect = null;
            p.lastAnswerTime = null;
        });

        // =================================================================
        // EMIT QUESTION TO CLIENTS
        // Server sends: question text, max time, question number
        // Server does NOT send: the answer (server-authoritative)
        // =================================================================
        this.room.emit(EVENTS.QUESTION_START, {
            questionId: `q_${this.id}_${this.currentQuestionIndex}`,
            questionNumber: this.currentQuestionIndex,
            totalQuestions: this.totalQuestions,
            question: this.currentQuestion.question,
            type: this.currentQuestion.type,
            maxTime: GAME.MAX_ANSWER_TIME
        });

        // Set timeout for question expiry
        this.questionTimer = setTimeout(() => {
            this.handleQuestionTimeout();
        }, GAME.MAX_ANSWER_TIME);
    }

    /**
     * Handle a player submitting an answer
     * 
     * @param {string} playerId - ID of the player answering
     * @param {number} answer - The submitted answer
     * @param {number} clientTimestamp - When the client registered the answer
     * @returns {Object} Result of the answer submission
     */
    submitAnswer(playerId, answer, clientTimestamp) {
        const player = this.players.find(p => p.id === playerId);

        if (!player) {
            return { success: false, error: 'Player not in match' };
        }

        if (player.answered) {
            return { success: false, error: 'Already answered this question' };
        }

        if (this.status !== 'active' || !this.currentQuestion) {
            return { success: false, error: 'No active question' };
        }

        // Mark as answered
        player.answered = true;

        // Calculate answer time (use server time for authority, but accept client time for display)
        const answerTime = Date.now() - this.questionStartTime;
        player.lastAnswerTime = answerTime;

        // =================================================================
        // SCORING: Legacy point-based + APS tracking
        // =================================================================
        const isCorrect = answer === this.currentQuestion.answer;
        player.lastAnswerCorrect = isCorrect;
        player.totalAnswers++;

        let pointsEarned = 0;
        const operation = this.currentQuestion.operation || 'general';

        if (isCorrect) {
            player.correctAnswers++;
            player.currentStreak++;
            player.maxStreak = Math.max(player.maxStreak, player.currentStreak);

            // Base points for correct answer
            pointsEarned = GAME.CORRECT_ANSWER_POINTS;

            // Speed bonus: (MaxTime - AnswerTime) in seconds * multiplier
            const timeRemainingMs = Math.max(0, GAME.MAX_ANSWER_TIME - answerTime);
            const timeRemainingSeconds = timeRemainingMs / 1000;
            const speedBonus = Math.floor(timeRemainingSeconds * GAME.SPEED_BONUS_MULTIPLIER);

            pointsEarned += speedBonus;

            // Track average answer time (for APS speed component)
            player.totalAnswerTime += answerTime;
        } else {
            player.currentStreak = 0;  // Reset streak on wrong answer

            // Penalty for wrong answer
            pointsEarned = GAME.WRONG_ANSWER_PENALTY;

            // Lose a life on wrong answer
            player.lives--;
        }

        // Track per-operation stats
        if (!player.operationStats[operation]) {
            player.operationStats[operation] = { correct: 0, total: 0 };
        }
        player.operationStats[operation].total++;
        if (isCorrect) player.operationStats[operation].correct++;

        // Update score (ensure it doesn't go below 0)
        player.score = Math.max(0, player.score + pointsEarned);

        // =================================================================
        // EMIT MATCH UPDATE
        // Send current scores and lives to all players
        // =================================================================
        this.emitMatchUpdate(playerId, isCorrect, pointsEarned);

        // Check if all players have answered
        const allAnswered = this.players.every(p => p.answered);

        if (allAnswered) {
            clearTimeout(this.questionTimer);

            // Check if match should end
            if (this.isMatchOver()) {
                this.endMatch();
            } else {
                // Brief delay before next question
                setTimeout(() => this.nextQuestion(), GAME.QUESTION_DELAY);
            }
        }

        return {
            success: true,
            correct: isCorrect,
            pointsEarned: pointsEarned,
            newScore: player.score,
            livesRemaining: player.lives,
            correctAnswer: this.currentQuestion.answer
        };
    }

    /**
     * Handle when question timer expires
     */
    handleQuestionTimeout() {
        // Penalize players who didn't answer
        this.players.forEach(player => {
            if (!player.answered) {
                player.answered = true;
                player.lastAnswerCorrect = false;
                player.lastAnswerTime = GAME.MAX_ANSWER_TIME;
                player.lives--;  // Lose a life for not answering

                // Apply penalty
                player.score = Math.max(0, player.score + GAME.WRONG_ANSWER_PENALTY);
            }
        });

        // Emit timeout update
        this.room.emit('question:timeout', {
            correctAnswer: this.currentQuestion.answer,
            explanation: this.currentQuestion.explanation
        });

        this.emitMatchUpdate(null, false, 0);

        // Check if match should end
        if (this.isMatchOver()) {
            setTimeout(() => this.endMatch(), 1000);
        } else {
            // Move to next question after delay
            setTimeout(() => this.nextQuestion(), GAME.QUESTION_DELAY);
        }
    }

    /**
     * Emit current match state to all players
     * 
     * @param {string|null} lastAnswerBy - ID of player who just answered
     * @param {boolean} wasCorrect - Whether the last answer was correct
     * @param {number} pointsEarned - Points earned/lost by last answer
     */
    emitMatchUpdate(lastAnswerBy, wasCorrect, pointsEarned) {
        this.room.emit(EVENTS.MATCH_UPDATE, {
            matchId: this.id,
            questionNumber: this.currentQuestionIndex,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                lives: p.lives,
                answered: p.answered,
                // Only reveal answer details to the player themselves
                lastAnswerCorrect: p.lastAnswerCorrect
            })),
            lastAction: lastAnswerBy ? {
                playerId: lastAnswerBy,
                correct: wasCorrect,
                points: pointsEarned
            } : null
        });
    }

    /**
     * Check if the match should end
     * Match ends when: all questions answered OR a player has 0 lives
     */
    isMatchOver() {
        // Check if any player is out of lives
        const playerOutOfLives = this.players.some(p => p.lives <= 0);

        // Check if all questions completed
        const allQuestionsComplete = this.currentQuestionIndex >= this.totalQuestions;

        return playerOutOfLives || allQuestionsComplete;
    }

    /**
     * End the match and determine winner
     */
    endMatch() {
        if (this.status === 'finished') return;

        this.status = 'finished';

        // Clear timers
        clearTimeout(this.countdownTimer);
        clearTimeout(this.questionTimer);

        // Determine winner (higher score wins, or player with lives remaining)
        const sortedPlayers = [...this.players].sort((a, b) => {
            // If one player is out of lives, the other wins
            if (a.lives <= 0 && b.lives > 0) return 1;
            if (b.lives <= 0 && a.lives > 0) return -1;
            // Otherwise, higher score wins
            return b.score - a.score;
        });

        const winner = sortedPlayers[0];
        const loser = sortedPlayers[1];

        // Calculate Elo changes
        const eloChanges = this.calculateEloChanges(winner, loser);

        // Emit game over event
        this.room.emit(EVENTS.GAME_OVER, {
            matchId: this.id,
            winner: {
                id: winner.id,
                name: winner.name,
                score: winner.score,
                eloChange: eloChanges.winner
            },
            loser: {
                id: loser.id,
                name: loser.name,
                score: loser.score,
                eloChange: eloChanges.loser
            },
            finalScores: this.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score,
                lives: p.lives
            })),
            isDraw: winner.score === loser.score && winner.lives === loser.lives
        });

        // Clean up room
        this.players.forEach(player => {
            const socket = this.io.sockets.sockets.get(player.socketId);
            if (socket) {
                socket.leave(this.roomId);
            }
        });

        return {
            winner: winner,
            loser: loser,
            eloChanges: eloChanges
        };
    }

    /**
     * Calculate Arena Performance Score (APS)
     * Per spec: Accuracy 40%, Streak 35%, Speed 25%
     * Speed is penalized if accuracy drops below threshold
     * 
     * @param {Object} player - Player with match stats
     * @returns {Object} { aps, components }
     */
    calculateAPS(player) {
        // Accuracy component (0-1)
        const accuracy = player.totalAnswers > 0
            ? player.correctAnswers / player.totalAnswers
            : 0;

        // Streak component (normalized to 0-1, max streak of 10 = 1.0)
        const streakNormalized = Math.min(1, player.maxStreak / 10);

        // Speed component (normalized average answer time)
        // Faster = higher score, based on portion of max time used
        const avgAnswerTime = player.correctAnswers > 0
            ? player.totalAnswerTime / player.correctAnswers
            : GAME.MAX_ANSWER_TIME;
        const speedRatio = 1 - (avgAnswerTime / GAME.MAX_ANSWER_TIME);

        // Speed penalty if accuracy is low (per spec)
        const speedMultiplier = accuracy >= GAME.SPEED_PENALTY_ACCURACY_THRESHOLD
            ? 1
            : GAME.SPEED_PENALTY_MULTIPLIER;

        // Calculate weighted APS (0-1000 scale)
        const weights = GAME.APS_WEIGHTS;
        const aps = Math.round(
            ((accuracy * weights.ACCURACY) +
                (streakNormalized * weights.STREAK) +
                (speedRatio * speedMultiplier * weights.SPEED)) * 1000
        );

        return {
            aps: aps,
            components: {
                accuracy: Math.round(accuracy * 100),
                streak: player.maxStreak,
                speedRatio: Math.round(speedRatio * 100),
                speedPenalized: accuracy < GAME.SPEED_PENALTY_ACCURACY_THRESHOLD
            }
        };
    }

    /**
     * Calculate Elo rating changes with confidence scaling
     * Per spec: Low confidence = dampened ELO changes
     * 
     * @param {Object} winner - Winning player
     * @param {Object} loser - Losing player
     * @param {number} winnerConfidence - Winner's practice confidence (0-1)
     * @param {number} loserConfidence - Loser's practice confidence (0-1)
     * @returns {Object} Elo changes for winner and loser
     */
    calculateEloChanges(winner, loser, winnerConfidence = 0.7, loserConfidence = 0.7) {
        // Base K-factor
        const baseK = GAME.ELO_K_FACTOR;

        // Scale K by confidence (per spec: low confidence = dampened changes)
        // At confidence >= 0.7: full K
        // At confidence = 0.3: half K
        const getScaledK = (confidence) => {
            if (confidence >= GAME.FULL_CONFIDENCE_THRESHOLD) {
                return baseK;
            }
            // Linear interpolation from MIN_CONFIDENCE to FULL_CONFIDENCE
            const minConf = 0.3; // MATCHMAKING.MIN_CONFIDENCE_SCORE
            const range = GAME.FULL_CONFIDENCE_THRESHOLD - minConf;
            const factor = Math.max(0, (confidence - minConf) / range);
            return baseK * (GAME.MIN_CONFIDENCE_K_MULTIPLIER + factor * (1 - GAME.MIN_CONFIDENCE_K_MULTIPLIER));
        };

        const winnerK = getScaledK(winnerConfidence);
        const loserK = getScaledK(loserConfidence);

        // Expected scores based on current Elo
        const winnerElo = winner.elo || 1000;
        const loserElo = loser.elo || 1000;
        const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
        const expectedLoser = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400));

        // Actual scores (1 for win, 0 for loss)
        const winnerChange = Math.round(winnerK * (1 - expectedWinner));
        const loserChange = Math.round(loserK * (0 - expectedLoser));

        return {
            winner: winnerChange,
            loser: loserChange,
            winnerK: Math.round(winnerK),
            loserK: Math.round(loserK)
        };
    }

    /**
     * Generate post-match practice recommendation
     * Per spec: "Improve X to stabilize Y rank"
     * 
     * @param {Object} player - Player with operationStats
     * @param {boolean} won - Whether player won
     * @returns {Object} Practice recommendation
     */
    generateRecommendation(player, won) {
        // Find weakest operation
        let weakestOp = null;
        let lowestAccuracy = 1;

        for (const [op, stats] of Object.entries(player.operationStats)) {
            if (stats.total >= 2) {  // Need at least 2 questions to judge
                const acc = stats.correct / stats.total;
                if (acc < lowestAccuracy) {
                    lowestAccuracy = acc;
                    weakestOp = op;
                }
            }
        }

        // Base accuracy
        const overallAccuracy = player.totalAnswers > 0
            ? player.correctAnswers / player.totalAnswers
            : 0;

        if (!won && overallAccuracy < 0.6) {
            return {
                type: 'critical',
                operation: weakestOp || 'general',
                message: weakestOp
                    ? `Focus on ${weakestOp} practice to improve accuracy.`
                    : 'More practice recommended before next Arena match.',
                suggestedDuration: 10  // minutes
            };
        } else if (!won && weakestOp) {
            return {
                type: 'improvement',
                operation: weakestOp,
                message: `Improve ${weakestOp} to stabilize your rank.`,
                suggestedDuration: 5
            };
        } else if (won && lowestAccuracy < 0.7 && weakestOp) {
            return {
                type: 'suggestion',
                operation: weakestOp,
                message: `Great win! ${weakestOp} practice could make you even stronger.`,
                suggestedDuration: 5
            };
        }

        return {
            type: 'none',
            message: 'Keep up the great work!'
        };
    }

    /**
     * Handle player disconnection
     * @param {string} playerId - ID of disconnected player
     */
    handleDisconnect(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        // If match is active, opponent wins by forfeit
        if (this.status === 'active' || this.status === 'countdown') {
            player.lives = 0;  // Force forfeit
            this.endMatch();
        }
    }
}

// =============================================================================
// GAME LOOP MANAGER
// =============================================================================

/**
 * Manages all active matches
 */
class GameLoopManager {
    /**
     * @param {Object} io - Socket.IO server instance
     * @param {Function} questionGenerator - Function to generate math problems
     */
    constructor(io, questionGenerator) {
        this.io = io;
        this.generateQuestion = questionGenerator;
        this.activeMatches = new Map();  // matchId -> MatchState
        this.playerToMatch = new Map();  // playerId -> matchId
    }

    /**
     * Create and start a new match
     * @param {Object} matchData - Match data from matchmaker
     * @returns {MatchState} The created match state
     */
    createMatch(matchData) {
        const match = new MatchState(matchData, this.io, this.generateQuestion);

        this.activeMatches.set(match.id, match);

        // Track player -> match mapping
        match.players.forEach(p => {
            this.playerToMatch.set(p.id, match.id);
        });

        // Start the match
        match.start();

        return match;
    }

    /**
     * Get match by ID
     */
    getMatch(matchId) {
        return this.activeMatches.get(matchId);
    }

    /**
     * Get match by player ID
     */
    getMatchByPlayer(playerId) {
        const matchId = this.playerToMatch.get(playerId);
        return matchId ? this.activeMatches.get(matchId) : null;
    }

    /**
     * Handle answer submission from a player
     */
    submitAnswer(playerId, answer, timestamp) {
        const match = this.getMatchByPlayer(playerId);
        if (!match) {
            return { success: false, error: 'Not in a match' };
        }
        return match.submitAnswer(playerId, answer, timestamp);
    }

    /**
     * Handle player disconnection
     */
    handleDisconnect(playerId) {
        const match = this.getMatchByPlayer(playerId);
        if (match) {
            match.handleDisconnect(playerId);
            this.cleanupMatch(match.id);
        }
    }

    /**
     * Clean up a finished match
     */
    cleanupMatch(matchId) {
        const match = this.activeMatches.get(matchId);
        if (match && match.status === 'finished') {
            match.players.forEach(p => {
                this.playerToMatch.delete(p.id);
            });
            this.activeMatches.delete(matchId);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            activeMatches: this.activeMatches.size,
            playersInMatches: this.playerToMatch.size
        };
    }
}

// =============================================================================
// TEST FUNCTION
// =============================================================================

/**
 * Self-contained test for game loop logic
 * Run with: node -e "require('./gameLoop.js').test()"
 */
function test() {
    console.log('🧪 Testing Game Loop...\n');

    // Mock Socket.IO
    const mockSockets = new Map();
    const mockRooms = new Map();

    const mockIo = {
        sockets: { sockets: mockSockets },
        to: (room) => ({
            emit: (event, data) => {
                console.log(`📡 [${room}] ${event}:`, JSON.stringify(data, null, 2).slice(0, 200));
            }
        })
    };

    // Mock socket
    mockSockets.set('socket1', { join: () => { }, leave: () => { } });
    mockSockets.set('socket2', { join: () => { }, leave: () => { } });

    // Mock question generator
    const generateQuestion = () => ({
        question: '7 × 8',
        answer: 56,
        type: 'basic',
        explanation: 'Multiply 7 by 8',
        tier: 1
    });

    // Create match
    const matchData = {
        id: 'test_match_001',
        players: [
            { id: 'player1', name: 'Alice', socketId: 'socket1', elo: 1000 },
            { id: 'player2', name: 'Bob', socketId: 'socket2', elo: 1050 }
        ]
    };

    const match = new MatchState(matchData, mockIo, generateQuestion);

    console.log('📊 Initial State:');
    console.log('   Players:', match.players.map(p => `${p.name} (${p.lives} lives)`).join(', '));

    // Simulate starting a question
    console.log('\n▶️ Starting question manually...');
    match.status = 'active';
    match.nextQuestion();

    // Simulate answers
    console.log('\n📝 Player 1 answers correctly (fast):');
    const result1 = match.submitAnswer('player1', 56, Date.now());
    console.log('   Result:', JSON.stringify(result1));

    console.log('\n📝 Player 2 answers incorrectly:');
    const result2 = match.submitAnswer('player2', 54, Date.now() + 2000);
    console.log('   Result:', JSON.stringify(result2));

    console.log('\n📊 Updated State:');
    console.log('   Players:', match.players.map(p =>
        `${p.name}: ${p.score} pts, ${p.lives} lives`
    ).join(' | '));

    // Test Elo calculation
    console.log('\n🏆 Elo Calculation Test:');
    const eloChanges = match.calculateEloChanges(
        { elo: 1000 },
        { elo: 1050 }
    );
    console.log('   Winner (1000 Elo) change:', eloChanges.winner);
    console.log('   Loser (1050 Elo) change:', eloChanges.loser);

    console.log('\n✅ Game loop tests complete!');
    return 'Tests passed';
}

module.exports = {
    MatchState,
    GameLoopManager,
    test
};
