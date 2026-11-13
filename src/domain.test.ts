import { describe, expect, it } from 'vitest';
import { buildSoloShareText, calculateScore, calculateSettlement, drawWinner, getRatios, parseAmount,
  probabilityText, selectWinner, validateParticipants, validateSettlement } from './domain';
import { policy } from './policy';
import type { InputPolicy, QuestionPolicy } from './policy';

// Synthetic fixtures exercise contracts without approving example product policies.
const questions: QuestionPolicy = {
  decision: 'test-only', version: 'test-v1', maximumScore: null,
  questions: [
    { id: 'plus', category: 'test', text: 'Positive fixture', weight: 30n },
    { id: 'minus', category: 'test', text: 'Negative fixture', weight: -200n },
  ],
};
const inputs: InputPolicy = {
  decision: 'test-only', maximumNicknameLength: 20, maximumAmount: 99999999n,
  normalizeNickname: (s) => s.trim().normalize('NFC'),
  countCharacters: (s) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].length,
};
const rows = [
  { id: 'a', nickname: '가', score: 20n },
  { id: 'b', nickname: '나', score: 100n },
  { id: 'c', nickname: '다', score: 180n },
];

describe('score and input contracts', () => {
  it('starts at 100, deduplicates, recalculates after deselection, and enforces the floor', () => {
    expect(calculateScore([], questions)).toBe(100n);
    expect(calculateScore(['plus', 'plus'], questions)).toBe(130n);
    expect(calculateScore(['plus', 'minus'], questions)).toBe(20n);
    expect(calculateScore(['plus'], questions)).toBe(130n);
    expect(calculateScore(['plus'], { ...questions, maximumScore: 120n })).toBe(120n);
  });
  it('rejects missing, duplicate and unknown questions', () => {
    expect(() => calculateScore([], { ...questions, questions: [] })).toThrow();
    expect(() => calculateScore([], { ...questions, questions: [questions.questions[0]!, questions.questions[0]!] })).toThrow();
    expect(() => calculateScore(['unknown'], questions)).toThrow();
  });
  it('detects normalized duplicates and counts user-perceived characters', () => {
    expect(validateParticipants([{ id: 'a', nickname: ' 가 ' }, { id: 'b', nickname: '가' }], inputs)).toHaveProperty('a');
    expect(validateParticipants([{ id: 'a', nickname: '👨‍👩‍👧‍👦'.repeat(20) }, rows[1]!], inputs)).toEqual({});
    expect(validateParticipants([{ id: 'a', nickname: '가'.repeat(21) }, rows[1]!], inputs)).toHaveProperty('a');
    expect(validateParticipants([{ id: 'a', nickname: '   ' }, rows[1]!], inputs)).toHaveProperty('a');
    expect(validateParticipants([rows[0]!], inputs)).toHaveProperty('count');
  });
  it.each(['', '0', '-1', '1.5', '1,000', '1e3', '100000000', '１２', ' 1 '])('rejects invalid amount %j', (raw) => {
    expect(() => parseAmount(raw, inputs)).toThrow();
  });
  it('accepts inclusive amount boundaries', () => {
    expect(parseAmount('1', inputs)).toBe(1n);
    expect(parseAmount('99999999', inputs)).toBe(99999999n);
  });
});

describe('weighted draw and settlement integrity', () => {
  it('allocates every integer ticket to precisely its weighted participant', () => {
    const counts = { a: 0, b: 0, c: 0 };
    for (let ticket = 0n; ticket < 300n; ticket++) counts[selectWinner(rows, ticket) as keyof typeof counts]++;
    expect(counts).toEqual({ a: 20, b: 100, c: 180 });
    expect(() => selectWinner(rows, -1n)).toThrow();
    expect(() => selectWinner(rows, 300n)).toThrow();
    expect(rows.some((row) => row.id === drawWinner(rows))).toBe(true);
  });
  it('uses the same weights for displayed sectors and probabilities', () => {
    expect(getRatios(rows).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(probabilityText(100n, 300n)).toBe('33.33%');
    expect(() => getRatios([rows[0]!, rows[0]!])).toThrow();
  });
  it('keeps restart and settlement pending', () => {
    expect(policy.restart).toBeNull();
    expect(calculateSettlement().status).toBe('pending');
  });
  it('accepts zero shares but rejects wrong sums, unknown IDs and negative amounts', () => {
    const shares = [{ participantId: 'a', amount: 0n }, { participantId: 'b', amount: 1n }, { participantId: 'c', amount: 0n }];
    expect(() => validateSettlement(1n, rows, shares)).not.toThrow();
    expect(() => validateSettlement(2n, rows, shares)).toThrow();
    expect(() => validateSettlement(1n, rows, [{ participantId: 'x', amount: 0n }, ...shares.slice(1)])).toThrow();
    expect(() => validateSettlement(1n, rows, [{ participantId: 'a', amount: -1n }, { participantId: 'b', amount: 2n }, shares[2]!])).toThrow();
  });
  it('projects only safe fields into sharing and rejects unsafe URLs', () => {
    const result = { kind: 'solo' as const, roundId: 1, participants: rows, winnerId: 'b' };
    const text = buildSoloShareText(result, 'https://example.com/app');
    expect(text).toContain('결제 담당자: 나');
    expect(text).toContain('33.33%');
    expect(text).not.toContain('selectedIds');
    expect(() => buildSoloShareText(result, 'https://example.com/?answers=private')).toThrow();
    expect(() => buildSoloShareText(result, 'javascript:alert(1)')).toThrow();
  });
});
