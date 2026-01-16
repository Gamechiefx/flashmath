'use client';

/**
 * SlotAssignmentBoard
 * 
 * Drag-and-drop interface for IGL to assign players to operation slots.
 * Features:
 * - Draggable player cards
 * - Operation slot drop zones
 * - Visual feedback for valid/invalid drops
 * - Mobile-friendly tap-to-select alternative
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    GripVertical, 
    Crown, 
    Anchor, 
    Target, 
    CheckCircle2,
    AlertCircle,
    ArrowRight
} from 'lucide-react';

export interface SlotPlayer {
    playerId: string;
    name: string;
    isIgl?: boolean;
    isAnchor?: boolean;
    isCurrentUser?: boolean;
    preferredOperation?: string;
    accuracy: Record<string, number>; // operation -> accuracy %
    assignedSlot?: string;
}

export interface SlotAssignment {
    operation: string;
    playerId: string | null;
}

interface SlotAssignmentBoardProps {
    players: SlotPlayer[];
    currentAssignments: SlotAssignment[];
    isEditable: boolean;
    onAssignmentChange: (playerId: string, newSlot: string) => void;
    className?: string;
}

const operations = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];

const operationConfig: Record<string, { symbol: string; label: string; color: string; bg: string }> = {
    addition: { symbol: '+', label: 'Addition', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/50' },
    subtraction: { symbol: '−', label: 'Subtraction', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/50' },
    multiplication: { symbol: '×', label: 'Multiplication', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/50' },
    division: { symbol: '÷', label: 'Division', color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/50' },
    mixed: { symbol: '?', label: 'Mixed', color: 'text-pink-400', bg: 'bg-pink-500/20 border-pink-500/50' },
};

function PlayerCard({
    player,
    isSelected,
    isDragging,
    onClick,
    draggable,
}: {
    player: SlotPlayer;
    isSelected: boolean;
    isDragging?: boolean;
    onClick: () => void;
    draggable: boolean;
}) {
    // Find best operation for this player
    const bestOp = Object.entries(player.accuracy || {}).reduce(
        (best, [op, acc]) => (acc > best.acc ? { op, acc } : best),
        { op: '', acc: 0 }
    );
    
    return (
        <motion.div
            layoutId={`player-${player.playerId}`}
            onClick={onClick}
            whileHover={draggable ? { scale: 1.02 } : {}}
            whileTap={draggable ? { scale: 0.98 } : {}}
            className={cn(
                "relative flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer",
                "transition-all duration-200",
                isSelected && "border-primary bg-primary/10 ring-2 ring-primary/30",
                !isSelected && "border-white/10 bg-white/5 hover:border-white/20",
                isDragging && "opacity-50",
                player.isCurrentUser && "ring-1 ring-primary/50"
            )}
        >
            {/* Drag handle */}
            {draggable && (
                <div className="text-white/30">
                    <GripVertical className="w-4 h-4" />
                </div>
            )}
            
            {/* Avatar */}
            <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                "bg-gradient-to-br from-primary/30 to-purple-600/30"
            )}>
                {player.name.charAt(0).toUpperCase()}
            </div>
            
            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                    <span className={cn(
                        "font-medium text-sm truncate",
                        player.isCurrentUser ? "text-primary" : "text-white"
                    )}>
                        {player.isCurrentUser ? 'YOU' : player.name}
                    </span>
                    {player.isIgl && <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    {player.isAnchor && <Anchor className="w-3 h-3 text-cyan-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-white/50">
                    <Target className="w-3 h-3" />
                    <span>Best: {operationConfig[bestOp.op]?.symbol || '-'} ({bestOp.acc.toFixed(0)}%)</span>
                </div>
            </div>
            
            {/* Current assignment indicator */}
            {player.assignedSlot && (
                <div className={cn(
                    "px-2 py-1 rounded-lg text-lg font-bold",
                    operationConfig[player.assignedSlot]?.bg
                )}>
                    {operationConfig[player.assignedSlot]?.symbol}
                </div>
            )}
            
            {/* Selection indicator */}
            {isSelected && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full 
                               flex items-center justify-center"
                >
                    <CheckCircle2 className="w-3 h-3 text-white" />
                </motion.div>
            )}
        </motion.div>
    );
}

