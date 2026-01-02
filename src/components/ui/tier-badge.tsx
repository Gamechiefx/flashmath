'use client';

import { cn } from '@/lib/utils';
import {
    getBandForTier,
    getTierWithinBand,
    formatTierDisplay,
    formatTierShort,
} from '@/lib/tier-system';

interface TierBadgeProps {
    tier: number;
    operation?: string;
    showBandName?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    variant?: 'default' | 'outline' | 'minimal';
    className?: string;
}

export function TierBadge({
    tier,
    operation,
    showBandName = true,
    size = 'md',
    variant = 'default',
    className,
}: TierBadgeProps) {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);

    const sizeClasses = {
        xs: 'text-[10px] px-1.5 py-0.5 gap-0.5',
        sm: 'text-xs px-2 py-0.5 gap-1',
        md: 'text-sm px-2.5 py-1 gap-1.5',
        lg: 'text-base px-3 py-1.5 gap-2 font-bold',
    };

    const variantClasses = {
        default: `bg-gradient-to-r ${band.bgGradient} text-white shadow-lg`,
        outline: `border-2 ${band.textColor} bg-transparent`,
        minimal: `${band.textColor} bg-white/5`,
    };

    return (
        <div
            className={cn(
                'inline-flex items-center rounded-md font-medium tracking-wide uppercase',
                sizeClasses[size],
                variantClasses[variant],
                className
            )}
        >
            {showBandName ? (
                <>
                    <span className="opacity-90">{band.name}</span>
                    <span className="font-bold">{tierInBand}</span>
                </>
            ) : (
                <span className="font-bold">{formatTierShort(tier)}</span>
            )}
        </div>
    );
}

interface TierBadgeWithIconProps extends TierBadgeProps {
    icon?: React.ReactNode;
}

export function TierBadgeWithIcon({
    tier,
    icon,
    ...props
}: TierBadgeWithIconProps) {
    const band = getBandForTier(tier);

    return (
        <div className="inline-flex items-center gap-2">
            {icon && (
                <div className={cn('w-5 h-5', band.textColor)}>
                    {icon}
                </div>
            )}
            <TierBadge tier={tier} {...props} />
        </div>
    );
}

interface OperationTierBadgeProps {
    operation: string;
    tier: number;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

export function OperationTierBadge({
    operation,
    tier,
    size = 'sm',
    className,
}: OperationTierBadgeProps) {
    const band = getBandForTier(tier);
    const tierInBand = getTierWithinBand(tier);

    const operationSymbol = {
        addition: '+',
        subtraction: '-',
        multiplication: '×',
        division: '÷',
    }[operation.toLowerCase()] || operation.charAt(0).toUpperCase();

    const sizeClasses = {
        xs: 'text-[10px] w-16 h-5',
        sm: 'text-xs w-20 h-6',
        md: 'text-sm w-24 h-7',
        lg: 'text-base w-28 h-8',
    };

    return (
        <div
            className={cn(
                'inline-flex items-center justify-center rounded-md font-medium',
                `bg-gradient-to-r ${band.bgGradient} text-white`,
                sizeClasses[size],
                className
            )}
        >
            <span className="opacity-75 mr-1">{operationSymbol}</span>
            <span className="font-bold">{band.shortName}{tierInBand}</span>
        </div>
    );
}
