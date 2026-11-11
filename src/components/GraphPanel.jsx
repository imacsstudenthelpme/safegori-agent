import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { menus, nodeTypes, nodeDescriptions } from '../data/mockData';
import Icon from './Icon';
import { useSettings } from '../settings';

// 흐름 배치: 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책 (왼쪽 → 오른쪽)
const COL_W = 190;
const ROW_H = 74;
const FLOW_ACCENT = '#d2632b';

// Neo4j 노드의 상세 설명.
function describeNode(node) {
  if (nodeDescriptions[node.id]) return nodeDescriptions[node.id];
  const p = node.props ?? {};
  switch (node.type) {
    case 'equipment':
      return `기인물${p.category ? ` · ${p.category}` : ''} · 사고사례 ${p.cases ?? '-'}건${p.examples?.length ? ` · 예: ${p.examples.join(', ')}` : ''}`;
    case 'task':
      return `${p.kind ?? '작업'} ${p.fullName ?? node.label} · 이 기인물 사고 ${p.count ?? '-'}건`;
    case 'risk':
      return `유발요인${p.category ? ` (${p.category})` : ''} · 이 기인물 사고 ${p.count ?? '-'}건`;
    case 'accident':
      return `재해종류 · 이 기인물 사고 ${p.count ?? '-'}건`;
    case 'prevention':
      return `${p.fullName ?? node.label} · 대책 ${p.count ?? '-'}개${p.examples?.length ? ` · 예: ${p.examples[0]}` : ''}`;
    default:
      return node.label;
  }
}

const idOf = (x) => (typeof x === 'object' && x !== null ? x.id : x);

