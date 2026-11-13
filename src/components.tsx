import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { drawWinner, getRatios } from './domain';
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
export function Roulette({ rows, roundId, winner, onHome, onResult, onError, onBusy }: {
  rows: readonly WeightedParticipant[]; roundId: number;
  winner?: string; onHome: () => void;
  onResult: (result: SoloResult) => void; onError: (message: string) => void; onBusy: (busy: boolean) => void;
}) {
  const frame = useRef<number | null>(null);
  const phase = useRef<'idle' | 'spinning' | 'stopping'>('idle');
  const angle = useRef(0);
  const wheel = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(phase.current);
  const spinSpeed = useRef(0.72);
  const stopDuration = 5000;
  const ratios = getRatios(rows);
  let cursor = 0;
  const segments = ratios.map((ratio, index) => {
    const start = cursor;
    cursor += ratio * 360;
    return { start, end: cursor, center: (start + cursor) / 2, color: colors[index] ?? '#6650a5' };
  });
  const background = `conic-gradient(${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(', ')})`;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  function rotate(degrees: number) {
    angle.current = degrees;
    if (wheel.current) wheel.current.style.transform = 'rotate(' + degrees + 'deg)';
  }

  function spin() {
    if (phase.current !== 'idle') return;
    phase.current = 'spinning';
    setStatus('spinning');
    onBusy(true);
    const started = performance.now();
    const speed = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.72 : 1.08;
    spinSpeed.current = speed;
    function tick(now: number) {
      rotate(((now - started) * speed) % 360);
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
  }

  function stop() {
    if (phase.current !== 'spinning') return;
    try {
      const winnerId = drawWinner(rows);
      const segment = segments[rows.findIndex((row) => row.id === winnerId)];
      if (!segment) throw new Error('룰렛 영역을 확인해 주세요.');
      const result: SoloResult = { kind: 'solo', roundId, winnerId, participants: rows.map((row) => ({ ...row })) };
      phase.current = 'stopping';
      setStatus('stopping');
      if (frame.current !== null) cancelAnimationFrame(frame.current);

      const start = angle.current;
      const target = 360 - segment.center;
      const speed = spinSpeed.current;
      const turns = Math.round((start + speed * stopDuration / 2 - target) / 360);
      const distance = target + turns * 360 - start;
      const exponent = speed * stopDuration / distance;
      const started = performance.now();
      function decelerate(now: number) {
        const progress = Math.min(1, Math.max(0, (now - started) / stopDuration));
        rotate(start + distance * (1 - (1 - progress) ** exponent));
        if (progress < 1) {
          frame.current = requestAnimationFrame(decelerate);
          return;
        }
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          onBusy(false);
          onResult(result);
        });
      }
      frame.current = requestAnimationFrame(decelerate);
    } catch (error) {
      onError(error instanceof Error ? error.message : '추첨을 준비하지 못했어요.');
    }
  }
  async function share() {
    if (!winner || !wheel.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 960;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이미지를 만들 수 없어요.');
      const theme = getComputedStyle(wheel.current);
      context.fillStyle = theme.getPropertyValue('--background').trim();
      context.fillRect(0, 0, 800, 960);
      context.fillStyle = theme.getPropertyValue('--text').trim();
      context.font = 'bold 44px system-ui';
      context.textAlign = 'center';
      context.fillText(winner + '님 당첨', 400, 110, 720);
      context.translate(400, 520);
      context.rotate(angle.current * Math.PI / 180);
      for (const [index, segment] of segments.entries()) {
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, 326, (segment.start - 90) * Math.PI / 180, (segment.end - 90) * Math.PI / 180);
        context.closePath();
        context.fillStyle = segment.color;
        context.fill();
        context.save();
        const radians = segment.center * Math.PI / 180;
        context.translate(210 * Math.sin(radians), -210 * Math.cos(radians));
        context.rotate((segment.center >= 180 ? segment.center - 270 : segment.center - 90) * Math.PI / 180);
        context.fillStyle = '#fff';
        context.font = 'bold 25px system-ui';
        context.textBaseline = 'middle';
        context.fillText(rows[index]?.nickname ?? '', 0, 0, 165);
        context.restore();
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(373, 176);
      context.lineTo(427, 176);
      context.lineTo(400, 231);
      context.fill();
      const png = canvas.toDataURL('image/png');
      const bytes = Uint8Array.from(atob(png.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
      const file = new File([bytes], 'roulette-result.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const link = document.createElement('a');
        link.href = png;
        link.download = file.name;
        link.click();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onError('룰렛 이미지를 공유하지 못했어요.');
    }
  }

  return <div className={winner ? 'roulette-stage roulette-finished' : 'roulette-stage'}>
    {winner && <h1 aria-live="polite">{winner}님 당첨</h1>}
    <div className="wheel-wrap">
      <div className="pointer" aria-hidden="true" />
      <div ref={wheel} className="wheel" style={{ background }} aria-hidden="true">
        {segments.map((segment, index) => {
          const participant = rows[index];
          if (!participant) return null;
          const radians = segment.center * Math.PI / 180;
          const labelAngle = segment.center >= 180 ? segment.center - 270 : segment.center - 90;
          return <span key={participant.id} className="wheel-nickname" style={{
            left: `${50 + 32 * Math.sin(radians)}%`,
            top: `${50 - 32 * Math.cos(radians)}%`,
            transform: `translate(-50%, -50%) rotate(${labelAngle}deg)`,
          }}>{participant.nickname}</span>;
        })}
      </div>
      {status === 'stopping' ? <span className="wheel-cap" aria-hidden="true" /> :
        <button type="button" className="wheel-control" onClick={status === 'idle' ? spin : stop}>
          {status === 'idle' ? 'START' : 'STOP'}
        </button>}
    </div>
    {winner && <div className="actions roulette-result-actions">
      <button type="button" onClick={onHome}>처음으로</button>
      <button type="button" className="primary" onClick={share}>공유하기</button>
    </div>}
  </div>;
}
