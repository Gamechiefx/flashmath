/**
 * FlashMath AI Engine - Content Variant Generator
 * 
 * Implements "Varied Repetition" (The Chameleon Effect):
 * Generates the same mathematical concept in multiple representational forms
 * to prevent pattern memorization and reinforce conceptual understanding.
 * 
 * Supported Representations:
 * - direct: "7 × 8 = ?"
 * - missing_op1: "? × 8 = 56"
 * - missing_op2: "7 × ? = 56"
 * - word: "Seven groups of eight equals ?"
 * - algebraic: "Solve: 7x = 56"
 * - visual: "7 rows of 8 items = ?"
 */

import {
    ContentItem,
    RepresentationType,
    MathOperation,
} from './types';
import { generateId } from '@/lib/db';

// =============================================================================
// NUMBER WORD CONVERSION
// =============================================================================

const NUMBER_WORDS: Record<number, string> = {
    0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
    5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
    10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
    14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen',
    18: 'eighteen', 19: 'nineteen', 20: 'twenty',
};

const TENS_WORDS: Record<number, string> = {
    2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty',
    6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety',
};

function numberToWord(n: number): string {
    if (n <= 20) return NUMBER_WORDS[n] || n.toString();
    if (n < 100) {
        const tens = Math.floor(n / 10);
        const ones = n % 10;
        return ones === 0 ? TENS_WORDS[tens] : `${TENS_WORDS[tens]}-${NUMBER_WORDS[ones]}`;
    }
    if (n < 1000) {
        const hundreds = Math.floor(n / 100);
        const remainder = n % 100;
        if (remainder === 0) return `${NUMBER_WORDS[hundreds]} hundred`;
        return `${NUMBER_WORDS[hundreds]} hundred ${numberToWord(remainder)}`;
    }
    return n.toString();  // Fallback for large numbers
}

// =============================================================================
// SKILL ID PARSING
// =============================================================================

export interface ParsedSkillId {
    operation: MathOperation;
    operand1: number;
    operand2: number;
    result: number;
}

/**
 * Parse skill ID like "mul.7x8" into components
 */
export function parseSkillId(skillId: string): ParsedSkillId | null {
    const patterns = [
        { prefix: 'mul.', op: 'multiplication' as MathOperation, regex: /^mul\.(\d+)x(\d+)$/ },
        { prefix: 'add.', op: 'addition' as MathOperation, regex: /^add\.(\d+)\+(\d+)$/ },
        { prefix: 'sub.', op: 'subtraction' as MathOperation, regex: /^sub\.(\d+)-(\d+)$/ },
        { prefix: 'div.', op: 'division' as MathOperation, regex: /^div\.(\d+)÷(\d+)$/ },
    ];

    for (const { op, regex } of patterns) {
        const match = skillId.match(regex);
        if (match) {
            const operand1 = parseInt(match[1]);
            const operand2 = parseInt(match[2]);
            let result: number;

            switch (op) {
                case 'multiplication': result = operand1 * operand2; break;
                case 'addition': result = operand1 + operand2; break;
                case 'subtraction': result = operand1 - operand2; break;
                case 'division': result = operand1 / operand2; break;
            }

            return { operation: op, operand1, operand2, result };
        }
    }

    return null;
}

/**
 * Create skill ID from components
 */
export function createSkillId(operation: MathOperation, op1: number, op2: number): string {
    switch (operation) {
        case 'multiplication': return `mul.${op1}x${op2}`;
        case 'addition': return `add.${op1}+${op2}`;
        case 'subtraction': return `sub.${op1}-${op2}`;
        case 'division': return `div.${op1}÷${op2}`;
    }
}

// =============================================================================
// VARIANT GENERATORS
// =============================================================================

/**
 * Generate direct form: "7 × 8 = ?"
 */
function generateDirectVariant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    const symbol = getOperationSymbol(operation);
    return {
        prompt: `${op1} ${symbol} ${op2} = ?`,
        answer: result,
    };
}

/**
 * Generate missing first operand: "? × 8 = 56"
 */
function generateMissingOp1Variant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    const symbol = getOperationSymbol(operation);
    return {
        prompt: `? ${symbol} ${op2} = ${result}`,
        answer: op1,
    };
}

/**
 * Generate missing second operand: "7 × ? = 56"
 */
function generateMissingOp2Variant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    const symbol = getOperationSymbol(operation);
    return {
        prompt: `${op1} ${symbol} ? = ${result}`,
        answer: op2,
    };
}

/**
 * Generate word form: "Seven groups of eight equals ?"
 */
