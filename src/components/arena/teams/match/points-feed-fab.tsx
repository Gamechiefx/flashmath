'use client';

/**
 * PointsFeedFAB
 * 
 * A Floating Action Button that displays itemized real-time points accumulation
 * for each team during a match. Shows a breakdown of how points are being earned.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
    Activity, X, ChevronDown, ChevronUp, 
    Target, Clock, Trophy, Flame, Zap,
    TrendingUp, TrendingDown, Minus
} from 'lucide-react';

export interface PointsEvent {
    id: string;
    timestamp: number;
    teamId: string;
    teamName: string;
    isMyTeam: boolean;
    playerName: string;
    eventType: 'correct' | 'incorrect' | 'timeout' | 'streak_milestone' | 'first_to_finish';
    points: number;
    speedBonus?: number;
    streakMilestoneBonus?: number;
    teamStreak?: number;
    description: string;
}

// Aggregated stats for a team
interface TeamPointsBreakdown {
    totalScore: number;
    correctAnswers: { count: number; points: number };
    speedBonuses: { count: number; points: number };
    incorrectAnswers: { count: number; points: number };
    timeouts: { count: number; points: number };
    streakMilestones: { count: number; points: number };
    firstToFinish: { count: number; points: number };
}

interface PointsFeedFABProps {
    team1Name: string;
    team2Name: string;
    team1Id: string;
    team2Id: string;
    team1Score: number;
    team2Score: number;
    myTeamId: string;
    events: PointsEvent[];
}

// Progress bar component for point categories
function PointsCategoryBar({ 
    label, 
    count, 
    points, 
    icon: Icon, 
    color,
    maxPoints = 100
}: {
    label: string;
    count: number;
    points: number;
    icon: typeof Target;
    color: string;
    maxPoints?: number;
}) {
    const percentage = Math.min(100, Math.abs(points) / maxPoints * 100);
    const isNegative = points < 0;
    
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                    <Icon className={cn("w-3 h-3", color)} />
                    <span className="text-white/70">{label}</span>
                    <span className="text-white/40">×{count}</span>
                </div>
                <span className={cn(
                    "font-bold tabular-nums",
                    isNegative ? "text-red-400" : "text-emerald-400"
                )}>
                    {points >= 0 ? '+' : ''}{points}
                </span>
            </div>
            <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        isNegative ? "bg-red-500" : color.replace('text-', 'bg-')
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}

// Team breakdown panel
function TeamBreakdownPanel({ 
    teamName, 
    breakdown, 
    isMyTeam,
    totalScore
}: { 
    teamName: string; 
    breakdown: TeamPointsBreakdown;
    isMyTeam: boolean;
    totalScore: number;
}) {
    const trend = totalScore > 0 ? 'up' : totalScore < 0 ? 'down' : 'neutral';
    
    return (
        <div className={cn(
            "p-3 rounded-xl border",
            isMyTeam 
                ? "bg-emerald-500/10 border-emerald-500/30" 
                : "bg-rose-500/10 border-rose-500/30"
        )}>
            {/* Team Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {isMyTeam && (
                        <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                            YOU
                        </span>
                    )}
                    <span className={cn(
                        "font-bold text-sm truncate max-w-[100px]",
                        isMyTeam ? "text-emerald-300" : "text-rose-300"
                    )}>
                        {teamName}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                    {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
                    {trend === 'neutral' && <Minus className="w-4 h-4 text-white/40" />}
                    <span className={cn(
                        "text-lg font-black tabular-nums",
                        isMyTeam ? "text-emerald-400" : "text-rose-400"
                    )}>
                        {totalScore}
                    </span>
                </div>
            </div>
            
            {/* Point Categories */}
            <div className="space-y-2.5">
                {breakdown.correctAnswers.count > 0 && (
                    <PointsCategoryBar
                        label="Correct"
                        count={breakdown.correctAnswers.count}
                        points={breakdown.correctAnswers.points}
                        icon={Target}
                        color="text-emerald-400"
                        maxPoints={50}
                    />
                )}
                
                {breakdown.speedBonuses.count > 0 && (
                    <PointsCategoryBar
                        label="Speed"
                        count={breakdown.speedBonuses.count}
                        points={breakdown.speedBonuses.points}
                        icon={Zap}
                        color="text-cyan-400"
                        maxPoints={35}
                    />
                )}
                
                {breakdown.streakMilestones.count > 0 && (
                    <PointsCategoryBar
                        label="Streaks"
                        count={breakdown.streakMilestones.count}
                        points={breakdown.streakMilestones.points}
                        icon={Flame}
                        color="text-amber-400"
                        maxPoints={100}
                    />
                )}
                
                {breakdown.firstToFinish.count > 0 && (
                    <PointsCategoryBar
                        label="1st Finish"
                        count={breakdown.firstToFinish.count}
                        points={breakdown.firstToFinish.points}
                        icon={Trophy}
                        color="text-yellow-400"
                        maxPoints={50}
                    />
                )}
                
                {breakdown.incorrectAnswers.count > 0 && (
                    <PointsCategoryBar
                        label="Incorrect"
                        count={breakdown.incorrectAnswers.count}
                        points={breakdown.incorrectAnswers.points}
                        icon={X}
                        color="text-red-400"
                        maxPoints={30}
                    />
                )}
                
                {breakdown.timeouts.count > 0 && (
                    <PointsCategoryBar
                        label="Timeouts"
                        count={breakdown.timeouts.count}
                        points={breakdown.timeouts.points}
                        icon={Clock}
                        color="text-orange-400"
                        maxPoints={30}
                    />
                )}
                
                {/* No events yet */}
                {breakdown.correctAnswers.count === 0 && 
                 breakdown.incorrectAnswers.count === 0 && 
                 breakdown.timeouts.count === 0 && (
                    <div className="text-center text-white/30 text-xs py-2">
                        No scoring events yet
                    </div>
                )}
            </div>
        </div>
    );
}

