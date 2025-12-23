"use client";

export type Operation = 'Addition' | 'Subtraction' | 'Multiplication' | 'Division';
export type PerformanceType = 'fast' | 'correct' | 'slow';

export const THRESHOLDS = {
    FAST: 2000,
    SLOW: 6000,
};

export function generateProblem(op: Operation = 'Multiplication') {
    let num1 = Math.floor(Math.random() * 11) + 2;
    let num2 = Math.floor(Math.random() * 11) + 2;

    if (op === 'Addition') {
        return { num1, num2, answer: num1 + num2 };
    }
    if (op === 'Subtraction') {
        if (num1 < num2) [num1, num2] = [num2, num1];
        return { num1, num2, answer: num1 - num2 };
    }
    if (op === 'Division') {
        const product = num1 * num2;
        return { num1: product, num2: num1, answer: num2 };
    }

    // Default Multiplication
    return { num1, num2, answer: num1 * num2 };
}

export function getPerformance(responseTime: number): { type: PerformanceType; label: string; xp: number } {
    if (responseTime <= THRESHOLDS.FAST) {
        return { type: 'fast', label: '⚡ LIGHTNING FAST', xp: 5 };
    }
    if (responseTime <= THRESHOLDS.SLOW) {
        return { type: 'correct', label: '✓ ACCURATE', xp: 3 };
    }
    return { type: 'slow', label: '🐢 GOT IT', xp: 1 };
}