function generateWordVariant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    const word1 = numberToWord(op1);
    const word2 = numberToWord(op2);

    let prompt: string;
    switch (operation) {
        case 'multiplication':
            // Vary the phrasing
            const phrases = [
                `${word1} groups of ${word2} equals`,
                `${word1} times ${word2} is`,
                `${word1} sets of ${word2} gives`,
                `What is ${word1} multiplied by ${word2}?`,
            ];
            prompt = phrases[Math.floor(Math.random() * phrases.length)];
            break;
        case 'addition':
            prompt = `${word1} plus ${word2} equals`;
            break;
        case 'subtraction':
            prompt = `${word1} minus ${word2} equals`;
            break;
        case 'division':
            prompt = `${word1} divided by ${word2} equals`;
            break;
    }

    return { prompt, answer: result };
}

/**
 * Generate algebraic form: "Solve: 7x = 56" or "7 + x = 15"
 */
function generateAlgebraicVariant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    let prompt: string;
    let answer: number;

    // Randomly decide which variable to use
    const solveForSecond = Math.random() > 0.5;

    switch (operation) {
        case 'multiplication':
            if (solveForSecond) {
                prompt = `Solve: ${op1}x = ${result}`;
                answer = op2;
            } else {
                prompt = `Solve: x × ${op2} = ${result}`;
                answer = op1;
            }
            break;
        case 'addition':
            if (solveForSecond) {
                prompt = `Solve: ${op1} + x = ${result}`;
                answer = op2;
            } else {
                prompt = `Solve: x + ${op2} = ${result}`;
                answer = op1;
            }
            break;
        case 'subtraction':
            if (solveForSecond) {
                prompt = `Solve: ${op1} - x = ${result}`;
                answer = op2;
            } else {
                prompt = `If x - ${op2} = ${result}, what is x?`;
                answer = op1;
            }
            break;
        case 'division':
            if (solveForSecond) {
                prompt = `Solve: ${op1} ÷ x = ${result}`;
                answer = op2;
            } else {
                prompt = `Solve: x ÷ ${op2} = ${result}`;
                answer = op1;
            }
            break;
    }

    return { prompt, answer };
}

/**
 * Generate visual/array description: "7 rows of 8 items = ?"
 */
function generateVisualVariant(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): { prompt: string; answer: number | string } {
    let prompt: string;

    switch (operation) {
        case 'multiplication':
            const visualPhrases = [
                `${op1} rows with ${op2} items each = ?`,
                `An array of ${op1} by ${op2} has how many total?`,
                `${op1} bags with ${op2} apples in each = ?`,
                `${op1} boxes of ${op2} cookies = ?`,
            ];
            prompt = visualPhrases[Math.floor(Math.random() * visualPhrases.length)];
            break;
        case 'addition':
            prompt = `${op1} items and ${op2} more items = ?`;
            break;
        case 'subtraction':
            prompt = `${op1} items, take away ${op2} = ?`;
            break;
        case 'division':
            prompt = `${op1} items split into ${op2} equal groups = ? per group`;
            break;
    }

    return { prompt, answer: result };
}

// =============================================================================
// MAIN VARIANT GENERATOR
// =============================================================================

function getOperationSymbol(operation: MathOperation): string {
    switch (operation) {
        case 'multiplication': return '×';
        case 'addition': return '+';
        case 'subtraction': return '-';
        case 'division': return '÷';
    }
}

/**
 * Generate explanation for a problem
 */
function generateExplanation(
    operation: MathOperation,
    op1: number,
    op2: number,
    result: number
): string {
    switch (operation) {
        case 'multiplication':
            return `${op1} × ${op2} means ${op1} groups of ${op2}, which equals ${result}. ` +
                `You can think of it as adding ${op2} a total of ${op1} times.`;
        case 'addition':
            return `${op1} + ${op2} means combining ${op1} and ${op2} together, giving us ${result}.`;
        case 'subtraction':
            return `${op1} - ${op2} means starting with ${op1} and taking away ${op2}, leaving us with ${result}.`;
        case 'division':
            return `${op1} ÷ ${op2} means splitting ${op1} into ${op2} equal groups. ` +
                `Each group has ${result} items.`;
    }
}

/**
 * Calculate difficulty based on operands and representation
 */
