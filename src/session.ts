import { calculateScore, parseAmount, validateParticipants } from './domain';
import type { Answer, Mode, Participant, SoloResult, WeightedParticipant } from './domain';
import { policy } from './policy';
import type { Policy, QuestionPolicy } from './policy';
import { drawRecentQuestions } from './questions';
import type { QuestionDraw } from './questions';

export type Screen = 'mode' | 'participants' | 'amount' | 'handoff' | 'answering' | 'review' | 'roulette' | 'result' | 'sharing';
export interface Session {
  readonly screen: Screen;
  readonly mode: Mode | null;
  readonly participants: readonly Participant[];
  readonly amountDraft: string;
  readonly totalAmount: bigint | null;
  readonly roundId: number;
  readonly questionSetVersion: string | null;
  readonly questionPolicy: QuestionPolicy | null;
  readonly current: number;
  readonly draft: readonly string[];
  readonly rejectedDraft: readonly string[];
  readonly rerollsUsed: number;
  readonly answers: Readonly<Record<string, Answer>>;
  readonly result: SoloResult | null;
  readonly error: string;
}
export const initialSession: Session = {
  screen: 'mode', mode: null,
  participants: [{ id: 'participant-1', nickname: '' }, { id: 'participant-2', nickname: '' }],
  amountDraft: '', totalAmount: null, roundId: 0, current: 0,
  questionSetVersion: null, questionPolicy: null,
  draft: [], rejectedDraft: [], rerollsUsed: 0, answers: {}, result: null, error: '',
};
export type Action =
  | { type: 'mode'; mode: Mode }
  | { type: 'participants'; participants: readonly Participant[] }
  | { type: 'amount'; value: string }
  | { type: 'next' }
  | { type: 'start'; draw?: QuestionDraw }
  | { type: 'reveal' }
  | { type: 'toggle'; id: string }
  | { type: 'answer'; id: string; value: 'yes' | 'no' }
  | { type: 'reroll-question'; id: string }
  | { type: 'complete' }
  | { type: 'hide' }
  | { type: 'back' }
  | { type: 'review' }
  | { type: 'split-result' }
  | { type: 'result'; result: SoloResult }
  | { type: 'share' }
  | { type: 'edit-settings' }
  | { type: 'restart'; same: boolean; draw?: QuestionDraw }
  | { type: 'error'; message: string };

export function weightedParticipants(state: Session): readonly WeightedParticipant[] {
  return state.participants.map((row) => {
    const answer = state.answers[row.id];
    if (!answer) throw new Error('아직 차례를 마치지 않은 참가자가 있어요.');
    return { ...row, score: answer.score };
  });
}

function snapshotQuestions(config: QuestionPolicy, draw?: QuestionDraw): QuestionPolicy {
  const { randomPools } = config;
  if (randomPools && !draw) throw new Error('랜덤 질문을 다시 뽑아 주세요.');
  const questions = [...config.questions, ...(randomPools && draw ? drawRecentQuestions(randomPools, draw) : [])];
  const roundPolicy = { ...config, questions: questions.map((question) => ({ ...question })) };
  calculateScore([], roundPolicy);
  return roundPolicy;
}

