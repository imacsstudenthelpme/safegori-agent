// SIF 온톨로지 API 클라이언트와 공통 정의.
// API 주소는 Vite라면 .env의 VITE_SIF_API, 아니면 setApiBase()로 지정합니다.

export type Group = 'case' | 'context' | 'accident' | 'object' | 'hazard' | 'measure' | 'time' | 'height' | 'term' | 'pattern' | 'root';

export interface SifNode {
  id: string;
  name: string;
  label: string; // Neo4j 라벨 (AccidentCase, CausalObject ...) 또는 Root
  group: Group;
  val?: number; // 분류 화면: 사례 수
  level?: number; // 분류 화면: 0 최상위, 1 상위, 2 하위, 3 펼친 항목
  stage?: number; // 흐름 화면: 0 작업 → 1 기인물 → 2 유발요인 → 3 재해종류 → 4 예방대책
  root?: boolean; // 사례 화면의 중심 사례
  count?: number; // T-Box: 클래스 인스턴스 수
  values?: string[]; // T-Box: 지금 사례의 값
  text?: string;
  summary?: string;
  code?: string;
  mentor12?: boolean;
  [k: string]: unknown;
}

export interface SifLink {
  source: string | SifNode;
  target: string | SifNode;
  type: string;
  name: string;
  derived?: boolean;
  rid?: number;
  count?: number;
  present?: boolean | null;
  origin?: string;
  status?: string;
}

export interface GraphData {
  nodes: SifNode[];
  links: SifLink[];
}

export interface Bucket {
  k: string;
  n: number;
}
export interface NodeStats {
  accidentType: Bucket[];
  objectCategory: Bucket[];
  causalObject: Bucket[];
  hazardFactor: Bucket[];
  controlLevel: Bucket[];
  sector: Bucket[];
  heightBand: Bucket[];
  year: Bucket[]; // 연도순
}
export interface CaseItem {
  id: string;
  code: string;
  summary: string;
  sector?: string;
  year?: number;
}
export interface Concept {
  term: string; // 사용자가 쓴 말 (용어 사전)
  id: string;
  label: string;
  name: string;
  weight: number;
  group: Group;
}
// 사고 패턴 (유사 사고 묶음)
export interface PatternPart {
  role: '기인물' | '재해종류' | '유발요인';
  id: string;
  name: string;
  label: string;
}
export interface PatternRep {
  id: string;
  code: string;
  summary: string;
  year?: number;
  sector?: string;
}
export interface PatternSummary {
  pattern: { id: string; name: string; size: number; sectors: string[]; topWorks: string[] };
  reps: PatternRep[];
  parts: PatternPart[];
}
export interface PatternDetail {
  pattern: PatternSummary['pattern'];
  parts: PatternPart[];
  representatives: {
    case: PatternRep & { raw_hf?: string; raw_co?: string };
    hazards: string[];
    measures: { text: string; levels: string[] }[];
  }[];
  controlLevels: Bucket[];
}
export interface YearRange {
  y0?: number | null;
  y1?: number | null;
}

export type TaxonomyKind = 'accident_type' | 'hazard' | 'causal_object' | 'work_type' | 'industry' | 'year' | 'height';
export type Sector = 'M' | 'C' | null;

let BASE: string =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SIF_API as string | undefined) ??
  ''; // 기본: 같은 주소의 /api (vite.config.js의 프록시가 8000번 백엔드로 넘겨 줌)
export function setApiBase(url: string) {
  BASE = url.replace(/\/$/, '');
}

