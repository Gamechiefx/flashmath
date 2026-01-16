"use client";

import { useState, useEffect, useCallback } from "react";
import { generateProblemForSession, MathProblem } from "@/lib/math-tiers";
import { BANDS, getBandForTier } from "@/lib/tier-system";
import { updateTiers } from "@/lib/actions/game";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, XCircle, Zap, Target, X } from "lucide-react";

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

// Time limits per band (ms) - harder bands get more time
const BAND_TIME_LIMITS = [
    15000,   // Foundation: 15 seconds
    20000,   // Intermediate: 20 seconds
    30000,   // Advanced: 30 seconds
    105000,  // Expert: 1:45
    120000,  // Master: 2:00
];

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
    // eslint-disable-next-line react-hooks/purity -- Initial timestamp for timing questions
    const [questionStartTime, setQuestionStartTime] = useState(Date.now());
    const [timer, setTimer] = useState(0);
    const [showFeedback, setShowFeedback] = useState<'correct' | 'incorrect' | null>(null);

    const ops: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    const currentOp = ops[currentOpIndex];
    const currentBand = BANDS[currentBandIndex];

    // Get current time limit for this band
    const currentTimeLimit = BAND_TIME_LIMITS[currentBandIndex];
    const timeRemaining = Math.max(0, currentTimeLimit / 1000 - timer);

    const calculateFinalTiers = async (finalResults: Record<MathOperation, TestResult[]>) => {
        setIsSubmitting(true);

        const newTiers: Record<string, number> = {};

        ops.forEach(op => {
            const opResults = finalResults[op];
            if (!opResults.length) {
                newTiers[op] = 10; // Default to Foundation tier
                return;
            }

            // Calculate average performance
            const correctCount = opResults.filter(r => r.correct).length;
            const accuracy = correctCount / opResults.length;
            const avgTime = opResults.reduce((sum, r) => sum + r.timeMs, 0) / opResults.length;

            // Determine tier based on accuracy and speed
            let tier = 10; // Foundation default

            if (accuracy >= 0.8) {
                // High accuracy - check speed
                if (avgTime < SPEED_THRESHOLDS.fast) {
                    tier = 90; // Master
                } else if (avgTime < SPEED_THRESHOLDS.medium) {
                    tier = 70; // Expert
                } else if (avgTime < SPEED_THRESHOLDS.slow) {
                    tier = 50; // Advanced
                } else {
                    tier = 30; // Intermediate
                }
            } else if (accuracy >= 0.6) {
                // Medium accuracy
                if (avgTime < SPEED_THRESHOLDS.medium) {
                    tier = 50; // Advanced
                } else {
                    tier = 30; // Intermediate
                }
            } else if (accuracy >= 0.4) {
                tier = 30; // Intermediate
            } else {
                tier = 10; // Foundation
            }

            newTiers[op] = tier;
        });

        // Update tiers in database
        await updateTiers(newTiers);

        // Complete test
        onComplete();
    };

    // Timer effect
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((Date.now() - questionStartTime) / 1000);
        }, 100);
        return () => clearInterval(interval);
    }, [questionStartTime]);

    const handleTimeout = useCallback(() => {
        // Time ran out - count as incorrect
        const newResult: TestResult = {
            correct: false,
            timeMs: currentTimeLimit,
            band: currentBandIndex + 1,
        };

        setResults(prev => ({
            ...prev,
            [currentOp]: [...prev[currentOp], newResult],
        }));

        setShowFeedback('incorrect');

        setTimeout(() => {
            setShowFeedback(null);
            setInputValue("");

            // Move to next question
            if (currentBandIndex < 4) {
                setCurrentBandIndex(prev => prev + 1);
            } else {
                if (currentOpIndex < 3) {
                    setCurrentOpIndex(prev => prev + 1);
                    setCurrentBandIndex(0);
                } else {
                    calculateFinalTiers({
                        ...results,
                        [currentOp]: [...results[currentOp], newResult],
                    });
                }
            }
        }, 500);
    }, [currentTimeLimit, currentBandIndex, currentOp, currentOpIndex, results]);

    // Auto-fail if time runs out
    useEffect(() => {
        if (timer * 1000 >= currentTimeLimit && !showFeedback && currentProblem) {
            handleTimeout();
        }
    }, [timer, currentTimeLimit, showFeedback, currentProblem, handleTimeout]);

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

        // eslint-disable-next-line react-hooks/purity -- Safe in event handler
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
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-widest text-zinc-500">Time Left</div>
                            <div className={`text-2xl font-mono ${
                                timeRemaining <= 10 ? 'text-red-400 animate-pulse' :
                                timeRemaining <= 30 ? 'text-yellow-400' :
                                'text-zinc-300'
                            }`}>
                                {timeRemaining >= 60
                                    ? `${Math.floor(timeRemaining / 60)}:${String(Math.floor(timeRemaining % 60)).padStart(2, '0')}`
                                    : `${timeRemaining.toFixed(1)}s`
                                }
                            </div>
                        </div>
                        <button
                            onClick={onComplete}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-white"
                            title="Skip placement test"
                        >
                            <X size={20} />
                        </button>
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
                        <span>
                            {currentBandIndex >= 3
                                ? `${currentTimeLimit >= 60000 ? `${currentTimeLimit / 60000} min` : `${currentTimeLimit / 1000}s`} limit for ${currentBand.name} questions`
                                : 'Speed affects your starting tier'
                            }
                        </span>
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