function calculateDifficulty(
    operation: MathOperation,
    op1: number,
    op2: number,
    representation: RepresentationType
): number {
    let baseDifficulty = 0.3;

    // Larger numbers = harder
    const maxOperand = Math.max(op1, op2);
    if (maxOperand > 10) baseDifficulty += 0.2;
    if (maxOperand > 20) baseDifficulty += 0.2;
    if (maxOperand > 50) baseDifficulty += 0.1;

    // Operation complexity
    if (operation === 'division') baseDifficulty += 0.1;
    if (operation === 'multiplication' && op1 > 5 && op2 > 5) baseDifficulty += 0.1;

    // Representation complexity
    switch (representation) {
        case 'missing_op1':
        case 'missing_op2':
            baseDifficulty += 0.1;
            break;
        case 'algebraic':
            baseDifficulty += 0.15;
            break;
        case 'word':
        case 'visual':
            baseDifficulty += 0.05;
            break;
    }

    return Math.min(1.0, baseDifficulty);
}

/**
 * Main function: Generate a content item variant for a skill
 */
export function generateVariant(
    skillId: string,
    representation: RepresentationType,
    tier: number = 1
): ContentItem | null {
    const parsed = parseSkillId(skillId);
    if (!parsed) return null;

    const { operation, operand1, operand2, result } = parsed;

    let variantResult: { prompt: string; answer: number | string };

    switch (representation) {
        case 'direct':
            variantResult = generateDirectVariant(operation, operand1, operand2, result);
            break;
        case 'missing_op1':
            variantResult = generateMissingOp1Variant(operation, operand1, operand2, result);
            break;
        case 'missing_op2':
            variantResult = generateMissingOp2Variant(operation, operand1, operand2, result);
            break;
        case 'word':
            variantResult = generateWordVariant(operation, operand1, operand2, result);
            break;
        case 'algebraic':
            variantResult = generateAlgebraicVariant(operation, operand1, operand2, result);
            break;
        case 'visual':
            variantResult = generateVisualVariant(operation, operand1, operand2, result);
            break;
        default:
            variantResult = generateDirectVariant(operation, operand1, operand2, result);
    }

    return {
        itemId: generateId(),
        skillId,
        conceptId: `${operation}.${operand1}x${operand2}`,
        promptText: variantResult.prompt,
        correctAnswer: variantResult.answer,
        answerFormat: 'numeric',
        operation,
        representation,
        difficulty: calculateDifficulty(operation, operand1, operand2, representation),
        tier,
        explanation: generateExplanation(operation, operand1, operand2, result),
        operand1,
        operand2,
    };
}

/**
 * Generate a variant from raw problem data (from existing system)
 */
export function generateVariantFromProblem(
    operation: MathOperation,
    op1: number,
    op2: number,
    representation: RepresentationType = 'direct',
    tier: number = 1
): ContentItem {
    const skillId = createSkillId(operation, op1, op2);
    const item = generateVariant(skillId, representation, tier);

    if (!item) {
        // Fallback to direct representation
        let result: number;
        switch (operation) {
            case 'multiplication': result = op1 * op2; break;
            case 'addition': result = op1 + op2; break;
            case 'subtraction': result = op1 - op2; break;
            case 'division': result = op1 / op2; break;
        }

        return {
            itemId: generateId(),
            skillId,
            conceptId: `${operation}.${op1}x${op2}`,
            promptText: `${op1} ${getOperationSymbol(operation)} ${op2} = ?`,
            correctAnswer: result,
            answerFormat: 'numeric',
            operation,
            representation: 'direct',
            difficulty: calculateDifficulty(operation, op1, op2, 'direct'),
            tier,
            explanation: generateExplanation(operation, op1, op2, result),
            operand1: op1,
            operand2: op2,
        };
    }

    return item;
}

/**
 * Get the next representation that hasn't been used recently
 */
export function selectNextRepresentation(
    usedRepresentations: RepresentationType[],
    preferredOrder: RepresentationType[] = ['direct', 'missing_op2', 'missing_op1', 'word', 'algebraic', 'visual']
): RepresentationType {
    // Find first representation not in used list
    for (const rep of preferredOrder) {
        if (!usedRepresentations.includes(rep)) {
            return rep;
        }
    }

    // All have been used, cycle back (but avoid the most recent)
    const lastUsed = usedRepresentations[usedRepresentations.length - 1];
    for (const rep of preferredOrder) {
        if (rep !== lastUsed) {
            return rep;
        }
    }

    return 'direct';
}

/**
 * Get all available representations for an operation
 */
export function getAvailableRepresentations(operation: MathOperation): RepresentationType[] {
    // All operations support all representations
    return ['direct', 'missing_op1', 'missing_op2', 'word', 'algebraic', 'visual'];
}