/** 비동기 효과 없는 전이. 중복 완료·추첨·이전 라운드 결과 반영은 무시한다. */
export function sessionReducer(state: Session, action: Action, config: Policy = policy): Session {
  try {
    switch (action.type) {
      case 'mode':
        return state.screen === 'mode' ? { ...initialSession, mode: action.mode, screen: 'participants',
          participants: [{ id: 'participant-1', nickname: '' }, { id: 'participant-2', nickname: '' }] } : state;
      case 'participants':
        return state.screen === 'participants' && action.participants.length >= 2 && action.participants.length <= 12
          ? { ...state, participants: action.participants, error: '' } : state;
      case 'amount':
        return state.screen === 'amount' ? { ...state, amountDraft: action.value, error: '' } : state;
      case 'next':
        if (state.screen === 'participants' && state.mode === 'split' &&
          !Object.keys(validateParticipants(state.participants, config.inputs)).length) {
          return { ...state, screen: 'amount', error: '' };
        }
        return state;
      case 'start': {
        if ((state.screen !== 'participants' && state.screen !== 'amount') || !state.mode) return state;
        if (state.mode === 'split' && state.screen !== 'amount') return state;
        if (!config.questions || !config.inputs) throw new Error('질문과 입력 기준 확정 후 시작할 수 있어요.');
        if (Object.keys(validateParticipants(state.participants, config.inputs)).length) {
          throw new Error('참가자 입력을 확인해 주세요.');
        }
        return { ...state, screen: 'handoff', roundId: state.roundId + 1, current: 0,
          questionSetVersion: config.questions.version, questionPolicy: snapshotQuestions(config.questions, action.draw),
          participants: state.participants.map((row) => ({ ...row, nickname: config.inputs!.normalizeNickname(row.nickname) })),
          totalAmount: state.mode === 'split' ? parseAmount(state.amountDraft, config.inputs) : null,
          draft: [], rejectedDraft: [], rerollsUsed: 0, answers: {}, result: null, error: '' };
      }
      case 'reveal':
        return state.screen === 'handoff' && state.questionPolicy && state.participants[state.current]
          ? { ...state, screen: 'answering', error: '' } : state;
      case 'toggle':
        if (state.screen !== 'answering' || !state.questionPolicy?.questions.some((q) => q.id === action.id)) return state;
        return { ...state, draft: state.draft.includes(action.id)
          ? state.draft.filter((id) => id !== action.id) : [...state.draft, action.id], error: '' };
      case 'answer':
        if (state.screen !== 'answering' || !state.questionPolicy?.questions.some((q) => q.id === action.id)) return state;
        return { ...state,
          draft: action.value === 'yes' ? [...state.draft.filter((id) => id !== action.id), action.id] : state.draft.filter((id) => id !== action.id),
          rejectedDraft: action.value === 'no' ? [...state.rejectedDraft.filter((id) => id !== action.id), action.id] : state.rejectedDraft.filter((id) => id !== action.id), error: '' };
      case 'reroll-question': {
        if (state.screen !== 'answering' || state.rerollsUsed >= 3 ||
          !state.questionPolicy?.randomPools) return state;
        const questions = state.questionPolicy.questions;
        const index = questions.findIndex((question) => question.id === action.id);
        const current = questions[index];
        if (index < 2 || !current) return state;
        const pool = current.weight > 0n ? state.questionPolicy.randomPools.luck : state.questionPolicy.randomPools.misfortune;
        const usedIds = new Set(questions.filter((_, questionIndex) => questionIndex !== index).map(({ id }) => id));
        const candidates = pool.filter(({ id }) => !usedIds.has(id));
        const replacement = candidates[Math.floor(Math.random() * candidates.length)];
        if (!replacement) return state;
        const updated = [...questions];
        updated[index] = replacement;
        return { ...state, questionPolicy: { ...state.questionPolicy, questions: updated },
          draft: state.draft.filter((id) => id !== action.id),
          rejectedDraft: state.rejectedDraft.filter((id) => id !== action.id), rerollsUsed: state.rerollsUsed + 1, error: '' };
      }
      case 'complete': {
        if (state.screen !== 'answering' || !state.questionPolicy) return state;
        const participant = state.participants[state.current];
        if (!participant || state.answers[participant.id]) return state;
        const answers = { ...state.answers, [participant.id]: {
          selectedIds: [...state.draft], rejectedIds: [...state.rejectedDraft],
          score: calculateScore(state.draft, state.questionPolicy, state.mode),
        } };
        const last = state.current === state.participants.length - 1;
        return { ...state, answers, draft: [], rejectedDraft: [], rerollsUsed: 0, current: last ? state.current : state.current + 1,
          screen: last ? 'review' : 'handoff', error: '' };
      }
      case 'hide':
        return state.screen === 'answering' ? { ...state, screen: 'handoff', error: '' } : state;
      case 'review':
        if (state.screen !== 'review' || state.mode !== 'solo') return state;
        weightedParticipants(state); // 미완료 참가자를 자동 100점으로 채우지 않는다.
        return { ...state, screen: 'roulette', error: '' };
      case 'result': {
        if (state.screen !== 'roulette' || state.mode !== 'solo' || state.result ||
          action.result.kind !== 'solo' || action.result.roundId !== state.roundId) return state;
        const participants = weightedParticipants(state);
        if (new Set(participants.map((row) => row.id)).size !== participants.length ||
          action.result.participants.length !== participants.length ||
          participants.some((row, index) => {
            const received = action.result.participants[index];
            return !received || received.id !== row.id || received.score !== row.score || received.nickname !== row.nickname;
          }) || !participants.some((row) => row.id === action.result.winnerId)) return state;
        // 호출자 배열 참조 대신 현재 라운드에서 복제한 확정값을 저장한다.
        return { ...state, result: { kind: 'solo', roundId: state.roundId,
          winnerId: action.result.winnerId, participants }, error: '' };
      }
      case 'split-result':
        if (state.screen !== 'review' || state.mode !== 'split' || state.totalAmount === null) return state;
        weightedParticipants(state);
        return { ...state, screen: 'result', error: '' };
      case 'share':
        return state.screen === 'result' && state.result ? { ...state, screen: 'sharing' } : state;
      case 'back': {
        const previous: Partial<Record<Screen, Screen>> = {
          participants: 'mode', amount: 'participants', handoff: 'participants', answering: 'handoff', roulette: 'review', sharing: 'result',
        };
        const screen = previous[state.screen];
        return screen ? { ...state, screen, error: '' } : state;
      }
      case 'edit-settings':
        if (!['handoff', 'review'].includes(state.screen)) return state;
        return { ...state, screen: 'participants', roundId: state.roundId + 1, current: 0,
          questionSetVersion: null, questionPolicy: null, draft: [], rejectedDraft: [], rerollsUsed: 0, answers: {}, result: null, error: '' };
      case 'restart':
        if (!action.same) return { ...initialSession, roundId: state.roundId + 1 };
        if (state.screen !== 'result') return state;
        if (!state.mode || !config.questions || !config.inputs) throw new Error('질문과 입력 기준 확정 후 다시 진행할 수 있어요.');
        if (state.mode === 'split' && !config.restart) throw new Error('금액 유지 기준 확정 후 다시 진행할 수 있어요.');
        const needsAmount = state.mode === 'split' && !config.restart?.preserveAmount;
        return { ...state, screen: needsAmount ? 'amount' : 'handoff',
          amountDraft: needsAmount ? '' : state.amountDraft,
          totalAmount: needsAmount ? null : state.totalAmount,
          questionSetVersion: needsAmount ? null : config.questions.version,
          questionPolicy: needsAmount ? null : snapshotQuestions(config.questions, action.draw),
          roundId: state.roundId + 1, current: 0, draft: [], rejectedDraft: [], rerollsUsed: 0, answers: {}, result: null, error: '' };
      case 'error': return { ...state, error: action.message };
    }
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : '진행 정보를 확인해 주세요.' };
  }
}
