'use server';

/* eslint-disable @typescript-eslint/no-explicit-any -- Database query results and Redis operations use any types */

/**
 * Arena Matchmaking Server Actions
 * Real-time matchmaking using Redis for queue management
 * 
 * Database usage:
 * - PostgreSQL: Player ELO, match history (via arena-db)
 * - SQLite: User profiles, practice data
 * - Redis: Real-time queue state
 */

import { auth } from "@/auth";
import { v4 as uuidv4 } from 'uuid';
import { 
    getPlayerElo as getPlayerEloFromPostgres,
    getOrCreateArenaPlayer,
    getFullArenaStats,
    updatePlayerOperationElo,
    updatePlayerTeamOperationElo,
} from "@/lib/arena/arena-db";

// Redis client for matchmaking
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Redis client type
let redisClient: any = null;

async function getRedis() {
    if (redisClient) return redisClient;

    try {
        const Redis = (await import('ioredis')).default;
        // IMPORTANT: Must match server-redis.js default ('localhost') for local development
        redisClient = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            maxRetriesPerRequest: 3,
        });
        return redisClient;
    } catch (error) {
        console.error('[Matchmaking] Redis connection failed:', error);
        return null;
    }
}

interface QueueEntry {
    odUserId: string;
    odUserName: string;
    odElo: number;
    odTier: number;             // Player's tier (1-100, 100-tier system)
    odOperation: string;
    odMode: string;
    odEquippedBanner: string;
    odEquippedTitle: string;
    odLevel: number;
    odRank: string;             // Player's rank (Bronze, Silver, Gold, etc.)
    odDivision: string;         // Player's division (I, II, III, IV)
    odJoinedAt: number;
    odConfidence: number;       // Player confidence score (0-1)
    odIsReturningPlayer: boolean; // Flagged as returning player
}

interface MatchResult {
    matchId: string;
    odPlayer1: QueueEntry;
    odPlayer2: QueueEntry | null; // null if AI opponent
    odIsAiMatch: boolean;
}

// Import matchmaking constants from shared config
import { MATCHMAKING, PLACEMENT } from '@/lib/arena/constants.js';

const QUEUE_PREFIX = 'arena:queue:';
const MATCH_PREFIX = 'arena:match:';

// Matchmaking thresholds from constants (100-tier system)
const TIER_RANGE = MATCHMAKING.TIER_RANGE;                    // ±20 tiers (one band width)
const INITIAL_ELO_RANGE = MATCHMAKING.INITIAL_ELO_RANGE;      // ±50 ELO to start
const ELO_EXPANSION_RATE = MATCHMAKING.ELO_EXPANSION_RATE;    // +25 ELO per interval
const ELO_EXPANSION_INTERVAL = MATCHMAKING.ELO_EXPANSION_INTERVAL / 1000; // 10 seconds (convert to seconds)
const MAX_ELO_RANGE = MATCHMAKING.MAX_ELO_RANGE;              // ±300 ELO max
const AI_TIMEOUT_MS = MATCHMAKING.AI_FALLBACK_TIMEOUT;        // 15 seconds for AI fallback

// Confidence-based matchmaking (replaces hard gating)
const CONFIDENCE_BRACKETS = MATCHMAKING.CONFIDENCE_BRACKETS;
const CONFIDENCE_BRACKET_WEIGHT = MATCHMAKING.CONFIDENCE_BRACKET_WEIGHT;
const HIGH_RANK_ELO_THRESHOLD = MATCHMAKING.HIGH_RANK_ELO_THRESHOLD;

/**
 * Get confidence bracket for a player
 */
function getConfidenceBracket(confidence: number): keyof typeof CONFIDENCE_BRACKETS {
    if (confidence >= CONFIDENCE_BRACKETS.ESTABLISHED.min) return 'ESTABLISHED';
    if (confidence >= CONFIDENCE_BRACKETS.DEVELOPING.min) return 'DEVELOPING';
    return 'NEWCOMER';
}

// =============================================================================
// MATCH REASONING - For FlashAuditor Match History
// =============================================================================

/**
 * Match factor that contributed to the matchmaking decision
 */
export interface MatchFactor {
    type: 'elo' | 'tier' | 'confidence' | 'returning' | 'queue_time' | 'ai_fallback';
    label: string;
    description: string;
    impact: 'positive' | 'neutral' | 'negative';
}

/**
 * Complete matchmaking reasoning for a match
 */
export interface MatchReasoning {
    qualityScore: number;           // 0-100, how good the match was
    eloDiff: number;                // ELO difference
    tierDiff: number;               // Practice tier difference  
    playerBracket: string;          // NEWCOMER | DEVELOPING | ESTABLISHED
    opponentBracket: string;        // NEWCOMER | DEVELOPING | ESTABLISHED
    factors: MatchFactor[];         // Array of contributing factors
    isAiMatch: boolean;
    queueTimeSeconds: number;
}

/**
 * Get tier band name for display
 */
function getTierBandName(tier: number): string {
    if (tier <= 20) return 'Foundation (1-20)';
    if (tier <= 40) return 'Intermediate (21-40)';
    if (tier <= 60) return 'Advanced (41-60)';
    if (tier <= 80) return 'Expert (61-80)';
    return 'Master (81-100)';
}

/**
 * Generate match reasoning based on matchmaking parameters
 * Internal sync version for use within this file
 */
function generateMatchReasoningSync(params: {
    playerElo: number;
    playerTier: number;
    playerConfidence: number;
    playerIsReturning: boolean;
    opponentElo: number;
    opponentTier: number;
    opponentConfidence: number;
    opponentIsReturning: boolean;
    queueTimeSeconds: number;
    isAiMatch: boolean;
}): MatchReasoning {
    const factors: MatchFactor[] = [];
    let qualityScore = 100; // Start with perfect score, deduct for discrepancies

    const eloDiff = Math.abs(params.playerElo - params.opponentElo);
    const tierDiff = Math.abs(params.playerTier - params.opponentTier);
    const playerBracket = getConfidenceBracket(params.playerConfidence);
    const opponentBracket = getConfidenceBracket(params.opponentConfidence);

    // --- ELO Factor ---
    if (eloDiff <= 50) {
        factors.push({
            type: 'elo',
            label: 'Close ELO',
            description: `Only ${eloDiff} ELO difference - very balanced match`,
            impact: 'positive'
        });
    } else if (eloDiff <= 150) {
        factors.push({
            type: 'elo',
            label: 'Similar ELO',
            description: `${eloDiff} ELO difference - fair match`,
            impact: 'positive'
        });
        qualityScore -= Math.floor((eloDiff - 50) / 10); // Slight deduction
    } else {
        factors.push({
            type: 'elo',
            label: 'ELO Gap',
            description: `${eloDiff} ELO difference - expanded range after ${params.queueTimeSeconds}s queue`,
            impact: 'negative'
        });
        qualityScore -= Math.min(30, Math.floor((eloDiff - 150) / 5));
    }

    // --- Tier Factor ---
    const playerTierBand = getTierBandName(params.playerTier);
    const opponentTierBand = getTierBandName(params.opponentTier);
    
    if (playerTierBand === opponentTierBand) {
        factors.push({
            type: 'tier',
            label: 'Same Tier Band',
            description: `Both in ${playerTierBand}`,
            impact: 'positive'
        });
    } else if (tierDiff <= 20) {
        factors.push({
            type: 'tier',
            label: 'Adjacent Tiers',
            description: `${tierDiff} tier difference (${playerTierBand} vs ${opponentTierBand})`,
            impact: 'neutral'
        });
        qualityScore -= 5;
    } else {
        factors.push({
            type: 'tier',
            label: 'Tier Gap',
            description: `${tierDiff} tier difference - wider search`,
            impact: 'negative'
        });
        qualityScore -= 10;
    }

    // --- Confidence Bracket Factor ---
    if (playerBracket === opponentBracket) {
        factors.push({
            type: 'confidence',
            label: 'Experience Match',
            description: `Both are ${playerBracket} players`,
            impact: 'positive'
        });
    } else {
        factors.push({
            type: 'confidence',
            label: 'Mixed Experience',
            description: `${playerBracket} vs ${opponentBracket}`,
            impact: 'neutral'
        });
        qualityScore -= 5;
    }

    // --- Returning Player Factor ---
    if (params.playerIsReturning && params.opponentIsReturning) {
        factors.push({
            type: 'returning',
            label: 'Returning Players',
            description: 'Both players are recalibrating ranks',
            impact: 'positive'
        });
    } else if (params.playerIsReturning || params.opponentIsReturning) {
        factors.push({
            type: 'returning',
            label: 'Placement Match',
            description: params.playerIsReturning 
                ? 'You are in placement - ELO changes doubled'
                : 'Opponent is in placement',
            impact: 'neutral'
        });
    }

    // --- Queue Time Factor ---
    if (params.queueTimeSeconds <= 5) {
        factors.push({
            type: 'queue_time',
            label: 'Instant Match',
            description: `Found in ${params.queueTimeSeconds}s`,
            impact: 'positive'
        });
    } else if (params.queueTimeSeconds <= 15) {
        factors.push({
            type: 'queue_time',
            label: 'Quick Match',
            description: `Found in ${params.queueTimeSeconds}s`,
            impact: 'positive'
        });
    } else {
        factors.push({
            type: 'queue_time',
            label: 'Extended Search',
            description: `${params.queueTimeSeconds}s queue - widened search range`,
            impact: 'neutral'
        });
    }

    // --- AI Fallback Factor ---
    if (params.isAiMatch) {
        factors.push({
            type: 'ai_fallback',
            label: 'AI Opponent',
            description: `No players available after ${params.queueTimeSeconds}s - matched with AI`,
            impact: 'neutral'
        });
        qualityScore = Math.max(50, qualityScore - 20); // AI matches cap at lower quality
    }

    // Clamp quality score
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    return {
        qualityScore,
        eloDiff,
        tierDiff,
        playerBracket,
        opponentBracket,
        factors,
        isAiMatch: params.isAiMatch,
        queueTimeSeconds: params.queueTimeSeconds
    };
}

