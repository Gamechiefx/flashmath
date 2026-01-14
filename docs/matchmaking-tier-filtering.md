# Matchmaking Tier Pre-Filtering

## Overview

Arena matchmaking now filters players by practice tier before matching by ELO. This ensures players are matched against opponents of similar skill level based on their practice progression.

## Matchmaking Order

```
Tier → Mode → ELO
```

1. **Tier**: Players must be within ±20 tiers of each other (one full band)
2. **Mode**: Players must be in the same queue (1v1, 2v2, 3v3) and operation
3. **ELO**: Players must be within ±200 ELO of each other

## Configuration

The tier range is configurable in `src/lib/actions/matchmaking.ts`:

```typescript
const TIER_RANGE = 20; // Match with players ±20 tiers (one band width)
```

Adjust this value to make matching stricter (lower) or more lenient (higher).

Current setting allows players to match within one full band of each other (e.g., Foundation tiers 1-20 can match with Intermediate tiers 1-20).

## How It Works

### Human vs Human Matching

When polling for a match (`checkForMatch`):
1. Candidates are fetched from Redis sorted by ELO (±200 range)
2. Each candidate is checked for tier compatibility
3. If `|playerTier - candidateTier| > TIER_RANGE`, candidate is skipped
4. First compatible candidate creates a match

### AI Fallback (after 15 seconds)

When no human opponent is found:
1. AI opponent is generated with tier within ±TIER_RANGE of player
2. AI tier is clamped between 1-100
3. AI ELO variance remains ±50

## Files Modified

- `src/lib/actions/matchmaking.ts` - Core matchmaking logic
- `src/components/arena/matchmaking-queue.tsx` - Client passes tier to server

## Logging

Matchmaking logs include tier information:
```
[Matchmaking] Candidate: PlayerName (id), elo=500, tier=45
[Matchmaking] Skipping PlayerName: tier 45 outside range ±20 from 30
```

## Future Considerations

- **Latency handling**: Generous timeouts and reconnection logic for geographically distant players (not yet implemented)
- **Dynamic tier range**: Could expand range based on queue time to reduce wait times