function SlotDropZone({
    operation,
    assignedPlayer,
    isHighlighted,
    isValid,
    onClick,
}: {
    operation: string;
    assignedPlayer?: SlotPlayer;
    isHighlighted: boolean;
    isValid: boolean;
    onClick: () => void;
}) {
    const config = operationConfig[operation];
    
    return (
        <motion.div
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                "min-h-[120px] flex flex-col items-center justify-center",
                isHighlighted && isValid && "border-primary bg-primary/10 ring-2 ring-primary/30",
                isHighlighted && !isValid && "border-rose-500 bg-rose-500/10",
                !isHighlighted && assignedPlayer && config.bg,
                !isHighlighted && !assignedPlayer && "border-dashed border-white/20 bg-white/5"
            )}
        >
            {/* Operation header */}
            <div className={cn("text-3xl font-black mb-2", config.color)}>
                {config.symbol}
            </div>
            <div className={cn("text-xs font-medium uppercase tracking-wider mb-3", config.color)}>
                {config.label}
            </div>
            
            {/* Assigned player or empty state */}
            {assignedPlayer ? (
                <div className="text-center">
                    <div className={cn(
                        "w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center",
                        "bg-gradient-to-br from-primary/30 to-purple-600/30 text-sm font-bold"
                    )}>
                        {assignedPlayer.name.charAt(0).toUpperCase()}
                    </div>
                    <p className={cn(
                        "text-xs font-medium truncate max-w-[80px]",
                        assignedPlayer.isCurrentUser ? "text-primary" : "text-white/70"
                    )}>
                        {assignedPlayer.isCurrentUser ? 'YOU' : assignedPlayer.name}
                    </p>
                    {(assignedPlayer.isIgl || assignedPlayer.isAnchor) && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                            {assignedPlayer.isIgl && <Crown className="w-3 h-3 text-amber-400" />}
                            {assignedPlayer.isAnchor && <Anchor className="w-3 h-3 text-cyan-400" />}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-xs text-white/30">
                    Drop player here
                </div>
            )}
            
            {/* Highlight indicator */}
            {isHighlighted && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(
                        "absolute inset-0 rounded-xl pointer-events-none",
                        isValid ? "bg-primary/5" : "bg-rose-500/5"
                    )}
                />
            )}
        </motion.div>
    );
}

export function SlotAssignmentBoard({
    players,
    currentAssignments,
    isEditable,
    onAssignmentChange,
    className,
}: SlotAssignmentBoardProps) {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    
    // Build player map with current assignments
    const playersWithSlots = players.map(p => ({
        ...p,
        assignedSlot: currentAssignments.find(a => a.playerId === p.playerId)?.operation,
    }));
    
    // Get player assigned to each slot
    const getPlayerInSlot = (operation: string) => {
        const assignment = currentAssignments.find(a => a.operation === operation);
        return assignment?.playerId 
            ? playersWithSlots.find(p => p.playerId === assignment.playerId) 
            : undefined;
    };
    
    const handlePlayerClick = (playerId: string) => {
        if (!isEditable) return;
        setSelectedPlayer(prev => prev === playerId ? null : playerId);
    };
    
    const handleSlotClick = (operation: string) => {
        if (!isEditable || !selectedPlayer) return;
        
        onAssignmentChange(selectedPlayer, operation);
        setSelectedPlayer(null);
    };

    return (
        <div className={cn("space-y-6", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-white">Slot Assignments</h3>
                </div>
                {isEditable && (
                    <span className="text-xs text-white/50">
                        {selectedPlayer 
                            ? "Now click a slot to assign" 
                            : "Click a player to select"}
                    </span>
                )}
            </div>
            
            {/* Selected player indicator */}
            <AnimatePresence>
                {selectedPlayer && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-lg bg-primary/10 border border-primary/30"
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-primary" />
                            <span className="text-sm text-primary">
                                Selected: {playersWithSlots.find(p => p.playerId === selectedPlayer)?.name}
                            </span>
                            <ArrowRight className="w-4 h-4 text-primary/50" />
                            <span className="text-sm text-white/50">Click a slot below</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Slot grid */}
            <div className="grid grid-cols-5 gap-3">
                {operations.map(op => (
                    <SlotDropZone
                        key={op}
                        operation={op}
                        assignedPlayer={getPlayerInSlot(op)}
                        isHighlighted={!!selectedPlayer}
                        isValid={true}
                        onClick={() => handleSlotClick(op)}
                    />
                ))}
            </div>
            
            {/* Player roster */}
            <div>
                <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                    Team Roster
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {playersWithSlots.map(player => (
                        <PlayerCard
                            key={player.playerId}
                            player={player}
                            isSelected={selectedPlayer === player.playerId}
                            onClick={() => handlePlayerClick(player.playerId)}
                            draggable={isEditable}
                        />
                    ))}
                </div>
            </div>
            
            {/* Instructions */}
            {isEditable && (
                <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50">
                    <p>
                        <strong className="text-white">Instructions:</strong> Click on a player to select them, 
                        then click on an operation slot to assign them. Consider each player&apos;s strengths 
                        when making assignments.
                    </p>
                </div>
            )}
        </div>
    );
}

