"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { generateProblem, getSymbol, Fact, Operation, THRESHOLDS, Performance } from "@/lib/math-engine";
import { Zap, Timer, Trophy, ArrowLeft, Lightbulb } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function PracticePage() {
    const [op, setOp] = useState<Operation>("add");
    const [problem, setProblem] = useState<Fact | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<Performance | null>(null);
    const [timeRemaining, setTimeRemaining] = useState(30);
    const [gameState, setGameState] = useState<"ready" | "playing" | "finished">("ready");

    const [problemStartTime, setProblemStartTime] = useState<number>(0);
    const [lastSpeed, setLastSpeed] = useState<number>(0);
    const [mastery, setMastery] = useState<Record<string, number>>({});

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (gameState === "playing") {
            nextProblem();
            const timer = setInterval(() => {
                setTimeRemaining((prev) => {
                    if (prev <= 1) {
                        setGameState("finished");
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState]);

    const nextProblem = () => {
        // Simple adaptive logic: try to pick a problem the user hasn't mastered yet
        // For now, we still use random generation but could filter in a real scenario
        const newProblem = generateProblem(op);
        setProblem(newProblem);
        setInputValue("");
        setFeedback(null);
        setProblemStartTime(Date.now());
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);

        if (problem && parseInt(val) === problem.answer) {
            const responseTime = Date.now() - problemStartTime;
            setLastSpeed(responseTime);

            let performance: Performance = 'correct';
            if (responseTime <= THRESHOLDS.FAST) {
                performance = 'fast';
                // Update session mastery
                setMastery(prev => ({
                    ...prev,
                    [problem.id]: (prev[problem.id] || 0) + 1
                }));
            } else if (responseTime > THRESHOLDS.MAX) {
                performance = 'slow';
            }

            setFeedback(performance);
            setScore((s) => s + 1);
            setTimeout(nextProblem, 400);
        }
    };


    const startGame = () => {
        setScore(0);
        setTimeRemaining(30);
        setGameState("playing");
    };


    return (
        <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />

            <Link href="/" className="absolute top-10 left-10 text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                <ArrowLeft size={20} />
                Exit Session
            </Link>

            <AnimatePresence mode="wait">
                {gameState === "ready" && (
                    <motion.div
                        key="ready"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="text-center"
                    >
                        <Zap className="w-16 h-16 text-primary mx-auto mb-6" />
                        <h1 className="text-4xl font-black mb-8 tracking-tighter">SPEED TRIAL</h1>

                        <div className="flex justify-center gap-4 mb-10">
                            {(['add', 'sub', 'mult', 'div'] as Operation[]).map((type) => (
                                <button
                                    key={type}
                                    onClick={() => setOp(type)}
                                    className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border transition-all",
                                        op === type ? "bg-primary text-primary-foreground border-primary" : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                                    )}
                                >
                                    {getSymbol(type)}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={startGame}
                            className="bg-primary text-primary-foreground px-10 py-4 rounded-2xl font-black text-xl shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:scale-105 transition-all"
                        >
                            INITIALIZE FLOW
                        </button>
                    </motion.div>
                )}

                {gameState === "playing" && problem && (
                    <motion.div
                        key="playing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full max-w-xl text-center"
                    >
                        {/* Stats Bar */}
                        <div className="flex items-center justify-between mb-12 glass px-6 py-3 rounded-2xl">
                            <div className="flex items-center gap-3">
                                <Timer className="text-primary" size={20} />
                                <span className="font-mono text-xl tabular-nums">{timeRemaining}s</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Trophy className="text-accent" size={20} />
                                <span className="font-mono text-xl tabular-nums">{score}</span>
                            </div>
                        </div>

                        <GlassCard className="py-20 flex flex-col items-center">
                            <div className="relative mb-12">
                                <div className="flex items-center gap-8 text-7xl md:text-9xl font-black tracking-tighter">
                                    <span>{problem.n1}</span>
                                    <span className="text-primary">{getSymbol(problem.op)}</span>
                                    <span>{problem.n2}</span>
                                    <span className="text-muted-foreground">=</span>
                                </div>

                                {/* Performance Feedback Overlay */}
                                <AnimatePresence>
                                    {feedback && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                                            animate={{ opacity: 1, y: -40, scale: 1 }}
                                            exit={{ opacity: 0 }}
                                            className={cn(
                                                "absolute -top-12 left-0 right-0 text-center font-black tracking-widest text-xl uppercase",
                                                feedback === 'fast' && "text-primary drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]",
                                                feedback === 'correct' && "text-green-400",
                                                feedback === 'slow' && "text-amber-400"
                                            )}
                                        >
                                            {feedback === 'fast' && "⚡ LIGHTNING FAST!"}
                                            {feedback === 'correct' && "✓ CORRECT"}
                                            {feedback === 'slow' && "🐢 GOT IT"}
                                            <div className="text-[10px] mt-1 opacity-50 font-mono">{(lastSpeed / 1000).toFixed(2)}s</div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <input
                                ref={inputRef}
                                autoFocus
                                type="number"
                                value={inputValue}
                                onChange={handleInput}
                                className={cn(
                                    "bg-white/5 border-2 rounded-3xl text-center text-7xl font-mono w-64 py-4 outline-none transition-all",
                                    feedback === 'fast' && "border-primary bg-primary/10 shadow-[0_0_20px_rgba(34,211,238,0.2)]",
                                    feedback === 'correct' && "border-green-500 bg-green-500/10",
                                    feedback === 'slow' && "border-amber-500 bg-amber-500/10",
                                    !feedback && "border-white/10 focus:border-primary/50"
                                )}
                            />

                        </GlassCard>
                    </motion.div>
                )}

                {gameState === "finished" && (
                    <motion.div
                        key="finished"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <Trophy className="w-20 h-20 text-accent mx-auto mb-6 drop-shadow-[0_0_20px_rgba(168,85,247,0.5)]" />
                        <h2 className="text-4xl font-black mb-2 tracking-tighter">SESSION COMPLETE</h2>
                        <p className="text-muted-foreground mb-8">You mastered {score} facts in this rotation.</p>

                        <GlassCard className="inline-block mb-10 px-12">
                            <div className="text-6xl font-black text-primary mb-2">{score}</div>
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CORRECT RECALLS</div>
                        </GlassCard>

                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={startGame}
                                className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold transition-all hover:scale-105"
                            >
                                RE-INITIALIZE
                            </button>
                            <Link href="/">
                                <button className="bg-white/5 border border-white/10 px-8 py-3 rounded-xl font-bold hover:bg-white/10 transition-all">
                                    TERMINATE
                                </button>
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
