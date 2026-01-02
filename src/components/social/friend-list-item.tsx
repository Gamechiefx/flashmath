'use client';

/**
 * Friend List Item Component
 * Displays a single friend with avatar, status, and actions
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, UserMinus, MoreHorizontal } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import type { Friend } from '@/lib/actions/social';

interface FriendListItemProps {
    friend: Friend;
    inParty: boolean;
    onInviteToParty?: (friendId: string) => void;
    onRemoveFriend?: (friendId: string) => void;
    isInviting?: boolean;
}

export function FriendListItem({
    friend,
    inParty,
    onInviteToParty,
    onRemoveFriend,
    isInviting,
}: FriendListItemProps) {
    const [showActions, setShowActions] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
                "flex items-center gap-3 p-3 rounded-xl transition-all",
                "hover:bg-white/5 group cursor-pointer"
            )}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            {/* Avatar with online indicator */}
            <div className="relative">
                <UserAvatar
                    user={{
                        name: friend.odName,
                        equipped_items: { frame: friend.odEquippedFrame },
                    }}
                    size="sm"
                />
                {/* Online status indicator */}
                <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                    friend.odOnline ? "bg-green-500" : "bg-zinc-600"
                )} />
            </div>

            {/* Name and level */}
            <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">
                    {friend.odName}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    LVL {friend.odLevel}
                    {friend.odOnline && (
                        <span className="text-green-400 ml-2">● Online</span>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className={cn(
                "flex items-center gap-1 transition-opacity",
                showActions ? "opacity-100" : "opacity-0"
            )}>
                {/* Invite to party (only if in party and friend is online) */}
                {inParty && friend.odOnline && onInviteToParty && (
                    <button
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
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Remove ${friend.odName} from friends?`)) {
                                onRemoveFriend(friend.odUserId);
                            }
                        }}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                        title="Remove friend"
                    >
                        <UserMinus size={14} />
                    </button>
                )}
            </div>
        </motion.div>
    );
}

