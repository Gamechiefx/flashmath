'use client';

/**
 * Party Section Component
 * Displays current party or create party option
 * 
 * Enhanced with real-time Socket.IO indicators for member online status.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Crown, Plus, LogOut, UserPlus, Bell, Settings, Lock, Globe, ArrowUpCircle, Wifi, WifiOff } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import type { Party, PartyInvite, Friend } from '@/lib/actions/social';

type PresenceStatus = 'online' | 'away' | 'invisible' | 'in-match' | 'offline';

interface PartySectionProps {
    party: Party | null;
    invites: PartyInvite[];
    friends: Friend[];
    currentUserId?: string;
    /** Current user's own presence status */
    currentUserStatus?: PresenceStatus;
    /** IDs of users with pending outgoing friend requests */
    pendingFriendRequestIds?: string[];
    /** Real-time presence statuses for party members */
    memberStatuses?: Map<string, PresenceStatus>;
    onCreateParty: () => void;
    onLeaveParty: () => void;
    onInviteFriend: (friendId: string) => void;
    onAcceptInvite: (inviteId: string) => void;
    onDeclineInvite: (inviteId: string) => void;
    onUpdateSettings?: (settings: { inviteMode: 'open' | 'invite_only' }) => void;
    onAddFriend?: (userId: string) => void;
    onTransferLeadership?: (userId: string) => void;
    isLoading?: boolean;
}

