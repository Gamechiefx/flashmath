# Arena Teams 4v4 - Full Specification

> **Version:** 1.0  
> **Last Updated:** January 3, 2026  
> **Status:** Design Complete - Ready for Implementation  
> **Mode:** 4v4 (4 players per team)

**Related Documents:**
- [Arena Teams 5v5](./ARENA_TEAMS_5V5.md) - Full specification with implementation details
- [Arena Teams 3v3](./ARENA_TEAMS_3V3.md)
- [Arena Teams 2v2](./ARENA_TEAMS_2V2.md)

---

## Overview

Arena Teams 4v4 is a relay-based team competitive mode where 4-player teams face off in synchronized math matches. This document covers 4v4-specific rules; see the 5v5 specification for shared mechanics (IGL system, badges, database schema, etc.).

---

## Match Structure

### Match Overview

| Element | Value |
|---------|-------|
| **Format** | 4v4 Team Relay |
| **Total Rounds** | 8 (4 per half) |
| **Halves** | 2 |
| **Questions per Round** | 20 (5 per slot) |
| **Points per Question** | 100 |
| **Streak Bonus** | +5 per consecutive correct |

### Time Structure

| Element | Duration |
|---------|----------|
| **Time per Half** | 5 minutes (7 max with timeouts) |
| **Time per Round** | 1:10 (70 seconds) |
| **Break Between Rounds** | 10 seconds |
| **Halftime** | 2 minutes |
| **IGL Timeout** | +1 minute (2 per match total) |

---

## Team Composition

| Role | Count | Description |
|------|-------|-------------|
| **Players** | 4 | Each assigned to an operation slot |
| **IGL** | 1 | Any player, makes strategic calls, also plays |
| **Anchor** | 1 | Hovering title, can be any player, special abilities |

---

## Operation Slots

| Slot | Operation | Questions/Round |
|------|-----------|-----------------|
| 1 | Addition (+) | 5 |
| 2 | Multiplication (×) | 5 |
| 3 | Division (÷) | 5 |
| 4 | Subtraction (−) | 5 |

**Note:** Mixed slot (?) is not available in 4v4. Total: 20 questions per round.

---

## Relay Flow

```
START → Slot 1 (+) → Slot 2 (×) → Slot 3 (÷) → Slot 4 (−) → END
        5 questions  5 questions  5 questions  5 questions
        
Total: 20 questions per round
Clock runs continuously - no pauses between handoffs
```

---

## Anchor System (4v4 Adapted)

### Double Call-In

| Aspect | 1st Half | 2nd Half |
|--------|----------|----------|
| **Uses** | Once | Once |
| **Available Rounds** | Round 1, 2, OR 3 | Round 1 ONLY |
| **Slot** | Any (1-4) | Any (1-4) |
| **Effect** | Anchor plays 2 slots, one player sits | Same |

### Final Round Solo

| Aspect | Rule |
|--------|------|
| **When** | 2nd Half, between Round 3 and Round 4 |
| **Options** | ANCHOR SOLO or NORMAL |
| **Solo Effect** | Anchor plays all 4 slots (20 questions) |

---

## Differences from 5v5

| Aspect | 5v5 | 4v4 |
|--------|-----|-----|
| Players | 5 | 4 |
| Slots | 5 (includes Mixed) | 4 (no Mixed) |
| Questions/Round | 25 | 20 |
| Time/Round | 1:20 | 1:10 |
| Time/Half | 6 min | 5 min |
| Anchor Solo Questions | 25 | 20 |

---

## Match Flow

```
1ST HALF (5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:10) → 10s break → Round 2 (1:10) → 10s break →
Round 3 (1:10) → 10s break → Round 4 (1:10)

HALFTIME (2 minutes)

2ND HALF (5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:10) → 10s break → Round 2 (1:10) → 10s break →
Round 3 (1:10) → 10s break →
          ↓
    [FINAL ROUND DECISION]
          ↓
Round 4 (Final Round)
```

---

## Scoring

Same as 5v5:
- 100 points per correct answer
- +5 streak bonus per consecutive correct
- APS (Arena Performance Score) tracking

---

## Shared Mechanics

The following mechanics are identical to 5v5 (see [ARENA_TEAMS_5V5.md](./ARENA_TEAMS_5V5.md)):

- IGL System & Scouting
- Handoff Readiness System
- Live Match HUD
- Disconnect & Timeout Handling
- Win Conditions & Tiebreakers
- Momentum Mechanics (Casual Only)
- Role Specialization & Badges
- Practice Modes
- Post-Match Analytics

---

*For implementation details, database schema, and API endpoints, see the 5v5 specification.*

