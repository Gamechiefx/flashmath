'use client';

/**
 * Friend List Item Component
 * Displays a single friend with avatar, status, and actions
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, UserMinus, Coffee, X, Check } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import type { Friend } from '@/lib/actions/social';

type FriendStatus = 'online' | 'away' | 'offline';

interface FriendListItemProps {
    friend: Friend;
    status?: FriendStatus;
    inParty: boolean;
    onInviteToParty?: (friendId: string) => void;
    onRemoveFriend?: (friendId: string) => void;
    isInviting?: boolean;
}

// Status styling configurations
const STATUS_CONFIG = {
    online: {
        indicator: 'bg-green-500',
        glow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]',
        tile: 'bg-green-500/5 border-green-500/20',
        text: 'text-green-400',
        label: 'Online',
    },
    away: {
        indicator: 'bg-yellow-500',
        glow: 'shadow-[0_0_8px_rgba(234,179,8,0.5)]',
        tile: 'bg-yellow-500/5 border-yellow-500/20',
        text: 'text-yellow-400',
        label: 'Away',
    },
    offline: {
        indicator: 'bg-zinc-600',
        glow: '',
        tile: 'bg-white/0 border-transparent',
        text: 'text-zinc-500',
        label: 'Offline',
    },
};

export function FriendListItem({
    friend,
    status,
    inParty,
    onInviteToParty,
    onRemoveFriend,
    isInviting,
}: FriendListItemProps) {
    const [showActions, setShowActions] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    
    // Determine status from prop or fallback to odOnline
    const friendStatus: FriendStatus = status || (friend.odOnline ? 'online' : 'offline');
    const config = STATUS_CONFIG[friendStatus];
    
    const handleRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmingRemove(true);
    };
    
    const handleConfirmRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemoveFriend?.(friend.odUserId);
        setConfirmingRemove(false);
    };
    
    const handleCancelRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmingRemove(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all border",
                "hover:bg-white/5 group cursor-pointer",
                config.tile,
                friendStatus === 'offline' && "opacity-60"
            )}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            {/* Avatar */}
            <UserAvatar
                user={{
                    name: friend.odName,
                    equipped_items: { frame: friend.odEquippedFrame },
                }}
                size="sm"
                className={cn(
                    friendStatus === 'away' && "grayscale-[30%]",
                    friendStatus === 'offline' && "grayscale"
                )}
            />

            {/* Name, level, and rank */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "font-bold text-sm truncate",
                        friendStatus === 'offline' && "text-muted-foreground"
                    )}>
                        {friend.odName}
                    </span>
                    {/* Rank Badge */}
                    <span className={cn(
                        "text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                        friend.odDuelRank === 'DIAMOND' && "bg-cyan-500/20 text-cyan-400",
                        friend.odDuelRank === 'PLATINUM' && "bg-slate-300/20 text-slate-300",
                        friend.odDuelRank === 'GOLD' && "bg-yellow-500/20 text-yellow-400",
                        friend.odDuelRank === 'SILVER' && "bg-zinc-400/20 text-zinc-400",
                        friend.odDuelRank === 'BRONZE' && "bg-amber-700/20 text-amber-600",
                        !friend.odDuelRank && "bg-zinc-500/20 text-zinc-500"
                    )}>
                        {friend.odDuelRank || 'BRONZE'} {friend.odDuelDivision || 'I'}
                    </span>
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <span>LVL {friend.odLevel}</span>
                    <span className="text-zinc-600">•</span>
                    <span>{friend.odDuelElo || 300} ELO</span>
                    {friendStatus !== 'offline' && (
                        <span className={cn("ml-1 flex items-center gap-1", config.text)}>
                            {friendStatus === 'away' && <Coffee size={10} />}
                            ● {config.label}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <AnimatePresence mode="wait">
                {confirmingRemove ? (
                    <motion.div
                        key="confirm"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex items-center gap-1"
                    >
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider mr-1">
                            Remove?
                        </span>
                        <button
                            onClick={handleConfirmRemove}
                            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                            title="Confirm remove"
                        >
                            <Check size={12} />
                        </button>
                        <button
                            onClick={handleCancelRemove}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-muted-foreground transition-colors"
                            title="Cancel"
                        >
                            <X size={12} />
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="actions"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: showActions ? 1 : 0 }}
                        className="flex items-center gap-1"
                    >
                        {/* Invite to party (only if in party and friend is online) */}
                        {inParty && friend.odOnline && onInviteToParty && (
                            <button
                                data-testid={`invite-friend-${friend.odUserId}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onInviteToParty(friend.odUserId);
                                }}
                                disabled={isInviting}
                                className={cn(
                                    "p-2 rounded-lg transition-colors",
                                    "hover:bg-primary/20 text-primary",
                                    isInviting && "opacity-50"
                                )}
                                title="Invite to party"
                            >
                                <UserPlus size={14} />
                            </button>
                        )}

                        {/* Remove friend */}
                        {onRemoveFriend && (
                            <button
                                onClick={handleRemoveClick}
                                className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Remove friend"
                            >
                                <UserMinus size={14} />
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