async function get<T>(path: string, params: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const u = new URL(BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') u.searchParams.set(k, String(v));
  });
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  caseGraph: (id: string) => get<GraphData>(`/api/case/${encodeURIComponent(id)}`),
  tbox: (caseId?: string) => get<GraphData>('/api/tbox', { case: caseId }),
  taxonomy: (kind: TaxonomyKind, sector: Sector, expand?: string | null, years: YearRange = {}) =>
    get<GraphData>(`/api/taxonomy/${kind}`, { sector, expand, y0: years.y0, y1: years.y1 }),
  nodeCases: (label: string, id: string, sector: Sector, skip = 0, limit = 40, years: YearRange = {}) =>
    get<{ total: number; items: CaseItem[] }>(
      `/api/nodes/${label}/${encodeURIComponent(id)}/cases`,
      { sector, skip, limit, y0: years.y0, y1: years.y1 },
    ),
  nodeStats: (label: string, id: string, sector: Sector, years: YearRange = {}) =>
    get<NodeStats>(`/api/nodes/${label}/${encodeURIComponent(id)}/stats`, { sector, y0: years.y0, y1: years.y1 }),
  // 사례 검색 + 질문 속 말이 가리키는 개념 (용어 사전, 연도)
  search: (q: string) => get<{ items: CaseItem[]; concepts: Concept[] }>('/api/search', { q }),
  terms: (q: string) => get<{ items: Concept[] }>('/api/terms', { q }),
  // 사고 패턴: 카드 목록, 상세(대표 사례·원인·대책), 흐름 그래프
  patterns: (q: string | null, sector: Sector, skip = 0, limit = 30) =>
    get<{ total: number; items: PatternSummary[] }>('/api/patterns', { q, sector, skip, limit }),
  pattern: (id: string) => get<PatternDetail>(`/api/patterns/${encodeURIComponent(id)}`),
  patternFlow: (id: string) => get<GraphData>(`/api/patterns/${encodeURIComponent(id)}/flow`),
};

// 흐름(o→o→o) 단계. 라벨로 단계를 정하고, 사례는 맨 앞(-1)에 둡니다.
export const FLOW_STAGES: { name: string; labels: string[] }[] = [
  { name: '작업', labels: ['UnitWork', 'WorkSituation'] }, // 가장 구체적인 작업 단위만
  { name: '기인물', labels: ['CausalObject'] },
  { name: '유발요인', labels: ['HazardFactor'] },
  { name: '재해종류', labels: ['AccidentType'] },
  { name: '예방대책', labels: ['Measure', 'ControlLevel'] },
];
export function stageOf(n: { label: string; stage?: number; root?: boolean }): number | undefined {
  if (typeof n.stage === 'number') return n.stage;
  if (n.label === 'AccidentCase' && n.root) return -1;
  const i = FLOW_STAGES.findIndex((s) => s.labels.includes(n.label));
  return i >= 0 ? i : undefined;
}

// 멘토님 데모와 같은 계열의 색
export const GROUP_COLOR: Record<Group, string> = {
  case: '#F6CD3B',
  context: '#A6D44E',
  accident: '#EF6A5C',
  object: '#7CCBEE',
  hazard: '#F7A23B',
  measure: '#B6A9F5',
  time: '#5DCAA5',
  height: '#ED93B1',
  term: '#B4B2A9',
  pattern: '#FFD98A',
  root: '#4A5563',
};