export function PointsFeedFAB({
    team1Name,
    team2Name,
    team1Id,
    team2Id,
    team1Score,
    team2Score,
    myTeamId,
    events,
}: PointsFeedFABProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    
    // Aggregate events into team breakdowns
    const { team1Breakdown, team2Breakdown } = useMemo(() => {
        const createEmptyBreakdown = (): TeamPointsBreakdown => ({
            totalScore: 0,
            correctAnswers: { count: 0, points: 0 },
            speedBonuses: { count: 0, points: 0 },
            incorrectAnswers: { count: 0, points: 0 },
            timeouts: { count: 0, points: 0 },
            streakMilestones: { count: 0, points: 0 },
            firstToFinish: { count: 0, points: 0 },
        });
        
        const t1 = createEmptyBreakdown();
        const t2 = createEmptyBreakdown();
        
        for (const event of events) {
            const breakdown = event.teamId === team1Id ? t1 : t2;
            
            switch (event.eventType) {
                case 'correct':
                    // Base points (5) go to correct, speed bonus tracked separately
                    const basePoints = 5;
                    const speedBonus = event.speedBonus || 0;
                    breakdown.correctAnswers.count += 1;
                    breakdown.correctAnswers.points += basePoints;
                    if (speedBonus > 0) {
                        breakdown.speedBonuses.count += 1;
                        breakdown.speedBonuses.points += speedBonus;
                    }
                    breakdown.totalScore += basePoints + speedBonus;
                    break;
                    
                case 'incorrect':
                    breakdown.incorrectAnswers.count += 1;
                    breakdown.incorrectAnswers.points += event.points; // Already negative
                    breakdown.totalScore += event.points;
                    break;
                    
                case 'timeout':
                    breakdown.timeouts.count += 1;
                    breakdown.timeouts.points += event.points; // Already negative
                    breakdown.totalScore += event.points;
                    break;
                    
                case 'streak_milestone':
                    breakdown.streakMilestones.count += 1;
                    breakdown.streakMilestones.points += event.points;
                    breakdown.totalScore += event.points;
                    break;
                    
                case 'first_to_finish':
                    breakdown.firstToFinish.count += 1;
                    breakdown.firstToFinish.points += event.points;
                    breakdown.totalScore += event.points;
                    break;
            }
        }
        
        return { team1Breakdown: t1, team2Breakdown: t2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- team2Id is not needed in deps
    }, [events, team1Id]);
    
    // Determine which team is "my team"
    const isTeam1Mine = team1Id === myTeamId;
    
    // Total events count
    const totalEvents = events.length;
    
    // If minimized, just show the FAB button
    if (isMinimized) {
        return (
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={() => setIsMinimized(false)}
                className={cn(
                    "fixed bottom-24 right-4 z-40",
                    "w-12 h-12 rounded-full",
                    "bg-violet-600/90 backdrop-blur-sm",
                    "border border-violet-400/30",
                    "flex items-center justify-center",
                    "shadow-lg shadow-violet-500/20",
                    "hover:bg-violet-500/90 transition-colors"
                )}
            >
                <Activity className="w-5 h-5 text-white" />
                {totalEvents > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center text-white">
                        {totalEvents > 99 ? '99+' : totalEvents}
                    </span>
                )}
            </motion.button>
        );
    }
    
    return (
        <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={cn(
                "fixed bottom-24 right-4 z-40",
                "bg-black/95 backdrop-blur-xl",
                "border border-white/10 rounded-2xl",
                "shadow-2xl shadow-black/50",
                "overflow-hidden",
                isExpanded ? "w-[340px]" : "w-72"
            )}
        >
            {/* Header */}
            <div 
                className="flex items-center justify-between px-3 py-2 bg-violet-600/20 border-b border-white/10 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-bold text-white">Points Breakdown</span>
                    <span className="text-xs text-white/40">({totalEvents})</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(true);
                        }}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                        aria-label="Minimize"
                    >
                        <X className="w-4 h-4 text-white/60" />
                    </button>
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-white/60" />
                    ) : (
                        <ChevronUp className="w-4 h-4 text-white/60" />
                    )}
                </div>
            </div>
            
            {/* Score Comparison Bar (always visible) */}
            <div className="px-3 py-2 border-b border-white/5">
                <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                    <span className={cn("font-medium", isTeam1Mine ? "text-emerald-400" : "text-white/70")}>
                        {team1Name}
                    </span>
                    <span className={cn("font-medium", !isTeam1Mine ? "text-emerald-400" : "text-white/70")}>
                        {team2Name}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "text-lg font-black tabular-nums w-12 text-left",
                        isTeam1Mine ? "text-emerald-400" : "text-rose-400"
                    )}>
                        {team1Score}
                    </span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden flex">
                        <motion.div
                            className={cn(
                                "h-full",
                                isTeam1Mine ? "bg-emerald-500" : "bg-rose-500"
                            )}
                            animate={{ 
                                width: `${team1Score + team2Score > 0 
                                    ? (team1Score / (team1Score + team2Score)) * 100 
                                    : 50}%` 
                            }}
                            transition={{ duration: 0.3 }}
                        />
                        <motion.div
                            className={cn(
                                "h-full",
                                !isTeam1Mine ? "bg-emerald-500" : "bg-rose-500"
                            )}
                            animate={{ 
                                width: `${team1Score + team2Score > 0 
                                    ? (team2Score / (team1Score + team2Score)) * 100 
                                    : 50}%` 
                            }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                    <span className={cn(
                        "text-lg font-black tabular-nums w-12 text-right",
                        !isTeam1Mine ? "text-emerald-400" : "text-rose-400"
                    )}>
                        {team2Score}
                    </span>
                </div>
            </div>
            
            {/* Expanded Team Breakdowns */}
            <AnimatePresence mode="popLayout">
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                            {/* My Team First */}
                            <TeamBreakdownPanel
                                teamName={isTeam1Mine ? team1Name : team2Name}
                                breakdown={isTeam1Mine ? team1Breakdown : team2Breakdown}
                                isMyTeam={true}
                                totalScore={isTeam1Mine ? team1Score : team2Score}
                            />
                            
                            {/* Opponent Team */}
                            <TeamBreakdownPanel
                                teamName={isTeam1Mine ? team2Name : team1Name}
                                breakdown={isTeam1Mine ? team2Breakdown : team1Breakdown}
                                isMyTeam={false}
                                totalScore={isTeam1Mine ? team2Score : team1Score}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Collapsed hint */}
            {!isExpanded && (
                <div className="px-3 py-2 text-center text-white/30 text-xs">
                    Click to see breakdown
                </div>
            )}
        </motion.div>
    );
}

