'use client';

/**
 * Friend List Item Component
 * Displays a single friend with avatar, status, and actions
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, UserMinus, Moon, Coffee } from 'lucide-react';
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
    
    // Determine status from prop or fallback to odOnline
    const friendStatus: FriendStatus = status || (friend.odOnline ? 'online' : 'offline');
    const config = STATUS_CONFIG[friendStatus];

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
            {/* Avatar with status indicator */}
            <div className="relative">
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
                {/* Status indicator dot */}
                <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                    config.indicator,
                    config.glow
                )} />
            </div>

            {/* Name and level */}
            <div className="flex-1 min-w-0">
                <div className={cn(
                    "font-bold text-sm truncate",
                    friendStatus === 'offline' && "text-muted-foreground"
                )}>
                    {friend.odName}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    LVL {friend.odLevel}
                    {friendStatus !== 'offline' && (
                        <span className={cn("ml-2 flex items-center gap-1", config.text)}>
                            {friendStatus === 'away' && <Coffee size={10} />}
                            ● {config.label}
                        </span>
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

