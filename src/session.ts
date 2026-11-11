import { calculateScore, parseAmount, validateParticipants } from './domain';
import type { Answer, Mode, Participant, SoloResult, WeightedParticipant } from './domain';
import { policy } from './policy';
import type { QuestionPolicy } from './policy';

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
  readonly answers: Readonly<Record<string, Answer>>;
  readonly result: SoloResult | null;
  readonly error: string;
}
export const initialSession: Session = {
  screen: 'mode', mode: null,
  participants: [{ id: 'participant-1', nickname: '' }, { id: 'participant-2', nickname: '' }],
  amountDraft: '', totalAmount: null, roundId: 0, current: 0,
  questionSetVersion: null, questionPolicy: null,
  draft: [], answers: {}, result: null, error: '',
};
export type Action =
  | { type: 'mode'; mode: Mode }
  | { type: 'participants'; participants: readonly Participant[] }
  | { type: 'amount'; value: string }
  | { type: 'next' }
  | { type: 'start' }
  | { type: 'reveal' }
  | { type: 'toggle'; id: string }
  | { type: 'complete' }
  | { type: 'hide' }
  | { type: 'back' }
  | { type: 'review' }
  | { type: 'split-result' }
  | { type: 'result'; result: SoloResult }
  | { type: 'share' }
  | { type: 'restart'; same: boolean }
  | { type: 'error'; message: string };

export function weightedParticipants(state: Session): readonly WeightedParticipant[] {
  return state.participants.map((row) => {
    const answer = state.answers[row.id];
    if (!answer) throw new Error('아직 차례를 마치지 않은 참가자가 있어요.');
    return { ...row, score: answer.score };
  });
}

function snapshotQuestions(config: QuestionPolicy): QuestionPolicy {
  return { ...config, questions: config.questions.map((question) => ({ ...question })) };
}

/** 비동기 효과 없는 전이. 중복 완료·추첨·이전 라운드 결과 반영은 무시한다. */
export function sessionReducer(state: Session, action: Action): Session {
  try {
    switch (action.type) {
      case 'mode':
        return state.screen === 'mode' ? { ...state, mode: action.mode, error: '' } : state;
      case 'participants':
        return state.screen === 'participants' && action.participants.length >= 2 && action.participants.length <= 12
          ? { ...state, participants: action.participants, error: '' } : state;
      case 'amount':
        return state.screen === 'amount' ? { ...state, amountDraft: action.value, error: '' } : state;
      case 'next':
        if (state.screen === 'mode' && state.mode) return { ...state, screen: 'participants', error: '' };
        if (state.screen === 'participants' && state.mode === 'split' &&
          !Object.keys(validateParticipants(state.participants, policy.inputs)).length) {
          return { ...state, screen: 'amount', error: '' };
        }
        return state;
      case 'start': {
        if ((state.screen !== 'participants' && state.screen !== 'amount') || !state.mode) return state;
        if (state.mode === 'split' && state.screen !== 'amount') return state;
        if (!policy.questions || !policy.inputs) throw new Error('질문과 입력 기준 확정 후 시작할 수 있어요.');
        if (Object.keys(validateParticipants(state.participants, policy.inputs)).length) {
          throw new Error('참가자 입력을 확인해 주세요.');
        }
        calculateScore([], policy.questions); // 문항 구성을 검증한 뒤 라운드를 만든다.
        return { ...state, screen: 'handoff', roundId: state.roundId + 1, current: 0,
          questionSetVersion: policy.questions.version, questionPolicy: snapshotQuestions(policy.questions),
          participants: state.participants.map((row) => ({ ...row, nickname: policy.inputs!.normalizeNickname(row.nickname) })),
          totalAmount: state.mode === 'split' ? parseAmount(state.amountDraft, policy.inputs) : null,
          draft: [], answers: {}, result: null, error: '' };
      }
      case 'reveal':
        return state.screen === 'handoff' && state.questionPolicy && state.participants[state.current]
          ? { ...state, screen: 'answering', error: '' } : state;
      case 'toggle':
        if (state.screen !== 'answering' || !state.questionPolicy?.questions.some((q) => q.id === action.id)) return state;
        return { ...state, draft: state.draft.includes(action.id)
          ? state.draft.filter((id) => id !== action.id) : [...state.draft, action.id], error: '' };
      case 'complete': {
        if (state.screen !== 'answering' || !state.questionPolicy) return state;
        const participant = state.participants[state.current];
        if (!participant || state.answers[participant.id]) return state;
        const answers = { ...state.answers, [participant.id]: {
          selectedIds: [...state.draft], score: calculateScore(state.draft, state.questionPolicy),
        } };
        const last = state.current === state.participants.length - 1;
        return { ...state, answers, draft: [], current: last ? state.current : state.current + 1,
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
          winnerId: action.result.winnerId, participants }, screen: 'result', error: '' };
      }
      case 'split-result':
        if (state.screen !== 'review' || state.mode !== 'split' || state.totalAmount === null) return state;
        weightedParticipants(state);
        return { ...state, screen: 'result', error: '' };
      case 'share':
        return state.screen === 'result' && state.result ? { ...state, screen: 'sharing' } : state;
      case 'back': {
        const previous: Partial<Record<Screen, Screen>> = {
          participants: 'mode', amount: 'participants', answering: 'handoff', roulette: 'review', sharing: 'result',
        };
        const screen = previous[state.screen];
        return screen ? { ...state, screen, error: '' } : state;
      }
      case 'restart':
        if (!action.same) return { ...initialSession, roundId: state.roundId + 1 };
        if (!state.mode || !policy.questions || !policy.inputs) return state;
        if (state.mode === 'split' && !policy.restart) throw new Error('금액 유지 기준 확정 후 다시 진행할 수 있어요.');
        return { ...state, screen: state.mode === 'split' && !policy.restart?.preserveAmount ? 'amount' : 'handoff',
          amountDraft: state.mode === 'split' && !policy.restart?.preserveAmount ? '' : state.amountDraft,
          totalAmount: state.mode === 'split' && !policy.restart?.preserveAmount ? null : state.totalAmount,
          questionSetVersion: policy.questions.version, questionPolicy: snapshotQuestions(policy.questions),
          roundId: state.roundId + 1, current: 0, draft: [], answers: {}, result: null, error: '' };
      case 'error': return { ...state, error: action.message };
    }
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : '진행 정보를 확인해 주세요.' };
  }
}
