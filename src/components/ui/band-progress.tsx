'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
    getBandForTier,
    getTierWithinBand,
    getProgressWithinBand,
    getNextBandBoundary,
    getNextMasteryTestTier,
    isMasteryTestAvailable,
    TIERS_PER_BAND,
    MAX_TIER,
} from '@/lib/tier-system';

interface BandProgressProps {
    tier: number;
    operation?: string;
    showMilestones?: boolean;
    showTestAvailable?: boolean;
    animated?: boolean;
    className?: string;
}

export function BandProgress({
    tier,
    operation: _operation,
    showMilestones = false,
    showTestAvailable = true,
    animated = true,
    className,
}: BandProgressProps) {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);
    const progress = getProgressWithinBand(tier);
    const nextTestTier = getNextMasteryTestTier(tier);
    const testAvailable = isMasteryTestAvailable(tier);
    const nextBandTier = getNextBandBoundary(tier);

    const progressPercent = progress * 100;
    const nextTestProgress = ((nextTestTier - band.tierRange[0]) / TIERS_PER_BAND) * 100;

    const ProgressBar = animated ? motion.div : 'div';

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex justify-between items-center text-xs">
                <span className={cn('font-medium uppercase tracking-wide', band.textColor)}>
                    {band.name} Band
                </span>
                <span className="text-muted-foreground">
                    Tier {tierInBand} / {TIERS_PER_BAND}
                </span>
            </div>

            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
                {showMilestones && (
                    <>
                        <div
                            className="absolute top-0 bottom-0 w-px bg-white/30"
                            style={{ left: '25%' }}
                        />
                        <div
                            className="absolute top-0 bottom-0 w-px bg-white/30"
                            style={{ left: '50%' }}
                        />
                        <div
                            className="absolute top-0 bottom-0 w-px bg-white/30"
                            style={{ left: '75%' }}
                        />
                    </>
                )}

                {showTestAvailable && nextTestTier <= nextBandTier && (
                    <div
                        className="absolute top-0 bottom-0 w-1 bg-yellow-400/50 rounded-full"
                        style={{ left: `${nextTestProgress}%`, transform: 'translateX(-50%)' }}
                        title={`Mastery test at tier ${nextTestTier}`}
                    />
                )}

                <ProgressBar
                    className={cn(
                        'h-full rounded-full',
                        `bg-gradient-to-r ${band.bgGradient}`
                    )}
                    {...(animated
                        ? {
                              initial: { width: 0 },
                              animate: { width: `${progressPercent}%` },
                              transition: { duration: 0.5, ease: 'easeOut' },
                          }
                        : { style: { width: `${progressPercent}%` } })}
                />
            </div>

            {showTestAvailable && testAvailable && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                    Mastery test available!
                </div>
            )}
        </div>
    );
}

interface BandOverviewProps {
    currentTier: number;
    operation?: string;
    className?: string;
}

export function BandOverview({ currentTier, operation: _operation, className }: BandOverviewProps) {
    const currentBand = getBandForTier(currentTier);

    return (
        <div className={cn('space-y-3', className)}>
            <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((bandId) => {
                    const isCurrentBand = bandId === currentBand.id;
                    const isPastBand = bandId < currentBand.id;
                    const bandInfo = {
                        1: { name: 'F', color: 'amber' },
                        2: { name: 'I', color: 'slate' },
                        3: { name: 'A', color: 'yellow' },
                        4: { name: 'E', color: 'cyan' },
                        5: { name: 'M', color: 'purple' },
                    }[bandId]!;

                    return (
                        <div
                            key={bandId}
                            className={cn(
                                'h-2 rounded-sm transition-all',
                                isPastBand && `bg-${bandInfo.color}-500`,
                                isCurrentBand && `bg-${bandInfo.color}-500/50 ring-1 ring-${bandInfo.color}-400`,
                                !isPastBand && !isCurrentBand && 'bg-white/10'
                            )}
                            title={['Foundation', 'Intermediate', 'Advanced', 'Expert', 'Master'][bandId - 1]}
                        />
                    );
                })}
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
                <span>Foundation</span>
                <span>Master</span>
            </div>
        </div>
    );
}

interface TierProgressCardProps {
    operation: string;
    tier: number;
    skillPoints?: number;
    className?: string;
}

export function TierProgressCard({
    operation,
    tier,
    skillPoints: _skillPoints = 0,
    className,
}: TierProgressCardProps) {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);
    const testAvailable = isMasteryTestAvailable(tier);

    const operationLabels: Record<string, string> = {
        addition: 'Addition',
        subtraction: 'Subtraction',
        multiplication: 'Multiplication',
        division: 'Division',
    };
    const operationDisplay = operationLabels[operation.toLowerCase()] || operation;

    return (
        <div
            className={cn(
                'p-4 rounded-xl border border-white/10 bg-white/5 space-y-3',
                className
            )}
        >
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{operationDisplay}</h3>
                <div
                    className={cn(
                        'px-2 py-0.5 rounded text-xs font-bold uppercase',
                        `bg-gradient-to-r ${band.bgGradient} text-white`
                    )}
                >
                    {band.shortName}{tierInBand}
                </div>
            </div>

            <BandProgress
                tier={tier}
                operation={operation}
                showMilestones
                showTestAvailable
            />

            {tier < MAX_TIER && (
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Next: {band.name} {tierInBand + 1}</span>
                    {testAvailable && (
                        <span className="text-yellow-400">Test ready!</span>
                    )}
                </div>
            )}
        </div>
    );
}
