# Design Document

## Overview

This design fixes the 5v5 casual queue system by properly propagating match type selection from the team setup UI through to the matchmaking system. The core issue is that while the UI allows selecting casual mode, the queue system is hardcoded to use ranked mode, preventing casual matches from working correctly.

## Architecture

The fix involves updating the data flow between three main components:

1. **Team Setup UI** - Where match type is selected
2. **Party State System** - Redis-based party state storage (already supports matchType)
3. **Queue System** - Matchmaking logic that needs to receive the correct match type

### Current Flow (Broken)
```
Team Setup → updatePartyQueueStatus(partyId, status) → Queue Page → joinTeamQueue({matchType: 'ranked'})
```

### Fixed Flow
```
Team Setup → updateQueueState(partyId, leaderId, status, matchType) → Queue Page → joinTeamQueue({matchType: partyState.matchType})
```

## Components and Interfaces

### 1. Team Setup Client (`src/app/arena/teams/setup/team-setup-client.tsx`)

**Current Issues:**
- Uses `updatePartyQueueStatus` from social.ts which doesn't accept matchType
- Doesn't pass selected matchType to queue system

**Changes Needed:**
- Import `updateQueueState` from party-redis.ts instead of social.ts
- Pass matchType parameter when updating queue state
- Update function calls to use correct signature

**Modified Functions:**
```typescript
// Before
const result = await updatePartyQueueStatus(party.id, 'finding_opponents');

// After  
const result = await updateQueueState(party.id, userId, 'finding_opponents', matchType);
```

### 2. Queue Client (`src/app/arena/teams/queue/team-queue-client.tsx`)

**Current Issues:**
- Hardcoded `matchType: 'ranked'` in joinTeamQueue call
- Doesn't read matchType from party state

**Changes Needed:**
- Read matchType from party.queueState.matchType
- Pass correct matchType to joinTeamQueue
- Display current match type in UI

**Modified Logic:**
```typescript
// Before
const result = await joinTeamQueue({
    partyId: activePartyId,
    matchType: 'ranked',
});

// After
const matchType = party.queueState?.matchType || 'ranked';
const result = await joinTeamQueue({
    partyId: activePartyId,
    matchType: matchType,
});
```

### 3. Party State System (`src/lib/party/party-redis.ts`)

**Current State:** Already supports matchType in PartyQueueState interface ✅

**Interface:**
```typescript
export interface PartyQueueState {
    status: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';
    startedAt: number | null;
    matchType: 'ranked' | 'casual' | null;
    matchId: string | null;
}
```

### 4. Team Matchmaking (`src/lib/actions/team-matchmaking.ts`)

**Current State:** Already supports casual matchType ✅

**Existing Logic:**
- `joinTeamQueue()` accepts matchType parameter
- Casual matches allow parties with <5 members
- AI teammate generation exists in `generateAITeammates()`
- Separate Redis queues for ranked/casual

## Data Models

### Party Queue State
```typescript
interface PartyQueueState {
    status: 'idle' | 'finding_teammates' | 'finding_opponents' | 'match_found';
    startedAt: number | null;
    matchType: 'ranked' | 'casual' | null;  // ← Already exists
    matchId: string | null;
}
```

### Team Queue Entry
```typescript
interface TeamQueueEntry {
    // ... existing fields
    odMatchType: 'ranked' | 'casual';  // ← Already exists
    hasAITeammates?: boolean;          // ← Already exists
    humanMemberCount?: number;         // ← Already exists
}
```

## Error Handling

### Match Type Validation
- Default to 'ranked' if matchType is null/undefined
- Validate matchType is one of: 'ranked' | 'casual'
- Log warnings when matchType is missing or invalid

### Queue State Consistency
- Ensure party.queueState.matchType matches the actual queue being used
- Add validation in queue operations to verify matchType consistency
- Provide clear error messages when matchType mismatch occurs

### AI Teammate Generation
- Handle cases where AI teammate generation fails
- Ensure team size validation works with AI teammates
- Provide fallback behavior if AI generation is unavailable

## Testing Strategy

### Unit Tests
- Test match type propagation from setup to queue
- Test AI teammate generation for casual matches
- Test queue key selection based on match type
- Test error handling for invalid match types

### Integration Tests  
- Test full flow: setup → queue → matchmaking for casual mode
- Test AI teammate addition in casual matches
- Test opponent finding for casual vs casual matches
- Test UI display of correct match type throughout flow

### Property-Based Tests
- Test that casual matches always use casual queue keys
- Test that AI teammates are added when party size < 5 in casual
- Test that match type is preserved across all queue operations

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Match Type Propagation
*For any* party and match type selection (ranked/casual), when the party leader selects a match type in setup and starts the queue, the queue system should receive and use that exact match type for all subsequent operations
**Validates: Requirements 1.1, 1.2, 1.4, 4.3**

### Property 2: Party State Match Type Persistence  
*For any* party and match type, when the match type is set in party state, it should be correctly stored in Redis and retrievable by subsequent operations
**Validates: Requirements 1.5, 4.1, 4.2**

### Property 3: UI Match Type Display Consistency
*For any* party with a set match type, all UI components should display the same match type terminology and indicate the correct implications (ELO changes for ranked, no ELO changes for casual)
**Validates: Requirements 1.3, 5.1, 5.4**

### Property 4: Casual AI Teammate Addition
*For any* casual party with fewer than 5 members, when joining the queue, the system should add AI teammates to reach exactly 5 total members with realistic profiles and balanced ELO values
**Validates: Requirements 2.1, 2.2, 2.4**

### Property 5: Team ELO Calculation with AI
*For any* team containing AI teammates, the team ELO calculation should include both human and AI teammate ELO values in the average
**Validates: Requirements 2.3**

### Property 6: AI Teammate Visual Identification
*For any* team roster containing AI teammates, the UI should clearly distinguish AI teammates from human players
**Validates: Requirements 2.5, 5.5**

### Property 7: Casual Queue Opponent Matching
*For any* casual team in queue, the matchmaking system should only match them with other casual teams and use the correct Redis queue key
**Validates: Requirements 3.1, 3.3, 3.4**

### Property 8: Queue Search Expansion
*For any* team in queue, when no immediate opponents are found, the ELO search range should expand over time according to the defined expansion rate
**Validates: Requirements 3.2**

### Property 9: Queue State Consistency
*For any* queue operation, the match type used should be consistent with the party's stored match type throughout the entire queue flow
**Validates: Requirements 4.4**