/**
 * Generate match reasoning - Async export for server action compatibility
 */
export async function generateMatchReasoning(params: {
    playerElo: number;
    playerTier: number;
    playerConfidence: number;
    playerIsReturning: boolean;
    opponentElo: number;
    opponentTier: number;
    opponentConfidence: number;
    opponentIsReturning: boolean;
    queueTimeSeconds: number;
    isAiMatch: boolean;
}): Promise<MatchReasoning> {
    return generateMatchReasoningSync(params);
}

/**
 * Calculate match quality score between two players
 * Lower score = better match
 */
function calculateMatchScore(
    player1: { elo: number; confidence: number; tier: number },
    player2: { elo: number; confidence: number; tier: number }
): number {
    let score = 0;
    
    // ELO difference (primary factor)
    score += Math.abs(player1.elo - player2.elo);
    
    // Confidence bracket mismatch penalty
    const p1Bracket = getConfidenceBracket(player1.confidence);
    const p2Bracket = getConfidenceBracket(player2.confidence);
    if (p1Bracket !== p2Bracket) {
        score += CONFIDENCE_BRACKET_WEIGHT;
    }
    
    // High rank quality matching: stricter at Diamond+
    if (player1.elo >= HIGH_RANK_ELO_THRESHOLD || player2.elo >= HIGH_RANK_ELO_THRESHOLD) {
        // At high ranks, confidence mismatch is more penalized
        if (p1Bracket !== p2Bracket) {
            score += CONFIDENCE_BRACKET_WEIGHT; // Double penalty at high ranks
        }
    }
    
    return score;
}

/**
 * Calculate the current ELO range based on queue time
 * Starts at INITIAL_ELO_RANGE and expands every ELO_EXPANSION_INTERVAL seconds
 */
function calculateEloRange(queueTimeSeconds: number): number {
    const expansions = Math.floor(queueTimeSeconds / ELO_EXPANSION_INTERVAL);
    const expandedRange = INITIAL_ELO_RANGE + (expansions * ELO_EXPANSION_RATE);
    return Math.min(expandedRange, MAX_ELO_RANGE);
}

/**
 * Join the matchmaking queue
 * 
 * Gate checks:
 * 1. User must be authenticated
 * 2. Confidence-based matchmaking: low confidence players matched together (no hard gate)
 * 
 * NEW: Instead of blocking low-confidence players, we now include confidence
 * in the queue entry and use it for smarter matchmaking (pairing similar players).
 */
export async function joinQueue(params: {
    mode: string;
    operation: string;
    elo: number;
    tier: number;           // Player's tier (1-100, 100-tier system)
    equippedBanner: string;
    equippedTitle: string;
    level: number;
    rank: string;           // Player's rank (Bronze, Silver, Gold, etc.)
    division: string;       // Player's division (I, II, III, IV)
    confidence?: number;    // Practice confidence score (0-1)
    isReturningPlayer?: boolean; // Flagged as returning player
}): Promise<{ success: boolean; queuePosition?: number; error?: string; confidenceBracket?: string }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    const userName = session.user.name || 'Player';
    const confidence = params.confidence ?? 0.5; // Default to 50% if not provided
    const confidenceBracket = getConfidenceBracket(confidence);

    // Log confidence bracket for debugging
    console.log(`[Matchmaking] ${userName} joining queue - confidence: ${(confidence * 100).toFixed(1)}% (${confidenceBracket})`);

    // Ensure player exists in PostgreSQL arena database and get authoritative ELO
    let playerElo = params.elo;
    try {
        await getOrCreateArenaPlayer(userId, userName);
        const pgEloData = await getPlayerEloFromPostgres(userId, '1v1');
        // Use PostgreSQL ELO if available and different from client-provided
        if (pgEloData.elo && pgEloData.elo !== 1000) {
            playerElo = pgEloData.elo;
            console.log(`[Matchmaking] Using PostgreSQL ELO: ${playerElo} (client sent: ${params.elo})`);
        }
    } catch (_error) {
        console.warn(`[Matchmaking] PostgreSQL unavailable, using client ELO: ${params.elo}`);
    }

    const redis = await getRedis();
    if (!redis) {
        return { success: false, error: 'Queue service unavailable' };
    }

    // Clear any existing match data for this player (fresh start)
    await redis.del(`${MATCH_PREFIX}player:${userId}`);

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    const entry: QueueEntry = {
        odUserId: userId,
        odUserName: userName,
        odElo: playerElo,  // Use PostgreSQL-validated ELO
        odTier: params.tier,
        odOperation: params.operation,
        odMode: params.mode,
        odEquippedBanner: params.equippedBanner,
        odEquippedTitle: params.equippedTitle,
        odLevel: params.level,
        odRank: params.rank,
        odDivision: params.division,
        odJoinedAt: Date.now(),
        odConfidence: confidence,
        odIsReturningPlayer: params.isReturningPlayer ?? false,
    };

    try {
        // First, remove any existing entries for this user (prevent stale entries)
        const existingEntries = await redis.zrange(queueKey, 0, -1);
        for (const entryStr of existingEntries) {
            try {
                const existing = JSON.parse(entryStr) as QueueEntry;
                if (existing.odUserId === userId) {
                    await redis.zrem(queueKey, entryStr);
                    console.log(`[Matchmaking] Removed stale entry for ${userName}`);
                }
            } catch { }
        }

        // Add to sorted set (score = ELO for matching)
        await redis.zadd(queueKey, params.elo, JSON.stringify(entry));

        // Set queue key expiration (clean up after 10 minutes of inactivity)
        await redis.expire(queueKey, 600);

        // Get queue position
        const position = await redis.zrank(queueKey, JSON.stringify(entry));

        console.log(`[Matchmaking] ${userName} joined queue for ${params.mode} ${params.operation} (ELO: ${params.elo}, Bracket: ${confidenceBracket})`);

        return { success: true, queuePosition: position || 0, confidenceBracket };
    } catch (error) {
        console.error('[Matchmaking] Join queue error:', error);
        return { success: false, error: 'Failed to join queue' };
    }
}

/**
 * Leave the matchmaking queue
 */
export async function leaveQueue(params: {
    mode: string;
    operation: string;
}): Promise<{ success: boolean }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false };
    }

    const userId = (session.user as { id: string }).id;
    const redis = await getRedis();
    if (!redis) return { success: false };

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    try {
        // Get all entries and remove the one for this user
        const entries = await redis.zrange(queueKey, 0, -1);
        for (const entryStr of entries) {
            const entry = JSON.parse(entryStr) as QueueEntry;
            if (entry.odUserId === userId) {
                await redis.zrem(queueKey, entryStr);
                console.log(`[Matchmaking] User ${userId} left queue`);
                break;
            }
        }
        return { success: true };
    } catch (error) {
        console.error('[Matchmaking] Leave queue error:', error);
        return { success: false };
    }
}

/**
 * Check for a match (poll-based for now)
 * 
 * NEW: Uses confidence-based matching to pair similar behavior players.
 * - Low confidence players matched with other low confidence
 * - High rank (Diamond+) gets stricter confidence matching
 * - Returning players prefer matching with other returning players
 */
