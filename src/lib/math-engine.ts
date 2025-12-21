"use client";

export type Operation = 'add' | 'sub' | 'mult' | 'div';
export type Performance = 'fast' | 'correct' | 'slow' | 'incorrect';

export const THRESHOLDS = {
    FAST: 3000, // 3 seconds for "Mastery"
    MAX: 10000, // 10 seconds total before it's "Slow"
};

export interface Fact {
    id: string;
    n1: number;
    n2: number;
    op: Operation;
    answer: number;
}


export function generateProblem(op: Operation, max: number = 10): Fact {
    let n1 = Math.floor(Math.random() * (max + 1));
    let n2 = Math.floor(Math.random() * (max + 1));

    // Ensure subtraction doesn't result in negative for kids/beginners if needed
    if (op === 'sub' && n1 < n2) {
        [n1, n2] = [n2, n1];
    }

    // Ensure division is clean
    if (op === 'div') {
        n2 = Math.max(1, n2);
        const product = n1 * n2;
        return {
            id: `${product}/${n2}`,
            n1: product,
            n2: n2,
            op,
            answer: n1
        };
    }

    const answer = op === 'add' ? n1 + n2 : op === 'sub' ? n1 - n2 : n1 * n2;

    return {
        id: `${n1}${op}${n2}`,
        n1,
        n2,
        op,
        answer
    };
}

export function getSymbol(op: Operation): string {
    switch (op) {
        case 'add': return '+';
        case 'sub': return '-';
        case 'mult': return '×';
        case 'div': return '÷';
    }
}
