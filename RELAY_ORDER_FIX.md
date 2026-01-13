# Relay Order Logic Fix

## Problem Description

The relay team matches had an issue where player turns would go out of order. Players were sometimes skipped or the turn sequence would be inconsistent, causing confusion and unfair gameplay.

## Root Cause Analysis

The issue was in the `getActivePlayer` function in `server.js`. The function was using a hardcoded `SLOT_OPERATIONS` array to determine which player should be active for a given slot number:

```javascript
// PROBLEMATIC CODE
function getActivePlayer(teamState, slotNumber) {
    const slotOp = SLOT_OPERATIONS[slotNumber - 1] || SLOT_OPERATIONS[0];
    const playerId = teamState.slotAssignments[slotOp];
    return teamState.players[playerId] || null;
}
```

**The Problem:**
- `SLOT_OPERATIONS = ['addition', 'subtraction', 'multiplication', 'division', 'mixed']`
- The function assumed slot assignments would always match this exact order
- If `slotAssignments` had a different order or missing slots, players would go out of order
- For example, if assignments were `{'mixed': 'player1', 'addition': 'player2'}`, slot 1 would try to get 'addition' but slot 2 would try to get 'subtraction' (which doesn't exist)

## Solution

### 1. New `getOrderedSlotAssignments` Function

Created a helper function that returns slot assignments in the correct order:

```javascript
function getOrderedSlotAssignments(teamState) {
    // Use the predefined SLOT_OPERATIONS order, but only include slots that have assignments
    const orderedSlots = [];
    
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
```

### 2. Updated `getActivePlayer` Function

Modified to use the ordered slot assignments **while preserving Double Call-In logic**:

```javascript
function getActivePlayer(teamState, slotNumber) {
    // Get the ordered list of slot assignments to ensure consistent turn order
    const orderedSlots = getOrderedSlotAssignments(teamState);
    const slotOp = orderedSlots[slotNumber - 1];
    
    if (!slotOp) {
        console.error(`[TeamMatch] No slot operation found for slot ${slotNumber}. Available slots:`, orderedSlots);
        return null;
    }
    
    // PRESERVED: Check if Double Call-In is active for this slot
    if (teamState.doubleCallinActive && teamState.doubleCallinSlot === slotOp) {
        // Return the anchor player instead of the normally assigned player
        const anchorPlayer = teamState.players[teamState.anchorId];
        if (anchorPlayer) {
            console.log(`[TeamMatch] Double Call-In: Anchor ${anchorPlayer.odName} playing slot ${slotOp} instead of benched player`);
            return anchorPlayer;
        }
    }
    
    const playerId = teamState.slotAssignments[slotOp];
    const player = teamState.players[playerId];
    
    if (!player) {
        console.error(`[TeamMatch] No player found for slot ${slotNumber} (${slotOp}). PlayerId: ${playerId}`);
    }
    
    return player || null;
}
```

### 3. Updated `getSlotOperation` Function

Modified to accept team state and use ordered assignments:

```javascript
function getSlotOperation(slotNumber, matchOperation, teamState = null) {
    if (matchOperation === 'mixed' && teamState) {
        // Use the ordered slot assignments to ensure consistent turn order
        const orderedSlots = getOrderedSlotAssignments(teamState);
        return orderedSlots[slotNumber - 1] || 'addition';
    } else if (matchOperation === 'mixed') {
        // Fallback to original behavior if no team state provided
        return SLOT_OPERATIONS[slotNumber - 1] || 'addition';
    }
    return matchOperation;
}
```

### 4. Updated All Function Calls

Updated all calls to `getSlotOperation` to pass the team state where available:

```javascript
// Before
const slotOp = getSlotOperation(team.currentSlot, match.operation);

// After  
const slotOp = getSlotOperation(team.currentSlot, match.operation, team);
```

### 5. Updated Mock Match State

Also fixed the mock match state used for testing and demos to use the same consistent ordering logic.

## Compatibility with Advanced Features

### ✅ IGL Slot Reassignments
The fix **fully supports** IGL slot reassignments during strategy phase and halftime:
- IGL reassignments update `team.slotAssignments` (the authoritative source)
- `getOrderedSlotAssignments` reads from `team.slotAssignments`
- Turn order remains consistent after any IGL reassignment
- **Tested**: IGL swapping players between slots maintains correct turn order

### ✅ Double Call-In (Anchor Ability)
The fix **preserves all Double Call-In functionality**:
- Anchor can still take over any slot using Double Call-In
- `getActivePlayer` checks `doubleCallinActive` and `doubleCallinSlot` 
- Returns anchor player when Double Call-In is active for that slot
- Works correctly with IGL reassignments + Double Call-In combined
- **Tested**: Anchor takeover works in all scenarios, including after IGL reassignments

## Benefits of the Fix

1. **Consistent Turn Order**: Players will always go in the same predictable order regardless of how slot assignments are stored
2. **Handles Missing Slots**: Gracefully handles teams with fewer than 5 players
3. **Backwards Compatible**: Still works with existing slot assignment formats
4. **Better Error Handling**: Logs detailed errors when players or slots are missing
5. **Maintains SLOT_OPERATIONS Priority**: Prefers the standard order (addition → subtraction → multiplication → division → mixed) when possible
6. **✅ IGL Reassignment Compatible**: Works seamlessly with IGL slot reassignments
7. **✅ Double Call-In Compatible**: Preserves all anchor ability functionality
8. **✅ Complex Scenario Support**: Handles IGL reassignments + Double Call-In combinations

## Test Coverage

### Unit Tests (`tests/unit/relay-order-fix.test.ts`)
- ✅ Normal slot assignments work correctly
- ✅ **IGL slot reassignments maintain correct order**
- ✅ **Double Call-In (anchor takeover) works correctly**
- ✅ **Complex scenario: IGL reassignments + Double Call-In combined**
- ✅ Scrambled slot assignments maintain correct order
- ✅ Missing slot assignments handled gracefully
- ✅ Ordered slot assignments function works correctly
- ✅ Fallback behavior for non-standard slot names

### Integration Tests (`tests/arena/relay-order-integration.test.js`)
- ✅ Server-side logic maintains consistent turn order
- ✅ Partial team assignments work correctly

## Files Modified

1. `server.js` - Main server-side Socket.IO logic
   - Updated `getActivePlayer` function (preserved Double Call-In logic)
   - Added `getOrderedSlotAssignments` helper
   - Updated `getSlotOperation` function
   - Updated all function calls to pass team state

2. `src/lib/arena/mock-match-state.ts` - Mock match state for testing
   - Updated `advanceTeamSlot` function
   - Updated `updateTeamPlayerStates` function
   - Added `getOrderedSlotAssignments` helper

3. `tests/unit/relay-order-fix.test.ts` - Comprehensive unit tests
4. `tests/arena/relay-order-integration.test.js` - Integration tests

## Verification

The fix has been tested and verified to:
- ✅ Maintain correct player turn order in all scenarios
- ✅ **Work correctly with IGL slot reassignments**
- ✅ **Preserve Double Call-In functionality completely**
- ✅ **Handle complex combinations of IGL reassignments + Double Call-In**
- ✅ Handle edge cases like missing players or scrambled assignments
- ✅ Preserve existing functionality (all advanced features)
- ✅ Work with both full teams (5 players) and partial teams
- ✅ Provide clear error logging for debugging

The relay order issue is now completely resolved and **fully compatible with all advanced team match features**.