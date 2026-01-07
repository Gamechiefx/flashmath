'use server';

/**
 * Arena Team Matchmaking Server Actions
 * Real-time team matchmaking using Redis for queue management
 * Supports 5v5 mode with team ELO-based matching
 * 
 * Database usage:
 * - PostgreSQL: Team ELO, match history (via arena-db)
 * - Redis: Party data, queue state (via party-redis)
 * - SQLite: User profiles only (for tier data lookup)
 */

import { auth } from "@/auth";
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, generateId, now } from "@/lib/db/sqlite";
import { 
    getTeamElo as getTeamEloFromPostgres,
    getPlayerElo,
    getOrCreateArenaPlayer,
    getOrCreateArenaTeam
} from "@/lib/arena/arena-db";
import {
    getParty,
    updateQueueState,
    setMatchFound,
    toggleReady as togglePartyReady,
    type PartyState,
    type PartyMember,
} from "@/lib/party/party-redis";

// Redis client for matchmaking
let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;

    try {
        const Redis = (await import('ioredis')).default;
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'redis',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        return redisClient;
    } catch (error) {
        console.error('[TeamMatchmaking] Redis connection failed:', error);
        return null;
    }
}

// =============================================================================
// TYPES
// =============================================================================

export interface TeamQueueEntry {
    odPartyId: string;
    odTeamId: string | null;        // Persistent team ID (null for temporary parties)
    odTeamName: string | null;
    odTeamTag: string | null;
    odLeaderId: string;             // Party leader who can initiate quit votes
    odLeaderName: string;
    odElo: number;                  // Team ELO or avg member ELO
    odAvgTier: number;              // Average tier of all members (1-100, 100-tier system)
    odMode: '5v5';
    odMatchType: 'ranked' | 'casual';
    odIglId: string;
    odIglName: string;
    odAnchorId: string;
    odAnchorName: string;
    odMembers: TeamQueueMember[];
    odJoinedAt: number;
}

export interface TeamQueueMember {
    odUserId: string;
    odUserName: string;
    odElo: number;                  // Individual 5v5 ELO
    odTier: number;                 // Individual tier (1-100, 100-tier system)
    odLevel: number;
    odEquippedFrame: string | null;
    odEquippedTitle: string | null;
    odPreferredOperation?: string | null;  // Preferred math operation
    odOriginalPartyId?: string;             // Original party ID when merging parties
}

export interface TeamMatchResult {
    matchId: string;
    odTeam1: TeamQueueEntry;
    odTeam2: TeamQueueEntry;
}

export interface TeamQueueStatus {
    inQueue: boolean;
    phase: 'finding_teammates' | 'igl_selection' | 'finding_opponents' | 'match_found' | null;
    queueTimeMs: number;
    currentEloRange: number;
    partySize: number;
    targetSize: number;
    matchId: string | null;
    assembledTeamId?: string; // ID of the assembled team (for IGL selection phase)
}

// Entry for partial parties looking for teammates
export interface TeammateQueueEntry {
    odPartyId: string;
    odLeaderId: string;
    odLeaderName: string;
    odTeamId: string | null;
    odElo: number;
    odAvgTier: number;              // Average tier of current members (1-100)
    odMode: '5v5';
    odMembers: TeamQueueMember[];
    odJoinedAt: number;
    odSlotsNeeded: number; // How many more players needed (1-4)
}

// Assembled team waiting for IGL selection
export interface AssembledTeam {
    id: string;
    odPartyIds: string[];           // Original party IDs that were merged
    odMembers: TeamQueueMember[];   // All 5 members
    odElo: number;                  // Average ELO of all members
    odAvgTier: number;              // Average tier of all members (1-100)
    odMode: '5v5';
    odIglId: string | null;
    odAnchorId: string | null;
    odIglVotes: Record<string, string[]>;   // userId -> voters
    odAnchorVotes: Record<string, string[]>;
    odSelectionStartedAt: number;
    odLargestPartyLeaderId: string; // Leader of largest original party (defaults to decision maker)
}

