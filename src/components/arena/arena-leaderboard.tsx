'use client';

/**
 * Arena Leaderboard Component
 * Real-time leaderboard with Duel/Team tabs, operation filters, and time toggles
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Trophy, Swords, Users, Flame, TrendingUp, TrendingDown, Crown, Medal, Award, RefreshCw, Zap, ChevronDown, Target, Gauge, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useLeaderboardSocket } from '@/lib/socket/use-leaderboard-socket';
import { UserAvatar } from '@/components/user-avatar';
import { getArenaLeaderboard, type LeaderboardResult, type Operation, type TimeFilter, type LeaderboardType, type LeaderboardEntry, type StrengthType, type TrendDirection } from '@/lib/actions/leaderboard';

interface ArenaLeaderboardProps {
    initialData: LeaderboardResult;
}

// Operation display config
const OPERATIONS: { id: Operation; label: string; icon: string; color: string }[] = [
    { id: 'overall', label: 'Overall', icon: '🏆', color: 'from-amber-500 to-yellow-500' },
    { id: 'addition', label: 'Addition', icon: '➕', color: 'from-green-500 to-emerald-500' },
    { id: 'subtraction', label: 'Subtraction', icon: '➖', color: 'from-blue-500 to-cyan-500' },
    { id: 'multiplication', label: 'Multiplication', icon: '✖️', color: 'from-purple-500 to-violet-500' },
    { id: 'division', label: 'Division', icon: '➗', color: 'from-orange-500 to-red-500' },
];

// League colors for rank badges
const LEAGUE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    'Bronze': { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-700', glow: 'shadow-amber-500/20' },
    'Silver': { bg: 'bg-slate-400/20', text: 'text-slate-300', border: 'border-slate-500', glow: 'shadow-slate-400/20' },
    'Gold': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-600', glow: 'shadow-yellow-500/30' },
    'Platinum': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500', glow: 'shadow-cyan-500/30' },
    'Diamond': { bg: 'bg-blue-400/20', text: 'text-blue-300', border: 'border-blue-400', glow: 'shadow-blue-400/40' },
};

// Rank medal colors
const RANK_MEDALS = [
    { icon: Crown, color: 'text-yellow-400', bgGlow: 'bg-yellow-500/20', borderColor: 'border-yellow-500/50' },
    { icon: Medal, color: 'text-slate-300', bgGlow: 'bg-slate-400/20', borderColor: 'border-slate-400/50' },
    { icon: Award, color: 'text-amber-600', bgGlow: 'bg-amber-600/20', borderColor: 'border-amber-600/50' },
];

// Strength/weakness display config
const STRENGTH_CONFIG: Record<StrengthType, { label: string; icon: typeof Target }> = {
    accuracy: { label: 'Accuracy', icon: Target },
    speed: { label: 'Speed', icon: Gauge },
    consistency: { label: 'Consistency', icon: Activity },
    improvement: { label: 'Improving', icon: TrendingUp },
};

// Trend display config
const TREND_CONFIG: Record<TrendDirection, { label: string; icon: typeof TrendingUp; color: string }> = {
    rising: { label: 'Rising', icon: TrendingUp, color: 'text-green-400' },
    stable: { label: 'Stable', icon: Activity, color: 'text-white/60' },
    falling: { label: 'Falling', icon: TrendingDown, color: 'text-red-400' },
};

// Get operation display info
function getOperationInfo(operation: string): { icon: string; label: string; color: string } {
    const op = OPERATIONS.find(o => o.id === operation);
    return op || { icon: '❓', label: operation, color: 'from-gray-500 to-gray-600' };
}

// Format speed in human-readable format
function formatSpeed(ms: number): string {
    if (ms <= 0) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function ArenaLeaderboard({ initialData }: ArenaLeaderboardProps) {
    const [type, setType] = useState<LeaderboardType>(initialData.type);
    const [operation, setOperation] = useState<Operation>(initialData.operation);
    const [timeFilter, setTimeFilter] = useState<TimeFilter>(initialData.timeFilter);
    const [data, setData] = useState<LeaderboardResult>(initialData);
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    
    // Toggle row expansion
    const toggleRowExpand = useCallback((userId: string) => {
        setExpandedRowId(prev => prev === userId ? null : userId);
    }, []);

    // Real-time updates via WebSocket
    const { isConnected } = useLeaderboardSocket({
        type,
        operation,
        timeFilter,
        onUpdate: useCallback(async () => {
            // Refresh data when update received
            setIsRefreshing(true);
            try {
                const newData = await getArenaLeaderboard(type, operation, timeFilter, 100);
                setData(newData);
            } catch (err) {
                console.error('Failed to refresh leaderboard:', err);
            } finally {
                setIsRefreshing(false);
            }
        }, [type, operation, timeFilter]),
    });

    // Fetch new data when filters change
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const newData = await getArenaLeaderboard(type, operation, timeFilter, 100);
            setData(newData);
        } catch (err) {
            console.error('Failed to fetch leaderboard:', err);
        } finally {
            setIsLoading(false);
        }
    }, [type, operation, timeFilter]);

    useEffect(() => {
        // Fetch when filters change (but not on initial mount)
        if (type !== initialData.type || operation !== initialData.operation || timeFilter !== initialData.timeFilter) {
            fetchData();
        }
    }, [type, operation, timeFilter, fetchData, initialData.type, initialData.operation, initialData.timeFilter]);

    // Top 3 for podium
    const podiumEntries = data.entries.slice(0, 3);
    const tableEntries = data.entries.slice(3);

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link 
                        href="/arena/modes"
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                    >
                        <ArrowLeft size={20} className="text-white/70" />
                    </Link>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
                            <span className="bg-gradient-to-r from-cyan-400 via-primary to-amber-400 bg-clip-text text-transparent">
                                Arena Leaderboards
                            </span>
                        </h1>
                        <p className="text-sm text-white/50 mt-1 flex items-center gap-2">
                            <Trophy size={14} className="text-amber-400" />
                            {data.totalPlayers} ranked players
                            {isConnected && (
                                <span className="flex items-center gap-1 text-green-400">
                                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                    Live
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Refresh indicator */}
                <AnimatePresence>
                    {isRefreshing && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30"
                        >
                            <RefreshCw size={14} className="text-primary animate-spin" />
                            <span className="text-xs text-primary font-medium">Updating...</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Type Tabs (Duel / Team) */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
                <button
                    onClick={() => setType('duel')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
                        type === 'duel'
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Swords size={18} />
                    Duel Rankings
                </button>
                <button
                    onClick={() => setType('team')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
                        type === 'team'
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Users size={18} />
                    Team Rankings
                </button>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-4 mb-8">
                {/* Operation Filter */}
                <div className="flex gap-1.5 p-1 bg-white/5 rounded-lg border border-white/10">
                    {OPERATIONS.map((op) => (
                        <button
                            key={op.id}
                            onClick={() => setOperation(op.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                                operation === op.id
                                    ? `bg-gradient-to-r ${op.color} text-white shadow-md`
                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <span>{op.icon}</span>
                            <span className="hidden sm:inline">{op.label}</span>
                        </button>
                    ))}
                </div>

                {/* Time Filter Toggle */}
                <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
                    <button
                        onClick={() => setTimeFilter('weekly')}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                            timeFilter === 'weekly'
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        This Week
                    </button>
                    <button
                        onClick={() => setTimeFilter('alltime')}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                            timeFilter === 'alltime'
                                ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        All Time
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-white/50 font-medium">Loading rankings...</p>
                    </div>
                </div>
            ) : data.entries.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Trophy size={40} className="text-white/20" />
                    </div>
                    <h3 className="text-xl font-bold text-white/80 mb-2">No Rankings Yet</h3>
                    <p className="text-white/50 max-w-md">
                        {type === 'team' 
                            ? 'Team arena modes are coming soon! Check back later for team rankings.'
                            : 'Be the first to climb the ranks! Complete arena matches to appear on the leaderboard.'}
                    </p>
                    <Link 
                        href="/arena/modes"
                        className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-amber-500 text-white font-bold hover:scale-105 transition-transform"
                    >
                        Enter Arena
                    </Link>
                </div>
            ) : (
                <>
                    {/* Podium - Top 3 */}
                    <div className="grid grid-cols-3 gap-3 lg:gap-6 mb-6">
                        {/* 2nd Place */}
                        <PodiumCard 
                            entry={podiumEntries[1]} 
                            rank={2} 
                            timeFilter={timeFilter}
                            isExpanded={expandedRowId === podiumEntries[1]?.odUserId}
                            onToggleExpand={() => podiumEntries[1] && toggleRowExpand(podiumEntries[1].odUserId)}
                        />
                        
                        {/* 1st Place */}
                        <PodiumCard 
                            entry={podiumEntries[0]} 
                            rank={1} 
                            timeFilter={timeFilter}
                            isExpanded={expandedRowId === podiumEntries[0]?.odUserId}
                            onToggleExpand={() => podiumEntries[0] && toggleRowExpand(podiumEntries[0].odUserId)}
                        />
                        
                        {/* 3rd Place */}
                        <PodiumCard 
                            entry={podiumEntries[2]} 
                            rank={3} 
                            timeFilter={timeFilter}
                            isExpanded={expandedRowId === podiumEntries[2]?.odUserId}
                            onToggleExpand={() => podiumEntries[2] && toggleRowExpand(podiumEntries[2].odUserId)}
                        />
                    </div>

                    {/* Leaderboard Table */}
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-white/5 border-b border-white/10 text-xs font-bold text-white/50 uppercase tracking-wider">
                            <div className="col-span-1 text-center">#</div>
                            <div className="col-span-4 lg:col-span-3">Player</div>
                            <div className="col-span-2 text-center">League</div>
                            <div className="col-span-2 text-center">ELO</div>
                            <div className="col-span-2 lg:col-span-2 text-center">W/L</div>
                            <div className="col-span-1 lg:col-span-2 text-center hidden lg:block">Streak</div>
                        </div>

                        {/* Table Body */}
                        <div>
                            {tableEntries.map((entry, index) => (
                                <LeaderboardRow 
                                    key={entry.odUserId} 
                                    entry={entry} 
                                    index={index + 4} // Offset by 3 for podium
                                    timeFilter={timeFilter}
                                    isExpanded={expandedRowId === entry.odUserId}
                                    onToggleExpand={() => toggleRowExpand(entry.odUserId)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Current User Position (if not in top 100) */}
                    {data.currentUserEntry && !data.entries.some(e => e.odIsCurrentUser) && (
                        <div className="mt-4 p-4 bg-primary/10 rounded-xl border border-primary/30">
                            <p className="text-sm text-white/60 mb-2">Your Position</p>
                            <LeaderboardRow 
                                entry={data.currentUserEntry} 
                                index={data.currentUserRank || 0}
                                timeFilter={timeFilter}
                                isHighlighted
                                isExpanded={expandedRowId === data.currentUserEntry.odUserId}
                                onToggleExpand={() => toggleRowExpand(data.currentUserEntry!.odUserId)}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// =============================================================================
// PODIUM CARD COMPONENT
// =============================================================================

interface PodiumCardProps {
    entry?: LeaderboardEntry;
    rank: 1 | 2 | 3;
    timeFilter: TimeFilter;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

function PodiumCard({ entry, rank, timeFilter, isExpanded, onToggleExpand }: PodiumCardProps) {
    if (!entry) {
        return (
            <div className={`relative flex flex-col items-center p-4 rounded-2xl bg-white/5 border border-white/10 
                ${rank === 1 ? 'order-2 lg:-mt-4' : rank === 2 ? 'order-1 mt-8 lg:mt-4' : 'order-3 mt-8 lg:mt-4'}`}>
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-white/30 text-lg font-bold">{rank}</span>
                </div>
                <p className="text-xs text-white/30 mt-2">Empty</p>
            </div>
        );
    }

    const medal = RANK_MEDALS[rank - 1];
    const MedalIcon = medal.icon;
    const leagueStyle = LEAGUE_COLORS[entry.odLeague] || LEAGUE_COLORS['Bronze'];
    const isFirst = rank === 1;

    return (
        <div className={`flex flex-col ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}>
            <motion.button
                onClick={onToggleExpand}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: rank * 0.1 }}
                className={`relative flex flex-col items-center p-4 lg:p-6 rounded-2xl border transition-all cursor-pointer
                    ${isFirst ? 'lg:-mt-6 bg-gradient-to-b from-yellow-500/10 to-transparent border-yellow-500/30 shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/20' : 
                      rank === 2 ? 'mt-8 lg:mt-4 bg-white/5 border-white/10 hover:bg-white/10' : 
                      'mt-8 lg:mt-4 bg-white/5 border-white/10 hover:bg-white/10'}
                ${entry.odIsCurrentUser ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                    ${isExpanded ? 'ring-2 ring-white/20' : ''}
            `}
        >
            {/* Medal Glow */}
            <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full ${medal.bgGlow} blur-xl opacity-50`} />
            
            {/* Medal Badge */}
            <div className={`relative z-10 w-10 h-10 lg:w-12 lg:h-12 rounded-full ${medal.bgGlow} ${medal.borderColor} border-2 flex items-center justify-center mb-3`}>
                <MedalIcon className={`${medal.color} ${isFirst ? 'w-6 h-6 lg:w-7 lg:h-7' : 'w-5 h-5 lg:w-6 lg:h-6'}`} />
            </div>

                {/* Player Avatar with Frame */}
                <div className={`mb-3 ${isFirst ? 'scale-110' : ''}`}>
                    <UserAvatar 
                        user={{
                            name: entry.odName,
                            equipped_items: { frame: entry.odEquippedFrame || undefined }
                        }}
                        size={isFirst ? "xl" : "lg"}
                        className={leagueStyle.glow}
                    />
            </div>

            {/* Player Name */}
            <h3 className={`font-black text-center truncate max-w-full px-2 ${isFirst ? 'text-lg lg:text-xl' : 'text-sm lg:text-base'}`}>
                {entry.odName}
            </h3>

            {/* League Badge */}
            <div className={`mt-2 px-2 py-0.5 rounded-full text-[10px] lg:text-xs font-bold ${leagueStyle.bg} ${leagueStyle.text} border ${leagueStyle.border}`}>
                {entry.odLeague} {entry.odDivision}
            </div>

            {/* ELO */}
            <div className="mt-3 flex items-center gap-1">
                <Zap size={14} className="text-amber-400" />
                <span className="font-black text-lg lg:text-xl">{entry.odElo}</span>
                {timeFilter === 'weekly' && entry.odEloChange !== undefined && entry.odEloChange !== 0 && (
                    <span className={`text-xs font-bold flex items-center ${entry.odEloChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {entry.odEloChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {entry.odEloChange > 0 ? '+' : ''}{entry.odEloChange}
                    </span>
                )}
            </div>

            {/* Stats */}
            <div className="mt-2 flex items-center gap-3 text-xs text-white/60">
                <span className="text-green-400">{entry.odWins}W</span>
                <span className="text-red-400">{entry.odLosses}L</span>
                <span className="text-amber-400">{entry.odWinRate}%</span>
            </div>

                {/* Click hint */}
                <div className="mt-3 flex items-center gap-1 text-[10px] text-white/40">
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown size={12} />
                    </motion.div>
                    <span>{isExpanded ? 'Hide' : 'View'} Stats</span>
                </div>

            {/* "You" indicator */}
            {entry.odIsCurrentUser && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary rounded-full text-[10px] font-bold">
                    YOU
                </div>
            )}
            </motion.button>
            
            {/* Expandable Performance Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden mt-2"
                    >
                        <div className={`p-3 rounded-xl border ${entry.odIsCurrentUser ? 'bg-primary/5 border-primary/20' : 'bg-white/5 border-white/10'}`}>
                            {/* Performance Stats */}
                            <div className="flex flex-col gap-2 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-white/50 flex items-center gap-1">
                                        <Target size={12} className="text-cyan-400" />
                                        Avg Accuracy
                                    </span>
                                    <span className="font-bold text-cyan-400">{entry.odAccuracy}%</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-white/50 flex items-center gap-1">
                                        <Gauge size={12} className="text-amber-400" />
                                        Avg Speed
                                    </span>
                                    <span className="font-bold text-amber-400">
                                        {entry.odAvgSpeedMs > 0 ? (entry.odAvgSpeedMs < 1000 ? `${entry.odAvgSpeedMs}ms` : `${(entry.odAvgSpeedMs / 1000).toFixed(1)}s`) : '-'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-white/50 flex items-center gap-1">
                                        <Flame size={12} className="text-orange-400" />
                                        Best Streak
                                    </span>
                                    <span className="font-bold text-orange-400">{entry.odBestStreak}</span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                                    <span className="text-white/50 flex items-center gap-1">
                                        <Activity size={12} className="text-violet-400" />
                                        APS
                                    </span>
                                    <span className="font-black text-violet-400">{entry.odApsScore}<span className="text-[10px] text-white/40">/100</span></span>
                                </div>
                                {/* Strongest Operation (for Overall view) */}
                                {entry.odStrongestOperation && (
                                    <div className="flex items-center justify-between pt-2">
                                        <span className="text-white/50 flex items-center gap-1">
                                            <Trophy size={12} className="text-yellow-400" />
                                            Best At
                                        </span>
                                        <span className="font-bold text-yellow-400 flex items-center gap-1">
                                            <span>{getOperationInfo(entry.odStrongestOperation).icon}</span>
                                            <span className="capitalize">{entry.odStrongestOperation}</span>
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Trend indicator for current user */}
                            {entry.odIsCurrentUser && entry.odRecentTrend && (
                                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-2">
                                    <span className="text-[10px] text-white/40">Recent:</span>
                                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                                        entry.odRecentTrend === 'rising' ? 'text-green-400' :
                                        entry.odRecentTrend === 'falling' ? 'text-red-400' : 'text-white/60'
                                    }`}>
                                        {entry.odRecentTrend === 'rising' && <TrendingUp size={10} />}
                                        {entry.odRecentTrend === 'falling' && <TrendingDown size={10} />}
                                        {entry.odRecentTrend === 'stable' && <Activity size={10} />}
                                        {entry.odRecentTrend === 'rising' ? 'Climbing' : 
                                         entry.odRecentTrend === 'falling' ? 'Dropping' : 'Steady'}
                                    </span>
                                </div>
                            )}
                        </div>
        </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// =============================================================================
// PERFORMANCE PANEL (Expanded Stats)
// =============================================================================

interface PerformancePanelProps {
    entry: LeaderboardEntry;
    isCurrentUser: boolean;
}

function PerformancePanel({ entry, isCurrentUser }: PerformancePanelProps) {
    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
        >
            <div className={`mx-4 mb-3 p-4 rounded-xl border ${isCurrentUser ? 'bg-primary/5 border-primary/20' : 'bg-white/5 border-white/10'}`}>
                {/* Condensed Stats (for all players) */}
                <div className="flex flex-wrap items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <Target size={16} className="text-cyan-400" />
                        <span className="text-xs text-white/60">Avg Accuracy:</span>
                        <span className="font-bold text-cyan-400">{entry.odAccuracy}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Gauge size={16} className="text-amber-400" />
                        <span className="text-xs text-white/60">Avg Speed:</span>
                        <span className="font-bold text-amber-400">{formatSpeed(entry.odAvgSpeedMs)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Flame size={16} className="text-orange-400" />
                        <span className="text-xs text-white/60">Best Streak:</span>
                        <span className="font-bold text-orange-400">{entry.odBestStreak}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                        <Activity size={16} className="text-violet-400" />
                        <span className="text-xs text-white/60">APS:</span>
                        <span className="font-black text-lg text-violet-400">{entry.odApsScore}</span>
                        <span className="text-[10px] text-white/40">/100</span>
                    </div>
                    {/* Strongest Operation (for Overall view) */}
                    {entry.odStrongestOperation && (
                        <div className="flex items-center gap-2">
                            <Trophy size={16} className="text-yellow-400" />
                            <span className="text-xs text-white/60">Best At:</span>
                            <span className="font-bold text-yellow-400 flex items-center gap-1">
                                <span>{getOperationInfo(entry.odStrongestOperation).icon}</span>
                                <span className="capitalize">{entry.odStrongestOperation}</span>
                            </span>
                        </div>
                    )}
                </div>
                
                {/* Extended info for current user only */}
                {isCurrentUser && (
                    <div className="pt-4 border-t border-white/10">
                        <div className="flex flex-wrap items-center gap-4">
                            {/* Recent Trend */}
                            {entry.odRecentTrend && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-white/50">Recent:</span>
                                    {(() => {
                                        const trendConfig = TREND_CONFIG[entry.odRecentTrend];
                                        const TrendIcon = trendConfig.icon;
                                        return (
                                            <span className={`flex items-center gap-1 font-bold ${trendConfig.color}`}>
                                                <TrendIcon size={14} />
                                                {trendConfig.label}
                                            </span>
                                        );
                                    })()}
                                </div>
                            )}
                            
                            {/* Strengths */}
                            {entry.odStrengths && entry.odStrengths.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <CheckCircle size={14} className="text-green-400" />
                                    <span className="text-xs text-white/50">Strengths:</span>
                                    <div className="flex gap-1">
                                        {entry.odStrengths.map((s) => (
                                            <span key={s} className="px-1.5 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-400 rounded">
                                                {STRENGTH_CONFIG[s].label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Weaknesses */}
                            {entry.odWeaknesses && entry.odWeaknesses.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-amber-400" />
                                    <span className="text-xs text-white/50">Improve:</span>
                                    <div className="flex gap-1">
                                        {entry.odWeaknesses.map((w) => (
                                            <span key={w} className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 rounded">
                                                {STRENGTH_CONFIG[w].label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

// =============================================================================
// LEADERBOARD ROW COMPONENT
// =============================================================================

interface LeaderboardRowProps {
    entry: LeaderboardEntry;
    index: number;
    timeFilter: TimeFilter;
    isHighlighted?: boolean;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

function LeaderboardRow({ entry, index, timeFilter, isHighlighted, isExpanded, onToggleExpand }: LeaderboardRowProps) {
    const leagueStyle = LEAGUE_COLORS[entry.odLeague] || LEAGUE_COLORS['Bronze'];

    return (
        <div className="border-b border-white/5 last:border-0">
            <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.5) }}
                onClick={onToggleExpand}
                className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center transition-colors cursor-pointer
                    ${entry.odIsCurrentUser || isHighlighted ? 'bg-primary/10' : 'hover:bg-white/5'}
                    ${isExpanded ? 'bg-white/5' : ''}
                `}
            >
                {/* Rank */}
                <div className="col-span-1 text-center">
                    <span className={`font-black text-lg ${entry.odIsCurrentUser ? 'text-primary' : 'text-white/70'}`}>
                        {entry.rank}
                    </span>
                </div>

                {/* Player */}
                <div className="col-span-4 lg:col-span-3 flex items-center gap-3">
                    {/* Avatar with Frame */}
                    <UserAvatar 
                        user={{
                            name: entry.odName,
                            equipped_items: { frame: entry.odEquippedFrame || undefined }
                        }}
                        size="sm"
                    />
                    <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{entry.odName}</p>
                        <p className="text-xs text-white/40">Lv. {entry.odLevel}</p>
                    </div>
                    {entry.odIsCurrentUser && (
                        <span className="px-1.5 py-0.5 bg-primary/30 text-primary text-[10px] font-bold rounded">YOU</span>
                    )}
                </div>

                {/* League */}
                <div className="col-span-2 flex justify-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${leagueStyle.bg} ${leagueStyle.text} border ${leagueStyle.border}`}>
                        {entry.odLeague} {entry.odDivision}
                    </span>
                </div>

                {/* ELO */}
                <div className="col-span-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <span className="font-black">{entry.odElo}</span>
                        {timeFilter === 'weekly' && entry.odEloChange !== undefined && entry.odEloChange !== 0 && (
                            <span className={`text-xs font-bold flex items-center ${entry.odEloChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.odEloChange > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {entry.odEloChange > 0 ? '+' : ''}{entry.odEloChange}
                            </span>
                        )}
                    </div>
                </div>

                {/* W/L */}
                <div className="col-span-2 lg:col-span-2 text-center">
                    <span className="text-green-400 font-medium">{entry.odWins}</span>
                    <span className="text-white/30 mx-1">/</span>
                    <span className="text-red-400 font-medium">{entry.odLosses}</span>
                    <span className="text-white/30 text-xs ml-1">({entry.odWinRate}%)</span>
                </div>

                {/* Streak + Expand Button */}
                <div className="col-span-1 lg:col-span-2 text-center flex items-center justify-center gap-2">
                    <div className="hidden lg:flex items-center gap-1">
                        {entry.odStreak > 0 && (
                            <>
                                <Flame size={14} className="text-orange-400" />
                                <span className="text-orange-400 font-bold">{entry.odStreak}</span>
                            </>
                        )}
                        {entry.odStreak === 0 && <span className="text-white/30">-</span>}
                    </div>
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown size={16} className="text-white/40" />
                    </motion.div>
                </div>
            </motion.button>
            
            {/* Expandable Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <PerformancePanel entry={entry} isCurrentUser={entry.odIsCurrentUser} />
                )}
            </AnimatePresence>
        </div>
    );
}

