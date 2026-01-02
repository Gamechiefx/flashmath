'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { soundEngine } from '@/lib/sound-engine';
import { PlayerBanner } from './player-banner';

interface MatchmakingQueueProps {
    userId: string;
    userName: string;
    level: number;
    practiceTier: number; // Practice tier (1-100) for matchmaking
    rank: string; // Competitive rank (Bronze, Silver, etc.) for display
    division: string; // Rank division (I, II, III) for display
    elo: number;
    operation?: string;
    equippedBanner?: string;
    equippedTitle?: string;
}

const OPERATION_LABELS: Record<string, { symbol: string; name: string }> = {
    addition: { symbol: '+', name: 'Addition' },
    subtraction: { symbol: '−', name: 'Subtraction' },
    multiplication: { symbol: '×', name: 'Multiplication' },
    division: { symbol: '÷', name: 'Division' },
    mixed: { symbol: '?', name: 'Mixed' },
};

interface PracticeProblem {
    question: string;
    answer: number;
}

function RankBadge({ rank, division }: { rank: string; division: string }) {
    const rankColors: Record<string, { bg: string; border: string; glow: string }> = {
        Bronze: { bg: 'from-amber-700 to-amber-900', border: 'border-amber-500/50', glow: 'shadow-amber-500/20' },
        Silver: { bg: 'from-slate-400 to-slate-600', border: 'border-slate-300/50', glow: 'shadow-slate-300/20' },
        Gold: { bg: 'from-yellow-400 to-yellow-600', border: 'border-yellow-300/50', glow: 'shadow-yellow-300/20' },
    };
    const colors = rankColors[rank] || rankColors.Silver;

    return (
        <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className={cn(
                "relative w-14 h-14 rounded-lg bg-gradient-to-br shadow-2xl flex items-center justify-center border-2 will-change-transform",
                colors.bg,
                colors.border,
                colors.glow
            )}
        >
            <div className="absolute inset-0 rounded-lg bg-white/10 blur-md animate-pulse" />
            <span className="text-2xl font-black text-white drop-shadow-md z-10">{rank.charAt(0)}</span>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded bg-background border border-white/20 text-[10px] font-black flex items-center justify-center text-white z-20 shadow-lg">
                {division}
            </div>
        </motion.div>
    );
}

