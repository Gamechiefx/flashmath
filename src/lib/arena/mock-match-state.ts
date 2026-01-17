/**
 * Mock Match State Generator
 * Provides a simulated match state for the Component Playground and Demo Mode.
 * 
 * Each team progresses through slots INDEPENDENTLY - like a real relay race.
 * Team 1 might be on slot 3 while Team 2 is still on slot 2.
 * 
 * Match Structure:
 * - 2 halves per match
 * - 4 rounds per half
 * - 5 slots per round (one per player)
 */

export type MatchPhase = 
  | 'pre_match' 
  | 'strategy' 
  | 'round_countdown'  // 3-2-1-GO before active phase starts
  | 'active' 
  | 'break' 
  | 'halftime' 
  | 'anchor_decision' 
  | 'post_match';

export type HandoffState = {
  isActive: boolean;
  outgoingPlayerId: string | null;
  incomingPlayerId: string | null;
  slotNumber: number;
};

interface MockPlayerState {
  odUserId: string;
  odName: string;
  odLevel: number;
  odEquippedFrame: string | null;
  odEquippedBanner: string | null;
  odEquippedTitle: string | null;
  slot: string;
  score: number;
  correct: number;
  total: number;
  streak: number;
  maxStreak: number;
  isActive: boolean;
  isComplete: boolean;
  isIgl: boolean;
  isAnchor: boolean;
  currentQuestion: { question: string; operation: string; } | null;
}

interface MockTeamState {
  teamId: string;
  teamName: string;
  teamTag: string | null;
  leaderId: string;
  score: number;
  currentStreak: number;
  isHome: boolean;
  timeoutsUsed: number;
  slotAssignments: Record<string, string>;
  players: Record<string, MockPlayerState>;
  currentSlot: number;        // INDEPENDENT per team (1-5)
  questionsInSlot: number;    // Questions answered in current slot
  roundsCompleted: number;    // Rounds finished in current half (0-4)
}

export interface MockMatchState {
  matchId: string;
  phase: MatchPhase;
  round: number;      // For display (max of both teams' progress)
  half: number;       // 1 or 2
  gameClockMs: number;
  relayClockMs: number;
  currentSlot: number; // For display (not used for logic)
  questionsInSlot: number;
  team1: MockTeamState;
  team2: MockTeamState;
  isMyTeam: string;
  handoff?: HandoffState; // For relay handoff animations
}

export interface MockStrategyPhase {
  durationMs: number;
  remainingMs: number;
  mySlots: Record<string, { slot: number; name: string; level: number; isIgl: boolean; isAnchor: boolean; banner: string; frame: string; title: string }>;
  opponentSlots: Record<string, { slot: number; name: string; level: number; isIgl: boolean; isAnchor: boolean; banner: string; frame: string; title: string }>;
  myTeamReady: boolean;
  opponentTeamReady: boolean;
}

const DEMO_NAMES_TEAM1 = ['MathWizard42', 'NumberNinja', 'CalcMaster', 'AlgebraAce', 'GeometryGuru'];
const DEMO_NAMES_TEAM2 = ['QuickCalc99', 'MathStar', 'NumericNova', 'PrimeHunter', 'DivisionKing'];

const DEMO_QUESTIONS = [
  { question: '47 × 23', operation: 'multiplication' },
  { question: '156 ÷ 12', operation: 'division' },
  { question: '89 + 247', operation: 'addition' },
  { question: '523 - 189', operation: 'subtraction' },
  { question: '15² + 7', operation: 'exponent' },
  { question: '√144 × 3', operation: 'root' },
];

const SLOT_LABELS = ['Addition', 'Subtraction', 'Multiplication', 'Division', 'Mixed'];
const ROUNDS_PER_HALF = 4;
const SLOTS_PER_ROUND = 5;