// 관계 정의. 순서 번호(1부터)가 rid이고, 관점별 핵심 관계 번호와 같습니다 (api/server.py RELATIONS와 같은 순서).
export const RELATIONS: [string, string, string, string][] = [
  ['AccidentCase', 'Industry', 'IN_INDUSTRY', '업종'],
  ['AccidentCase', 'WorkSituation', 'OCCURRED_DURING', '작업 중 발생'],
  ['AccidentCase', 'UnitWork', 'OCCURRED_DURING', '작업 중 발생'],
  ['AccidentCase', 'AccidentType', 'HAS_ACCIDENT_TYPE', '재해종류'],
  ['AccidentCase', 'AccidentTypeGroup', 'CLASSIFIED_AS', '사례별 보정'],
  ['AccidentCase', 'CausalObject', 'INVOLVES', '기인물'],
  ['AccidentCase', 'HazardFactor', 'CAUSED_BY', '유발요인'],
  ['AccidentCase', 'Measure', 'HAS_MEASURE', '예방대책'],
  ['Industry', 'Industry', 'BROADER', '상위 분류'],
  ['UnitWork', 'Work', 'BROADER', '상위 분류'],
  ['Work', 'WorkType', 'BROADER', '상위 분류'],
  ['CausalObject', 'CausalObject', 'BROADER', '상위 분류'],
  ['CausalObject', 'ObjectCategory', 'BROADER', '상위 분류'],
  ['HazardFactor', 'HazardCategory', 'BROADER', '상위 분류'],
  ['AccidentType', 'AccidentTypeGroup', 'BROADER', '상위 분류'],
  ['AccidentType', 'OfficialForm', 'MAPS_TO', '공식 명칭'],
  ['Measure', 'ControlLevel', 'BROADER', '상위 분류'],
  ['Measure', 'HazardFactor', 'MITIGATES', '통제'],
  ['HazardFactor', 'AccidentType', 'LEADS_TO', '이어짐'],
  // 20~ 시기·높이·용어
  ['AccidentCase', 'YearMonth', 'OCCURRED_IN', '발생 시기'],
  ['YearMonth', 'Year', 'BROADER', '상위 분류'],
  ['Year', 'Period', 'BROADER', '상위 분류'],
  ['AccidentCase', 'HeightBand', 'FELL_FROM', '추락 높이'],
  ['HeightBand', 'HeightBand', 'BROADER', '상위 분류'],
  ['Term', 'CausalObject', 'REFERS_TO', '가리킴'],
  ['Term', 'AccidentType', 'REFERS_TO', '가리킴'],
  ['Term', 'HazardFactor', 'REFERS_TO', '가리킴'],
  // 28~ 사고 패턴
  ['AccidentCase', 'AccidentPattern', 'BELONGS_TO', '같은 패턴'],
  ['AccidentPattern', 'CausalObject', 'DEFINED_BY', '정의'],
  ['AccidentPattern', 'AccidentType', 'DEFINED_BY', '정의'],
  ['AccidentPattern', 'HazardFactor', 'DEFINED_BY', '정의'],
  ['AccidentPattern', 'AccidentCase', 'REPRESENTED_BY', '대표 사례'],
];

export function ridOf(sourceLabel: string, type: string, targetLabel: string): number | undefined {
  const i = RELATIONS.findIndex(([s, t, r]) => s === sourceLabel && r === type && t === targetLabel);
  return i >= 0 ? i + 1 : undefined;
}

export interface Persona {
  name: string;
  core: number[];
  ref: number[];
}
export const PERSONAS: Persona[] = [
  { name: '전체 보기', core: [], ref: [] },
  { name: '현장 안전관리자', core: [3, 2, 6, 7, 8, 18, 17, 23], ref: [12, 13, 14, 4, 24] },
  { name: '근로자', core: [3, 2, 6, 4, 8], ref: [17, 23] },
  { name: '경영자·사업주', core: [1, 9, 15, 14, 17, 19, 20, 21, 22], ref: [4, 7, 8] },
  { name: '감독·정책기관', core: [1, 9, 10, 11, 16, 15, 5, 19, 20, 21, 22], ref: [13, 14, 23] },
  { name: '연구자·분석가', core: [19, 18, 5, 13, 14, 15, 12, 20, 21, 23, 24], ref: [4, 6, 7, 22] },
  { name: '도메인 검토자', core: [4, 5, 6, 7, 12, 13, 14, 15, 16, 17, 25, 26, 27], ref: [18, 19, 23] },
  { name: '데이터 엔지니어', core: [4, 5, 6, 7, 8, 12, 17, 18, 19, 20, 23, 25, 26, 27], ref: [1, 2, 3, 9, 10, 11, 13, 14, 15, 16, 21, 22, 24] },
  { name: 'AI 챗봇', core: [2, 3, 4, 6, 7, 8, 12, 13, 15, 18, 20, 21, 25, 26, 27], ref: [1, 19, 22, 23] },
];

// T-Box 화면의 고정 배치 (첫 번째 그림과 같은 자리)
export const TBOX_LAYOUT: Record<string, [number, number]> = {
  AccidentCase: [0, 0], Industry: [-345, -225], WorkSituation: [-345, -115], UnitWork: [-345, 90],
  Work: [-345, 190], WorkType: [-345, 285], AccidentType: [115, -170], AccidentTypeGroup: [-150, -275],
  OfficialForm: [200, -275], CausalObject: [290, -65], ObjectCategory: [380, -175], HazardFactor: [290, 95],
  HazardCategory: [380, 205], Measure: [0, 205], ControlLevel: [220, 295],
  YearMonth: [-170, 390], Year: [-170, 490], Period: [-345, 490], HeightBand: [420, 400], Term: [560, 20],
  AccidentPattern: [560, 180],
};
