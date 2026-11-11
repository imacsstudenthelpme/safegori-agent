let archivePromise;
export function loadCases() {
  if (!archivePromise) archivePromise = fetch(`${import.meta.env.BASE_URL}data/cases.json`).then(response => {
    if (!response.ok) throw new Error('사고 사례 데이터를 불러오지 못했습니다.');
    return response.json();
  }).catch(error => { archivePromise = undefined; throw error; });
  return archivePromise;
}
const searchCache = new WeakMap();
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
function searchableText(record) {
  if (!searchCache.has(record)) {
    searchCache.set(record, normalize([record.group, record.category, record.task, record.summary, ...Object.values(record.fields || {})].join(' ')));
  }
  return searchCache.get(record);
}
export function filterCases(records, { query = '', group = '', category = '', task = '' }) {
  const terms = normalize(query).split(' ').filter(Boolean);
  return records.filter(record => (!group || record.group === group) && (!category || record.category === category) && (!task || record.task === task) && terms.every(term => searchableText(record).includes(term)));
}
