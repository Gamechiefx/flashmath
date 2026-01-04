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
    Zap, Shield
} from 'lucide-react';
import { 
    Party, PartyMember, PartyInvite,
    createParty, setPartyIGL, setPartyAnchor, 
    togglePartyReady, setPartyTargetMode, linkPartyToTeam,
    getPartyData, updatePartyQueueStatus
} from '@/lib/actions/social';
import { TeamWithElo } from '@/lib/actions/teams';
import { createAITeamMatch, BotDifficulty } from '@/lib/actions/team-matchmaking';
import { UserAvatar } from '@/components/user-avatar';
import { usePresence } from '@/lib/socket/use-presence';

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
    
    // #region agent log - H3: Track render count
    setupRenderCount++;
    if (setupRenderCount % 10 === 0 || setupRenderCount <= 5) {
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:RENDER',message:'Setup component render',data:{renderCount:setupRenderCount,userId:currentUserId?.slice(-8),queueStatus:party?.queueStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
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
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:MOUNT',message:'Setup page mounted',data:{fromQueue,initialQueueStatus:initialParty?.queueStatus,url:window.location.href,sessionStorage:sessionStorage.getItem('flashmath_just_left_queue')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D'})}).catch(()=>{});
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
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:MOUNT_EFFECT',message:'Mount effect running',data:{fromQueue,blockAutoRedirect:blockAutoRedirect.current,isRedirecting:isRedirecting.current,sessionStorage:storedValue,initialQueueStatusWasNull:initialQueueStatusWasNull.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
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
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:BLOCKED_BY_PROP',message:'Blocked by fromQueue prop - TEMPORARILY',data:{fromQueue},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // CRITICAL: After 5 seconds, unblock to allow following leader to NEW queues
            const unblockTimeout = setTimeout(() => {
                blockAutoRedirect.current = false;
                console.log('[TeamSetup] ⚠️ fromQueue block LIFTED after 5s grace period - can now follow new queues');
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:UNBLOCK_AFTER_GRACE',message:'Unblocked after 5s grace period',data:{fromQueue},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
            }, 5000);
            
            return () => clearTimeout(unblockTimeout);
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
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:POLL_RESULT',message:'Party poll result',data:{pollCount,currentQueueStatus:party?.queueStatus,polledQueueStatus:result.party?.queueStatus,partyId:result.party?.id,blockAutoRedirect:blockAutoRedirect.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            if (result.party) {
                if (result.party.queueStatus !== party?.queueStatus) {
                    console.log(`[TeamSetup] Poll #${pollCount}: queueStatus changed from "${party?.queueStatus}" to "${result.party.queueStatus}"`);
                }
                setParty(result.party);
            }
        }, 2000); // Poll every 2 seconds
        return () => clearInterval(interval);
    }, [party?.queueStatus]);

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
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:AUTO_REDIRECT_EFFECT',message:'Auto-redirect effect triggered',data:{timeSinceMount,queueStatus:party?.queueStatus,blockAutoRedirect:blockAutoRedirect.current,isRedirecting:isRedirecting.current,initialQueueStatusWasNull:initialQueueStatusWasNull.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
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
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:NEW_QUEUE_REDIRECT',message:'NEW queue detected - REDIRECTING to queue',data:{queueStatus:party.queueStatus,partyId:party.id,initialQueueStatusWasNull:initialQueueStatusWasNull.current,timeSinceMount:timeSinceMountForNewQueue},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            const phase = party.queueStatus === 'finding_teammates' 
                ? 'teammates' 
                : 'opponent';
            router.push(`/arena/teams/queue?partyId=${party.id}&phase=${phase}`);
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
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:EXISTING_QUEUE_REDIRECT',message:'REDIRECTING to queue page (existing queue)',data:{queueStatus:party.queueStatus,partyId:party.id,timeSinceMount,blockAutoRedirect:blockAutoRedirect.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,E'})}).catch(()=>{});
            // #endregion
            isRedirecting.current = true;
            const phase = party.queueStatus === 'finding_teammates' 
                ? 'teammates' 
                : 'opponent';
            router.push(`/arena/teams/queue?partyId=${party.id}&phase=${phase}`);
        } else {
            console.log('[TeamSetup] No queueStatus, staying on setup page');
        }
    }, [party?.queueStatus, party?.id, router, fromQueue]);
    
    // Real-time queue status listener - instant notification when leader starts queue
    useEffect(() => {
        // #region agent log - Track socket event processing
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_EFFECT',message:'Socket effect triggered',data:{hasUpdate:!!latestQueueStatusUpdate,updatePartyId:latestQueueStatusUpdate?.partyId,currentPartyId:party?.id,queueStatus:latestQueueStatusUpdate?.queueStatus,isRedirecting:isRedirecting.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
        // #endregion
        
        if (!latestQueueStatusUpdate) return;
        
        // Only react to updates for our party
        if (latestQueueStatusUpdate.partyId !== party?.id) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_WRONG_PARTY',message:'Socket update for different party - ignoring',data:{updatePartyId:latestQueueStatusUpdate.partyId,currentPartyId:party?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return;
        }
        
        // Don't redirect on null (that means queue was cancelled, we want to stay here)
        if (!latestQueueStatusUpdate.queueStatus) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_NULL_STATUS',message:'Socket update with null status - staying on setup',data:{partyId:party?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            return;
        }
        
        console.log('[TeamSetup] 🔌 Real-time queue status update:', latestQueueStatusUpdate.queueStatus);
        
        // If leader started a queue, follow them
        if (isRedirecting.current) {
            console.log('[TeamSetup] Already redirecting, ignoring socket event');
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_ALREADY_REDIRECTING',message:'Already redirecting - ignoring socket event',data:{partyId:party?.id,queueStatus:latestQueueStatusUpdate.queueStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
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
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_REDIRECTING',message:'Following leader to queue via socket',data:{partyId:party?.id,queueStatus:latestQueueStatusUpdate.queueStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
        // #endregion
        isRedirecting.current = true;
        blockAutoRedirect.current = false;
        
        // Clear sessionStorage since we're intentionally following the leader
        sessionStorage.removeItem('flashmath_just_left_queue');
        
        clearQueueStatusUpdate();
        const phase = latestQueueStatusUpdate.queueStatus === 'finding_teammates' 
            ? 'teammates' 
            : 'opponent';
        router.push(`/arena/teams/queue?partyId=${party?.id}&phase=${phase}`);
    }, [latestQueueStatusUpdate, party?.id, router, clearQueueStatusUpdate]);

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
        if (!party || !allReady || !hasIgl || !hasAnchor) return;
        console.log('[TeamSetup] === handleStartQueue CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'members:', party.members.length);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:START_QUEUE',message:'Leader starting queue - finding opponents',data:{partyId:party.id,memberCount:party.members.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FLOW'})}).catch(()=>{});
        // #endregion
        
        // Update queue status before navigating
        const result = await updatePartyQueueStatus(party.id, 'finding_opponents');
        console.log('[TeamSetup] updatePartyQueueStatus result:', result.success);
        
        // Notify all party members via socket for real-time sync
        if (result.success && result.partyMemberIds) {
            console.log('[TeamSetup] Notifying party members via socket:', result.partyMemberIds);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_NOTIFY_START',message:'Sending socket notification for queue start',data:{partyId:party.id,memberIds:result.partyMemberIds,status:'finding_opponents'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FLOW'})}).catch(()=>{});
            // #endregion
            notifyQueueStatusChange(result.partyMemberIds, 'finding_opponents', party.id);
        }
        
        console.log('[TeamSetup] Navigating to queue page');
        router.push(`/arena/teams/queue?partyId=${party.id}&phase=opponent`);
    };
    
    // ==========================================================================
    // AI MATCH - For Testing
    // ==========================================================================
    const [aiDifficulty, setAIDifficulty] = useState<BotDifficulty>('medium');
    const [showAIOptions, setShowAIOptions] = useState(false);
    
    const handleStartAIMatch = async () => {
        if (!party || !allReady || !hasIgl || !hasAnchor) return;
        console.log('[TeamSetup] === handleStartAIMatch CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'difficulty:', aiDifficulty);
        
        setLoading(true);
        setError(null);
        
        try {
            const result = await createAITeamMatch({
                partyId: party.id,
                difficulty: aiDifficulty,
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
        if (!party || !isLeader) return;
        console.log('[TeamSetup] === handleFindTeammates CALLED ===');
        console.log('[TeamSetup] partyId:', party.id, 'currentSize:', party.members.length);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:FIND_TEAMMATES',message:'Leader starting queue - finding teammates',data:{partyId:party.id,memberCount:party.members.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FLOW'})}).catch(()=>{});
        // #endregion
        
        // Update queue status before navigating
        const result = await updatePartyQueueStatus(party.id, 'finding_teammates');
        console.log('[TeamSetup] updatePartyQueueStatus result:', result.success);
        
        // Notify all party members via socket for real-time sync
        if (result.success && result.partyMemberIds) {
            console.log('[TeamSetup] Notifying party members via socket:', result.partyMemberIds);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-setup-client.tsx:SOCKET_NOTIFY_TEAMMATES',message:'Sending socket notification for finding teammates',data:{partyId:party.id,memberIds:result.partyMemberIds,status:'finding_teammates'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FLOW'})}).catch(()=>{});
            // #endregion
            notifyQueueStatusChange(result.partyMemberIds, 'finding_teammates', party.id);
        }
        
        console.log('[TeamSetup] Navigating to queue page');
        router.push(`/arena/teams/queue?partyId=${party.id}&phase=teammates`);
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
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <div className="border-b border-[var(--glass-border)] glass sticky top-0 z-40">
                <div className="max-w-4xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <Link 
                            href="/arena/modes"
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-sm font-medium">Back to Modes</span>
                        </Link>
                        
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-bold">
                                {mode} Team Arena
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-1 mb-8">
                    {['party', 'roles', 'ready'].map((s, i) => {
                        const isComplete = i < ['party', 'roles', 'ready'].indexOf(step);
                        const isCurrent = step === s;
                        
                        return (
                            <div key={s} className="flex items-center">
                                <motion.div
                                    initial={false}
                                    animate={{
                                        scale: isCurrent ? 1.1 : 1,
                                        backgroundColor: isComplete ? 'var(--color-primary)' : isCurrent ? 'var(--color-accent)' : 'transparent',
                                    }}
                                    className={cn(
                                        "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors",
                                        isComplete && "border-primary text-primary-foreground",
                                        isCurrent && "border-accent text-accent-foreground",
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
                                    <div className={cn(
                                        "w-8 h-0.5 mx-3",
                                        isComplete ? "bg-primary" : "bg-[var(--glass-border)]"
                                    )} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Queue Notification Banner - shows briefly before auto-redirect */}
                <AnimatePresence>
                    {party?.queueStatus && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -10, height: 0 }}
                            className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/30 
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
                            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 
                                       flex items-center gap-3 text-red-400"
                        >
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content Card */}
                <motion.div 
                    layout
                    className="glass rounded-2xl overflow-hidden"
                >
                    {/* Step 1: Party Formation */}
                    {step === 'party' && (
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
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
                                    className="text-center py-12"
                                >
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 
                                                    flex items-center justify-center border border-[var(--glass-border)]">
                                        <Users className="w-10 h-10 text-primary" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-2 text-card-foreground">
                                        Start a {mode} Party
                                    </h3>
                                    <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                                        Create a party and invite up to {requiredSize - 1} friends to compete together
                                    </p>
                                    <button
                                        onClick={handleCreateParty}
                                        disabled={loading}
                                        className={cn(
                                            "px-8 py-4 rounded-xl font-bold transition-all",
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
                                <div className="space-y-3">
                                    {/* Party Members */}
                                    {party.members.map((member, index) => (
                                        <motion.div
                                            key={member.odUserId}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-[var(--glass-border)]"
                                        >
                                            {/* Avatar with Frame */}
                                            <div className="relative">
                                                <UserAvatar
                                                    user={{
                                                        name: member.odName,
                                                        equipped_items: { frame: member.odEquippedFrame },
                                                    }}
                                                    size="sm"
                                                />
                                                {member.isLeader && (
                                                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center z-10">
                                                        <Crown size={10} className="text-accent-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-card-foreground truncate">
                                                        {member.odName}
                                                    </span>
                                                    {/* Rank Badge */}
                                                    <span className={cn(
                                                        "text-[7px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
                                                        getRankColors(member.odDuelRank)
                                                    )}>
                                                        {member.odDuelRank || 'BRONZE'} {member.odDuelDivision || 'I'}
                                                    </span>
                                                    {member.isLeader && (
                                                        <span className="text-[8px] text-accent uppercase tracking-widest font-bold">
                                                            Leader
                                                        </span>
                                                    )}
                                                    {member.odUserId === currentUserId && (
                                                        <span className="text-[8px] text-muted-foreground uppercase tracking-widest">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                    <span>LVL {member.odLevel}</span>
                                                    <span className="text-[var(--glass-border)]">•</span>
                                                    <span>{member.odElo5v5 || 300} ELO</span>
                                                </div>
                                            </div>

                                            {/* Status */}
                                            <div className={cn(
                                                "w-2.5 h-2.5 rounded-full ring-2 ring-background",
                                                member.odOnline ? "bg-green-500" : "bg-zinc-600"
                                            )} />
                                        </motion.div>
                                    ))}
                                    
                                    {/* Empty Slots */}
                                    {Array.from({ length: needsTeammates }).map((_, i) => (
                                        <motion.div
                                            key={`empty-${i}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: (partySize + i) * 0.05 }}
                                            className="flex items-center justify-center gap-2 p-3 rounded-xl
                                                       border border-dashed border-[var(--glass-border)] 
                                                       text-muted-foreground"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            <span className="text-xs">Slot {partySize + i + 1}</span>
                                        </motion.div>
                                    ))}

                                    {/* Find Teammates CTA */}
                                    {hasPartialParty && isLeader && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="mt-6 p-5 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-accent/10 
                                                       border border-primary/20 relative overflow-hidden"
                                        >
                                            {/* Glow effect */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 blur-xl" />
                                            
                                            <div className="relative flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent 
                                                                flex items-center justify-center flex-shrink-0 shadow-lg">
                                                    <Search className="w-6 h-6 text-primary-foreground" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-card-foreground mb-1 flex items-center gap-2">
                                                        Need {needsTeammates} more player{needsTeammates > 1 ? 's' : ''}?
                                                        <Sparkles className="w-4 h-4 text-accent" />
                                                    </h3>
                                                    <p className="text-sm text-muted-foreground mb-4">
                                                        Queue now and we'll match you with teammates of similar skill. 
                                                        Choose roles together once the team is formed.
                                                    </p>
                                                    <button
                                                        onClick={handleFindTeammates}
                                                        disabled={loading}
                                                        className={cn(
                                                            "px-6 py-3 rounded-xl font-bold transition-all",
                                                            "bg-gradient-to-r from-primary to-accent text-primary-foreground",
                                                            "hover:scale-105 hover:shadow-lg",
                                                            "flex items-center gap-2",
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
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
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
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                                    <Shield className="w-5 h-5 text-accent" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-card-foreground">Assign Roles</h2>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                        Choose your IGL and Anchor
                                    </p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* IGL Selection */}
                                <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Crown className="w-5 h-5 text-accent" />
                                        <h3 className="font-bold text-sm text-card-foreground">In-Game Leader</h3>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-4">
                                        Controls strategy, slot assignments, and timeouts
                                    </p>
                                    
                                    <div className="space-y-2">
                                        {party.members.map((member) => (
                                            <button
                                                key={member.odUserId}
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
                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Anchor className="w-5 h-5 text-primary" />
                                        <h3 className="font-bold text-sm text-card-foreground">Anchor</h3>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mb-4">
                                        Can use Double Call-In and Final Round Solo abilities
                                    </p>
                                    
                                    <div className="space-y-2">
                                        {party.members.map((member) => (
                                            <button
                                                key={member.odUserId}
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
                                <p className="text-center text-muted-foreground text-sm mt-6 flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Waiting for party leader to assign roles...
                                </p>
                            )}
                        </div>
                    )}

                    {/* Step 3: Ready Check */}
                    {step === 'ready' && party && (
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-5 h-5 text-green-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-card-foreground">Ready Check</h2>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                        {readyCount}/{party.members.length} ready
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 mb-8">
                                {party.members.map((member) => {
                                    const isReady = member.isReady || member.isLeader;
                                    return (
                                        <motion.div
                                            key={member.odUserId}
                                            animate={{ 
                                                backgroundColor: isReady ? 'rgba(34, 197, 94, 0.1)' : 'transparent'
                                            }}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all",
                                                isReady 
                                                    ? "border-green-500/30" 
                                                    : "border-[var(--glass-border)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Avatar or Ready Check */}
                                                <div className="relative">
                                                    {isReady ? (
                                                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                                                            <Check className="w-5 h-5 text-white" />
                                                        </div>
                                                    ) : (
                                                        <UserAvatar
                                                            user={{
                                                                name: member.odName,
                                                                equipped_items: { frame: member.odEquippedFrame },
                                                            }}
                                                            size="sm"
                                                        />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-card-foreground flex items-center gap-2">
                                                        {member.odName}
                                                        {member.isIgl && <Crown className="w-3.5 h-3.5 text-accent" />}
                                                        {member.isAnchor && <Anchor className="w-3.5 h-3.5 text-primary" />}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {isReady ? 'Ready!' : 'Not ready'}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            <div className="flex flex-col items-center gap-4">
                                {!isLeader && (
                                    <button
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
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleStartQueue}
                                                disabled={!allReady || loading}
                                                className={cn(
                                                    "px-12 py-5 rounded-xl font-bold text-lg transition-all",
                                                    allReady
                                                        ? "bg-gradient-to-r from-accent to-primary text-primary-foreground hover:scale-105 neon-glow"
                                                        : "bg-card text-muted-foreground cursor-not-allowed"
                                                )}
                                            >
                                                {loading ? (
                                                    <Loader2 className="w-6 h-6 animate-spin" />
                                                ) : allReady ? (
                                                    <span className="flex items-center gap-2">
                                                        <Zap className="w-5 h-5" />
                                                        Start Team Queue
                                                    </span>
                                                ) : (
                                                    `Waiting (${readyCount}/${party.members.length})`
                                                )}
                                            </button>
                                            
                                            {/* AI Match Button for Testing */}
                                            <button
                                                onClick={() => setShowAIOptions(!showAIOptions)}
                                                disabled={!allReady || loading}
                                                className={cn(
                                                    "px-6 py-5 rounded-xl font-bold text-lg transition-all",
                                                    allReady
                                                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-105 border-2 border-cyan-400/50"
                                                        : "bg-card text-muted-foreground cursor-not-allowed"
                                                )}
                                                title="Play against AI bots (for testing)"
                                            >
                                                <span className="flex items-center gap-2">
                                                    🤖 VS AI
                                                </span>
                                            </button>
                                        </div>
                                        
                                        {/* AI Options Panel */}
                                        <AnimatePresence>
                                            {showAIOptions && allReady && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="w-full max-w-md"
                                                >
                                                    <div className="p-4 glass rounded-xl border border-cyan-500/30">
                                                        <p className="text-xs text-muted-foreground mb-3 text-center">
                                                            🧪 Test Mode: Play against AI bots
                                                        </p>
                                                        
                                                        <div className="flex items-center justify-center gap-2 mb-4">
                                                            {(['easy', 'medium', 'hard', 'impossible'] as BotDifficulty[]).map((diff) => (
                                                                <button
                                                                    key={diff}
                                                                    onClick={() => setAIDifficulty(diff)}
                                                                    className={cn(
                                                                        "px-3 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                                                                        aiDifficulty === diff
                                                                            ? "bg-cyan-500 text-white"
                                                                            : "bg-card/50 text-muted-foreground hover:bg-card"
                                                                    )}
                                                                >
                                                                    {diff}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        
                                                        <button
                                                            onClick={handleStartAIMatch}
                                                            disabled={loading}
                                                            className="w-full px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-[1.02] transition-all"
                                                        >
                                                            {loading ? (
                                                                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                                            ) : (
                                                                <span className="flex items-center justify-center gap-2">
                                                                    🤖 Start AI Match ({aiDifficulty})
                                                                </span>
                                                            )}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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
            </div>
        </div>
    );
}
