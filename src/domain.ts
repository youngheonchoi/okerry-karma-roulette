import type { InputPolicy, QuestionPolicy } from './policy';

export type Mode = 'solo' | 'split';
export interface Participant { readonly id: string; readonly nickname: string }
export interface Answer { readonly selectedIds: readonly string[]; readonly rejectedIds: readonly string[]; readonly score: bigint }
export interface WeightedParticipant extends Participant { readonly score: bigint }
export interface SoloResult {
  readonly kind: 'solo';
  readonly roundId: number;
  readonly participants: readonly WeightedParticipant[];
  readonly winnerId: string;
}
export type Settlement = { readonly status: 'pending'; readonly policyId: 'Q02'; readonly message: string };

export function calculateScore(selectedIds: readonly string[], config: QuestionPolicy, mode: Mode | null = null): bigint {
  if (!config.decision || !config.version || config.questions.length === 0) {
    throw new Error('질문과 점수 기준의 승인을 확인하지 못했어요.');
  }
  const questions = new Map(config.questions.map((question) => [question.id, question]));
  if (questions.size !== config.questions.length || config.questions.some((q) => !q.id || !q.text || !q.category)) {
    throw new Error('질문 구성이 올바르지 않아요. 설정을 확인해 주세요.');
  }
  let score = 100n;
  const weightMultiplier = mode === 'solo' ? 2n : 1n;
  for (const id of new Set(selectedIds)) {
    const question = questions.get(id);
    if (!question) throw new Error('알 수 없는 질문이 있어요. 질문 구성을 확인해 주세요.');
    score += question.weight * weightMultiplier;
  }
  score = score < 20n ? 20n : score;
  if (config.maximumScore !== null) {
    if (config.maximumScore < 100n) throw new Error('점수 상한 설정을 확인해 주세요.');
    score = score > config.maximumScore ? config.maximumScore : score;
  }
  return score;
}

