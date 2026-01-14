/**
 * Test for relay order logic fix
 * Verifies that player turns go in the correct order regardless of slot assignment order
 * Tests IGL reassignments and Double Call-In scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock the server-side functions for testing
interface TeamState {
  teamId: string;
  slotAssignments: Record<string, string>;
  players: Record<string, { 
    odUserId: string; 
    odName: string; 
    slot: string; 
    isActive: boolean; 
    isComplete: boolean; 
  }>;
  currentSlot: number;
  questionsInSlot: number;
  // Double Call-In properties
  doubleCallinActive?: boolean;
  doubleCallinSlot?: string;
  anchorId?: string;
}

const SLOT_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'mixed'];

function getOrderedSlotAssignments(teamState: TeamState): string[] {
  // Use the predefined SLOT_OPERATIONS order, but only include slots that have assignments
  const orderedSlots: string[] = [];
  
  for (const operation of SLOT_OPERATIONS) {
    if (teamState.slotAssignments[operation]) {
      orderedSlots.push(operation);
    }
  }
  
  // Fallback: if no slots match SLOT_OPERATIONS, use whatever assignments exist
  if (orderedSlots.length === 0) {
    orderedSlots.push(...Object.keys(teamState.slotAssignments));
  }
  
  return orderedSlots;
}

function getActivePlayer(teamState: TeamState, slotNumber: number) {
  // Get the ordered list of slot assignments to ensure consistent turn order
  const orderedSlots = getOrderedSlotAssignments(teamState);
  const slotOp = orderedSlots[slotNumber - 1];
  
  if (!slotOp) {
    return null;
  }
  
  // Check if Double Call-In is active for this slot
  if (teamState.doubleCallinActive && teamState.doubleCallinSlot === slotOp) {
    // Return the anchor player instead of the normally assigned player
    const anchorPlayer = teamState.players[teamState.anchorId!];
    if (anchorPlayer) {
      return anchorPlayer;
    }
  }
  
  const playerId = teamState.slotAssignments[slotOp];
  return teamState.players[playerId] || null;
}

describe('Relay Order Logic Fix', () => {
  let teamState: TeamState;

  beforeEach(() => {
    teamState = {
      teamId: 'team1',
      slotAssignments: {
        'addition': 'player1',
        'subtraction': 'player2', 
        'multiplication': 'player3',
        'division': 'player4',
        'mixed': 'player5'
      },
      players: {
        'player1': { odUserId: 'player1', odName: 'Player 1', slot: 'addition', isActive: false, isComplete: false },
        'player2': { odUserId: 'player2', odName: 'Player 2', slot: 'subtraction', isActive: false, isComplete: false },
        'player3': { odUserId: 'player3', odName: 'Player 3', slot: 'multiplication', isActive: false, isComplete: false },
        'player4': { odUserId: 'player4', odName: 'Player 4', slot: 'division', isActive: false, isComplete: false },
        'player5': { odUserId: 'player5', odName: 'Player 5', slot: 'mixed', isActive: false, isComplete: false }
      },
      currentSlot: 1,
      questionsInSlot: 0,
      anchorId: 'player5' // Player 5 is the anchor
    };
  });

  it('should return players in correct order for normal slot assignments', () => {
    // Test that players are returned in the expected order: addition -> subtraction -> multiplication -> division -> mixed
    const player1 = getActivePlayer(teamState, 1);
    const player2 = getActivePlayer(teamState, 2);
    const player3 = getActivePlayer(teamState, 3);
    const player4 = getActivePlayer(teamState, 4);
    const player5 = getActivePlayer(teamState, 5);

    expect(player1?.odName).toBe('Player 1'); // addition
    expect(player2?.odName).toBe('Player 2'); // subtraction
    expect(player3?.odName).toBe('Player 3'); // multiplication
    expect(player4?.odName).toBe('Player 4'); // division
    expect(player5?.odName).toBe('Player 5'); // mixed
  });

  it('should handle IGL slot reassignments correctly', () => {
    // Simulate IGL reassigning slots during strategy phase
    // IGL swaps Player 1 (addition) with Player 3 (multiplication)
    teamState.slotAssignments = {
      'addition': 'player3',      // Player 3 now does addition
      'subtraction': 'player2', 
      'multiplication': 'player1', // Player 1 now does multiplication
      'division': 'player4',
      'mixed': 'player5'
    };

    // Update player slot references (as the server would do)
    teamState.players['player1'].slot = 'multiplication';
    teamState.players['player3'].slot = 'addition';

    // Should still follow SLOT_OPERATIONS order: addition -> subtraction -> multiplication -> division -> mixed
    const player1 = getActivePlayer(teamState, 1); // Should be addition (now player3)
    const player2 = getActivePlayer(teamState, 2); // Should be subtraction (player2)
    const player3 = getActivePlayer(teamState, 3); // Should be multiplication (now player1)
    const player4 = getActivePlayer(teamState, 4); // Should be division (player4)
    const player5 = getActivePlayer(teamState, 5); // Should be mixed (player5)

    expect(player1?.odName).toBe('Player 3'); // addition (reassigned)
    expect(player2?.odName).toBe('Player 2'); // subtraction (unchanged)
    expect(player3?.odName).toBe('Player 1'); // multiplication (reassigned)
    expect(player4?.odName).toBe('Player 4'); // division (unchanged)
    expect(player5?.odName).toBe('Player 5'); // mixed (unchanged)
  });

  it('should handle Double Call-In (anchor takeover) correctly', () => {
    // Activate Double Call-In: Anchor (Player 5) takes over multiplication slot
    teamState.doubleCallinActive = true;
    teamState.doubleCallinSlot = 'multiplication';

    // Normal slots should work as expected
    const player1 = getActivePlayer(teamState, 1); // addition (player1)
    const player2 = getActivePlayer(teamState, 2); // subtraction (player2)
    const player3 = getActivePlayer(teamState, 3); // multiplication (should be anchor - player5)
    const player4 = getActivePlayer(teamState, 4); // division (player4)
    const player5 = getActivePlayer(teamState, 5); // mixed (player5 - anchor's original slot)

    expect(player1?.odName).toBe('Player 1'); // addition (normal)
    expect(player2?.odName).toBe('Player 2'); // subtraction (normal)
    expect(player3?.odName).toBe('Player 5'); // multiplication (ANCHOR TAKEOVER)
    expect(player4?.odName).toBe('Player 4'); // division (normal)
    expect(player5?.odName).toBe('Player 5'); // mixed (anchor's original slot)
  });

  it('should handle Double Call-In with IGL reassignments', () => {
    // Complex scenario: IGL reassigns slots AND anchor uses Double Call-In
    
    // First, IGL reassigns slots
    teamState.slotAssignments = {
      'addition': 'player2',      // Player 2 -> addition
      'subtraction': 'player1',   // Player 1 -> subtraction  
      'multiplication': 'player3', // Player 3 -> multiplication
      'division': 'player4',      // Player 4 -> division
      'mixed': 'player5'          // Player 5 -> mixed (anchor)
    };

    // Then, anchor activates Double Call-In for division slot
    teamState.doubleCallinActive = true;
    teamState.doubleCallinSlot = 'division';

    const player1 = getActivePlayer(teamState, 1); // addition (player2)
    const player2 = getActivePlayer(teamState, 2); // subtraction (player1)
    const player3 = getActivePlayer(teamState, 3); // multiplication (player3)
    const player4 = getActivePlayer(teamState, 4); // division (should be anchor - player5)
    const player5 = getActivePlayer(teamState, 5); // mixed (player5 - anchor's original slot)

    expect(player1?.odName).toBe('Player 2'); // addition (reassigned)
    expect(player2?.odName).toBe('Player 1'); // subtraction (reassigned)
    expect(player3?.odName).toBe('Player 3'); // multiplication (unchanged)
    expect(player4?.odName).toBe('Player 5'); // division (ANCHOR TAKEOVER)
    expect(player5?.odName).toBe('Player 5'); // mixed (anchor's original slot)
  });

  it('should handle scrambled slot assignments correctly', () => {
    // Scramble the slot assignments to test that order is still consistent
    teamState.slotAssignments = {
      'mixed': 'player1',
      'addition': 'player2',
      'division': 'player3', 
      'subtraction': 'player4',
      'multiplication': 'player5'
    };

    // Update player slot references to match
    teamState.players['player1'].slot = 'mixed';
    teamState.players['player2'].slot = 'addition';
    teamState.players['player3'].slot = 'division';
    teamState.players['player4'].slot = 'subtraction';
    teamState.players['player5'].slot = 'multiplication';

    // Should still follow SLOT_OPERATIONS order: addition -> subtraction -> multiplication -> division -> mixed
    const player1 = getActivePlayer(teamState, 1); // Should be addition (player2)
    const player2 = getActivePlayer(teamState, 2); // Should be subtraction (player4)
    const player3 = getActivePlayer(teamState, 3); // Should be multiplication (player5)
    const player4 = getActivePlayer(teamState, 4); // Should be division (player3)
    const player5 = getActivePlayer(teamState, 5); // Should be mixed (player1)

    expect(player1?.odName).toBe('Player 2'); // addition
    expect(player2?.odName).toBe('Player 4'); // subtraction
    expect(player3?.odName).toBe('Player 5'); // multiplication
    expect(player4?.odName).toBe('Player 3'); // division
    expect(player5?.odName).toBe('Player 1'); // mixed
  });

  it('should handle missing slot assignments gracefully', () => {
    // Remove some slot assignments to test partial teams
    teamState.slotAssignments = {
      'addition': 'player1',
      'multiplication': 'player3',
      'mixed': 'player5'
    };

    // Only 3 players assigned
    const player1 = getActivePlayer(teamState, 1); // Should be addition (player1)
    const player2 = getActivePlayer(teamState, 2); // Should be multiplication (player3)
    const player3 = getActivePlayer(teamState, 3); // Should be mixed (player5)
    const player4 = getActivePlayer(teamState, 4); // Should be null (no more players)

    expect(player1?.odName).toBe('Player 1'); // addition
    expect(player2?.odName).toBe('Player 3'); // multiplication
    expect(player3?.odName).toBe('Player 5'); // mixed
    expect(player4).toBeNull(); // no player for slot 4
  });

  it('should get ordered slot assignments correctly', () => {
    const orderedSlots = getOrderedSlotAssignments(teamState);
    expect(orderedSlots).toEqual(['addition', 'subtraction', 'multiplication', 'division', 'mixed']);
  });

  it('should handle scrambled assignments in getOrderedSlotAssignments', () => {
    teamState.slotAssignments = {
      'mixed': 'player1',
      'addition': 'player2',
      'division': 'player3'
    };

    const orderedSlots = getOrderedSlotAssignments(teamState);
    // Should still be in SLOT_OPERATIONS order, but only include assigned slots
    expect(orderedSlots).toEqual(['addition', 'division', 'mixed']);
  });

  it('should fallback to assignment keys if no SLOT_OPERATIONS match', () => {
    // Use completely different slot names
    teamState.slotAssignments = {
      'custom1': 'player1',
      'custom2': 'player2',
      'custom3': 'player3'
    };

    const orderedSlots = getOrderedSlotAssignments(teamState);
    // Should fallback to whatever keys exist
    expect(orderedSlots).toEqual(['custom1', 'custom2', 'custom3']);
  });
});