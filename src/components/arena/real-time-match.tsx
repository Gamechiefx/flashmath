'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useArenaSocket } from '@/lib/socket/use-arena-socket';

import { PlayerBanner } from '@/components/arena/player-banner';
import { soundEngine } from '@/lib/sound-engine';
import { SoundToggle } from '@/components/sound-toggle';
import { AuthHeader } from '@/components/auth-header';
import { LogOut } from 'lucide-react';

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
    const { update } = useSession();
    const inputRef = useRef<HTMLInputElement>(null);

    const [answer, setAnswer] = useState('');
    const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
    const [eloChange, setEloChange] = useState<number | null>(null);
    const [coinsEarned, setCoinsEarned] = useState<number | null>(null);
    const [hasSavedResult, setHasSavedResult] = useState(false);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    const [resultData, setResultData] = useState<any>(null);
    const savingRef = useRef(false); // Prevent double-save during HMR

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
        isAiMatch,
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
        console.log('[Match] Save effect check:', { matchEnded, hasSavedResult, saving: savingRef.current, you: !!you, opponent: !!opponent, youScore: you?.odScore, oppScore: opponent?.odScore });

        if (!matchEnded || hasSavedResult || savingRef.current) return;

        // Wait for player data to be available
        if (!you || !opponent) {
            console.log('[Match] Waiting for player data...');
            return;
        }

        savingRef.current = true; // Lock to prevent double-save

        async function saveResult() {
            const yourScore = you!.odScore || 0;
            const oppScore = opponent!.odScore || 0;

            // Determine winner (ties go to opponent for simplicity)
            const youWon = yourScore > oppScore;
            const winnerId = youWon ? currentUserId : opponentId!;
            const loserId = youWon ? opponentId! : currentUserId;
            const winnerScore = Math.max(yourScore, oppScore);
            const loserScore = Math.min(yourScore, oppScore);

            console.log('[Match] Saving result:', { winnerId, loserId, winnerScore, loserScore, youWon });

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

            console.log('[Match] Save result response:', JSON.stringify(result, null, 2));

            if (result.success) {
                setEloChange(youWon ? result.winnerEloChange || 0 : result.loserEloChange || 0);
                setCoinsEarned(youWon ? result.winnerCoinsEarned || 0 : result.loserCoinsEarned || 0);
                setResultData(result);

                // Refresh Next.js server components
                router.refresh();

                // FORCE update of client-side session to show new coins in header
                await update();
            } else {
                console.error('[Match] Failed to save result:', result.error);
            }
            setHasSavedResult(true);
        }

        saveResult();
    }, [matchEnded, hasSavedResult, you, opponent, currentUserId, opponentId, matchId, operation, router, update]);

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
    if (matchEnded) {
        const wonByForfeit = !!opponentForfeited;
        const isWinner = wonByForfeit || (you && opponent ? you.odScore > opponent.odScore : false);
        const isTie = !wonByForfeit && you && opponent && you.odScore === opponent.odScore;
        const resultText = wonByForfeit ? 'VICTORY' : isTie ? 'DRAW' : isWinner ? 'VICTORY' : 'DEFEAT';

        // Determine winner and loser data for display
        const winnerBase = isWinner ? you : opponent;
        const loserBase = isWinner ? opponent : you;

        // Use fresh stats if available, otherwise fallback to initial data
        const winnerStats = resultData?.winnerStats;
        const loserStats = resultData?.loserStats;

        const winnerName = isWinner
            ? (you?.odName || initialPlayers?.[currentUserId]?.name || userName)
            : (opponent?.odName || (opponentId ? initialPlayers?.[opponentId]?.name : 'Opponent'));

        const loserName = isWinner
            ? (opponent?.odName || (opponentId ? initialPlayers?.[opponentId]?.name : 'Opponent'))
            : (you?.odName || initialPlayers?.[currentUserId]?.name || userName);

        const winnerBanner = isWinner
            ? (you?.odEquippedBanner || initialPlayers?.[currentUserId]?.banner || 'default')
            : (opponent?.odEquippedBanner || (opponentId ? initialPlayers?.[opponentId]?.banner : 'default'));

        const loserBanner = isWinner
            ? (opponent?.odEquippedBanner || (opponentId ? initialPlayers?.[opponentId]?.banner : 'default'))
            : (you?.odEquippedBanner || initialPlayers?.[currentUserId]?.banner || 'default');

        const winnerTitle = isWinner
            ? (you?.odEquippedTitle || initialPlayers?.[currentUserId]?.title || 'Champion')
            : (opponent?.odEquippedTitle || (opponentId ? initialPlayers?.[opponentId]?.title : 'Champion'));

        const loserTitle = isWinner
            ? (opponent?.odEquippedTitle || (opponentId ? initialPlayers?.[opponentId]?.title : 'Contender'))
            : (you?.odEquippedTitle || initialPlayers?.[currentUserId]?.title || 'Contender');

        const winnerLevel = isWinner
            ? (you?.odLevel || initialPlayers?.[currentUserId]?.level || 1)
            : (opponent?.odLevel || (opponentId ? initialPlayers?.[opponentId]?.level : 1));

        const loserLevel = isWinner
            ? (opponent?.odLevel || (opponentId ? initialPlayers?.[opponentId]?.level : 1))
            : (you?.odLevel || initialPlayers?.[currentUserId]?.level || 1);

        // Rank info - use fresh stats if available, default to Bronze
        const winnerRank = winnerStats?.rank || 'Bronze';
        const winnerDivision = winnerStats?.division || "I";
        const loserRank = loserStats?.rank || 'Bronze';

        const loserDivision = loserStats?.division || "I";

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full w-full flex flex-col"
            >
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="shrink-0"
                >
                    <AuthHeader />
                </motion.div>

                {/* Main Content: Winner - Stats - Loser */}
                <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">

                    {/* Winner Side (Left) */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, type: "spring", damping: 20 }}
                        className="flex flex-col items-center gap-6"
                    >
                        {/* Trophy Icon */}
                        <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.4, type: "spring", damping: 10 }}
                            className="relative"
                        >
                            <div className="text-8xl filter drop-shadow-[0_0_30px_rgba(234,179,8,0.5)]">
                                🏆
                            </div>
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full -z-10"
                            />
                        </motion.div>

                        {/* Winner Label */}
                        <div className="text-center">
                            <span className="text-xs font-black uppercase tracking-[0.3em] text-yellow-400/60">Winner</span>
                            {isTie && <span className="block text-xs text-white/40 mt-1">(Draw)</span>}
                        </div>

                        {/* Winner Banner */}
                        <div className="w-full max-w-sm">
                            <PlayerBanner
                                name={wonByForfeit ? userName : (winnerName || 'Winner')}
                                level={wonByForfeit ? (you?.odLevel || 1) : (winnerLevel || 1)}
                                rank={winnerRank}
                                division={wonByForfeit ? "I" : (winnerDivision || "I")}
                                styleId={wonByForfeit ? (you?.odEquippedBanner || 'default') : (winnerBanner || 'default')}
                                title={wonByForfeit ? (you?.odEquippedTitle || 'Champion') : (winnerTitle || 'Champion')}
                                className="w-full shadow-2xl shadow-yellow-500/20 border-yellow-500/40"
                            />
                        </div>

                        {/* Winner Score */}
                        <div className="glass rounded-xl px-6 py-3 border border-yellow-500/30">
                            <span className="text-3xl font-black text-yellow-400">
                                {wonByForfeit ? (you?.odScore || 0) : (winnerBase?.odScore || 0)}
                            </span>
                            <span className="text-sm text-white/40 ml-2">points</span>
                        </div>
                    </motion.div>

                    {/* Center: Match Statistics */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-center"
                    >
                        <div className="w-full rounded-3xl border-2 border-amber-600/50 bg-gradient-to-b from-amber-900/40 to-amber-950/60 backdrop-blur-sm p-8 shadow-2xl shadow-amber-900/30">
                            {/* Stats Header */}
                            <h2 className="text-2xl font-black text-center text-amber-400 uppercase tracking-widest mb-8">
                                Match Statistics
                            </h2>

                            {/* Result Banner */}
                            <div className="text-center mb-8">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.5, type: "spring", damping: 10 }}
                                    className={`text-4xl font-black ${wonByForfeit ? 'text-green-400' : isTie ? 'text-yellow-400' : isWinner ? 'text-green-400' : 'text-accent'}`}
                                >
                                    {wonByForfeit ? 'VICTORY!' : isTie ? 'DRAW!' : isWinner ? 'VICTORY!' : 'DEFEAT'}
                                </motion.div>
                                {wonByForfeit && (
                                    <p className="text-sm text-white/50 mt-2">
                                        {opponentForfeited} forfeited the match
                                    </p>
                                )}
                            </div>

                            {/* Score Comparison */}
                            <div className="flex items-center justify-center gap-6 mb-8 p-4 rounded-xl bg-black/30 border border-white/10">
                                <div className="text-center">
                                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">You</p>
                                    <p className="text-3xl font-black text-cyan-400">{you?.odScore || 0}</p>
                                </div>
                                <div className="text-3xl text-white/30">⚔️</div>
                                <div className="text-center">
                                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">{opponentForfeited || opponent?.odName || 'Opponent'}</p>
                                    <p className="text-3xl font-black text-amber-400">{wonByForfeit ? 'FF' : opponent?.odScore || 0}</p>
                                </div>
                            </div>

                            {/* Detailed Stats */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center">
                                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Questions</p>
                                    <p className="text-2xl font-black text-white">{you?.odQuestionsAnswered || 0}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-center">
                                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Best Streak</p>
                                    <p className="text-2xl font-black text-white">{you?.odStreak || 0} 🔥</p>
                                </div>
                            </div>

                            {/* ELO Change & Coins Earned */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-black/30 border border-white/10 text-center">
                                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Rating Change</p>
                                    {eloChange !== null ? (
                                        <motion.p
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.6, type: "spring" }}
                                            className={`text-3xl font-black ${eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                        >
                                            {eloChange >= 0 ? '+' : ''}{eloChange}
                                        </motion.p>
                                    ) : wonByForfeit ? (
                                        <p className="text-3xl font-black text-green-400">+25</p>
                                    ) : (
                                        <p className="text-3xl font-black text-white/30 animate-pulse">...</p>
                                    )}
                                </div>
                                <div className="p-4 rounded-xl bg-black/30 border border-yellow-500/20 text-center">
                                    <p className="text-xs text-yellow-400/60 uppercase tracking-wider mb-2">Coins Earned</p>
                                    {coinsEarned !== null ? (
                                        <motion.p
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.7, type: "spring" }}
                                            className="text-3xl font-black text-yellow-400"
                                        >
                                            +{coinsEarned} §
                                        </motion.p>
                                    ) : wonByForfeit ? (
                                        <p className="text-3xl font-black text-yellow-400">+10 §</p>
                                    ) : (
                                        <p className="text-3xl font-black text-white/30 animate-pulse">...</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.7 }}
                            className="flex gap-4 mt-8"
                        >
                            <button
                                onClick={() => router.push('/arena/modes')}
                                className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 rounded-xl font-black uppercase tracking-wider text-white shadow-lg shadow-green-500/30 transition-all hover:scale-105"
                            >
                                Play Again
                            </button>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold uppercase tracking-wider text-white/80 border border-white/20 transition-all hover:scale-105"
                            >
                                Dashboard
                            </button>
                        </motion.div>
                    </motion.div>

                    {/* Loser Side (Right) */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, type: "spring", damping: 20 }}
                        className="flex flex-col items-center gap-6"
                    >
                        {/* Muscle Icon */}
                        <motion.div
                            initial={{ scale: 0, rotate: 20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.4, type: "spring", damping: 10 }}
                            className="relative"
                        >
                            <div className="text-8xl filter drop-shadow-[0_0_20px_rgba(251,146,60,0.4)]">
                                💪
                            </div>
                            <motion.div
                                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                transition={{ repeat: Infinity, duration: 2.5 }}
                                className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full -z-10"
                            />
                        </motion.div>

                        {/* Loser Label */}
                        <div className="text-center">
                            <span className="text-xs font-black uppercase tracking-[0.3em] text-orange-400/60">
                                {wonByForfeit ? 'Forfeited' : isTie ? 'Challenger' : 'Challenger'}
                            </span>
                        </div>

                        {/* Loser Banner */}
                        <div className="w-full max-w-sm">
                            <PlayerBanner
                                name={wonByForfeit ? (opponentForfeited || 'Opponent') : (loserName || 'Opponent')}
                                level={wonByForfeit ? 0 : (loserLevel || 1)}
                                rank={wonByForfeit ? 'Bronze' : (loserRank || 'Bronze')}
                                division={wonByForfeit ? "I" : (loserDivision || "I")}
                                styleId={wonByForfeit ? 'default' : (loserBanner || 'default')}
                                title={wonByForfeit ? 'Forfeited' : (loserTitle || 'Contender')}
                                className="w-full shadow-2xl shadow-orange-500/20 border-orange-500/40 opacity-80"
                            />
                        </div>

                        {/* Loser Score */}
                        <div className="glass rounded-xl px-6 py-3 border border-orange-500/30 opacity-80">
                            <span className="text-3xl font-black text-orange-400">
                                {wonByForfeit ? 'FF' : (loserBase?.odScore || 0)}
                            </span>
                            {!wonByForfeit && <span className="text-sm text-white/40 ml-2">points</span>}
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        );
    }

    // Active game
    return (
        <div className="h-full w-full max-w-[1800px] mx-auto flex flex-col pt-8">
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
            <div className="relative z-20 mb-4 w-full max-w-[1600px] mx-auto shrink-0">
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
            <div className="grid grid-cols-2 gap-16 flex-1 w-full max-w-[1800px] mx-auto px-8 min-h-0">
                {/* Left Side: You */}
                <div className="flex flex-col gap-4">
                    <motion.div
                        animate={showResult === 'correct' ? { scale: [1, 1.02, 1] } : {}}
                        className={`flex-1 rounded-[3rem] bg-cyan-950/10 border-2 relative overflow-hidden transition-all duration-300 shadow-2xl min-h-[300px] ${showResult === 'correct' ? 'border-green-500 shadow-green-500/20' :
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
                            level={you?.odLevel || initialPlayers?.[currentUserId]?.level || 1}
                            rank="Bronze"
                            division=""
                            styleId={you?.odEquippedBanner || initialPlayers?.[currentUserId]?.banner || 'default'}
                            title={you?.odEquippedTitle || initialPlayers?.[currentUserId]?.title || 'FlashMath Competitor'}
                            className="w-full h-24 shadow-2xl shadow-cyan-900/20 border-cyan-500/30"
                        />
                    </div>
                </div>

                {/* Right Side: Opponent */}
                <div className="flex flex-col gap-4">
                    <div className="flex-1 rounded-[3rem] bg-amber-950/10 border-2 border-amber-500/20 relative overflow-hidden shadow-2xl min-h-[300px]">
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
                            level={opponent?.odLevel || (opponentId ? initialPlayers?.[opponentId]?.level : 0) || 0}
                            rank="Bronze"
                            division=""
                            styleId={opponent?.odEquippedBanner || (opponentId ? initialPlayers?.[opponentId]?.banner : 'default') || 'default'}
                            title={opponent?.odEquippedTitle || (opponentId ? initialPlayers?.[opponentId]?.title : 'Contender') || 'Contender'}
                            className="w-full h-24 shadow-2xl shadow-amber-900/20 border-amber-500/30"
                        />
                    </div>
                </div>
            </div>


            {/* Leave Match Button - Top Left */}
            <button
                onClick={() => setShowLeaveWarning(true)}
                className="fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400/60 hover:text-red-400 transition-all"
                title="Leave Match"
            >
                <LogOut size={18} />
            </button>

            {/* Sound Toggle */}
            <div className="fixed bottom-8 right-8 z-50">
                <SoundToggle />
            </div>
        </div>
    );
}

