import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { drawWinner, formatInteger, getRatios, probabilityText } from './domain';
import type { SoloResult, WeightedParticipant } from './domain';
import { pendingPolicies } from './policy';

export function PolicyNotice({ ids }: { ids: readonly string[] }) {
  return <aside className="notice" aria-label="준비 중인 기능">
    <strong>기준 확정 후 이용할 수 있어요</strong>
    <ul>{pendingPolicies.filter(([id]) => ids.includes(id)).map(([id, text]) => <li key={id}><span className="policy-id">{id}</span> {text}</li>)}</ul>
  </aside>;
}

export function Actions({ children }: { children: ReactNode }) { return <div className="actions">{children}</div>; }

export function ConfirmRestart({ same, settings = false, amountBehavior, onCancel, onConfirm }: {
  same: boolean; settings?: boolean; amountBehavior?: 'preserve' | 'clear';
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const original = document.activeElement;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      dialog.current?.close();
      if (original instanceof HTMLElement) original.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="restart-title"
    aria-describedby={!settings && same && amountBehavior ? 'restart-description restart-amount' : 'restart-description'}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="restart-title">{settings ? '참가자 설정을 변경할까요?' : same ? '같은 참가자로 다시 진행할까요?' : '새로운 참가자로 시작할까요?'}</h2>
    <p id="restart-description">{settings
      ? '모드·참가자·입력 금액은 유지하고 참가자 설정으로 돌아가요. 현재 응답·점수·결과는 초기화해요.'
      : same
      ? '모드와 참가자 순서는 유지해요. 응답·점수·추첨 결과는 초기화하고 첫 참가자부터 시작해요.'
      : '모드·참가자·금액·응답·결과를 모두 초기화하고 모드 선택으로 이동해요.'}</p>
    {!settings && same && amountBehavior && <p id="restart-amount">{amountBehavior === 'preserve'
      ? 'N빵 총액은 유지해요.' : 'N빵 총액은 지우고 금액 입력부터 다시 진행해요.'}</p>}
    <div className="button-stack">
      <button ref={cancel} onClick={onCancel}>현재 진행 유지</button>
      <button className="primary" onClick={onConfirm}>{settings ? '응답을 초기화하고 설정 변경' : same ? '응답을 초기화하고 다시 진행' : '초기화하고 새로 시작'}</button>
    </div>
  </dialog>;
}

const colors = ['#6650a5', '#b75b39', '#326e68', '#8d4570', '#53632c', '#3f6688',
  '#8a5d23', '#615d82', '#8e433e', '#34735a', '#69523d', '#4f5775'];

/** 난수와 당첨자 고정은 사용자 클릭에서만. 회전은 같은 결과를 표현하는 효과다. */
export function Roulette({ rows, roundId, onResult, onError, onBusy }: {
  rows: readonly WeightedParticipant[]; roundId: number;
  onResult: (result: SoloResult) => void; onError: (message: string) => void; onBusy: (busy: boolean) => void;
}) {
  const fixed = useRef<SoloResult | null>(null);
  const published = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const ratios = getRatios(rows);
  const total = rows.reduce((sum, row) => sum + row.score, 0n);
  let cursor = 0;
  const segments = ratios.map((ratio, index) => {
    const start = cursor;
    cursor += ratio * 360;
    return { start, end: cursor, center: (start + cursor) / 2, color: colors[index] ?? '#6650a5' };
  });
  const background = `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`;

  // 최신 콜백을 참조하고 회전 중 재렌더로 타이머를 다시 만들지 않는다.
  const callbacks = useRef({ onResult, onBusy });
  callbacks.current = { onResult, onBusy };
  const publish = () => {
    if (!fixed.current || published.current) return;
    published.current = true;
    callbacks.current.onBusy(false);
    callbacks.current.onResult(fixed.current);
  };
  const finish = useRef(publish);
  finish.current = publish;
  useEffect(() => {
    const finishOnReturn = () => { if (document.visibilityState === 'visible' && fixed.current) finish.current(); };
    document.addEventListener('visibilitychange', finishOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', finishOnReturn);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);
  function spin() {
    if (fixed.current) return;
    try {
      const winnerId = drawWinner(rows);
      const index = rows.findIndex((row) => row.id === winnerId);
      const segment = segments[index];
      if (!segment) throw new Error('룰렛 영역을 확인해 주세요.');
      fixed.current = { kind: 'solo', roundId, winnerId, participants: rows.map((row) => ({ ...row })) };
      onBusy(true);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { publish(); return; }
      setSpinning(true);
      setRotation(360 * 5 + (360 - segment.center));
      // transitionend가 생략돼도 동일한 결과만 공개한다. 재추첨하지 않는다.
      timer.current = setTimeout(() => finish.current(), 4400);
    } catch (error) { onError(error instanceof Error ? error.message : '추첨을 준비하지 못했어요.'); }
  }
  return <>
    <div className="wheel-wrap" aria-hidden="true">
      <div className="pointer" />
      <div className={`wheel ${spinning ? 'spinning' : ''}`} style={{ background, transform: `rotate(${rotation}deg)` }}
        onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'transform') publish(); }}>
        {segments.map((segment, index) => segment.end - segment.start >= 18 && <span key={index} className="wheel-number" style={{
          left: `${50 + 36 * Math.sin(segment.center * Math.PI / 180)}%`,
          top: `${50 - 36 * Math.cos(segment.center * Math.PI / 180)}%`,
        }}>{index + 1}</span>)}
        <div className="wheel-hub" />
      </div>
    </div>
    <p className="muted">점수가 높을수록 룰렛 영역과 당첨 확률이 커져요. 표시 확률의 합은 반올림으로 100%와 다를 수 있어요.</p>
    <ol className="roster">{rows.map((row, index) => <li key={row.id}>
      <span className="number" style={{ borderColor: colors[index] }}>{index + 1}</span>
      <div><strong>{row.nickname}</strong><p>{formatInteger(row.score)}점 · {probabilityText(row.score, total)}</p></div>
    </li>)}</ol>
    <Actions><p role="status">{spinning ? '룰렛이 돌아가고 있어요.' : '시작하면 결제 담당자 한 명을 뽑아요.'}</p>
      <button className="primary" disabled={spinning} aria-busy={spinning} onClick={spin}>룰렛 돌리기</button></Actions>
  </>;
}
