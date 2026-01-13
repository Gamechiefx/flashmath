# Requirements Document

## Introduction

Fix the 5v5 casual queue system to properly support AI teammate addition and opponent finding. Currently, the team setup UI allows selecting casual mode, but the queue system is hardcoded to use ranked mode, preventing casual matches from working correctly.

## Glossary

- **Team_Setup**: The UI page where players configure their party and select match type
- **Queue_System**: The matchmaking system that finds teammates and opponents
- **Match_Type**: The type of match - 'ranked', 'casual', or 'vs_ai'
- **AI_Teammate**: Computer-controlled player that fills empty slots in casual matches
- **Party**: A group of 1-5 human players queuing together
- **Redis_Queue**: The Redis-based queue storage system with separate keys per match type

## Requirements

### Requirement 1: Match Type Propagation

**User Story:** As a party leader, I want my selected match type (casual/ranked) to be used throughout the queue flow, so that I get the correct matchmaking behavior.

#### Acceptance Criteria

1. WHEN a party leader selects casual mode in team setup, THE Queue_System SHALL use casual matchmaking logic
2. WHEN a party leader selects ranked mode in team setup, THE Queue_System SHALL use ranked matchmaking logic  
3. WHEN the queue page loads, THE System SHALL display the correct match type that was selected in setup
4. WHEN transitioning from setup to queue, THE Match_Type SHALL be preserved and passed correctly
5. THE System SHALL store the match type in party state for persistence across page navigation

### Requirement 2: Casual Queue AI Teammate Addition

**User Story:** As a player in a casual match, I want AI teammates to fill empty slots in my party, so that I can play 5v5 matches even with fewer than 5 human players.

#### Acceptance Criteria

1. WHEN a party with fewer than 5 members joins casual queue, THE System SHALL add AI teammates to reach exactly 5 total members
2. WHEN AI teammates are added, THE System SHALL generate realistic player profiles with names, ELO, and cosmetics
3. WHEN calculating team ELO for matchmaking, THE System SHALL use the average of human players plus AI teammates
4. THE AI teammates SHALL have ELO values within ±25 of the team average for balanced matchmaking
5. WHEN displaying the team roster, THE System SHALL clearly identify which members are AI teammates

### Requirement 3: Casual Queue Opponent Finding

**User Story:** As a party in casual queue, I want to find opponent teams for matches, so that I can play 5v5 games without waiting indefinitely.

#### Acceptance Criteria

1. WHEN a casual team is in queue, THE System SHALL search for other casual teams as opponents
2. WHEN no casual opponents are available, THE System SHALL expand search criteria over time
3. WHEN a match is found, THE System SHALL create a match between two casual teams
4. THE System SHALL use the casual Redis queue key ('team:queue:casual:5v5') for casual matchmaking
5. WHEN queue times exceed timeout, THE System SHALL provide appropriate error messaging

### Requirement 4: Queue State Consistency

**User Story:** As a developer, I want the queue state to be consistent between UI components and backend systems, so that the matchmaking works reliably.

#### Acceptance Criteria

1. WHEN party state is updated with match type, THE System SHALL persist this information in Redis
2. WHEN the queue page loads, THE System SHALL read the correct match type from party state
3. WHEN calling joinTeamQueue, THE System SHALL pass the match type that was selected in setup
4. THE System SHALL validate that match type is correctly propagated through all queue operations
5. WHEN debugging queue issues, THE System SHALL log the match type being used at each step

### Requirement 5: UI Match Type Display

**User Story:** As a player in queue, I want to see what type of match I'm queuing for, so that I know whether it's ranked or casual.

#### Acceptance Criteria

1. WHEN viewing the queue page, THE System SHALL display the current match type prominently
2. WHEN in casual queue, THE System SHALL show "Casual Match" and indicate no ELO changes
3. WHEN in ranked queue, THE System SHALL show "Ranked Match" and indicate ELO will be affected
4. THE System SHALL use consistent match type terminology across all UI components
5. WHEN AI teammates are present, THE System SHALL indicate this in the team display