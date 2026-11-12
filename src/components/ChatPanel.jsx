import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useSettings } from '../settings';
import { formatMessageDate } from '../data/conversationUtils';

const labels = { ontology: '온톨로지 RAG', vector: '벡터 RAG', compare: '나란히 비교' };
const intentLabels = {
  advice: '주의사항', briefing: '브리핑', cases: '사례 검색', count: '건수',
  distribution: '분포', patterns: '반복 패턴', unsupported: '지원 범위 밖',
};
const suggestions = [
  ['advice', '단위작업이 철근 가공 및 운반인 사고 사례를 참고해서 작업 전 주의사항을 알려줘.'],
  ['briefing', '오늘 이동식 크레인을 사용해. 관련 사고 사례를 바탕으로 1분 안전 브리핑을 만들어줘.'],
  ['cases', '기인물이 백호기이고 재해종류가 부딪힘인 사고 사례를 찾아줘.'],
  ['count', 'SIF 건설업 자료에서 기인물이 백호기인 사고는 몇 건이야?'],
  ['distribution', '백호기가 기인물인 사고의 재해종류별 분포를 표로 보여줘.'],
  ['patterns', '백호기 사고에서 반복되는 사고 패턴을 알려줘.'],
  ['unsupported', '오늘 우리 현장에서 사고가 발생할 확률은 몇 퍼센트야?'],
  ['count', '기인물이 타워크레인이고 재해종류가 질식인 건설업 사고는 몇 건이야?', '조회 0건 예시'],
];

function Answer({ message, onRetry }) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText([message.content, message.follow_up].filter(Boolean).join('\n\n'));
      setCopyStatus('복사됨');
    } catch {
      setCopyStatus('복사 실패');
    }
  }
  return <article className="message assistant">
    <div className="message-label">{labels[message.agent] || '이전 답변'}</div>
    {message.intent && <div className="rag-intent">
      intent <code>{message.intent}</code> · {intentLabels[message.intent] || message.intent}
    </div>}
    <p>{message.content}</p>
    {message.follow_up && <p>{message.follow_up}</p>}
    {message.statistics?.rows?.length > 0 && <table className="rag-statistics">
      <thead><tr><th scope="col">{message.statistics.kind === 'patterns' ? '사고 패턴' : '재해종류'}</th><th scope="col">사례 수</th></tr></thead>
      <tbody>{message.statistics.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.count.toLocaleString('ko-KR')}</td></tr>)}</tbody>
    </table>}
    {message.sources?.length > 0 && <details className="rag-sources">
      <summary>근거 사례 {message.sources.length}건</summary>
      {message.sources.map((source, index) => <details key={source.id}>
        <summary>[{index + 1}] {source.code} · {source.work || source.object}</summary>
        <small>{source.file} · {source.sheet} {source.row}행</small>
        <p>{source.summary}</p>
        {source.hazard && <p><strong>재해유발요인</strong> {source.hazard}</p>}
        {source.measures && <p><strong>위험성 감소대책</strong>{'\n'}{source.measures}</p>}
      </details>)}
    </details>}
    {message.metadata && <details className="rag-metadata">
      <summary>호출 메타데이터 자세히보기</summary>
      <pre tabIndex={0}>{JSON.stringify({ agent: message.agent, intent: message.intent,
        status: message.status, ...message.metadata }, null, 2)}</pre>
    </details>}
    {!message.failed && <button type="button" className="secondary-button" onClick={copy}>{copyStatus || '답변 복사'}</button>}
    {message.failed && <button type="button" className="secondary-button" onClick={onRetry}>이 답변 다시 시도</button>}
  </article>;
}

