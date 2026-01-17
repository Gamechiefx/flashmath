'use client';

/**
 * IGL Selection Modal
 * 
 * Allows team to choose IGL (In-Game Leader) and Anchor roles.
 * Used in two scenarios:
 * 1. Full Party (5/5): When party leader clicks "Queue" before matchmaking
 * 2. Partial Party (1-4): After teammates found, before opponent matching
 * 
 * Selection Methods:
 * - leader-pick: Original party leader decides (default for full parties)
 * - vote: All players vote (for assembled random teams)
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Anchor, Check, Clock, Users, Vote, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TeamMember {
    odUserId: string;
    odName: string;
    odLevel: number;
    odDuelElo: number;
    odElo5v5?: number;
    odDuelRank?: string;
    odDuelDivision?: string;
    odEquippedFrame?: string;
    odEquippedBanner?: string;
    odEquippedTitle?: string;
    isLeader: boolean;
    odOnline: boolean;
    willingToIGL?: boolean;
    willingToAnchor?: boolean;
}

interface IGLSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    members: TeamMember[];
    currentUserId: string;
    currentIGL: string | null;
    currentAnchor: string | null;
    isOriginalLeader: boolean; // Was the original party leader
    selectionMode: 'leader-pick' | 'vote';
    timeRemaining: number; // Seconds remaining for selection
    votes?: { iglVotes: Record<string, string[]>; anchorVotes: Record<string, string[]> };
    onSelectIGL: (userId: string) => void;
    onSelectAnchor: (userId: string) => void;
    onConfirm: () => void;
    onVoteIGL?: (userId: string) => void;
    onVoteAnchor?: (userId: string) => void;
}

export function IGLSelectionModal({
    isOpen,
    onClose: _onClose,
    members,
    currentUserId,
    currentIGL,
    currentAnchor,
    isOriginalLeader,
    selectionMode,
    timeRemaining,
    votes,
    onSelectIGL,
    onSelectAnchor,
    onConfirm,
    onVoteIGL,
    onVoteAnchor,
}: IGLSelectionModalProps) {
    const [activeTab, setActiveTab] = useState<'igl' | 'anchor'>('igl');
    
    // Check if selection is complete
    const isComplete = currentIGL !== null && currentAnchor !== null;
    const canConfirm = isComplete && (selectionMode === 'leader-pick' ? isOriginalLeader : true);

    // Get vote counts for each member
    const getIGLVotes = (userId: string) => votes?.iglVotes[userId]?.length || 0;
    const getAnchorVotes = (userId: string) => votes?.anchorVotes[userId]?.length || 0;

    // Check if current user has voted
    const hasVotedIGL = votes?.iglVotes && Object.values(votes.iglVotes).some(v => v.includes(currentUserId));
    const hasVotedAnchor = votes?.anchorVotes && Object.values(votes.anchorVotes).some(v => v.includes(currentUserId));

    // Sort members by ELO for display
    const sortedMembers = [...members].sort((a, b) => (b.odElo5v5 || b.odDuelElo) - (a.odElo5v5 || a.odDuelElo));


    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="w-full max-w-2xl mx-4 bg-card 
                               rounded-2xl border border-[var(--glass-border)] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-accent/10 to-primary/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-primary 
                                               flex items-center justify-center">
                                    <Users className="w-6 h-6 text-primary-foreground" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-card-foreground">Assign Team Roles</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {selectionMode === 'leader-pick' 
                                            ? 'Party leader selects roles' 
                                            : 'Vote for your preferred leaders'}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Timer */}
                            <div className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold",
                                timeRemaining <= 10 
                                    ? "bg-rose-500/20 text-rose-400 animate-pulse" 
                                    : "bg-white/10 text-white"
                            )}>
                                <Clock className="w-4 h-4" />
                                <span>{Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-[var(--glass-border)]">
                        <button
                            onClick={() => setActiveTab('igl')}
                            className={cn(
                                "flex-1 p-4 flex items-center justify-center gap-2 font-bold transition-all",
                                activeTab === 'igl'
                                    ? "bg-accent/10 text-accent border-b-2 border-accent"
                                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                            )}
                        >
                            <Crown className="w-5 h-5" />
                            <span>IGL</span>
                            {currentIGL && <Check className="w-4 h-4 text-green-500" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('anchor')}
                            className={cn(
                                "flex-1 p-4 flex items-center justify-center gap-2 font-bold transition-all",
                                activeTab === 'anchor'
                                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                            )}
                        >
                            <Anchor className="w-5 h-5" />
                            <span>Anchor</span>
                            {currentAnchor && <Check className="w-4 h-4 text-green-500" />}
                        </button>
                    </div>

                    {/* Role Description */}
                    <div className="p-4 bg-card/50">
                        {activeTab === 'igl' ? (
                            <div className="flex items-start gap-3">
                                <Crown className="w-5 h-5 text-accent mt-0.5" />
                                <div>
                                    <p className="font-bold text-accent">In-Game Leader (IGL)</p>
                                    <p className="text-sm text-muted-foreground">
                                        Controls strategy, assigns operation slots, and calls timeouts. 
                                        Best for experienced players with good game sense.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3">
                                <Anchor className="w-5 h-5 text-primary mt-0.5" />
                                <div>
                                    <p className="font-bold text-primary">Anchor</p>
                                    <p className="text-sm text-muted-foreground">
                                        Can use Double Call-In (play 2 slots in a round) and Final Round Solo 
                                        (play all 5 slots alone). Best for your most consistent player.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Member Selection */}
                    <div className="p-6 space-y-3 max-h-[300px] overflow-y-auto">
                        {sortedMembers.map((member) => {
                            const isSelectedIGL = currentIGL === member.odUserId;
                            const isSelectedAnchor = currentAnchor === member.odUserId;
                            const isSelected = activeTab === 'igl' ? isSelectedIGL : isSelectedAnchor;
                            const isDisabled = activeTab === 'anchor' && isSelectedIGL; // Can't be both
                            const voteCount = activeTab === 'igl' ? getIGLVotes(member.odUserId) : getAnchorVotes(member.odUserId);
                            const isWilling = activeTab === 'igl' ? member.willingToIGL : member.willingToAnchor;

                            const handleClick = () => {
                                if (isDisabled) return;
                                
                                if (selectionMode === 'leader-pick' && isOriginalLeader) {
                                    if (activeTab === 'igl') {
                                        onSelectIGL(member.odUserId);
                                    } else {
                                        onSelectAnchor(member.odUserId);
                                    }
                                } else if (selectionMode === 'vote') {
                                    if (activeTab === 'igl' && onVoteIGL) {
                                        onVoteIGL(member.odUserId);
                                    } else if (activeTab === 'anchor' && onVoteAnchor) {
                                        onVoteAnchor(member.odUserId);
                                    }
                                }
                            };

                            const canInteract = selectionMode === 'leader-pick' 
                                ? isOriginalLeader 
                                : (activeTab === 'igl' ? !hasVotedIGL : !hasVotedAnchor);

                            return (
                                <motion.button
                                    key={member.odUserId}
                                    onClick={handleClick}
                                    disabled={isDisabled || !canInteract}
                                    whileHover={canInteract && !isDisabled ? { scale: 1.02 } : {}}
                                    whileTap={canInteract && !isDisabled ? { scale: 0.98 } : {}}
                                    className={cn(
                                        "w-full p-4 rounded-xl flex items-center justify-between",
                                        "border-2 transition-all",
                                        isSelected
                                            ? activeTab === 'igl'
                                                ? "bg-accent/20 border-accent/50"
                                                : "bg-primary/20 border-primary/50"
                                            : "bg-card/50 border-[var(--glass-border)]",
                                        isDisabled && "opacity-40 cursor-not-allowed",
                                        !canInteract && !isSelected && "opacity-60 cursor-not-allowed",
                                        canInteract && !isDisabled && !isSelected && "hover:border-primary/30"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center font-bold",
                                            isSelected
                                                ? activeTab === 'igl' ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"
                                                : "bg-card text-card-foreground"
                                        )}>
                                            {member.odName.charAt(0)}
                                        </div>
                                        <div className="text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-card-foreground">{member.odName}</span>
                                                {member.odUserId === currentUserId && (
                                                    <span className="text-[10px] text-primary uppercase tracking-wider">(You)</span>
                                                )}
                                                {isWilling && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                                        Willing
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Level {member.odLevel} • {member.odElo5v5 || member.odDuelElo} ELO
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Vote count (vote mode) */}
                                        {selectionMode === 'vote' && voteCount > 0 && (
                                            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-card">
                                                <Vote className="w-3 h-3" />
                                                <span className="text-sm font-bold">{voteCount}</span>
                                            </div>
                                        )}

                                        {/* Selection indicator */}
                                        {isSelected && (
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center",
                                                activeTab === 'igl' ? "bg-accent" : "bg-primary"
                                            )}>
                                                {activeTab === 'igl' ? (
                                                    <Crown className="w-4 h-4 text-accent-foreground" />
                                                ) : (
                                                    <Anchor className="w-4 h-4 text-primary-foreground" />
                                                )}
                                            </div>
                                        )}

                                        {/* Already selected for other role */}
                                        {isDisabled && activeTab === 'anchor' && (
                                            <span className="text-xs text-accent">IGL</span>
                                        )}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-[var(--glass-border)] bg-background/50">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                                {selectionMode === 'vote' ? (
                                    <span className="flex items-center gap-2">
                                        <Vote className="w-4 h-4" />
                                        {hasVotedIGL && hasVotedAnchor 
                                            ? 'Votes submitted! Waiting for others...'
                                            : 'Vote for IGL and Anchor'}
                                    </span>
                                ) : isOriginalLeader ? (
                                    <span className="flex items-center gap-2">
                                        <UserCheck className="w-4 h-4" />
                                        Select both roles to continue
                                    </span>
                                ) : (
                                    <span>Waiting for party leader to select roles...</span>
                                )}
                            </div>

                            <button
                                onClick={onConfirm}
                                disabled={!canConfirm}
                                className={cn(
                                    "px-8 py-3 rounded-xl font-bold transition-all",
                                    canConfirm
                                        ? "bg-gradient-to-r from-accent to-primary text-primary-foreground hover:scale-105 neon-glow"
                                        : "bg-card text-muted-foreground cursor-not-allowed"
                                )}
                            >
                                {isComplete ? 'Confirm & Find Match' : 'Select Roles'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

