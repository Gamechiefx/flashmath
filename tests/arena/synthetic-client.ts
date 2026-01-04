/**
 * Synthetic Test Client for FlashMath Arena
 * 
 * Headless client that simulates player behavior for automated testing.
 * Can be run without a browser/GUI using Node.js and Socket.io-client.
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

// Types
export interface PlayerConfig {
    userId: string;
    userName: string;
    sessionToken?: string;
    isIGL?: boolean;
    isAnchor?: boolean;
}

export interface MatchState {
    matchId: string;
    phase: string;
    round: number;
    half: number;
    gameClockMs: number;
    team1: TeamState;
    team2: TeamState;
    isMyTeam: string;
    currentSlot?: number;
    questionsInSlot?: number;
}

export interface TeamState {
    teamId: string;
    teamName: string;
    score: number;
    currentSlot: number;
    questionsInSlot: number;
    players: Record<string, PlayerState>;
    slotAssignments: Record<string, string>;
}

export interface PlayerState {
    odUserId: string;
    odName: string;
    isActive: boolean;
    isComplete: boolean;
    score: number;
    streak: number;
    currentQuestion?: {
        question: string;
        operation: string;
    };
}

export interface Question {
    questionId: string;
    questionText: string;
    operation: string;
    activePlayerId: string;
    slotNumber: number;
    questionInSlot: number;
}

export interface AnswerResult {
    userId: string;
    isCorrect: boolean;
    pointsEarned: number;
    newStreak: number;
    newTeamScore: number;
    questionsInSlot: number;
}

export interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
    details?: any;
}

/**
 * Synthetic player client for testing
 */
export class SyntheticPlayer extends EventEmitter {
    private socket: Socket | null = null;
    public readonly config: PlayerConfig;
    private serverUrl: string;
    
    public matchState: MatchState | null = null;
    public currentQuestion: Question | null = null;
    public connected: boolean = false;
    public matchId: string | null = null;
    public teamId: string | null = null;
    
    // Tracking for assertions
    public receivedEvents: { event: string; data: any; timestamp: number }[] = [];
    public answersSubmitted: number = 0;
    public questionsReceived: number = 0;
    
    constructor(config: PlayerConfig, serverUrl: string = 'http://localhost:3000') {
        super();
        this.config = config;
        this.serverUrl = serverUrl;
    }
    
    /**
     * Connect to the arena Socket.io namespace
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 10000);
            
            this.socket = io(`${this.serverUrl}/arena/teams`, {
                path: '/api/socket/arena',
                transports: ['websocket', 'polling'],
                auth: {
                    userId: this.config.userId,
                    sessionToken: this.config.sessionToken,
                },
            });
            
            this.socket.on('connect', () => {
                clearTimeout(timeout);
                this.connected = true;
                console.log(`[SyntheticPlayer:${this.config.userName}] Connected`);
                resolve();
            });
            
            this.socket.on('connect_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            
            this.setupEventListeners();
        });
    }
    
    /**
     * Setup all event listeners
     */
    private setupEventListeners(): void {
        if (!this.socket) return;
        
        // Track all events for assertions
        const trackEvent = (event: string, data: any) => {
            this.receivedEvents.push({ event, data, timestamp: Date.now() });
            this.emit(event, data);
        };
        
        this.socket.on('match_state', (state: MatchState) => {
            this.matchState = state;
            this.teamId = state.isMyTeam;
            trackEvent('match_state', state);
        });
        
        this.socket.on('match_start', (data: any) => {
            if (this.matchState) {
                this.matchState.phase = 'active';
                this.matchState.round = 1;
                
                // Update active player based on match_start data
                if (data.team1ActivePlayerId && this.matchState.team1?.players) {
                    for (const playerId of Object.keys(this.matchState.team1.players)) {
                        (this.matchState.team1.players as any)[playerId].isActive = 
                            playerId === data.team1ActivePlayerId;
                    }
                }
                if (data.team2ActivePlayerId && this.matchState.team2?.players) {
                    for (const playerId of Object.keys(this.matchState.team2.players)) {
                        (this.matchState.team2.players as any)[playerId].isActive = 
                            playerId === data.team2ActivePlayerId;
                    }
                }
            }
            trackEvent('match_start', data);
        });
        
        this.socket.on('question_update', (question: Question) => {
            this.currentQuestion = question;
            this.questionsReceived++;
            trackEvent('question_update', question);
        });
        
        this.socket.on('answer_result', (result: AnswerResult) => {
            trackEvent('answer_result', result);
        });
        
        this.socket.on('round_start', (data) => {
            if (this.matchState) {
                this.matchState.round = data.round;
                this.matchState.phase = 'active';
            }
            trackEvent('round_start', data);
        });
        
        this.socket.on('round_break', (data) => {
            if (this.matchState) {
                this.matchState.phase = 'break';
            }
            trackEvent('round_break', data);
        });
        
        this.socket.on('halftime', (data) => {
            if (this.matchState) {
                this.matchState.phase = 'halftime';
            }
            trackEvent('halftime', data);
        });
        
        this.socket.on('slot_change', (data) => {
            trackEvent('slot_change', data);
        });
        
        this.socket.on('strategy_phase_start', (data) => {
            if (this.matchState) {
                this.matchState.phase = 'strategy';
            }
            trackEvent('strategy_phase_start', data);
        });
        
        this.socket.on('timeout_called', (data) => {
            trackEvent('timeout_called', data);
        });
        
        this.socket.on('double_callin_activated', (data) => {
            trackEvent('double_callin_activated', data);
        });
        
        this.socket.on('quit_vote_started', (data) => {
            trackEvent('quit_vote_started', data);
        });
        
        this.socket.on('quit_vote_result', (data) => {
            trackEvent('quit_vote_result', data);
        });
        
        this.socket.on('team_forfeit', (data) => {
            trackEvent('team_forfeit', data);
        });
        
        this.socket.on('match_end', (data) => {
            if (this.matchState) {
                this.matchState.phase = 'post_match';
            }
            trackEvent('match_end', data);
        });
        
        this.socket.on('error', (error) => {
            console.error(`[SyntheticPlayer:${this.config.userName}] Error:`, error);
            // Don't emit if there are no error listeners (prevents unhandled error crash)
            if (this.listenerCount('error') > 0) {
                this.emit('server_error', error);
            }
        });
        
        this.socket.on('disconnect', () => {
            this.connected = false;
            trackEvent('disconnect', {});
        });
    }
    
