# Arena Teams 3v3 - Full Specification

> **Version:** 1.0  
> **Last Updated:** January 3, 2026  
> **Status:** Design Complete - Ready for Implementation  
> **Mode:** 3v3 (3 players per team)

**Related Documents:**
- [Arena Teams 5v5](./ARENA_TEAMS_5V5.md) - Full specification with implementation details
- [Arena Teams 4v4](./ARENA_TEAMS_4V4.md)
- [Arena Teams 2v2](./ARENA_TEAMS_2V2.md)

---

## Overview

Arena Teams 3v3 is a relay-based team competitive mode where 3-player teams face off in synchronized math matches. This document covers 3v3-specific rules; see the 5v5 specification for shared mechanics.

---

## Match Structure

### Match Overview

| Element | Value |
|---------|-------|
| **Format** | 3v3 Team Relay |
| **Total Rounds** | 8 (4 per half) |
| **Halves** | 2 |
| **Questions per Round** | 15 (5 per slot) |
| **Points per Question** | 100 |
| **Streak Bonus** | +5 per consecutive correct |

### Time Structure

| Element | Duration |
|---------|----------|
| **Time per Half** | 4 minutes (6 max with timeouts) |
| **Time per Round** | 1:00 (60 seconds) |
| **Break Between Rounds** | 10 seconds |
| **Halftime** | 90 seconds |
| **IGL Timeout** | +1 minute (2 per match total) |

---

## Team Composition

| Role | Count | Description |
|------|-------|-------------|
| **Players** | 3 | Each assigned to an operation slot |
| **IGL** | 1 | Any player, makes strategic calls, also plays |
| **Anchor** | 1 | Hovering title, can be any player, special abilities |

---

## Operation Slots

IGL chooses 3 of the 5 available operations:

| Available Operations |
|---------------------|
| Addition (+) |
| Multiplication (×) |
| Division (÷) |
| Subtraction (−) |
| Mixed (?) |

**Example configurations:**
- Classic: +, ×, ÷
- Speed: +, −, ×
- Challenge: ÷, −, ?

**Total:** 15 questions per round (3 slots × 5 questions)

---

## Relay Flow

```
START → Slot 1 → Slot 2 → Slot 3 → END
        5 questions  5 questions  5 questions
        
Total: 15 questions per round
Clock runs continuously - no pauses between handoffs
```

---

## Anchor System (3v3 Adapted)

### Double Call-In

| Aspect | 1st Half | 2nd Half |
|--------|----------|----------|
| **Uses** | Once | Once |
| **Available Rounds** | Round 1, 2, OR 3 | Round 1 ONLY |
| **Slot** | Any (1-3) | Any (1-3) |
| **Effect** | Anchor plays 2 slots, one player sits | Same |

**Note:** In 3v3, Double Call-In means one teammate sits entirely for the round while Anchor covers 2 of 3 slots.

### Final Round Solo

| Aspect | Rule |
|--------|------|
| **When** | 2nd Half, between Round 3 and Round 4 |
| **Options** | ANCHOR SOLO or NORMAL |
| **Solo Effect** | Anchor plays all 3 slots (15 questions) |

---

## Differences from 5v5

| Aspect | 5v5 | 3v3 |
|--------|-----|-----|
| Players | 5 | 3 |
| Slots | 5 (all) | 3 (IGL chooses) |
| Questions/Round | 25 | 15 |
| Time/Round | 1:20 | 1:00 |
| Time/Half | 6 min | 4 min |
| Halftime | 2 min | 90 sec |
| Anchor Solo Questions | 25 | 15 |

---

## Match Flow

```
1ST HALF (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:00) → 10s break → Round 2 (1:00) → 10s break →
Round 3 (1:00) → 10s break → Round 4 (1:00)

HALFTIME (90 seconds)

2ND HALF (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:00) → 10s break → Round 2 (1:00) → 10s break →
Round 3 (1:00) → 10s break →
          ↓
    [FINAL ROUND DECISION]
          ↓
Round 4 (Final Round)
```

---

## Slot Selection (Pre-Match)

Before the match, IGL selects which 3 operations to use:

```
┌─────────────────────────────────────────────────────────────┐
│  SELECT 3 OPERATIONS                                       │
│  ─────────────────────────────────────────────────────────  │
│  [+] Addition        ☑                                     │
│  [×] Multiplication  ☑                                     │
│  [÷] Division        ☑                                     │
│  [−] Subtraction     ☐                                     │
│  [?] Mixed           ☐                                     │
│  ─────────────────────────────────────────────────────────  │
│  Selected: 3/3                    [CONFIRM]                │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**
- Must select exactly 3 operations
- Selection locks when match starts
- Cannot change at halftime (only player assignments change)

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