export interface TeammateSearchResult {
    success: boolean;
    phase: 'searching' | 'team_formed' | 'error';
    assembledTeamId?: string;
    error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TEAM_QUEUE_PREFIX = 'team:queue:';
const TEAM_MATCH_PREFIX = 'team:match:';
const TEAM_IGL_SELECTION_PREFIX = 'team:igl:';
const TEAMMATE_QUEUE_PREFIX = 'team:teammates:'; // For partial parties looking for teammates
const ASSEMBLED_TEAM_PREFIX = 'team:assembled:'; // For assembled teams in IGL selection

// Matchmaking settings
const INITIAL_ELO_RANGE = 100;      // ±100 ELO to start
const ELO_EXPANSION_RATE = 50;      // +50 ELO per interval
const ELO_EXPANSION_INTERVAL = 15;  // 15 seconds
const MAX_ELO_RANGE = 400;          // ±400 ELO max
const QUEUE_TIMEOUT_MS = 180000;    // 3 minutes max queue time
const IGL_SELECTION_TIMEOUT = 25;   // 25 seconds for IGL/Anchor selection

// Tier matchmaking settings (100-tier system)
const TEAM_TIER_RANGE = 25;         // ±25 tiers for team matching (slightly wider than 1v1)
const DEFAULT_TIER = 50;            // Default tier if not available

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate the ELO to use for matchmaking
 * Uses team ELO from PostgreSQL if persistent team, otherwise avg of party members
 */
async function getMatchmakingElo(
    teamId: string | null,
    members: { odUserId: string; odElo: number }[]
): Promise<number> {
    if (teamId) {
        // Use persistent team ELO from PostgreSQL
        try {
            const teamData = await getTeamEloFromPostgres(teamId);
            return teamData.elo;
        } catch (error) {
            console.error('[TeamMatchmaking] Failed to get team ELO from PostgreSQL:', error);
            // Fallback to member average
        }
    }

    // Use average of party member ELOs
    if (members.length === 0) return 300;
    const total = members.reduce((sum, m) => sum + m.odElo, 0);
    return Math.round(total / members.length);
}

/**
 * Get user's lowest operation tier from math_tiers (100-tier system)
 * Uses the lowest tier across all operations for fair matchmaking
 */
function getUserTier(mathTiersJson: string | null): number {
    if (!mathTiersJson) return DEFAULT_TIER;
    
    try {
        const tiers = JSON.parse(mathTiersJson);
        const operations = ['addition', 'subtraction', 'multiplication', 'division'];
        let lowestTier = 100;
        
        for (const op of operations) {
            const tier = typeof tiers[op] === 'number' ? tiers[op] : DEFAULT_TIER;
            // Handle legacy 0-4 values
            const normalizedTier = tier <= 4 ? ((tier + 1) * 20) - 10 : tier;
            if (normalizedTier < lowestTier) {
                lowestTier = normalizedTier;
            }
        }
        
        return Math.max(1, Math.min(100, lowestTier));
    } catch {
        return DEFAULT_TIER;
    }
}

/**
 * Calculate average tier for a team
 */
function calculateTeamAvgTier(members: { odTier: number }[]): number {
    if (members.length === 0) return DEFAULT_TIER;
    const total = members.reduce((sum, m) => sum + m.odTier, 0);
    return Math.round(total / members.length);
}

/**
 * Calculate current ELO range based on queue time
 */
function calculateEloRange(queueTimeMs: number): number {
    const expansions = Math.floor(queueTimeMs / (ELO_EXPANSION_INTERVAL * 1000));
    return Math.min(INITIAL_ELO_RANGE + (expansions * ELO_EXPANSION_RATE), MAX_ELO_RANGE);
}

// =============================================================================
// TEAM QUEUE OPERATIONS
// =============================================================================

/**
 * Join the team queue with a party
 * Requires full party (5 members) for ranked 5v5
 */
export async function joinTeamQueue(params: {
    partyId: string;
    matchType: 'ranked' | 'casual';
}): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    try {
        // Get party data from Redis
        const partyData = await getParty(params.partyId);
        if (!partyData) {
            return { success: false, error: 'Party not found' };
        }

        const party = partyData.party;
        const redisMembers = partyData.members;

        // Verify user is party leader
        if (party.leaderId !== userId) {
            return { success: false, error: 'Only the party leader can start the queue' };
        }

        // Check party size for ranked
        if (params.matchType === 'ranked' && redisMembers.length < 5) {
            return { success: false, error: 'Ranked 5v5 requires a full party of 5 players' };
        }

        // Auto-ready the leader when they start the queue
        const leaderMember = redisMembers.find(m => m.odUserId === party.leaderId);
        if (leaderMember && !leaderMember.isReady) {
            await togglePartyReady(params.partyId, party.leaderId);
            leaderMember.isReady = true;
            console.log(`[TeamMatchmaking] Auto-readied leader ${party.leaderId} for party ${params.partyId}`);
        }

        // Check all other members are ready (leader is now always ready)
        const notReady = redisMembers.filter(m => !m.isReady && m.odUserId !== party.leaderId);
        if (notReady.length > 0) {
            return { success: false, error: 'Not all party members are ready' };
        }

        // Validate IGL and Anchor are set and are actual party members for ranked
        if (params.matchType === 'ranked') {
            if (!party.iglId) {
                return { success: false, error: 'IGL must be assigned before queuing' };
            }
            if (!party.anchorId) {
                return { success: false, error: 'Anchor must be assigned before queuing' };
            }
            
            // Verify IGL is still a party member
            const iglMember = redisMembers.find(m => m.odUserId === party.iglId);
            if (!iglMember) {
                return { success: false, error: 'Assigned IGL is no longer in the party. Please reassign.' };
            }
            
            // Verify Anchor is still a party member
            const anchorMember = redisMembers.find(m => m.odUserId === party.anchorId);
            if (!anchorMember) {
                return { success: false, error: 'Assigned Anchor is no longer in the party. Please reassign.' };
            }
        }

        // Get Leader, IGL and Anchor from Redis members
        const leader = redisMembers.find(m => m.odUserId === party.leaderId);
        const igl = redisMembers.find(m => m.odUserId === party.iglId);
        const anchor = redisMembers.find(m => m.odUserId === party.anchorId);

        // Get user tier data from SQLite (this is the only SQLite read)
        const userTierData: Record<string, string | null> = {};
        for (const member of redisMembers) {
            const userData = db.prepare(`SELECT math_tiers FROM users WHERE id = ?`).get(member.odUserId) as any;
            userTierData[member.odUserId] = userData?.math_tiers || null;
        }

        // Build queue members with 5v5 ELO from PostgreSQL and tier from SQLite
        const queueMembers: TeamQueueMember[] = await Promise.all(
            redisMembers.map(async (m) => {
                const tier = getUserTier(userTierData[m.odUserId]);
                
                // Fetch 5v5 ELO from PostgreSQL
                let elo5v5 = 300;
                try {
                    const playerElo = await getPlayerElo(m.odUserId, '5v5');
                    elo5v5 = playerElo.elo;
                    
                    // Ensure player exists in PostgreSQL arena_players
                    await getOrCreateArenaPlayer(m.odUserId, m.odUserName);
                } catch (error) {
                    console.warn(`[TeamMatchmaking] Failed to get PostgreSQL ELO for ${m.odUserId}, using default`);
                }
                
                return {
                    odUserId: m.odUserId,
                    odUserName: m.odUserName,
                    odElo: elo5v5,
                    odTier: tier,
                    odLevel: m.odLevel || 1,
                    odEquippedFrame: m.odEquippedFrame || null,
                    odEquippedTitle: m.odEquippedTitle || null,
                };
            })
        );

        // Calculate matchmaking ELO
        const matchElo = await getMatchmakingElo(
            party.teamId,
            queueMembers.map(m => ({ odUserId: m.odUserId, odElo: m.odElo }))
        );

        // Calculate average team tier
        const avgTier = calculateTeamAvgTier(queueMembers);

        // Update party queue state in Redis
        await updateQueueState(params.partyId, party.leaderId, 'finding_opponents', params.matchType);

        // Create queue entry
        const queueEntry: TeamQueueEntry = {
            odPartyId: params.partyId,
            odTeamId: party.teamId || null,
            odTeamName: party.teamName || null,
            odTeamTag: party.teamTag || null,
            odLeaderId: party.leaderId,
            odLeaderName: leader?.odUserName || 'Unknown',
            odElo: matchElo,
            odAvgTier: avgTier,
            odMode: '5v5',
            odMatchType: params.matchType,
            odIglId: party.iglId || party.leaderId,
            odIglName: igl?.odUserName || 'Unknown',
            odAnchorId: party.anchorId || redisMembers[0]?.odUserId,
            odAnchorName: anchor?.odUserName || 'Unknown',
            odMembers: queueMembers,
            odJoinedAt: Date.now(),
        };

        // Add to Redis queue
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Queue service unavailable' };
        }

        const queueKey = `${TEAM_QUEUE_PREFIX}${params.matchType}:5v5`;
        
        // Add to sorted set with ELO as score
        await redis.zadd(queueKey, matchElo, params.partyId);
        
        // Store queue entry data
        await redis.set(
            `${TEAM_QUEUE_PREFIX}entry:${params.partyId}`,
            JSON.stringify(queueEntry),
            'EX', QUEUE_TIMEOUT_MS / 1000
        );

