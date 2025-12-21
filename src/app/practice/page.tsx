"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Zap,
    Trophy,
    RotateCcw,
    Clock,
    LayoutDashboard,
    Star
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { generateProblem, getPerformance, Operation } from "@/lib/math-engine";
import Link from "next/link";
import { AuthHeader } from "@/components/auth-header";
import { saveSession, updateMastery } from "@/lib/actions/game";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { soundEngine } from "@/lib/sound-engine";

function PracticeContent() {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const operation = (searchParams.get("op") || "Multiplication") as Operation;

    // Game State
    const [gameState, setGameState] = useState<"menu" | "playing" | "finished">("menu");
    const [problem, setProblem] = useState(generateProblem(operation));
    const [inputValue, setInputValue] = useState("");
    const [score, setScore] = useState(0);
    const [totalAttempts, setTotalAttempts] = useState(0);
    const [timeLeft, setTimeLeft] = useState(30);
    const [sessionXP, setSessionXP] = useState(0);

    // Feedback & Tracking
    const [feedback, setFeedback] = useState<string | null>(null);
    const [problemStartTime, setProblemStartTime] = useState(Date.now());
    const [lastSpeed, setLastSpeed] = useState<number | null>(null);

    // Session History
    const [sessionStats, setSessionStats] = useState<any[]>([]);
    const [attempts, setAttempts] = useState(0);
    const [streak, setStreak] = useState(0);
    const [isError, setIsError] = useState(false);

    // Start the game
    const startGame = () => {
        setGameState("playing");
        setScore(0);
        setTotalAttempts(0);
        setSessionStats([]);
        setSessionXP(0);
        setTimeLeft(30);
        setProblem(generateProblem(operation));
        setProblemStartTime(Date.now());
        setInputValue("");
        setAttempts(0);
        setStreak(0);
        setIsError(false);
    };

    // End the game
    const endGame = useCallback(async () => {
        setGameState("finished");

        // If logged in, save to DB
        if (session?.user) {
            const stats = [...sessionStats];
            const correct = score;
            const total = totalAttempts;

            const avgSpeed = stats.length > 0
                ? stats.reduce((acc, s) => acc + s.responseTime, 0) / stats.length
                : 0;

            await saveSession({
                operation,
                correctCount: correct,
                totalCount: total,
                avgSpeed: avgSpeed / 1000,
                xpGained: sessionXP
            });

            await updateMastery(stats.map(s => ({
                fact: s.fact,
                operation,
                responseTime: s.responseTime,
                masteryDelta: s.performance === 'fast' ? 1 : (s.performance === 'correct' ? 0.2 : -0.5)
            })));
        }
        soundEngine.playComplete();
    }, [session, score, totalAttempts, sessionStats, operation, sessionXP]);

    // Timer logic
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (gameState === "playing" && timeLeft > 0) {
            timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (timeLeft === 0 && gameState === "playing") {
            endGame();
        }
        return () => clearTimeout(timer);
    }, [gameState, timeLeft, endGame]);

    // Handle Input
    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (isError) return;

        setInputValue(value);

        const intVal = parseInt(value);
        const answerStr = problem.answer.toString();

        // Correct answer
        if (!isNaN(intVal) && intVal === problem.answer) {
            const responseTime = Date.now() - problemStartTime;
            const perf = getPerformance(responseTime);

            setLastSpeed(responseTime);
            setFeedback(perf.label);
            setScore(prev => prev + 1);
            setTotalAttempts(prev => prev + 1);
            setSessionXP(prev => prev + perf.xp);

            setSessionStats(prev => [...prev, {
                fact: `${problem.num1}${operation === 'Multiplication' ? 'x' : operation === 'Addition' ? '+' : operation === 'Subtraction' ? '-' : '÷'}${problem.num2}`,
                responseTime,
                performance: perf.type,
                xp: perf.xp
            }]);

            setStreak(prev => prev + 1);
            soundEngine.playCorrect(streak + 1);

            setTimeout(() => {
                setProblem(generateProblem(operation));
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
            setStreak(0);
            soundEngine.playIncorrect();

            if (attempts + 1 >= 2) {
                setFeedback("SKIP");
                setTotalAttempts(prev => prev + 1);

                setTimeout(() => {
                    setProblem(generateProblem(operation));
                    setInputValue("");
                    setProblemStartTime(Date.now());
                    setFeedback(null);
                    setAttempts(0);
                    setIsError(false);
                }, 600);
            } else {
                setTimeout(() => {
                    setInputValue("");
                    setIsError(false);
                }, 400);
            }
        }
    };

    const getSymbol = () => {
        switch (operation) {
            case 'Addition': return '+';
            case 'Subtraction': return '-';
            case 'Division': return '÷';
            default: return '×';
        }
    };

    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col items-center relative overflow-hidden">
            <div className="w-full max-w-7xl mx-auto">
                <AuthHeader />
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
                                <h1 className="text-6xl font-black tracking-tighter uppercase">{operation} TRIAL</h1>
                                <p className="text-muted-foreground max-w-md mx-auto">
                                    Test your neural response time. 30 seconds to solve as many {operation.toLowerCase()} facts as possible.
                                </p>
                            </div>
                            <NeonButton onClick={startGame} className="px-12 py-6 text-xl">
                                START SIMULATION
                            </NeonButton>
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
                                </div>

                                <div className="flex items-center gap-4 text-right">
                                    <div>
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
                                    <div className="text-7xl md:text-9xl font-black tracking-tighter tabular-nums">
                                        {problem.num1} <span className="text-primary">{getSymbol()}</span> {problem.num2}
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
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Correct</div>
                                        <div className="text-4xl font-black text-primary">{score}</div>
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
                                        <div className="text-4xl font-black text-yellow-400">§ {Math.floor(sessionXP * 0.5)}</div>
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

export default function PracticePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary animate-pulse">LOADING SIMULATION...</div>}>
            <PracticeContent />
        </Suspense>
    );
}
