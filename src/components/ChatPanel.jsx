import { Fragment, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useSettings } from '../settings';
import { messageDay, formatMessageDate } from '../data/conversationUtils';
const suggestions = ['크레인과 연결된 위험요인은?', '낙하 위험의 예방대책은?'];
const HISTORY_LIMIT = 10;
export default function ChatPanel({ messages, setMessages, storageError }) {
  const settings = useSettings();
  const request = useRef(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(null);
  const end = useRef(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    if (messages.length || isSending) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isSending]);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);
  function stopResponse() {
    const controller = request.current;
    request.current = null;
    controller?.abort();
    setIsSending(false);
    setNotice('답변 생성을 중단했습니다.');
  }
  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setNotice('메시지를 복사했습니다.');
    } catch { setNotice('복사 권한을 확인하거나 메시지를 선택해 복사해주세요.'); }
  }
  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const history = messages.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content }));
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: question, createdAt: Date.now() };
    setMessages(previous => [...previous, userMessage]);
    setInput('');
    setNotice('');
    setIsSending(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, history }) });
      if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
      const data = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (typeof data.answer !== 'string') throw new Error('답변 형식 오류');
      const answer = { id: crypto.randomUUID(), role: 'assistant', content: data.answer, createdAt: Date.now() };
      setMessages(previous => [...previous, answer]);
    } catch {
      if (request.current !== controller || controller.signal.aborted) return;
      const error = { id: crypto.randomUUID(), role: 'assistant', content: '답변을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.', createdAt: Date.now() };
      setMessages(previous => [...previous, error]);
    } finally {
      if (request.current === controller) { request.current = null; setIsSending(false); }
    }
  }
  return <section className={`chat-panel ${settings.reading ? 'reading-mode' : ''}`} aria-label="AI 채팅">
    {storageError && <p className="chat-storage-error" role="status">{storageError}</p>}
    <div className="messages" role="log" aria-label="대화 메시지" aria-live="polite">
      {!messages.length && <><div className="chat-intro"><h1>안전한 작업, 함께 알아봐요</h1><p>안전 도우미 <strong>링키</strong>와 함께 궁금한 예방대책을 알아보세요.</p></div>
        <div className="suggestions">{suggestions.map(question => <button key={question} onClick={() => sendMessage(question)}>{question}<span>↗</span></button>)}</div></>}
      {messages.map((message, index) => <Fragment key={message.id}>
        {(index === 0 || messageDay(message) !== messageDay(messages[index - 1])) && <div className="date-divider"><time dateTime={messageDay(message) === 'unknown' ? undefined : new Date(message.createdAt).toISOString()}>{formatMessageDate(message)}</time></div>}
        <article className={`message ${message.role}`} title={formatMessageDate(message, true)}>
          {message.role === 'assistant' && <div className="message-label">링키</div>}
          <p>{message.content}</p>
          <div className="message-tools"><time dateTime={messageDay(message) === 'unknown' ? undefined : new Date(message.createdAt).toISOString()}>{formatMessageDate(message, true)}</time><button type="button" aria-label={message.role === 'user' ? '질문 복사' : '답변 복사'} onClick={() => copyMessage(message)}><Icon name="copy" size={14}/>{copied === message.id ? '복사됨' : '복사'}</button></div>
        </article>
      </Fragment>)}
      {isSending && <div className="message assistant"><div className="message-label">링키</div><p>답변을 생성하는 중...</p></div>}
      <div ref={end}/>
    </div>
    <div className="composer-area">
      <p className="chat-notice" role="status">{notice}</p>
      <form onSubmit={event => { event.preventDefault(); sendMessage(); }}><label className="sr-only" htmlFor="chat-input">산업안전 관련 질문</label><textarea id="chat-input" value={input} onChange={event => setInput(event.target.value)} placeholder="작업과 위험요인, 예방대책 사이의 연결을 질문하며 살펴보세요." rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); sendMessage(); } }}/>
        <div className="composer-bottom">{isSending ? <button key="stop" className="send-button stop-button" type="button" aria-label="답변 생성 중단" title="답변 생성 중단" onClick={event => { event.preventDefault(); stopResponse(); }}><Icon name="stop" size={18}/></button> : <button key="send" className="send-button" type="submit" disabled={!input.trim()} aria-label="메시지 전송"><Icon name="arrow" size={18}/></button>}</div>
      </form>
    </div>
  </section>;
}