export async function checkForMatch(params: {
    mode: string;
    operation: string;
    elo: number;
    tier: number; // player's practice tier (1-100)
    queueTime: number; // seconds in queue
    confidence?: number; // confidence score (0-1)
    isReturningPlayer?: boolean; // returning player flag
}): Promise<{
    matched: boolean;
    matchId?: string;
    opponent?: { name: string; elo: number; tier: string; banner: string; title: string; level: number; rank: string; division: string; confidenceBracket?: string };
    isAiMatch?: boolean;
    matchReasoning?: MatchReasoning; // For FlashAuditor Match History
}> {
    const session = await auth();
    if (!session?.user) {
        return { matched: false };
    }

    const userId = (session.user as { id: string }).id;
    const redis = await getRedis();

    if (!redis) {
        // Fallback: AI match after timeout
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
        }
        return { matched: false };
    }

    const queueKey = `${QUEUE_PREFIX}${params.mode}:${params.operation}`;

    try {
        // Check if user already has a pending match
        const existingMatch = await redis.get(`${MATCH_PREFIX}player:${userId}`);
        if (existingMatch) {
            const match = JSON.parse(existingMatch) as MatchResult;
            const opponent = match.odPlayer1.odUserId === userId ? match.odPlayer2 : match.odPlayer1;
            return {
                matched: true,
                matchId: match.matchId,
                opponent: opponent ? {
                    name: opponent.odUserName,
                    elo: opponent.odElo,
                    tier: opponent.odTier,
                    banner: opponent.odEquippedBanner,
                    title: opponent.odEquippedTitle,
                    level: opponent.odLevel,
                    rank: opponent.odRank || 'Bronze',
                    division: opponent.odDivision || 'I',
                } : undefined,
                isAiMatch: match.odIsAiMatch,
            };
        }

        // Find potential matches (players within expanding ELO range)
        // Range starts at ±50 and expands by +25 every 10 seconds, capped at ±300
        const currentEloRange = calculateEloRange(params.queueTime);
        const minElo = params.elo - currentEloRange;
        const maxElo = params.elo + currentEloRange;

        const candidates = await redis.zrangebyscore(queueKey, minElo, maxElo);

        const playerConfidence = params.confidence ?? 0.5;
        const playerBracket = getConfidenceBracket(playerConfidence);
        const playerIsReturning = params.isReturningPlayer ?? false;

        console.log(`[Matchmaking] Checking for match: user=${userId}, elo=${params.elo}, tier=${params.tier}, confidence=${(playerConfidence * 100).toFixed(1)}% (${playerBracket}), eloRange=±${currentEloRange} (${minElo}-${maxElo}), queueTime=${params.queueTime}s, candidates=${candidates.length}`);

        // Parse all candidates and score them for best match quality
        interface ScoredCandidate {
            entry: QueueEntry;
            str: string;
            score: number;
        }
        const scoredCandidates: ScoredCandidate[] = [];

        for (const candidateStr of candidates) {
            const candidate = JSON.parse(candidateStr) as QueueEntry;
            
            if (candidate.odUserId === userId) continue; // Skip self
            
            // Check if candidate already has a pending match
            const candidateMatch = await redis.get(`${MATCH_PREFIX}player:${candidate.odUserId}`);
            if (candidateMatch) {
                console.log(`[Matchmaking] Skipping ${candidate.odUserName}: already in a match`);
                continue;
            }

            // Check tier is within range (100-tier system: ±20 tiers)
            // Handle both number and legacy string formats
            const candidateTier = typeof candidate.odTier === 'number' 
                ? candidate.odTier 
                : (parseInt(String(candidate.odTier)) || 50);
            if (Math.abs(params.tier - candidateTier) > TIER_RANGE) {
                console.log(`[Matchmaking] Skipping ${candidate.odUserName}: tier ${candidateTier} outside range ±${TIER_RANGE} from ${params.tier}`);
                continue;
            }

            // Use deterministic match creation: lower userId creates the match
            if (userId > candidate.odUserId) {
                console.log(`[Matchmaking] Deferring to ${candidate.odUserName} (lower userId) to create match`);
                continue;
            }

            // Calculate match quality score
            const candidateConfidence = candidate.odConfidence ?? 0.5;
            let score = calculateMatchScore(
                { elo: params.elo, confidence: playerConfidence, tier: params.tier },
                { elo: candidate.odElo, confidence: candidateConfidence, tier: candidateTier }
            );

            // Bonus: Prefer matching returning players together
            if (playerIsReturning && candidate.odIsReturningPlayer) {
                score -= PLACEMENT.RETURNING_PLAYER_WEIGHT; // Lower score = better match
            } else if (playerIsReturning !== candidate.odIsReturningPlayer) {
                // Slight penalty for mixing returning with non-returning
                score += 25;
            }

            scoredCandidates.push({
                entry: candidate,
                str: candidateStr,
                score
            });
        }

        // Sort by score (lower = better match)
        scoredCandidates.sort((a, b) => a.score - b.score);

        // Take the best match
        for (const { entry: candidate, str: candidateStr, score } of scoredCandidates) {
            const candidateBracket = getConfidenceBracket(candidate.odConfidence ?? 0.5);
            console.log(`[Matchmaking] Best candidate: ${candidate.odUserName}, elo=${candidate.odElo}, bracket=${candidateBracket}, score=${score}`);

            // Found a match! Create match and remove both from queue
            const matchId = `match-${uuidv4()}`;

            // Get current user's entry
            const entries = await redis.zrange(queueKey, 0, -1);
            let currentUserEntry: QueueEntry | null = null;
            for (const entryStr of entries) {
                const entry = JSON.parse(entryStr) as QueueEntry;
                if (entry.odUserId === userId) {
                    currentUserEntry = entry;
                    await redis.zrem(queueKey, entryStr);
                    break;
                }
            }

            if (!currentUserEntry) {
                continue; // User not in queue anymore
            }

            // Remove matched opponent from queue
            await redis.zrem(queueKey, candidateStr);

            // Create match entry
            const match: MatchResult = {
                matchId,
                odPlayer1: currentUserEntry,
                odPlayer2: candidate,
                odIsAiMatch: false,
            };

            // Store match for both players (expires in 5 minutes)
            const matchStr = JSON.stringify(match);
            await redis.setex(`${MATCH_PREFIX}player:${currentUserEntry.odUserId}`, 300, matchStr);
            await redis.setex(`${MATCH_PREFIX}player:${candidate.odUserId}`, 300, matchStr);
            await redis.setex(`${MATCH_PREFIX}${matchId}`, 3600, matchStr); // Match data expires in 1 hour

            console.log(`[Matchmaking] Match created: ${matchId} - ${currentUserEntry.odUserName} vs ${candidate.odUserName}`);

            // Generate match reasoning for FlashAuditor Match History
            const matchReasoning = generateMatchReasoningSync({
                playerElo: params.elo,
                playerTier: params.tier,
                playerConfidence: playerConfidence,
                playerIsReturning: playerIsReturning,
                opponentElo: candidate.odElo,
                opponentTier: typeof candidate.odTier === 'number' ? candidate.odTier : (parseInt(String(candidate.odTier)) || 50),
                opponentConfidence: candidate.odConfidence ?? 0.5,
                opponentIsReturning: candidate.odIsReturningPlayer ?? false,
                queueTimeSeconds: params.queueTime,
                isAiMatch: false,
            });

            return {
                matched: true,
                matchId,
                opponent: {
                    name: candidate.odUserName,
                    elo: candidate.odElo,
                    tier: candidate.odTier,
                    banner: candidate.odEquippedBanner,
                    title: candidate.odEquippedTitle,
                    level: candidate.odLevel,
                    rank: candidate.odRank || 'Bronze',
                    division: candidate.odDivision || 'I',
                    confidenceBracket: getConfidenceBracket(candidate.odConfidence ?? 0.5),
                },
                isAiMatch: false,
                matchReasoning,
            };
        }

        // No match found - check if should start AI match
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
        }

        return { matched: false };
    } catch (error) {
        console.error('[Matchmaking] Check match error:', error);
        // Fallback to AI
        if (params.queueTime * 1000 >= AI_TIMEOUT_MS) {
            return createAiMatch(userId, (session.user as any).name || 'Player', params);
        }
        return { matched: false };
    }
}

/**
 * Create an AI match when no players are available
 */
async function createAiMatch(userId: string, userName: string, params: { mode: string; operation: string; elo: number; tier: number; rank?: string; division?: string; queueTime?: number; confidence?: number; isReturningPlayer?: boolean }) {
    const matchId = `match-${uuidv4()}`;

    // Generate AI opponent stats (slightly varied from player)
    const aiEloVariance = Math.floor(Math.random() * 100) - 50;
    const aiTierVariance = Math.floor(Math.random() * (TIER_RANGE * 2 + 1)) - TIER_RANGE;
    const aiTier = Math.max(1, Math.min(100, params.tier + aiTierVariance));
    // Use consistent bot name that matches server.js
    const aiName = 'FlashBot 3000';
    const aiBanners = ['matrices', 'synthwave', 'plasma', 'legendary'];
    const aiTitles = ['AI Challenger', 'Math Bot', 'Practice Partner', 'Training Mode'];

    console.log(`[Matchmaking] AI match created: ${matchId} for user ${userId}`);

    // Fetch user's actual equipped items and level from database
    const { getDatabase } = await import("@/lib/db");
    const db = getDatabase();
    const userData = db.prepare(`
        SELECT level, equipped_items
        FROM users WHERE id = ?
    `).get(userId) as { level?: number; equipped_items?: string } | undefined;

    let userBanner = 'default';
    let userTitle = 'Challenger';
    const userLevel = userData?.level || 1;

    if (userData?.equipped_items) {
        try {
            const { getBannerAssetValue, getTitleDisplayName } = await import("@/lib/items");
            const equipped = JSON.parse(userData.equipped_items);
            // Convert item IDs to asset values for display
            userBanner = getBannerAssetValue(equipped.banner);
            userTitle = getTitleDisplayName(equipped.title);
        } catch { /* ignore parse errors */ }
    }

    // AI rank matches player's rank for fair matchup display
    const aiRank = params.rank || 'Bronze';
    const aiDivision = params.division || 'I';

    const match: MatchResult = {
        matchId,
        odPlayer1: {
            odUserId: userId,
            odUserName: userName,
            odElo: params.elo,
            odTier: params.tier,  // Now a number (1-100)
            odOperation: params.operation,
            odMode: params.mode,
            odEquippedBanner: userBanner,
            odEquippedTitle: userTitle,
            odLevel: userLevel,
            odRank: params.rank || 'Bronze',
            odDivision: params.division || 'I',
            odJoinedAt: Date.now(),
            odConfidence: params.confidence ?? 0.5,
            odIsReturningPlayer: params.isReturningPlayer ?? false,
        },
        odPlayer2: {
            odUserId: 'ai-' + matchId, // Unique ID for AI
            odUserName: aiName,
            odElo: params.elo + aiEloVariance,
            odTier: aiTier,  // Now a number (1-100)
            odOperation: params.operation,
            odMode: params.mode,
            odEquippedBanner: aiBanners[Math.floor(Math.random() * aiBanners.length)],
            odEquippedTitle: aiTitles[Math.floor(Math.random() * aiTitles.length)],
            odLevel: Math.floor(Math.random() * 50) + 10,
            odRank: aiRank,  // AI rank matches player's rank
            odDivision: aiDivision,
            odJoinedAt: Date.now(),
            odConfidence: 0.7, // AI has established confidence
            odIsReturningPlayer: false,
        },
        odIsAiMatch: true,
    };

    // Save to Redis
    const redis = await getRedis();
    if (redis) {
        await redis.setex(`${MATCH_PREFIX}${matchId}`, 3600, JSON.stringify(match));
    }

    // Generate match reasoning for FlashAuditor Match History
    const queueTimeSeconds = params.queueTime ?? 15;
    const matchReasoning = generateMatchReasoningSync({
        playerElo: params.elo,
        playerTier: params.tier,
        playerConfidence: params.confidence ?? 0.5,
        playerIsReturning: params.isReturningPlayer ?? false,
        opponentElo: params.elo + aiEloVariance,
        opponentTier: aiTier,
        opponentConfidence: 0.7,
        opponentIsReturning: false,
        queueTimeSeconds,
        isAiMatch: true,
    });

    return {
        matched: true,
        matchId,
        opponent: {
            name: aiName,
            elo: params.elo + aiEloVariance,
            tier: aiTier.toString(),
            banner: match.odPlayer2?.odEquippedBanner || 'default',
            title: match.odPlayer2?.odEquippedTitle || 'default',
            level: match.odPlayer2?.odLevel || 1,
            rank: match.odPlayer2?.odRank || aiRank,
            division: match.odPlayer2?.odDivision || aiDivision,
        },
        isAiMatch: true,
        matchReasoning,
    };
}

