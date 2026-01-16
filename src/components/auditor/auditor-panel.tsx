'use client';

/**
 * FlashAuditor Panel - Slide-out panel for confidence analysis and decay status
 * Slides in from the left side of the screen (opposite of social panel)
 * Now with tabs: Confidence and Match History
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Zap,
    Activity,
    Calendar,
    Clock,
    TrendingDown,
    AlertTriangle,
    CheckCircle2,
    Target,
    Info,
    RefreshCw,
    Loader2,
    BarChart3,
    Award,
    Flame,
    Shield,
    History,
    Sparkles,
} from 'lucide-react';
import { useAuditor } from './auditor-provider';
import { MatchHistoryTab } from './match-history-tab';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type AuditorTab = 'confidence' | 'history';

// =============================================================================
// HELPERS
// =============================================================================

function getConfidenceColor(value: number): string {
    if (value >= 0.8) return 'text-emerald-400';
    if (value >= 0.6) return 'text-green-400';
    if (value >= 0.4) return 'text-yellow-400';
    if (value >= 0.2) return 'text-orange-400';
    return 'text-red-400';
}

function getConfidenceBgColor(value: number): string {
    if (value >= 0.8) return 'bg-emerald-500';
    if (value >= 0.6) return 'bg-green-500';
    if (value >= 0.4) return 'bg-yellow-500';
    if (value >= 0.2) return 'bg-orange-500';
    return 'bg-red-500';
}

function getBracketStyle(bracket: string): { bg: string; text: string; border: string } {
    switch (bracket) {
        case 'ESTABLISHED':
            return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
        case 'DEVELOPING':
            return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' };
        default:
            return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' };
    }
}

function getDecayPhaseStyle(phase: string): { bg: string; text: string; border: string; icon: typeof CheckCircle2 } {
    switch (phase) {
        case 'active':
            return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: CheckCircle2 };
        case 'warning':
            return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle };
        case 'decaying':
            return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', icon: TrendingDown };
        case 'severe':
            return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: AlertTriangle };
        case 'returning':
            return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', icon: Activity };
        default:
            return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', icon: Info };
    }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatCard({ 
    icon: Icon, 
    label, 
    value, 
    subValue, 
    color 
}: { 
    icon: typeof Activity; 
    label: string; 
    value: string | number; 
    subValue?: string; 
    color: string;
}) {
    return (
        <div className="p-3 rounded-xl bg-foreground/5 border border-[var(--glass-border)]">
            <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('w-4 h-4', color)} />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-xl font-black text-foreground">{value}</div>
            {subValue && <div className="text-xs text-muted-foreground/70 mt-0.5">{subValue}</div>}
        </div>
    );
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
    const percentage = Math.round(value * 100);
    
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-bold', getConfidenceColor(value))}>{percentage}%</span>
            </div>
            <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={cn('h-full rounded-full', color)}
                />
            </div>
        </div>
    );
}

function PlacementProgress({ required, completed, onPlayClick }: { required: number; completed: number; onPlayClick?: () => void }) {
    const remaining = required - completed;
    
    return (
        <div className="p-4 rounded-xl bg-gradient-to-br from-accent/20 to-primary/20 border border-accent/30">
            <div className="flex items-center gap-2 mb-3">
                <Activity className="w-5 h-5 text-accent" />
                <span className="font-bold text-accent">Placement Matches</span>
            </div>
            
            <p className="text-sm text-foreground/70 mb-3">
                Complete {remaining} more match{remaining !== 1 ? 'es' : ''} to recalibrate your rank
            </p>
            
            <div className="flex gap-2">
                {Array.from({ length: required }).map((_, i) => (
                    <motion.div
                        key={i}
                        className={cn(
                            'flex-1 h-3 rounded-full',
                            i < completed ? 'bg-accent' : 'bg-foreground/10'
                        )}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                    />
                ))}
            </div>
            
            <p className="text-xs text-accent/60 mt-2">
                ELO gains/losses are doubled during placement
            </p>
            
            <Link href="/arena/modes" onClick={onPlayClick}>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-3 w-full py-2.5 rounded-xl bg-accent/20 border border-accent/30
                        text-accent text-sm font-bold hover:bg-accent/30 transition-colors"
                >
                    Play Now
                </motion.button>
            </Link>
        </div>
    );
}

// =============================================================================
// MAIN PANEL COMPONENT
// =============================================================================

export function AuditorPanel() {
    const { isPanelOpen, closePanel, stats, isLoading, refreshStats, hasWarning } = useAuditor();
    const [activeTab, setActiveTab] = useState<AuditorTab>('confidence');

    return (
        <AnimatePresence>
            {isPanelOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closePanel}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                    />
                    
                    {/* Panel - Slides from LEFT (opposite of social panel) */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed left-0 top-0 h-full w-full sm:w-[420px] bg-[var(--glass-bg)] backdrop-blur-xl
                            border-r border-[var(--glass-border)] shadow-2xl z-50 flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-[var(--glass-border)] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="p-2 rounded-xl bg-primary/20 border border-primary/30">
                                        <Zap className="w-5 h-5 text-primary" />
                                    </div>
                                    {hasWarning && (
                                        <motion.div
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 border-2 border-background"
                                        />
                                    )}
                                </div>
                                <div>
                                    <h2 className="font-black text-foreground tracking-tight">FlashAuditor</h2>
                                    <p className="text-xs text-muted-foreground">Confidence & Performance Analysis</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => refreshStats()}
                                    disabled={isLoading}
                                    className="p-2 rounded-xl hover:bg-foreground/5 transition-colors"
                                >
                                    <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isLoading && 'animate-spin')} />
                                </button>
                                <button
                                    onClick={closePanel}
                                    className="p-2 rounded-xl hover:bg-foreground/5 transition-colors"
                                >
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            </div>
                        </div>

                        {/* Tab Navigation */}
                        <div className="flex border-b border-[var(--glass-border)] shrink-0">
                            <button
                                onClick={() => setActiveTab('confidence')}
                                className={cn(
                                    'flex-1 py-3 px-4 text-sm font-medium transition-all flex items-center justify-center gap-2',
                                    activeTab === 'confidence'
                                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                                )}
                            >
                                <Sparkles className="w-4 h-4" />
                                Confidence
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={cn(
                                    'flex-1 py-3 px-4 text-sm font-medium transition-all flex items-center justify-center gap-2',
                                    activeTab === 'history'
                                        ? 'text-primary border-b-2 border-primary bg-primary/5'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                                )}
                            >
                                <History className="w-4 h-4" />
                                Match History
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            <AnimatePresence mode="wait">
                                {activeTab === 'confidence' ? (
                                    <motion.div
                                        key="confidence"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4"
                                    >
                            {isLoading && !stats ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                </div>
                            ) : stats ? (
                                <>
                                    {/* Overall Confidence Score */}
                                    <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 
                                        border border-primary/20 text-center relative overflow-hidden">
                                        {/* Background glow */}
                                        <div className="absolute inset-0 bg-gradient-radial from-primary/10 to-transparent opacity-50" />
                                        
                                        <div className="relative">
                                            <div className="text-sm text-primary/80 font-medium mb-1">
                                                Practice Confidence
                                            </div>
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: 'spring', damping: 10 }}
                                                className={cn(
                                                    'text-6xl font-black',
                                                    getConfidenceColor(stats.confidence.overall)
                                                )}
                                            >
                                                {Math.round(stats.confidence.overall * 100)}%
                                            </motion.div>
                                            
                                            {/* Bracket Badge */}
                                            <div className={cn(
                                                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border mt-3',
                                                getBracketStyle(stats.confidence.bracket).bg,
                                                getBracketStyle(stats.confidence.bracket).text,
                                                getBracketStyle(stats.confidence.bracket).border
                                            )}>
                                                <Award className="w-4 h-4" />
                                                <span className="text-sm font-bold">{stats.confidence.bracket}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Decay Status */}
                                    {stats.decay.phase !== 'active' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={cn(
                                                'p-4 rounded-xl border',
                                                getDecayPhaseStyle(stats.decay.phase).bg,
                                                getDecayPhaseStyle(stats.decay.phase).border
                                            )}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                {(() => {
                                                    const Icon = getDecayPhaseStyle(stats.decay.phase).icon;
                                                    return <Icon className={cn('w-5 h-5', getDecayPhaseStyle(stats.decay.phase).text)} />;
                                                })()}
                                                <span className={cn('font-bold', getDecayPhaseStyle(stats.decay.phase).text)}>
                                                    {stats.decay.phaseLabel}
                                                </span>
                                            </div>
                                            
                                            {stats.decay.phase !== 'returning' && (
                                                <>
                                                    <p className="text-sm text-foreground/70">
                                                        {stats.decay.phase === 'warning' && `Play within ${stats.decay.daysUntilNextPhase} days to prevent decay`}
                                                        {stats.decay.phase === 'decaying' && `You're losing ELO daily. Play to stop decay!`}
                                                        {stats.decay.phase === 'severe' && `Your rank is dropping fast!`}
                                                    </p>
                                                    {stats.decay.eloAtRisk > 0 && (
                                                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                            <TrendingDown className="w-3 h-3" />
                                                            <span>{stats.decay.eloAtRisk} ELO at risk in next 7 days</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </motion.div>
                                    )}

                                    {/* Returning Player Placement */}
                                    {stats.decay.isReturningPlayer && stats.decay.placementMatchesCompleted < stats.decay.placementMatchesRequired && (
                                        <PlacementProgress
                                            required={stats.decay.placementMatchesRequired}
                                            completed={stats.decay.placementMatchesCompleted}
                                            onPlayClick={closePanel}
                                        />
                                    )}

                                    {/* Confidence Breakdown */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4" />
                                            Confidence Breakdown
                                        </h3>
                                        
                                        <div className="p-4 rounded-xl bg-foreground/5 border border-[var(--glass-border)] space-y-4">
                                            <ProgressBar
                                                value={stats.confidence.volume}
                                                color={getConfidenceBgColor(stats.confidence.volume)}
                                                label="📊 Volume (40%)"
                                            />
                                            <ProgressBar
                                                value={stats.confidence.consistency}
                                                color={getConfidenceBgColor(stats.confidence.consistency)}
                                                label="📅 Consistency (30%)"
                                            />
                                            <ProgressBar
                                                value={stats.confidence.recency}
                                                color={getConfidenceBgColor(stats.confidence.recency)}
                                                label="⏱️ Recency (30%)"
                                            />
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <StatCard
                                            icon={Activity}
                                            label="Sessions"
                                            value={stats.confidence.totalSessions}
                                            subValue="total practice"
                                            color="text-blue-400"
                                        />
                                        <StatCard
                                            icon={Calendar}
                                            label="Per Week"
                                            value={stats.confidence.sessionsPerWeek.toFixed(1)}
                                            subValue="avg sessions"
                                            color="text-green-400"
                                        />
                                        <StatCard
                                            icon={Clock}
                                            label="Last Practice"
                                            value={stats.confidence.daysSinceLastPractice === 0 ? 'Today' : 
                                                   stats.confidence.daysSinceLastPractice === -1 ? 'Never' :
                                                   `${stats.confidence.daysSinceLastPractice}d ago`}
                                            color="text-purple-400"
                                        />
                                        <StatCard
                                            icon={stats.decay.phase === 'active' ? Shield : AlertTriangle}
                                            label="Status"
                                            value={stats.decay.phaseLabel}
                                            subValue={stats.decay.phase === 'active' ? 'No decay' : `${stats.decay.eloAtRisk} at risk`}
                                            color={stats.decay.phase === 'active' ? 'text-emerald-400' : 'text-yellow-400'}
                                        />
                                    </div>

                                    {/* Tips Section */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                            <Target className="w-4 h-4" />
                                            Improvement Tips
                                        </h3>
                                        
                                        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                                            {stats.confidence.volume < 0.7 && stats.confidence.totalSessions < 50 && (
                                                <TipItem text={`Practice ${50 - stats.confidence.totalSessions} more sessions to max volume`} />
                                            )}
                                            {stats.confidence.consistency < 0.7 && (
                                                <TipItem text="Practice more regularly for higher consistency" />
                                            )}
                                            {stats.confidence.recency < 1 && stats.confidence.daysSinceLastPractice > 0 && (
                                                <TipItem text="Practice today to maintain your recency score" />
                                            )}
                                            {stats.decay.phase === 'warning' && (
                                                <TipItem text={`Play arena within ${stats.decay.daysUntilNextPhase} days to prevent decay`} highlight />
                                            )}
                                            {stats.confidence.overall >= 0.7 && stats.decay.phase === 'active' && (
                                                <TipItem text="Great job! Keep up your practice routine 🎉" success />
                                            )}
                                        </div>
                                    </div>

                                    {/* Matchmaking Info */}
                                    <div className="p-4 rounded-xl bg-foreground/5 border border-[var(--glass-border)]">
                                        <div className="flex items-center gap-2 text-foreground/70 text-sm">
                                            <Info className="w-4 h-4 text-primary" />
                                            <span>
                                                {stats.confidence.bracket === 'NEWCOMER' 
                                                    ? "You'll be matched with other new players for fair matches"
                                                    : stats.confidence.bracket === 'ESTABLISHED'
                                                        ? "You're in the quality matchmaking pool"
                                                        : "Building practice history for better matchmaking"
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-20 text-muted-foreground">
                                    <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>Unable to load stats</p>
                                </div>
                            )}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="history"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <MatchHistoryTab />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer CTA */}
                        <div className="p-4 border-t border-[var(--glass-border)] shrink-0">
                            <Link href="/practice" onClick={closePanel}>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-accent
                                        text-primary-foreground font-bold text-sm shadow-lg hover:shadow-[var(--accent-glow)] transition-all
                                        flex items-center justify-center gap-2"
                                >
                                    <Flame className="w-4 h-4" />
                                    Boost Confidence - Practice Now
                                </motion.button>
                            </Link>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

function TipItem({ text, highlight, success }: { text: string; highlight?: boolean; success?: boolean }) {
    return (
        <div className={cn(
            'flex items-start gap-2 text-sm',
            highlight && 'text-yellow-300',
            success && 'text-emerald-300',
            !highlight && !success && 'text-foreground/70'
        )}>
            <Target className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary" />
            <span>{text}</span>
        </div>
    );
}

