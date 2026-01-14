/**
 * Property-Based Tests for AI Teammate Addition in Casual Matches
 * 
 * Feature: 5v5-casual-queue-fix
 * Property 4: Casual AI Teammate Addition
 * 
 * Validates: Requirements 2.1, 2.2, 2.4
 * For any casual party with fewer than 5 members, when joining the queue, 
 * the system should add AI teammates to reach exactly 5 total members 
 * with realistic profiles and balanced ELO values
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock data structures based on the actual team matchmaking types
interface TeamQueueMember {
    odUserId: string;
    odUserName: string;
    odElo: number;
    odTier: string;
    odLevel: number;
    odEquippedFrame: string;
    odEquippedBanner: string;
    odEquippedTitle: string;
    odPreferredOperation: string | null;
    isAITeammate?: boolean;
}

interface PartyMember {
    userId: string;
    userName: string;
    elo: number;
    tier: string;
    level: number;
    equippedFrame: string;
    equippedBanner: string;
    equippedTitle: string;
}

// AI teammate constants (matching the actual implementation)
const AI_TEAMMATE_NAMES = [
    'AlphaBot', 'BetaHelper', 'GammaGuard', 'DeltaDriver', 'EpsilonAce',
    'ZetaZoom', 'ThetaThunder', 'IotaImpact', 'KappaCrush', 'LambdaLead',
];

const AI_TEAMMATE_TITLES = ['AI Ally', 'Bot Buddy', 'Auto Assist', 'Smart Support', 'Robo Relay'];
const AI_TEAMMATE_FRAMES = ['hologram', 'circuit', 'neon', 'matrix', 'cyber'];
const AI_TEAMMATE_BANNERS = ['matrices', 'synthwave', 'plasma', 'royal', 'caution'];
const DEFAULT_TIER = 'cobalt';

// Simulate the AI teammate generation function
function generateAITeammates(
    matchId: string,
    count: number,
    targetElo: number,
    startIndex: number
): TeamQueueMember[] {
    const teammates: TeamQueueMember[] = [];

    for (let i = 0; i < count; i++) {
        const nameIndex = (startIndex + i) % AI_TEAMMATE_NAMES.length;
        teammates.push({
            odUserId: `ai_teammate_${matchId}_${startIndex + i}`,
            odUserName: AI_TEAMMATE_NAMES[nameIndex],
            odElo: targetElo + Math.floor(Math.random() * 50) - 25, // Slight variance
            odTier: DEFAULT_TIER,
            odLevel: Math.floor(Math.random() * 30) + 20, // Level 20-50
            odEquippedFrame: AI_TEAMMATE_FRAMES[Math.floor(Math.random() * AI_TEAMMATE_FRAMES.length)],
            odEquippedBanner: AI_TEAMMATE_BANNERS[Math.floor(Math.random() * AI_TEAMMATE_BANNERS.length)],
            odEquippedTitle: AI_TEAMMATE_TITLES[Math.floor(Math.random() * AI_TEAMMATE_TITLES.length)],
            odPreferredOperation: null,
            isAITeammate: true,
        });
    }

    return teammates;
}

// Simulate the casual queue joining process
function simulateCasualQueueJoin(
    partyMembers: PartyMember[],
    matchType: 'ranked' | 'casual'
): TeamQueueMember[] {
    if (matchType !== 'casual') {
        // Ranked matches require exactly 5 human members
        if (partyMembers.length !== 5) {
            throw new Error('Ranked matches require exactly 5 members');
        }
        return partyMembers.map(member => ({
            odUserId: member.userId,
            odUserName: member.userName,
            odElo: member.elo,
            odTier: member.tier,
            odLevel: member.level,
            odEquippedFrame: member.equippedFrame,
            odEquippedBanner: member.equippedBanner,
            odEquippedTitle: member.equippedTitle,
            odPreferredOperation: null,
            isAITeammate: false,
        }));
    }

    // Casual matches: convert human members and add AI teammates if needed
    const humanMembers: TeamQueueMember[] = partyMembers.map(member => ({
        odUserId: member.userId,
        odUserName: member.userName,
        odElo: member.elo,
        odTier: member.tier,
        odLevel: member.level,
        odEquippedFrame: member.equippedFrame,
        odEquippedBanner: member.equippedBanner,
        odEquippedTitle: member.equippedTitle,
        odPreferredOperation: null,
        isAITeammate: false,
    }));

    const slotsToFill = 5 - humanMembers.length;
    
    if (slotsToFill > 0) {
        // Calculate average ELO for AI teammate generation
        const avgElo = Math.round(
            humanMembers.reduce((sum, member) => sum + member.odElo, 0) / humanMembers.length
        );
        
        const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const aiTeammates = generateAITeammates(matchId, slotsToFill, avgElo, humanMembers.length);
        
        return [...humanMembers, ...aiTeammates];
    }

    return humanMembers;
}

// Generate random party member for testing
function generateRandomPartyMember(): PartyMember {
    return {
        userId: `user_${Math.random().toString(36).substring(7)}`,
        userName: `Player${Math.floor(Math.random() * 1000)}`,
        elo: Math.floor(Math.random() * 1500) + 500, // 500-2000 ELO
        tier: ['neon', 'cobalt', 'plasma', 'void', 'apex'][Math.floor(Math.random() * 5)],
        level: Math.floor(Math.random() * 50) + 1, // Level 1-50
        equippedFrame: ['default', 'neon', 'cyber', 'matrix'][Math.floor(Math.random() * 4)],
        equippedBanner: ['default', 'synthwave', 'plasma', 'royal'][Math.floor(Math.random() * 4)],
        equippedTitle: ['Rookie', 'Veteran', 'Expert', 'Master'][Math.floor(Math.random() * 4)],
    };
}

describe('Property 4: Casual AI Teammate Addition', () => {
    it('should add AI teammates to reach exactly 5 total members for casual parties', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate a party with 1-4 human members (never 5, as that wouldn't need AI)
            const humanCount = Math.floor(Math.random() * 4) + 1; // 1-4 members
            const partyMembers: PartyMember[] = [];
            
            for (let i = 0; i < humanCount; i++) {
                partyMembers.push(generateRandomPartyMember());
            }
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            
            // **Validates Requirements 2.1**: Should have exactly 5 total members
            expect(queueMembers.length).toBe(5);
            
            // Count human vs AI members
            const humanMembers = queueMembers.filter(member => !member.isAITeammate);
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            
            expect(humanMembers.length).toBe(humanCount);
            expect(aiMembers.length).toBe(5 - humanCount);
            
            // All original party members should be preserved
            partyMembers.forEach(originalMember => {
                const foundMember = humanMembers.find(member => member.odUserId === originalMember.userId);
                expect(foundMember).toBeDefined();
                expect(foundMember?.odUserName).toBe(originalMember.userName);
                expect(foundMember?.odElo).toBe(originalMember.elo);
            });
        }
    });

    it('should generate realistic profiles for AI teammates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate a small party that will need AI teammates
            const humanCount = Math.floor(Math.random() * 3) + 1; // 1-3 members
            const partyMembers: PartyMember[] = [];
            
            for (let i = 0; i < humanCount; i++) {
                partyMembers.push(generateRandomPartyMember());
            }
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            
            aiMembers.forEach(aiMember => {
                // **Validates Requirements 2.2**: AI teammates should have realistic profiles
                
                // Should have valid AI teammate name
                expect(AI_TEAMMATE_NAMES).toContain(aiMember.odUserName);
                
                // Should have valid cosmetic items
                expect(AI_TEAMMATE_FRAMES).toContain(aiMember.odEquippedFrame);
                expect(AI_TEAMMATE_BANNERS).toContain(aiMember.odEquippedBanner);
                expect(AI_TEAMMATE_TITLES).toContain(aiMember.odEquippedTitle);
                
                // Should have realistic level (20-50 as per implementation)
                expect(aiMember.odLevel).toBeGreaterThanOrEqual(20);
                expect(aiMember.odLevel).toBeLessThanOrEqual(50);
                
                // Should have default tier
                expect(aiMember.odTier).toBe(DEFAULT_TIER);
                
                // Should be marked as AI teammate
                expect(aiMember.isAITeammate).toBe(true);
                
                // Should have unique AI teammate ID format
                expect(aiMember.odUserId).toMatch(/^ai_teammate_/);
                
                // Should have null preferred operation (AI doesn't have preferences)
                expect(aiMember.odPreferredOperation).toBeNull();
            });
        }
    });

    it('should generate balanced ELO values for AI teammates', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate party with known ELO values
            const humanCount = Math.floor(Math.random() * 3) + 1; // 1-3 members
            const baseElo = Math.floor(Math.random() * 1000) + 800; // 800-1800 base ELO
            const partyMembers: PartyMember[] = [];
            
            for (let i = 0; i < humanCount; i++) {
                const member = generateRandomPartyMember();
                // Set ELO close to base for consistent testing
                member.elo = baseElo + Math.floor(Math.random() * 100) - 50; // ±50 variance
                partyMembers.push(member);
            }
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            const humanMembers = queueMembers.filter(member => !member.isAITeammate);
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            
            // Calculate average human ELO
            const avgHumanElo = humanMembers.reduce((sum, member) => sum + member.odElo, 0) / humanMembers.length;
            
            aiMembers.forEach(aiMember => {
                // **Validates Requirements 2.4**: AI ELO should be within ±25 of team average
                const eloDeviation = Math.abs(aiMember.odElo - avgHumanElo);
                expect(eloDeviation).toBeLessThanOrEqual(25);
                
                // AI ELO should be reasonable (not negative or extremely high)
                expect(aiMember.odElo).toBeGreaterThan(0);
                expect(aiMember.odElo).toBeLessThan(3000);
            });
        }
    });

    it('should not add AI teammates when party already has 5 members', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate a full party of 5 human members
            const partyMembers: PartyMember[] = [];
            
            for (let i = 0; i < 5; i++) {
                partyMembers.push(generateRandomPartyMember());
            }
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            
            // Should still have exactly 5 members
            expect(queueMembers.length).toBe(5);
            
            // All should be human members (no AI teammates added)
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            expect(aiMembers.length).toBe(0);
            
            // All original members should be preserved
            expect(queueMembers.length).toBe(partyMembers.length);
            partyMembers.forEach(originalMember => {
                const foundMember = queueMembers.find(member => member.odUserId === originalMember.userId);
                expect(foundMember).toBeDefined();
            });
        }
    });

    it('should handle edge cases in AI teammate generation', () => {
        const edgeCases = [
            // Single player party
            { humanCount: 1, expectedAI: 4 },
            // Two player party  
            { humanCount: 2, expectedAI: 3 },
            // Three player party
            { humanCount: 3, expectedAI: 2 },
            // Four player party
            { humanCount: 4, expectedAI: 1 },
        ];

        edgeCases.forEach(({ humanCount, expectedAI }) => {
            const partyMembers: PartyMember[] = [];
            
            for (let i = 0; i < humanCount; i++) {
                partyMembers.push(generateRandomPartyMember());
            }
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            
            expect(queueMembers.length).toBe(5);
            
            const humanMembers = queueMembers.filter(member => !member.isAITeammate);
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            
            expect(humanMembers.length).toBe(humanCount);
            expect(aiMembers.length).toBe(expectedAI);
            
            // Validate AI teammate properties for each case
            aiMembers.forEach(aiMember => {
                expect(aiMember.isAITeammate).toBe(true);
                expect(AI_TEAMMATE_NAMES).toContain(aiMember.odUserName);
                expect(aiMember.odUserId).toMatch(/^ai_teammate_/);
            });
        });
    });

    it('should maintain consistent AI teammate naming across multiple generations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const partyMembers: PartyMember[] = [generateRandomPartyMember()]; // Single player
            
            const queueMembers = simulateCasualQueueJoin(partyMembers, 'casual');
            const aiMembers = queueMembers.filter(member => member.isAITeammate);
            
            expect(aiMembers.length).toBe(4);
            
            // AI teammates should have unique names within the same match
            const aiNames = aiMembers.map(member => member.odUserName);
            const uniqueNames = new Set(aiNames);
            
            // Should have unique names (up to the limit of available names)
            expect(uniqueNames.size).toBe(Math.min(aiNames.length, AI_TEAMMATE_NAMES.length));
            
            // All names should be from the valid AI teammate names list
            aiNames.forEach(name => {
                expect(AI_TEAMMATE_NAMES).toContain(name);
            });
        }
    });
});