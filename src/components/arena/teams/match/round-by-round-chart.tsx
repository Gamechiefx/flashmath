'use client';

/**
 * RoundByRoundChart
 * 
 * Post-match analytics component showing score progression across rounds.
 * Displays key moments, momentum shifts, and round-by-round breakdowns.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Zap, Star, Award } from 'lucide-react';

export interface RoundScore {
    round: number;
    team1Score: number;
    team2Score: number;
    team1RoundPoints: number;
    team2RoundPoints: number;
    mvpPlayerId?: string;
    mvpPlayerName?: string;
    keyMoment?: string;
}

interface RoundByRoundChartProps {
    rounds: RoundScore[];
    team1Name: string;
    team2Name: string;
    team1Color?: string;
    team2Color?: string;
    userTeamNumber?: 1 | 2;
    className?: string;
}

function RoundBar({
    round,
    maxPoints,
    team1Color,
    team2Color,
    userTeamNumber,
}: {
    round: RoundScore;
    maxPoints: number;
    team1Color: string;
    team2Color: string;
    userTeamNumber?: 1 | 2;
}) {
    const team1Pct = (round.team1RoundPoints / maxPoints) * 100;
    const team2Pct = (round.team2RoundPoints / maxPoints) * 100;
    const team1Won = round.team1RoundPoints > round.team2RoundPoints;
    const team2Won = round.team2RoundPoints > round.team1RoundPoints;
    
    const isHalftime = round.round === 3; // After round 3 is halftime
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: round.round * 0.1 }}
            className="relative"
        >
            {/* Round number */}
            <div className="text-center mb-2">
                <span className={cn(
                    "text-xs font-medium",
                    round.round <= 3 ? "text-white/50" : "text-white/50"
                )}>
                    R{round.round}
                </span>
                {isHalftime && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
                                    text-[8px] text-amber-400/60 whitespace-nowrap">
                        ½
                    </div>
                )}
            </div>
            
            {/* Stacked bar */}
            <div className="relative h-32 w-8 mx-auto flex flex-col justify-end rounded-lg overflow-hidden bg-white/5">
                {/* Team 2 (top) */}
                <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${team2Pct}%` }}
                    transition={{ delay: round.round * 0.1 + 0.2, duration: 0.5 }}
                    className={cn(
                        "w-full order-1",
                        team2Color,
                        team2Won && "ring-1 ring-inset ring-white/30"
                    )}
                />
                
                {/* Team 1 (bottom) */}
                <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${team1Pct}%` }}
                    transition={{ delay: round.round * 0.1 + 0.3, duration: 0.5 }}
                    className={cn(
                        "w-full order-2",
                        team1Color,
                        team1Won && "ring-1 ring-inset ring-white/30"
                    )}
                />
            </div>
            
            {/* Points labels */}
            <div className="mt-2 text-center space-y-0.5">
                <div className={cn(
                    "text-[10px] font-mono",
                    userTeamNumber === 1 ? "text-primary" : "text-white/60"
                )}>
                    {round.team1RoundPoints}
                </div>
                <div className={cn(
                    "text-[10px] font-mono",
                    userTeamNumber === 2 ? "text-primary" : "text-white/60"
                )}>
                    {round.team2RoundPoints}
                </div>
            </div>
            
            {/* MVP indicator */}
            {round.mvpPlayerId && (
                <div className="absolute -top-1 -right-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                </div>
            )}
        </motion.div>
    );
}

function MomentumIndicator({ rounds, userTeamNumber }: { rounds: RoundScore[]; userTeamNumber?: 1 | 2 }) {
    if (rounds.length < 2) return null;
    
    const changes: Array<{ round: number; direction: 'up' | 'down' | 'even'; magnitude: number }> = [];
    
    for (let i = 1; i < rounds.length; i++) {
        const prev = rounds[i - 1];
        const curr = rounds[i];
        const userPrev = userTeamNumber === 2 ? prev.team2Score : prev.team1Score;
        const userCurr = userTeamNumber === 2 ? curr.team2Score : curr.team1Score;
        const oppPrev = userTeamNumber === 2 ? prev.team1Score : prev.team2Score;
        const oppCurr = userTeamNumber === 2 ? curr.team1Score : curr.team2Score;
        
        const userGain = (userCurr - userPrev);
        const oppGain = (oppCurr - oppPrev);
        const diff = userGain - oppGain;
        
        changes.push({
            round: curr.round,
            direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'even',
            magnitude: Math.abs(diff),
        });
    }
    
    return (
        <div className="flex items-center justify-center gap-1 mt-4">
            <span className="text-xs text-white/40 mr-2">Momentum:</span>
            {changes.map((c, i) => (
                <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                        "w-5 h-5 rounded flex items-center justify-center",
                        c.direction === 'up' && "bg-emerald-500/20",
                        c.direction === 'down' && "bg-rose-500/20",
                        c.direction === 'even' && "bg-white/10"
                    )}
                >
                    {c.direction === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                    {c.direction === 'down' && <TrendingDown className="w-3 h-3 text-rose-400" />}
                    {c.direction === 'even' && <Minus className="w-3 h-3 text-white/40" />}
                </motion.div>
            ))}
        </div>
    );
}

