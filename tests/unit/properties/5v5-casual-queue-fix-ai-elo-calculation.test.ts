/**
 * Property-Based Tests for Team ELO Calculation with AI Teammates
 * 
 * Feature: 5v5-casual-queue-fix
 * Property 5: Team ELO Calculation with AI
 * 
 * Validates: Requirements 2.3
 * For any team containing AI teammates, the team ELO calculation should 
 * include both human and AI teammate ELO values in the average
 */

import { describe, it, expect } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock data structures
interface TeamMember {
    userId: string;
    userName: string;
    elo: number;
    isAITeammate: boolean;
}

interface TeamELOCalculation {
    teamMembers: TeamMember[];
    humanELOSum: number;
    aiELOSum: number;
    totalELOSum: number;
    averageELO: number;
    humanCount: number;
    aiCount: number;
    totalCount: number;
}

// Simulate team ELO calculation including AI teammates
function calculateTeamELO(teamMembers: TeamMember[]): TeamELOCalculation {
    const humanMembers = teamMembers.filter(member => !member.isAITeammate);
    const aiMembers = teamMembers.filter(member => member.isAITeammate);
    
    const humanELOSum = humanMembers.reduce((sum, member) => sum + member.elo, 0);
    const aiELOSum = aiMembers.reduce((sum, member) => sum + member.elo, 0);
    const totalELOSum = humanELOSum + aiELOSum;
    
    const totalCount = teamMembers.length;
    const averageELO = totalCount > 0 ? Math.round(totalELOSum / totalCount) : 0;
    
    return {
        teamMembers,
        humanELOSum,
        aiELOSum,
        totalELOSum,
        averageELO,
        humanCount: humanMembers.length,
        aiCount: aiMembers.length,
        totalCount
    };
}

// Generate AI teammate with ELO based on human team average
function generateAITeammate(
    index: number,
    humanAverageELO: number,
    matchId: string = 'test_match'
): TeamMember {
    return {
        userId: `ai_teammate_${matchId}_${index}`,
        userName: `AIBot${index}`,
        elo: humanAverageELO + Math.floor(Math.random() * 50) - 25, // ±25 variance
        isAITeammate: true
    };
}

// Generate random human team member
function generateHumanMember(): TeamMember {
    return {
        userId: `human_${Math.random().toString(36).substring(7)}`,
        userName: `Player${Math.floor(Math.random() * 1000)}`,
        elo: Math.floor(Math.random() * 1500) + 500, // 500-2000 ELO
        isAITeammate: false
    };
}

// Create a mixed team with humans and AI teammates
function createMixedTeam(humanCount: number): TeamMember[] {
    const humans: TeamMember[] = [];
    
    // Generate human members
    for (let i = 0; i < humanCount; i++) {
        humans.push(generateHumanMember());
    }
    
    // Calculate human average for AI generation
    const humanAverageELO = humans.length > 0 
        ? Math.round(humans.reduce((sum, member) => sum + member.elo, 0) / humans.length)
        : 1000; // Default if no humans
    
    // Generate AI teammates to fill to 5 total
    const aiCount = 5 - humanCount;
    const aiTeammates: TeamMember[] = [];
    
    for (let i = 0; i < aiCount; i++) {
        aiTeammates.push(generateAITeammate(i, humanAverageELO));
    }
    
    return [...humans, ...aiTeammates];
}

