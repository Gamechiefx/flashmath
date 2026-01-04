/**
 * API Route: Create Test Match
 * 
 * Creates an AI match for synthetic testing.
 * Only available in development/test environments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAITeamMatch } from '@/lib/actions/team-matchmaking';
import { generateAITeam } from '@/lib/arena/ai-team';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
    // Only allow in development/test
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_API) {
        return NextResponse.json(
            { error: 'Test API not available in production' },
            { status: 403 }
        );
    }
    
    try {
        const body = await request.json();
        const { partyId, difficulty = 'easy', testMode = false } = body;
        
        // Generate test party if not provided
        const testPartyId = partyId || uuidv4();
        
        // Generate test human team
        const testTeam = {
            teamId: uuidv4(),
            teamName: 'Test Team',
            leaderId: `test-leader-${Date.now()}`,
            leaderName: 'TestLeader',
            players: Array.from({ length: 5 }, (_, i) => ({
                odUserId: `test-user-${i}-${Date.now()}`,
                odName: `TestPlayer${i + 1}`,
                isIGL: i === 0,
                isAnchor: i === 1,
            })),
        };
        
        // Generate AI team
        const aiTeam = generateAITeam(difficulty);
        
        // Create match ID
        const matchId = uuidv4();
        
        // Store match setup in Redis (simplified for testing)
        // In real implementation, this would use the full createAITeamMatch flow
        
        return NextResponse.json({
            success: true,
            matchId,
            partyId: testPartyId,
            humanTeam: testTeam,
            aiTeam: {
                teamId: aiTeam.teamId,
                teamName: aiTeam.teamName,
                playerCount: aiTeam.players.length,
            },
            testMode,
        });
    } catch (error: any) {
        console.error('[TestAPI] Error creating match:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// Health check
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        testMode: process.env.NODE_ENV !== 'production',
    });
}

