'use client';

/**
 * Party Section Component
 * Displays current party or create party option
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Crown, Plus, LogOut, UserPlus, Bell } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import type { Party, PartyInvite, Friend } from '@/lib/actions/social';

interface PartySectionProps {
    party: Party | null;
    invites: PartyInvite[];
    friends: Friend[];
    onCreateParty: () => void;
    onLeaveParty: () => void;
    onInviteFriend: (friendId: string) => void;
    onAcceptInvite: (inviteId: string) => void;
    onDeclineInvite: (inviteId: string) => void;
    isLoading?: boolean;
}

export function PartySection({
    party,
    invites,
    friends,
    onCreateParty,
    onLeaveParty,
    onInviteFriend,
    onAcceptInvite,
    onDeclineInvite,
    isLoading,
}: PartySectionProps) {
    const [showInviteList, setShowInviteList] = useState(false);
    const onlineFriends = friends.filter(f => f.odOnline);

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
                        </div>
                        <button
                            onClick={onLeaveParty}
                            disabled={isLoading}
                            className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                            title="Leave party"
                        >
                            <LogOut size={14} />
                        </button>
                    </div>

                    {/* Party Members */}
                    <div className="space-y-2">
                        {party.members.map(member => (
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
                                        {member.isLeader && (
                                            <span className="text-[8px] text-accent uppercase tracking-widest">
                                                Leader
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        LVL {member.odLevel}
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-2 h-2 rounded-full",
                                    member.odOnline ? "bg-green-500" : "bg-zinc-600"
                                )} />
                            </div>
                        ))}
                    </div>

                    {/* Invite Friend Button */}
                    {party.members.length < party.maxSize && (
                        <div className="mt-3">
                            <button
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
                </div>
            ) : (
                <button
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

