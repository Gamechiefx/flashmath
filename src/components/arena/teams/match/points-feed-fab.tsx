'use client';

/**
 * PointsFeedFAB
 * 
 * A Floating Action Button that displays a real-time points feed for both teams
 * during a match. Shows scoring events as they happen with animations.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Activity, X, ChevronUp, ChevronDown, Zap, Target, Clock, Trophy, Flame } from 'lucide-react';

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

interface PointsFeedFABProps {
    team1Name: string;
    team2Name: string;
    team1Score: number;
    team2Score: number;
    myTeamId: string;
    events: PointsEvent[];
    maxEvents?: number;
}

export function PointsFeedFAB({
    team1Name,
    team2Name,
    team1Score,
    team2Score,
    myTeamId,
    events,
    maxEvents = 50,
}: PointsFeedFABProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const feedRef = useRef<HTMLDivElement>(null);
    
    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        if (feedRef.current && isExpanded) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [events, isExpanded]);
    
    // Get icon for event type
    const getEventIcon = (eventType: PointsEvent['eventType']) => {
        switch (eventType) {
            case 'correct':
                return <Target className="w-3.5 h-3.5" />;
            case 'incorrect':
                return <X className="w-3.5 h-3.5" />;
            case 'timeout':
                return <Clock className="w-3.5 h-3.5" />;
            case 'streak_milestone':
                return <Flame className="w-3.5 h-3.5" />;
            case 'first_to_finish':
                return <Trophy className="w-3.5 h-3.5" />;
            default:
                return <Zap className="w-3.5 h-3.5" />;
        }
    };
    
    // Get color classes for event
    const getEventColors = (event: PointsEvent) => {
        if (event.eventType === 'streak_milestone' || event.eventType === 'first_to_finish') {
            return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        }
        if (event.points > 0) {
            return event.isMyTeam 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        }
        return event.isMyTeam
            ? 'bg-red-500/20 text-red-400 border-red-500/30'
            : 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    };
    
    // Format points with sign
    const formatPoints = (points: number) => {
        return points >= 0 ? `+${points}` : `${points}`;
    };
    
    // Recent events (last 3) for collapsed view
    const recentEvents = events.slice(-3);
    
    // If minimized, just show the FAB button
    if (isMinimized) {
        return (
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                onClick={() => setIsMinimized(false)}
                className={cn(
                    "fixed bottom-24 left-4 z-40",
                    "w-12 h-12 rounded-full",
                    "bg-violet-600/90 backdrop-blur-sm",
                    "border border-violet-400/30",
                    "flex items-center justify-center",
                    "shadow-lg shadow-violet-500/20",
                    "hover:bg-violet-500/90 transition-colors"
                )}
            >
                <Activity className="w-5 h-5 text-white" />
                {events.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold flex items-center justify-center">
                        {events.length > 99 ? '99+' : events.length}
                    </span>
                )}
            </motion.button>
        );
    }
    
    return (
        <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={cn(
                "fixed bottom-24 left-4 z-40",
                "bg-black/90 backdrop-blur-xl",
                "border border-white/10 rounded-2xl",
                "shadow-2xl shadow-black/50",
                "overflow-hidden",
                isExpanded ? "w-80" : "w-64"
            )}
        >
            {/* Header */}
            <div 
                className="flex items-center justify-between px-3 py-2 bg-violet-600/20 border-b border-white/10 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-bold text-white">Live Points Feed</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMinimized(true);
                        }}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
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
            
            {/* Score Summary */}
            <div className="flex items-center justify-between px-3 py-2 bg-black/50 border-b border-white/5">
                <div className="text-center flex-1">
                    <div className="text-xs text-emerald-400 font-medium truncate">{team1Name}</div>
                    <div className="text-lg font-bold text-white">{team1Score}</div>
                </div>
                <div className="text-white/30 text-sm font-bold px-2">vs</div>
                <div className="text-center flex-1">
                    <div className="text-xs text-blue-400 font-medium truncate">{team2Name}</div>
                    <div className="text-lg font-bold text-white">{team2Score}</div>
                </div>
            </div>
            
            {/* Events Feed */}
            <AnimatePresence mode="popLayout">
                {isExpanded ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div 
                            ref={feedRef}
                            className="max-h-64 overflow-y-auto p-2 space-y-1.5"
                        >
                            {events.length === 0 ? (
                                <div className="text-center text-white/40 text-sm py-4">
                                    No scoring events yet...
                                </div>
                            ) : (
                                events.slice(-maxEvents).map((event) => (
                                    <motion.div
                                        key={event.id}
                                        initial={{ x: -20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        className={cn(
                                            "flex items-center gap-2 px-2 py-1.5 rounded-lg border",
                                            getEventColors(event)
                                        )}
                                    >
                                        <div className="flex-shrink-0">
                                            {getEventIcon(event.eventType)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-medium truncate">
                                                    {event.playerName}
                                                </span>
                                                {event.isMyTeam && (
                                                    <span className="text-[10px] bg-white/10 px-1 rounded">YOU</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] opacity-70 truncate">
                                                {event.description}
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "flex-shrink-0 text-sm font-bold",
                                            event.points >= 0 ? "text-emerald-400" : "text-red-400"
                                        )}>
                                            {formatPoints(event.points)}
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="p-2 space-y-1"
                    >
                        {recentEvents.length === 0 ? (
                            <div className="text-center text-white/40 text-xs py-2">
                                Waiting for action...
                            </div>
                        ) : (
                            recentEvents.map((event) => (
                                <div
                                    key={event.id}
                                    className={cn(
                                        "flex items-center justify-between px-2 py-1 rounded text-xs",
                                        getEventColors(event)
                                    )}
                                >
                                    <span className="truncate flex-1">{event.playerName}</span>
                                    <span className={cn(
                                        "font-bold ml-2",
                                        event.points >= 0 ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {formatPoints(event.points)}
                                    </span>
                                </div>
                            ))
                        )}
                        <div className="text-center text-white/40 text-[10px] pt-1">
                            Click to expand • {events.length} events
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
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
    let totalPoints = data.pointsEarned;
    
    // Check for speed bonus
    if (data.speedBonus && data.speedBonus > 0) {
        description += ` (+${data.speedBonus} speed)`;
    }
    
    // Check for streak milestone
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
        points: -pointsLost,
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
