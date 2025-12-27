/**
 * FlashMath Achievements System
 * Defines all achievements, their requirements, and rewards
 */

import { Trophy, Zap, Target, Star, Crown, Flame, Medal, Coins, ShoppingBag, Music, TrendingUp, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type AchievementCategory = 'level' | 'milestone' | 'mastery' | 'league' | 'wealth' | 'dedication';
export type RequirementType = 'level' | 'sessions' | 'correct_answers' | 'speed_answers' |
    'tier' | 'streak' | 'league_rank' | 'lifetime_coins' | 'items_owned' | 'perfect_session' | 'avg_speed' | 'email_verified';

export interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: LucideIcon;
    category: AchievementCategory;
    reward: {
        type: 'title' | 'coins' | 'both';
        coins?: number;
        titleName?: string;
    };
    requirement: {
        type: RequirementType;
        target: number;
        operation?: string; // For operation-specific achievements
    };
    hidden?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
    // ============ LEVEL ACHIEVEMENTS ============
    {
        id: 'welcome',
        name: 'Welcome to FlashMath',
        description: 'Verify your email address',
        icon: Mail,
        category: 'level',
        reward: { type: 'both', titleName: 'The Newbie', coins: 100 },
        requirement: { type: 'email_verified', target: 1 }
    },
    {
        id: 'rising_star',
        name: 'Rising Star',
        description: 'Reach Level 5',
        icon: Star,
        category: 'level',
        reward: { type: 'title', titleName: 'Rising Star' },
        requirement: { type: 'level', target: 5 }
    },
    {
        id: 'double_digits',
        name: 'Double Digits',
        description: 'Reach Level 10',
        icon: TrendingUp,
        category: 'level',
        reward: { type: 'coins', coins: 300 },
        requirement: { type: 'level', target: 10 }
    },
    {
        id: 'dedicated',
        name: 'Dedicated',
        description: 'Reach Level 15',
        icon: TrendingUp,
        category: 'level',
        reward: { type: 'coins', coins: 400 },
        requirement: { type: 'level', target: 15 }
    },
    {
        id: 'committed',
        name: 'Committed',
        description: 'Reach Level 20',
        icon: TrendingUp,
        category: 'level',
        reward: { type: 'coins', coins: 500 },
        requirement: { type: 'level', target: 20 }
    },
    {
        id: 'quarter_century',
        name: 'Quarter Century',
        description: 'Reach Level 25',
        icon: Crown,
        category: 'level',
        reward: { type: 'coins', coins: 750 },
        requirement: { type: 'level', target: 25 }
    },
    {
        id: 'halfway_hero',
        name: 'Halfway Hero',
        description: 'Reach Level 50',
        icon: Crown,
        category: 'level',
        reward: { type: 'both', titleName: 'Halfway Hero', coins: 1000 },
        requirement: { type: 'level', target: 50 }
    },
    {
        id: 'elite_pilot',
        name: 'Elite Pilot',
        description: 'Reach Level 75',
        icon: Crown,
        category: 'level',
        reward: { type: 'both', titleName: 'Elite Pilot', coins: 5000 },
        requirement: { type: 'level', target: 75 }
    },
    {
        id: 'legendary',
        name: 'Legendary',
        description: 'Reach Level 100',
        icon: Crown,
        category: 'level',
        reward: { type: 'both', titleName: 'Legendary', coins: 10000 },
        requirement: { type: 'level', target: 100 }
    },

    // ============ MILESTONE ACHIEVEMENTS ============
    {
        id: 'first_practice',
        name: 'Practice Makes Perfect',
        description: 'Complete your first practice session',
        icon: Zap,
        category: 'milestone',
        reward: { type: 'coins', coins: 100 },
        requirement: { type: 'sessions', target: 1 }
    },
    {
        id: 'century_club',
        name: 'Century Club',
        description: 'Complete 100 practice sessions',
        icon: Medal,
        category: 'milestone',
        reward: { type: 'coins', coins: 500 },
        requirement: { type: 'sessions', target: 100 }
    },
    {
        id: 'thousand_strong',
        name: 'Thousand Strong',
        description: 'Answer 1,000 questions correctly',
        icon: Target,
        category: 'milestone',
        reward: { type: 'coins', coins: 1000 },
        requirement: { type: 'correct_answers', target: 1000 }
    },
    {
        id: 'perfect_session',
        name: 'Perfect Session',
        description: 'Get 100% accuracy in a session (min 20 questions)',
        icon: Trophy,
        category: 'milestone',
        reward: { type: 'coins', coins: 150 },
        requirement: { type: 'perfect_session', target: 1 }
    },
    {
        id: 'streak_master',
        name: 'Streak Master',
        description: 'Achieve a 25+ answer streak',
        icon: Flame,
        category: 'milestone',
        reward: { type: 'title', titleName: 'Streak Master' },
        requirement: { type: 'streak', target: 25 }
    },
    {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Average under 2 seconds per question in a session',
        icon: Zap,
        category: 'milestone',
        reward: { type: 'title', titleName: 'Speed Demon' },
        requirement: { type: 'avg_speed', target: 2 }
    },
    {
        id: 'the_flash',
        name: 'The Flash',
        description: 'Answer 100 questions in under 1 second each',
        icon: Zap,
        category: 'milestone',
        reward: { type: 'title', titleName: 'The Flash' },
        requirement: { type: 'speed_answers', target: 100 }
    },

    // ============ MASTERY ACHIEVEMENTS ============
    {
        id: 'addition_ace',
        name: 'Addition Ace',
        description: 'Reach Tier IV in Addition',
        icon: Trophy,
        category: 'mastery',
        reward: { type: 'title', titleName: 'Addition Ace' },
        requirement: { type: 'tier', target: 4, operation: 'addition' }
    },
    {
        id: 'subtraction_specialist',
        name: 'Subtraction Specialist',
        description: 'Reach Tier IV in Subtraction',
        icon: Trophy,
        category: 'mastery',
        reward: { type: 'title', titleName: 'Subtraction Specialist' },
        requirement: { type: 'tier', target: 4, operation: 'subtraction' }
    },
    {
        id: 'multiplication_master',
        name: 'Multiplication Master',
        description: 'Reach Tier IV in Multiplication',
        icon: Trophy,
        category: 'mastery',
        reward: { type: 'title', titleName: 'Multiplication Master' },
        requirement: { type: 'tier', target: 4, operation: 'multiplication' }
    },
    {
        id: 'division_dominator',
        name: 'Division Dominator',
        description: 'Reach Tier IV in Division',
        icon: Trophy,
        category: 'mastery',
        reward: { type: 'title', titleName: 'Division Dominator' },
        requirement: { type: 'tier', target: 4, operation: 'division' }
    },
    {
        id: 'math_wizard',
        name: 'Math Wizard',
        description: 'Reach Tier IV in ALL operations',
        icon: Crown,
        category: 'mastery',
        reward: { type: 'both', titleName: 'Math Wizard', coins: 5000 },
        requirement: { type: 'tier', target: 4 } // Special: checks all ops
    },

    // ============ LEAGUE ACHIEVEMENTS ============
    {
        id: 'podium_finish',
        name: 'Podium Finish',
        description: 'Finish Top 3 in weekly standings',
        icon: Medal,
        category: 'league',
        reward: { type: 'coins', coins: 100 },
        requirement: { type: 'league_rank', target: 3 }
    },
    {
        id: 'math_tryhard',
        name: 'The Math TryHard',
        description: 'Finish #1 in weekly standings',
        icon: Crown,
        category: 'league',
        reward: { type: 'title', titleName: 'The Math TryHard' },
        requirement: { type: 'league_rank', target: 1 }
    },

    // ============ WEALTH ACHIEVEMENTS ============
    {
        id: 'first_purchase',
        name: 'First Purchase',
        description: 'Buy your first shop item',
        icon: ShoppingBag,
        category: 'wealth',
        reward: { type: 'coins', coins: 50 },
        requirement: { type: 'items_owned', target: 1 }
    },
    {
        id: 'collector',
        name: 'Collector',
        description: 'Own 10+ items',
        icon: ShoppingBag,
        category: 'wealth',
        reward: { type: 'coins', coins: 200 },
        requirement: { type: 'items_owned', target: 10 }
    },
    {
        id: 'wealthy_one',
        name: 'Wealthy One',
        description: 'Accumulate 10,000 lifetime coins',
        icon: Coins,
        category: 'wealth',
        reward: { type: 'title', titleName: 'Wealthy One' },
        requirement: { type: 'lifetime_coins', target: 10000 }
    },
    {
        id: 'elon_musk',
        name: 'Elon Musk',
        description: 'Accumulate 10,000,000 lifetime coins',
        icon: Crown,
        category: 'wealth',
        reward: { type: 'coins', coins: 1000000 },
        requirement: { type: 'lifetime_coins', target: 10000000 },
        hidden: true
    },

    // ============ DEDICATION ACHIEVEMENTS ============
    {
        id: 'lofi_lyricist',
        name: 'Lo-Fi Lyricist',
        description: 'Listen to Lo-Fi Beats BGM for 5 hours',
        icon: Music,
        category: 'dedication',
        reward: { type: 'title', titleName: 'Lo-Fi Lyricist' },
        requirement: { type: 'sessions', target: 300 }, // Placeholder: will need BGM tracking
        hidden: true
    }
];

export const getAchievementById = (id: string): Achievement | undefined => {
    return ACHIEVEMENTS.find(a => a.id === id);
};

export const getAchievementsByCategory = (category: AchievementCategory): Achievement[] => {
    return ACHIEVEMENTS.filter(a => a.category === category);
};

export const getAllAchievements = (): Achievement[] => {
    return ACHIEVEMENTS;
};
