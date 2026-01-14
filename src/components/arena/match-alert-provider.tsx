'use client';

/**
 * Global Match Alert Provider
 * 
 * Listens for match found events via Socket.io and shows a global notification
 * when a match is found, regardless of what page the user is on.
 * 
 * This ensures users who navigate away from the queue page are still notified
 * and can join their match.
 * 
 * Uses theme-aware colors via CSS variables (--primary, --accent, etc.)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Clock, X } from 'lucide-react';

interface MatchAlert {
    matchId: string;
    partyId: string;
    matchType: 'ai' | 'ranked' | 'casual';
    countdown: number;
}

export function MatchAlertProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const [matchAlert, setMatchAlert] = useState<MatchAlert | null>(null);
    const [countdown, setCountdown] = useState(30);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    
    // Ref to hold current matchAlert - prevents stale closure in setInterval callback
    // When handleJoinMatch is called from inside setInterval, it needs the latest
    // matchAlert value, not the one captured when the effect ran
    const matchAlertRef = useRef<MatchAlert | null>(null);
    
    // Keep ref in sync with state
    useEffect(() => {
        matchAlertRef.current = matchAlert;
    }, [matchAlert]);

    // Check if already on match page or queue page (queue page has its own match found UI)
    const isOnMatchPage = pathname?.includes('/arena/teams/match/') || 
                          pathname?.includes('/arena/match/');
    const isOnQueuePage = pathname?.includes('/arena/teams/queue/');

    // Poll for match found status when user is in a party queue
    // Skip if on match page (already in match) or queue page (has its own match found UI)
    useEffect(() => {
        if (!session?.user?.id || isOnMatchPage || isOnQueuePage) return;

        const checkForMatch = async () => {
            try {
                const { getPartyData } = await import('@/lib/actions/social');
                const result = await getPartyData();
                
                if (!result.party) return;
                
                // Check if party has a match ready
                const queueStatus = result.party.queueStatus;
                
                // Check for AI match notification (format: ai_match:matchId)
                if (queueStatus?.startsWith('ai_match:')) {
                    const matchId = queueStatus.replace('ai_match:', '');
                    setMatchAlert({
                        matchId,
                        partyId: result.party.id,
                        matchType: 'ai',
                        countdown: 30,
                    });
                    return;
                }
                
                // Check for human match via Redis
                if (queueStatus === 'finding_opponents') {
                    // #region agent log - H1: Verify correct function import
                    // #endregion
                    
                    // FIXED: Use checkTeamMatch (not checkTeamQueueStatus which doesn't exist)
                    const { checkTeamMatch } = await import('@/lib/actions/team-matchmaking');
                    const queueResult = await checkTeamMatch(result.party.id);
                    
                    // #region agent log - H1: Log result of match check
                    // #endregion
                    
                    if (queueResult.match) {
                        setMatchAlert({
                            matchId: queueResult.match.matchId,
                            partyId: result.party.id,
                            matchType: 'ranked',
                            countdown: 30,
                        });
                    }
                }
            } catch (error) {
                console.error('[MatchAlert] Error checking for match:', error);
            }
        };

        // Poll every 5 seconds
        const interval = setInterval(checkForMatch, 5000);
        
        // Also check immediately
        checkForMatch();

        return () => clearInterval(interval);
    }, [session?.user?.id, isOnMatchPage, isOnQueuePage]);

    // Handle countdown when match is found
    useEffect(() => {
        if (!matchAlert) {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
            return;
        }

        // Play match found sound
        if (typeof window !== 'undefined' && !audioRef.current) {
            audioRef.current = new Audio('/sounds/match-found.mp3');
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(() => {}); // Ignore autoplay errors
        }

        // Note: We don't show a toast here since the modal overlay is more prominent
        // and provides the same functionality. Showing both would be redundant.

        setCountdown(matchAlert.countdown);

        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    // Auto-join when countdown expires
                    handleJoinMatch();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [matchAlert]);

    const handleJoinMatch = useCallback(() => {
        // Read from ref to get the latest value, avoiding stale closure
        // when called from inside setInterval callback
        const alert = matchAlertRef.current;
        if (!alert) return;
        
        // Clear the alert
        setMatchAlert(null);
        
        // Navigate to match
        router.push(`/arena/teams/match/${alert.matchId}?partyId=${alert.partyId}`);
    }, [router]);

    const handleDismiss = useCallback(() => {
        setMatchAlert(null);
        // User explicitly dismissed - they've been warned via the modal already
    }, []);

    return (
        <>
            {children}
            
            {/* Global Match Found Overlay - Theme-aware styling */}
            {/* Only show when NOT on match page and NOT on queue page (queue has its own UI) */}
            <AnimatePresence>
                {matchAlert && !isOnMatchPage && !isOnQueuePage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
                    >
                        {/* Animated glow behind card */}
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.3, 0.5, 0.3],
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute w-96 h-96 rounded-full blur-3xl"
                            style={{ backgroundColor: 'var(--accent-glow)' }}
                        />
                        
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="relative glass rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 text-center border-2"
                            style={{ 
                                borderColor: 'var(--primary)',
                                boxShadow: '0 0 60px var(--accent-glow)'
                            }}
                        >
                            {/* Dismiss button */}
                            <button
                                onClick={handleDismiss}
                                className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X size={20} />
                            </button>

                            {/* Animated swords icon */}
                            <motion.div
                                animate={{
                                    scale: [1, 1.1, 1],
                                    rotate: [0, 5, -5, 0],
                                }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                }}
                                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                                style={{ 
                                    backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
                                    color: 'var(--primary)'
                                }}
                            >
                                <Swords size={40} />
                            </motion.div>

                            <h2 className="text-3xl font-black mb-2" style={{ color: 'var(--foreground)' }}>
                                MATCH FOUND!
                            </h2>
                            
                            <p className="text-muted-foreground mb-6">
                                {matchAlert.matchType === 'ai' 
                                    ? 'Your VS AI match is ready!'
                                    : 'Opponents found! Get ready to battle!'}
                            </p>

                            {/* Countdown */}
                            <div className="flex items-center justify-center gap-2 mb-6" style={{ color: 'var(--accent)' }}>
                                <Clock size={20} />
                                <span className="text-2xl font-bold">{countdown}s</span>
                            </div>

                            {/* Join button - uses primary/accent gradient */}
                            <motion.button
                                onClick={handleJoinMatch}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-full py-4 px-8 font-black uppercase tracking-widest rounded-xl transition-all neon-glow"
                                style={{ 
                                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                    color: 'var(--primary-foreground)',
                                }}
                            >
                                JOIN MATCH
                            </motion.button>

                            {/* Auto-join notice */}
                            <p className="text-xs text-muted-foreground mt-4">
                                Auto-joining in {countdown} seconds...
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

