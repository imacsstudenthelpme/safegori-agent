// Local topic extraction keeps conversation titles short without a second AI request.
const topics = ['위험성 평가', '작업계획서', '안전교육', '산업안전보건법', '프레스', '컨베이어', '리프트', '승강기', '보호구', '유해물질', '환기', '포크레인', '이동식 크레인', '타워크레인', '크레인', '굴착기', '지게차', '고소작업대', '작업발판', '안전난간', '안전대', '안전모', '줄걸이', '인양 작업', '중량물', '거푸집', '동바리', '비계', '사다리', '개구부', '밀폐공간', '용접', '화기 작업', '전기 작업', '철골', '지붕', '해체 작업', '굴착 작업', '건설업', '제조업', '낙하', '추락', '감전', '화재', '폭발', '끼임', '붕괴', '질식', '전도', '충돌', '분진', '소음'];
export function summarizeTitle(text = '') {
  text = typeof text === 'string' ? text : '';
  const compact = text.replace(/\s/g, '').toLowerCase();
  const found = topics.filter(topic => compact.includes(topic.replace(/\s/g, '')));
  const unique = found.filter(topic => !found.some(other => other !== topic && other.replace(/\s/g, '').includes(topic.replace(/\s/g, ''))));
  const intent = /비교|차이/.test(text) ? '비교' : /사례/.test(text) ? '사고 사례' : /점검|체크/.test(text) ? '점검 사항' : /원인|이유/.test(text) ? '발생 원인' : /예방|대책|방지|안전|주의/.test(text) ? '안전대책' : /위험/.test(text) ? '위험요인' : '작업 정보';
  if (unique.length) return `${unique.slice(0, 2).join(' · ')} ${intent}`;
  const nouns = text.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/)
    .map(word => word.replace(/(에서는|에서의|으로의|으로|에서|에게|관련된|이란|이라는|이랑|와의|과의|은|는|이|가|을|를|의|와|과|도|에|부터|까지)$/u, ''))
    .filter(word => word.length > 1 && !/^\d+$/.test(word) && !/^(안녕|제가|저는|이거|그거|어떤|어떻게|무엇|뭐|왜|좀|대한|관련|관한|대해|알려|설명|정리|부탁|궁금|해주|주세요|질문|답변|답해|알고|싶|있|없|필요|오늘|어제|내일|작업|정보|예방|대책|안전|위험|확인|기능|입니다|테스트|그리고|먼저)/u.test(word))
    .filter(word => !/(요|니다|까요|나요|해줘|할까|싶어|하는|할때|하던|하고|해서|되면|하면|인지|줘)$/u.test(word));
  return nouns.length ? `${[...new Set(nouns)].slice(0, 2).join(' ').slice(0, 22)} ${intent}` : intent === '작업 정보' ? '안전 상담' : intent;
}
export function messageDay(message) {
  const date = new Date(message.createdAt);
  if (!message.createdAt || !Number.isFinite(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
export function formatMessageDate(message, withTime = false) {
  if (messageDay(message) === 'unknown') return '날짜 정보 없음';
  return new Date(message.createdAt).toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { weekday: 'short' }),
  });
}
