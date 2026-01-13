'use client';

/**
 * IGL Floating Action Button
 * Fixed position button on left edge that opens the IGL control panel
 * Only visible to the IGL during matches (break, halftime, anchor decision phases)
 * 
 * Features:
 * - Double Call-In: Anchor takes over an additional slot
 * - Timeout: Extends next break time
 * - Slot Reassignment: Move players between slots (halftime only)
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Clock, Zap, Users, X, ChevronRight, AlertCircle, ArrowLeftRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SlotPlayer {
    playerId: string;
    name: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    isAITeammate?: boolean;
    currentSlot: string;
}

interface IGLFABProps {
    isIGL: boolean;
    half: number;
    currentRound: number;
    usedDoubleCallinHalf1: boolean;
    usedDoubleCallinHalf2: boolean;
    timeoutsRemaining: number;
    anchorName: string;
    phase: 'active' | 'break' | 'halftime' | 'anchor_decision' | 'strategy' | 'pre_match' | 'post_match' | 'round_countdown';
    availableSlots: { slot: number; operation: string; playerName: string }[];
    teamPlayers?: SlotPlayer[];
    onDoubleCallin: (targetRound: number, targetSlot: string) => void;
    onTimeout: () => void;
    onSlotReassign?: (playerId: string, newSlot: string) => void;
}

const operations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];
const operationSymbols: Record<string, string> = {
    addition: '+', subtraction: '−', multiplication: '×', division: '÷', mixed: '?'
};
const operationColors: Record<string, string> = {
    addition: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
    subtraction: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
    multiplication: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
    division: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
    mixed: 'bg-pink-500/20 border-pink-500/50 text-pink-400',
};

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
    teamPlayers = [],
    onDoubleCallin,
    onTimeout,
    onSlotReassign,
}: IGLFABProps) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [showSlotSelection, setShowSlotSelection] = useState(false);
    const [showSlotReassignment, setShowSlotReassignment] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

    // Only show for IGL
    if (!isIGL) return null;

    // IGL can take actions during active play, breaks, halftime, and strategy
    const actionablePhases = ['active', 'break', 'halftime', 'anchor_decision', 'strategy'];
    const canTakeAction = actionablePhases.includes(phase);

    // Calculate Double Call-In availability
    // During ACTIVE phase: setting up for NEXT round
    // During BREAK phase: setting up for the upcoming round
    const usedThisHalf = half === 1 ? usedDoubleCallinHalf1 : usedDoubleCallinHalf2;
    
    // Target round for Double Call-In
    // Active phase: next round (currentRound + 1)
    // Break phase: next round (currentRound + 1) 
    // Strategy: round 1
    const targetRound = phase === 'strategy' 
        ? 1 
        : (phase === 'active' ? currentRound + 1 : currentRound + 1);
    
    let canUseDoubleCallin = false;
    if (!usedThisHalf) {
        // 1st Half: Rounds 1-3 available for Double Call-In
        if (half === 1 && targetRound <= 3) canUseDoubleCallin = true;
        // 2nd Half: Only Round 5 (first round of 2nd half)
        if (half === 2 && targetRound === 5) canUseDoubleCallin = true;
    }

    // Timeout extends the NEXT break period (or adds to half time if final round)
    // Can be called during active play or during breaks
    const canCallTimeout = timeoutsRemaining > 0 && ['active', 'break', 'halftime'].includes(phase);
    
    // Determine what the timeout affects
    const roundsInHalf = 4;
    const isLastRoundOfHalf = half === 1 
        ? currentRound === roundsInHalf 
        : currentRound === roundsInHalf * 2;
    const timeoutTarget = isLastRoundOfHalf 
        ? (half === 1 ? 'halftime' : 'the final break')
        : `break after Round ${currentRound || 1}`;

    const handleDoubleCallinClick = () => {
        if (canUseDoubleCallin) {
            setShowSlotSelection(true);
        }
    };

    const handleSlotSelect = (slot: number, operation: string) => {
        onDoubleCallin(targetRound, operation);
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
                                                <p className="text-xs text-white/50">Anchor answers for 2 slots</p>
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
                                            Double Call-In for Round {targetRound}
                                        </h3>
                                        <p className="text-xs text-white/50 mb-3">
                                            Select which slot <span className="text-purple-400 font-semibold">{anchorName}</span> will 
                                            take over. They&apos;ll answer for both their own slot AND the selected slot.
                                        </p>
                                        <div className="space-y-2">
                                            {availableSlots.map(({ slot, operation, playerName }) => (
                                                <button
                                                    key={slot}
                                                    onClick={() => handleSlotSelect(slot, operation)}
                                                    className="w-full p-3 rounded-lg bg-white/10 hover:bg-purple-500/20 
                                                               border border-white/10 hover:border-purple-500/30
                                                               text-left transition-all"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold text-white capitalize">{operation}</span>
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
                                            <p className="text-xs text-white/50">
                                                +30s to {timeoutTarget}
                                            </p>
                                        </div>
                                    </div>
                                    {phase === 'active' && (
                                        <p className="mt-2 text-xs text-amber-400/70 italic">
                                            Timeout will extend your next break, not pause the current round.
                                        </p>
                                    )}
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

                                {/* Slot Reassignment - Only during halftime */}
                                {phase === 'halftime' && !showSlotReassignment && (
                                    <div 
                                        className="p-4 rounded-xl border bg-cyan-500/10 border-cyan-500/30 
                                                   cursor-pointer hover:bg-cyan-500/20 transition-all"
                                        onClick={() => setShowSlotReassignment(true)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                                <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white">Reassign Slots</h3>
                                                <p className="text-xs text-white/50">
                                                    Move players to different operations for 2nd half
                                                </p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-cyan-400 ml-auto" />
                                        </div>
                                        {teamPlayers.some(p => p.isAITeammate) && (
                                            <p className="mt-2 text-xs text-cyan-400/70 italic">
                                                Includes AI teammates
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Slot Reassignment Panel */}
                                {phase === 'halftime' && showSlotReassignment && (
                                    <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-cyan-400 flex items-center gap-2">
                                                <ArrowLeftRight className="w-4 h-4" />
                                                Reassign Slots for 2nd Half
                                            </h3>
                                            <button
                                                onClick={() => {
                                                    setShowSlotReassignment(false);
                                                    setSelectedPlayer(null);
                                                    setPendingChanges({});
                                                }}
                                                className="p-1 rounded hover:bg-white/10 text-white/50"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>

                                        {/* Instructions */}
                                        <p className="text-xs text-white/50 mb-4">
                                            {selectedPlayer 
                                                ? "Now click a slot to assign this player"
                                                : "Click a player, then click a slot to move them"}
                                        </p>

                                        {/* Slot Grid */}
                                        <div className="grid grid-cols-5 gap-2 mb-4">
                                            {operations.map(op => {
                                                const assignedPlayer = teamPlayers.find(p => 
                                                    pendingChanges[p.playerId] === op || 
                                                    (!pendingChanges[p.playerId] && p.currentSlot === op)
                                                );
                                                const isHighlighted = !!selectedPlayer;
                                                
                                                return (
                                                    <button
                                                        key={op}
                                                        onClick={() => {
                                                            if (selectedPlayer && onSlotReassign) {
                                                                // Check if someone is already in this slot
                                                                const currentOccupant = teamPlayers.find(p =>
                                                                    pendingChanges[p.playerId] === op ||
                                                                    (!pendingChanges[p.playerId] && p.currentSlot === op)
                                                                );
                                                                const movingPlayer = teamPlayers.find(p => p.playerId === selectedPlayer);
                                                                
                                                                if (currentOccupant && movingPlayer && currentOccupant.playerId !== selectedPlayer) {
                                                                    // Swap: occupant goes to moving player's old slot
                                                                    const oldSlot = pendingChanges[selectedPlayer] || movingPlayer.currentSlot;
                                                                    setPendingChanges(prev => ({
                                                                        ...prev,
                                                                        [selectedPlayer]: op,
                                                                        [currentOccupant.playerId]: oldSlot,
                                                                    }));
                                                                } else {
                                                                    // Just move
                                                                    setPendingChanges(prev => ({
                                                                        ...prev,
                                                                        [selectedPlayer]: op,
                                                                    }));
                                                                }
                                                                setSelectedPlayer(null);
                                                            }
                                                        }}
                                                        disabled={!selectedPlayer}
                                                        className={cn(
                                                            "p-2 rounded-lg border-2 transition-all flex flex-col items-center",
                                                            operationColors[op],
                                                            isHighlighted && "ring-2 ring-white/30 scale-105",
                                                            !selectedPlayer && "cursor-default"
                                                        )}
                                                    >
                                                        <span className="text-xl font-black">{operationSymbols[op]}</span>
                                                        <span className="text-[9px] truncate w-full text-center mt-1 opacity-70">
                                                            {assignedPlayer?.name || '—'}
                                                        </span>
                                                        {assignedPlayer?.isAITeammate && (
                                                            <span className="text-[8px] text-cyan-300">AI</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Player List */}
                                        <div className="space-y-1 mb-4">
                                            {teamPlayers.map(player => {
                                                const currentSlot = pendingChanges[player.playerId] || player.currentSlot;
                                                const hasChanged = !!pendingChanges[player.playerId];
                                                
                                                return (
                                                    <button
                                                        key={player.playerId}
                                                        onClick={() => setSelectedPlayer(
                                                            selectedPlayer === player.playerId ? null : player.playerId
                                                        )}
                                                        className={cn(
                                                            "w-full p-2 rounded-lg border text-left transition-all flex items-center gap-2",
                                                            selectedPlayer === player.playerId
                                                                ? "border-cyan-400 bg-cyan-500/20"
                                                                : "border-white/10 bg-white/5 hover:bg-white/10",
                                                            hasChanged && "ring-1 ring-emerald-400/50"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-6 h-6 rounded flex items-center justify-center text-sm font-bold",
                                                            operationColors[currentSlot]
                                                        )}>
                                                            {operationSymbols[currentSlot]}
                                                        </div>
                                                        <span className="text-sm text-white flex-1 truncate">
                                                            {player.name}
                                                        </span>
                                                        {player.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                                                        {player.isAnchor && <Users className="w-3 h-3 text-cyan-400" />}
                                                        {player.isAITeammate && (
                                                            <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                                                AI
                                                            </span>
                                                        )}
                                                        {hasChanged && (
                                                            <span className="text-[10px] text-emerald-400">changed</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Apply Changes Button */}
                                        {Object.keys(pendingChanges).length > 0 && (
                                            <button
                                                onClick={() => {
                                                    // Apply all pending changes
                                                    Object.entries(pendingChanges).forEach(([playerId, newSlot]) => {
                                                        onSlotReassign?.(playerId, newSlot);
                                                    });
                                                    setPendingChanges({});
                                                    setShowSlotReassignment(false);
                                                }}
                                                className="w-full py-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 
                                                           border border-emerald-500/30 text-emerald-400 font-bold
                                                           flex items-center justify-center gap-2 transition-all"
                                            >
                                                <Check className="w-4 h-4" />
                                                Apply {Object.keys(pendingChanges).length} Change{Object.keys(pendingChanges).length !== 1 ? 's' : ''}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Phase-specific help */}
                                {phase === 'active' && (
                                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                        <div className="text-xs text-emerald-300 space-y-1">
                                            <p><strong>During active play:</strong></p>
                                            <p>• <strong>Double Call-In:</strong> Anchor answers for 2 slots in Round {targetRound}</p>
                                            <p>• <strong>Timeout:</strong> Extends {timeoutTarget} by +30s (does not pause current round)</p>
                                        </div>
                                    </div>
                                )}
                                {!canTakeAction && (
                                    <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 shrink-0" />
                                        <p className="text-xs text-white/50">
                                            IGL actions available during active play, breaks, and halftime.
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

