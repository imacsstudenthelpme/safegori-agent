import { useEffect, useState } from 'react';
import { fetchPattern, fetchPatterns } from '../api/graph';
import { nodeTypes } from '../data/mockData';

const SECTOR = { '제조업 등': 'M', '건설업': 'C' };
const LEVEL_ORDER = ['제거·대체', '공학적 대책', '관리적 대책', '개인보호구'];
const PART_TYPE = { 기인물: 'equipment', 재해종류: 'accident', 유발요인: 'risk' };
const levelRank = (levels) => Math.min(9, ...levels.map(l => (LEVEL_ORDER.indexOf(l) + 10) % 10));

function PartChips({ parts }) {
  return <div className="pattern-parts">{['기인물', '재해종류', '유발요인'].map(role => parts.find(p => p.role === role)).filter(Boolean).map(p => {
    const style = nodeTypes[PART_TYPE[p.role]];
    return <span key={p.role} style={{ color: style.color, background: style.background, borderColor: style.color }}>{p.name}</span>;
  })}</div>;
}

// 사고 패턴: 같은 기인물·재해종류·유발요인으로 일어난 사고 묶음과 대표 사례 (현장 작업자·교육 담당자용)
export default function PatternsView({ group, onOpenRecord }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [limit, setLimit] = useState(30);
  useEffect(() => {
    const timer = setTimeout(() => {
      setError('');
      fetchPatterns({ q: query, sector: SECTOR[group] ?? '', limit }).then(setResult).catch(e => { setResult(null); setError(e.message); });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, group, limit]);
  function open(id) { setError(''); fetchPattern(id).then(setDetail).catch(e => setError(e.message)); }

  if (detail) {
    const total = detail.controlLevels.reduce((s, x) => s + x.n, 0) || 1;
    return <article className="case-detail pattern-detail">
      <button className="secondary-button" onClick={() => setDetail(null)}>← 패턴 목록으로</button>
      <div className="case-meta">사고 패턴 · 사례 {detail.pattern.size.toLocaleString()}건{detail.pattern.topWorks.length ? ` · 주요 작업: ${detail.pattern.topWorks.join(', ')}` : ''}</div>
      <h2>{detail.pattern.name}</h2>
      <PartChips parts={detail.parts}/>
      <div className="level-bars" aria-label="이 패턴 대책의 통제위계">
        {[...detail.controlLevels].sort((a, b) => LEVEL_ORDER.indexOf(a.k) - LEVEL_ORDER.indexOf(b.k)).map(x => <div key={x.k}><span>{x.k}</span><i style={{ width: `${(x.n / total) * 100}%` }}/><b>{x.n}</b></div>)}
      </div>
      {detail.representatives.map((r, i) => <section key={r.case.id} className="rep-case">
        <div className="case-meta"><span>대표 사례 {i + 1}</span><span>{r.case.sector}</span><span>{r.case.code}</span>{r.case.year && <span>{r.case.year}년</span>}</div>
        <p className="rep-summary">{r.case.summary}</p>
        <h3>원인</h3>
        <p>{r.hazards.join(', ')}{r.case.raw_hf ? ` — ${r.case.raw_hf}` : ''}</p>
        <h3>예방대책</h3>
        <ul>{[...r.measures].sort((a, b) => levelRank(a.levels) - levelRank(b.levels)).map((m, k) => <li key={k}>{m.text}{m.levels.length > 0 && <small>{m.levels.join(' · ')}</small>}</li>)}</ul>
        {r.case.legacyId && <button className="text-button" onClick={() => onOpenRecord(r.case.legacyId)}>원문 전체 보기 ↗</button>}
      </section>)}
    </article>;
  }
  return <>
    <div className="pattern-search"><input placeholder="패턴 찾기: 포크레인, 사다리, 추락, 안전대…" value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }}/>
      <span>{result ? `패턴 ${result.total.toLocaleString()}개` : ''}</span></div>
    {error ? <div className="empty-state" role="alert"><h2>사고 패턴을 불러오지 못했습니다.</h2><p>사고 패턴은 백엔드와 Neo4j 연결이 필요합니다 · {error}</p></div>
      : !result ? <div className="empty-state" role="status">사고 패턴을 불러오고 있습니다.</div>
        : result.items.length === 0 ? <div className="empty-state"><h2>맞는 패턴이 없습니다.</h2><p>다른 말로 찾아보세요.</p></div>
          : <div className="case-grid">{result.items.map(({ pattern, reps, parts }) => <button className="case-card pattern-card" key={pattern.id} onClick={() => open(pattern.id)}>
            <PartChips parts={parts}/>
            <div className="case-meta"><span>사례 {pattern.size.toLocaleString()}건</span><span>{pattern.sectors.map(s => (s === 'C' ? '건설' : '제조')).join('·')}</span>{pattern.topWorks[0] && <span>주로 {pattern.topWorks[0]}</span>}</div>
            {reps[0] && <p><b>{reps[0].code}</b> {reps[0].summary}</p>}
            <span className="case-link">대표 사례 · 원인 · 대책 보기 ↗</span>
          </button>)}</div>}
    {result && result.items.length < result.total && <div className="pagination"><button onClick={() => setLimit(limit + 30)}>패턴 더 보기</button></div>}
  </>;
}
