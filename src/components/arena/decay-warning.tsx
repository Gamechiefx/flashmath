'use client';

/**
 * Decay Warning Component
 * 
 * Displays a warning banner when the player's ELO is at risk of decaying
 * due to inactivity. Can be shown on dashboard, social panel, or mode selection.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Activity, X, Clock, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export interface DecayWarningProps {
    phase: 'active' | 'warning' | 'decaying' | 'severe' | 'returning';
    phaseLabel: string;
    daysUntilNextPhase: number;
    eloAtRisk: number;
    isReturningPlayer: boolean;
    placementMatchesRequired: number;
    placementMatchesCompleted: number;
    dismissable?: boolean;
    onDismiss?: () => void;
}

/**
 * Render a dismissible arena decay warning banner when the player's phase is not 'active'.
 *
 * Displays a compact "returning player" flow with placement-match progress when `isReturningPlayer`
 * is true, otherwise shows phase-specific messaging, iconography, and a CTA for `warning`, `decaying`,
 * and `severe` phases. The banner is hidden if `phase` is `'active'` or after it has been dismissed.
 *
 * @param phase - Current decay phase; controls visibility and phase-specific styling/message.
 * @param phaseLabel - Optional human-readable label for the current phase (not required for visibility).
 * @param daysUntilNextPhase - Days remaining until the next decay phase; used in the 'warning' message.
 * @param eloAtRisk - Amount of ELO that may be lost; shown for relevant phases and when greater than 0.
 * @param isReturningPlayer - When true, renders the placement-match flow instead of the phase flows.
 * @param placementMatchesRequired - Total placement matches required for returning players (used to render progress).
 * @param placementMatchesCompleted - Number of placement matches already completed (used to render progress).
 * @param dismissable - If true, shows a dismiss button that hides the banner locally and invokes `onDismiss`.
 * @param onDismiss - Optional callback invoked when the banner is dismissed.
 * @returns A React element for the warning banner, or `null` when the banner should not be shown.
 */
