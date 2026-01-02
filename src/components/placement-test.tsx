"use client";

import { useState, useEffect } from "react";
import { generateProblemForSession, MathProblem } from "@/lib/math-tiers";
import { BANDS, getBandForTier } from "@/lib/tier-system";
import { updateTiers } from "@/lib/actions/game";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, XCircle, Zap, Target } from "lucide-react";

interface PlacementTestProps {
    onComplete: () => void;
}

type MathOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

interface TestResult {
    correct: boolean;
    timeMs: number;
    band: number;
}

// Band sample tiers - test from middle of each band for fair assessment
const BAND_SAMPLE_TIERS = [10, 30, 50, 70, 90]; // Foundation, Intermediate, Advanced, Expert, Master

// Speed thresholds (ms) - faster = better placement within band
const SPEED_THRESHOLDS = {
    fast: 3000,      // Under 3s = excellent
    medium: 6000,    // Under 6s = good
    slow: 12000,     // Under 12s = acceptable
};

export function PlacementTest({ onComplete }: PlacementTestProps) {
    const [currentOpIndex, setCurrentOpIndex] = useState(0);
    const [currentBandIndex, setCurrentBandIndex] = useState(0);
    const [inputValue, setInputValue] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [results, setResults] = useState<Record<MathOperation, TestResult[]>>({
        addition: [],
        subtraction: [],
        multiplication: [],
        division: [],
    });
    const [currentProblem, setCurrentProblem] = useState<MathProblem | null>(null);
    const [questionStartTime, setQuestionStartTime] = useState(Date.now());
    const [timer, setTimer] = useState(0);
    const [showFeedback, setShowFeedback] = useState<'correct' | 'incorrect' | null>(null);

    const ops: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    const currentOp = ops[currentOpIndex];
    const currentBand = BANDS[currentBandIndex];

    // Timer effect
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((Date.now() - questionStartTime) / 1000);
        }, 100);
        return () => clearInterval(interval);
    }, [questionStartTime]);

    // Generate problem when operation or band changes
    useEffect(() => {
        const tier = BAND_SAMPLE_TIERS[currentBandIndex];
        const problem = generateProblemForSession(currentOp, tier);
        setCurrentProblem(problem);
        setQuestionStartTime(Date.now());
        setTimer(0);
        setInputValue("");
    }, [currentOpIndex, currentBandIndex, currentOp]);

    const submitAnswer = async () => {
        if (!inputValue || !currentProblem || showFeedback) return;

        const timeMs = Date.now() - questionStartTime;
        const isCorrect = Math.abs(parseFloat(inputValue) - currentProblem.answer) < 0.01;

        // Store result
        const newResult: TestResult = {
            correct: isCorrect,
            timeMs,
            band: currentBandIndex + 1,
        };

        setResults(prev => ({
            ...prev,
            [currentOp]: [...prev[currentOp], newResult],
        }));

        // Show feedback briefly
        setShowFeedback(isCorrect ? 'correct' : 'incorrect');

        setTimeout(() => {
            setShowFeedback(null);
            setInputValue("");

            // Move to next question
            if (currentBandIndex < 4) {
                // More bands to test for this operation
                setCurrentBandIndex(prev => prev + 1);
            } else {
                // Done with this operation
                if (currentOpIndex < 3) {
                    // More operations to test
                    setCurrentOpIndex(prev => prev + 1);
                    setCurrentBandIndex(0);
                } else {
                    // Test complete!
                    calculateFinalTiers({
                        ...results,
                        [currentOp]: [...results[currentOp], newResult],
                    });
                }
            }
        }, 500);
    };

    const calculateFinalTiers = async (finalResults: Record<MathOperation, TestResult[]>) => {
        setIsSubmitting(true);

        const newTiers: Record<string, number> = {};

        ops.forEach(op => {
            const opResults = finalResults[op];

            // Find highest band passed
            let highestBandPassed = 0;
            let avgSpeedInBand = 0;
            let speedCount = 0;

            for (let bandIdx = 0; bandIdx < opResults.length; bandIdx++) {
                const result = opResults[bandIdx];
                if (result.correct) {
                    highestBandPassed = bandIdx + 1;
                    avgSpeedInBand += result.timeMs;
                    speedCount++;
                } else {
                    // Stop at first failure - can't skip ahead
                    break;
                }
            }

            if (speedCount > 0) {
                avgSpeedInBand /= speedCount;
            }

            // Calculate final tier based on band and speed
            if (highestBandPassed === 0) {
                // Failed Foundation - start at tier 1
                newTiers[op] = 1;
            } else {
                // Get band range
                const band = BANDS[highestBandPassed - 1];
                const [bandStart, bandEnd] = band.tierRange;

                // Speed determines position within band
                let tierWithinBand: number;
                if (avgSpeedInBand < SPEED_THRESHOLDS.fast) {
                    // Fast = upper third of band
                    tierWithinBand = Math.round(bandStart + (bandEnd - bandStart) * 0.7);
                } else if (avgSpeedInBand < SPEED_THRESHOLDS.medium) {
                    // Medium = middle of band
                    tierWithinBand = Math.round(bandStart + (bandEnd - bandStart) * 0.5);
                } else if (avgSpeedInBand < SPEED_THRESHOLDS.slow) {
                    // Slow = lower third of band
                    tierWithinBand = Math.round(bandStart + (bandEnd - bandStart) * 0.3);
                } else {
                    // Very slow = start of band
                    tierWithinBand = bandStart;
                }

                newTiers[op] = tierWithinBand;
            }
        });

        await updateTiers(newTiers);
        onComplete();
    };

    if (!currentProblem) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="text-white animate-pulse">Loading Assessment...</div>
            </div>
        );
    }

    const totalQuestions = 20; // 4 ops × 5 bands
    const answeredQuestions = currentOpIndex * 5 + currentBandIndex;
    const progress = (answeredQuestions / totalQuestions) * 100;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative overflow-hidden"
            >
                {/* Progress Bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800">
                    <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>

                {/* Header */}
                <div className="flex justify-between items-center mb-6 mt-2">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                            Placement Assessment
                        </h2>
                        <p className="text-zinc-400 text-sm">Testing your starting level</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs uppercase tracking-widest text-zinc-500">Timer</div>
                        <div className="text-2xl font-mono text-zinc-300">{timer.toFixed(1)}s</div>
                    </div>
                </div>

                {/* Operation Progress */}
                <div className="flex justify-center gap-3 mb-6">
                    {ops.map((op, idx) => (
                        <div
                            key={op}
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                                idx < currentOpIndex
                                    ? 'bg-green-500/20 text-green-400'
                                    : idx === currentOpIndex
                                    ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500'
                                    : 'bg-zinc-800 text-zinc-600'
                            }`}
                        >
                            {op.slice(0, 3)}
                        </div>
                    ))}
                </div>

                {/* Band Indicator */}
                <div className="text-center mb-4">
                    <div
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${currentBand.bgGradient} bg-opacity-20`}
                    >
                        <Target size={16} className="text-white" />
                        <span className="text-white font-bold">{currentBand.name}</span>
                        <span className="text-white/70 text-sm">Band</span>
                    </div>
                </div>

                {/* Problem Display */}
                <div className="text-center py-8 relative">
                    <AnimatePresence mode="wait">
                        {showFeedback && (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className={`absolute inset-0 flex items-center justify-center z-10 ${
                                    showFeedback === 'correct' ? 'text-green-400' : 'text-red-400'
                                }`}
                            >
                                {showFeedback === 'correct' ? (
                                    <CheckCircle2 size={80} />
                                ) : (
                                    <XCircle size={80} />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className={`transition-opacity ${showFeedback ? 'opacity-20' : 'opacity-100'}`}>
                        <div className="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-2">
                            {currentOp}
                        </div>
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
                                disabled={!!showFeedback}
                            />
                            <button
                                onClick={submitAnswer}
                                disabled={!!showFeedback || !inputValue}
                                className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl px-8 py-4 text-xl font-bold transition-all active:scale-95"
                            >
                                <ChevronRight />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center text-sm text-zinc-500">
                    <div className="flex items-center gap-2">
                        <Zap size={14} className="text-yellow-400" />
                        <span>Speed affects your starting tier</span>
                    </div>
                    <div>
                        Question {answeredQuestions + 1} of {totalQuestions}
                    </div>
                </div>

                {/* Band Progress Dots */}
                <div className="flex justify-center gap-2 mt-4">
                    {BANDS.map((band, idx) => (
                        <div
                            key={band.id}
                            className={`w-2 h-2 rounded-full transition-all ${
                                idx < currentBandIndex
                                    ? results[currentOp][idx]?.correct
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    : idx === currentBandIndex
                                    ? 'bg-blue-500 animate-pulse'
                                    : 'bg-zinc-700'
                            }`}
                            title={band.name}
                        />
                    ))}
                </div>

                {isSubmitting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl"
                    >
                        <div className="text-center">
                            <div className="text-white font-bold text-xl mb-2">Calculating Your Level</div>
                            <div className="text-zinc-400 text-sm">Analyzing your performance...</div>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
