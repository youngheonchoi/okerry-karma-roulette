import { useEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Actions, ConfirmRestart, PolicyNotice, Roulette } from './components';
import { calculateScore, calculateSettlement, formatInteger, getRatios, parseAmount, probabilityText, validateParticipants } from './domain';
import { policy } from './policy';
import { initialSession, sessionReducer, weightedParticipants } from './session';
import type { Action, Session } from './session';
import type { Participant } from './domain';
import { useBrowserBack } from './useBrowserBack';
import { ModeArtwork } from './ModeArtwork';

const titles = {
  mode: '오늘 계산\n업보로 정해볼까요?', participants: '함께할 사람을 알려 주세요', amount: '얼마를 나눌까요?',
  handoff: '휴대폰을 전달해 주세요', answering: '나에게 해당하는 항목을 골라요', review: '모두 차례를 마쳤어요',
  roulette: '누가 계산하게 될까요?', result: '오늘의 정산 결과', sharing: '공유 내용을 확인해 주세요',
};
const randomNames = ['월급 루팡', '지각 대장', '통장 텅장', '운 좋은 사람', '오늘의 호구', '회식 요정', '야근 전문가', '카드값 폭탄', '간식 대장', '막차 수호자', '약속 시간왕', '커피 수혈러'];

export function App() {
  const [state, dispatch] = useReducer((state: Session, action: Action) => sessionReducer(state, action), initialSession);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restart, setRestart] = useState<boolean | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const participantSubmitAttempted = useRef(false);
  const nextId = useRef(3);
  const current = state.participants[state.current];
  const canStart = policy.questions !== null && policy.inputs !== null;
  const modeName = state.mode === 'solo' ? '독박 룰렛' : '업보 N빵 룰렛';
  const activeScreen = useRef(state.screen);
  activeScreen.current = state.screen;

  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
    setErrors({});
    if (state.screen === 'participants') participantSubmitAttempted.current = false;
  }, [state.screen, state.current]);
  useEffect(() => {
    function conceal() {
      if (activeScreen.current === 'answering') flushSync(() => dispatch({ type: 'hide' }));
    }
    const visibility = () => { if (document.visibilityState === 'hidden') conceal(); };
    window.addEventListener('blur', conceal);
    window.addEventListener('pagehide', conceal);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', conceal);
      window.removeEventListener('pagehide', conceal);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  function showErrors(found: Record<string, string>) {
    setErrors(found);
    const first = state.participants.find((row) => found[row.id]);
    requestAnimationFrame(() => document.getElementById(first ? `name-${first.id}` : 'amount')?.focus());
  }
  function nextFromParticipants() {
    participantSubmitAttempted.current = true;
    const found = validateParticipants(state.participants, policy.inputs);
    if (Object.keys(found).length) { showErrors(found); return; }
    dispatch({ type: state.mode === 'split' ? 'next' : 'start' });
  }
  function updateParticipants(rows: readonly Participant[], changedId: string) {
    const normalize = policy.inputs?.normalizeNickname ?? ((value: string) => value);
    const changedNames = new Set([...state.participants, ...rows]
      .filter((row) => row.id === changedId).map((row) => normalize(row.nickname)).filter((name) => name.trim()));
    const affectedIds = new Set([...state.participants, ...rows]
      .filter((row) => row.id === changedId || changedNames.has(normalize(row.nickname))).map((row) => row.id));
    const found = validateParticipants(rows, policy.inputs);
    dispatch({ type: 'participants', participants: rows });
    setErrors((previous) => {
      const next = { ...previous };
      // 수정 전후 이름의 중복 관계와 인원수만 갱신한다. 다른 필드 오류는 유지한다.
      for (const id of affectedIds) {
        delete next[id];
        if (participantSubmitAttempted.current && found[id]) next[id] = found[id];
      }
      delete next.count;
      if (found.count) next.count = found.count;
      return next;
    });
  }
  function randomizeNames() {
    const names = [...randomNames];
    for (let index = names.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [names[index], names[swapIndex]] = [names[swapIndex]!, names[index]!];
    }
    updateParticipants(state.participants.map((row, index) => ({ ...row, nickname: names[index]! })), state.participants[0]?.id ?? '');
  }
  function editAmount(key: string) {
    const currentAmount = state.amountDraft;
    if (key === 'clear') dispatch({ type: 'amount', value: '' });
    else if (key === 'delete') dispatch({ type: 'amount', value: currentAmount.slice(0, -1) });
    else if (key.startsWith('+')) {
      const addition = BigInt(key.slice(1));
      const current = /^[0-9]+$/.test(currentAmount) ? BigInt(currentAmount) : 0n;
      dispatch({ type: 'amount', value: (current + addition).toString() });
    } else dispatch({ type: 'amount', value: `${currentAmount}${key}` });
    setErrors((previous) => { const next = { ...previous }; delete next.amount; return next; });
  }
  function remove(id: string) {
    if (state.participants.length <= 2) return;
    const index = state.participants.findIndex((row) => row.id === id);
    if (index < 0) return;
    const rows = state.participants.filter((row) => row.id !== id);
    updateParticipants(rows, id);
    requestAnimationFrame(() => {
      const neighbor = rows[Math.min(index, rows.length - 1)];
      document.getElementById(neighbor ? `name-${neighbor.id}` : 'add-participant')?.focus();
    });
  }
  function adjustParticipantCount(delta: number) {
    const count = Math.min(12, Math.max(2, state.participants.length + delta));
    if (count === state.participants.length) return;
    participantSubmitAttempted.current = false;
    setErrors((previous) => {
      const next = { ...previous };
      for (const row of state.participants) delete next[row.id];
      return next;
    });
    if (count < state.participants.length) {
      updateParticipants(state.participants.slice(0, count), state.participants[count]?.id ?? '');
      return;
    }
    const rows = [...state.participants];
    while (rows.length < count) rows.push({ id: `participant-${nextId.current++}`, nickname: '' });
    updateParticipants(rows, rows.at(-1)?.id ?? '');
  }
  function back() {
    if (restart !== null) { setRestart(null); setEditingSettings(false); return; }
    if (busy) return;
    if (['handoff', 'review'].includes(state.screen)) { setEditingSettings(true); setRestart(false); }
    else if (state.screen === 'result') setRestart(false);
    else dispatch({ type: 'back' });
  }
  useBrowserBack(state.screen !== 'mode', back);

  let rouletteRows: ReturnType<typeof weightedParticipants> = [];
  let rouletteError = '';
  if (state.screen === 'roulette') {
    try { rouletteRows = weightedParticipants(state); getRatios(rouletteRows); } catch (error) { rouletteError = (error as Error).message; }
  }
  const result = state.result;
  const winner = result?.participants.find((row) => row.id === result.winnerId);
  const resultTotal = result?.participants.reduce((sum, row) => sum + row.score, 0n) ?? 0n;

  return <div className="app-shell">
    <main>
      {state.screen !== 'mode' && state.screen !== 'participants' && state.screen !== 'amount' && <div className="eyebrow">{modeName}</div>}
      <h1 ref={heading} className={state.screen === 'mode' || state.screen === 'participants' || state.screen === 'amount' ? 'mode-title' : undefined} tabIndex={-1} aria-describedby={state.screen === 'result' && winner ? 'winner-summary' : undefined}>{titles[state.screen]}</h1>
      {state.error && <p className="error" role="alert">{state.error}</p>}

      {state.screen === 'mode' && <>
        <div className="mode-list">
          {(['solo', 'split'] as const).map((mode) => <button className="mode-card" key={mode}
            onClick={() => dispatch({ type: 'mode', mode })}>
            <strong>{mode === 'solo' ? '한명뽑기' : 'N빵하기'}</strong>
            <ModeArtwork mode={mode} />
          </button>)}
        </div>
      </>}

      {state.screen === 'participants' && <>
        {errors.count && <p className="error" role="alert">{errors.count}</p>}
        <div className="participant-count" aria-label="참가자 수 조절">
          <button type="button" className="count-button" aria-label="참가자 한 명 줄이기" disabled={state.participants.length <= 2} onClick={() => adjustParticipantCount(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
          <span className="participant-count-value" aria-live="polite">{state.participants.length}</span>
          <button type="button" className="count-button" aria-label="참가자 한 명 늘리기" disabled={state.participants.length >= 12} onClick={() => adjustParticipantCount(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        </div>
        <button type="button" className="full secondary randomize-names" onClick={randomizeNames}>랜덤 닉네임 적용</button>
        <div className="participant-list">{state.participants.map((row, index) => <section className="participant-card" key={row.id}>
          <div className="participant-input"><span className="number">{index + 1}</span>
            <input id={`name-${row.id}`} aria-label={`참가자 ${index + 1} 닉네임`} placeholder="참가자 명" value={row.nickname} autoComplete="off" aria-invalid={Boolean(errors[row.id])}
              aria-describedby={errors[row.id] ? 'nickname-error' : undefined}
              onChange={(event) => updateParticipants(state.participants.map((p) => p.id === row.id ? { ...p, nickname: event.target.value } : p), row.id)} />
          </div>
        </section>)}</div>
        {state.participants.some((row) => errors[row.id]) && <p id="nickname-error" className="error nickname-error" role="alert">{errors[state.participants.find((row) => errors[row.id])?.id ?? '']}</p>}
        {state.participants.length >= 12 && <p className="muted">최대 12명까지 참여할 수 있어요.</p>}
        <Actions><button className="participant-back" onClick={back}>뒤로</button><button className="primary participant-start" onClick={nextFromParticipants}>다음</button></Actions>
      </>}

      {state.screen === 'amount' && <>
        <div className="amount-entry">
        <output id="amount" className={`amount-value${state.amountDraft ? '' : ' is-placeholder'}`} tabIndex={-1} aria-live="polite" aria-invalid={Boolean(errors.amount)} aria-describedby="amount-error">{state.amountDraft ? `${formatInteger(BigInt(state.amountDraft))}원` : '총 결제 금액'}</output>
        </div>
        <div className="amount-shortcuts" aria-label="빠른 금액 추가">
          {[10000, 50000, 100000].map((amount) => <button type="button" key={amount} onClick={() => editAmount(`+${amount}`)}>+{amount / 10000}만원</button>)}
          <button type="button" onClick={() => editAmount('clear')}>초기화</button>
        </div>
        <div className="amount-keypad" aria-label="금액 입력 키패드">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'delete'].map((key) => <button type="button" key={key}
            aria-label={key === 'delete' ? '마지막 숫자 지우기' : `${key} 입력`} onClick={() => editAmount(key === 'delete' ? 'delete' : key)}>{key === 'delete' ? '×' : key}</button>)}
        </div>
        <p id="amount-error" className="error" role="alert">{errors.amount}</p>
        <Actions><button className="amount-back" onClick={back}>뒤로</button><button className="primary amount-next" disabled={!canStart} onClick={() => {
          try { parseAmount(state.amountDraft, policy.inputs); dispatch({ type: 'start' }); }
          catch (error) { showErrors({ amount: (error as Error).message }); }
        }}>다음</button></Actions>
      </>}

      {state.screen === 'handoff' && current && <>
        <div className="handoff-card"><p>{state.current + 1}/{state.participants.length}번째 참가자</p>
          <h2>다음은 {current.nickname}님 차례예요</h2>
          <p>휴대폰을 받았다면 아래 버튼을 눌러 주세요.</p></div>
        <p className="muted">준비 버튼은 본인 인증 기능이 아니에요. 옆에서 화면을 보거나 캡처하는 행동은 막을 수 없어요.</p>
        <Actions><button className="primary" disabled={!state.questionPolicy} onClick={() => dispatch({ type: 'reveal' })}>내 질문 시작</button></Actions>
      </>}

      {state.screen === 'answering' && state.questionPolicy && current && <>
        <p className="intro">{current.nickname}님 · {state.current + 1}/{state.participants.length}번째 참가자 · 선택 없이 완료해도 괜찮아요.</p>
        <button onClick={() => dispatch({ type: 'hide' })}>화면 가리기</button>
        <p className="score" role="status" aria-live="polite" aria-atomic="true">현재 점수 {formatInteger(calculateScore(state.draft, state.questionPolicy))}점</p>
        {Array.from(new Set(state.questionPolicy.questions.map((q) => q.category))).map((category) => <fieldset className="question-group" key={category}>
          <legend>{category}</legend>{state.questionPolicy?.questions.filter((q) => q.category === category).map((q) => <label className="question" key={q.id}>
            <input type="checkbox" checked={state.draft.includes(q.id)} onChange={() => dispatch({ type: 'toggle', id: q.id })} />
            <span>{q.text}<span className="question-weight">{q.weight > 0n ? '+' : ''}{q.weight.toString()}점</span></span>
          </label>)}
        </fieldset>)}
        <Actions><button className="primary" onClick={() => dispatch({ type: 'complete' })}>응답 완료</button></Actions>
      </>}

      {state.screen === 'review' && <>
        <p className="intro">{Object.keys(state.answers).length}/{state.participants.length}명 완료</p>
        <ol className="roster">{state.participants.map((row, index) => <li key={row.id}><span className="number">{index + 1}</span>
          <div><strong>{row.nickname}</strong><p>{state.answers[row.id] ? '응답 완료' : '시작 전'}</p></div></li>)}</ol>
        {state.mode === 'solo' ? <Actions><button className="primary" onClick={() => dispatch({ type: 'review' })}>룰렛 확인</button></Actions>
          : <><PolicyNotice ids={['Q02', 'Q03']} />
            <Actions><button className="primary" onClick={() => dispatch({ type: 'split-result' })}>정산 준비 상태 보기</button></Actions></>}
      </>}

      {state.screen === 'roulette' && (rouletteError ? <p className="error" role="alert">{rouletteError}</p> :
        <Roulette key={state.roundId} rows={rouletteRows} roundId={state.roundId} onBusy={setBusy}
          onResult={(value) => dispatch({ type: 'result', result: value })} onError={(message) => dispatch({ type: 'error', message })} />)}

      {state.screen === 'result' && result && winner && <>
        <div className="result-card" id="winner-summary"><p>오늘의 결제 담당자</p><h2>{winner.nickname}</h2>
          <p>{formatInteger(winner.score)}점 · 당첨 확률 {probabilityText(winner.score, resultTotal)}</p></div>
        <h2>함께한 참가자</h2><ol className="roster">{result.participants.map((row, index) => <li key={row.id}>
          <span className="number">{index + 1}</span><strong>{row.nickname}</strong></li>)}</ol>
        <PolicyNotice ids={['Q03', 'Q07']} />
        <Actions><button className="primary" onClick={() => dispatch({ type: 'share' })}>공유 안내 보기</button>
          <button disabled={!canStart} onClick={() => setRestart(true)}>같은 참가자로 다시 진행</button>
          <button onClick={() => setRestart(false)}>새로운 참가자로 시작</button></Actions>
      </>}

      {state.screen === 'result' && state.mode === 'split' && state.totalAmount !== null && <>
        <div className="result-card"><p>총 결제 금액</p><h2>{formatInteger(state.totalAmount)}원</h2><p>금액 배분 대기</p></div>
        <p>{calculateSettlement().message}</p>
        <ol className="roster">{state.participants.map((row, index) => <li key={row.id}>
          <span className="number">{index + 1}</span><div><strong>{row.nickname}</strong><p>부담액: 기준 확정 대기</p></div>
        </li>)}</ol>
        <p><strong>정산 합계: 아직 산출하지 않았어요</strong></p>
        <PolicyNotice ids={['Q02', 'Q03', 'Q06', 'Q07']} />
        <Actions><button className="primary" disabled>정산 결과 공유</button>
          <button disabled={!policy.restart} onClick={() => setRestart(true)}>같은 참가자로 다시 진행</button>
          <button onClick={() => setRestart(false)}>새로운 참가자로 시작</button></Actions>
      </>}

      {state.screen === 'sharing' && <><PolicyNotice ids={['Q07']} />
        <p>공유 방식과 링크가 확정되면 참가자·당첨자·당첨자 점수와 확률을 미리 확인할 수 있어요. 질문과 응답은 공유하지 않아요.</p>
        <Actions><button className="primary" onClick={() => dispatch({ type: 'back' })}>결과로 돌아가기</button></Actions></>}

      {state.screen !== 'mode' && state.screen !== 'sharing' && state.screen !== 'participants' && state.screen !== 'amount' && <button className="back-action" disabled={busy} onClick={back}>
        {['handoff', 'review'].includes(state.screen) ? '참가자 설정 변경' : state.screen === 'result' ? '새로 시작 안내' : '이전 단계'}</button>}
    </main>
    {state.screen !== 'mode' && state.screen !== 'participants' && state.screen !== 'amount' && <footer>결과는 참가자끼리 합의해 활용해 주세요.<br />현재 입력은 이 화면을 사용하는 동안만 보관해요. 새로고침 복구는 준비 중이에요.</footer>}
    {restart !== null && <ConfirmRestart same={restart} settings={editingSettings}
      amountBehavior={state.mode === 'split' && policy.restart ? (policy.restart.preserveAmount ? 'preserve' : 'clear') : undefined}
      onCancel={() => { setRestart(null); setEditingSettings(false); }} onConfirm={() => {
      dispatch(editingSettings ? { type: 'edit-settings' } : { type: 'restart', same: restart });
      setRestart(null); setEditingSettings(false);
    }} />}
  </div>;
}
