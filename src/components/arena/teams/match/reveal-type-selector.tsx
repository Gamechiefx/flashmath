'use client';

/**
 * RevealTypeSelector
 * 
 * Pre-match selection of reveal type for the final round decision.
 * The team with the better record gets to choose whether both teams
 * reveal their Anchor Solo decision simultaneously or sequentially.
 * 
 * Sequential: Away team decides first, home team can react
 * Simultaneous: Both teams reveal at the same time (fair)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Shuffle, ClipboardList, Check, Crown, Info } from 'lucide-react';

interface RevealTypeSelectorProps {
    /** Whether this team has the better record and gets to choose */
    teamHasBetterRecord: boolean;
    /** Current selection */
    currentSelection: 'sequential' | 'simultaneous';
    /** Selection callback */
    onSelect: (type: 'sequential' | 'simultaneous') => void;
    /** Whether selection is finalized */
    isLocked?: boolean;
    /** Show explanation */
    showExplanation?: boolean;
    className?: string;
}

export function RevealTypeSelector({
    teamHasBetterRecord,
    currentSelection,
    onSelect,
    isLocked = false,
    showExplanation = true,
    className,
}: RevealTypeSelectorProps) {
    const [hoveredOption, setHoveredOption] = useState<string | null>(null);

    const canSelect = teamHasBetterRecord && !isLocked;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "w-full max-w-xl mx-auto p-6 rounded-2xl",
                "bg-gradient-to-b from-slate-900/90 to-slate-950/90",
                "border border-white/10",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold text-white">
                    Final Round Reveal Type
                </h3>
            </div>

            {/* Selection authority */}
            <p className="text-center text-sm text-white/60 mb-6">
                {teamHasBetterRecord 
                    ? 'Your team chooses - better record this match' 
                    : 'Opponent chooses - they have the better record'
                }
            </p>

            {/* Options */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Simultaneous Option */}
                <motion.button
                    whileHover={canSelect ? { scale: 1.02 } : {}}
                    whileTap={canSelect ? { scale: 0.98 } : {}}
                    onClick={() => canSelect && onSelect('simultaneous')}
                    onMouseEnter={() => setHoveredOption('simultaneous')}
                    onMouseLeave={() => setHoveredOption(null)}
                    disabled={!canSelect}
                    className={cn(
                        "relative p-5 rounded-xl border-2 transition-all text-left",
                        "flex flex-col gap-3",
                        currentSelection === 'simultaneous'
                            ? "border-primary bg-primary/10"
                            : "border-white/10 bg-white/5",
                        canSelect && currentSelection !== 'simultaneous' && "hover:border-white/30",
                        !canSelect && "opacity-60 cursor-not-allowed"
                    )}
                >
                    {/* Selected Check */}
                    {currentSelection === 'simultaneous' && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full 
                                        bg-primary flex items-center justify-center">
                            <Check className="w-4 h-4 text-black" />
                        </div>
                    )}

                    {/* Icon */}
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        currentSelection === 'simultaneous'
                            ? "bg-primary/20 text-primary"
                            : "bg-white/10 text-white/60"
                    )}>
                        <Shuffle className="w-6 h-6" />
                    </div>

                    {/* Title */}
                    <h4 className="text-lg font-bold text-white">
                        Simultaneous
                    </h4>

                    {/* Description */}
                    <p className="text-sm text-white/50">
                        Both teams reveal their decision at the same time
                    </p>

                    {/* Pros */}
                    <ul className="text-xs text-white/40 space-y-1">
                        <li className="flex items-center gap-1">
                            <span className="text-green-400">✓</span> Fair, no advantage
                        </li>
                        <li className="flex items-center gap-1">
                            <span className="text-green-400">✓</span> Pure reads
                        </li>
                    </ul>
                </motion.button>

                {/* Sequential Option */}
                <motion.button
                    whileHover={canSelect ? { scale: 1.02 } : {}}
                    whileTap={canSelect ? { scale: 0.98 } : {}}
                    onClick={() => canSelect && onSelect('sequential')}
                    onMouseEnter={() => setHoveredOption('sequential')}
                    onMouseLeave={() => setHoveredOption(null)}
                    disabled={!canSelect}
                    className={cn(
                        "relative p-5 rounded-xl border-2 transition-all text-left",
                        "flex flex-col gap-3",
                        currentSelection === 'sequential'
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-white/10 bg-white/5",
                        canSelect && currentSelection !== 'sequential' && "hover:border-white/30",
                        !canSelect && "opacity-60 cursor-not-allowed"
                    )}
                >
                    {/* Selected Check */}
                    {currentSelection === 'sequential' && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full 
                                        bg-amber-500 flex items-center justify-center">
                            <Check className="w-4 h-4 text-black" />
                        </div>
                    )}

                    {/* Icon */}
                    <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        currentSelection === 'sequential'
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-white/10 text-white/60"
                    )}>
                        <ClipboardList className="w-6 h-6" />
                    </div>

                    {/* Title */}
                    <h4 className="text-lg font-bold text-white">
                        Sequential
                    </h4>

                    {/* Description */}
                    <p className="text-sm text-white/50">
                        Away team decides first, you react
                    </p>

                    {/* Pros */}
                    <ul className="text-xs text-white/40 space-y-1">
                        <li className="flex items-center gap-1">
                            <span className="text-amber-400">★</span> Strategic edge
                        </li>
                        <li className="flex items-center gap-1">
                            <span className="text-amber-400">★</span> Counter-play
                        </li>
                    </ul>
                </motion.button>
            </div>

            {/* Explanation */}
            {showExplanation && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-white/5 border border-white/10">
                    <Info className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-white/40">
                        {currentSelection === 'sequential' 
                            ? 'Sequential gives you the advantage of seeing the opponent\'s decision before making yours. Use this to counter their strategy.' 
                            : 'Simultaneous is the fair option - both teams make their decision without knowing what the other will do.'
                        }
                    </p>
                </div>
            )}

            {/* Lock indicator */}
            {isLocked && (
                <div className="mt-4 text-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full 
                                     bg-green-500/20 text-green-400 text-sm font-medium">
                        <Check className="w-4 h-4" />
                        Selection Locked
                    </span>
                </div>
            )}
        </motion.div>
    );
}

