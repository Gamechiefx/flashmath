'use client';

/**
 * IGLDecisionLog
 * 
 * Post-match component showing all IGL strategic decisions.
 * Features:
 * - Chronological decision history
 * - Decision outcomes (success/failure)
 * - Impact analysis
 * - Expandable details
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Crown, 
    PhoneCall, 
    Pause, 
    ArrowRightLeft, 
    ChevronDown,
    Check,
    X,
    TrendingUp,
    TrendingDown,
    Minus,
    Clock,
    Anchor
} from 'lucide-react';

export type IGLDecisionType = 
    | 'double_callin'     // Called in anchor for 2 questions
    | 'timeout'           // Called timeout for strategy break
    | 'slot_reassignment' // Changed slot assignments
    | 'anchor_solo'       // Anchor final round decision
    | 'reveal_choice';    // Sequential vs simultaneous reveal

export interface IGLDecision {
    id: string;
    type: IGLDecisionType;
    timestamp: number;        // When decision was made
    half: 1 | 2;
    round: number;
    operation?: string;       // For slot_reassignment or double_callin
    oldPlayer?: string;       // For slot_reassignment
    newPlayer?: string;       // For slot_reassignment
    anchorName?: string;      // For double_callin / anchor_solo
    revealType?: 'sequential' | 'simultaneous'; // For reveal_choice
    anchorSoloChoice?: boolean; // true = enabled, false = disabled
    outcome?: 'success' | 'failure' | 'neutral';
    impactPoints?: number;    // Points gained/lost from decision
    description?: string;     // Human-readable description
}

interface IGLDecisionLogProps {
    decisions: IGLDecision[];
    iglName: string;
    teamName?: string;
    showImpactSummary?: boolean;
    className?: string;
}

const DECISION_ICONS: Record<IGLDecisionType, typeof Crown> = {
    double_callin: PhoneCall,
    timeout: Pause,
    slot_reassignment: ArrowRightLeft,
    anchor_solo: Anchor,
    reveal_choice: Clock,
};

const DECISION_LABELS: Record<IGLDecisionType, string> = {
    double_callin: 'Double Call-In',
    timeout: 'Timeout',
    slot_reassignment: 'Slot Reassignment',
    anchor_solo: 'Anchor Solo',
    reveal_choice: 'Reveal Choice',
};

const DECISION_COLORS: Record<IGLDecisionType, string> = {
    double_callin: 'cyan',
    timeout: 'amber',
    slot_reassignment: 'purple',
    anchor_solo: 'red',
    reveal_choice: 'green',
};

function getDecisionDescription(decision: IGLDecision): string {
    if (decision.description) return decision.description;
    
    switch (decision.type) {
        case 'double_callin':
            return `Called in ${decision.anchorName || 'Anchor'} for double questions on ${decision.operation}`;
        case 'timeout':
            return `Strategic timeout in Half ${decision.half}, Round ${decision.round}`;
        case 'slot_reassignment':
            return `Swapped ${decision.oldPlayer} → ${decision.newPlayer} on ${decision.operation}`;
        case 'anchor_solo':
            return decision.anchorSoloChoice 
                ? `Enabled Anchor Solo for ${decision.anchorName || 'Anchor'}`
                : `Disabled Anchor Solo`;
        case 'reveal_choice':
            return `Chose ${decision.revealType === 'sequential' ? 'Sequential' : 'Simultaneous'} reveal`;
        default:
            return 'Unknown decision';
    }
}

function DecisionCard({ decision, index }: { decision: IGLDecision; index: number }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const color = DECISION_COLORS[decision.type];
    const Icon = DECISION_ICONS[decision.type];
    const label = DECISION_LABELS[decision.type];

    const OutcomeIcon = decision.outcome === 'success' 
        ? Check 
        : decision.outcome === 'failure' 
            ? X 
            : Minus;
    
    const outcomeColor = decision.outcome === 'success' 
        ? 'text-green-400' 
        : decision.outcome === 'failure' 
            ? 'text-red-400' 
            : 'text-white/40';

    const ImpactIcon = (decision.impactPoints ?? 0) > 0 
        ? TrendingUp 
        : (decision.impactPoints ?? 0) < 0 
            ? TrendingDown 
            : null;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
                "border rounded-xl overflow-hidden",
                `border-${color}-500/30 bg-${color}-500/5`,
                "hover:bg-opacity-10 transition-colors cursor-pointer"
            )}
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
                borderColor: `color-mix(in srgb, ${color === 'cyan' ? '#22d3ee' : color === 'amber' ? '#fbbf24' : color === 'purple' ? '#a855f7' : color === 'red' ? '#ef4444' : '#22c55e'} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${color === 'cyan' ? '#22d3ee' : color === 'amber' ? '#fbbf24' : color === 'purple' ? '#a855f7' : color === 'red' ? '#ef4444' : '#22c55e'} 5%, transparent)`,
            }}
        >
            {/* Main Row */}
            <div className="flex items-center gap-3 p-3">
                {/* Timeline Dot */}
                <div className="flex flex-col items-center">
                    <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{
                            backgroundColor: `color-mix(in srgb, ${color === 'cyan' ? '#22d3ee' : color === 'amber' ? '#fbbf24' : color === 'purple' ? '#a855f7' : color === 'red' ? '#ef4444' : '#22c55e'} 20%, transparent)`,
                            color: color === 'cyan' ? '#22d3ee' : color === 'amber' ? '#fbbf24' : color === 'purple' ? '#a855f7' : color === 'red' ? '#ef4444' : '#22c55e',
                        }}
                    >
                        <Icon className="w-5 h-5" />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-white text-sm">
                            {label}
                        </span>
                        <span className="text-xs text-white/40">
                            H{decision.half} R{decision.round}
                        </span>
                    </div>
                    <p className="text-sm text-white/60 truncate">
                        {getDecisionDescription(decision)}
                    </p>
                </div>

                {/* Outcome */}
                <div className="flex items-center gap-2">
                    {decision.outcome && (
                        <div className={cn("flex items-center gap-1", outcomeColor)}>
                            <OutcomeIcon className="w-4 h-4" />
                        </div>
                    )}
                    {ImpactIcon && decision.impactPoints !== undefined && (
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded",
                            decision.impactPoints > 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                            <ImpactIcon className="w-3 h-3" />
                            <span className="text-xs font-bold">
                                {decision.impactPoints > 0 ? '+' : ''}{decision.impactPoints}
                            </span>
                        </div>
                    )}
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="text-white/40"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </motion.div>
                </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 pt-2 border-t border-white/10">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider block">
                                        Timing
                                    </span>
                                    <span className="text-sm font-medium text-white">
                                        Half {decision.half}, Round {decision.round}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider block">
                                        Type
                                    </span>
                                    <span className="text-sm font-medium text-white">
                                        {label}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-white/40 uppercase tracking-wider block">
                                        Result
                                    </span>
                                    <span className={cn("text-sm font-medium", outcomeColor)}>
                                        {decision.outcome === 'success' ? 'Success' : decision.outcome === 'failure' ? 'Failed' : 'Neutral'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export function IGLDecisionLog({
    decisions,
    iglName,
    teamName,
    showImpactSummary = true,
    className,
}: IGLDecisionLogProps) {
    // Calculate summary stats
    const totalImpact = decisions.reduce((sum, d) => sum + (d.impactPoints ?? 0), 0);
    const successCount = decisions.filter(d => d.outcome === 'success').length;
    const failureCount = decisions.filter(d => d.outcome === 'failure').length;
    const successRate = decisions.length > 0 
        ? ((successCount / decisions.length) * 100).toFixed(0) 
        : '0';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "bg-gradient-to-b from-amber-900/20 to-slate-900/90",
                "rounded-2xl border border-amber-500/20 overflow-hidden",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 
                                    flex items-center justify-center">
                        <Crown className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">
                            IGL Decision Log
                        </h3>
                        <p className="text-sm text-white/60">
                            {iglName} {teamName && `• ${teamName}`}
                        </p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <span className="text-2xl font-bold text-white">{decisions.length}</span>
                        <span className="text-xs text-white/40 block">Decisions</span>
                    </div>
                    <div className="text-center">
                        <span className={cn(
                            "text-2xl font-bold",
                            Number(successRate) >= 70 ? "text-green-400" : 
                            Number(successRate) >= 50 ? "text-amber-400" : "text-red-400"
                        )}>
                            {successRate}%
                        </span>
                        <span className="text-xs text-white/40 block">Success</span>
                    </div>
                </div>
            </div>

            {/* Decision List */}
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
                {decisions.length > 0 ? (
                    decisions.map((decision, index) => (
                        <DecisionCard 
                            key={decision.id} 
                            decision={decision} 
                            index={index}
                        />
                    ))
                ) : (
                    <div className="text-center py-8 text-white/40">
                        No strategic decisions recorded
                    </div>
                )}
            </div>

            {/* Impact Summary */}
            {showImpactSummary && decisions.length > 0 && (
                <div className="px-6 py-4 border-t border-white/10 bg-black/20">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-white/60">Total Impact</span>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-400" />
                                <span className="text-sm text-green-400">{successCount}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <X className="w-4 h-4 text-red-400" />
                                <span className="text-sm text-red-400">{failureCount}</span>
                            </div>
                            <div className={cn(
                                "px-3 py-1 rounded-lg font-bold",
                                totalImpact > 0 
                                    ? "bg-green-500/20 text-green-400" 
                                    : totalImpact < 0 
                                        ? "bg-red-500/20 text-red-400" 
                                        : "bg-white/10 text-white/60"
                            )}>
                                {totalImpact > 0 ? '+' : ''}{totalImpact} pts
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