        console.log(`[TeamMatchmaking] Party ${params.partyId} joined queue: ELO=${matchElo}, AvgTier=${avgTier}`);
        return { success: true };

    } catch (error: any) {
        console.error('[TeamMatchmaking] joinTeamQueue error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Leave the team queue
 */
export async function leaveTeamQueue(partyId: string): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    try {
        // Verify user is in the party
        const membership = db.prepare(`
            SELECT pm.party_id, p.leader_id
            FROM party_members pm
            JOIN parties p ON p.id = pm.party_id
            WHERE pm.party_id = ? AND pm.user_id = ?
        `).get(partyId, userId) as any;

        if (!membership) {
            return { success: false, error: 'Not in this party' };
        }

        // Only leader can leave queue
        if (membership.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can leave the queue' };
        }

        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Queue service unavailable' };
        }

        // Get entry to find the queue key
        const entryData = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
        if (entryData) {
            const entry = JSON.parse(entryData) as TeamQueueEntry;
            const queueKey = `${TEAM_QUEUE_PREFIX}${entry.odMatchType}:5v5`;
            await redis.zrem(queueKey, partyId);
        }

        // Remove entry data
        await redis.del(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);

        console.log(`[TeamMatchmaking] Party ${partyId} left queue`);
        return { success: true };

    } catch (error: any) {
        console.error('[TeamMatchmaking] leaveTeamQueue error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check for a team match
 * Called periodically by the client while in queue
 */
export async function checkTeamMatch(partyId: string): Promise<{
    status: TeamQueueStatus;
    match?: TeamMatchResult;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user?.id) {
        return {
            status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            error: 'Not authenticated'
        };
    }

    try {
        const redis = await getRedis();
        if (!redis) {
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
                error: 'Queue service unavailable'
            };
        }

        // Check if already matched
        const matchData = await redis.get(`${TEAM_MATCH_PREFIX}${partyId}`);
        if (matchData) {
            const match = JSON.parse(matchData) as TeamMatchResult;
            return {
                status: {
                    inQueue: false,
                    phase: 'match_found',
                    queueTimeMs: 0,
                    currentEloRange: 0,
                    partySize: 5,
                    targetSize: 5,
                    matchId: match.matchId,
                },
                match,
            };
        }

        // Get queue entry
        const entryData = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
        if (!entryData) {
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            };
        }

        const entry = JSON.parse(entryData) as TeamQueueEntry;
        const queueTimeMs = Date.now() - entry.odJoinedAt;
        const currentEloRange = calculateEloRange(queueTimeMs);

        // Check if queue has timed out
        if (queueTimeMs > QUEUE_TIMEOUT_MS) {
            await leaveTeamQueue(partyId);
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: entry.odMembers.length, targetSize: 5, matchId: null },
                error: 'Queue timeout - no match found',
            };
        }

        // Try to find a match
        const queueKey = `${TEAM_QUEUE_PREFIX}${entry.odMatchType}:5v5`;
        
        // Get all parties in range
        const minElo = entry.odElo - currentEloRange;
        const maxElo = entry.odElo + currentEloRange;
        
        const candidates = await redis.zrangebyscore(queueKey, minElo, maxElo) as string[];
        
        // Find a match (exclude self)
        for (const candidatePartyId of candidates) {
            if (candidatePartyId === partyId) continue;

            const candidateData = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${candidatePartyId}`);
            if (!candidateData) continue;

            const candidate = JSON.parse(candidateData) as TeamQueueEntry;

            // Verify ELO is in range from candidate's perspective
            const candidateQueueTime = Date.now() - candidate.odJoinedAt;
            const candidateEloRange = calculateEloRange(candidateQueueTime);
            
            // Check ELO compatibility
            const eloCompatible = Math.abs(candidate.odElo - entry.odElo) <= Math.max(currentEloRange, candidateEloRange);
            
            // Check tier compatibility (use default if not set for backwards compatibility)
            const entryTier = entry.odAvgTier ?? DEFAULT_TIER;
            const candidateTier = candidate.odAvgTier ?? DEFAULT_TIER;
            const tierDiff = Math.abs(candidateTier - entryTier);
            const tierCompatible = tierDiff <= TEAM_TIER_RANGE;
            
            if (eloCompatible && tierCompatible) {
                // Match found!
                const matchId = uuidv4();

                const matchResult: TeamMatchResult = {
                    matchId,
                    odTeam1: entry,
                    odTeam2: candidate,
                };

                // Store match for both parties
                await redis.set(
                    `${TEAM_MATCH_PREFIX}${partyId}`,
                    JSON.stringify(matchResult),
                    'EX', 300 // 5 minute expiry
                );
                await redis.set(
                    `${TEAM_MATCH_PREFIX}${candidatePartyId}`,
                    JSON.stringify(matchResult),
                    'EX', 300
                );

                // Remove both from queue
                await redis.zrem(queueKey, partyId, candidatePartyId);
                await redis.del(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
                await redis.del(`${TEAM_QUEUE_PREFIX}entry:${candidatePartyId}`);

                console.log(`[TeamMatchmaking] Match found: ${partyId} vs ${candidatePartyId}, matchId=${matchId}, ELO: ${entry.odElo} vs ${candidate.odElo}, Tier: ${entryTier} vs ${candidateTier}`);

                return {
                    status: {
                        inQueue: false,
                        phase: 'match_found',
                        queueTimeMs,
                        currentEloRange,
                        partySize: entry.odMembers.length,
                        targetSize: 5,
                        matchId,
                    },
                    match: matchResult,
                };
            }
        }

        // No match yet
        return {
            status: {
                inQueue: true,
                phase: 'finding_opponents',
                queueTimeMs,
                currentEloRange,
                partySize: entry.odMembers.length,
                targetSize: 5,
                matchId: null,
            },
        };

    } catch (error: any) {
        console.error('[TeamMatchmaking] checkTeamMatch error:', error);
        return {
            status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            error: error.message,
        };
    }
}

/**
 * Get the match data for a party
 */
export async function getTeamMatch(partyId: string): Promise<TeamMatchResult | null> {
    try {
        const redis = await getRedis();
        if (!redis) return null;

        const matchData = await redis.get(`${TEAM_MATCH_PREFIX}${partyId}`);
        if (!matchData) return null;

        return JSON.parse(matchData) as TeamMatchResult;
    } catch (error) {
        console.error('[TeamMatchmaking] getTeamMatch error:', error);
        return null;
    }
}

/**
 * Clear a match (after it starts or is cancelled)
 */
export async function clearTeamMatch(partyId: string): Promise<{ success: boolean }> {
    try {
        const redis = await getRedis();
        if (!redis) return { success: false };

        await redis.del(`${TEAM_MATCH_PREFIX}${partyId}`);
        return { success: true };
    } catch (error) {
        console.error('[TeamMatchmaking] clearTeamMatch error:', error);
        return { success: false };
    }
}

/**
 * Get queue status for a party
 */
export async function getTeamQueueStatus(partyId: string): Promise<TeamQueueStatus> {
    try {
        const redis = await getRedis();
        if (!redis) {
            return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
        }

        // Check for existing match
        const matchData = await redis.get(`${TEAM_MATCH_PREFIX}${partyId}`);
        if (matchData) {
            const match = JSON.parse(matchData) as TeamMatchResult;
            return {
                inQueue: false,
                phase: 'match_found',
                queueTimeMs: 0,
                currentEloRange: 0,
                partySize: 5,
                targetSize: 5,
                matchId: match.matchId,
            };
        }

        // Check queue entry
        const entryData = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
        if (!entryData) {
            return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
        }

        const entry = JSON.parse(entryData) as TeamQueueEntry;
        const queueTimeMs = Date.now() - entry.odJoinedAt;
        const currentEloRange = calculateEloRange(queueTimeMs);

        return {
            inQueue: true,
            phase: 'finding_opponents',
            queueTimeMs,
            currentEloRange,
            partySize: entry.odMembers.length,
            targetSize: 5,
            matchId: null,
        };
    } catch (error) {
        console.error('[TeamMatchmaking] getTeamQueueStatus error:', error);
        return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
    }
}

/**
 * Get the number of teams currently in queue for a specific match type
 */
export async function getTeamQueueCount(
    matchType: 'ranked' | 'casual'
): Promise<number> {
    try {
        const redis = await getRedis();
        if (!redis) return 0;

        const queueKey = `${TEAM_QUEUE_PREFIX}${matchType}:5v5`;
        return await redis.zcard(queueKey);
    } catch (error) {
        console.error('[TeamMatchmaking] getTeamQueueCount error:', error);
        return 0;
    }
}

// =============================================================================
// TEAMMATE SEARCH (Phase 1 - For Partial Parties)
// =============================================================================

/**
 * Join the teammate search queue with a partial party (1-4 players)
 * This is Phase 1 of the two-phase matchmaking for partial parties
 */
export async function joinTeammateQueue(params: {
    partyId: string;
}): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    try {
        // Get party data
        const party = db.prepare(`
            SELECT p.id, p.leader_id, p.team_id,
                   t.name as team_name, t.tag as team_tag
            FROM parties p
            LEFT JOIN teams t ON t.id = p.team_id
            WHERE p.id = ?
        `).get(params.partyId) as any;

        if (!party) {
            return { success: false, error: 'Party not found' };
        }

        if (party.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can start teammate search' };
        }

        // Get party members (including math_tiers for tier calculation)
        const members = db.prepare(`
            SELECT pm.user_id,
                   u.name, u.level, u.equipped_items,
                   u.arena_elo_5v5, u.math_tiers
            FROM party_members pm
            JOIN users u ON u.id = pm.user_id
            WHERE pm.party_id = ?
        `).all(params.partyId) as any[];

        if (members.length >= 5) {
            return { success: false, error: 'Party already has 5 members - use regular queue' };
        }

        if (members.length === 0) {
            return { success: false, error: 'Party has no members' };
        }

        // Auto-ready the leader when they start teammate search
        db.prepare(`
            UPDATE party_members SET is_ready = 1 
            WHERE party_id = ? AND user_id = ?
        `).run(params.partyId, party.leader_id);
        console.log(`[TeamMatchmaking] Auto-readied leader ${party.leader_id} for teammate search`);

        const slotsNeeded = 5 - members.length;

        // Build queue members with tier data and PostgreSQL ELO
        const queueMembers: TeamQueueMember[] = await Promise.all(
            members.map(async (m) => {
                const equipped = m.equipped_items ? JSON.parse(m.equipped_items) : {};
                const tier = getUserTier(m.math_tiers);
                
                // Fetch 5v5 ELO from PostgreSQL (with SQLite fallback)
                let elo5v5 = 300;
                try {
                    const playerElo = await getPlayerElo(m.user_id, '5v5');
                    elo5v5 = playerElo.elo;
                    await getOrCreateArenaPlayer(m.user_id, m.name);
                } catch (error) {
                    elo5v5 = m.arena_elo_5v5 || 300;
                }
                
                return {
                    odUserId: m.user_id,
                    odUserName: m.name,
                    odElo: elo5v5,
                    odTier: tier,
                    odLevel: m.level || 1,
                    odEquippedFrame: equipped.frame || null,
                    odEquippedTitle: equipped.title || null,
                };
            })
        );

        // Calculate average ELO
        const avgElo = Math.round(
            queueMembers.reduce((sum, m) => sum + m.odElo, 0) / queueMembers.length
        );

        // Calculate average tier
        const avgTier = calculateTeamAvgTier(queueMembers);

        const leader = members.find(m => m.user_id === party.leader_id);

        const queueEntry: TeammateQueueEntry = {
            odPartyId: params.partyId,
            odLeaderId: party.leader_id,
            odLeaderName: leader?.name || 'Unknown',
            odTeamId: party.team_id || null,
            odElo: avgElo,
            odAvgTier: avgTier,
            odMode: '5v5',
            odMembers: queueMembers,
            odJoinedAt: Date.now(),
            odSlotsNeeded: slotsNeeded,
        };

        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Queue service unavailable' };
        }

        // Add to teammate queue sorted by ELO
        const queueKey = `${TEAMMATE_QUEUE_PREFIX}5v5`;
        await redis.zadd(queueKey, avgElo, params.partyId);

        // Store entry data
        await redis.set(
            `${TEAMMATE_QUEUE_PREFIX}entry:${params.partyId}`,
            JSON.stringify(queueEntry),
            'EX', QUEUE_TIMEOUT_MS / 1000
        );

        console.log(`[TeamMatchmaking] Party ${params.partyId} (${members.length}/5) joined teammate queue`);
        return { success: true };

    } catch (error: any) {
        console.error('[TeamMatchmaking] joinTeammateQueue error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Leave the teammate search queue
 */
export async function leaveTeammateQueue(partyId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Queue service unavailable' };
        }

        // Remove from queue
        const queueKey = `${TEAMMATE_QUEUE_PREFIX}5v5`;
        await redis.zrem(queueKey, partyId);

        await redis.del(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
        console.log(`[TeamMatchmaking] Party ${partyId} left teammate queue`);
        return { success: true };

    } catch (error: any) {
        console.error('[TeamMatchmaking] leaveTeammateQueue error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Leave an assembled team (during IGL selection phase)
 * This allows the original party leader to reject the assembled randoms and return to setup
 * @param assembledTeamId The assembled team ID
 * @param originalPartyId The original party ID to preserve
 */
export async function leaveAssembledTeam(
    assembledTeamId: string,
    originalPartyId: string
): Promise<{ success: boolean; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Service unavailable' };
        }

        const data = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        if (!data) {
            // Already expired or left
            console.log(`[TeamMatchmaking] Assembled team ${assembledTeamId} not found, may have expired`);
            return { success: true };
        }

        const assembled = JSON.parse(data) as AssembledTeam;

        // Verify the user is a leader of one of the original parties
        const isLeaderOfOriginalParty = assembled.odPartyIds.includes(originalPartyId);
        if (!isLeaderOfOriginalParty) {
            return { success: false, error: 'Not a member of the original party' };
        }

        // Remove the leaving party from the assembled team
        const remainingPartyIds = assembled.odPartyIds.filter(pid => pid !== originalPartyId);
        
        if (remainingPartyIds.length === 0) {
            // All parties left, delete the assembled team
            await redis.del(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
            console.log(`[TeamMatchmaking] Assembled team ${assembledTeamId} disbanded (all parties left)`);
        } else {
            // Remove members from the leaving party
            const leavingMemberIds = assembled.odMembers
                .filter(m => m.odOriginalPartyId === originalPartyId)
                .map(m => m.odUserId);
            
            assembled.odMembers = assembled.odMembers.filter(m => m.odOriginalPartyId !== originalPartyId);
            assembled.odPartyIds = remainingPartyIds;
            
            // Clear IGL/Anchor if they were from the leaving party
            if (leavingMemberIds.includes(assembled.odIglId || '')) {
                assembled.odIglId = null;
            }
            if (leavingMemberIds.includes(assembled.odAnchorId || '')) {
                assembled.odAnchorId = null;
            }
            
            // Clear votes from leaving members
            for (const memberId of leavingMemberIds) {
                for (const uid of Object.keys(assembled.odIglVotes)) {
                    assembled.odIglVotes[uid] = assembled.odIglVotes[uid].filter(v => v !== memberId);
                }
                for (const uid of Object.keys(assembled.odAnchorVotes)) {
                    assembled.odAnchorVotes[uid] = assembled.odAnchorVotes[uid].filter(v => v !== memberId);
                }
            }
            
            // Re-queue remaining parties back to teammate search
            await redis.set(
                `${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`,
                JSON.stringify(assembled),
                'EX', 30 // Short TTL - they'll need to re-find teammates
            );
            
            console.log(`[TeamMatchmaking] Party ${originalPartyId} left assembled team ${assembledTeamId}, ${assembled.odMembers.length} members remain`);
        }

        // Return the original party members to their party (they're still in the DB)
        console.log(`[TeamMatchmaking] Party ${originalPartyId} returned to setup`);
        return { success: true };

    } catch (error: any) {
        console.error('[TeamMatchmaking] leaveAssembledTeam error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check for teammates and potentially form a full team
 * Returns the assembled team ID if team is formed
 */
export async function checkForTeammates(partyId: string): Promise<{
    status: TeamQueueStatus;
    assembledTeam?: AssembledTeam;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user?.id) {
        return {
            status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            error: 'Not authenticated'
        };
    }

    try {
        const redis = await getRedis();
        if (!redis) {
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
                error: 'Queue service unavailable'
            };
        }

        // Check if already in assembled team
        const assembledTeamId = await redis.get(`${ASSEMBLED_TEAM_PREFIX}party:${partyId}`);
        if (assembledTeamId) {
            const assembledData = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
            if (assembledData) {
                const assembled = JSON.parse(assembledData) as AssembledTeam;
                return {
                    status: {
                        inQueue: true,
                        phase: 'igl_selection',
                        queueTimeMs: Date.now() - assembled.odSelectionStartedAt,
                        currentEloRange: 0,
                        partySize: assembled.odMembers.length,
                        targetSize: 5,
                        matchId: null,
                        assembledTeamId: assembled.id,
                    },
                    assembledTeam: assembled,
                };
            }
        }

        // Get our queue entry
        const entryData = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
        if (!entryData) {
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            };
        }

        const entry = JSON.parse(entryData) as TeammateQueueEntry;
        const queueTimeMs = Date.now() - entry.odJoinedAt;
        const currentEloRange = calculateEloRange(queueTimeMs);

        // Check queue timeout
        if (queueTimeMs > QUEUE_TIMEOUT_MS) {
            await leaveTeammateQueue(partyId);
            return {
                status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: entry.odMembers.length, targetSize: 5, matchId: null },
                error: 'Queue timeout - no teammates found',
            };
        }

        // Try to find compatible parties to merge
        const queueKey = `${TEAMMATE_QUEUE_PREFIX}5v5`;
        const minElo = entry.odElo - currentEloRange;
        const maxElo = entry.odElo + currentEloRange;

        const candidates = await redis.zrangebyscore(queueKey, minElo, maxElo) as string[];

        // Find parties that together sum to exactly 5 players
        const partiesToMerge: TeammateQueueEntry[] = [entry];
        let totalPlayers = entry.odMembers.length;

        for (const candidatePartyId of candidates) {
            if (candidatePartyId === partyId) continue;
            if (totalPlayers >= 5) break;

            const candidateData = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${candidatePartyId}`);
            if (!candidateData) continue;

            const candidate = JSON.parse(candidateData) as TeammateQueueEntry;

            // Check if adding this party would exceed or equal 5
            if (totalPlayers + candidate.odMembers.length <= 5) {
                // Verify ELO compatibility from candidate's perspective
                const candidateQueueTime = Date.now() - candidate.odJoinedAt;
                const candidateEloRange = calculateEloRange(candidateQueueTime);
                
                const eloCompatible = Math.abs(candidate.odElo - entry.odElo) <= Math.max(currentEloRange, candidateEloRange);
                
                // Check tier compatibility
                const entryTier = entry.odAvgTier ?? DEFAULT_TIER;
                const candidateTier = candidate.odAvgTier ?? DEFAULT_TIER;
                const tierCompatible = Math.abs(candidateTier - entryTier) <= TEAM_TIER_RANGE;
                
                if (eloCompatible && tierCompatible) {
                    partiesToMerge.push(candidate);
                    totalPlayers += candidate.odMembers.length;
                }
            }
        }

        // Check if we have exactly 5 players
        if (totalPlayers === 5) {
            // Form the assembled team!
            const assembledId = uuidv4();
            const allMembers = partiesToMerge.flatMap(p => p.odMembers);
            const avgElo = Math.round(allMembers.reduce((sum, m) => sum + m.odElo, 0) / allMembers.length);
            const avgTier = calculateTeamAvgTier(allMembers);

            // Determine largest party leader (for decision-making priority)
            const largestParty = partiesToMerge.reduce((a, b) => 
                a.odMembers.length >= b.odMembers.length ? a : b
            );

            const assembledTeam: AssembledTeam = {
                id: assembledId,
                odPartyIds: partiesToMerge.map(p => p.odPartyId),
                odMembers: allMembers,
                odElo: avgElo,
                odAvgTier: avgTier,
                odMode: '5v5',
                odIglId: null,
                odAnchorId: null,
                odIglVotes: {},
                odAnchorVotes: {},
                odSelectionStartedAt: Date.now(),
                odLargestPartyLeaderId: largestParty.odLeaderId,
            };

            // Store assembled team
            await redis.set(
                `${ASSEMBLED_TEAM_PREFIX}${assembledId}`,
                JSON.stringify(assembledTeam),
                'EX', 120 // 2 minute expiry for IGL selection
            );

            // Link all parties to assembled team
            for (const p of partiesToMerge) {
                await redis.set(
                    `${ASSEMBLED_TEAM_PREFIX}party:${p.odPartyId}`,
                    assembledId,
                    'EX', 120
                );
                // Remove from teammate queue
                await redis.zrem(queueKey, p.odPartyId);
                await redis.del(`${TEAMMATE_QUEUE_PREFIX}entry:${p.odPartyId}`);
            }

            console.log(`[TeamMatchmaking] Assembled team ${assembledId} from ${partiesToMerge.length} parties`);

            return {
                status: {
                    inQueue: true,
                    phase: 'igl_selection',
                    queueTimeMs,
                    currentEloRange: 0,
                    partySize: 5,
                    targetSize: 5,
                    matchId: null,
                    assembledTeamId: assembledId,
                },
                assembledTeam,
            };
        }

        // Still searching
        return {
            status: {
                inQueue: true,
                phase: 'finding_teammates',
                queueTimeMs,
                currentEloRange,
                partySize: entry.odMembers.length,
                targetSize: 5,
                matchId: null,
            },
        };

    } catch (error: any) {
        console.error('[TeamMatchmaking] checkForTeammates error:', error);
        return {
            status: { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null },
            error: error.message,
        };
    }
}

