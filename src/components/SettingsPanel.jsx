import { useEffect, useState } from 'react';
import { useSettings } from '../settings';
import packageInfo from '../../package.json';
export default function SettingsPanel({ onChange, onClear }) {
  const settings = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      let neo4j = false;
      try {
        const graphResponse = await fetch('/api/graph/health', { signal: AbortSignal.timeout(8000) });
        neo4j = graphResponse.ok && (await graphResponse.json()).neo4j === 'connected';
      } catch { /* Keep the backend and database status separate. */ }
      setStatus({ ...data, neo4j, connected: data.status === 'ok', checked: new Date().toLocaleString('ko-KR') });
    } catch { setStatus({ connected: false, checked: new Date().toLocaleString('ko-KR') }); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  const toggle = (key, title, detail) => <label className="setting-row"><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={settings[key]} onChange={e => onChange(key, e.target.checked)}/></label>;
  return <main className="settings-panel"><header className="graph-header"><div className="heading-row"><div><h1>설정</h1><p>나에게 편한 화면과 탐색 방식을 선택하세요.</p></div></div></header><div className="settings-content">
    <section><h2>화면 설정</h2>{toggle('dark','다크모드','어두운 배경으로 눈부심을 줄입니다.')}<label className="setting-row"><span><strong>글자 크기</strong><small>전체 화면의 글자 크기를 조절합니다.</small></span><select value={settings.size} onChange={e => onChange('size',e.target.value)}><option value="normal">기본</option><option value="large">크게</option><option value="larger">더 크게</option></select></label></section>
    <section><h2>그래프 설정</h2><label className="setting-row"><span><strong>항목 표시 방식</strong><small>연결 지도에 표시할 정보를 선택합니다.</small></span><select value={settings.nodeDisplay} onChange={e => onChange('nodeDisplay',e.target.value)}><option value="both">이름과 종류</option><option value="name">이름만</option></select></label>{toggle('relations','연결 설명 표시','항목 사이의 선 위에 연결 의미를 표시합니다.')}</section>
    <section><h2>채팅 설정</h2><label className="setting-row"><span><strong>답변 표시 방식</strong><small>내용은 유지하고 줄 간격과 여백을 조절합니다.</small></span><select value={settings.reading ? 'reading' : 'normal'} onChange={e => onChange('reading',e.target.value === 'reading')}><option value="normal">기본</option><option value="reading">읽기 편하게</option></select></label><div className="setting-row"><span><strong>대화 기록 삭제</strong><small>이 브라우저에 저장된 최근 대화와 현재 대화를 모두 지웁니다.</small></span><button className="secondary-button" onClick={() => { setNotice(''); setConfirm(true); }}>대화 삭제</button></div><p role="status">{notice}</p></section>
    <section><h2>데이터 설정</h2>{toggle('sources','사고 사례 출처 표시','상세 화면에 원본 파일·시트·행을 표시합니다.')}</section>
    <section><div className="setting-heading"><h2>서비스 안내</h2><button className="secondary-button" disabled={loading} onClick={refresh}>{loading ? '확인 중…' : '상태 새로고침'}</button></div><dl className="service-info"><dt>데이터 기준일</dt><dd>자료에 명시되지 않음</dd><dt>백엔드</dt><dd>{loading ? '확인 중' : status?.connected ? '연결됨' : '연결 확인 필요'}</dd><dt>Upstage 설정</dt><dd>{status?.connected ? status.upstage_configured ? 'API 키 설정됨' : 'API 키 미설정' : '확인 불가'}</dd><dt>Upstage 응답</dt><dd>{status?.connected && status.last_chat_success ? `최근 성공: ${new Date(status.last_chat_success).toLocaleString('ko-KR')}` : '현재 서버에서 성공 기록 없음'}</dd><dt>Neo4j</dt><dd>{status?.neo4j ? '연결됨 · 기인물별 그래프 조회 가능' : '연결 확인 필요 · 조회 실패 시 예시 그래프 표시'}</dd><dt>사고 데이터 기반 AI 답변</dt><dd>미연결 · 현재 Upstage 기본 대화</dd><dt>버전</dt><dd>{packageInfo.version}</dd><dt>상태 확인 시각</dt><dd>{status?.checked || '확인 중'}</dd></dl></section>
  </div>{confirm && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="delete-title" className="confirm-dialog" onKeyDown={e => { if (e.key === 'Escape') setConfirm(false); if(e.key === 'Tab') { e.preventDefault(); const buttons=e.currentTarget.querySelectorAll('button'); (document.activeElement === buttons[0] ? buttons[1] : buttons[0]).focus(); } }}><h2 id="delete-title">저장된 모든 대화를 삭제할까요?</h2><p>삭제한 대화는 복원할 수 없습니다. 생성 중인 답변도 이 대화에 추가되지 않습니다.</p><div><button autoFocus className="secondary-button" onClick={() => setConfirm(false)}>취소</button><button className="primary-button" onClick={() => { onClear(); setConfirm(false); setNotice('대화 기록을 삭제했습니다.'); }}>삭제하기</button></div></section></div>}</main>;
}