export default function GraphPanel({ graph, selectedMenu, selectedNode,
  onSelectNode, objects = [], currentObject, onSelectObject, graphError }) {
  const settings = useSettings();
  const canvasColor = settings.dark ? '#182630' : '#f8fafb';
  const textColor = settings.dark ? '#edf5f1' : '#293b49';
  const mutedColor = settings.dark ? '#8fa59b' : '#8aa197';
  const panel = useRef(null);
  const fullscreenButton = useRef(null);
  const container = useRef(null);
  const graphRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [filter, setFilter] = useState('all');
  const [hoverId, setHoverId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const activeMenu = menus.find((menu) => menu.id === selectedMenu);
  const isMock = graph.source !== 'neo4j';

  // 단계(stage)가 있는 그래프는 열을 세워 고정 배치합니다. 샘플 데이터도 같은 방식.
  const stages = useMemo(() => {
    const used = [...new Set(graph.nodes.map((n) => n.stage).filter((s) => s !== undefined))].sort((a, b) => a - b);
    return used.map((s) => ({ stage: s, name: graph.stages?.[s] ?? nodeTypes[graph.nodes.find((n) => n.stage === s)?.type]?.label ?? '' }));
  }, [graph]);
  const isFlow = stages.length > 1;

  const graphData = useMemo(() => {
    if (!isFlow) return { nodes: graph.nodes.map((n) => ({ ...n })), links: graph.links.map((l) => ({ ...l })) };
    const x0 = -((stages.length - 1) * COL_W) / 2;
    const nodes = [];
    stages.forEach(({ stage }, ci) => {
      const col = graph.nodes.filter((n) => n.stage === stage);
      col.forEach((n, i) => {
        const x = x0 + ci * COL_W, y = (i - (col.length - 1) / 2) * ROW_H;
        // 시뮬레이션을 돌리지 않으므로 고정 좌표와 현재 좌표를 함께 지정합니다.
        nodes.push({ ...n, x, y, fx: x, fy: y });
      });
    });
    return { nodes, links: graph.links.map((l) => ({ ...l })) };
  }, [graph, isFlow, stages]);

  // 경로 강조(o→o→o): 기준 노드에서 화살표를 따라 앞뒤로 이어진 노드와 링크 전체
  const adjacency = useMemo(() => {
    const out = new Map(), inn = new Map();
    graph.links.forEach((l, i) => {
      const s = idOf(l.source), t = idOf(l.target);
      out.set(s, [...(out.get(s) ?? []), { to: t, i }]);
      inn.set(t, [...(inn.get(t) ?? []), { to: s, i }]);
    });
    return { out, inn };
  }, [graph]);
  const focus = hoverId ?? selectedNode?.id ?? null;
  const chain = useMemo(() => {
    const nodes = new Set(), links = new Set();
    if (!focus) return { nodes, links };
    for (const dir of ['out', 'inn']) {
      const stack = [focus], seen = new Set([focus]);
      while (stack.length) {
        const cur = stack.pop();
        nodes.add(cur);
        for (const e of adjacency[dir].get(cur) ?? []) {
          links.add(e.i);
          if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
        }
      }
    }
    return { nodes, links };
  }, [focus, adjacency]);
  const linkIndex = (link) => graphData.links.indexOf(link);
  const onChain = (link) => chain.links.has(linkIndex(link));

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const fit = () => graphRef.current?.zoomToFit(350, isFlow ? 70 : 60);

  useEffect(() => { setFilter('all'); setHoverId(null); }, [graph]);

  // 흐름 배치는 좌표가 정해져 있으니 바로 화면에 맞추고, 그 외에는 힘 기반 배치 후 맞춥니다.
  const hasCanvas = size.width > 0;
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    if (isFlow) {
      const t = setTimeout(fit, 80);
      return () => clearTimeout(t);
    }
    fg.d3Force('charge')?.strength(-750);
    fg.d3Force('link')?.distance(150);
    fg.d3ReheatSimulation();
  }, [graphData, isFlow, hasCanvas, fullscreen]);

  async function openFullscreen() {
    setFullscreen(true);
    try { await panel.current?.requestFullscreen?.(); } catch { /* Keep the viewport fallback. */ }
  }
  async function closeFullscreen() {
    if (document.fullscreenElement === panel.current) await document.exitFullscreen();
    setFullscreen(false);
    fullscreenButton.current?.focus();
  }
  useEffect(() => {
    const change = () => {
      const active = document.fullscreenElement === panel.current;
      setFullscreen(active);
      if (!active) fullscreenButton.current?.focus();
    };
    const escape = event => {
      if (event.key === 'Escape' && fullscreen) {
        setFullscreen(false);
        fullscreenButton.current?.focus();
      }
    };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      window.removeEventListener('keydown', escape);
    };
  }, [fullscreen]);
  useEffect(() => {
    if (!size.width || !size.height) return;
    const timer = setTimeout(() => graphRef.current?.zoomToFit(0, isFlow ? 70 : 60), 80);
    return () => clearTimeout(timer);
  }, [size, isFlow]);

  const handleEngineStop = () => { if (!isFlow) fit(); };

  const maxCount = useMemo(() => Math.max(1, ...graph.nodes.map((n) => n.props?.count ?? n.props?.cases ?? 0)), [graph]);

  function drawNode(node, ctx) {
    const style = nodeTypes[node.type] ?? nodeTypes.equipment;
    const selected = selectedNode?.id === node.id;
    const dimmed = (filter !== 'all' && filter !== node.type) || (focus && !chain.nodes.has(node.id));
    const weight = node.props?.count ?? node.props?.cases;
    const radius = isMock ? 25 : weight ? 13 + Math.sqrt(weight / maxCount) * 11 : 18;
    ctx.globalAlpha = dimmed ? 0.18 : 1;
    ctx.beginPath(); ctx.arc(node.x, node.y, selected ? radius + 4 : radius, 0, Math.PI * 2);
    ctx.fillStyle = style.background; ctx.fill(); ctx.strokeStyle = focus && chain.nodes.has(node.id) ? FLOW_ACCENT : style.color;
    ctx.lineWidth = selected || node.id === focus ? 3 : 1.5; ctx.stroke();
    ctx.fillStyle = style.color; ctx.font = '600 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (settings.nodeDisplay === 'both') ctx.fillText(style.label, node.x, node.y);
    ctx.fillStyle = textColor; ctx.font = '600 12px sans-serif'; ctx.fillText(node.label, node.x, node.y + radius + 14);
    if (!isMock && weight) { ctx.fillStyle = mutedColor; ctx.font = '10px sans-serif'; ctx.fillText(`${weight.toLocaleString()}건`, node.x, node.y + radius + 28); }
    ctx.globalAlpha = 1;
  }

  // 단계 제목: 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책
  function drawStages(ctx, scale) {
    if (!isFlow) return;
    const top = Math.min(...graphData.nodes.map((n) => n.fy ?? 0)) - 62;
    const x0 = -((stages.length - 1) * COL_W) / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${12 / Math.min(scale, 1.6)}px sans-serif`;
    stages.forEach((s, i) => {
      const x = x0 + i * COL_W;
      ctx.fillStyle = mutedColor; ctx.fillText(s.name, x, top);
      if (i + 1 < stages.length) ctx.fillText('→', x + COL_W / 2, top);
    });
  }

  const caption = isMock ? 'CRANE OPERATIONS' : `${graph.title}`;
  const captionSub = isMock ? '인양 작업의 위험과 예방 관계' : graph.subtitle;
  const legendTypes = Object.entries(nodeTypes).filter(([type]) => graph.nodes.some((node) => node.type === type));
  const focusNode = focus ? graph.nodes.find((n) => n.id === focus) : null;
  const chainSummary = focusNode && chain.nodes.size > 1
    ? stages.map((s) => graph.nodes.filter((n) => n.stage === s.stage && chain.nodes.has(n.id)).map((n) => n.label)).filter((xs) => xs.length).map((xs) => xs.length > 2 ? `${xs[0]} 외 ${xs.length - 1}` : xs.join('·')).join(' → ')
    : null;

  return <main ref={panel} className={`graph-panel ${fullscreen ? 'graph-fullscreen' : ''}`}>
    <header className="graph-header"><div className="eyebrow">WORKSPACE <span>/</span> {activeMenu.label}</div><div className="heading-row"><div><h1>Knowledge Graph</h1><p>산업재해 관계 탐색</p></div><span className="sample-badge"><span/> {isMock ? '샘플 데이터' : 'Neo4j 실데이터'}</span></div></header>
    <div className="graph-toolbar">
      <div className="graph-count">관계 네트워크 <span>{graph.nodes.length} nodes · {graph.links.length} links</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {objects.length > 0 && <label className="graph-count" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          기인물
          <select value={currentObject} onChange={(event) => onSelectObject(event.target.value)} style={{ fontSize: 11, padding: '4px 6px', border: '1px solid #e3ece6', borderRadius: 4 }}>
            {objects.map((object) => <option key={object.name} value={object.name}>{object.name} ({object.cases})</option>)}
          </select>
        </label>}
        <button className="text-button" onClick={() => { setFilter('all'); onSelectNode(null); fit(); }}><Icon name="fit" size={15}/> 화면 맞춤</button>
        <button ref={fullscreenButton} className="text-button" aria-pressed={fullscreen} onClick={fullscreen ? closeFullscreen : openFullscreen}>{fullscreen ? '전체보기 닫기 ✕' : '그래프 전체보기 ↗'}</button>
      </div>
    </div>
    {graphError && <div className="graph-count" style={{ padding: '8px 25px', background: '#fcf3e7', color: '#9a6b2f' }}>Neo4j 그래프를 불러오지 못해 샘플 데이터를 표시합니다 · {graphError}</div>}
    <div className="graph-canvas" ref={container}>
      <div className="canvas-caption"><span className="tiny-square"/> {caption}<span>{captionSub}</span></div>
      {size.width > 0 && <ForceGraph2D ref={graphRef} width={size.width} height={size.height} graphData={graphData} backgroundColor={canvasColor} nodeId="id"
        nodeLabel={(node) => describeNode(node)} nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(node, color, ctx) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, 30, 0, Math.PI * 2); ctx.fill(); }}
        onNodeHover={(node) => setHoverId(node ? node.id : null)}
        linkColor={(link) => (focus ? (onChain(link) ? FLOW_ACCENT : 'rgba(186,199,208,0.25)') : '#bac7d0')}
        linkWidth={(link) => (isMock ? 1.4 : Math.min(1 + (link.count ?? 0) / 40, 5) + (focus && onChain(link) ? 1 : 0))}
        linkDirectionalArrowLength={6} linkDirectionalArrowRelPos={0.72}
        linkDirectionalParticles={(link) => (focus ? (onChain(link) ? 3 : 0) : isFlow ? 1 : 0)}
        linkDirectionalParticleSpeed={() => (focus ? 0.012 : 0.004)}
        linkDirectionalParticleWidth={(link) => (focus && onChain(link) ? 4 : 2.5)}
        linkDirectionalParticleColor={() => FLOW_ACCENT}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link, ctx) => {
          if (!settings.relations || typeof link.source !== 'object') return;
          // 흐름 배치에서는 기준 노드에 바로 붙은 관계만 이름을 표시합니다 (경로 전체에 붙이면 글자가 겹침)
          if (isFlow && !(focus && (idOf(link.source) === focus || idOf(link.target) === focus))) return;
          const x = (link.source.x + link.target.x) / 2; const y = (link.source.y + link.target.y) / 2;
          ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = canvasColor; ctx.fillRect(x - 44, y - 7, 88, 15); ctx.fillStyle = textColor; ctx.fillText(link.relation, x, y + 4);
        }}
        onRenderFramePost={drawStages}
        d3VelocityDecay={0.35} cooldownTicks={isFlow ? 0 : 120} onEngineStop={handleEngineStop}
        onNodeClick={(node) => onSelectNode(graph.nodes.find((item) => item.id === node.id))}
        enableNodeDrag={!isMock && !isFlow} minZoom={0.3} maxZoom={3}/>}
      <div className="zoom-controls"><button aria-label="그래프 확대" onClick={() => graphRef.current?.zoom(Math.min(3, graphRef.current.zoom() * 1.25), 200)}><Icon name="plus" size={17}/></button><button aria-label="그래프 축소" onClick={() => graphRef.current?.zoom(Math.max(0.3, graphRef.current.zoom() / 1.25), 200)}><Icon name="minus" size={17}/></button><button aria-label="그래프 화면 맞춤" onClick={fit}><Icon name="fit" size={17}/></button></div>
      <div className="graph-hint">{isFlow ? '노드에 마우스를 올리면 이어진 흐름만 강조됩니다 · 누르면 고정' : '드래그하여 이동 · 스크롤하여 확대'}</div>
    </div>
    <div className="graph-footer"><div className="legend" aria-label="노드 유형 강조">{legendTypes.map(([type, style]) => <button key={type} aria-pressed={filter === type} onClick={() => setFilter(filter === type ? 'all' : type)} className={filter === type ? 'selected' : ''}><span style={{ background: style.color }}/>{style.label}</button>)}</div><div className="node-list" aria-label="노드 선택">{graph.nodes.map((node) => <button key={node.id} aria-pressed={selectedNode?.id === node.id} onClick={() => onSelectNode(selectedNode?.id === node.id ? null : node)}>{node.label}</button>)}</div><div className="node-detail"><span className="detail-icon"><Icon name={selectedNode ? 'graph' : 'shield'}/></span><div><strong>{selectedNode ? (selectedNode.props?.fullName ?? selectedNode.label) : selectedMenu === 'explore' ? '연결된 관계를 탐색해 보세요' : `${activeMenu.label} · 미리보기`}</strong><p>{selectedNode ? describeNode(selectedNode) : selectedMenu === 'explore' ? '노드를 선택하면 상세정보와 이어진 흐름을 확인할 수 있습니다.' : '이 메뉴의 전용 기능은 준비 중입니다. 현재는 공통 그래프를 표시합니다.'}</p>{chainSummary && <p className="chain-summary">흐름 · {chainSummary}</p>}</div>{selectedNode && <button className="close-button" aria-label="노드 선택 해제" onClick={() => onSelectNode(null)}>×</button>}</div></div>
  </main>;
}
