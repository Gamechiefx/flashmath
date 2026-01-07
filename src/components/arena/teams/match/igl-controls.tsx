'use client';

/**
 * IGLControls
 * 
 * IGL (In-Game Leader) control panel for strategic decisions:
 * - Double Call-In: IGL chooses WHEN (which round) and WHICH SLOT
 * - Timeout: IGL can call timeouts
 * 
 * Per spec: 
 * - 1st Half: Double Call-In available for Round 1, 2, OR 3 (pick ONE)
 * - 2nd Half: Double Call-In available for Round 1 ONLY
 * - IGL must first choose the round, then the slot
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Crown, Zap, Clock, Users, ChevronRight, X, AlertCircle } from 'lucide-react';

interface IGLControlsProps {
    isIGL: boolean;
    half: number;
    currentRound: number;
    usedDoubleCallinHalf1: boolean;
    usedDoubleCallinHalf2: boolean;
    timeoutsRemaining: number;
    anchorName: string;
    onDoubleCallin: (targetSlot: number) => void;
    onTimeout: () => void;
    availableSlots: { slot: number; operation: string; playerName: string }[];
    phase: 'break' | 'halftime' | 'anchor_decision';
}

export function IGLControls({
    isIGL,
    half,
    currentRound,
    usedDoubleCallinHalf1,
    usedDoubleCallinHalf2,
    timeoutsRemaining,
    anchorName,
    onDoubleCallin,
    onTimeout,
    availableSlots,
    phase,
}: IGLControlsProps) {
    // State for 2-step selection flow
    const [showSlotSelection, setShowSlotSelection] = useState(false);
    
    if (!isIGL) return null;

    // Per spec: Double Call-In availability
    // 1st Half: Round 1, 2, OR 3 (pick one) - NOT Round 4
    // 2nd Half: Round 1 ONLY
    const usedThisHalf = half === 1 ? usedDoubleCallinHalf1 : usedDoubleCallinHalf2;
    
    // Determine which round we're making decisions for
    // During strategy phase: deciding for Round 1
    // During break after Round N: deciding for Round N+1
    const nextRound = currentRound === 0 ? 1 : currentRound + 1;
    const roundInHalf = half === 1 ? nextRound : nextRound - 4;
    
    // Calculate remaining rounds where Double Call-In can still be used
    const remainingRounds = half === 1 
        ? Math.max(0, 3 - (currentRound === 0 ? 0 : currentRound)) // R1, R2, R3 available
        : (currentRound <= 4 ? 1 : 0); // Only R1 of 2nd half
    
    // Can use Double Call-In for the NEXT round?
    let canUseNow = false;
    let canDefer = false;
    
    if (usedThisHalf) {
        // Already used this half
        canUseNow = false;
        canDefer = false;
    } else if (half === 1) {
        // 1st half: Rounds 1-3 only
        if (nextRound <= 3) {
            canUseNow = true;
            canDefer = nextRound < 3; // Can defer if not at last chance (R3)
        } else {
            // Round 4 - no longer available
            canUseNow = false;
            canDefer = false;
        }
    } else {
        // 2nd half: Round 1 ONLY (which is Round 5 overall)
        if (nextRound === 5) {
            canUseNow = true;
            canDefer = false; // No deferring in 2nd half - it's now or never
        } else {
            canUseNow = false;
            canDefer = false;
        }
    }
    
    const handleUseNow = () => {
        setShowSlotSelection(true);
    };
    
    const handleDefer = () => {
        // Just close the panel - IGL chose to wait
        setShowSlotSelection(false);
    };
    
    const handleSlotSelect = (slot: number) => {
        onDoubleCallin(slot);
        setShowSlotSelection(false);
    };
    
    const handleCancel = () => {
        setShowSlotSelection(false);
    };

    return (
        <motion.div
            data-testid="igl-controls"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-b from-amber-900/40 to-slate-900/90 
                       rounded-xl border border-amber-500/30 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/20 border-b border-amber-500/20">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-amber-400">IGL Command Center</span>
                <span className="text-xs text-amber-400/60 ml-auto">
                    {phase === 'halftime' ? 'Halftime' : `Before Round ${nextRound}`}
                </span>
            </div>

            <div className="p-4 space-y-4">
                {/* Double Call-In */}
                <div className={cn(
                    "p-3 rounded-lg border transition-all",
                    (canUseNow || canDefer)
                        ? "bg-purple-500/10 border-purple-500/30"
                        : "bg-white/5 border-white/10 opacity-50"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-purple-400" />
                            <span className="font-semibold text-sm">Double Call-In</span>
                        </div>
                        {usedThisHalf ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50">
                                ✓ Used this half
                            </span>
                        ) : (canUseNow || canDefer) ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                {remainingRounds} chance{remainingRounds !== 1 ? 's' : ''} left
                            </span>
                        ) : (
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50">
                                Not available
                            </span>
                        )}
                    </div>
                    
                    <p className="text-xs text-white/50 mb-3">
                        Call in <span className="text-purple-400 font-semibold">{anchorName}</span> (Anchor) 
                        to play an additional slot. One player sits out that round.
                    </p>
                    
                    {/* Round availability indicator for 1st half */}
                    {half === 1 && !usedThisHalf && (
                        <div className="flex items-center gap-2 mb-4 text-xs">
                            <span className="text-white/40">Half 1:</span>
                            {[1, 2, 3].map(r => {
                                const isPast = r < nextRound;
                                const isCurrent = r === nextRound;
                                const isAvailable = r >= nextRound && r <= 3;
                                return (
                                    <span key={r} className={cn(
                                        "px-2 py-0.5 rounded",
                                        isPast 
                                            ? "bg-white/5 text-white/30 line-through" 
                                            : isCurrent
                                                ? "bg-purple-500/30 text-purple-300 ring-1 ring-purple-400"
                                                : isAvailable
                                                    ? "bg-purple-500/20 text-purple-400"
                                                    : "bg-white/5 text-white/30"
                                    )}>
                                        R{r}{isCurrent && ' ←'}
                                    </span>
                                );
                            })}
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400/50">R4 ✗</span>
                        </div>
                    )}
                    
                    {/* Round availability for 2nd half */}
                    {half === 2 && !usedThisHalf && (
                        <div className="flex items-center gap-2 mb-4 text-xs">
                            <span className="text-white/40">Half 2:</span>
                            <span className={cn(
                                "px-2 py-0.5 rounded",
                                nextRound === 5 
                                    ? "bg-purple-500/30 text-purple-300 ring-1 ring-purple-400" 
                                    : "bg-white/5 text-white/30 line-through"
                            )}>
                                R1 {nextRound === 5 ? '← NOW OR NEVER' : '(missed)'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400/50">R2-R4 ✗</span>
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {!showSlotSelection ? (
                            /* Step 1: Choose round or defer */
                            <motion.div
                                key="round-selection"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-2"
                            >
                                {(canUseNow || canDefer) && (
                                    <>
                                        {canUseNow && (
                                            <button
                                                data-testid="double-callin-button"
                                                onClick={handleUseNow}
                                                className="w-full py-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 
                                                           text-purple-400 font-semibold transition-all
                                                           flex items-center justify-center gap-2
                                                           border border-purple-500/30 hover:border-purple-500/50"
                                            >
                                                <Zap className="w-4 h-4" />
                                                Use for Round {nextRound}
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        )}
                                        
                                        {canDefer && (
                                            <button
                                                onClick={handleDefer}
                                                className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 
                                                           text-white/60 text-sm transition-all
                                                           flex items-center justify-center gap-2"
                                            >
                                                Defer to Later Round
                                                <span className="text-white/40">
                                                    ({remainingRounds - 1} chance{remainingRounds - 1 !== 1 ? 's' : ''} remaining)
                                                </span>
                                            </button>
                                        )}
                                        
                                        {!canDefer && canUseNow && (
                                            <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 p-2 rounded">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                <span>Last chance! Cannot defer past this round.</span>
                                            </div>
                                        )}
                                    </>
                                )}
                                
                                {!canUseNow && !canDefer && !usedThisHalf && (
                                    <div className="text-center text-white/40 text-sm py-2">
                                        No longer available this half
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            /* Step 2: Select slot for anchor */
                            <motion.div
                                key="slot-selection"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-white/60">
                                        Select slot for <span className="text-purple-400">{anchorName}</span> to take over in Round {nextRound}:
                                    </p>
                                    <button
                                        onClick={handleCancel}
                                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div data-testid="slot-selection-panel" className="grid grid-cols-5 gap-2">
                                    {availableSlots.map(({ slot, operation, playerName }) => (
                                        <button
                                            key={slot}
                                            data-testid={`callin-slot-${slot}`}
                                            onClick={() => handleSlotSelect(slot)}
                                            className="p-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/40 
                                                       text-purple-400 text-xs font-bold transition-all
                                                       flex flex-col items-center border border-purple-500/30
                                                       hover:border-purple-500/60 hover:scale-105"
                                        >
                                            <span className="text-lg">{
                                                operation === 'addition' ? '+' :
                                                operation === 'subtraction' ? '−' :
                                                operation === 'multiplication' ? '×' :
                                                operation === 'division' ? '÷' : '?'
                                            }</span>
                                            <span className="text-[10px] text-white/50 truncate w-full text-center mt-1">
                                                {playerName}
                                            </span>
                                            <span className="text-[9px] text-purple-400/60 mt-0.5">
                                                (sits out)
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                
                                <p className="text-[10px] text-white/30 text-center">
                                    {anchorName} will play their slot + this slot. Selected player sits out Round {nextRound}.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Timeout */}
                <div className={cn(
                    "p-3 rounded-lg border transition-all",
                    timeoutsRemaining > 0
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-white/5 border-white/10 opacity-50"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-400" />
                            <span className="font-semibold text-sm">Call Timeout</span>
                        </div>
                        <span className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            timeoutsRemaining > 0 ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/50"
                        )}>
                            {timeoutsRemaining} remaining
                        </span>
                    </div>
                    <p className="text-xs text-white/50 mb-3">
                        Adds +1 minute to the current half. Use strategically!
                    </p>
                    {timeoutsRemaining > 0 && (
                        <button
                            data-testid="timeout-button"
                            onClick={onTimeout}
                            className="w-full py-2 rounded bg-blue-500/20 hover:bg-blue-500/30 
                                       text-blue-400 text-sm font-bold transition-colors 
                                       flex items-center justify-center gap-2"
                        >
                            <Clock className="w-4 h-4" />
                            Call Timeout (+1 min)
                        </button>
                    )}
                </div>

                {/* Slot Reassignment hint during halftime */}
                {phase === 'halftime' && (
                    <div className="p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/30">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-sm text-emerald-400">Slot Reassignment</span>
                        </div>
                        <p className="text-xs text-white/50">
                            You can reassign player slots during halftime. Changes take effect in the 2nd half.
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