function generateMockPlayers(
  names: string[], 
  teamId: string, 
  isHome: boolean,
  currentSlot: number,
  phase: MatchPhase
): Record<string, MockPlayerState> {
  const players: Record<string, MockPlayerState> = {};
  
  names.forEach((name, index) => {
    const odUserId = teamId + '-player-' + (index + 1);
    const slot = SLOT_LABELS[index];
    const slotNum = index + 1;
    const isActive = phase === 'active' && slotNum === currentSlot;
    const isComplete = (phase === 'active' || phase === 'break' || phase === 'halftime' || phase === 'post_match') && slotNum < currentSlot;
    
    players[odUserId] = {
      odUserId,
      odName: name,
      odLevel: Math.floor(Math.random() * 50) + 10,
      odEquippedFrame: index === 0 ? 'gold_frame' : null,
      odEquippedBanner: index === 0 ? 'champion_banner' : null,
      odEquippedTitle: index === 0 ? 'Math Champion' : null,
      slot,
      score: isComplete ? Math.floor(Math.random() * 400) + 150 : (isActive ? Math.floor(Math.random() * 200) + 50 : 0),
      correct: isComplete ? Math.floor(Math.random() * 4) + 2 : (isActive ? Math.floor(Math.random() * 2) + 1 : 0),
      total: isComplete ? 5 : (isActive ? Math.floor(Math.random() * 3) + 1 : 0),
      streak: isActive ? Math.floor(Math.random() * 3) + 1 : 0,
      maxStreak: isComplete ? Math.floor(Math.random() * 4) + 2 : 0,
      isActive,
      isComplete,
      isIgl: index === 0,
      isAnchor: index === 4,
      currentQuestion: isActive ? DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)] : null,
    };
  });
  
  return players;
}

export class MockMatchSimulator {
  private state: MockMatchState;
  private phaseStartTime: number = 0;
  
  private readonly PHASE_DURATIONS: Record<MatchPhase, number> = {
    pre_match: 15000,      // 15s - "VS" countdown screen
    strategy: 30000,       // 30s - IGL assigns slots
    round_countdown: 6000, // 6s - 5-4-3-2-1-GO before active
    active: 8000,          // 8s per slot (unchanged)
    break: 20000,          // 20s - between rounds
    halftime: 30000,       // 30s - halftime panel
    anchor_decision: 20000, // 20s - anchor special ability
    post_match: 999999,
  };
  
  constructor() {
    this.state = this.generateInitialState();
    this.phaseStartTime = Date.now();
  }
  
  private generateInitialState(): MockMatchState {
    const matchId = 'demo-match-' + Date.now();
    const team1Id = 'team-alpha';
    const team2Id = 'team-beta';
    const phase: MatchPhase = 'pre_match';
    
    return {
      matchId,
      phase,
      round: 1,
      half: 1,
      gameClockMs: 0,
      relayClockMs: this.PHASE_DURATIONS.pre_match,
      currentSlot: 1,
      questionsInSlot: 0,
      team1: {
        teamId: team1Id,
        teamName: 'Alpha Squad',
        teamTag: 'ALPHA',
        leaderId: team1Id + '-player-1',
        score: 0,
        currentStreak: 0,
        isHome: true,
        timeoutsUsed: 0,
        slotAssignments: { 
          'Addition': team1Id + '-player-1', 
          'Subtraction': team1Id + '-player-2', 
          'Multiplication': team1Id + '-player-3', 
          'Division': team1Id + '-player-4', 
          'Mixed': team1Id + '-player-5' 
        },
        players: generateMockPlayers(DEMO_NAMES_TEAM1, team1Id, true, 1, phase),
        currentSlot: 1,
        questionsInSlot: 0,
        roundsCompleted: 0,
      },
      team2: {
        teamId: team2Id,
        teamName: 'Beta Force',
        teamTag: 'BETA',
        leaderId: team2Id + '-player-1',
        score: 0,
        currentStreak: 0,
        isHome: false,
        timeoutsUsed: 0,
        slotAssignments: { 
          'Addition': team2Id + '-player-1', 
          'Subtraction': team2Id + '-player-2', 
          'Multiplication': team2Id + '-player-3', 
          'Division': team2Id + '-player-4', 
          'Mixed': team2Id + '-player-5' 
        },
        players: generateMockPlayers(DEMO_NAMES_TEAM2, team2Id, false, 1, phase),
        currentSlot: 1,
        questionsInSlot: 0,
        roundsCompleted: 0,
      },
      isMyTeam: team1Id,
    };
  }
  
