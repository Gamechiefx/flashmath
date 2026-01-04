'use client';

/**
 * AnchorAbilities
 * 
 * UI for the Anchor player's special abilities:
 * - Double Call-In: Play two slots in a round
 * - Final Round Solo: Play all 5 slots in the final round
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Anchor, Zap, Shield, AlertTriangle } from 'lucide-react';

interface AnchorAbilitiesProps {
    isAnchor: boolean;
    usedDoubleCallin: boolean;
    usedAnchorSolo: boolean;
    currentRound: number;
    totalRounds: number;
    onDoubleCallin: (targetSlot: number) => void;
    onAnchorSolo: () => void;
    availableSlots: { slot: number; operation: string }[];
    isMatchActive: boolean;
}

export function AnchorAbilities({
    isAnchor,
    usedDoubleCallin,
    usedAnchorSolo,
    currentRound,
    totalRounds,
    onDoubleCallin,
    onAnchorSolo,
    availableSlots,
    isMatchActive,
}: AnchorAbilitiesProps) {
    if (!isAnchor) return null;

    const isFinalRound = currentRound === totalRounds;
    const canUseDoubleCallin = !usedDoubleCallin && isMatchActive && !isFinalRound;
    const canUseAnchorSolo = !usedAnchorSolo && isFinalRound && isMatchActive;

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-gradient-to-b from-purple-900/40 to-slate-900/90 
                       rounded-xl border border-purple-500/30 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-purple-500/20 border-b border-purple-500/20">
                <Anchor className="w-5 h-5 text-purple-400" />
                <span className="font-bold text-purple-400">Anchor Abilities</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Double Call-In */}
                <div className={cn(
                    "p-3 rounded-lg border transition-all",
                    canUseDoubleCallin
                        ? "bg-purple-500/10 border-purple-500/30 cursor-pointer hover:bg-purple-500/20"
                        : "bg-white/5 border-white/10 opacity-50"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-purple-400" />
                            <span className="font-semibold text-sm">Double Call-In</span>
                        </div>
                        {usedDoubleCallin && (
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50">
                                Used
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-white/50 mb-3">
                        Play two slots this round. Select a second slot to activate.
                    </p>

                    {canUseDoubleCallin && (
                        <div className="grid grid-cols-5 gap-1">
                            {availableSlots.map(({ slot, operation }) => (
                                <button
                                    key={slot}
                                    onClick={() => onDoubleCallin(slot)}
                                    className="p-2 rounded bg-purple-500/20 hover:bg-purple-500/30 
                                               text-purple-400 text-xs font-bold transition-colors"
                                >
                                    Slot {slot}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Final Round Solo */}
                <div className={cn(
                    "p-3 rounded-lg border transition-all",
                    canUseAnchorSolo
                        ? "bg-amber-500/10 border-amber-500/30 cursor-pointer hover:bg-amber-500/20"
                        : "bg-white/5 border-white/10 opacity-50"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-amber-400" />
                            <span className="font-semibold text-sm">Final Round Solo</span>
                        </div>
                        {usedAnchorSolo && (
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50">
                                Used
                            </span>
                        )}
                        {!isFinalRound && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                Round {totalRounds} Only
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-white/50 mb-3">
                        Take over all 5 slots in the final round.
                    </p>

                    {canUseAnchorSolo && (
                        <button
                            onClick={onAnchorSolo}
                            className="w-full py-2 rounded bg-amber-500/20 hover:bg-amber-500/30 
                                       text-amber-400 text-sm font-bold transition-colors 
                                       flex items-center justify-center gap-2"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Activate Final Round Solo
                        </button>
                    )}
                </div>
            </div>

            {/* Status */}
            <div className="px-4 py-2 bg-white/5 border-t border-white/10 
                            text-xs text-white/40 text-center">
                {!usedDoubleCallin && !usedAnchorSolo && 'Both abilities available'}
                {usedDoubleCallin && !usedAnchorSolo && 'Final Round Solo available'}
                {!usedDoubleCallin && usedAnchorSolo && 'Double Call-In available'}
                {usedDoubleCallin && usedAnchorSolo && 'All abilities used'}
            </div>
        </motion.div>
    );
}


