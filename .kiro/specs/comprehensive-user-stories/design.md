# Design Document

## Overview

This design document outlines the architecture and implementation approach for FlashMath's comprehensive user story system. The design covers practice modes, arena competition, shop economy, cosmetic customization, administrative tools, and social features within the existing Next.js/TypeScript/SQLite architecture.

## Architecture

### High-Level Architecture

FlashMath follows a modern web application architecture with real-time capabilities:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Next.js App   │    │   Socket.IO      │    │   SQLite DB     │
│   (Frontend)    │◄──►│   Server         │◄──►│   (Data Layer)  │
│                 │    │   (Real-time)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Server        │    │   Redis          │    │   File System   │
│   Actions       │    │   (Sessions)     │    │   (Assets)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Component Architecture

The system is organized into feature-based modules:

- **Practice Engine**: Handles single-player training sessions
- **Arena System**: Manages real-time multiplayer competitions  
- **Economy Engine**: Controls Flux Coins and shop transactions
- **Customization System**: Manages cosmetic items and user preferences
- **Admin Panel**: Provides administrative controls and analytics
- **Social System**: Handles leaderboards, leagues, and user interactions

## Components and Interfaces

### Practice Mode System

**Core Components:**
- `PracticeSession`: Manages individual training sessions
- `ProblemGenerator`: Creates math problems based on difficulty tier
- `ProgressTracker`: Monitors user advancement and tier progression
- `MasteryEngine`: Evaluates when users should advance tiers

**Key Interfaces:**
```typescript
interface PracticeSession {
  id: string;
  userId: string;
  operation: 'addition' | 'subtraction' | 'multiplication' | 'division';
  mathTier: 1 | 2 | 3 | 4;
  problems: Problem[];
  startTime: Date;
  endTime?: Date;
  correctCount: number;
  totalCount: number;
  xpEarned: number;
}

interface Problem {
  id: string;
  operand1: number;
  operand2: number;
  operation: string;
  correctAnswer: number;
  userAnswer?: number;
  responseTime?: number;
  isCorrect?: boolean;
}
```

### Arena Competition System

**Core Components:**
- `MatchmakingEngine`: Pairs players based on ELO ratings
- `RealTimeMatch`: Manages live competition sessions
- `ELORatingSystem`: Calculates rating changes after matches
- `LeagueManager`: Handles promotion/relegation between leagues

**Key Interfaces:**
```typescript
interface ArenaMatch {
  id: string;
  players: Player[];
  problems: Problem[];
  startTime: Date;
  endTime?: Date;
  winner?: string;
  eloChanges: Record<string, number>;
  status: 'waiting' | 'active' | 'completed';
}

interface Player {
  id: string;
  name: string;
  currentElo: number;
  league: 'neon' | 'cobalt' | 'plasma' | 'void' | 'apex';
  score: number;
  responses: MatchResponse[];
}
```

### Shop and Economy System

**Core Components:**
- `ShopManager`: Handles item catalog and availability
- `TransactionEngine`: Processes purchases and currency management
- `InventorySystem`: Manages user-owned items
- `PricingEngine`: Determines dynamic pricing based on rarity

**Key Interfaces:**
```typescript
interface ShopItem {
  id: string;
  name: string;
  description: string;
  type: 'theme' | 'particle' | 'audio' | 'title';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  price: number;
  assetValue: string;
  isAvailable: boolean;
}

interface Transaction {
  id: string;
  userId: string;
  itemId: string;
  cost: number;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}
```

### Customization System

**Core Components:**
- `ThemeEngine`: Applies visual themes and CSS variables
- `ParticleSystem`: Manages visual effects during gameplay
- `AudioManager`: Handles sound pack switching
- `EquipmentManager`: Tracks and applies equipped items

**Key Interfaces:**
```typescript
interface UserCustomization {
  userId: string;
  equippedTheme: string;
  equippedParticles: string;
  equippedAudio: string;
  equippedTitle: string;
  preferences: CustomizationPreferences;
}

interface CustomizationPreferences {
  particleIntensity: 'low' | 'medium' | 'high';
  audioVolume: number;
  animationSpeed: 'slow' | 'normal' | 'fast';
}
```

## Data Models

