'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface Player {
    id: string;
    name: string;
    score: number;
    streak: number;
    maxStreak: number;  // Tracks the highest streak achieved during the match
    lastAnswerCorrect: boolean | null;
}

interface MatchInterfaceProps {
    matchId: string;
    currentUserId: string;
    players: Player[];
    isAiMatch?: boolean;
    /** Match-level operation (e.g., 'addition', 'subtraction', 'multiplication') for result saving */
    operation: string;
}

// Question generator inside client component
function generateQuestion() {
    const operations = ['+', '-', '×'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    let a: number, b: number, answer: number, question: string, operation: string;

    switch (op) {
        case '+':
            a = Math.floor(Math.random() * 50) + 1;
            b = Math.floor(Math.random() * 50) + 1;
            answer = a + b;
            question = `${a} + ${b}`;
            operation = 'addition';
            break;
        case '-':
            a = Math.floor(Math.random() * 50) + 20;
            b = Math.floor(Math.random() * Math.min(a - 1, 30)) + 1;
            answer = a - b;
            question = `${a} - ${b}`;
            operation = 'subtraction';
            break;
        case '×':
        default:
            a = Math.floor(Math.random() * 12) + 1;
            b = Math.floor(Math.random() * 12) + 1;
            answer = a * b;
            question = `${a} × ${b}`;
            operation = 'multiplication';
            break;
    }

    return { question, answer, operation };
}

export function MatchInterface({ matchId, currentUserId, players: initialPlayers, isAiMatch = false, operation }: MatchInterfaceProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const [timeLeft, setTimeLeft] = useState(60);
    const [currentQuestion, setCurrentQuestion] = useState(() => generateQuestion());
    const [answer, setAnswer] = useState('');
    // Initialize players with maxStreak defaulting to the initial streak value
    const [players, setPlayers] = useState(() => 
        initialPlayers.map(p => ({
            ...p,
            maxStreak: p.maxStreak ?? p.streak  // Default to current streak if maxStreak not provided
        }))
    );
    const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [questionsAnswered, setQuestionsAnswered] = useState(0);
    const [eloChange, setEloChange] = useState<number | null>(null);
    const [hasSavedResult, setHasSavedResult] = useState(false);

    const you = players.find(p => p.id === currentUserId);
    const opponent = players.find(p => p.id !== currentUserId);

    if (!you || !opponent) {
        return <div className="text-center text-red-500">Error: Invalid match state</div>;
    }

    // 60 second match timer
    useEffect(() => {
        if (gameOver) return;

        const interval = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(interval);
                    setGameOver(true);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [gameOver]);

    // Save match result when game ends
    useEffect(() => {
        if (!gameOver || hasSavedResult) return;

        async function saveResult() {
            const isDraw = you.score === opponent.score;
            const winner = you.score > opponent.score ? you : opponent;
            const loser = you.score > opponent.score ? opponent : you;

            const { saveMatchResult } = await import('@/lib/actions/matchmaking');
            const result = await saveMatchResult({
                matchId,
                // For draws, we still need to pass IDs but they don't determine a winner
                winnerId: isDraw ? you.id : winner.id,
                loserId: isDraw ? opponent.id : loser.id,
                winnerScore: isDraw ? you.score : winner.score,
                loserScore: isDraw ? opponent.score : loser.score,
                operation,
                mode: '1v1',
                isDraw,
            });

            if (result.success) {
                // For draws, both players get the same ELO change (typically 0 or small)
                // For wins/losses, use the appropriate change based on whether we won
                const isWinner = you.score > opponent.score;
                if (isDraw) {
                    // Both players get the draw ELO change (use winnerEloChange as draw change)
                    setEloChange(result.winnerEloChange || 0);
                } else {
                    setEloChange(isWinner ? result.winnerEloChange || 0 : result.loserEloChange || 0);
                }
            }
            setHasSavedResult(true);
        }

        saveResult();
    }, [gameOver, hasSavedResult, you, opponent, currentUserId, matchId, operation]);

    // Auto-focus input
    useEffect(() => {
        if (!gameOver) {
            inputRef.current?.focus();
        }
    }, [currentQuestion, gameOver]);

    const submitAnswer = useCallback(() => {
        const numAnswer = parseInt(answer, 10);
        if (isNaN(numAnswer)) return;

        const isCorrect = numAnswer === currentQuestion.answer;

        setShowResult(isCorrect ? 'correct' : 'wrong');
        setQuestionsAnswered(q => q + 1);

        // Update your score
        setPlayers(prev => prev.map(p => {
            if (p.id === currentUserId) {
                const newStreak = isCorrect ? p.streak + 1 : 0;
                return {
                    ...p,
                    score: p.score + (isCorrect ? 100 : 0),
                    streak: newStreak,
                    maxStreak: Math.max(p.maxStreak, newStreak),  // Track best streak
                    lastAnswerCorrect: isCorrect
                };
            }
            // Simulate opponent answering
            if (p.id !== currentUserId && Math.random() > 0.3) {
                const opponentCorrect = Math.random() > 0.4;
                const opponentNewStreak = opponentCorrect ? p.streak + 1 : 0;
                return {
                    ...p,
                    score: p.score + (opponentCorrect ? 100 : 0),
                    streak: opponentNewStreak,
                    maxStreak: Math.max(p.maxStreak, opponentNewStreak),  // Track best streak
                    lastAnswerCorrect: opponentCorrect
                };
            }
            return p;
        }));

        // Quick transition to next question
        setTimeout(() => {
            setShowResult(null);
            setAnswer('');
            setCurrentQuestion(generateQuestion());
        }, 300);
    }, [answer, currentQuestion.answer, currentUserId]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            submitAnswer();
        }
    };

    // Progress bar width
    const timeProgress = (timeLeft / 60) * 100;

    if (gameOver) {
        const isDraw = you.score === opponent.score;
        const isWinner = you.score > opponent.score;

        // Determine display text and styling based on result
        const getResultEmoji = () => {
            if (isDraw) return '🤝';
            if (isWinner) return '🏆';
            return '💪';
        };

        const getResultText = () => {
            if (isDraw) return 'Draw!';
            if (isWinner) return 'Victory!';
            return 'Good Fight!';
        };

        const getResultColor = () => {
            if (isDraw) return 'text-yellow-500';
            if (isWinner) return 'text-green-500';
            return 'text-accent';
        };

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-8"
            >
                {/* Result Header */}
                <div className="space-y-2">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", damping: 10 }}
                        className="text-8xl"
                    >
                        {getResultEmoji()}
                    </motion.div>
                    <h1 className={`text-4xl font-bold ${getResultColor()}`}>
                        {getResultText()}
                    </h1>
                </div>

                {/* Scoreboard */}
                <div className="glass rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="text-left">
                            <p className="text-sm text-muted-foreground">You</p>
                            <p className="text-3xl font-bold">{you.score}</p>
                        </div>
                        <div className="text-4xl">⚔️</div>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">{opponent.name}</p>
                            <p className="text-3xl font-bold">{opponent.score}</p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                            <p className="text-sm text-muted-foreground">Questions Answered</p>
                            <p className="text-xl font-bold">{questionsAnswered}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Best Streak</p>
                            <p className="text-xl font-bold">{you.maxStreak}🔥</p>
                        </div>
                    </div>

                    {/* ELO Change */}
                    <div className="pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground mb-1">Rating Change</p>
                        {eloChange !== null ? (
                            <p className={`text-2xl font-bold ${eloChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {eloChange >= 0 ? '+' : ''}{eloChange}
                            </p>
                        ) : (
                            <p className="text-2xl font-bold text-muted-foreground animate-pulse">...</p>
                        )}
                    </div>
                </div>

                {/* Recommendation */}
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-muted-foreground mb-1">Practice Recommendation</p>
                    <p className="font-medium">Great match! Keep practicing to climb the ranks.</p>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => router.push('/arena/queue?mode=1v1')}
                        className="px-6 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground 
                      font-bold rounded-xl"
                    >
                        Play Again
                    </motion.button>
                    <button
                        onClick={() => router.push('/arena')}
                        className="px-6 py-3 border border-border rounded-xl hover:bg-muted transition-colors"
                    >
                        Return to Arena
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Timer Bar */}
            <div className="relative">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: '100%' }}
                        animate={{ width: `${timeProgress}%` }}
                        className={`h-full transition-all ${timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 30 ? 'bg-yellow-500' : 'bg-primary'
                            }`}
                    />
                </div>
                <div className="absolute right-0 -top-6 text-2xl font-mono font-bold">
                    {timeLeft}s
                </div>
            </div>

            {/* Scoreboard */}
            <div className="flex justify-between items-center glass rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        👤
                    </div>
                    <div>
                        <p className="font-bold">{you.score}</p>
                        {you.streak > 1 && (
                            <p className="text-xs text-orange-500">{you.streak}🔥</p>
                        )}
                    </div>
                </div>

                <div className="text-muted-foreground font-bold">VS</div>

                <div className="flex items-center gap-3">
                    <div>
                        <p className="font-bold text-right">{opponent.score}</p>
                        {opponent.streak > 1 && (
                            <p className="text-xs text-orange-500 text-right">{opponent.streak}🔥</p>
                        )}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                        👤
                    </div>
                </div>
            </div>

            {/* Question Display */}
            <div className="flex-1 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentQuestion.question}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="text-center"
                    >
                        <p className="text-6xl md:text-8xl font-bold mb-8">
                            {currentQuestion.question}
                        </p>
                    </motion.div>
                </AnimatePresence>

                {/* Answer Input */}
                <div className="relative w-full max-w-xs">
                    <input
                        ref={inputRef}
                        type="number"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="?"
                        className={`w-full text-4xl text-center py-4 rounded-xl border-2 bg-card
                       outline-none transition-colors ${showResult === 'correct' ? 'border-green-500 bg-green-500/10' :
                                showResult === 'wrong' ? 'border-red-500 bg-red-500/10' :
                                    'border-border focus:border-primary'
                            }`}
                        autoFocus
                    />

                    {/* Result indicator */}
                    <AnimatePresence>
                        {showResult && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                className="absolute -right-12 top-1/2 -translate-y-1/2 text-3xl"
                            >
                                {showResult === 'correct' ? '✅' : '❌'}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Submit hint */}
                <p className="text-sm text-muted-foreground mt-4">
                    Press Enter to submit
                </p>
            </div>
        </div>
    );
}