// =============================================================================
// IGL SELECTION (Phase 2 - After Team Assembly)
// =============================================================================

/**
 * Get the assembled team data
 */
export async function getAssembledTeam(assembledTeamId: string): Promise<AssembledTeam | null> {
    try {
        const redis = await getRedis();
        if (!redis) return null;

        const data = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        if (!data) return null;

        return JSON.parse(data) as AssembledTeam;
    } catch (error) {
        console.error('[TeamMatchmaking] getAssembledTeam error:', error);
        return null;
    }
}

/**
 * Vote or select IGL for an assembled team
 */
export async function selectIGL(
    assembledTeamId: string,
    iglUserId: string,
    isVote: boolean = false
): Promise<{ success: boolean; error?: string; assembledTeam?: AssembledTeam }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const voterId = session.user.id;

    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Service unavailable' };
        }

        const data = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        if (!data) {
            return { success: false, error: 'Assembled team not found' };
        }

        const assembled = JSON.parse(data) as AssembledTeam;

        // Verify voter is a member
        const isMember = assembled.odMembers.some(m => m.odUserId === voterId);
        if (!isMember) {
            return { success: false, error: 'Not a member of this team' };
        }

        // Verify target is a member
        const targetMember = assembled.odMembers.find(m => m.odUserId === iglUserId);
        if (!targetMember) {
            return { success: false, error: 'Target is not a member of this team' };
        }

        if (isVote) {
            // Vote mode - add vote
            if (!assembled.odIglVotes[iglUserId]) {
                assembled.odIglVotes[iglUserId] = [];
            }
            // Remove previous vote
            for (const uid of Object.keys(assembled.odIglVotes)) {
                assembled.odIglVotes[uid] = assembled.odIglVotes[uid].filter(v => v !== voterId);
            }
            // Add new vote
            assembled.odIglVotes[iglUserId].push(voterId);

            // Check if majority reached (3+ of 5)
            const topVotes = Math.max(...Object.values(assembled.odIglVotes).map(v => v.length));
            if (topVotes >= 3) {
                const winner = Object.entries(assembled.odIglVotes)
                    .find(([_, voters]) => voters.length === topVotes)?.[0];
                if (winner) {
                    assembled.odIglId = winner;
                }
            }
        } else {
            // Direct selection (largest party leader only)
            if (voterId !== assembled.odLargestPartyLeaderId) {
                return { success: false, error: 'Only the original party leader can directly select IGL' };
            }
            assembled.odIglId = iglUserId;
        }

        // Save updated assembled team
        await redis.set(
            `${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`,
            JSON.stringify(assembled),
            'EX', 120
        );

        return { success: true, assembledTeam: assembled };

    } catch (error: any) {
        console.error('[TeamMatchmaking] selectIGL error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Vote or select Anchor for an assembled team
 */
export async function selectAnchor(
    assembledTeamId: string,
    anchorUserId: string,
    isVote: boolean = false
): Promise<{ success: boolean; error?: string; assembledTeam?: AssembledTeam }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const voterId = session.user.id;

    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Service unavailable' };
        }

        const data = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        if (!data) {
            return { success: false, error: 'Assembled team not found' };
        }

        const assembled = JSON.parse(data) as AssembledTeam;

        // Verify voter is a member
        const isMember = assembled.odMembers.some(m => m.odUserId === voterId);
        if (!isMember) {
            return { success: false, error: 'Not a member of this team' };
        }

        // Verify target is a member and not the IGL
        const targetMember = assembled.odMembers.find(m => m.odUserId === anchorUserId);
        if (!targetMember) {
            return { success: false, error: 'Target is not a member of this team' };
        }
        if (anchorUserId === assembled.odIglId) {
            return { success: false, error: 'IGL cannot also be the Anchor' };
        }

        if (isVote) {
            // Vote mode
            if (!assembled.odAnchorVotes[anchorUserId]) {
                assembled.odAnchorVotes[anchorUserId] = [];
            }
            // Remove previous vote
            for (const uid of Object.keys(assembled.odAnchorVotes)) {
                assembled.odAnchorVotes[uid] = assembled.odAnchorVotes[uid].filter(v => v !== voterId);
            }
            // Add new vote
            assembled.odAnchorVotes[anchorUserId].push(voterId);

            // Check if majority reached
            const topVotes = Math.max(...Object.values(assembled.odAnchorVotes).map(v => v.length));
            if (topVotes >= 3) {
                const winner = Object.entries(assembled.odAnchorVotes)
                    .find(([_, voters]) => voters.length === topVotes)?.[0];
                if (winner) {
                    assembled.odAnchorId = winner;
                }
            }
        } else {
            // Direct selection
            if (voterId !== assembled.odLargestPartyLeaderId) {
                return { success: false, error: 'Only the original party leader can directly select Anchor' };
            }
            assembled.odAnchorId = anchorUserId;
        }

        // Save updated assembled team
        await redis.set(
            `${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`,
            JSON.stringify(assembled),
            'EX', 120
        );

        return { success: true, assembledTeam: assembled };

    } catch (error: any) {
        console.error('[TeamMatchmaking] selectAnchor error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Confirm IGL selection and move to opponent search (Phase 3)
 * Creates a temporary unified party and joins the main team queue
 */
export async function confirmIGLSelection(
    assembledTeamId: string
): Promise<{ success: boolean; partyId?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Service unavailable' };
        }

        const data = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        if (!data) {
            return { success: false, error: 'Assembled team not found or expired' };
        }

        const assembled = JSON.parse(data) as AssembledTeam;

        // Verify IGL and Anchor are set
        if (!assembled.odIglId || !assembled.odAnchorId) {
            return { success: false, error: 'IGL and Anchor must be selected' };
        }

        const db = getDatabase();

        // Create a new unified party for the assembled team
        const newPartyId = generateId();
        const nowTime = now();

        db.prepare(`
            INSERT INTO parties (id, leader_id, created_at, invite_mode, igl_id, anchor_id, target_mode)
            VALUES (?, ?, ?, 'invite_only', ?, ?, '5v5')
        `).run(newPartyId, assembled.odLargestPartyLeaderId, nowTime, assembled.odIglId, assembled.odAnchorId);

        // Add all members to the new party
        for (const member of assembled.odMembers) {
            const isLeader = member.odUserId === assembled.odLargestPartyLeaderId ? 1 : 0;
            db.prepare(`
                INSERT INTO party_members (id, party_id, user_id, joined_at, is_ready, preferred_operation)
                VALUES (?, ?, ?, ?, 1, ?)
            `).run(
                generateId(),
                newPartyId,
                member.odUserId,
                nowTime,
                member.odPreferredOperation
            );
        }

        // Remove members from original parties
        for (const originalPartyId of assembled.odPartyIds) {
            db.prepare('DELETE FROM party_members WHERE party_id = ?').run(originalPartyId);
            db.prepare('DELETE FROM parties WHERE id = ?').run(originalPartyId);
        }

        // Clean up assembled team data
        await redis.del(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
        for (const pid of assembled.odPartyIds) {
            await redis.del(`${ASSEMBLED_TEAM_PREFIX}party:${pid}`);
        }

        // Join the main team queue with the new unified party
        const joinResult = await joinTeamQueue({
            partyId: newPartyId,
            matchType: 'ranked', // Assembled teams from partial parties go to ranked
        });

        if (!joinResult.success) {
            return { success: false, error: joinResult.error };
        }

        console.log(`[TeamMatchmaking] Assembled team ${assembledTeamId} confirmed, created party ${newPartyId}`);
        return { success: true, partyId: newPartyId };

    } catch (error: any) {
        console.error('[TeamMatchmaking] confirmIGLSelection error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get teammate queue status
 */
export async function getTeammateQueueStatus(partyId: string): Promise<TeamQueueStatus> {
    try {
        const redis = await getRedis();
        if (!redis) {
            return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
        }

        // Check if in assembled team
        const assembledTeamId = await redis.get(`${ASSEMBLED_TEAM_PREFIX}party:${partyId}`);
        if (assembledTeamId) {
            const assembledData = await redis.get(`${ASSEMBLED_TEAM_PREFIX}${assembledTeamId}`);
            if (assembledData) {
                const assembled = JSON.parse(assembledData) as AssembledTeam;
                return {
                    inQueue: true,
                    phase: 'igl_selection',
                    queueTimeMs: Date.now() - assembled.odSelectionStartedAt,
                    currentEloRange: 0,
                    partySize: assembled.odMembers.length,
                    targetSize: 5,
                    matchId: null,
                    assembledTeamId: assembled.id,
                };
            }
        }

        // Check teammate queue
        const entryData = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
        if (!entryData) {
            return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
        }

        const entry = JSON.parse(entryData) as TeammateQueueEntry;
        const queueTimeMs = Date.now() - entry.odJoinedAt;
        const currentEloRange = calculateEloRange(queueTimeMs);

        return {
            inQueue: true,
            phase: 'finding_teammates',
            queueTimeMs,
            currentEloRange,
            partySize: entry.odMembers.length,
            targetSize: 5,
            matchId: null,
        };

    } catch (error) {
        console.error('[TeamMatchmaking] getTeammateQueueStatus error:', error);
        return { inQueue: false, phase: null, queueTimeMs: 0, currentEloRange: 0, partySize: 0, targetSize: 5, matchId: null };
    }
}

// =============================================================================
// AI TEAM MATCH (For Testing)
// =============================================================================

export type BotDifficulty = 'easy' | 'medium' | 'hard' | 'impossible';

/**
 * Create an instant match against an AI team
 * Used for testing the 5v5 match flow and UI
 */
export async function createAITeamMatch(params: {
    partyId: string;
    difficulty?: BotDifficulty;
}): Promise<{ success: boolean; matchId?: string; error?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Not authenticated' };
    }

    const db = getDatabase();
    const userId = session.user.id;

    try {
        // Get party data
        const party = db.prepare(`
            SELECT p.id, p.leader_id, p.igl_id, p.anchor_id, p.team_id,
                   t.name as team_name, t.tag as team_tag
            FROM parties p
            LEFT JOIN teams t ON t.id = p.team_id
            WHERE p.id = ?
        `).get(params.partyId) as any;

        if (!party) {
            return { success: false, error: 'Party not found' };
        }

        // Verify user is party leader
        if (party.leader_id !== userId) {
            return { success: false, error: 'Only the party leader can start an AI match' };
        }

        // Get party members
        const members = db.prepare(`
            SELECT pm.user_id, pm.is_ready, pm.preferred_operation,
                   u.name, u.level, u.equipped_items,
                   u.arena_elo_5v5
            FROM party_members pm
            JOIN users u ON u.id = pm.user_id
            WHERE pm.party_id = ?
        `).all(params.partyId) as any[];

        if (members.length < 5) {
            return { success: false, error: 'Party must have 5 members to start an AI match' };
        }

        // Get Leader, IGL and Anchor names
        const leader = members.find(m => m.user_id === party.leader_id);
        const igl = members.find(m => m.user_id === party.igl_id);
        const anchor = members.find(m => m.user_id === party.anchor_id);

        // Build human team queue entry
        const queueMembers: TeamQueueMember[] = members.map(m => {
            const equipped = m.equipped_items ? JSON.parse(m.equipped_items) : {};
            return {
                odUserId: m.user_id,
                odUserName: m.name,
                odElo: m.arena_elo_5v5 || 300,
                odTier: DEFAULT_TIER, // Default tier for AI matches
                odLevel: m.level || 1,
                odEquippedFrame: equipped.frame || null,
                odEquippedTitle: equipped.title || null,
                odPreferredOperation: m.preferred_operation || null,
            };
        });

        // Calculate average ELO for the human team
        const avgElo = Math.round(
            queueMembers.reduce((sum, m) => sum + m.odElo, 0) / queueMembers.length
        );

        // Calculate average tier
        const avgTier = calculateTeamAvgTier(queueMembers);

        const humanTeam: TeamQueueEntry = {
            odPartyId: params.partyId,
            odTeamId: party.team_id || null,
            odTeamName: party.team_name || 'Team Alpha',
            odTeamTag: party.team_tag || null,
            odLeaderId: party.leader_id,
            odLeaderName: leader?.name || 'Unknown',
            odElo: avgElo,
            odAvgTier: avgTier,
            odMode: '5v5',
            odMatchType: 'casual', // AI matches are casual
            odIglId: party.igl_id || party.leader_id,
            odIglName: igl?.name || 'Unknown',
            odAnchorId: party.anchor_id || members[0]?.user_id,
            odAnchorName: anchor?.name || 'Unknown',
            odMembers: queueMembers,
            odJoinedAt: Date.now(),
        };

        // Generate match ID
        const matchId = uuidv4();

        // Generate AI team - this will be created on the server side
        // We store the match config in Redis for the server to pick up
        const redis = await getRedis();
        if (!redis) {
            return { success: false, error: 'Queue service unavailable' };
        }

        // Store match setup for server to initialize
        const matchSetup = {
            matchId,
            humanTeam,
            isAIMatch: true,
            aiDifficulty: params.difficulty || 'medium',
            targetElo: avgElo,
            createdAt: Date.now(),
        };

        await redis.set(
            `${TEAM_MATCH_PREFIX}setup:${matchId}`,
            JSON.stringify(matchSetup),
            'EX', 300 // 5 minute expiry
        );

        // Also store as regular match for human team
        await redis.set(
            `${TEAM_MATCH_PREFIX}${params.partyId}`,
            JSON.stringify({
                matchId,
                odTeam1: humanTeam,
                odTeam2: null, // AI team will be generated server-side
                isAIMatch: true,
            }),
            'EX', 300
        );

        console.log(`[TeamMatchmaking] AI Match created: ${matchId} for party ${params.partyId} (difficulty: ${params.difficulty || 'medium'})`);
        return { success: true, matchId };

    } catch (error: any) {
        console.error('[TeamMatchmaking] createAITeamMatch error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if a match is against an AI team
 */
export async function isAIMatch(matchId: string): Promise<boolean> {
    try {
        const redis = await getRedis();
        if (!redis) return false;

        const setupData = await redis.get(`${TEAM_MATCH_PREFIX}setup:${matchId}`);
        if (!setupData) return false;

        const setup = JSON.parse(setupData);
        return setup.isAIMatch === true;
    } catch (error) {
        console.error('[TeamMatchmaking] isAIMatch error:', error);
        return false;
    }
}

/**
 * Get AI match setup data (for server to initialize the match)
 */
export async function getAIMatchSetup(matchId: string): Promise<{
    matchId: string;
    humanTeam: TeamQueueEntry;
    isAIMatch: boolean;
    aiDifficulty: BotDifficulty;
    targetElo: number;
} | null> {
    try {
        const redis = await getRedis();
        if (!redis) return null;

        const setupData = await redis.get(`${TEAM_MATCH_PREFIX}setup:${matchId}`);
        if (!setupData) return null;

        return JSON.parse(setupData);
    } catch (error) {
        console.error('[TeamMatchmaking] getAIMatchSetup error:', error);
        return null;
    }
}

// =============================================================================
// QUEUE STATE RECONCILIATION
// =============================================================================

/**
 * Reconcile queue state between SQLite and Redis
 * Call this periodically or on server startup to clean up stale entries
 */
export async function reconcileQueueState(): Promise<{
    success: boolean;
    fixed: number;
    errors: string[];
}> {
    const db = getDatabase();
    const errors: string[] = [];
    let fixed = 0;

    try {
        const redis = await getRedis();
        if (!redis) {
            return { success: false, fixed: 0, errors: ['Redis unavailable'] };
        }

        // 1. Find parties with queue_status set in SQLite
        const partiesInQueue = db.prepare(`
            SELECT id, queue_status, queue_started_at
            FROM parties
            WHERE queue_status IS NOT NULL
        `).all() as { id: string; queue_status: string; queue_started_at: string }[];

        for (const party of partiesInQueue) {
            // Check if party exists in Redis queue
            const teamEntry = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${party.id}`);
            const teammateEntry = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${party.id}`);

            if (!teamEntry && !teammateEntry) {
                // Party thinks it's in queue (SQLite) but not in Redis
                // Clear SQLite queue status
                db.prepare(`
                    UPDATE parties 
                    SET queue_status = NULL, queue_started_at = NULL 
                    WHERE id = ?
                `).run(party.id);
                fixed++;
                console.log(`[TeamMatchmaking] Reconcile: Cleared stale SQLite queue status for party ${party.id}`);
            }
        }

        // 2. Find stale Redis entries (older than queue timeout)
        const queueKeys = [
            `${TEAM_QUEUE_PREFIX}ranked:5v5`,
            `${TEAM_QUEUE_PREFIX}casual:5v5`,
            `${TEAMMATE_QUEUE_PREFIX}5v5`
        ];

        for (const queueKey of queueKeys) {
            const allParties = await redis.zrange(queueKey, 0, -1) as string[];
            
            for (const partyId of allParties) {
                // Check if party still exists and has members
                const partyExists = db.prepare(`
                    SELECT COUNT(*) as count FROM party_members WHERE party_id = ?
                `).get(partyId) as { count: number };

                if (!partyExists || partyExists.count === 0) {
                    // Party no longer exists or has no members - remove from Redis
                    await redis.zrem(queueKey, partyId);
                    await redis.del(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
                    await redis.del(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);
                    fixed++;
                    console.log(`[TeamMatchmaking] Reconcile: Removed orphaned Redis entry for party ${partyId}`);
                }
            }
        }

        console.log(`[TeamMatchmaking] Queue reconciliation complete: ${fixed} entries fixed`);
        return { success: true, fixed, errors };

    } catch (error: any) {
        console.error('[TeamMatchmaking] reconcileQueueState error:', error);
        errors.push(error.message);
        return { success: false, fixed, errors };
    }
}

/**
 * Validate party queue state before operations
 * Returns true if state is consistent, false if needs reconciliation
 */
export async function validatePartyQueueState(partyId: string): Promise<{
    isValid: boolean;
    sqliteStatus: string | null;
    redisStatus: 'team_queue' | 'teammate_queue' | 'match_found' | null;
    needsReconciliation: boolean;
}> {
    const db = getDatabase();

    try {
        const redis = await getRedis();
        
        // Get SQLite state
        const party = db.prepare(`
            SELECT queue_status FROM parties WHERE id = ?
        `).get(partyId) as { queue_status: string | null } | undefined;

        const sqliteStatus = party?.queue_status || null;

        if (!redis) {
            return {
                isValid: !sqliteStatus, // Valid only if not in queue
                sqliteStatus,
                redisStatus: null,
                needsReconciliation: !!sqliteStatus
            };
        }

        // Check Redis state
        const TEAM_MATCH_PREFIX_LOCAL = 'team:match:';
        const matchData = await redis.get(`${TEAM_MATCH_PREFIX_LOCAL}${partyId}`);
        const teamEntry = await redis.get(`${TEAM_QUEUE_PREFIX}entry:${partyId}`);
        const teammateEntry = await redis.get(`${TEAMMATE_QUEUE_PREFIX}entry:${partyId}`);

        let redisStatus: 'team_queue' | 'teammate_queue' | 'match_found' | null = null;
        if (matchData) redisStatus = 'match_found';
        else if (teamEntry) redisStatus = 'team_queue';
        else if (teammateEntry) redisStatus = 'teammate_queue';

        // Determine if states are consistent
        const needsReconciliation = (!!sqliteStatus !== !!redisStatus);

        return {
            isValid: !needsReconciliation,
            sqliteStatus,
            redisStatus,
            needsReconciliation
        };

    } catch (error: any) {
        console.error('[TeamMatchmaking] validatePartyQueueState error:', error);
        return {
            isValid: false,
            sqliteStatus: null,
            redisStatus: null,
            needsReconciliation: true
        };
    }
}

