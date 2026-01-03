# Arena Teams 5v5 - Full Specification & Implementation Tracker

> **Version:** 1.0  
> **Last Updated:** January 3, 2026  
> **Status:** Design Complete - Ready for Implementation  
> **Mode:** 5v5 (5 players per team)

**Related Documents:**
- [Arena Teams 4v4](./ARENA_TEAMS_4V4.md)
- [Arena Teams 3v3](./ARENA_TEAMS_3V3.md)
- [Arena Teams 2v2](./ARENA_TEAMS_2V2.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Match Structure & Timing](#match-structure--timing)
3. [Team & Party Formation](#team--party-formation)
4. [IGL System](#igl-system)
5. [Handoff & Relay Mechanics](#handoff--relay-mechanics)
6. [Live Match HUD](#live-match-hud)
7. [Disconnect & Timeout Handling](#disconnect--timeout-handling)
8. [Scoring System](#scoring-system)
9. [Anchor System](#anchor-system)
10. [Momentum Mechanics (Casual Only)](#momentum-mechanics-casual-only)
11. [Role Specialization & Badges](#role-specialization--badges)
12. [Practice Modes](#practice-modes)
13. [Post-Match Analytics](#post-match-analytics)
14. [Database Schema](#database-schema)
15. [Implementation Checklist](#implementation-checklist)
16. [UI Component Specification](#ui-component-specification)
    - [Design Principles](#design-principles)
    - [Existing Infrastructure](#existing-infrastructure-to-leverage)
    - [UI Flow Diagrams](#ui-flow-diagrams)
    - [Phase 0: Mode Selection](#phase-0-mode-selection-entry-point-3-components)
    - [Phase 1: Party Extensions](#phase-1-party-formation-extensions-4-components)
    - [Phase 2: IGL/Anchor Selection](#phase-2-iglanchor-selection-3-components)
    - [Phase 3: Queue](#phase-3-queue-and-matchmaking-3-components)
    - [Phase 4: Pre-Match Strategy](#phase-4-pre-match-strategy-4-components)
    - [Phase 5: Active Match](#phase-5-active-match-8-components)
    - [Phase 6: Round Transitions](#phase-6-round-transitions-4-components)
    - [Phase 7: Anchor Mechanics](#phase-7-anchor-mechanics-4-components)
    - [Phase 8: Post-Match](#phase-8-post-match-5-components)
    - [Shared Components](#sharedutility-components-4-components)
    - [Socket Events](#socket-events-for-teams-new)
    - [Database Extensions](#database-schema-extensions-for-party-roles)

---

## Overview

Arena Teams is a **relay-based, team competitive mode** where pre-formed teams (2v2 through 5v5) face off in synchronized, high-intensity math matches. The mode emphasizes **strategy, role specialization, speed, accuracy, and teamwork**, with an In-Game Leader (IGL) driving pre-match and halftime decisions.

### Core Principles

- **Teamwork over individual carry** - Success requires coordination
- **Strategic depth** - IGL decisions matter
- **Role identity** - Players specialize in operations
- **Competitive integrity** - No timer pauses, fair penalties
- **Scalable competition** - Casual to tournament-ready

### Mode Availability

| Feature | Ranked | Casual |
|---------|--------|--------|
| Core gameplay | ✅ | ✅ |
| ELO changes | ✅ | ❌ |
| Heat Streak bonus | ❌ | ✅ |
| Underdog boost | ❌ | ✅ |
| IGL tools | ✅ | ✅ |
| Match history | ✅ | ✅ |
| Badges/rewards | ✅ | ✅ |

---

## Match Structure & Timing

### Match Overview

| Element | Value |
|---------|-------|
| **Format** | 5v5 Team Relay |
| **Total Rounds** | 8 (4 per half) |
| **Halves** | 2 |
| **Questions per Round** | 25 (5 per slot) |
| **Points per Question** | 100 |
| **Streak Bonus** | +5 per consecutive correct |

### Time Structure

| Element | Duration |
|---------|----------|
| **Time per Half** | 6 minutes (8 max with timeouts) |
| **Time per Round** | 1:20 (80 seconds) |
| **Break Between Rounds** | 10 seconds |
| **Halftime** | 2 minutes |
| **IGL Timeout** | +1 minute (2 per match total) |

### Clock Rules

| Clock | Behavior |
|-------|----------|
| **Relay Clock** | Never stops (players answer continuously) |
| **Game Clock** | Stops for match operations (breaks, decisions, timeouts) |

### Match Flow

```
1ST HALF (6 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:20) → 10s break → Round 2 (1:20) → 10s break →
Round 3 (1:20) → 10s break → Round 4 (1:20)

HALFTIME (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IGL can: Reassign slots, strategize, review stats

2ND HALF (6 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Round 1 (1:20) → 10s break → Round 2 (1:20) → 10s break →
Round 3 (1:20) → 10s break →
          ↓
    [FINAL ROUND DECISION - IGL chooses: ANCHOR SOLO or NORMAL]
          ↓
Round 4 (Final Round)
```

### Operation Slots

Each of the 5 team members is assigned to one operation slot:

| Slot | Operation | Questions/Round | Description |
|------|-----------|-----------------|-------------|
| 1 | Addition (+) | 5 | Basic to advanced addition |
| 2 | Multiplication (×) | 5 | Times tables to multi-digit |
| 3 | Division (÷) | 5 | Division facts to long division |
| 4 | Subtraction (−) | 5 | Basic to advanced subtraction |
| 5 | Mixed (?) | 5 | Random operations, higher difficulty |

**Total:** 25 questions per round (5 slots × 5 questions)

### Slot Assignment Rules

| Rule | Description |
|------|-------------|
| One player per slot | Each player covers exactly one operation |
| IGL assigns | IGL assigns all 5 players (including themselves) |
| Reassignment allowed | Can change between any round or at halftime |
| Anchor flexibility | Anchor role can be assigned to any player |

---

## Team & Party Formation

### Team Composition

| Role | Count | Description |
|------|-------|-------------|
| **Players** | 5 | Each assigned to an operation slot |
| **IGL** | 1 | Any player, makes strategic calls, also plays |
| **Anchor** | 1 | Hovering title, can be any player, special abilities |

*Note: IGL and Anchor can be the same person or different players.*

### Party System

```
Party Structure:
├── Party Leader (default IGL)
├── Members (5 total including leader)
├── Team Name (optional, for persistent teams)
├── Team Tag (3-4 char, e.g., "FM" for FlashMath)
├── IGL Assignment (can be delegated)
└── Anchor Assignment (hovering role, any player)
```

### Party Flow

```
1. Create Party (leader becomes IGL by default)
2. Invite Members (5 total required for 5v5)
3. Assign IGL (if different from leader)
4. Assign Anchor role
5. Enter Queue (ranked or casual)
6. Match Found → Pre-Match Strategy Phase
```

---

## IGL System

### IGL Role

The In-Game Leader (IGL) has strategic authority during designated phases:

| Phase | IGL Authority |
|-------|---------------|
| Pre-Match | Scout opponent, assign slots, assign Anchor, set strategy |
| Round Breaks (10s) | Reassign slots for next round, quick adjustments |
| Active Rounds | None (plays their slot like everyone) |
| Halftime (2 min) | Full reassignment, strategy review, Anchor decisions |
| Final Round Break | Choose ANCHOR SOLO or NORMAL for Round 4 |
| Timeouts | Call timeout (between rounds only, +1 min) |

### IGL Selection

```
Methods:
1. Party Leader Default - Creator is IGL
2. Manual Assignment - Leader can delegate before queue
3. Vote System (optional) - Team votes for IGL
```

### IGL Flexibility

| When | What IGL Can Do |
|------|-----------------|
| Between any round | Reassign player slots |
| At halftime | Full strategy overhaul, Anchor reassignment |
| Before 2nd Half R4 | Decide Anchor Solo vs Normal |
| Any break | Call timeout (2 total per match) |

### Pre-Match Scouting Dashboard

IGL can view opponent team data:

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎯 OPPONENT SCOUT: [Team Name]                                       │
├────────────────────────────────────────────────────────────────────────┤
│  PLAYER         │ BEST OP │ ACC   │ AVG SPEED │ STREAK RELIABILITY   │
│  ───────────────┼─────────┼───────┼───────────┼──────────────────────│
│  [Player 1]     │ ×       │ 94%   │ 1.2s      │ ████████░░ 82%       │
│  [Player 2]     │ +       │ 88%   │ 0.9s      │ ██████░░░░ 64%       │
│  [Player 3]     │ ÷       │ 91%   │ 1.8s      │ █████████░ 91%       │
│  [Player 4]     │ −       │ 85%   │ 1.4s      │ ███████░░░ 73%       │
├────────────────────────────────────────────────────────────────────────┤
│  ⚠️ WEAKNESS: Division slot is slowest (1.8s avg)                     │
│  💡 COUNTER: Put your fastest ÷ player to gain advantage             │
└────────────────────────────────────────────────────────────────────────┘
```

### Slot Assignment Interface

```
Drag-and-Drop UI:
┌─────────────────────────────────────────────────────────────┐
│  OPERATION SLOTS          │  AVAILABLE PLAYERS             │
│  ─────────────────────────┼────────────────────────────────│
│  [+] Addition      ←──────│  👤 Player A (+ 96%, 0.8s)    │
│  [−] Subtraction   ←──────│  👤 Player B (− 92%, 1.1s)    │
│  [×] Multiplication←──────│  👤 Player C (× 89%, 1.3s)    │
│  [÷] Division      ←──────│  👤 Player D (÷ 94%, 1.5s)    │
│  [?] Mixed (opt)   ←──────│                                │
│  ─────────────────────────┼────────────────────────────────│
│  [AUTO-ASSIGN]            │  [LOCK ASSIGNMENTS]            │
└─────────────────────────────────────────────────────────────┘
```

### Halftime Actions

```
Available at Halftime (90s):
1. View first-half performance breakdown
2. Swap player slot assignments
3. Discuss strategy (voice/text if enabled)
4. AI-suggested swaps based on performance
5. Undo changes (within first 30s)
```

---

## Handoff & Relay Mechanics

### Relay Flow

```
START → Slot 1 (+) → Slot 2 (×) → Slot 3 (÷) → Slot 4 (−) → Slot 5 (?) → END
        5 questions  5 questions  5 questions  5 questions  5 questions
        
Total: 25 questions per round
Clock runs continuously - no pauses between handoffs
```

### Handoff Readiness System

Players receive warnings before their turn:

| Time Before | Visual | Audio | State |
|-------------|--------|-------|-------|
| 3 seconds | "Get Ready" pulse | Soft ping | STANDBY |
| 2 seconds | Countdown visible | Medium ping | STANDBY |
| 1 second | First question (blurred) | High ping | READY |
| 0 seconds | Question unblurs | GO chime | ACTIVE |

### State Machine

```
WAITING → STANDBY → READY → ACTIVE → COMPLETE
   │         │         │        │         │
   │         │         │        │         └── Player finished 5 questions
   │         │         │        └── Answering questions
   │         │         └── Question visible but blurred
   │         └── 3s countdown started
   └── Waiting for previous player
```

### Wrong Answer Penalty

| Consecutive Mistakes | Time Delay | Effect |
|---------------------|-----------|--------|
| 1st wrong | +0.75s | Streak resets to 0 |
| 2nd wrong | +1.25s | Streak stays at 0 |
| 3rd+ wrong | +2.00s | Streak stays at 0 |

- Delay resets after a correct answer
- No hard lockouts
- Clock continues running

---

## Live Match HUD

### During Active Play

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⏱ 0:38  │  ROUND 2 of 4  │  🔵 2,450 vs 🔴 2,380                    │
├──────────────────────────────────────────────────────────────────────┤
│  RELAY: [+]✓ → [−]✓ → [×]●●○○ → [÷]⏳ → [?]⏳                        │
│         Kira   Marcus  YOU      Priya    Jax                        │
└──────────────────────────────────────────────────────────────────────┘

Legend:
✓ = Completed slot
● = Correct answer (current player)
○ = Remaining questions
⏳ = Waiting for turn
```

### During Tactical Break

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⏸ TACTICAL BREAK  │  Next round in 0:12                            │
├──────────────────────────────────────────────────────────────────────┤
│  Round 2 Summary:                                                    │
│  Your Team: +580 pts (94% acc)  │  Opponent: +520 pts (88% acc)     │
│                                                                      │
│  💡 Your division slot was 0.3s faster than opponent                │
└──────────────────────────────────────────────────────────────────────┘
```

### During Halftime

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⏸ HALFTIME  │  IGL is adjusting strategy...  │  0:52 remaining     │
├──────────────────────────────────────────────────────────────────────┤
│  FIRST HALF: Your Team 2,450 - Opponent 2,180  │  +270 lead          │
│                                                                      │
│  [IGL view shows swap interface if you're IGL]                      │
│  [Players see: "Waiting for IGL decisions..."]                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Disconnect & Timeout Handling

### Core Rules

1. **Timer NEVER stops during active rounds**
2. IGL timeouts can only be called between rounds
3. Disconnects during relay = immediate skip with penalty

### IGL Timeout System

| Aspect | Rule |
|--------|------|
| **Total per Match** | 2 |
| **Duration Added** | +1 minute to current half |
| **When Usable** | Between rounds or during halftime |
| **Cannot Be Called** | During active rounds (relay clock running) |
| **Effect on Clocks** | Game clock pauses, relay clock unaffected |

```
UI for IGL:
┌─────────────────────────────────────────────────────────────┐
│  [CALL TIMEOUT]  (grayed out during rounds)                │
│  Timeouts remaining: ●● (2 of 2)                           │
│  Effect: Adds +1 minute to half when called                │
└─────────────────────────────────────────────────────────────┘
```

**Note:** Using a timeout extends the half from 6 minutes to 7 minutes (or 8 minutes if both timeouts used in one half).

### Disconnect Handling

```
Mid-Relay Disconnect:
1. No grace period
2. Slot auto-skips IMMEDIATELY
3. 50% score penalty for skipped questions
4. Visual: "PLAYER DISCONNECTED - SLOT SKIPPED"
5. Match continues with remaining players
6. Reconnected player cannot rejoin mid-round

Example:
- Player C disconnects in × slot
- × slot skipped (would have earned 500 pts, now 250 pts)
- Relay continues to Player D in ÷ slot
```

### Prevention

```
Before Queue:
- Warn players with unstable connections
- Require connection quality check
- Show estimated ping/jitter
```

---

## Scoring System

### Base Scoring

| Action | Points |
|--------|--------|
| Correct answer | 100 pts |
| Streak bonus | +5 pts per consecutive correct |

**Maximum per question:** 100 base + 5 streak = 105 pts

### Team Score Calculation

```
Round Score = Σ(Correct Answers × 100) + Σ(Streak Bonuses × 5)

Example Round (Team with 5 players, 25 questions):
- 22 correct answers = 2,200 pts
- Cumulative streak bonuses = +85 pts
- Round Total = 2,285 pts
```

### APS (Arena Performance Score)

Each player receives an APS calculated from:

| Component | Description |
|-----------|-------------|
| **Accuracy** | Percentage of correct answers |
| **Streak** | Longest consecutive correct streak |
| **Speed** | Average response time |

APS is calculated per player per match and aggregated for team statistics.

### Win Conditions

1. **Primary:** Higher total score across all 8 rounds
2. **Tiebreaker 1:** Higher team accuracy
3. **Tiebreaker 2:** Faster average relay completion time
4. **Tiebreaker 3:** Longer max team streak
5. **Tiebreaker 4:** More correct answers total
6. **Ultimate Tie:** If all above are equal → **Draw**

### Tie/Draw Handling

#### When Does a Draw Occur?

A draw is declared when:
- Both teams have equal total score AND
- All tiebreakers are also equal (extremely rare)

```
Example (theoretical):
Team A: 4,200 pts, 92% acc, 1.2s avg, 12 streak, 42 correct
Team B: 4,200 pts, 92% acc, 1.2s avg, 12 streak, 42 correct
Result: DRAW
```

#### ELO Impact for Ties

| Match Type | Outcome | ELO Change |
|------------|---------|------------|
| Ranked | Win | +15 to +25 (based on opponent ELO) |
| Ranked | Loss | -10 to -20 (based on opponent ELO) |
| Ranked | **Draw** | **0 ELO change for both teams** |
| Casual | Any | 0 (no ELO in casual) |

#### Coin Rewards for Ties

```
Draw Coin Distribution:
- Both teams receive "loser" coin amount (participation reward)
- No winner bonus
- Performance coins still apply (correct answers × 2)
```

#### Match History Display for Ties

```
┌────────────────────────────────────────────────────────────────────────┐
│  🤝 DRAW vs [Opponent Team]  │  4v4 Ranked  │  [Date]                 │
│  Final Score: 4,200 - 4,200  │  +0 ELO                                │
├────────────────────────────────────────────────────────────────────────┤
│  Result: DRAW - All tiebreakers equal                                 │
│  • Accuracy: 92% vs 92%                                               │
│  • Speed: 1.2s vs 1.2s                                                │
│  • Streak: 12 vs 12                                                   │
└────────────────────────────────────────────────────────────────────────┘
```

#### UI Representation

| Element | Win | Loss | Draw |
|---------|-----|------|------|
| Border Color | Green | Red | Amber/Gold |
| Icon | 🏆 Trophy | ❌ X | 🤝 Handshake |
| ELO Badge | +N (green) | -N (red) | +0 (gray) |
| Result Text | "VICTORY" | "DEFEAT" | "DRAW" |

#### Tournament/Competitive Implications

In **Best of 3/5** series:
- Draws count as **0-0** (neither team gets a point)
- Match must be replayed until decisive result
- Maximum 2 draw replays before administrative decision

In **Single Match** tournaments:
- Draw goes to sudden death overtime (future feature)
- Or coin flip for bracket advancement (temporary)

---

## Anchor System

The **Anchor** is a designated team member with special abilities that can dramatically impact match outcomes. The Anchor role is a "hovering title" - any player can be designated as Anchor.

### Anchor Overview

| Aspect | Description |
|--------|-------------|
| **Who** | Any player designated by IGL |
| **Default Slot** | Plays their assigned operation slot normally |
| **Special Abilities** | Double Call-In, Final Round Solo |
| **Strategic Role** | Clutch player, comeback mechanic |

### Anchor Abilities

#### 1. Double Call-In

The Anchor can be called in to play **two slots** in a single round, meaning they go twice while one teammate sits out.

| Aspect | 1st Half | 2nd Half |
|--------|----------|----------|
| **Uses** | Once | Once |
| **Available Rounds** | Round 1, 2, OR 3 (pick one) | Round 1 ONLY |
| **Round 4** | ❌ Not available | N/A (see Final Round Solo) |
| **Slot** | Any (1-5) | Any (1-5) |
| **Effect** | Anchor plays that slot + their assigned slot | Same |
| **Consequence** | Original slot player sits out that round | Same |

**Visual Summary:**

```
1ST HALF
─────────────────────────────────────────────────────────
Round 1:  Double Call-In available (any slot)  ─┐
Round 2:  Double Call-In available (any slot)  ─┼─ Pick ONE
Round 3:  Double Call-In available (any slot)  ─┘
Round 4:  Normal only (no Call-In)

2ND HALF
─────────────────────────────────────────────────────────
Round 1:  Double Call-In available (any slot)  ← ONLY option
Round 2:  Normal only
Round 3:  Normal only
Round 4:  FINAL ROUND DECISION (Solo or Normal)
```

**Example:**

```
Team Setup:
- Player A: Slot 1 (Addition)
- Player B: Slot 2 (Multiplication)
- Player C: Slot 3 (Division) ← ANCHOR
- Player D: Slot 4 (Subtraction)
- Player E: Slot 5 (Mixed)

Normal Round:
Slot 1: Player A → Slot 2: Player B → Slot 3: ANCHOR (C) → 
Slot 4: Player D → Slot 5: Player E

Double Call-In (Anchor into Slot 1):
Slot 1: ANCHOR (C) → Slot 2: Player B → Slot 3: ANCHOR (C) → 
Slot 4: Player D → Slot 5: Player E

Player A sits out this round. Anchor plays twice!
```

#### 2. Final Round Solo (2nd Half Round 4 Only)

In the final round of the match, the IGL can choose to have the Anchor play **ALL 5 SLOTS** solo.

| Aspect | Rule |
|--------|------|
| **When** | Between Round 3 and Round 4 of 2nd Half |
| **Decision Window** | 10-second break before Round 4 |
| **Options** | ANCHOR SOLO or NORMAL |
| **Solo Effect** | Anchor plays all 5 slots (all 25 questions) |
| **Normal Effect** | Standard relay with all 5 players |

**Decision Phase UI:**

```
┌────────────────────────────────────────────────────────────┐
│  ROUND 4 - IGL DECISION                                   │
│                                                            │
│  Away Team decides FIRST (or simultaneously):             │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │   NORMAL     │  │   ANCHOR     │                       │
│  │   RELAY      │  │   SOLO ⚡     │                       │
│  └──────────────┘  └──────────────┘                       │
│                                                            │
│  [5 second decision timer]                                │
└────────────────────────────────────────────────────────────┘
```

**Reveal Type:**

| Type | Description | Who Chooses |
|------|-------------|-------------|
| **Sequential** | Away team decides first, Home team reacts | Team with better record |
| **Simultaneous** | Both teams reveal at same time | Default if records equal |

### Final Round Scenarios

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 1: NORMAL vs NORMAL                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│  Team A: Slot 1 → Slot 2 → Slot 3 → Slot 4 → Slot 5                    │
│  Team B: Slot 1 → Slot 2 → Slot 3 → Slot 4 → Slot 5                    │
│                                                                         │
│  Standard relay round. Conservative choice.                            │
├─────────────────────────────────────────────────────────────────────────┤
│  SCENARIO 2: ANCHOR SOLO vs ANCHOR SOLO (The Showdown)                 │
│  ─────────────────────────────────────────────────────────────────────  │
│  Team A: ⚡ ANCHOR ─────────────────────────────────────────→          │
│  Team B: ⚡ ANCHOR ─────────────────────────────────────────→          │
│                                                                         │
│  1v1 speed duel! Both anchors race through all 25 questions.          │
│  Most points wins. MAXIMUM DRAMA.                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  SCENARIO 3: ANCHOR SOLO vs NORMAL (Asymmetric)                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  Team A: ⚡ ANCHOR (solo, all 25 questions)                            │
│  Team B: Slot 1 → Slot 2 → Slot 3 → Slot 4 → Slot 5                    │
│                                                                         │
│  Anchor races solo while opponents relay normally.                     │
│  Anchor has NO handoff delays but carries all pressure.               │
│  Relay team has 5 brains but loses time on handoffs.                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Strategic Implications

| Strategy | When to Use |
|----------|-------------|
| **Double Call-In early (1st Half R1-3)** | Set pace, probe opponent, build lead |
| **Double Call-In in 2nd Half R1** | Start strong, momentum for final rounds |
| **Save Anchor Solo for behind** | Comeback mechanic, high risk/reward |
| **Match opponent's Solo** | Counter their all-in with your own |
| **Stay Normal against Solo** | Steady play, trust team execution |

### Anchor-Specific Badges

| Badge | Requirement | Icon |
|-------|-------------|------|
| 🎯 **The Closer** | 25 match-winning Anchor Solo rounds |
| ⚡ **Speed Demon** | 20+ correct in single Anchor Solo round |
| 🔥 **Comeback King** | Overcome 500+ point deficit with Anchor |
| 🧊 **Ice Cold** | 95%+ accuracy in Anchor Solo showdowns |
| 🎭 **Mind Reader** | Win 10 matches by counter-picking opponent's decision |
| 👥 **Double Trouble** | Win 15 matches using Double Call-In |

---

## Momentum Mechanics (Casual Only)

> ⚠️ **These features are DISABLED in Ranked mode**

### Heat Streak System

```
Team Heat Levels:
─────────────────────────────────────
🔥 WARM     │ 8 consecutive correct  │ +5% score bonus
🔥🔥 HOT    │ 15 consecutive correct │ +10% bonus + flame border
🔥🔥🔥 FIRE │ 25 consecutive correct │ +15% bonus + opponent alert

Reset: Any wrong answer resets to 0
Carries: Across players within a round (true team streak)
```

### Underdog Boost (Pressure Points)

```
Condition: Behind by 400+ points at halftime

Effect (Second Half Only):
- Questions worth 1.15x points
- Displayed: "UNDERDOG BOOST ACTIVE"
- Does NOT affect accuracy multiplier
- Does NOT apply to ranked matches

Design Intent: Keeps casual games competitive, prevents early surrenders
```

---

## Role Specialization & Badges

### Badge Categories

#### Operation Mastery Badges

| Badge | Requirement | Icon |
|-------|-------------|------|
| Addition Anchor | 95%+ acc over 50 team matches in + slot | 🏅+ |
| Subtraction Sniper | Sub-1.0s avg over 30 team matches in − slot | 🏅− |
| Multiply Master | 100% acc in 10 consecutive × rounds | 🏅× |
| Division Demon | Top 10% speed in ÷ slot (global) | 🏅÷ |
| Mixed Maverick | 90%+ acc in ? slot over 25 matches | 🏅? |

#### Team Contribution Badges

| Badge | Requirement | Icon |
|-------|-------------|------|
| Clutch Closer | Win 20 matches from behind at halftime | 🌟 |
| Perfect Relay | 100% team accuracy in a full match | 💎 |
| Streak Keeper | Maintain 15+ streak in 10 matches | ⚡ |
| Anchor Player | Highest contribution % in 30 matches | ⚓ |
| Relay Runner | Fastest handoff time in 25 matches | 🏃 |

#### IGL Badges

| Badge | Requirement | Icon |
|-------|-------------|------|
| Tactician | Win 50 matches as IGL | 👑 |
| Counter-Strategist | Win against higher-ELO teams 25 times | 🎯 |
| Timeout Master | Win 10 matches after using a timeout | ⏱️ |
| Team Builder | Lead same team to 100 wins | 🏗️ |

### Badge Display

```
Player Card:
┌─────────────────────────────────────┐
│  👤 PlayerName                      │
│  Team: [Team Name]                  │
│  Primary Role: × Multiplication     │
│                                     │
│  Badges: 🏅× 🌟 ⚡ (3 total)        │
│  • Multiply Master                  │
│  • Clutch Closer                    │
│  • Streak Keeper                    │
└─────────────────────────────────────┘
```

---

## Practice Modes

### 1. VS Bots

Practice against AI team with configurable difficulty:

| Difficulty | AI Accuracy | AI Speed | Use Case |
|------------|-------------|----------|----------|
| Beginner | 70% | 2.5s avg | Learn relay flow |
| Intermediate | 85% | 1.8s avg | Standard practice |
| Competitive | 92% | 1.2s avg | Ranked simulation |
| Elite | 97% | 0.9s avg | Tournament prep |

```
Configuration Options:
- Difficulty level
- Focus area (handoff timing, speed, accuracy)
- Number of rounds (1-4)
- Operation restrictions
```

### 2. Scheduled Scrimmage

Challenge another team to a practice match:

```
Setup Flow:
1. Search for team by name
2. Select format (Bo1, Bo3, Bo5)
3. Select team size (must match)
4. Propose time slots
5. Opponent accepts/counters
6. Match scheduled with calendar invite

Features:
- No ELO impact
- Full analytics available
- Can be streamed/recorded
- Optional spectator access
```

### 3. Quick 2v2 (Internal)

Split your team for internal practice:

```
Conditions:
- Requires 4+ players in party
- Auto-splits into balanced teams (by operation strength)
- No ELO impact
- Great for trying new slot assignments
- IGL practice for potential leaders
```

---

## Post-Match Analytics

### Match Summary Card

```
┌────────────────────────────────────────────────────────────────────────┐
│  🏆 VICTORY vs [Opponent]  │  4v4 Ranked  │  [Date]                   │
│  Final Score: 4,850 - 4,320  │  +12 ELO                               │
├────────────────────────────────────────────────────────────────────────┤
│  YOUR PERFORMANCE:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Slot: Multiplication (×)                                        │  │
│  │ Questions: 16/16 attempted  │  Correct: 15 (93.8%)              │  │
│  │ Avg Speed: 1.1s  │  Best: 0.7s  │  Worst: 1.9s                  │  │
│  │ Streak: 8 max  │  Contribution: 26% of team score               │  │
│  │ Handoff Efficiency: +0.2s (excellent)                           │  │
│  └─────────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│  TEAM BREAKDOWN:                                                       │
│  Player  │ Slot │ Acc   │ Speed │ Contrib │ Highlight                 │
│  ────────┼──────┼───────┼───────┼─────────┼───────────────────────────│
│  [P1]    │ +    │ 100%  │ 0.8s  │ 28%     │ Perfect round! 🌟         │
│  [P2]    │ −    │ 87.5% │ 1.2s  │ 24%     │ Strong recovery R3        │
│  [P3]    │ ×    │ 93.8% │ 1.1s  │ 26%     │ Best × speed              │
│  [P4]    │ ÷    │ 81.3% │ 1.6s  │ 22%     │ Improved from R1          │
├────────────────────────────────────────────────────────────────────────┤
│  ROUND-BY-ROUND: R1: +580 │ R2: +620 🔥 │ R3: +540 │ R4: +610        │
├────────────────────────────────────────────────────────────────────────┤
│  IGL DECISIONS:                                                        │
│  • Halftime: Swapped [P2] ↔ [P4] (improved ÷ by 15%)                  │
│  • Timeouts used: 0                                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Team Trends Dashboard

```
📈 TEAM TRENDS (Last 10 Matches)
─────────────────────────────────
Win Rate: 7-3 (70%) ↑12% from last week

OPERATION PERFORMANCE:
+ ████████████████████ 96% acc
− ████████████████░░░░ 88% acc ⚠️ Needs work
× ██████████████████░░ 91% acc
÷ ███████████████░░░░░ 84% acc ⚠️ Weakest slot

BEST LINEUP (by win rate):
[P1](+) → [P2](−) → [P3](×) → [P4](÷) │ 80% win rate

💡 INSIGHT: Team wins 85% when first-half score > 2,400
```

---

## Database Schema

### New Tables Required

```sql
-- Teams (persistent team entities)
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    tag TEXT,  -- 3-4 char tag like "FM"
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',  -- 'igl', 'member'
    primary_operation TEXT,      -- preferred slot
    joined_at TEXT NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
);

-- Team Matches (different from 1v1 arena_matches)
CREATE TABLE IF NOT EXISTS team_matches (
    id TEXT PRIMARY KEY,
    team1_id TEXT NOT NULL,
    team2_id TEXT NOT NULL,
    team1_score INTEGER NOT NULL,
    team2_score INTEGER NOT NULL,
    winner_team_id TEXT,
    mode TEXT NOT NULL,  -- '2v2', '3v3', '4v4', '5v5'
    match_type TEXT NOT NULL,  -- 'ranked', 'casual', 'scrimmage'
    team1_elo_change INTEGER DEFAULT 0,
    team2_elo_change INTEGER DEFAULT 0,
    connection_quality TEXT,
    is_void INTEGER DEFAULT 0,
    void_reason TEXT,
    round_scores TEXT,  -- JSON: [{"round":1,"team1":580,"team2":520},...]
    created_at TEXT NOT NULL,
    FOREIGN KEY (team1_id) REFERENCES teams(id),
    FOREIGN KEY (team2_id) REFERENCES teams(id)
);

-- Team Match Player Performance
CREATE TABLE IF NOT EXISTS team_match_players (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    operation_slot TEXT NOT NULL,  -- '+', '-', 'x', '÷', '?'
    questions_attempted INTEGER,
    questions_correct INTEGER,
    accuracy REAL,
    avg_speed_ms INTEGER,
    max_streak INTEGER,
    contribution_percent REAL,
    handoff_time_ms INTEGER,
    FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- Team ELO (operation-specific like users)
CREATE TABLE IF NOT EXISTS team_elo (
    team_id TEXT PRIMARY KEY,
    elo_2v2 INTEGER DEFAULT 300,
    elo_3v3 INTEGER DEFAULT 300,
    elo_4v4 INTEGER DEFAULT 300,
    elo_5v5 INTEGER DEFAULT 300,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Player Team Badges
CREATE TABLE IF NOT EXISTS team_badges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    team_id TEXT,  -- which team they earned it with
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    UNIQUE(user_id, badge_id)
);

-- Scrimmage Invitations
CREATE TABLE IF NOT EXISTS scrimmage_invites (
    id TEXT PRIMARY KEY,
    from_team_id TEXT NOT NULL,
    to_team_id TEXT NOT NULL,
    mode TEXT NOT NULL,  -- '2v2', '3v3', etc.
    format TEXT NOT NULL,  -- 'bo1', 'bo3', 'bo5'
    proposed_times TEXT,  -- JSON array of ISO timestamps
    accepted_time TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending', 'accepted', 'declined', 'expired'
    message TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (from_team_id) REFERENCES teams(id),
    FOREIGN KEY (to_team_id) REFERENCES teams(id)
);
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_matches_team1 ON team_matches(team1_id);
CREATE INDEX IF NOT EXISTS idx_team_matches_team2 ON team_matches(team2_id);
CREATE INDEX IF NOT EXISTS idx_team_match_players_match ON team_match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_team_match_players_user ON team_match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_team_badges_user ON team_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_scrimmage_invites_to ON scrimmage_invites(to_team_id, status);
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Database schema creation (teams, members, matches)
- [ ] Team CRUD operations (create, join, leave, disband)
- [ ] Party/lobby system for team formation
- [ ] IGL assignment system

### Phase 2: Matchmaking & Lobby
- [ ] Team queue system (separate from 1v1)
- [ ] Team matchmaking by ELO and size
- [ ] Pre-match strategy lobby UI
- [ ] IGL scouting dashboard
- [ ] Slot assignment drag-and-drop UI
- [ ] Ready check system

### Phase 3: Match Engine
- [ ] Relay state machine (server.js)
- [ ] Multi-player synchronization
- [ ] Round/phase timing system
- [ ] Handoff countdown system
- [ ] Tactical break handling
- [ ] Halftime phase with IGL controls

### Phase 4: Live Match UI
- [ ] Team HUD component
- [ ] Relay progress visualization
- [ ] Real-time score comparison
- [ ] Handoff readiness alerts
- [ ] Wrong answer penalty display
- [ ] Disconnect handling UI

### Phase 5: Timeout & Recovery
- [ ] IGL timeout calling interface
- [ ] Timeout countdown overlay
- [ ] Disconnect detection
- [ ] Slot skip with penalty
- [ ] Reconnection handling

### Phase 6: Post-Match
- [ ] Team match results screen
- [ ] Individual performance breakdown
- [ ] IGL decision log
- [ ] ELO calculation (team-based)
- [ ] Match history entry creation

### Phase 7: Analytics
- [ ] Team match history tab
- [ ] Performance trends dashboard
- [ ] Operation-by-slot analytics
- [ ] Best lineup suggestions
- [ ] Improvement insights

### Phase 8: Badges & Rewards
- [ ] Badge definitions and criteria
- [ ] Badge earning logic
- [ ] Badge display on profiles
- [ ] Team-specific badge tracking

### Phase 9: Practice Modes
- [ ] Bot team AI for practice
- [ ] Difficulty configuration
- [ ] Internal 2v2 split system
- [ ] Scrimmage invitation system
- [ ] Scrimmage scheduling

### Phase 10: Casual Features
- [ ] Heat streak system (non-ranked)
- [ ] Underdog boost (non-ranked)
- [ ] Visual effects for momentum

### Phase 11: Polish
- [ ] Sound effects for handoffs
- [ ] Animations for transitions
- [ ] Spectator mode (future)
- [ ] Tournament bracket support (future)

---

## Socket Events (Team Mode)

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `team_join_match` | `{matchId, teamId, userId, slot}` | Join team match |
| `team_submit_answer` | `{matchId, answer, timeMs}` | Submit answer |
| `team_igl_assign` | `{matchId, assignments: [{userId, slot}]}` | IGL assigns slots |
| `team_igl_timeout` | `{matchId}` | IGL calls timeout |
| `team_ready` | `{matchId, userId}` | Player ready for match |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `team_match_state` | Full match state | Sync full state |
| `team_round_start` | `{round, timeLeft}` | Round begins |
| `team_handoff_warning` | `{userId, secondsUntil}` | 3s warning |
| `team_handoff_start` | `{userId, question}` | Your turn |
| `team_answer_result` | `{userId, correct, score, streak}` | Answer processed |
| `team_relay_progress` | `{teamId, slots: [...]}` | Relay visualization |
| `team_round_end` | `{round, scores}` | Round complete |
| `team_tactical_break` | `{timeLeft}` | Break started |
| `team_halftime` | `{scores, timeLeft}` | Halftime started |
| `team_timeout_called` | `{teamId, timeLeft}` | Timeout active |
| `team_match_end` | `{winner, scores, analytics}` | Match complete |
| `team_player_disconnect` | `{userId, slotSkipped}` | Player DC'd |

---

## API Endpoints

### Team Management

```
POST   /api/teams                    Create team
GET    /api/teams/:id                Get team details
PUT    /api/teams/:id                Update team (owner only)
DELETE /api/teams/:id                Disband team (owner only)
POST   /api/teams/:id/invite         Invite player
POST   /api/teams/:id/join           Join team (with invite code)
DELETE /api/teams/:id/members/:uid   Remove member (owner/self)
PUT    /api/teams/:id/igl            Assign IGL
```

### Team Matches

```
POST   /api/team-matches/queue       Join queue
DELETE /api/team-matches/queue       Leave queue
GET    /api/team-matches/:id         Get match details
GET    /api/team-matches/history     Get team match history
```

### Scrimmages

```
POST   /api/scrimmages               Send scrimmage invite
GET    /api/scrimmages/pending       Get pending invites
PUT    /api/scrimmages/:id/accept    Accept invite
PUT    /api/scrimmages/:id/decline   Decline invite
```

### Analytics

```
GET    /api/teams/:id/stats          Get team statistics
GET    /api/teams/:id/trends         Get performance trends
GET    /api/users/:id/team-stats     Get user's team performance
```

---

## Future Considerations

- **Voice Chat Integration** - Real-time team communication
- **Spectator Mode** - Watch live matches
- **Tournament Brackets** - Organized competition
- **Team Cosmetics** - Team banners, colors, logos
- **Seasonal Rankings** - Team leaderboards
- **Replay System** - Watch past matches
- **Coach Role** - Spectator with IGL communication

---

*This document serves as the complete specification for Arena Teams implementation. Update the checklist as features are completed.*

---

## UI Component Specification

This section documents all UI components required for the Arena Teams 5v5 mode, including props, states, behaviors, and integration with existing systems.

### Design Principles

#### Visual Style Consistency

All Arena Teams components must adhere to FlashMath's established aesthetic:

| Principle | Implementation |
|-----------|----------------|
| **Gradients** | Use gradient backgrounds from `globals.css` (e.g., `bg-gradient-to-br`) |
| **Glass Effects** | Apply `glass` utility for panels/overlays (blur + semi-transparent bg) |
| **Rounded Corners** | Prefer `rounded-xl` to `rounded-[2rem]` for cards and buttons |
| **Shadows** | Use layered shadows with glow effects for interactive elements |
| **Animations** | Framer Motion for all transitions; CSS keyframes for continuous effects |

#### Theming Integration

Components must respect user-equipped themes stored in `users.equipped_items.theme`:

```typescript
// All themed components should accept optional overrides
interface ThemedComponentProps {
  /** User's equipped theme from cosmetic system */
  themeOverride?: 'matrix' | 'synthwave' | 'deep-space' | 'caution' | 'red-alert' | 'ice-cold' | 'sunset-drive';
}

// Apply theme class to root element
<div className={cn("base-styles", themeOverride && `theme-${themeOverride}`)}>
```

**Available Theme Classes** (from `globals.css`):
- `.theme-matrix` - Green terminal aesthetic
- `.theme-synthwave` - Neon pink/cyan 80s style
- `.theme-deep-space` - Indigo/purple space theme
- `.theme-caution` - Amber/black warning style
- `.theme-red-alert` - Red emergency aesthetic
- `.theme-ice-cold` - Blue/cyan frost theme
- `.theme-sunset-drive` - Orange/purple gradient

#### Cosmetic Integration

Components displaying player info must support:

| Cosmetic Type | Source | Display Location |
|---------------|--------|------------------|
| **Frame** | `equipped_items.frame` | Around avatar |
| **Banner** | `equipped_items.banner` | Player card backgrounds |
| **Title** | `equipped_items.title` | Below player name |
| **Particle** | `equipped_items.particle` | Avatar particle effects |

---

### Existing Infrastructure to Leverage

#### Social FAB and Panel

The social system provides the foundation for party management:

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/components/social/social-fab.tsx` | Floating action button on right edge | `SocialFAB` component |
| `src/components/social/social-panel.tsx` | Slide-out panel (friends, party, requests) | `SocialPanel` component |
| `src/components/social/party-section.tsx` | Party UI within social panel | `PartySection` component |
| `src/components/social/social-provider.tsx` | React context for social state | `useSocial` hook |

**Current Party Features:**
- Create/leave party
- Invite friends (leader or open mode)
- Real-time member status updates
- Party invite notifications
- Settings (invite mode: open/invite_only)

#### Presence System

Real-time status tracking via Socket.io:

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/lib/socket/use-presence.ts` | Presence hook for real-time status | `usePresence`, `notifyPartyInvite`, etc. |

**Tracked Statuses:**
- `online` - Active and available
- `away` - Idle/AFK
- `invisible` - Hidden from friends
- `in-match` - Currently in Arena match
- `offline` - Disconnected

**Available Events:**
- `presence:update` - Friend status changed
- `party:member_joined` - Someone joined party
- `party:member_left` - Someone left party
- `party:settings_updated` - Party settings changed

#### Arena Mode Selection

The existing mode selection system:

| File | Purpose |
|------|---------|
| `src/components/arena/mode-selection.tsx` | Mode cards, operation selector |
| `src/components/arena/arena-modes-client.tsx` | Page wrapper with effects |

**Key Patterns:**
- `ModeCard` - Gradient cards with hover effects
- `RankBadge` - ELO display with rank icon
- Operation selector with icon buttons
- Animation using Framer Motion

---

### UI Flow Diagrams

#### Flow A: Full Party (5 players)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Mode Selection │───▶│  Party Lobby    │───▶│  IGL/Anchor     │
│  (5v5 card)     │    │  (all 5 ready)  │    │  Selection      │
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
                       ┌─────────────────┐    ┌────────▼────────┐
                       │  Pre-Match      │◀───│  Queue          │
                       │  Strategy       │    │  (find opponent)│
                       └────────┬────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐
                       │  Active Match   │
                       └─────────────────┘
```

#### Flow B: Partial Party (1-4 players)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Mode Selection │───▶│  Party Lobby    │───▶│  Queue          │
│  (5v5 card)     │    │  (1-4 players)  │    │  (fill spots)   │
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
                       ┌─────────────────┐    ┌────────▼────────┐
                       │  IGL/Anchor     │◀───│  Team Formed    │
                       │  Selection      │    │  (5 assembled)  │
                       └────────┬────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐    ┌─────────────────┐
                       │  Queue          │───▶│  Pre-Match      │
                       │  (find opponent)│    │  Strategy       │
                       └─────────────────┘    └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Active Match   │
                                              └─────────────────┘
```

**Key Timing:** IGL/Anchor selection happens AFTER teammates are found but BEFORE opponent matching begins. This ensures the full team agrees on leadership before searching for an opponent.

#### Flow C: Solo Queue for Team Mode

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Mode Selection │───▶│  "Find Team"    │───▶│  Queue          │
│  (5v5, no party)│    │  Entry Modal    │    │  (building team)│
└─────────────────┘    └─────────────────┘    └────────┬────────┘
                                                       │
                       ┌─────────────────┐    ┌────────▼────────┐
                       │  IGL Vote/Auto  │◀───│  Team Formed    │
                       │  Selection      │    │  (5 matched)    │
                       └────────┬────────┘    └─────────────────┘
                                │
                       ┌────────▼────────┐    ┌─────────────────┐
                       │  Queue          │───▶│  Pre-Match      │
                       │  (find opponent)│    │  Strategy       │
                       └─────────────────┘    └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  Active Match   │
                                              └─────────────────┘
```

**Key Timing:** Same as Flow B - IGL selection happens after the team is fully assembled from random players, but before opponent matching begins.

---

### Phase 0: Mode Selection Entry Point (3 Components)

#### Component: `TeamModeCard` (Enhanced `ModeCard`)

**Purpose:** Display team mode options (2v2-5v5) with party status indicator.

**Location:** `src/components/arena/mode-selection.tsx`

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `GameMode` | ✅ | Mode data (id, name, gradient, rating) |
| `isSelected` | `boolean` | ✅ | Currently selected state |
| `selectedOperation` | `Operation` | ✅ | Current operation filter |
| `onSelect` | `() => void` | ✅ | Selection callback |
| `onOperationSelect` | `(op: Operation) => void` | ✅ | Operation change callback |
| `index` | `number` | ✅ | Animation stagger index |
| `partySize` | `number` | ❌ | Current party size (0 if solo) |
| `partyStatus` | `'ready' \| 'incomplete' \| 'none'` | ❌ | Party readiness state |

**Visual States:**

| State | Appearance |
|-------|------------|
| Available (solo) | Standard gradient, "Find Team" label |
| Available (party < mode size) | Standard gradient + party badge "3/5" |
| Available (party = mode size) | Highlighted gradient + "Ready" badge |
| Unavailable | Grayed out + "Coming Soon" badge |

**UI Mockup:**

```
┌──────────────────────────────────────────────────┐
│  5v5                          [ELO 420] [3/5 👥] │
│                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐             │
│  │ +  │ │ −  │ │ ×  │ │ ÷  │ │ ?  │             │
│  └────┘ └────┘ └────┘ └────┘ └────┘             │
└──────────────────────────────────────────────────┘
```

---

#### Component: `PartyStatusBadge`

**Purpose:** Display party size and readiness on mode cards.

**Location:** `src/components/arena/party-status-badge.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `currentSize` | `number` | ✅ | Current party members |
| `requiredSize` | `number` | ✅ | Required for this mode |
| `isReady` | `boolean` | ❌ | All members ready to queue |

**Visual States:**

| Condition | Display | Colors |
|-----------|---------|--------|
| Solo (0) | Hidden | - |
| Incomplete | "3/5 👥" | Amber bg, amber text |
| Complete, not ready | "5/5 👥" | Blue bg, blue text |
| Complete, all ready | "5/5 ✓" | Green bg, green text |

---

#### Component: `TeamModeEntryModal`

**Purpose:** Confirmation modal when selecting team mode without full party.

**Location:** `src/components/arena/team-mode-entry-modal.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Modal visibility |
| `onClose` | `() => void` | ✅ | Close callback |
| `mode` | `'2v2' \| '3v3' \| '4v4' \| '5v5'` | ✅ | Selected team mode |
| `partySize` | `number` | ✅ | Current party size |
| `onFindTeam` | `() => void` | ✅ | Solo queue callback |
| `onInviteFriends` | `() => void` | ✅ | Open social panel |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────┐
│  🎯 5v5 ARENA                                     [X Close]│
├────────────────────────────────────────────────────────────┤
│                                                            │
│  You need 5 players for this mode.                        │
│  Current party: 2/5                                        │
│                                                            │
│  ┌─────────────────────┐  ┌─────────────────────┐         │
│  │   🔍 FIND TEAM      │  │   👥 INVITE FRIENDS │         │
│  │   Queue solo and    │  │   Add friends to    │         │
│  │   match with others │  │   your party        │         │
│  └─────────────────────┘  └─────────────────────┘         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Party Formation Extensions (4 Components)

These components extend the existing `PartySection` in `src/components/social/party-section.tsx` to support team mode features.

#### Component: `IGLBadge`

**Purpose:** Visual indicator showing a player has IGL (In-Game Leader) role.

**Location:** `src/components/arena/igl-badge.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `size` | `'sm' \| 'md' \| 'lg'` | ❌ | Badge size (default: 'md') |
| `showLabel` | `boolean` | ❌ | Show "IGL" text (default: true) |
| `animated` | `boolean` | ❌ | Enable crown pulse animation |
| `className` | `string` | ❌ | Additional CSS classes |

**Visual Design:**

```
┌─────────────────────────────────────────┐
│  Size variants:                         │
│                                         │
│  sm: [👑] 16x16, no label               │
│  md: [👑 IGL] 24x24, gold text          │
│  lg: [👑 IN-GAME LEADER] 32x32, full    │
│                                         │
│  Colors:                                │
│  - Crown icon: #fbbf24 (amber-400)      │
│  - Background: #fbbf24/20               │
│  - Border: #f59e0b/30                   │
│  - Text: #fcd34d (amber-300)            │
└─────────────────────────────────────────┘
```

**Animation:**

```css
@keyframes crown-pulse {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px #fbbf24); }
  50% { transform: scale(1.1); filter: drop-shadow(0 0 8px #fbbf24); }
}
```

---

#### Component: `AnchorBadge`

**Purpose:** Visual indicator showing a player has Anchor role.

**Location:** `src/components/arena/anchor-badge.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `size` | `'sm' \| 'md' \| 'lg'` | ❌ | Badge size (default: 'md') |
| `showLabel` | `boolean` | ❌ | Show "ANCHOR" text (default: true) |
| `abilityUsed` | `'none' \| 'call-in' \| 'solo'` | ❌ | Dims if ability already used |
| `className` | `string` | ❌ | Additional CSS classes |

**Visual Design:**

```
┌─────────────────────────────────────────┐
│  Size variants:                         │
│                                         │
│  sm: [⚓] 16x16, no label               │
│  md: [⚓ A] 24x24, "A" badge             │
│  lg: [⚓ ANCHOR] 32x32, full label       │
│                                         │
│  Colors:                                │
│  - Anchor icon: #22d3ee (cyan-400)      │
│  - Background: #22d3ee/20               │
│  - Border: #06b6d4/30                   │
│  - Text: #67e8f9 (cyan-300)             │
│                                         │
│  Ability used state:                    │
│  - Opacity: 0.5                         │
│  - Strike-through on "A"                │
└─────────────────────────────────────────┘
```

---

#### Component: `ReadyCheckToggle`

**Purpose:** Toggle button for players to indicate they're ready to queue.

**Location:** `src/components/arena/ready-check-toggle.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isReady` | `boolean` | ✅ | Current ready state |
| `onToggle` | `(ready: boolean) => void` | ✅ | Toggle callback |
| `disabled` | `boolean` | ❌ | Disable interaction |
| `size` | `'sm' \| 'md'` | ❌ | Toggle size |

**Visual States:**

| State | Appearance | Icon |
|-------|------------|------|
| Not Ready | Gray bg, white border | Empty circle ○ |
| Ready | Green bg, green glow | Checkmark ✓ |
| Disabled | Dimmed, no cursor | Dash — |

**UI Mockup:**

```
Not Ready:          Ready:              Disabled:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ○ READY?   │     │  ✓ READY!   │     │  — WAIT     │
│  (gray)     │     │  (green)    │     │  (dim)      │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

#### Component: `PartyQueueButton`

**Purpose:** Primary action button for party leader to start queue.

**Location:** `src/components/arena/party-queue-button.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `'2v2' \| '3v3' \| '4v4' \| '5v5'` | ✅ | Target game mode |
| `operation` | `Operation` | ✅ | Selected operation |
| `partySize` | `number` | ✅ | Current party size |
| `requiredSize` | `number` | ✅ | Required players for mode |
| `allReady` | `boolean` | ✅ | All members ready |
| `isLeader` | `boolean` | ✅ | Is current user the leader |
| `onStartQueue` | `() => void` | ✅ | Start queue callback |
| `isLoading` | `boolean` | ❌ | Loading/queuing state |

**Visual States:**

| Condition | Appearance | Text |
|-----------|------------|------|
| Not leader | Hidden | - |
| Party incomplete | Disabled, amber | "Need X more players" |
| Not all ready | Disabled, blue | "Waiting for ready (3/5)" |
| Ready to queue | Enabled, green glow | "FIND MATCH ⚔️" |
| Queuing | Pulsing, spinner | "Searching..." |

**UI Mockup:**

```
Ready state:
┌─────────────────────────────────────────────────────────┐
│  ⚔️  FIND MATCH (5v5 Mixed)                             │
│      [Animated gradient, glow effect]                   │
└─────────────────────────────────────────────────────────┘

Waiting state:
┌─────────────────────────────────────────────────────────┐
│  ⏳  Waiting for ready (3/5)                            │
│      [Dimmed, no interaction]                           │
└─────────────────────────────────────────────────────────┘

Searching state:
┌─────────────────────────────────────────────────────────┐
│  🔄  Searching for opponents...                         │
│      [Animated spinner, pulse effect]                   │
└─────────────────────────────────────────────────────────┘
```

---

#### Extended: `PartySection` Props

The existing `PartySection` component needs these additional props:

```typescript
interface PartySectionProps {
  // ... existing props from party-section.tsx ...
  
  // NEW: Team mode specific
  targetMode?: '2v2' | '3v3' | '4v4' | '5v5';
  selectedOperation?: Operation;
  iglId?: string;           // Designated IGL (defaults to leader)
  anchorId?: string;        // Designated Anchor
  memberReadyStates?: Map<string, boolean>;  // Ready status per member
  onSetIGL?: (userId: string) => void;
  onSetAnchor?: (userId: string) => void;
  onToggleReady?: (ready: boolean) => void;
  onStartQueue?: () => void;
  queueReady?: boolean;     // All players ready to queue
}
```

**New UI Elements in Party Section:**

| Element | Description | Visibility |
|---------|-------------|------------|
| Target Mode Badge | "5v5 Mixed" indicator | When target mode selected |
| IGL Crown (gold) | Above avatar of IGL | Always when IGL set |
| Anchor Badge | "A" badge on anchor player | Always when anchor set |
| Mode Size Indicator | "3/5 for 5v5" | When target mode selected |
| Ready Toggle | Checkmark per player | Before queue |
| Start Queue Button | "Find Match" button | Leader only, when all ready |
| Role Assignment Button | Opens IGL/Anchor modal | Leader only |

**Updated Party Member Row:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Avatar] [👑] Player1 (IGL)    LVL 42 │ 850 ELO │ [✓ Ready] │ ● │ │
│  [Frame]       DIAMOND I                                      online│
├─────────────────────────────────────────────────────────────────────┤
│  [Avatar] [⚓A] Player2 (Anchor) LVL 38 │ 720 ELO │ [○ Ready?] │ ● │ │
│  [Frame]        PLATINUM III                                  online│
├─────────────────────────────────────────────────────────────────────┤
│  [Avatar]      Player3          LVL 25 │ 520 ELO │ [✓ Ready] │ ● │ │
│  [Frame]       GOLD II                                        away  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Phase 2: IGL/Anchor Selection (3 Components)

These components handle the selection of In-Game Leader and Anchor roles.

> **Important Timing Note:**
> - **Full Party (5 players):** IGL/Anchor selection happens BEFORE queuing
> - **Partial Party (1-4 players):** IGL/Anchor selection happens AFTER teammates are found, but BEFORE opponent matching begins
> - **Solo Queue:** Same as partial party - selection happens after team assembly, before opponent matching

This two-phase queue approach ensures that random players joining a partial party get a voice in leadership selection before being committed to a match.

#### Component: `IGLSelectionModal`

**Purpose:** Allow team to choose IGL and Anchor. Triggered at different points depending on party completeness.

**Location:** `src/components/arena/igl-selection-modal.tsx` (new)

**Trigger Conditions:**

| Scenario | When Modal Appears |
|----------|-------------------|
| **Full Party (5/5)** | When party leader clicks "Queue" (before matchmaking starts) |
| **Partial Party (1-4)** | After teammates found, before opponent matching (queue pauses) |
| **Solo Queue** | After full team assembled from randoms, before opponent matching |

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Modal visibility |
| `onClose` | `() => void` | ✅ | Close callback |
| `members` | `PartyMember[]` | ✅ | All team members |
| `currentIGL` | `string \| null` | ✅ | Current IGL if set |
| `currentAnchor` | `string \| null` | ✅ | Current Anchor if set |
| `isLeader` | `boolean` | ✅ | Is current user the party leader |
| `selectionMode` | `'leader-pick' \| 'vote'` | ✅ | How roles are chosen |
| `onConfirm` | `(iglId: string, anchorId: string) => void` | ✅ | Confirm callback |
| `onSelectionModeChange` | `(mode: 'leader-pick' \| 'vote') => void` | ❌ | Change selection method |

**PartyMember Type:**

```typescript
interface PartyMember {
  odUserId: string;
  odName: string;
  odLevel: number;
  odDuelElo: number;
  odDuelRank: string;
  odDuelDivision: string;
  odEquippedFrame: string;
  isLeader: boolean;
  odOnline: boolean;
}
```

**Selection Modes:**

| Mode | Who Decides | Process |
|------|-------------|---------|
| `leader-pick` | Party leader | Leader selects IGL & Anchor, confirms |
| `vote` | All members | Each member nominates, majority wins |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────┐
│  TEAM SETUP                                       [X Close] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  SELECT IN-GAME LEADER (IGL)                              │
│  Makes strategic decisions during match                   │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │
│  │ Player1  │ │ Player2  │ │ Player3  │ │ Player4  │ │ Player5  │
│  │   [👑]   │ │          │ │          │ │          │ │          │
│  │ 850 ELO  │ │ 720 ELO  │ │ 650 ELO  │ │ 580 ELO  │ │ 520 ELO  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
│                                                            │
│  ─────────────────────────────────────────────────────────│
│                                                            │
│  SELECT ANCHOR                                            │
│  Can take over rounds, clutch player                      │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │
│  │ Player1  │ │ Player2  │ │ Player3  │ │ Player4  │ │ Player5  │
│  │          │ │   [⚓A]  │ │          │ │          │ │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
│                                                            │
│  ┌─────────────────┐                                       │
│  │ Leader Pick ▼   │                  [CONFIRM & QUEUE]   │
│  └─────────────────┘                                       │
└────────────────────────────────────────────────────────────┘
```

**Vote Mode UI:**

```
┌────────────────────────────────────────────────────────────┐
│  IGL VOTE                                    Time: 0:15    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Who should be IGL?                                        │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │ │ [Avatar] │
│  │ Player1  │ │ Player2  │ │ Player3  │ │ Player4  │ │ Player5  │
│  │  2 votes │ │  1 vote  │ │  0 votes │ │  1 vote  │ │  0 votes │
│  │   [YOU]  │ │          │ │          │ │          │ │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
│                                                            │
│  Your vote: Player1                    [SKIP] [CHANGE]    │
└────────────────────────────────────────────────────────────┘
```

---

#### Component: `PlayerSelectionCard`

**Purpose:** Selectable player card used in IGL/Anchor selection.

**Location:** `src/components/arena/player-selection-card.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `player` | `PartyMember` | ✅ | Player data |
| `isSelected` | `boolean` | ✅ | Currently selected |
| `selectionType` | `'igl' \| 'anchor' \| 'both'` | ✅ | What role is being selected |
| `isDisabled` | `boolean` | ❌ | Cannot be selected |
| `voteCount` | `number` | ❌ | Votes received (vote mode) |
| `isCurrentUser` | `boolean` | ❌ | Highlight as current user |
| `onSelect` | `() => void` | ✅ | Selection callback |

**Visual States:**

| State | Border | Background | Icon |
|-------|--------|------------|------|
| Default | white/10 | white/5 | None |
| Hover | primary/50 | primary/10 | None |
| Selected (IGL) | amber-400 | amber-400/20 | 👑 Crown |
| Selected (Anchor) | cyan-400 | cyan-400/20 | ⚓ Anchor |
| Selected (Both) | gradient | gradient/20 | 👑⚓ Both |
| Disabled | white/5 | white/2 | ❌ |

**Layout:**

```
┌─────────────────────────────────────┐
│  ┌─────────┐                        │
│  │ [Frame] │  PlayerName            │
│  │ Avatar  │  DIAMOND I             │
│  │         │  850 ELO               │
│  └─────────┘                        │
│                                     │
│  [Role Badge if selected]           │
│  [Vote count if vote mode]          │
└─────────────────────────────────────┘
```

---

#### Component: `RoleVotePanel`

**Purpose:** Voting interface for IGL/Anchor selection when using vote mode.

**Location:** `src/components/arena/role-vote-panel.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `role` | `'igl' \| 'anchor'` | ✅ | Which role is being voted on |
| `members` | `PartyMember[]` | ✅ | All team members |
| `votes` | `Map<string, string>` | ✅ | voter userId -> voted userId |
| `currentUserId` | `string` | ✅ | Current user's ID |
| `timeRemaining` | `number` | ✅ | Seconds left to vote |
| `onVote` | `(votedUserId: string) => void` | ✅ | Submit vote |
| `onSkip` | `() => void` | ✅ | Skip/abstain |

**Vote Resolution Rules:**

| Condition | Result |
|-----------|--------|
| Majority (>50%) | Winner gets role |
| Tie | Highest ELO among tied |
| No votes | Party leader gets role |
| Timeout | Auto-resolve with above rules |

**Timer Behavior:**
- 15 seconds for IGL vote
- 10 seconds for Anchor vote
- Visual countdown with urgency colors (green → amber → red)

---

#### Solo/Half-Party IGL Selection

When queuing solo or with partial party (1-4 players) for team mode, IGL selection happens in a **dedicated phase** after teammates are found but **before opponent matching begins**.

**Queue Flow for Partial Parties:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: TEAMMATE SEARCH                                              │
│  ─────────────────────────────────────────────────────────────────────  │
│  Party Leader clicks "Queue" → System searches for X more players     │
│  (where X = mode size - party size)                                    │
│                                                                         │
│  Example: 3-player party queuing for 5v5 → System finds 2 more players│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: TEAM ASSEMBLY + IGL SELECTION (Queue Paused)                 │
│  ─────────────────────────────────────────────────────────────────────  │
│  • All 5 players assembled, shown to each other                        │
│  • IGL Selection: 15-second timer for vote or leader-pick             │
│  • Anchor Selection: 10-second timer                                   │
│  • Queue is PAUSED during this phase - no opponent matching yet       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: OPPONENT SEARCH                                              │
│  ─────────────────────────────────────────────────────────────────────  │
│  Once roles confirmed → System searches for opposing team              │
│  This is standard matchmaking based on team average ELO               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Pre-Queue Options (Before Joining Queue):**

```typescript
interface SoloQueuePreferences {
  willingToIGL: boolean;      // Opt-in for IGL role
  willingToAnchor: boolean;   // Opt-in for Anchor role
  preferredOperation: Operation;  // Preferred slot
}
```

**IGL Selection Methods for Assembled Teams:**

| Method | Who Decides | When Used |
|--------|-------------|-----------|
| **Largest Party Leader** | Original party leader | Default if party leader's party is largest |
| **Vote** | All 5 players | When multiple parties of same size, or if requested |
| **Volunteer Priority** | Auto-assign | If only one player opted-in for IGL |
| **ELO Priority** | Auto-assign | If no volunteers, highest ELO gets IGL |

**Team Formation Process:**

| Step | Action | Duration |
|------|--------|----------|
| 1. Teammates Found | System forms complete 5-player team | - |
| 2. Team Reveal | All players shown with stats | 3 seconds |
| 3. IGL Selection | Vote or leader-pick based on party makeup | 15 seconds |
| 4. Anchor Selection | Same process after IGL assigned | 10 seconds |
| 5. Roles Confirmed | All players see final roles | 3 seconds |
| 6. Opponent Search | Queue resumes to find opposing team | Variable |

**Team Assembly UI (Partial Party):**

```
┌────────────────────────────────────────────────────────────┐
│  🎉 TEAM ASSEMBLED!                           Time: 0:15   │
│                                                            │
│  Your party found 2 new teammates:                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  YOUR PARTY (3):                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐                               │
│  │ YOU👑│ │ P2 ⚓│ │ P3   │   ← Pre-assigned roles       │
│  │ 850  │ │ 720  │ │ 680  │                               │
│  │Leader│ │      │ │      │                               │
│  └──────┘ └──────┘ └──────┘                               │
│                                                            │
│  NEW TEAMMATES (2):                       [NEW] badges    │
│  ┌──────┐ ┌──────┐                                        │
│  │ P4   │ │ P5   │                                        │
│  │ 640  │ │ 580  │                                        │
│  │ Solo │ │ Solo │   ← Queued solo                        │
│  └──────┘ └──────┘                                        │
│                                                            │
│  ─────────────────────────────────────────────────────────│
│                                                            │
│  SELECT IGL:                                              │
│  ○ Keep YOU (party leader)                                │
│  ○ Vote among team                                        │
│  ○ Highest ELO (YOU - 850)                               │
│                                                            │
│  [CONFIRM IGL: YOU]                                       │
└────────────────────────────────────────────────────────────┘
```

**Quick Selection UI (All Solo Queue):**

When all 5 players queued solo (no existing party):

```
┌────────────────────────────────────────────────────────────┐
│  🎉 TEAM FORMED!                              Time: 0:15   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  5 solo players matched:                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ YOU  │ │ P2 ★ │ │ P3   │ │ P4   │ │ P5   │             │
│  │ 850  │ │ 720  │ │ 680  │ │ 590  │ │ 540  │             │
│  │      │ │ IGL? │ │      │ │      │ │      │             │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘             │
│                                                            │
│  ★ = Volunteered for IGL during pre-queue                │
│                                                            │
│  IGL VOTE:                                                │
│  P2 has 3 votes (volunteered, highest among volunteers)  │
│  Auto-assigning in 5...                                   │
│                                                            │
│  [VOTE FOR SOMEONE ELSE]                                  │
└────────────────────────────────────────────────────────────┘
```

**After Roles Confirmed:**

```
┌────────────────────────────────────────────────────────────┐
│  ✅ ROLES CONFIRMED                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ P2👑 │ │ YOU⚓│ │ P3   │ │ P4   │ │ P5   │             │
│  │ IGL  │ │Anchor│ │      │ │      │ │      │             │
│  │ 720  │ │ 850  │ │ 680  │ │ 590  │ │ 540  │             │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘             │
│                                                            │
│  🔍 Searching for opponent team...                        │
│  ████████░░░░░░░░░░░░░░░░░░░░░░                           │
│                                                            │
│  Team Avg ELO: 676 │ Est. wait: ~30s                      │
└────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Queue and Matchmaking (3 Components)

These components handle the queue experience for team modes.

> **Two-Phase Queue System:**
> For partial parties (1-4 players), the queue operates in two distinct phases:
> 1. **Teammate Search:** Find players to complete the team
> 2. **Opponent Search:** After IGL selection, find opposing team
>
> The queue is paused between phases for IGL/Anchor selection (see Phase 2).

#### Component: `TeamQueueStatus`

**Purpose:** Display queue status for team modes with team formation progress.

**Location:** `src/components/arena/team-queue-status.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `mode` | `'2v2' \| '3v3' \| '4v4' \| '5v5'` | ✅ | Team mode |
| `operation` | `Operation` | ✅ | Selected operation |
| `party` | `PartyMember[]` | ✅ | Current party members |
| `seeking` | `number` | ✅ | Slots to fill (0 if full party) |
| `estimatedTime` | `number` | ✅ | Wait time in seconds |
| `queueStartTime` | `number` | ✅ | Queue start timestamp |
| `queuePhase` | `'teammates' \| 'igl-selection' \| 'opponents' \| 'match-found'` | ✅ | Current queue phase |
| `onCancel` | `() => void` | ✅ | Cancel queue callback |

**Queue Phases (for partial parties):**

| Phase | Condition | Display | Can Cancel? |
|-------|-----------|---------|-------------|
| `teammates` | seeking > 0 | "Finding X more players..." | ✅ Yes |
| `igl-selection` | Team complete, selecting roles | "Selecting team roles..." | ❌ No (see Phase 2) |
| `opponents` | Roles confirmed | "Finding opponents..." | ✅ Yes |
| `match-found` | Opponent found | "MATCH FOUND!" | ❌ No |

**Queue Phases (for full party):**

| Phase | Condition | Display | Can Cancel? |
|-------|-----------|---------|-------------|
| `opponents` | Party complete | "Finding opponents..." | ✅ Yes |
| `match-found` | Opponent found | "MATCH FOUND!" | ❌ No |

*(Full parties skip `teammates` and `igl-selection` phases since IGL is selected before queuing)*

**UI Mockup - Phase 1: Teammate Search (Partial Party):**

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍 PHASE 1: FINDING TEAMMATES                                     │
│     5v5 • Mixed                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  YOUR PARTY (3):                                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │  ???   │ │  ???   │           │
│  │ You    │ │ P2     │ │ P3     │ │  ...   │ │  ...   │           │
│  │ Leader │ │        │ │        │ │        │ │        │           │
│  │ 850    │ │ 720    │ │ 650    │ │        │ │        │           │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                                    │
│  Finding 2 more players...                                        │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░                         │
│                                                                    │
│  ⏱ Time in queue: 0:42         Est. wait: ~1:00                  │
│                                                                    │
│  Next: Team assembly → IGL selection → Opponent search            │
│                                                                    │
│                        [CANCEL QUEUE]                              │
└────────────────────────────────────────────────────────────────────┘
```

**UI Mockup - Phase 2: Opponent Search (After IGL Selection):**

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍 PHASE 2: FINDING OPPONENTS                                     │
│     5v5 • Mixed                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  YOUR TEAM (5/5):                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │           │
│  │ You👑  │ │ P2 ⚓  │ │ P3     │ │ P4 NEW │ │ P5 NEW │           │
│  │ IGL    │ │ Anchor │ │        │ │        │ │        │           │
│  │ 850    │ │ 720    │ │ 650    │ │ 640    │ │ 580    │           │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                                    │
│  Team Avg ELO: 688 │ Searching for opponents...                   │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░                         │
│                                                                    │
│  ⏱ Time in queue: 1:15         Est. wait: ~0:30                  │
│                                                                    │
│                        [CANCEL QUEUE]                              │
└────────────────────────────────────────────────────────────────────┘
```

**UI Mockup - Full Party (Skips Phase 1):**

```
┌────────────────────────────────────────────────────────────────────┐
│  🔍 FINDING OPPONENTS                                              │
│     5v5 • Mixed                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  YOUR TEAM (5/5):                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │           │
│  │ You👑  │ │ P2 ⚓  │ │ P3     │ │ P4     │ │ P5     │           │
│  │ IGL    │ │ Anchor │ │        │ │        │ │        │           │
│  │ 850    │ │ 720    │ │ 680    │ │ 640    │ │ 600    │           │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                                    │
│  Team Avg ELO: 698 │ Searching for opponents...                   │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░                         │
│                                                                    │
│  ⏱ Time in queue: 0:25         Est. wait: ~0:30                  │
│                                                                    │
│                        [CANCEL QUEUE]                              │
└────────────────────────────────────────────────────────────────────┘
```

**Match Found State:**

```
┌────────────────────────────────────────────────────────────────────┐
│                     ⚔️ MATCH FOUND!                                │
│                                                                    │
│  ┌──────────────────────┐    VS    ┌──────────────────────┐       │
│  │     YOUR TEAM        │          │    OPPONENT          │       │
│  │     ████████         │          │    ████████          │       │
│  │     Avg: 688 ELO     │          │    Avg: 705 ELO      │       │
│  └──────────────────────┘          └──────────────────────┘       │
│                                                                    │
│  Confirming all players... 5/10 ✓                                 │
│                                                                    │
│  [Auto-accept in 8...]                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `TeamFormationProgress`

**Purpose:** Animated visualization of team being assembled during queue.

**Location:** `src/components/arena/team-formation-progress.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `totalSlots` | `number` | ✅ | Total team size (5 for 5v5) |
| `filledSlots` | `number` | ✅ | Currently filled slots |
| `partyMembers` | `PartyMember[]` | ✅ | Known party members |
| `recentlyJoined` | `PartyMember \| null` | ❌ | Flash animation for new member |

**Animation Sequence:**

| Event | Animation |
|-------|-----------|
| Initial load | Party members fade in staggered |
| Player joins | New slot fills with glow effect |
| Team complete | All slots pulse green, confetti burst |

**Slot States:**

| State | Visual |
|-------|--------|
| Empty | Dashed border, pulsing "?" |
| Filled (party) | Avatar with frame, solid border |
| Filled (matched) | Avatar, amber border "NEW" badge |
| Recently joined | Glow animation, scale pulse |

---

#### Component: `QueuePlayerCard`

**Purpose:** Display a player slot in the queue team formation.

**Location:** `src/components/arena/queue-player-card.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `player` | `PartyMember \| null` | ✅ | Player data (null = empty slot) |
| `slotIndex` | `number` | ✅ | Position in team (0-4) |
| `isCurrentUser` | `boolean` | ❌ | Highlight as current user |
| `isIGL` | `boolean` | ❌ | Show IGL badge |
| `isAnchor` | `boolean` | ❌ | Show Anchor badge |
| `isNew` | `boolean` | ❌ | Recently joined animation |
| `operation` | `Operation \| null` | ❌ | Assigned operation (if known) |

**Empty Slot UI:**

```
┌─────────────────────────┐
│    ┌─────────────┐      │
│    │             │      │
│    │     ?       │      │  <- Pulsing question mark
│    │             │      │
│    └─────────────┘      │
│                         │
│    Searching...         │
│    ████░░░░░░░░░        │  <- Animated progress bar
└─────────────────────────┘
```

**Filled Slot UI:**

```
┌─────────────────────────┐
│ [👑]   ┌───────────┐    │  <- IGL badge if applicable
│        │ [Avatar]  │    │
│        │ [Frame]   │    │
│        └───────────┘    │
│                         │
│    PlayerName           │
│    DIAMOND I • 850      │
│    [+] Addition         │  <- Assigned operation if known
└─────────────────────────┘
```

---

#### Queue Timer and Estimation

**Time Display Format:**

| Duration | Format | Example |
|----------|--------|---------|
| < 1 min | "0:SS" | "0:42" |
| 1-10 min | "M:SS" | "3:15" |
| > 10 min | "MM:SS" | "12:30" |

**Estimated Wait Calculation:**

```typescript
function estimateWait(mode: string, eloRange: number, timeOfDay: number): number {
  const baseTime = {
    '2v2': 30,   // seconds
    '3v3': 45,
    '4v4': 60,
    '5v5': 90,
  }[mode];
  
  // Adjust based on ELO (higher ELO = longer wait)
  const eloMultiplier = eloRange > 800 ? 1.5 : eloRange > 600 ? 1.2 : 1.0;
  
  // Adjust based on time of day (peak hours = faster)
  const peakHourMultiplier = isPeakHour(timeOfDay) ? 0.7 : 1.3;
  
  return baseTime * eloMultiplier * peakHourMultiplier;
}
```

**AI Backfill (After 15 seconds):**

For partial parties waiting too long, system may offer AI backfill:

```
┌────────────────────────────────────────────────────────────┐
│  Taking longer than expected...                           │
│                                                            │
│  Would you like to fill remaining slots with AI players?  │
│                                                            │
│  [CONTINUE WAITING]           [ADD AI PLAYERS]            │
│                                                            │
│  Note: AI players do not affect ELO gains/losses          │
└────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Pre-Match Strategy (4 Components)

These components are displayed after match is found but before the match starts, allowing IGL to set up the team.

#### Component: `ScoutingDashboard`

**Purpose:** Display opponent team statistics for IGL to strategize.

**Location:** `src/components/arena/scouting-dashboard.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `opponentTeam` | `TeamScoutData` | ✅ | Opponent team stats |
| `ownTeam` | `TeamScoutData` | ✅ | Own team stats for comparison |
| `isIGL` | `boolean` | ✅ | Show full IGL view or spectator view |

**TeamScoutData Type:**

```typescript
interface TeamScoutData {
  teamName?: string;
  avgElo: number;
  players: PlayerScoutData[];
}

interface PlayerScoutData {
  userId: string;
  name: string;
  rank: string;
  division: string;
  elo: number;
  bestOperation: Operation;    // Highest accuracy operation
  operationStats: {
    addition: { accuracy: number; avgSpeed: number };
    subtraction: { accuracy: number; avgSpeed: number };
    multiplication: { accuracy: number; avgSpeed: number };
    division: { accuracy: number; avgSpeed: number };
    mixed: { accuracy: number; avgSpeed: number };
  };
  streakReliability: number;   // % of matches maintaining streak
  avgContribution: number;     // % of team score typically
}
```

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎯 OPPONENT SCOUT                                     Time: 0:45      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PLAYER         │ BEST OP │ ACC   │ AVG SPEED │ STREAK RELIABILITY    │
│  ───────────────┼─────────┼───────┼───────────┼───────────────────────│
│  [Ava] Player1  │ ×       │ 94%   │ 1.2s      │ ████████░░ 82%        │
│  [Ava] Player2  │ +       │ 88%   │ 0.9s      │ ██████░░░░ 64%        │
│  [Ava] Player3  │ ÷       │ 91%   │ 1.8s  ⚠️  │ █████████░ 91%        │
│  [Ava] Player4  │ −       │ 85%   │ 1.4s      │ ███████░░░ 73%        │
│  [Ava] Player5  │ ?       │ 79%   │ 1.6s      │ █████░░░░░ 55%        │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│                                                                        │
│  💡 INSIGHTS:                                                          │
│  • Division slot is slowest (1.8s avg) - exploit with your fastest ÷  │
│  • Player3 has high streak reliability - don't let them build momentum│
│  • Mixed player weakest accuracy - focus scoring there               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `SlotAssignmentPanel`

**Purpose:** IGL drag-and-drop interface for assigning players to operation slots.

**Location:** `src/components/arena/slot-assignment-panel.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `players` | `PartyMember[]` | ✅ | Team members to assign |
| `assignments` | `Map<string, Operation>` | ✅ | Current assignments |
| `isIGL` | `boolean` | ✅ | Can edit assignments |
| `isLocked` | `boolean` | ❌ | Assignments finalized |
| `onAssign` | `(userId: string, op: Operation) => void` | ✅ | Assignment callback |
| `onAutoAssign` | `() => void` | ❌ | Auto-assign based on stats |
| `onLock` | `() => void` | ❌ | Lock assignments |

**UI Mockup (IGL View):**

```
┌─────────────────────────────────────────────────────────────┐
│  OPERATION SLOTS          │  AVAILABLE PLAYERS             │
│  ─────────────────────────┼────────────────────────────────│
│                           │                                │
│  ┌─────────────────────┐  │  ┌─────────────────────────┐  │
│  │ + ADDITION          │◀─┼──│ [Ava] Player1 (96% +)   │  │
│  │   [Drop here]       │  │  │ 850 ELO • 0.8s avg      │  │
│  └─────────────────────┘  │  └─────────────────────────┘  │
│                           │                                │
│  ┌─────────────────────┐  │  ┌─────────────────────────┐  │
│  │ − SUBTRACTION       │◀─┼──│ [Ava] Player2 (92% −)   │  │
│  │   [Drop here]       │  │  │ 720 ELO • 1.1s avg      │  │
│  └─────────────────────┘  │  └─────────────────────────┘  │
│                           │                                │
│  ┌─────────────────────┐  │  ┌─────────────────────────┐  │
│  │ × MULTIPLICATION    │◀─┼──│ [Ava] Player3 (89% ×)   │  │
│  │   [Drop here]       │  │  │ 680 ELO • 1.3s avg      │  │
│  └─────────────────────┘  │  └─────────────────────────┘  │
│                           │                                │
│  ┌─────────────────────┐  │                                │
│  │ ÷ DIVISION          │◀─┼──(Drag player here)           │
│  │   [Drop here]       │  │                                │
│  └─────────────────────┘  │                                │
│                           │                                │
│  ┌─────────────────────┐  │                                │
│  │ ? MIXED             │◀─┼──(Drag player here)           │
│  │   [Drop here]       │  │                                │
│  └─────────────────────┘  │                                │
│                           │                                │
│  ─────────────────────────┼────────────────────────────────│
│  [AUTO-ASSIGN]            │  [LOCK ASSIGNMENTS]            │
└─────────────────────────────────────────────────────────────┘
```

**Non-IGL View:**

```
┌─────────────────────────────────────────────────────────────┐
│  SLOT ASSIGNMENTS                    IGL is assigning...   │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  + Addition      ← Player1 [Ava]                           │
│  − Subtraction   ← Player2 [Ava]                           │
│  × Multiplication← Player3 [Ava]                           │
│  ÷ Division      ← (not assigned)                          │
│  ? Mixed         ← (not assigned)                          │
│                                                             │
│  Your slot: × MULTIPLICATION                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

#### Component: `StrategyTimer`

**Purpose:** Countdown timer for pre-match strategy phase.

**Location:** `src/components/arena/strategy-timer.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `totalSeconds` | `number` | ✅ | Total phase duration |
| `remainingSeconds` | `number` | ✅ | Time remaining |
| `phase` | `'scouting' \| 'assignment' \| 'ready'` | ✅ | Current phase |
| `onPhaseChange` | `(phase: string) => void` | ❌ | Phase transition callback |

**Timer Phases:**

| Phase | Duration | Purpose |
|-------|----------|---------|
| Scouting | 30s | Review opponent stats |
| Assignment | 30s | Assign slots |
| Ready | 10s | Final countdown |

**Visual States:**

| Time Remaining | Color | Effect |
|----------------|-------|--------|
| > 30s | Green | Normal |
| 15-30s | Amber | Gentle pulse |
| 5-15s | Orange | Faster pulse |
| < 5s | Red | Urgent pulse + sound |

**UI Mockup:**

```
┌─────────────────────────────────────────┐
│  STRATEGY PHASE                         │
│                                         │
│          ┌───────────┐                  │
│          │   0:25    │                  │  <- Large timer
│          └───────────┘                  │
│                                         │
│  [████████████░░░░░░░░░░░░]            │  <- Progress bar
│                                         │
│  Phase: SLOT ASSIGNMENT                 │
│  Next: READY CHECK in 0:25             │
└─────────────────────────────────────────┘
```

---

#### Component: `TeamReadyOverlay`

**Purpose:** Final ready check before match starts.

**Location:** `src/components/arena/team-ready-overlay.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `teamMembers` | `PartyMember[]` | ✅ | All team members |
| `readyStates` | `Map<string, boolean>` | ✅ | Ready status per member |
| `assignments` | `Map<string, Operation>` | ✅ | Final slot assignments |
| `countdown` | `number` | ✅ | Seconds until match starts |
| `isReady` | `boolean` | ✅ | Current user's ready state |
| `onReady` | `() => void` | ✅ | Mark self as ready |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│                          ⚔️ MATCH STARTING                             │
│                                                                        │
│  SLOT ASSIGNMENTS:                                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │ │ [Ava]  │               │
│  │ P1 👑  │ │ P2 ⚓  │ │ P3     │ │ P4     │ │ P5     │               │
│  │ + ADD  │ │ − SUB  │ │ × MUL  │ │ ÷ DIV  │ │ ? MIX  │               │
│  │   ✓    │ │   ✓    │ │   ✓    │ │   ○    │ │   ✓    │               │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘               │
│                                                                        │
│                    Ready: 4/5                                          │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │                    MATCH STARTS IN: 8                     │         │
│  └──────────────────────────────────────────────────────────┘         │
│                                                                        │
│                        [I'M READY! ✓]                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Auto-Ready Behavior:**
- If all players ready, countdown accelerates
- If countdown reaches 0 with unready players, match starts anyway
- Unready players auto-ready at 0

---

### Phase 5: Active Match (8 Components)

These components are displayed during live match play.

#### Component: `TeamMatchHUD`

**Purpose:** Main heads-up display during team match showing scores, relay progress, and timers.

**Location:** `src/components/arena/team-match-hud.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `matchState` | `TeamMatchState` | ✅ | Full match state |
| `currentUserId` | `string` | ✅ | Current player ID |
| `isIGL` | `boolean` | ✅ | Show IGL controls |

**TeamMatchState Type:**

```typescript
interface TeamMatchState {
  matchId: string;
  round: number;           // 1-8
  half: 1 | 2;
  phase: 'active' | 'break' | 'halftime' | 'anchordecision';
  gameClockMs: number;     // Game clock (stops for breaks)
  relayClockMs: number;    // Relay clock (never stops)
  
  team1: TeamState;
  team2: TeamState;
  
  currentSlot: number;     // 1-5, which operation is active
  questionsInSlot: number; // 0-5, progress in current slot
  
  timeoutsUsed: { team1: number; team2: number };
}

interface TeamState {
  teamId: string;
  score: number;
  players: PlayerMatchState[];
  currentStreak: number;
  isHome: boolean;
}

interface PlayerMatchState {
  userId: string;
  name: string;
  slot: Operation;
  score: number;
  correct: number;
  total: number;
  streak: number;
  maxStreak: number;
  isActive: boolean;      // Currently answering
  isComplete: boolean;    // Finished their slot
  isIGL: boolean;
  isAnchor: boolean;
}
```

**UI Mockup:**

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⏱ 4:38  │  ROUND 2 of 4  │  1ST HALF  │  🔵 2,450 vs 🔴 2,380      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  YOUR TEAM                           OPPONENT                        │
│  ────────────────────────────────    ────────────────────────────    │
│  [+]✓ Kira      580  100%            [+]✓ Alex      520  92%         │
│  [−]✓ Marcus    490   94%            [−]● Jake      ███ (live)       │
│  [×]● YOU       ███  (live)          [×]⏳ Sam                        │
│  [÷]⏳ Priya                          [÷]⏳ Kim                        │
│  [?]⏳ Jax                            [?]⏳ Lee                        │
│                                                                      │
│  Current: ×  Question: 3/5  Streak: 4 🔥                             │
│                                                                      │
│  RELAY: [+]✓ → [−]✓ → [×]●●●○○ → [÷]⏳ → [?]⏳                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Legend:
✓ = Completed slot
● = Active/In progress
⏳ = Waiting
███ = Score animating
```

---

#### Component: `RelayProgressBar`

**Purpose:** Visual representation of relay progress through all 5 slots.

**Location:** `src/components/arena/relay-progress-bar.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `slots` | `SlotProgress[]` | ✅ | Progress per slot |
| `currentSlot` | `number` | ✅ | Active slot (1-5) |
| `questionsInSlot` | `number` | ✅ | Questions answered in current |
| `totalPerSlot` | `number` | ✅ | Questions per slot (5) |
| `showPlayers` | `boolean` | ❌ | Show player names under slots |

**SlotProgress Type:**

```typescript
interface SlotProgress {
  operation: Operation;
  playerName: string;
  status: 'waiting' | 'active' | 'complete';
  questionsCorrect: number;
  questionsTotal: number;
}
```

**Visual Design:**

```
RELAY PROGRESS
┌────┐   ┌────┐   ┌────┐   ┌────┐   ┌────┐
│ +  │ → │ −  │ → │ ×  │ → │ ÷  │ → │ ?  │
│ ✓  │   │ ✓  │   │●●●○○│  │    │   │    │
└────┘   └────┘   └────┘   └────┘   └────┘
 Kira     Marcus    YOU      Priya    Jax
 5/5      5/5      3/5       -        -

● = Correct answer (filled)
○ = Remaining question (empty)
```

---

#### Component: `PlayerSlotCard`

**Purpose:** Display a single player's slot status in the relay.

**Location:** `src/components/arena/player-slot-card.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `player` | `PlayerMatchState` | ✅ | Player state |
| `operation` | `Operation` | ✅ | Assigned operation |
| `isCurrentUser` | `boolean` | ❌ | Highlight as current user |
| `isOpponent` | `boolean` | ❌ | Opponent team styling |
| `showScore` | `boolean` | ❌ | Show running score |

**Visual States:**

| State | Border | Background | Content |
|-------|--------|------------|---------|
| Waiting | white/20 | transparent | Grayed, "Ready" |
| Standby (3s) | amber | amber/20 | Pulsing, "GET READY" |
| Active | green | green/10 | Live score, question count |
| Complete | primary | primary/10 | Final score, accuracy |

---

#### Component: `QuestionDisplay`

**Purpose:** Show the current math question to the active player.

**Location:** `src/components/arena/question-display.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `question` | `MathQuestion` | ✅ | Current question |
| `isBlurred` | `boolean` | ❌ | Blur before player's turn |
| `operation` | `Operation` | ✅ | Operation type for styling |
| `questionNumber` | `number` | ✅ | 1-5 within slot |
| `streak` | `number` | ❌ | Current streak for bonus display |

**MathQuestion Type:**

```typescript
interface MathQuestion {
  id: string;
  operand1: number;
  operand2: number;
  operation: '+' | '-' | '×' | '÷';
  answer: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}
```

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                   Question 3 of 5                          │
│                                                            │
│                      48 × 7 = ?                            │
│                                                            │
│                   Streak: 4 🔥 (+20 bonus)                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

#### Component: `AnswerInput`

**Purpose:** Input field for player to submit their answer.

**Location:** `src/components/arena/answer-input.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onSubmit` | `(answer: number) => void` | ✅ | Submit callback |
| `isDisabled` | `boolean` | ❌ | Disable input |
| `lastResult` | `'correct' \| 'wrong' \| null` | ❌ | Flash feedback |
| `autoFocus` | `boolean` | ❌ | Focus on mount |

**Feedback States:**

| Result | Visual | Duration |
|--------|--------|----------|
| Correct | Green flash + "✓" | 300ms |
| Wrong | Red shake + "✗" | 500ms + delay |
| Neutral | White border | - |

---

#### Component: `StreakIndicator`

**Purpose:** Visual display of current answer streak with bonus info.

**Location:** `src/components/arena/streak-indicator.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `streak` | `number` | ✅ | Current streak count |
| `maxStreak` | `number` | ❌ | Max streak this match |
| `isActive` | `boolean` | ❌ | Currently on a streak |
| `bonusPerQuestion` | `number` | ❌ | Bonus points (5) |

**Visual Tiers:**

| Streak | Display | Effect |
|--------|---------|--------|
| 0 | Hidden | - |
| 1-4 | "🔥 x3" | Small flame |
| 5-9 | "🔥🔥 x7" | Medium flame, glow |
| 10-14 | "🔥🔥🔥 x12" | Large flame, pulse |
| 15+ | "💥 x15 FIRE!" | Special animation |

---

#### Component: `HandoffCountdown`

**Purpose:** Alert player when their turn is approaching.

**Location:** `src/components/arena/handoff-countdown.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `secondsUntil` | `number` | ✅ | Seconds until your turn |
| `operation` | `Operation` | ✅ | Your assigned operation |
| `isVisible` | `boolean` | ✅ | Show/hide countdown |

**Countdown Sequence:**

| Time | Visual | Audio |
|------|--------|-------|
| 5s | "Get Ready" (dim) | - |
| 3s | "3..." (amber) | Soft ping |
| 2s | "2..." (amber) | Medium ping |
| 1s | "1..." + question (blurred) | High ping |
| 0s | Question unblurs | GO chime |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│              ⚡ YOUR TURN IN 3 SECONDS ⚡                   │
│                                                            │
│                    × MULTIPLICATION                        │
│                                                            │
│              [First question preview - blurred]            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

#### Component: `ScoreComparison`

**Purpose:** Real-time score comparison between teams.

**Location:** `src/components/arena/score-comparison.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `team1Score` | `number` | ✅ | Home team score |
| `team2Score` | `number` | ✅ | Away team score |
| `team1Name` | `string` | ❌ | Home team name |
| `team2Name` | `string` | ❌ | Away team name |
| `isUserTeam1` | `boolean` | ✅ | User on team 1 |
| `animate` | `boolean` | ❌ | Animate score changes |

**Visual Design:**

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   🔵 YOUR TEAM         VS         OPPONENT 🔴          │
│                                                         │
│      2,450            ⚔️           2,380                │
│      ████████████████░░░░░░░░░░░░░░░░░░░░               │
│                   +70                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘

Score bar shows relative position (more toward team with higher score)
+70 indicates lead amount with appropriate color
```

**Score Change Animation:**
- New points fly in from player card
- Score counter animates up
- Bar adjusts smoothly
- Lead indicator pulses if lead changes

---

### Phase 6: Round Transitions (4 Components)

These components handle the breaks between rounds and at halftime.

#### Component: `TacticalBreakOverlay`

**Purpose:** 10-second break overlay between rounds with round summary.

**Location:** `src/components/arena/tactical-break-overlay.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `timeRemaining` | `number` | ✅ | Seconds until next round |
| `completedRound` | `number` | ✅ | Round just completed (1-4) |
| `roundScores` | `RoundScoreSummary` | ✅ | Scores from completed round |
| `totalScores` | `{ team1: number; team2: number }` | ✅ | Running totals |
| `isIGL` | `boolean` | ✅ | Show IGL quick actions |
| `onCallTimeout` | `() => void` | ❌ | IGL timeout callback |
| `timeoutsRemaining` | `number` | ❌ | Timeouts left |

**RoundScoreSummary Type:**

```typescript
interface RoundScoreSummary {
  team1Score: number;
  team2Score: number;
  team1Accuracy: number;
  team2Accuracy: number;
  mvpPlayer: { name: string; score: number };
  insight?: string;  // AI-generated tip
}
```

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────┐
│  ⏸ TACTICAL BREAK  │  Next round in 0:08                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ROUND 2 COMPLETE                                                  │
│                                                                    │
│  ┌──────────────────────┐     ┌──────────────────────┐            │
│  │   YOUR TEAM          │     │   OPPONENT           │            │
│  │   +620 pts           │     │   +540 pts           │            │
│  │   94% accuracy       │     │   88% accuracy       │            │
│  └──────────────────────┘     └──────────────────────┘            │
│                                                                    │
│  ⭐ Round MVP: Marcus (+165 pts, 100% accuracy)                   │
│                                                                    │
│  💡 Your division slot was 0.3s faster than opponent              │
│                                                                    │
│  TOTAL: 2,450 vs 2,380 (+70 lead)                                 │
│                                                                    │
│  ─────────────────────────────────────────────────────────────────│
│  [IGL: Call Timeout (2 remaining)]                                │
└────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `HalftimePanel`

**Purpose:** Extended 2-minute break at halftime with full IGL controls.

**Location:** `src/components/arena/halftime-panel.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `timeRemaining` | `number` | ✅ | Seconds until 2nd half |
| `firstHalfStats` | `HalfStats` | ✅ | 1st half performance |
| `isIGL` | `boolean` | ✅ | Show IGL controls |
| `currentAssignments` | `Map<string, Operation>` | ✅ | Current slot assignments |
| `onReassign` | `(userId: string, op: Operation) => void` | ❌ | Reassignment callback |
| `anchorCallInUsed` | `boolean` | ✅ | Already used 1st half call-in |

**HalfStats Type:**

```typescript
interface HalfStats {
  totalScore: number;
  opponentScore: number;
  rounds: RoundScoreSummary[];
  playerStats: {
    userId: string;
    name: string;
    score: number;
    accuracy: number;
    avgSpeed: number;
    contribution: number;
  }[];
  suggestions: string[];  // AI strategy suggestions
}
```

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⏸ HALFTIME  │  2nd half starts in 1:42  │  IGL adjusting strategy... │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  FIRST HALF SUMMARY                                                    │
│  Your Team: 4,920 │ Opponent: 4,580 │ Lead: +340                      │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  PLAYER PERFORMANCE                                            │   │
│  │  ──────────────────────────────────────────────────────────────│   │
│  │  Player  │ Slot │ Score │ Acc   │ Speed │ Contrib │ Trend     │   │
│  │  ────────┼──────┼───────┼───────┼───────┼─────────┼───────────│   │
│  │  Kira👑  │ +    │ 1,240 │ 100%  │ 0.8s  │ 25%     │ 📈 Great  │   │
│  │  Marcus⚓│ −    │ 1,180 │ 94%   │ 1.2s  │ 24%     │ 📊 Good   │   │
│  │  YOU     │ ×    │ 1,120 │ 88%   │ 1.3s  │ 23%     │ 📈 Good   │   │
│  │  Priya   │ ÷    │ 760   │ 75% ⚠️│ 1.6s  │ 15%     │ 📉 Needs  │   │
│  │  Jax     │ ?    │ 620   │ 82%   │ 1.4s  │ 13%     │ 📊 OK     │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  💡 AI SUGGESTIONS:                                                    │
│  • Swap Priya (÷) with Jax (?): Priya's mixed accuracy is higher      │
│  • Consider Double Call-In for Marcus in Round 1 to build lead        │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│  [IGL CONTROLS]                                                        │
│                                                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  REASSIGN SLOTS │  │  SWAP ANCHOR    │  │  VIEW OPPONENT  │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                        │
│  Changes: Priya ÷→? │ Jax ?→÷  [UNDO] [CONFIRM]                       │
└────────────────────────────────────────────────────────────────────────┘
```

**Non-IGL View:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⏸ HALFTIME  │  2nd half starts in 1:42                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  FIRST HALF SUMMARY                                                    │
│  Your Team: 4,920 │ Opponent: 4,580 │ Lead: +340 🎉                   │
│                                                                        │
│  Your Performance:                                                     │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  Slot: × Multiplication                                        │   │
│  │  Score: 1,120 pts │ Accuracy: 88% │ Avg Speed: 1.3s            │   │
│  │  Team Contribution: 23%                                        │   │
│  │  Best Moment: 8-streak in Round 2!                             │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  Waiting for IGL decisions...                                         │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `IGLControlBar`

**Purpose:** Compact control bar for IGL actions during breaks.

**Location:** `src/components/arena/igl-control-bar.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isVisible` | `boolean` | ✅ | Show/hide bar |
| `phase` | `'break' \| 'halftime' \| 'anchordecision'` | ✅ | Current phase |
| `timeoutsRemaining` | `number` | ✅ | Timeouts left (0-2) |
| `canCallTimeout` | `boolean` | ✅ | Timeout available now |
| `onCallTimeout` | `() => void` | ✅ | Timeout callback |
| `onOpenSlotPanel` | `() => void` | ✅ | Open slot assignment |
| `onOpenAnchorModal` | `() => void` | ❌ | Open anchor decision |
| `hasUnsavedChanges` | `boolean` | ❌ | Pending slot changes |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  👑 IGL CONTROLS                                                       │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐       │
│  │ ⏸ CALL TIMEOUT  │ │ 📋 ASSIGN SLOTS  │ │ ⚓ ANCHOR SETUP  │       │
│  │   (2 remaining) │ │   • Changes      │ │                  │       │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `RoundSummaryCard`

**Purpose:** Compact card showing round results.

**Location:** `src/components/arena/round-summary-card.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `roundNumber` | `number` | ✅ | Which round (1-4) |
| `half` | `1 \| 2` | ✅ | Which half |
| `team1Score` | `number` | ✅ | Team 1 round score |
| `team2Score` | `number` | ✅ | Team 2 round score |
| `team1Accuracy` | `number` | ❌ | Team 1 accuracy % |
| `team2Accuracy` | `number` | ❌ | Team 2 accuracy % |
| `isExpanded` | `boolean` | ❌ | Show detailed breakdown |
| `onToggle` | `() => void` | ❌ | Toggle expanded |

**Compact View:**

```
┌───────────────────────────────────────┐
│  Round 2 │ +620 vs +540 │ WIN (+80)  │
└───────────────────────────────────────┘
```

**Expanded View:**

```
┌───────────────────────────────────────────────────────────┐
│  Round 2 │ YOUR TEAM: +620 (94%) │ OPP: +540 (88%)        │
├───────────────────────────────────────────────────────────┤
│  + Kira:   125 pts │ − Marcus: 115 pts │ × YOU: 140 pts  │
│  ÷ Priya:  120 pts │ ? Jax:    120 pts                   │
│  MVP: YOU (140 pts, 100% acc, 1.0s avg)                  │
└───────────────────────────────────────────────────────────┘
```

---

### Phase 7: Anchor Mechanics (4 Components)

These components handle the Anchor's special abilities: Double Call-In and Final Round Solo.

#### Component: `DoubleCallInModal`

**Purpose:** IGL interface to activate Double Call-In for the Anchor.

**Location:** `src/components/arena/double-call-in-modal.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Modal visibility |
| `onClose` | `() => void` | ✅ | Close callback |
| `half` | `1 \| 2` | ✅ | Current half |
| `round` | `number` | ✅ | Current round |
| `isUsedThisHalf` | `boolean` | ✅ | Already used this half |
| `availableRounds` | `number[]` | ✅ | Rounds that can use call-in |
| `teamPlayers` | `PlayerMatchState[]` | ✅ | Team members for slot selection |
| `anchor` | `PlayerMatchState` | ✅ | The anchor player |
| `onActivate` | `(targetRound: number, targetSlot: Operation) => void` | ✅ | Activation callback |

**Availability Rules:**

| Half | Available Rounds | Slots |
|------|------------------|-------|
| 1st | 1, 2, OR 3 (pick one) | Any (1-5) |
| 2nd | Round 1 ONLY | Any (1-5) |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚓ DOUBLE CALL-IN                                            [X Close]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  The Anchor will play TWO slots in the selected round.               │
│  One teammate will sit out.                                           │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  ANCHOR: Marcus (⚓)                                            │   │
│  │  Already assigned to: − SUBTRACTION                            │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  SELECT ADDITIONAL SLOT FOR ANCHOR:                                   │
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ + ADD    │ │ − SUB    │ │ × MUL    │ │ ÷ DIV    │ │ ? MIX    │    │
│  │ Kira     │ │ (Anchor) │ │ YOU      │ │ Priya    │ │ Jax      │    │
│  │ [SELECT] │ │ assigned │ │ [SELECT] │ │ [SELECT] │ │ [SELECT] │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                        │
│  ⚠️ If you select +ADD, Kira will sit out Round 2.                   │
│                                                                        │
│  Use in: ○ Round 1  ○ Round 2  ● Round 3  (must pick before round)   │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│                                                                        │
│         [CANCEL]                    [CONFIRM DOUBLE CALL-IN]          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Already Used State:**

```
┌────────────────────────────────────────────────────────────┐
│  ⚓ DOUBLE CALL-IN                                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ❌ Already used this half                                 │
│                                                            │
│  Double Call-In was used in Round 2                       │
│  Marcus played both − and × slots                         │
│                                                            │
│  Next available: 2nd Half (if unused in 1st half)        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

#### Component: `AnchorSoloDecision`

**Purpose:** IGL decision modal for Final Round Solo activation.

**Location:** `src/components/arena/anchor-solo-decision.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | `boolean` | ✅ | Modal visibility |
| `onClose` | `() => void` | ✅ | Close callback |
| `timeRemaining` | `number` | ✅ | Seconds to decide |
| `anchor` | `PlayerMatchState` | ✅ | The anchor player |
| `revealType` | `'sequential' \| 'simultaneous'` | ✅ | How decisions are revealed |
| `isDecidingFirst` | `boolean` | ✅ | This team decides first |
| `opponentDecision` | `'solo' \| 'normal' \| 'pending'` | ❌ | Opponent choice (if sequential & 2nd) |
| `onDecide` | `(choice: 'solo' \| 'normal') => void` | ✅ | Submit decision |

**UI Mockup (Sequential, Deciding First):**

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎯 FINAL ROUND DECISION                                 Time: 0:08   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Your team decides FIRST (better record this match)                   │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│                                                                        │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐   │
│  │                            │  │                                │   │
│  │      👥 NORMAL RELAY       │  │       ⚓ ANCHOR SOLO           │   │
│  │                            │  │                                │   │
│  │  All 5 players relay       │  │  Marcus plays ALL 25          │   │
│  │  as usual                  │  │  questions alone               │   │
│  │                            │  │                                │   │
│  │  ✓ Safe, consistent       │  │  ⚡ High risk, high reward    │   │
│  │  ✓ Team contribution       │  │  ⚡ No handoff delays          │   │
│  │                            │  │  ⚡ Single point of failure    │   │
│  │                            │  │                                │   │
│  │      [NORMAL RELAY]        │  │      [ANCHOR SOLO]            │   │
│  └────────────────────────────┘  └────────────────────────────────┘   │
│                                                                        │
│  Your decision will be revealed to opponent after they decide.       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**UI Mockup (Sequential, Deciding Second):**

```
┌────────────────────────────────────────────────────────────────────────┐
│  🎯 FINAL ROUND DECISION                                 Time: 0:05   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Opponent chose: ⚓ ANCHOR SOLO                                       │
│  Their anchor will attempt all 25 questions!                          │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│                                                                        │
│  How will you respond?                                                │
│                                                                        │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐   │
│  │      👥 NORMAL RELAY       │  │       ⚓ ANCHOR SOLO           │   │
│  │                            │  │                                │   │
│  │  Counter with teamwork     │  │  SHOWDOWN: Anchor vs Anchor   │   │
│  │                            │  │                                │   │
│  │      [NORMAL RELAY]        │  │      [ANCHOR SOLO]            │   │
│  └────────────────────────────┘  └────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `RevealTypeSelector`

**Purpose:** Pre-match selection of reveal type (which team decides first).

**Location:** `src/components/arena/reveal-type-selector.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `teamHasBetterRecord` | `boolean` | ✅ | This team has better record |
| `currentSelection` | `'sequential' \| 'simultaneous'` | ✅ | Current choice |
| `onSelect` | `(type: 'sequential' \| 'simultaneous') => void` | ✅ | Selection callback |
| `isLocked` | `boolean` | ❌ | Selection finalized |

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  FINAL ROUND REVEAL TYPE                                              │
│  (Your team chooses - better record this season)                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────┐    ┌─────────────────────────┐           │
│  │   🔀 SIMULTANEOUS       │    │   📋 SEQUENTIAL         │           │
│  │                         │    │                         │           │
│  │  Both teams reveal      │    │  Away team decides      │           │
│  │  at the same time       │    │  first, you react       │           │
│  │                         │    │                         │           │
│  │  ✓ Fair, no advantage   │    │  ✓ Strategic edge       │           │
│  │  ✓ Pure reads           │    │  ✓ Counter-play         │           │
│  │                         │    │                         │           │
│  │     [SELECT]            │    │     [● SELECTED]        │           │
│  └─────────────────────────┘    └─────────────────────────┘           │
│                                                                        │
│  Note: Sequential gives you the advantage of reacting to opponent.   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `AnchorIndicator`

**Purpose:** Visual indicator during match when Anchor abilities are active or available.

**Location:** `src/components/arena/anchor-indicator.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `anchorPlayer` | `PlayerMatchState` | ✅ | The anchor |
| `doubleCallInStatus` | `'available' \| 'used' \| 'active'` | ✅ | Call-in state |
| `finalRoundStatus` | `'not-applicable' \| 'pending' \| 'solo' \| 'normal'` | ✅ | Final round state |
| `isCompact` | `boolean` | ❌ | Compact HUD mode |

**Visual States:**

| Status | Icon | Color | Animation |
|--------|------|-------|-----------|
| Double available | ⚓+ | Cyan | Subtle pulse |
| Double active | ⚓⚡ | Gold | Glow effect |
| Double used | ⚓✓ | Gray | None |
| Solo pending | ⚓? | Amber | Pulse |
| Solo active | ⚓🔥 | Orange | Fire animation |

**Compact View (in HUD):**

```
┌───────────────────┐
│ ⚓ Marcus         │
│ Call-In: ✓ Used  │
│ Solo: ○ Pending  │
└───────────────────┘
```

**Expanded View (during Anchor action):**

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  ⚓⚡ ANCHOR DOUBLE CALL-IN ACTIVE                         │
│                                                            │
│  Marcus is playing BOTH slots this round:                 │
│  − SUBTRACTION (assigned) + × MULTIPLICATION (call-in)   │
│                                                            │
│  YOU are sitting out this round                           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

### Phase 8: Post-Match (5 Components)

These components display after match completion for results, stats, and progression.

#### Component: `MatchResultsScreen`

**Purpose:** Main post-match screen showing victory/defeat and summary.

**Location:** `src/components/arena/match-results-screen.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `matchResult` | `TeamMatchResult` | ✅ | Full match results |
| `currentUserId` | `string` | ✅ | Current user ID |
| `onRematch` | `() => void` | ❌ | Request rematch callback |
| `onNewMatch` | `() => void` | ✅ | Find new match |
| `onLeave` | `() => void` | ✅ | Return to lobby |

**TeamMatchResult Type:**

```typescript
interface TeamMatchResult {
  matchId: string;
  result: 'victory' | 'defeat' | 'draw';
  finalScore: { team1: number; team2: number };
  eloChange: number;          // +15, -10, 0
  coinsEarned: number;
  xpEarned: number;
  
  team1: TeamMatchStats;
  team2: TeamMatchStats;
  
  roundBreakdown: RoundScoreSummary[];
  
  isBotMatch: boolean;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  isVoid: boolean;
  voidReason?: string;
  
  badgesEarned: Badge[];
  achievements: Achievement[];
}

interface TeamMatchStats {
  teamId?: string;
  teamName?: string;
  players: PlayerMatchStats[];
  totalScore: number;
  accuracy: number;
  avgSpeed: number;
  maxStreak: number;
}

interface PlayerMatchStats {
  userId: string;
  name: string;
  rank: string;
  division: string;
  equippedFrame: string;
  slot: Operation;
  score: number;
  accuracy: number;
  avgSpeed: number;
  maxStreak: number;
  contribution: number;
  wasIGL: boolean;
  wasAnchor: boolean;
  anchorActionsUsed: ('double-call-in' | 'final-solo')[];
}
```

**UI Mockup (Victory):**

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                          🏆 VICTORY                                        │
│                                                                            │
│                    9,840  vs  8,920                                        │
│                                                                            │
│                    +18 ELO  │  +250 🪙  │  +1,200 XP                       │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  YOUR PERFORMANCE                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Slot: × MULTIPLICATION                                              │ │
│  │  Score: 2,340 pts  │  Accuracy: 96%  │  Avg Speed: 1.1s              │ │
│  │  Max Streak: 12  │  Contribution: 24%                                │ │
│  │                                                                      │ │
│  │  🌟 Personal Best: Fastest × speed in team matches!                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  TEAM BREAKDOWN                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Player   │ Slot │ Score │ Acc  │ Speed │ Streak │ Contrib          │ │
│  │  ─────────┼──────┼───────┼──────┼───────┼────────┼─────────         │ │
│  │  Kira 👑  │ +    │ 2,520 │ 100% │ 0.8s  │ 15     │ 26%   MVP        │ │
│  │  Marcus⚓ │ −    │ 2,180 │ 94%  │ 1.2s  │ 10     │ 22%              │ │
│  │  YOU      │ ×    │ 2,340 │ 96%  │ 1.1s  │ 12     │ 24%   ⭐         │ │
│  │  Priya    │ ÷    │ 1,560 │ 85%  │ 1.5s  │ 6      │ 16%              │ │
│  │  Jax      │ ?    │ 1,240 │ 80%  │ 1.4s  │ 4      │ 12%              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  NEW BADGES EARNED                                                         │
│  🏅 Streak Keeper  │  ⚡ Speed Demon  │  🎯 Precision Player              │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   [REQUEST REMATCH]    [FIND NEW MATCH]    [RETURN TO LOBBY]              │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**UI Mockup (Defeat):**

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                          ❌ DEFEAT                                         │
│                                                                            │
│                    7,620  vs  8,420                                        │
│                                                                            │
│                    -12 ELO  │  +100 🪙  │  +600 XP                         │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ... (same structure as victory) ...                                      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**UI Mockup (Draw):**

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                          🤝 DRAW                                           │
│                                                                            │
│                    8,200  vs  8,200                                        │
│                                                                            │
│                    +0 ELO  │  +100 🪙  │  +800 XP                          │
│                                                                            │
│  All tiebreakers equal - extremely rare!                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `PlayerPerformanceCard`

**Purpose:** Individual player performance breakdown card.

**Location:** `src/components/arena/player-performance-card.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `player` | `PlayerMatchStats` | ✅ | Player stats |
| `isCurrentUser` | `boolean` | ❌ | Highlight as current user |
| `isMVP` | `boolean` | ❌ | Show MVP badge |
| `showDetails` | `boolean` | ❌ | Expanded view |
| `onViewProfile` | `(userId: string) => void` | ❌ | Profile callback |

**Compact View:**

```
┌─────────────────────────────────────────────────────────────┐
│ [Frame] Kira 👑     │ + ADD │ 2,520 │ 100% │ MVP 🌟         │
└─────────────────────────────────────────────────────────────┘
```

**Expanded View:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ┌──────────┐                                                           │
│  │ [Avatar] │  Kira                                                     │
│  │ [Frame]  │  👑 IGL this match                                        │
│  │          │  DIAMOND I • 850 ELO                                      │
│  └──────────┘                                                           │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  PERFORMANCE                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │  Slot: + ADDITION                                                  ││
│  │  Score: 2,520 pts                                                  ││
│  │  Accuracy: 100% (40/40 correct)                                    ││
│  │  Avg Speed: 0.8s                                                   ││
│  │  Max Streak: 15                                                    ││
│  │  Contribution: 26% of team score                                   ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ROUND BREAKDOWN                                                        │
│  R1: 630 │ R2: 620 │ R3: 640 │ R4: 630 │ R5: ... │ R8: ...             │
│                                                                         │
│                                            [VIEW PROFILE]               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `TeamBreakdownTable`

**Purpose:** Full team statistics table in post-match.

**Location:** `src/components/arena/team-breakdown-table.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `team` | `TeamMatchStats` | ✅ | Team stats |
| `isUserTeam` | `boolean` | ✅ | Highlight user's team |
| `mvpUserId` | `string` | ❌ | MVP player ID |
| `sortBy` | `'score' \| 'accuracy' \| 'speed' \| 'streak'` | ❌ | Sort column |
| `onSort` | `(column: string) => void` | ❌ | Sort callback |

**Table Columns:**

| Column | Width | Sortable |
|--------|-------|----------|
| Player (avatar + name + badges) | 200px | ❌ |
| Slot | 80px | ❌ |
| Score | 100px | ✅ |
| Accuracy | 80px | ✅ |
| Avg Speed | 100px | ✅ |
| Max Streak | 80px | ✅ |
| Contribution | 80px | ✅ |

---

#### Component: `RoundByRoundChart`

**Purpose:** Visual chart showing score progression across all 8 rounds.

**Location:** `src/components/arena/round-by-round-chart.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `rounds` | `RoundScoreSummary[]` | ✅ | All 8 rounds |
| `team1Color` | `string` | ❌ | Team 1 line color |
| `team2Color` | `string` | ❌ | Team 2 line color |
| `isUserTeam1` | `boolean` | ✅ | Highlight team 1 |
| `showDetails` | `boolean` | ❌ | Show per-round breakdown |

**Chart Types:**

1. **Cumulative Score Line Chart**
   - X-axis: Rounds 1-8
   - Y-axis: Cumulative score
   - Two lines, one per team

2. **Per-Round Bar Chart**
   - X-axis: Rounds 1-8
   - Y-axis: Round score
   - Side-by-side bars per round

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  SCORE PROGRESSION                                                     │
│                                                                        │
│  10000 ┤                                                    ┌──● You  │
│   8000 ┤                                         ┌──────────┘         │
│   6000 ┤                              ┌──────────┘    ┌──● Opp        │
│   4000 ┤                   ┌──────────┘               │               │
│   2000 ┤        ┌──────────┘                          │               │
│      0 ┼────────┴─────────────────────────────────────┴───────────    │
│        R1    R2    R3    R4  │  R5    R6    R7    R8                  │
│                        HALFTIME                                        │
│                                                                        │
│  Key Moments:                                                          │
│  • R2: You pulled ahead with 12-streak                                │
│  • R6: Opponent narrowed gap with Anchor Solo                         │
│  • R8: You sealed victory with 640-point round                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `IGLDecisionLog`

**Purpose:** Log of all IGL strategic decisions made during match.

**Location:** `src/components/arena/igl-decision-log.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `decisions` | `IGLDecision[]` | ✅ | All IGL decisions |
| `isCurrentUserIGL` | `boolean` | ✅ | Was current user IGL |

**IGLDecision Type:**

```typescript
interface IGLDecision {
  timestamp: number;          // Match timestamp (ms)
  phase: string;              // 'pre-match' | 'halftime' | 'break' | 'final-round'
  type: 'slot-assignment' | 'slot-swap' | 'timeout' | 'anchor-call-in' | 'anchor-solo';
  description: string;        // Human-readable description
  outcome?: 'positive' | 'neutral' | 'negative';  // Post-hoc analysis
  impactScore?: number;       // Points gained/lost from decision
}
```

**UI Mockup:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  👑 IGL DECISION LOG                                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PRE-MATCH                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ 🎯 Assigned Kira to + (her best op, 96% acc)        📈 Good    │  │
│  │ ⚓ Set Marcus as Anchor (clutch player)             📊 Neutral │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  HALFTIME (Leading by 340)                                            │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ 🔄 Swapped Priya (÷→?) and Jax (?→÷)               📈 +180 pts │  │
│  │    Priya's mixed acc higher than division                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  2ND HALF ROUND 1                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ ⚓ Used Double Call-In: Marcus → × slot            📈 +120 pts │  │
│  │    Marcus scored 280 in × (YOU sat out)                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  FINAL ROUND                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ 👥 Chose NORMAL RELAY (opponent chose SOLO)        📈 +80 pts  │  │
│  │    Team consistency beat opponent's anchor                      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ─────────────────────────────────────────────────────────────────────│
│  SUMMARY: 4 decisions │ 3 positive │ 1 neutral │ Net impact: +380 pts │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Shared/Utility Components (4 Components)

These components are used across multiple phases.

#### Component: `OperationIcon`

**Purpose:** Consistent icon display for math operations.

**Location:** `src/components/arena/operation-icon.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | `Operation` | ✅ | Which operation |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | ❌ | Icon size |
| `showLabel` | `boolean` | ❌ | Show operation name |
| `isActive` | `boolean` | ❌ | Highlight styling |
| `className` | `string` | ❌ | Additional CSS |

**Operation Styles:**

| Operation | Symbol | Color | Label |
|-----------|--------|-------|-------|
| Addition | + | Green (#10b981) | ADD |
| Subtraction | − | Blue (#3b82f6) | SUB |
| Multiplication | × | Purple (#8b5cf6) | MUL |
| Division | ÷ | Orange (#f97316) | DIV |
| Mixed | ? | Pink (#ec4899) | MIX |

**Size Reference:**

| Size | Icon | Font | With Label |
|------|------|------|------------|
| sm | 16px | 12px | 80px width |
| md | 24px | 14px | 100px width |
| lg | 32px | 16px | 120px width |
| xl | 48px | 20px | 160px width |

---

#### Component: `PlayerBanner` (Enhanced)

**Purpose:** Display player info with cosmetics, badges, and team role indicators.

**Location:** `src/components/arena/player-banner.tsx` (existing, enhanced)

**New Props (additions to existing):**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isIGL` | `boolean` | ❌ | Show IGL crown badge |
| `isAnchor` | `boolean` | ❌ | Show Anchor badge |
| `operation` | `Operation` | ❌ | Assigned operation |
| `teamRole` | `'leader' \| 'member'` | ❌ | Party role |
| `matchStats` | `PlayerMatchStats` | ❌ | In-match statistics |

**Enhanced Layout:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [👑]                                                                    │  <- IGL badge (top-left)
│  ┌───────────┐                                                          │
│  │ [Avatar]  │  PlayerName           [⚓A]                              │  <- Anchor badge
│  │ [Frame]   │  DIAMOND I • 850 ELO                                    │
│  │           │  [+ ADD] assigned                                        │  <- Operation badge
│  └───────────┘                                                          │
│                                                                         │
│  [Banner background with equipped cosmetic]                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

#### Component: `TeamScoreDisplay`

**Purpose:** Prominent team score display used in HUD and results.

**Location:** `src/components/arena/team-score-display.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `team1Score` | `number` | ✅ | Team 1 score |
| `team2Score` | `number` | ✅ | Team 2 score |
| `team1Name` | `string` | ❌ | Team 1 name |
| `team2Name` | `string` | ❌ | Team 2 name |
| `isUserTeam1` | `boolean` | ✅ | User on team 1 |
| `showDifference` | `boolean` | ❌ | Show score difference |
| `animate` | `boolean` | ❌ | Animate changes |
| `size` | `'sm' \| 'md' \| 'lg'` | ❌ | Display size |
| `layout` | `'horizontal' \| 'vertical'` | ❌ | Layout style |

**Horizontal Layout:**

```
┌──────────────────────────────────────────────────────┐
│   🔵 YOUR TEAM    2,450    vs    2,380    OPPONENT 🔴  │
│                         +70                            │
└──────────────────────────────────────────────────────┘
```

**Vertical Layout:**

```
┌───────────────────┐
│   YOUR TEAM 🔵    │
│      2,450        │
│                   │
│        VS         │
│                   │
│   OPPONENT 🔴     │
│      2,380        │
│                   │
│     +70 lead      │
└───────────────────┘
```

---

#### Component: `CountdownTimer`

**Purpose:** Reusable countdown timer with urgency styling.

**Location:** `src/components/arena/countdown-timer.tsx` (new)

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `seconds` | `number` | ✅ | Seconds remaining |
| `totalSeconds` | `number` | ❌ | Total for progress bar |
| `showProgress` | `boolean` | ❌ | Show progress bar |
| `urgentAt` | `number` | ❌ | Seconds to turn red |
| `warningAt` | `number` | ❌ | Seconds to turn amber |
| `size` | `'sm' \| 'md' \| 'lg'` | ❌ | Display size |
| `onComplete` | `() => void` | ❌ | Zero callback |
| `format` | `'mm:ss' \| 'ss' \| 'm:ss'` | ❌ | Time format |

**Urgency States:**

| Remaining | Color | Animation |
|-----------|-------|-----------|
| > warningAt | Green | None |
| warningAt - urgentAt | Amber | Gentle pulse |
| < urgentAt | Red | Fast pulse |
| 0 | Red | Flash |

---

### Socket Events for Teams (New)

Extend the presence Socket.io namespace with party and team role events.

#### Party Role Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `party:set_igl` | Client → Server | `{ partyId, userId }` | Set IGL for party |
| `party:set_anchor` | Client → Server | `{ partyId, userId }` | Set Anchor for party |
| `party:igl_changed` | Server → Client | `{ partyId, iglId }` | IGL changed notification |
| `party:anchor_changed` | Server → Client | `{ partyId, anchorId }` | Anchor changed notification |
| `party:ready_toggle` | Client → Server | `{ partyId, ready: boolean }` | Toggle ready state |
| `party:member_ready` | Server → Client | `{ partyId, userId, ready }` | Member ready update |
| `party:all_ready` | Server → Client | `{ partyId }` | All members ready |
| `party:set_target_mode` | Client → Server | `{ partyId, mode }` | Set target game mode |
| `party:mode_changed` | Server → Client | `{ partyId, mode }` | Mode changed notification |

#### Team Queue Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `team_queue:join` | Client → Server | `{ partyId, mode, operation }` | Join team queue |
| `team_queue:leave` | Client → Server | `{ partyId }` | Leave team queue |
| `team_queue:status` | Server → Client | `{ status, seeking, eta }` | Queue status update |
| `team_queue:player_found` | Server → Client | `{ player }` | New player joined team |
| `team_queue:team_formed` | Server → Client | `{ team }` | Full team assembled |
| `team_queue:match_found` | Server → Client | `{ matchId, teams }` | Match found |

#### Team Match Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `team_match:join` | Client → Server | `{ matchId, teamId, userId }` | Join team match |
| `team_match:state` | Server → Client | `{ matchState }` | Full match state sync |
| `team_match:round_start` | Server → Client | `{ round, half }` | Round begins |
| `team_match:handoff_warning` | Server → Client | `{ userId, secondsUntil }` | Turn approaching |
| `team_match:handoff_start` | Server → Client | `{ userId, question }` | Your turn starts |
| `team_match:submit_answer` | Client → Server | `{ answer, timeMs }` | Submit answer |
| `team_match:answer_result` | Server → Client | `{ correct, score, streak }` | Answer processed |
| `team_match:relay_progress` | Server → Client | `{ slots }` | Relay visualization |
| `team_match:round_end` | Server → Client | `{ round, scores }` | Round complete |
| `team_match:tactical_break` | Server → Client | `{ timeLeft }` | Break started |
| `team_match:halftime` | Server → Client | `{ stats, timeLeft }` | Halftime started |
| `team_match:match_end` | Server → Client | `{ result, analytics }` | Match complete |
| `team_match:disconnect` | Server → Client | `{ userId, slotSkipped }` | Player disconnected |

#### IGL Control Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `team_match:igl_assign` | Client → Server | `{ assignments }` | IGL assigns slots |
| `team_match:igl_timeout` | Client → Server | `{ matchId }` | IGL calls timeout |
| `team_match:timeout_called` | Server → Client | `{ teamId, timeLeft }` | Timeout active |
| `team_match:anchor_callin` | Client → Server | `{ round, slot }` | Activate double call-in |
| `team_match:anchor_solo` | Client → Server | `{ choice }` | Final round decision |
| `team_match:anchor_decision` | Server → Client | `{ teams }` | Both decisions revealed |

---

### Database Schema Extensions for Party Roles

Add to existing `parties` table:

```sql
-- Add role columns to parties table
ALTER TABLE parties ADD COLUMN igl_id TEXT REFERENCES users(id);
ALTER TABLE parties ADD COLUMN anchor_id TEXT REFERENCES users(id);
ALTER TABLE parties ADD COLUMN target_mode TEXT; -- '2v2', '3v3', '4v4', '5v5'
```

Add to existing `party_members` table:

```sql
-- Add ready state and role preferences to party_members
ALTER TABLE party_members ADD COLUMN is_ready INTEGER DEFAULT 0;
ALTER TABLE party_members ADD COLUMN igl_candidate INTEGER DEFAULT 0;
ALTER TABLE party_members ADD COLUMN anchor_candidate INTEGER DEFAULT 0;
ALTER TABLE party_members ADD COLUMN preferred_operation TEXT; -- 'addition', 'subtraction', etc.
```

#### New Table: `team_match_roles`

```sql
-- Track IGL decisions and role assignments per match
CREATE TABLE IF NOT EXISTS team_match_roles (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    igl_user_id TEXT NOT NULL,
    anchor_user_id TEXT NOT NULL,
    slot_assignments TEXT NOT NULL,  -- JSON: {"userId": "operation", ...}
    decisions TEXT,                  -- JSON: IGLDecision[]
    FOREIGN KEY (match_id) REFERENCES team_matches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_match_roles_match ON team_match_roles(match_id);
```

---

### Component Summary (42 Total)

| Phase | Components | Count |
|-------|------------|-------|
| Phase 0: Mode Selection | TeamModeCard, PartyStatusBadge, TeamModeEntryModal | 3 |
| Phase 1: Party Extensions | IGLBadge, AnchorBadge, ReadyCheckToggle, PartyQueueButton | 4 |
| Phase 2: IGL/Anchor Selection | IGLSelectionModal, PlayerSelectionCard, RoleVotePanel | 3 |
| Phase 3: Queue | TeamQueueStatus, TeamFormationProgress, QueuePlayerCard | 3 |
| Phase 4: Pre-Match Strategy | ScoutingDashboard, SlotAssignmentPanel, StrategyTimer, TeamReadyOverlay | 4 |
| Phase 5: Active Match | TeamMatchHUD, RelayProgressBar, PlayerSlotCard, QuestionDisplay, AnswerInput, StreakIndicator, HandoffCountdown, ScoreComparison | 8 |
| Phase 6: Round Transitions | TacticalBreakOverlay, HalftimePanel, IGLControlBar, RoundSummaryCard | 4 |
| Phase 7: Anchor Mechanics | DoubleCallInModal, AnchorSoloDecision, RevealTypeSelector, AnchorIndicator | 4 |
| Phase 8: Post-Match | MatchResultsScreen, PlayerPerformanceCard, TeamBreakdownTable, RoundByRoundChart, IGLDecisionLog | 5 |
| Shared/Utility | OperationIcon, PlayerBanner (enhanced), TeamScoreDisplay, CountdownTimer | 4 |
| **TOTAL** | | **42** |

---

### File Structure for New Components

```
src/components/arena/
├── teams/
│   ├── mode-selection/
│   │   ├── team-mode-card.tsx
│   │   ├── party-status-badge.tsx
│   │   └── team-mode-entry-modal.tsx
│   ├── party/
│   │   ├── igl-badge.tsx
│   │   ├── anchor-badge.tsx
│   │   ├── ready-check-toggle.tsx
│   │   └── party-queue-button.tsx
│   ├── selection/
│   │   ├── igl-selection-modal.tsx
│   │   ├── player-selection-card.tsx
│   │   └── role-vote-panel.tsx
│   ├── queue/
│   │   ├── team-queue-status.tsx
│   │   ├── team-formation-progress.tsx
│   │   └── queue-player-card.tsx
│   ├── strategy/
│   │   ├── scouting-dashboard.tsx
│   │   ├── slot-assignment-panel.tsx
│   │   ├── strategy-timer.tsx
│   │   └── team-ready-overlay.tsx
│   ├── match/
│   │   ├── team-match-hud.tsx
│   │   ├── relay-progress-bar.tsx
│   │   ├── player-slot-card.tsx
│   │   ├── question-display.tsx
│   │   ├── answer-input.tsx
│   │   ├── streak-indicator.tsx
│   │   ├── handoff-countdown.tsx
│   │   └── score-comparison.tsx
│   ├── transitions/
│   │   ├── tactical-break-overlay.tsx
│   │   ├── halftime-panel.tsx
│   │   ├── igl-control-bar.tsx
│   │   └── round-summary-card.tsx
│   ├── anchor/
│   │   ├── double-call-in-modal.tsx
│   │   ├── anchor-solo-decision.tsx
│   │   ├── reveal-type-selector.tsx
│   │   └── anchor-indicator.tsx
│   └── results/
│       ├── match-results-screen.tsx
│       ├── player-performance-card.tsx
│       ├── team-breakdown-table.tsx
│       ├── round-by-round-chart.tsx
│       └── igl-decision-log.tsx
├── shared/
│   ├── operation-icon.tsx
│   ├── player-banner.tsx (enhanced)
│   ├── team-score-display.tsx
│   └── countdown-timer.tsx
└── index.ts (exports)
```

