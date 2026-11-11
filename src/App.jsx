import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import GraphPanel from './components/GraphPanel';
import SifExplorer from './sif/SifExplorer';
import ChatPanel from './components/ChatPanel';
import CasesPanel from './components/CasesPanel';
import AboutPanel from './components/AboutPanel';
import SettingsPanel from './components/SettingsPanel';
import { SettingsContext, usePreferences } from './settings';
import { mockGraph } from './data/mockData';
import { fetchObjectGraph, fetchObjects } from './api/graph';
import './App.css';
import './readability.css';
import useConversations from './hooks/useConversations';
const DEFAULT_OBJECT = '비계';
export default function App() {
  const [settings, changeSettings] = usePreferences();
  const chats = useConversations();
  const [selectedMenu, setSelectedMenu] = useState('explore');
  const [selectedNode, setSelectedNode] = useState(null);
  const [graph, setGraph] = useState(mockGraph);
  const [objects, setObjects] = useState([]);
  const [currentObject, setCurrentObject] = useState(DEFAULT_OBJECT);
  const [graphError, setGraphError] = useState(null);

  // 기인물 목록 (툴바 선택 상자용.)
  useEffect(() => {
    fetchObjects().then(setObjects).catch(() => setObjects([]));
  }, []);

  // 선택한 기인물의 그래프를 Neo4j에서 불러오고, 실패하면 샘플 데이터로 대체하게 만듦...
  useEffect(() => {
    let cancelled = false;
    setSelectedNode(null);
    fetchObjectGraph(currentObject)
      .then((data) => {
        if (cancelled) return;
        setGraph(data);
        setGraphError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setGraph(mockGraph);
        setGraphError(error.message);
      });
    return () => { cancelled = true; };
  }, [currentObject]);

  const [presentation, setPresentation] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    const escape = (event) => { if (event.key === 'Escape') { setPresentation(false); setMenuOpen(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  function navigate(menu) {
    setSelectedMenu(menu); setMenuOpen(false); setPresentation(false);
  }

  return <SettingsContext.Provider value={settings}><div className={`app wide ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${presentation ? 'presenting' : ''} ${menuOpen ? 'menu-open' : ''}`}>
    <div className="mobile-bar"><button onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>☰ 메뉴</button><strong>SafeGori</strong></div>
    <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(value => !value)} selectedMenu={selectedMenu} onSelectMenu={navigate} conversations={chats.conversations} activeConversation={chats.activeId} onOpenConversation={(id) => { chats.setActiveId(id); navigate('chat'); }} onNewConversation={() => { chats.newConversation(); navigate('chat'); }}/>
    <div className="view-slot sif-slot" hidden={selectedMenu !== 'explore'}><SifExplorer dark={settings.dark} objectView={<GraphPanel graph={graph} selectedMenu="explore" selectedNode={selectedNode} onSelectNode={setSelectedNode} objects={objects} currentObject={currentObject} onSelectObject={setCurrentObject} graphError={graphError}/>}/></div>
    <div className="view-slot" hidden={selectedMenu !== 'cases'}><CasesPanel/></div>
    <div className="view-slot about-slot" hidden={selectedMenu !== 'about'}><AboutPanel onNavigate={navigate} presentation={presentation} onPresentation={() => setPresentation(!presentation)}/></div>
    {selectedMenu === 'settings' && <div className="view-slot"><SettingsPanel onChange={changeSettings} onClear={chats.clearAll}/></div>}
    <div className="chat-slot expanded" hidden={selectedMenu !== 'chat'}><ChatPanel key={chats.activeId} messages={chats.messages} setMessages={chats.updateMessages} storageError={chats.storageError}/></div>
  </div></SettingsContext.Provider>;
}
