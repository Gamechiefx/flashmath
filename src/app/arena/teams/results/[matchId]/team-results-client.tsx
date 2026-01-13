'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
    Trophy, Crown, Anchor, Star, Target, Zap, Clock,
    Home, Maximize, Minimize, X, ChevronLeft, ChevronRight
} from 'lucide-react';

interface TeamResultsClientProps {
    matchId: string;
    match: any;
    players: any[];
    currentUserId: string;
}

/**
 * Renders a banner-style player card that displays avatar initial, score badge, role badges, name, rank, and a Stats button.
 *
 * @param player - Player object; expected fields used: `player_name`, `questions_correct`, `was_igl`, `was_anchor`, and `operation_slot`.
 * @param isCurrentUser - Whether this player is the current user (applies highlighted border styling).
 * @param isWinner - Whether this player is on the winning team (affects colors and accents).
 * @param onShowStats - Callback invoked when the Stats button is clicked.
 * @param index - Zero-based index of the card used to stagger the entrance animation delay.
 * @returns A React element rendering the styled banner player card.
 */
function BannerPlayerCard({
    player,
    isCurrentUser,
    isWinner,
    onShowStats,
    index
}: {
    player: any;
    isCurrentUser: boolean;
    isWinner: boolean;
    onShowStats: () => void;
    index: number;
}) {
    const initial = player.player_name?.charAt(0)?.toUpperCase() || '?';
    const score = Math.round(player.questions_correct * 100);

    // Banner gradient colors - use team color
    const bannerGradient = isWinner
        ? 'from-fuchsia-600/80 via-purple-600/60 to-slate-900'
        : 'from-rose-600/80 via-red-600/60 to-slate-900';

    const borderColor = isWinner ? 'border-emerald-500' : 'border-rose-500';
    const accentColor = isWinner ? 'text-emerald-400' : 'text-rose-400';

    return (
        <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
                "relative flex flex-col rounded-xl overflow-hidden",
                "bg-slate-900/90 border-2",
                isCurrentUser ? "border-primary ring-2 ring-primary/30" : borderColor + "/40"
            )}
        >
            {/* Banner background */}
            <div className={cn(
                "h-16 bg-gradient-to-b relative",
                bannerGradient
            )}>
                {/* Role badges in banner */}
                <div className="absolute top-2 right-2 flex gap-1">
                    {player.was_igl && (
                        <div className="w-5 h-5 rounded bg-amber-500/30 backdrop-blur-sm flex items-center justify-center">
                            <Crown className="w-3 h-3 text-amber-400" />
                        </div>
                    )}
                    {player.was_anchor && (
                        <div className="w-5 h-5 rounded bg-purple-500/30 backdrop-blur-sm flex items-center justify-center">
                            <Anchor className="w-3 h-3 text-purple-400" />
                        </div>
                    )}
                </div>
            </div>

            {/* Avatar overlapping banner */}
            <div className="flex flex-col items-center -mt-8 px-3 pb-3">
                <div className="relative mb-2">
                    {/* Avatar circle */}
                    <div className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center text-xl font-black",
                        "bg-slate-800 border-3",
                        isWinner ? "border-emerald-500" : "border-rose-500"
                    )}>
                        {initial}
                    </div>
                    {/* Score badge */}
                    <div className={cn(
                        "absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-xs font-bold",
                        "bg-slate-900 border",
                        isWinner ? "border-emerald-500/50 text-emerald-400" : "border-rose-500/50 text-rose-400"
                    )}>
                        {score}
                    </div>
                </div>

                {/* Player name */}
                <p className="font-bold text-white text-sm text-center truncate w-full mt-1">
                    {player.player_name}
                </p>

                {/* Rank badge */}
                <div className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded mt-1",
                    isWinner ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                )}>
                    {player.operation_slot || 'Player'}
                </div>

                {/* Stats button */}
                <button
                    onClick={onShowStats}
                    className="w-full mt-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10
                               text-xs font-semibold text-white/70 hover:text-white transition-all uppercase tracking-wider"
                >
                    Stats
                </button>
            </div>
        </motion.div>
    );
}

