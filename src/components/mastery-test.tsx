"use client";

import { useState, useEffect } from "react";
import { MathProblem } from "@/lib/math-tiers";
import { getMasteryTestProblems, completeMasteryTest } from "@/lib/actions/game";
import { motion } from "framer-motion";
import { Trophy, X, CheckCircle2, XCircle, Zap } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { soundEngine } from "@/lib/sound-engine";

interface MasteryTestProps {
    operation: string;
    currentTier: number;
    onComplete: (passed: boolean, newTier: number) => void;
    onCancel: () => void;
}

export function MasteryTest({ operation, currentTier, onComplete, onCancel }: MasteryTestProps) {
    const [problems, setProblems] = useState<MathProblem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [results, setResults] = useState<boolean[]>([]);
    const [showResult, setShowResult] = useState(false);
    const [lastResult, setLastResult] = useState<boolean | null>(null);
    const [testComplete, setTestComplete] = useState(false);
    const [finalResult, setFinalResult] = useState<any>(null);

    useEffect(() => {
        loadProblems();
    }, [operation]);

    const loadProblems = async () => {
        setIsLoading(true);
        const res = await getMasteryTestProblems(operation);
        if (res.problems) {
            setProblems(res.problems);
        }
        setIsLoading(false);
    };

    const handleSubmit = async () => {
        if (!inputValue || showResult) return;

        const currentProblem = problems[currentIndex];
        const isCorrect = Math.abs(parseFloat(inputValue) - currentProblem.answer) < 0.01;

        setLastResult(isCorrect);
        setShowResult(true);
        setResults(prev => [...prev, isCorrect]);

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            soundEngine.playCorrect(1);
        } else {
            soundEngine.playIncorrect();
        }

        // Wait for feedback before moving on
        setTimeout(() => {
            setShowResult(false);
            setLastResult(null);
            setInputValue("");

            if (currentIndex < problems.length - 1) {
                setCurrentIndex(prev => prev + 1);
            } else {
                // Test complete - calculate results
                finishTest(isCorrect);
            }
        }, 800);
    };

    const finishTest = async (lastCorrect: boolean) => {
        setIsSubmitting(true);
        const finalCorrect = correctCount + (lastCorrect ? 1 : 0);

        const result = await completeMasteryTest(operation, finalCorrect, problems.length);
        setFinalResult(result);
        setTestComplete(true);
        setIsSubmitting(false);

        if (result.passed) {
            soundEngine.playComplete();
        }
    };

    const handleFinish = () => {
        onComplete(finalResult?.passed || false, finalResult?.newTier || currentTier);
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="text-primary font-mono animate-pulse">Loading Mastery Test...</div>
            </div>
        );
    }

    const currentProblem = problems[currentIndex];

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-2xl"
            >
                <GlassCard className="p-8 relative overflow-hidden">
                    {/* Close button */}
                    {!testComplete && (
                        <button
                            onClick={onCancel}
                            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>
                    )}

                    {!testComplete ? (
                        <>
                            {/* Header */}
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-accent text-[10px] font-black uppercase tracking-widest mb-4">
                                    <Trophy size={12} />
                                    Mastery Test
                                </div>
                                <h2 className="text-2xl font-black uppercase tracking-tight">
                                    {operation} Tier {currentTier}
                                </h2>
                                <p className="text-muted-foreground text-sm mt-2">
                                    Get 80% correct to advance to Tier {currentTier + 1}
                                </p>
                            </div>

                            {/* Progress */}
                            <div className="flex justify-center gap-2 mb-8">
                                {problems.map((_, idx) => (
                                    <div
                                        key={idx}
                                        className={`w-3 h-3 rounded-full ${idx < currentIndex
                                                ? results[idx]
                                                    ? 'bg-green-500'
                                                    : 'bg-red-500'
                                                : idx === currentIndex
                                                    ? 'bg-primary animate-pulse'
                                                    : 'bg-white/20'
                                            }`}
                                    />
                                ))}
                            </div>

                            {/* Problem */}
                            <div className="text-center py-8">
                                <motion.div
                                    key={currentIndex}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-5xl md:text-7xl font-black mb-8"
                                >
                                    {currentProblem?.question?.replace('*', '×').replace('/', '÷')}
                                    {currentProblem?.question?.includes('=') ? '' : ' = ?'}
                                </motion.div>

                                <div className="flex justify-center gap-4">
                                    <input
                                        autoFocus
                                        type="number"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                        disabled={showResult}
                                        className={`bg-white/5 border-2 rounded-2xl px-6 py-4 text-4xl w-48 text-center focus:outline-none transition-all ${showResult
                                                ? lastResult
                                                    ? 'border-green-500 bg-green-500/10'
                                                    : 'border-red-500 bg-red-500/10'
                                                : 'border-white/20 focus:border-primary'
                                            }`}
                                        placeholder="?"
                                    />
                                </div>

                                {/* Feedback */}
                                {showResult && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="mt-4 flex justify-center items-center gap-2"
                                    >
                                        {lastResult ? (
                                            <CheckCircle2 className="text-green-500" size={24} />
                                        ) : (
                                            <>
                                                <XCircle className="text-red-500" size={24} />
                                                <span className="text-red-400">
                                                    Answer: {currentProblem?.answer}
                                                </span>
                                            </>
                                        )}
                                    </motion.div>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="flex justify-between text-sm text-muted-foreground mt-4">
                                <span>Question {currentIndex + 1} of {problems.length}</span>
                                <span>Correct: {correctCount}/{currentIndex}</span>
                            </div>
                        </>
                    ) : (
                        /* Results Screen */
                        <div className="text-center py-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${finalResult?.passed
                                        ? 'bg-green-500/20 border-2 border-green-500'
                                        : 'bg-red-500/20 border-2 border-red-500'
                                    }`}
                            >
                                {finalResult?.passed ? (
                                    <Trophy className="text-green-500" size={48} />
                                ) : (
                                    <XCircle className="text-red-500" size={48} />
                                )}
                            </motion.div>

                            <h2 className="text-3xl font-black uppercase mb-4">
                                {finalResult?.passed ? 'MASTERY ACHIEVED!' : 'NOT YET...'}
                            </h2>

                            <div className="text-6xl font-black mb-4">
                                <span className={finalResult?.passed ? 'text-green-500' : 'text-red-500'}>
                                    {finalResult?.accuracy?.toFixed(0)}%
                                </span>
                            </div>

                            <p className="text-muted-foreground mb-8">
                                {finalResult?.passed
                                    ? `You've advanced to ${operation} Tier ${finalResult.newTier}!`
                                    : 'You need 80% accuracy to advance. Keep practicing!'}
                            </p>

                            <NeonButton onClick={handleFinish}>
                                {finalResult?.passed ? 'Continue' : 'Back to Practice'}
                            </NeonButton>
                        </div>
                    )}

                    {isSubmitting && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="text-white font-bold animate-pulse">Calculating Results...</div>
                        </div>
                    )}
                </GlassCard>
            </motion.div>
        </div>
    );
}
