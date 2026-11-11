// react-force-graph-2d로 SIF 그래프를 그리는 컴포넌트.
// mode
//   'tbox'     클래스 상자를 고정 자리에 배치하고, 사례 값(values)을 상자 안에 표시
//   'case'     사례를 중심에 둔 방사형 트리 (멘토님 A-Box 화면)
//   'taxonomy' 최상위 → 상위 → 하위 방사형 트리 (멘토님 분류체계 화면)
// flow=true  작업 → 기인물 → 유발요인 → 재해종류 → 예방대책 순서로 열을 세워 왼쪽→오른쪽 흐름으로 배치
// 노드에 마우스를 올리거나 누르면, 연결된 이웃만이 아니라 화살표 방향을 따라 앞뒤로 이어진 경로 전체를 강조하고
// 그 경로 위로 입자가 흘러가게 합니다 (o→o→o).
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { FLOW_STAGES, GROUP_COLOR, PERSONAS, TBOX_LAYOUT, ridOf, stageOf } from './api';
import type { GraphData, SifLink, SifNode } from './api';

type N = NodeObject<SifNode>;
type L = LinkObject<SifNode, SifLink>;

export interface SifGraphProps {
  data: GraphData;
  mode: 'tbox' | 'case' | 'taxonomy';
  width: number;
  height: number;
  persona?: number; // PERSONAS 인덱스
  selectedId?: string | null;
  onNodeClick?: (node: SifNode) => void;
  dark?: boolean;
  flow?: boolean; // 흐름 배치 (case 데이터 또는 /api/patterns/{id}/flow 데이터)
}

const COL_W = 230; // 흐름 배치의 열 간격
const ROW_H = 70;

const idOf = (x: unknown): string =>
  typeof x === 'object' && x !== null ? String((x as { id: unknown }).id) : String(x);

function cut(s: string, k: number) {
  return s.length > k ? s.slice(0, k) + '…' : s;
}

