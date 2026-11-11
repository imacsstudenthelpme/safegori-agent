import { useEffect, useState } from 'react';
import { summarizeTitle } from '../data/conversationUtils';
const STORAGE_KEY = 'safegori.conversations.v1';
function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    return saved.filter(item => typeof item?.id === 'string' && typeof item.title === 'string' && Array.isArray(item.messages))
      .map(item => ({ ...item, title: summarizeTitle(item.messages.find(message => message?.role === 'user')?.content), messages: item.messages.filter(message => typeof message?.id === 'string' && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string') }));
  } catch { return []; }
}
export default function useConversations() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeId, setActiveId] = useState(() => crypto.randomUUID());
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      setStorageError('');
    } catch { setStorageError('브라우저에 대화를 저장할 수 없습니다. 현재 대화는 이 화면에서만 유지됩니다.'); }
  }, [conversations]);
  function updateMessages(update) {
    setConversations(previous => {
      const existing = previous.find(item => item.id === activeId);
      const messages = typeof update === 'function' ? update(existing?.messages || []) : update;
      if (!messages.length) return previous.filter(item => item.id !== activeId);
      const conversation = {
        id: activeId,
        title: summarizeTitle(messages.find(message => message.role === 'user')?.content),
        updatedAt: Date.now(),
        messages,
      };
      return [conversation, ...previous.filter(item => item.id !== activeId)];
    });
  }
  function clearAll() {
    setConversations([]);
    setActiveId(crypto.randomUUID());
  }
  return { conversations, activeId, setActiveId, messages: conversations.find(item => item.id === activeId)?.messages || [], updateMessages, newConversation: () => setActiveId(crypto.randomUUID()), clearAll, storageError };
}