/**
 * Get match details
 */
export async function getMatch(matchId: string): Promise<{
    match?: MatchResult;
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { error: 'Unauthorized' };
    }

    const redis = await getRedis();
    if (!redis) {
        return { error: 'Match service unavailable' };
    }

    try {
        const matchStr = await redis.get(`${MATCH_PREFIX}${matchId}`);
        if (!matchStr) {
            return { error: 'Match not found' };
        }

        return { match: JSON.parse(matchStr) };
    } catch (error) {
        console.error('[Matchmaking] Get match error:', error);
        return { error: 'Failed to get match' };
    }
}

/**
 * Clear match data after game ends
 */
export async function clearMatch(_matchId: string): Promise<{ success: boolean }> {
    const session = await auth();
    if (!session?.user) {
        return { success: false };
    }

    const userId = (session.user as { id: string }).id;
    const redis = await getRedis();
    if (!redis) return { success: false };

    try {
        await redis.del(`${MATCH_PREFIX}player:${userId}`);
        // Don't delete the match itself - keep for history
        return { success: true };
    } catch (_error) {
        return { success: false };
    }
}

/**
 * Performance metrics for ELO calculation
 */
interface PerformanceMetrics {
    aps: number;           // Arena Performance Score (0-1000)
    accuracy: number;      // Accuracy as decimal (0-1)
    avgSpeedMs: number;    // Average answer time in milliseconds
    maxStreak: number;     // Maximum correct answer streak
}

/**
 * APS tier configuration for K-factor scaling
 */
const APS_TIERS = {
    ELITE:    { min: 800, winnerMult: 1.25, loserMult: 0.75 },
    HIGH:     { min: 600, winnerMult: 1.10, loserMult: 0.90 },
    BASELINE: { min: 400, winnerMult: 1.00, loserMult: 1.00 },
    LOW:      { min: 200, winnerMult: 0.90, loserMult: 1.10 },
    POOR:     { min: 0,   winnerMult: 0.75, loserMult: 1.25 }
};

/**
 * Threshold bonuses for performance milestones
 */
const PERFORMANCE_BONUSES = {
    ACCURACY_PERFECT: { threshold: 1.00, bonus: 8 },
    ACCURACY_HIGH:    { threshold: 0.90, bonus: 5 },
    ACCURACY_GOOD:    { threshold: 0.80, bonus: 2 },
    SPEED_DEMON:      { threshold: 2000, bonus: 5 },
    SPEED_QUICK:      { threshold: 3000, bonus: 2 },
    STREAK_HOT:       { threshold: 10, bonus: 5 },
    STREAK_SOLID:     { threshold: 5,  bonus: 2 }
};

/**
 * Loser protection thresholds
 */
const LOSER_PROTECTION = {
    HIGH_APS: { threshold: 700, multiplier: 0.75 },
    MID_APS:  { threshold: 500, multiplier: 0.85 }
};

const MAX_WINNER_BONUS = 10;
const MAX_LOSER_BONUS = 5;

/**
 * Get APS tier multiplier based on APS score
 */
function getApsTierMultiplier(aps: number, isWinner: boolean): number {
    if (aps >= APS_TIERS.ELITE.min) {
        return isWinner ? APS_TIERS.ELITE.winnerMult : APS_TIERS.ELITE.loserMult;
    } else if (aps >= APS_TIERS.HIGH.min) {
        return isWinner ? APS_TIERS.HIGH.winnerMult : APS_TIERS.HIGH.loserMult;
    } else if (aps >= APS_TIERS.BASELINE.min) {
        return isWinner ? APS_TIERS.BASELINE.winnerMult : APS_TIERS.BASELINE.loserMult;
    } else if (aps >= APS_TIERS.LOW.min) {
        return isWinner ? APS_TIERS.LOW.winnerMult : APS_TIERS.LOW.loserMult;
    } else {
        return isWinner ? APS_TIERS.POOR.winnerMult : APS_TIERS.POOR.loserMult;
    }
}

/**
 * Calculate threshold bonuses based on performance metrics
 */
function calculateThresholdBonuses(metrics: PerformanceMetrics): number {
    let totalBonus = 0;

    // Accuracy bonus (highest applicable)
    if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_PERFECT.threshold) {
        totalBonus += PERFORMANCE_BONUSES.ACCURACY_PERFECT.bonus;
    } else if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_HIGH.threshold) {
        totalBonus += PERFORMANCE_BONUSES.ACCURACY_HIGH.bonus;
    } else if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_GOOD.threshold) {
        totalBonus += PERFORMANCE_BONUSES.ACCURACY_GOOD.bonus;
    }

    // Speed bonus (highest applicable, lower is better)
    if (metrics.avgSpeedMs > 0 && metrics.avgSpeedMs < PERFORMANCE_BONUSES.SPEED_DEMON.threshold) {
        totalBonus += PERFORMANCE_BONUSES.SPEED_DEMON.bonus;
    } else if (metrics.avgSpeedMs > 0 && metrics.avgSpeedMs < PERFORMANCE_BONUSES.SPEED_QUICK.threshold) {
        totalBonus += PERFORMANCE_BONUSES.SPEED_QUICK.bonus;
    }

    // Streak bonus (highest applicable)
    if (metrics.maxStreak >= PERFORMANCE_BONUSES.STREAK_HOT.threshold) {
        totalBonus += PERFORMANCE_BONUSES.STREAK_HOT.bonus;
    } else if (metrics.maxStreak >= PERFORMANCE_BONUSES.STREAK_SOLID.threshold) {
        totalBonus += PERFORMANCE_BONUSES.STREAK_SOLID.bonus;
    }

    return totalBonus;
}

/**
 * Get loser protection multiplier based on APS
 */
function getLoserProtectionMultiplier(aps: number): number {
    if (aps >= LOSER_PROTECTION.HIGH_APS.threshold) {
        return LOSER_PROTECTION.HIGH_APS.multiplier;
    } else if (aps >= LOSER_PROTECTION.MID_APS.threshold) {
        return LOSER_PROTECTION.MID_APS.multiplier;
    }
    return 1.0; // No protection
}

/**
 * Calculate ELO change with APS scaling and threshold bonuses
 * 
 * Formula:
 * 1. Calculate base ELO change using standard Elo formula
 * 2. Scale by APS tier multiplier (higher APS = better multiplier)
 * 3. Apply loser protection for high-performing losers
 * 4. Add threshold bonuses for accuracy, speed, and streak milestones
 * 5. Cap bonuses to prevent runaway gains
 * 
 * @param playerElo - Current player ELO
 * @param opponentElo - Opponent's ELO  
 * @param won - Whether the player won
 * @param metrics - Performance metrics (APS, accuracy, speed, streak)
 * @param kFactor - Base K-factor (default 32)
 */
function calculateEloChange(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    metrics?: PerformanceMetrics,
    kFactor: number = 32
): { eloChange: number; bonusBreakdown: { aps: number; accuracy: number; speed: number; streak: number } } {
    // Standard Elo expected score calculation
    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actualScore = won ? 1 : 0;

    // Base ELO change
    const baseChange = kFactor * (actualScore - expectedScore);

    // Default breakdown (no bonuses)
    const bonusBreakdown = { aps: 0, accuracy: 0, speed: 0, streak: 0 };

    // If no metrics provided, return base change
    if (!metrics) {
        return { eloChange: Math.round(baseChange), bonusBreakdown };
    }

    // Step 1: Apply APS tier multiplier
    const apsTierMultiplier = getApsTierMultiplier(metrics.aps, won);
    const apsScaledChange = baseChange * apsTierMultiplier;
    bonusBreakdown.aps = Math.round(apsScaledChange - baseChange);

    // Step 2: Apply loser protection if applicable
    let protectedChange = apsScaledChange;
    if (!won) {
        const protectionMultiplier = getLoserProtectionMultiplier(metrics.aps);
        protectedChange = apsScaledChange * protectionMultiplier;
    }

    // Step 3: Calculate threshold bonuses
    const thresholdBonus = calculateThresholdBonuses(metrics);

    // Determine individual bonus contributions for breakdown
    if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_PERFECT.threshold) {
        bonusBreakdown.accuracy = PERFORMANCE_BONUSES.ACCURACY_PERFECT.bonus;
    } else if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_HIGH.threshold) {
        bonusBreakdown.accuracy = PERFORMANCE_BONUSES.ACCURACY_HIGH.bonus;
    } else if (metrics.accuracy >= PERFORMANCE_BONUSES.ACCURACY_GOOD.threshold) {
        bonusBreakdown.accuracy = PERFORMANCE_BONUSES.ACCURACY_GOOD.bonus;
    }

    if (metrics.avgSpeedMs > 0 && metrics.avgSpeedMs < PERFORMANCE_BONUSES.SPEED_DEMON.threshold) {
        bonusBreakdown.speed = PERFORMANCE_BONUSES.SPEED_DEMON.bonus;
    } else if (metrics.avgSpeedMs > 0 && metrics.avgSpeedMs < PERFORMANCE_BONUSES.SPEED_QUICK.threshold) {
        bonusBreakdown.speed = PERFORMANCE_BONUSES.SPEED_QUICK.bonus;
    }

    if (metrics.maxStreak >= PERFORMANCE_BONUSES.STREAK_HOT.threshold) {
        bonusBreakdown.streak = PERFORMANCE_BONUSES.STREAK_HOT.bonus;
    } else if (metrics.maxStreak >= PERFORMANCE_BONUSES.STREAK_SOLID.threshold) {
        bonusBreakdown.streak = PERFORMANCE_BONUSES.STREAK_SOLID.bonus;
    }

    // Step 4: Cap bonuses
    const maxBonus = won ? MAX_WINNER_BONUS : MAX_LOSER_BONUS;
    const cappedBonus = Math.min(thresholdBonus, maxBonus);

    // For losers, bonuses reduce the loss (add to the negative change)
    // For winners, bonuses add to the gain
    const finalChange = Math.round(protectedChange) + cappedBonus;

    return { eloChange: finalChange, bonusBreakdown };
}

