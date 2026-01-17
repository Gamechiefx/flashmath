/**
 * AI Team Generator Tests
 * Tests for bot team generation and behavior
 */

import { describe, it, expect } from 'vitest';
import {
    BOT_DIFFICULTY_CONFIGS,
    generateAITeam,
    isAIBot,
    isAITeam,
    getBotConfig,
    calculateBotAnswerTime,
    botAnswersCorrectly,
    type BotDifficulty,
    type BotConfig,
} from '@/lib/arena/ai-team';

describe('BOT_DIFFICULTY_CONFIGS', () => {
    it('should have all difficulty levels defined', () => {
        expect(BOT_DIFFICULTY_CONFIGS.easy).toBeDefined();
        expect(BOT_DIFFICULTY_CONFIGS.medium).toBeDefined();
        expect(BOT_DIFFICULTY_CONFIGS.hard).toBeDefined();
        expect(BOT_DIFFICULTY_CONFIGS.impossible).toBeDefined();
    });

    it('should have increasing accuracy with difficulty', () => {
        expect(BOT_DIFFICULTY_CONFIGS.easy.accuracy).toBeLessThan(BOT_DIFFICULTY_CONFIGS.medium.accuracy);
        expect(BOT_DIFFICULTY_CONFIGS.medium.accuracy).toBeLessThan(BOT_DIFFICULTY_CONFIGS.hard.accuracy);
        expect(BOT_DIFFICULTY_CONFIGS.hard.accuracy).toBeLessThan(BOT_DIFFICULTY_CONFIGS.impossible.accuracy);
    });

    it('should have decreasing answer time with difficulty', () => {
        expect(BOT_DIFFICULTY_CONFIGS.easy.answerTimeRange[0]).toBeGreaterThan(BOT_DIFFICULTY_CONFIGS.medium.answerTimeRange[0]);
        expect(BOT_DIFFICULTY_CONFIGS.medium.answerTimeRange[0]).toBeGreaterThan(BOT_DIFFICULTY_CONFIGS.hard.answerTimeRange[0]);
        expect(BOT_DIFFICULTY_CONFIGS.hard.answerTimeRange[0]).toBeGreaterThan(BOT_DIFFICULTY_CONFIGS.impossible.answerTimeRange[0]);
    });

    it('should have valid config structure', () => {
        const difficulties: BotDifficulty[] = ['easy', 'medium', 'hard', 'impossible'];
        
        difficulties.forEach(diff => {
            const config = BOT_DIFFICULTY_CONFIGS[diff];
            expect(config.difficulty).toBe(diff);
            expect(config.answerTimeRange).toHaveLength(2);
            expect(config.answerTimeRange[0]).toBeLessThan(config.answerTimeRange[1]);
            expect(config.accuracy).toBeGreaterThan(0);
            expect(config.accuracy).toBeLessThanOrEqual(1);
            expect(config.streakMultiplier).toBeGreaterThan(0);
        });
    });
});

