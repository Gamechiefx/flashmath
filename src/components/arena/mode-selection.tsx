'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { soundEngine } from '@/lib/sound-engine';
import { Trophy, ChevronRight } from 'lucide-react';

interface GameMode {
    id: string;
    name: string;
    available: boolean;
    gradient: string;
    rating?: number;
}

type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division' | 'mixed';

const OPERATION_ICONS: Record<Operation, { symbol: string; label: string; color: string }> = {
    addition: { symbol: '+', label: 'Add', color: 'text-green-400 hover:bg-green-500/20 border-green-500/30' },
    subtraction: { symbol: '−', label: 'Sub', color: 'text-blue-400 hover:bg-blue-500/20 border-blue-500/30' },
    multiplication: { symbol: '×', label: 'Mul', color: 'text-purple-400 hover:bg-purple-500/20 border-purple-500/30' },
    division: { symbol: '÷', label: 'Div', color: 'text-orange-400 hover:bg-orange-500/20 border-orange-500/30' },
    mixed: { symbol: '?', label: 'Mix', color: 'text-pink-400 hover:bg-pink-500/20 border-pink-500/30' },
};

function ParticleBackground() {
    const [mounted, setMounted] = useState(false);
    const symbols = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '−', '×', '÷'];

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
            {[...Array(20)].map((_, i) => (
                <div
                    key={i}
                    className="absolute text-primary/20 font-black animate-float-particle pointer-events-none"
                    style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        fontSize: `${Math.random() * 20 + 20}px`,
                        animationDelay: `${Math.random() * 20}s`,
                        animationDuration: `${Math.random() * 10 + 15}s`,
                        opacity: 0
                    }}
                >
                    {symbols[i % symbols.length]}
                </div>
            ))}
        </div>
    );
}

function RankBadge({ rank, division, elo }: { rank: string; division: string; elo: number }) {
    const rankColors: Record<string, { bg: string; border: string; glow: string }> = {
        Bronze: { bg: 'from-amber-700 to-amber-900', border: 'border-amber-500/50', glow: 'shadow-amber-500/20' },
        Silver: { bg: 'from-slate-400 to-slate-600', border: 'border-slate-300/50', glow: 'shadow-slate-300/20' },
        Gold: { bg: 'from-yellow-400 to-yellow-600', border: 'border-yellow-300/50', glow: 'shadow-yellow-300/20' },
        Platinum: { bg: 'from-cyan-400 to-cyan-600', border: 'border-cyan-300/50', glow: 'shadow-cyan-300/20' },
        Diamond: { bg: 'from-blue-400 to-indigo-600', border: 'border-blue-300/50', glow: 'shadow-blue-300/20' },
    };
    const colors = rankColors[rank] || rankColors.Silver;

    return (
        <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className={cn(
                "relative w-14 h-14 rounded-lg bg-gradient-to-br shadow-2xl flex items-center justify-center border-2 will-change-transform",
                colors.bg,
                colors.border,
                colors.glow
            )}
        >
            <div className="absolute inset-0 rounded-lg bg-white/10 blur-md animate-pulse" />
            <span className="text-2xl font-black text-white drop-shadow-md z-10">{rank.charAt(0)}</span>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded bg-background border border-white/20 text-[10px] font-black flex items-center justify-center text-white z-20 shadow-lg">
                {division}
            </div>
        </motion.div>
    );
}

interface ModeCardProps {
    mode: GameMode;
    isSelected: boolean;
    selectedOperation: Operation;
    onSelect: () => void;
    onOperationSelect: (op: Operation) => void;
    index: number;
    className?: string;
}