/**
 * Legacy wrapper for backward compatibility
 * Converts old-style parameters to new format
 */
function _calculateEloChangeLegacy(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    performanceBonus: number = 0.5,
    streakBonus: number = 0,
    kFactor: number = 32
): number {
    // Convert legacy parameters to approximate metrics
    const metrics: PerformanceMetrics = {
        aps: Math.round(performanceBonus * 1000),  // Scale 0-1 to 0-1000
        accuracy: performanceBonus,
        avgSpeedMs: 3500,  // Assume average speed
        maxStreak: Math.min(streakBonus, 10)
    };
    
    const result = calculateEloChange(playerElo, opponentElo, won, metrics, kFactor);
    return result.eloChange;
}

/**
 * Valid ranked operations (mixed is unranked)
 */
const RANKED_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division'];

/**
 * Check if operation is ranked (not mixed)
 */
function isRankedOperation(operation: string): boolean {
    return RANKED_OPERATIONS.includes(operation);
}

/**
 * Get the ELO column name for a mode + operation combination
 */
function getEloColumnName(mode: string, operation: string): string {
    if (mode === '1v1') {
        return `arena_elo_duel_${operation}`;
    } else {
        return `arena_elo_${mode}_${operation}`;
    }
}

/**
 * Calculate average ELO from operation-specific ELOs
 */