describe('Property 5: Team ELO Calculation with AI', () => {
    it('should include both human and AI teammate ELO values in team average', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate team with 1-4 humans and AI teammates filling to 5
            const humanCount = Math.floor(Math.random() * 4) + 1; // 1-4 humans
            const team = createMixedTeam(humanCount);
            
            const calculation = calculateTeamELO(team);
            
            // **Validates Requirements 2.3**: Team ELO should include both human and AI ELO
            expect(calculation.totalCount).toBe(5);
            expect(calculation.humanCount).toBe(humanCount);
            expect(calculation.aiCount).toBe(5 - humanCount);
            
            // Total ELO sum should equal human ELO sum + AI ELO sum
            expect(calculation.totalELOSum).toBe(calculation.humanELOSum + calculation.aiELOSum);
            
            // Average should be calculated from all members (human + AI)
            const expectedAverage = Math.round(calculation.totalELOSum / 5);
            expect(calculation.averageELO).toBe(expectedAverage);
            
            // Verify individual ELO values are included
            let manualSum = 0;
            team.forEach(member => {
                manualSum += member.elo;
                expect(member.elo).toBeGreaterThan(0);
            });
            expect(calculation.totalELOSum).toBe(manualSum);
        }
    });

    it('should maintain accurate ELO calculations across different team compositions', () => {
        const compositions = [
            { humans: 1, ai: 4 },
            { humans: 2, ai: 3 },
            { humans: 3, ai: 2 },
            { humans: 4, ai: 1 }
        ];

        compositions.forEach(({ humans, ai }) => {
            for (let iteration = 0; iteration < 25; iteration++) { // 25 iterations per composition
                const team = createMixedTeam(humans);
                const calculation = calculateTeamELO(team);
                
                expect(calculation.humanCount).toBe(humans);
                expect(calculation.aiCount).toBe(ai);
                expect(calculation.totalCount).toBe(5);
                
                // Verify ELO calculation accuracy
                const humanMembers = team.filter(m => !m.isAITeammate);
                const aiMembers = team.filter(m => m.isAITeammate);
                
                const expectedHumanSum = humanMembers.reduce((sum, m) => sum + m.elo, 0);
                const expectedAISum = aiMembers.reduce((sum, m) => sum + m.elo, 0);
                
                expect(calculation.humanELOSum).toBe(expectedHumanSum);
                expect(calculation.aiELOSum).toBe(expectedAISum);
                
                // Team average should reflect the mixed composition
                const expectedTeamAverage = Math.round((expectedHumanSum + expectedAISum) / 5);
                expect(calculation.averageELO).toBe(expectedTeamAverage);
            }
        });
    });

    it('should handle edge cases in ELO calculation', () => {
        // Test with extreme ELO values
        const edgeCases = [
            // Very low ELO humans
            { humanELOs: [100], expectedAIRange: [75, 125] },
            // Very high ELO humans  
            { humanELOs: [2000], expectedAIRange: [1975, 2025] },
            // Mixed ELO humans
            { humanELOs: [500, 1500], expectedAIRange: [975, 1025] },
            // Three humans with varied ELO
            { humanELOs: [800, 1000, 1200], expectedAIRange: [975, 1025] }
        ];

        edgeCases.forEach(({ humanELOs, expectedAIRange }) => {
            // Create team with specific human ELOs
            const humans: TeamMember[] = humanELOs.map((elo, index) => ({
                userId: `human_${index}`,
                userName: `Player${index}`,
                elo,
                isAITeammate: false
            }));

            const humanAverage = Math.round(humanELOs.reduce((sum, elo) => sum + elo, 0) / humanELOs.length);
            
            // Generate AI teammates
            const aiCount = 5 - humans.length;
            const aiTeammates: TeamMember[] = [];
            for (let i = 0; i < aiCount; i++) {
                aiTeammates.push(generateAITeammate(i, humanAverage));
            }

            const team = [...humans, ...aiTeammates];
            const calculation = calculateTeamELO(team);

            // Verify calculation includes all members
            expect(calculation.totalCount).toBe(5);
            expect(calculation.humanCount).toBe(humans.length);
            expect(calculation.aiCount).toBe(aiCount);

            // Verify AI ELO values are within expected range
            aiTeammates.forEach(ai => {
                expect(ai.elo).toBeGreaterThanOrEqual(expectedAIRange[0]);
                expect(ai.elo).toBeLessThanOrEqual(expectedAIRange[1]);
            });

            // Verify total calculation accuracy
            const expectedTotal = humans.reduce((sum, h) => sum + h.elo, 0) + 
                                aiTeammates.reduce((sum, ai) => sum + ai.elo, 0);
            expect(calculation.totalELOSum).toBe(expectedTotal);
        });
    });

    it('should maintain calculation consistency when AI ELO varies within acceptable range', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Create team with known human ELOs
            const humanELOs = [1000, 1100, 1200]; // 3 humans with average 1100
            const humans: TeamMember[] = humanELOs.map((elo, index) => ({
                userId: `human_${index}`,
                userName: `Player${index}`,
                elo,
                isAITeammate: false
            }));

            const humanAverage = 1100;
            
            // Generate AI teammates with variance
            const aiTeammates: TeamMember[] = [];
            for (let i = 0; i < 2; i++) {
                aiTeammates.push(generateAITeammate(i, humanAverage));
            }

            const team = [...humans, ...aiTeammates];
            const calculation = calculateTeamELO(team);

            // Human ELO sum should be consistent
            expect(calculation.humanELOSum).toBe(3300); // 1000 + 1100 + 1200

            // AI ELO should be within acceptable variance
            aiTeammates.forEach(ai => {
                expect(ai.elo).toBeGreaterThanOrEqual(1075); // humanAverage - 25
                expect(ai.elo).toBeLessThanOrEqual(1125); // humanAverage + 25
            });

            // Total team average should be reasonable
            expect(calculation.averageELO).toBeGreaterThanOrEqual(1075);
            expect(calculation.averageELO).toBeLessThanOrEqual(1125);

            // Calculation should be mathematically correct
            const expectedAverage = Math.round(calculation.totalELOSum / 5);
            expect(calculation.averageELO).toBe(expectedAverage);
        }
    });

    it('should handle teams with only AI teammates (edge case)', () => {
        // This shouldn't happen in normal gameplay, but test the calculation logic
        const baseELO = 1000;
        const aiOnlyTeam: TeamMember[] = [];
        
        for (let i = 0; i < 5; i++) {
            aiOnlyTeam.push({
                userId: `ai_${i}`,
                userName: `AIBot${i}`,
                elo: baseELO + Math.floor(Math.random() * 50) - 25,
                isAITeammate: true
            });
        }

        const calculation = calculateTeamELO(aiOnlyTeam);

        expect(calculation.humanCount).toBe(0);
        expect(calculation.aiCount).toBe(5);
        expect(calculation.totalCount).toBe(5);
        expect(calculation.humanELOSum).toBe(0);
        expect(calculation.aiELOSum).toBeGreaterThan(0);
        expect(calculation.totalELOSum).toBe(calculation.aiELOSum);

        // Average should be calculated correctly
        const expectedAverage = Math.round(calculation.aiELOSum / 5);
        expect(calculation.averageELO).toBe(expectedAverage);
    });

    it('should handle teams with no AI teammates (full human team)', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const humanOnlyTeam: TeamMember[] = [];
            
            for (let i = 0; i < 5; i++) {
                humanOnlyTeam.push(generateHumanMember());
            }

            const calculation = calculateTeamELO(humanOnlyTeam);

            expect(calculation.humanCount).toBe(5);
            expect(calculation.aiCount).toBe(0);
            expect(calculation.totalCount).toBe(5);
            expect(calculation.aiELOSum).toBe(0);
            expect(calculation.humanELOSum).toBeGreaterThan(0);
            expect(calculation.totalELOSum).toBe(calculation.humanELOSum);

            // Average should be calculated from human ELOs only
            const expectedAverage = Math.round(calculation.humanELOSum / 5);
            expect(calculation.averageELO).toBe(expectedAverage);

            // Verify all members are human
            humanOnlyTeam.forEach(member => {
                expect(member.isAITeammate).toBe(false);
            });
        }
    });

    it('should maintain mathematical precision in ELO calculations', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const team = createMixedTeam(Math.floor(Math.random() * 4) + 1);
            const calculation = calculateTeamELO(team);

            // Verify no floating point errors
            expect(Number.isInteger(calculation.humanELOSum)).toBe(true);
            expect(Number.isInteger(calculation.aiELOSum)).toBe(true);
            expect(Number.isInteger(calculation.totalELOSum)).toBe(true);
            expect(Number.isInteger(calculation.averageELO)).toBe(true);

            // Verify calculation consistency
            const manualTotal = team.reduce((sum, member) => sum + member.elo, 0);
            expect(calculation.totalELOSum).toBe(manualTotal);

            const manualAverage = Math.round(manualTotal / team.length);
            expect(calculation.averageELO).toBe(manualAverage);

            // Verify counts add up
            expect(calculation.humanCount + calculation.aiCount).toBe(calculation.totalCount);
            expect(calculation.totalCount).toBe(team.length);
        }
    });
});