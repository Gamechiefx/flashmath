'use client';

/**
 * Team Setup Client
 * Revamped UI to match site aesthetic with glass effects,
 * theme-aware colors, and compact member cards
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    Users, Crown, Anchor, Check, ChevronRight,
    ArrowLeft, Loader2, AlertCircle, UserPlus, Search, Sparkles,
    Zap, Shield, Maximize, Minimize, X
} from 'lucide-react';
import { 
    Party, PartyMember, PartyInvite,
    createParty, setPartyIGL, setPartyAnchor, 
    togglePartyReady, setPartyTargetMode, linkPartyToTeam,
    getPartyData
} from '@/lib/actions/social';
import { updateQueueState } from '@/lib/party/party-redis';
import { TeamWithElo } from '@/lib/actions/teams';
import { createAITeamMatch, BotDifficulty } from '@/lib/actions/team-matchmaking';
import { UserAvatar } from '@/components/user-avatar';
import { usePresence } from '@/lib/socket/use-presence';
import { TeamPlayerCard, VSScreenBackground } from '@/components/arena/teams';

interface TeamSetupClientProps {
    mode: string;
    initialParty: Party | null;
    partyInvites: PartyInvite[];
    userTeams: TeamWithElo[];
    currentUserId: string;
    currentUserName: string;
    fromQueue?: boolean; // True if user just left the queue page
}

// Debug: Track render count for H3 hypothesis testing (module-level to persist across renders)
let setupRenderCount = 0;

// Rank color helper
function getRankColors(rank?: string) {
    switch (rank?.toUpperCase()) {
        case 'DIAMOND': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
        case 'PLATINUM': return 'bg-slate-300/20 text-slate-300 border-slate-300/30';
        case 'GOLD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        case 'SILVER': return 'bg-zinc-400/20 text-zinc-400 border-zinc-400/30';
        case 'BRONZE': return 'bg-amber-700/20 text-amber-600 border-amber-600/30';
        default: return 'bg-zinc-500/20 text-zinc-500 border-zinc-500/30';
    }
}

export function TeamSetupClient({
    mode,
    initialParty,
    partyInvites,
    userTeams,
    currentUserId,
    currentUserName,
    fromQueue = false,
}: TeamSetupClientProps) {
    const router = useRouter();
    const [party, setParty] = useState<Party | null>(initialParty);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'party' | 'roles' | 'ready'>('party');
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Track if we should suppress the queue banner (when user just canceled)
    // This starts as true if fromQueue is true, preventing the banner from flashing
    const [suppressQueueBanner, setSuppressQueueBanner] = useState(fromQueue);

    // Track fullscreen state changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        setIsFullscreen(!!document.fullscreenElement);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Toggle fullscreen
    const toggleFullscreen = async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                const elem = document.documentElement;
                if (elem.requestFullscreen) {
                    await elem.requestFullscreen();
                } else if ((elem as any).webkitRequestFullscreen) {
                    await (elem as any).webkitRequestFullscreen();
                }
            }
        } catch (err) {
            console.log('[TeamSetup] Fullscreen toggle failed:', err);
        }
    };
    
    // #region agent log - H3: Track render count
    setupRenderCount++;
    if (setupRenderCount % 10 === 0 || setupRenderCount <= 5) {
    }
    // #endregion
    
    // Debug: Log initial mount state
    const mountTime = useRef(Date.now());
    console.log('[TeamSetup] === COMPONENT MOUNT ===');
    console.log('[TeamSetup] fromQueue prop:', fromQueue);
    console.log('[TeamSetup] initialParty?.id:', initialParty?.id);
    console.log('[TeamSetup] initialParty?.queueStatus:', initialParty?.queueStatus);
    console.log('[TeamSetup] URL:', typeof window !== 'undefined' ? window.location.href : 'SSR');
    
    // #region agent log
    if (typeof window !== 'undefined') {
    }
    // #endregion

    const requiredSize = parseInt(mode.split('v')[0]) || 5;
    const isLeader = party?.leaderId === currentUserId;
    const partySize = party?.members.length || 0;
    const hasFullParty = partySize >= requiredSize;
    const hasPartialParty = partySize >= 1 && partySize < requiredSize;
    const needsTeammates = requiredSize - partySize;
    const hasIgl = !!party?.iglId;
    const hasAnchor = !!party?.anchorId;
    
    const readyCount = party?.members.filter(m => m.isReady || m.isLeader).length || 0;
    const allReady = readyCount >= (party?.members.length || 0);
    
    // Real-time presence for queue status updates
    // Pass userId/userName to avoid useSession dependency during navigation transitions
    const { latestQueueStatusUpdate, clearQueueStatusUpdate, notifyQueueStatusChange } = usePresence({
        userId: currentUserId,
        userName: currentUserName,
    });

    // Track if we're already redirecting to prevent multiple redirects
    const isRedirecting = useRef(false);
    // Block all auto-redirects - this is set by various checks below
    const blockAutoRedirect = useRef(true); // Start blocked, unblock after checks pass
    // Track the initial queueStatus to detect NEW queue starts
    const initialQueueStatusWasNull = useRef(initialParty?.queueStatus === null || initialParty?.queueStatus === undefined);
    
    // Check sessionStorage on client mount (runs after hydration)
    // This is the most reliable way to detect if we just left the queue
    useEffect(() => {
        console.log('[TeamSetup] === MOUNT EFFECT RUNNING ===');
        console.log('[TeamSetup] fromQueue:', fromQueue);
        console.log('[TeamSetup] blockAutoRedirect.current:', blockAutoRedirect.current);
        console.log('[TeamSetup] isRedirecting.current:', isRedirecting.current);
        console.log('[TeamSetup] initialQueueStatusWasNull:', initialQueueStatusWasNull.current);
        
        // Check what's in sessionStorage
        let storedValue: string | null = null;
        try {
            storedValue = sessionStorage.getItem('flashmath_just_left_queue');
            console.log('[TeamSetup] sessionStorage value:', storedValue);
        } catch (e) {
            console.log('[TeamSetup] sessionStorage error:', e);
        }
        
        // #region agent log
        // #endregion
        
        // If fromQueue prop is true AND initial queueStatus was null, block TEMPORARILY
        // This means we just left the queue and shouldn't immediately go back
        // BUT after a grace period (5s), we SHOULD follow the leader if they start a NEW queue
        if (fromQueue && initialQueueStatusWasNull.current) {
            blockAutoRedirect.current = true;
            // NOTE: Don't set isRedirecting.current = true here, that should only be set when actually redirecting
            sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                timestamp: Date.now(),
                partyId: initialParty?.id
            }));
            console.log('[TeamSetup] ✅ BLOCKING TEMPORARILY: fromQueue=true and queueStatus was null');
            // #region agent log
            // #endregion
            
            // CRITICAL: After 5 seconds, unblock to allow following leader to NEW queues
            const unblockTimeout = setTimeout(() => {
                blockAutoRedirect.current = false;
                setSuppressQueueBanner(false); // Also lift the banner suppression
                console.log('[TeamSetup] ⚠️ fromQueue block LIFTED after 5s grace period - can now follow new queues');
                // #region agent log
                // #endregion
            }, 5000);

            return () => clearTimeout(unblockTimeout);
        }
        
        // FIX: If fromQueue=true but queueStatus is NOT null, we have a STALE queue status
        // This happens when returning from match page - the queue status was never cleared
        // Clear it now to prevent the banner from showing
        if (fromQueue && !initialQueueStatusWasNull.current && initialParty?.id) {
            console.log('[TeamSetup] 🧹 STALE QUEUE STATUS DETECTED: fromQueue=true but queueStatus is not null');
            console.log('[TeamSetup] Clearing stale queue status...');
            // #region agent log
            // #endregion
            
            // Clear the stale queue status on the server
            (async () => {
                try {
                    const { updatePartyQueueStatus } = await import('@/lib/actions/social');
                    await updatePartyQueueStatus(initialParty.id, null);
                    console.log('[TeamSetup] ✅ Stale queue status cleared');
                    // Update local state to reflect the cleared status
                    setParty(prev => prev ? { ...prev, queueStatus: null } : null);
                    setSuppressQueueBanner(true); // Ensure banner stays hidden
                } catch (err) {
                    console.error('[TeamSetup] Failed to clear stale queue status:', err);
                }
            })();
            
            // Block auto-redirect and suppress banner since we're clearing stale state
            blockAutoRedirect.current = true;
            // Keep banner suppressed until we confirm the clear
            return;
        }
        
        // Check sessionStorage for recent "just left queue" marker
        try {
            const stored = sessionStorage.getItem('flashmath_just_left_queue');
            if (stored) {
                const parsed = JSON.parse(stored);
                const age = Date.now() - parsed.timestamp;
                console.log('[TeamSetup] sessionStorage marker age:', age, 'ms');
                if (age < 30000) {
                    blockAutoRedirect.current = true;
                    isRedirecting.current = true;
                    console.log('[TeamSetup] ✅ BLOCKING: found recent sessionStorage marker');
                    return;
                }
                // Stale marker, remove it
                console.log('[TeamSetup] Removing stale sessionStorage marker');
                sessionStorage.removeItem('flashmath_just_left_queue');
            }
        } catch (e) {
            console.log('[TeamSetup] sessionStorage parse error:', e);
        }
        
        // No block needed, but still wait 5 seconds before allowing auto-redirect
        // This gives time for any stale queueStatus to be cleared by polling
        console.log('[TeamSetup] No blocking condition found, will unblock after 5s grace period');
        const timeout = setTimeout(() => {
            blockAutoRedirect.current = false;
            setSuppressQueueBanner(false); // Also lift the banner suppression
            console.log('[TeamSetup] ⚠️ Auto-redirect block LIFTED after grace period');
        }, 5000);
        
        return () => clearTimeout(timeout);
    }, [fromQueue, initialParty?.id]);
    
    // Clean up sessionStorage after 30 seconds (for future navigations)
    useEffect(() => {
        const cleanup = setTimeout(() => {
            console.log('[TeamSetup] Cleaning up sessionStorage after 30s');
            sessionStorage.removeItem('flashmath_just_left_queue');
        }, 30000);
        return () => clearTimeout(cleanup);
    }, []);

    // Refresh party data periodically
    useEffect(() => {
        let pollCount = 0;
        const interval = setInterval(async () => {
            pollCount++;
            const result = await getPartyData();
            const prevStatus = party?.queueStatus;
            const newStatus = result.party?.queueStatus;
            const statusChanged = prevStatus !== newStatus;
            
            // #region agent log - Key: Track every poll result with change detection
            // #endregion
            if (result.party) {
                if (statusChanged) {
                    console.log(`[TeamSetup] 🔴 Poll #${pollCount}: queueStatus CHANGED from "${prevStatus}" to "${newStatus}"`);
                }
                setParty(result.party);
            }
        }, 2000); // Poll every 2 seconds
        return () => clearInterval(interval);
    }, [party?.queueStatus, suppressQueueBanner, fromQueue]);

    // Auto-redirect when queue status is detected (but only after checks pass)
    useEffect(() => {
        const timeSinceMount = Date.now() - mountTime.current;
        console.log('[TeamSetup] === AUTO-REDIRECT EFFECT ===');
        console.log('[TeamSetup] Time since mount:', timeSinceMount, 'ms');
        console.log('[TeamSetup] party?.queueStatus:', party?.queueStatus);
        console.log('[TeamSetup] blockAutoRedirect.current:', blockAutoRedirect.current);
        console.log('[TeamSetup] isRedirecting.current:', isRedirecting.current);
        console.log('[TeamSetup] initialQueueStatusWasNull:', initialQueueStatusWasNull.current);
        
        // #region agent log
        // #endregion
        
        // IMPORTANT: If queueStatus was null when we mounted but now it's set,
        // that means the LEADER STARTED A NEW QUEUE - we should follow!
        // Wait for the block to be lifted (after grace period) before allowing redirect.
        // The grace period protects against stale data, but once it's over, we can follow new queues.
        const timeSinceMountForNewQueue = Date.now() - mountTime.current;
        if (initialQueueStatusWasNull.current && party?.queueStatus && !blockAutoRedirect.current && !isRedirecting.current && timeSinceMountForNewQueue > 3000) {
            console.log('[TeamSetup] 🔥 NEW QUEUE DETECTED! queueStatus changed from null to:', party.queueStatus);
            console.log('[TeamSetup] Overriding block to follow leader to queue');
            
            // Clear the blocking since this is a NEW queue, not a stale one
            isRedirecting.current = true;
            
            // Clear sessionStorage since we're intentionally following the leader
            sessionStorage.removeItem('flashmath_just_left_queue');
            
            // #region agent log
            // #endregion
            
            const phase = party.queueStatus === 'finding_teammates' 
                ? 'teammates' 
                : 'opponent';
            router.push(`/arena/teams/queue?partyId=${party.id}&phase=${phase}&mode=${mode}`);
            return;
        } else if (initialQueueStatusWasNull.current && party?.queueStatus) {
            // Log why we're NOT redirecting (helps debug)
            console.log('[TeamSetup] ⚠️ Ignoring queueStatus - blocked or already redirecting:', {
                blockAutoRedirect: blockAutoRedirect.current,
                isRedirecting: isRedirecting.current,
                timeSinceMountForNewQueue,
                queueStatus: party.queueStatus
            });
        }
        
        // Check if we should block auto-redirect
        if (blockAutoRedirect.current) {
            console.log('[TeamSetup] ✅ BLOCKED by blockAutoRedirect ref');
            return;
        }
        
        // Already redirecting
        if (isRedirecting.current) {
            console.log('[TeamSetup] ✅ BLOCKED by isRedirecting ref');
            return;
        }
        
        // Double-check sessionStorage (belt and suspenders)
        try {
            const stored = sessionStorage.getItem('flashmath_just_left_queue');
            if (stored) {
                const parsed = JSON.parse(stored);
                const age = Date.now() - parsed.timestamp;
                console.log('[TeamSetup] sessionStorage age:', age, 'ms');
                if (age < 30000) {
                    console.log('[TeamSetup] ✅ BLOCKED by sessionStorage check');
                    return;
                }
            }
        } catch {}
        
        // Only redirect if party has active queue status
        if (party?.queueStatus) {
            console.log('[TeamSetup] ❌ REDIRECTING to queue! status:', party.queueStatus);
            // #region agent log
            // #endregion
            isRedirecting.current = true;
            const phase = party.queueStatus === 'finding_teammates' 
                ? 'teammates' 
                : 'opponent';
            router.push(`/arena/teams/queue?partyId=${party.id}&phase=${phase}&mode=${mode}`);
        } else {
            console.log('[TeamSetup] No queueStatus, staying on setup page');
        }
    }, [party?.queueStatus, party?.id, router, fromQueue]);
    
    // Real-time queue status listener - instant notification when leader starts queue
    useEffect(() => {
        // #region agent log - Track socket event processing
        // #endregion
        
        if (!latestQueueStatusUpdate) return;
        
        // Only react to updates for our party
        if (latestQueueStatusUpdate.partyId !== party?.id) {
            // #region agent log
            // #endregion
            return;
        }
        
        // Don't redirect on null (that means queue was cancelled, we want to stay here)
        if (!latestQueueStatusUpdate.queueStatus) {
            // #region agent log
            // #endregion
            return;
        }
        
        console.log('[TeamSetup] 🔌 Real-time queue status update:', latestQueueStatusUpdate.queueStatus);
        
        // If leader started a queue, follow them
        if (isRedirecting.current) {
            console.log('[TeamSetup] Already redirecting, ignoring socket event');
            // #region agent log
            // #endregion
            return;
        }
        
        // Check if this is an AI match notification
        if (latestQueueStatusUpdate.queueStatus.startsWith('ai_match:')) {
            const matchId = latestQueueStatusUpdate.queueStatus.replace('ai_match:', '');
            console.log('[TeamSetup] 🤖 AI Match started via socket - redirecting to match:', matchId);
            isRedirecting.current = true;
            clearQueueStatusUpdate();
            router.push(`/arena/teams/match/${matchId}?partyId=${party?.id}`);
            return;
        }
        
        console.log('[TeamSetup] 🔌 Queue started via socket - redirecting to queue');
        // #region agent log
        // #endregion
        isRedirecting.current = true;
        blockAutoRedirect.current = false;
        
        // Clear sessionStorage since we're intentionally following the leader
        sessionStorage.removeItem('flashmath_just_left_queue');
        
        clearQueueStatusUpdate();
        const phase = latestQueueStatusUpdate.queueStatus === 'finding_teammates' 
            ? 'teammates' 
            : 'opponent';
        router.push(`/arena/teams/queue?partyId=${party?.id}&phase=${phase}&mode=${mode}`);
    }, [latestQueueStatusUpdate, party?.id, router, clearQueueStatusUpdate, mode]);

    // Auto-advance steps
    useEffect(() => {
        if (hasFullParty && step === 'party') setStep('roles');
        if (hasIgl && hasAnchor && step === 'roles') setStep('ready');
    }, [hasFullParty, hasIgl, hasAnchor, step]);

    const handleCreateParty = async () => {
        setLoading(true);
        setError(null);
        const result = await createParty('invite_only');
        if (result.success && result.partyId) {
            await setPartyTargetMode(mode);
            const partyResult = await getPartyData();
            setParty(partyResult.party);
        } else {
            setError(result.error || 'Failed to create party');
        }
        setLoading(false);
    };

    const handleSetIGL = async (userId: string) => {
        if (!isLeader) return;
        setLoading(true);
        const result = await setPartyIGL(userId);
        if (result.success) {
            const partyResult = await getPartyData();
            setParty(partyResult.party);
        }
        setLoading(false);
    };

    const handleSetAnchor = async (userId: string) => {
        if (!isLeader) return;
        setLoading(true);
        const result = await setPartyAnchor(userId);
        if (result.success) {
            const partyResult = await getPartyData();
            setParty(partyResult.party);
        }
        setLoading(false);
    };

    const handleToggleReady = async () => {
        setLoading(true);
        const result = await togglePartyReady();
        if (result.success) {
            if (result.queueCancelled) {
                // Show notification that queue was cancelled
                setError('Queue cancelled because a player un-readied. Ready up again to requeue.');
                // Clear error after 5 seconds
                setTimeout(() => setError(null), 5000);
            }
            const partyResult = await getPartyData();
            setParty(partyResult.party);
        }
        setLoading(false);
    };

    const handleStartQueue = async () => {
        if (!party || !allReady || !hasIgl || !hasAnchor) {
            console.log('[TeamSetup] handleStartQueue early return - conditions not met:', {
                hasParty: !!party,
                allReady,
                hasIgl,
                hasAnchor
            });
            return;
        }
        console.log('[TeamSetup] === handleStartQueue CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'members:', party.members.length, 'matchType:', matchType);
        
        setLoading(true);
        
        // #region agent log - HD: Track when handleStartQueue sets queue status
        // #endregion
        
        // FIX: Clear the fromQueue URL parameter to reset navigation state
        // This prevents stale fromQueue=true from affecting future navigations
        if (typeof window !== 'undefined' && window.location.search.includes('fromQueue=true')) {
            const newUrl = window.location.pathname + '?mode=5v5';
            window.history.replaceState({}, '', newUrl);
            console.log('[TeamSetup] Cleared fromQueue parameter for new queue');
        }
        // Also clear sessionStorage marker since we're starting a new queue
        sessionStorage.removeItem('flashmath_just_left_queue');
        
        // Update queue status before navigating
        const result = await updateQueueState(party.id, currentUserId, 'finding_opponents', matchType);
        console.log('[TeamSetup] updateQueueState result:', result.success);
        
        // Notify all party members via socket for real-time sync
        if (result.success) {
            console.log('[TeamSetup] Notifying party members via socket');
            // #region agent log
            // #endregion
            const memberIds = party.members.map(m => m.odUserId);
            notifyQueueStatusChange(memberIds, 'finding_opponents', party.id);
        } else {
            // Queue failed to start - don't navigate, show error
            console.error('[TeamSetup] updateQueueState failed:', result.error);
            return;
        }

        console.log('[TeamSetup] Navigating to queue page');
        router.push(`/arena/teams/queue?partyId=${party.id}&phase=opponent&mode=${mode}`);
    };
    
    // ==========================================================================
    // MATCH TYPE SELECTION
    // ==========================================================================
    type MatchType = 'ranked' | 'casual' | 'vs_ai';
    const [matchType, setMatchType] = useState<MatchType>('ranked');
    const [aiDifficulty, setAIDifficulty] = useState<BotDifficulty>('medium');
    const [showAIOptions, setShowAIOptions] = useState(false);
    
    // State for showing role selection before AI match (for partial parties with 2+ humans)
    const [showRolesForAI, setShowRolesForAI] = useState(false);
    
    // For AI matches from the Ready step (full party with roles assigned)
    const handleStartAIMatch = async () => {
        if (!party || !allReady || !hasIgl || !hasAnchor) return;
        console.log('[TeamSetup] === handleStartAIMatch CALLED (Ready Step) ===');
        console.log('[TeamSetup] partyId:', party.id, 'difficulty:', aiDifficulty);
        await startAIMatchInternal();
    };

    // For AI matches from the Party step (solo/partial party)
    // If 2+ human players, always show role selection so leader can review/change
    const handleStartAIMatchFromParty = async () => {
        if (!party) return;
        console.log('[TeamSetup] === handleStartAIMatchFromParty CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'difficulty:', aiDifficulty, 'memberCount:', party.members.length);
        
        // If there are 2+ human players, always show role selection
        // This allows the leader to review and change roles before starting
        if (party.members.length >= 2) {
            console.log('[TeamSetup] Showing role selection for partial party (roles can be reviewed/changed)');
            setShowRolesForAI(true);
            return;
        }
        
        // Solo player - no role selection needed, start directly
        await startAIMatchInternal();
    };
    
    // Proceed with AI match after roles are assigned
    const handleConfirmRolesAndStartAI = async () => {
        if (!party || !hasIgl || !hasAnchor) return;
        console.log('[TeamSetup] === handleConfirmRolesAndStartAI CALLED ===');
        setShowRolesForAI(false);
        await startAIMatchInternal();
    };

    // Shared logic for starting AI matches
    const startAIMatchInternal = async () => {
        if (!party) return;
        console.log('[TeamSetup] === startAIMatchInternal ===');
        console.log('[TeamSetup] partyId:', party.id, 'difficulty:', aiDifficulty, 'mode:', mode);
        
        setLoading(true);
        setError(null);
        
        try {
            console.log('[TeamSetup] Calling createAITeamMatch with mode:', mode);
            const result = await createAITeamMatch({
                partyId: party.id,
                difficulty: aiDifficulty,
                mode: mode as '5v5' | '2v2',  // Pass the mode from URL params
            });
            
            if (!result.success || !result.matchId) {
                setError(result.error || 'Failed to create AI match');
                setLoading(false);
                return;
            }
            
            console.log('[TeamSetup] AI Match created:', result.matchId);
            
            // Notify OTHER party members via socket (exclude leader - they navigate directly)
            const otherMemberIds = party.members
                .filter(m => m.odUserId !== currentUserId)
                .map(m => m.odUserId);
            
            if (otherMemberIds.length > 0) {
                console.log('[TeamSetup] 🤖 Notifying other party members about AI match:', otherMemberIds);
                notifyQueueStatusChange(
                    otherMemberIds, 
                    `ai_match:${result.matchId}`, 
                    party.id
                );
                // Brief wait for socket message to be sent
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            console.log('[TeamSetup] Navigating leader to match page');
            // Navigate leader directly to the match page
            router.push(`/arena/teams/match/${result.matchId}?partyId=${party.id}`);
        } catch (err) {
            console.error('[TeamSetup] AI match error:', err);
            setError('Failed to create AI match');
            setLoading(false);
        }
    };

    const handleFindTeammates = async () => {
        if (!party || !isLeader) {
            console.log('[TeamSetup] handleFindTeammates early return - conditions not met:', {
                hasParty: !!party,
                isLeader
            });
            return;
        }
        console.log('[TeamSetup] === handleFindTeammates CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'currentSize:', party.members.length, 'matchType:', matchType);
        // #region agent log
        // #endregion
        
        // FIX: Clear the fromQueue URL parameter to reset navigation state
        // This prevents stale fromQueue=true from affecting future navigations
        if (typeof window !== 'undefined' && window.location.search.includes('fromQueue=true')) {
            const newUrl = window.location.pathname + '?mode=5v5';
            window.history.replaceState({}, '', newUrl);
            console.log('[TeamSetup] Cleared fromQueue parameter for new queue');
        }
        // Also clear sessionStorage marker since we're starting a new queue
        sessionStorage.removeItem('flashmath_just_left_queue');
        
        setLoading(true);
        setError(null);
        
        // #region agent log
        // #endregion
        
        try {
                // FIX: For CASUAL mode with partial parties, skip teammate search and go directly
                // to opponent search. AI teammates will be auto-filled by joinTeamQueue().
                // This allows solo/partial casual parties to match against each other.
                if (matchType === 'casual') {
                    console.log('[TeamSetup] CASUAL mode: Skipping teammate search, going directly to opponent search with AI teammates');
                    // #region agent log - HD: Track when setup page sets queue status
                    // #endregion
                    
                    // Update queue status to finding_opponents (not finding_teammates)
                    const result = await updateQueueState(party.id, currentUserId, 'finding_opponents', matchType);
                console.log('[TeamSetup] updateQueueState result:', result.success, 'error:', result.error);
                
                if (!result.success) {
                    setError(result.error || 'Failed to start queue');
                    setLoading(false);
                    return;
                }
                
                // Notify all party members via socket
                const memberIds = party.members.map(m => m.odUserId);
                notifyQueueStatusChange(memberIds, 'finding_opponents', party.id);
                
                // Navigate to queue with phase=opponent (AI teammates will be auto-added by joinTeamQueue)
                // Reset loading state before navigation to prevent stuck button
                setLoading(false);
                router.push(`/arena/teams/queue?partyId=${party.id}&phase=opponent&mode=${mode}`);
                return;
            }
            
            // RANKED mode: Continue with teammate search to find human teammates
            // Update queue status before navigating
            const result = await updateQueueState(party.id, currentUserId, 'finding_teammates', matchType);
            console.log('[TeamSetup] updateQueueState result:', result.success, 'error:', result.error);
            
            if (!result.success) {
                setError(result.error || 'Failed to start queue');
                setLoading(false);
                return;
            }
            
            // Notify all party members via socket for real-time sync
            console.log('[TeamSetup] Notifying party members via socket');
            // #region agent log
            // #endregion
            const memberIds = party.members.map(m => m.odUserId);
            notifyQueueStatusChange(memberIds, 'finding_teammates', party.id);
            
            console.log('[TeamSetup] Navigating to queue page');
            // #region agent log
            // #endregion
            // Reset loading state before navigation to prevent stuck button
            setLoading(false);
            router.push(`/arena/teams/queue?partyId=${party.id}&phase=teammates&mode=${mode}`);
        } catch (err: any) {
            console.error('[TeamSetup] handleFindTeammates error:', err);
            setError(err.message || 'An error occurred');
            setLoading(false);
        }
    };

    const handleLinkTeam = async (teamId: string) => {
        if (!isLeader) return;
        setLoading(true);
        const result = await linkPartyToTeam(teamId);
        if (result.success) {
            const partyResult = await getPartyData();
            setParty(partyResult.party);
        }
        setLoading(false);
    };

    return (
        <VSScreenBackground variant="strategy" className="h-screen overflow-hidden no-scrollbar text-foreground">
            {/* Header with entrance animation */}
            <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="border-b border-[var(--glass-border)] bg-black/40 backdrop-blur-xl sticky top-0 z-40"
            >
                <div className="max-w-4xl mx-auto px-4 py-2">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/arena/modes"
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-sm font-medium">Back to Modes</span>
                        </Link>

                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            className="flex items-center gap-2"
                        >
                            <span className="px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-bold animate-pulse">
                                {mode} Team Arena
                            </span>
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-primary hover:bg-primary/10 hover:border-primary/30 transition-all"
                                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                            >
                                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                            </button>
                        </motion.div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="max-w-4xl mx-auto px-4 py-3"
            >
                {/* Progress Steps with staggered entrance */}
                <div className="flex items-center justify-center gap-1 mb-4">
                    {['party', 'roles', 'ready'].map((s, i) => {
                        const isComplete = i < ['party', 'roles', 'ready'].indexOf(step);
                        const isCurrent = step === s;

                        return (
                            <motion.div
                                key={s}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 + i * 0.1, type: 'spring', stiffness: 200 }}
                                className="flex items-center"
                            >
                                <motion.div
                                    initial={false}
                                    animate={{
                                        scale: isCurrent ? 1.1 : 1,
                                        backgroundColor: isComplete ? 'var(--color-primary)' : isCurrent ? 'var(--color-accent)' : 'transparent',
                                    }}
                                    whileHover={{ scale: 1.15 }}
                                    className={cn(
                                        "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors",
                                        isComplete && "border-primary text-primary-foreground",
                                        isCurrent && "border-accent text-accent-foreground shadow-lg shadow-accent/30",
                                        !isComplete && !isCurrent && "border-[var(--glass-border)] text-muted-foreground"
                                    )}
                                >
                                    {isComplete ? <Check className="w-4 h-4" /> : i + 1}
                                </motion.div>
                                <span className={cn(
                                    "text-xs font-bold uppercase tracking-widest ml-2 hidden sm:block",
                                    isCurrent ? "text-accent" : isComplete ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {s === 'party' ? 'Party' : s === 'roles' ? 'Roles' : 'Ready'}
                                </span>
                                {i < 2 && (
                                    <motion.div
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{ delay: 0.6 + i * 0.1, duration: 0.3 }}
                                        className={cn(
                                            "w-8 h-0.5 mx-3 origin-left",
                                            isComplete ? "bg-primary" : "bg-[var(--glass-border)]"
                                        )}
                                    />
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* Queue Notification Banner - shows briefly before auto-redirect
                    IMPORTANT: Don't show if user just canceled/left queue (suppressQueueBanner) */}
                <AnimatePresence>
                    {party?.queueStatus && !suppressQueueBanner && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/30
                                       flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                    <div className="absolute inset-0 w-5 h-5 rounded-full bg-primary/20 animate-ping" />
                                </div>
                                <div>
                                    <p className="font-bold text-primary text-sm">
                                        {party.queueStatus === 'finding_teammates' 
                                            ? 'Finding Teammates...' 
                                            : 'Finding Opponents...'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Redirecting to queue...
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-primary text-sm font-medium">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Joining...
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error Display */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30
                                       flex items-center gap-3 text-red-400"
                        >
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content Card with dramatic entrance */}
                <motion.div
                    layout
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.6, duration: 0.5, type: 'spring', stiffness: 150 }}
                    className="glass rounded-2xl overflow-hidden shadow-2xl"
                >
                    {/* Step 1: Party Formation */}
                    {step === 'party' && (
                        <div className="p-4">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                        <Users className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-card-foreground">Form Your Party</h2>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                            {partySize}/{requiredSize} players
                                        </p>
                                    </div>
                                </div>
                                
                                {party && (
                                    <div className="text-right">
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                            Invite friends via
                                        </div>
                                        <div className="text-xs font-bold text-primary">Social Panel →</div>
                                    </div>
                                )}
                            </div>

                            {!party ? (
                                /* Create Party CTA */
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-center py-8"
                                >
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20
                                                    flex items-center justify-center border border-[var(--glass-border)]">
                                        <Users className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-bold mb-2 text-card-foreground">
                                        Start a {mode} Party
                                    </h3>
                                    <p className="text-muted-foreground text-sm mb-4 max-w-xs mx-auto">
                                        Create a party and invite up to {requiredSize - 1} friends to compete together
                                    </p>
                                    <button
                                        data-testid="create-party-button"
                                        onClick={handleCreateParty}
                                        disabled={loading}
                                        className={cn(
                                            "px-6 py-3 rounded-xl font-bold transition-all",
                                            "bg-gradient-to-r from-primary to-accent text-primary-foreground",
                                            "hover:scale-105 hover:shadow-lg neon-glow",
                                            "disabled:opacity-50 disabled:hover:scale-100"
                                        )}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <Zap className="w-5 h-5" />
                                                Create Party
                                            </span>
                                        )}
                                    </button>
                                </motion.div>
                            ) : (
                                <div className="space-y-2">
                                    {/* Party Members with Banners */}
                                    {party.members.map((member, index) => (
                                        <TeamPlayerCard
                                            key={member.odUserId}
                                            odUserId={member.odUserId}
                                            name={member.odName}
                                            level={member.odLevel}
                                            banner={member.odEquippedBanner || 'default'}
                                            frame={member.odEquippedFrame || 'default'}
                                            title={member.odEquippedTitle || 'Player'}
                                            rank={member.odDuelRank}
                                            division={member.odDuelDivision}
                                            isIgl={member.isIgl}
                                            isAnchor={member.isAnchor}
                                            isReady={member.isReady || member.isLeader}
                                            variant="compact"
                                            index={index}
                                            className={cn(
                                                member.isLeader && "ring-1 ring-accent/50",
                                                member.odUserId === currentUserId && "ring-1 ring-primary/50"
                                            )}
                                        />
                                    ))}
                                    
                                    {/* Empty Slots - Compact horizontal row */}
                                    <div className="flex gap-2">
                                        {Array.from({ length: needsTeammates }).map((_, i) => (
                                            <motion.div
                                                key={`empty-${i}`}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: (partySize + i) * 0.05 }}
                                                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg
                                                           border border-dashed border-[var(--glass-border)]
                                                           text-muted-foreground"
                                            >
                                                <UserPlus className="w-3 h-3" />
                                                <span className="text-[10px]">Slot {partySize + i + 1}</span>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Find Teammates CTA with Match Type Selection */}
                                    {hasPartialParty && isLeader && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="mt-2 p-2 rounded-lg bg-gradient-to-br from-primary/10 via-transparent to-accent/10
                                                       border border-primary/20 relative overflow-hidden"
                                        >
                                            {/* Glow effect */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 blur-xl" />

                                            <div className="relative space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent
                                                                    flex items-center justify-center flex-shrink-0">
                                                        <Search className="w-4 h-4 text-primary-foreground" />
                                                    </div>
                                                    <h3 className="font-bold text-card-foreground text-sm flex items-center gap-1">
                                                        Need {needsTeammates} more player{needsTeammates > 1 ? 's' : ''}?
                                                        <Sparkles className="w-3 h-3 text-accent" />
                                                    </h3>
                                                </div>

                                                {/* Match Type Selection for partial parties */}
                                                <div className="p-2 rounded-lg bg-card/50 border border-[var(--glass-border)]">
                                                    <p className="text-[10px] text-muted-foreground mb-1.5">Select Match Type:</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setMatchType('ranked')}
                                                            className={cn(
                                                                "flex-1 p-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1",
                                                                matchType === 'ranked'
                                                                    ? "bg-amber-500/20 border border-amber-500/50 text-amber-400"
                                                                    : "bg-card/50 border border-transparent hover:border-amber-500/30 text-muted-foreground"
                                                            )}
                                                        >
                                                            <span className="text-base">🏆</span>
                                                            <span>Ranked</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setMatchType('casual')}
                                                            className={cn(
                                                                "flex-1 p-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1",
                                                                matchType === 'casual'
                                                                    ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                                                                    : "bg-card/50 border border-transparent hover:border-emerald-500/30 text-muted-foreground"
                                                            )}
                                                        >
                                                            <span className="text-base">🎮</span>
                                                            <span>Casual</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setMatchType('vs_ai');
                                                                setShowAIOptions(true);
                                                            }}
                                                            className={cn(
                                                                "flex-1 p-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1",
                                                                matchType === 'vs_ai'
                                                                    ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-400"
                                                                    : "bg-card/50 border border-transparent hover:border-cyan-500/30 text-muted-foreground"
                                                            )}
                                                        >
                                                            <span className="text-base">🤖</span>
                                                            <span>VS AI</span>
                                                        </button>
                                                    </div>
                                                    
                                                    {/* AI difficulty + teammates info */}
                                                    <AnimatePresence>
                                                        {matchType === 'vs_ai' && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                className="mt-3 pt-3 border-t border-[var(--glass-border)]"
                                                            >
                                                                <p className="text-[10px] text-muted-foreground mb-2">AI Difficulty:</p>
                                                                <div className="flex gap-2">
                                                                    {(['easy', 'medium', 'hard', 'impossible'] as BotDifficulty[]).map((diff) => {
                                                                        const isSelected = aiDifficulty === diff;
                                                                        const diffStyles = {
                                                                            easy: {
                                                                                selected: 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/30',
                                                                                unselected: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
                                                                            },
                                                                            medium: {
                                                                                selected: 'bg-amber-500 text-white border-amber-400 shadow-amber-500/30',
                                                                                unselected: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
                                                                            },
                                                                            hard: {
                                                                                selected: 'bg-orange-500 text-white border-orange-400 shadow-orange-500/30',
                                                                                unselected: 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20',
                                                                            },
                                                                            impossible: {
                                                                                selected: 'bg-rose-500 text-white border-rose-400 shadow-rose-500/30',
                                                                                unselected: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
                                                                            },
                                                                        };
                                                                        return (
                                                                            <button
                                                                                key={diff}
                                                                                onClick={() => setAIDifficulty(diff)}
                                                                                className={cn(
                                                                                    "flex-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-all capitalize border-2",
                                                                                    isSelected && "shadow-lg scale-105",
                                                                                    isSelected ? diffStyles[diff].selected : diffStyles[diff].unselected
                                                                                )}
                                                                            >
                                                                                {diff}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <p className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
                                                                    <Sparkles className="w-3 h-3" />
                                                                    {needsTeammates} AI teammate{needsTeammates > 1 ? 's' : ''} will join your team
                                                                </p>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                                
                                                {/* Action Button */}
                                                {matchType === 'vs_ai' ? (
                                                    <button
                                                        onClick={handleStartAIMatchFromParty}
                                                        disabled={loading}
                                                        className={cn(
                                                            "w-full px-6 py-3 rounded-xl font-bold transition-all",
                                                            "bg-gradient-to-r from-cyan-600 to-blue-600 text-white",
                                                            "hover:scale-[1.02] hover:shadow-lg",
                                                            "flex items-center justify-center gap-2",
                                                            "disabled:opacity-50"
                                                        )}
                                                    >
                                                        {loading ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <>
                                                                🤖 Start VS AI Match
                                                                <span className="text-sm opacity-75">
                                                                    (+{needsTeammates} AI teammates)
                                                                </span>
                                                            </>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleFindTeammates}
                                                        disabled={loading}
                                                        className={cn(
                                                            "w-full px-6 py-3 rounded-xl font-bold transition-all",
                                                            "bg-gradient-to-r from-primary to-accent text-primary-foreground",
                                                            "hover:scale-[1.02] hover:shadow-lg",
                                                            "flex items-center justify-center gap-2",
                                                            "disabled:opacity-50"
                                                        )}
                                                    >
                                                        {loading ? (
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Zap className="w-5 h-5" />
                                                                Find Teammates
                                                                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                                                                    {partySize}/{requiredSize}
                                                                </span>
                                                                {matchType === 'ranked' && (
                                                                    <span className="text-xs opacity-75">🏆</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {hasPartialParty && !isLeader && (
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="mt-4 p-4 rounded-xl bg-card/50 border border-[var(--glass-border)] text-center"
                                        >
                                            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Waiting for party leader...
                                            </p>
                                        </motion.div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Role Assignment */}
                    {step === 'roles' && party && (
                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-xl bg-accent/20 flex items-center justify-center">
                                    <Shield className="w-4 h-4 text-accent" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-card-foreground">Assign Roles</h2>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                        Choose your IGL and Anchor
                                    </p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                {/* IGL Selection */}
                                <div className="p-3 rounded-xl bg-accent/5 border border-accent/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Crown className="w-4 h-4 text-accent" />
                                        <h3 className="font-bold text-sm text-card-foreground">In-Game Leader</h3>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-3">
                                        Controls strategy, slot assignments, and timeouts
                                    </p>
                                    
                                    <div className="space-y-2">
                                        {party.members.map((member) => (
                                            <button
                                                key={member.odUserId}
                                                data-testid={`igl-select-${member.odUserId}`}
                                                onClick={() => handleSetIGL(member.odUserId)}
                                                disabled={!isLeader || loading}
                                                className={cn(
                                                    "w-full p-3 rounded-lg flex items-center justify-between text-sm",
                                                    "border transition-all",
                                                    member.isIgl
                                                        ? "bg-accent/20 border-accent/50 text-accent"
                                                        : "bg-card/50 border-[var(--glass-border)] text-card-foreground hover:border-accent/30",
                                                    !isLeader && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <span className="font-medium">{member.odName}</span>
                                                {member.isIgl && <Crown className="w-4 h-4" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Anchor Selection */}
                                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Anchor className="w-4 h-4 text-primary" />
                                        <h3 className="font-bold text-sm text-card-foreground">Anchor</h3>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-3">
                                        Can use Double Call-In and Final Round Solo abilities
                                    </p>
                                    
                                    <div className="space-y-2">
                                        {party.members.map((member) => (
                                            <button
                                                key={member.odUserId}
                                                data-testid={`anchor-select-${member.odUserId}`}
                                                onClick={() => handleSetAnchor(member.odUserId)}
                                                disabled={!isLeader || loading}
                                                className={cn(
                                                    "w-full p-3 rounded-lg flex items-center justify-between text-sm",
                                                    "border transition-all",
                                                    member.isAnchor
                                                        ? "bg-primary/20 border-primary/50 text-primary"
                                                        : "bg-card/50 border-[var(--glass-border)] text-card-foreground hover:border-primary/30",
                                                    !isLeader && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <span className="font-medium">{member.odName}</span>
                                                {member.isAnchor && <Anchor className="w-4 h-4" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {!isLeader && (
                                <p className="text-center text-muted-foreground text-sm mt-4 flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Waiting for party leader to assign roles...
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 3: Ready Check */}
                    {step === 'ready' && party && (
                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-card-foreground">Ready Check</h2>
                                    <p data-testid="ready-count" className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                        {readyCount}/{party.members.length} ready
                                    </p>
                                </div>
                            </div>

                            {/* Match Type Selection */}
                            {isLeader && (
                                <div className="mb-4 p-3 rounded-xl glass border border-[var(--glass-border)]">
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                                        Match Type
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* Ranked */}
                                        <button
                                            onClick={() => setMatchType('ranked')}
                                            className={cn(
                                                "p-3 rounded-xl border-2 transition-all text-center",
                                                matchType === 'ranked'
                                                    ? "border-amber-500 bg-amber-500/20"
                                                    : "border-[var(--glass-border)] bg-card/50 hover:border-amber-500/50"
                                            )}
                                        >
                                            <div className="text-xl mb-1">🏆</div>
                                            <div className="font-bold text-sm text-card-foreground">Ranked</div>
                                            <div className="text-[10px] text-muted-foreground">ELO affected</div>
                                        </button>
                                        
                                        {/* Casual */}
                                        <button
                                            onClick={() => setMatchType('casual')}
                                            className={cn(
                                                "p-3 rounded-xl border-2 transition-all text-center",
                                                matchType === 'casual'
                                                    ? "border-emerald-500 bg-emerald-500/20"
                                                    : "border-[var(--glass-border)] bg-card/50 hover:border-emerald-500/50"
                                            )}
                                        >
                                            <div className="text-xl mb-1">🎮</div>
                                            <div className="font-bold text-sm text-card-foreground">Casual</div>
                                            <div className="text-[10px] text-muted-foreground">No ELO change</div>
                                        </button>

                                        {/* VS AI */}
                                        <button
                                            onClick={() => {
                                                setMatchType('vs_ai');
                                                setShowAIOptions(true);
                                            }}
                                            className={cn(
                                                "p-3 rounded-xl border-2 transition-all text-center",
                                                matchType === 'vs_ai'
                                                    ? "border-cyan-500 bg-cyan-500/20"
                                                    : "border-[var(--glass-border)] bg-card/50 hover:border-cyan-500/50"
                                            )}
                                        >
                                            <div className="text-xl mb-1">🤖</div>
                                            <div className="font-bold text-sm text-card-foreground">VS AI</div>
                                            <div className="text-[10px] text-muted-foreground">Practice mode</div>
                                        </button>
                                    </div>

                                    {/* AI difficulty selection */}
                                    <AnimatePresence>
                                        {matchType === 'vs_ai' && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3 pt-3 border-t border-[var(--glass-border)]"
                                            >
                                                <p className="text-xs text-muted-foreground mb-2">AI Difficulty:</p>
                                                <div className="flex gap-2">
                                                    {(['easy', 'medium', 'hard', 'impossible'] as BotDifficulty[]).map((diff) => {
                                                        const isSelected = aiDifficulty === diff;
                                                        const diffStyles = {
                                                            easy: {
                                                                selected: 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/30',
                                                                unselected: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20',
                                                            },
                                                            medium: {
                                                                selected: 'bg-amber-500 text-white border-amber-400 shadow-amber-500/30',
                                                                unselected: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20',
                                                            },
                                                            hard: {
                                                                selected: 'bg-orange-500 text-white border-orange-400 shadow-orange-500/30',
                                                                unselected: 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20',
                                                            },
                                                            impossible: {
                                                                selected: 'bg-rose-500 text-white border-rose-400 shadow-rose-500/30',
                                                                unselected: 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
                                                            },
                                                        };
                                                        return (
                                                            <button
                                                                key={diff}
                                                                onClick={() => setAIDifficulty(diff)}
                                                                className={cn(
                                                                    "flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition-all capitalize border-2",
                                                                    isSelected && "shadow-lg scale-105",
                                                                    isSelected ? diffStyles[diff].selected : diffStyles[diff].unselected
                                                                )}
                                                            >
                                                                {diff}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {partySize < requiredSize && (
                                                    <p className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
                                                        <Sparkles className="w-3 h-3" />
                                                        {requiredSize - partySize} AI teammate{requiredSize - partySize > 1 ? 's' : ''} will join your team
                                                    </p>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            <div className="space-y-2 mb-4">
                                {party.members.map((member, idx) => {
                                    const isReady = member.isReady || member.isLeader;
                                    return (
                                        <TeamPlayerCard
                                            key={member.odUserId}
                                            odUserId={member.odUserId}
                                            name={member.odName}
                                            level={member.odLevel}
                                            banner={member.odEquippedBanner || 'default'}
                                            frame={member.odEquippedFrame || 'default'}
                                            title={member.odEquippedTitle || 'Player'}
                                            rank={member.odDuelRank}
                                            division={member.odDuelDivision}
                                            isIgl={member.isIgl}
                                            isAnchor={member.isAnchor}
                                            isReady={isReady}
                                            variant="compact"
                                            index={idx}
                                            className={cn(
                                                isReady && "ring-2 ring-green-500/50"
                                            )}
                                        />
                                    );
                                })}
                            </div>

                            <div className="flex flex-col items-center gap-3">
                                {!isLeader && (
                                    <button
                                        data-testid="ready-button"
                                        onClick={handleToggleReady}
                                        disabled={loading}
                                        className={cn(
                                            "px-8 py-4 rounded-xl font-bold transition-all",
                                            party.members.find(m => m.odUserId === currentUserId)?.isReady
                                                ? "bg-card border border-[var(--glass-border)] text-card-foreground hover:bg-card/80"
                                                : "bg-green-500 hover:bg-green-600 text-white"
                                        )}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : party.members.find(m => m.odUserId === currentUserId)?.isReady ? (
                                            'Cancel Ready'
                                        ) : (
                                            '✓ Ready Up!'
                                        )}
                                    </button>
                                )}

                                {isLeader && (
                                    <div className="flex flex-col items-center gap-3">
                                        {/* Dynamic action button based on match type */}
                                        {matchType === 'vs_ai' ? (
                                            /* VS AI - Start immediately */
                                            <button
                                                data-testid="start-ai-match"
                                                onClick={handleStartAIMatch}
                                                disabled={!allReady || loading}
                                                className={cn(
                                                    "px-12 py-5 rounded-xl font-bold text-lg transition-all",
                                                    allReady
                                                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-105 border-2 border-cyan-400/50"
                                                        : "bg-card text-muted-foreground cursor-not-allowed"
                                                )}
                                            >
                                                {loading ? (
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                ) : allReady ? (
                                                    <span className="flex items-center gap-2">
                                                        🤖 Start VS AI Match
                                                        {partySize < requiredSize && (
                                                            <span className="text-sm opacity-75">
                                                                (+{requiredSize - partySize} AI teammates)
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    `Waiting (${readyCount}/${party.members.length})`
                                                )}
                                            </button>
                                        ) : (
                                            /* Ranked or Casual - Queue for opponents */
                                            <button
                                                data-testid="find-match-button"
                                                onClick={handleStartQueue}
                                                disabled={!allReady || loading}
                                                className={cn(
                                                    "px-12 py-5 rounded-xl font-bold text-lg transition-all",
                                                    allReady
                                                        ? matchType === 'ranked'
                                                            ? "bg-gradient-to-r from-amber-600 to-yellow-500 text-white hover:scale-105 neon-glow"
                                                            : "bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:scale-105"
                                                        : "bg-card text-muted-foreground cursor-not-allowed"
                                                )}
                                            >
                                                {loading ? (
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                ) : allReady ? (
                                                    <span className="flex items-center gap-2">
                                                        {matchType === 'ranked' ? '🏆' : '🎮'}
                                                        {matchType === 'ranked' ? 'Find Ranked Match' : 'Find Casual Match'}
                                                    </span>
                                                ) : (
                                                    `Waiting (${readyCount}/${party.members.length})`
                                                )}
                                            </button>
                                        )}
                                        
                                        {/* Match type summary */}
                                        {allReady && (
                                            <p className="text-xs text-muted-foreground">
                                                {matchType === 'ranked' && 'Your team ELO will be affected by this match'}
                                                {matchType === 'casual' && 'Practice match - no ELO changes'}
                                                {matchType === 'vs_ai' && `Playing against ${aiDifficulty} AI opponents`}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Link to Persistent Team */}
                {party && userTeams.length > 0 && step !== 'party' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 rounded-xl glass"
                    >
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3">
                            Link to persistent team
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {userTeams.map((team) => (
                                <button
                                    key={team.id}
                                    onClick={() => handleLinkTeam(team.id)}
                                    disabled={!isLeader || loading}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                                        party.teamId === team.id
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-card/50 border-[var(--glass-border)] text-card-foreground hover:border-primary/30",
                                        !isLeader && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {team.tag ? `[${team.tag}] ` : ''}{team.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </motion.div>
            
            {/* Role Selection Modal for VS AI with Partial Party */}
            <AnimatePresence>
                {showRolesForAI && party && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                        onClick={() => setShowRolesForAI(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-lg w-full mx-4"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-accent" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-white">
                                            {hasIgl && hasAnchor ? 'Confirm Roles' : 'Assign Roles'}
                                        </h3>
                                        <p className="text-xs text-white/50">
                                            {hasIgl && hasAnchor 
                                                ? 'Click any player to change roles'
                                                : 'Select IGL and Anchor before match'
                                            }
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowRolesForAI(false)}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <X className="w-5 h-5 text-white/50" />
                                </button>
                            </div>
                            
                            {/* IGL Selection */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Crown className="w-4 h-4 text-amber-400" />
                                    <h4 className="font-bold text-sm text-white">In-Game Leader (IGL)</h4>
                                </div>
                                <p className="text-xs text-white/50 mb-3">
                                    Controls strategy, slot assignments, and timeouts
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {party.members.map((member) => (
                                        <button
                                            key={`igl-${member.odUserId}`}
                                            onClick={() => handleSetIGL(member.odUserId)}
                                            disabled={loading}
                                            className={cn(
                                                "p-3 rounded-lg flex items-center gap-3 text-sm transition-all border",
                                                member.isIgl
                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                                                    : "bg-white/5 border-white/10 text-white hover:border-amber-500/30"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                member.isIgl ? "bg-amber-500/30" : "bg-white/10"
                                            )}>
                                                {member.odName?.charAt(0) || '?'}
                                            </div>
                                            <span className="font-medium truncate">{member.odName}</span>
                                            <div className="flex items-center gap-1 ml-auto">
                                                {member.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                                                {member.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Anchor Selection */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Anchor className="w-4 h-4 text-cyan-400" />
                                    <h4 className="font-bold text-sm text-white">Anchor</h4>
                                </div>
                                <p className="text-xs text-white/50 mb-3">
                                    Can be called in by IGL to take over any slot during breaks
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {party.members.map((member) => (
                                        <button
                                            key={`anchor-${member.odUserId}`}
                                            onClick={() => handleSetAnchor(member.odUserId)}
                                            disabled={loading}
                                            className={cn(
                                                "p-3 rounded-lg flex items-center gap-3 text-sm transition-all border",
                                                member.isAnchor
                                                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                                                    : "bg-white/5 border-white/10 text-white hover:border-cyan-500/30"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                                member.isAnchor ? "bg-cyan-500/30" : "bg-white/10"
                                            )}>
                                                {member.odName?.charAt(0) || '?'}
                                            </div>
                                            <span className="font-medium truncate">{member.odName}</span>
                                            <div className="flex items-center gap-1 ml-auto">
                                                {member.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                                                {member.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRolesForAI(false)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20
                                               text-white font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmRolesAndStartAI}
                                    disabled={!hasIgl || !hasAnchor || loading}
                                    className={cn(
                                        "flex-1 px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                                        hasIgl && hasAnchor
                                            ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-[1.02]"
                                            : "bg-white/10 text-white/50 cursor-not-allowed"
                                    )}
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            🤖 Start Match
                                        </>
                                    )}
                                </button>
                            </div>
                            
                            {/* Status indicator */}
                            {(!hasIgl || !hasAnchor) && (
                                <p className="mt-4 text-center text-xs text-amber-400">
                                    {!hasIgl && !hasAnchor 
                                        ? "Select both IGL and Anchor to continue"
                                        : !hasIgl 
                                            ? "Select an IGL to continue"
                                            : "Select an Anchor to continue"
                                    }
                                </p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </VSScreenBackground>
    );
}
