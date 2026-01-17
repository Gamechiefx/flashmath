"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results use any types */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Zap,
    Trophy,
    RotateCcw,
    Clock,
    LayoutDashboard,
    Star,
    HelpCircle,
    Brain,
    AlertTriangle
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";

import { getNextProblems } from "@/lib/actions/game";
import { initializeAISession, submitAIAnswer, requestAIHint as requestAIHintAction, endAISession } from "@/lib/actions/ai-engine";
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
import type { ContentItem, HintPayload } from "@/lib/ai-engine/types";
import { getBandForTier, getTierWithinBand, getTierOperandRange, isMasteryTestAvailable, MAX_TIER } from "@/lib/tier-system";

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [attempts, setAttempts] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [isError, setIsError] = useState(false);
    const [isCorrect, setIsCorrect] = useState(false);
    const [selectedOp, setSelectedOp] = useState<Operation>(operation);
    const [isSaving, setIsSaving] = useState(false);
    const [continueKey, setContinueKey] = useState('Space');

    // Tiered System State
    const [problemQueue, setProblemQueue] = useState<MathProblem[]>([]);
    const [showPlacementTest, setShowPlacementTest] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [currentExplanation, setCurrentExplanation] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [pausedTime, setPausedTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isLoadingProblems, setIsLoadingProblems] = useState(false);
    const [currentTier, setCurrentTier] = useState(1);
    const [showMasteryTest, setShowMasteryTest] = useState(false);
    const [opAccuracy, setOpAccuracy] = useState(0);

    // AI Engine State
    const [aiSessionId, setAiSessionId] = useState<string | null>(null);
    const [currentAIItem, setCurrentAIItem] = useState<ContentItem | null>(null);
    const [aiHint, setAiHint] = useState<HintPayload | null>(null);
    const [tiltScore, setTiltScore] = useState(0);
    const [echoQueueSize, setEchoQueueSize] = useState(0);
    const [echoItemsResolved, setEchoItemsResolved] = useState(0);
    const [isAIMode] = useState(true);  // AI mode enabled by default
    const [prefetchedQuestion, setPrefetchedQuestion] = useState<{ question: ContentItem; stats: any } | null>(null);
    const [tierAdvanced, setTierAdvanced] = useState<{ from: number; to: number } | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<{
        wasAISession: boolean;
        confidenceScore: number;
        finalTiltScore: number;
        echoItemsResolved: number;
        hintsGiven: number;
        masteryDelta: number;
    } | null>(null);
    const [hintsReceivedCount, setHintsReceivedCount] = useState(0);
    const [isLoadingHint, setIsLoadingHint] = useState(false);

    // Fetch problems helper
    const fetchMoreProblems = useCallback(async (op: string) => {
        setIsLoadingProblems(true);
        const res = await getNextProblems(op);
        if (res.problems) {
            setProblemQueue(prev => [...prev, ...res.problems]);
            if (res.currentTier) setCurrentTier(res.currentTier);
        }
        setIsLoadingProblems(false);
    }, []);

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
        setAiHint(null);
        setTiltScore(0);
        setEchoQueueSize(0);
        setEchoItemsResolved(0);
        setPrefetchedQuestion(null);
        setTierAdvanced(null);
        setAiAnalysis(null);
        setHintsReceivedCount(0);
        setIsLoadingHint(false);

        // Try AI mode first for authenticated users
        if (session?.user && isAIMode) {
            try {
                const aiResult = await initializeAISession(selectedOp);
                if (!('error' in aiResult)) {
                    setAiSessionId(aiResult.sessionId);
                    setCurrentAIItem(aiResult.firstQuestion);
                    setProblem({
                        question: aiResult.firstQuestion.promptText,
                        answer: aiResult.firstQuestion.correctAnswer,
                        explanation: aiResult.firstQuestion.explanation,
                    });
                    setCurrentTier(aiResult.firstQuestion.tier || 1);
                    setGameState("playing");
                    setProblemStartTime(Date.now());
                    return;
                }
            } catch (err) {
                console.error("[PRACTICE] AI session failed, falling back:", err);
            }
        }

        // Fallback to classic mode
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
        const avgSpeed = finalStats.length > 0
            ? finalStats.reduce((acc, s) => acc + s.responseTime, 0) / finalStats.length
            : 0;

        // If logged in, save to DB
        if (session?.user) {
            try {
                // End AI session first (handles tier progression)
                if (aiSessionId) {
                    // Capture AI analysis before ending
                    const accuracy = finalScore / Math.max(1, totalAttempts);
                    // Calculate actual skill points: +1 per correct, -1 per wrong
                    const netSkillPoints = totalAttempts >= 10 ? (finalScore - (totalAttempts - finalScore)) : 0;
                    setAiAnalysis({
                        wasAISession: true,
                        confidenceScore: accuracy >= 0.8 ? 0.85 : accuracy >= 0.6 ? 0.65 : 0.4,
                        finalTiltScore: tiltScore,
                        echoItemsResolved: echoItemsResolved,
                        hintsGiven: hintsReceivedCount,
                        masteryDelta: netSkillPoints,  // Now actual skill points, not percentage
                    });

                    const aiResult = await endAISession(aiSessionId, {
                        totalQuestions: totalAttempts,
                        correctCount: finalScore,
                        avgLatencyMs: avgSpeed,
                        maxStreak: maxStreak,
                        xpEarned: finalXP,
                    });

                    if (!('error' in aiResult) && aiResult.tierProgression?.advanced) {
                        // Tier advanced! Update local state
                        setCurrentTier(aiResult.tierProgression.newTier);
                        setTierAdvanced({
                            from: aiResult.tierProgression.previousTier,
                            to: aiResult.tierProgression.newTier,
                        });
                        console.log(`[AI] Tier advanced: ${aiResult.tierProgression.previousTier} → ${aiResult.tierProgression.newTier}`);
                    }

                    setAiSessionId(null);
                }

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    }, [session, score, totalAttempts, sessionStats, selectedOp, sessionXP, isSaving, gameState, aiSessionId, maxStreak, tiltScore, hintsReceivedCount, echoItemsResolved, update]);

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
    const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            setAiHint(null);  // Clear any hint

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

            // Flash green briefly
            setIsCorrect(true);
            setTimeout(() => setIsCorrect(false), 200);

            // AI Mode: With timeout fallback for smooth gameplay
            if (aiSessionId && currentAIItem) {
                const AI_TIMEOUT_MS = 1500; // 1.5 second timeout

                try {
                    // Race between AI and timeout
                    const aiPromise = submitAIAnswer(aiSessionId, intVal, responseTime, false);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), AI_TIMEOUT_MS)
                    );

                    interface AIAnswerResult {
                        isCorrect?: boolean;
                        hint?: unknown;
                        nextQuestion?: {
                            promptText: string;
                            correctAnswer: number;
                            explanation?: string;
                        };
                        envelope?: unknown;
                        sessionStats?: {
                            questionNumber?: number;
                            tiltScore?: number;
                            echoQueueSize?: number;
                            echoItemsResolved?: number;
                        };
                        error?: string;
                    }
                    const aiResult = await Promise.race([aiPromise, timeoutPromise]) as AIAnswerResult | { error: string };

                    if (!('error' in aiResult) && aiResult.sessionStats && aiResult.nextQuestion) {
                        setTiltScore(aiResult.sessionStats.tiltScore ?? 0);
                        setEchoQueueSize(aiResult.sessionStats.echoQueueSize ?? 0);
                        setEchoItemsResolved(aiResult.sessionStats.echoItemsResolved ?? 0);

                        // Show feedback briefly, then update to next question
                        const nextQ = aiResult.nextQuestion;
                        setTimeout(() => {
                            setCurrentAIItem(nextQ as ContentItem);
                            setProblem({
                                question: nextQ.promptText,
                                answer: nextQ.correctAnswer,
                                explanation: nextQ.explanation,
                            });
                            setInputValue("");
                            setProblemStartTime(Date.now());
                            setFeedback(null);
                            setAttempts(0);
                            setIsError(false);
                        }, 200);
                        return;
                    }
                } catch (err: any) {
                    if (err?.message === 'timeout') {
                        console.log("[AI] Timeout - using random fallback question");
                        // Generate fallback at user's tier
                        const fallback = generateFallbackProblem(selectedOp, currentTier);
                        setTimeout(() => {
                            setCurrentAIItem(null); // Clear AI item since we're using fallback
                            setProblem(fallback);
                            setInputValue("");
                            setProblemStartTime(Date.now());
                            setFeedback(null);
                            setAttempts(0);
                            setIsError(false);
                        }, 200);
                        return;
                    }
                    console.error("[AI] Submit failed:", err);
                }
            }

            // Classic mode fallback
            setTimeout(() => {
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
            setSessionXP(prev => Math.max(0, prev - 2));
            soundEngine.playIncorrect();

            // AI Mode: Submit wrong answer and prefetch next question
            if (aiSessionId && currentAIItem) {
                const responseTime = Date.now() - problemStartTime;
                // Submit answer and prefetch next question immediately
                submitAIAnswer(aiSessionId, intVal, responseTime, false).then(aiResult => {
                    if (!('error' in aiResult)) {
                        setTiltScore(aiResult.sessionStats.tiltScore);
                        setEchoQueueSize(aiResult.sessionStats.echoQueueSize);
                        setEchoItemsResolved(aiResult.sessionStats.echoItemsResolved || 0);
                        // Prefetch next question so it's ready when user presses continue
                        setPrefetchedQuestion({
                            question: aiResult.nextQuestion,
                            stats: aiResult.sessionStats
                        });
                        console.log("[AI] Prefetched next question");
                    }
                }).catch(err => console.error("[AI] Answer tracking failed:", err));
            }
        }
    };

    // Load continue keybind from localStorage
    useEffect(() => {
        const savedKey = localStorage.getItem('continueKey');
        if (savedKey) setContinueKey(savedKey);
    }, []);

    const getSymbol = () => {
        switch (selectedOp) {
            case 'Addition': return '+';
            case 'Subtraction': return '-';
            case 'Division': return '÷';
            default: return '×';
        }
    };

    // Generate a random fallback problem when AI times out
    // Uses 100-tier parametric scaling
    const generateFallbackProblem = (op: Operation, tier: number): MathProblem => {
        const opLower = op.toLowerCase() as 'addition' | 'subtraction' | 'multiplication' | 'division';
        const [min, max] = getTierOperandRange(tier, opLower);

        let a = Math.floor(Math.random() * (max - min + 1)) + min;
        let b = Math.floor(Math.random() * (max - min + 1)) + min;
        let _answer: number;
        let question: string;

        switch (op) {
            case 'Addition':
                _answer = a + b;
                question = `${a} + ${b}`;
                break;
            case 'Subtraction':
                // Ensure positive result
                if (b > a) [a, b] = [b, a];
                _answer = a - b;
                question = `${a} - ${b}`;
                break;
            case 'Division':
                // Ensure clean division
                b = Math.max(2, b);
                _answer = a;
                a = a * b;
                question = `${a} ÷ ${b}`;
                break;
            default: // Multiplication
                _answer = a * b;
                question = `${a} × ${b}`;
        }

        const band = getBandForTier(tier);
        const answer = _answer;
        return { question, answer, explanation: `${question} = ${answer}`, type: 'basic' as const, tier, band: band.name };
    };

    // Format key code for display
    const formatKeyName = (key: string) => {
        if (key === 'Space') return 'Space';
        if (key.startsWith('Key')) return key.replace('Key', '');
        if (key.startsWith('Digit')) return key.replace('Digit', '');
        if (key === 'Enter') return 'Enter';
        if (key === 'Escape') return 'Esc';
        return key;
    };

    // Request AI Hint on-demand (when clicking ? button)
    const requestAIHint = async () => {
        if (!aiSessionId || !currentAIItem || isLoadingHint) return;

        setIsLoadingHint(true);
        setIsPaused(true);

        try {
            const result = await requestAIHintAction(
                aiSessionId,
                inputValue,
                Date.now() - problemStartTime,
                problem.question,  // Pass current problem text
                problem.answer     // Pass correct answer
            );

            if (!('error' in result)) {
                setAiHint(result.hint);
                setHintsReceivedCount(prev => prev + 1);
            } else {
                // Fallback to static explanation
                setCurrentExplanation(problem.explanation || "No explanation available.");
                setShowHelpModal(true);
            }
        } catch (err) {
            console.error("[AI] Hint request failed:", err);
            // Fallback to static explanation
            setCurrentExplanation(problem.explanation || "No explanation available.");
            setShowHelpModal(true);
        } finally {
            setIsLoadingHint(false);
        }
    };

    const handleHelpNext = useCallback(async () => {
        setShowHelpModal(false);
        setIsPaused(false);
        setInputValue("");
        setIsError(false);
        setFeedback(null);
        setAttempts(0);
        setAiHint(null);

        // AI Mode: Use prefetched question if available (instant!)
        if (aiSessionId && prefetchedQuestion) {
            console.log("[AI] Using prefetched question - instant load!");
            setCurrentAIItem(prefetchedQuestion.question);
            setProblem({
                question: prefetchedQuestion.question.promptText,
                answer: prefetchedQuestion.question.correctAnswer,
                explanation: prefetchedQuestion.question.explanation,
            });
            setProblemStartTime(Date.now());
            setTiltScore(prefetchedQuestion.stats.tiltScore);
            setEchoQueueSize(prefetchedQuestion.stats.echoQueueSize);
            setEchoItemsResolved(prefetchedQuestion.stats.echoItemsResolved || 0);
            setPrefetchedQuestion(null); // Clear prefetch
            return;
        }

        // AI Mode fallback: Fetch if no prefetch available (with timeout)
        if (aiSessionId && currentAIItem) {
            const AI_TIMEOUT_MS = 1500;
            try {
                console.log("[AI] No prefetch - fetching next question...");
                const responseTime = Date.now() - problemStartTime;

                const aiPromise = submitAIAnswer(aiSessionId, "", responseTime, true);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), AI_TIMEOUT_MS)
                );

                interface AIAnswerResult {
                    isCorrect?: boolean;
                    hint?: unknown;
                    nextQuestion?: {
                        promptText: string;
                        correctAnswer: number;
                        explanation?: string;
                    };
                    envelope?: unknown;
                    sessionStats?: {
                        questionNumber?: number;
                        tiltScore?: number;
                        echoQueueSize?: number;
                        echoItemsResolved?: number;
                    };
                    error?: string;
                }
                const aiResult = await Promise.race([aiPromise, timeoutPromise]) as AIAnswerResult | { error: string };

                if (!('error' in aiResult) && aiResult.nextQuestion && aiResult.sessionStats) {
                    setCurrentAIItem(aiResult.nextQuestion as ContentItem);
                    setProblem({
                        question: aiResult.nextQuestion.promptText,
                        answer: aiResult.nextQuestion.correctAnswer,
                        explanation: aiResult.nextQuestion.explanation,
                    });
                    setProblemStartTime(Date.now());
                    setTiltScore(aiResult.sessionStats.tiltScore ?? 0);
                    setEchoQueueSize(aiResult.sessionStats.echoQueueSize ?? 0);
                    setEchoItemsResolved(aiResult.sessionStats.echoItemsResolved ?? 0);
                    return;
                }
            } catch (err: any) {
                if (err?.message === 'timeout') {
                    console.log("[AI] Timeout on continue - using random fallback");
                    const fallback = generateFallbackProblem(selectedOp, currentTier);
                    setCurrentAIItem(null);
                    setProblem(fallback);
                    setProblemStartTime(Date.now());
                    return;
                }
                console.error("[AI] Next question failed:", err);
            }
        }

        // Classic mode fallback
        const nextQueue = [...problemQueue];
        nextQueue.shift();
        if (nextQueue.length < 5) fetchMoreProblems(selectedOp);

        if (nextQueue.length > 0) {
            setProblemQueue(nextQueue);
            setProblem(nextQueue[0]);
            setProblemStartTime(Date.now());
        }
    }, [aiSessionId, prefetchedQuestion, currentAIItem, problemStartTime, selectedOp, currentTier, problemQueue, fetchMoreProblems]);

    // Continue key handler - must be after handleHelpNext is defined
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === continueKey && isError) {
                e.preventDefault();
                handleHelpNext();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isError, continueKey, handleHelpNext]);

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
            <AuthHeader session={session} />

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
                                {currentTier < MAX_TIER && isMasteryTestAvailable(currentTier) && opAccuracy >= 80 && (
                                    <button
                                        onClick={() => setShowMasteryTest(true)}
                                        className="px-8 py-4 text-lg rounded-xl bg-accent/20 border border-accent/30 text-accent font-bold uppercase hover:bg-accent/30 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trophy size={20} />
                                        MASTERY TEST
                                    </button>
                                )}
                            </div>
                            {(() => {
                                const band = getBandForTier(currentTier);
                                const tierInBand = getTierWithinBand(currentTier);
                                const canTest = isMasteryTestAvailable(currentTier) && opAccuracy >= 80;
                                return currentTier < MAX_TIER ? (
                                    <p className="text-center text-muted-foreground text-xs mt-2">
                                        <span className={band.textColor}>{band.shortName}{tierInBand}</span>
                                        <span className="text-zinc-500"> • {band.name} Band</span>
                                        <span className="text-zinc-600"> • </span>
                                        {canTest
                                            ? <span className="text-accent">Mastery test available!</span>
                                            : <span>{opAccuracy.toFixed(0)}% progress</span>
                                        }
                                    </p>
                                ) : (
                                    <p className="text-center text-accent text-xs mt-2">
                                        Master Tier 100 Achieved!
                                    </p>
                                );
                            })()}

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
                                    {/* Only show = if question doesn't already contain it */}
                                    {(!problem.question || !problem.question.includes('=')) && (
                                        <div className="text-7xl md:text-9xl font-thin text-muted-foreground">=</div>
                                    )}
                                </motion.div>

                                <div className="relative w-full max-w-sm">
                                    <input
                                        autoFocus
                                        type="number"
                                        value={inputValue}
                                        onChange={handleInput}
                                        onKeyDown={(e) => {
                                            // Block 'e' and 'E' (scientific notation) in number inputs
                                            if (['e', 'E'].includes(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        className={cn(
                                            "w-full border-2 rounded-3xl py-8 text-center text-6xl font-black outline-none transition-all shadow-lg",
                                            isError
                                                ? "bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-shake"
                                                : isCorrect
                                                ? "bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.3)]"
                                                : "bg-white/5 border-primary/30 text-foreground focus:border-primary shadow-[0_0_30px_rgba(34,211,238,0.1)]"
                                        )}
                                        placeholder="?"
                                    />

                                    {isError && !aiHint && (
                                        <motion.button
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            onClick={() => {
                                                if (aiSessionId && currentAIItem) {
                                                    // AI mode: request hint from Claude
                                                    requestAIHint();
                                                } else {
                                                    // Classic mode: show static explanation
                                                    setIsPaused(true);
                                                    setCurrentExplanation(problem.explanation || "No explanation available.");
                                                    setShowHelpModal(true);
                                                }
                                            }}
                                            disabled={isLoadingHint}
                                            className={cn(
                                                "absolute top-1/2 -right-20 -translate-y-1/2 p-4 rounded-full transition-all",
                                                isLoadingHint
                                                    ? "bg-blue-500/20 border border-blue-500/30 text-blue-400 animate-pulse"
                                                    : "bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10"
                                            )}
                                        >
                                            {isLoadingHint ? (
                                                <Brain size={24} className="animate-spin" />
                                            ) : (
                                                <HelpCircle size={24} />
                                            )}
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

                                    {/* Press Key prompt when error (no hint yet) */}
                                    {isError && !aiHint && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="absolute -bottom-16 left-0 right-0 text-center"
                                        >
                                            <span className="text-sm text-muted-foreground">
                                                Press <kbd className="px-2 py-1 bg-white/10 rounded text-xs mx-1 text-white">{formatKeyName(continueKey)}</kbd> to continue
                                            </span>
                                        </motion.div>
                                    )}
                                </div>

                                {/* AI Hint Display */}
                                <AnimatePresence>
                                    {aiHint && isError && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 max-w-lg"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 rounded-lg bg-blue-500/20">
                                                    <Brain size={20} className="text-blue-400" />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-2">
                                                        {aiHint.isLLMGenerated ? "AI Coach Hint" : "Hint"}
                                                    </div>
                                                    <p className="text-white/90 text-lg leading-relaxed">
                                                        {aiHint.hintText}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="mt-4 text-center">
                                                <button
                                                    onClick={handleHelpNext}
                                                    className="text-sm text-muted-foreground hover:text-white transition-colors"
                                                >
                                                    Press <kbd className="px-2 py-1 bg-white/10 rounded text-xs mx-1">{formatKeyName(continueKey)}</kbd> to continue
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* AI Status Indicators (subtle, bottom right) */}
                                {aiSessionId && (
                                    <div className="fixed bottom-4 right-4 flex items-center gap-2 text-xs">
                                        {tiltScore > 0.5 && (
                                            <div className={cn(
                                                "flex items-center gap-1 px-2 py-1 rounded-full border",
                                                tiltScore > 0.75
                                                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                                                    : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                                            )}>
                                                <AlertTriangle size={12} />
                                                <span className="font-mono">{Math.round(tiltScore * 100)}%</span>
                                            </div>
                                        )}
                                        {echoQueueSize > 0 && (
                                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400">
                                                <RotateCcw size={12} />
                                                <span className="font-mono">{echoQueueSize}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary">
                                            <Brain size={12} />
                                            <span className="font-bold">AI</span>
                                        </div>
                                    </div>
                                )}
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

                                {/* Tier Advancement Banner */}
                                {tierAdvanced && (() => {
                                    const fromBand = getBandForTier(tierAdvanced.from);
                                    const toBand = getBandForTier(tierAdvanced.to);
                                    const fromTierInBand = getTierWithinBand(tierAdvanced.from);
                                    const toTierInBand = getTierWithinBand(tierAdvanced.to);
                                    const crossedBand = toBand.id > fromBand.id;
                                    return (
                                        <motion.div
                                            initial={{ opacity: 0, y: -20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={cn(
                                                "mb-8 p-4 rounded-2xl border",
                                                crossedBand
                                                    ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30"
                                                    : "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30"
                                            )}
                                        >
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="text-4xl">{crossedBand ? '🏆' : '🎉'}</div>
                                                <div>
                                                    <div className={cn(
                                                        "text-[10px] font-bold uppercase tracking-widest mb-1",
                                                        crossedBand ? "text-purple-400" : "text-green-400"
                                                    )}>
                                                        {crossedBand ? 'Band Promotion!' : 'Tier Unlocked!'}
                                                    </div>
                                                    <div className="text-2xl font-black text-white flex items-center gap-2">
                                                        <span className={fromBand.textColor}>{fromBand.shortName}{fromTierInBand}</span>
                                                        <span className="text-white/50">→</span>
                                                        <span className={toBand.textColor}>{toBand.shortName}{toTierInBand}</span>
                                                    </div>
                                                </div>
                                                <div className="text-4xl">{crossedBand ? '🌟' : '🚀'}</div>
                                            </div>
                                            <p className={cn(
                                                "text-sm mt-2 text-center",
                                                crossedBand ? "text-purple-300/80" : "text-green-300/80"
                                            )}>
                                                {crossedBand
                                                    ? `Welcome to the ${toBand.name} band!`
                                                    : 'Keep practicing to unlock harder problems!'}
                                            </p>
                                        </motion.div>
                                    );
                                })()}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
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

                                {/* Action Buttons - Moved between stats and AI analysis */}
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                                    <NeonButton onClick={startGame} className="w-full sm:w-auto flex items-center gap-2">
                                        <RotateCcw size={18} /> RETRY
                                    </NeonButton>
                                    <Link href="/dashboard" className="w-full sm:w-auto">
                                        <button className="w-full px-8 py-4 rounded-xl font-bold border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-2">
                                            <LayoutDashboard size={18} />
                                            GO TO DASHBOARD
                                        </button>
                                    </Link>
                                </div>

                                {/* Sign Up Prompt for non-authenticated users */}
                                {!session && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4 }}
                                        className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/20 text-center"
                                    >
                                        <div className="text-lg font-bold text-white mb-2">
                                            🎉 Enjoyed that? There&apos;s so much more!
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Sign up to track your progress, compete on leaderboards, unlock achievements, and level up your skills.
                                        </p>
                                        <Link href="/auth/register">
                                            <button className="px-8 py-3 rounded-xl font-black uppercase tracking-widest border border-primary/30 hover:border-primary/50 bg-gradient-to-r from-primary/20 to-accent/20 transition-all text-primary">
                                                Sign Up — It&apos;s Free!
                                            </button>
                                        </Link>
                                    </motion.div>
                                )}

                                {/* AI Analysis Section */}
                                {aiAnalysis?.wasAISession && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                        className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/20 text-left"
                                    >
                                        <div className="flex items-center gap-2 mb-4">
                                            <Brain size={20} className="text-blue-400" />
                                            <h3 className="text-lg font-bold text-white">AI Learning Analysis</h3>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            {/* Confidence */}
                                            <div className="p-3 rounded-xl bg-white/5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-1">Skill Confidence</div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full transition-all",
                                                                aiAnalysis.confidenceScore >= 0.8 ? "bg-green-500" :
                                                                    aiAnalysis.confidenceScore >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                                                            )}
                                                            style={{ width: `${aiAnalysis.confidenceScore * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm font-mono font-bold text-white">
                                                        {Math.round(aiAnalysis.confidenceScore * 100)}%
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Tilt Detection */}
                                            <div className="p-3 rounded-xl bg-white/5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-purple-400 mb-1">Frustration Level</div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full transition-all",
                                                                aiAnalysis.finalTiltScore <= 0.3 ? "bg-green-500" :
                                                                    aiAnalysis.finalTiltScore <= 0.6 ? "bg-yellow-500" : "bg-red-500"
                                                            )}
                                                            style={{ width: `${aiAnalysis.finalTiltScore * 100}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm font-mono font-bold text-white">
                                                        {aiAnalysis.finalTiltScore <= 0.3 ? "😊" : aiAnalysis.finalTiltScore <= 0.6 ? "😐" : "😓"}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Skill Points Earned */}
                                            <div className="p-3 rounded-xl bg-white/5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-pink-400 mb-1">Skill Points</div>
                                                <div className={cn(
                                                    "text-2xl font-black",
                                                    aiAnalysis.masteryDelta > 0 ? "text-green-400" :
                                                        aiAnalysis.masteryDelta < 0 ? "text-red-400" : "text-white"
                                                )}>
                                                    {aiAnalysis.masteryDelta > 0 ? "+" : ""}{aiAnalysis.masteryDelta}
                                                    {totalAttempts < 10 && <span className="text-xs text-muted-foreground ml-1">Need 10+ Questions</span>}
                                                </div>
                                            </div>

                                            {/* Hints Given */}
                                            <div className="p-3 rounded-xl bg-white/5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-400 mb-1">AI Hints Used</div>
                                                <div className="text-2xl font-black text-white">
                                                    {aiAnalysis.hintsGiven}
                                                </div>
                                            </div>

                                            {/* Echo Items */}
                                            <div className="p-3 rounded-xl bg-white/5">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-orange-400 mb-1">Facts Reinforced</div>
                                                <div className="text-2xl font-black text-white">
                                                    {aiAnalysis.echoItemsResolved}
                                                </div>
                                            </div>

                                            {/* Current Tier */}
                                            {(() => {
                                                const band = getBandForTier(currentTier);
                                                const tierInBand = getTierWithinBand(currentTier);
                                                return (
                                                    <div className="p-3 rounded-xl bg-white/5">
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 mb-1">Current Tier</div>
                                                        <div className="text-2xl font-black text-white flex items-center gap-2">
                                                            <span className={band.textColor}>{band.shortName}{tierInBand}</span>
                                                            {tierAdvanced && <span className="text-green-400 text-sm">⬆</span>}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500 mt-1">{band.name}</div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Summary Message */}
                                        <div className="mt-4 pt-4 border-t border-white/10">
                                            <p className="text-sm text-white/70">
                                                {aiAnalysis.confidenceScore >= 0.8
                                                    ? "🌟 Excellent work! Your skills are progressing well and the AI is confident in your mastery."
                                                    : aiAnalysis.confidenceScore >= 0.6
                                                        ? "👍 Good effort! Keep practicing to strengthen these skills further."
                                                        : "💪 Keep going! The AI will continue to adapt and help you improve."
                                                }
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}
