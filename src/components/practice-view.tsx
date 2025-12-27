"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Zap,
    Trophy,
    RotateCcw,
    Clock,
    LayoutDashboard,
    Star,
    HelpCircle
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";

import { getNextProblems } from "@/lib/actions/game";
import { Operation } from "@/lib/math-engine";
import { MathProblem } from "@/lib/math-tiers";
import { PlacementTest } from "@/components/placement-test";
import { MasteryTest } from "@/components/mastery-test";
import { HelpModal } from "@/components/help-modal";
import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";
import { saveSession, updateMastery } from "@/lib/actions/game";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { soundEngine } from "@/lib/sound-engine";

interface PracticeViewProps {
    session?: any;
}

export function PracticeView({ session: initialSession }: PracticeViewProps) {
    const { data: clientSession, update } = useSession();
    // Use client session if available (for updates), otherwise server session
    const session = clientSession || initialSession;
    const searchParams = useSearchParams();
    const operation = (searchParams.get("op") || "Multiplication") as Operation;

    // Game State
    const [gameState, setGameState] = useState<"menu" | "playing" | "finished">("menu");
    // Placeholder problem to avoid null checks initially
    const [problem, setProblem] = useState<any>({ question: "2 x 2", answer: 4 });
    const [inputValue, setInputValue] = useState("");
    const [score, setScore] = useState(0);
    const [totalAttempts, setTotalAttempts] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [sessionXP, setSessionXP] = useState(0);

    // Feedback & Tracking
    const [feedback, setFeedback] = useState<string | null>(null);
    const [problemStartTime, setProblemStartTime] = useState(Date.now());
    const [lastSpeed, setLastSpeed] = useState<number | null>(null);

    // Session History
    const [sessionStats, setSessionStats] = useState<any[]>([]);
    const [attempts, setAttempts] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [isError, setIsError] = useState(false);
    const [selectedOp, setSelectedOp] = useState<Operation>(operation);
    const [isSaving, setIsSaving] = useState(false);

    // Tiered System State
    const [problemQueue, setProblemQueue] = useState<MathProblem[]>([]);
    const [showPlacementTest, setShowPlacementTest] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [currentExplanation, setCurrentExplanation] = useState("");
    const [pausedTime, setPausedTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [isLoadingProblems, setIsLoadingProblems] = useState(false);
    const [currentTier, setCurrentTier] = useState(1);
    const [showMasteryTest, setShowMasteryTest] = useState(false);
    const [opAccuracy, setOpAccuracy] = useState(0);

    // Fetch problems helper
    const fetchMoreProblems = async (op: string) => {
        setIsLoadingProblems(true);
        const res = await getNextProblems(op);
        if (res.problems) {
            setProblemQueue(prev => [...prev, ...res.problems]);
            if (res.currentTier) setCurrentTier(res.currentTier);
        }
        setIsLoadingProblems(false);
    };

    // Sync selected op with URL param on mount
    useEffect(() => {
        if (operation) setSelectedOp(operation);
    }, [operation]);

    // Fetch current tier and accuracy when operation changes
    useEffect(() => {
        const fetchTierAndAccuracy = async () => {
            const res = await getNextProblems(selectedOp, 1);
            if (res.currentTier) setCurrentTier(res.currentTier);

            // Get progression for this operation from dashboard stats
            const { getDashboardStats } = await import("@/lib/actions/user");
            const stats = await getDashboardStats();
            if (stats?.masteryMap) {
                const opData = stats.masteryMap.find((m: any) => m.title.toLowerCase() === selectedOp.toLowerCase());
                if (opData) setOpAccuracy(opData.progress);
                else setOpAccuracy(0);
            }
        };
        if (session?.user) fetchTierAndAccuracy();
    }, [selectedOp, session]);

    // Start the game
    const startGame = async () => {
        // Reset state
        setScore(0);
        setTotalAttempts(0);
        setSessionStats([]);
        setSessionXP(0);
        setTimeLeft(60);
        setInputValue("");
        setAttempts(0);
        setStreak(0);
        setMaxStreak(0);
        setIsError(false);
        setProblemQueue([]);

        // Load problems for selectedOp
        const res = await getNextProblems(selectedOp);
        if (res.problems) {
            setProblemQueue(res.problems);
            setProblem(res.problems[0]);
            if (res.currentTier) setCurrentTier(res.currentTier);
            setGameState("playing");
            setProblemStartTime(Date.now());
        }
    };


    // End the game
    const endGame = useCallback(async () => {
        // Guard against double execution
        if (isSaving || gameState === "finished") return;
        setIsSaving(true);

        // Set to finished IMMEDIATELY before any async operations
        setGameState("finished");

        // Finalize stats
        const finalStats = [...sessionStats];
        const finalScore = score;
        const finalXP = sessionXP;

        // If logged in, save to DB
        if (session?.user) {
            try {
                const avgSpeed = finalStats.length > 0
                    ? finalStats.reduce((acc, s) => acc + s.responseTime, 0) / finalStats.length
                    : 0;

                const result = await saveSession({
                    operation: selectedOp,
                    correctCount: finalScore,
                    totalCount: totalAttempts,
                    avgSpeed: avgSpeed / 1000,
                    xpGained: finalXP,
                    maxStreak: maxStreak
                });

                await updateMastery(finalStats.map(s => ({
                    fact: s.fact,
                    operation: selectedOp,
                    responseTime: s.responseTime,
                    masteryDelta: s.performance === 'fast' ? 1 : (s.performance === 'normal' ? 0.2 : -0.5)
                })));

                // Refresh session to show new XP/Level in header - do this in background
                update().catch(console.error);
            } catch (err) {
                console.error("[PRACTICE] Error in endGame saving pipeline:", err);
            }
        }

        setIsSaving(false);
        soundEngine.playComplete();
    }, [session, score, totalAttempts, sessionStats, selectedOp, sessionXP, isSaving, gameState]);

    // Timer logic - use setInterval for reliable timing independent of state changes
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const endGameRef = useRef(endGame);
    endGameRef.current = endGame;

    useEffect(() => {
        if (gameState === "playing" && !isPaused) {
            // Clear any existing timer
            if (timerRef.current) clearInterval(timerRef.current);

            // Start interval timer
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current!);
                        timerRef.current = null;
                        // Use ref to avoid dependency issues
                        setTimeout(() => endGameRef.current(), 0);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            // Clear timer when not playing or paused
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [gameState, isPaused]);

    // Handle Input
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (isError) return;

        setInputValue(value);

        const intVal = parseInt(value);
        const answerStr = problem.answer.toString();

        // Correct answer
        if (!isNaN(intVal) && Math.abs(intVal - problem.answer) < 0.01) {
            const responseTime = Date.now() - problemStartTime;
            let perfType = "normal";
            let xp = 2;
            if (responseTime < 2000) { perfType = "fast"; xp = 4; }
            else if (responseTime > 10000) { perfType = "slow"; xp = 1; }

            const perf = { label: perfType === "fast" ? "FAST" : "", type: perfType, xp };

            setLastSpeed(responseTime);
            setFeedback(perf.label);
            setScore(prev => prev + 1);
            setTotalAttempts(prev => prev + 1);
            setSessionXP(prev => prev + perf.xp);

            setSessionStats(prev => [...prev, {
                fact: problem.question || `${problem.num1}${selectedOp === 'Multiplication' ? 'x' : selectedOp === 'Addition' ? '+' : selectedOp === 'Subtraction' ? '-' : '÷'}${problem.num2}`,
                responseTime,
                performance: perf.type,
                xp: perf.xp
            }]);

            setStreak(prev => {
                const newStreak = prev + 1;
                setMaxStreak(currentMax => Math.max(currentMax, newStreak));
                return newStreak;
            });
            soundEngine.playCorrect(streak + 1);

            setTimeout(() => {
                // Next problem from queue
                const nextQueue = [...problemQueue];
                nextQueue.shift();
                if (nextQueue.length < 5) fetchMoreProblems(selectedOp);

                if (nextQueue.length > 0) {
                    setProblemQueue(nextQueue);
                    setProblem(nextQueue[0]);
                }

                setInputValue("");
                setProblemStartTime(Date.now());
                setFeedback(null);
                setAttempts(0);
                setIsError(false);
            }, 200);
            return;
        }

        // Detect incorrect answer
        if (value.length >= answerStr.length && intVal !== problem.answer) {
            setIsError(true);
            setAttempts(prev => prev + 1);
            setTotalAttempts(prev => prev + 1);
            setStreak(0);
            // Small XP penalty for incorrect answers
            setSessionXP(prev => Math.max(0, prev - 2));
            soundEngine.playIncorrect();
        }
    };

    // Spacebar to skip logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" && isError) {
                e.preventDefault();
                handleHelpNext();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isError, problemQueue, selectedOp]);


    const getSymbol = () => {
        switch (selectedOp) {
            case 'Addition': return '+';
            case 'Subtraction': return '-';
            case 'Division': return '÷';
            default: return '×';
        }
    };

    const handleHelpNext = () => {
        setShowHelpModal(false);
        setIsPaused(false);
        setInputValue("");
        setIsError(false);
        setFeedback(null);
        setAttempts(0);

        // Move to next problem
        const nextQueue = [...problemQueue];
        nextQueue.shift();
        if (nextQueue.length < 5) fetchMoreProblems(selectedOp);

        if (nextQueue.length > 0) {
            setProblemQueue(nextQueue);
            setProblem(nextQueue[0]);
            setProblemStartTime(Date.now());
        }
    };

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col items-center relative overflow-hidden">
            {showPlacementTest && (
                <PlacementTest onComplete={() => {
                    setShowPlacementTest(false);
                }} />
            )}

            {showMasteryTest && (
                <MasteryTest
                    operation={selectedOp}
                    currentTier={currentTier}
                    onComplete={(passed, newTier) => {
                        setShowMasteryTest(false);
                        if (passed) {
                            setCurrentTier(newTier);
                            setOpAccuracy(0); // Reset progress for new tier
                        }
                    }}
                    onCancel={() => setShowMasteryTest(false)}
                />
            )}

            {showHelpModal && (
                <HelpModal
                    explanation={currentExplanation}
                    onNext={handleHelpNext}
                />
            )}
            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader session={session} />
            </div>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-4xl relative z-10">
                <AnimatePresence mode="wait">
                    {gameState === "menu" && (
                        <motion.div
                            key="menu"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="text-center space-y-8"
                        >
                            <div className="space-y-4">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                                    <Zap size={12} />
                                    Active Simulation
                                </div>
                                <h1 className="text-[length:var(--hero-size-mobile)] md:text-[length:var(--hero-size-desktop)] font-black tracking-tighter uppercase leading-[0.85] flex flex-col items-center">
                                    <span>{selectedOp}</span>
                                    <span className="text-primary truncate">SPEED TRIAL</span>
                                </h1>
                                <p className="text-muted-foreground max-w-md mx-auto font-medium">
                                    Test your neural response time. 60 seconds to solve as many {selectedOp.toLowerCase()} facts as possible.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                                <NeonButton onClick={startGame} className="px-8 py-4 text-lg w-full sm:w-auto">
                                    START SIMULATION
                                </NeonButton>
                                {currentTier < 4 && opAccuracy >= 90 && (
                                    <button
                                        onClick={() => setShowMasteryTest(true)}
                                        className="px-8 py-4 text-lg rounded-xl bg-accent/20 border border-accent/30 text-accent font-bold uppercase hover:bg-accent/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trophy size={20} />
                                        MASTERY TEST
                                    </button>
                                )}
                            </div>
                            {currentTier < 4 && (
                                <p className="text-center text-muted-foreground text-xs mt-2">
                                    Tier {currentTier} • {opAccuracy >= 90
                                        ? 'Mastery test available!'
                                        : `${opAccuracy.toFixed(0)}% progress → 90% to unlock mastery test`}
                                </p>
                            )}

                            <div className="pt-12 w-full max-w-2xl mx-auto">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { name: "Addition", symbol: "+" },
                                        { name: "Subtraction", symbol: "-" },
                                        { name: "Multiplication", symbol: "×" },
                                        { name: "Division", symbol: "÷" }
                                    ].map((op) => (
                                        <button
                                            key={op.name}
                                            onClick={() => setSelectedOp(op.name as Operation)}
                                            className={cn(
                                                "p-3 rounded-xl border transition-all flex flex-col items-center gap-1",
                                                selectedOp === op.name
                                                    ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                                                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-white"
                                            )}
                                        >
                                            <span className="text-xl font-black">{op.symbol}</span>
                                            <span className="text-[8px] uppercase font-bold tracking-widest">{op.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {gameState === "playing" && (
                        <motion.div
                            key="playing"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full"
                        >
                            <div className="flex justify-between items-center mb-12">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/20 rounded-xl border border-primary/20">
                                        <Clock className="text-primary w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Time Remaining</div>
                                        <div className="text-2xl font-mono font-bold text-primary">{timeLeft}s</div>
                                    </div>
                                    <div className="ml-8">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Accuracy</div>
                                        <div className="text-2xl font-mono font-bold text-white">{score}/{totalAttempts}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-right">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Streak</div>
                                        <div className={cn("text-2xl font-mono font-bold transition-all", streak > 5 ? "text-accent" : "text-white/40")}>
                                            {streak}
                                        </div>
                                    </div>
                                    <div className="ml-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Exp Gained</div>
                                        <div className="text-2xl font-mono font-bold text-accent">+{sessionXP}</div>
                                    </div>
                                    <div className="p-3 bg-accent/20 rounded-xl border border-accent/20">
                                        <Star className="text-accent w-6 h-6" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center py-12">
                                <motion.div
                                    key={problem.num1 + "" + problem.num2}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-8 mb-12"
                                >
                                    <div className="text-7xl md:text-9xl font-black tracking-tighter tabular-nums text-center">
                                        {problem.question ? (
                                            problem.question
                                                .replace('*', '×')
                                                .replace('/', '÷')
                                        ) : (
                                            <>
                                                {problem.num1} <span className="text-primary">{getSymbol()}</span> {problem.num2}
                                            </>
                                        )}
                                    </div>
                                    <div className="text-7xl md:text-9xl font-thin text-muted-foreground">=</div>
                                </motion.div>

                                <div className="relative w-full max-w-sm">
                                    <input
                                        autoFocus
                                        type="number"
                                        value={inputValue}
                                        onChange={handleInput}
                                        className={cn(
                                            "w-full border-2 rounded-3xl py-8 text-center text-6xl font-black outline-none transition-all shadow-lg",
                                            isError
                                                ? "bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-shake"
                                                : "bg-white/5 border-primary/30 text-foreground focus:border-primary shadow-[0_0_30px_rgba(34,211,238,0.1)]"
                                        )}
                                        placeholder="?"
                                    />

                                    {isError && (
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            onClick={() => {
                                                setIsPaused(true);
                                                setCurrentExplanation(problem.explanation || "No explanation available.");
                                                setShowHelpModal(true);
                                            }}
                                            className="absolute top-1/2 -right-20 -translate-y-1/2 p-4 bg-white/5 border border-white/10 rounded-full text-muted-foreground hover:text-white hover:bg-white/10 transition-all"
                                        >
                                            <HelpCircle size={24} />
                                            <span className="sr-only">Help</span>
                                        </motion.button>
                                    )}

                                    <AnimatePresence>
                                        {feedback && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute -top-12 left-0 right-0 text-center flex flex-col items-center"
                                            >
                                                <div className={cn(
                                                    "text-sm font-black uppercase tracking-widest mb-1",
                                                    feedback.includes("LIGHTNING") ? "text-accent" : "text-primary"
                                                )}>
                                                    {feedback}
                                                </div>
                                                <div className="text-[10px] font-mono font-bold text-muted-foreground">
                                                    {(lastSpeed! / 1000).toFixed(2)}s
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {gameState === "finished" && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="w-full max-w-2xl"
                        >
                            <GlassCard className="text-center p-12 overflow-hidden relative">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary/10 rounded-full blur-[80px] -mt-24 pointer-events-none" />

                                <h2 className="text-4xl font-black tracking-tight mb-8">SESSION COMPLETE</h2>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Accuracy</div>
                                        <div className="text-4xl font-black text-primary">{score}/{totalAttempts}</div>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Speed</div>
                                        <div className="text-3xl font-black text-accent">
                                            {(sessionStats.length > 0 ? sessionStats.reduce((acc, s) => acc + s.responseTime, 0) / sessionStats.length / 1000 : 0).toFixed(2)}s
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-primary/20 border border-primary/20">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">XP Gained</div>
                                        <div className="text-4xl font-black text-primary">+{sessionXP}</div>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-yellow-400/20 border border-yellow-400/20">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-500 mb-1">Flux Earned</div>
                                        <div className="text-4xl font-black text-yellow-400 whitespace-nowrap">§ {Math.floor(sessionXP * 0.5)}</div>
                                    </div>
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 col-span-2 md:col-span-4">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Best Streak</div>
                                        <div className="text-4xl font-black text-white">{maxStreak} 🔥</div>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                    <NeonButton onClick={startGame} className="w-full sm:w-auto flex items-center gap-2">
                                        <RotateCcw size={18} />
                                        RETRY TRIAL
                                    </NeonButton>
                                    <Link href="/dashboard" className="w-full sm:w-auto">
                                        <button className="w-full px-8 py-4 rounded-xl font-bold border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-2">
                                            <LayoutDashboard size={18} />
                                            GO TO DASHBOARD
                                        </button>
                                    </Link>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}