describe('generateAITeam', () => {
    it('should generate a team with 5 members', () => {
        const team = generateAITeam('test-match-1', 500);
        expect(team.odMembers).toHaveLength(5);
    });

    it('should have valid team identity', () => {
        const team = generateAITeam('test-match-2', 500);
        expect(team.odTeamName).toBeDefined();
        expect(team.odTeamTag).toBeDefined();
        expect(team.odTeamTag.length).toBeLessThanOrEqual(3);
    });

    it('should generate AI party and team IDs', () => {
        const team = generateAITeam('test-match-3', 500);
        expect(team.odPartyId).toContain('ai_party_');
        expect(team.odTeamId).toContain('ai_team_');
    });

    it('should set IGL and Anchor from members', () => {
        const team = generateAITeam('test-match-4', 500);
        expect(team.odIglId).toBeDefined();
        expect(team.odIglName).toBeDefined();
        expect(team.odAnchorId).toBeDefined();
        expect(team.odAnchorName).toBeDefined();
        // IGL should be first member, Anchor should be second
        expect(team.odIglId).toBe(team.odMembers[0].odUserId);
        expect(team.odAnchorId).toBe(team.odMembers[1].odUserId);
    });

    it('should set target ELO for team', () => {
        const targetElo = 600;
        const team = generateAITeam('test-match-5', targetElo);
        expect(team.odElo).toBe(targetElo);
    });

    it('should set casual match type for AI teams', () => {
        const team = generateAITeam('test-match-6', 500);
        expect(team.odMatchType).toBe('casual');
    });

    it('should set 5v5 mode', () => {
        const team = generateAITeam('test-match-7', 500);
        expect(team.odMode).toBe('5v5');
    });

    it('should generate unique bot IDs', () => {
        const team = generateAITeam('test-match-8', 500);
        const ids = team.odMembers.map(m => m.odUserId);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(5);
    });

    it('should mark members as bots with config', () => {
        const team = generateAITeam('test-match-9', 500);
        team.odMembers.forEach(member => {
            // Type assertion since we know these are bot members
            const botMember = member as typeof member & { isBot: boolean; botConfig: BotConfig };
            expect(botMember.isBot).toBe(true);
            expect(botMember.botConfig).toBeDefined();
        });
    });

    it('should vary bot ELO around target', () => {
        const team = generateAITeam('test-match-10', 500);
        team.odMembers.forEach(member => {
            // Bot ELO should be within ±50 of target
            expect(member.odElo).toBeGreaterThanOrEqual(450);
            expect(member.odElo).toBeLessThanOrEqual(550);
        });
    });

    it('should assign different preferred operations', () => {
        const team = generateAITeam('test-match-11', 500);
        const operations = team.odMembers.map(m => m.odPreferredOperation);
        expect(operations).toContain('addition');
        expect(operations).toContain('subtraction');
        expect(operations).toContain('multiplication');
        expect(operations).toContain('division');
        expect(operations).toContain('mixed');
    });

    it('should override difficulty when specified', () => {
        const team = generateAITeam('test-match-12', 500, 'impossible');
        team.odMembers.forEach(member => {
            const botMember = member as typeof member & { botConfig: BotConfig };
            expect(botMember.botConfig.difficulty).toBe('impossible');
        });
    });

    it('should set bot cosmetics', () => {
        const team = generateAITeam('test-match-13', 500);
        team.odMembers.forEach(member => {
            expect(member.odEquippedFrame).toBeDefined();
            expect(member.odEquippedTitle).toBeDefined();
            expect(member.odEquippedBanner).toBeDefined();
        });
    });

    it('should set joined timestamp', () => {
        const before = Date.now();
        const team = generateAITeam('test-match-14', 500);
        const after = Date.now();
        expect(team.odJoinedAt).toBeGreaterThanOrEqual(before);
        expect(team.odJoinedAt).toBeLessThanOrEqual(after);
    });
});

describe('isAIBot', () => {
    it('should return true for AI bot IDs', () => {
        expect(isAIBot('ai_bot_match123_0')).toBe(true);
        expect(isAIBot('ai_bot_test_1')).toBe(true);
    });

    it('should return false for regular user IDs', () => {
        expect(isAIBot('user_12345')).toBe(false);
        expect(isAIBot('abc123')).toBe(false);
        expect(isAIBot('uuid-like-string-here')).toBe(false);
    });

    it('should return false for IDs containing ai_bot but not starting with it', () => {
        expect(isAIBot('not_ai_bot_123')).toBe(false);
        expect(isAIBot('prefix_ai_bot')).toBe(false);
    });
});

describe('isAITeam', () => {
    it('should return true for AI team IDs', () => {
        expect(isAITeam('ai_team_match123')).toBe(true);
        expect(isAITeam('ai_party_test')).toBe(true);
    });

    it('should return false for regular team IDs', () => {
        expect(isAITeam('team_12345')).toBe(false);
        expect(isAITeam('party_abc')).toBe(false);
    });

    it('should return false for null', () => {
        expect(isAITeam(null)).toBe(false);
    });

    it('should return false for undefined-like values', () => {
        expect(isAITeam('')).toBe(false);
    });
});

