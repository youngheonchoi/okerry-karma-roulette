import { useEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Actions, ConfirmRestart, PolicyNotice, Roulette } from './components';
import { calculateScore, calculateSettlement, formatInteger, getRatios, parseAmount, probabilityText, validateParticipants } from './domain';
import { pendingPolicies, policy } from './policy';
import { initialSession, sessionReducer, weightedParticipants } from './session';
import type { Participant } from './domain';

const titles = {
  mode: '오늘의 정산, 어떻게 할까요?', participants: '함께할 사람을 알려 주세요', amount: '얼마를 나눌까요?',
  handoff: '휴대폰을 전달해 주세요', answering: '나에게 해당하는 항목을 골라요', review: '모두 차례를 마쳤어요',
  roulette: '누가 계산하게 될까요?', result: '오늘의 정산 결과', sharing: '공유 내용을 확인해 주세요',
};
const randomNames = ['월급 루팡', '지각 대장', '통장 텅장', '운 좋은 사람', '오늘의 호구', '회식 요정', '야근 전문가', '카드값 폭탄'];

export function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restart, setRestart] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextId = useRef(3);
  const current = state.participants[state.current];
  const canStart = policy.questions !== null && policy.inputs !== null;
  const modeName = state.mode === 'solo' ? '독박 룰렛' : '업보 N빵';
  const activeScreen = useRef(state.screen);
  activeScreen.current = state.screen;

  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
    setErrors({});
  }, [state.screen, state.current]);
  useEffect(() => {
    function conceal() {
      if (activeScreen.current === 'answering') flushSync(() => dispatch({ type: 'hide' }));
    }
    const visibility = () => { if (document.visibilityState === 'hidden') conceal(); };
    window.addEventListener('blur', conceal);
    window.addEventListener('pagehide', conceal);
    window.addEventListener('popstate', conceal);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', conceal);
      window.removeEventListener('pagehide', conceal);
      window.removeEventListener('popstate', conceal);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  function showErrors(found: Record<string, string>) {
    setErrors(found);
    const first = state.participants.find((row) => found[row.id]);
    requestAnimationFrame(() => document.getElementById(first ? `name-${first.id}` : 'amount')?.focus());
  }
  function nextFromParticipants() {
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
        if (found[id]) next[id] = found[id];
      }
      delete next.count;
      if (found.count) next.count = found.count;
      return next;
    });
  }
  function randomName(id: string) {
    const normalize = policy.inputs?.normalizeNickname ?? ((value: string) => value);
    const used = new Set(state.participants.filter((row) => row.id !== id).map((row) => normalize(row.nickname)));
    const available = randomNames.filter((name) => !used.has(normalize(name)));
    const name = available[Math.floor(Math.random() * available.length)];
    if (!name) { setErrors((previous) => ({ ...previous, [id]: '남은 랜덤 이름이 없어요. 닉네임을 직접 입력해 주세요.' })); return; }
    updateParticipants(state.participants.map((row) => row.id === id ? { ...row, nickname: name } : row), id);
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
  function back() {
    if (busy) return;
    if (['handoff', 'review', 'result'].includes(state.screen)) setRestart(false);
    else dispatch({ type: 'back' });
  }

  let amountDisplay = '';
  if (state.amountDraft) {
    try { amountDisplay = `${formatInteger(parseAmount(state.amountDraft, null))}원`; } catch { /* 원문 입력은 유지한다. 제출 시 오류 안내. */ }
  }
  let rouletteRows: ReturnType<typeof weightedParticipants> = [];
  let rouletteError = '';
  if (state.screen === 'roulette') {
    try { rouletteRows = weightedParticipants(state); getRatios(rouletteRows); } catch (error) { rouletteError = (error as Error).message; }
  }
  const result = state.result;
  const winner = result?.participants.find((row) => row.id === result.winnerId);
  const resultTotal = result?.participants.reduce((sum, row) => sum + row.score, 0n) ?? 0n;

  return <div className="app-shell">
    <header className="brand"><span className="brand-mark" aria-hidden="true" />업보 룰렛<span className="badge">준비 중</span></header>
    <main>
      <div className="eyebrow">{state.screen === 'mode' ? '모임을 위한 정산 유틸리티' : modeName}</div>
      <h1 ref={heading} tabIndex={-1} aria-describedby={state.screen === 'result' && winner ? 'winner-summary' : undefined}>{titles[state.screen]}</h1>
      {state.error && <p className="error" role="alert">{state.error}</p>}

      {state.screen === 'mode' && <>
        <p className="intro">한 명을 뽑거나, 점수에 따라 나눠요.<br />2명부터 12명까지 함께할 수 있어요.</p>
        <fieldset className="mode-list"><legend className="sr-only">정산 모드</legend>
          {(['solo', 'split'] as const).map((mode, index) => <label className={`mode-card ${state.mode === mode ? 'selected' : ''}`} key={mode}>
            <span className={`mode-symbol symbol-${mode}`} aria-hidden="true">{index + 1}</span>
            <span className="mode-copy"><strong>{mode === 'solo' ? '독박 룰렛' : '업보 N빵'}</strong>
              <span>{mode === 'solo' ? '업보 점수에 따라 결제 담당자 한 명을 뽑아요' : '업보 점수에 따라 총액을 나눠요'}</span></span>
            <input type="radio" name="mode" checked={state.mode === mode} onChange={() => dispatch({ type: 'mode', mode })} />
          </label>)}
        </fieldset>
        <p className="muted">실제 결제나 송금 기능은 없어요. 결과는 참가자끼리 합의해 활용해 주세요.</p>
        <Actions>{!state.mode && <p className="muted">정산 모드를 선택해 주세요.</p>}<button className="primary" disabled={!state.mode} onClick={() => dispatch({ type: 'next' })}>참가자 설정</button></Actions>
        <details className="policy-details"><summary>준비 중인 기능 안내</summary>
          <ul>{pendingPolicies.map(([id, text]) => <li key={id}><strong>{id}</strong> {text}</li>)}</ul>
        </details>
      </>}

      {state.screen === 'participants' && <>
        <p className="intro">등록한 순서대로 휴대폰을 전달해요.</p>
        <div className="section-heading"><h2>참가자</h2><span>{state.participants.length}/12명</span></div>
        {errors.count && <p className="error" role="alert">{errors.count}</p>}
        <div className="participant-list">{state.participants.map((row, index) => <section className="participant-card" key={row.id}>
          <label htmlFor={`name-${row.id}`}>참가자 {index + 1} 닉네임</label>
          <div className="participant-input"><span className="number">{index + 1}</span>
            <input id={`name-${row.id}`} value={row.nickname} autoComplete="off" aria-invalid={Boolean(errors[row.id])}
              aria-describedby={errors[row.id] ? `error-${row.id}` : undefined}
              onChange={(event) => updateParticipants(state.participants.map((p) => p.id === row.id ? { ...p, nickname: event.target.value } : p), row.id)} />
            <button disabled={state.participants.length <= 2} aria-describedby={state.participants.length <= 2 ? 'participant-minimum' : undefined}
              aria-label={`참가자 ${index + 1} ${row.nickname} 삭제`} onClick={() => remove(row.id)}>삭제</button>
          </div>
          {errors[row.id] && <p id={`error-${row.id}`} className="error">{errors[row.id]}</p>}
          <button className="small-action" onClick={() => randomName(row.id)} aria-label={`참가자 ${index + 1} 랜덤 닉네임`}>랜덤 닉네임</button>
        </section>)}</div>
        {state.participants.length <= 2 && <p id="participant-minimum" className="muted">최소 2명이 필요해요. 참가자를 추가하면 삭제할 수 있어요.</p>}
        <button id="add-participant" className="full secondary" disabled={state.participants.length >= 12} onClick={() => {
          const id = `participant-${nextId.current++}`;
          dispatch({ type: 'participants', participants: [...state.participants, { id, nickname: '' }] });
          requestAnimationFrame(() => document.getElementById(`name-${id}`)?.focus());
        }}>참가자 추가</button>
        {state.participants.length >= 12 && <p className="muted">최대 12명까지 참여할 수 있어요.</p>}
        <PolicyNotice ids={['Q01', 'Q05']} />
        <Actions><button className="primary" disabled={state.mode === 'solo' && !canStart} onClick={nextFromParticipants}>
          {state.mode === 'solo' ? '업보 청문회 시작' : '총액 입력'}</button></Actions>
      </>}

      {state.screen === 'amount' && <>
        <p className="intro">{state.participants.length}명이 나눌 총 결제 금액을 입력해 주세요.</p>
        <label htmlFor="amount">총 결제 금액 (원)</label>
        <input id="amount" className="amount-input" inputMode="numeric" value={state.amountDraft} aria-invalid={Boolean(errors.amount)}
          aria-describedby="amount-help amount-display amount-error" onChange={(event) => {
            const value = event.target.value;
            dispatch({ type: 'amount', value });
            setErrors((previous) => {
              if (!previous.amount) return previous;
              const next = { ...previous };
              delete next.amount;
              try { parseAmount(value, policy.inputs); }
              catch (error) { next.amount = (error as Error).message; }
              return next;
            });
          }} />
        <p id="amount-help" className="muted">쉼표 없이 양의 정수로 입력해 주세요. 입력값을 자동으로 반올림하지 않아요.</p>
        <p id="amount-display" className="amount-display">{amountDisplay || '금액을 입력해 주세요'}</p>
        <p id="amount-error" className="error" role="alert">{errors.amount}</p>
        <PolicyNotice ids={['Q01', 'Q02', 'Q05']} />
        <Actions><button className="primary" disabled={!canStart} onClick={() => {
          try { parseAmount(state.amountDraft, policy.inputs); dispatch({ type: 'start' }); }
          catch (error) { showErrors({ amount: (error as Error).message }); }
        }}>업보 청문회 시작</button></Actions>
      </>}

      {state.screen === 'handoff' && current && <>
        <div className="handoff-card"><p>{state.current + 1}/{state.participants.length}번째 참가자</p>
          <h2>다음은 {current.nickname}님 차례예요</h2>
          <p>휴대폰을 받았다면 아래 버튼을 눌러 주세요.</p></div>
        <p className="muted">준비 버튼은 본인 인증 기능이 아니에요. 옆에서 화면을 보거나 캡처하는 행동은 막을 수 없어요.</p>
        <Actions><button className="primary" disabled={!state.questionPolicy} onClick={() => dispatch({ type: 'reveal' })}>내 질문 시작</button></Actions>
      </>}

      {state.screen === 'answering' && state.questionPolicy && current && <>
        <p className="intro">{current.nickname}님 · 선택 없이 완료해도 괜찮아요.</p>
        <p className="score" role="status" aria-live="polite" aria-atomic="true">현재 점수 {formatInteger(calculateScore(state.draft, state.questionPolicy))}점</p>
        {Array.from(new Set(state.questionPolicy.questions.map((q) => q.category))).map((category) => <fieldset className="question-group" key={category}>
          <legend>{category}</legend>{state.questionPolicy?.questions.filter((q) => q.category === category).map((q) => <label className="question" key={q.id}>
            <input type="checkbox" checked={state.draft.includes(q.id)} onChange={() => dispatch({ type: 'toggle', id: q.id })} />
            <span>{q.text}<span className="question-weight">{q.weight > 0n ? '+' : ''}{q.weight.toString()}점</span></span>
          </label>)}
        </fieldset>)}
        <Actions><button className="primary" onClick={() => dispatch({ type: 'complete' })}>응답 완료</button>
          <button onClick={() => dispatch({ type: 'hide' })}>화면 가리기</button></Actions>
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
          <button onClick={() => setRestart(true)}>같은 참가자로 다시 진행</button>
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

      {state.screen !== 'mode' && state.screen !== 'sharing' && <button className="back-action" disabled={busy} onClick={back}>
        {['handoff', 'review', 'result'].includes(state.screen) ? '새로 시작 안내' : '이전 단계'}</button>}
    </main>
    <footer>결과는 참가자끼리 합의해 활용해 주세요.<br />현재 입력은 이 화면을 사용하는 동안만 보관해요. 새로고침 복구는 준비 중이에요.</footer>
    {restart !== null && <ConfirmRestart same={restart} onCancel={() => setRestart(null)} onConfirm={() => {
      dispatch({ type: 'restart', same: restart }); setRestart(null);
    }} />}
  </div>;
}
