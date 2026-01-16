"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { 
    TrendingUp, 
    TrendingDown, 
    Minus, 
    Target, 
    Award, 
    Share2,
    Download,
    Copy,
    CheckCircle2,
    AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { 
    AdvancedAnalytics, 
    TrendAnalysis,
    ShareableAchievement,
    ShareableProgressSummary 
} from "@/lib/actions/analytics";

interface AdvancedAnalyticsViewProps {
    analytics: AdvancedAnalytics;
    achievements: ShareableAchievement[];
    progressSummary: ShareableProgressSummary;
}

// Trend direction icons
const TrendIcon = ({ trend }: { trend: TrendAnalysis }) => {
    if (trend.direction === 'improving') return <TrendingUp className="text-green-400" size={16} />;
    if (trend.direction === 'declining') return <TrendingDown className="text-red-400" size={16} />;
    return <Minus className="text-yellow-400" size={16} />;
};

// Trend strength color
const getTrendColor = (trend: TrendAnalysis) => {
    if (trend.direction === 'improving') {
        return trend.strength === 'strong' ? 'text-green-400' : trend.strength === 'moderate' ? 'text-green-300' : 'text-green-200';
    }
    if (trend.direction === 'declining') {
        return trend.strength === 'strong' ? 'text-red-400' : trend.strength === 'moderate' ? 'text-red-300' : 'text-red-200';
    }
    return 'text-yellow-400';
};

// Priority colors for suggestions
const getPriorityColor = (priority: string) => {
    switch (priority) {
        case 'high': return 'border-red-500/30 bg-red-500/10';
        case 'medium': return 'border-yellow-500/30 bg-yellow-500/10';
        case 'low': return 'border-blue-500/30 bg-blue-500/10';
        default: return 'border-white/10 bg-white/5';
    }
};

// Rarity colors for achievements
const getRarityColor = (rarity: string) => {
    switch (rarity) {
        case 'legendary': return 'from-yellow-400 to-orange-500';
        case 'epic': return 'from-purple-400 to-pink-500';
        case 'rare': return 'from-blue-400 to-cyan-500';
        case 'common': return 'from-green-400 to-emerald-500';
        default: return 'from-gray-400 to-gray-500';
    }
};

// Rarity border classes for achievements (static classes for Tailwind purge)
const getRarityBorderClass = (rarity: string, opacity: '30' | '50' = '30') => {
    if (opacity === '50') {
        switch (rarity) {
            case 'legendary': return 'border-yellow-500/50';
            case 'epic': return 'border-purple-500/50';
            case 'rare': return 'border-blue-500/50';
            case 'common': return 'border-green-500/50';
            default: return 'border-white/50';
        }
    }
    // Default opacity: 30
    switch (rarity) {
        case 'legendary': return 'border-yellow-500/30';
        case 'epic': return 'border-purple-500/30';
        case 'rare': return 'border-blue-500/30';
        case 'common': return 'border-green-500/30';
        default: return 'border-white/30';
    }
};