  getState(): MockMatchState {
    return JSON.parse(JSON.stringify(this.state));
  }
  
  getStrategyPhase(): MockStrategyPhase | null {
    if (this.state.phase !== 'strategy') return null;
    
    const buildSlots = (team: MockTeamState) => {
      const slots: MockStrategyPhase['mySlots'] = {};
      SLOT_LABELS.forEach((label, idx) => {
        const playerId = team.slotAssignments[label];
        const player = team.players[playerId];
        if (player) {
          slots[label] = {
            slot: idx + 1,
            name: player.odName,
            level: player.odLevel,
            isIgl: player.isIgl,
            isAnchor: player.isAnchor,
            banner: player.odEquippedBanner || 'default',
            frame: player.odEquippedFrame || 'default',
            title: player.odEquippedTitle || 'Player',
          };
        }
      });
      return slots;
    };
    
    return {
      durationMs: this.PHASE_DURATIONS.strategy,
      remainingMs: this.state.relayClockMs,
      mySlots: buildSlots(this.state.team1),
      opponentSlots: buildSlots(this.state.team2),
      myTeamReady: false,
      opponentTeamReady: false,
    };
  }
  
  advanceTime(ms: number): void {
    if (this.state.phase === 'post_match') return;
    
    this.state.gameClockMs += ms;
    this.state.relayClockMs = Math.max(0, this.state.relayClockMs - ms);
    
    // During active phase, simulate independent team progress
    if (this.state.phase === 'active') {
      // Team 1 answers (60% chance per tick)
      if (Math.random() > 0.4) {
        this.simulateTeamAnswer(this.state.team1);
      }
      // Team 2 answers (slightly slower - 50% chance per tick)
      if (Math.random() > 0.5) {
        this.simulateTeamAnswer(this.state.team2);
      }
      
      // Check if both teams finished the round
      this.checkRoundCompletion();
    }
    
    // Handle non-active phase transitions
    if (this.state.relayClockMs <= 0 && this.state.phase !== 'active') {
      this.transitionToNextPhase();
    }
  }
  
  private simulateTeamAnswer(team: MockTeamState): void {
    if (team.currentSlot > SLOTS_PER_ROUND) return; // Round complete
    
    const activePlayer = Object.values(team.players).find(p => p.isActive);
    if (!activePlayer) return;
    
    const correct = Math.random() > 0.25;
    const points = correct ? Math.floor(Math.random() * 120) + 30 : 0;
    
    if (correct) {
      team.score += points;
      team.currentStreak++;
      activePlayer.score += points;
      activePlayer.correct++;
      activePlayer.streak++;
    } else {
      team.currentStreak = 0;
      activePlayer.streak = 0;
    }
    activePlayer.total++;
    team.questionsInSlot++;
    
    // After 5 questions, advance to next slot
    if (team.questionsInSlot >= 5) {
      this.advanceTeamSlot(team);
    } else {
      // New question
      activePlayer.currentQuestion = DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
    }
  }
  
