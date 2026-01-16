'use client';

/**
 * Friend Request Card Component
 * Displays incoming or outgoing friend request with actions
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Clock } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';
import type { FriendRequest } from '@/lib/actions/social';

interface FriendRequestCardProps {
    request: FriendRequest;
    type: 'incoming' | 'outgoing';
    onAccept?: (requestId: string) => void;
    onDecline?: (requestId: string) => void;
    onCancel?: (requestId: string) => void;
    isProcessing?: boolean;
}

export function FriendRequestCard({
    request,
    type,
    onAccept,
    onDecline,
    onCancel,
    isProcessing,
}: FriendRequestCardProps) {
    const isIncoming = type === 'incoming';
    const displayName = isIncoming ? request.senderName : request.receiverName;
    const displayLevel = isIncoming ? request.senderLevel : request.receiverLevel;
    const displayFrame = isIncoming ? request.senderFrame : request.receiverFrame;

    // Time ago helper
    const getTimeAgo = (dateStr: string) => {
        // eslint-disable-next-line react-hooks/purity -- Time calculation for display
        const diff = Date.now() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
                "p-3 rounded-xl border transition-all",
                isIncoming
                    ? "bg-primary/5 border-primary/20"
                    : "bg-white/5 border-white/10"
            )}
        >
            <div className="flex items-center gap-3">
                <UserAvatar
                    user={{
                        name: displayName,
                        equipped_items: { frame: displayFrame },
                    }}
                    size="sm"
                />

                <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">
                        {displayName}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span>LVL {displayLevel}</span>
                        <span className="text-white/20">•</span>
                        <Clock size={10} />
                        <span>{getTimeAgo(request.createdAt)}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {isIncoming ? (
                        <>
                            <button
                                onClick={() => onAccept?.(request.id)}
                                disabled={isProcessing}
                                className={cn(
                                    "p-2 rounded-lg transition-colors",
                                    "bg-green-500/20 hover:bg-green-500/30 text-green-400",
                                    isProcessing && "opacity-50"
                                )}
                                title="Accept"
                            >
                                <Check size={14} />
                            </button>
                            <button
                                onClick={() => onDecline?.(request.id)}
                                disabled={isProcessing}
                                className={cn(
                                    "p-2 rounded-lg transition-colors",
                                    "bg-red-500/20 hover:bg-red-500/30 text-red-400",
                                    isProcessing && "opacity-50"
                                )}
                                title="Decline"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onCancel?.(request.id)}
                            disabled={isProcessing}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                                "bg-white/5 hover:bg-white/10 text-muted-foreground",
                                isProcessing && "opacity-50"
                            )}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