    /**
     * Join a match
     */
    async joinMatch(matchId: string): Promise<MatchState> {
        if (!this.socket) throw new Error('Not connected');
        
        this.matchId = matchId;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Join match timeout'));
            }, 10000);
            
            // Server expects 'userId', not 'odUserId'
            this.socket!.emit('join_team_match', {
                matchId,
                userId: this.config.userId,
            });
            
            this.once('match_state', (state: MatchState) => {
                clearTimeout(timeout);
                resolve(state);
            });
        });
    }
    
    /**
     * Submit an answer
     */
    async submitAnswer(answer: string | number): Promise<AnswerResult> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Submit answer timeout'));
            }, 5000);
            
            this.socket!.emit('submit_answer', {
                matchId: this.matchId,
                userId: this.config.userId,
                answer: String(answer),
            });
            
            this.answersSubmitted++;
            
            this.once('answer_result', (result: AnswerResult) => {
                if (result.userId === this.config.userId) {
                    clearTimeout(timeout);
                    resolve(result);
                }
            });
        });
    }
    
    /**
     * Wait for a specific event
     */
    async waitForEvent<T = any>(eventName: string, timeoutMs: number = 30000): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${eventName}`));
            }, timeoutMs);
            
            this.once(eventName, (data: T) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });
    }
    
    /**
     * Wait for match phase
     */
    async waitForPhase(phase: string, timeoutMs: number = 60000): Promise<void> {
        if (this.matchState?.phase === phase) return;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for phase: ${phase}. Current: ${this.matchState?.phase}`));
            }, timeoutMs);
            
            const checkPhase = () => {
                if (this.matchState?.phase === phase) {
                    clearTimeout(timeout);
                    resolve();
                }
            };
            
            this.on('match_state', checkPhase);
            this.on('match_start', checkPhase);
            this.on('round_start', checkPhase);
            this.on('round_break', checkPhase);
            this.on('halftime', checkPhase);
            this.on('strategy_phase_start', checkPhase);
        });
    }
    
    /**
     * IGL: Assign slots
     */
    async assignSlots(assignments: Record<string, string>): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        for (const [slot, assignedUserId] of Object.entries(assignments)) {
            this.socket.emit('update_slot_assignment', {
                matchId: this.matchId,
                userId: this.config.userId, // Server expects 'userId', not 'odUserId'
                slot,
                assignedUserId,
            });
        }
    }
    
    /**
     * IGL: Confirm slots and ready up
     */
    async confirmSlots(): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        this.socket.emit('confirm_slots', {
            matchId: this.matchId,
            userId: this.config.userId, // Server expects 'userId', not 'odUserId'
        });
    }
    
    /**
     * IGL: Call timeout
     */
    async callTimeout(): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Call timeout timed out'));
            }, 5000);
            
            this.socket!.emit('igl_timeout', {
                matchId: this.matchId,
                userId: this.config.userId,
            });
            
            this.once('timeout_called', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    
    /**
     * IGL: Activate Double Call-In
     */
    async activateDoubleCallin(targetSlot: number): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Double Call-In activation timed out'));
            }, 5000);
            
            this.socket!.emit('anchor_callin', {
                matchId: this.matchId,
                userId: this.config.userId,
                targetSlot,
                half: this.matchState?.half || 1,
            });
            
            this.once('double_callin_activated', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
    
    /**
     * Initiate quit vote (leader only)
     */
    async initiateQuitVote(): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        this.socket.emit('initiate_quit_vote', {
            matchId: this.matchId,
        });
    }
    
    /**
     * Cast quit vote
     */
    async castQuitVote(vote: 'yes' | 'no'): Promise<void> {
        if (!this.socket || !this.matchId) throw new Error('Not in a match');
        
        this.socket.emit('cast_quit_vote', {
            matchId: this.matchId,
            vote,
        });
    }
    
    /**
     * Check if player received a specific event
     */
    hasReceivedEvent(eventName: string): boolean {
        return this.receivedEvents.some(e => e.event === eventName);
    }
    
    /**
     * Get last received event of a type
     */
    getLastEvent<T = any>(eventName: string): T | null {
        const events = this.receivedEvents.filter(e => e.event === eventName);
        return events.length > 0 ? events[events.length - 1].data : null;
    }
    
    /**
     * Clear event history
     */
    clearEventHistory(): void {
        this.receivedEvents = [];
    }
    
    /**
     * Create an AI match (for testing) and join it
     */
    async createAIMatch(matchId: string, teamPlayers: { odUserId: string; odName: string; isIGL?: boolean; isAnchor?: boolean }[], difficulty: string = 'easy'): Promise<void> {
        if (!this.socket) throw new Error('Not connected');
        
        const teamId = `team-${Date.now()}`;
        const partyId = `party-${Date.now()}`;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Create AI match timeout'));
            }, 10000);
            
            // Build team structure that matches server expectations
            const humanTeam = {
                odTeamId: teamId,
                odPartyId: partyId,
                odTeamName: 'Test Team',
                odTeamTag: 'TEST',
                odLeaderId: teamPlayers[0]?.odUserId,
                odIglId: teamPlayers.find(p => p.isIGL)?.odUserId || teamPlayers[0]?.odUserId,
                odAnchorId: teamPlayers.find(p => p.isAnchor)?.odUserId || teamPlayers[1]?.odUserId,
                // Server expects odMembers array with odUserName (not odName)
                odMembers: teamPlayers.map((p, i) => ({
                    odUserId: p.odUserId,
                    odUserName: p.odName,
                    odLevel: 1,
                    odIsIgl: p.isIGL ?? i === 0,
                    odIsAnchor: p.isAnchor ?? i === 1,
                    odPreferredOperation: ['addition', 'subtraction', 'multiplication', 'division', 'mixed'][i],
                })),
            };
            
            // Listen for ai_match_created, then join the match
            this.socket!.once('ai_match_created', async (data: any) => {
                console.log(`[SyntheticPlayer:${this.config.userName}] AI match created, joining...`);
                
                // Now join the match to get match_state
                this.socket!.emit('join_team_match', {
                    matchId,
                    userId: this.config.userId,
                    teamId: teamId,
                    partyId: partyId,
                });
            });
            
            // Listen for match_state which indicates we've joined
            this.once('match_state', (state) => {
                clearTimeout(timeout);
                this.matchId = matchId;
                this.teamId = teamId;
                resolve();
            });
            
            // Also listen for error
            const errorHandler = (error: any) => {
                console.error(`[SyntheticPlayer:${this.config.userName}] Error:`, error);
                clearTimeout(timeout);
                reject(new Error(error.message || 'Failed to create AI match'));
            };
            this.socket!.once('error', errorHandler);
            
            // Create the AI match
            this.socket!.emit('create_ai_match', {
                matchId,
                humanTeam,
                difficulty,
                operation: 'mixed',
            });
        });
    }
    
    /**
     * Disconnect from server
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
    }
    
    /**
     * Calculate correct answer for a question
     */
    static calculateAnswer(questionText: string): number {
        // Parse question like "12 + 5 = ?" or "12 × 5 = ?"
        const cleaned = questionText.replace('×', '*').replace('÷', '/').replace('−', '-');
        const match = cleaned.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
        
        if (!match) return 0;
        
        const a = parseInt(match[1]);
        const op = match[2];
        const b = parseInt(match[3]);
        
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return Math.floor(a / b);
            default: return 0;
        }
    }
}

/**
 * Create a team of synthetic players
 */
export async function createSyntheticTeam(
    count: number,
    serverUrl: string,
    prefix: string = 'TestPlayer'
): Promise<{
    players: SyntheticPlayer[];
    leader: SyntheticPlayer;
    igl: SyntheticPlayer;
    anchor: SyntheticPlayer;
}> {
    const players: SyntheticPlayer[] = [];
    
    for (let i = 0; i < count; i++) {
        const player = new SyntheticPlayer({
            userId: `test-user-${prefix}-${i}-${Date.now()}`,
            userName: `${prefix}${i + 1}`,
            isIGL: i === 0,
            isAnchor: i === 1,
        }, serverUrl);
        
        await player.connect();
        players.push(player);
    }
    
    return {
        players,
        leader: players[0],
        igl: players[0],
        anchor: players[1],
    };
}

/**
 * Cleanup function for tests
 */
export function cleanupPlayers(players: SyntheticPlayer[]): void {
    for (const player of players) {
        player.disconnect();
    }
}