export function PartySection({
    party,
    invites,
    friends,
    currentUserId,
    currentUserStatus,
    pendingFriendRequestIds = [],
    memberStatuses,
    onCreateParty,
    onLeaveParty,
    onInviteFriend,
    onAcceptInvite,
    onDeclineInvite,
    onUpdateSettings,
    onAddFriend,
    onTransferLeadership,
    isLoading,
}: PartySectionProps) {
    const [showInviteList, setShowInviteList] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const onlineFriends = friends.filter(f => f.odOnline);
    
    // Get set of friend IDs for quick lookup
    const friendIds = new Set(friends.map(f => f.odUserId));
    
    // Helper to get status color for a party member
    const getStatusColor = (memberId: string, fallbackOnline: boolean) => {
        // For current user, use their own status directly
        if (memberId === currentUserId && currentUserStatus) {
            if (currentUserStatus === 'online') return 'bg-green-500';
            if (currentUserStatus === 'away') return 'bg-amber-500';
            if (currentUserStatus === 'in-match') return 'bg-purple-500';
            if (currentUserStatus === 'invisible' || currentUserStatus === 'offline') return 'bg-zinc-600';
        }
        
        // For other members, use the memberStatuses map
        const status = memberStatuses?.get(memberId);
        if (status === 'online') return 'bg-green-500';
        if (status === 'away') return 'bg-amber-500';
        if (status === 'in-match') return 'bg-purple-500';
        if (status === 'invisible' || status === 'offline') return 'bg-zinc-600';
        // Fallback to database status
        return fallbackOnline ? 'bg-green-500' : 'bg-zinc-600';
    };

    // Determine if current user is the party leader
    const isLeader = party && currentUserId && party.leaderId === currentUserId;
    
    // Determine if current user can invite (leader or open mode)
    const canInvite = party && (isLeader || party.inviteMode === 'open');

    return (
        <div className="space-y-3">
            {/* Party Invites */}
            <AnimatePresence>
                {invites.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2"
                    >
                        <div className="text-[10px] font-bold uppercase tracking-widest text-accent flex items-center gap-2">
                            <Bell size={12} />
                            Party Invites ({invites.length})
                        </div>
                        {invites.map(invite => (
                            <motion.div
                                key={invite.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="p-3 rounded-xl bg-accent/10 border border-accent/20"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-bold text-sm">{invite.inviterName}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                            Invited you to their party
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onAcceptInvite(invite.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-accent text-black text-xs font-bold hover:bg-accent/80 transition-colors"
                                        >
                                            Join
                                        </button>
                                        <button
                                            onClick={() => onDeclineInvite(invite.id)}
                                            disabled={isLoading}
                                            className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold hover:bg-white/20 transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Current Party or Create Party */}
            {party ? (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    {/* Party Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-primary" />
                            <span className="font-bold text-sm">Your Party</span>
                            <span className="text-[10px] text-muted-foreground">
                                {party.members.length}/{party.maxSize}
                            </span>
                            {/* Invite Mode Indicator */}
                            <div className={cn(
                                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider",
                                party.inviteMode === 'open' 
                                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            )}>
                                {party.inviteMode === 'open' ? (
                                    <><Globe size={8} /> Open</>
                                ) : (
                                    <><Lock size={8} /> Invite Only</>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Settings button (leader only) */}
                            {isLeader && (
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors",
                                        showSettings 
                                            ? "bg-primary/20 text-primary" 
                                            : "hover:bg-white/10 text-muted-foreground hover:text-white"
                                    )}
                                    title="Party settings"
                                >
                                    <Settings size={14} />
                                </button>
                            )}
                            <button
                                data-testid="leave-party-button"
                                onClick={onLeaveParty}
                                disabled={isLoading}
                                className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Leave party"
                            >
                                <LogOut size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Leader Settings Panel */}
                    <AnimatePresence mode="wait">
                        {showSettings && isLeader && onUpdateSettings && (
                            <motion.div
                                initial={{ opacity: 0, scaleY: 0.8, originY: 0 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                exit={{ opacity: 0, scaleY: 0.8 }}
                                transition={{ 
                                    duration: 0.15, 
                                    ease: [0.4, 0, 0.2, 1]
                                }}
                                className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 overflow-hidden"
                            >
                                <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                                    <Settings size={12} />
                                    Party Settings
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[10px] text-muted-foreground mb-2">
                                        Who can invite friends?
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onUpdateSettings({ inviteMode: 'open' })}
                                            disabled={isLoading}
                                            className={cn(
                                                "flex-1 p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors",
                                                party.inviteMode === 'open'
                                                    ? "bg-green-500/30 text-green-400 border border-green-500/50"
                                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                            )}
                                        >
                                            <Globe size={12} />
                                            Anyone
                                        </button>
                                        <button
                                            onClick={() => onUpdateSettings({ inviteMode: 'invite_only' })}
                                            disabled={isLoading}
                                            className={cn(
                                                "flex-1 p-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors",
                                                party.inviteMode === 'invite_only'
                                                    ? "bg-amber-500/30 text-amber-400 border border-amber-500/50"
                                                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                            )}
                                        >
                                            <Lock size={12} />
                                            Leader Only
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Party Members */}
                    <div className="space-y-2">
                        {party.members.map(member => {
                            const isCurrentUser = member.odUserId === currentUserId;
                            const isFriend = friendIds.has(member.odUserId);
                            const hasPendingRequest = pendingFriendRequestIds.includes(member.odUserId);
                            const canAddFriend = !isCurrentUser && !isFriend && onAddFriend;
                            
                            return (
                                <div
                                    key={member.odUserId}
                                    className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
                                >
                                    <div className="relative">
                                        <UserAvatar
                                            user={{
                                                name: member.odName,
                                                equipped_items: { frame: member.odEquippedFrame },
                                            }}
                                            size="sm"
                                        />
                                        {member.isLeader && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                                <Crown size={10} className="text-black" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate flex items-center gap-2">
                                            {member.odName}
                                            {/* Rank Badge */}
                                            <span className={cn(
                                                "text-[7px] font-bold px-1 py-0.5 rounded uppercase tracking-wider",
                                                member.odDuelRank === 'DIAMOND' && "bg-cyan-500/20 text-cyan-400",
                                                member.odDuelRank === 'PLATINUM' && "bg-slate-300/20 text-slate-300",
                                                member.odDuelRank === 'GOLD' && "bg-yellow-500/20 text-yellow-400",
                                                member.odDuelRank === 'SILVER' && "bg-zinc-400/20 text-zinc-400",
                                                member.odDuelRank === 'BRONZE' && "bg-amber-700/20 text-amber-600",
                                                !member.odDuelRank && "bg-zinc-500/20 text-zinc-500"
                                            )}>
                                                {member.odDuelRank || 'BRONZE'} {member.odDuelDivision || 'I'}
                                            </span>
                                            {member.isLeader && (
                                                <span className="text-[8px] text-accent uppercase tracking-widest">
                                                    Leader
                                                </span>
                                            )}
                                            {isCurrentUser && (
                                                <span className="text-[8px] text-muted-foreground uppercase tracking-widest">
                                                    You
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <span>LVL {member.odLevel}</span>
                                            <span className="text-zinc-600">•</span>
                                            <span>{member.odDuelElo || 300} ELO</span>
                                        </div>
                                    </div>
                                    
                                    {/* Promote to Leader button (only for party leader, on other members) */}
                                    {isLeader && !isCurrentUser && onTransferLeadership && (
                                        <button
                                            onClick={() => onTransferLeadership(member.odUserId)}
                                            disabled={isLoading}
                                            className="p-1.5 rounded-lg hover:bg-accent/20 text-accent transition-colors"
                                            title={`Make ${member.odName} party leader`}
                                        >
                                            <ArrowUpCircle size={14} />
                                        </button>
                                    )}
                                    
                                    {/* Add Friend button for non-friends */}
                                    {canAddFriend && (
                                        hasPendingRequest ? (
                                            <span className="text-[9px] text-muted-foreground px-2 py-1 rounded bg-white/5">
                                                Pending
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => onAddFriend(member.odUserId)}
                                                disabled={isLoading}
                                                className="p-1.5 rounded-lg hover:bg-primary/20 text-primary transition-colors"
                                                title={`Add ${member.odName} as friend`}
                                            >
                                                <UserPlus size={14} />
                                            </button>
                                        )
                                    )}
                                    
                                    {/* Online/Offline indicator with animation */}
                                    <div className="relative flex items-center">
                                        <div className={cn(
                                            "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                            getStatusColor(member.odUserId, member.odOnline)
                                        )} />
                                        {/* Pulse animation for online status */}
                                        {(memberStatuses?.get(member.odUserId) === 'online' || 
                                          (memberStatuses?.get(member.odUserId) === undefined && member.odOnline)) && (
                                            <motion.div
                                                className="absolute w-2.5 h-2.5 rounded-full bg-green-500/50"
                                                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Invite Friend Button - only show if user can invite */}
                    {party.members.length < party.maxSize && canInvite && (
                        <div className="mt-3">
                            <button
                                data-testid="invite-friend-button"
                                onClick={() => setShowInviteList(!showInviteList)}
                                className="w-full p-3 rounded-lg border border-dashed border-white/20 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
                            >
                                <UserPlus size={14} />
                                <span className="text-xs font-bold uppercase tracking-widest">
                                    Invite Friend
                                </span>
                            </button>

                            {/* Friend invite list */}
                            <AnimatePresence>
                                {showInviteList && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-2 space-y-1 max-h-32 overflow-y-auto"
                                    >
                                        {onlineFriends.length === 0 ? (
                                            <div className="text-[10px] text-muted-foreground text-center py-2">
                                                No online friends to invite
                                            </div>
                                        ) : (
                                            onlineFriends.map(friend => (
                                                <button
                                                    key={friend.odUserId}
                                                    onClick={() => {
                                                        onInviteFriend(friend.odUserId);
                                                        setShowInviteList(false);
                                                    }}
                                                    className="w-full p-2 rounded-lg hover:bg-primary/10 text-left flex items-center gap-2 transition-colors"
                                                >
                                                    <UserAvatar
                                                        user={{
                                                            name: friend.odName,
                                                            equipped_items: { frame: friend.odEquippedFrame },
                                                        }}
                                                        size="sm"
                                                        className="w-6 h-6"
                                                    />
                                                    <span className="text-sm font-bold truncate">
                                                        {friend.odName}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Message when party is not full but user can't invite */}
                    {party.members.length < party.maxSize && !canInvite && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                            <div className="text-[10px] text-amber-400 flex items-center justify-center gap-2">
                                <Lock size={12} />
                                Only the party leader can invite
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <button
                    data-testid="create-party-social"
                    onClick={onCreateParty}
                    disabled={isLoading}
                    className={cn(
                        "w-full p-4 rounded-xl border border-dashed transition-all",
                        "border-white/20 hover:border-primary/50",
                        "bg-white/5 hover:bg-primary/10",
                        "flex items-center justify-center gap-3",
                        "group",
                        isLoading && "opacity-50"
                    )}
                >
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <Plus size={20} />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-sm">Create Party</div>
                        <div className="text-[10px] text-muted-foreground">
                            Invite friends to play together
                        </div>
                    </div>
                </button>
            )}
        </div>
    );
}

