
export type MathOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

export interface TierConfig {
    id: number;
    name: string; // "I", "II", "III", "IV"
    description: string;
    criteria: string;
    generate: () => MathProblem;
}

export interface MathProblem {
    question: string;
    answer: number;
    type: 'basic' | 'variable' | 'multi-digit';
    explanation: string;
    tier: number;
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to generate a variable problem like "5 + x = 12"
const generateVariableProblem = (op: MathOperation, a: number, b: number, result: number): MathProblem => {
    // 50% chance for "a [op] x = res" vs "x [op] b = res"
    const missingA = Math.random() < 0.5;
    let question = "";
    let answer = 0;
    let explanation = "";

    if (op === 'addition') {
        // a + x = res OR x + b = res
        // result should be the sum
        // Actually for addition: a + b = res. If we solve for x, x is one of the addends.
        // The result passed in is likely the sum.
        // Let's restructure. We want "a + x = sum" where a and x are generated.
        // Wait, "5 + x = 25".
        const x = b;
        const sum = a + x;
        answer = x;
        question = missingA
            ? `x + ${a} = ${sum}`
            : `${a} + x = ${sum}`;
        explanation = `To find the missing number, subtract ${a} from ${sum}. ${sum} - ${a} = ${answer}.`;
    } else if (op === 'subtraction') {
        // "58 - x = 7" or "x - 5 = 20"
        if (missingA) {
            // x - b = result
            // x = result + b
            const x = a + b; // generated a is effectively the result?
            const sub = b;
            const res = a;
            // Re-mapping args for clarity
            // We want randomly: 
            // Type A: A - x = B (58 - x = 7) -> x = 51. 
            // Type B: x - A = B (x - 5 = 20) -> x = 25.

            if (Math.random() < 0.5) {
                // A - x = B
                // A must be > B
                const big = rand(10, 100);
                const small = rand(1, big - 1);
                const diff = big - small;
                question = `${big} - x = ${diff}`;
                answer = small;
                explanation = `To find x, subtract the difference from the total: ${big} - ${diff} = ${answer}.`;
            } else {
                // x - A = B
                const sub = rand(2, 50);
                const diff = rand(2, 50);
                const total = sub + diff;
                question = `x - ${sub} = ${diff}`;
                answer = total;
                explanation = `To find x, add the number being subtracted to the difference: ${diff} + ${sub} = ${answer}.`;
            }
        } else {
            // Fallback to simple variable
            const total = rand(20, 100);
            const sub = rand(1, 15);
            question = `${total} - x = ${total - sub}`;
            answer = sub;
            explanation = `Subtract ${total - sub} from ${total} to find x.`;
        }
    } else if (op === 'multiplication') {
        // 7x = 58 ... wait 7x=58 is not integer. User example: "7x = 56" probably.
        // 5x = 25
        const factor = a;
        const x = b;
        const prod = factor * x;
        question = `${factor}x = ${prod}`;
        answer = x;
        explanation = `Divide the product by the known factor: ${prod} / ${factor} = ${answer}.`;
    } else if (op === 'division') {
        // 105 / x = 15
        // x / 5 = 20
        if (Math.random() < 0.5) {
            // Total / x = Result
            const x = rand(2, 12);
            const res = rand(2, 20);
            const total = x * res;
            question = `${total} / x = ${res}`;
            answer = x;
            explanation = `Divide the total by the result to find x: ${total} / ${res} = ${answer}.`;
        } else {
            // x / Factor = Result
            const factor = rand(2, 12);
            const res = rand(2, 20);
            const total = factor * res;
            question = `x / ${factor} = ${res}`;
            answer = total;
            explanation = `Multiply the result by the divisor to find x: ${res} * ${factor} = ${answer}.`;
        }
    }

    return {
        question,
        answer,
        type: 'variable',
        explanation,
        tier: 0 // Caller sets tier
    };
};

const TIERS = {
    multiplication: {
        1: {
            generate: () => {
                // Tier I: Basic Mult (5x7) -> Harder (12x7, 25x2)
                // Range: 2-12 x 2-12 primarily.
                // "Harder": 12x7, 25x2.
                // Let's mix: 70% simple (2-9 x 2-9), 30% "harder" (10-25 x 2-9).
                const isHard = Math.random() < 0.3;
                let a, b;
                if (isHard) {
                    a = rand(10, 25);
                    b = rand(2, 9);
                } else {
                    a = rand(2, 9);
                    b = rand(2, 9);
                }
                return {
                    question: `${a} × ${b}`,
                    answer: a * b,
                    type: 'basic',
                    explanation: `Multiply ${a} by ${b}.`,
                    tier: 1
                };
            }
        },
        2: {
            generate: () => {
                // Tier II: Variables (5x=25), 52*3, 48*2.
                // "Harder": 105x4 (3digit x 1digit), 23x15 (2digit x 2digit)?? 
                // Spec says Tier II closer to mastery: 105x4, 23x15.
                // Wait, Tier III says "25x25, 105x12". 
                // Let's stick roughly to: 2Digit x 1Digit, Simple Variables.
                if (Math.random() < 0.3) {
                    // Variable
                    const a = rand(3, 12);
                    const b = rand(3, 12);
                    return { ...generateVariableProblem('multiplication', a, b, 0), tier: 2 };
                } else {
                    // 2 Digit x 1 Digit
                    // 52 * 3
                    const a = rand(20, 99);
                    const b = rand(2, 9);
                    return {
                        question: `${a} × ${b}`,
                        answer: a * b,
                        type: 'multi-digit',
                        explanation: `Multiply ${a} by ${b}. Break it down: (${Math.floor(a / 10) * 10} * ${b}) + (${a % 10} * ${b}).`,
                        tier: 2
                    };
                }
            }
        },
        3: {
            generate: () => {
                // Tier III: Variables (15x=105), 125x5, 144x8.
                // Mastery approach: 25x25, 105x12.
                // So 2Digit x 2Digit, 3Digit x 1Digit.
                if (Math.random() < 0.2) {
                    // Harder Variables
                    const a = rand(12, 25);
                    const b = rand(5, 15);
                    return { ...generateVariableProblem('multiplication', a, b, 0), tier: 3 };
                }
                const isTwoByTwo = Math.random() < 0.5;
                let a, b;
                if (isTwoByTwo) {
                    a = rand(11, 50);
                    b = rand(11, 50);
                } else {
                    a = rand(100, 200);
                    b = rand(2, 9);
                }
                return {
                    question: `${a} × ${b}`,
                    answer: a * b,
                    type: 'multi-digit',
                    explanation: `Multiply ${a} by ${b}.`,
                    tier: 3
                };
            }
        },
        4: {
            generate: () => {
                // Tier IV: 12x=144, 205x20, 500x15.
                // Mastery: 100x100, 500x500.
                // 3Digit x 2Digit, 3Digit x 3Digit.
                const type = Math.random();
                if (type < 0.1) {
                    // Variable
                    return { ...generateVariableProblem('multiplication', rand(15, 30), rand(10, 30), 0), tier: 4 };
                } else if (type < 0.6) {
                    // 3D x 2D
                    const a = rand(100, 500);
                    const b = rand(11, 99);
                    return {
                        question: `${a} × ${b}`,
                        answer: a * b,
                        type: 'multi-digit',
                        explanation: `Multiply ${a} by ${b}.`,
                        tier: 4
                    };
                } else {
                    // 3D x 3D
                    const a = rand(100, 500);
                    const b = rand(100, 500);
                    return {
                        question: `${a} × ${b}`,
                        answer: a * b,
                        type: 'multi-digit',
                        explanation: `Multiply ${a} by ${b}.`,
                        tier: 4
                    };
                }
            }
        }
    },
    addition: {
        1: {
            generate: () => {
                // Basic 1D+1D -> 2D+1D
                const isHard = Math.random() < 0.3;
                let a, b;
                if (isHard) {
                    a = rand(10, 25);
                    b = rand(2, 9);
                } else {
                    a = rand(2, 9);
                    b = rand(2, 9);
                }
                return {
                    question: `${a} + ${b}`,
                    answer: a + b,
                    type: 'basic',
                    explanation: `Add ${a} and ${b}.`,
                    tier: 1
                };
            }
        },
        2: {
            generate: () => {
                // Variables, 2D+1D, 2D+2D light
                if (Math.random() < 0.3) {
                    return { ...generateVariableProblem('addition', rand(5, 20), rand(5, 20), 0), tier: 2 };
                }
                const a = rand(20, 99);
                const b = rand(2, 15);
                return {
                    question: `${a} + ${b}`,
                    answer: a + b,
                    type: 'multi-digit',
                    explanation: `Sum ${a} and ${b}.`,
                    tier: 2
                };
            }
        },
        3: {
            generate: () => {
                if (Math.random() < 0.2) return { ...generateVariableProblem('addition', rand(15, 50), rand(15, 50), 0), tier: 3 };
                // 2D+2D, 3D+1D
                const a = rand(20, 99);
                const b = rand(20, 99);
                return {
                    question: `${a} + ${b}`,
                    answer: a + b,
                    type: 'multi-digit',
                    explanation: `Sum ${a} and ${b}.`,
                    tier: 3
                };
            }
        },
        4: {
            generate: () => {
                // 3D+2D, 3D+3D
                const a = rand(100, 500);
                const b = rand(50, 500);
                return {
                    question: `${a} + ${b}`,
                    answer: a + b,
                    type: 'multi-digit',
                    explanation: `Sum ${a} and ${b}.`,
                    tier: 4
                };
            }
        }
    },
    // Implementing Subtraction and Division with similar scaling
    subtraction: {
        1: {
            generate: () => {
                // 1D - 1D (positive), 2D - 1D
                const b = rand(2, 9);
                const a = rand(b, 19);
                return {
                    question: `${a} - ${b}`,
                    answer: a - b,
                    type: 'basic',
                    explanation: `Subtract ${b} from ${a}.`,
                    tier: 1
                };
            }
        },
        2: {
            generate: () => {
                if (Math.random() < 0.3) {
                    // x - 5 = 7
                    return { ...generateVariableProblem('subtraction', rand(5, 20), rand(5, 20), 0), tier: 2 };
                }
                const a = rand(20, 99);
                const b = rand(2, 15);
                return {
                    question: `${a} - ${b}`,
                    answer: a - b,
                    type: 'multi-digit',
                    explanation: `Subtract ${b} from ${a}.`,
                    tier: 2
                };
            }
        },
        3: {
            generate: () => {
                if (Math.random() < 0.2) return { ...generateVariableProblem('subtraction', rand(20, 50), rand(20, 50), 0), tier: 3 };
                const a = rand(50, 150);
                const b = rand(20, 99);
                // Ensure positive result? Typically yes for this level.
                const start = Math.max(a, b);
                const sub = Math.min(a, b);
                return {
                    question: `${start} - ${sub}`,
                    answer: start - sub,
                    type: 'multi-digit',
                    explanation: `Subtract ${sub} from ${start}.`,
                    tier: 3
                };
            }
        },
        4: {
            generate: () => {
                const a = rand(200, 900);
                const b = rand(100, 800);
                const start = Math.max(a, b);
                const sub = Math.min(a, b);
                return {
                    question: `${start} - ${sub}`,
                    answer: start - sub,
                    type: 'multi-digit',
                    explanation: `Subtract ${sub} from ${start}.`,
                    tier: 4
                };
            }
        }
    },
    division: {
        1: {
            generate: () => {
                // Basic division tables 
                const b = rand(2, 9); // divisor
                const res = rand(2, 9);
                const a = b * res; // dividend
                return {
                    question: `${a} / ${b}`,
                    answer: res,
                    type: 'basic',
                    explanation: `How many times does ${b} fit into ${a}?`,
                    tier: 1
                };
            }
        },
        2: {
            generate: () => {
                if (Math.random() < 0.3) {
                    // x / 5 = 4
                    return { ...generateVariableProblem('division', rand(2, 10), rand(2, 10), 0), tier: 2 };
                }
                // Remainder? spec says "(With Remainder)" for 2Digit / 1Digit.
                // But game engine expects single number answer usually? 
                // If the answer input only accepts numbers, remainders are tricky.
                // "Exact" is safer, or "floor"? 
                // Spec: "3 Digit / Single Digit (Exact)" for Tier II mastery.
                // let's stick to Exact for now to avoid UI complexity of "R2".
                const b = rand(3, 12);
                const res = rand(5, 20);
                const a = b * res;
                return {
                    question: `${a} / ${b}`,
                    answer: res,
                    type: 'basic',
                    explanation: `${a} divided by ${b} is ${res}.`,
                    tier: 2
                };
            }
        },
        3: {
            generate: () => {
                const b = rand(5, 20);
                const res = rand(10, 30);
                const a = b * res;
                return {
                    question: `${a} / ${b}`,
                    answer: res,
                    type: 'multi-digit',
                    explanation: `${a} divided by ${b} is ${res}.`,
                    tier: 3
                };
            }
        },
        4: {
            generate: () => {
                const b = rand(15, 50);
                const res = rand(20, 50);
                const a = b * res;
                return {
                    question: `${a} / ${b}`,
                    answer: res,
                    type: 'multi-digit',
                    explanation: `${a} divided by ${b} is ${res}.`,
                    tier: 4
                };
            }
        }
    }
};

export const generateProblemForSession = (op: MathOperation, tier: number): MathProblem => {
    // Safety check
    if (tier < 1) tier = 1;
    if (tier > 4) tier = 4;

    // Check if op exists
    const opConfig = (TIERS as any)[op];
    if (!opConfig) {
        // Fallback
        return TIERS.addition[1].generate();
    }

    return opConfig[tier].generate();
};

export const generatePlacementTest = (): Record<MathOperation, MathProblem[]> => {
    // Generate 5 questions per operation
    // 1 from Tier I, 2 from Tier II, 1 from Tier III, 1 from Tier IV?
    // Or progressive.
    const ops: MathOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
    const test: any = {};

    ops.forEach(op => {
        test[op] = [
            (TIERS as any)[op][1].generate(),
            (TIERS as any)[op][1].generate(),
            (TIERS as any)[op][2].generate(),
            (TIERS as any)[op][3].generate(),
            (TIERS as any)[op][4].generate(),
        ];
    });

    return test;
};

// Returns new tier or same tier
// Logic: If last 10 problems > 90% accuracy, advance.
export const checkProgression = (currentTier: number, recentAccuracy: number): number => {
    if (recentAccuracy >= 90 && currentTier < 4) {
        return currentTier + 1;
    }
    return currentTier;
};

export default TIERS;
