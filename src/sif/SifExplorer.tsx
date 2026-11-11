// 다섯 가지 보기를 묶은 예시 페이지. 기존 웹페이지에 그대로 넣거나, SifGraph만 가져다 써도 됩니다.
//   <SifExplorer initialCase="SIF-M-0004" />
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import SifGraph from './SifGraph';
import { GROUP_COLOR, PERSONAS, api } from './api';
import type {
  Bucket, CaseItem, Concept, GraphData, NodeStats, PatternDetail, PatternSummary, Sector, SifNode, TaxonomyKind, YearRange,
} from './api';

type View = 'object' | 'tbox' | 'case' | 'pattern' | 'accident' | 'work' | 'hazard' | 'year' | 'height';
const VIEWS: { k: View; name: string }[] = [
  { k: 'object', name: '기인물 흐름' },
  { k: 'tbox', name: 'T-Box로 보기' },
  { k: 'case', name: '사례 그래프' },
  { k: 'pattern', name: '사고 패턴' },
  { k: 'accident', name: '재해종류' },
  { k: 'work', name: '공종·업종' },
  { k: 'hazard', name: '유발요인' },
  { k: 'year', name: '연도·시기' },
  { k: 'height', name: '추락 높이' },
];
const YEARS = Array.from({ length: 12 }, (_, i) => 2013 + i);
const PART_COLOR: Record<string, string> = { 기인물: GROUP_COLOR.object, 재해종류: GROUP_COLOR.accident, 유발요인: GROUP_COLOR.hazard };
const LEVEL_ORDER = ['제거·대체', '공학적 대책', '관리적 대책', '개인보호구'];