export function validateParticipants(rows: readonly Participant[], config: InputPolicy | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (rows.length < 2 || rows.length > 12) errors.count = '참가자는 2명부터 12명까지 등록해 주세요.';
  const names = rows.map((row) => config ? config.normalizeNickname(row.nickname) : row.nickname);
  rows.forEach((row, index) => {
    const name = names[index] ?? '';
    if (!name.trim()) errors[row.id] = '닉네임을 입력해 주세요.';
    else if (names.filter((candidate) => candidate === name).length > 1) errors[row.id] = '같은 닉네임이 있어요. 다른 이름을 입력해 주세요.';
    else if (config && config.countCharacters(name) > config.maximumNicknameLength) {
      errors[row.id] = `닉네임은 ${config.maximumNicknameLength}자까지 입력해 주세요.`;
    }
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length) errors.count = '참가자 정보가 겹쳐요. 명단을 다시 설정해 주세요.';
  return errors;
}

/** 입력 버퍼는 그대로 보존한다. 쉼표는 자동 제거하지 않으며 별도 표시만 한다. */
export function parseAmount(raw: string, config: InputPolicy | null): bigint {
  if (!/^[0-9]+$/.test(raw)) throw new Error('금액을 입력해 주세요.');
  const amount = BigInt(raw);
  if (amount <= 0n) throw new Error('금액은 1원 이상 입력해 주세요.');
  if (config && amount > config.maximumAmount) throw new Error(`금액은 ${formatInteger(config.maximumAmount)}원 이하로 입력해 주세요.`);
  return amount;
}

export function formatInteger(value: bigint): string { return value.toLocaleString('ko-KR'); }

function totalScore(rows: readonly WeightedParticipant[]): bigint {
  if (rows.length < 2 || rows.length > 12 || rows.some((row) => row.score < 20n) ||
    new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('참가자 점수 정보를 확인해 주세요.');
  }
  return rows.reduce((sum, row) => sum + row.score, 0n);
}

export function probabilityText(score: bigint, total: bigint): string {
  if (score <= 0n || total < score) throw new Error('점수 비율을 확인해 주세요.');
  const hundredths = (score * 10000n + total / 2n) / total;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}%`;
}

/** 부동소수점·표시 확률 대신 정수 누적 구간으로 당첨자를 결정한다. */
export function selectWinner(rows: readonly WeightedParticipant[], ticket: bigint): string {
  const total = totalScore(rows);
  if (ticket < 0n || ticket >= total) throw new Error('추첨 값의 범위를 확인해 주세요.');
  let end = 0n;
  for (const row of rows) {
    end += row.score;
    if (ticket < end) return row.id;
  }
  throw new Error('추첨 결과를 확인하지 못했어요.');
}

/** 나머지 편향을 피하는 rejection sampling. 실행 시 사용자 시작 동작에서만 호출. */
export function drawWinner(rows: readonly WeightedParticipant[]): string {
  const total = totalScore(rows);
  const bits = total.toString(2).length;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  for (let attempt = 0; attempt < 128; attempt += 1) {
    crypto.getRandomValues(bytes);
    const first = bytes[0];
    if (first === undefined) throw new Error('추첨 값을 준비하지 못했어요.');
    bytes[0] = first & (0xff >>> (bytes.length * 8 - bits));
    const ticket = bytes.reduce((sum, byte) => (sum << 8n) + BigInt(byte), 0n);
    if (ticket < total) return selectWinner(rows, ticket);
  }
  throw new Error('추첨 값을 준비하지 못했어요. 다시 시도해 주세요.');
}

export function getRatios(rows: readonly WeightedParticipant[]): readonly number[] {
  const total = totalScore(rows);
  // 시각화만 소수로 변환한다. 추첨은 위 정수 경로만 사용한다.
  const ratios = rows.map((row) => Number(row.score) / Number(total));
  if (ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)) {
    throw new Error('룰렛 영역을 정확히 표시할 수 없어요. 점수 범위를 확인해 주세요.');
  }
  return ratios;
}

/** Q02 승인 전 어떤 배분안도 실행하지 않는다. 정상 금액 배열도 만들지 않는다. */
export function calculateSettlement(): Settlement {
  return { status: 'pending', policyId: 'Q02', message: '금액 배분 방식을 검토하고 있어요. 정산 결과는 아직 제공하지 않아요.' };
}

export interface SettlementRow { readonly participantId: string; readonly amount: bigint }

export function allocateSettlement(totalAmount: bigint, rows: readonly WeightedParticipant[]) {
  const total = totalScore(rows);
  const shares = rows.map((row) => {
    const weighted = totalAmount * row.score;
    return { participantId: row.id, nickname: row.nickname, amount: weighted / total, remainder: weighted % total };
  });
  const remaining = totalAmount - shares.reduce((sum, row) => sum + row.amount, 0n);
  [...shares].sort((a, b) => a.remainder > b.remainder ? -1 : a.remainder < b.remainder ? 1 : 0)
    .slice(0, Number(remaining)).forEach((row) => { row.amount += 1n; });
  validateSettlement(totalAmount, rows, shares);
  return shares;
}

/** 승인된 배분기가 추가돼도 이 검증을 통과한 배열만 결과·공유에 사용할 수 있다. */
export function validateSettlement(totalAmount: bigint, participants: readonly Participant[], rows: readonly SettlementRow[]): void {
  const ids = new Set(participants.map((row) => row.id));
  if (totalAmount <= 0n || participants.length < 2 || participants.length > 12 ||
    ids.size !== participants.length || rows.length !== participants.length ||
    new Set(rows.map((row) => row.participantId)).size !== ids.size ||
    rows.some((row) => !ids.has(row.participantId) || row.amount < 0n) ||
    rows.reduce((sum, row) => sum + row.amount, 0n) !== totalAmount) {
    throw new Error('정산 금액이 총액과 일치하지 않아요. 배분 기준을 확인해 주세요.');
  }
}

/** 공유용 projection에는 질문·응답을 받을 필드 자체를 두지 않는다. Q07 UI 연결은 보류. */
export function buildSoloShareText(result: SoloResult, serviceUrl: string): string {
  const url = new URL(serviceUrl);
  if ((url.protocol !== 'https:' && url.protocol !== 'intoss:') || url.search || url.hash || url.username || url.password) {
    throw new Error('확인된 서비스 진입 링크를 설정해 주세요.');
  }
  const winner = result.participants.find((row) => row.id === result.winnerId);
  if (!winner) throw new Error('확정된 결과를 찾지 못했어요.');
  const total = totalScore(result.participants);
  return ['업보 룰렛 결과', `참가자: ${result.participants.map((row) => row.nickname).join(', ')}`,
    `결제 담당자: ${winner.nickname}`, `점수: ${formatInteger(winner.score)}점`,
    `당첨 확률: ${probabilityText(winner.score, total)}`, serviceUrl].join('\n');
}
