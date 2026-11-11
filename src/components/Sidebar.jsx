import { menus } from '../data/mockData';
import Icon from './Icon';
export default function Sidebar({ collapsed, onToggleCollapse, selectedMenu, onSelectMenu, conversations, activeConversation, onOpenConversation, onNewConversation }) {
  return <aside className="sidebar">
    <div className="sidebar-top"><div className="brand" aria-label="SafeGori"><span className="brand-mark"><Icon name="graph" size={24}/></span><div className="brand-text">SafeGori<small>산업 안전 지식 탐색 서비스</small></div></div>
    <button className="sidebar-toggle" onClick={onToggleCollapse} aria-label={collapsed ? '메뉴바 펼치기' : '메뉴바 접기'} title={collapsed ? '메뉴바 펼치기' : '메뉴바 접기'} aria-expanded={!collapsed}><Icon name={collapsed ? 'expand' : 'collapse'} size={18}/></button></div>
    <nav aria-label="주 메뉴">{menus.map((menu) => <button key={menu.id} aria-label={menu.label} title={collapsed ? menu.label : undefined} className={`menu-item ${selectedMenu === menu.id ? 'active' : ''}`} aria-current={selectedMenu === menu.id ? 'page' : undefined} onClick={() => onSelectMenu(menu.id)}><Icon name={menu.icon}/><span>{menu.label}</span>{selectedMenu === menu.id && <span className="active-dot"/>}</button>)}</nav>
    <section className="recent-conversations" aria-label="최근 대화">
      <div className="recent-heading"><h2>최근 대화</h2><button onClick={onNewConversation} aria-label="새 대화 시작"><Icon name="plus" size={16}/> 새 대화</button></div>

      {conversations.length ? <div className="conversation-list">{conversations.map(conversation => <button key={conversation.id} className={selectedMenu === 'chat' && activeConversation === conversation.id ? 'active' : ''} aria-current={selectedMenu === 'chat' && activeConversation === conversation.id ? 'true' : undefined} onClick={() => onOpenConversation(conversation.id)} title={conversation.title}><span>{conversation.title}</span></button>)}</div> : <p className="history-note">아직 저장된 대화가 없습니다.</p>}
    </section>
    <div className="sidebar-bottom"><div className="workspace-user"><span className="user-avatar">S</span><div>안전고리<small>사고와 예방을 잇는 연결</small></div></div></div>
  </aside>;
}