  private advanceTeamSlot(team: MockTeamState): void {
    // Get ordered slot assignments for consistent progression
    const orderedSlots = this.getOrderedSlotAssignments(team);
    const currentSlotLabel = orderedSlots[team.currentSlot - 1];
    
    if (!currentSlotLabel) {
      console.error(`[MockMatch] Cannot advance - no slot found for slot ${team.currentSlot}`);
      return;
    }
    
    // Mark current player as complete
    Object.values(team.players).forEach(p => {
      if (p.slot === currentSlotLabel) {
        p.isActive = false;
        p.isComplete = true;
        p.currentQuestion = null;
      }
    });
    
    team.currentSlot++;
    team.questionsInSlot = 0;
    
    // If team finished all 5 slots, they wait for the other team
    if (team.currentSlot <= SLOTS_PER_ROUND) {
      // Activate next player
      const nextSlotLabel = orderedSlots[team.currentSlot - 1];
      if (nextSlotLabel) {
        Object.values(team.players).forEach(p => {
          if (p.slot === nextSlotLabel) {
            p.isActive = true;
            p.currentQuestion = DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
          }
        });
      }
    }
    
    // Update display currentSlot to show the faster team
    this.state.currentSlot = Math.max(this.state.team1.currentSlot, this.state.team2.currentSlot);
  }
  
  private checkRoundCompletion(): void {
    // Both teams must finish all 5 slots to end the round
    const team1Done = this.state.team1.currentSlot > SLOTS_PER_ROUND;
    const team2Done = this.state.team2.currentSlot > SLOTS_PER_ROUND;
    
    if (team1Done && team2Done) {
      // Round complete!
      this.state.team1.roundsCompleted++;
      this.state.team2.roundsCompleted++;
      this.state.round = Math.max(this.state.team1.roundsCompleted, this.state.team2.roundsCompleted) + 1;
      
      if (this.state.team1.roundsCompleted >= ROUNDS_PER_HALF) {
        if (this.state.half === 1) {
          this.skipToPhase('halftime');
        } else {
          this.skipToPhase('anchor_decision');
        }
      } else {
        // Brief break between rounds
        this.skipToPhase('break');
      }
    }
  }
  
  private transitionToNextPhase(): void {
    switch (this.state.phase) {
      case 'pre_match':
        this.skipToPhase('strategy');
        break;
      case 'strategy':
        // Go to round countdown before active
        this.skipToPhase('round_countdown');
        break;
      case 'round_countdown':
        // Now start active phase
        this.skipToPhase('active');
        break;
      case 'break':
        // Reset both teams to slot 1 for next round
        this.resetTeamForNewRound(this.state.team1);
        this.resetTeamForNewRound(this.state.team2);
        this.state.currentSlot = 1;
        // Go through round countdown before active
        this.skipToPhase('round_countdown');
        break;
      case 'halftime':
        this.state.half = 2;
        this.state.team1.roundsCompleted = 0;
        this.state.team2.roundsCompleted = 0;
        this.resetTeamForNewRound(this.state.team1);
        this.resetTeamForNewRound(this.state.team2);
        this.state.currentSlot = 1;
        this.state.round = 1;
        // Go through round countdown before active
        this.skipToPhase('round_countdown');
        break;
      case 'anchor_decision':
        this.skipToPhase('post_match');
        break;
    }
  }
  
