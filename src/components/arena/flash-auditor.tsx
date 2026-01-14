'use client';

/**
 * FlashAuditor - Confidence Analysis Component
 * 
 * A beautiful, informative component showing the player's practice confidence
 * score breakdown. Helps players understand how their practice patterns affect
 * matchmaking quality.
 * 
 * Confidence Components:
 * - Volume (40%): Total practice sessions
 * - Consistency (30%): Sessions per week
 * - Recency (30%): Days since last practice
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { 
    Activity, 
    Calendar, 
    Clock, 
    ChevronDown, 
    ChevronUp,
    Zap,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Target,
    Info
} from 'lucide-react';

// Import shared types to avoid duplication
import { type ConfidenceBreakdown } from '@/lib/actions/confidence';
import { type DecayStatus } from '@/lib/arena/decay';

// =============================================================================
// TYPES
// =============================================================================

// Re-export ConfidenceBreakdown for backward compatibility with consumers
export type { ConfidenceBreakdown };

// Type alias to maintain existing DecayInfo usage throughout this file
// DecayStatus is the canonical type with additional fields (daysSinceActivity, tierAtRisk, etc.)
export type DecayInfo = DecayStatus;

interface FlashAuditorProps {
    confidence: ConfidenceBreakdown;
    decay?: DecayInfo;
    compact?: boolean;         // Show compact version
    showTips?: boolean;        // Show improvement tips
    className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIDENCE_THRESHOLDS = {
    EXCELLENT: 0.8,
    GOOD: 0.6,
    MODERATE: 0.4,
    LOW: 0.2
};

// =============================================================================
// HELPERS
// =============================================================================

function getConfidenceLabel(value: number): string {
    if (value >= CONFIDENCE_THRESHOLDS.EXCELLENT) return 'Excellent';
    if (value >= CONFIDENCE_THRESHOLDS.GOOD) return 'Good';
    if (value >= CONFIDENCE_THRESHOLDS.MODERATE) return 'Moderate';
    if (value >= CONFIDENCE_THRESHOLDS.LOW) return 'Low';
    return 'Very Low';
}

function getConfidenceColor(value: number): string {
    if (value >= CONFIDENCE_THRESHOLDS.EXCELLENT) return 'text-emerald-400';
    if (value >= CONFIDENCE_THRESHOLDS.GOOD) return 'text-green-400';
    if (value >= CONFIDENCE_THRESHOLDS.MODERATE) return 'text-yellow-400';
    if (value >= CONFIDENCE_THRESHOLDS.LOW) return 'text-orange-400';
    return 'text-red-400';
}

function getConfidenceBgColor(value: number): string {
    if (value >= CONFIDENCE_THRESHOLDS.EXCELLENT) return 'bg-emerald-500';
    if (value >= CONFIDENCE_THRESHOLDS.GOOD) return 'bg-green-500';
    if (value >= CONFIDENCE_THRESHOLDS.MODERATE) return 'bg-yellow-500';
    if (value >= CONFIDENCE_THRESHOLDS.LOW) return 'bg-orange-500';
    return 'bg-red-500';
}

function getBracketLabel(confidence: number): string {
    if (confidence >= 0.7) return 'ESTABLISHED';
    if (confidence >= 0.3) return 'DEVELOPING';
    return 'NEWCOMER';
}

function getBracketColor(confidence: number): string {
    if (confidence >= 0.7) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (confidence >= 0.3) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
}

function getDecayPhaseColor(phase: DecayInfo['phase']): string {
    switch (phase) {
        case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        case 'decaying': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        case 'severe': return 'bg-red-500/20 text-red-400 border-red-500/30';
        case 'returning': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    }
}

function getDecayPhaseIcon(phase: DecayInfo['phase']) {
    switch (phase) {
        case 'active': return <CheckCircle2 className="w-4 h-4" />;
        case 'warning': return <AlertTriangle className="w-4 h-4" />;
        case 'decaying': return <TrendingUp className="w-4 h-4 rotate-180" />;
        case 'severe': return <AlertTriangle className="w-4 h-4" />;
        case 'returning': return <Activity className="w-4 h-4" />;
    }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function ConfidenceBar({ value, label, icon: Icon, description, color }: {
    value: number;
    label: string;
    icon: typeof Activity;
    description: string;
    color: string;
}) {
    const percentage = Math.round(value * 100);
    
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="font-medium text-white/80">{label}</span>
                </div>
                <span className={`font-bold ${getConfidenceColor(value)}`}>
                    {percentage}%
                </span>
            </div>
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    className={`absolute inset-y-0 left-0 ${getConfidenceBgColor(value)} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />
            </div>
            <p className="text-xs text-white/50">{description}</p>
        </div>
    );
}

function ImprovementTip({ tip }: { tip: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-start gap-2 text-sm"
        >
            <Target className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
            <span className="text-white/70">{tip}</span>
        </motion.div>
    );
}

function PlacementProgress({ decay }: { decay: DecayInfo }) {
    const progress = decay.placementMatchesRequired > 0 
        ? decay.placementMatchesCompleted / decay.placementMatchesRequired 
        : 0;
    const remaining = decay.placementMatchesRequired - decay.placementMatchesCompleted;
    
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30"
        >
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-5 h-5 text-purple-400" />
                <span className="font-bold text-purple-300">Placement Matches</span>
            </div>
            
            <p className="text-sm text-white/70 mb-3">
                Complete {remaining} more match{remaining !== 1 ? 'es' : ''} to recalibrate your rank
            </p>
            
            <div className="flex gap-2">
                {Array.from({ length: decay.placementMatchesRequired }).map((_, i) => (
                    <motion.div
                        key={i}
                        className={`flex-1 h-3 rounded-full ${
                            i < decay.placementMatchesCompleted 
                                ? 'bg-purple-500' 
                                : 'bg-white/10'
                        }`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                    />
                ))}
            </div>
            
            <p className="text-xs text-purple-300/60 mt-2">
                ELO gains/losses are doubled during placement
            </p>
        </motion.div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function FlashAuditor({ 
    confidence, 
    decay,
    compact = false, 
    showTips = true,
    className = ''
}: FlashAuditorProps) {
    const [expanded, setExpanded] = useState(!compact);
    
    // Calculate improvement tips
    const tips: string[] = [];
    
    if (confidence.volume < 0.7 && confidence.totalSessions < 50) {
        const sessionsNeeded = Math.max(1, 50 - confidence.totalSessions);
        tips.push(`Practice ${sessionsNeeded} more session${sessionsNeeded !== 1 ? 's' : ''} to maximize volume score`);
    }
    
    if (confidence.consistency < 0.7) {
        const targetPerWeek = 7 - Math.round(confidence.sessionsPerWeek);
        if (targetPerWeek > 0) {
            tips.push(`Practice ${targetPerWeek} more time${targetPerWeek !== 1 ? 's' : ''} this week for better consistency`);
        }
    }
    
    if (confidence.recency < 1 && confidence.daysSinceLastPractice > 3) {
        tips.push('Practice today to maintain your recency score');
    }
    
    if (decay?.phase === 'warning') {
        tips.push(`Play an arena match within ${decay.daysUntilNextPhase} days to avoid ELO decay`);
    }

    const overallPercentage = Math.round(confidence.overall * 100);
    const bracketLabel = getBracketLabel(confidence.overall);
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/90 
                border border-white/10 backdrop-blur-xl overflow-hidden ${className}`}
        >
            {/* Header */}
            <button
                onClick={() => compact && setExpanded(!expanded)}
                className={`w-full p-4 flex items-center justify-between ${compact ? 'cursor-pointer hover:bg-white/5' : ''}`}
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Zap className="w-6 h-6 text-cyan-400" />
                        <motion.div
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400"
                            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    </div>
                    <div className="text-left">
                        <h3 className="font-bold text-white tracking-wide">FlashAuditor</h3>
                        <p className="text-xs text-white/50">Confidence Analysis</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Overall Score */}
                    <div className="text-right">
                        <div className={`text-2xl font-black ${getConfidenceColor(confidence.overall)}`}>
                            {overallPercentage}%
                        </div>
                        <div className={`text-xs px-2 py-0.5 rounded-full border ${getBracketColor(confidence.overall)}`}>
                            {bracketLabel}
                        </div>
                    </div>
                    
                    {compact && (
                        <motion.div
                            animate={{ rotate: expanded ? 180 : 0 }}
                            className="text-white/50"
                        >
                            <ChevronDown className="w-5 h-5" />
                        </motion.div>
                    )}
                </div>
            </button>
            
            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-4">
                            {/* Decay Status (if not active) */}
                            {decay && decay.phase !== 'active' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getDecayPhaseColor(decay.phase)}`}
                                >
                                    {getDecayPhaseIcon(decay.phase)}
                                    <span className="text-sm font-medium">{decay.phaseLabel}</span>
                                    {decay.eloAtRisk > 0 && (
                                        <span className="text-xs opacity-70">
                                            ({decay.eloAtRisk} ELO at risk)
                                        </span>
                                    )}
                                </motion.div>
                            )}
                            
                            {/* Returning Player Placement Progress */}
                            {decay?.isReturningPlayer && decay.placementMatchesCompleted < decay.placementMatchesRequired && (
                                <PlacementProgress decay={decay} />
                            )}
                            
                            {/* Confidence Breakdown */}
                            <div className="space-y-4 p-4 rounded-xl bg-white/5">
                                <ConfidenceBar
                                    value={confidence.volume}
                                    label="Volume"
                                    icon={Activity}
                                    description={`${confidence.totalSessions} practice sessions (50 for max)`}
                                    color="text-blue-400"
                                />
                                
                                <ConfidenceBar
                                    value={confidence.consistency}
                                    label="Consistency"
                                    icon={Calendar}
                                    description={`${confidence.sessionsPerWeek.toFixed(1)} sessions per week`}
                                    color="text-green-400"
                                />
                                
                                <ConfidenceBar
                                    value={confidence.recency}
                                    label="Recency"
                                    icon={Clock}
                                    description={
                                        confidence.daysSinceLastPractice === 0 
                                            ? 'Practiced today!' 
                                            : `${confidence.daysSinceLastPractice} day${confidence.daysSinceLastPractice !== 1 ? 's' : ''} since last practice`
                                    }
                                    color="text-purple-400"
                                />
                            </div>
                            
                            {/* Improvement Tips */}
                            {showTips && tips.length > 0 && (
                                <div className="space-y-2 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                    <div className="flex items-center gap-2 text-cyan-400 mb-2">
                                        <Info className="w-4 h-4" />
                                        <span className="text-sm font-bold">Tips to Improve</span>
                                    </div>
                                    {tips.map((tip, i) => (
                                        <ImprovementTip key={i} tip={tip} />
                                    ))}
                                </div>
                            )}
                            
                            {/* Matchmaking Info */}
                            <div className="text-xs text-white/40 flex items-center gap-2">
                                <Info className="w-3 h-3" />
                                <span>
                                    {bracketLabel === 'NEWCOMER' 
                                        ? 'You\'ll be matched with other new players for fair matches'
                                        : bracketLabel === 'ESTABLISHED'
                                            ? 'You\'re in the quality matchmaking pool for experienced players'
                                            : 'Building your practice history for better matchmaking'
                                    }
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// =============================================================================
// COMPACT VERSION
// =============================================================================

export function FlashAuditorCompact({ confidence, decay, className = '' }: {
    confidence: ConfidenceBreakdown;
    decay?: DecayInfo;
    className?: string;
}) {
    const overallPercentage = Math.round(confidence.overall * 100);
    const bracketLabel = getBracketLabel(confidence.overall);
    
    return (
        <div className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10 ${className}`}>
            <Zap className="w-4 h-4 text-cyan-400" />
            
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className={`font-bold ${getConfidenceColor(confidence.overall)}`}>
                        {overallPercentage}%
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${getBracketColor(confidence.overall)}`}>
                        {bracketLabel}
                    </span>
                </div>
            </div>
            
            {/* Mini progress bars */}
            <div className="flex gap-1">
                {[confidence.volume, confidence.consistency, confidence.recency].map((val, i) => (
                    <div key={i} className="w-8 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={`h-full ${getConfidenceBgColor(val)} rounded-full`}
                            style={{ width: `${val * 100}%` }}
                        />
                    </div>
                ))}
            </div>
            
            {/* Decay warning indicator */}
            {decay && decay.phase !== 'active' && (
                <div className={`p-1 rounded ${getDecayPhaseColor(decay.phase)}`}>
                    {getDecayPhaseIcon(decay.phase)}
                </div>
            )}
        </div>
    );
}

export default FlashAuditor;


