# Implementation Plan: 5v5 Casual Queue Fix

## Overview

Fix the 5v5 casual queue system by properly propagating match type selection from team setup UI to the matchmaking system. The core changes involve updating the team setup to pass match type to party state, and updating the queue page to read and use the correct match type.

## Tasks

- [x] 1. Fix Team Setup Match Type Propagation
  - Update team setup client to use correct updateQueueState function
  - Pass selected matchType parameter when starting queue
  - Import updateQueueState from party-redis instead of social actions
  - _Requirements: 1.1, 1.2, 1.4, 1.5_

- [x] 1.1 Write property test for match type propagation
  - **Property 1: Match Type Propagation**
  - **Validates: Requirements 1.1, 1.2, 1.4, 4.3**

- [x] 2. Update Queue Page to Use Party Match Type
  - Read matchType from party.queueState.matchType
  - Pass correct matchType to joinTeamQueue instead of hardcoded 'ranked'
  - Add fallback to 'ranked' if matchType is null/undefined
  - _Requirements: 4.2, 4.3_

- [x] 2.1 Write property test for queue match type usage
  - **Property 9: Queue State Consistency**
  - **Validates: Requirements 4.4**

- [x] 3. Add Match Type Display to Queue UI
  - Display current match type prominently on queue page
  - Show appropriate messaging for ranked vs casual matches
  - Use consistent terminology across UI components
  - _Requirements: 1.3, 5.1, 5.2, 5.3, 5.4_

- [x] 3.1 Write property test for UI match type display
  - **Property 3: UI Match Type Display Consistency**
  - **Validates: Requirements 1.3, 5.1, 5.4**

- [x] 4. Verify AI Teammate Addition for Casual Matches
  - Test that casual parties with <5 members get AI teammates
  - Verify AI teammates have realistic profiles and balanced ELO
  - Ensure AI teammates are visually distinguished in UI
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [x] 4.1 Write property test for AI teammate addition
  - **Property 4: Casual AI Teammate Addition**
  - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 4.2 Write property test for AI teammate ELO calculation
  - **Property 5: Team ELO Calculation with AI**
  - **Validates: Requirements 2.3**

- [x] 4.3 Write property test for AI teammate visual identification
  - **Property 6: AI Teammate Visual Identification**
  - **Validates: Requirements 2.5, 5.5**

- [x] 5. Verify Casual Queue Opponent Finding
  - Test that casual teams can find other casual teams as opponents
  - Verify correct Redis queue key usage for casual matches
  - Test queue expansion logic when no opponents available
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5.1 Write property test for casual opponent matching
  - **Property 7: Casual Queue Opponent Matching**
  - **Validates: Requirements 3.1, 3.3, 3.4**

- [x] 5.2 Write property test for queue search expansion
  - **Property 8: Queue Search Expansion**
  - **Validates: Requirements 3.2**

- [x] 6. Add Error Handling and Validation
  - Add match type validation in queue operations
  - Provide clear error messages for match type mismatches
  - Add logging for debugging queue issues with match types
  - _Requirements: 4.5_

- [x] 6.1 Write unit tests for error handling
  - Test invalid match type handling
  - Test queue timeout error messages
  - _Requirements: 3.5_

- [x] 7. Integration Testing and Validation
  - Test complete flow: setup → queue → matchmaking for casual mode
  - Verify AI teammate addition works end-to-end
  - Test casual vs casual opponent finding
  - _Requirements: All_

- [x] 7.1 Write integration tests for complete casual queue flow
  - Test setup to match completion for casual mode
  - Test AI teammate integration in full flow

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The existing matchmaking logic already supports casual mode - we just need to use it
- Party state system already has matchType field - we just need to populate and read it correctly
- Focus on fixing the data flow rather than rewriting matchmaking logic