export function MatchmakingQueue({ userId, userName, level, practiceTier, rank, division, elo, operation = 'mixed', equippedBanner = 'default', equippedTitle = 'Challenger' }: MatchmakingQueueProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const mode = searchParams.get('mode') || '1v1';
    const opLabel = OPERATION_LABELS[operation] || OPERATION_LABELS.mixed;

    const [queueTime, setQueueTime] = useState(0);
    const [isSearching, setIsSearching] = useState(true);
    const [matchFound, setMatchFound] = useState(false);
    const [opponent, setOpponent] = useState<{ name: string; tier: string; elo: number; banner: string; title: string; level: number } | null>(null);

    // Quick Practice State
    const [problem, setProblem] = useState<PracticeProblem>({ question: '', answer: 0 });
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const generateProblem = useCallback(() => {
        let a: number, b: number, question: string, answer: number;

        switch (operation) {
            case 'addition':
                a = Math.floor(Math.random() * 20) + 1;
                b = Math.floor(Math.random() * 20) + 1;
                question = `${a} + ${b}`;
                answer = a + b;
                break;
            case 'subtraction':
                a = Math.floor(Math.random() * 20) + 10;
                b = Math.floor(Math.random() * Math.min(a, 15)) + 1;
                question = `${a} − ${b}`;
                answer = a - b;
                break;
            case 'multiplication':
                a = Math.floor(Math.random() * 12) + 1;
                b = Math.floor(Math.random() * 12) + 1;
                question = `${a} × ${b}`;
                answer = a * b;
                break;
            case 'division':
                b = Math.floor(Math.random() * 10) + 2;
                const quotient = Math.floor(Math.random() * 10) + 1;
                a = b * quotient;
                question = `${a} ÷ ${b}`;
                answer = quotient;
                break;
            case 'mixed':
            default:
                const ops = ['addition', 'subtraction', 'multiplication', 'division'];
                const randomOp = ops[Math.floor(Math.random() * ops.length)];
                if (randomOp === 'addition') {
                    a = Math.floor(Math.random() * 20) + 1;
                    b = Math.floor(Math.random() * 20) + 1;
                    question = `${a} + ${b}`;
                    answer = a + b;
                } else if (randomOp === 'subtraction') {
                    a = Math.floor(Math.random() * 20) + 10;
                    b = Math.floor(Math.random() * Math.min(a, 15)) + 1;
                    question = `${a} − ${b}`;
                    answer = a - b;
                } else if (randomOp === 'multiplication') {
                    a = Math.floor(Math.random() * 12) + 1;
                    b = Math.floor(Math.random() * 12) + 1;
                    question = `${a} × ${b}`;
                    answer = a * b;
                } else {
                    b = Math.floor(Math.random() * 10) + 2;
                    const q = Math.floor(Math.random() * 10) + 1;
                    a = b * q;
                    question = `${a} ÷ ${b}`;
                    answer = q;
                }
        }

        setProblem({ question, answer });
        setInput('');
    }, [operation]);

    // Initial problem
    useEffect(() => {
        generateProblem();
    }, [generateProblem]);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // Only allow numeric input
        if (val !== '' && !/^\d*$/.test(val)) return;

        setInput(val);

        if (val !== '' && parseInt(val) === problem.answer) {
            // Success animation effect could go here
            setTimeout(() => {
                generateProblem();
            }, 100);
        }
    };

    // Queue timer
    useEffect(() => {
        if (!isSearching) return;

        const interval = setInterval(() => {
            setQueueTime(t => t + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [isSearching]);

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Use ref for queueTime to avoid re-running effect
    const queueTimeRef = useRef(queueTime);
    useEffect(() => {
        queueTimeRef.current = queueTime;
    }, [queueTime]);

    // Real matchmaking - join queue ONCE and poll for matches
    useEffect(() => {
        let isMounted = true;
        let pollInterval: NodeJS.Timeout | null = null;
        let hasJoined = false;

        async function startMatchmaking() {
            // Import matchmaking functions
            const { joinQueue, checkForMatch } = await import('@/lib/actions/matchmaking');

            // Join the queue only once
            if (!hasJoined) {
                hasJoined = true;
                const joinResult = await joinQueue({
                    mode,
                    operation,
                    elo,
                    tier: practiceTier.toString(),
                    equippedBanner,
                    equippedTitle,
                    level,
                });

                if (!joinResult.success) {
                    console.error('[Queue] Failed to join:', joinResult.error);
                } else {
                    console.log('[Queue] Joined successfully');
                }
            }

            // Poll for matches every 2 seconds
            pollInterval = setInterval(async () => {
                if (!isMounted || matchFound) return;

                const result = await checkForMatch({
                    mode,
                    operation,
                    elo,
                    tier: practiceTier,
                    queueTime: queueTimeRef.current,
                });

                if (result.matched && result.matchId) {
                    setMatchFound(true);
                    soundEngine.playMatchFound();
                    setIsSearching(false);

                    if (result.opponent) {
                        setOpponent({
                            name: result.opponent.name,
                            tier: result.opponent.tier,
                            elo: result.opponent.elo,
                            banner: result.opponent.banner || 'default',
                            title: result.opponent.title || 'Competitor',
                            level: result.opponent.level || 1,
                        });
                    }

                    // Navigate to lobby after short delay
                    setTimeout(() => {
                        router.push(`/arena/lobby/${result.matchId}?operation=${operation}`);
                    }, 2000);

                    if (pollInterval) clearInterval(pollInterval);
                }
            }, 2000);
        }

        startMatchmaking();

        return () => {
            isMounted = false;
            if (pollInterval) clearInterval(pollInterval);
            // Leave queue on unmount
            import('@/lib/actions/matchmaking').then(({ leaveQueue }) => {
                leaveQueue({ mode, operation });
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, operation, practiceTier, elo, level, equippedBanner, equippedTitle, matchFound, router]);

    const handleCancel = useCallback(() => {
        setIsSearching(false);
        router.push('/arena/modes');
    }, [router]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isSearching) {
                handleCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearching, handleCancel]);

    return (
        <div className="flex flex-col w-full max-w-7xl mx-auto items-center justify-center p-6 gap-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-2"
            >
                <h1 className="text-5xl font-black text-white tracking-tight italic drop-shadow-2xl">
                    {matchFound ? 'Match Found!' : 'Finding Opponent'}
                </h1>
                <p className="text-xl font-black text-white/40 uppercase tracking-[0.4em] flex items-center justify-center gap-3">
                    <span>{mode === '1v1' ? '1v1 Duel' : mode}</span>
                    <span className="text-primary">{opLabel.symbol}</span>
                    <span className="text-white/60">{opLabel.name}</span>
                </p>
            </motion.div>

            {/* Main Content: Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
                {/* Left: Quick Practice Area */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col items-center justify-center space-y-8"
                >
                    <div className="text-center space-y-12">
                        <div className="space-y-4">
                            <p className="text-white/20 font-black uppercase tracking-widest text-sm">Quick Practice</p>
                            <div className="text-[120px] font-black text-white leading-none tracking-tighter italic drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                {problem.question} = <span className="text-primary">?</span>
                            </div>
                        </div>

                        <div className="relative group">
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="numeric"
                                value={input}
                                onChange={handleInputChange}
                                className="w-48 h-24 bg-white/5 border-4 border-white/10 rounded-[2rem] text-center text-5xl font-black text-white focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all placeholder:text-white/10 relative z-10"
                                placeholder="..."
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Right: Matchmaking Status */}
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col items-center justify-center"
                >
                    <div className="w-full max-w-[400px] rounded-[2rem] bg-card/40 border-2 border-primary/10 p-8 flex flex-col items-center justify-center space-y-6 relative group shadow-2xl">
                        {/* Background Pulsing Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-30 animate-pulse" />

                        <AnimatePresence mode="wait">
                            {!matchFound ? (
                                <motion.div
                                    key="search"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 1.2, opacity: 0 }}
                                    className="relative flex flex-col items-center space-y-8 z-10 mt-4"
                                >
                                    {/* Icon Container */}
                                    <div className="relative w-40 h-40">
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                            className="absolute inset-0 border-4 border-dashed border-primary/20 rounded-full"
                                        />
                                        <motion.div
                                            animate={{ rotate: -360 }}
                                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                            className="absolute inset-[-10px] border-2 border-primary/10 rounded-full scale-110"
                                        />
                                        <div className="absolute inset-2 bg-gradient-to-br from-white/5 to-transparent rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md border border-white/10">
                                            <motion.span
                                                animate={{
                                                    scale: [1, 1.1, 1],
                                                    rotate: [0, 5, -5, 0]
                                                }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="text-7xl drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                            >
                                                ⚔️
                                            </motion.span>
                                        </div>
                                    </div>

                                    {/* Time and Stats */}
                                    <div className="text-center space-y-2">
                                        <p className="text-4xl font-black text-white italic tracking-tighter drop-shadow-md">
                                            {formatTime(queueTime)}
                                        </p>
                                        <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">Searching for Match...</p>
                                    </div>

                                    <div className="flex flex-col items-center gap-4 w-full">
                                        <PlayerBanner
                                            name={userName}
                                            level={level}
                                            rank={rank}
                                            division={division}
                                            styleId={equippedBanner}
                                            title={equippedTitle}
                                            className="scale-90 opacity-90 shadow-2xl"
                                        />
                                        <div className="px-5 py-2 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-widest">
                                            {elo} ELO
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="found"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center space-y-6 z-10"
                                >
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1] }}
                                        className="text-8xl drop-shadow-[0_0_50px_var(--accent-glow)]"
                                    >
                                        ⚔️
                                    </motion.div>
                                    <div className="flex flex-col items-center space-y-4 w-full">
                                        <div className="flex flex-col items-center w-full gap-2">
                                            <PlayerBanner
                                                name={userName}
                                                level={level}
                                                rank={rank}
                                                division={division}
                                                styleId={equippedBanner}
                                                title={equippedTitle}
                                                className="scale-75 opacity-60 grayscale-[0.5]"
                                            />

                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ delay: 0.3, type: 'spring' }}
                                                className="text-2xl font-black italic text-primary/50 -my-2 z-10"
                                            >
                                                VS
                                            </motion.div>

                                            <PlayerBanner
                                                name={opponent?.name || 'Player'}
                                                level={opponent?.level || 1}
                                                rank={opponent?.tier || rank}
                                                division="I"
                                                styleId={opponent?.banner || 'default'}
                                                title={opponent?.title || 'Competitor'}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-white/30 font-bold uppercase tracking-widest text-[10px] animate-pulse">Joining match in 2s...</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>

            {/* Cancel Button */}
            {isSearching && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center"
                >
                    <button
                        onClick={() => {
                            soundEngine.playClick();
                            handleCancel();
                        }}
                        onMouseEnter={() => soundEngine.playHover()}
                        className="px-12 py-4 bg-red-500/20 hover:bg-red-500/30 border-2 border-red-500 rounded-xl text-red-400 hover:text-red-300 font-black uppercase tracking-[0.2em] text-sm transition-all hover:scale-105 shadow-lg shadow-red-500/20"
                    >
                        Stop Matchmaking
                    </button>
                </motion.div>
            )}
        </div>
    );
}