  private resetTeamForNewRound(team: MockTeamState): void {
    team.currentSlot = 1;
    team.questionsInSlot = 0;
    Object.values(team.players).forEach((p, idx) => {
      p.isActive = idx === 0;
      p.isComplete = false;
      p.streak = 0;
      p.currentQuestion = idx === 0 ? DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)] : null;
    });
  }
  
  skipToPhase(phase: MatchPhase): void {
    this.state.phase = phase;
    this.phaseStartTime = Date.now();
    
    switch (phase) {
      case 'pre_match':
        this.state.round = 1;
        this.state.half = 1;
        this.state.currentSlot = 1;
        this.state.gameClockMs = 0;
        this.state.relayClockMs = this.PHASE_DURATIONS.pre_match;
        this.state.team1.score = 0;
        this.state.team2.score = 0;
        break;
      case 'strategy':
        this.state.relayClockMs = this.PHASE_DURATIONS.strategy;
        break;
      case 'round_countdown':
        this.state.relayClockMs = this.PHASE_DURATIONS.round_countdown;
        break;
      case 'active':
        // No timer for active - it ends when both teams finish
        this.state.relayClockMs = 999999;
        this.updateAllPlayerStates();
        break;
      case 'break':
        this.state.relayClockMs = this.PHASE_DURATIONS.break;
        break;
      case 'halftime':
        this.state.relayClockMs = this.PHASE_DURATIONS.halftime;
        break;
      case 'anchor_decision':
        this.state.relayClockMs = this.PHASE_DURATIONS.anchor_decision;
        break;
      case 'post_match':
        this.state.relayClockMs = 0;
        Object.values(this.state.team1.players).forEach(p => {
          p.isActive = false;
          p.isComplete = true;
          p.currentQuestion = null;
        });
        Object.values(this.state.team2.players).forEach(p => {
          p.isActive = false;
          p.isComplete = true;
          p.currentQuestion = null;
        });
        break;
    }
  }
  
  private updateAllPlayerStates(): void {
    this.updateTeamPlayerStates(this.state.team1);
    this.updateTeamPlayerStates(this.state.team2);
  }
  
  private updateTeamPlayerStates(team: MockTeamState): void {
    if (team.currentSlot > SLOTS_PER_ROUND) return;
    
    // Use consistent slot ordering - get the ordered list of slot assignments
    const orderedSlots = this.getOrderedSlotAssignments(team);
    const currentSlotLabel = orderedSlots[team.currentSlot - 1];
    
    if (!currentSlotLabel) {
      console.error(`[MockMatch] No slot found for slot ${team.currentSlot}. Available slots:`, orderedSlots);
      return;
    }
    
    Object.values(team.players).forEach(player => {
      const playerSlotIndex = orderedSlots.indexOf(player.slot);
      const playerSlotNum = playerSlotIndex + 1;
      
      player.isActive = this.state.phase === 'active' && player.slot === currentSlotLabel;
      player.isComplete = playerSlotNum < team.currentSlot && playerSlotNum > 0;
      
      if (player.isActive && !player.currentQuestion) {
        player.currentQuestion = DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
      } else if (!player.isActive) {
        player.currentQuestion = null;
      }
    });
  }
  
  private getOrderedSlotAssignments(team: MockTeamState): string[] {
    // Use the predefined SLOT_LABELS order, but only include slots that have assignments
    const orderedSlots: string[] = [];
    
    for (const label of SLOT_LABELS) {
      if (Object.values(team.slotAssignments).includes(team.slotAssignments[label])) {
        orderedSlots.push(label);
      }
    }
    
    // Fallback: if no slots match SLOT_LABELS, use whatever assignments exist
    if (orderedSlots.length === 0) {
      orderedSlots.push(...Object.keys(team.slotAssignments));
    }
    
    return orderedSlots;
  }
  
  submitAnswer(_answer: string): { correct: boolean; points: number; newStreak: number } {
    const correct = Math.random() > 0.25;
    const points = correct ? Math.floor(Math.random() * 120) + 40 : 0;
    
    const activePlayer = Object.values(this.state.team1.players).find(p => p.isActive);
    if (activePlayer) {
      if (correct) {
        this.state.team1.score += points;
        this.state.team1.currentStreak++;
        activePlayer.score += points;
        activePlayer.correct++;
        activePlayer.streak++;
      } else {
        this.state.team1.currentStreak = 0;
        activePlayer.streak = 0;
      }
      activePlayer.total++;
      this.state.team1.questionsInSlot++;
      
      if (this.state.team1.questionsInSlot >= 5) {
        this.advanceTeamSlot(this.state.team1);
        this.checkRoundCompletion();
      } else {
        activePlayer.currentQuestion = DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)];
      }
    }
    
    return { correct, points, newStreak: this.state.team1.currentStreak };
  }
  
  callTimeout(): boolean {
    if (this.state.team1.timeoutsUsed < 2) {
      this.state.team1.timeoutsUsed++;
      this.skipToPhase('break');
      return true;
    }
    return false;
  }
}