### User Data Model

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  level: number;
  totalXp: number;
  coins: number;
  currentLeagueId: string;
  mathTiers: {
    addition: number;
    subtraction: number;
    multiplication: number;
    division: number;
  };
  equippedItems: {
    theme: string;
    particles: string;
    audio: string;
    title: string;
  };
  arenaStats: {
    elo: number;
    wins: number;
    losses: number;
    winStreak: number;
  };
  createdAt: Date;
  lastActive: Date;
}
```

### Session and Progress Models

```typescript
interface MasteryStats {
  id: string;
  userId: string;
  operation: string;
  fact: string; // e.g., "7x8" for multiplication
  lastResponseTime: number;
  masteryLevel: number;
  updatedAt: Date;
}

interface LeagueParticipant {
  id: string;
  leagueId: string;
  userId: string;
  name: string;
  weeklyXp: number;
  rank: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Practice Problem Generation Consistency
*For any* user and math tier combination, generated practice problems should match the difficulty level specified by the user's current Math_Tier for that operation
**Validates: Requirements 1.2**

### Property 2: Practice Feedback Consistency  
*For any* practice problem response, correct answers should trigger positive feedback and incorrect answers should display the correct answer with explanation
**Validates: Requirements 1.3, 1.4**

### Property 3: Practice Session Data Integrity
*For any* completed practice session, the system should update user XP, level, and Math_Tier progression based on performance metrics
**Validates: Requirements 1.5, 1.6**

### Property 4: Arena Matchmaking Fairness
*For any* arena queue entry, players should be matched with opponents within a reasonable ELO range to ensure competitive balance
**Validates: Requirements 2.1**

### Property 5: Arena Match Synchronization
*For any* active arena match, all participants should receive identical problems simultaneously and scoring should reflect first correct responses
**Validates: Requirements 2.2, 2.3**

### Property 6: ELO and League System Consistency
*For any* completed arena match, ELO ratings should be updated based on performance and league placement should adjust according to new ELO thresholds
**Validates: Requirements 2.4, 2.5**

### Property 7: Arena Reward Calculation
*For any* arena victory, Flux_Coins awarded should be calculated based on performance metrics and current league tier
**Validates: Requirements 2.6**

### Property 8: Shop Transaction Integrity
*For any* shop purchase attempt, the system should only allow transactions when users have sufficient currency, properly deduct costs, and add items to inventory
**Validates: Requirements 3.2, 3.3, 3.6**

### Property 9: Shop Inventory Management
*For any* shop refresh cycle, available items should rotate according to engagement algorithms while maintaining proper rarity distribution and pricing
**Validates: Requirements 3.4, 3.5**

### Property 10: Equipment Application Consistency
*For any* cosmetic item equipped by a user, the visual and audio changes should be applied immediately and consistently across all platform interfaces
**Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

### Property 11: Admin Security Enforcement
*For any* administrative action, the system should require additional authentication and properly enforce access controls
**Validates: Requirements 5.1**

### Property 12: Admin Ban Enforcement
*For any* user ban implemented by administrators, the system should prevent login attempts and display ban information to the affected user
**Validates: Requirements 5.3**

### Property 13: Admin Real-time Updates
*For any* administrative modification to shop items or league settings, changes should be reflected immediately across the platform
**Validates: Requirements 5.4, 5.6**

### Property 14: User Progress Data Accuracy
*For any* user profile or progress view, displayed statistics should accurately reflect current Math_Tier levels, match history, and achievement status
**Validates: Requirements 6.2, 6.3, 6.4**

### Property 15: Performance Analytics Generation
*For any* user performance analysis request, the system should generate accurate trend analysis and improvement suggestions based on historical data
**Validates: Requirements 6.5, 6.6**

### Property 16: League Season Transitions
*For any* league season end, users should be promoted or relegated based on performance metrics and receive appropriate rewards
**Validates: Requirements 7.2, 7.3**

### Property 17: Competition Tracking and Rewards
*For any* weekly competition cycle, the system should accurately track performance and distribute rewards to top performers
**Validates: Requirements 7.5, 7.6**

### Property 18: Error Handling Consistency
*For any* system error that occurs, appropriate logging should be performed and user-friendly error messages should be displayed
**Validates: Requirements 8.4**

### Property 19: Data Consistency Maintenance
*For any* data modification operation, the system should maintain referential integrity and prevent corruption across related records
**Validates: Requirements 8.6**

## Error Handling

### Practice Mode Error Handling
- **Invalid Math Tier**: Gracefully handle requests for non-existent tiers by defaulting to appropriate level
- **Session Timeout**: Automatically save progress if user becomes inactive during practice
- **Problem Generation Failure**: Fallback to simpler problems if complex generation fails

### Arena Error Handling  
- **Matchmaking Timeout**: Provide option to expand ELO range or play against AI if no matches found
- **Connection Loss**: Implement reconnection logic with grace period for temporary disconnections
- **Synchronization Errors**: Detect and resolve desync issues between players in real-time matches

### Shop and Economy Error Handling
- **Insufficient Funds**: Clear messaging with options to earn more currency
- **Transaction Failures**: Rollback incomplete purchases and restore user currency
- **Inventory Conflicts**: Handle edge cases where items are purchased simultaneously

### Administrative Error Handling
- **Permission Escalation**: Log and prevent unauthorized access attempts
- **Bulk Operation Failures**: Provide detailed feedback on partial failures in batch operations
- **Data Integrity Issues**: Automatic detection and alerting for inconsistent states

### System-Wide Error Handling
- **Database Connection Issues**: Implement connection pooling and retry logic
- **Real-time Service Failures**: Graceful degradation to polling-based updates
- **Authentication Failures**: Clear error messages and recovery options

## Testing Strategy

### Dual Testing Approach

The comprehensive user stories system requires both unit testing and property-based testing to ensure correctness across all feature areas.

**Unit Tests:**
- Specific examples demonstrating correct behavior for each feature
- Edge cases and error conditions for critical paths
- Integration points between different system components
- Mock external dependencies for isolated testing

**Property Tests:**
- Universal properties that hold across all inputs and user scenarios
- Comprehensive input coverage through randomization
- Minimum 100 iterations per property test
- Each property test references its corresponding design document property

### Property-Based Testing Configuration

**Testing Framework**: Vitest with custom property testing utilities
**Minimum Iterations**: 100 per property test
**Tag Format**: **Feature: comprehensive-user-stories, Property {number}: {property_text}**

### Unit Testing Focus Areas

**Practice Mode:**
- Problem generation algorithms for each math tier
- XP calculation and level progression logic
- Mastery detection and tier advancement
- Session state management

**Arena System:**
- ELO rating calculations for various match outcomes
- Matchmaking algorithm with different player pools
- Real-time synchronization edge cases
- League promotion/relegation thresholds

**Shop and Economy:**
- Transaction processing with various currency amounts
- Inventory management and item ownership
- Pricing calculations for different rarity tiers
- Shop rotation and availability logic

**Customization System:**
- Theme application across different UI components
- Particle effect rendering and performance
- Audio pack switching and volume controls
- Equipment state persistence

**Administrative Tools:**
- User management operations and permissions
- Bulk operations and error handling
- Analytics calculation and reporting
- System monitoring and alerting

### Integration Testing

**Database Integration:**
- Transaction rollback scenarios
- Concurrent access patterns
- Data migration and schema updates
- Performance under load

**Real-time Integration:**
- Socket.IO connection management
- Multi-player synchronization
- Reconnection and recovery
- Cross-browser compatibility

**Authentication Integration:**
- NextAuth.js session handling
- 2FA implementation and recovery
- OAuth provider integration
- Session persistence and security

### Performance Testing Considerations

While specific performance requirements (Requirements 8.1, 8.2, 8.5) are not suitable for unit testing, the following performance aspects should be monitored:

- Database query optimization and indexing
- Real-time message throughput and latency
- Memory usage during extended sessions
- Client-side rendering performance with animations

### Test Data Management

**User Test Data:**
- Generate users across all experience levels and leagues
- Create realistic practice session histories
- Simulate various customization combinations
- Include edge cases like new users and power users

**Arena Test Data:**
- Generate matches across all ELO ranges and leagues
- Create realistic match histories and outcomes
- Simulate various network conditions and disconnections
- Include tournament and seasonal scenarios

**Economy Test Data:**
- Generate users with various currency amounts
- Create diverse item inventories and purchase histories
- Simulate shop rotations and item availability changes
- Include promotional and special event scenarios