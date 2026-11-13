import { describe, expect, it } from 'vitest';
import { initialSession, sessionReducer, weightedParticipants } from './session';
import type { Action, Session } from './session';
import type { Policy } from './policy';

const config: Policy = {
  questions: { decision: 'test-only', version: 'fixture', maximumScore: null,
    questions: [{ id: 'test', category: 'fixture', text: 'Fixture question', weight: 30n }] },
  inputs: { decision: 'test-only', maximumNicknameLength: 20, maximumAmount: 99999999n,
    normalizeNickname: (s) => s.trim().normalize('NFC'), countCharacters: (s) => [...s].length },
  restart: { decision: 'test-only', preserveAmount: true },
};
const reduce = (state: Session, action: Action) => sessionReducer(state, action, config);
function start(mode: 'solo' | 'split' = 'solo') {
  let state = reduce(initialSession, { type: 'mode', mode });
  state = reduce(state, { type: 'participants', participants: [{ id: 'a', nickname: ' 가 ' }, { id: 'b', nickname: '나' }] });
  if (mode === 'split') {
    state = reduce(state, { type: 'next' });
    state = reduce(state, { type: 'amount', value: '10001' });
  }
  return reduce(state, { type: 'start' });
}
function completeRound() {
  let state = start();
  state = reduce(state, { type: 'reveal' });
  state = reduce(state, { type: 'toggle', id: 'test' });
  state = reduce(state, { type: 'complete' });
  state = reduce(state, { type: 'reveal' });
  return reduce(state, { type: 'complete' });
}
function resultState() {
  const state = reduce(completeRound(), { type: 'review' });
  return reduce(state, { type: 'result', result: { kind: 'solo', roundId: state.roundId,
    winnerId: 'a', participants: weightedParticipants(state) } });
}

