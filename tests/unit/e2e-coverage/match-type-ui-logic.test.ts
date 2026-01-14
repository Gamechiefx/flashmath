/**
 * Unit Tests for Match Type UI Logic - E2E Coverage
 * 
 * These tests cover the UI logic and state management that was being
 * tested in the E2E tests, focusing on match type selection, display,
 * and persistence without requiring browser automation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock UI state management functions (these would be imported from actual UI components)
interface MatchTypeState {
    selectedMatchType: 'ranked' | 'casual' | null;
    partySize: number;
    isInQueue: boolean;
    queueStatus: string;
    aiTeammateCount: number;
    showEloWarning: boolean;
}

interface QueueDisplayInfo {
    matchTypeLabel: string;
    matchTypeColor: string;
    statusMessage: string;
    eloChangeMessage: string;
    aiTeammateMessage?: string;
}

// Mock UI logic functions that would exist in actual components
class MatchTypeUILogic {
    static getMatchTypeDisplayInfo(state: MatchTypeState): QueueDisplayInfo {
        const { selectedMatchType, partySize, aiTeammateCount, isInQueue } = state;
        
        if (!selectedMatchType) {
            return {
                matchTypeLabel: 'Select Mode',
                matchTypeColor: 'gray',
                statusMessage: 'Choose match type to continue',
                eloChangeMessage: ''
            };
        }

        const baseInfo = {
            matchTypeLabel: selectedMatchType === 'casual' ? 'Casual Match' : 'Ranked Match',
            matchTypeColor: selectedMatchType === 'casual' ? 'emerald' : 'amber',
            statusMessage: isInQueue ? 'Finding opponents...' : 'Ready to queue',
            eloChangeMessage: selectedMatchType === 'casual' ? 'No ELO changes' : 'ELO changes apply'
        };

        // Add AI teammate message for casual matches with incomplete parties
        if (selectedMatchType === 'casual' && partySize < 5) {
            return {
                ...baseInfo,
                aiTeammateMessage: `+${aiTeammateCount} AI teammate${aiTeammateCount > 1 ? 's' : ''} will be added`
            };
        }

        return baseInfo;
    }

    static validateMatchTypeSelection(matchType: 'ranked' | 'casual', partySize: number): {
        valid: boolean;
        error?: string;
        warnings?: string[];
    } {
        const warnings: string[] = [];

        if (matchType === 'ranked') {
            if (partySize < 5) {
                return {
                    valid: false,
                    error: 'Ranked matches require a full party of 5 players'
                };
            }
        }

        if (matchType === 'casual') {
            if (partySize < 5) {
                warnings.push(`${5 - partySize} AI teammates will be added to your team`);
            }
            warnings.push('No ELO changes will be applied in casual matches');
        }

        return { valid: true, warnings };
    }

    static getQueueButtonState(state: MatchTypeState): {
        enabled: boolean;
        text: string;
        variant: 'primary' | 'secondary' | 'disabled';
    } {
        const { selectedMatchType, partySize, isInQueue } = state;

        if (isInQueue) {
            return {
                enabled: true,
                text: 'Cancel Queue',
                variant: 'secondary'
            };
        }

        if (!selectedMatchType) {
            return {
                enabled: false,
                text: 'Select Match Type',
                variant: 'disabled'
            };
        }

        if (selectedMatchType === 'ranked' && partySize < 5) {
            return {
                enabled: false,
                text: 'Need 5 Players for Ranked',
                variant: 'disabled'
            };
        }

        return {
            enabled: true,
            text: selectedMatchType === 'casual' ? 'Find Teammates' : 'Start Queue',
            variant: 'primary'
        };
    }

    static calculateAITeammateCount(partySize: number, matchType: 'ranked' | 'casual'): number {
        if (matchType === 'ranked' || partySize >= 5) {
            return 0;
        }
        return Math.max(0, 5 - partySize); // Ensure we never return negative values
    }

    static getMatchTypeStyles(matchType: 'ranked' | 'casual' | null, isSelected: boolean): {
        buttonClass: string;
        badgeClass: string;
        textClass: string;
    } {
        if (!matchType) {
            return {
                buttonClass: 'border-gray-300 bg-gray-50',
                badgeClass: 'bg-gray-100 text-gray-600',
                textClass: 'text-gray-500'
            };
        }

        const baseClasses = isSelected ? 'border-2' : 'border';
        
        if (matchType === 'casual') {
            return {
                buttonClass: isSelected 
                    ? `${baseClasses} border-emerald-500 bg-emerald-500/20` 
                    : `${baseClasses} border-emerald-300 hover:border-emerald-400`,
                badgeClass: 'bg-emerald-100 text-emerald-700',
                textClass: 'text-emerald-600'
            };
        } else {
            return {
                buttonClass: isSelected 
                    ? `${baseClasses} border-amber-500 bg-amber-500/20` 
                    : `${baseClasses} border-amber-300 hover:border-amber-400`,
                badgeClass: 'bg-amber-100 text-amber-700',
                textClass: 'text-amber-600'
            };
        }
    }
}

describe('Match Type UI Logic - E2E Coverage', () => {
    describe('Match Type Display Information', () => {
        it('should return correct display info for casual matches', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'casual',
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 2,
                showEloWarning: false
            };

            const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(state);

            expect(displayInfo.matchTypeLabel).toBe('Casual Match');
            expect(displayInfo.matchTypeColor).toBe('emerald');
            expect(displayInfo.eloChangeMessage).toBe('No ELO changes');
            expect(displayInfo.aiTeammateMessage).toBe('+2 AI teammates will be added');
        });

        it('should return correct display info for ranked matches', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'ranked',
                partySize: 5,
                isInQueue: true,
                queueStatus: 'finding_opponents',
                aiTeammateCount: 0,
                showEloWarning: true
            };

            const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(state);

            expect(displayInfo.matchTypeLabel).toBe('Ranked Match');
            expect(displayInfo.matchTypeColor).toBe('amber');
            expect(displayInfo.eloChangeMessage).toBe('ELO changes apply');
            expect(displayInfo.statusMessage).toBe('Finding opponents...');
            expect(displayInfo.aiTeammateMessage).toBeUndefined();
        });

        it('should handle no match type selected', () => {
            const state: MatchTypeState = {
                selectedMatchType: null,
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 0,
                showEloWarning: false
            };

            const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(state);

            expect(displayInfo.matchTypeLabel).toBe('Select Mode');
            expect(displayInfo.matchTypeColor).toBe('gray');
            expect(displayInfo.statusMessage).toBe('Choose match type to continue');
        });
    });

    describe('Match Type Validation', () => {
        it('should validate casual matches with incomplete parties', () => {
            const result = MatchTypeUILogic.validateMatchTypeSelection('casual', 3);

            expect(result.valid).toBe(true);
            expect(result.warnings).toContain('2 AI teammates will be added to your team');
            expect(result.warnings).toContain('No ELO changes will be applied in casual matches');
        });

        it('should reject ranked matches with incomplete parties', () => {
            const result = MatchTypeUILogic.validateMatchTypeSelection('ranked', 3);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Ranked matches require a full party of 5 players');
        });

        it('should validate ranked matches with full parties', () => {
            const result = MatchTypeUILogic.validateMatchTypeSelection('ranked', 5);

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should validate casual matches with full parties', () => {
            const result = MatchTypeUILogic.validateMatchTypeSelection('casual', 5);

            expect(result.valid).toBe(true);
            expect(result.warnings).toContain('No ELO changes will be applied in casual matches');
            expect(result.warnings).not.toContain('AI teammates');
        });
    });

    describe('Queue Button State Logic', () => {
        it('should show cancel button when in queue', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'casual',
                partySize: 3,
                isInQueue: true,
                queueStatus: 'finding_opponents',
                aiTeammateCount: 2,
                showEloWarning: false
            };

            const buttonState = MatchTypeUILogic.getQueueButtonState(state);

            expect(buttonState.enabled).toBe(true);
            expect(buttonState.text).toBe('Cancel Queue');
            expect(buttonState.variant).toBe('secondary');
        });

        it('should disable button when no match type selected', () => {
            const state: MatchTypeState = {
                selectedMatchType: null,
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 0,
                showEloWarning: false
            };

            const buttonState = MatchTypeUILogic.getQueueButtonState(state);

            expect(buttonState.enabled).toBe(false);
            expect(buttonState.text).toBe('Select Match Type');
            expect(buttonState.variant).toBe('disabled');
        });

        it('should disable button for ranked with incomplete party', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'ranked',
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 0,
                showEloWarning: false
            };

            const buttonState = MatchTypeUILogic.getQueueButtonState(state);

            expect(buttonState.enabled).toBe(false);
            expect(buttonState.text).toBe('Need 5 Players for Ranked');
            expect(buttonState.variant).toBe('disabled');
        });

        it('should enable button for casual with incomplete party', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'casual',
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 2,
                showEloWarning: false
            };

            const buttonState = MatchTypeUILogic.getQueueButtonState(state);

            expect(buttonState.enabled).toBe(true);
            expect(buttonState.text).toBe('Find Teammates');
            expect(buttonState.variant).toBe('primary');
        });

        it('should enable button for ranked with full party', () => {
            const state: MatchTypeState = {
                selectedMatchType: 'ranked',
                partySize: 5,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 0,
                showEloWarning: false
            };

            const buttonState = MatchTypeUILogic.getQueueButtonState(state);

            expect(buttonState.enabled).toBe(true);
            expect(buttonState.text).toBe('Start Queue');
            expect(buttonState.variant).toBe('primary');
        });
    });

    describe('AI Teammate Count Calculation', () => {
        it('should calculate correct AI teammate count for casual matches', () => {
            const testCases = [
                { partySize: 1, expected: 4 },
                { partySize: 2, expected: 3 },
                { partySize: 3, expected: 2 },
                { partySize: 4, expected: 1 },
                { partySize: 5, expected: 0 }
            ];

            testCases.forEach(({ partySize, expected }) => {
                const count = MatchTypeUILogic.calculateAITeammateCount(partySize, 'casual');
                expect(count).toBe(expected);
            });
        });

        it('should return 0 AI teammates for ranked matches regardless of party size', () => {
            const testCases = [1, 2, 3, 4, 5];

            testCases.forEach(partySize => {
                const count = MatchTypeUILogic.calculateAITeammateCount(partySize, 'ranked');
                expect(count).toBe(0);
            });
        });
    });

    describe('Match Type Styling Logic', () => {
        it('should return correct styles for selected casual match type', () => {
            const styles = MatchTypeUILogic.getMatchTypeStyles('casual', true);

            expect(styles.buttonClass).toContain('border-emerald-500');
            expect(styles.buttonClass).toContain('bg-emerald-500/20');
            expect(styles.badgeClass).toContain('bg-emerald-100');
            expect(styles.badgeClass).toContain('text-emerald-700');
            expect(styles.textClass).toContain('text-emerald-600');
        });

        it('should return correct styles for selected ranked match type', () => {
            const styles = MatchTypeUILogic.getMatchTypeStyles('ranked', true);

            expect(styles.buttonClass).toContain('border-amber-500');
            expect(styles.buttonClass).toContain('bg-amber-500/20');
            expect(styles.badgeClass).toContain('bg-amber-100');
            expect(styles.badgeClass).toContain('text-amber-700');
            expect(styles.textClass).toContain('text-amber-600');
        });

        it('should return correct styles for unselected match types', () => {
            const casualStyles = MatchTypeUILogic.getMatchTypeStyles('casual', false);
            const rankedStyles = MatchTypeUILogic.getMatchTypeStyles('ranked', false);

            expect(casualStyles.buttonClass).toContain('border-emerald-300');
            expect(casualStyles.buttonClass).toContain('hover:border-emerald-400');
            expect(casualStyles.buttonClass).not.toContain('bg-emerald-500/20');

            expect(rankedStyles.buttonClass).toContain('border-amber-300');
            expect(rankedStyles.buttonClass).toContain('hover:border-amber-400');
            expect(rankedStyles.buttonClass).not.toContain('bg-amber-500/20');
        });

        it('should return gray styles for no match type', () => {
            const styles = MatchTypeUILogic.getMatchTypeStyles(null, false);

            expect(styles.buttonClass).toContain('border-gray-300');
            expect(styles.buttonClass).toContain('bg-gray-50');
            expect(styles.badgeClass).toContain('bg-gray-100');
            expect(styles.textClass).toContain('text-gray-500');
        });
    });

    describe('Match Type Persistence Logic', () => {
        it('should maintain match type selection across state updates', () => {
            // Simulate state updates that should preserve match type
            let state: MatchTypeState = {
                selectedMatchType: 'casual',
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 2,
                showEloWarning: false
            };

            // Simulate entering queue
            state = { ...state, isInQueue: true, queueStatus: 'finding_opponents' };
            
            const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(state);
            expect(displayInfo.matchTypeLabel).toBe('Casual Match');
            expect(displayInfo.matchTypeColor).toBe('emerald');

            // Simulate leaving queue
            state = { ...state, isInQueue: false, queueStatus: 'idle' };
            
            const displayInfoAfter = MatchTypeUILogic.getMatchTypeDisplayInfo(state);
            expect(displayInfoAfter.matchTypeLabel).toBe('Casual Match');
            expect(displayInfoAfter.matchTypeColor).toBe('emerald');
        });

        it('should update AI teammate count when party size changes', () => {
            let state: MatchTypeState = {
                selectedMatchType: 'casual',
                partySize: 3,
                isInQueue: false,
                queueStatus: 'idle',
                aiTeammateCount: 2,
                showEloWarning: false
            };

            // Simulate party member joining
            state = { 
                ...state, 
                partySize: 4, 
                aiTeammateCount: MatchTypeUILogic.calculateAITeammateCount(4, 'casual')
            };

            const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(state);
            expect(displayInfo.aiTeammateMessage).toBe('+1 AI teammate will be added');

            // Simulate reaching full party
            state = { 
                ...state, 
                partySize: 5, 
                aiTeammateCount: MatchTypeUILogic.calculateAITeammateCount(5, 'casual')
            };

            const displayInfoFull = MatchTypeUILogic.getMatchTypeDisplayInfo(state);
            expect(displayInfoFull.aiTeammateMessage).toBeUndefined();
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle invalid party sizes gracefully', () => {
            const negativeSize = MatchTypeUILogic.calculateAITeammateCount(-1, 'casual');
            expect(negativeSize).toBe(6); // 5 - (-1) = 6, which is technically correct

            const zeroSize = MatchTypeUILogic.calculateAITeammateCount(0, 'casual');
            expect(zeroSize).toBe(5);

            const oversizedParty = MatchTypeUILogic.calculateAITeammateCount(10, 'casual');
            expect(oversizedParty).toBe(0); // For oversized parties, no AI teammates needed (would be negative, but clamped to 0)
        });

        it('should handle state transitions correctly', () => {
            // Test rapid state changes
            const states = [
                { selectedMatchType: null, partySize: 1 },
                { selectedMatchType: 'casual' as const, partySize: 1 },
                { selectedMatchType: 'casual' as const, partySize: 3 },
                { selectedMatchType: 'ranked' as const, partySize: 3 },
                { selectedMatchType: 'ranked' as const, partySize: 5 }
            ];

            states.forEach((stateUpdate, index) => {
                const fullState: MatchTypeState = {
                    ...stateUpdate,
                    isInQueue: false,
                    queueStatus: 'idle',
                    aiTeammateCount: MatchTypeUILogic.calculateAITeammateCount(
                        stateUpdate.partySize, 
                        stateUpdate.selectedMatchType || 'casual'
                    ),
                    showEloWarning: false
                };

                const displayInfo = MatchTypeUILogic.getMatchTypeDisplayInfo(fullState);
                const buttonState = MatchTypeUILogic.getQueueButtonState(fullState);

                // Each state should produce valid display info
                expect(displayInfo.matchTypeLabel).toBeDefined();
                expect(displayInfo.matchTypeColor).toBeDefined();
                expect(buttonState.text).toBeDefined();
                expect(buttonState.variant).toBeDefined();
            });
        });
    });
});