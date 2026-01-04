'use client';

/**
 * TeamQueueClient - Handles the two-phase queue flow for team matches
 * 
 * Phase 1 (teammates): Finding teammates for partial parties (1-4 players)
 * Phase 2 (igl_selection): IGL/Anchor selection after team is assembled
 * Phase 3 (opponent): Finding opponent team
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
    Loader2, Users, Crown, Anchor, Zap, Search, UserPlus,
    CheckCircle, AlertCircle, X, Vote, Clock
} from 'lucide-react';
import { Party, updatePartyQueueStatus } from '@/lib/actions/social';
import { 
    joinTeamQueue, 
    leaveTeamQueue, 
    checkTeamMatch,
    joinTeammateQueue,
    leaveTeammateQueue,
    leaveAssembledTeam,
    checkForTeammates,
    getAssembledTeam,
    selectIGL,
    selectAnchor,
    confirmIGLSelection,
    TeamQueueStatus,
    TeamMatchResult,
    AssembledTeam
} from '@/lib/actions/team-matchmaking';
import { IGLSelectionModal, TeamMember } from '@/components/arena/teams/igl-selection-modal';
import { usePresence } from '@/lib/socket/use-presence';

interface TeamQueueClientProps {
    partyId: string;
    party: Party;
    currentUserId: string;
    currentUserName: string;
    initialPhase: 'teammates' | 'opponent';
}

// Module-level state to persist across Fast Refresh
// This tracks which parties are currently redirecting to prevent re-entry
const redirectingParties = new Set<string>();

export function TeamQueueClient({
    partyId,
    party,
    currentUserId,
    currentUserName,
    initialPhase,
}: TeamQueueClientProps) {
    const router = useRouter();
    
    // Debug: Log initial mount state
    const mountTime = useRef(Date.now());
    console.log('[TeamQueue] === COMPONENT MOUNT ===');
    console.log('[TeamQueue] partyId:', partyId);
    console.log('[TeamQueue] party.queueStatus:', party.queueStatus);
    console.log('[TeamQueue] initialPhase:', initialPhase);
    console.log('[TeamQueue] isLeader:', party.leaderId === currentUserId);
    console.log('[TeamQueue] URL:', typeof window !== 'undefined' ? window.location.href : 'SSR');
    
    // #region agent log
    if (typeof window !== 'undefined') {
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:MOUNT',message:'Queue page mounted',data:{partyId,queueStatus:party.queueStatus,initialPhase,isLeader:party.leaderId===currentUserId,url:window.location.href},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
    }
    // #endregion
    
    // Queue state
    const [phase, setPhase] = useState<'teammates' | 'igl_selection' | 'opponent' | 'match_found'>(
        initialPhase === 'teammates' ? 'teammates' : 'opponent'
    );
    const [queueStatus, setQueueStatus] = useState<TeamQueueStatus | null>(null);
    const [match, setMatch] = useState<TeamMatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isJoining, setIsJoining] = useState(true);
    const [isLeaving, setIsLeaving] = useState(false);
    
    // IGL Selection state
    const [assembledTeam, setAssembledTeam] = useState<AssembledTeam | null>(null);
    const [showIGLModal, setShowIGLModal] = useState(false);
    const [iglSelectionTime, setIglSelectionTime] = useState(25);
    const [newPartyId, setNewPartyId] = useState<string | null>(null);
    
    const isLeader = party.leaderId === currentUserId;
    const partySize = party.members.length;
    const needsTeammates = partySize < 5;
    
    // Real-time presence for queue status updates
    // Pass userId/userName to avoid useSession dependency during navigation transitions
    const { latestQueueStatusUpdate, clearQueueStatusUpdate, notifyQueueStatusChange } = usePresence({
        userId: currentUserId,
        userName: currentUserName,
    });

    // =========================================================================
    // DETECT QUEUE CANCELLATION - Redirect members when leader leaves queue
    // =========================================================================
    
    // Track if we're already redirecting to prevent multiple navigations
    // Use module-level variable to persist across Fast Refresh
    const isRedirectingRef = useRef(false);
    // Track consecutive "no queue status" polls to prevent false positives
    const noQueueStatusCount = useRef(0);
    
    // CRITICAL FIX: On mount, immediately check fresh queue status from server
    // This handles the case where Fast Refresh remounts with stale props
    // Use module-level Set to persist state across Fast Refresh
    const hasCheckedFreshStatus = useRef(false);
    useEffect(() => {
        // Check module-level state first (persists across Fast Refresh)
        if (redirectingParties.has(partyId)) {
            console.log('[TeamQueue] ⚠️ Module-level check: Already redirecting this party');
            // Force immediate redirect
            router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
            return;
        }
        
        if (hasCheckedFreshStatus.current || isRedirectingRef.current) return;
        hasCheckedFreshStatus.current = true;
        
        // Immediately fetch fresh party data to verify queue status
        const checkFreshStatus = async () => {
            const { getPartyData } = await import('@/lib/actions/social');
            const result = await getPartyData();
            
            // #region agent log - H6: Track fresh status check
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:FRESH_STATUS_CHECK',message:'Fresh queue status check on mount',data:{propsQueueStatus:party.queueStatus,freshQueueStatus:result.party?.queueStatus,userId:currentUserId?.slice(-8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6'})}).catch(()=>{});
            // #endregion
            
            if (!result.party?.queueStatus) {
                console.log('[TeamQueue] ⚠️ Fresh check: queueStatus is NULL - redirecting to setup');
                isRedirectingRef.current = true;
                redirectingParties.add(partyId); // Persist across Fast Refresh
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                        timestamp: Date.now(),
                        partyId: partyId
                    }));
                }
                router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
                
                // Clear from set after a delay (navigation should complete)
                setTimeout(() => {
                    redirectingParties.delete(partyId);
                }, 5000);
            }
        };
        
        checkFreshStatus();
    }, [party.queueStatus, partyId, router, currentUserId]);
    
    // Real-time queue status listener - instant notification when leader cancels
    useEffect(() => {
        // #region agent log - Track socket event processing on queue page
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:SOCKET_EFFECT',message:'Queue page socket effect triggered',data:{hasUpdate:!!latestQueueStatusUpdate,updatePartyId:latestQueueStatusUpdate?.partyId,currentPartyId:partyId,queueStatus:latestQueueStatusUpdate?.queueStatus,isRedirecting:isRedirectingRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
        // #endregion
        
        if (!latestQueueStatusUpdate) return;
        
        // Only react to updates for our party
        if (latestQueueStatusUpdate.partyId !== partyId) {
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:SOCKET_WRONG_PARTY',message:'Socket update for different party - ignoring',data:{updatePartyId:latestQueueStatusUpdate.partyId,currentPartyId:partyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return;
        }
        
        console.log('[TeamQueue] Real-time queue status update:', latestQueueStatusUpdate.queueStatus);
        
        // If queue was cancelled (status is null), redirect to setup
        if (latestQueueStatusUpdate.queueStatus === null) {
            if (isRedirectingRef.current) {
                console.log('[TeamQueue] Already redirecting, ignoring socket event');
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:SOCKET_ALREADY_REDIRECTING',message:'Already redirecting - ignoring socket event',data:{partyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
                // #endregion
                return;
            }
            
            console.log('[TeamQueue] 🔌 Queue cancelled via socket - redirecting to setup');
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:SOCKET_REDIRECTING_TO_SETUP',message:'Queue cancelled - redirecting to setup via socket',data:{partyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D,E'})}).catch(()=>{});
            // #endregion
            isRedirectingRef.current = true;
            redirectingParties.add(partyId); // Persist across Fast Refresh
            
            // Set sessionStorage so setup page knows we came from queue
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                    timestamp: Date.now(),
                    partyId: partyId
                }));
            }
            
            clearQueueStatusUpdate();
            router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
            
            // Clear from set after navigation completes
            setTimeout(() => redirectingParties.delete(partyId), 5000);
        }
    }, [latestQueueStatusUpdate, partyId, router, clearQueueStatusUpdate]);
    
    useEffect(() => {
        console.log('[TeamQueue] === NON-LEADER POLL EFFECT ===');
        console.log('[TeamQueue] isLeader:', isLeader);
        console.log('[TeamQueue] match:', !!match);
        
        // Only non-leaders need to watch for queue cancellation
        if (isLeader || match) {
            console.log('[TeamQueue] Skipping non-leader poll (is leader or has match)');
            return;
        }
        
        console.log('[TeamQueue] Starting non-leader queue status polling...');
        
        const checkQueueStatus = async () => {
            // CRITICAL: Check if we're actually on the queue page
            // During Next.js navigation transitions, this component might still be mounted
            // while the URL has already changed to the setup page
            if (typeof window !== 'undefined') {
                const currentUrl = window.location.href;
                if (!currentUrl.includes('/arena/teams/queue')) {
                    console.log('[TeamQueue] Non-leader poll: Not on queue page, skipping. URL:', currentUrl);
                    return;
                }
            }
            
            // Don't check if already redirecting
            if (isRedirectingRef.current) {
                console.log('[TeamQueue] Non-leader poll: already redirecting, skip');
                return;
            }
            
            const { getPartyData } = await import('@/lib/actions/social');
            const result = await getPartyData();
            
            console.log('[TeamQueue] Non-leader poll: party queueStatus =', result.party?.queueStatus);
            
            if (result.party) {
                // If queue status is cleared, increment counter
                if (!result.party.queueStatus) {
                    noQueueStatusCount.current++;
                    console.log('[TeamQueue] No queue status, count:', noQueueStatusCount.current);
                    
                    // Only redirect after 2 consecutive polls with no queue status
                    // This prevents false positives from race conditions
                    if (noQueueStatusCount.current >= 2) {
                        // Double-check URL again before redirecting
                        if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                            console.log('[TeamQueue] Non-leader poll: URL changed, aborting redirect');
                            return;
                        }
                        console.log('[TeamQueue] ❌ 2 consecutive polls with no status - redirecting!');
                        // #region agent log
                        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:NON_LEADER_REDIRECT',message:'Non-leader redirecting to setup due to null queueStatus',data:{partyId,noQueueStatusCount:noQueueStatusCount.current,url:window.location.href},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                        isRedirectingRef.current = true;
                        redirectingParties.add(partyId); // Persist across Fast Refresh
                        // Set sessionStorage before redirect so setup page knows we came from queue
                        if (typeof window !== 'undefined') {
                            sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                                timestamp: Date.now(),
                                partyId: partyId
                            }));
                        }
                        router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
                        setTimeout(() => redirectingParties.delete(partyId), 5000);
                    }
                } else {
                    // Reset counter if queue status is present
                    noQueueStatusCount.current = 0;
                }
            } else {
                // Double-check URL before redirecting
                if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                    console.log('[TeamQueue] Non-leader poll: URL changed, aborting redirect');
                    return;
                }
                console.log('[TeamQueue] ❌ No party found - redirecting!');
                // Party no longer exists or user was removed
                isRedirectingRef.current = true;
                redirectingParties.add(partyId); // Persist across Fast Refresh
                // Set sessionStorage before redirect
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                        timestamp: Date.now(),
                        partyId: partyId
                    }));
                }
                router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
                setTimeout(() => redirectingParties.delete(partyId), 5000);
            }
        };
        
        // Initial delay before first check to allow state to settle
        const initialDelay = setTimeout(() => {
            console.log('[TeamQueue] Non-leader poll: initial check');
            checkQueueStatus();
        }, 1000);
        
        const interval = setInterval(checkQueueStatus, 2000);
        return () => {
            console.log('[TeamQueue] Non-leader poll: cleanup');
            clearTimeout(initialDelay);
            clearInterval(interval);
        };
    }, [isLeader, match, router, partyId]);

    // Format queue time as mm:ss
    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // =========================================================================
    // PHASE 1: TEAMMATE SEARCH
    // =========================================================================
    
    useEffect(() => {
        console.log('[TeamQueue] === TEAMMATE PHASE EFFECT ===');
        console.log('[TeamQueue] phase:', phase);
        console.log('[TeamQueue] isLeader:', isLeader);
        
        if (phase !== 'teammates') {
            console.log('[TeamQueue] Not in teammates phase, skipping');
            return;
        }
        
        // Only the leader should join the queue - members just view status
        if (!isLeader) {
            console.log('[TeamQueue] Not leader, just viewing status');
            setIsJoining(false);
            return;
        }
        
        const joinTeammateSearch = async () => {
            // CRITICAL: Check if we're actually on the queue page before doing anything
            if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                console.log('[TeamQueue] joinTeammateSearch: Not on queue page, skipping');
                return;
            }
            
            console.log('[TeamQueue] joinTeammateSearch: Checking fresh party data...');
            // First check if the party's queue status is actually set
            // This prevents re-joining if we navigated here with stale data
            const { getPartyData } = await import('@/lib/actions/social');
            const freshParty = await getPartyData();
            
            console.log('[TeamQueue] Fresh party queueStatus:', freshParty.party?.queueStatus);
            
            if (!freshParty.party?.queueStatus) {
                // Double-check URL before redirecting
                if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                    console.log('[TeamQueue] URL changed during check, aborting redirect');
                    return;
                }
                console.log('[TeamQueue] ❌ Party queue status is NULL - redirecting to setup!');
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:TEAMMATE_PHASE_REDIRECT',message:'Teammate phase - NULL queueStatus, redirecting to setup',data:{partyId,url:typeof window!=='undefined'?window.location.href:'SSR'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                // Party is not in queue, redirect back to setup
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                        timestamp: Date.now(),
                        partyId: partyId
                    }));
                }
                router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
                return;
            }
            
            console.log('[TeamQueue] ✅ Party is in queue, joining teammate search...');
            setIsJoining(true);
            const result = await joinTeammateQueue({
                partyId,
            });
            
            if (!result.success) {
                console.log('[TeamQueue] Failed to join:', result.error);
                setError(result.error || 'Failed to join teammate search');
            } else {
                console.log('[TeamQueue] Successfully joined teammate search');
            }
            setIsJoining(false);
        };
        
        joinTeammateSearch();
        
        // Cleanup on unmount - only leader leaves
        return () => {
            console.log('[TeamQueue] CLEANUP: Leaving teammate queue');
            if (phase === 'teammates' && isLeader) {
                leaveTeammateQueue(partyId);
            }
        };
    }, [partyId, phase, isLeader, router]);

    // Poll for teammates
    useEffect(() => {
        if (phase !== 'teammates' || isJoining) return;

        const poll = async () => {
            const result = await checkForTeammates(partyId);
            
            if (result.error) {
                setError(result.error);
                return;
            }
            
            setQueueStatus(result.status);
            
            // Check if team was assembled
            if (result.status.phase === 'igl_selection' && result.assembledTeam) {
                setAssembledTeam(result.assembledTeam);
                setPhase('igl_selection');
                setShowIGLModal(true);
            }
        };

        poll();
        const interval = setInterval(poll, 2000);
        
        return () => clearInterval(interval);
    }, [partyId, phase, isJoining]);

    // =========================================================================
    // PHASE 2: IGL SELECTION
    // =========================================================================
    
    // IGL selection timer countdown
    useEffect(() => {
        if (phase !== 'igl_selection' || !assembledTeam) return;
        
        const elapsed = Date.now() - assembledTeam.odSelectionStartedAt;
        const remaining = Math.max(0, 25 - Math.floor(elapsed / 1000));
        setIglSelectionTime(remaining);
        
        const interval = setInterval(() => {
            setIglSelectionTime(prev => {
                if (prev <= 1) {
                    // Time's up - auto-select based on highest ELO
                    handleAutoSelectRoles();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [phase, assembledTeam]);

    // Refresh assembled team data periodically during IGL selection
    useEffect(() => {
        if (phase !== 'igl_selection' || !assembledTeam) return;
        
        const poll = async () => {
            const updated = await getAssembledTeam(assembledTeam.id);
            if (updated) {
                setAssembledTeam(updated);
                
                // Check if both roles are selected and we should auto-confirm
                if (updated.odIglId && updated.odAnchorId) {
                    // Leader can confirm, or auto-confirm after a short delay
                    if (updated.odLargestPartyLeaderId === currentUserId) {
                        // Leader confirms
                    }
                }
            }
        };
        
        const interval = setInterval(poll, 1500);
        return () => clearInterval(interval);
    }, [phase, assembledTeam, currentUserId]);

    const handleSelectIGL = async (userId: string) => {
        if (!assembledTeam) return;
        
        const isOriginalLeader = assembledTeam.odLargestPartyLeaderId === currentUserId;
        const result = await selectIGL(assembledTeam.id, userId, !isOriginalLeader);
        
        if (result.success && result.assembledTeam) {
            setAssembledTeam(result.assembledTeam);
        }
    };

    const handleSelectAnchor = async (userId: string) => {
        if (!assembledTeam) return;
        
        const isOriginalLeader = assembledTeam.odLargestPartyLeaderId === currentUserId;
        const result = await selectAnchor(assembledTeam.id, userId, !isOriginalLeader);
        
        if (result.success && result.assembledTeam) {
            setAssembledTeam(result.assembledTeam);
        }
    };

    const handleConfirmRoles = async () => {
        if (!assembledTeam || !assembledTeam.odIglId || !assembledTeam.odAnchorId) return;
        
        const result = await confirmIGLSelection(assembledTeam.id);
        
        if (result.success && result.partyId) {
            setNewPartyId(result.partyId);
            setShowIGLModal(false);
            setPhase('opponent');
        } else {
            setError(result.error || 'Failed to confirm roles');
        }
    };

    const handleAutoSelectRoles = async () => {
        if (!assembledTeam) return;
        
        // Sort by ELO and auto-select
        const sorted = [...assembledTeam.odMembers].sort(
            (a, b) => (b.odOperationElo || b.odElo) - (a.odOperationElo || a.odElo)
        );
        
        // Highest ELO becomes IGL if not set
        if (!assembledTeam.odIglId) {
            await selectIGL(assembledTeam.id, sorted[0].odUserId, false);
        }
        
        // Second highest becomes Anchor if not set
        if (!assembledTeam.odAnchorId) {
            const anchorCandidate = sorted.find(m => m.odUserId !== assembledTeam.odIglId);
            if (anchorCandidate) {
                await selectAnchor(assembledTeam.id, anchorCandidate.odUserId, false);
            }
        }
        
        // Auto-confirm
        setTimeout(handleConfirmRoles, 500);
    };

    // =========================================================================
    // PHASE 3: OPPONENT SEARCH
    // =========================================================================
    
    useEffect(() => {
        console.log('[TeamQueue] === OPPONENT PHASE EFFECT ===');
        console.log('[TeamQueue] phase:', phase);
        console.log('[TeamQueue] isLeader:', isLeader);
        console.log('[TeamQueue] newPartyId:', newPartyId);
        
        if (phase !== 'opponent') {
            console.log('[TeamQueue] Not in opponent phase, skipping');
            return;
        }
        
        // Only the leader should join the queue - members just view status
        if (!isLeader) {
            console.log('[TeamQueue] Not leader, just viewing status');
            setIsJoining(false);
            return;
        }
        
        const activePartyId = newPartyId || partyId;
        
        const joinOpponentSearch = async () => {
            // CRITICAL: Check if we're actually on the queue page before doing anything
            if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                console.log('[TeamQueue] joinOpponentSearch: Not on queue page, skipping');
                return;
            }
            
            // Only join if we haven't already (for partial parties that just finished IGL selection)
            if (newPartyId) {
                console.log('[TeamQueue] Already joined via IGL selection');
                setIsJoining(false);
                return;
            }
            
            console.log('[TeamQueue] joinOpponentSearch: Checking fresh party data...');
            // First check if the party's queue status is actually set
            // This prevents re-joining if we navigated here with stale data
            const { getPartyData } = await import('@/lib/actions/social');
            const freshParty = await getPartyData();
            
            console.log('[TeamQueue] Fresh party queueStatus:', freshParty.party?.queueStatus);
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:OPPONENT_FRESH_CHECK',message:'Fresh party data for opponent phase',data:{freshQueueStatus:freshParty.party?.queueStatus,activePartyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,E'})}).catch(()=>{});
            // #endregion
            
            if (!freshParty.party?.queueStatus) {
                // Double-check URL before redirecting
                if (typeof window !== 'undefined' && !window.location.href.includes('/arena/teams/queue')) {
                    console.log('[TeamQueue] URL changed during check, aborting redirect');
                    return;
                }
                console.log('[TeamQueue] ❌ Party queue status is NULL (opponent) - redirecting to setup!');
                // #region agent log
                fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:OPPONENT_REDIRECT_TO_SETUP',message:'Queue status NULL - redirecting to setup',data:{activePartyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                // Party is not in queue, redirect back to setup
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('flashmath_just_left_queue', JSON.stringify({
                        timestamp: Date.now(),
                        partyId: activePartyId
                    }));
                }
                router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
                return;
            }
            
            console.log('[TeamQueue] ✅ Party is in queue, joining opponent search...');
            // #region agent log
            fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:JOINING_OPPONENT_QUEUE',message:'About to join opponent queue',data:{activePartyId,freshQueueStatus:freshParty.party?.queueStatus},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            setIsJoining(true);
            const result = await joinTeamQueue({
                partyId: activePartyId,
                matchType: 'ranked',
            });
            
            if (!result.success) {
                console.log('[TeamQueue] Failed to join:', result.error);
                setError(result.error || 'Failed to join queue');
            } else {
                console.log('[TeamQueue] Successfully joined opponent search');
            }
            setIsJoining(false);
        };
        
        joinOpponentSearch();
    }, [phase, partyId, newPartyId, isLeader, router]);

    // Poll for match
    useEffect(() => {
        if (phase !== 'opponent' || isJoining || match) return;
        
        const activePartyId = newPartyId || partyId;

        const poll = async () => {
            const result = await checkTeamMatch(activePartyId);
            
            if (result.error) {
                setError(result.error);
                return;
            }
            
            setQueueStatus(result.status);
            
            if (result.match) {
                setMatch(result.match);
                setPhase('match_found');
            }
        };

        poll();
        const interval = setInterval(poll, 2000);
        
        return () => clearInterval(interval);
    }, [partyId, newPartyId, phase, isJoining, match]);

    // Navigate to match when found
    useEffect(() => {
        if (match) {
            const timeout = setTimeout(() => {
                router.push(`/arena/teams/match/${match.matchId}`);
            }, 2000);
            
            return () => clearTimeout(timeout);
        }
    }, [match, router]);

    const handleLeaveQueue = async () => {
        console.log('[TeamQueue] === handleLeaveQueue CALLED ===');
        console.log('[TeamQueue] isLeader:', isLeader);
        console.log('[TeamQueue] phase:', phase);
        
        if (!isLeader) {
            console.log('[TeamQueue] Not leader, ignoring');
            return;
        }
        
        setIsLeaving(true);
        
        // IMPORTANT: Set sessionStorage BEFORE clearing queue status
        // This ensures the setup page knows we just left the queue, 
        // even if Fast Refresh/HMR happens and loses the URL parameter
        if (typeof window !== 'undefined') {
            const storageValue = JSON.stringify({
                timestamp: Date.now(),
                partyId: partyId
            });
            sessionStorage.setItem('flashmath_just_left_queue', storageValue);
            console.log('[TeamQueue] Set sessionStorage:', storageValue);
        }
        
        // Clear queue status FIRST before any other cleanup
        // This ensures the setup page won't see a stale queueStatus
        console.log('[TeamQueue] Clearing queue status in DB...');
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:LEAVE_QUEUE_BEFORE_CLEAR',message:'About to clear queue status',data:{partyId,phase},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const clearResult = await updatePartyQueueStatus(partyId, null);
        console.log('[TeamQueue] Queue status cleared');
        
        // Notify all party members via socket for real-time sync
        if (clearResult.success && clearResult.partyMemberIds) {
            console.log('[TeamQueue] Notifying party members via socket');
            notifyQueueStatusChange(clearResult.partyMemberIds, null, partyId);
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team-queue-client.tsx:LEAVE_QUEUE_AFTER_CLEAR',message:'Queue status cleared in DB',data:{partyId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // Small delay to ensure the update propagates
        console.log('[TeamQueue] Waiting 200ms...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Now perform the queue-specific cleanup
        if (phase === 'teammates') {
            console.log('[TeamQueue] Leaving teammate queue...');
            await leaveTeammateQueue(partyId);
        } else if (phase === 'igl_selection' && assembledTeam) {
            console.log('[TeamQueue] Leaving assembled team...');
            await leaveAssembledTeam(assembledTeam.id, partyId);
        } else {
            console.log('[TeamQueue] Leaving team queue...');
            await leaveTeamQueue(newPartyId || partyId);
        }
        
        // Return to setup with original party
        // Add fromQueue=true to prevent setup page from immediately redirecting back
        console.log('[TeamQueue] Navigating to setup with fromQueue=true');
        router.push('/arena/teams/setup?mode=5v5&fromQueue=true');
    };

    // Convert assembled team members to IGLSelectionModal format
    const getModalMembers = (): TeamMember[] => {
        if (!assembledTeam) return [];
        
        return assembledTeam.odMembers.map(m => ({
            odUserId: m.odUserId,
            odName: m.odUserName,
            odLevel: m.odLevel,
            odDuelElo: m.odElo,
            odElo5v5: m.odOperationElo,
            isLeader: m.odUserId === assembledTeam.odLargestPartyLeaderId,
            odOnline: true,
        }));
    };

    return (
        <div className="min-h-screen bg-background text-foreground 
                        flex items-center justify-center p-6">
            
            {/* IGL Selection Modal */}
            {assembledTeam && (
                <IGLSelectionModal
                    isOpen={showIGLModal}
                    onClose={() => {}} // Can't close manually
                    members={getModalMembers()}
                    currentUserId={currentUserId}
                    currentIGL={assembledTeam.odIglId}
                    currentAnchor={assembledTeam.odAnchorId}
                    isOriginalLeader={assembledTeam.odLargestPartyLeaderId === currentUserId}
                    selectionMode={assembledTeam.odPartyIds.length > 1 ? 'vote' : 'leader-pick'}
                    timeRemaining={iglSelectionTime}
                    votes={{
                        iglVotes: assembledTeam.odIglVotes,
                        anchorVotes: assembledTeam.odAnchorVotes,
                    }}
                    onSelectIGL={handleSelectIGL}
                    onSelectAnchor={handleSelectAnchor}
                    onConfirm={handleConfirmRoles}
                    onVoteIGL={handleSelectIGL}
                    onVoteAnchor={handleSelectAnchor}
                />
            )}
            
            <div className="w-full max-w-2xl">
                {/* Match Found Animation */}
                <AnimatePresence>
                    {match && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="fixed inset-0 z-50 flex items-center justify-center 
                                       bg-black/80 backdrop-blur-xl"
                        >
                            <div className="text-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5 }}
                                    className="w-24 h-24 mx-auto mb-6 rounded-full 
                                               bg-gradient-to-br from-emerald-400 to-emerald-600 
                                               flex items-center justify-center"
                                >
                                    <CheckCircle className="w-12 h-12 text-white" />
                                </motion.div>
                                
                                <motion.h1
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-4xl font-black mb-2 bg-gradient-to-r 
                                               from-emerald-400 to-cyan-400 bg-clip-text text-transparent"
                                >
                                    MATCH FOUND
                                </motion.h1>
                                
                                <motion.p
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-white/60"
                                >
                                    {match?.odTeam1?.odTeamName || 'Team 1'} vs {match?.odTeam2?.odTeamName || 'Team 2'}
                                </motion.p>
                                
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1 }}
                                    className="mt-6 flex items-center justify-center gap-2 text-white/40"
                                >
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading match...
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Queue Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-3xl overflow-hidden shadow-2xl"
                >
                    {/* Header */}
                    <div className={cn(
                        "p-6 border-b border-[var(--glass-border)]",
                        phase === 'teammates' ? "bg-accent/10" : "bg-primary/10"
                    )}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center",
                                    phase === 'teammates' ? "bg-accent/20" : "bg-primary/20"
                                )}>
                                    {phase === 'teammates' ? (
                                        <UserPlus className="w-6 h-6 text-accent" />
                                    ) : (
                                        <Users className="w-6 h-6 text-primary" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-card-foreground">
                                        {phase === 'teammates' ? 'Finding Teammates' : 'Team Queue'}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        5v5 Team Arena
                                    </p>
                                </div>
                            </div>
                            
                            {/* Phase indicator */}
                            <div className={cn(
                                "px-3 py-1 rounded-full text-sm font-medium border",
                                phase === 'teammates' 
                                    ? "bg-accent/20 border-accent/30 text-accent"
                                    : "bg-primary/20 border-primary/30 text-primary"
                            )}>
                                {phase === 'teammates' && `Phase 1: ${partySize}/5 players`}
                                {phase === 'igl_selection' && 'Phase 2: Select Roles'}
                                {phase === 'opponent' && 'Phase 3: Finding Match'}
                            </div>
                        </div>
                    </div>

                    {/* Queue Status */}
                    <div className="p-8 text-center">
                        {isJoining ? (
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                                <p className="text-muted-foreground">
                                    {phase === 'teammates' ? 'Joining teammate search...' : 'Joining queue...'}
                                </p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center gap-4 text-red-500">
                                <AlertCircle className="w-12 h-12" />
                                <p>{error}</p>
                                <button
                                    onClick={() => router.push('/arena/teams/setup?mode=5v5')}
                                    className="px-6 py-2 rounded-lg bg-card hover:bg-card/80 
                                               text-card-foreground font-medium transition-colors"
                                >
                                    Back to Setup
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Animated searching indicator */}
                                <div className="relative w-32 h-32 mx-auto mb-6">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                        className={cn(
                                            "absolute inset-0 rounded-full border-4 border-transparent",
                                            phase === 'teammates' ? "border-t-accent" : "border-t-primary"
                                        )}
                                    />
                                    <motion.div
                                        animate={{ rotate: -360 }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-2 rounded-full 
                                                   border-4 border-transparent border-t-primary"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        {phase === 'teammates' ? (
                                            <Search className="w-10 h-10 text-accent" />
                                        ) : (
                                            <Zap className="w-10 h-10 text-primary" />
                                        )}
                                    </div>
                                </div>

                                <h3 className="text-2xl font-bold mb-2 text-card-foreground">
                                    {phase === 'teammates' 
                                        ? 'Finding Teammates...' 
                                        : 'Finding Opponents...'}
                                </h3>
                                
                                <p className="text-muted-foreground mb-6">
                                    {phase === 'teammates'
                                        ? `Looking for ${5 - partySize} more player${5 - partySize > 1 ? 's' : ''} to complete your team`
                                        : 'Searching for teams with similar skill level'}
                                </p>

                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-8">
                                    <div className="p-3 rounded-lg bg-card">
                                        <p className="text-xs text-muted-foreground mb-1">Queue Time</p>
                                        <p className={cn(
                                            "text-2xl font-mono font-bold",
                                            phase === 'teammates' ? "text-accent" : "text-primary"
                                        )}>
                                            {formatTime(queueStatus?.queueTimeMs || 0)}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-card">
                                        <p className="text-xs text-muted-foreground mb-1">
                                            {phase === 'teammates' ? 'Team Size' : 'ELO Range'}
                                        </p>
                                        <p className="text-2xl font-mono font-bold text-primary">
                                            {phase === 'teammates' 
                                                ? `${queueStatus?.partySize || partySize}/5`
                                                : `±${queueStatus?.currentEloRange || 0}`}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Team Members */}
                    <div className="px-6 pb-6">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                            {phase === 'teammates' ? 'Your Party' : 'Your Team'}
                        </p>
                        <div className="grid grid-cols-5 gap-2">
                            {party.members.map((member) => (
                                <div
                                    key={member.odUserId}
                                    className="p-2 rounded-lg bg-card text-center"
                                >
                                    <div className="w-8 h-8 mx-auto rounded-lg bg-primary/20 
                                                    flex items-center justify-center text-primary font-bold mb-1">
                                        {member.odName.charAt(0)}
                                    </div>
                                    <p className="text-xs font-medium truncate text-card-foreground">{member.odName}</p>
                                    <div className="flex justify-center gap-1 mt-1">
                                        {member.isIgl && <Crown className="w-3 h-3 text-accent" />}
                                        {member.isAnchor && <Anchor className="w-3 h-3 text-primary" />}
                                    </div>
                                </div>
                            ))}
                            
                            {/* Empty slots for teammates phase */}
                            {phase === 'teammates' && Array.from({ length: 5 - partySize }).map((_, i) => (
                                <motion.div
                                    key={`empty-${i}`}
                                    initial={{ opacity: 0.5 }}
                                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                                    className="p-2 rounded-lg bg-card/50 border border-dashed border-[var(--glass-border)] text-center"
                                >
                                    <div className="w-8 h-8 mx-auto rounded-lg bg-card 
                                                    flex items-center justify-center mb-1">
                                        <UserPlus className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">Searching</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Cancel Button (leader only) */}
                    {isLeader && !match && (
                        <div className="p-4 border-t border-[var(--glass-border)] bg-card/50">
                            <button
                                onClick={handleLeaveQueue}
                                disabled={isLeaving}
                                className="w-full py-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 
                                           border border-red-500/30 text-red-400 font-medium 
                                           transition-colors disabled:opacity-50 flex items-center 
                                           justify-center gap-2"
                            >
                                {isLeaving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <X className="w-4 h-4" />
                                        {phase === 'igl_selection' 
                                            ? 'Leave Team & Return to Setup' 
                                            : 'Cancel Queue'}
                                    </>
                                )}
                            </button>
                            {phase === 'igl_selection' && (
                                <p className="text-xs text-muted-foreground text-center mt-2">
                                    This will leave the assembled teammates and return your party to setup
                                </p>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
