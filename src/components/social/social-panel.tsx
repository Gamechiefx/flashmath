'use client';

/**
 * Social Panel - Slide-out panel for friends, party, and social features
 * Slides in from the right side of the screen
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Users,
    UserPlus,
    ChevronDown,
    ChevronUp,
    Mail,
    Loader2,
    Circle,
    Clock,
    Shield,
} from 'lucide-react';
import { useSocial } from './social-provider';
import { FriendListItem } from './friend-list-item';
import { FriendRequestCard } from './friend-request-card';
import { PartySection } from './party-section';
import { cn } from '@/lib/utils';
import {
    getFriendsList,
    getPendingRequests,
    getPartyData,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    removeFriend,
    createParty,
    leaveParty,
    inviteToParty,
    acceptPartyInvite,
    declinePartyInvite,
    type Friend,
    type FriendRequest,
    type Party,
    type PartyInvite,
} from '@/lib/actions/social';
import { useSession } from 'next-auth/react';
import { usePresence, type PresenceStatus, notifyFriendRequest, notifyFriendRequestAccepted } from '@/lib/socket/use-presence';

type OnlineStatus = 'online' | 'away' | 'invisible';

export function SocialPanel() {
    const { data: session } = useSession();
    const { isPanelOpen, closePanel, refreshStats, stats } = useSocial();
    
    // Real-time presence
    const { 
        myStatus: presenceStatus, 
        setMyStatus: setPresenceStatus, 
        friendStatuses,
        requestFriendStatuses,
        pendingFriendRequests: realtimeFriendRequests,
        pendingPartyInvites: realtimePartyInvites,
    } = usePresence();

    // Data state
    const [friends, setFriends] = useState<Friend[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
    const [party, setParty] = useState<Party | null>(null);
    const [partyInvites, setPartyInvites] = useState<PartyInvite[]>([]);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [myStatus, setMyStatus] = useState<OnlineStatus>(presenceStatus as OnlineStatus || 'online');
    const [showParty, setShowParty] = useState(true);
    const [showRequests, setShowRequests] = useState(true);
    const [showOffline, setShowOffline] = useState(false);
    const [addFriendEmail, setAddFriendEmail] = useState('');
    const [addFriendError, setAddFriendError] = useState('');
    const [addFriendSuccess, setAddFriendSuccess] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Load all data
    const loadData = useCallback(async () => {
        if (!session?.user) return;
        setIsLoading(true);
        try {
            const [friendsRes, requestsRes, partyRes] = await Promise.all([
                getFriendsList(),
                getPendingRequests(),
                getPartyData(),
            ]);

            if (!friendsRes.error) {
                setFriends(friendsRes.friends);
                // Request real-time statuses for friends
                const friendIds = friendsRes.friends.map(f => f.odUserId);
                if (friendIds.length > 0) {
                    requestFriendStatuses(friendIds);
                }
            }
            if (!requestsRes.error) {
                setIncomingRequests(requestsRes.incoming);
                setOutgoingRequests(requestsRes.outgoing);
            }
            if (!partyRes.error) {
                setParty(partyRes.party);
                setPartyInvites(partyRes.invites);
            }
        } catch (error) {
            console.error('[Social] Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [session, requestFriendStatuses]);
    
    // Update friend online status from real-time presence
    const friendsWithRealTimeStatus = friends.map(f => {
        const realtimeStatus = friendStatuses.get(f.odUserId);
        // If we have real-time status info, use it exclusively
        // Otherwise fall back to database last_active timestamp
        let displayStatus: 'online' | 'away' | 'offline' = 'offline';
        
        if (realtimeStatus !== undefined) {
            // We have real-time status
            if (realtimeStatus === 'online') displayStatus = 'online';
            else if (realtimeStatus === 'away') displayStatus = 'away';
            else displayStatus = 'offline';
        } else {
            // Fall back to DB last_active
            displayStatus = f.odOnline ? 'online' : 'offline';
        }
        
        return {
            ...f,
            odOnline: displayStatus !== 'offline',
            odStatus: displayStatus,
        };
    });
    
    // Reload data when real-time notifications arrive
    useEffect(() => {
        if (realtimeFriendRequests.length > 0 || realtimePartyInvites.length > 0) {
            loadData();
            refreshStats();
        }
    }, [realtimeFriendRequests, realtimePartyInvites, loadData, refreshStats]);

    // Load data when panel opens
    useEffect(() => {
        if (isPanelOpen) {
            loadData();
        }
    }, [isPanelOpen, loadData]);

    // Filter friends by online status (using real-time data)
    // "Online" section includes both 'online' and 'away' statuses
    const onlineFriends = friendsWithRealTimeStatus.filter(f => f.odStatus === 'online' || f.odStatus === 'away');
    const offlineFriends = friendsWithRealTimeStatus.filter(f => f.odStatus === 'offline');
    
    // Sync status with presence hook
    const handleStatusChange = (status: OnlineStatus) => {
        setMyStatus(status);
        setPresenceStatus(status as PresenceStatus);
    };

    // Handlers
    const handleSendFriendRequest = async () => {
        if (!addFriendEmail.trim()) return;
        setAddFriendError('');
        setAddFriendSuccess('');
        setProcessingId('add-friend');

        const result = await sendFriendRequest(addFriendEmail.trim());
        if (result.success) {
            setAddFriendSuccess('Friend request sent!');
            setAddFriendEmail('');
            loadData();
            refreshStats();
            
            // Emit real-time notification to receiver
            if (result.receiverId && result.senderName) {
                notifyFriendRequest(result.receiverId, result.senderName);
            }
        } else {
            setAddFriendError(result.error || 'Failed to send request');
        }
        setProcessingId(null);
    };

    const handleAcceptRequest = async (requestId: string) => {
        setProcessingId(requestId);
        const result = await acceptFriendRequest(requestId);
        if (result.success) {
            loadData();
            refreshStats();
            
            // Emit real-time notification to the sender
            if (result.senderId && result.accepterName) {
                notifyFriendRequestAccepted(result.senderId, result.accepterName);
            }
        }
        setProcessingId(null);
    };

    const handleDeclineRequest = async (requestId: string) => {
        setProcessingId(requestId);
        await declineFriendRequest(requestId);
        loadData();
        refreshStats();
        setProcessingId(null);
    };

    const handleCancelRequest = async (requestId: string) => {
        setProcessingId(requestId);
        await cancelFriendRequest(requestId);
        loadData();
        setProcessingId(null);
    };

    const handleRemoveFriend = async (friendId: string) => {
        setProcessingId(friendId);
        await removeFriend(friendId);
        loadData();
        refreshStats();
        setProcessingId(null);
    };

    const handleCreateParty = async () => {
        setProcessingId('create-party');
        const result = await createParty();
        if (result.success) {
            loadData();
            refreshStats();
        }
        setProcessingId(null);
    };

    const handleLeaveParty = async () => {
        setProcessingId('leave-party');
        await leaveParty();
        loadData();
        refreshStats();
        setProcessingId(null);
    };

    const handleInviteToParty = async (friendId: string) => {
        setProcessingId(friendId);
        await inviteToParty(friendId);
        setProcessingId(null);
    };

    const handleAcceptPartyInvite = async (inviteId: string) => {
        setProcessingId(inviteId);
        const result = await acceptPartyInvite(inviteId);
        if (result.success) {
            loadData();
            refreshStats();
        }
        setProcessingId(null);
    };

    const handleDeclinePartyInvite = async (inviteId: string) => {
        setProcessingId(inviteId);
        await declinePartyInvite(inviteId);
        loadData();
        setProcessingId(null);
    };

    // Don't render if not logged in
    if (!session?.user) return null;

    return (
        <AnimatePresence>
            {isPanelOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closePanel}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className={cn(
                            "fixed right-0 top-0 bottom-0 z-50",
                            "w-full max-w-sm",
                            "bg-background/95 backdrop-blur-xl",
                            "border-l border-white/10",
                            "flex flex-col",
                            "shadow-[-20px_0_60px_rgba(0,0,0,0.5)]"
                        )}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                        <Users className="text-primary" size={20} />
                                    </div>
                                    <div>
                                        <h2 className="font-black text-lg uppercase tracking-tight">Social</h2>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                            {stats.friendsOnline} online • {Math.floor(stats.friendsTotal)} friends
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={closePanel}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Status Selector */}
                            <div className="mt-4 flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Status:
                                </span>
                                {(['online', 'away', 'invisible'] as OnlineStatus[]).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => handleStatusChange(status)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5",
                                            myStatus === status
                                                ? status === 'online'
                                                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                                    : status === 'away'
                                                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                                        : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                                                : "bg-white/5 text-muted-foreground hover:bg-white/10"
                                        )}
                                    >
                                        <Circle
                                            size={8}
                                            fill="currentColor"
                                            className={cn(
                                                status === 'online' && "text-green-400",
                                                status === 'away' && "text-yellow-400",
                                                status === 'invisible' && "text-zinc-500"
                                            )}
                                        />
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {isLoading && friends.length === 0 ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="animate-spin text-primary" size={24} />
                                </div>
                            ) : (
                                <>
                                    {/* Team Section - Coming Soon */}
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 opacity-60">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-zinc-500/20 flex items-center justify-center">
                                                <Shield size={20} className="text-zinc-500" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-zinc-400">Teams</div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    Coming Soon - Create permanent teams with friends
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Party Section (Collapsible) */}
                                    <div>
                                        <button
                                            onClick={() => setShowParty(!showParty)}
                                            className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 hover:text-foreground transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Users size={12} />
                                                Party
                                                {party && (
                                                    <span className="text-primary">
                                                        ({party.members.length}/{party.maxSize})
                                                    </span>
                                                )}
                                            </span>
                                            {showParty ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        
                                        <AnimatePresence>
                                            {showParty && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <PartySection
                                                        party={party}
                                                        invites={partyInvites}
                                                        friends={friendsWithRealTimeStatus}
                                                        onCreateParty={handleCreateParty}
                                                        onLeaveParty={handleLeaveParty}
                                                        onInviteFriend={handleInviteToParty}
                                                        onAcceptInvite={handleAcceptPartyInvite}
                                                        onDeclineInvite={handleDeclinePartyInvite}
                                                        isLoading={processingId !== null}
                                                    />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Friend Requests */}
                                    {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
                                        <div>
                                            <button
                                                onClick={() => setShowRequests(!showRequests)}
                                                className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Clock size={12} />
                                                    Pending Requests ({incomingRequests.length + outgoingRequests.length})
                                                </span>
                                                {showRequests ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                            </button>

                                            <AnimatePresence>
                                                {showRequests && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="space-y-2"
                                                    >
                                                        {incomingRequests.map(req => (
                                                            <FriendRequestCard
                                                                key={req.id}
                                                                request={req}
                                                                type="incoming"
                                                                onAccept={handleAcceptRequest}
                                                                onDecline={handleDeclineRequest}
                                                                isProcessing={processingId === req.id}
                                                            />
                                                        ))}
                                                        {outgoingRequests.map(req => (
                                                            <FriendRequestCard
                                                                key={req.id}
                                                                request={req}
                                                                type="outgoing"
                                                                onCancel={handleCancelRequest}
                                                                isProcessing={processingId === req.id}
                                                            />
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    {/* Friends List */}
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                            <Users size={12} />
                                            Friends
                                        </div>

                                        {/* Online Friends */}
                                        {onlineFriends.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-green-400 mb-2 flex items-center gap-1">
                                                    <Circle size={6} fill="currentColor" />
                                                    Online — {onlineFriends.length}
                                                </div>
                                                <div className="space-y-1">
                                                    {onlineFriends.map(friend => (
                                                        <FriendListItem
                                                            key={friend.id}
                                                            friend={friend}
                                                            status={friend.odStatus}
                                                            inParty={!!party}
                                                            onInviteToParty={handleInviteToParty}
                                                            onRemoveFriend={handleRemoveFriend}
                                                            isInviting={processingId === friend.odUserId}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Offline Friends */}
                                        {offlineFriends.length > 0 && (
                                            <div>
                                                <button
                                                    onClick={() => setShowOffline(!showOffline)}
                                                    className="w-full flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2"
                                                >
                                                    <span className="flex items-center gap-1">
                                                        <Circle size={6} fill="currentColor" />
                                                        Offline — {offlineFriends.length}
                                                    </span>
                                                    {showOffline ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                </button>

                                                <AnimatePresence>
                                                    {showOffline && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="space-y-1"
                                                        >
                                                            {offlineFriends.map(friend => (
                                                                <FriendListItem
                                                                    key={friend.id}
                                                                    friend={friend}
                                                                    status="offline"
                                                                    inParty={!!party}
                                                                    onRemoveFriend={handleRemoveFriend}
                                                                />
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        )}

                                        {/* Empty state */}
                                        {friends.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Users size={32} className="mx-auto mb-3 opacity-50" />
                                                <div className="text-sm font-bold">No friends yet</div>
                                                <div className="text-xs">Add friends by email below</div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Add Friend Footer */}
                        <div className="p-4 border-t border-white/10 shrink-0">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                                <UserPlus size={12} />
                                Add Friend
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="email"
                                        value={addFriendEmail}
                                        onChange={(e) => {
                                            setAddFriendEmail(e.target.value);
                                            setAddFriendError('');
                                            setAddFriendSuccess('');
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendFriendRequest()}
                                        placeholder="friend@email.com"
                                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                                    />
                                </div>
                                <button
                                    onClick={handleSendFriendRequest}
                                    disabled={!addFriendEmail.trim() || processingId === 'add-friend'}
                                    className={cn(
                                        "px-4 rounded-xl font-bold text-sm transition-all",
                                        "bg-primary text-primary-foreground hover:bg-primary/80",
                                        "disabled:opacity-50 disabled:cursor-not-allowed"
                                    )}
                                >
                                    {processingId === 'add-friend' ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        'Send'
                                    )}
                                </button>
                            </div>
                            {addFriendError && (
                                <div className="mt-2 text-[10px] text-red-400">{addFriendError}</div>
                            )}
                            {addFriendSuccess && (
                                <div className="mt-2 text-[10px] text-green-400">{addFriendSuccess}</div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

