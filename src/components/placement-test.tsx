
"use client";

import { useState, useEffect } from "react";
import { generatePlacementTest, MathProblem } from "@/lib/math-tiers";
import { updateTiers } from "@/lib/actions/game";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";

interface PlacementTestProps {
    onComplete: () => void;
}

export function PlacementTest({ onComplete }: PlacementTestProps) {
    const [testData, setTestData] = useState<Record<string, MathProblem[]>>({});
    const [currentOpIndex, setCurrentOpIndex] = useState(0);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, boolean[]>>({}); // op -> list of correct/incorrect
    const [isLoaded, setIsLoaded] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [completedOps, setCompletedOps] = useState<string[]>([]);
    const [timer, setTimer] = useState(0);
    const [startTime, setStartTime] = useState(Date.now());
    const [durations, setDurations] = useState<Record<string, number[]>>({}); // op -> list of durations in ms

    // Timer effect
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(prev => prev + 0.1);
        }, 100);
        return () => clearInterval(interval);
    }, []);

    // Reset timer on new question
    useEffect(() => {
        setStartTime(Date.now());
        setTimer(0);
    }, [currentQuestionIndex, currentOpIndex]);


    // Order: Addition -> Subtraction -> Multiplication -> Division
    const ops = ['addition', 'subtraction', 'multiplication', 'division'];
    const currentOp = ops[currentOpIndex];

    useEffect(() => {
        const data = generatePlacementTest();
        setTestData(data);
        setIsLoaded(true);
    }, []);

    const handleAnswer = () => {
        if (!inputValue) return;

        const problems = testData[currentOp];
        const currentProblem = problems[currentQuestionIndex];
        const isCorrect = Math.abs(parseFloat(inputValue) - currentProblem.answer) < 0.01;

        setAnswers(prev => {
            const opAnswers = prev[currentOp] || [];
            return {
                ...prev,
                [currentOp]: [...opAnswers, isCorrect]
            };
        });

        setInputValue("");

        if (currentQuestionIndex < problems.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            // Op Complete
            setCompletedOps(prev => [...prev, currentOp]);
            if (currentOpIndex < ops.length - 1) {
                setCurrentOpIndex(prev => prev + 1);
                setCurrentQuestionIndex(0);
            } else {
                finishTest();
            }
        }
    };

    const finishTest = async () => {
        // Calculate Tiers
        // Logic: 
        // 5 Questions: Tier I, Tier I, Tier II, Tier III, Tier IV
        // (This was my generated order: 1, 1, 2, 3, 4)
        // If they miss Tier 1 -> Tier 1
        // If they get Tier 1s but miss Tier 2 -> Tier 1
        // If they get Tier 2 but miss 3 -> Tier 2
        // ...

        setIsSubmitting(true);
        const newTiers: Record<string, number> = {};

        ops.forEach(op => {
            // Re-calculate based on answers in state, NOT current render cycle if using setState in same func
            // We need to look at 'answers' state which might not be updated yet for final question?
            // React batching... so we should construct the final 'answers' locally too if needed.
            // Actually 'answers' is updated in previous render or checks?
            // Ah, handleAnswer calls finishTest immediately after updating state? No. 
            // setState is async. 
            // Better to pass the final answer set to finish.
        });

        // Wait for state to settle? No, better to calculate accumulated results.
        // Let's rely on a helper that gets passed the final result.
    };

    // Re-impl handleAnswer to call finish with data
    const submitAnswer = () => {
        if (!inputValue) return;
        const problems = testData[currentOp];
        const currentProblem = problems[currentQuestionIndex];
        const duration = Date.now() - startTime;
        const isCorrect = Math.abs(parseFloat(inputValue) - currentProblem.answer) < 0.01;

        // Trust current state + new one
        const newOpAnswers = [...(answers[currentOp] || []), isCorrect];
        const updatedAnswers = { ...answers, [currentOp]: newOpAnswers };
        setAnswers(updatedAnswers);

        const newOpDurations = [...(durations[currentOp] || []), duration];
        const updatedDurations = { ...durations, [currentOp]: newOpDurations };
        setDurations(updatedDurations);

        setInputValue("");

        if (currentQuestionIndex < problems.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            // Op Finished
            if (currentOpIndex < ops.length - 1) {
                setCompletedOps(prev => [...prev, currentOp]);
                setCurrentOpIndex(prev => prev + 1);
                setCurrentQuestionIndex(0);
            } else {
                calculateAndSubmit(updatedAnswers, updatedDurations);
            }
        }
    };

    const calculateAndSubmit = async (finalAnswers: Record<string, boolean[]>, finalDurations: Record<string, number[]>) => {
        setIsSubmitting(true);
        const newTiers: Record<string, number> = {};

        ops.forEach(op => {
            const results = finalAnswers[op];
            const speeds = finalDurations[op];

            // Speed Thresholds (ms)
            const FAST_LIMIT_EASY = 8000; // 8s for Tier 1-2
            const FAST_LIMIT_HARD = 15000; // 15s for Tier 3-4

            // Helper to check if pass: Correct AND Fast enough
            const check = (idx: number, tier: number) => {
                const isCorrect = results[idx];
                const speed = speeds[idx];
                const limit = tier <= 2 ? FAST_LIMIT_EASY : FAST_LIMIT_HARD;
                // If incorrect, fail. If correct but too slow, fail (needs practice).
                return isCorrect && speed < limit;
            };

            // Questions mapped to tiers: [1, 1, 2, 3, 4]
            // We use standard logic but enforce speed.

            // Check Tier 1 (Must pass both Tier 1 questions)
            const passT1 = check(0, 1) && check(1, 1);

            // Check Tier 2
            const passT2 = check(2, 2);

            // Check Tier 3
            const passT3 = check(3, 3);

            // Check Tier 4
            const passT4 = check(4, 4);

            if (!passT1) {
                newTiers[op] = 1;
            } else if (!passT2) {
                newTiers[op] = 1; // Mastered 1 but failed 2
            } else if (!passT3) {
                newTiers[op] = 2; // Mastered 2 but failed 3
            } else if (!passT4) {
                newTiers[op] = 3; // Mastered 3 but failed 4
            } else {
                newTiers[op] = 4; // Mastered all
            }
        });

        await updateTiers(newTiers);
        onComplete();
    };

    if (!isLoaded) return <div className="p-8 text-center">Loading Assessment...</div>;

    const currentProblem = testData[currentOp][currentQuestionIndex];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative overflow-hidden"
            >
                {/* Progress Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                            Initial Assessment
                        </h2>
                        <p className="text-zinc-400 text-sm">Determining your starting level</p>
                    </div>
                    <div className="flex gap-2">
                        {ops.map((op, idx) => (
                            <div key={op} className={`w-3 h-3 rounded-full ${idx < currentOpIndex ? 'bg-green-500' :
                                idx === currentOpIndex ? 'bg-blue-500 animate-pulse' : 'bg-zinc-700'
                                }`} />
                        ))}
                    </div>
                </div>

                {/* Timer Display */}
                <div className="absolute top-8 right-8 text-zinc-500 font-mono text-sm">
                    {timer.toFixed(1)}s
                </div>

                {/* Content */}
                <div className="text-center py-8">
                    <div className="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-2">{currentOp}</div>
                    <div className="text-5xl font-bold text-white mb-8 font-mono">
                        {currentProblem.question}
                        {currentProblem.question.includes('=') ? '' : ' = ?'}
                    </div>

                    <div className="flex justify-center gap-4">
                        <input
                            autoFocus
                            type="number"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                            className="bg-zinc-800 border-2 border-zinc-700 rounded-xl px-6 py-4 text-3xl w-48 text-center focus:border-blue-500 focus:outline-none transition-colors"
                            placeholder="?"
                        />
                        <button
                            onClick={submitAnswer}
                            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-8 py-4 text-xl font-bold transition-transform active:scale-95"
                        >
                            <ChevronRight />
                        </button>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="mt-8 text-center text-zinc-500 text-sm">
                    Question {currentQuestionIndex + 1} of 5
                </div>

                {isSubmitting && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="text-white font-bold animate-pulse">Analyzing Results...</div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