describe('session lifecycle and privacy', () => {
  it('blocks sessions when policy decisions are absent', () => {
    const draft = { ...initialSession, screen: 'participants' as const, mode: 'solo' as const,
      participants: [{ id: 'a', nickname: '가' }, { id: 'b', nickname: '나' }] };
    const state = sessionReducer(draft, { type: 'start' }, { questions: null, inputs: null, restart: null });
    expect(state.screen).toBe('participants');
    expect(state.error).not.toBe('');
    expect(state.questionPolicy).toBeNull();
  });
  it('draws five shared questions per round and draws again on restart', () => {
    const draft = { ...initialSession, screen: 'participants' as const, mode: 'solo' as const,
      participants: [{ id: 'a', nickname: '가' }, { id: 'b', nickname: '나' }] };
    let state = sessionReducer(draft, { type: 'start', draw: [0.1, 0, 0, 0] });
    const questions = state.questionPolicy!.questions;
    expect(questions.map(({ weight }) => weight)).toEqual([-15n, -20n, 10n, 10n, -10n]);
    expect(new Set(questions.map(({ id }) => id)).size).toBe(5);
    state = sessionReducer(state, { type: 'reveal' });
    state = sessionReducer(state, { type: 'toggle', id: questions[0]!.id });
    state = sessionReducer(state, { type: 'complete' });
    state = sessionReducer(state, { type: 'reveal' });
    expect(state.questionPolicy?.questions).toBe(questions);
    expect(state.draft).toEqual([]);
    state = sessionReducer(state, { type: 'complete' });
    expect(weightedParticipants(state).map(({ score }) => score)).toEqual([70n, 100n]);
    state = sessionReducer({ ...state, screen: 'result' }, { type: 'restart', same: true, draw: [0.9, 0, 0, 0] });
    expect(state.questionPolicy?.questions.map(({ weight }) => weight)).toEqual([-15n, -20n, 10n, -10n, -10n]);
    expect(state.answers).toEqual({});
  });
  it('normalizes names and freezes the question set for a round', () => {
    const state = start();
    expect(state.participants[0]?.nickname).toBe('가');
    expect(state.questionPolicy).not.toBe(config.questions);
    expect(state.questionPolicy?.questions[0]).not.toBe(config.questions?.questions[0]);
    expect(state.totalAmount).toBeNull();
  });
  it('conceals draft answers and only reveals them after the current person is ready', () => {
    let state = reduce(start(), { type: 'reveal' });
    state = reduce(state, { type: 'toggle', id: 'test' });
    state = reduce(state, { type: 'back' });
    expect(state.screen).toBe('handoff');
    expect(state.current).toBe(0);
    expect(state.draft).toEqual(['test']);
    expect(reduce(state, { type: 'reveal' }).screen).toBe('answering');
    state = reduce(reduce(state, { type: 'reveal' }), { type: 'complete' });
    expect(state.current).toBe(1);
    expect(state.draft).toEqual([]);
    expect(reduce(state, { type: 'complete' })).toBe(state);
  });
  it('keeps empty completed answers distinct from unfinished responses', () => {
    expect(() => weightedParticipants(start())).toThrow();
    const state = completeRound();
    expect(state.screen).toBe('review');
    expect(weightedParticipants(state).map((row) => row.score)).toEqual([160n, 100n]);
    expect(reduce(state, { type: 'back' })).toBe(state);
  });
  it('returns to settings only on explicit confirmation and clears private round data', () => {
    const state = reduce(completeRound(), { type: 'edit-settings' });
    expect(state.screen).toBe('participants');
    expect(state.participants.map((row) => row.nickname)).toEqual(['가', '나']);
    expect(state.answers).toEqual({});
    expect(state.questionPolicy).toBeNull();
    const split = reduce(start('split'), { type: 'edit-settings' });
    expect(split.amountDraft).toBe('10001');
    expect(split.totalAmount).toBe(10001n);
  });
  it('rejects missing, reordered, forged and stale draw snapshots', () => {
    const state = reduce(completeRound(), { type: 'review' });
    const result = { kind: 'solo' as const, roundId: state.roundId, winnerId: 'a', participants: weightedParticipants(state) };
    for (const invalid of [
      { ...result, roundId: result.roundId - 1 }, { ...result, winnerId: 'unknown' },
      { ...result, participants: [...result.participants].reverse() },
      { ...result, participants: result.participants.slice(1) },
      { ...result, participants: result.participants.map((row) => ({ ...row, score: 999n })) },
    ]) expect(reduce(state, { type: 'result', result: invalid })).toBe(state);
    const final = reduce(state, { type: 'result', result });
    expect(final.screen).toBe('result');
    expect(final.result?.participants).not.toBe(result.participants);
    expect(reduce(final, { type: 'result', result: { ...result, winnerId: 'b' } })).toBe(final);
  });
  it('returns from sharing to the exact same result', () => {
    const state = resultState();
    const shared = reduce(state, { type: 'share' });
    const back = reduce(shared, { type: 'back' });
    expect(back.screen).toBe('result');
    expect(back.result).toBe(state.result);
    expect(back.roundId).toBe(state.roundId);
  });
  it('starts a fresh round for the same group and clears everything for a new group', () => {
    const result = resultState();
    const same = reduce(result, { type: 'restart', same: true });
    expect(same.screen).toBe('handoff');
    expect(same.participants).toEqual(result.participants);
    expect(same.roundId).toBeGreaterThan(result.roundId);
    expect(same.answers).toEqual({});
    expect(same.result).toBeNull();
    const fresh = reduce(same, { type: 'restart', same: false });
    expect(fresh.mode).toBeNull();
    expect(fresh.totalAmount).toBeNull();
    expect(fresh.participants.every((row) => row.nickname === '')).toBe(true);
  });
  it('uses the approved amount-retention setting without preserving answers', () => {
    const result = { ...start('split'), screen: 'result' as const };
    const kept = reduce(result, { type: 'restart', same: true });
    expect(kept.totalAmount).toBe(10001n);
    expect(kept.screen).toBe('handoff');
    const cleared = sessionReducer(result, { type: 'restart', same: true },
      { ...config, restart: { decision: 'test-only', preserveAmount: false } });
    expect(cleared.screen).toBe('amount');
    expect(cleared.totalAmount).toBeNull();
    expect(cleared.amountDraft).toBe('');
  });
});
