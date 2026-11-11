/** OPEN_QUESTIONS.md 결정 기록을 갱신한 뒤 승인된 값만 연결한다.
 * null은 미승인이다. UI나 URL로 승인 상태를 바꿀 수 없다.
 * 문서 권고안·예시 문항·개발용 기본값을 운영 정책으로 승격하지 않는다.
 */
export interface Question {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly weight: bigint;
}

export interface QuestionPolicy {
  readonly decision: string;
  readonly version: string;
  readonly questions: readonly Question[];
  /** null은 승인된 '상한 없음'. 미승인은 QuestionPolicy 자체가 null. */
  readonly maximumScore: bigint | null;
}

export interface InputPolicy {
  readonly decision: string;
  readonly maximumNicknameLength: number;
  readonly maximumAmount: bigint;
  readonly normalizeNickname: (raw: string) => string;
  readonly countCharacters: (value: string) => number;
}

export interface Policy {
  readonly questions: QuestionPolicy | null;
  readonly inputs: InputPolicy | null;
  readonly restart: { readonly decision: string; readonly preserveAmount: boolean } | null;
}

export const policy: Policy = {
  questions: null, // Q01: 최종 문항·점수 상한 미승인
  inputs: null, // Q05: 글자 수·정규화·금액 상한 미승인
  restart: null, // Q06: 재진행 금액 유지 미승인
};

export const pendingPolicies = [
  ['Q01', '질문과 점수 기준을 검토하고 있어요. 확정 전에는 응답을 시작할 수 없어요.'],
  ['Q02', '금액 배분 방식을 검토하고 있어요. 정산 금액은 아직 제공하지 않아요.'],
  ['Q03', '질문 공개 범위를 검토하고 있어요. 결과에 질문을 표시하지 않아요.'],
  ['Q04', '완료한 응답의 수정 방식을 검토하고 있어요. 이전 응답은 다시 열지 않아요.'],
  ['Q05', '닉네임과 금액의 입력 기준을 검토하고 있어요. 입력값은 초안으로만 다뤄요.'],
  ['Q06', '새로고침 복구와 재진행 금액 유지 기준을 검토하고 있어요. 저장·복구는 제공하지 않아요.'],
  ['Q07', '공유 방식과 서비스 링크를 확인하고 있어요. 공유·복사는 아직 제공하지 않아요.'],
  ['Q08', '웹 화면을 먼저 준비했어요. 앱인토스 연결은 추가 확인이 필요해요.'],
] as const;
