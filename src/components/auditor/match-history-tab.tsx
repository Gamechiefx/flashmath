'use client';

/**
 * Match History Tab - Displays solo (1v1) and team (5v5) matches
 * Part of the FlashAuditor panel
 * Data is fetched from PostgreSQL (source of truth for arena data)
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
    Users,
    Crown,
    Anchor,
    User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCombinedMatchHistory, type MatchHistoryEntry, type MatchReasoning, type MatchFactor } from '@/lib/actions/matchmaking';

type MatchFilter = 'all' | 'solo' | 'team';

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
    const isTeamMatch = match.matchType === 'team';

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
            {/* Match Type Badge */}
            <div className={cn(
                "px-3 py-1 flex items-center gap-2 border-b",
                isTeamMatch 
                    ? "bg-cyan-500/10 border-cyan-500/20" 
                    : "bg-purple-500/10 border-purple-500/20"
            )}>
                {isTeamMatch ? (
                    <>
                        <Users className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">5v5 Team</span>
                        {match.wasIgl && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                                <Crown className="w-3 h-3" /> IGL
                            </span>
                        )}
                        {match.wasAnchor && (
                            <span className="flex items-center gap-0.5 text-[10px] text-cyan-400">
                                <Anchor className="w-3 h-3" /> Anchor
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <User className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">1v1 Duel</span>
                    </>
                )}
            </div>

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
                            {isTeamMatch ? (
                                <span className="font-bold text-foreground truncate">
                                    {match.myTeamName} vs {match.opponentTeamName}
                                </span>
                            ) : (
                                <span className="font-bold text-foreground truncate">
                                    vs {match.opponentName}
                                </span>
                            )}
                            {match.isAiMatch && (
                                <Bot className="w-3 h-3 text-purple-400 shrink-0" />
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{opIcon}</span>
                            <span className="font-bold">{match.playerScore} - {match.opponentScore}</span>
                            {isTeamMatch && match.myPlayerScore !== undefined && (
                                <>
                                    <span>•</span>
                                    <span className="text-primary">You: {match.myPlayerScore}</span>
                                </>
                            )}
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
    const [allMatches, setAllMatches] = useState<MatchHistoryEntry[]>([]);
    const [soloMatches, setSoloMatches] = useState<MatchHistoryEntry[]>([]);
    const [teamMatches, setTeamMatches] = useState<MatchHistoryEntry[]>([]);
    const [filter, setFilter] = useState<MatchFilter>('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadHistory() {
            setIsLoading(true);
            setError(null);
            try {
                const result = await getCombinedMatchHistory(15);
                if (result.error) {
                    setError(result.error);
                } else {
                    setAllMatches(result.allMatches);
                    setSoloMatches(result.soloMatches);
                    setTeamMatches(result.teamMatches);
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

    // Get matches based on current filter
    const displayedMatches = filter === 'all' 
        ? allMatches 
        : filter === 'solo' 
            ? soloMatches 
            : teamMatches;

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

    if (allMatches.length === 0) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                <Swords className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold">No matches yet</p>
                <p className="text-sm mt-1">Play arena matches to see your history</p>
            </div>
        );
    }

    // Calculate stats based on displayed matches
    const wins = displayedMatches.filter(m => m.isWin && !m.isDraw).length;
    const losses = displayedMatches.filter(m => !m.isWin && !m.isDraw).length;
    const draws = displayedMatches.filter(m => m.isDraw).length;
    const totalEloChange = displayedMatches.reduce((sum, m) => sum + m.eloChange, 0);
    const totalCoins = displayedMatches.reduce((sum, m) => sum + (m.coinsEarned || 0), 0);
    const voidedMatches = displayedMatches.filter(m => m.isVoid).length;
    const avgQuality = displayedMatches
        .filter(m => m.matchReasoning)
        .reduce((sum, m) => sum + (m.matchReasoning?.qualityScore || 0), 0) / 
        (displayedMatches.filter(m => m.matchReasoning).length || 1);

    return (
        <div className="space-y-4">
            {/* Match Type Filter */}
            <div className="flex items-center gap-2 p-1 rounded-lg bg-foreground/5 border border-[var(--glass-border)]">
                <button
                    onClick={() => setFilter('all')}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                        filter === 'all' 
                            ? "bg-primary text-primary-foreground" 
                            : "text-muted-foreground hover:bg-foreground/5"
                    )}
                >
                    All ({allMatches.length})
                </button>
                <button
                    onClick={() => setFilter('solo')}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1",
                        filter === 'solo' 
                            ? "bg-purple-500 text-white" 
                            : "text-muted-foreground hover:bg-foreground/5"
                    )}
                >
                    <User className="w-3 h-3" />
                    1v1 ({soloMatches.length})
                </button>
                <button
                    onClick={() => setFilter('team')}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1",
                        filter === 'team' 
                            ? "bg-cyan-500 text-white" 
                            : "text-muted-foreground hover:bg-foreground/5"
                    )}
                >
                    <Users className="w-3 h-3" />
                    5v5 ({teamMatches.length})
                </button>
            </div>

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
                <span>
                    {filter === 'all' && `Last ${displayedMatches.length} Matches`}
                    {filter === 'solo' && `${displayedMatches.length} Solo Matches`}
                    {filter === 'team' && `${displayedMatches.length} Team Matches`}
                </span>
            </div>

            {/* Empty State for Filtered View */}
            {displayedMatches.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    <Swords className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-sm">
                        No {filter === 'solo' ? '1v1' : filter === 'team' ? '5v5' : ''} matches yet
                    </p>
                    <p className="text-xs mt-1">
                        {filter === 'solo' && 'Play solo arena matches to see them here'}
                        {filter === 'team' && 'Play team arena matches to see them here'}
                    </p>
                </div>
            )}

            {/* Match Cards */}
            <div className="space-y-2">
                {displayedMatches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>
        </div>
    );
}