/**
 * Renders a compact award card with an icon, title, player name, and value, styled according to the specified color theme.
 *
 * @param icon - Icon component to render inside the colored square
 * @param title - Short label for the award (e.g., "MVP", "Fastest")
 * @param playerName - Name of the player associated with the award
 * @param value - Display value for the award (e.g., score, time)
 * @param color - Visual theme for the card; selects the accent and border colors (`'amber' | 'cyan' | 'orange'`)
 * @returns A motion-enabled JSX element representing the award card
 */
function AwardCard({
    icon: Icon,
    title,
    playerName,
    value,
    color
}: {
    icon: any;
    title: string;
    playerName: string;
    value: string;
    color: 'amber' | 'cyan' | 'orange';
}) {
    const colorClasses = {
        amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
        orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl border",
                colorClasses[color]
            )}
        >
            <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                color === 'amber' && "bg-amber-500/20",
                color === 'cyan' && "bg-cyan-500/20",
                color === 'orange' && "bg-orange-500/20"
            )}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs opacity-70">{title}</p>
                <p className="font-bold text-white truncate">{playerName}</p>
            </div>
            <p className="font-black text-lg">{value}</p>
        </motion.div>
    );
}

/**
 * Displays a fullscreen modal with detailed statistics for a single player.
 *
 * @param player - Player data used to populate the modal. Expected fields include:
 *   - `player_name`
 *   - `operation_slot`
 *   - `accuracy`
 *   - `avg_answer_time_ms`
 *   - `questions_correct`
 *   - `questions_attempted`
 *   - `best_streak`
 *   - `was_igl`
 *   - `was_anchor`
 * @param onClose - Callback invoked when the modal should be closed (e.g., backdrop or close button).
 * @returns A modal element showing the player's stats, or `null` when `player` is falsy.
 */
function PlayerStatsModal({
    player,
    onClose
}: {
    player: any;
    onClose: () => void;
}) {
    if (!player) return null;

    const accuracy = Math.round((player.accuracy || 0) * 100);
    const avgTime = player.avg_answer_time_ms ? (player.avg_answer_time_ms / 1000).toFixed(2) : 'N/A';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-md w-full mx-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-purple-600
                                        flex items-center justify-center text-xl font-black text-white">
                            {player.player_name?.charAt(0) || '?'}
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">{player.player_name}</h3>
                            <p className="text-sm text-white/50">{player.operation_slot}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <p className="text-3xl font-black text-primary">
                            {Math.round(player.questions_correct * 100)}
                        </p>
                        <p className="text-xs text-white/50">Points Scored</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <p className="text-3xl font-black text-emerald-400">{accuracy}%</p>
                        <p className="text-xs text-white/50">Accuracy</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <p className="text-3xl font-black text-cyan-400">{avgTime}s</p>
                        <p className="text-xs text-white/50">Avg Answer Time</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <p className="text-3xl font-black text-orange-400">
                            {player.best_streak || 0}
                        </p>
                        <p className="text-xs text-white/50">Best Streak</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <p className="text-3xl font-black text-white">
                            {player.questions_correct}/{player.questions_attempted}
                        </p>
                        <p className="text-xs text-white/50">Questions</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className="flex items-center justify-center gap-1">
                            {player.was_igl && <Crown className="w-5 h-5 text-amber-400" />}
                            {player.was_anchor && <Anchor className="w-5 h-5 text-purple-400" />}
                            {!player.was_igl && !player.was_anchor && (
                                <Target className="w-5 h-5 text-white/50" />
                            )}
                        </div>
                        <p className="text-xs text-white/50 mt-1">
                            {player.was_igl ? 'IGL' : player.was_anchor ? 'Anchor' : 'Player'}
                        </p>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

/**
 * Render a row of page indicator dots for pagination.
 *
 * The component displays `totalPages` dots, highlights the dot for `currentPage`, and calls `onPageChange` with the selected page index when a dot is clicked.
 *
 * @param currentPage - Zero-based index of the currently active page
 * @param totalPages - Total number of pages to render as dots
 * @param onPageChange - Callback invoked with the page index when a dot is clicked
 * @returns A horizontal group of interactive dots representing pages
 */
function PageIndicator({
    currentPage,
    totalPages,
    onPageChange
}: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}) {
    return (
        <div className="flex items-center justify-center gap-2 mt-6">
            {Array.from({ length: totalPages }).map((_, i) => (
                <button
                    key={i}
                    onClick={() => onPageChange(i)}
                    className={cn(
                        "w-2.5 h-2.5 rounded-full transition-all",
                        currentPage === i
                            ? "bg-primary w-8"
                            : "bg-white/30 hover:bg-white/50"
                    )}
                />
            ))}
        </div>
    );
}