function ModeCard({ mode, isSelected, selectedOperation, onSelect, onOperationSelect, index, className }: ModeCardProps) {
    const isTeamMode = mode.id === '5v5';
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={mode.available ? { scale: 1.02, y: -4 } : {}}
            onClick={() => {
                if (mode.available) {
                    soundEngine.playClick();
                    onSelect();
                }
            }}
            onMouseEnter={() => mode.available && soundEngine.playHover()}
            className={cn(
                "relative group flex flex-col justify-between p-5 rounded-[2rem] cursor-pointer overflow-hidden h-full transform-gpu will-change-transform",
                isSelected
                    ? "ring-4 ring-primary/50 z-20 shadow-[0_0_40px_var(--accent-glow)]"
                    : "border-2 border-white/5 hover:border-white/10 z-10",
                !mode.available && "opacity-40 grayscale hover:grayscale-0",
                // Special 5v5 team mode styling
                isTeamMode && mode.available && !isSelected && "border-purple-500/30 hover:border-purple-500/50",
                isTeamMode && isSelected && "ring-purple-500/60 shadow-[0_0_60px_rgba(139,92,246,0.4)]",
                className
            )}
            style={{
                background: isSelected
                    ? mode.gradient
                    : isTeamMode && mode.available
                        ? 'linear-gradient(180deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)'
            }}
        >
            {/* 5v5 Special: Animated pulse border */}
            {isTeamMode && mode.available && !isSelected && (
                <motion.div 
                    className="absolute inset-0 rounded-[2rem] pointer-events-none"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                    <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-purple-500/30 via-violet-500/30 to-purple-500/30 blur-sm" />
                </motion.div>
            )}

            {/* 5v5 Special: Floating team icons */}
            {isTeamMode && mode.available && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {/* Player silhouettes floating */}
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute text-2xl opacity-20"
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ 
                                y: [-10, 10, -10],
                                opacity: [0.1, 0.25, 0.1],
                            }}
                            transition={{
                                duration: 3 + i * 0.5,
                                repeat: Infinity,
                                delay: i * 0.3,
                            }}
                            style={{
                                left: `${10 + i * 18}%`,
                                top: `${20 + (i % 2) * 15}%`,
                            }}
                        >
                            👤
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Background Animated Stripes (Only if selected) */}
            {isSelected && (
                <div
                    className="absolute inset-0 opacity-20 mix-blend-overlay animate-stripe-flow"
                    style={{
                        backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.3) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.3) 75%, transparent 75%, transparent)',
                        backgroundSize: '60px 60px'
                    }}
                />
            )}

            {/* 5v5 Special: Lightning bolt effects when selected */}
            {isTeamMode && isSelected && (
                <>
                    <motion.div
                        className="absolute top-2 right-2 text-3xl"
                        animate={{ 
                            rotate: [0, 10, -10, 0],
                            scale: [1, 1.1, 1],
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        ⚡
                    </motion.div>
                    <motion.div
                        className="absolute bottom-2 left-2 text-2xl"
                        animate={{ 
                            rotate: [0, -10, 10, 0],
                            scale: [1, 1.2, 1],
                        }}
                        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
                    >
                        🔥
                    </motion.div>
                </>
            )}

            {/* Shine on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />

            {/* Top: Mode Name & Badges */}
            <div className="relative flex items-start justify-between">
                <div className="flex flex-col">
                    <h3 className={cn(
                        "text-4xl font-black tracking-tighter drop-shadow-2xl transition-all duration-300",
                        isSelected ? "text-white" : "text-white/60 group-hover:text-white",
                        isTeamMode && !isSelected && "text-purple-300/80 group-hover:text-purple-200"
                    )}>
                        {mode.name}
                    </h3>
                    {/* 5v5 Special subtitle */}
                    {isTeamMode && mode.available && (
                        <motion.span 
                            className={cn(
                                "text-[10px] font-black uppercase tracking-[0.2em] mt-1",
                                isSelected ? "text-white/80" : "text-purple-400/80"
                            )}
                            animate={!isSelected ? { opacity: [0.5, 1, 0.5] } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            ⚔️ Team Battle ⚔️
                        </motion.span>
                    )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                    {/* NEW badge for 5v5 */}
                    {isTeamMode && mode.available && (
                        <motion.span 
                            className="px-3 py-1 bg-gradient-to-r from-purple-500 to-violet-500 text-white text-[10px] font-black uppercase rounded-full shadow-lg shadow-purple-500/30"
                            animate={{ 
                                scale: [1, 1.05, 1],
                                boxShadow: [
                                    '0 0 10px rgba(139, 92, 246, 0.3)',
                                    '0 0 20px rgba(139, 92, 246, 0.5)',
                                    '0 0 10px rgba(139, 92, 246, 0.3)',
                                ]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            🎮 NEW
                        </motion.span>
                    )}
                    {!mode.available && (
                        <span className="px-3 py-1 bg-amber-400 text-black text-[10px] font-black uppercase rounded-full shadow-lg">
                            Soon
                        </span>
                    )}
                    {mode.available && mode.rating && (
                        <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black shadow-lg flex items-center gap-1 backdrop-blur-sm border transition-colors",
                            isSelected
                                ? "bg-white/20 border-white/30 text-white"
                                : isTeamMode 
                                    ? "bg-purple-500/20 border-purple-500/30 text-purple-300"
                                    : "bg-primary/20 border-primary/30 text-primary"
                        )}>
                            <span className={cn(
                                isSelected ? "text-white" : isTeamMode ? "text-violet-400" : "text-amber-400"
                            )}>
                                {isTeamMode ? "TEAM" : "ELO"}
                            </span> {mode.rating}
                        </div>
                    )}
                </div>
            </div>

            {/* 5v5 Special: Team formation indicator */}
            {isTeamMode && mode.available && !isSelected && (
                <div className="relative mt-2 flex justify-center items-center gap-1">
                    <div className="flex -space-x-2">
                        {[...Array(5)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-violet-600 border-2 border-purple-900 flex items-center justify-center text-[8px] font-bold text-white shadow-lg"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1 * i }}
                            >
                                {i + 1}
                            </motion.div>
                        ))}
                    </div>
                    <span className="ml-2 text-xs font-bold text-purple-400/80">vs</span>
                    <div className="flex -space-x-2">
                        {[...Array(5)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-400 to-red-600 border-2 border-rose-900 flex items-center justify-center text-[8px] font-bold text-white shadow-lg"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1 * i + 0.3 }}
                            >
                                {i + 1}
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bottom: Operation Selection (Only for available non-team modes) */}
            {mode.available && isSelected && !isTeamMode && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex gap-2 justify-center relative z-50"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {(Object.keys(OPERATION_ICONS) as Operation[]).map((op) => {
                        const { symbol, label, color } = OPERATION_ICONS[op];
                        const isActive = selectedOperation === op;
                        return (
                            <button
                                key={op}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    soundEngine.playClick();
                                    onOperationSelect(op);
                                }}
                                onMouseEnter={() => soundEngine.playHover()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={cn(
                                    "w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center text-lg font-black transition-all cursor-pointer",
                                    isActive
                                        ? "bg-white/30 border-white text-white scale-110 shadow-lg"
                                        : `bg-black/20 ${color}`
                                )}
                                title={label}
                            >
                                <span className="text-xl">{symbol}</span>
                            </button>
                        );
                    })}
                </motion.div>
            )}

            {/* Team Mode: Show "All Operations" indicator when selected */}
            {mode.available && isSelected && isTeamMode && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex justify-center"
                >
                    <div className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-bold flex items-center gap-2">
                        <span className="flex gap-1">
                            {(Object.keys(OPERATION_ICONS) as Operation[]).map((op) => (
                                <span key={op} className="text-base">{OPERATION_ICONS[op].symbol}</span>
                            ))}
                        </span>
                        <span>All Operations</span>
                    </div>
                </motion.div>
            )}

            {/* Placeholder for non-selected cards (not for 5v5 which shows team formation) */}
            {mode.available && !isSelected && !isTeamMode && (
                <div className="mt-4 flex gap-2 justify-center opacity-30">
                    {(Object.keys(OPERATION_ICONS) as Operation[]).slice(0, 5).map((op) => (
                        <div key={op} className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white/50 text-lg font-black">
                            {OPERATION_ICONS[op].symbol}
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

interface ArenaStats {
    duel: {
        elo: number;
        addition: number;
        subtraction: number;
        multiplication: number;
        divisionOp: number;
        rank: string;
        rankDivision: string;
    };
    team: {
        elo: number;
        rank: string;
        rankDivision: string;
        modes: {
            '2v2': { elo: number; addition: number; subtraction: number; multiplication: number; divisionOp: number };
            '3v3': { elo: number; addition: number; subtraction: number; multiplication: number; divisionOp: number };
            '4v4': { elo: number; addition: number; subtraction: number; multiplication: number; divisionOp: number };
            '5v5': { elo: number; addition: number; subtraction: number; multiplication: number; divisionOp: number };
        };
    };
}

interface ModeSelectionProps {
    arenaStats?: ArenaStats;
}

const DEFAULT_STATS: ArenaStats = {
    duel: { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300, rank: 'Bronze', rankDivision: 'I' },
    team: { 
        elo: 300, rank: 'Bronze', rankDivision: 'I',
        modes: {
            '2v2': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '3v3': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '4v4': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '5v5': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
        }
    }
};

/**
 * Get the ELO for a specific mode and operation
 */
function getEloForModeAndOperation(stats: ArenaStats, mode: string, operation: Operation): number {
    if (operation === 'mixed') {
        // Mixed is unranked, show the overall average for display purposes
        if (mode === '1v1') return stats.duel.elo;
        const modeKey = mode as '2v2' | '3v3' | '4v4' | '5v5';
        return stats.team.modes[modeKey]?.elo || 300;
    }
    
    if (mode === '1v1') {
        if (operation === 'division') return stats.duel.divisionOp;
        return stats.duel[operation as 'addition' | 'subtraction' | 'multiplication'] || 300;
    }
    
    const modeKey = mode as '2v2' | '3v3' | '4v4' | '5v5';
    const modeStats = stats.team.modes[modeKey];
    if (!modeStats) return 300;
    
    if (operation === 'division') return modeStats.divisionOp;
    return modeStats[operation as 'addition' | 'subtraction' | 'multiplication'] || 300;
}

export function ModeSelection({ arenaStats = DEFAULT_STATS }: ModeSelectionProps) {
    const [selectedMode, setSelectedMode] = useState<string>('1v1');
    const [selectedOperation, setSelectedOperation] = useState<Operation>('mixed');
    const [isRankFabExpanded, setIsRankFabExpanded] = useState(false);

    // Determine if duel or team mode is selected (for operation-specific ELO display on mode cards)
    const isDuel = selectedMode === '1v1';

    // Build modes with dynamic ELO based on selected operation
    const vsModes: GameMode[] = [
        { id: '1v1', name: '1v1', available: true, gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', rating: getEloForModeAndOperation(arenaStats, '1v1', selectedOperation) },
        { id: '2v2', name: '2v2', available: false, gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', rating: getEloForModeAndOperation(arenaStats, '2v2', selectedOperation) },
        { id: '3v3', name: '3v3', available: false, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', rating: getEloForModeAndOperation(arenaStats, '3v3', selectedOperation) },
        { id: '4v4', name: '4v4', available: false, gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', rating: getEloForModeAndOperation(arenaStats, '4v4', selectedOperation) },
        { id: '5v5', name: '5v5', available: true, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', rating: getEloForModeAndOperation(arenaStats, '5v5', selectedOperation) },
    ];

    const extraModes: GameMode[] = [
        { id: 'custom', name: 'Custom Mode', available: false, gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' },
        { id: 'random', name: 'Random', available: false, gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
        { id: 'tournament', name: 'Tournaments', available: false, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
    ];

    const allModes = [...vsModes, ...extraModes];
    const selectedModeData = allModes.find(m => m.id === selectedMode);

    // Build queue URL with mode and operation
    // Team modes (5v5) go to the team queue flow
    const isTeamMode = selectedMode === '5v5' || selectedMode === '4v4' || selectedMode === '3v3' || selectedMode === '2v2';
    const queueHref = selectedModeData?.available
        ? isTeamMode
            ? `/arena/teams/setup?mode=${selectedMode}`
            : `/arena/queue?mode=${selectedMode}&operation=${selectedOperation}`
        : '#';

    return (
        <div className="h-full flex flex-col max-w-[1400px] mx-auto px-6 py-4 overflow-hidden relative">
            <ParticleBackground />

            {/* League Rank FAB - Right edge, well above Social FAB */}
            <div className="fixed right-0 top-24 z-50">
                <AnimatePresence mode="wait">
                    {!isRankFabExpanded ? (
                        /* Collapsed FAB Button */
                        <motion.button
                            key="fab-collapsed"
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 100, opacity: 0 }}
                            whileHover={{ x: -4, boxShadow: '0 0 30px rgba(251, 191, 36, 0.3)' }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                            onClick={() => {
                                soundEngine.playClick();
                                setIsRankFabExpanded(true);
                            }}
                            onMouseEnter={() => soundEngine.playHover()}
                            className={cn(
                                "flex items-center justify-center",
                                "w-12 h-14 rounded-l-xl",
                                "bg-black/90 backdrop-blur-xl border border-white/10 border-r-0",
                                "shadow-[0_0_20px_rgba(0,0,0,0.5)]",
                                "group cursor-pointer",
                                "hover:bg-amber-500/10 hover:border-amber-500/30 transition-colors"
                            )}
                            aria-label="View competitive rank"
                        >
                            {/* Trophy Icon with Rank Letter */}
                            <div className="relative">
                                <Trophy size={20} className="text-amber-400 group-hover:scale-110 transition-transform" />
                                {/* Rank Letter Badge */}
                                <div className={cn(
                                    "absolute -bottom-1 -left-2 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black",
                                    arenaStats.duel.rank === 'Diamond' && "bg-blue-500 text-white",
                                    arenaStats.duel.rank === 'Platinum' && "bg-cyan-400 text-black",
                                    arenaStats.duel.rank === 'Gold' && "bg-yellow-400 text-black",
                                    arenaStats.duel.rank === 'Silver' && "bg-slate-400 text-black",
                                    arenaStats.duel.rank === 'Bronze' && "bg-amber-600 text-white",
                                )}>
                                    {arenaStats.duel.rank.charAt(0)}
                                </div>
                            </div>
                            
                            {/* Glow effect */}
                            <div className="absolute inset-0 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-amber-500/10 to-transparent pointer-events-none" />
                        </motion.button>
                    ) : (
                        /* Expanded Rank Card */
                        <motion.div
                            key="fab-expanded"
                            initial={{ x: 300, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 300, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="mr-4 flex flex-col rounded-2xl bg-gradient-to-bl from-white/10 via-white/5 to-transparent border border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.5)] backdrop-blur-xl overflow-hidden"
                        >
                            {/* Decorative glow */}
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
                            
                            {/* Header with close button */}
                            <div className="relative px-4 py-2 bg-gradient-to-l from-primary/20 via-amber-500/10 to-transparent border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            soundEngine.playClick();
                                            setIsRankFabExpanded(false);
                                        }}
                                        className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                    <span className="text-lg">🏆</span>
                                    <span className="text-[10px] font-black bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent uppercase tracking-[0.25em]">
                                        Competitive Rank
                                    </span>
                                </div>
                            </div>
                            
                            {/* Rank Content */}
                            <div className="flex items-center gap-4 p-3">
                                {/* Duel Rank */}
                                <div className="flex items-center gap-2.5">
                                    <RankBadge rank={arenaStats.duel.rank} division={arenaStats.duel.rankDivision} elo={arenaStats.duel.elo} />
                                    <div className="flex flex-col">
                                        <span className="text-[8px] font-black text-orange-400/60 uppercase tracking-[0.15em]">Duel</span>
                                        <span className="text-sm font-black text-white">{arenaStats.duel.rank} {arenaStats.duel.rankDivision}</span>
                                        <span className="text-[10px] font-bold text-white/50">{arenaStats.duel.elo} ELO</span>
                                    </div>
                                </div>
                                
                                {/* Separator */}
                                <div className="w-px h-10 bg-white/10" />
                                
                                {/* Team Rank */}
                                {arenaStats.team.elo !== 300 ? (
                                    <div className="flex items-center gap-2.5">
                                        <RankBadge rank={arenaStats.team.rank} division={arenaStats.team.rankDivision} elo={arenaStats.team.elo} />
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-blue-400/60 uppercase tracking-[0.15em]">Team</span>
                                            <span className="text-sm font-black text-white">{arenaStats.team.rank} {arenaStats.team.rankDivision}</span>
                                            <span className="text-[10px] font-bold text-white/50">{arenaStats.team.elo} ELO</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2.5 opacity-70">
                                        <div className="w-14 h-14 rounded-lg bg-white/10 border border-dashed border-white/30 flex items-center justify-center">
                                            <span className="text-xl text-white/60">👥</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-blue-400/60 uppercase tracking-[0.15em]">Team</span>
                                            <span className="text-xs font-bold text-white/70">Play team modes</span>
                                            <span className="text-[10px] font-bold text-white/50">to unlock rank</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Leaderboard Link */}
                            <Link 
                                href="/arena/leaderboard"
                                onClick={() => soundEngine.playClick()}
                                className="relative px-4 py-2 bg-gradient-to-l from-primary/10 to-transparent border-t border-white/10 flex items-center justify-center gap-2 text-[10px] font-bold text-white/50 hover:text-primary hover:bg-primary/10 transition-colors group"
                            >
                                View Leaderboards
                                <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Header Bar */}
            <div className="relative flex items-center justify-center mb-10 shrink-0 min-h-[90px] w-full z-10">

                {/* Title - Truly Centered */}
                <div className="flex flex-col items-center">
                    <motion.h1
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="text-8xl font-[1000] tracking-tighter italic relative"
                    >
                        <span className="bg-gradient-to-r from-primary via-white to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-x drop-shadow-[0_0_30px_rgba(34,211,238,0.5)]">
                            FLASH
                        </span>
                        <span className="bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-x drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]">
                            ARENA
                        </span>
                    </motion.h1>
                    <p className="text-base font-black text-amber-500 uppercase tracking-[0.4em] translate-y-[-8px]">Select Your Battle Mode</p>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col gap-8 min-h-0">
                {/* Top Row: Full Width VS Modes */}
                <div className="flex-1 grid grid-cols-5 gap-5 w-full">
                    {vsModes.map((mode, i) => (
                        <ModeCard
                            key={mode.id}
                            mode={mode}
                            isSelected={selectedMode === mode.id}
                            selectedOperation={selectedOperation}
                            onSelect={() => setSelectedMode(mode.id)}
                            onOperationSelect={setSelectedOperation}
                            index={i}
                        />
                    ))}
                </div>

                {/* Bottom Row: Centered & Slightly Narrower Extra Modes */}
                <div className="flex-1 w-full flex justify-center">
                    <div className="grid grid-cols-3 gap-5 w-[80%] h-full">
                        {extraModes.map((mode, i) => (
                            <ModeCard
                                key={mode.id}
                                mode={mode}
                                isSelected={selectedMode === mode.id}
                                selectedOperation={selectedOperation}
                                onSelect={() => setSelectedMode(mode.id)}
                                onOperationSelect={setSelectedOperation}
                                index={i + 5}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="pt-6 pb-2 flex flex-col items-center gap-3 shrink-0">
                <AnimatePresence mode="wait">
                    {selectedModeData?.available ? (
                        <Link href={queueHref} onClick={() => soundEngine.playClick()}>
                            <motion.button
                                whileHover={{ scale: 1.05, boxShadow: "0 0 50px rgba(245, 158, 11, 0.6)" }}
                                whileTap={{ scale: 0.95 }}
                                onMouseEnter={() => soundEngine.playHover()}
                                className="group relative px-28 py-5 rounded-[1.5rem] font-[1000] text-xl uppercase tracking-[0.2em] bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-500 text-black shadow-[0_20px_40px_rgba(0,0,0,0.3),0_0_60px_rgba(251,191,36,0.3)] transition-all animate-shimmer"
                            >
                                <span className="relative z-10 transition-transform group-hover:scale-110 inline-block drop-shadow-sm">
                                    {isTeamMode ? `Setup Team ${selectedMode}` : `Find Match (${OPERATION_ICONS[selectedOperation].label})`}
                                </span>
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 rounded-[1.5rem] transition-opacity" />
                            </motion.button>
                        </Link>
                    ) : (
                        <div className="px-28 py-5 rounded-[1.5rem] font-[1000] text-xl uppercase tracking-[0.2em] bg-white/5 text-white/20 border border-white/5 cursor-not-allowed">
                            Coming Soon
                        </div>
                    )}
                </AnimatePresence>

                <Link href="/dashboard" className="flex items-center gap-2 group">
                    <span className="text-xs font-black text-white/60 group-hover:text-white uppercase tracking-[0.2em] transition-colors">
                        ← Go To Dashboard
                    </span>
                </Link>
            </div>
        </div>
    );
}
