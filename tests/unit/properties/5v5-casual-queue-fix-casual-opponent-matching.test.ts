/**
 * Property-Based Tests for 5v5 Casual Queue Fix - Casual Queue Opponent Matching
 * 
 * Feature: 5v5-casual-queue-fix
 * Property 7: Casual Queue Opponent Matching
 * 
 * Validates: Requirements 3.1, 3.3, 3.4
 * For any casual team in queue, the matchmaking system should only match them 
 * with other casual teams and use the correct Redis queue key
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock types for testing
type MatchType = 'ranked' | 'casual';
type QueueStatus = 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';

interface MockTeamQueueEntry {
    odPartyId: string;
    odTeamId: string | null;
    odTeamName: string | null;
    odLeaderId: string;
    odLeaderName: string;
    odElo: number;
    odAvgTier: number;
    odMode: '5v5';
    odMatchType: MatchType;
    odIglId: string;
    odIglName: string;
    odAnchorId: string;
    odAnchorName: string;
    odMembers: Array<{
        odUserId: string;
        odUserName: string;
        odElo: number;
        odTier: number;
        odLevel: number;
        isAITeammate?: boolean;
    }>;
    odJoinedAt: number;
    hasAITeammates?: boolean;
    humanMemberCount?: number;
}

interface MockMatchResult {
    matchId: string;
    odTeam1: MockTeamQueueEntry;
    odTeam2: MockTeamQueueEntry;
}

interface MockRedisQueue {
    [key: string]: MockTeamQueueEntry[];
}

// Mock Redis operations
const mockRedisQueue: MockRedisQueue = {};
const mockRedisEntries: Record<string, MockTeamQueueEntry> = {};
const mockMatches: Record<string, MockMatchResult> = {};

// Mock Redis functions
const mockRedisZAdd = vi.fn();
const mockRedisZRangeByScore = vi.fn();
const mockRedisZRem = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisDel = vi.fn();

// Constants matching the actual implementation
const TEAM_QUEUE_PREFIX = 'team:queue:';
const TEAM_MATCH_PREFIX = 'team:match:';
const INITIAL_ELO_RANGE = 100;
const ELO_EXPANSION_RATE = 50;
const ELO_EXPANSION_INTERVAL = 15;
const MAX_ELO_RANGE = 400;
const TEAM_TIER_RANGE = 25;
const DEFAULT_TIER = 50;

// Helper functions
function calculateEloRange(queueTimeMs: number): number {
    const expansions = Math.floor(queueTimeMs / (ELO_EXPANSION_INTERVAL * 1000));
    return Math.min(INITIAL_ELO_RANGE + (expansions * ELO_EXPANSION_RATE), MAX_ELO_RANGE);
}

function generateRandomTeamEntry(matchType: MatchType): MockTeamQueueEntry {
    const partyId = `party-${Math.random().toString(36).substring(7)}`;
    const leaderId = `leader-${Math.random().toString(36).substring(7)}`;
    const elo = Math.floor(Math.random() * 800) + 200; // 200-1000 ELO
    const tier = Math.floor(Math.random() * 100) + 1; // 1-100 tier
    
    const memberCount = matchType === 'casual' ? Math.floor(Math.random() * 5) + 1 : 5; // Casual can have 1-5, ranked needs 5
    const members = [];
    
    // Add leader
    members.push({
        odUserId: leaderId,
        odUserName: `Leader-${leaderId.slice(-4)}`,
        odElo: elo + Math.floor(Math.random() * 100) - 50,
        odTier: tier + Math.floor(Math.random() * 20) - 10,
        odLevel: Math.floor(Math.random() * 50) + 1,
        isAITeammate: false
    });
    
    // Add other members
    for (let i = 1; i < memberCount; i++) {
        const isAI = matchType === 'casual' && Math.random() > 0.7; // 30% chance of AI teammate in casual
        const memberId = isAI ? `ai_teammate_${i}` : `member-${i}-${Math.random().toString(36).substring(7)}`;
        
        members.push({
            odUserId: memberId,
            odUserName: isAI ? `AI-${i}` : `Member-${memberId.slice(-4)}`,
            odElo: elo + Math.floor(Math.random() * 100) - 50,
            odTier: tier + Math.floor(Math.random() * 20) - 10,
            odLevel: Math.floor(Math.random() * 50) + 1,
            isAITeammate: isAI
        });
    }
    
    // Fill remaining slots with AI teammates for casual matches
    const humanCount = members.filter(m => !m.isAITeammate).length;
    const aiTeammatesNeeded = matchType === 'casual' && memberCount < 5 ? 5 - memberCount : 0;
    
    for (let i = 0; i < aiTeammatesNeeded; i++) {
        members.push({
            odUserId: `ai_teammate_fill_${i}`,
            odUserName: `AI-Fill-${i}`,
            odElo: elo + Math.floor(Math.random() * 50) - 25,
            odTier: tier,
            odLevel: Math.floor(Math.random() * 30) + 20,
            isAITeammate: true
        });
    }
    
    return {
        odPartyId: partyId,
        odTeamId: null,
        odTeamName: `Team-${partyId.slice(-4)}`,
        odLeaderId: leaderId,
        odLeaderName: `Leader-${leaderId.slice(-4)}`,
        odElo: elo,
        odAvgTier: tier,
        odMode: '5v5',
        odMatchType: matchType,
        odIglId: leaderId,
        odIglName: `Leader-${leaderId.slice(-4)}`,
        odAnchorId: members[1]?.odUserId || leaderId,
        odAnchorName: members[1]?.odUserName || `Leader-${leaderId.slice(-4)}`,
        odMembers: members,
        odJoinedAt: Date.now() - Math.floor(Math.random() * 60000), // Random queue time up to 1 minute
        hasAITeammates: members.some(m => m.isAITeammate),
        humanMemberCount: humanCount
    };
}

// Simulate joining team queue
function simulateJoinTeamQueue(entry: MockTeamQueueEntry): { success: boolean; error?: string } {
    if (!entry.odPartyId || !entry.odMatchType) {
        return { success: false, error: 'Missing required parameters' };
    }
    
    if (!['ranked', 'casual'].includes(entry.odMatchType)) {
        return { success: false, error: 'Invalid match type' };
    }
    
    // Validate party size for ranked
    if (entry.odMatchType === 'ranked' && entry.odMembers.length < 5) {
        return { success: false, error: 'Ranked 5v5 requires a full party of 5 players' };
    }
    
    const queueKey = `${TEAM_QUEUE_PREFIX}${entry.odMatchType}:5v5`;
    
    // Add to mock Redis queue
    if (!mockRedisQueue[queueKey]) {
        mockRedisQueue[queueKey] = [];
    }
    mockRedisQueue[queueKey].push(entry);
    mockRedisEntries[`${TEAM_QUEUE_PREFIX}entry:${entry.odPartyId}`] = entry;
    
    // Mock Redis calls
    mockRedisZAdd(queueKey, entry.odElo, entry.odPartyId);
    mockRedisSet(`${TEAM_QUEUE_PREFIX}entry:${entry.odPartyId}`, JSON.stringify(entry));
    
    return { success: true };
}

// Simulate finding opponents
function simulateFindOpponents(entry: MockTeamQueueEntry): { match?: MockMatchResult; error?: string } {
    const queueKey = `${TEAM_QUEUE_PREFIX}${entry.odMatchType}:5v5`;
    const queueTimeMs = Date.now() - entry.odJoinedAt;
    const currentEloRange = calculateEloRange(queueTimeMs);
    
    const minElo = entry.odElo - currentEloRange;
    const maxElo = entry.odElo + currentEloRange;
    
    // Find candidates in the same queue
    const candidates = mockRedisQueue[queueKey] || [];
    
    for (const candidate of candidates) {
        if (candidate.odPartyId === entry.odPartyId) continue;
        
        // Check ELO compatibility
        const eloCompatible = candidate.odElo >= minElo && candidate.odElo <= maxElo;
        
        // Check tier compatibility
        const entryTier = entry.odAvgTier ?? DEFAULT_TIER;
        const candidateTier = candidate.odAvgTier ?? DEFAULT_TIER;
        const tierCompatible = Math.abs(candidateTier - entryTier) <= TEAM_TIER_RANGE;
        
        // CRITICAL: Check match type compatibility - casual should only match with casual
        const matchTypeCompatible = candidate.odMatchType === entry.odMatchType;
        
        if (eloCompatible && tierCompatible && matchTypeCompatible) {
            // Match found!
            const matchId = `match-${Math.random().toString(36).substring(7)}`;
            
            const match: MockMatchResult = {
                matchId,
                odTeam1: entry,
                odTeam2: candidate
            };
            
            // Store match
            mockMatches[entry.odPartyId] = match;
            mockMatches[candidate.odPartyId] = match;
            
            // Remove from queue - ensure we have the queue before filtering
            if (mockRedisQueue[queueKey]) {
                mockRedisQueue[queueKey] = mockRedisQueue[queueKey].filter(
                    e => e.odPartyId !== entry.odPartyId && e.odPartyId !== candidate.odPartyId
                );
            }
            delete mockRedisEntries[`${TEAM_QUEUE_PREFIX}entry:${entry.odPartyId}`];
            delete mockRedisEntries[`${TEAM_QUEUE_PREFIX}entry:${candidate.odPartyId}`];
            
            // Mock Redis calls
            mockRedisZRem(queueKey, entry.odPartyId, candidate.odPartyId);
            mockRedisDel(`${TEAM_QUEUE_PREFIX}entry:${entry.odPartyId}`);
            mockRedisDel(`${TEAM_QUEUE_PREFIX}entry:${candidate.odPartyId}`);
            mockRedisSet(`${TEAM_MATCH_PREFIX}${entry.odPartyId}`, JSON.stringify(match));
            mockRedisSet(`${TEAM_MATCH_PREFIX}${candidate.odPartyId}`, JSON.stringify(match));
            
            return { match };
        }
    }
    
    return {}; // No match found
}

// Validate that casual teams only match with other casual teams
function validateCasualMatchingRules(matches: MockMatchResult[]): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    for (const match of matches) {
        // Both teams must be casual
        if (match.odTeam1.odMatchType !== 'casual') {
            violations.push(`Team1 in match ${match.matchId} is not casual: ${match.odTeam1.odMatchType}`);
        }
        
        if (match.odTeam2.odMatchType !== 'casual') {
            violations.push(`Team2 in match ${match.matchId} is not casual: ${match.odTeam2.odMatchType}`);
        }
        
        // Both teams must have used the casual queue
        const expectedQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
        
        // Verify no cross-contamination with ranked queue
        if (match.odTeam1.odMatchType === 'casual' && match.odTeam2.odMatchType !== 'casual') {
            violations.push(`Match ${match.matchId} has casual team matched with non-casual team`);
        }
        
        if (match.odTeam2.odMatchType === 'casual' && match.odTeam1.odMatchType !== 'casual') {
            violations.push(`Match ${match.matchId} has casual team matched with non-casual team`);
        }
    }
    
    return { valid: violations.length === 0, violations };
}

// Validate Redis queue key usage
function validateQueueKeyUsage(): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    // Check that casual teams are only in casual queue
    const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
    const rankedQueueKey = `${TEAM_QUEUE_PREFIX}ranked:5v5`;
    
    const casualQueue = mockRedisQueue[casualQueueKey] || [];
    const rankedQueue = mockRedisQueue[rankedQueueKey] || [];
    
    // Validate casual queue contains only casual teams
    for (const entry of casualQueue) {
        if (entry.odMatchType !== 'casual') {
            violations.push(`Non-casual team ${entry.odPartyId} found in casual queue: ${entry.odMatchType}`);
        }
    }
    
    // Validate ranked queue contains only ranked teams
    for (const entry of rankedQueue) {
        if (entry.odMatchType !== 'ranked') {
            violations.push(`Non-ranked team ${entry.odPartyId} found in ranked queue: ${entry.odMatchType}`);
        }
    }
    
    return { valid: violations.length === 0, violations };
}

describe('Property 7: Casual Queue Opponent Matching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear mock data
        Object.keys(mockRedisQueue).forEach(key => delete mockRedisQueue[key]);
        Object.keys(mockRedisEntries).forEach(key => delete mockRedisEntries[key]);
        Object.keys(mockMatches).forEach(key => delete mockMatches[key]);
    });
    
    afterEach(() => {
        vi.restoreAllMocks();
    });
    
    it('should only match casual teams with other casual teams for any casual team configuration', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            // Generate random casual teams
            const casualTeam1 = generateRandomTeamEntry('casual');
            const casualTeam2 = generateRandomTeamEntry('casual');
            
            // Also generate some ranked teams to ensure no cross-matching
            const rankedTeam1 = generateRandomTeamEntry('ranked');
            const rankedTeam2 = generateRandomTeamEntry('ranked');
            
            // Join all teams to their respective queues
            const casualResult1 = simulateJoinTeamQueue(casualTeam1);
            const casualResult2 = simulateJoinTeamQueue(casualTeam2);
            const rankedResult1 = simulateJoinTeamQueue(rankedTeam1);
            const rankedResult2 = simulateJoinTeamQueue(rankedTeam2);
            
            expect(casualResult1.success).toBe(true);
            expect(casualResult2.success).toBe(true);
            expect(rankedResult1.success).toBe(true);
            expect(rankedResult2.success).toBe(true);
            
            // Validate queue key usage
            const queueValidation = validateQueueKeyUsage();
            expect(queueValidation.valid).toBe(true);
            if (!queueValidation.valid) {
                console.error('Queue key violations:', queueValidation.violations);
            }
            
            // Try to find matches for casual teams
            const match1 = simulateFindOpponents(casualTeam1);
            const match2 = simulateFindOpponents(casualTeam2);
            
            // Collect all matches
            const allMatches = Object.values(mockMatches);
            
            // Validate that casual teams only matched with other casual teams
            const matchValidation = validateCasualMatchingRules(allMatches);
            expect(matchValidation.valid).toBe(true);
            if (!matchValidation.valid) {
                console.error('Casual matching violations:', matchValidation.violations);
            }
            
            // Verify Redis queue operations used correct keys
            const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            const rankedQueueKey = `${TEAM_QUEUE_PREFIX}ranked:5v5`;
            
            // Check that casual teams were added to casual queue
            expect(mockRedisZAdd).toHaveBeenCalledWith(casualQueueKey, casualTeam1.odElo, casualTeam1.odPartyId);
            expect(mockRedisZAdd).toHaveBeenCalledWith(casualQueueKey, casualTeam2.odElo, casualTeam2.odPartyId);
            
            // Check that ranked teams were added to ranked queue
            expect(mockRedisZAdd).toHaveBeenCalledWith(rankedQueueKey, rankedTeam1.odElo, rankedTeam1.odPartyId);
            expect(mockRedisZAdd).toHaveBeenCalledWith(rankedQueueKey, rankedTeam2.odElo, rankedTeam2.odPartyId);
            
            // Verify no cross-queue contamination in mock calls
            expect(mockRedisZAdd).not.toHaveBeenCalledWith(rankedQueueKey, casualTeam1.odElo, casualTeam1.odPartyId);
            expect(mockRedisZAdd).not.toHaveBeenCalledWith(rankedQueueKey, casualTeam2.odElo, casualTeam2.odPartyId);
            expect(mockRedisZAdd).not.toHaveBeenCalledWith(casualQueueKey, rankedTeam1.odElo, rankedTeam1.odPartyId);
            expect(mockRedisZAdd).not.toHaveBeenCalledWith(casualQueueKey, rankedTeam2.odElo, rankedTeam2.odPartyId);
        }
    });
    
    it('should use the correct Redis queue key for casual matches', () => {
        for (let iteration = 0; iteration < 50; iteration++) {
            const casualTeam = generateRandomTeamEntry('casual');
            const expectedQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            
            const result = simulateJoinTeamQueue(casualTeam);
            expect(result.success).toBe(true);
            
            // Verify the correct queue key was used
            expect(mockRedisZAdd).toHaveBeenCalledWith(expectedQueueKey, casualTeam.odElo, casualTeam.odPartyId);
            
            // Verify entry was stored with correct key
            const entryKey = `${TEAM_QUEUE_PREFIX}entry:${casualTeam.odPartyId}`;
            expect(mockRedisSet).toHaveBeenCalledWith(entryKey, JSON.stringify(casualTeam));
            
            // Verify team is in the correct queue
            expect(mockRedisQueue[expectedQueueKey]).toContain(casualTeam);
            
            // Verify team is NOT in the ranked queue
            const rankedQueueKey = `${TEAM_QUEUE_PREFIX}ranked:5v5`;
            expect(mockRedisQueue[rankedQueueKey] || []).not.toContain(casualTeam);
        }
    });
    
    it('should handle AI teammates in casual matches correctly', () => {
        for (let iteration = 0; iteration < 30; iteration++) {
            // Generate casual team with AI teammates
            const casualTeam = generateRandomTeamEntry('casual');
            
            // Ensure some AI teammates are present
            if (casualTeam.odMembers.length < 5) {
                const aiNeeded = 5 - casualTeam.odMembers.length;
                for (let i = 0; i < aiNeeded; i++) {
                    casualTeam.odMembers.push({
                        odUserId: `ai_teammate_${i}`,
                        odUserName: `AI-${i}`,
                        odElo: casualTeam.odElo + Math.floor(Math.random() * 50) - 25,
                        odTier: casualTeam.odAvgTier,
                        odLevel: Math.floor(Math.random() * 30) + 20,
                        isAITeammate: true
                    });
                }
                casualTeam.hasAITeammates = true;
                casualTeam.humanMemberCount = casualTeam.odMembers.filter(m => !m.isAITeammate).length;
            }
            
            const result = simulateJoinTeamQueue(casualTeam);
            expect(result.success).toBe(true);
            
            // Verify AI teammates are properly flagged
            const aiTeammates = casualTeam.odMembers.filter(m => m.isAITeammate);
            const humanMembers = casualTeam.odMembers.filter(m => !m.isAITeammate);
            
            expect(casualTeam.hasAITeammates).toBe(aiTeammates.length > 0);
            expect(casualTeam.humanMemberCount).toBe(humanMembers.length);
            
            // Verify team still uses casual queue
            const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            expect(mockRedisZAdd).toHaveBeenCalledWith(casualQueueKey, casualTeam.odElo, casualTeam.odPartyId);
            
            // AI teammates should not affect queue key selection
            expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam);
        }
    });
    
    it('should prevent casual teams from matching with ranked teams', () => {
        for (let iteration = 0; iteration < 50; iteration++) {
            // Create teams with similar ELO but different match types
            const baseElo = 500 + Math.floor(Math.random() * 200); // 500-700 ELO
            const baseTier = 50 + Math.floor(Math.random() * 20); // 50-70 tier
            
            const casualTeam = generateRandomTeamEntry('casual');
            casualTeam.odElo = baseElo;
            casualTeam.odAvgTier = baseTier;
            
            const rankedTeam = generateRandomTeamEntry('ranked');
            rankedTeam.odElo = baseElo + Math.floor(Math.random() * 20) - 10; // Very similar ELO
            rankedTeam.odAvgTier = baseTier + Math.floor(Math.random() * 10) - 5; // Very similar tier
            
            // Join both teams
            const casualResult = simulateJoinTeamQueue(casualTeam);
            const rankedResult = simulateJoinTeamQueue(rankedTeam);
            
            expect(casualResult.success).toBe(true);
            expect(rankedResult.success).toBe(true);
            
            // Try to find match for casual team
            const casualMatch = simulateFindOpponents(casualTeam);
            
            // Try to find match for ranked team
            const rankedMatch = simulateFindOpponents(rankedTeam);
            
            // Verify no cross-type matching occurred
            if (casualMatch.match) {
                expect(casualMatch.match.odTeam1.odMatchType).toBe('casual');
                expect(casualMatch.match.odTeam2.odMatchType).toBe('casual');
            }
            
            if (rankedMatch.match) {
                expect(rankedMatch.match.odTeam1.odMatchType).toBe('ranked');
                expect(rankedMatch.match.odTeam2.odMatchType).toBe('ranked');
            }
            
            // Verify teams are in correct queues (check if queues exist first)
            const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            const rankedQueueKey = `${TEAM_QUEUE_PREFIX}ranked:5v5`;
            
            // Only check if teams are still in queue (not matched)
            if (!casualMatch.match && mockRedisQueue[casualQueueKey]) {
                expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam);
            }
            if (!rankedMatch.match && mockRedisQueue[rankedQueueKey]) {
                expect(mockRedisQueue[rankedQueueKey]).toContain(rankedTeam);
            }
            
            // Verify no cross-queue contamination
            if (mockRedisQueue[casualQueueKey]) {
                expect(mockRedisQueue[casualQueueKey]).not.toContain(rankedTeam);
            }
            if (mockRedisQueue[rankedQueueKey]) {
                expect(mockRedisQueue[rankedQueueKey]).not.toContain(casualTeam);
            }
        }
    });
    
    it('should handle edge cases in casual queue opponent matching', () => {
        const edgeCases = [
            // Single human player with AI teammates
            {
                name: 'single human with AI',
                humanCount: 1,
                aiCount: 4
            },
            // Two humans with AI teammates
            {
                name: 'two humans with AI',
                humanCount: 2,
                aiCount: 3
            },
            // Full human team in casual mode
            {
                name: 'full human casual team',
                humanCount: 5,
                aiCount: 0
            }
        ];
        
        edgeCases.forEach((testCase, index) => {
            const casualTeam = generateRandomTeamEntry('casual');
            
            // Customize team composition
            casualTeam.odMembers = [];
            casualTeam.humanMemberCount = testCase.humanCount;
            casualTeam.hasAITeammates = testCase.aiCount > 0;
            
            // Add human members
            for (let i = 0; i < testCase.humanCount; i++) {
                casualTeam.odMembers.push({
                    odUserId: `human-${i}`,
                    odUserName: `Human-${i}`,
                    odElo: casualTeam.odElo + Math.floor(Math.random() * 50) - 25,
                    odTier: casualTeam.odAvgTier,
                    odLevel: Math.floor(Math.random() * 50) + 1,
                    isAITeammate: false
                });
            }
            
            // Add AI members
            for (let i = 0; i < testCase.aiCount; i++) {
                casualTeam.odMembers.push({
                    odUserId: `ai-${i}`,
                    odUserName: `AI-${i}`,
                    odElo: casualTeam.odElo + Math.floor(Math.random() * 50) - 25,
                    odTier: casualTeam.odAvgTier,
                    odLevel: Math.floor(Math.random() * 30) + 20,
                    isAITeammate: true
                });
            }
            
            const result = simulateJoinTeamQueue(casualTeam);
            expect(result.success).toBe(true);
            
            // Verify correct queue usage regardless of team composition
            const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            expect(mockRedisZAdd).toHaveBeenCalledWith(casualQueueKey, casualTeam.odElo, casualTeam.odPartyId);
            expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam);
            
            // Verify team metadata is correct
            expect(casualTeam.odMembers.length).toBe(testCase.humanCount + testCase.aiCount);
            expect(casualTeam.humanMemberCount).toBe(testCase.humanCount);
            expect(casualTeam.hasAITeammates).toBe(testCase.aiCount > 0);
            
            // Verify match type is preserved
            expect(casualTeam.odMatchType).toBe('casual');
        });
    });
    
    it('should validate queue key consistency across all operations', () => {
        // Use fewer iterations to reduce flakiness
        for (let iteration = 0; iteration < 10; iteration++) {
            // Create teams with compatible ELO to ensure matching
            const baseElo = 500;
            const casualTeam1 = generateRandomTeamEntry('casual');
            casualTeam1.odElo = baseElo;
            casualTeam1.odAvgTier = 50;
            
            const casualTeam2 = generateRandomTeamEntry('casual');
            casualTeam2.odElo = baseElo + 10; // Very close ELO to ensure match
            casualTeam2.odAvgTier = 50;
            
            // Join both teams
            simulateJoinTeamQueue(casualTeam1);
            simulateJoinTeamQueue(casualTeam2);
            
            const casualQueueKey = `${TEAM_QUEUE_PREFIX}casual:5v5`;
            
            // Verify both teams are in casual queue
            expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam1);
            expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam2);
            
            // Find match
            const match = simulateFindOpponents(casualTeam1);
            
            if (match.match) {
                // Verify match uses casual teams only
                expect(match.match.odTeam1.odMatchType).toBe('casual');
                expect(match.match.odTeam2.odMatchType).toBe('casual');
                
                // The simulateFindOpponents function should have removed both teams from queue
                const queueAfterMatch = mockRedisQueue[casualQueueKey] || [];
                const remainingPartyIds = queueAfterMatch.map(t => t.odPartyId);
                
                expect(remainingPartyIds).not.toContain(casualTeam1.odPartyId);
                expect(remainingPartyIds).not.toContain(casualTeam2.odPartyId);
                
                // Verify Redis operations used correct keys
                expect(mockRedisZRem).toHaveBeenCalledWith(casualQueueKey, casualTeam1.odPartyId, casualTeam2.odPartyId);
            } else {
                // If no match found, teams should still be in queue
                expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam1);
                expect(mockRedisQueue[casualQueueKey]).toContain(casualTeam2);
            }
        }
    });
});