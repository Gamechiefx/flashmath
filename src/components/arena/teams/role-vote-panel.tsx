'use client';

/**
 * RoleVotePanel
 * 
 * Democratic voting interface for IGL/Anchor selection.
 * Used when teams are formed from random players or when
 * the party leader enables voting mode.
 * 
 * Features:
 * - Vote for a player to be IGL or Anchor
 * - Real-time vote tallies
 * - Timer-based auto-resolution
 * - Tie-breaking logic (highest ELO)
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Crown, Anchor, Clock, Check, Users, Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';

interface VoteMember {
    odUserId: string;
    odName: string;
    odLevel: number;
    odDuelElo: number;
    odDuelRank: string;
    odDuelDivision: string;
    odEquippedFrame?: string;
    odEquippedAvatar?: string;
    isLeader: boolean;
    willingToIGL?: boolean;
    willingToAnchor?: boolean;
}

interface RoleVotePanelProps {
    role: 'igl' | 'anchor';
    members: VoteMember[];
    votes: Record<string, string>; // voterId -> votedForId
    currentUserId: string;
    timeRemaining: number;
    onVote: (votedForUserId: string) => void;
    onSkip?: () => void;
    isComplete?: boolean;
    winnerId?: string;
}

export function RoleVotePanel({
    role,
    members,
    votes,
    currentUserId,
    timeRemaining,
    onVote,
    onSkip,
    isComplete,
    winnerId,
}: RoleVotePanelProps) {
    const [hasVoted, setHasVoted] = useState(false);
    const myVote = votes[currentUserId];

    useEffect(() => {
        // Defer to avoid setState in effect warning
        setTimeout(() => {
            setHasVoted(!!myVote);
        }, 0);
    }, [myVote]);

    // Count votes per candidate
    const voteCounts = members.reduce((acc, member) => {
        acc[member.odUserId] = Object.values(votes).filter(v => v === member.odUserId).length;
        return acc;
    }, {} as Record<string, number>);

    // Find leader (most votes, tie = highest ELO)
    const sortedByVotes = [...members].sort((a, b) => {
        const aVotes = voteCounts[a.odUserId] || 0;
        const bVotes = voteCounts[b.odUserId] || 0;
        if (aVotes !== bVotes) return bVotes - aVotes;
        return b.odDuelElo - a.odDuelElo;
    });
    const currentLeader = sortedByVotes[0];

    const handleVote = (userId: string) => {
        if (hasVoted || isComplete) return;
        onVote(userId);
        setHasVoted(true);
    };

    // Timer urgency colors
    const timerColor = timeRemaining > 10 
        ? 'text-green-400' 
        : timeRemaining > 5 
            ? 'text-amber-400' 
            : 'text-red-400';

    const roleIcon = role === 'igl' 
        ? <Crown className="w-6 h-6" /> 
        : <Anchor className="w-6 h-6" />;
    
    const roleColor = role === 'igl' ? 'amber' : 'cyan';
    const roleLabel = role === 'igl' ? 'In-Game Leader' : 'Anchor';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl mx-auto"
        >
            {/* Header */}
            <div className={cn(
                "flex items-center justify-between px-6 py-4 rounded-t-2xl",
                role === 'igl' ? "bg-amber-500/20" : "bg-cyan-500/20"
            )}>
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        role === 'igl' ? "bg-amber-500/30 text-amber-400" : "bg-cyan-500/30 text-cyan-400"
                    )}>
                        {roleIcon}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            Vote for {roleLabel}
                        </h2>
                        <p className="text-sm text-white/60">
                            {role === 'igl' 
                                ? 'Makes strategic decisions during match' 
                                : 'Can use Double Call-In and Final Solo'
                            }
                        </p>
                    </div>
                </div>

                {/* Timer */}
                <div className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl",
                    "bg-black/30 border border-white/10"
                )}>
                    <Clock className={cn("w-5 h-5", timerColor)} />
                    <span className={cn("font-mono font-bold text-xl", timerColor)}>
                        0:{timeRemaining.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* Voting Area */}
            <div className="bg-slate-900/80 border border-white/10 border-t-0 rounded-b-2xl p-6">
                {isComplete && winnerId ? (
                    /* Winner Reveal */
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center py-8"
                    >
                        <motion.div
                            animate={{ rotate: [0, -5, 5, 0] }}
                            transition={{ duration: 0.5, repeat: 2 }}
                            className="inline-block mb-4"
                        >
                            <Sparkles className={cn(
                                "w-16 h-16",
                                role === 'igl' ? "text-amber-400" : "text-cyan-400"
                            )} />
                        </motion.div>
                        <h3 className="text-2xl font-bold text-white mb-2">
                            {members.find(m => m.odUserId === winnerId)?.odName} is {roleLabel}!
                        </h3>
                        <p className="text-white/60">
                            {voteCounts[winnerId] || 0} vote{(voteCounts[winnerId] || 0) !== 1 ? 's' : ''}
                        </p>
                    </motion.div>
                ) : (
                    /* Voting Grid */
                    <div className="grid grid-cols-5 gap-3">
                        {members.map((member, index) => {
                            const voteCount = voteCounts[member.odUserId] || 0;
                            const isMyVote = myVote === member.odUserId;
                            const isLeading = member.odUserId === currentLeader?.odUserId && voteCount > 0;
                            const isVolunteer = role === 'igl' ? member.willingToIGL : member.willingToAnchor;

                            return (
                                <motion.button
                                    key={member.odUserId}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={() => handleVote(member.odUserId)}
                                    disabled={hasVoted}
                                    className={cn(
                                        "relative p-4 rounded-xl border-2 transition-all",
                                        "flex flex-col items-center gap-2",
                                        hasVoted && !isMyVote && "opacity-50",
                                        isMyVote && role === 'igl' && "border-amber-500 bg-amber-500/20",
                                        isMyVote && role === 'anchor' && "border-cyan-500 bg-cyan-500/20",
                                        !isMyVote && "border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10",
                                        isLeading && !isMyVote && "border-green-500/50 bg-green-500/10"
                                    )}
                                >
                                    {/* Volunteer Badge */}
                                    {isVolunteer && (
                                        <div className={cn(
                                            "absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold",
                                            role === 'igl' ? "bg-amber-500 text-black" : "bg-cyan-500 text-black"
                                        )}>
                                            ★
                                        </div>
                                    )}

                                    {/* Leading indicator */}
                                    {isLeading && (
                                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 
                                                        px-2 py-0.5 rounded-full bg-green-500 
                                                        text-[10px] font-bold text-black">
                                            Leading
                                        </div>
                                    )}

                                    {/* Avatar */}
                                    <div className="relative">
                                        <UserAvatar
                                            name={member.odName}
                                            odEquippedAvatar={member.odEquippedAvatar}
                                            odEquippedFrame={member.odEquippedFrame}
                                            size="md"
                                        />
                                        {isMyVote && (
                                            <div className={cn(
                                                "absolute -bottom-1 -right-1 w-6 h-6 rounded-full",
                                                "flex items-center justify-center",
                                                role === 'igl' ? "bg-amber-500" : "bg-cyan-500"
                                            )}>
                                                <Check className="w-4 h-4 text-black" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Name */}
                                    <span className="text-sm font-bold text-white truncate max-w-full">
                                        {member.odName}
                                    </span>

                                    {/* ELO */}
                                    <span className="text-xs text-white/50">
                                        {member.odDuelElo} ELO
                                    </span>

                                    {/* Vote Count */}
                                    <div className={cn(
                                        "flex items-center gap-1 px-2 py-1 rounded-lg",
                                        "bg-white/10 text-white/70"
                                    )}>
                                        <Users className="w-3 h-3" />
                                        <span className="text-xs font-bold">{voteCount}</span>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                )}

                {/* Footer */}
                {!isComplete && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                        <p className="text-sm text-white/50">
                            {hasVoted 
                                ? `You voted for ${members.find(m => m.odUserId === myVote)?.odName}` 
                                : 'Click a player to vote'
                            }
                        </p>
                        
                        {hasVoted && onSkip && (
                            <button
                                onClick={onSkip}
                                className="px-4 py-2 rounded-lg bg-white/10 text-white/70 
                                           hover:bg-white/20 hover:text-white transition-colors
                                           text-sm font-medium"
                            >
                                Change Vote
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

