'use client';

/**
 * TeamModeEntryModal
 * 
 * Confirmation modal when selecting team mode without a full party.
 * Gives users options to:
 * - Find teammates (queue with partial party)
 * - Invite friends (open social panel)
 * - Go back to mode selection
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Users, Search, UserPlus, X, Zap, AlertCircle } from 'lucide-react';

interface TeamModeEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: '2v2' | '3v3' | '4v4' | '5v5';
    currentPartySize: number;
    onFindTeammates: () => void;
    onInviteFriends: () => void;
}

export function TeamModeEntryModal({
    isOpen,
    onClose,
    mode,
    currentPartySize,
    onFindTeammates,
    onInviteFriends,
}: TeamModeEntryModalProps) {
    const requiredSize = parseInt(mode.split('v')[0]) || 5;
    const neededPlayers = requiredSize - currentPartySize;
    const isSolo = currentPartySize === 0 || currentPartySize === 1;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 
                                        rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                            {/* Decorative glow */}
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />
                            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />

                            {/* Header */}
                            <div className="relative flex items-center justify-between px-6 py-4 
                                            border-b border-white/10 bg-purple-500/10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 
                                                    flex items-center justify-center">
                                        <Users className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">
                                            {mode} Team Arena
                                        </h2>
                                        <p className="text-xs text-white/50">
                                            {requiredSize} players required
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/50 
                                               hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="relative p-6">
                                {/* Current Status */}
                                <div className="flex items-center justify-center gap-2 mb-6 
                                                p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <AlertCircle className="w-5 h-5 text-amber-400" />
                                    <span className="text-amber-400 font-medium">
                                        {isSolo 
                                            ? `You need ${neededPlayers} teammates for ${mode}` 
                                            : `Your party needs ${neededPlayers} more player${neededPlayers > 1 ? 's' : ''}`
                                        }
                                    </span>
                                </div>

                                {/* Party Size Visualization */}
                                <div className="flex justify-center items-center gap-2 mb-8">
                                    {Array.from({ length: requiredSize }).map((_, i) => {
                                        const isFilled = i < currentPartySize;
                                        return (
                                            <motion.div
                                                key={i}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ delay: i * 0.05 }}
                                                className={cn(
                                                    "w-12 h-12 rounded-xl flex items-center justify-center",
                                                    "border-2 transition-all",
                                                    isFilled
                                                        ? "bg-purple-500/20 border-purple-500/50 text-purple-400"
                                                        : "bg-white/5 border-dashed border-white/20 text-white/30"
                                                )}
                                            >
                                                {isFilled ? (
                                                    <Users className="w-5 h-5" />
                                                ) : (
                                                    <span className="text-lg">?</span>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* Options */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Find Teammates Option */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onFindTeammates}
                                        className="group p-5 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10
                                                   border border-purple-500/30 hover:border-purple-500/50
                                                   transition-all text-left"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 
                                                        flex items-center justify-center mb-4
                                                        group-hover:bg-purple-500/30 transition-colors">
                                            <Search className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-1 
                                                       flex items-center gap-2">
                                            Find Teammates
                                            <Zap className="w-4 h-4 text-purple-400" />
                                        </h3>
                                        <p className="text-sm text-white/50">
                                            Queue now and match with {neededPlayers} player{neededPlayers > 1 ? 's' : ''} 
                                            of similar skill
                                        </p>
                                    </motion.button>

                                    {/* Invite Friends Option */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onInviteFriends}
                                        className="group p-5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10
                                                   border border-primary/30 hover:border-primary/50
                                                   transition-all text-left"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-primary/20 
                                                        flex items-center justify-center mb-4
                                                        group-hover:bg-primary/30 transition-colors">
                                            <UserPlus className="w-6 h-6 text-primary" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-1">
                                            Invite Friends
                                        </h3>
                                        <p className="text-sm text-white/50">
                                            Add friends to your party before queuing
                                        </p>
                                    </motion.button>
                                </div>

                                {/* Info Note */}
                                <p className="text-center text-xs text-white/40 mt-6">
                                    💡 Teams are formed based on ELO for balanced matches
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