/**
 * Helper function to create a PointsEvent from answer_result data
 */
export function createPointsEventFromResult(
    data: {
        teamId: string;
        userId: string;
        isCorrect: boolean;
        pointsEarned: number;
        speedBonus?: number;
        streakMilestoneBonus?: number;
        teamStreak?: number;
        newStreak?: number;
    },
    teamName: string,
    playerName: string,
    myTeamId: string
): PointsEvent {
    let eventType: PointsEvent['eventType'] = data.isCorrect ? 'correct' : 'incorrect';
    let description = data.isCorrect ? 'Correct answer' : 'Wrong answer';
    const totalPoints = data.pointsEarned;
    
    // Check for speed bonus
    if (data.speedBonus && data.speedBonus > 0) {
        description += ` (+${data.speedBonus} speed)`;
    }
    
    // Check for streak milestone - create separate event if present
    if (data.streakMilestoneBonus && data.streakMilestoneBonus > 0) {
        eventType = 'streak_milestone';
        description = `🔥 Streak ${data.teamStreak}! (+${data.streakMilestoneBonus} bonus)`;
    }
    
    return {
        id: `${data.teamId}-${data.userId}-${Date.now()}`,
        timestamp: Date.now(),
        teamId: data.teamId,
        teamName,
        isMyTeam: data.teamId === myTeamId,
        playerName,
        eventType,
        points: totalPoints,
        speedBonus: data.speedBonus,
        streakMilestoneBonus: data.streakMilestoneBonus,
        teamStreak: data.teamStreak,
        description,
    };
}

/**
 * Helper function to create a PointsEvent from timeout data
 */
export function createTimeoutEvent(
    teamId: string,
    teamName: string,
    playerName: string,
    pointsLost: number,
    myTeamId: string
): PointsEvent {
    return {
        id: `timeout-${teamId}-${Date.now()}`,
        timestamp: Date.now(),
        teamId,
        teamName,
        isMyTeam: teamId === myTeamId,
        playerName,
        eventType: 'timeout',
        points: -Math.abs(pointsLost),
        description: '⏱️ Question timed out',
    };
}

/**
 * Helper function to create a PointsEvent for first-to-finish bonus
 */
export function createFirstToFinishEvent(
    teamId: string,
    teamName: string,
    bonus: number,
    round: number,
    myTeamId: string
): PointsEvent {
    return {
        id: `first-finish-${teamId}-${round}-${Date.now()}`,
        timestamp: Date.now(),
        teamId,
        teamName,
        isMyTeam: teamId === myTeamId,
        playerName: teamName,
        eventType: 'first_to_finish',
        points: bonus,
        description: `🏆 First to finish Round ${round}!`,
    };
}