export default function SifGraph({ data, mode, width, height, persona = 0, selectedId, onNodeClick, dark, flow = false }: SifGraphProps) {
  const fg = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const [hover, setHover] = useState<string | null>(null);
  const ink = dark ? '#E6E9ED' : '#1C2430';
  const edge = dark ? '#7D8896' : '#8A939E';
  const edgeLabel = dark ? '#F2A766' : '#A24E14';
  const bg = dark ? '#1A1F26' : '#FFFFFF';

  // react-force-graph는 data 객체를 직접 고치므로 복사본을 넘깁니다.
  const graph = useMemo(() => {
    const label = new Map(data.nodes.map((n) => [n.id, n.label]));
    if (flow) {
      // 단계가 있는 노드만 남기고, 단계 순서대로 열을 세웁니다.
      const staged = data.nodes.filter((n) => stageOf(n) !== undefined);
      const cols = new Map<number, SifNode[]>();
      staged.forEach((n) => {
        const st = stageOf(n)!;
        cols.set(st, [...(cols.get(st) ?? []), n]);
      });
      const order = [...cols.keys()].sort((a, b) => a - b);
      const x0 = -((order.length - 1) * COL_W) / 2;
      const nodes: N[] = [];
      order.forEach((st, ci) => {
        const col = cols.get(st)!.sort((a, b) => (b.val ?? 0) - (a.val ?? 0));
        col.forEach((n, i) => {
          const px = x0 + ci * COL_W, py = (i - (col.length - 1) / 2) * ROW_H;
          // 흐름 배치는 시뮬레이션을 돌리지 않으므로 고정 좌표(fx, fy)와 현재 좌표(x, y)를 함께 지정합니다.
          nodes.push({ ...n, stage: st, fx: px, fy: py, x: px, y: py });
        });
      });
      // 서버가 준 FLOW 링크가 있으면 그대로, 없으면(사례 데이터) 이웃한 단계끼리 잇습니다.
      let links: L[] = data.links.filter((l) => l.type === 'FLOW').map((l) => ({ ...l }));
      if (!links.length) {
        for (let k = 0; k + 1 < order.length; k++) {
          cols.get(order[k])!.forEach((a) =>
            cols.get(order[k + 1])!.forEach((b) => links.push({ source: a.id, target: b.id, type: 'FLOW', name: '' })),
          );
        }
      }
      links = links.map((l) => ({ ...l, derived: false }));
      return { nodes, links };
    }
    const nodes: N[] = data.nodes.map((n) => {
      const c: N = { ...n };
      if (mode === 'tbox' && TBOX_LAYOUT[n.id]) {
        c.fx = c.x = TBOX_LAYOUT[n.id][0];
        c.fy = c.y = TBOX_LAYOUT[n.id][1];
      }
      if (mode === 'case' && n.root) {
        c.fx = 0;
        c.fy = 0;
      }
      return c;
    });
    const links: L[] = data.links.map((l) => ({
      ...l,
      rid: l.rid ?? ridOf(label.get(idOf(l.source)) ?? '', l.type, label.get(idOf(l.target)) ?? ''),
    }));
    return { nodes, links };
  }, [data, mode, flow]);

  const maxVal = useMemo(() => {
    const m: Record<number, number> = {};
    data.nodes.forEach((n) => {
      const lv = n.level ?? 0;
      m[lv] = Math.max(m[lv] ?? 0, n.val ?? 0);
    });
    return m;
  }, [data]);

  const flowMax = useMemo(() => Math.max(1, ...data.nodes.map((n) => n.val ?? 0)), [data]);
  const radius = (n: SifNode) => {
    if (flow) return n.root ? 10 : n.val ? 6 + Math.sqrt(n.val / flowMax) * 8 : 7;
    if (mode === 'case') return n.root ? 9 : n.label.endsWith('Category') || n.label === 'AccidentTypeGroup' || n.label === 'ControlLevel' ? 6 : 5;
    if (mode === 'taxonomy') {
      const lv = n.level ?? 0;
      if (lv === 0) return 9;
      const r = Math.sqrt((n.val ?? 0) / (maxVal[lv] || 1));
      return lv === 1 ? 5 + r * 10 : 2.5 + r * 7;
    }
    return 6;
  };

  // 관점(보는 사람)별 강조: 0 핵심, 1 참고, 2 숨김
  const role = (l: L) => {
    if (!persona) return 0;
    const p = PERSONAS[persona];
    const rid = l.rid ?? -1;
    return p.core.includes(rid) ? 0 : p.ref.includes(rid) ? 1 : 2;
  };

  // 방향 그래프: 앞(들어오는 쪽)과 뒤(나가는 쪽)
  const adj = useMemo(() => {
    const out = new Map<string, { to: string; key: string }[]>();
    const inn = new Map<string, { to: string; key: string }[]>();
    graph.links.forEach((l, i) => {
      const s = idOf(l.source), t = idOf(l.target), key = `${s}|${t}|${l.type}|${i}`;
      (l as L & { _k?: string })._k = key;
      out.set(s, [...(out.get(s) ?? []), { to: t, key }]);
      inn.set(t, [...(inn.get(t) ?? []), { to: s, key }]);
    });
    return { out, inn };
  }, [graph]);

  // 선택한 노드가 지금 그래프에 없으면(검색으로 고른 개념 등) 흐리게 만들지 않습니다.
  const selOnCanvas = selectedId && graph.nodes.some((n) => n.id === selectedId) ? selectedId : null;
  const focus = hover ?? selOnCanvas ?? null;

  // 경로 강조: 기준 노드에서 화살표를 따라 뒤로(하위·결과 쪽), 거꾸로 앞으로(원인·사례 쪽) 이어진 노드·링크 전체.
  // 사례 노드처럼 모든 곳으로 퍼지는 허브는 앞쪽 탐색에서 거기서 멈춥니다 (그래프 전체가 켜지는 것을 막음).
  const chain = useMemo(() => {
    const nodes = new Set<string>(), links = new Set<string>();
    if (!focus) return { nodes, links };
    const hub = (id: string) => graph.nodes.find((n) => n.id === id)?.label === 'AccidentCase' && id !== focus;
    const walk = (start: string, dir: 'out' | 'inn') => {
      const stack = [start];
      const seen = new Set([start]);
      while (stack.length) {
        const cur = stack.pop()!;
        nodes.add(cur);
        if (dir === 'inn' && hub(cur)) continue;
        for (const e of adj[dir].get(cur) ?? []) {
          links.add(e.key);
          if (!seen.has(e.to)) {
            seen.add(e.to);
            stack.push(e.to);
          }
        }
      }
    };
    walk(focus, 'out');
    walk(focus, 'inn');
    return { nodes, links };
  }, [focus, adj, graph]);
  const keyOf = (l: L) => (l as L & { _k?: string })._k ?? '';

  const nodeOn = (n: N) => !focus || chain.nodes.has(String(n.id));
  const linkOn = (l: L) => {
    if (mode === 'tbox' && l.present === false) return false;
    if (role(l) === 2) return false;
    return !focus || chain.links.has(keyOf(l));
  };

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    if (mode === 'tbox' || flow) {
      g.d3Force('charge')?.strength(0);
    } else {
      g.d3Force('charge')?.strength(mode === 'case' ? -260 : -120);
    }
    const t = setTimeout(() => g.zoomToFit(400, flow ? 70 : 50), mode === 'tbox' || flow ? 60 : 900);
    return () => clearTimeout(t);
  }, [graph, mode, flow]);

  // 흐름 배치의 열 제목 위치
  const stageCols = useMemo(() => {
    if (!flow) return [];
    const m = new Map<number, { x: number; top: number }>();
    graph.nodes.forEach((n) => {
      const st = n.stage ?? 0;
      const cur = m.get(st);
      const y = (n.fy as number) ?? 0;
      m.set(st, { x: (n.fx as number) ?? 0, top: Math.min(cur?.top ?? y, y) });
    });
    const top = Math.min(...[...m.values()].map((v) => v.top));
    return [...m.entries()].map(([st, v]) => ({ x: v.x, y: top - 70, name: st < 0 ? '사고' : FLOW_STAGES[st]?.name ?? '' }));
  }, [graph, flow]);

  return (
    <ForceGraph2D<SifNode, SifLink>
      ref={fg}
      graphData={graph}
      width={width}
      height={height}
      backgroundColor={bg}
      dagMode={mode === 'tbox' || flow ? undefined : 'radialout'}
      dagLevelDistance={mode === 'case' ? 110 : 130}
      onDagError={() => undefined}
      cooldownTicks={mode === 'tbox' || flow ? 0 : 120}
      linkDirectionalParticles={(l) => (focus ? (chain.links.has(keyOf(l)) ? 3 : 0) : flow ? 1 : 0)}
      linkDirectionalParticleSpeed={() => (focus ? 0.012 : 0.005)}
      linkDirectionalParticleWidth={(l) => (focus && chain.links.has(keyOf(l)) ? 4 : 2.5)}
      linkDirectionalParticleColor={() => '#D2632B'}
      onRenderFramePost={(ctx, scale) => {
        if (!flow) return;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${13 / Math.min(scale, 2)}px sans-serif`;
        stageCols.forEach((c, i) => {
          ctx.fillStyle = edge;
          ctx.fillText(c.name, c.x, c.y);
          if (i + 1 < stageCols.length) {
            ctx.fillText('→', (c.x + stageCols[i + 1].x) / 2, c.y);
          }
        });
      }}
      nodeId="id"
      nodeLabel={(n) => String(n.text ?? n.summary ?? n.name)}
      nodeVal={(n) => radius(n)}
      onNodeHover={(n) => setHover(n ? String(n.id) : null)}
      onNodeClick={(n) => onNodeClick?.(n as SifNode)}
      nodeCanvasObject={(n, ctx, scale) => {
        const on = nodeOn(n);
        ctx.globalAlpha = on ? 1 : 0.2;
        const color = GROUP_COLOR[n.group] ?? '#999';
        const x = n.x ?? 0, y = n.y ?? 0;
        if (mode === 'tbox') {
          const w = 120, h = 46, has = (n.values?.length ?? 0) > 0;
          ctx.fillStyle = has ? color : dark ? '#2A313A' : '#EEF0F2';
          ctx.beginPath();
          ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
          ctx.fill();
          if (n.id === 'AccidentCase') {
            ctx.strokeStyle = '#1C2430';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = has ? '#1C2430' : edge;
          ctx.font = '600 11px sans-serif';
          ctx.fillText(n.name, x, y - 12);
          ctx.font = '9px sans-serif';
          ctx.fillText(n.label, x, y);
          ctx.font = '500 10px sans-serif';
          const vals = Array.from(new Set(n.values ?? []));
          ctx.fillText(has ? cut(vals[0], 12) + (vals.length > 1 ? ` 외 ${vals.length - 1}` : '') : `${(n.count ?? 0).toLocaleString()}개`, x, y + 13);
          ctx.globalAlpha = 1;
          return;
        }
        const r = radius(n);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        if (n.id === selectedId || n.root) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.5 / scale;
          ctx.stroke();
        }
        if (flow) {
          const fs = 11.5 / Math.min(scale, 2);
          ctx.font = `${n.root ? 600 : 500} ${fs}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const text = cut(String(n.name), n.label === 'Measure' ? 14 : 16) + (n.val && !n.root ? ` ${n.val.toLocaleString()}` : '');
          ctx.lineWidth = 3 / scale;
          ctx.strokeStyle = bg;
          ctx.strokeText(text, x, y + r + 3);
          ctx.fillStyle = ink;
          ctx.fillText(text, x, y + r + 3);
          ctx.globalAlpha = 1;
          return;
        }
        const lv = n.level ?? 1;
        const showLabel = mode === 'case' || lv <= 1 || lv === 3 || data.nodes.length <= 45 || scale > 1.6 || n.id === focus;
        if (showLabel) {
          const fs = (lv <= 1 || n.root ? 12 : 10.5) / Math.min(scale, 2.2);
          ctx.font = `${lv <= 1 || n.root ? 600 : 400} ${fs}px sans-serif`;
          const text = cut(String(n.name), n.label === 'Measure' ? 16 : 18) + (mode === 'taxonomy' && n.val ? ` ${n.val.toLocaleString()}` : '');
          const right = x >= 0;
          ctx.textAlign = n.root || lv === 0 ? 'center' : right ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          const tx = n.root || lv === 0 ? x : x + (right ? r + 3 : -r - 3);
          const ty = n.root || lv === 0 ? y - r - fs : y;
          ctx.lineWidth = 3 / scale;
          ctx.strokeStyle = bg;
          ctx.strokeText(text, tx, ty);
          ctx.fillStyle = ink;
          ctx.fillText(text, tx, ty);
        }
        ctx.globalAlpha = 1;
      }}
      nodePointerAreaPaint={(n, color, ctx) => {
        ctx.fillStyle = color;
        const x = n.x ?? 0, y = n.y ?? 0;
        if (mode === 'tbox') ctx.fillRect(x - 60, y - 23, 120, 46);
        else {
          ctx.beginPath();
          ctx.arc(x, y, radius(n) + 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }}
      linkColor={(l) => (!linkOn(l) ? (dark ? 'rgba(125,136,150,0.12)' : 'rgba(138,147,158,0.15)') : persona && role(l) === 0 ? '#D2632B' : edge)}
      linkWidth={(l) => (persona && role(l) === 0 ? 2 : 1)}
      linkLineDash={(l) => (l.derived ? [4, 3] : role(l) === 1 ? [2, 3] : null)}
      linkCurvature={(l) => (idOf(l.source) === idOf(l.target) ? 0.8 : l.type === 'LEADS_TO' || l.type === 'MITIGATES' ? 0.25 : 0)}
      linkDirectionalArrowLength={mode === 'taxonomy' ? 0 : 4}
      linkDirectionalArrowRelPos={1}
      linkCanvasObjectMode={() => 'after'}
      linkCanvasObject={(l, ctx, scale) => {
        const s = l.source as N, t = l.target as N;
        if (typeof s !== 'object' || typeof t !== 'object' || mode === 'taxonomy' || flow || !l.name) return;
        const on = linkOn(l);
        if (!on || scale < 0.7) return;
        const self = s.id === t.id;
        const mx = self ? (s.x ?? 0) : ((s.x ?? 0) + (t.x ?? 0)) / 2;
        const my = self ? (s.y ?? 0) - (mode === 'tbox' ? 48 : 24) : ((s.y ?? 0) + (t.y ?? 0)) / 2;
        const fs = 10 / Math.min(scale, 2);
        ctx.font = `${fs}px sans-serif`;
        const text = l.name;
        const w = ctx.measureText(text).width;
        ctx.fillStyle = bg;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(mx - w / 2 - 2, my - fs / 2 - 1, w + 4, fs + 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = edgeLabel;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, mx, my);
      }}
    />
  );
}