export function DecayWarning({
    phase,
    phaseLabel,
    daysUntilNextPhase,
    eloAtRisk,
    isReturningPlayer,
    placementMatchesRequired,
    placementMatchesCompleted,
    dismissable = true,
    onDismiss
}: DecayWarningProps) {
    const [dismissed, setDismissed] = useState(false);

    // Don't show if active (no decay) or already dismissed
    if (phase === 'active' || dismissed) {
        return null;
    }

    const handleDismiss = () => {
        setDismissed(true);
        onDismiss?.();
    };

    // Returning player needs placement matches
    if (isReturningPlayer) {
        const remaining = placementMatchesRequired - placementMatchesCompleted;
        
        return (
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="relative p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 
                    border border-purple-500/30 backdrop-blur-sm"
            >
                {dismissable && (
                    <button
                        onClick={handleDismiss}
                        className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/50" />
                    </button>
                )}
                
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                        <Activity className="w-5 h-5 text-purple-400" />
                    </div>
                    
                    <div className="flex-1">
                        <h4 className="font-bold text-purple-300">Welcome Back!</h4>
                        <p className="text-sm text-white/70 mt-1">
                            Complete {remaining} placement match{remaining !== 1 ? 'es' : ''} to recalibrate your rank.
                            ELO changes are doubled for faster calibration.
                        </p>
                        
                        {/* Placement progress */}
                        <div className="flex gap-1.5 mt-3">
                            {Array.from({ length: placementMatchesRequired }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 h-2 rounded-full ${
                                        i < placementMatchesCompleted 
                                            ? 'bg-purple-500' 
                                            : 'bg-white/10'
                                    }`}
                                />
                            ))}
                        </div>
                        
                        <Link href="/arena/modes">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="mt-3 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30
                                    text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-colors"
                            >
                                Play Now
                            </motion.button>
                        </Link>
                    </div>
                </div>
            </motion.div>
        );
    }

    // Get phase-specific styling and messaging
    const getPhaseConfig = () => {
        switch (phase) {
            case 'warning':
                return {
                    gradient: 'from-yellow-500/20 to-orange-500/20',
                    border: 'border-yellow-500/30',
                    icon: AlertTriangle,
                    iconColor: 'text-yellow-400',
                    iconBg: 'bg-yellow-500/20',
                    titleColor: 'text-yellow-300',
                    title: 'Decay Warning',
                    message: `Play within ${daysUntilNextPhase} day${daysUntilNextPhase !== 1 ? 's' : ''} to prevent ELO decay.`,
                    buttonText: 'Play to Prevent Decay'
                };
            case 'decaying':
                return {
                    gradient: 'from-orange-500/20 to-red-500/20',
                    border: 'border-orange-500/30',
                    icon: TrendingUp,
                    iconColor: 'text-orange-400 rotate-180',
                    iconBg: 'bg-orange-500/20',
                    titleColor: 'text-orange-300',
                    title: 'ELO Decaying',
                    message: `You're losing ${eloAtRisk} ELO over the next 7 days. Play to stop decay!`,
                    buttonText: 'Stop Decay'
                };
            case 'severe':
                return {
                    gradient: 'from-red-500/20 to-rose-500/20',
                    border: 'border-red-500/30',
                    icon: AlertTriangle,
                    iconColor: 'text-red-400',
                    iconBg: 'bg-red-500/20',
                    titleColor: 'text-red-300',
                    title: 'Severe Decay',
                    message: `Your rank is dropping fast! Play now to save your progress.`,
                    buttonText: 'Play Now'
                };
            default:
                return null;
        }
    };

    const config = getPhaseConfig();
    if (!config) return null;

    const IconComponent = config.icon;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`relative p-4 rounded-xl bg-gradient-to-r ${config.gradient} 
                    border ${config.border} backdrop-blur-sm`}
            >
                {dismissable && (
                    <button
                        onClick={handleDismiss}
                        className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/50" />
                    </button>
                )}
                
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${config.iconBg}`}>
                        <IconComponent className={`w-5 h-5 ${config.iconColor}`} />
                    </div>
                    
                    <div className="flex-1">
                        <h4 className={`font-bold ${config.titleColor}`}>{config.title}</h4>
                        <p className="text-sm text-white/70 mt-1">{config.message}</p>
                        
                        {eloAtRisk > 0 && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                                <Clock className="w-3 h-3" />
                                <span>{eloAtRisk} ELO at risk in next 7 days</span>
                            </div>
                        )}
                        
                        <Link href="/arena/modes">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className={`mt-3 px-4 py-2 rounded-lg ${config.iconBg} border ${config.border}
                                    ${config.titleColor} text-sm font-medium hover:brightness-110 transition-all`}
                            >
                                {config.buttonText}
                            </motion.button>
                        </Link>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

/**
 * Renders a compact arena decay status badge for use in headers or sidebars.
 *
 * @param phase - One of `'active' | 'warning' | 'decaying' | 'severe' | 'returning'` specifying which badge style and text to show
 * @param eloAtRisk - The amount of ELO at risk; shown for non-returning phases
 * @returns A small actionable badge linking to the arena page, or `null` when `phase` is `'active'` or not supported
 */
export function DecayWarningBadge({ phase, eloAtRisk }: { phase: DecayWarningProps['phase']; eloAtRisk: number }) {
    if (phase === 'active') return null;

    const configs: Record<string, { color: string; icon: typeof AlertTriangle }> = {
        warning: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertTriangle },
        decaying: { color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: TrendingUp },
        severe: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
        returning: { color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Activity },
    };

    const config = configs[phase];
    if (!config) return null;

    const Icon = config.icon;

    return (
        <Link href="/arena">
            <motion.div
                whileHover={{ scale: 1.05 }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${config.color} cursor-pointer`}
            >
                <Icon className={`w-3.5 h-3.5 ${phase === 'decaying' ? 'rotate-180' : ''}`} />
                <span className="text-xs font-medium">
                    {phase === 'returning' ? 'Placement' : `-${eloAtRisk} ELO`}
                </span>
            </motion.div>
        </Link>
    );
}

export default DecayWarning;