function _calculateAverageElo(elos: Record<string, number>): number {
    const values = RANKED_OPERATIONS.map(op => elos[op] || 300);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Performance stats passed from game loop for ELO calculations
 */
interface MatchPerformanceStats {
    accuracy: number;       // 0-1 decimal
    avgSpeedMs: number;     // Average answer time in ms
    maxStreak: number;      // Max correct streak
    aps: number;            // Arena Performance Score (0-1000)
}

// Import decay system functions
import { updateArenaActivity, recordPlacementMatch, getPlacementProgress } from '@/lib/arena/decay';

/**
 * Save match result and update ELO + Award Coins
 * 
 * New ELO Structure:
 * - Duel (1v1): Per-operation ELO (addition, subtraction, multiplication, division)
 * - Team (2v2-5v5): Per-mode + per-operation ELO
 * - Mixed operation matches do NOT affect ELO (unranked)
 * 
 * Performance-based ELO:
 * - APS scales K-factor (higher APS = better multiplier)
 * - Threshold bonuses for accuracy, speed, and streak milestones
 * - Loser protection for high-performing losers
 */
export async function saveMatchResult(params: {
    matchId: string;
    winnerId: string;
    loserId: string;
    winnerScore: number;
    loserScore: number;
    winnerQuestionsAnswered?: number;
    loserQuestionsAnswered?: number;
    operation: string;
    mode: string;
    // Performance stats for speed/accuracy ELO integration
    winnerPerformance?: MatchPerformanceStats;
    loserPerformance?: MatchPerformanceStats;
    // Match reasoning for FlashAuditor Match History
    matchReasoning?: MatchReasoning;
    // Match integrity state for connection quality
    matchIntegrity?: 'GREEN' | 'YELLOW' | 'RED';
    // Draw handling
    isDraw?: boolean;
}): Promise<{
    success: boolean;
    winnerEloChange?: number;
    loserEloChange?: number;
    winnerCoinsEarned?: number;
    loserCoinsEarned?: number;
    isRanked?: boolean;
    isVoid?: boolean;
    isDraw?: boolean;
    voidReason?: string;
    connectionQuality?: string;
    error?: string
}> {
    console.log(`[Match] saveMatchResult CALLED: matchId=${params.matchId}, winner=${params.winnerId}, loser=${params.loserId}, winnerScore=${params.winnerScore}, loserScore=${params.loserScore}, operation=${params.operation}, mode=${params.mode}, isDraw=${params.isDraw}, matchIntegrity=${params.matchIntegrity}`);
    
    const session = await auth();
    if (!session?.user) {
        console.log('[Match] saveMatchResult REJECTED: Unauthorized');
        return { success: false, error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;
    console.log(`[Match] saveMatchResult userId=${userId}`);

    // Only allow match participants to save results
    if (userId !== params.winnerId && userId !== params.loserId) {
        console.log(`[Match] saveMatchResult REJECTED: Not a participant (userId=${userId}, winner=${params.winnerId}, loser=${params.loserId})`);
        return { success: false, error: 'Not a match participant' };
    }

    // Determine if this is a ranked match (not mixed operation)
    const isRanked = isRankedOperation(params.operation);
    const isDuel = params.mode === '1v1';

    // Update arena activity timestamps for both human players
    const isWinnerHumanEarly = !params.winnerId.startsWith('ai-') && !params.winnerId.startsWith('ai_bot_');
    const isLoserHumanEarly = !params.loserId.startsWith('ai-') && !params.loserId.startsWith('ai_bot_');
    
    if (isWinnerHumanEarly) {
        await updateArenaActivity(params.winnerId);
    }
    if (isLoserHumanEarly) {
        await updateArenaActivity(params.loserId);
    }

    // Check if players are in placement mode (returning players)
    let winnerPlacement = { inPlacementMode: false, eloMultiplier: 1.0 };
    let loserPlacement = { inPlacementMode: false, eloMultiplier: 1.0 };
    
    if (isWinnerHumanEarly) {
        winnerPlacement = await getPlacementProgress(params.winnerId);
    }
    if (isLoserHumanEarly) {
        loserPlacement = await getPlacementProgress(params.loserId);
    }

    try {
        const { getDatabase } = await import("@/lib/db");
        const db = getDatabase();

        console.log(`[Match] saveMatchResult: matchId=${params.matchId}, mode=${params.mode}, op=${params.operation}, ranked=${isRanked}`);

        // Use Redis SETNX to atomically claim the right to save this match
        const redis = await getRedis();
        const saveLockKey = `arena:save_lock:${params.matchId}`;

        // Calculate coin rewards upfront (needed for duplicate responses too)
        const winnerCorrectAnswers = Math.floor(params.winnerScore / 100);
        const loserCorrectAnswers = Math.floor(params.loserScore / 100);
        const winnerCoinsEarned = (winnerCorrectAnswers * 2) + 10;
        const loserCoinsEarned = loserCorrectAnswers * 2;

        if (redis) {
            const lockAcquired = await redis.setnx(saveLockKey, userId);
            if (!lockAcquired) {
                await new Promise(resolve => setTimeout(resolve, 500));
                const existingMatch = db.prepare("SELECT id, winner_elo_change, loser_elo_change FROM arena_matches WHERE id = ?").get(params.matchId) as {
                    id: string;
                    winner_elo_change?: number;
                    loser_elo_change?: number;
                } | undefined;
                if (existingMatch) {
                    const { revalidatePath } = await import("next/cache");
                    revalidatePath("/arena/modes");
                    revalidatePath("/arena");
                    revalidatePath("/stats");
                    revalidatePath("/dashboard");
                    return {
                        success: true,
                        winnerEloChange: existingMatch.winner_elo_change,
                        loserEloChange: existingMatch.loser_elo_change,
                        winnerCoinsEarned,
                        loserCoinsEarned,
                        isRanked
                    };
                }
            }
            await redis.expire(saveLockKey, 30);
        }

        // Double-check database
        const existingMatch = db.prepare("SELECT id, winner_elo_change, loser_elo_change FROM arena_matches WHERE id = ?").get(params.matchId) as any;
        if (existingMatch) {
            const { revalidatePath } = await import("next/cache");
            revalidatePath("/arena/modes");
            revalidatePath("/arena");
            revalidatePath("/stats");
            revalidatePath("/dashboard");
            return {
                success: true,
                winnerEloChange: existingMatch.winner_elo_change,
                loserEloChange: existingMatch.loser_elo_change,
                winnerCoinsEarned,
                loserCoinsEarned,
                isRanked
            };
        }

        console.log(`[Match] Coin calculation: winnerCorrect=${winnerCorrectAnswers}, loserCorrect=${loserCorrectAnswers}, winnerCoins=${winnerCoinsEarned}, loserCoins=${loserCoinsEarned}`);

        let winnerEloChange = 0;
        let loserEloChange = 0;

        const isWinnerHuman = !params.winnerId.startsWith('ai-') && !params.winnerId.startsWith('ai_bot_');
        const isLoserHuman = !params.loserId.startsWith('ai-') && !params.loserId.startsWith('ai_bot_');

        // Only update ELO for ranked matches (not mixed operation)
        if (isRanked) {
            // Map operation name to PostgreSQL column suffix
            const pgOperation = params.operation as 'addition' | 'subtraction' | 'multiplication' | 'division';
            
            // Get current ELOs from PostgreSQL (source of truth)
            let winnerCurrentElo = 300;
            let loserCurrentElo = 300;
            let winnerStreak = 0;

            if (isWinnerHuman) {
                // Ensure player exists in PostgreSQL
                const winnerUser = db.prepare('SELECT name FROM users WHERE id = ?').get(params.winnerId) as { name: string } | undefined;
                const winnerPg = await getOrCreateArenaPlayer(params.winnerId, winnerUser?.name || 'Player');
                
                // Get operation-specific ELO
                const eloKey = isDuel 
                    ? `elo_${pgOperation}` 
                    : `elo_${params.mode}_${pgOperation}`;
                interface ArenaPlayer {
                    [key: string]: unknown;
                }
                winnerCurrentElo = (winnerPg as ArenaPlayer)[eloKey] as number || 300;
                winnerStreak = (isDuel ? winnerPg.duel_win_streak : winnerPg.team_win_streak) + 1 || 1;
            }
            if (isLoserHuman) {
                const loserUser = db.prepare('SELECT name FROM users WHERE id = ?').get(params.loserId) as { name: string } | undefined;
                const loserPg = await getOrCreateArenaPlayer(params.loserId, loserUser?.name || 'Player');
                
                const eloKey = isDuel 
                    ? `elo_${pgOperation}` 
                    : `elo_${params.mode}_${pgOperation}`;
                interface ArenaPlayer {
                    [key: string]: unknown;
                }
                loserCurrentElo = (loserPg as ArenaPlayer)[eloKey] as number || 300;
            }

            // Build performance metrics for new ELO calculation
            // If performance stats provided, use them; otherwise fallback to legacy estimation
            let winnerMetrics: PerformanceMetrics | undefined;
            let loserMetrics: PerformanceMetrics | undefined;

            if (params.winnerPerformance) {
                winnerMetrics = {
                    aps: params.winnerPerformance.aps,
                    accuracy: params.winnerPerformance.accuracy,
                    avgSpeedMs: params.winnerPerformance.avgSpeedMs,
                    maxStreak: params.winnerPerformance.maxStreak
                };
            } else {
                // Legacy fallback: estimate from score ratio
                const totalScore = params.winnerScore + params.loserScore;
                const winnerScoreRatio = totalScore > 0 ? params.winnerScore / totalScore : 0.5;
                winnerMetrics = {
                    aps: Math.round(winnerScoreRatio * 600 + 200), // Estimate 200-800 range
                    accuracy: winnerScoreRatio,
                    avgSpeedMs: 3000,
                    maxStreak: Math.max(winnerStreak, 3)
                };
            }

            if (params.loserPerformance) {
                loserMetrics = {
                    aps: params.loserPerformance.aps,
                    accuracy: params.loserPerformance.accuracy,
                    avgSpeedMs: params.loserPerformance.avgSpeedMs,
                    maxStreak: params.loserPerformance.maxStreak
                };
            } else {
                // Legacy fallback
                const totalScore = params.winnerScore + params.loserScore;
                const loserScoreRatio = totalScore > 0 ? params.loserScore / totalScore : 0.5;
                loserMetrics = {
                    aps: Math.round(loserScoreRatio * 600 + 200),
                    accuracy: loserScoreRatio,
                    avgSpeedMs: 3500,
                    maxStreak: 2
                };
            }

            // Calculate ELO changes with performance-based bonuses
            // Apply placement multiplier for returning players (doubled K-factor)
            const winnerKFactor = 32 * winnerPlacement.eloMultiplier;
            const loserKFactor = 32 * loserPlacement.eloMultiplier;
            
            const winnerResult = calculateEloChange(winnerCurrentElo, loserCurrentElo, true, winnerMetrics, winnerKFactor);
            const loserResult = calculateEloChange(loserCurrentElo, winnerCurrentElo, false, loserMetrics, loserKFactor);
            
            winnerEloChange = winnerResult.eloChange;
            loserEloChange = loserResult.eloChange;
            
            // BOT MATCH ELO CAP: No ELO gain from bots after tier 20
            const isBotMatch = !isWinnerHuman || !isLoserHuman;
            const BOT_ELO_TIER_CAP = 20;
            
            if (isBotMatch) {
                // Get the human player's tier for this operation
                const humanPlayerId = isWinnerHuman ? params.winnerId : params.loserId;
                const humanPlayerData = db.prepare(`SELECT math_tiers FROM users WHERE id = ?`).get(humanPlayerId) as { math_tiers: string } | undefined;
                
                let playerTier = 0;
                if (humanPlayerData?.math_tiers) {
                    try {
                        const tiers = JSON.parse(humanPlayerData.math_tiers);
                        playerTier = tiers[params.operation] || 0;
                    } catch (_e) { /* ignore parse errors */ }
                }
                
                if (playerTier > BOT_ELO_TIER_CAP) {
                    console.log(`[Match] Bot match ELO capped: Player tier ${playerTier} > ${BOT_ELO_TIER_CAP}, no ELO change`);
                    // Zero out ELO changes for bot matches above tier cap
                    if (isWinnerHuman) {
                        winnerEloChange = 0;
                    }
                    if (isLoserHuman) {
                        loserEloChange = 0;
                    }
                } else {
                    console.log(`[Match] Bot match ELO allowed: Player tier ${playerTier} <= ${BOT_ELO_TIER_CAP}`);
                }
            }
            
            // MATCH INTEGRITY: Void ELO for YELLOW/RED matches
            const integrity = params.matchIntegrity || 'GREEN';
            console.log(`[Match] Integrity check: matchIntegrity=${integrity}, isDraw=${params.isDraw}, winnerScore=${params.winnerScore}, loserScore=${params.loserScore}`);
            
            if (integrity === 'YELLOW' || integrity === 'RED') {
                console.log(`[Match] VOIDING ELO due to ${integrity} integrity state`);
                winnerEloChange = 0;
                loserEloChange = 0;
            }
            
            // DRAW HANDLING: No ELO change for draws
            if (params.isDraw) {
                console.log(`[Match] Draw detected - no ELO change for either player`);
                winnerEloChange = 0;
                loserEloChange = 0;
            }
            
            console.log(`[Match] Final ELO changes: winner=${winnerEloChange}, loser=${loserEloChange}`);
            
            // Log placement multipliers if active
            if (winnerPlacement.inPlacementMode) {
                console.log(`[Match] Winner in placement mode: K=${winnerKFactor} (${winnerPlacement.eloMultiplier}x)`);
            }
            if (loserPlacement.inPlacementMode) {
                console.log(`[Match] Loser in placement mode: K=${loserKFactor} (${loserPlacement.eloMultiplier}x)`);
            }

            console.log(`[Match] ELO calc - Winner: base=${winnerResult.eloChange} (acc:${winnerResult.bonusBreakdown.accuracy}, spd:${winnerResult.bonusBreakdown.speed}, str:${winnerResult.bonusBreakdown.streak})`);
            console.log(`[Match] ELO calc - Loser: base=${loserResult.eloChange} (acc:${loserResult.bonusBreakdown.accuracy}, spd:${loserResult.bonusBreakdown.speed}, str:${loserResult.bonusBreakdown.streak})`);

            const newWinnerElo = Math.max(100, winnerCurrentElo + winnerEloChange);
            const newLoserElo = Math.max(100, loserCurrentElo + loserEloChange);

            // Update winner ELO in PostgreSQL (source of truth)
            if (isWinnerHuman) {
                // Update coins in SQLite (user profile data)
                const winner = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.winnerId) as { coins?: number } | undefined;
                const newCoins = (winner?.coins || 0) + winnerCoinsEarned;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run(newCoins, params.winnerId);

                // Update ELO in PostgreSQL
                if (isDuel) {
                    await updatePlayerOperationElo(
                        params.winnerId,
                        pgOperation,
                        newWinnerElo,
                        winnerEloChange,
                        true // won
                    );
                } else {
                    await updatePlayerTeamOperationElo(
                        params.winnerId,
                        params.mode as '2v2' | '3v3' | '4v4' | '5v5',
                        pgOperation,
                        newWinnerElo,
                        true // won
                    );
                }

                console.log(`[Match] Winner updated in PostgreSQL: elo_${pgOperation}=${newWinnerElo}, coins=${newCoins} (+${winnerCoinsEarned})`);
            }

            // Update loser ELO in PostgreSQL (source of truth)
            if (isLoserHuman) {
                // Update coins in SQLite (user profile data)
                const loser = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.loserId) as any;
                const newCoins = (loser?.coins || 0) + loserCoinsEarned;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run(newCoins, params.loserId);

                // Update ELO in PostgreSQL
                if (isDuel) {
                    await updatePlayerOperationElo(
                        params.loserId,
                        pgOperation,
                        newLoserElo,
                        loserEloChange,
                        false // lost
                    );
                } else {
                    await updatePlayerTeamOperationElo(
                        params.loserId,
                        params.mode as '2v2' | '3v3' | '4v4' | '5v5',
                        pgOperation,
                        newLoserElo,
                        false // lost
                    );
                }

                console.log(`[Match] Loser updated in PostgreSQL: elo_${pgOperation}=${newLoserElo}, coins=${newCoins} (+${loserCoinsEarned})`);
            }
            // Record placement match progress for returning players
            if (winnerPlacement.inPlacementMode) {
                const progress = await recordPlacementMatch(params.winnerId);
                console.log(`[Match] Winner placement progress: ${progress.matchesRemaining} matches remaining`);
            }
            if (loserPlacement.inPlacementMode) {
                const progress = await recordPlacementMatch(params.loserId);
                console.log(`[Match] Loser placement progress: ${progress.matchesRemaining} matches remaining`);
            }
        } else {
            // Unranked (mixed) - just update coins
            if (isWinnerHuman) {
                const winner = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.winnerId) as { coins?: number } | undefined;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run((winner?.coins || 0) + winnerCoinsEarned, params.winnerId);
            }
            if (isLoserHuman) {
                const loser = db.prepare("SELECT coins FROM users WHERE id = ?").get(params.loserId) as any;
                db.prepare("UPDATE users SET coins = ? WHERE id = ?").run((loser?.coins || 0) + loserCoinsEarned, params.loserId);
            }
            console.log(`[Match] Unranked match (mixed) - coins only`);
        }

        // Save match to history with performance stats (including AI matches for full history)
        const isAiMatch = !isWinnerHuman || !isLoserHuman;
            try {
                // Include performance stats if available
                const winnerAcc = params.winnerPerformance?.accuracy ?? null;
                const winnerSpeed = params.winnerPerformance?.avgSpeedMs ?? null;
                const winnerStrk = params.winnerPerformance?.maxStreak ?? null;
                const winnerAps = params.winnerPerformance?.aps ?? null;
                const loserAcc = params.loserPerformance?.accuracy ?? null;
                const loserSpeed = params.loserPerformance?.avgSpeedMs ?? null;
                const loserStrk = params.loserPerformance?.maxStreak ?? null;
                const loserAps = params.loserPerformance?.aps ?? null;
            
            // Generate match reasoning if not provided
            let matchReasoning = params.matchReasoning;
            if (!matchReasoning) {
                // Get player data for reasoning generation
                const humanPlayerId = isWinnerHuman ? params.winnerId : params.loserId;
                const eloColumn = getEloColumnName(params.mode, params.operation);
                
                const humanData = db.prepare(`
                    SELECT ${eloColumn} as elo, math_tiers
                    FROM users WHERE id = ?
                `).get(humanPlayerId) as { elo?: number; math_tiers?: string } | undefined;
                
                let humanTier = 0;
                if (humanData?.math_tiers) {
                    try {
                        const tiers = JSON.parse(humanData.math_tiers);
                        humanTier = tiers[params.operation] || 0;
                    } catch { /* ignore */ }
                }
                
                const humanElo = humanData?.elo || 300;
                // Use default confidence (0.5) - actual confidence is calculated dynamically elsewhere
                const humanConfidence = 0.5;
                
                // For AI matches, estimate opponent stats
                // For human matches, try to get opponent data
                let opponentElo = humanElo;
                let opponentTier = humanTier;
                const opponentConfidence = 0.5;
                
                if (!isAiMatch) {
                    const opponentId = isWinnerHuman ? params.loserId : params.winnerId;
                    const opponentData = db.prepare(`
                        SELECT ${eloColumn} as elo, math_tiers
                        FROM users WHERE id = ?
                    `).get(opponentId) as { elo?: number; math_tiers?: string } | undefined;
                    
                    opponentElo = opponentData?.elo || 300;
                    if (opponentData?.math_tiers) {
                        try {
                            const tiers = JSON.parse(opponentData.math_tiers);
                            opponentTier = tiers[params.operation] || 0;
                        } catch { /* ignore */ }
                    }
                } else {
                    // AI opponent - estimate similar skill level with some variance
                    opponentElo = humanElo + (Math.random() * 100 - 50);
                    opponentTier = humanTier;
                }
                
                // Generate reasoning
                matchReasoning = generateMatchReasoningSync({
                    playerElo: isWinnerHuman ? humanElo : opponentElo,
                    playerTier: isWinnerHuman ? humanTier : opponentTier,
                    playerConfidence: humanConfidence,
                    playerIsReturning: false,
                    opponentElo: isWinnerHuman ? opponentElo : humanElo,
                    opponentTier: isWinnerHuman ? opponentTier : humanTier,
                    opponentConfidence: opponentConfidence,
                    opponentIsReturning: false,
                    queueTimeSeconds: 0, // Not available at save time
                    isAiMatch: isAiMatch,
                });
            }
                
                // Serialize match reasoning to JSON
            const matchReasoningJson = matchReasoning 
                ? JSON.stringify(matchReasoning) 
                    : null;

            // Connection quality and void status (use outer scope variables)
            const integrityForInsert = params.matchIntegrity || 'GREEN';
            const isVoidForInsert = integrityForInsert === 'RED';
            const voidReasonForInsert = isVoidForInsert ? `Match voided due to ${integrityForInsert} connection quality` : null;

                // Disable foreign key checks for AI matches (AI bot IDs don't exist in users table)
                if (isAiMatch) {
                    db.pragma('foreign_keys = OFF');
                }

                db.prepare(`
                    INSERT OR IGNORE INTO arena_matches (
                        id, winner_id, loser_id, winner_score, loser_score,
                        operation, mode, winner_elo_change, loser_elo_change,
                        winner_accuracy, winner_avg_speed_ms, winner_max_streak, winner_aps,
                        loser_accuracy, loser_avg_speed_ms, loser_max_streak, loser_aps,
                    match_reasoning, connection_quality, is_void, void_reason,
                    winner_coins, loser_coins, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                `).run(
                    params.matchId, params.winnerId, params.loserId, 
                    params.winnerScore, params.loserScore, 
                    params.operation, params.mode, 
                    winnerEloChange, loserEloChange,
                    winnerAcc, winnerSpeed, winnerStrk, winnerAps,
                    loserAcc, loserSpeed, loserStrk, loserAps,
                matchReasoningJson, integrityForInsert, isVoidForInsert ? 1 : 0, voidReasonForInsert,
                winnerCoinsEarned, loserCoinsEarned
                );

                // Re-enable foreign key checks
                if (isAiMatch) {
                    db.pragma('foreign_keys = ON');
                }
            } catch (e: any) {
                // Re-enable foreign key checks even on error
                if (isAiMatch) {
                    try { db.pragma('foreign_keys = ON'); } catch {}
                }
                if (!e.message?.includes('UNIQUE constraint')) throw e;
            }

        // Connection quality and void status (defined here for return scope)
        const integrity = params.matchIntegrity || 'GREEN';
        // Only RED voids the match - YELLOW is just a warning, match still counts
        const isVoid = integrity === 'RED';
        const voidReason = isVoid ? `Match voided due to ${integrity} connection quality` : null;

        // Revalidate
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/arena/modes");
        revalidatePath("/arena");
        revalidatePath("/stats");
        revalidatePath("/dashboard");

        return {
            success: true,
            winnerEloChange,
            loserEloChange,
            winnerCoinsEarned,
            loserCoinsEarned,
            isRanked,
            isVoid,
            isDraw: params.isDraw || false,
            voidReason: voidReason || undefined,
            connectionQuality: integrity
        };
    } catch (error: any) {
        console.error('[Match] Save result error:', error);
        return { success: false, error: `Failed to save match result: ${error?.message || error}` };
    }
}