export default function ChatPanel({ messages, setMessages, storageError, onNewConversation }) {
  const settings = useSettings();
  const request = useRef(null);
  const end = useRef(null);
  const [mode, setMode] = useState('ontology');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]);
  const first = messages.find(message => message.role === 'user');
  const activeMode = first?.mode || mode;
  const legacy = Boolean(first && !first.mode);
  const busy = pending.length > 0;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, pending]);

  async function fetchAnswer(turn, agent, history, controller) {
    let message;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: turn.content, agent, history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '질문을 처리할 수 없습니다.');
      if (typeof data.answer !== 'string') throw new Error('답변 형식 오류');
      message = { ...data, content: data.answer };
    } catch (error) {
      if (controller.signal.aborted) return;
      message = { content: error.message === 'Failed to fetch' ? '백엔드에 연결할 수 없습니다.' : error.message, failed: true };
    }
    if (controller.signal.aborted) return;
    setMessages(previous => [
      ...previous.filter(item => !(item.turnId === turn.id && item.agent === agent)),
      { ...message, agent, turnId: turn.id, id: crypto.randomUUID(), role: 'assistant', createdAt: Date.now() },
    ]);
    setPending(previous => previous.filter(item => item.agent !== agent));
  }

  async function runTurn(turn, agents, previous) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(agents.map(agent => ({ agent, turnId: turn.id })));
    try {
      await Promise.all(agents.map(agent => {
        const history = previous.filter(item => item.role === 'user').flatMap(user => {
          const reply = previous.find(item => item.turnId === user.id && item.agent === agent && !item.failed);
          return reply ? [user, reply] : [user];
        }).slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 6000) }));
        return fetchAnswer(turn, agent, history, controller);
      }));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending([]);
      }
    }
  }

  function sendMessage(text = input) {
    const content = text.trim();
    if (!content || request.current || legacy) return;
    const turn = { id: crypto.randomUUID(), role: 'user', content, mode: activeMode, createdAt: Date.now() };
    setMessages(previous => [...previous, turn]);
    setInput('');
    runTurn(turn, activeMode === 'compare' ? ['ontology', 'vector'] : [activeMode], messages);
  }

  function stopResponse() {
    request.current?.abort();
    request.current = null;
    setPending([]);
  }

  const turns = messages.filter(message => message.role === 'user');
  return <section className={`chat-panel ${settings.reading ? 'reading-mode' : ''}`} aria-label="안전 채팅">
    <div className="rag-chat-header">
      {legacy ? <span>이전 대화</span> : <label>답변 방식 <select value={activeMode} onChange={event => setMode(event.target.value)} disabled={Boolean(first)}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}
      {first && <button type="button" className="secondary-button" onClick={onNewConversation}>새 대화</button>}
    </div>
    {storageError && <p className="chat-storage-error" role="status">{storageError}</p>}
    <div className="messages rag-messages" role="log" aria-label="대화 메시지" aria-live="polite">
      {!messages.length && <>
        <div className="chat-intro"><h1>안전대책 물어보기</h1><p>SIF 건설업 사고 사례에서 근거를 찾아 답합니다.</p></div>
        <div className="suggestions" aria-label="분류별 예시 질문">
          {suggestions.map(([intent, question, note]) => <button type="button" key={question} onClick={() => sendMessage(question)}>
            {question}<span>{intent} · {note || intentLabels[intent]}</span>
          </button>)}
        </div>
      </>}
      {legacy ? messages.map(message => message.role === 'assistant'
        ? <Answer key={message.id} message={message}/>
        : <article key={message.id} className="message user"><p>{message.content}</p></article>) : turns.map(turn => {
        const agents = turn.mode === 'compare' ? ['ontology', 'vector'] : [turn.mode];
        return <div className="rag-turn" key={turn.id}>
          <article className="message user"><p>{turn.content}</p><time>{formatMessageDate(turn.createdAt, true)}</time></article>
          <div className={`rag-answers ${agents.length === 2 ? 'rag-compare' : ''}`}>
            {agents.map(agent => {
              const reply = messages.find(message => message.turnId === turn.id && message.agent === agent);
              const loading = pending.some(item => item.turnId === turn.id && item.agent === agent);
              const previousTurns = new Set(turns.slice(0, turns.indexOf(turn)).map(item => item.id));
              const previous = messages.filter(item => previousTurns.has(item.turnId || item.id));
              if (loading) return <article className="message assistant" key={agent}><div className="message-label">{labels[agent]}</div><p>근거를 검색하고 있습니다…</p></article>;
              if (reply) return <Answer key={agent} message={reply} onRetry={() => runTurn(turn, [agent], previous)}/>;
              return <article className="message assistant" key={agent}><div className="message-label">{labels[agent]}</div><button type="button" className="secondary-button" disabled={busy} onClick={() => runTurn(turn, [agent], previous)}>답변 요청</button></article>;
            })}
          </div>
        </div>;
      })}
      <div ref={end}/>
    </div>
    {!legacy && <div className="composer-area">
      <form onSubmit={event => { event.preventDefault(); sendMessage(); }}>
        <label className="sr-only" htmlFor="chat-input">산업안전 관련 질문</label>
        <textarea id="chat-input" value={input} maxLength={2000} rows={2} placeholder="어떤 작업이나 장비에 대해 궁금하세요?" onChange={event => setInput(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            sendMessage();
          }
        }}/>
        <div className="composer-bottom">{busy
          ? <button type="button" className="send-button stop-button" onClick={stopResponse} aria-label="답변 생성 중단"><Icon name="stop" size={18}/></button>
          : <button type="submit" className="send-button" disabled={!input.trim()} aria-label="메시지 전송"><Icon name="arrow" size={18}/></button>}</div>
      </form>
    </div>}
  </section>;
}