function CumulativeScoreLine({
    rounds,
    team1Name,
    team2Name,
    team1Color: _team1Color,
    team2Color: _team2Color,
}: {
    rounds: RoundScore[];
    team1Name: string;
    team2Name: string;
    team1Color: string;
    team2Color: string;
}) {
    const maxScore = Math.max(
        ...rounds.map(r => r.team1Score),
        ...rounds.map(r => r.team2Score)
    );
    
    // Generate SVG path data
    const width = 300;
    const height = 100;
    const padding = 10;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    
    const getX = (round: number) => padding + ((round - 1) / (rounds.length - 1 || 1)) * innerWidth;
    const getY = (score: number) => padding + innerHeight - (score / (maxScore || 1)) * innerHeight;
    
    const team1Path = rounds.map((r, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(r.round)} ${getY(r.team1Score)}`
    ).join(' ');
    
    const team2Path = rounds.map((r, i) => 
        `${i === 0 ? 'M' : 'L'} ${getX(r.round)} ${getY(r.team2Score)}`
    ).join(' ');
    
    return (
        <div className="relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75, 1].map((pct, i) => (
                    <line
                        key={i}
                        x1={padding}
                        y1={padding + innerHeight * (1 - pct)}
                        x2={width - padding}
                        y2={padding + innerHeight * (1 - pct)}
                        stroke="rgba(255,255,255,0.1)"
                        strokeDasharray="4"
                    />
                ))}
                
                {/* Team 2 line */}
                <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 0.3 }}
                    d={team2Path}
                    fill="none"
                    stroke="rgb(244, 63, 94)"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                
                {/* Team 1 line */}
                <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                    d={team1Path}
                    fill="none"
                    stroke="rgb(34, 197, 94)"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                
                {/* Data points */}
                {rounds.map((r, i) => (
                    <g key={i}>
                        <motion.circle
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.4 + i * 0.1 }}
                            cx={getX(r.round)}
                            cy={getY(r.team1Score)}
                            r="3"
                            fill="rgb(34, 197, 94)"
                        />
                        <motion.circle
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                            cx={getX(r.round)}
                            cy={getY(r.team2Score)}
                            r="3"
                            fill="rgb(244, 63, 94)"
                        />
                    </g>
                ))}
            </svg>
            
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                    <span className="text-[10px] text-white/60">{team1Name}</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-0.5 bg-rose-500 rounded" />
                    <span className="text-[10px] text-white/60">{team2Name}</span>
                </div>
            </div>
        </div>
    );
}

export function RoundByRoundChart({
    rounds,
    team1Name,
    team2Name,
    team1Color = 'bg-emerald-500',
    team2Color = 'bg-rose-500',
    userTeamNumber,
    className,
}: RoundByRoundChartProps) {
    const maxPointsPerRound = Math.max(
        ...rounds.map(r => Math.max(r.team1RoundPoints, r.team2RoundPoints)),
        1
    );
    
    // Find key moments
    const mvpRounds = rounds.filter(r => r.mvpPlayerId);
    const biggestSwing = rounds.reduce((max, r) => {
        const diff = Math.abs(r.team1RoundPoints - r.team2RoundPoints);
        return diff > max.diff ? { round: r, diff } : max;
    }, { round: rounds[0], diff: 0 });

    return (
        <div className={cn(
            "rounded-xl border border-white/10 overflow-hidden",
            "bg-gradient-to-b from-slate-800/50 to-slate-900/50",
            className
        )}>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-primary/10 border-b border-white/10">
                <Zap className="w-5 h-5 text-primary" />
                <span className="font-bold text-primary">Round Analysis</span>
                <span className="text-xs text-white/50 ml-auto">
                    {rounds.length} Rounds
                </span>
            </div>
            
            <div className="p-4 space-y-6">
                {/* Cumulative Score Line Chart */}
                <div>
                    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                        Score Progression
                    </h4>
                    <CumulativeScoreLine
                        rounds={rounds}
                        team1Name={team1Name}
                        team2Name={team2Name}
                        team1Color={team1Color}
                        team2Color={team2Color}
                    />
                </div>
                
                {/* Round bars */}
                <div>
                    <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                        Points Per Round
                    </h4>
                    <div className="flex justify-around items-end">
                        {rounds.map((round) => (
                            <RoundBar
                                key={round.round}
                                round={round}
                                maxPoints={maxPointsPerRound}
                                team1Color={team1Color}
                                team2Color={team2Color}
                                userTeamNumber={userTeamNumber}
                            />
                        ))}
                    </div>
                    
                    {/* Team legend */}
                    <div className="flex justify-center gap-6 mt-4 text-xs">
                        <div className="flex items-center gap-1">
                            <div className={cn("w-3 h-3 rounded", team1Color)} />
                            <span className={cn(
                                userTeamNumber === 1 ? "text-primary font-medium" : "text-white/60"
                            )}>
                                {team1Name}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className={cn("w-3 h-3 rounded", team2Color)} />
                            <span className={cn(
                                userTeamNumber === 2 ? "text-primary font-medium" : "text-white/60"
                            )}>
                                {team2Name}
                            </span>
                        </div>
                    </div>
                </div>
                
                {/* Momentum tracker */}
                <MomentumIndicator rounds={rounds} userTeamNumber={userTeamNumber} />
                
                {/* Key Insights */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Biggest Swing */}
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="flex items-center gap-1 mb-1">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span className="text-xs font-semibold text-amber-400">Biggest Swing</span>
                        </div>
                        <p className="text-sm text-white">
                            Round {biggestSwing.round.round}
                        </p>
                        <p className="text-[10px] text-white/50">
                            {biggestSwing.diff} point difference
                        </p>
                    </div>
                    
                    {/* MVP Count */}
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <div className="flex items-center gap-1 mb-1">
                            <Award className="w-3 h-3 text-purple-400" />
                            <span className="text-xs font-semibold text-purple-400">Round MVPs</span>
                        </div>
                        <p className="text-sm text-white">
                            {mvpRounds.length} earned
                        </p>
                        <p className="text-[10px] text-white/50">
                            {mvpRounds.map(r => r.mvpPlayerName).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(', ')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

