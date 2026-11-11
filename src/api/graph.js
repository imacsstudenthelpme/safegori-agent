// Neo4j 지식그래프 API 호출

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    let detail = `요청 실패 (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
    
    }
    throw new Error(detail);
  }
  return response.json();
}

/** 기인물 목록 [{ name, cases }] (사례 수 많은 순) */
export const fetchObjects = () => getJson('/api/objects');

/** 기인물 중심 그래프 */
export const fetchObjectGraph = (name) =>
  getJson(`/api/graph/object/${encodeURIComponent(name)}`);

/** 사고사례 상세 (id: sif-1-7 / SIF-M-0004 모두 가능) */
export const fetchCase = (id) => getJson(`/api/cases/${encodeURIComponent(id)}`);

/** 사고 패턴 카드 목록. q는 패턴 이름 또는 용어 사전(포크레인 → 굴착기)으로 찾습니다. sector: 'M' | 'C' */
export const fetchPatterns = ({ q = '', sector = '', skip = 0, limit = 30 } = {}) => {
  const params = new URLSearchParams({ skip, limit });
  if (q.trim()) params.set('q', q.trim());
  if (sector) params.set('sector', sector);
  return getJson(`/api/patterns?${params}`);
};

/** 사고 패턴 상세: 대표 사례(개요·원인·대책)와 통제위계 분포 */
export const fetchPattern = (id) => getJson(`/api/patterns/${encodeURIComponent(id)}`);
