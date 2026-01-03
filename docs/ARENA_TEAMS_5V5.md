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