export function AdvancedAnalyticsView({ analytics, achievements, progressSummary }: AdvancedAnalyticsViewProps) {
    const [selectedTab, setSelectedTab] = useState<'trends' | 'suggestions' | 'achievements' | 'share'>('trends');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopyShare = async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
                <h1 className="text-4xl font-black uppercase tracking-tighter">Advanced Analytics</h1>
                <p className="text-muted-foreground">Deep insights into your performance and personalized improvement suggestions</p>
            </div>

            {/* Tab Navigation */}
            <div className="flex justify-center">
                <div className="flex bg-black/20 rounded-xl p-1 border border-white/10">
                    {[
                        { id: 'trends', label: 'Trends', icon: TrendingUp },
                        { id: 'suggestions', label: 'Suggestions', icon: Target },
                        { id: 'achievements', label: 'Achievements', icon: Award },
                        { id: 'share', label: 'Share', icon: Share2 }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSelectedTab(tab.id as 'trends' | 'suggestions' | 'achievements' | 'share')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                                selectedTab === tab.id
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <motion.div
                key={selectedTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                {selectedTab === 'trends' && (
                    <div className="space-y-6">
                        {/* Overall Trend */}
                        <GlassCard className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <TrendIcon trend={analytics.overallTrend} />
                                <h3 className="text-xl font-bold">Overall Performance Trend</h3>
                            </div>
                            <div className="space-y-3">
                                <div className={cn("text-lg font-medium", getTrendColor(analytics.overallTrend))}>
                                    {analytics.overallTrend.description}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span>Confidence: {(analytics.overallTrend.confidence * 100).toFixed(0)}%</span>
                                    <span>Timeframe: {analytics.overallTrend.timeframe}</span>
                                    <span>Strength: {analytics.overallTrend.strength}</span>
                                </div>
                            </div>
                        </GlassCard>

                        {/* Operation Trends */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(analytics.operationTrends).map(([operation, trend]) => (
                                <GlassCard key={operation} className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold capitalize">{operation}</h4>
                                        <TrendIcon trend={trend} />
                                    </div>
                                    <div className={cn("text-sm", getTrendColor(trend))}>
                                        {trend.description}
                                    </div>
                                    <div className="mt-2 text-xs text-muted-foreground">
                                        {(trend.confidence * 100).toFixed(0)}% confidence
                                    </div>
                                </GlassCard>
                            ))}
                        </div>

                        {/* Performance Pattern */}
                        <GlassCard className="p-6">
                            <h3 className="text-xl font-bold mb-4">Performance Patterns</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-black text-primary">
                                        {(analytics.performancePattern.consistencyScore * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-sm text-muted-foreground">Consistency Score</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-black text-accent">
                                        {analytics.performancePattern.improvementRate > 0 ? '+' : ''}
                                        {analytics.performancePattern.improvementRate.toFixed(1)}%
                                    </div>
                                    <div className="text-sm text-muted-foreground">Weekly Improvement</div>
                                </div>
                                <div className="text-center">
                                    <div className={cn(
                                        "text-2xl font-black",
                                        analytics.performancePattern.plateauDetection ? "text-yellow-400" : "text-green-400"
                                    )}>
                                        {analytics.performancePattern.plateauDetection ? "Plateau" : "Growing"}
                                    </div>
                                    <div className="text-sm text-muted-foreground">Status</div>
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                )}

                {selectedTab === 'suggestions' && (
                    <div className="space-y-4">
                        {analytics.suggestions.map((suggestion, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <GlassCard className={cn("p-6 border", getPriorityColor(suggestion.priority))}>
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full",
                                                suggestion.priority === 'high' ? "bg-red-400" :
                                                suggestion.priority === 'medium' ? "bg-yellow-400" : "bg-blue-400"
                                            )} />
                                            <h4 className="font-bold">{suggestion.title}</h4>
                                        </div>
                                        <span className="text-xs px-2 py-1 rounded-full bg-white/10 uppercase font-bold">
                                            {suggestion.priority}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground mb-3">{suggestion.description}</p>
                                    <div className="bg-black/20 rounded-lg p-3 border border-white/10">
                                        <div className="text-xs font-bold text-primary mb-1">ACTION PLAN:</div>
                                        <div className="text-sm">{suggestion.actionable}</div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>Type: {suggestion.type}</span>
                                        <span>Impact: {(suggestion.estimatedImpact * 100).toFixed(0)}%</span>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ))}

                        {/* Strengths and Weaknesses */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                            <GlassCard className="p-6 border-green-500/20">
                                <div className="flex items-center gap-2 mb-4">
                                    <CheckCircle2 className="text-green-400" size={20} />
                                    <h3 className="font-bold text-green-400">Strengths</h3>
                                </div>
                                <ul className="space-y-2">
                                    {analytics.strengthsAndWeaknesses.strengths.map((strength, index) => (
                                        <li key={index} className="text-sm flex items-start gap-2">
                                            <div className="w-1 h-1 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                                            {strength}
                                        </li>
                                    ))}
                                </ul>
                            </GlassCard>

                            <GlassCard className="p-6 border-red-500/20">
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertCircle className="text-red-400" size={20} />
                                    <h3 className="font-bold text-red-400">Areas for Improvement</h3>
                                </div>
                                <ul className="space-y-2">
                                    {analytics.strengthsAndWeaknesses.weaknesses.map((weakness, index) => (
                                        <li key={index} className="text-sm flex items-start gap-2">
                                            <div className="w-1 h-1 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                                            {weakness}
                                        </li>
                                    ))}
                                </ul>
                            </GlassCard>
                        </div>
                    </div>
                )}

                {selectedTab === 'achievements' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {achievements.map((achievement, index) => (
                                <motion.div
                                    key={achievement.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <GlassCard className={cn(
                                        "p-6 relative overflow-hidden border-2",
                                        getRarityBorderClass(achievement.rarity)
                                    )}>
                                        <div className={cn(
                                            "absolute inset-0 bg-gradient-to-br opacity-10",
                                            getRarityColor(achievement.rarity)
                                        )} />
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-2xl">{achievement.icon}</span>
                                                <span className="text-xs px-2 py-1 rounded-full bg-white/20 uppercase font-bold">
                                                    {achievement.rarity}
                                                </span>
                                            </div>
                                            <h4 className="font-bold mb-2">{achievement.title}</h4>
                                            <p className="text-sm text-muted-foreground mb-3">{achievement.description}</p>
                                            <div className="text-xl font-black text-primary">{achievement.value}</div>
                                        </div>
                                    </GlassCard>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedTab === 'share' && (
                    <div className="space-y-6">
                        {/* Progress Summary Card */}
                        <GlassCard className="p-6">
                            <h3 className="text-xl font-bold mb-4">Progress Summary</h3>
                            <div className="bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl p-6 border border-white/10">
                                <div className="text-center mb-4">
                                    <h4 className="text-2xl font-black">{progressSummary.title}</h4>
                                    <p className="text-muted-foreground">{progressSummary.timeframe}</p>
                                </div>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-xl font-black text-primary">{progressSummary.stats.totalSessions}</div>
                                        <div className="text-xs text-muted-foreground">Sessions</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xl font-black text-accent">{progressSummary.stats.averageAccuracy}%</div>
                                        <div className="text-xs text-muted-foreground">Accuracy</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xl font-black text-yellow-400">{progressSummary.stats.bestStreak}</div>
                                        <div className="text-xs text-muted-foreground">Best Streak</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xl font-black text-green-400">Lv.{progressSummary.stats.level}</div>
                                        <div className="text-xs text-muted-foreground">Level</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div>
                                        <div className="text-xs font-bold text-primary mb-1">HIGHLIGHTS:</div>
                                        <div className="text-sm">{progressSummary.highlights.join(' • ')}</div>
                                    </div>
                                    {progressSummary.improvements.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold text-green-400 mb-1">IMPROVEMENTS:</div>
                                            <div className="text-sm">{progressSummary.improvements.join(' • ')}</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <NeonButton
                                    onClick={() => handleCopyShare(`🚀 My FlashMath progress: ${progressSummary.highlights[0]} Level ${progressSummary.stats.level} with ${progressSummary.stats.averageAccuracy}% accuracy! #FlashMath`, 'progress')}
                                    className="flex items-center gap-2"
                                >
                                    {copiedId === 'progress' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                    {copiedId === 'progress' ? 'Copied!' : 'Copy Share Text'}
                                </NeonButton>
                                <NeonButton variant="ghost" className="flex items-center gap-2">
                                    <Download size={16} />
                                    Download Card
                                </NeonButton>
                            </div>
                        </GlassCard>

                        {/* Top Achievement */}
                        {achievements.length > 0 && (
                            <GlassCard className="p-6">
                                <h3 className="text-xl font-bold mb-4">Latest Achievement</h3>
                                <div className={cn(
                                    "bg-gradient-to-br rounded-xl p-6 border-2 relative overflow-hidden",
                                    getRarityColor(achievements[0].rarity),
                                    getRarityBorderClass(achievements[0].rarity, '50')
                                )}>
                                    <div className="text-center text-white">
                                        <div className="text-4xl mb-2">{achievements[0].icon}</div>
                                        <h4 className="text-xl font-black mb-2">{achievements[0].title}</h4>
                                        <p className="text-sm opacity-90 mb-3">{achievements[0].description}</p>
                                        <div className="text-2xl font-black">{achievements[0].value}</div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-4">
                                    <NeonButton
                                        onClick={() => handleCopyShare(`🎉 Just unlocked "${achievements[0].title}" in FlashMath! ${achievements[0].description} ${achievements[0].icon} #FlashMath #Achievement`, 'achievement')}
                                        className="flex items-center gap-2"
                                    >
                                        {copiedId === 'achievement' ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                        {copiedId === 'achievement' ? 'Copied!' : 'Share Achievement'}
                                    </NeonButton>
                                </div>
                            </GlassCard>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}