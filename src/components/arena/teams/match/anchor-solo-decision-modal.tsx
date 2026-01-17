'use client';

/**
 * AnchorSoloDecisionModal
 * 
 * Modal shown to IGL during the SOLO_DECISION phase before the final round.
 * IGL must choose between:
 * - NORMAL: Standard relay with all players
 * - ANCHOR SOLO: Anchor plays all slots alone
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Anchor, Users, Zap, Clock, AlertTriangle, Crown } from 'lucide-react';

interface AnchorInfo {
    anchorId: string;
    anchorName: string;
}

interface AnchorSoloDecisionModalProps {
    isOpen: boolean;
    isIgl: boolean;
    teamName: string;
    anchorInfo: AnchorInfo;
    durationMs: number;
    mode: '5v5' | '2v2';
    onDecision: (decision: 'normal' | 'solo') => void;
    opponentDecision?: 'normal' | 'solo' | null;
    myDecision?: 'normal' | 'solo' | null;
}

export function AnchorSoloDecisionModal({
    isOpen,
    isIgl,
    anchorInfo,
    durationMs,
    mode,
    onDecision,
    opponentDecision,
    myDecision,
}: AnchorSoloDecisionModalProps) {
    const [remainingSeconds, setRemainingSeconds] = useState(Math.ceil(durationMs / 1000));
    
    // Countdown timer
    useEffect(() => {
        if (!isOpen || myDecision) return;
        
        const interval = setInterval(() => {
            setRemainingSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isOpen, myDecision]);
    
    // Reset timer when modal opens
    useEffect(() => {
        if (isOpen) {
            // Defer to avoid setState in effect warning
            setTimeout(() => {
                setRemainingSeconds(Math.ceil(durationMs / 1000));
            }, 0);
        }
    }, [isOpen, durationMs]);
    
    const totalSlots = mode === '2v2' ? 2 : 5;
    const totalQuestions = mode === '2v2' ? 12 : 25;
    
    if (!isOpen) return null;
    
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="relative w-full max-w-2xl mx-4 bg-gradient-to-b from-slate-800 to-slate-900 
                               rounded-2xl border border-amber-500/30 shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-600/30 to-orange-600/30 px-6 py-4 border-b border-amber-500/20">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-amber-500/20">
                                    <Anchor className="w-6 h-6 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Final Round Decision</h2>
                                    <p className="text-sm text-amber-300/80">Choose your strategy for Round 4</p>
                                </div>
                            </div>
                            
                            {/* Timer */}
                            {!myDecision && (
                                <div className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-full",
                                    remainingSeconds <= 3 
                                        ? "bg-red-500/30 text-red-300 animate-pulse"
                                        : "bg-white/10 text-white"
                                )}>
                                    <Clock className="w-4 h-4" />
                                    <span className="font-mono font-bold text-lg">{remainingSeconds}s</span>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6">
                        {/* Anchor Info */}
                        <div className="flex items-center justify-center gap-3 mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
                            <Anchor className="w-5 h-5 text-amber-400" />
                            <span className="text-white/80">Your Anchor:</span>
                            <span className="font-bold text-amber-400">{anchorInfo.anchorName}</span>
                        </div>
                        
                        {/* Decision made state */}
                        {myDecision && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="mb-6 p-6 rounded-xl bg-emerald-500/20 border-2 border-emerald-500/40 text-center"
                            >
                                <p className="text-emerald-400 font-bold text-lg mb-2">
                                    Decision Made: {myDecision.toUpperCase()}
                                </p>
                                <p className="text-white/60">
                                    {opponentDecision === null 
                                        ? "Waiting for opponent's decision..."
                                        : `Opponent chose: ${opponentDecision?.toUpperCase()}`
                                    }
                                </p>
                            </motion.div>
                        )}
                        
                        {/* IGL Decision Buttons */}
                        {isIgl && !myDecision && (
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                {/* Normal Option */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onDecision('normal')}
                                    className="p-6 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10
                                               border-2 border-blue-500/30 hover:border-blue-400/60
                                               transition-all group text-left"
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-3 rounded-full bg-blue-500/20 group-hover:bg-blue-500/30">
                                            <Users className="w-6 h-6 text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-lg">NORMAL RELAY</h3>
                                            <p className="text-blue-300/80 text-sm">Team plays together</p>
                                        </div>
                                    </div>
                                    <ul className="space-y-2 text-sm text-white/60">
                                        <li className="flex items-center gap-2">
                                            <span className="text-emerald-400">✓</span>
                                            All {mode === '2v2' ? '2' : '5'} players participate
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="text-emerald-400">✓</span>
                                            Safe, consistent strategy
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="text-emerald-400">✓</span>
                                            Standard handoff relay
                                        </li>
                                    </ul>
                                </motion.button>
                                
                                {/* Anchor Solo Option */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onDecision('solo')}
                                    className="p-6 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/10
                                               border-2 border-amber-500/30 hover:border-amber-400/60
                                               transition-all group text-left relative overflow-hidden"
                                >
                                    {/* Glow effect */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    
                                    <div className="flex items-center gap-3 mb-4 relative">
                                        <div className="p-3 rounded-full bg-amber-500/20 group-hover:bg-amber-500/30">
                                            <Anchor className="w-6 h-6 text-amber-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-lg">ANCHOR SOLO</h3>
                                            <p className="text-amber-300/80 text-sm">{anchorInfo.anchorName} plays alone</p>
                                        </div>
                                    </div>
                                    <ul className="space-y-2 text-sm text-white/60 relative">
                                        <li className="flex items-center gap-2">
                                            <Zap className="w-3 h-3 text-amber-400" />
                                            Anchor plays all {totalSlots} slots
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Zap className="w-3 h-3 text-amber-400" />
                                            {totalQuestions} questions solo
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                                            High risk, high reward
                                        </li>
                                    </ul>
                                </motion.button>
                            </div>
                        )}
                        
                        {/* Non-IGL Waiting State */}
                        {!isIgl && !myDecision && (
                            <div className="text-center py-8">
                                <div className="flex items-center justify-center gap-2 mb-4">
                                    <Crown className="w-5 h-5 text-primary animate-pulse" />
                                    <span className="text-white/80">Waiting for IGL to decide...</span>
                                </div>
                                <p className="text-white/50 text-sm">
                                    Your IGL is choosing between Normal Relay and Anchor Solo
                                </p>
                            </div>
                        )}
                        
                        {/* Warning */}
                        {isIgl && !myDecision && (
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                <p className="text-amber-300/80 text-sm">
                                    {remainingSeconds <= 3 
                                        ? "Time running out! Normal will be selected automatically."
                                        : "Your choice is hidden until both teams decide. NORMAL is selected if time expires."
                                    }
                                </p>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