/**
 * Operation-specific ELO structure
 */
export interface OperationElos {
    elo: number;  // Average of all operation ELOs
    addition: number;
    subtraction: number;
    multiplication: number;
    divisionOp: number;  // Renamed to avoid conflict with rank division
}

/**
 * Arena stats interface for the new Duel/Team ELO system
 */
export interface ArenaStatsResult {
    // Duel (1v1) stats
    duel: {
        elo: number;
        addition: number;
        subtraction: number;
        multiplication: number;
        divisionOp: number;  // Operation ELO
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;  // Rank division (I, II, III)
        winsToNextDivision: number;
    };
    // Team stats
    team: {
        elo: number;
        wins: number;
        losses: number;
        winStreak: number;
        bestWinStreak: number;
        rank: string;
        rankDivision: string;  // Rank division (I, II, III)
        winsToNextDivision: number;
        // Per-mode stats
        modes: {
            '2v2': OperationElos;
            '3v3': OperationElos;
            '4v4': OperationElos;
            '5v5': OperationElos;
        };
    };
}

const DEFAULT_STATS: ArenaStatsResult = {
    duel: {
        elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300,
        wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0,
        rank: 'Bronze', rankDivision: 'I', winsToNextDivision: 10
    },
    team: {
        elo: 300, wins: 0, losses: 0, winStreak: 0, bestWinStreak: 0,
        rank: 'Bronze', rankDivision: 'I', winsToNextDivision: 10,
        modes: {
            '2v2': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '3v3': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '4v4': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
            '5v5': { elo: 300, addition: 300, subtraction: 300, multiplication: 300, divisionOp: 300 },
        }
    }
};

/**
 * Get user's arena stats with new Duel/Team ELO system
 */
export async function getArenaStats(userId?: string): Promise<ArenaStatsResult> {
    const session = await auth();
    const targetId = userId || (session?.user as { id?: string })?.id;

    if (!targetId) {
        return DEFAULT_STATS;
    }

    try {
        // Get stats from PostgreSQL (source of truth)
        const pgStats = await getFullArenaStats(targetId);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/4a4de7d5-4d23-445b-a4cf-5b63e9469b33',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'matchmaking.ts:getArenaStats',message:'FAB stats fetched',data:{targetId,hasStats:!!pgStats,duelElo:pgStats?.duel?.elo,duelRank:pgStats?.duel?.rank,duelWins:pgStats?.duel?.wins,duelLosses:pgStats?.duel?.losses},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (!pgStats) {
            // Player doesn't exist in PostgreSQL yet, create them
            const { getDatabase } = await import("@/lib/db");
            const db = getDatabase();
            const user = db.prepare('SELECT name FROM users WHERE id = ?').get(targetId) as { name: string } | undefined;
            if (user) {
                await getOrCreateArenaPlayer(targetId, user.name || 'Player');
                // Return defaults for new player
            }
            return DEFAULT_STATS;
        }

        return pgStats;
    } catch (error) {
        console.error('[Arena] Error getting stats from PostgreSQL:', error);
        return DEFAULT_STATS;
    }
}

/**
 * Send an emoji message in a match lobby
 */
export async function sendMatchEmoji(matchId: string, emoji: string) {
    const session = await auth();
    if (!session?.user) return { success: false };
    const userId = (session.user as { id: string }).id;

    const redis = await getRedis();
    if (!redis) return { success: false };

    const chatKey = `arena:chat:${matchId}`;
    const message = JSON.stringify({
        emoji,
        senderId: userId,
        timestamp: Date.now()
    });

    try {
        await redis.rpush(chatKey, message);
        await redis.expire(chatKey, 300); // 5 minutes expiry
        return { success: true };
    } catch (_error) {
        return { success: false };
    }
}

/**
 * Get recent emoji messages for a match lobby
 */
export async function getMatchEmojis(matchId: string) {
    const redis = await getRedis();
    if (!redis) return [];

    const chatKey = `arena:chat:${matchId}`;
    try {
        const messages = await redis.lrange(chatKey, 0, -1);
        return messages.map((m: string) => JSON.parse(m));
    } catch (_error) {
        return [];
    }
}

