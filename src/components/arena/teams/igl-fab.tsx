'use client';

/**
 * IGL Floating Action Button
 * Fixed position button on left edge that opens the IGL control panel
 * Only visible to the IGL during matches (break, halftime, anchor decision phases)
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Clock, Zap, Users, X, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IGLFABProps {
    isIGL: boolean;
    half: number;
    currentRound: number;
    usedDoubleCallinHalf1: boolean;
    usedDoubleCallinHalf2: boolean;
    timeoutsRemaining: number;
    anchorName: string;
    phase: 'active' | 'break' | 'halftime' | 'anchor_decision' | 'strategy' | 'pre_match' | 'post_match';
    availableSlots: { slot: number; operation: string; playerName: string }[];
    onDoubleCallin: (targetSlot: number) => void;
    onTimeout: () => void;
}

export function IGLFAB({
    isIGL,
    half,
    currentRound,
    usedDoubleCallinHalf1,
    usedDoubleCallinHalf2,
    timeoutsRemaining,
    anchorName,
    phase,
    availableSlots,
    onDoubleCallin,
    onTimeout,
}: IGLFABProps) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [showSlotSelection, setShowSlotSelection] = useState(false);

    // Only show for IGL
    if (!isIGL) return null;

    // Only show during phases where IGL can take action
    const actionablePhases = ['break', 'halftime', 'anchor_decision', 'strategy'];
    const canTakeAction = actionablePhases.includes(phase);

    // Calculate Double Call-In availability
    const usedThisHalf = half === 1 ? usedDoubleCallinHalf1 : usedDoubleCallinHalf2;
    const nextRound = currentRound === 0 ? 1 : currentRound + 1;
    
    let canUseDoubleCallin = false;
    if (!usedThisHalf) {
        if (half === 1 && nextRound <= 3) canUseDoubleCallin = true;
        if (half === 2 && nextRound === 5) canUseDoubleCallin = true; // 2nd half R1
    }

    const canCallTimeout = timeoutsRemaining > 0 && ['break', 'halftime'].includes(phase);

    const handleDoubleCallinClick = () => {
        if (canUseDoubleCallin) {
            setShowSlotSelection(true);
        }
    };

    const handleSlotSelect = (slot: number) => {
        onDoubleCallin(slot);
        setShowSlotSelection(false);
        setIsPanelOpen(false);
    };

    return (
        <>
            {/* FAB Button */}
            <motion.button
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
                className={cn(
                    "fixed left-0 top-1/2 -translate-y-1/2 z-40",
                    "flex items-center justify-center",
                    "w-12 h-14 rounded-r-xl",
                    "bg-gradient-to-r from-amber-900/90 to-amber-800/90 backdrop-blur-xl",
                    "border border-amber-500/30 border-l-0",
                    "text-amber-400 hover:text-amber-300 transition-colors",
                    "shadow-[0_0_20px_rgba(251,191,36,0.3)]",
                    "group cursor-pointer",
                    isPanelOpen && "bg-amber-500/30 border-amber-400/50",
                    canTakeAction && "animate-pulse"
                )}
                whileHover={{ 
                    x: 4,
                    boxShadow: '0 0 40px rgba(251, 191, 36, 0.5)',
                }}
                whileTap={{ scale: 0.95 }}
                aria-label="Open IGL controls"
            >
                <Crown size={20} className="group-hover:scale-110 transition-transform" />

                {/* Action Available Badge */}
                {canTakeAction && (canUseDoubleCallin || canCallTimeout) && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                        <span className="text-[8px] font-bold text-white">!</span>
                    </motion.div>
                )}

                {/* Glow effect */}
                <div className={cn(
                    "absolute inset-0 rounded-r-xl opacity-0 group-hover:opacity-100 transition-opacity",
                    "bg-gradient-to-l from-amber-500/20 to-transparent",
                    "pointer-events-none"
                )} />
            </motion.button>

            {/* IGL Panel */}
            <AnimatePresence>
                {isPanelOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 z-45"
                            onClick={() => {
                                setIsPanelOpen(false);
                                setShowSlotSelection(false);
                            }}
                        />

                        {/* Panel */}
                        <motion.div
                            initial={{ x: -300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -300, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed left-0 top-1/2 -translate-y-1/2 z-50 w-80 max-h-[80vh] overflow-y-auto
                                       bg-gradient-to-b from-slate-900/95 to-slate-950/95 backdrop-blur-xl
                                       border border-amber-500/30 border-l-0 rounded-r-2xl
                                       shadow-[0_0_60px_rgba(251,191,36,0.2)]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-amber-500/20">
                                <div className="flex items-center gap-2">
                                    <Crown className="w-5 h-5 text-amber-400" />
                                    <span className="font-bold text-amber-400">IGL CONTROLS</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsPanelOpen(false);
                                        setShowSlotSelection(false);
                                    }}
                                    className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-4 space-y-4">
                                {/* Status */}
                                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-white/50">Phase</span>
                                        <span className="font-bold text-white capitalize">{phase.replace('_', ' ')}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span className="text-white/50">Half {half} • Round {currentRound || 'Pre'}</span>
                                    </div>
                                </div>

                                {/* Double Call-In */}
                                {!showSlotSelection ? (
                                    <div className={cn(
                                        "p-4 rounded-xl border transition-all",
                                        canUseDoubleCallin && canTakeAction
                                            ? "bg-purple-500/10 border-purple-500/30 cursor-pointer hover:bg-purple-500/20"
                                            : "bg-white/5 border-white/10 opacity-50"
                                    )}
                                    onClick={canUseDoubleCallin && canTakeAction ? handleDoubleCallinClick : undefined}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                <Zap className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white">Double Call-In</h3>
                                                <p className="text-xs text-white/50">Anchor plays 2 slots</p>
                                            </div>
                                            {canUseDoubleCallin && canTakeAction && (
                                                <ChevronRight className="w-5 h-5 text-purple-400 ml-auto" />
                                            )}
                                        </div>
                                        <div className="text-xs text-white/50">
                                            {usedThisHalf 
                                                ? `Used this half`
                                                : `Available for ${anchorName}`}
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs",
                                                !usedDoubleCallinHalf1 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/30"
                                            )}>
                                                H1: {usedDoubleCallinHalf1 ? 'Used' : 'Ready'}
                                            </span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-xs",
                                                !usedDoubleCallinHalf2 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/30"
                                            )}>
                                                H2: {usedDoubleCallinHalf2 ? 'Used' : 'Ready'}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    /* Slot Selection */
                                    <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/10">
                                        <h3 className="font-bold text-purple-400 mb-3 flex items-center gap-2">
                                            <Zap className="w-4 h-4" />
                                            Select Slot for Anchor
                                        </h3>
                                        <p className="text-xs text-white/50 mb-3">
                                            {anchorName} will play their slot + this one
                                        </p>
                                        <div className="space-y-2">
                                            {availableSlots.map(({ slot, operation, playerName }) => (
                                                <button
                                                    key={slot}
                                                    onClick={() => handleSlotSelect(slot)}
                                                    className="w-full p-3 rounded-lg bg-white/10 hover:bg-purple-500/20 
                                                               border border-white/10 hover:border-purple-500/30
                                                               text-left transition-all"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold text-white">{operation}</span>
                                                        <span className="text-xs text-white/50">{playerName} sits out</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setShowSlotSelection(false)}
                                            className="w-full mt-3 p-2 rounded-lg border border-white/20 text-white/50 
                                                       hover:bg-white/10 text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                {/* Timeout */}
                                <div 
                                    className={cn(
                                        "p-4 rounded-xl border transition-all",
                                        canCallTimeout
                                            ? "bg-amber-500/10 border-amber-500/30 cursor-pointer hover:bg-amber-500/20"
                                            : "bg-white/5 border-white/10 opacity-50"
                                    )}
                                    onClick={canCallTimeout ? onTimeout : undefined}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                            <Clock className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">Call Timeout</h3>
                                            <p className="text-xs text-white/50">+1 minute to half</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        {[...Array(2)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "w-3 h-3 rounded-full",
                                                    i < timeoutsRemaining
                                                        ? "bg-amber-400"
                                                        : "bg-white/20"
                                                )}
                                            />
                                        ))}
                                        <span className="text-xs text-white/50 ml-1">
                                            {timeoutsRemaining}/2 remaining
                                        </span>
                                    </div>
                                </div>

                                {/* Phase-specific help */}
                                {!canTakeAction && (
                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                                        <p className="text-xs text-white/50">
                                            IGL actions available during breaks, halftime, and strategy phases.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

