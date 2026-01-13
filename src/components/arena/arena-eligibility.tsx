'use client';

import { useState, useEffect } from 'react';
import {
    motion,
    AnimatePresence
} from 'framer-motion';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Zap, AlertTriangle, Activity, Award } from 'lucide-react';
import { useAuditor } from '@/components/auditor';
import type { ConfidenceBreakdown, DecayInfo } from './flash-auditor';

// Note: Confidence no longer gates arena access - it's used for matchmaking quality

interface ArenaEligibilityProps {
    practiceStats: {
        totalSessions: number;
        recentAccuracy: number | null;
        daysSinceLastPractice: number;
        confidence: number;
    };
    userAge: number | null;
    isAdmin?: boolean;
    // New: Full confidence breakdown for FlashAuditor
    confidenceBreakdown?: ConfidenceBreakdown;
    decayInfo?: DecayInfo;
}

/**
 * Render the Arena eligibility interface and call-to-action based on the user's practice stats, age, and admin status.
 *
 * Renders a FlashAuditor summary, a collapsible requirements card (shown when not eligible), matchmaking info, optional accuracy warning, and CTA buttons. Admins bypass requirements; non-admin eligibility is determined by basic practice and age gates. The Enter Arena CTA may attempt to request fullscreen for an immersive experience.
 *
 * @param practiceStats - Object with user practice metrics: `totalSessions`, `recentAccuracy`, `daysSinceLastPractice`, and `confidence`.
 * @param userAge - User age in years or `null` if not provided.
 * @param isAdmin - If `true`, bypasses eligibility gates and collapses requirements (default `false`).
 * @param confidenceBreakdown - Optional precomputed `ConfidenceBreakdown` to use instead of deriving from `practiceStats`.
 * @param decayInfo - Optional `DecayInfo` providing placement/decay state for the FlashAuditor card.
 * @returns The Arena eligibility UI as a JSX element.
 */