// =============================================================================
// MATCH HISTORY - For FlashAuditor Match History Tab
// PostgreSQL is the source of truth for all arena match data
// =============================================================================

/**
 * Match history entry for display in FlashAuditor
 * Supports both solo (1v1) and team (5v5) matches
 */
export interface MatchHistoryEntry {
    id: string;
    // Match type
    matchType: 'solo' | 'team';
    // Solo match fields
    opponentName: string;
    opponentId: string;
    // Team match fields (optional)
    myTeamName?: string;
    opponentTeamName?: string;
    myTeamScore?: number;
    opponentTeamScore?: number;
    teammates?: { name: string; score: number; isIgl?: boolean; isAnchor?: boolean }[];
    wasIgl?: boolean;
    wasAnchor?: boolean;
    myPlayerScore?: number;
    // Common fields
    isWin: boolean;
    isDraw?: boolean;
    playerScore: number;
    opponentScore: number;
    eloChange: number;
    operation: string;
    mode: string;
    isAiMatch: boolean;
    matchReasoning: MatchReasoning | null;
    createdAt: string;
    // Relative time for display
    timeAgo: string;
    // Connection quality and match integrity
    connectionQuality?: string;  // GREEN, YELLOW, RED
    isVoid?: boolean;
    voidReason?: string;
    // Coin rewards
    coinsEarned?: number;
}

/**
 * Calculate relative time string (e.g., "2 hours ago")
 */
function getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    }
    if (diffHours > 0) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    if (diffMins > 0) {
        return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
    }
    return 'Just now';
}

/**
 * Get solo (1v1) match history for the current user from PostgreSQL
 * Returns the last N matches with reasoning for FlashAuditor display
 */
export async function getMatchHistory(limit: number = 10): Promise<{
    matches: MatchHistoryEntry[];
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { matches: [], error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;

    try {
        // Import PostgreSQL arena functions
        const { getPlayerDuelHistory } = await import("@/lib/arena/arena-db");
        const { getDatabase } = await import("@/lib/db");
        const db = getDatabase();

        // Get solo matches from PostgreSQL (source of truth)
        console.log(`[MatchHistory] Fetching solo matches for user ${userId}`);
        const matches = await getPlayerDuelHistory(userId, limit);
        console.log(`[MatchHistory] Found ${matches?.length || 0} solo matches`);

        if (!matches || matches.length === 0) {
            return { matches: [] };
        }

        // Get user names from SQLite for display (PostgreSQL only has usernames, not full names)
        const userNameCache: Record<string, string> = {};
        const getUserName = (odUserId: string, fallbackName: string): string => {
            if (userNameCache[odUserId]) return userNameCache[odUserId];
            if (odUserId?.startsWith('ai-') || odUserId?.startsWith('ai_bot_')) {
                return 'AI Opponent';
            }
            try {
                const user = db.prepare('SELECT name FROM users WHERE id = ?').get(odUserId) as { name: string } | undefined;
                const name = user?.name || fallbackName || 'Unknown';
                userNameCache[odUserId] = name;
                return name;
            } catch {
                return fallbackName || 'Unknown';
            }
        };

        const historyEntries: MatchHistoryEntry[] = matches.map((match: any) => {
            const isPlayer1 = match.player1_id === userId;
            const isWin = match.winner_id === userId;
            const isDraw = match.is_draw === true || match.player1_score === match.player2_score;
            
            const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
            const opponentName = getUserName(opponentId, isPlayer1 ? match.player2_name : match.player1_name);
            const isAiMatch = opponentId?.startsWith('ai-') || opponentId?.startsWith('ai_bot_') || match.is_ai_match === true;
            
            // Parse match reasoning if available
            let matchReasoning: MatchReasoning | null = null;
            if (match.match_reasoning) {
                try {
                    matchReasoning = typeof match.match_reasoning === 'string' 
                        ? JSON.parse(match.match_reasoning) 
                        : match.match_reasoning;
                } catch (e) {
                    console.warn('[MatchHistory] Failed to parse match_reasoning:', e);
                }
            }

            const playerScore = isPlayer1 ? match.player1_score : match.player2_score;
            const opponentScore = isPlayer1 ? match.player2_score : match.player1_score;
            const eloChange = isPlayer1 ? (match.player1_elo_change || 0) : (match.player2_elo_change || 0);

            return {
                id: match.id,
                matchType: 'solo' as const,
                opponentName,
                opponentId: opponentId || '',
                isWin: !isDraw && isWin,
                isDraw,
                playerScore: playerScore || 0,
                opponentScore: opponentScore || 0,
                eloChange: isDraw ? 0 : eloChange,
                operation: match.operation || 'mixed',
                mode: match.mode || '1v1',
                isAiMatch,
                matchReasoning,
                createdAt: match.created_at,
                timeAgo: getTimeAgo(match.created_at),
                connectionQuality: match.connection_quality || 'GREEN',
                isVoid: match.is_void === true,
                voidReason: match.void_reason || undefined,
                coinsEarned: isWin ? (match.winner_coins || 0) : (match.loser_coins || 0),
            };
        });

        return { matches: historyEntries };
    } catch (error) {
        console.error('[MatchHistory] Error fetching solo match history from PostgreSQL:', error);
        return { matches: [], error: 'Failed to fetch match history' };
    }
}

/**
 * Get team (5v5) match history for the current user from PostgreSQL
 * Returns the last N team matches for FlashAuditor display
 */
export async function getTeamMatchHistoryForUser(limit: number = 10): Promise<{
    matches: MatchHistoryEntry[];
    error?: string;
}> {
    const session = await auth();
    if (!session?.user) {
        return { matches: [], error: 'Unauthorized' };
    }

    const userId = (session.user as { id: string }).id;

    try {
        // Import PostgreSQL arena functions
        const { getPlayerTeamHistory } = await import("@/lib/arena/arena-db");
        const { getDatabase } = await import("@/lib/db");
        const db = getDatabase();

        // Get team matches from PostgreSQL (source of truth)
        console.log(`[MatchHistory] Fetching team matches for user ${userId}`);
        const matches = await getPlayerTeamHistory(userId, limit);
        console.log(`[MatchHistory] Found ${matches?.length || 0} team matches`);

        if (!matches || matches.length === 0) {
            return { matches: [] };
        }

        // Get user names from SQLite for display
        const userNameCache: Record<string, string> = {};
        const _getUserName = (odUserId: string): string => {
            if (userNameCache[odUserId]) return userNameCache[odUserId];
            if (odUserId?.startsWith('ai_bot_')) return 'AI Bot';
            try {
                const user = db.prepare('SELECT name FROM users WHERE id = ?').get(odUserId) as { name: string } | undefined;
                const name = user?.name || 'Unknown';
                userNameCache[odUserId] = name;
                return name;
            } catch {
                return 'Unknown';
            }
        };

        const historyEntries: MatchHistoryEntry[] = matches.map((match: any) => {
            const isTeam1 = match.team_number === 1;
            const myTeamScore = isTeam1 ? match.team1_score : match.team2_score;
            const opponentTeamScore = isTeam1 ? match.team2_score : match.team1_score;
            const isWin = match.winner_team === match.team_number;
            const isDraw = match.winner_team === 0 || match.winner_team === null || match.team1_score === match.team2_score;
            const isAiMatch = match.is_ai_match === true || 
                              match.team1_name?.includes('AI') || 
                              match.team2_name?.includes('AI');

            const myTeamName = isTeam1 ? match.team1_name : match.team2_name;
            const opponentTeamName = isTeam1 ? match.team2_name : match.team1_name;

            return {
                id: match.id,
                matchType: 'team' as const,
                // For team matches, use team names instead of opponent name
                opponentName: opponentTeamName || 'Opponent Team',
                opponentId: '',
                myTeamName: myTeamName || 'My Team',
                opponentTeamName: opponentTeamName || 'Opponent Team',
                myTeamScore,
                opponentTeamScore,
                wasIgl: match.is_igl === true,
                wasAnchor: match.is_anchor === true,
                myPlayerScore: match.player_score || 0,
                isWin: !isDraw && isWin,
                isDraw,
                playerScore: myTeamScore || 0,
                opponentScore: opponentTeamScore || 0,
                eloChange: isDraw ? 0 : (match.player_elo_change || 0),
                operation: match.operation || 'mixed',
                mode: '5v5',
                isAiMatch,
                matchReasoning: null, // Team matches don't have the same reasoning structure
                createdAt: match.created_at,
                timeAgo: getTimeAgo(match.created_at),
                connectionQuality: match.connection_quality || 'GREEN',
                isVoid: match.is_void === true || match.is_forfeit === true,
                voidReason: match.is_forfeit ? 'Forfeit' : undefined,
                coinsEarned: 0, // TODO: Add coin rewards for team matches
            };
        });

        return { matches: historyEntries };
    } catch (error) {
        console.error('[MatchHistory] Error fetching team match history from PostgreSQL:', error);
        return { matches: [], error: 'Failed to fetch team match history' };
    }
}

/**
 * Get combined match history (solo + team) for the current user
 * Returns matches from both modes sorted by date, from PostgreSQL
 */
export async function getCombinedMatchHistory(limit: number = 10): Promise<{
    soloMatches: MatchHistoryEntry[];
    teamMatches: MatchHistoryEntry[];
    allMatches: MatchHistoryEntry[];
    error?: string;
}> {
    const [soloResult, teamResult] = await Promise.all([
        getMatchHistory(limit),
        getTeamMatchHistoryForUser(limit),
    ]);

    // Combine and sort by date
    const allMatches = [
        ...(soloResult.matches || []),
        ...(teamResult.matches || []),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, limit);

    return {
        soloMatches: soloResult.matches || [],
        teamMatches: teamResult.matches || [],
        allMatches,
        error: soloResult.error || teamResult.error,
    };
}
