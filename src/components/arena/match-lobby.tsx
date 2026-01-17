'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { PlayerBanner } from '@/components/arena/player-banner';
import { soundEngine } from '@/lib/sound-engine';
import { sendMatchEmoji, getMatchEmojis } from '@/lib/actions/matchmaking';

interface Player {
    id: string;
    name: string;
    rank: string; // "Bronze", "Silver", etc.
    division: string; // "I", "II", "III"
    elo: number;
    ready: boolean;
    banner: string;
    title: string;
    level: number;
}

interface MatchLobbyProps {
    matchId: string;
    players: Player[];
    currentUserId: string;
    operation?: string;
}

const EMOJIS = ['👋', '👍', '🔥', '⚡', '😤', '🎯', '🤔', '💀'];

export function MatchLobby({ matchId, players, currentUserId, operation = 'mixed' }: MatchLobbyProps) {
    const router = useRouter();
    const [countdown, setCountdown] = useState(15);
    const [chatMessages, setChatMessages] = useState<{ emoji: string; senderId: string; timestamp: number }[]>([]);
    const [shouldNavigate, setShouldNavigate] = useState(false);
    const lastMsgTimeRef = useRef<number>(0);

    // Play tense build-up music during lobby countdown
    useEffect(() => {
        // Stop any previous phase music first (queue music, arena entrance, etc.)
        soundEngine.stopQueueMusic(800);
        soundEngine.stopArenaEntranceMusic(800);

        // Start lobby music after brief delay for smooth transition
        const timeout = setTimeout(() => {
            soundEngine.playLobbyMusic();
        }, 500);

        return () => {
            clearTimeout(timeout);
            // Don't stop here - let match component handle transition
        };
    }, []);

    // Navigate when countdown reaches 0
    useEffect(() => {
        if (shouldNavigate) {
            // Immediate navigation attempt
            router.push(`/arena/match/${matchId}?operation=${operation}`);
        }
    }, [shouldNavigate, matchId, operation, router]);

    // Countdown logic
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown(c => {
                if (c <= 1) {
                    clearInterval(interval);
                    setShouldNavigate(true);
                    // Direct navigation as backup
                    setTimeout(() => {
                        router.push(`/arena/match/${matchId}?operation=${operation}`);
                    }, 100);
                    return 0;
                }
                return c - 1;
            });
        }, 1000);

        // Safety timeout - if still on this page after 20 seconds, force navigate
        const safetyTimeout = setTimeout(() => {
            router.push(`/arena/match/${matchId}?operation=${operation}`);
        }, 20000);

        return () => {
            clearInterval(interval);
            clearTimeout(safetyTimeout);
        };
    }, [matchId, operation, router]);

    // Poll for emojis
    useEffect(() => {
        const poll = async () => {
            const messages = await getMatchEmojis(matchId);
            setChatMessages(messages);
        };

        const interval = setInterval(poll, 1000);
        poll(); // Initial fetch
        return () => clearInterval(interval);
    }, [matchId]);

    // Play sound on received messages
    useEffect(() => {
        if (chatMessages.length > 0) {
            const latest = chatMessages[chatMessages.length - 1];
            if (latest.timestamp > lastMsgTimeRef.current) {
                lastMsgTimeRef.current = latest.timestamp;
                // Only play sound for messages from others (we play our own sound on click)
                if (latest.senderId !== currentUserId) {
                    soundEngine.playChat();
                }
            }
        }
    }, [chatMessages, currentUserId]);

    const handleSendEmoji = async (emoji: string) => {
        soundEngine.playChat();
        // Optimistic update
        // eslint-disable-next-line react-hooks/purity -- Safe in event handler
        const newMessage = { emoji, senderId: currentUserId, timestamp: Date.now() };
        setChatMessages(prev => [...prev.slice(-10), newMessage]);

        await sendMatchEmoji(matchId, emoji);
    };

    const you = players.find(p => p.id === currentUserId);
    const opponent = players.find(p => p.id !== currentUserId);

    return (
        <div className="w-full space-y-8 relative">
            {/* Header: Countdown with Progress Ring */}
            <div className="flex flex-col items-center justify-center space-y-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative w-28 h-28 flex items-center justify-center"
                >
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                            cx="56"
                            cy="56"
                            r="52"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="6"
                            className="text-white/5"
                        />
                        <motion.circle
                            cx="56"
                            cy="56"
                            r="52"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="6"
                            strokeDasharray="327"
                            initial={{ strokeDashoffset: 0 }}
                            animate={{ strokeDashoffset: 327 * (1 - countdown / 15) }}
                            className="text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]"
                        />
                    </svg>
                    <motion.div
                        key={countdown}
                        initial={{ scale: 1.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-4xl font-black italic tracking-tighter text-white drop-shadow-2xl"
                    >
                        {countdown}
                    </motion.div>
                </motion.div>
                <div className="text-center space-y-1">
                    <motion.p
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/60"
                    >
                        Preparing Battle
                    </motion.p>
                </div>
            </div>

            {/* Players Area */}
            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 w-full">
                {/* User */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative group w-full max-w-md"
                >
                    <div className="relative">
                        <PlayerBanner
                            name={you?.name || 'You'}
                            level={you?.level || 1}
                            rank={you?.rank || 'Bronze'}
                            division={you?.division || "I"}
                            styleId={you?.banner || 'default'}
                            title={you?.title || 'Challenger'}
                            className="shadow-2xl border-primary/20 scale-95 lg:scale-100 transition-transform"
                        />
                        <div className="absolute -bottom-3 left-4 px-3 py-1 bg-primary text-primary-foreground font-black text-[9px] uppercase tracking-widest rounded-full shadow-lg z-20">
                            Challenger (You)
                        </div>

                        {/* Live Emoji Reaction for You */}
                        <AnimatePresence>
                            {chatMessages.filter(m => m.senderId === currentUserId).slice(-1).map((msg, i) => (
                                <motion.div
                                    key={`${msg.timestamp}-${i}`}
                                    initial={{ opacity: 0, y: 20, scale: 0 }}
                                    animate={{ opacity: 1, y: -50, scale: 1.8 }}
                                    exit={{ opacity: 0, y: -100, scale: 0 }}
                                    className="absolute -top-6 left-1/2 -translate-x-1/2 text-5xl pointer-events-none drop-shadow-[0_0_15px_rgba(255,255,255,0.6)] z-50"
                                >
                                    {msg.emoji}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* VS Divider */}
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="relative shrink-0 py-4 lg:py-0"
                >
                    <div className="text-5xl font-black italic text-white/5 tracking-tighter select-none">VS</div>
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <div className="text-3xl font-black italic text-primary drop-shadow-[0_0_10px_rgba(var(--primary),0.4)]">VS</div>
                    </motion.div>
                </motion.div>

                {/* Opponent */}
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative group w-full max-w-md"
                >
                    <div className="relative">
                        <PlayerBanner
                            name={opponent?.name || 'Opponent'}
                            level={opponent?.level || 1}
                            rank={opponent?.rank || 'Bronze'}
                            division={opponent?.division || "I"}
                            styleId={opponent?.banner || 'default'}
                            title={opponent?.title || 'Challenger'}
                            className="shadow-2xl border-accent/20 grayscale-[0.2] scale-95 lg:scale-100 transition-transform"
                        />
                        <div className="absolute -bottom-3 right-4 px-3 py-1 bg-accent text-accent-foreground font-black text-[9px] uppercase tracking-widest rounded-full shadow-lg z-20">
                            Contender
                        </div>

                        {/* Live Emoji Reaction for Opponent */}
                        <AnimatePresence>
                            {chatMessages.filter(m => m.senderId !== currentUserId).slice(-1).map((msg, i) => (
                                <motion.div
                                    key={`${msg.timestamp}-${i}`}
                                    initial={{ opacity: 0, y: 20, scale: 0 }}
                                    animate={{ opacity: 1, y: -50, scale: 1.8 }}
                                    exit={{ opacity: 0, y: -100, scale: 0 }}
                                    className="absolute -top-6 left-1/2 -translate-x-1/2 text-5xl pointer-events-none drop-shadow-[0_0_15px_rgba(255,255,255,0.6)] z-50"
                                >
                                    {msg.emoji}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>

            {/* Quick Chat Section */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xl mx-auto pt-10"
            >
                <div className="relative rounded-3xl bg-white/5 border border-white/10 p-4 backdrop-blur-xl overflow-hidden shadow-xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center space-y-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Quick Reactions</h3>

                        <div className="flex flex-wrap justify-center gap-3">
                            {EMOJIS.map((emoji) => (
                                <motion.button
                                    key={emoji}
                                    whileHover={{ scale: 1.15, rotate: 8, backgroundColor: 'rgba(255,255,255,0.08)' }}
                                    whileTap={{ scale: 0.9, rotate: -8 }}
                                    onClick={() => handleSendEmoji(emoji)}
                                    className="w-12 h-12 text-2xl flex items-center justify-center rounded-xl bg-white/5 border border-white/5 transition-colors"
                                >
                                    {emoji}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-14 text-center space-y-2">
                    <div className="flex items-center justify-center gap-4 text-[9px] font-black uppercase tracking-[0.4em] text-white/10">
                        <div className="h-[1px] w-8 bg-white/10" />
                        <span>Match Rules</span>
                        <div className="h-[1px] w-8 bg-white/10" />
                    </div>
                    <p className="text-[10px] font-medium text-white/30 italic">
                        60 Seconds • High Speed Calculation • No Assistance
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
