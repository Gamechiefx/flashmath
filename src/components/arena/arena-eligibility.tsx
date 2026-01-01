'use client';

import { useState, useEffect } from 'react';
import {
    motion
} from 'framer-motion';
import Link from 'next/link';

interface ArenaEligibilityProps {
    practiceStats: {
        totalSessions: number;
        recentAccuracy: number | null;
        daysSinceLastPractice: number;
        confidence: number;
    };
    userAge: number | null;
    isAdmin?: boolean;
}

export function ArenaEligibility({ practiceStats, userAge, isAdmin = false }: ArenaEligibilityProps) {
    const [ageVerified, setAgeVerified] = useState(false);
    const [isEligible, setIsEligible] = useState(false);

    // Requirements
    const MIN_CONFIDENCE = 0.3;
    const MIN_SESSIONS = 5;
    const MIN_ACCURACY = 60;
    const MIN_AGE = 6;

    // Check eligibility
    const hasEnoughPractice = practiceStats.totalSessions >= MIN_SESSIONS;
    const hasRecentPractice = practiceStats.daysSinceLastPractice <= 7;
    const hasGoodAccuracy = (practiceStats.recentAccuracy ?? 0) >= MIN_ACCURACY;
    const hasConfidence = practiceStats.confidence >= MIN_CONFIDENCE;
    const meetsAge = ageVerified || (userAge !== null && userAge >= MIN_AGE);

    useEffect(() => {
        // Admin bypasses all requirements
        if (isAdmin) {
            setIsEligible(true);
            return;
        }
        setIsEligible(hasEnoughPractice && hasRecentPractice && hasGoodAccuracy && hasConfidence && meetsAge);
    }, [isAdmin, hasEnoughPractice, hasRecentPractice, hasGoodAccuracy, hasConfidence, meetsAge]);

    const requirements = [
        {
            id: 'age',
            label: 'Age Verification',
            description: 'I confirm I am 6 years or older',
            met: meetsAge,
            type: 'checkbox'
        },
        {
            id: 'sessions',
            label: 'Practice Sessions',
            description: `Complete at least ${MIN_SESSIONS} practice sessions`,
            met: hasEnoughPractice,
            progress: Math.min(100, (practiceStats.totalSessions / MIN_SESSIONS) * 100),
            current: practiceStats.totalSessions,
            required: MIN_SESSIONS
        },
        {
            id: 'accuracy',
            label: 'Recent Accuracy',
            description: `Maintain ${MIN_ACCURACY}%+ accuracy in recent practice`,
            met: hasGoodAccuracy,
            progress: practiceStats.recentAccuracy ?? 0,
            current: practiceStats.recentAccuracy ?? 0,
            required: MIN_ACCURACY
        },
        {
            id: 'recency',
            label: 'Recent Activity',
            description: 'Practice within the last 7 days',
            met: hasRecentPractice,
            current: practiceStats.daysSinceLastPractice,
            required: 7
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
            >
                <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                    Arena
                </h1>
                <p className="text-muted-foreground">
                    Compete against other players in real-time math battles
                </p>
            </motion.div>

            {/* Requirements Card */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-2xl p-6 space-y-4"
            >
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <span className="text-2xl">🛡️</span>
                    Arena Requirements
                </h2>

                <div className="space-y-3">
                    {requirements.map((req, index) => (
                        <motion.div
                            key={req.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + index * 0.05 }}
                            className={`p-4 rounded-xl border transition-all ${req.met
                                ? 'bg-green-500/10 border-green-500/30'
                                : 'bg-card border-border'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${req.met ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
                                            }`}>
                                            {req.met ? '✓' : index + 1}
                                        </span>
                                        <span className="font-medium">{req.label}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1 ml-8">
                                        {req.description}
                                    </p>

                                    {/* Progress bar for quantifiable requirements */}
                                    {req.progress !== undefined && (
                                        <div className="ml-8 mt-2">
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(100, req.progress)}%` }}
                                                    transition={{ delay: 0.3, duration: 0.5 }}
                                                    className={`h-full rounded-full ${req.met ? 'bg-green-500' : 'bg-primary'
                                                        }`}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {req.current} / {req.required}
                                                {req.id === 'accuracy' && '%'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Checkbox for age verification */}
                                {req.type === 'checkbox' && (
                                    <label className="flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={ageVerified}
                                            onChange={(e) => setAgeVerified(e.target.checked)}
                                            className="w-5 h-5 rounded border-2 border-primary accent-primary cursor-pointer"
                                        />
                                    </label>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* Confidence Score Display */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass rounded-xl p-4 flex items-center justify-between"
            >
                <div>
                    <p className="text-sm text-muted-foreground">Practice Confidence</p>
                    <p className="text-2xl font-bold">{Math.round(practiceStats.confidence * 100)}%</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${hasConfidence
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-yellow-500/20 text-yellow-500'
                    }`}>
                    {hasConfidence ? 'Ready' : 'Keep Practicing'}
                </div>
            </motion.div>

            {/* CTA Button */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                {isEligible ? (
                    <Link href="/arena/modes">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-primary to-accent 
                         text-primary-foreground font-bold text-lg shadow-lg neon-glow
                         transition-all hover:shadow-xl"
                        >
                            Enter Arena
                        </motion.button>
                    </Link>
                ) : (
                    <div className="space-y-3">
                        <button
                            disabled
                            className="w-full py-4 px-6 rounded-xl bg-muted text-muted-foreground 
                         font-bold text-lg cursor-not-allowed opacity-50"
                        >
                            Complete Requirements to Enter
                        </button>
                        <Link href="/practice">
                            <button className="w-full py-3 px-6 rounded-xl border border-primary 
                                text-primary font-medium hover:bg-primary/10 transition-colors">
                                Go to Practice
                            </button>
                        </Link>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
