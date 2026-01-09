/**
 * Test Data Factory Tests
 * 
 * Ensures test data factories produce valid data.
 */

import { describe, it, expect } from 'vitest';
import {
    createTestUser,
    createTestTeamMember,
    createTestTeam,
    createTestQuestion,
    createTestQuestionSet,
    createTestParty,
    createTestMatchState,
    isValidElo,
    isValidScore,
    isValidAccuracy,
} from './test-data';

describe('Test Data Factories', () => {
    describe('createTestUser', () => {
        it('should create user with default values', () => {
            const user = createTestUser();
            
            expect(user.id).toMatch(/^user-/);
            expect(user.name).toMatch(/^TestUser\d+$/);
            expect(user.email).toContain('@test.flashmath.io');
            expect(user.level).toBe(1);
            expect(user.coins).toBe(100);
            expect(user.duel_elo).toBe(300);
        });
        
        it('should allow overrides', () => {
            const user = createTestUser({
                name: 'CustomUser',
                level: 50,
                coins: 5000,
            });
            
            expect(user.name).toBe('CustomUser');
            expect(user.level).toBe(50);
            expect(user.coins).toBe(5000);
        });
        
        it('should generate unique IDs', () => {
            const user1 = createTestUser();
            const user2 = createTestUser();
            
            expect(user1.id).not.toBe(user2.id);
        });
    });
    
    describe('createTestTeam', () => {
        it('should create team with specified size', () => {
            expect(createTestTeam(2)).toHaveLength(2);
            expect(createTestTeam(3)).toHaveLength(3);
            expect(createTestTeam(5)).toHaveLength(5);
        });
        
        it('should set first member as leader and IGL', () => {
            const team = createTestTeam(5);
            
            expect(team[0].isLeader).toBe(true);
            expect(team[0].isIGL).toBe(true);
            expect(team[1].isLeader).toBe(false);
        });
        
        it('should set second member as anchor', () => {
            const team = createTestTeam(5);
            
            expect(team[1].isAnchor).toBe(true);
            expect(team[0].isAnchor).toBe(false);
        });
        
        it('should assign progressive ELO values', () => {
            const team = createTestTeam(5);
            
            expect(team[0].odDuelElo).toBe(400);
            expect(team[4].odDuelElo).toBe(600);
        });
    });
    
    describe('createTestQuestion', () => {
        it('should create valid addition question', () => {
            const q = createTestQuestion('+');
            expect(q.answer).toBe(q.num1 + q.num2);
            expect(q.operation).toBe('+');
        });
        
        it('should create valid subtraction question', () => {
            const q = createTestQuestion('-');
            expect(q.answer).toBe(Math.abs(q.num1 - q.num2));
            expect(q.operation).toBe('-');
        });
        
        it('should create valid multiplication question', () => {
            const q = createTestQuestion('×');
            expect(q.answer).toBe(q.num1 * q.num2);
            expect(q.operation).toBe('×');
        });
        
        it('should create valid division question', () => {
            const q = createTestQuestion('÷');
            expect(q.num1 % q.num2).toBe(0);
            expect(q.answer).toBe(q.num1 / q.num2);
        });
    });
    
    describe('createTestQuestionSet', () => {
        it('should create specified number of questions', () => {
            expect(createTestQuestionSet(10)).toHaveLength(10);
            expect(createTestQuestionSet(25)).toHaveLength(25);
        });
        
        it('should include variety of operations', () => {
            const questions = createTestQuestionSet(20);
            const operations = new Set(questions.map(q => q.operation));
            
            expect(operations.size).toBe(4);
        });
    });
    
    describe('createTestParty', () => {
        it('should create party with members', () => {
            const party = createTestParty(5);
            
            expect(party.members).toHaveLength(5);
            expect(party.leaderId).toBe(party.members[0].odUserId);
        });
        
        it('should set IGL and anchor', () => {
            const party = createTestParty(5);
            
            expect(party.iglId).toBe(party.members[0].odUserId);
            expect(party.anchorId).toBe(party.members[1].odUserId);
        });
        
        it('should set target mode for 5-player party', () => {
            const party5 = createTestParty(5);
            const party3 = createTestParty(3);
            
            expect(party5.targetMode).toBe('5v5');
            expect(party3.targetMode).toBeNull();
        });
    });
    
    describe('createTestMatchState', () => {
        it('should create match with default values', () => {
            const match = createTestMatchState();
            
            expect(match.matchId).toMatch(/^match-/);
            expect(match.phase).toBe('active');
            expect(match.half).toBe(1);
            expect(match.round).toBe(1);
        });
        
        it('should allow overrides', () => {
            const match = createTestMatchState({
                phase: 'halftime',
                half: 2,
                round: 4,
            });
            
            expect(match.phase).toBe('halftime');
            expect(match.half).toBe(2);
            expect(match.round).toBe(4);
        });
    });
    
    describe('Validation Helpers', () => {
        it('isValidElo should validate ELO range', () => {
            expect(isValidElo(100)).toBe(true);
            expect(isValidElo(3000)).toBe(true);
            expect(isValidElo(500)).toBe(true);
            
            expect(isValidElo(99)).toBe(false);
            expect(isValidElo(3001)).toBe(false);
            expect(isValidElo(500.5)).toBe(false);
        });
        
        it('isValidScore should validate score range', () => {
            expect(isValidScore(0)).toBe(true);
            expect(isValidScore(10000)).toBe(true);
            
            expect(isValidScore(-1)).toBe(false);
            expect(isValidScore(100.5)).toBe(false);
        });
        
        it('isValidAccuracy should validate accuracy range', () => {
            expect(isValidAccuracy(0)).toBe(true);
            expect(isValidAccuracy(1)).toBe(true);
            expect(isValidAccuracy(0.5)).toBe(true);
            
            expect(isValidAccuracy(-0.1)).toBe(false);
            expect(isValidAccuracy(1.1)).toBe(false);
        });
    });
});


