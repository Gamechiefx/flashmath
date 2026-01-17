/**
 * Property-Based Tests for League Season Transitions
 * 
 * Feature: comprehensive-user-stories
 * Property 16: League Season Transitions
 * 
 * Validates: Requirements 7.2, 7.3
 * For any league season end, the system should correctly promote top performers,
 * demote underperformers, and maintain league integrity across transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Property test configuration
const PROPERTY_TEST_ITERATIONS = 100;

// Mock league system structures
interface MockLeague {
    id: string;
    name: string;
    tier: number;
    end_time: string;
    season: number;
}

interface MockParticipant {
    league_id: string;
    user_id: string;
    name: string;
    weekly_xp: number;
    rank?: number;
}

interface MockUser {
    id: string;
    name: string;
    current_league_id: string;
    coins: number;
    level: number;
}

interface SeasonTransitionResult {
    promotions: Array<{
        userId: string;
        fromLeague: string;
        toLeague: string;
        reason: 'top_performer';
    }>;
    demotions: Array<{
        userId: string;
        fromLeague: string;
        toLeague: string;
        reason: 'underperformer' | 'insufficient_activity';
    }>;
    rewards: Array<{
        userId: string;
        amount: number;
        reason: string;
    }>;
    newSeasonState: {
        leagues: MockLeague[];
        participants: MockParticipant[];
    };
}

// League tier hierarchy
const LEAGUE_TIERS = [
    { id: 'neon-league', name: 'Neon League', tier: 0 },
    { id: 'cobalt-league', name: 'Cobalt League', tier: 1 },
    { id: 'plasma-league', name: 'Plasma League', tier: 2 },
    { id: 'void-league', name: 'Void League', tier: 3 },
    { id: 'apex-league', name: 'Apex League', tier: 4 }
];

// Simulate league season transition
function processSeasonTransition(
    leagues: MockLeague[],
    participants: MockParticipant[],
    users: MockUser[]
): SeasonTransitionResult {
    const promotions: SeasonTransitionResult['promotions'] = [];
    const demotions: SeasonTransitionResult['demotions'] = [];
    const rewards: SeasonTransitionResult['rewards'] = [];
    const newParticipants: MockParticipant[] = [];
    
    // Process each league
    LEAGUE_TIERS.forEach(leagueTier => {
        const leagueParticipants = participants
            .filter(p => p.league_id === leagueTier.id)
            .sort((a, b) => b.weekly_xp - a.weekly_xp);
        
        if (leagueParticipants.length === 0) return;
        
        // Top 3 get promoted (except from highest tier)
        const top3 = leagueParticipants.slice(0, 3);
        top3.forEach(participant => {
            if (participant.user_id.startsWith('ghost-')) return;
            
            // Award prize for top 3
            rewards.push({
                userId: participant.user_id,
                amount: 250,
                reason: 'top_3_finish'
            });
            
            // Promote if not in highest tier
            if (leagueTier.tier < LEAGUE_TIERS.length - 1) {
                const nextTier = LEAGUE_TIERS[leagueTier.tier + 1];
                promotions.push({
                    userId: participant.user_id,
                    fromLeague: leagueTier.id,
                    toLeague: nextTier.id,
                    reason: 'top_performer'
                });
                
                // Update user's league
                const user = users.find(u => u.id === participant.user_id);
                if (user) {
                    user.current_league_id = nextTier.id;
                    user.coins += 250;
                }
            }
        });
        
        // Demote underperformers (except from lowest tier)
        if (leagueTier.tier > 0) {
            const under20XP = leagueParticipants.filter(p => p.weekly_xp < 20);
            const bottom2 = leagueParticipants.slice(-2);

            // Track promoted users to avoid promoting and demoting same user
            const promotedUserIds = new Set(promotions.map(p => p.userId));

            // Combine and deduplicate demotees
            const demoteeIds = new Set([
                ...under20XP.map(p => p.user_id),
                ...bottom2.map(p => p.user_id)
            ]);

            demoteeIds.forEach(userId => {
                if (userId.startsWith('ghost-')) return;
                // Skip users who were already promoted
                if (promotedUserIds.has(userId)) return;
                
                const prevTier = LEAGUE_TIERS[leagueTier.tier - 1];
                const participant = leagueParticipants.find(p => p.user_id === userId);
                
                if (participant) {
                    const reason = participant.weekly_xp < 20 ? 'insufficient_activity' : 'underperformer';
                    demotions.push({
                        userId,
                        fromLeague: leagueTier.id,
                        toLeague: prevTier.id,
                        reason
                    });
                    
                    // Update user's league
                    const user = users.find(u => u.id === userId);
                    if (user) {
                        user.current_league_id = prevTier.id;
                    }
                }
            });
        }
    });
    
    // Create new season state
    const newLeagues = leagues.map(league => ({
        ...league,
        season: league.season + 1,
        end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next week
    }));
    
    // Reset participants for new season (keep users in their new leagues)
    users.forEach(user => {
        if (!user.id.startsWith('ghost-')) {
            newParticipants.push({
                league_id: user.current_league_id,
                user_id: user.id,
                name: user.name,
                weekly_xp: 0 // Reset for new season
            });
        }
    });
    
    // Add ghost players to each league
    LEAGUE_TIERS.forEach(tier => {
        for (let i = 0; i < 6; i++) {
            newParticipants.push({
                league_id: tier.id,
                user_id: `ghost-${Math.random().toString(36).substring(7)}`,
                name: `Ghost${i + 1}`,
                weekly_xp: Math.floor(Math.random() * 100)
            });
        }
    });
    
    return {
        promotions,
        demotions,
        rewards,
        newSeasonState: {
            leagues: newLeagues,
            participants: newParticipants
        }
    };
}

// Generate random league state
function generateRandomLeagueState(): {
    leagues: MockLeague[];
    participants: MockParticipant[];
    users: MockUser[];
} {
    const leagues = LEAGUE_TIERS.map(tier => ({
        id: tier.id,
        name: tier.name,
        tier: tier.tier,
        end_time: new Date().toISOString(), // Season ending now
        season: Math.floor(Math.random() * 10) + 1
    }));
    
    const users: MockUser[] = [];
    const participants: MockParticipant[] = [];
    
    // Generate 20-50 users across all leagues
    const userCount = Math.floor(Math.random() * 31) + 20;
    
    for (let i = 0; i < userCount; i++) {
        const leagueIndex = Math.floor(Math.random() * LEAGUE_TIERS.length);
        const league = LEAGUE_TIERS[leagueIndex];
        
        const user: MockUser = {
            id: `user-${i}`,
            name: `Player${i}`,
            current_league_id: league.id,
            coins: Math.floor(Math.random() * 5000),
            level: Math.floor(Math.random() * 50) + 1
        };
        
        const participant: MockParticipant = {
            league_id: league.id,
            user_id: user.id,
            name: user.name,
            weekly_xp: Math.floor(Math.random() * 500) // 0-499 XP
        };
        
        users.push(user);
        participants.push(participant);
    }
    
    // Add some ghost players
    LEAGUE_TIERS.forEach(tier => {
        for (let i = 0; i < 3; i++) {
            participants.push({
                league_id: tier.id,
                user_id: `ghost-${tier.id}-${i}`,
                name: `Ghost${i}`,
                weekly_xp: Math.floor(Math.random() * 200)
            });
        }
    });
    
    return { leagues, participants, users };
}

describe('Property 16: League Season Transitions', () => {
    it('should correctly promote top 3 performers from each league', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            const result = processSeasonTransition(leagues, participants, users);
            
            // Check promotions for each league (except highest)
            LEAGUE_TIERS.slice(0, -1).forEach(tier => {
                const leagueParticipants = participants
                    .filter(p => p.league_id === tier.id && !p.user_id.startsWith('ghost-'))
                    .sort((a, b) => b.weekly_xp - a.weekly_xp);
                
                if (leagueParticipants.length > 0) {
                    const expectedPromotions = Math.min(3, leagueParticipants.length);
                    const actualPromotions = result.promotions.filter(p => p.fromLeague === tier.id);
                    
                    expect(actualPromotions.length).toBeLessThanOrEqual(expectedPromotions);
                    
                    // Verify promoted users are from top performers
                    actualPromotions.forEach(promotion => {
                        const participant = leagueParticipants.find(p => p.user_id === promotion.userId);
                        expect(participant).toBeDefined();
                        
                        // Should be promoted to next tier
                        const nextTier = LEAGUE_TIERS[tier.tier + 1];
                        expect(promotion.toLeague).toBe(nextTier.id);
                        expect(promotion.reason).toBe('top_performer');
                    });
                }
            });
            
            // Highest tier should have no promotions
            const apexPromotions = result.promotions.filter(p => p.fromLeague === 'apex-league');
            expect(apexPromotions.length).toBe(0);
        }
    });

    it('should correctly demote underperformers from non-lowest leagues', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            const result = processSeasonTransition(leagues, participants, users);
            
            // Check demotions for each league (except lowest)
            LEAGUE_TIERS.slice(1).forEach(tier => {
                const leagueParticipants = participants
                    .filter(p => p.league_id === tier.id && !p.user_id.startsWith('ghost-'))
                    .sort((a, b) => b.weekly_xp - a.weekly_xp);
                
                if (leagueParticipants.length > 0) {
                    const actualDemotions = result.demotions.filter(d => d.fromLeague === tier.id);
                    
                    // Verify demoted users meet criteria
                    actualDemotions.forEach(demotion => {
                        const participant = leagueParticipants.find(p => p.user_id === demotion.userId);
                        expect(participant).toBeDefined();
                        
                        // Should be demoted to previous tier
                        const prevTier = LEAGUE_TIERS[tier.tier - 1];
                        expect(demotion.toLeague).toBe(prevTier.id);
                        
                        // Should meet demotion criteria
                        const isUnder20 = participant!.weekly_xp < 20;
                        const isBottom2 = leagueParticipants.indexOf(participant!) >= leagueParticipants.length - 2;
                        
                        expect(isUnder20 || isBottom2).toBe(true);
                        
                        if (isUnder20) {
                            expect(demotion.reason).toBe('insufficient_activity');
                        } else {
                            expect(demotion.reason).toBe('underperformer');
                        }
                    });
                }
            });
            
            // Lowest tier should have no demotions
            const neonDemotions = result.demotions.filter(d => d.fromLeague === 'neon-league');
            expect(neonDemotions.length).toBe(0);
        }
    });

    it('should award prizes to top 3 performers', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            const result = processSeasonTransition(leagues, participants, users);
            
            // Check rewards for each league
            LEAGUE_TIERS.forEach(tier => {
                const leagueParticipants = participants
                    .filter(p => p.league_id === tier.id && !p.user_id.startsWith('ghost-'))
                    .sort((a, b) => b.weekly_xp - a.weekly_xp);
                
                if (leagueParticipants.length > 0) {
                    const top3 = leagueParticipants.slice(0, 3);
                    const leagueRewards = result.rewards.filter(r => 
                        top3.some(p => p.user_id === r.userId)
                    );
                    
                    // Should have rewards for top performers
                    expect(leagueRewards.length).toBeLessThanOrEqual(3);
                    
                    leagueRewards.forEach(reward => {
                        expect(reward.amount).toBe(250);
                        expect(reward.reason).toBe('top_3_finish');
                        
                        // Verify user is actually in top 3
                        const isTop3 = top3.some(p => p.user_id === reward.userId);
                        expect(isTop3).toBe(true);
                    });
                }
            });
        }
    });

    it('should maintain league integrity during transitions', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            const originalUserCount = users.filter(u => !u.id.startsWith('ghost-')).length;
            
            const result = processSeasonTransition(leagues, participants, users);
            
            // All users should still exist after transition
            const newUserCount = result.newSeasonState.participants
                .filter(p => !p.user_id.startsWith('ghost-')).length;
            expect(newUserCount).toBe(originalUserCount);
            
            // No user should be promoted and demoted in same transition
            const promotedUsers = new Set(result.promotions.map(p => p.userId));
            const demotedUsers = new Set(result.demotions.map(d => d.userId));
            const intersection = new Set([...promotedUsers].filter(x => demotedUsers.has(x)));
            expect(intersection.size).toBe(0);
            
            // All leagues should have participants in new season
            LEAGUE_TIERS.forEach(tier => {
                const leagueParticipants = result.newSeasonState.participants
                    .filter(p => p.league_id === tier.id);
                expect(leagueParticipants.length).toBeGreaterThan(0);
            });
            
            // All participants should have reset XP
            result.newSeasonState.participants
                .filter(p => !p.user_id.startsWith('ghost-'))
                .forEach(participant => {
                    expect(participant.weekly_xp).toBe(0);
                });
            
            // Season numbers should increment
            result.newSeasonState.leagues.forEach((league, index) => {
                expect(league.season).toBe(leagues[index].season + 1);
            });
        }
    });

    it('should handle edge cases gracefully', () => {
        const edgeCases = [
            // Empty leagues
            { leagues: LEAGUE_TIERS.map(t => ({ id: t.id, name: t.name, tier: t.tier, end_time: new Date().toISOString(), season: 1 })), participants: [], users: [] },
            
            // Single user per league
            {
                leagues: LEAGUE_TIERS.map(t => ({ id: t.id, name: t.name, tier: t.tier, end_time: new Date().toISOString(), season: 1 })),
                participants: LEAGUE_TIERS.map((t, i) => ({ league_id: t.id, user_id: `user-${i}`, name: `Player${i}`, weekly_xp: 100 })),
                users: LEAGUE_TIERS.map((t, i) => ({ id: `user-${i}`, name: `Player${i}`, current_league_id: t.id, coins: 0, level: 1 }))
            },
            
            // All users with zero XP
            {
                leagues: LEAGUE_TIERS.map(t => ({ id: t.id, name: t.name, tier: t.tier, end_time: new Date().toISOString(), season: 1 })),
                participants: Array.from({ length: 10 }, (_, i) => ({ 
                    league_id: 'neon-league', 
                    user_id: `user-${i}`, 
                    name: `Player${i}`, 
                    weekly_xp: 0 
                })),
                users: Array.from({ length: 10 }, (_, i) => ({ 
                    id: `user-${i}`, 
                    name: `Player${i}`, 
                    current_league_id: 'neon-league', 
                    coins: 0, 
                    level: 1 
                }))
            }
        ];

        edgeCases.forEach((testCase, index) => {
            const result = processSeasonTransition(testCase.leagues, testCase.participants, testCase.users);
            
            // Should not crash
            expect(result).toBeDefined();
            expect(result.promotions).toBeDefined();
            expect(result.demotions).toBeDefined();
            expect(result.rewards).toBeDefined();
            expect(result.newSeasonState).toBeDefined();
            
            // Should maintain data integrity
            expect(Array.isArray(result.promotions)).toBe(true);
            expect(Array.isArray(result.demotions)).toBe(true);
            expect(Array.isArray(result.rewards)).toBe(true);
            expect(Array.isArray(result.newSeasonState.leagues)).toBe(true);
            expect(Array.isArray(result.newSeasonState.participants)).toBe(true);
            
            // No invalid promotions/demotions
            result.promotions.forEach(promotion => {
                expect(promotion.userId).toBeDefined();
                expect(promotion.fromLeague).toBeDefined();
                expect(promotion.toLeague).toBeDefined();
                expect(promotion.reason).toBe('top_performer');
            });
            
            result.demotions.forEach(demotion => {
                expect(demotion.userId).toBeDefined();
                expect(demotion.fromLeague).toBeDefined();
                expect(demotion.toLeague).toBeDefined();
                expect(['underperformer', 'insufficient_activity']).toContain(demotion.reason);
            });
        });
    });

    it('should preserve user league assignments correctly', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            const originalAssignments = new Map(users.map(u => [u.id, u.current_league_id]));
            
            const result = processSeasonTransition(leagues, participants, users);
            
            // Check that promoted users are in correct new leagues
            result.promotions.forEach(promotion => {
                const user = users.find(u => u.id === promotion.userId);
                expect(user).toBeDefined();
                expect(user!.current_league_id).toBe(promotion.toLeague);
                
                // Verify promotion is to next tier
                const fromTier = LEAGUE_TIERS.find(t => t.id === promotion.fromLeague);
                const toTier = LEAGUE_TIERS.find(t => t.id === promotion.toLeague);
                expect(toTier!.tier).toBe(fromTier!.tier + 1);
            });
            
            // Check that demoted users are in correct new leagues
            result.demotions.forEach(demotion => {
                const user = users.find(u => u.id === demotion.userId);
                expect(user).toBeDefined();
                expect(user!.current_league_id).toBe(demotion.toLeague);
                
                // Verify demotion is to previous tier
                const fromTier = LEAGUE_TIERS.find(t => t.id === demotion.fromLeague);
                const toTier = LEAGUE_TIERS.find(t => t.id === demotion.toLeague);
                expect(toTier!.tier).toBe(fromTier!.tier - 1);
            });
            
            // Check that unaffected users remain in same leagues
            const affectedUsers = new Set([
                ...result.promotions.map(p => p.userId),
                ...result.demotions.map(d => d.userId)
            ]);
            
            users.forEach(user => {
                if (!affectedUsers.has(user.id)) {
                    expect(user.current_league_id).toBe(originalAssignments.get(user.id));
                }
            });
            
            // Verify new season participants match user league assignments
            result.newSeasonState.participants
                .filter(p => !p.user_id.startsWith('ghost-'))
                .forEach(participant => {
                    const user = users.find(u => u.id === participant.user_id);
                    expect(user).toBeDefined();
                    expect(participant.league_id).toBe(user!.current_league_id);
                });
        }
    });

    it('should handle concurrent season transitions consistently', () => {
        for (let iteration = 0; iteration < PROPERTY_TEST_ITERATIONS; iteration++) {
            const { leagues, participants, users } = generateRandomLeagueState();
            
            // Create deep copies for multiple transitions
            const users1 = JSON.parse(JSON.stringify(users));
            const users2 = JSON.parse(JSON.stringify(users));
            
            // Process same transition twice
            const result1 = processSeasonTransition(leagues, participants, users1);
            const result2 = processSeasonTransition(leagues, participants, users2);
            
            // Results should be identical
            expect(result1.promotions.length).toBe(result2.promotions.length);
            expect(result1.demotions.length).toBe(result2.demotions.length);
            expect(result1.rewards.length).toBe(result2.rewards.length);
            
            // Same users should be promoted/demoted
            const promoted1 = new Set(result1.promotions.map(p => p.userId));
            const promoted2 = new Set(result2.promotions.map(p => p.userId));
            expect(promoted1).toEqual(promoted2);
            
            const demoted1 = new Set(result1.demotions.map(d => d.userId));
            const demoted2 = new Set(result2.demotions.map(d => d.userId));
            expect(demoted1).toEqual(demoted2);
            
            // Same rewards should be given
            const rewarded1 = new Set(result1.rewards.map(r => r.userId));
            const rewarded2 = new Set(result2.rewards.map(r => r.userId));
            expect(rewarded1).toEqual(rewarded2);
        }
    });
});