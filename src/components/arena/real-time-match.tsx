'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useArenaSocket } from '@/lib/socket/use-arena-socket';

import { PlayerBanner } from '@/components/arena/player-banner';
import { soundEngine } from '@/lib/sound-engine';

interface RealTimeMatchProps {
    matchId: string;
    currentUserId: string;
    userName: string;
    operation: string;
    isAiMatch?: boolean;
    initialPlayers?: Record<string, {
        name: string;
        elo: number;
        tier: string;
        banner: string;
        title: string;
        level: number;
    }>;
}

export function RealTimeMatch({
    matchId,
    currentUserId,
    userName,
    operation,
    isAiMatch = false,
    initialPlayers
}: RealTimeMatchProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const [answer, setAnswer] = useState('');
    const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
    const [eloChange, setEloChange] = useState<number | null>(null);
    const [hasSavedResult, setHasSavedResult] = useState(false);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);

    const {
        connected,
        players,
        currentQuestion,
        timeLeft,
        matchStarted,
        matchEnded,
        waitingForOpponent,
        opponentForfeited,
        submitAnswer: socketSubmitAnswer,
        leaveMatch,
    } = useArenaSocket({
        matchId,
        userId: currentUserId,
        userName,
        operation,
    });

    // Get player data
    const you = players[currentUserId];
    const opponentId = Object.keys(players).find(id => id !== currentUserId);
    const opponent = opponentId ? players[opponentId] : null;

    // Auto-focus input
    useEffect(() => {
        if (matchStarted && !matchEnded) {
            inputRef.current?.focus();
        }
    }, [matchStarted, matchEnded, currentQuestion]);

    // Prevent accidental back navigation during match
    useEffect(() => {
        if (!matchStarted || matchEnded) return;

        // Warn on tab/window close
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'You are in an active match! Leaving will count as a forfeit.';
            return e.returnValue;
        };

        // Prevent back button
        const handlePopState = (e: PopStateEvent) => {
            e.preventDefault();
            // Push state back to prevent navigation
            window.history.pushState(null, '', window.location.href);
            setShowLeaveWarning(true);
        };

        // Add a history entry to intercept back button
        window.history.pushState(null, '', window.location.href);

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [matchStarted, matchEnded]);

    // Save match result when game ends
    useEffect(() => {
        if (!matchEnded || hasSavedResult || !you || !opponent) return;

        async function saveResult() {
            const winnerId = you!.odScore > opponent!.odScore ? currentUserId : opponentId!;
            const loserId = you!.odScore > opponent!.odScore ? opponentId! : currentUserId;
            const winnerScore = Math.max(you!.odScore, opponent!.odScore);
            const loserScore = Math.min(you!.odScore, opponent!.odScore);
            const isWinner = winnerId === currentUserId;

            const { saveMatchResult } = await import('@/lib/actions/matchmaking');
            const result = await saveMatchResult({
                matchId,
                winnerId,
                loserId,
                winnerScore,
                loserScore,
                operation,
                mode: '1v1',
            });

            if (result.success) {
                setEloChange(isWinner ? result.winnerEloChange || 0 : result.loserEloChange || 0);
            }
            setHasSavedResult(true);
        }

        saveResult();
    }, [matchEnded, hasSavedResult, you, opponent, currentUserId, opponentId, matchId, operation]);

    const handleSubmit = useCallback(() => {
        if (!answer.trim() || !currentQuestion) return;

        const numAnswer = parseInt(answer, 10);
        if (isNaN(numAnswer)) return;

        const isCorrect = numAnswer === currentQuestion.answer;
        setShowResult(isCorrect ? 'correct' : 'wrong');

        // Send answer to server
        socketSubmitAnswer(numAnswer);

        // Clear after brief feedback
        setTimeout(() => {
            setShowResult(null);
            setAnswer('');
        }, 200);
    }, [answer, currentQuestion, socketSubmitAnswer]);

    // Auto-submit when the answer is correct (no Enter needed)
    useEffect(() => {
        if (!answer.trim() || !currentQuestion) return;

        const numAnswer = parseInt(answer, 10);
        if (isNaN(numAnswer)) return;

        // Auto-submit if correct
        if (numAnswer === currentQuestion.answer) {
            setShowResult('correct');
            socketSubmitAnswer(numAnswer);

            setTimeout(() => {
                setShowResult(null);
                setAnswer('');
            }, 200);
        }
    }, [answer, currentQuestion, socketSubmitAnswer]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    // Sound Effects: Match Start
    const [hasPlayedStartSound, setHasPlayedStartSound] = useState(false);
    useEffect(() => {
        if (matchStarted && !hasPlayedStartSound) {
            soundEngine.playMatchStart();
            setHasPlayedStartSound(true);
        }
    }, [matchStarted, hasPlayedStartSound]);

    // Sound Effects: Correct/Wrong Answer
    useEffect(() => {
        if (showResult === 'correct') {
            soundEngine.playCorrect(you?.odStreak || 0);
        } else if (showResult === 'wrong') {
            soundEngine.playIncorrect();
        }
    }, [showResult, you?.odStreak]);

    // Sound Effects: Time Warning (last 10 seconds)
    const [lastTimeWarning, setLastTimeWarning] = useState<number | null>(null);
    useEffect(() => {
        if (matchStarted && !matchEnded && timeLeft <= 10 && timeLeft > 0 && timeLeft !== lastTimeWarning) {
            soundEngine.playTimeWarning();
            setLastTimeWarning(timeLeft);
        }
    }, [timeLeft, matchStarted, matchEnded, lastTimeWarning]);

    // Sound Effects: Victory/Defeat at game end
    const [hasPlayedEndSound, setHasPlayedEndSound] = useState(false);
    useEffect(() => {
        if (matchEnded && !hasPlayedEndSound && you && opponent) {
            const isWinner = you.odScore > opponent.odScore;
            const isTie = you.odScore === opponent.odScore;

            if (isTie) {
                soundEngine.playComplete();
            } else if (isWinner) {
                soundEngine.playVictory();
            } else {
                soundEngine.playDefeat();
            }
            setHasPlayedEndSound(true);
        }
    }, [matchEnded, hasPlayedEndSound, you, opponent]);

    // Sound Effects: Opponent scores (track opponent score changes)
    const prevOpponentScore = useRef<number>(0);
    useEffect(() => {
        if (opponent && opponent.odScore > prevOpponentScore.current) {
            soundEngine.playOpponentScore();
        }
        prevOpponentScore.current = opponent?.odScore || 0;
    }, [opponent?.odScore]);

    // Progress bar width
    const timeProgress = (timeLeft / 60) * 100;

    // Waiting for opponent to connect via WebSocket
    if (waitingForOpponent && !matchStarted) {
        return (
            <div className="text-center space-y-8 p-12">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 mx-auto border-4 border-primary/30 border-t-primary rounded-full"
                />
                <div>
                    <h2 className="text-2xl font-bold mb-2">Connecting to Match...</h2>
                    <p className="text-muted-foreground">Syncing with your opponent</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">Players connected:</p>
                    <div className="flex gap-4 justify-center mt-2">
                        {Object.values(players).map((player, i) => (
                            <div key={i} className="px-4 py-2 bg-primary/20 rounded-lg font-medium">
                                {player.odName}
                            </div>
                        ))}
                        {Object.keys(players).length < 2 && (
                            <div className="px-4 py-2 bg-white/10 rounded-lg text-muted-foreground animate-pulse">
                                Waiting...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Game Over screen (including forfeit wins)
    if (matchEnded && (you || opponentForfeited)) {
        const wonByForfeit = !!opponentForfeited;
        const isWinner = wonByForfeit || (you && opponent ? you.odScore > opponent.odScore : false);
        const isTie = !wonByForfeit && you && opponent && you.odScore === opponent.odScore;

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
                        {wonByForfeit ? '🏆' : isTie ? '🤝' : isWinner ? '🏆' : '💪'}
                    </motion.div>
                    <h1 className={`text-4xl font-bold ${wonByForfeit ? 'text-green-500' : isTie ? 'text-yellow-500' : isWinner ? 'text-green-500' : 'text-accent'}`}>
                        {wonByForfeit ? 'Victory!' : isTie ? 'Draw!' : isWinner ? 'Victory!' : 'Good Fight!'}
                    </h1>
                    {wonByForfeit && (
                        <p className="text-muted-foreground">
                            {opponentForfeited} forfeited the match
                        </p>
                    )}
                </div>

                {/* Scoreboard */}
                <div className="glass rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="text-left">
                            <p className="text-sm text-muted-foreground">You</p>
                            <p className="text-3xl font-bold">{you?.odScore || 0}</p>
                        </div>
                        <div className="text-4xl">⚔️</div>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground">{opponentForfeited || opponent?.odName || 'Opponent'}</p>
                            <p className="text-3xl font-bold">{wonByForfeit ? 'FF' : opponent?.odScore || 0}</p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                            <p className="text-sm text-muted-foreground">Questions Answered</p>
                            <p className="text-xl font-bold">{you?.odQuestionsAnswered || 0}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Best Streak</p>
                            <p className="text-xl font-bold">{you?.odStreak || 0}🔥</p>
                        </div>
                    </div>

                    {/* ELO Change */}
                    <div className="pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground mb-1">Rating Change</p>
                        {eloChange !== null ? (
                            <p className={`text-2xl font-bold ${eloChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {eloChange >= 0 ? '+' : ''}{eloChange}
                            </p>
                        ) : wonByForfeit ? (
                            <p className="text-2xl font-bold text-green-500">+25</p>
                        ) : (
                            <p className="text-2xl font-bold text-muted-foreground animate-pulse">...</p>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 justify-center">
                    <button
                        onClick={() => router.push('/arena/modes')}
                        className="px-8 py-3 bg-primary hover:bg-primary/80 rounded-xl font-bold transition-colors"
                    >
                        Play Again
                    </button>
                    <button
                        onClick={() => router.push('/arena/modes')}
                        className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"
                    >
                        Back to Arena
                    </button>
                </div>
            </motion.div>
        );
    }

    // Active game
    return (
        <div className="space-y-6 w-full max-w-[1800px] mx-auto">
            {/* Leave Warning Modal */}
            <AnimatePresence>
                {showLeaveWarning && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowLeaveWarning(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="glass rounded-2xl p-6 max-w-md text-center space-y-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-5xl">⚠️</div>
                            <h2 className="text-2xl font-bold text-red-400">Leave Match?</h2>
                            <p className="text-muted-foreground">
                                Leaving now will count as a <strong className="text-red-400">forfeit</strong> and you will lose ELO.
                            </p>
                            <div className="flex gap-3 justify-center pt-2">
                                <button
                                    onClick={() => {
                                        leaveMatch();
                                        router.push('/arena/modes');
                                    }}
                                    className="px-6 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg font-medium hover:bg-red-500/30 transition-colors"
                                >
                                    Leave Match
                                </button>
                                <button
                                    onClick={() => setShowLeaveWarning(false)}
                                    className="px-6 py-2 bg-primary hover:bg-primary/80 rounded-lg font-medium transition-colors"
                                >
                                    Stay in Match
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header: Pro Scoreboard - Clean No-Box Design */}
            <div className="relative z-20 mb-8 w-full max-w-[1600px] mx-auto">
                <div className="flex items-center justify-between px-12">

                    {/* You Stats */}
                    <div className="flex items-center gap-8 relative z-10 w-1/3">
                        <div className="flex flex-col items-end">
                            <span className="text-6xl font-black text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)] tracking-tighter">{you?.odScore || 0}</span>
                            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-[0.3em] opacity-60">Points</span>
                        </div>
                        <div className="h-16 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                        <div className="flex flex-col">
                            <span className="text-xl font-black text-white truncate max-w-[200px] tracking-tight">{userName}</span>
                            <span className="text-[10px] text-cyan-400/60 font-black uppercase tracking-[0.2em]">Challenger</span>
                        </div>
                    </div>

                    {/* Center Timer Hub */}
                    <div className="relative flex flex-col items-center justify-center -my-10 w-1/3">
                        <div className="relative">
                            {/* Outer Glow Ring */}
                            <div className="absolute inset-0 rounded-full blur-[40px] bg-primary/20" />

                            {/* Timer Circle */}
                            <div className="w-32 h-32 rounded-full relative flex items-center justify-center bg-black/40 backdrop-blur-sm border border-white/5">
                                <svg className="absolute inset-0 w-full h-full -rotate-90">
                                    <circle cx="64" cy="64" r="60" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
                                    <motion.circle
                                        cx="64" cy="64" r="60"
                                        fill="none" stroke="currentColor" strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeDasharray="377"
                                        className={`${timeLeft <= 10 ? 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-primary drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]'}`}
                                        initial={{ strokeDashoffset: 0 }}
                                        animate={{ strokeDashoffset: 377 * (1 - timeLeft / 60) }}
                                        transition={{ duration: 1, ease: "linear" }}
                                    />
                                </svg>
                                <div className="flex flex-col items-center leading-none z-10">
                                    <span className={`text-5xl font-black tracking-tighter ${timeLeft <= 10 ? 'text-red-500' : 'text-white'}`}>
                                        {timeLeft}
                                    </span>
                                    <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mt-1">Seconds</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Opponent Stats */}
                    <div className="flex items-center gap-8 justify-end relative z-10 w-1/3">
                        <div className="flex flex-col items-end">
                            <span className="text-xl font-black text-white truncate max-w-[200px] tracking-tight">{opponent?.odName || 'Opponent'}</span>
                            <span className="text-[10px] text-amber-400/60 font-black uppercase tracking-[0.2em]">Contender</span>
                        </div>
                        <div className="h-16 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                        <div className="flex flex-col items-start">
                            <span className="text-6xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.4)] tracking-tighter">{opponent?.odScore || 0}</span>
                            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-[0.3em] opacity-60">Points</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Battle Area - Ultra Wide Split View */}
            <div className="grid grid-cols-2 gap-24 min-h-[500px] w-full max-w-[1800px] mx-auto px-8">
                {/* Left Side: You */}
                <div className="flex flex-col gap-8">
                    <motion.div
                        animate={showResult === 'correct' ? { scale: [1, 1.02, 1] } : {}}
                        className={`flex-1 rounded-[3rem] bg-cyan-950/10 border-2 relative overflow-hidden transition-all duration-300 shadow-2xl aspect-[4/3] ${showResult === 'correct' ? 'border-green-500 shadow-green-500/20' :
                            showResult === 'wrong' ? 'border-red-500 shadow-red-500/20' :
                                'border-cyan-500/20 group-hover:border-cyan-500/40'
                            }`}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-50" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentQuestion?.question}
                                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 1.2, filter: 'blur(20px)' }}
                                    className="text-center w-full"
                                >
                                    {/* Question Format: 8 + 4 = ? */}
                                    <div className="flex items-center justify-center gap-3 text-5xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-[0_0_30px_rgba(34,211,238,0.4)]">
                                        <span>{currentQuestion?.question ? currentQuestion.question.split(' ')[0] : '?'}</span>
                                        <span className="text-cyan-400">{currentQuestion?.question ? currentQuestion.question.split(' ')[1] : '+'}</span>
                                        <span>{currentQuestion?.question ? currentQuestion.question.split(' ')[2] : '?'}</span>
                                        <span className="text-white/40">=</span>
                                        <span className={answer ? 'text-cyan-400' : 'text-white/20 animate-pulse'}>
                                            {answer || '?'}
                                        </span>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Hidden Input field but keep it functional */}
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value.replace(/[^0-9-]/g, ''))}
                            onKeyDown={handleKeyDown}
                            className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent outline-none cursor-default"
                            disabled={matchEnded}
                        />

                        <div className="absolute bottom-12 w-full text-center">
                            <span className="px-6 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400 font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                                Solve Equation
                            </span>
                        </div>
                    </motion.div>

                    {/* You Player Banner */}
                    <div className="flex justify-center w-full px-12">
                        <PlayerBanner
                            name={you?.odName || initialPlayers?.[currentUserId]?.name || userName}
                            level={initialPlayers?.[currentUserId]?.level || 1}
                            rank={initialPlayers?.[currentUserId]?.tier || 'Bronze'}
                            division=""
                            styleId={initialPlayers?.[currentUserId]?.banner || 'default'}
                            title={initialPlayers?.[currentUserId]?.title || 'FlashMath Competitor'}
                            className="w-full h-24 shadow-2xl shadow-cyan-900/20 border-cyan-500/30"
                        />
                    </div>
                </div>

                {/* Right Side: Opponent */}
                <div className="flex flex-col gap-8">
                    <div className="flex-1 rounded-[3rem] bg-amber-950/10 border-2 border-amber-500/20 relative overflow-hidden shadow-2xl aspect-[4/3]">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-50" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={opponent?.odCurrentQuestion?.question || 'waiting'}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center w-full"
                                >
                                    {/* Opponent Question Preview */}
                                    <div className="flex items-center justify-center gap-3 text-5xl lg:text-7xl font-black text-white/20 tracking-tighter blur-[4px] select-none">
                                        <span>{opponent?.odCurrentQuestion?.question ? opponent.odCurrentQuestion.question.split(' ')[0] : '?'}</span>
                                        <span>{opponent?.odCurrentQuestion?.question ? opponent.odCurrentQuestion.question.split(' ')[1] : '+'}</span>
                                        <span>{opponent?.odCurrentQuestion?.question ? opponent.odCurrentQuestion.question.split(' ')[2] : '?'}</span>
                                        <span>=</span>
                                        <span>?</span>
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="absolute bottom-12 w-full text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1 }}
                                    className="w-2 h-2 rounded-full bg-amber-500"
                                />
                                <motion.span className="text-xs text-amber-500/60 font-black uppercase tracking-[0.2em]">
                                    OPPONENT SOLVING
                                </motion.span>
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1, delay: 0.5 }}
                                    className="w-2 h-2 rounded-full bg-amber-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Opponent Player Banner - Pro Style */}
                    <div className="flex justify-center w-full px-12">
                        <PlayerBanner
                            name={opponent?.odName || (opponentId ? initialPlayers?.[opponentId]?.name : 'Opponent') || 'Opponent'}
                            level={opponentId ? initialPlayers?.[opponentId]?.level || 0 : 0}
                            rank={opponentId ? initialPlayers?.[opponentId]?.tier || 'Bronze' : 'Bronze'}
                            division=""
                            styleId={opponentId ? initialPlayers?.[opponentId]?.banner || 'default' : 'default'}
                            title={opponentId ? initialPlayers?.[opponentId]?.title || 'Contender' : 'Contender'}
                            className="w-full h-24 shadow-2xl shadow-amber-900/20 border-amber-500/30"
                        />
                    </div>
                </div>
            </div>

            {/* Footer Status */}
            <div className="flex items-center justify-center gap-6 mt-12 opacity-50">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Network Performance Stabilized</span>
                </div>
                <div className="w-[1px] h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Secure Arena Hash: {matchId.slice(0, 8)}</span>
                </div>
            </div>
        </div>
    );
}