export function ArenaEligibility({ 
    practiceStats, 
    userAge, 
    isAdmin = false,
    confidenceBreakdown,
    decayInfo 
}: ArenaEligibilityProps) {
    const [isEligible, setIsEligible] = useState(false);
    const [requirementsExpanded, setRequirementsExpanded] = useState(true);

    // Basic requirements (confidence no longer gates - just for matchmaking)
    const MIN_SESSIONS = 1; // Reduced from 5 - we now use confidence-based matching
    const MIN_ACCURACY = 50; // Reduced - new players matched with similar
    const MIN_AGE = 13;

    // Check eligibility - simplified since confidence is no longer a gate
    const hasEnoughPractice = practiceStats.totalSessions >= MIN_SESSIONS;
    const hasGoodAccuracy = practiceStats.totalSessions === 0 || (practiceStats.recentAccuracy ?? 0) >= MIN_ACCURACY;
    const meetsAge = isAdmin || (userAge !== null && userAge >= MIN_AGE);

    useEffect(() => {
        // Admin bypasses all requirements
        if (isAdmin) {
            setIsEligible(true);
            setRequirementsExpanded(false);
            return;
        }
        
        // Simplified eligibility: just age and basic practice
        const eligible = hasEnoughPractice && meetsAge;
        setIsEligible(eligible);
        
        // Auto-collapse when all requirements are met
        if (eligible) {
            setRequirementsExpanded(false);
        }
    }, [isAdmin, hasEnoughPractice, hasGoodAccuracy, meetsAge]);

    // Build confidence breakdown from practiceStats if not provided
    const confidence: ConfidenceBreakdown = confidenceBreakdown || {
        overall: practiceStats.confidence,
        volume: Math.min(1, Math.log10(practiceStats.totalSessions + 1) / Math.log10(51)),
        consistency: 0.5, // Estimated without full data
        recency: practiceStats.daysSinceLastPractice <= 7 ? 1 : Math.max(0, 1 - (practiceStats.daysSinceLastPractice - 7) / 30),
        totalSessions: practiceStats.totalSessions,
        sessionsPerWeek: practiceStats.totalSessions / 4, // Rough estimate
        daysSinceLastPractice: practiceStats.daysSinceLastPractice
    };

    const requirements = [
        {
            id: 'age',
            label: 'Age Requirement',
            description: meetsAge ? 'Age verified ✓' : 'Must be 13+ years old (set during registration)',
            met: meetsAge
        },
        {
            id: 'intro',
            label: 'Introduction Complete',
            description: `Complete at least ${MIN_SESSIONS} practice session to learn the ropes`,
            met: hasEnoughPractice,
            progress: Math.min(100, (practiceStats.totalSessions / MIN_SESSIONS) * 100),
            current: Math.min(practiceStats.totalSessions, MIN_SESSIONS),
            required: MIN_SESSIONS
        }
    ];

    // Show warning if accuracy is very low
    const showAccuracyWarning = practiceStats.totalSessions >= 3 && (practiceStats.recentAccuracy ?? 0) < MIN_ACCURACY;

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
            >
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                    Arena
                </h1>
                <p className="text-muted-foreground">
                    Compete against other players in real-time math battles
                </p>
            </motion.div>

            {/* FlashAuditor Card - Opens slide-out panel */}
            <FlashAuditorCard 
                confidence={confidence}
                decayInfo={decayInfo}
            />

            {/* Requirements Card - Collapsible (only show if not met) */}
            {!isEligible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="glass rounded-2xl overflow-hidden"
                >
                    {/* Clickable Header */}
                    <button
                        onClick={() => setRequirementsExpanded(!requirementsExpanded)}
                        className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <span className="text-2xl">🛡️</span>
                            Arena Requirements
                        </h2>
                        {requirementsExpanded ? (
                            <ChevronUp size={20} className="text-muted-foreground" />
                        ) : (
                            <ChevronDown size={20} className="text-muted-foreground" />
                        )}
                    </button>

                    {/* Collapsible Content */}
                    <AnimatePresence>
                        {requirementsExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="px-6 pb-6 space-y-3">
                                    {requirements.map((req, index) => (
                                        <motion.div
                                            key={req.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.1 + index * 0.05 }}
                                            className={`p-4 rounded-xl border transition-all ${req.met
                                                ? 'bg-green-500/10 border-green-500/30'
                                                : 'bg-card border-border'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${req.met ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                                                            }`}>
                                                            {req.met ? '✓' : index + 1}
                                                        </span>
                                                        <span className="font-medium">{req.label}</span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1 ml-8">
                                                        {req.description}
                                                    </p>

                                                    {/* Progress bar for quantifiable requirements */}
                                                    {req.progress !== undefined && (
                                                        <div className="ml-8 mt-2">
                                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                                <motion.div
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${Math.min(100, req.progress)}%` }}
                                                                    transition={{ delay: 0.3, duration: 0.5 }}
                                                                    className={`h-full rounded-full ${req.met ? 'bg-green-500' : 'bg-primary'
                                                                        }`}
                                                                />
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                {req.current} / {req.required}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* Accuracy Warning */}
            {showAccuracyWarning && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30"
                >
                    <p className="text-sm text-yellow-400 flex items-center gap-2">
                        <span>⚠️</span>
                        Your accuracy is {practiceStats.recentAccuracy}%. Consider more practice before arena - you&apos;ll be matched with similar players.
                    </p>
                </motion.div>
            )}

            {/* Matchmaking Info Banner */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20"
            >
                <p className="text-sm text-cyan-300/80">
                    <span className="font-bold text-cyan-400">Fair Matchmaking:</span>{' '}
                    {practiceStats.confidence < 0.3 
                        ? "As a newcomer, you'll be matched with other new players for balanced matches."
                        : practiceStats.confidence < 0.7
                            ? "You'll be matched with players of similar experience levels."
                            : "You're in the experienced player pool with quality matchmaking."
                    }
                </p>
            </motion.div>

            {/* CTA Button */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                {isEligible ? (
                    <Link href="/arena/modes" onClick={() => {
                        // Request fullscreen for immersive arena experience
                        try {
                            const elem = document.documentElement;
                            if (elem.requestFullscreen && !document.fullscreenElement) {
                                elem.requestFullscreen();
                            } else if ((elem as any).webkitRequestFullscreen) {
                                (elem as any).webkitRequestFullscreen();
                            }
                        } catch (err) {
                            console.log('[Arena] Fullscreen request failed:', err);
                        }
                    }}>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-primary to-accent
                         text-primary-foreground font-bold text-lg shadow-lg neon-glow
                         transition-all hover:shadow-xl"
                        >
                            Enter Arena
                        </motion.button>
                    </Link>
                ) : (
                    <div className="space-y-3">
                        <button
                            disabled
                            className="w-full py-4 px-6 rounded-xl bg-muted text-muted-foreground 
                         font-bold text-lg cursor-not-allowed opacity-50"
                        >
                            Complete Requirements to Enter
                        </button>
                        <Link href="/practice">
                            <button className="w-full py-3 px-6 rounded-xl border border-primary 
                                text-primary font-medium hover:bg-primary/10 transition-colors">
                                Go to Practice
                            </button>
                        </Link>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

// =============================================================================
// FlashAuditor Card - Compact version that opens the slide-out panel
/**
 * Render a compact FlashAuditor card showing overall confidence, a bracket badge, three mini progress bars, and an optional decay/placement warning.
 *
 * @param confidence - ConfidenceBreakdown with `overall`, `volume`, `consistency`, `recency`, and related metrics used to compute display values
 * @param decayInfo - Optional DecayInfo describing decay/returning state; when present shows placement remaining or at-risk ELO information
 * @returns The FlashAuditor card React element used as a compact interactive summary and entry point to the auditor panel
 */

function FlashAuditorCard({
    confidence,
    decayInfo
}: {
    confidence: ConfidenceBreakdown;
    decayInfo?: DecayInfo;
}) {
    const { openPanel } = useAuditor();

    const overallPercent = Math.round(confidence.overall * 100);

    // Get bracket styling
    const getBracketStyle = () => {
        if (confidence.overall >= 0.7) {
            return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'ESTABLISHED' };
        }
        if (confidence.overall >= 0.3) {
            return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'DEVELOPING' };
        }
        return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'NEWCOMER' };
    };

    const bracketStyle = getBracketStyle();
    const hasWarning = decayInfo && decayInfo.phase !== 'active';
    const isReturning = decayInfo?.isReturningPlayer && decayInfo.placementMatchesCompleted < decayInfo.placementMatchesRequired;

    // Get confidence color
    const getConfidenceColor = () => {
        if (confidence.overall >= 0.8) return 'text-emerald-400';
        if (confidence.overall >= 0.6) return 'text-green-400';
        if (confidence.overall >= 0.4) return 'text-yellow-400';
        if (confidence.overall >= 0.2) return 'text-orange-400';
        return 'text-red-400';
    };

    return (
        <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openPanel}
            className="w-full p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/90
                border border-white/10 backdrop-blur-xl hover:border-cyan-500/30 transition-all
                text-left relative overflow-hidden group"
        >
            {/* Background glow on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 to-blue-500/0
                group-hover:from-cyan-500/5 group-hover:to-blue-500/5 transition-all duration-300" />

            <div className="relative flex items-center justify-between">
                {/* Left side - Icon and title */}
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20
                            border border-cyan-500/30">
                            <Zap className="w-5 h-5 text-cyan-400" />
                        </div>
                        {/* Warning indicator */}
                        {hasWarning && (
                            <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500
                                    border-2 border-slate-900"
                            />
                        )}
                    </div>

                    <div>
                        <h3 className="font-bold text-white text-sm">FlashAuditor</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${bracketStyle.bg} ${bracketStyle.text} ${bracketStyle.border}`}>
                                {bracketStyle.label}
                            </span>
                            {isReturning && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                    PLACEMENT
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right side - Confidence score */}
                <div className="text-right">
                    <div className={`text-3xl font-black ${getConfidenceColor()}`}>
                        {overallPercent}%
                    </div>
                    <div className="text-xs text-white/50">
                        Tap for details
                    </div>
                </div>
            </div>

            {/* Mini progress bars */}
            <div className="flex gap-2 mt-3">
                <MiniProgressBar value={confidence.volume} label="Vol" />
                <MiniProgressBar value={confidence.consistency} label="Con" />
                <MiniProgressBar value={confidence.recency} label="Rec" />
            </div>

            {/* Decay warning */}
            {hasWarning && decayInfo && (
                <div className="mt-3 flex items-center gap-2 text-xs">
                    {decayInfo.phase === 'returning' ? (
                        <>
                            <Activity className="w-3 h-3 text-purple-400" />
                            <span className="text-purple-400">
                                {decayInfo.placementMatchesRequired - decayInfo.placementMatchesCompleted} placement matches remaining
                            </span>
                        </>
                    ) : (
                        <>
                            <AlertTriangle className="w-3 h-3 text-yellow-400" />
                            <span className="text-yellow-400">
                                {decayInfo.phaseLabel}: {decayInfo.eloAtRisk} ELO at risk
                            </span>
                        </>
                    )}
                </div>
            )}
        </motion.button>
    );
}

/**
 * Render a compact animated horizontal progress bar with a label and percentage.
 *
 * The bar fills from 0 to `value * 100%` with a smooth animation and displays a rounded percentage.
 *
 * @param value - Fill level between 0 and 1. Colors: >= 0.7 -> emerald, >= 0.4 -> yellow, otherwise orange.
 * @param label - Text label shown to the left of the percentage above the bar
 */
function MiniProgressBar({ value, label }: { value: number; label: string }) {
    const getColor = () => {
        if (value >= 0.7) return 'bg-emerald-500';
        if (value >= 0.4) return 'bg-yellow-500';
        return 'bg-orange-500';
    };
    
    return (
        <div className="flex-1">
            <div className="flex items-center justify-between text-[10px] text-white/50 mb-0.5">
                <span>{label}</span>
                <span>{Math.round(value * 100)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${value * 100}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${getColor()}`}
                />
            </div>
        </div>
    );
}