/**
 * Render an interactive match results UI with winner and loser pages, per-player banner cards, team awards, paging controls, fullscreen toggle, and a player stats modal.
 *
 * @param matchId - Unique identifier for the match.
 * @param match - Match data containing team ids, names, tags, scores, and `winner_team_id`.
 * @param players - Array of player objects used to populate banner cards, compute awards, and show detailed stats.
 * @param currentUserId - Current user's id used to highlight their card and determine victory/defeat state.
 * @returns The rendered React element displaying the match results interface.
 */
export function TeamResultsClient({
    matchId,
    match,
    players,
    currentUserId,
}: TeamResultsClientProps) {
    const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(0); // 0 = winner, 1 = loser
    const [isFullscreen, setIsFullscreen] = useState(false);

    const team1Won = match.winner_team_id === match.team1_id;
    const team2Won = match.winner_team_id === match.team2_id;
    const isDraw = !match.winner_team_id;

    const team1Players = players.filter(p => p.team_id === match.team1_id);
    const team2Players = players.filter(p => p.team_id === match.team2_id);

    const winningTeamPlayers = team1Won ? team1Players : team2Players;
    const losingTeamPlayers = team1Won ? team2Players : team1Players;

    const winningTeamName = team1Won ? match.team1_name : match.team2_name;
    const winningTeamTag = team1Won ? match.team1_tag : match.team2_tag;
    const winningTeamScore = team1Won ? match.team1_score : match.team2_score;

    const losingTeamName = team1Won ? match.team2_name : match.team1_name;
    const losingTeamTag = team1Won ? match.team2_tag : match.team1_tag;
    const losingTeamScore = team1Won ? match.team2_score : match.team1_score;

    const currentUserTeamId = players.find(p => p.user_id === currentUserId)?.team_id;
    const userWon = currentUserTeamId === match.winner_team_id;

    // Sort players by score
    const sortedWinners = [...winningTeamPlayers].sort((a, b) =>
        (b.questions_correct * 100) - (a.questions_correct * 100)
    );
    const sortedLosers = [...losingTeamPlayers].sort((a, b) =>
        (b.questions_correct * 100) - (a.questions_correct * 100)
    );

    // Calculate awards for each team
    const getTeamAwards = (teamPlayers: any[]) => {
        if (!teamPlayers.length) return { mvp: null, fastest: null, bestStreak: null };

        const mvp = teamPlayers.reduce((best, p) =>
            (p.questions_correct * 100) > ((best?.questions_correct || 0) * 100) ? p : best
        , teamPlayers[0]);

        const fastest = teamPlayers.reduce((best, p) =>
            (p.avg_answer_time_ms || Infinity) < (best?.avg_answer_time_ms || Infinity) ? p : best
        , teamPlayers[0]);

        const bestStreak = teamPlayers.reduce((best, p) =>
            (p.best_streak || 0) > (best?.best_streak || 0) ? p : best
        , teamPlayers[0]);

        return { mvp, fastest, bestStreak };
    };

    const winnerAwards = getTeamAwards(winningTeamPlayers);
    const loserAwards = getTeamAwards(losingTeamPlayers);

    // Track fullscreen state
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch (err) {
            console.log('[TeamResults] Fullscreen error:', err);
        }
    };

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(0, Math.min(1, page)));
    };

    const slideVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 300 : -300,
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            x: direction > 0 ? -300 : 300,
            opacity: 0,
        }),
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white overflow-hidden">
            {/* Fullscreen Toggle */}
            <button
                onClick={toggleFullscreen}
                className="fixed top-4 right-4 z-50 p-2.5 rounded-xl bg-black/40 border border-white/10
                           hover:border-primary/50 text-white/60 hover:text-primary transition-all"
            >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 py-8 relative">
                {/* Header */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-center mb-6"
                >
                    <h1 className="text-3xl font-black text-white mb-2">Match Results</h1>
                    <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-full",
                        userWon ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    )}>
                        {userWon ? <Trophy className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                        <span className="font-bold">{userWon ? 'VICTORY' : 'DEFEAT'}</span>
                    </div>
                </motion.div>

                {/* Navigation arrows */}
                {!isDraw && (
                    <>
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 0}
                            className={cn(
                                "fixed left-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full",
                                "bg-black/40 border border-white/10 transition-all",
                                currentPage === 0
                                    ? "opacity-30 cursor-not-allowed"
                                    : "hover:bg-white/10 hover:border-white/30"
                            )}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === 1}
                            className={cn(
                                "fixed right-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full",
                                "bg-black/40 border border-white/10 transition-all",
                                currentPage === 1
                                    ? "opacity-30 cursor-not-allowed"
                                    : "hover:bg-white/10 hover:border-white/30"
                            )}
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </>
                )}

                {/* Sliding content area */}
                <div className="relative min-h-[500px]">
                    <AnimatePresence mode="wait" custom={currentPage}>
                        {/* Page 0: Winner */}
                        {currentPage === 0 && !isDraw && (
                            <motion.div
                                key="winner-page"
                                custom={currentPage}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3 }}
                                className="w-full"
                            >
                                {/* Winner banner */}
                                <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/30
                                                bg-gradient-to-b from-fuchsia-900/20 via-slate-900/90 to-slate-900">
                                    {/* Header */}
                                    <div className="relative p-4 border-b border-emerald-500/20 flex items-center justify-between
                                                    bg-gradient-to-r from-fuchsia-600/20 via-purple-600/20 to-fuchsia-600/20">
                                        <div className="flex items-center gap-3">
                                            <Trophy className="w-6 h-6 text-amber-400" />
                                            <div>
                                                <p className="text-xs text-emerald-400/70 uppercase tracking-wider">Winner</p>
                                                <p className="font-bold text-lg">
                                                    {winningTeamTag ? `[${winningTeamTag}] ` : ''}{winningTeamName}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black text-emerald-400">{winningTeamScore}</p>
                                            <p className="text-xs text-white/50">points</p>
                                        </div>
                                    </div>

                                    {/* Player cards with banner style */}
                                    <div className="relative p-6">
                                        <div className="grid grid-cols-5 gap-3">
                                            {sortedWinners.map((player, idx) => (
                                                <BannerPlayerCard
                                                    key={player.user_id}
                                                    player={player}
                                                    isCurrentUser={player.user_id === currentUserId}
                                                    isWinner={true}
                                                    onShowStats={() => setSelectedPlayer(player)}
                                                    index={idx}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Awards section */}
                                    <div className="relative px-6 pb-6">
                                        <p className="text-sm text-white/50 mb-3 text-center">Team Awards</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            {winnerAwards.mvp && (
                                                <AwardCard
                                                    icon={Star}
                                                    title="MVP"
                                                    playerName={winnerAwards.mvp.player_name}
                                                    value={`${Math.round(winnerAwards.mvp.questions_correct * 100)} pts`}
                                                    color="amber"
                                                />
                                            )}
                                            {winnerAwards.fastest && winnerAwards.fastest.avg_answer_time_ms && (
                                                <AwardCard
                                                    icon={Clock}
                                                    title="Fastest"
                                                    playerName={winnerAwards.fastest.player_name}
                                                    value={`${(winnerAwards.fastest.avg_answer_time_ms / 1000).toFixed(1)}s`}
                                                    color="cyan"
                                                />
                                            )}
                                            {winnerAwards.bestStreak && winnerAwards.bestStreak.best_streak > 0 && (
                                                <AwardCard
                                                    icon={Zap}
                                                    title="Best Streak"
                                                    playerName={winnerAwards.bestStreak.player_name}
                                                    value={`${winnerAwards.bestStreak.best_streak}x`}
                                                    color="orange"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Page 1: Loser */}
                        {currentPage === 1 && !isDraw && (
                            <motion.div
                                key="loser-page"
                                custom={currentPage}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3 }}
                                className="w-full"
                            >
                                {/* Loser banner */}
                                <div className="relative rounded-2xl overflow-hidden border-2 border-rose-500/30
                                                bg-gradient-to-b from-rose-900/20 via-slate-900/90 to-slate-900">
                                    {/* Header */}
                                    <div className="relative p-4 border-b border-rose-500/20 flex items-center justify-between
                                                    bg-gradient-to-r from-rose-600/20 via-red-600/20 to-rose-600/20">
                                        <div className="flex items-center gap-3">
                                            <Target className="w-6 h-6 text-rose-400" />
                                            <div>
                                                <p className="text-xs text-rose-400/70 uppercase tracking-wider">Defeated</p>
                                                <p className="font-bold text-lg">
                                                    {losingTeamTag ? `[${losingTeamTag}] ` : ''}{losingTeamName}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-3xl font-black text-rose-400">{losingTeamScore}</p>
                                            <p className="text-xs text-white/50">points</p>
                                        </div>
                                    </div>

                                    {/* Player cards */}
                                    <div className="relative p-6">
                                        <div className="grid grid-cols-5 gap-3">
                                            {sortedLosers.map((player, idx) => (
                                                <BannerPlayerCard
                                                    key={player.user_id}
                                                    player={player}
                                                    isCurrentUser={player.user_id === currentUserId}
                                                    isWinner={false}
                                                    onShowStats={() => setSelectedPlayer(player)}
                                                    index={idx}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Awards section */}
                                    <div className="relative px-6 pb-6">
                                        <p className="text-sm text-white/50 mb-3 text-center">Team Awards</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            {loserAwards.mvp && (
                                                <AwardCard
                                                    icon={Star}
                                                    title="MVP"
                                                    playerName={loserAwards.mvp.player_name}
                                                    value={`${Math.round(loserAwards.mvp.questions_correct * 100)} pts`}
                                                    color="amber"
                                                />
                                            )}
                                            {loserAwards.fastest && loserAwards.fastest.avg_answer_time_ms && (
                                                <AwardCard
                                                    icon={Clock}
                                                    title="Fastest"
                                                    playerName={loserAwards.fastest.player_name}
                                                    value={`${(loserAwards.fastest.avg_answer_time_ms / 1000).toFixed(1)}s`}
                                                    color="cyan"
                                                />
                                            )}
                                            {loserAwards.bestStreak && loserAwards.bestStreak.best_streak > 0 && (
                                                <AwardCard
                                                    icon={Zap}
                                                    title="Best Streak"
                                                    playerName={loserAwards.bestStreak.player_name}
                                                    value={`${loserAwards.bestStreak.best_streak}x`}
                                                    color="orange"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Draw state */}
                        {isDraw && (
                            <motion.div
                                key="draw-page"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="w-full text-center py-12"
                            >
                                <div className="text-6xl mb-4">🤝</div>
                                <h2 className="text-3xl font-black mb-2">DRAW</h2>
                                <p className="text-white/60">Both teams finished with equal scores!</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Page indicator */}
                {!isDraw && (
                    <PageIndicator
                        currentPage={currentPage}
                        totalPages={2}
                        onPageChange={setCurrentPage}
                    />
                )}

                {/* Actions */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-col items-center gap-3 mt-8"
                >
                    <Link
                        href="/arena/modes"
                        className="w-full max-w-xs py-4 rounded-xl bg-primary hover:bg-primary/80
                                   text-black font-bold text-center transition-colors flex items-center justify-center gap-2"
                    >
                        <Home className="w-5 h-5" />
                        Back to Arena
                    </Link>
                    <Link
                        href="/arena/modes"
                        className="w-full max-w-xs py-3 rounded-xl bg-white/10 hover:bg-white/20
                                   text-white font-semibold text-center transition-colors"
                    >
                        Play Again
                    </Link>
                </motion.div>
            </div>

            {/* Player Stats Modal */}
            <AnimatePresence>
                {selectedPlayer && (
                    <PlayerStatsModal
                        player={selectedPlayer}
                        onClose={() => setSelectedPlayer(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}