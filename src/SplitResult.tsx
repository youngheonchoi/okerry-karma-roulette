import { useEffect, useRef, useState } from 'react';
import { allocateSettlement, formatInteger } from './domain';
import type { WeightedParticipant } from './domain';
import judgeImage from './settlement-judge.png';

export function SplitResult({ amount, participants, onHome }: {
  amount: bigint; participants: readonly WeightedParticipant[]; onHome: () => void;
}) {
  const [rows] = useState(() => allocateSettlement(amount, participants));
  const [revealed, setRevealed] = useState(-1);
  const [shareError, setShareError] = useState(false);
  const latestRow = useRef<HTMLLIElement>(null);
  const stamped = revealed > rows.length;
  const finished = revealed > rows.length + 1;
  useEffect(() => {
    if (finished) return;
    const delay = revealed < 0 ? 5000 : stamped ? 520 : revealed === 0 ? 180 : 500;
    const timer = window.setTimeout(() => setRevealed(revealed + 1), delay);
    return () => window.clearTimeout(timer);
  }, [revealed, finished, rows.length, stamped]);
  useEffect(() => {
    latestRow.current?.scrollIntoView({ block: 'nearest' });
  }, [revealed]);

  async function share() {
    setShareError(false);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 235 + rows.length * 72;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.fillStyle = '#fff8e8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#a2463b';
      ctx.lineWidth = 4;
      ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
      ctx.fillStyle = '#35281f';
      ctx.font = 'bold 46px system-ui';
      ctx.fillText('N빵 정산 계약서', 58, 95);
      ctx.font = '30px system-ui';
      ctx.fillText('총액 ' + formatInteger(amount) + '원', 58, 155);
      rows.forEach((row, index) => {
        const y = 215 + index * 72;
        ctx.fillText(row.nickname, 58, y, 350);
        ctx.textAlign = 'right';
        ctx.fillText(formatInteger(row.amount) + '원', 738, y, 260);
        ctx.textAlign = 'left';
      });
      const png = canvas.toDataURL('image/png');
      const bytes = Uint8Array.from(atob(png.split(',')[1] ?? ''), (char) => char.charCodeAt(0));
      const file = new File([bytes], 'split-result.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const link = document.createElement('a');
      link.href = png;
      link.download = file.name;
      link.click();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError(true);
    }
  }

  if (revealed < 0) return <section className="split-judge" role="status">
    <img src={judgeImage} alt="" />
    <h1>계산중이에요</h1>
  </section>;

  return <section className="split-verdict">
    <article className="split-contract" data-impact={finished || revealed === 0 ? undefined : revealed % 2}
      data-stamped={stamped}>
      <h1>N빵 정산 계약서</h1>
      <p>총액 <strong>{formatInteger(amount)}원</strong></p>
      <ul aria-live="polite">{rows.slice(0, revealed).map((row, index) =>
        <li key={row.participantId} ref={index === revealed - 1 ? latestRow : null}>
          <span>{row.nickname}</span><strong>{formatInteger(row.amount)}원</strong>
        </li>)}</ul>
      {stamped && <div className="split-stamp-position"><span className="split-stamp">확정</span></div>}
    </article>
    {finished && <div className="actions split-verdict-actions">
      <button type="button" onClick={onHome}>처음으로</button>
      <button type="button" className="primary" onClick={share}>공유하기</button>
    </div>}
    {shareError && <p role="alert">정산 이미지를 공유하지 못했어요.</p>}
  </section>;
}
