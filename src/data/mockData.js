export const menus = [
  { id: 'explore', label: '온톨로지 전체 탐색', icon: 'graph' },
  { id: 'chat', label: '안전대책 물어보기', icon: 'chat' },
  { id: 'cases', label: '사고 사례 조회', icon: 'document' },
  { id: 'about', label: '프로젝트 소개', icon: 'experiment' },
  { id: 'settings', label: '설정', icon: 'settings' },
];

 // 추가 색 설정 완료 

export const nodeTypes = {
  task: { label: '작업', color: '#559b98', background: '#eaf5f2' },
  equipment: { label: '기인물', color: '#5479b8', background: '#edf2fa' },
  risk: { label: '유발요인', color: '#cc914b', background: '#fcf3e7' },
  accident: { label: '사고유형', color: '#c25b5b', background: '#fbeeee' },
  prevention: { label: '예방대책', color: '#8474b4', background: '#f1edf8' },
};

export const mockGraph = {
  source: 'mock',
  nodes: [
    { id: 'lifting', label: '인양 작업', type: 'task', stage: 0 },
    { id: 'crane', label: '크레인', type: 'equipment', stage: 1 },
    { id: 'fall', label: '낙하 위험', type: 'risk', stage: 2 },
    { id: 'control', label: '작업구역 통제', type: 'prevention', stage: 4 },
  ],
  links: [
    { source: 'lifting', target: 'crane', relation: '사용 설비' },
    { source: 'crane', target: 'fall', relation: '발생 가능 위험' },
    { source: 'fall', target: 'control', relation: '예방대책' },
  ],
};
export const nodeDescriptions = {
  crane: '인양 작업에 사용되는 설비입니다. 연결된 작업과 위험요인을 따라 탐색해 보세요.',
  lifting: '크레인을 이용해 중량물을 이동하는 작업을 나타내는 예시 노드입니다.',
  fall: '인양 작업과 연결된 위험요인입니다. 예방대책 노드와의 관계를 확인할 수 있습니다.',
  control: '낙하 위험에 연결한 예방대책 예시입니다. 실제 현장 적용을 위한 검증된 지침은 아닙니다.',
};
