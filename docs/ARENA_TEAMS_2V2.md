# Arena Teams 2v2 - Full Specification

> **Version:** 1.0  
> **Last Updated:** January 3, 2026  
> **Status:** Design Complete - Ready for Implementation  
> **Mode:** 2v2 (2 players per team)

**Related Documents:**
- [Arena Teams 5v5](./ARENA_TEAMS_5V5.md) - Full specification with implementation details
- [Arena Teams 4v4](./ARENA_TEAMS_4V4.md)
- [Arena Teams 3v3](./ARENA_TEAMS_3V3.md)

---

## Overview

Arena Teams 2v2 is the fastest relay-based team competitive mode where 2-player teams face off in synchronized math matches. This format emphasizes individual skill and tight coordination between partners.

---

## Match Structure

### Match Overview

| Element | Value |
|---------|-------|
| **Format** | 2v2 Team Relay |
| **Total Rounds** | 8 (4 per half) |
| **Halves** | 2 |
| **Questions per Round** | 12 (6 per slot) |
| **Points per Question** | 100 |
| **Streak Bonus** | +5 per consecutive correct |

### Time Structure

| Element | Duration |
|---------|----------|
| **Time per Half** | 3:30 (5:30 max with timeouts) |
| **Time per Round** | 0:50 (50 seconds) |
| **Break Between Rounds** | 8 seconds |
| **Halftime** | 60 seconds |
| **IGL Timeout** | +1 minute (2 per match total) |

---

## Team Composition

| Role | Count | Description |
|------|-------|-------------|
| **Players** | 2 | Each assigned to an operation slot |
| **IGL** | 1 | Either player, makes strategic calls |
| **Anchor** | 1 | Either player (often the stronger player) |

**Note:** In 2v2, one player is typically both IGL and Anchor, or roles are split between the two players.

---

## Operation Slots

IGL chooses 2 of the 5 available operations:

| Available Operations |
|---------------------|
| Addition (+) |
| Multiplication (×) |
| Division (÷) |
| Subtraction (−) |
| Mixed (?) |

**Popular configurations:**
- Classic: +, ×
- Speed: +, −
- Challenge: ×, ÷
- Wild: +, ?

**Total:** 12 questions per round (2 slots × 6 questions)

---

## Relay Flow

```
START → Slot 1 → Slot 2 → END
        6 questions  6 questions
        
Total: 12 questions per round
Clock runs continuously - no pauses between handoffs
```

---

## Anchor System (2v2 Adapted)

### Double Call-In

**NOT AVAILABLE in 2v2** - With only 2 players, there's no one to sit out.

### Final Round Solo

| Aspect | Rule |
|--------|------|
| **When** | 2nd Half, between Round 3 and Round 4 |
| **Options** | ANCHOR SOLO or NORMAL |
| **Solo Effect** | Anchor plays both slots (12 questions) |

**Strategic Note:** In 2v2, Final Round Solo means one player handles the entire final round while their partner watches. High risk, high reward.

---

## Differences from 5v5

| Aspect | 5v5 | 2v2 |
|--------|-----|-----|
| Players | 5 | 2 |
| Slots | 5 (all) | 2 (IGL chooses) |
| Questions/Slot | 5 | 6 |
| Questions/Round | 25 | 12 |
| Time/Round | 1:20 | 0:50 |
| Time/Half | 6 min | 3:30 |
| Halftime | 2 min | 60 sec |
| Break Between Rounds | 10 sec | 8 sec |
| Double Call-In | Available | ❌ Not Available |
| Anchor Solo Questions | 25 | 12 |

---

## Match Flow

```
1ST HALF (3:30)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (0:50) → 8s break → Round 2 (0:50) → 8s break →
Round 3 (0:50) → 8s break → Round 4 (0:50)

HALFTIME (60 seconds)

2ND HALF (3:30)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (0:50) → 8s break → Round 2 (0:50) → 8s break →
Round 3 (0:50) → 8s break →
          ↓
    [FINAL ROUND DECISION]
          ↓
Round 4 (Final Round)
```

---

## Slot Selection (Pre-Match)

Before the match, IGL selects which 2 operations to use:

```
┌─────────────────────────────────────────────────────────────┐
│  SELECT 2 OPERATIONS                                       │
│  ─────────────────────────────────────────────────────────  │
│  [+] Addition        ☑                                     │
│  [×] Multiplication  ☑                                     │
│  [÷] Division        ☐                                     │
│  [−] Subtraction     ☐                                     │
│  [?] Mixed           ☐                                     │
│  ─────────────────────────────────────────────────────────  │
│  Selected: 2/2                    [CONFIRM]                │
└─────────────────────────────────────────────────────────────┘
```

**Rules:**
- Must select exactly 2 operations
- Selection locks when match starts
- Cannot change at halftime (only player assignments change)

---

## 2v2-Specific Strategy

### Role Flexibility

With only 2 players, roles are more fluid:

| Setup | Description |
|-------|-------------|
| **Balanced** | Both players equal skill, split IGL/Anchor |
| **Carry** | Stronger player is IGL + Anchor, weaker supports |
| **Specialist** | Each player masters one operation |

### Anchor Solo Considerations

In 2v2, the Anchor Solo decision is even more impactful:

| Scenario | Consider Solo If... |
|----------|---------------------|
| Behind by 200+ pts | Your anchor is significantly faster |
| Opponent's Slot 2 is weak | Your anchor can outscore their relay |
| Tied match | High-risk play to steal the win |

| Scenario | Consider Normal If... |
|----------|----------------------|
| Ahead | Protect the lead with reliable relay |
| Partner has hot streak | Don't bench a player on fire |
| Anchor is tired | Fatigue from earlier rounds |

---

## Scoring

Same as 5v5:
- 100 points per correct answer
- +5 streak bonus per consecutive correct
- APS (Arena Performance Score) tracking

---

## Shared Mechanics

The following mechanics are identical to 5v5 (see [ARENA_TEAMS_5V5.md](./ARENA_TEAMS_5V5.md)):

- Handoff Readiness System
- Live Match HUD (adapted for 2 slots)
- Disconnect & Timeout Handling
- Win Conditions & Tiebreakers
- Momentum Mechanics (Casual Only)
- Role Specialization & Badges
- Practice Modes
- Post-Match Analytics

---

## 2v2-Specific Badges

| Badge | Requirement | Icon |
|-------|-------------|------|
| 🤝 **Dynamic Duo** | Win 50 matches with same partner |
| ⚡ **Perfect Sync** | 100% accuracy as a team in 10 matches |
| 🎯 **Duo Clutch** | Win 15 matches with Anchor Solo |
| 🔄 **Role Swap** | Win matches in both slot positions (25 each) |

---

*For implementation details, database schema, and API endpoints, see the 5v5 specification.*

