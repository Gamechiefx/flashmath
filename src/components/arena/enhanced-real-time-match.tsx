'use client';

/**
 * Enhanced Real-Time Match Component
 * 
 * Feature: bug-fixes-ui-optimization
 * Task: 2. Real-Time Match Synchronization Enhancement
 * 
 * Enhancements:
 * - Improved connection stability and reconnection handling
 * - Enhanced state synchronization with conflict resolution
 * - Lag compensation for better real-time experience
 * - Connection quality indicators and adaptive performance
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEnhancedArenaSocket } from '@/lib/socket/enhanced-arena-socket';

import { PlayerBanner } from '@/components/arena/player-banner';
import { soundEngine } from '@/lib/sound-engine';
import { SoundToggle } from '@/components/sound-toggle';
import { AuthHeader } from '@/components/auth-header';
import { LogOut, Loader2, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { 
    checkFriendshipStatus, 
    sendFriendRequestToUser 
} from '@/lib/actions/social';

interface EnhancedRealTimeMatchProps {
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
        rank: string;
        division: string;
    }>;
}

export function EnhancedRealTimeMatch({
    matchId,
    currentUserId,
    userName,
    operation,
    isAiMatch = false,
    initialPlayers
}: EnhancedRealTimeMatchProps) {
    const router = useRouter();
    const { update } = useSession();
    const inputRef = useRef<HTMLInputElement>(null);

    // Basic match state
    const [answer, setAnswer] = useState('');
    const [showResult, setShowResult] = useState<'correct' | 'wrong' | null>(null);
    const [hasSavedResult, setHasSavedResult] = useState(false);
    const [showLeaveWarning, setShowLeaveWarning] = useState(false);
    interface MatchResultData {
        success: boolean;
        winnerEloChange?: number;
        loserEloChange?: number;
        winnerCoinsEarned?: number;
        loserCoinsEarned?: number;
        isRanked?: boolean;
        isVoid?: boolean;
        isDraw?: boolean;
        voidReason?: string;
        connectionQuality?: string;
        error?: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- resultData is set but not currently displayed
    const [resultData, setResultData] = useState<MatchResultData | null>(null);
    const savingRef = useRef(false);
    
    // Match result state
    const [eloChange, setEloChange] = useState<number>(0);
    const [coinsEarned, setCoinsEarned] = useState<number>(0);
    const [lastCorrectAnswer, setLastCorrectAnswer] = useState<number | null>(null);
    
    // These states are used in the results display
    void eloChange; void coinsEarned;

    // Enhanced connection state
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
    const [showConnectionAlert, setShowConnectionAlert] = useState(false);
    const [syncConflicts, setSyncConflicts] = useState<number>(0);
    const [lagCompensationActive, setLagCompensationActive] = useState(false);

    // Final stats preservation
    const [finalStats, setFinalStats] = useState<{
        yourScore: number;
        yourQuestionsAnswered: number;
        yourStreak: number;
        yourName: string;
        yourBanner: string;
        yourTitle: string;
        yourLevel: number;
        yourRank: string;
        yourDivision: string;
        opponentScore: number;
        opponentName: string;
        opponentBanner: string;
        opponentTitle: string;
        opponentLevel: number;
        opponentRank: string;
        opponentDivision: string;
    } | null>(null);
    
    // Friend request state - currently unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [friendshipStatus, setFriendshipStatus] = useState<{
        isFriend: boolean;
        requestPending: boolean;
        requestDirection?: 'sent' | 'received';
    } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [friendRequestSent, setFriendRequestSent] = useState(false);

    // Enhanced arena socket with improved synchronization
    const {
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
        syncState,
        lagCompensation,
        reconnectAttempts,
        submitAnswer: socketSubmitAnswer,
        leaveMatch,
        preserveCurrentState,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- forceSync is available but not currently used
        forceSync,
    } = useEnhancedArenaSocket({
        matchId,
        userId: currentUserId,
        userName,
        operation,
        isAiMatch,
        userRank: initialPlayers?.[currentUserId]?.rank,
        userDivision: initialPlayers?.[currentUserId]?.division,
        userLevel: initialPlayers?.[currentUserId]?.level,
        userBanner: initialPlayers?.[currentUserId]?.banner,
        userTitle: initialPlayers?.[currentUserId]?.title,
        enableLagCompensation: true,
        maxReconnectAttempts: 5,
        syncUpdateInterval: 1000,
        connectionQualityThreshold: { green: 100, yellow: 300 },
        
        // Enhanced callbacks
        onSyncConflict: (conflict) => {
            console.warn('[Enhanced Match] Sync conflict:', conflict);
            setSyncConflicts(prev => prev + 1);
        },
        
        onReconnectionAttempt: (attempt) => {
            console.log('[Enhanced Match] Reconnection attempt:', attempt);
            setConnectionStatus('reconnecting');
            setShowConnectionAlert(true);
        },
        
        onConnectionStatesUpdate: (states) => {
            const myState = states[currentUserId];
            if (myState) {
                // Update lag compensation indicator
                setLagCompensationActive(myState.rtt > 150);
                
                // Show connection alerts for poor quality
                if (myState.state === 'RED' || myState.state === 'YELLOW') {
                    setShowConnectionAlert(true);
                    setTimeout(() => setShowConnectionAlert(false), 5000);
                }
            }
        }
    });

    // Update connection status based on socket state
    useEffect(() => {
        if (connected) {
            setConnectionStatus('connected');
            setShowConnectionAlert(false);
        } else if (reconnectAttempts > 0) {
            setConnectionStatus('reconnecting');
        } else {
            setConnectionStatus('disconnected');
        }
    }, [connected, reconnectAttempts]);

    // Get player data
    const you = players[currentUserId];
    const opponentId = Object.keys(players).find(id => id !== currentUserId);
    const opponent = opponentId ? players[opponentId] : null;

    // Get connection state with enhanced metrics
    const myConnectionState = connectionStates[currentUserId] || { 
        state: 'GREEN', 
        rtt: 0, 
        jitter: 0, 
        loss: 0, 
        disconnects: 0 
    };

    // Auto-focus input with connection awareness
    useEffect(() => {
        if (matchStarted && !matchEnded && connected) {
            inputRef.current?.focus();
        }
    }, [matchStarted, matchEnded, currentQuestion, connected]);

    // Enhanced navigation prevention with state preservation
    useEffect(() => {
        if (!matchStarted || matchEnded) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            preserveCurrentState();
            e.preventDefault();
            e.returnValue = 'You are in an active match! Leaving will count as a forfeit.';
            return e.returnValue;
        };

        const handlePopState = (e: PopStateEvent) => {
            e.preventDefault();
            preserveCurrentState();
            window.history.pushState(null, '', window.location.href);
            setShowLeaveWarning(true);
        };

        window.history.pushState(null, '', window.location.href);
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [matchStarted, matchEnded, preserveCurrentState]);

    // Enhanced final stats capture with sync awareness
    useEffect(() => {
        if (matchEnded && you && opponent && !finalStats) {
            setFinalStats({
                yourScore: you.odScore || 0,
                yourQuestionsAnswered: you.odQuestionsAnswered || 0,
                yourStreak: you.odStreak || 0,
                yourName: you.odName || initialPlayers?.[currentUserId]?.name || userName,
                yourBanner: you.odEquippedBanner || initialPlayers?.[currentUserId]?.banner || 'default',
                yourTitle: you.odEquippedTitle || initialPlayers?.[currentUserId]?.title || 'Challenger',
                yourLevel: you.odLevel || initialPlayers?.[currentUserId]?.level || 1,
                yourRank: you.odRank || initialPlayers?.[currentUserId]?.rank || 'Bronze',
                yourDivision: you.odDivision || initialPlayers?.[currentUserId]?.division || 'I',
                opponentScore: opponent.odScore || 0,
                opponentName: opponent.odName || (opponentId ? initialPlayers?.[opponentId]?.name : 'Opponent') || 'Opponent',
                opponentBanner: opponent.odEquippedBanner || (opponentId ? initialPlayers?.[opponentId]?.banner : 'default') || 'default',
                opponentTitle: opponent.odEquippedTitle || (opponentId ? initialPlayers?.[opponentId]?.title : 'Contender') || 'Contender',
                opponentLevel: opponent.odLevel || (opponentId ? initialPlayers?.[opponentId]?.level : 1) || 1,
                opponentRank: opponent.odRank || (opponentId ? initialPlayers?.[opponentId]?.rank : 'Bronze') || 'Bronze',
                opponentDivision: opponent.odDivision || (opponentId ? initialPlayers?.[opponentId]?.division : 'I') || 'I',
            });
        }
    }, [matchEnded, you, opponent, finalStats, userName, currentUserId, opponentId, initialPlayers]);

    // Enhanced match result saving with retry logic
    const MAX_RETRIES = 3;
    
    useEffect(() => {
        if (!matchEnded || hasSavedResult || savingRef.current) return;
        if (!you || !opponent) return;

        savingRef.current = true;

        async function saveResultWithRetry(retryCount = 0) {
            try {
                const yourScore = you!.odScore || 0;
                const oppScore = opponent!.odScore || 0;
                const isDraw = yourScore === oppScore;
                const youWon = yourScore > oppScore;
                
                const winnerId = isDraw ? currentUserId : (youWon ? currentUserId : opponentId!);
                const loserId = isDraw ? opponentId! : (youWon ? opponentId! : currentUserId);
                const winnerScore = isDraw ? yourScore : Math.max(yourScore, oppScore);
                const loserScore = isDraw ? oppScore : Math.min(yourScore, oppScore);

                const winnerPerformance = performanceStats?.[winnerId];
                const loserPerformance = performanceStats?.[loserId];

                const { saveMatchResult } = await import('@/lib/actions/matchmaking');
                const result = await saveMatchResult({
                    matchId,
                    winnerId,
                    loserId,
                    winnerScore,
                    loserScore,
                    operation,
                    mode: '1v1',
                    winnerPerformance,
                    loserPerformance,
                    matchIntegrity: matchIntegrity || 'GREEN',
                    isDraw
                    // Note: syncVersion and connectionQuality are tracked for debugging but not stored
                });

                if (result.success) {
                    setEloChange(youWon ? result.winnerEloChange || 0 : result.loserEloChange || 0);
                    setCoinsEarned(youWon ? result.winnerCoinsEarned || 0 : result.loserCoinsEarned || 0);
                    setResultData(result);
                    setHasSavedResult(true);
                    savingRef.current = false;
                    router.refresh();
                    await update();
                } else {
                    throw new Error(result.error || 'Failed to save match result');
                }
            } catch (error) {
                console.error('[Enhanced Match] Save result error:', error);
                
                // Retry logic for network issues
                if (retryCount < MAX_RETRIES) {
                    setTimeout(() => saveResultWithRetry(retryCount + 1), 2000 * (retryCount + 1));
                } else {
                    console.error('[Enhanced Match] Max save retries reached');
                    // Only mark as "saved" after exhausting all retries to prevent infinite loops
                    setHasSavedResult(true);
                    savingRef.current = false;
                }
            }
        }

        saveResultWithRetry();
    }, [matchEnded, hasSavedResult, you, opponent, currentUserId, opponentId, matchId, operation, router, update, performanceStats, matchIntegrity, syncState.version, myConnectionState.state]);

    // Enhanced answer submission with optimistic updates
    const isProcessingRef = useRef(false);

    const handleSubmit = useCallback(() => {
        if (!answer.trim() || !currentQuestion || showResult || isProcessingRef.current || !connected) return;

        const numAnswer = parseInt(answer, 10);
        if (isNaN(numAnswer)) return;

        isProcessingRef.current = true;
        const isCorrect = numAnswer === currentQuestion.answer;
        setShowResult(isCorrect ? 'correct' : 'wrong');

        // Enhanced answer submission with lag compensation
        socketSubmitAnswer(numAnswer);

        if (isCorrect) {
            setTimeout(() => {
                setShowResult(null);
                setAnswer('');
                setLastCorrectAnswer(null);
                isProcessingRef.current = false;
            }, 200);
        } else {
            setLastCorrectAnswer(currentQuestion.answer);
            setTimeout(() => {
                setShowResult(null);
                setAnswer('');
                setLastCorrectAnswer(null);
                isProcessingRef.current = false;
            }, 400);
        }
    }, [answer, currentQuestion, socketSubmitAnswer, showResult, connected]);

    // Enhanced auto-submit with connection awareness
    // Delegates to handleSubmit to avoid duplicate logic and prevent race conditions
    useEffect(() => {
        if (!answer.trim() || !currentQuestion || showResult || isProcessingRef.current || !connected) return;

        const numAnswer = parseInt(answer, 10);
        if (isNaN(numAnswer)) return;

        const expectedAnswerStr = String(Math.abs(currentQuestion.answer));
        const typedDigits = answer.replace('-', '');
        
        if (typedDigits.length < expectedAnswerStr.length) return;

        // Delegate to handleSubmit to use a single submission path
        // This prevents race conditions between manual and auto-submit
        handleSubmit();
    }, [answer, currentQuestion, showResult, connected, handleSubmit]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !showResult && !isProcessingRef.current && connected) {
            handleSubmit();
        }
    };


    // Sound effects (same as original but with connection awareness)
    const [hasPlayedStartSound, setHasPlayedStartSound] = useState(false);
    useEffect(() => {
        if (matchStarted && !hasPlayedStartSound && connected) {
            soundEngine.playMatchStart();
            setHasPlayedStartSound(true);
        }
    }, [matchStarted, hasPlayedStartSound, connected]);

    useEffect(() => {
        if (showResult === 'correct') {
            soundEngine.playCorrect(you?.odStreak || 0);
        } else if (showResult === 'wrong') {
            soundEngine.playIncorrect();
        }
    }, [showResult, you?.odStreak]);

    const [lastTimeWarning, setLastTimeWarning] = useState<number | null>(null);
    useEffect(() => {
        if (matchStarted && !matchEnded && timeLeft <= 10 && timeLeft > 0 && timeLeft !== lastTimeWarning) {
            soundEngine.playTimeWarning();
            setLastTimeWarning(timeLeft);
        }
    }, [timeLeft, matchStarted, matchEnded, lastTimeWarning]);

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

    const prevOpponentScore = useRef<number>(0);
    useEffect(() => {
        if (opponent && opponent.odScore > prevOpponentScore.current) {
            soundEngine.playOpponentScore();
        }
        prevOpponentScore.current = opponent?.odScore || 0;
    }, [opponent]);
    
    // Friend request handling (same as original)
    useEffect(() => {
        if (!matchEnded || !opponentId) return;
        if (opponentId.startsWith('ai_bot_')) return;
        
        async function checkStatus() {
            const status = await checkFriendshipStatus(opponentId!);
            setFriendshipStatus(status);
        }
        checkStatus();
    }, [matchEnded, opponentId]);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- handleSendFriendRequest is kept for future use
    const handleSendFriendRequest = async () => {
        if (!opponentId || opponentId.startsWith('ai_bot_')) return;
        
        setSendingFriendRequest(true);
        const result = await sendFriendRequestToUser(opponentId);
        setSendingFriendRequest(false);
        
        if (result.success) {
            setFriendRequestSent(true);
            setFriendshipStatus({ isFriend: false, requestPending: true, requestDirection: 'sent' });
        }
    };
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- isRealOpponent is kept for future use
    const isRealOpponent = opponentId && !opponentId.startsWith('ai_bot_');


    // Enhanced waiting screen with connection status
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
                    
                    {/* Enhanced connection status */}
                    <div className="mt-4 flex items-center justify-center gap-2">
                        {connectionStatus === 'connected' ? (
                            <><Wifi className="w-4 h-4 text-green-500" /><span className="text-green-500 text-sm">Connected</span></>
                        ) : connectionStatus === 'reconnecting' ? (
                            <><Loader2 className="w-4 h-4 text-yellow-500 animate-spin" /><span className="text-yellow-500 text-sm">Reconnecting...</span></>
                        ) : (
                            <><WifiOff className="w-4 h-4 text-red-500" /><span className="text-red-500 text-sm">Disconnected</span></>
                        )}
                    </div>
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
                    
                    {/* Sync state indicator */}
                    {syncState.version > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                            Sync v{syncState.version} • {lagCompensation.enabled ? `${Math.round(lagCompensation.averageLatency)}ms` : 'No lag comp'}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Game over screen (enhanced with sync info)
    if (matchEnded) {
        // ... (same as original but with additional sync conflict info)
        const wonByForfeit = !!opponentForfeited;
        const yourScore = finalStats?.yourScore ?? you?.odScore ?? 0;
        const oppScore = finalStats?.opponentScore ?? opponent?.odScore ?? 0;
        const isWinner = wonByForfeit || yourScore > oppScore;
        const isTie = !wonByForfeit && yourScore === oppScore;

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full w-full flex flex-col"
            >
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="shrink-0"
                >
                    <AuthHeader />
                </motion.div>

                {/* Enhanced match result with sync info */}
                <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                    {/* Result display with enhanced info */}
                    <div className="text-center">
                        <h2 className="text-4xl font-black mb-4">
                            {wonByForfeit ? 'VICTORY!' : isTie ? 'DRAW!' : isWinner ? 'VICTORY!' : 'DEFEAT'}
                        </h2>
                        
                        {/* Enhanced match info */}
                        <div className="glass rounded-xl p-4 mb-4">
                            <div className="text-sm text-muted-foreground space-y-1">
                                <div>Match Integrity: <span className={`font-bold ${
                                    matchIntegrity === 'GREEN' ? 'text-green-400' :
                                    matchIntegrity === 'YELLOW' ? 'text-yellow-400' : 'text-red-400'
                                }`}>{matchIntegrity}</span></div>
                                <div>Sync Version: {syncState.version}</div>
                                {syncConflicts > 0 && (
                                    <div className="text-yellow-400">Sync Conflicts: {syncConflicts}</div>
                                )}
                                {lagCompensation.enabled && (
                                    <div>Avg Latency: {Math.round(lagCompensation.averageLatency)}ms</div>
                                )}
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-4 justify-center">
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
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    // Active game with enhanced connection indicators
    return (
        <div className="h-full w-full max-w-[1800px] mx-auto flex flex-col pt-8">
            {/* Enhanced connection alert */}
            <AnimatePresence>
                {showConnectionAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-2 backdrop-blur-sm"
                    >
                        <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
                            <AlertTriangle size={16} />
                            {connectionStatus === 'reconnecting' ? 
                                `Reconnecting... (Attempt ${reconnectAttempts})` : 
                                'Connection Quality Poor'
                            }
                            {lagCompensationActive && (
                                <span className="text-xs opacity-60">• Lag Compensation Active</span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Leave Warning Modal (same as original) */}
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

            {/* Enhanced scoreboard with connection quality */}
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

                    {/* Enhanced center timer with sync info */}
                    <div className="relative flex flex-col items-center justify-center -my-10 w-1/3">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-[40px] bg-primary/20" />
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
                        
                        {/* Sync indicator */}
                        {syncState.version > 0 && (
                            <div className="text-[8px] text-white/20 mt-2">
                                v{syncState.version}
                            </div>
                        )}
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

            {/* Main Battle Area (same as original but with connection awareness) */}
            <div className="grid grid-cols-2 gap-16 flex-1 w-full max-w-[1800px] mx-auto px-8 min-h-0">
                {/* Left Side: You */}
                <div className="flex flex-col gap-4">
                    <motion.div
                        animate={showResult === 'correct' ? { scale: [1, 1.02, 1] } : {}}
                        className={`flex-1 rounded-[3rem] bg-cyan-950/10 border-2 relative overflow-hidden transition-all duration-300 shadow-2xl min-h-[300px] ${
                            !connected ? 'opacity-50 border-red-500/50' :
                            showResult === 'correct' ? 'border-green-500 shadow-green-500/20' :
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
                                    <div className="flex items-center justify-center gap-3 text-5xl lg:text-7xl font-black text-white tracking-tighter drop-shadow-[0_0_30px_rgba(34,211,238,0.4)]">
                                        <span>{currentQuestion?.question ? currentQuestion.question.split(' ')[0] : '?'}</span>
                                        <span className="text-cyan-400">{currentQuestion?.question ? currentQuestion.question.split(' ')[1] : '+'}</span>
                                        <span>{currentQuestion?.question ? currentQuestion.question.split(' ')[2] : '?'}</span>
                                        <span className="text-white/40">=</span>
                                        {showResult === 'wrong' && lastCorrectAnswer !== null ? (
                                            <>
                                                <span className="text-red-400 line-through opacity-60">{answer}</span>
                                                <span className="text-green-400 ml-2">{lastCorrectAnswer}</span>
                                            </>
                                        ) : (
                                            <span className={answer ? 'text-cyan-400' : 'text-white/20 animate-pulse'}>
                                                {answer || '?'}
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Enhanced input with connection awareness */}
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value.replace(/[^0-9-]/g, ''))}
                            onKeyDown={handleKeyDown}
                            className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-transparent outline-none cursor-default"
                            disabled={matchEnded || !connected}
                        />

                        <div className="absolute bottom-12 w-full text-center">
                            <span className={`px-6 py-2 rounded-full border text-xs font-bold uppercase tracking-[0.2em] backdrop-blur-sm ${
                                !connected ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                            }`}>
                                {!connected ? 'Disconnected' : 'Solve Equation'}
                            </span>
                        </div>
                    </motion.div>

                    {/* Player Banner */}
                    <div className="flex justify-center w-full px-12">
                        <PlayerBanner
                            name={you?.odName || initialPlayers?.[currentUserId]?.name || userName}
                            level={you?.odLevel || initialPlayers?.[currentUserId]?.level || 1}
                            rank={you?.odRank || initialPlayers?.[currentUserId]?.rank || 'Bronze'}
                            division={you?.odDivision || initialPlayers?.[currentUserId]?.division || 'I'}
                            styleId={you?.odEquippedBanner || initialPlayers?.[currentUserId]?.banner || 'default'}
                            title={you?.odEquippedTitle || initialPlayers?.[currentUserId]?.title || 'FlashMath Competitor'}
                            className="w-full h-24 shadow-2xl shadow-cyan-900/20 border-cyan-500/30"
                        />
                    </div>
                </div>

                {/* Right Side: Opponent (same as original) */}
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

                    <div className="flex justify-center w-full px-12">
                        <PlayerBanner
                            name={opponent?.odName || (opponentId ? initialPlayers?.[opponentId]?.name : 'Opponent') || 'Opponent'}
                            level={opponent?.odLevel || (opponentId ? initialPlayers?.[opponentId]?.level : 0) || 0}
                            rank={opponent?.odRank || (opponentId ? initialPlayers?.[opponentId]?.rank : 'Bronze') || 'Bronze'}
                            division={opponent?.odDivision || (opponentId ? initialPlayers?.[opponentId]?.division : 'I') || 'I'}
                            styleId={opponent?.odEquippedBanner || (opponentId ? initialPlayers?.[opponentId]?.banner : 'default') || 'default'}
                            title={opponent?.odEquippedTitle || (opponentId ? initialPlayers?.[opponentId]?.title : 'Contender') || 'Contender'}
                            className="w-full h-24 shadow-2xl shadow-amber-900/20 border-amber-500/30"
                        />
                    </div>
                </div>
            </div>

            {/* Enhanced leave match button */}
            <button
                onClick={() => setShowLeaveWarning(true)}
                className="fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-red-400/60 hover:text-red-400 transition-all"
                title="Leave Match"
            >
                <LogOut size={18} />
            </button>

            {/* Enhanced connection quality indicator */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-full border border-white/10">
                    <div 
                        className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                            myConnectionState.state === 'GREEN' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' :
                            myConnectionState.state === 'YELLOW' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]' :
                            'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                        }`}
                    />
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                        myConnectionState.state === 'GREEN' ? 'text-emerald-400' :
                        myConnectionState.state === 'YELLOW' ? 'text-amber-400' :
                        'text-red-400'
                    }`}>
                        {myConnectionState.state === 'GREEN' ? 'RANKED' :
                         myConnectionState.state === 'YELLOW' ? 'UNSTABLE' : 'VOID'}
                    </span>
                    {myConnectionState.rtt > 0 && (
                        <span className="text-[10px] text-white/40 font-medium">
                            {myConnectionState.rtt}ms
                        </span>
                    )}
                    {lagCompensationActive && (
                        <span className="text-[8px] text-cyan-400/60 font-medium">
                            LAG COMP
                        </span>
                    )}
                </div>
            </div>

            {/* Sound Toggle */}
            <div className="fixed bottom-8 right-8 z-50">
                <SoundToggle />
            </div>
        </div>
    );
}