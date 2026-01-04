'use client';

/**
 * Match History Tab - Displays last 10 matches with expandable reasoning cards
 * Part of the FlashAuditor panel
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronDown,
    ChevronUp,
    Trophy,
    X as XIcon,
    Clock,
    Target,
    Zap,
    Bot,
    TrendingUp,
    TrendingDown,
    Minus,
    Loader2,
    History,
    Swords,
    Wifi,
    WifiOff,
    AlertTriangle,
    Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMatchHistory, type MatchHistoryEntry, type MatchReasoning, type MatchFactor } from '@/lib/actions/matchmaking';

// =============================================================================
// OPERATION LABELS
// =============================================================================

const OPERATION_ICONS: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

// =============================================================================
// QUALITY SCORE HELPERS
// =============================================================================

function getQualityLabel(score: number): { label: string; color: string; bg: string } {
    if (score >= 90) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-500' };
    if (score >= 75) return { label: 'Good', color: 'text-green-400', bg: 'bg-green-500' };
    if (score >= 60) return { label: 'Fair', color: 'text-yellow-400', bg: 'bg-yellow-500' };
    if (score >= 40) return { label: 'Okay', color: 'text-orange-400', bg: 'bg-orange-500' };
    return { label: 'Poor', color: 'text-red-400', bg: 'bg-red-500' };
}

function getImpactIcon(impact: MatchFactor['impact']) {
    switch (impact) {
        case 'positive':
            return <TrendingUp className="w-3 h-3 text-emerald-400" />;
        case 'negative':
            return <TrendingDown className="w-3 h-3 text-red-400" />;
        default:
            return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
}

function getImpactColor(impact: MatchFactor['impact']): string {
    switch (impact) {
        case 'positive':
            return 'border-emerald-500/30 bg-emerald-500/10';
        case 'negative':
            return 'border-red-500/30 bg-red-500/10';
        default:
            return 'border-[var(--glass-border)] bg-foreground/5';
    }
}

// Connection quality helpers
function getConnectionQualityStyle(quality?: string): { icon: React.ReactNode; color: string; bg: string; label: string } {
    switch (quality) {
        case 'GREEN':
            return {
                icon: <Wifi className="w-3 h-3" />,
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10 border-emerald-500/20',
                label: 'Stable'
            };
        case 'YELLOW':
            return {
                icon: <AlertTriangle className="w-3 h-3" />,
                color: 'text-amber-400',
                bg: 'bg-amber-500/10 border-amber-500/20',
                label: 'Unstable'
            };
        case 'RED':
            return {
                icon: <WifiOff className="w-3 h-3" />,
                color: 'text-red-400',
                bg: 'bg-red-500/10 border-red-500/20',
                label: 'Poor'
            };
        default:
            return {
                icon: <Wifi className="w-3 h-3" />,
                color: 'text-muted-foreground',
                bg: 'bg-foreground/5 border-foreground/10',
                label: 'Unknown'
            };
    }
}

// =============================================================================
// MATCH CARD COMPONENT
// =============================================================================

function MatchCard({ match }: { match: MatchHistoryEntry }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const quality = match.matchReasoning ? getQualityLabel(match.matchReasoning.qualityScore) : null;
    const opIcon = OPERATION_ICONS[match.operation] || '?';
    const connectionStyle = getConnectionQualityStyle(match.connectionQuality);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "rounded-xl border overflow-hidden cursor-pointer transition-all",
                match.isVoid
                    ? "border-orange-500/30 bg-orange-500/5"
                    : match.isDraw 
                        ? "border-amber-500/30 bg-amber-500/5"
                        : match.isWin 
                            ? "border-emerald-500/30 bg-emerald-500/5" 
                            : "border-red-500/30 bg-red-500/5",
                isExpanded && "ring-1 ring-primary/30"
            )}
                onClick={() => setIsExpanded(!isExpanded)}
        >
            {/* Void Warning Banner */}
            {match.isVoid && (
                <div className="px-3 py-2 bg-orange-500/20 border-b border-orange-500/30 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-orange-400">VOIDED MATCH</span>
                    <span className="text-xs text-orange-400/70">- No ELO awarded</span>
                </div>
            )}

            {/* Header */}
            <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Result Icon */}
                    <div className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                        match.isVoid
                            ? 'bg-orange-500/20 border border-orange-500/30'
                            : match.isDraw
                                ? 'bg-amber-500/20 border border-amber-500/30'
                                : match.isWin
                            ? 'bg-emerald-500/20 border border-emerald-500/30'
                            : 'bg-red-500/20 border border-red-500/30'
                    )}>
                        {match.isVoid
                            ? <AlertTriangle className="w-5 h-5 text-orange-400" />
                            : match.isDraw 
                                ? <span className="text-amber-400 font-bold text-sm">TIE</span>
                                : match.isWin 
                            ? <Trophy className="w-5 h-5 text-emerald-400" />
                            : <XIcon className="w-5 h-5 text-red-400" />
                        }
                    </div>

                    {/* Match Info */}
                    <div className="text-left min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground truncate">
                                vs {match.opponentName}
                            </span>
                            {match.isAiMatch && (
                                <Bot className="w-3 h-3 text-purple-400 shrink-0" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{opIcon}</span>
                            <span className="font-bold">{match.playerScore} - {match.opponentScore}</span>
                            <span>•</span>
                            <span>{match.timeAgo}</span>
                        </div>
                    </div>
                </div>

                {/* Right Side - Coins, ELO Change & Expand */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Coins Earned */}
                    {match.coinsEarned !== undefined && match.coinsEarned > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-bold">
                            <Coins className="w-3 h-3" />
                            <span>+{match.coinsEarned}</span>
                        </div>
                    )}

                    {/* ELO Change */}
                    <div className={cn(
                        'px-2 py-1 rounded-lg font-bold text-sm min-w-[50px] text-center',
                        match.isVoid
                            ? 'bg-orange-500/20 text-orange-400'
                            : match.eloChange > 0 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : match.eloChange < 0
                                ? 'bg-red-500/20 text-red-400'
                                    : 'bg-foreground/10 text-muted-foreground'
                    )}>
                        {match.isVoid ? 'VOID' : (match.eloChange > 0 ? '+' : '') + match.eloChange}
                    </div>

                    {/* Expand Icon with animation */}
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn(
                            "p-1 rounded-full",
                            isExpanded ? "bg-primary/20" : "bg-foreground/5"
                        )}
                    >
                        <ChevronDown className={cn(
                            "w-4 h-4",
                            isExpanded ? "text-primary" : "text-muted-foreground"
                        )} />
                    </motion.div>
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-2 space-y-3 border-t border-[var(--glass-border)] mt-1">
                            {/* Connection Quality & Void Reason */}
                            {(match.connectionQuality || match.isVoid) && (
                                <div className="space-y-2">
                                    {/* Connection Quality */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Connection</span>
                                        <div className={cn(
                                            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border',
                                            connectionStyle.bg, connectionStyle.color
                                        )}>
                                            {connectionStyle.icon}
                                            <span>{connectionStyle.label}</span>
                                        </div>
                            </div>

                                    {/* Void Reason Explanation */}
                                    {match.isVoid && match.voidReason && (
                                        <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                                <div className="text-xs">
                                                    <p className="font-bold text-orange-400">Why was this match voided?</p>
                                                    <p className="text-orange-400/70 mt-1">{match.voidReason}</p>
                                                    <p className="text-muted-foreground mt-1">
                                                        Connection quality fell below acceptable thresholds. 
                                                        ELO was not affected to ensure fair ranking.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Coins Earned Detail */}
                                    {match.coinsEarned !== undefined && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Coins Earned</span>
                                            <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm">
                                                <Coins className="w-4 h-4" />
                                                <span>+{match.coinsEarned}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Match Quality */}
                            {match.matchReasoning && (
                                <>
                                    {/* Quality Bar */}
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground w-20">Match Quality</span>
                                        <div className="flex-1 h-2 bg-foreground/10 rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${match.matchReasoning.qualityScore}%` }}
                                                transition={{ duration: 0.5, ease: "easeOut" }}
                                                    className={cn('h-full rounded-full', quality?.bg)}
                                                />
                                        </div>
                                        <span className={cn('text-xs font-bold min-w-[60px] text-right', quality?.color)}>
                                            {match.matchReasoning.qualityScore}% {quality?.label}
                                        </span>
                                    </div>

                                    {/* Key Factors - Compact horizontal list */}
                                    {match.matchReasoning.factors.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {match.matchReasoning.factors.slice(0, 4).map((factor, idx) => (
                                                <div 
                                                    key={idx}
                                                    className={cn(
                                                        'flex items-center gap-1 px-2 py-1 rounded-md text-[10px]',
                                                        factor.impact === 'positive' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                                                        factor.impact === 'negative' && 'bg-red-500/10 text-red-400 border border-red-500/20',
                                                        factor.impact === 'neutral' && 'bg-foreground/5 text-muted-foreground border border-foreground/10'
                                                    )}
                                                >
                                                        {getImpactIcon(factor.impact)}
                                                    <span className="font-medium">{factor.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* ELO Difference if significant */}
                                    {Math.abs(match.matchReasoning.eloDiff) > 50 && (
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                            <Zap className="w-3 h-3" />
                                            <span>ELO difference: {match.matchReasoning.eloDiff} pts</span>
                                    </div>
                                    )}
                                </>
                            )}

                            {/* No reasoning available - Simplified message */}
                            {!match.matchReasoning && !match.connectionQuality && !match.isVoid && (
                                <div className="flex items-center gap-2 py-2 text-muted-foreground/60 text-xs">
                                    <Target className="w-4 h-4 opacity-50" />
                                    <span>Detailed match data not available for older matches</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// =============================================================================
// MAIN MATCH HISTORY TAB
// =============================================================================

export function MatchHistoryTab() {
    const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadHistory() {
            setIsLoading(true);
            setError(null);
            try {
                const result = await getMatchHistory(10);
                if (result.error) {
                    setError(result.error);
                } else {
                    setMatches(result.matches);
                }
            } catch (err) {
                setError('Failed to load match history');
                console.error('[MatchHistory] Load error:', err);
            } finally {
                setIsLoading(false);
            }
        }

        loadHistory();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                <XIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{error}</p>
            </div>
        );
    }

    if (matches.length === 0) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold">No matches yet</p>
                <p className="text-sm mt-1">Play arena matches to see your history</p>
            </div>
        );
    }

    // Calculate stats
    const wins = matches.filter(m => m.isWin && !m.isDraw).length;
    const losses = matches.filter(m => !m.isWin && !m.isDraw).length;
    const draws = matches.filter(m => m.isDraw).length;
    const totalEloChange = matches.reduce((sum, m) => sum + m.eloChange, 0);
    const totalCoins = matches.reduce((sum, m) => sum + (m.coinsEarned || 0), 0);
    const voidedMatches = matches.filter(m => m.isVoid).length;
    const avgQuality = matches
        .filter(m => m.matchReasoning)
        .reduce((sum, m) => sum + (m.matchReasoning?.qualityScore || 0), 0) / 
        (matches.filter(m => m.matchReasoning).length || 1);

    return (
        <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-foreground/5 border border-[var(--glass-border)] text-center">
                    <div className="text-lg font-black text-emerald-400">{wins}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wins</div>
                </div>
                <div className="p-3 rounded-xl bg-foreground/5 border border-[var(--glass-border)] text-center">
                    <div className="text-lg font-black text-red-400">{losses}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Losses</div>
                </div>
                <div className="p-3 rounded-xl bg-foreground/5 border border-[var(--glass-border)] text-center">
                    <div className={cn(
                        'text-lg font-black',
                        totalEloChange > 0 ? 'text-emerald-400' : 
                        totalEloChange < 0 ? 'text-red-400' : 'text-muted-foreground'
                    )}>
                        {totalEloChange > 0 ? '+' : ''}{totalEloChange}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Net ELO</div>
                </div>
                <div className="p-3 rounded-xl bg-foreground/5 border border-[var(--glass-border)] text-center">
                    <div className="text-lg font-black text-yellow-400">+{totalCoins}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Coins</div>
                </div>
            </div>

            {/* Voided Matches Warning */}
            {voidedMatches > 0 && (
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                    <div className="text-sm">
                        <span className="font-bold text-orange-400">{voidedMatches} voided match{voidedMatches > 1 ? 'es' : ''}</span>
                        <span className="text-orange-400/70"> - Connection quality issues prevented ELO changes</span>
                    </div>
                </div>
            )}

            {/* Average Match Quality */}
            {avgQuality > 0 && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-primary">
                            <Target className="w-4 h-4" />
                            <span>Avg Match Quality</span>
                        </div>
                        <span className={cn('font-bold', getQualityLabel(avgQuality).color)}>
                            {Math.round(avgQuality)}%
                        </span>
                    </div>
                </div>
            )}

            {/* Match List Header */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <History className="w-4 h-4" />
                <span>Last {matches.length} Matches</span>
            </div>

            {/* Match Cards */}
            <div className="space-y-2">
                {matches.map((match, index) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>
        </div>
    );
}

