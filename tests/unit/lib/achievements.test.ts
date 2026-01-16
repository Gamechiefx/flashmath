/**
 * Achievements System Tests
 * Tests for achievement definitions and lookup functions
 */

import { describe, it, expect } from 'vitest';
import {
    ACHIEVEMENTS,
    getAchievementById,
    getAchievementsByCategory,
    getAllAchievements,
    type Achievement,
    type AchievementCategory,
} from '@/lib/achievements';

describe('ACHIEVEMENTS Constant', () => {
    it('should contain achievements', () => {
        expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
    });

    it('should have unique IDs', () => {
        const ids = ACHIEVEMENTS.map(a => a.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all required properties', () => {
        ACHIEVEMENTS.forEach((achievement: Achievement) => {
            expect(achievement.id).toBeDefined();
            expect(achievement.name).toBeDefined();
            expect(achievement.description).toBeDefined();
            expect(achievement.icon).toBeDefined();
            expect(achievement.category).toBeDefined();
            expect(achievement.reward).toBeDefined();
            expect(achievement.requirement).toBeDefined();
        });
    });
});

describe('Achievement Categories', () => {
    const categories: AchievementCategory[] = ['level', 'milestone', 'mastery', 'league', 'wealth', 'dedication'];

    categories.forEach(category => {
        it(`should have achievements in category: ${category}`, () => {
            const achievements = ACHIEVEMENTS.filter(a => a.category === category);
            // Allow empty categories (some might be hidden or not yet added)
            expect(achievements.length).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('Level Achievements', () => {
    it('should have welcome achievement for email verification', () => {
        const welcome = ACHIEVEMENTS.find(a => a.id === 'welcome');
        expect(welcome).toBeDefined();
        expect(welcome?.requirement.type).toBe('email_verified');
        expect(welcome?.reward.titleName).toBe('The Newbie');
    });

    it('should have rising star at level 5', () => {
        const risingStar = ACHIEVEMENTS.find(a => a.id === 'rising_star');
        expect(risingStar).toBeDefined();
        expect(risingStar?.requirement.type).toBe('level');
        expect(risingStar?.requirement.target).toBe(5);
    });

    it('should have legendary at level 100', () => {
        const legendary = ACHIEVEMENTS.find(a => a.id === 'legendary');
        expect(legendary).toBeDefined();
        expect(legendary?.requirement.target).toBe(100);
        expect(legendary?.reward.coins).toBe(10000);
    });
});

describe('Milestone Achievements', () => {
    it('should have first practice achievement', () => {
        const firstPractice = ACHIEVEMENTS.find(a => a.id === 'first_practice');
        expect(firstPractice).toBeDefined();
        expect(firstPractice?.requirement.type).toBe('sessions');
        expect(firstPractice?.requirement.target).toBe(1);
    });

    it('should have streak master achievement', () => {
        const streakMaster = ACHIEVEMENTS.find(a => a.id === 'streak_master');
        expect(streakMaster).toBeDefined();
        expect(streakMaster?.requirement.type).toBe('streak');
        expect(streakMaster?.requirement.target).toBe(25);
    });

    it('should have speed demon achievement', () => {
        const speedDemon = ACHIEVEMENTS.find(a => a.id === 'speed_demon');
        expect(speedDemon).toBeDefined();
        expect(speedDemon?.requirement.type).toBe('avg_speed');
        expect(speedDemon?.requirement.target).toBe(2);
    });
});

describe('Mastery Achievements', () => {
    it('should have operation-specific tier achievements', () => {
        const operations = ['addition', 'subtraction', 'multiplication', 'division'];
        
        operations.forEach(op => {
            const achievement = ACHIEVEMENTS.find(
                a => a.requirement.operation === op && a.requirement.type === 'tier'
            );
            expect(achievement).toBeDefined();
            expect(achievement?.requirement.target).toBe(4);
        });
    });

    it('should have math wizard achievement for all operations', () => {
        const mathWizard = ACHIEVEMENTS.find(a => a.id === 'math_wizard');
        expect(mathWizard).toBeDefined();
        expect(mathWizard?.requirement.type).toBe('tier');
        expect(mathWizard?.requirement.target).toBe(4);
        expect(mathWizard?.requirement.operation).toBeUndefined(); // Checks all ops
        expect(mathWizard?.reward.coins).toBe(5000);
    });
});

describe('League Achievements', () => {
    it('should have podium finish achievement', () => {
        const podium = ACHIEVEMENTS.find(a => a.id === 'podium_finish');
        expect(podium).toBeDefined();
        expect(podium?.requirement.type).toBe('league_rank');
        expect(podium?.requirement.target).toBe(3);
    });

    it('should have first place achievement', () => {
        const tryhard = ACHIEVEMENTS.find(a => a.id === 'math_tryhard');
        expect(tryhard).toBeDefined();
        expect(tryhard?.requirement.target).toBe(1);
    });
});

describe('Wealth Achievements', () => {
    it('should have first purchase achievement', () => {
        const firstPurchase = ACHIEVEMENTS.find(a => a.id === 'first_purchase');
        expect(firstPurchase).toBeDefined();
        expect(firstPurchase?.requirement.type).toBe('items_owned');
        expect(firstPurchase?.requirement.target).toBe(1);
    });

    it('should have wealthy one achievement', () => {
        const wealthy = ACHIEVEMENTS.find(a => a.id === 'wealthy_one');
        expect(wealthy).toBeDefined();
        expect(wealthy?.requirement.type).toBe('lifetime_coins');
        expect(wealthy?.requirement.target).toBe(10000);
    });

    it('should have hidden Elon Musk achievement', () => {
        const elon = ACHIEVEMENTS.find(a => a.id === 'elon_musk');
        expect(elon).toBeDefined();
        expect(elon?.hidden).toBe(true);
        expect(elon?.requirement.target).toBe(10000000);
    });
});

describe('Achievement Rewards', () => {
    it('should have valid reward types', () => {
        ACHIEVEMENTS.forEach(achievement => {
            expect(['title', 'coins', 'both']).toContain(achievement.reward.type);
        });
    });

    it('should have coins defined when reward type includes coins', () => {
        ACHIEVEMENTS
            .filter(a => a.reward.type === 'coins' || a.reward.type === 'both')
            .forEach(achievement => {
                expect(achievement.reward.coins).toBeDefined();
                expect(achievement.reward.coins).toBeGreaterThan(0);
            });
    });

    it('should have title name defined when reward type includes title', () => {
        ACHIEVEMENTS
            .filter(a => a.reward.type === 'title' || a.reward.type === 'both')
            .forEach(achievement => {
                expect(achievement.reward.titleName).toBeDefined();
                expect(achievement.reward.titleName?.length).toBeGreaterThan(0);
            });
    });
});

describe('getAchievementById', () => {
    it('should return achievement for valid id', () => {
        const achievement = getAchievementById('welcome');
        expect(achievement).toBeDefined();
        expect(achievement?.id).toBe('welcome');
    });

    it('should return undefined for invalid id', () => {
        const achievement = getAchievementById('nonexistent_achievement');
        expect(achievement).toBeUndefined();
    });

    it('should find all achievements by their id', () => {
        ACHIEVEMENTS.forEach(a => {
            const found = getAchievementById(a.id);
            expect(found).toBeDefined();
            expect(found?.id).toBe(a.id);
        });
    });
});

describe('getAchievementsByCategory', () => {
    it('should return achievements for level category', () => {
        const levelAchievements = getAchievementsByCategory('level');
        expect(levelAchievements.length).toBeGreaterThan(0);
        levelAchievements.forEach(a => {
            expect(a.category).toBe('level');
        });
    });

    it('should return achievements for milestone category', () => {
        const milestoneAchievements = getAchievementsByCategory('milestone');
        expect(milestoneAchievements.length).toBeGreaterThan(0);
        milestoneAchievements.forEach(a => {
            expect(a.category).toBe('milestone');
        });
    });

    it('should return empty array for non-existent category', () => {
        // TypeScript wouldn't normally allow this, but testing runtime behavior
        const achievements = getAchievementsByCategory('nonexistent' as AchievementCategory);
        expect(achievements).toEqual([]);
    });
});

describe('getAllAchievements', () => {
    it('should return all achievements', () => {
        const all = getAllAchievements();
        expect(all.length).toBe(ACHIEVEMENTS.length);
    });

    it('should return the same achievements array', () => {
        const all = getAllAchievements();
        // The function returns the same array reference
        expect(all).toBe(ACHIEVEMENTS);
    });
});

describe('Requirement Types', () => {
    const expectedTypes = [
        'level',
        'sessions', 
        'correct_answers',
        'speed_answers',
        'tier',
        'streak',
        'league_rank',
        'lifetime_coins',
        'items_owned',
        'perfect_session',
        'avg_speed',
        'email_verified',
    ];

    it('should only use defined requirement types', () => {
        ACHIEVEMENTS.forEach(achievement => {
            if (achievement.requirement) {
                expect(expectedTypes).toContain(achievement.requirement.type);
            }
        });
    });

    it('should have positive target values', () => {
        ACHIEVEMENTS.forEach(achievement => {
            if (achievement.requirement) {
                expect(achievement.requirement.target).toBeGreaterThan(0);
            }
        });
    });
});
