'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { soundEngine } from '@/lib/sound-engine';

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
                className
            )}
            style={{
                background: isSelected
                    ? mode.gradient
                    : 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)'
            }}
        >
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

            {/* Shine on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />

            {/* Top: Mode Name & Badges */}
            <div className="relative flex items-start justify-between">
                <h3 className={cn(
                    "text-4xl font-black tracking-tighter drop-shadow-2xl transition-all duration-300",
                    isSelected ? "text-white" : "text-white/60 group-hover:text-white"
                )}>
                    {mode.name}
                </h3>
                <div className="flex gap-2">
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
                                : "bg-primary/20 border-primary/30 text-primary"
                        )}>
                            <span className={cn(isSelected ? "text-white" : "text-amber-400")}>ELO</span> {mode.rating}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom: Operation Selection (Only for available modes) */}
            {mode.available && isSelected && (
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

            {/* Placeholder for non-selected cards */}
            {mode.available && !isSelected && (
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

interface ModeSelectionProps {
    userRank?: string;
    userDivision?: string;
    userElo?: number;
}

export function ModeSelection({ userRank = 'Silver', userDivision = 'II', userElo = 1000 }: ModeSelectionProps) {
    const [selectedMode, setSelectedMode] = useState<string>('1v1');
    const [selectedOperation, setSelectedOperation] = useState<Operation>('mixed');

    const vsModes: GameMode[] = [
        { id: '1v1', name: '1v1', available: true, gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', rating: userElo },
        { id: '2v2', name: '2v2', available: false, gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
        { id: '3v3', name: '3v3', available: false, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
        { id: '4v4', name: '4v4', available: false, gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' },
        { id: '5v5', name: '5v5', available: false, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' },
    ];

    const extraModes: GameMode[] = [
        { id: 'custom', name: 'Custom Mode', available: false, gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' },
        { id: 'random', name: 'Random', available: false, gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
        { id: 'tournament', name: 'Tournaments', available: false, gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
    ];

    const allModes = [...vsModes, ...extraModes];
    const selectedModeData = allModes.find(m => m.id === selectedMode);

    // Build queue URL with mode and operation
    const queueHref = selectedModeData?.available
        ? `/arena/queue?mode=${selectedMode}&operation=${selectedOperation}`
        : '#';

    return (
        <div className="h-full flex flex-col max-w-[1400px] mx-auto px-6 py-4 overflow-hidden relative">
            <ParticleBackground />

            {/* Header Bar */}
            <div className="relative flex items-center justify-center mb-10 shrink-0 min-h-[90px] w-full z-10">

                {/* Rank Badge - Far Left */}
                <div className="absolute left-4 flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-md">
                    <RankBadge rank={userRank} division={userDivision} elo={userElo} />
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Competitive Rank</span>
                        <span className="text-base font-black text-white">{userRank} {userDivision}</span>
                    </div>
                </div>

                {/* Title - Truly Centered */}
                <div className="flex flex-col items-center">
                    <motion.h1
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="text-8xl font-[1000] tracking-tighter italic"
                    >
                        <span className="bg-gradient-to-r from-primary via-white to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-x">
                            FLASHARENA
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
                                whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(245, 158, 11, 0.4)" }}
                                whileTap={{ scale: 0.95 }}
                                onMouseEnter={() => soundEngine.playHover()}
                                className="group relative px-28 py-5 rounded-[1.5rem] font-[1000] text-xl uppercase tracking-[0.2em] bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-[0_20px_40px_rgba(0,0,0,0.3)] transition-all"
                            >
                                <span className="relative z-10 transition-transform group-hover:scale-110 inline-block">
                                    Find Match ({OPERATION_ICONS[selectedOperation].label})
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
