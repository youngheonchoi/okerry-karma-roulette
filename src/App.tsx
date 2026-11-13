import { SplitResult } from './SplitResult';
import { BottomBanner } from './BottomBanner';
import { useEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Actions, ConfirmRestart, PolicyNotice, Roulette } from './components';
import { formatInteger, getRatios, parseAmount, probabilityText, validateParticipants } from './domain';
import { policy } from './policy';
import { newQuestionDraw } from './questions';
import { initialSession, sessionReducer, weightedParticipants } from './session';
import type { Action, Session } from './session';
import type { Participant } from './domain';
import { useBrowserBack } from './useBrowserBack';
import { ModeArtwork } from './ModeArtwork';

const titles = {
  mode: '오늘 계산\n업보로 정해볼까요?', participants: '함께할 사람을 알려 주세요', amount: '얼마를 나눌까요?',
  handoff: '', answering: '', review: '모두 차례를 마쳤어요',
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
    window.addEventListener('pagehide', conceal);
    document.addEventListener('visibilitychange', visibility);
    return () => {
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
    dispatch(state.mode === 'split' ? { type: 'next' } : { type: 'start', draw: newQuestionDraw() });
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
    if (state.screen === 'handoff') dispatch({ type: 'back' });
    else if (state.screen === 'review') { setEditingSettings(true); setRestart(false); }
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

  return <div className={state.screen === 'answering' ? 'app-shell answering-shell' : 'app-shell'}>
    <main>
      {state.screen !== 'mode' && state.screen !== 'participants' && state.screen !== 'amount' && state.screen !== 'handoff' && state.screen !== 'answering' && state.screen !== 'review' && state.screen !== 'result' && state.screen !== 'roulette' && <div className="eyebrow">{modeName}</div>}
      {state.screen === 'handoff' && <p className="handoff-progress">{state.current + 1}/{state.participants.length}</p>}
      {state.screen === 'answering' && current && <div className="answering-heading"><h1><span>{current.nickname}님</span><br />진행중</h1><span className="answering-progress">{state.current + 1}/{state.participants.length}</span></div>}
      {state.screen !== 'handoff' && state.screen !== 'answering' && state.screen !== 'roulette' && !(state.screen === 'result' && state.mode === 'split') && <h1 ref={heading} className={state.screen === 'mode' || state.screen === 'participants' || state.screen === 'amount' || state.screen === 'review' ? 'mode-title' : undefined} tabIndex={-1} aria-describedby={state.screen === 'result' && winner ? 'winner-summary' : undefined}>{titles[state.screen]}</h1>}
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
          try { parseAmount(state.amountDraft, policy.inputs); dispatch({ type: 'start', draw: newQuestionDraw() }); }
          catch (error) { showErrors({ amount: (error as Error).message }); }
        }}>다음</button></Actions>
      </>}

      {state.screen === 'handoff' && current && <>
        <div className="handoff-center"><span className="handoff-name">{current.nickname}님</span><span className="handoff-message">차례에요</span></div>
        <div className="actions handoff-actions"><button onClick={back}>뒤로</button><button className="primary" disabled={!state.questionPolicy} onClick={() => dispatch({ type: 'reveal' })}>다음</button></div>
      </>}

      {state.screen === 'answering' && state.questionPolicy && current && <>
        <div className="question-scroll" role="region" aria-label="업보 질문" tabIndex={0}>
          {state.questionPolicy.questions.map((q) => {
            const selected = state.draft.includes(q.id);
            return <div className="question" key={q.id}>
              <span>{q.text}</span>
              <div className="question-response">
                <div className="question-choices" role="group" aria-label={q.text}>
                  <button type="button" className="answer-o" aria-label={`${q.text} O`} aria-pressed={selected} onClick={() => dispatch({ type: 'answer', id: q.id, value: 'yes' })}>O</button>
                  <button type="button" className="answer-x" aria-label={`${q.text} X`} aria-pressed={state.rejectedDraft.includes(q.id)} onClick={() => dispatch({ type: 'answer', id: q.id, value: 'no' })}>X</button>
                  {state.questionPolicy!.questions.indexOf(q) >= 2 && state.rerollsUsed < 3 && <button type="button" className="question-reroll" aria-label="다른 질문으로 바꾸기" onClick={() => dispatch({ type: 'reroll-question', id: q.id })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.8-2L20 12M4 12l2.6 5a7 7 0 0 0 11.8-2" /></svg></button>}
                </div>
              </div>
            </div>;
          })}
        </div>
        <div className="actions answering-actions"><button className="primary" onClick={() => dispatch({ type: 'complete' })}>응답 완료</button></div>
      </>}

      {state.screen === 'review' && <>
        <div className="review-action-wrap">
          <button className="mode-card review-mode-card" onClick={() => dispatch({ type: state.mode === 'solo' ? 'review' : 'split-result' })}>
            <strong>{state.mode === 'solo' ? '룰렛 보기' : 'N빵 하기'}</strong>
            <ModeArtwork mode={state.mode ?? 'solo'} />
          </button>
        </div>
      </>}

      {state.screen === 'roulette' && (rouletteError ? <p className="error" role="alert">{rouletteError}</p> :
        <Roulette key={state.roundId} rows={rouletteRows} roundId={state.roundId} onBusy={setBusy}
          winner={winner?.nickname} onHome={() => dispatch({ type: 'restart', same: false })}
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

      {state.screen === 'result' && state.mode === 'split' && state.totalAmount !== null &&
        <SplitResult key={state.roundId} amount={state.totalAmount} participants={weightedParticipants(state)}
          onHome={() => dispatch({ type: 'restart', same: false })} />}

      {state.screen === 'sharing' && <><PolicyNotice ids={['Q07']} />
        <p>공유 방식과 링크가 확정되면 참가자·당첨자·당첨자 점수와 확률을 미리 확인할 수 있어요. 질문과 응답은 공유하지 않아요.</p>
        <Actions><button className="primary" onClick={() => dispatch({ type: 'back' })}>결과로 돌아가기</button></Actions></>}

      {state.screen !== 'mode' && state.screen !== 'sharing' && state.screen !== 'participants' && state.screen !== 'amount' && state.screen !== 'handoff' && state.screen !== 'answering' && state.screen !== 'review' && state.screen !== 'roulette' && !(state.screen === 'result' && state.mode === 'split') && <button className="back-action" disabled={busy} onClick={back}>
        {['handoff', 'review'].includes(state.screen) ? '참가자 설정 변경' : state.screen === 'result' ? '새로 시작 안내' : '이전 단계'}</button>}
    </main>
    <BottomBanner />
    {restart !== null && <ConfirmRestart same={restart} settings={editingSettings}
      amountBehavior={state.mode === 'split' && policy.restart ? (policy.restart.preserveAmount ? 'preserve' : 'clear') : undefined}
      onCancel={() => { setRestart(null); setEditingSettings(false); }} onConfirm={() => {
      dispatch(editingSettings ? { type: 'edit-settings' } : { type: 'restart', same: restart, draw: restart ? newQuestionDraw() : undefined });
      setRestart(null); setEditingSettings(false);
    }} />}
  </div>;
}
