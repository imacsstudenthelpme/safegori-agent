import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { filterCases, loadCases } from '../data/caseRepository';
import { useSettings } from '../settings';
import PatternsView from './PatternsView';
const emptyFilters = { query: '', group: '', category: '', task: '' };
const noRecords = [];
const PAGE_SIZE = 45;
const options = (records, key) => [...new Set(records.map(r => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
export default function CasesPanel() {
  const settings = useSettings();
  const scroll = useRef(null);
  const listPosition = useRef(0);
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('list');
  useLayoutEffect(() => { if (!selected) scroll.current?.scrollTo(0, listPosition.current); }, [selected]);
  function load() { setError(''); loadCases().then(setArchive).catch(e => setError(e.message)); }
  useEffect(() => { load(); }, []);
  const records = archive?.records || noRecords;
  const filtered = useMemo(() => filterCases(records, filters), [records, filters]);
  const scoped = records.filter(r => !filters.group || r.group === filters.group);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  function change(key, value) { setFilters(previous => ({ ...previous, [key]: value, ...(key === 'group' ? { category: '', task: '' } : {}) })); setPage(1); setSelected(null); listPosition.current = 0; scroll.current?.scrollTo(0, 0); }
  const detail = selected ? <main className="cases-panel case-detail-page">
    <header className="case-detail-header">
      <h1>{selected.group} <span>›</span> {selected.category || '미분류'} <span>›</span> #{selected.fields['연번'] ?? selected.id}</h1>
      <button className="secondary-button" onClick={() => setSelected(null)}>목록으로</button>
    </header>
    <div className="case-detail-scroll"><article className="case-detail">
      <dl>{Object.entries(selected.fields).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '정보 없음'}</dd></div>)}</dl>
      {settings.sources && <div className="source-note"><strong>원본 출처</strong><p>{archive.sourceFile}</p><p>{selected.sourceSheet} · {selected.sourceRow}행 · {selected.id}</p></div>}
    </article></div>
  </main> : null;
  function openRecord(id) {
    const record = records.find(item => String(item.id) === String(id));
    if (record) setSelected(record);
    else setError("원본 사례를 찾을 수 없습니다.");
  }
  return <>{detail}<main className="cases-panel" hidden={!!selected}>
    <header className="graph-header"><div className="heading-row"><div><h1>사고 사례 조회</h1><p>사고 사례를 검색하고 원인과 예방대책을 확인하세요.</p></div></div></header>
    <div className="case-tabs" role="tablist" aria-label="사례 보기">
      <button role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>사례 목록</button>
      <button role="tab" aria-selected={mode === 'patterns'} className={mode === 'patterns' ? 'active' : ''} onClick={() => setMode('patterns')}>사고 패턴 <small>비슷한 사고 묶음</small></button>
    </div>
    {error ? <div className="empty-state" role="alert">{error}<button onClick={load}>다시 시도</button></div> : !archive ? <div className="empty-state" role="status">사고 사례를 불러오고 있습니다.</div> : <>
      <div className="case-filters">{mode === 'list' && <label>키워드 검색<input placeholder="제목·사고 내용·예방대책 검색" value={filters.query} onChange={e => change('query', e.target.value)}/></label>}<div className="filter-row">
        <label>자료 구분<select value={filters.group} onChange={e => change('group', e.target.value)}><option value="">전체 자료</option>{options(records, 'group').map(v => <option key={v}>{v}</option>)}</select></label>
        {mode === 'list' && <><label>업종 / 공종<select value={filters.category} onChange={e => change('category', e.target.value)}><option value="">전체 분류</option>{options(scoped, 'category').map(v => <option key={v}>{v}</option>)}</select></label>
        <label>작업 / 상황<select value={filters.task} onChange={e => change('task', e.target.value)}><option value="">전체 작업</option>{options(scoped, 'task').map(v => <option key={v}>{v}</option>)}</select></label>
        <button className="secondary-button" onClick={() => { setFilters(emptyFilters); setPage(1); setSelected(null); listPosition.current = 0; scroll.current?.scrollTo(0, 0); }}>초기화</button></>}
      </div></div>
      {mode === 'patterns' ? <div className="case-scroll"><PatternsView group={filters.group} onOpenRecord={openRecord}/></div> : <>
      <div className="results-bar"><div className="result-counts"><span>검색 결과 <strong>{filtered.length.toLocaleString()}</strong>건</span><span className="result-divider" aria-hidden="true">/</span><span>전체 <strong>{records.length.toLocaleString()}</strong>건</span></div>{!selected && <p>사례를 선택하면 상세 내용을 볼 수 있습니다.</p>}</div>
      <div className="case-scroll" ref={scroll}>
        {filtered.length === 0 ? <div className="empty-state"><h2>검색 결과가 없습니다.</h2><p>검색어나 필터를 변경해 보세요.</p></div> : <div className="case-grid">{filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(record => <button className="case-card" key={record.id} onClick={() => { listPosition.current = scroll.current?.scrollTop || 0; setSelected(record); }}><div className="case-meta"><span>{record.group}</span><span>{record.category || '정보 없음'}</span><span>#{record.fields['연번']}</span></div><h2>{record.task || '작업 정보 없음'}</h2><p>{record.summary || '재해개요 정보 없음'}</p></button>)}</div>}
      </div>
      {!selected && <div className="pagination"><button disabled={page === 1} onClick={() => { setPage(page - 1); scroll.current?.scrollTo(0, 0); }}>이전</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => { setPage(page + 1); scroll.current?.scrollTo(0, 0); }}>다음</button></div>}
      </>}
    </>}
  </main></>;
}