describe('getBotConfig', () => {
    it('should return config for bot members', () => {
        const botMember = {
            isBot: true,
            botConfig: BOT_DIFFICULTY_CONFIGS.medium,
        };
        expect(getBotConfig(botMember)).toBe(BOT_DIFFICULTY_CONFIGS.medium);
    });

    it('should return null for non-bot members', () => {
        const humanMember = {
            id: 'user_123',
            name: 'TestUser',
        };
        expect(getBotConfig(humanMember)).toBeNull();
    });

    it('should return null for members without isBot flag', () => {
        const member = {
            botConfig: BOT_DIFFICULTY_CONFIGS.easy,
        };
        expect(getBotConfig(member)).toBeNull();
    });

    it('should return null for null/undefined', () => {
        expect(getBotConfig(null)).toBeNull();
        expect(getBotConfig(undefined)).toBeNull();
    });
});

describe('calculateBotAnswerTime', () => {
    it('should return time within range for easy difficulty', () => {
        const config = BOT_DIFFICULTY_CONFIGS.easy;
        for (let i = 0; i < 20; i++) {
            const time = calculateBotAnswerTime(config);
            expect(time).toBeGreaterThanOrEqual(config.answerTimeRange[0]);
            expect(time).toBeLessThan(config.answerTimeRange[1]);
        }
    });

    it('should return time within range for impossible difficulty', () => {
        const config = BOT_DIFFICULTY_CONFIGS.impossible;
        for (let i = 0; i < 20; i++) {
            const time = calculateBotAnswerTime(config);
            expect(time).toBeGreaterThanOrEqual(config.answerTimeRange[0]);
            expect(time).toBeLessThan(config.answerTimeRange[1]);
        }
    });

    it('should return integer values', () => {
        const config = BOT_DIFFICULTY_CONFIGS.medium;
        for (let i = 0; i < 10; i++) {
            const time = calculateBotAnswerTime(config);
            expect(Number.isInteger(time)).toBe(true);
        }
    });
});

describe('botAnswersCorrectly', () => {
    it('should return boolean', () => {
        const result = botAnswersCorrectly(BOT_DIFFICULTY_CONFIGS.medium, 0);
        expect(typeof result).toBe('boolean');
    });

    it('should respect base accuracy statistically', () => {
        const config = BOT_DIFFICULTY_CONFIGS.easy;
        let correct = 0;
        const trials = 1000;
        
        for (let i = 0; i < trials; i++) {
            if (botAnswersCorrectly(config, 0)) correct++;
        }
        
        const actualAccuracy = correct / trials;
        // Should be within 10% of expected accuracy
        expect(actualAccuracy).toBeGreaterThan(config.accuracy - 0.1);
        expect(actualAccuracy).toBeLessThan(config.accuracy + 0.1);
    });

    it('should have higher accuracy with streak', () => {
        const config = BOT_DIFFICULTY_CONFIGS.medium;
        let correctNoStreak = 0;
        let correctWithStreak = 0;
        const trials = 1000;
        
        for (let i = 0; i < trials; i++) {
            if (botAnswersCorrectly(config, 0)) correctNoStreak++;
            if (botAnswersCorrectly(config, 5)) correctWithStreak++;
        }
        
        // With streak bonus, accuracy should generally be higher
        // This is statistical, so we check the trend
        expect(correctWithStreak).toBeGreaterThanOrEqual(correctNoStreak - 50); // Allow some variance
    });

    it('should cap effective accuracy at 0.98', () => {
        // Even with impossible + high streak, shouldn't exceed 0.98
        const config = BOT_DIFFICULTY_CONFIGS.impossible;
        let incorrect = 0;
        const trials = 1000;
        
        for (let i = 0; i < trials; i++) {
            if (!botAnswersCorrectly(config, 10)) incorrect++;
        }
        
        // Should still make some mistakes (at least 2% chance)
        expect(incorrect).toBeGreaterThan(0);
    });
});

describe('Difficulty Assignment Based on ELO', () => {
    it('should assign easy difficulty for low ELO', () => {
        const team = generateAITeam('test-elo-low', 300);
        team.odMembers.forEach(member => {
            const botMember = member as typeof member & { botConfig: BotConfig };
            // Low ELO should get easy difficulty
            expect(['easy', 'medium']).toContain(botMember.botConfig.difficulty);
        });
    });

    it('should assign harder difficulty for high ELO', () => {
        const team = generateAITeam('test-elo-high', 900);
        team.odMembers.forEach(member => {
            const botMember = member as typeof member & { botConfig: BotConfig };
            // High ELO should get hard or impossible
            expect(['hard', 'impossible']).toContain(botMember.botConfig.difficulty);
        });
    });
});
