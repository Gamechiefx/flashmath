'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { 
    Trophy, Crown, Anchor, ArrowUp, ArrowDown, 
    Target, Zap, Clock, TrendingUp, Home
} from 'lucide-react';

interface TeamResultsClientProps {
    matchId: string;
    match: any;
    players: any[];
    currentUserId: string;
}

export function TeamResultsClient({
    matchId,
    match,
    players,
    currentUserId,
}: TeamResultsClientProps) {
    const team1Won = match.winner_team_id === match.team1_id;
    const team2Won = match.winner_team_id === match.team2_id;
    const isDraw = !match.winner_team_id;
    
    const team1Players = players.filter(p => p.team_id === match.team1_id);
    const team2Players = players.filter(p => p.team_id === match.team2_id);
    
    const currentUserTeamId = players.find(p => p.user_id === currentUserId)?.team_id;
    const userWon = currentUserTeamId === match.winner_team_id;
    const userEloChange = players.find(p => p.user_id === currentUserId)?.individual_elo_change || 0;

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/10 to-slate-900 text-white">
            {/* Hero Section */}
            <div className={cn(
                "relative py-12 overflow-hidden",
                userWon && "bg-gradient-to-b from-emerald-500/20 to-transparent",
                !userWon && !isDraw && "bg-gradient-to-b from-rose-500/20 to-transparent",
                isDraw && "bg-gradient-to-b from-amber-500/20 to-transparent"
            )}>
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', duration: 0.5 }}
                        className="mb-4"
                    >
                        {userWon ? (
                            <Trophy className="w-20 h-20 text-amber-400 mx-auto" />
                        ) : isDraw ? (
                            <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500 
                                            flex items-center justify-center text-4xl mx-auto">
                                🤝
                            </div>
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500 
                                            flex items-center justify-center text-4xl mx-auto">
                                ⚔️
                            </div>
                        )}
                    </motion.div>

                    <motion.h1
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className={cn(
                            "text-4xl md:text-5xl font-black mb-4",
                            userWon && "text-emerald-400",
                            !userWon && !isDraw && "text-rose-400",
                            isDraw && "text-amber-400"
                        )}
                    >
                        {userWon ? 'VICTORY!' : isDraw ? 'DRAW' : 'DEFEAT'}
                    </motion.h1>

                    {/* Score Summary */}
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center justify-center gap-6 mb-8"
                    >
                        <div className={cn(
                            "text-center p-4 rounded-xl",
                            team1Won && "bg-emerald-500/20 border border-emerald-500/30"
                        )}>
                            <p className="text-sm text-white/60 mb-1">
                                {match.team1_tag ? `[${match.team1_tag}]` : ''} {match.team1_name || 'Team 1'}
                            </p>
                            <p className="text-4xl font-black">{match.team1_score}</p>
                        </div>
                        <div className="text-2xl font-bold text-white/30">vs</div>
                        <div className={cn(
                            "text-center p-4 rounded-xl",
                            team2Won && "bg-emerald-500/20 border border-emerald-500/30"
                        )}>
                            <p className="text-sm text-white/60 mb-1">
                                {match.team2_tag ? `[${match.team2_tag}]` : ''} {match.team2_name || 'Team 2'}
                            </p>
                            <p className="text-4xl font-black">{match.team2_score}</p>
                        </div>
                    </motion.div>

                    {/* ELO Change */}
                    {match.match_type === 'ranked' && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-full 
                                       bg-white/10 border border-white/20"
                        >
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span className="text-white/60">Your ELO:</span>
                            <span className={cn(
                                "font-bold text-xl",
                                userEloChange > 0 && "text-emerald-400",
                                userEloChange < 0 && "text-rose-400",
                                userEloChange === 0 && "text-white/60"
                            )}>
                                {userEloChange > 0 ? '+' : ''}{userEloChange}
                            </span>
                            <span className="text-xs text-white/40">(50% of team change)</span>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Stats Section */}
            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Match Stats */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="grid grid-cols-4 gap-4 mb-8"
                >
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <Clock className="w-5 h-5 mx-auto mb-2 text-primary" />
                        <p className="text-2xl font-bold">{formatTime(match.match_duration_ms || 0)}</p>
                        <p className="text-xs text-white/50">Duration</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <Target className="w-5 h-5 mx-auto mb-2 text-emerald-400" />
                        <p className="text-2xl font-bold">{match.operation}</p>
                        <p className="text-xs text-white/50">Operation</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <Zap className="w-5 h-5 mx-auto mb-2 text-amber-400" />
                        <p className="text-2xl font-bold">{match.match_type}</p>
                        <p className="text-xs text-white/50">Match Type</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div className={cn(
                            "w-5 h-5 mx-auto mb-2 rounded-full",
                            match.connection_quality === 'GREEN' && "bg-emerald-500",
                            match.connection_quality === 'YELLOW' && "bg-amber-500",
                            match.connection_quality === 'RED' && "bg-rose-500"
                        )} />
                        <p className="text-2xl font-bold">{match.connection_quality}</p>
                        <p className="text-xs text-white/50">Connection</p>
                    </div>
                </motion.div>

                {/* Team Breakdowns */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Team 1 */}
                    <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className={cn(
                            "rounded-xl border overflow-hidden",
                            team1Won 
                                ? "bg-emerald-500/10 border-emerald-500/30" 
                                : "bg-white/5 border-white/10"
                        )}
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {team1Won && <Trophy className="w-5 h-5 text-amber-400" />}
                                <span className="font-bold">
                                    {match.team1_tag ? `[${match.team1_tag}]` : ''} {match.team1_name || 'Team 1'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black">{match.team1_score}</span>
                                {match.match_type === 'ranked' && (
                                    <span className={cn(
                                        "text-sm font-bold",
                                        match.team1_elo_change > 0 ? "text-emerald-400" : "text-rose-400"
                                    )}>
                                        {match.team1_elo_change > 0 ? '+' : ''}{match.team1_elo_change}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="divide-y divide-white/5">
                            {team1Players.map((player) => (
                                <div 
                                    key={player.user_id}
                                    className={cn(
                                        "flex items-center justify-between p-3",
                                        player.user_id === currentUserId && "bg-primary/10"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/10 
                                                        flex items-center justify-center text-sm font-bold">
                                            {player.player_name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <span className="font-medium text-sm">
                                                    {player.player_name}
                                                </span>
                                                {player.was_igl && (
                                                    <Crown className="w-3 h-3 text-amber-400" />
                                                )}
                                                {player.was_anchor && (
                                                    <Anchor className="w-3 h-3 text-purple-400" />
                                                )}
                                            </div>
                                            <p className="text-xs text-white/50">
                                                {player.operation_slot}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm">
                                        <div className="text-right">
                                            <p className="font-bold">{player.questions_correct}/{player.questions_attempted}</p>
                                            <p className="text-xs text-white/50">
                                                {(player.accuracy * 100).toFixed(0)}% acc
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-primary">+{Math.round(player.questions_correct * 100)}</p>
                                            <p className="text-xs text-white/50">pts</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Team 2 */}
                    <motion.div
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className={cn(
                            "rounded-xl border overflow-hidden",
                            team2Won 
                                ? "bg-emerald-500/10 border-emerald-500/30" 
                                : "bg-white/5 border-white/10"
                        )}
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {team2Won && <Trophy className="w-5 h-5 text-amber-400" />}
                                <span className="font-bold">
                                    {match.team2_tag ? `[${match.team2_tag}]` : ''} {match.team2_name || 'Team 2'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-black">{match.team2_score}</span>
                                {match.match_type === 'ranked' && (
                                    <span className={cn(
                                        "text-sm font-bold",
                                        match.team2_elo_change > 0 ? "text-emerald-400" : "text-rose-400"
                                    )}>
                                        {match.team2_elo_change > 0 ? '+' : ''}{match.team2_elo_change}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="divide-y divide-white/5">
                            {team2Players.map((player) => (
                                <div 
                                    key={player.user_id}
                                    className={cn(
                                        "flex items-center justify-between p-3",
                                        player.user_id === currentUserId && "bg-primary/10"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/10 
                                                        flex items-center justify-center text-sm font-bold">
                                            {player.player_name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <span className="font-medium text-sm">
                                                    {player.player_name}
                                                </span>
                                                {player.was_igl && (
                                                    <Crown className="w-3 h-3 text-amber-400" />
                                                )}
                                                {player.was_anchor && (
                                                    <Anchor className="w-3 h-3 text-purple-400" />
                                                )}
                                            </div>
                                            <p className="text-xs text-white/50">
                                                {player.operation_slot}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm">
                                        <div className="text-right">
                                            <p className="font-bold">{player.questions_correct}/{player.questions_attempted}</p>
                                            <p className="text-xs text-white/50">
                                                {(player.accuracy * 100).toFixed(0)}% acc
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-primary">+{Math.round(player.questions_correct * 100)}</p>
                                            <p className="text-xs text-white/50">pts</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* Actions */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="flex justify-center gap-4 mt-8"
                >
                    <Link 
                        href="/arena/modes"
                        className="px-8 py-4 rounded-xl bg-primary hover:bg-primary/80 
                                   text-black font-bold transition-colors flex items-center gap-2"
                    >
                        <Home className="w-5 h-5" />
                        Back to Arena
                    </Link>
                    <Link 
                        href="/arena/teams/setup?mode=5v5"
                        className="px-8 py-4 rounded-xl bg-white/10 hover:bg-white/20 
                                   text-white font-bold transition-colors"
                    >
                        Play Again
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}



