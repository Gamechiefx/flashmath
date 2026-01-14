'use client';

/**
 * ScoutingDashboard
 * 
 * Pre-match opponent intelligence display.
 * Shows opponent team stats, player strengths/weaknesses, and recent performance.
 * 
 * Displays during:
 * - Pre-match strategy phase
 * - Halftime (for second half adjustments)
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Eye, 
    TrendingUp, 
    TrendingDown, 
    Target, 
    Clock, 
    Zap,
    Shield,
    Crown,
    Anchor,
    AlertTriangle,
    ThumbsUp,
    ThumbsDown
} from 'lucide-react';

export interface OpponentPlayerStats {
    playerId: string;
    name: string;
    elo: number;
    accuracy: number;
    avgResponseTime: number;
    strongOperations: string[];
    weakOperations: string[];
    recentForm: 'hot' | 'neutral' | 'cold';
    isIgl?: boolean;
    isAnchor?: boolean;
}

export interface OpponentTeamStats {
    teamName: string;
    avgElo: number;
    winRate: number;
    recentMatches: Array<{
        result: 'win' | 'loss' | 'draw';
        score: string;
        daysAgo: number;
    }>;
    players: OpponentPlayerStats[];
    teamStrengths: string[];
    teamWeaknesses: string[];
}

interface ScoutingDashboardProps {
    opponent: OpponentTeamStats;
    ourTeamElo?: number;
    className?: string;
    compact?: boolean;
}

const operationLabels: Record<string, string> = {
    addition: 'Add',
    subtraction: 'Sub',
    multiplication: 'Mul',
    division: 'Div',
    mixed: 'Mix',
};

const operationSymbols: Record<string, string> = {
    addition: '+',
    subtraction: '−',
    multiplication: '×',
    division: '÷',
    mixed: '?',
};

function FormBadge({ form }: { form: 'hot' | 'neutral' | 'cold' }) {
    const styles = {
        hot: { bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'text-rose-400', icon: '🔥' },
        neutral: { bg: 'bg-white/10', border: 'border-white/20', text: 'text-white/60', icon: '➖' },
        cold: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', icon: '❄️' },
    };
    const s = styles[form];
    
    return (
        <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] border",
            s.bg, s.border, s.text
        )}>
            {s.icon}
        </span>
    );
}

function PlayerCard({ player, compact }: { player: OpponentPlayerStats; compact?: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "p-3 rounded-xl bg-white/5 border border-white/10",
                "hover:border-white/20 transition-all"
            )}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-white">
                        {player.name}
                    </span>
                    {player.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                    {player.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                    <FormBadge form={player.recentForm} />
                </div>
                <span className="text-xs text-white/50">
                    {player.elo} ELO
                </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-400" />
                    <span className="text-white/70">{player.accuracy}%</span>
                </div>
                <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span className="text-white/70">{player.avgResponseTime}s</span>
                </div>
            </div>
            
            {!compact && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {player.strongOperations.map(op => (
                        <span key={op} className="px-1.5 py-0.5 rounded bg-emerald-500/20 
                                                   text-emerald-400 text-[10px] flex items-center gap-0.5">
                            <ThumbsUp className="w-2 h-2" />
                            {operationSymbols[op]}
                        </span>
                    ))}
                    {player.weakOperations.map(op => (
                        <span key={op} className="px-1.5 py-0.5 rounded bg-rose-500/20 
                                                   text-rose-400 text-[10px] flex items-center gap-0.5">
                            <ThumbsDown className="w-2 h-2" />
                            {operationSymbols[op]}
                        </span>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

function RecentMatchBadge({ result, score, daysAgo }: { result: 'win' | 'loss' | 'draw'; score: string; daysAgo: number }) {
    const colors = {
        win: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
        loss: 'bg-rose-500/20 border-rose-500/50 text-rose-400',
        draw: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
    };
    
    return (
        <div className={cn(
            "px-2 py-1 rounded border text-[10px] text-center",
            colors[result]
        )}>
            <div className="font-bold">{result.toUpperCase()}</div>
            <div className="text-white/50">{score}</div>
        </div>
    );
}

export function ScoutingDashboard({
    opponent,
    ourTeamElo,
    className,
    compact = false,
}: ScoutingDashboardProps) {
    const eloAdvantage = ourTeamElo ? ourTeamElo - opponent.avgElo : 0;
    const eloAdvantageText = eloAdvantage > 0 
        ? `+${eloAdvantage} ELO advantage` 
        : eloAdvantage < 0 
            ? `${eloAdvantage} ELO deficit`
            : 'Even ELO';

    return (
        <div className={cn(
            "rounded-xl border border-white/10 overflow-hidden",
            "bg-gradient-to-b from-slate-800/50 to-slate-900/50",
            className
        )}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border-b border-white/10">
                <Eye className="w-5 h-5 text-rose-400" />
                <span className="font-bold text-rose-400">Opponent Scouting</span>
                <span className="text-xs text-white/50 ml-auto">Intel Report</span>
            </div>
            
            <div className="p-4 space-y-4">
                {/* Team Overview */}
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-lg text-white">{opponent.teamName}</h3>
                        <p className="text-sm text-white/50">
                            Avg. {opponent.avgElo} ELO • {(opponent.winRate * 100).toFixed(0)}% WR
                        </p>
                    </div>
                    <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium border",
                        eloAdvantage > 50 && "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
                        eloAdvantage < -50 && "bg-rose-500/20 border-rose-500/50 text-rose-400",
                        Math.abs(eloAdvantage) <= 50 && "bg-white/10 border-white/20 text-white/60"
                    )}>
                        {eloAdvantage > 0 && <TrendingUp className="w-3 h-3 inline mr-1" />}
                        {eloAdvantage < 0 && <TrendingDown className="w-3 h-3 inline mr-1" />}
                        {eloAdvantageText}
                    </div>
                </div>
                
                {/* Recent Matches */}
                {!compact && opponent.recentMatches.length > 0 && (
                    <div>
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                            Recent Form
                        </h4>
                        <div className="flex gap-2">
                            {opponent.recentMatches.slice(0, 5).map((match, i) => (
                                <RecentMatchBadge key={i} {...match} />
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Team Insights */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Strengths */}
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-1 mb-2">
                            <Shield className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs font-semibold text-emerald-400">Strengths</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {opponent.teamStrengths.map((s, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/20 
                                                          text-emerald-300 text-[10px]">
                                    {operationSymbols[s] || s}
                                </span>
                            ))}
                        </div>
                    </div>
                    
                    {/* Weaknesses */}
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                        <div className="flex items-center gap-1 mb-2">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span className="text-xs font-semibold text-rose-400">Weaknesses</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {opponent.teamWeaknesses.map((w, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-rose-500/20 
                                                          text-rose-300 text-[10px]">
                                    {operationSymbols[w] || w}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Player Cards */}
                {!compact && (
                    <div>
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                            Enemy Roster ({opponent.players.length})
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {opponent.players.map(player => (
                                <PlayerCard key={player.playerId} player={player} compact={compact} />
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Tactical Recommendations */}
                {!compact && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-center gap-1 mb-2">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span className="text-xs font-semibold text-amber-400">IGL Recommendation</span>
                        </div>
                        <p className="text-xs text-white/70">
                            {opponent.teamWeaknesses.length > 0 
                                ? `Exploit their weakness in ${opponent.teamWeaknesses.map(w => operationLabels[w] || w).join(', ')}. Consider assigning your strongest players to counter their IGL and Anchor.`
                                : 'No clear weaknesses detected. Stick to your strengths and focus on speed.'
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

