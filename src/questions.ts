import type { Question } from './policy';

export const fixedQuestions: readonly Question[] = [
  { id: 'early', category: '오늘 모임', text: '오늘 약속 시간보다 미리 도착했다', weight: -15n },
  { id: 'organizer', category: '오늘 모임', text: '오늘 약속 계획이나 예약을 맡았다', weight: -20n },
];

export const recentCategory = '최근 3개월';

export const luckQuestions = [
  '응모한 경품이나 이벤트에 당첨됐다',
  '잃어버린 물건을 다시 찾았다',
  '주문한 것에 무료 서비스가 따라왔다',
  '매진됐던 공연이나 행사의 취소표를 구했다',
  '길을 나서기 전에 비가 그쳤다',
  '다 쓴 줄 알았던 기프티콘이 남아 있었다',
  '찾던 물건을 사러 갔는데 딱 하나 남아 있었다',
  '예약 없이 갔는데 자리가 바로 났다',
  '오래 안 입은 옷 주머니에서 돈을 찾았다',
  '잊고 있던 포인트나 쿠폰을 결제할 때 발견했다',
  '버스 정류장에 도착하자마자 타려던 버스가 왔다',
  '떨어뜨린 물건을 누군가 주워서 돌려줬다',
].map((text, index): Question => ({ id: `luck-${index + 1}`, category: recentCategory, text, weight: 10n }));

export const misfortuneQuestions = [
  '주문한 것과 다른 물건을 받았다',
  '우산을 두고 나갔다가 비를 맞았다',
  '타려던 버스나 지하철을 눈앞에서 놓쳤다',
  '가게에 도착했는데 문이 닫혀 있었다',
  '쓰려고 꺼낸 쿠폰의 유효기간이 지나 있었다',
  '밖에서 휴대폰 배터리가 다 됐다',
  '신고 나간 신발 끈이 끊어졌다',
  '새로 산 물건을 개봉했는데 고장 나 있었다',
  '들고 가던 봉투가 찢어져 물건이 떨어졌다',
  '버스나 지하철에서 내릴 곳을 지나쳤다',
  '집에 돌아와서야 산 물건이 하나 빠진 걸 알았다',
  '엘리베이터가 고장 나 계단으로 올라갔다',
].map((text, index): Question => ({ id: `misfortune-${index + 1}`, category: recentCategory, text, weight: -10n }));

export type QuestionDraw = readonly [number, number, number, number];

export function newQuestionDraw(): QuestionDraw {
  return [Math.random(), Math.random(), Math.random(), Math.random()];
}

export function drawRecentQuestions(
  pools: { readonly luck: readonly Question[]; readonly misfortune: readonly Question[] },
  [balance, ...rolls]: QuestionDraw,
): Question[] {
  const luckCount = balance < 0.5 ? 2 : 1;
  const luck = [...pools.luck];
  const misfortune = [...pools.misfortune];
  return rolls.map((roll, index) => {
    const pool = index < luckCount ? luck : misfortune;
    const [question] = pool.splice(Math.floor(roll * pool.length), 1);
    if (!question) throw new Error('랜덤 질문을 구성할 수 없어요.');
    return question;
  });
}