// 사고 패턴 카드 (한 줄에 3개). 현장 작업자·교육 담당자용: 그래프 대신 대표 사례와 원인 중심.
function PatternCard({ p, onDetail, onFlow, active }: { p: PatternSummary; onDetail: () => void; onFlow: () => void; active: boolean }) {
  const rep = p.reps[0];
  const parts = ['기인물', '재해종류', '유발요인'].map((r) => p.parts.find((x) => x.role === r)).filter(Boolean);
  return (
    <div style={{ border: `1px solid ${active ? '#1C2430' : '#DCE0E4'}`, borderRadius: 10, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {parts.map((x) => (
          <span key={x!.role} style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 4, background: PART_COLOR[x!.role], color: '#1C2430', fontWeight: 600 }}>{x!.name}</span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#77818E' }}>
        사례 <b style={{ color: '#1C2430' }}>{p.pattern.size.toLocaleString()}건</b> · {p.pattern.sectors.map((s) => (s === 'C' ? '건설' : '제조')).join('·')}
        {p.pattern.topWorks[0] ? ` · 주로 ${p.pattern.topWorks[0]}` : ''}
      </div>
      {rep && (
        <div style={{ fontSize: 12.5, color: '#2F3A47', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          <b>{rep.code}</b> {rep.summary}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button onClick={onDetail} style={{ ...btn(active), fontSize: 12, padding: '3px 8px' }}>원인·대책 보기</button>
        <button onClick={onFlow} style={{ ...btn(false), fontSize: 12, padding: '3px 8px' }}>흐름 보기</button>
      </div>
    </div>
  );
}

// 연도별 추이 (세로 막대)
function YearBars({ items }: { items: Bucket[] }) {
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: '#77818E', marginBottom: 4 }}>연도별 사례 수</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70 }}>
        {items.map((i) => (
          <div key={i.k} title={`${i.k}년 ${i.n}건`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', height: Math.max(2, (i.n / max) * 56), background: '#5DCAA5', borderRadius: 2 }} />
            <span style={{ fontSize: 9, color: '#77818E' }}>{i.k.slice(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function Bars({ title, items }: { title: string; items: Bucket[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: '#77818E', marginBottom: 4 }}>{title}</div>
      {items.map((i) => (
        <div key={i.k} style={{ display: 'grid', gridTemplateColumns: '1fr 48px', gap: 6, fontSize: 12.5, marginBottom: 3 }}>
          <span style={{ background: `linear-gradient(90deg,#C9CFD6 ${(i.n / max) * 100}%,transparent 0)`, borderRadius: 3, padding: '1px 6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{i.k}</span>
          <span style={{ textAlign: 'right', color: '#77818E' }}>{i.n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

const btn = (on: boolean): CSSProperties => ({
  padding: '5px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
  border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'), background: on ? 'var(--selected)' : 'var(--surface)', color: on ? 'var(--accent)' : 'var(--ink)',
});

export interface SifExplorerProps {
  initialCase?: string;
  objectView?: ReactNode; // '기인물 흐름' 탭에 그릴 화면 (SafeGori의 GraphPanel)
  dark?: boolean;
}

export default function SifExplorer({ initialCase = 'SIF-C-0001', objectView, dark = false }: SifExplorerProps) {
  const [view, setView] = useState<View>(objectView ? 'object' : 'tbox');
  const [caseId, setCaseId] = useState(initialCase);
  const [sector, setSector] = useState<Sector>(null);
  const [workKind, setWorkKind] = useState<'work_type' | 'industry'>('work_type');
  const [expand, setExpand] = useState<string | null>(null);
  const [persona, setPersona] = useState(0);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [sel, setSel] = useState<SifNode | null>(null);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [cases, setCases] = useState<{ total: number; items: CaseItem[] } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<CaseItem[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [years, setYears] = useState<YearRange>({});
  const [error, setError] = useState<string | null>(null);
  const [ref, size] = useSize<HTMLDivElement>();
  // 사고 패턴
  const [pats, setPats] = useState<{ total: number; items: PatternSummary[] } | null>(null);
  const [patQ, setPatQ] = useState('');
  const [patSel, setPatSel] = useState<PatternDetail | null>(null);
  // 흐름 보기: 사례 그래프 안에서 전환, 패턴은 전체보기 팝업
  const [caseFlow, setCaseFlow] = useState(false);
  const [popup, setPopup] = useState<{ title: string; data: GraphData } | null>(null);
  const openPatternFlow = (p: PatternSummary) =>
    api.patternFlow(p.pattern.id).then((d) => setPopup({ title: p.pattern.name, data: d })).catch((e: Error) => setError(e.message));
  const openPatternDetail = (id: string) => api.pattern(id).then(setPatSel).catch((e: Error) => setError(e.message));

  const kind: TaxonomyKind | null =
    view === 'accident' ? 'accident_type' : view === 'hazard' ? 'hazard' : view === 'work' ? workKind
      : view === 'year' ? 'year' : view === 'height' ? 'height' : null;
  const isTaxonomy = kind !== null;
  const sectorOf = (v: View): Sector => (v === 'work' ? null : sector);

  useEffect(() => {
    if (view !== 'pattern') return;
    const t = setTimeout(() => api.patterns(patQ.trim() || null, sector).then(setPats).catch((e: Error) => setError(e.message)), 200);
    return () => clearTimeout(t);
  }, [view, patQ, sector]);

  useEffect(() => {
    setError(null);
    if (view === 'pattern' || view === 'object') return;
    const p = view === 'tbox' ? api.tbox(caseId) : view === 'case' ? api.caseGraph(caseId)
      : api.taxonomy(kind!, sectorOf(view), expand, view === 'year' ? {} : years);
    p.then(setData).catch((e: Error) => setError(e.message));
  }, [view, caseId, sector, kind, expand, years]);

  // 분류 노드나 검색으로 고른 개념을 누르면: 그 아래 사례들의 분포와 목록
  useEffect(() => {
    setStats(null);
    setCases(null);
    const fromSearch = Boolean(sel?.fromSearch);
    if (!sel || sel.label === 'Root' || (!isTaxonomy && !fromSearch) || sel.label === 'AccidentCase') return;
    const s = sectorOf(view);
    api.nodeStats(sel.label, sel.id, s, years).then(setStats).catch(() => undefined);
    api.nodeCases(sel.label, sel.id, s, 0, 40, years).then(setCases).catch(() => undefined);
  }, [sel, sector, view, years]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setFound([]);
      setConcepts([]);
      return;
    }
    const t = setTimeout(() => api.search(q.trim()).then((r) => { setFound(r.items); setConcepts(r.concepts); }).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [q]);

  // 용어별로 묶기: 크레인 → [타워크레인, 이동식크레인, ...]
  const byTerm = concepts.reduce<Record<string, Concept[]>>((m, c) => ((m[c.term] = [...(m[c.term] ?? []), c]), m), {});
  const pickConcept = (c: Concept) => setSel({ id: c.id, name: c.name, label: c.label, group: c.group, fromSearch: true });
  const pickTerm = (term: string) => setSel({ id: 'TERM:' + term, name: `${term} (용어)`, label: 'Term', group: 'term', fromSearch: true });

  const openCase = useCallback((id: string) => {
    setCaseId(id);
    setSel(null);
    setView((v) => (v === 'tbox' ? 'tbox' : 'case'));
  }, []);

  const onNodeClick = (n: SifNode) => {
    setSel(n);
    if ((view === 'work' || view === 'year') && n.level === 2) setExpand((e) => (e === n.id ? null : n.id));
  };

  return (
    <div className="sif-explorer" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 320px', height: '100%', minHeight: 0, fontFamily: 'inherit',
      color: dark ? '#E6E9ED' : '#1C2430', background: dark ? '#182630' : '#fff' }}>
      <aside style={{ borderRight: '1px solid #DCE0E4', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {VIEWS.map((v) => (
          <button key={v.k} style={{ ...btn(view === v.k), textAlign: 'left' }} onClick={() => { setView(v.k); setSel(null); setExpand(null); }}>{v.name}</button>
        ))}
        <div style={{ marginTop: 14, fontSize: 12, color: '#77818E' }}>지금 보는 사례</div>
        <div style={{ fontWeight: 600 }}>{caseId}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사례 번호·기인물·개요로 찾기" style={{ padding: '6px 8px', border: '1px solid #C3C9D0', borderRadius: 6 }} />
        {Object.entries(byTerm).map(([term, cs]) => (
          <div key={term} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #DCE0E4' }}>
            <button onClick={() => (cs.every((c) => c.label === 'Year') ? pickConcept(cs[0]) : pickTerm(term))} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
              {term}
            </button>
            <span style={{ color: '#77818E' }}> → {cs.length > 1 ? `개념 ${cs.length}개` : ''}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
              {cs.slice(0, 6).map((c) => (
                <button key={c.id} onClick={() => pickConcept(c)} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, border: 0, cursor: 'pointer', background: c.label === 'Year' ? '#E1F5EE' : '#EEF0F2' }}>
                  {c.name}
                </button>
              ))}
              {cs.length > 6 && <span style={{ fontSize: 11, color: '#77818E' }}>외 {cs.length - 6}</span>}
            </div>
          </div>
        ))}
        {found.map((c) => (
          <button key={c.id} onClick={() => openCase(c.id)} style={{ border: 0, background: 'none', textAlign: 'left', fontSize: 12, padding: '4px 0', cursor: 'pointer' }}>
            <b>{c.code}</b> {c.year ? `${c.year} · ` : ''}{c.summary.slice(0, 40)}…
          </button>
        ))}
        <div style={{ marginTop: 14, fontSize: 12, color: '#77818E' }}>보는 사람</div>
        <select value={persona} onChange={(e) => setPersona(Number(e.target.value))} style={{ padding: 6 }}>
          {PERSONAS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
      </aside>

      {view === 'object' ? (
        // 기인물 흐름 탭: SafeGori의 기존 GraphPanel을 가운데+오른쪽 칸 전체에 그대로 표시
        <div className="sif-object-view" style={{ gridColumn: '2 / 4', minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>{objectView}</div>
      ) : (<>
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid #DCE0E4', alignItems: 'center' }}>
          <strong style={{ marginRight: 'auto' }}>{VIEWS.find((v) => v.k === view)?.name}</strong>
          {view === 'case' && (
            <>
              <button style={btn(caseFlow)} onClick={() => setCaseFlow((f) => !f)}>흐름 보기</button>
              <button style={btn(false)} onClick={() => setPopup({ title: caseId, data })}>전체보기</button>
            </>
          )}
          {view === 'pattern' && (
            <input value={patQ} onChange={(e) => setPatQ(e.target.value)} placeholder="패턴 찾기: 포크레인, 사다리, 추락…"
              style={{ padding: '5px 8px', border: '1px solid #C3C9D0', borderRadius: 6, fontSize: 13, width: 220 }} />
          )}
          {(view === 'accident' || view === 'hazard' || view === 'pattern') && ([null, 'M', 'C'] as Sector[]).map((s) => (
            <button key={String(s)} style={btn(sector === s)} onClick={() => { setSector(s); setSel(null); }}>{s === null ? '전체' : s === 'M' ? '제조업 등' : '건설업'}</button>
          ))}
          {view === 'work' && (['work_type', 'industry'] as const).map((k) => (
            <button key={k} style={btn(workKind === k)} onClick={() => { setWorkKind(k); setSel(null); setExpand(null); }}>{k === 'work_type' ? '건설 공종' : '제조 업종'}</button>
          ))}
          {isTaxonomy && view !== 'year' && (
            <span style={{ fontSize: 12, color: '#4A5563', display: 'flex', gap: 4, alignItems: 'center' }}>
              연도
              <select value={years.y0 ?? ''} onChange={(e) => setYears((y) => ({ ...y, y0: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">처음</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              ~
              <select value={years.y1 ?? ''} onChange={(e) => setYears((y) => ({ ...y, y1: e.target.value ? Number(e.target.value) : null }))}>
                <option value="">끝</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </span>
          )}
        </div>
        <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {error && <div style={{ padding: 16, color: '#A32D2D' }}>API에서 데이터를 받지 못했어요: {error}</div>}
          {view === 'pattern' ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 14, background: '#F7F8F6' }}>
              <div style={{ fontSize: 12.5, color: '#4A5563', marginBottom: 10 }}>
                같은 기인물 · 재해종류 · 유발요인으로 일어난 사고를 묶었습니다. {pats ? `패턴 ${pats.total.toLocaleString()}개` : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                {pats?.items.map((p) => (
                  <PatternCard key={p.pattern.id} p={p} active={patSel?.pattern.id === p.pattern.id}
                    onDetail={() => { setSel(null); openPatternDetail(p.pattern.id); }} onFlow={() => openPatternFlow(p)} />
                ))}
              </div>
            </div>
          ) : (
            <SifGraph
              dark={dark}
              data={data}
              mode={view === 'tbox' ? 'tbox' : view === 'case' ? 'case' : 'taxonomy'}
              flow={view === 'case' && caseFlow}
              width={size.width}
              height={size.height}
              persona={view === 'tbox' || view === 'case' ? persona : 0}
              selectedId={sel?.id}
              onNodeClick={onNodeClick}
            />
          )}
        </div>
      </main>

      <aside style={{ borderLeft: '1px solid #DCE0E4', padding: 16, overflow: 'auto' }}>
        {view === 'pattern' && patSel && !sel && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{patSel.pattern.name}</div>
            <div style={{ fontSize: 12, color: '#77818E', marginBottom: 8 }}>
              사고 패턴 · {patSel.pattern.size.toLocaleString()}건{patSel.pattern.topWorks.length ? ` · 주요 작업: ${patSel.pattern.topWorks.join(', ')}` : ''}
            </div>
            <Bars title="이 패턴 전체 대책의 통제위계" items={[...patSel.controlLevels].sort((a, b) => LEVEL_ORDER.indexOf(a.k) - LEVEL_ORDER.indexOf(b.k))} />
            {patSel.representatives.map((r, i) => (
              <div key={r.case.id} style={{ marginTop: 14, borderTop: '1px solid #DCE0E4', paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: '#77818E' }}>대표 사례 {i + 1}</div>
                <button onClick={() => openCase(r.case.id)} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{r.case.code}</button>
                <p style={{ fontSize: 12.5, margin: '4px 0' }}>{r.case.summary}</p>
                <div style={{ fontSize: 12, color: '#77818E', marginTop: 6 }}>원인</div>
                <p style={{ fontSize: 12.5, margin: '2px 0' }}>{r.hazards.join(', ')}{r.case.raw_hf ? ` — ${r.case.raw_hf}` : ''}</p>
                <div style={{ fontSize: 12, color: '#77818E', marginTop: 6 }}>예방대책</div>
                <ul style={{ margin: '2px 0', paddingLeft: 16, fontSize: 12.5 }}>
                  {[...r.measures].sort((a, b) => Math.min(...a.levels.map((l) => LEVEL_ORDER.indexOf(l)), 9) - Math.min(...b.levels.map((l) => LEVEL_ORDER.indexOf(l)), 9)).map((m, k) => (
                    <li key={k} style={{ marginBottom: 3 }}>{m.text} <span style={{ color: '#77818E', fontSize: 11 }}>{m.levels.join('·')}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {!sel && !(view === 'pattern' && patSel) && (
          <p style={{ color: '#77818E', fontSize: 13 }}>
            {view === 'pattern' ? '카드의 "원인·대책 보기"를 누르면 대표 사례와 원인, 예방대책이 여기에 나옵니다.' : '노드를 누르면 자세한 내용이 여기에 나옵니다. 노드에 마우스를 올리면 이어진 흐름이 강조됩니다.'}
          </p>
        )}
        {sel && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{sel.name}</div>
            <div style={{ fontSize: 12, color: '#77818E' }}>{sel.label}{sel.val ? ` · ${sel.val.toLocaleString()}건` : ''}</div>
            {sel.summary && <p style={{ fontSize: 13 }}>{sel.summary}</p>}
            {sel.text && <p style={{ fontSize: 13 }}>{sel.text}</p>}
            {sel.values && sel.values.length > 0 && <p style={{ fontSize: 13 }}>{Array.from(new Set(sel.values)).join(', ')}</p>}
            {stats && (
              <>
                <Bars title="재해종류" items={stats.accidentType} />
                <Bars title="기인물 분류" items={stats.objectCategory} />
                <Bars title="자주 나온 기인물" items={stats.causalObject} />
                <Bars title="유발요인" items={stats.hazardFactor} />
                <Bars title="대책의 통제위계" items={stats.controlLevel} />
                <Bars title="추락 높이" items={stats.heightBand ?? []} />
                <YearBars items={stats.year ?? []} />
              </>
            )}
            {cases && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: '#77818E' }}>사례 {cases.total.toLocaleString()}건 (누르면 사례 그래프로)</div>
                {cases.items.map((c) => (
                  <button key={c.id} onClick={() => openCase(c.id)} style={{ display: 'block', width: '100%', border: 0, borderBottom: '1px solid #DCE0E4', background: 'none', textAlign: 'left', padding: '6px 0', fontSize: 12.5, cursor: 'pointer' }}>
                    <b>{c.code}</b> {c.year ? `${c.year} · ` : ''}{c.summary.slice(0, 50)}…
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </aside>
      </>)}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(28,36,48,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(1200px, 94vw)', height: 'min(720px, 88vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #DCE0E4' }}>
              <strong style={{ marginRight: 'auto' }}>{popup.title}</strong>
              <span style={{ fontSize: 12, color: '#77818E', marginRight: 12 }}>노드에 마우스를 올리면 이어진 흐름만 강조됩니다</span>
              <button style={btn(false)} onClick={() => setPopup(null)}>닫기</button>
            </div>
            <PopupGraph data={popup.data} dark={dark} />
          </div>
        </div>
      )}
    </div>
  );
}

function PopupGraph({ data, dark }: { data: GraphData; dark?: boolean }) {
  const [ref, size] = useSize<HTMLDivElement>();
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
      <SifGraph data={data} mode="case" flow width={size.width} height={size.height} dark={dark} />
    </div>
  );
}
