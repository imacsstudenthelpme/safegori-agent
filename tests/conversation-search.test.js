import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTitle, messageDay, formatMessageDate } from '../src/data/conversationUtils.js';
import { filterCases } from '../src/data/caseRepository.js';

test('conversation titles summarize the topic as a noun phrase', () => {
  assert.equal(summarizeTitle('크레인과 연결된 위험요인은?'), '크레인 위험요인');
  assert.equal(summarizeTitle('낙하 위험의 예방대책을 알려주세요.'), '낙하 안전대책');
  assert.equal(summarizeTitle('타워크레인과 이동식 크레인의 차이는 무엇인가요?'), '이동식 크레인 · 타워크레인 비교');
  assert.equal(summarizeTitle('안녕하세요'), '안전 상담');
});
test('date groups split at local midnight and missing legacy timestamps stay unknown', () => {
  const before = { createdAt: new Date(2026, 9, 15, 23, 59).getTime() };
  const after = { createdAt: new Date(2026, 9, 16, 0, 1).getTime() };
  assert.notEqual(messageDay(before), messageDay(after));
  assert.equal(messageDay(after), messageDay({ createdAt: new Date(2026, 9, 16, 12).getTime() }));
  assert.equal(messageDay({}), 'unknown');
  assert.equal(formatMessageDate({}), '날짜 정보 없음');
});
test('case search matches body and prevention text, combined terms, and category filters', () => {
  const records = [
    { id: 1, group: '제조업', category: '설비', task: '리프트', summary: '개구부 추락', fields: { 대책: 'PLC 위치센서 설치' } },
    { id: 2, group: '건설업', category: '마감공사', task: '도장', summary: '밀폐공간 작업', fields: { 대책: '환기 실시' } },
  ];
  assert.deepEqual(filterCases(records, { query: 'plc 위치센서' }).map(record => record.id), [1]);
  assert.deepEqual(filterCases(records, { query: '밀폐공간' }).map(record => record.id), [2]);
  assert.deepEqual(filterCases(records, { query: '마감공사 환기' }).map(record => record.id), [2]);
  assert.deepEqual(filterCases(records, { query: '환기', group: '제조업' }), []);
  assert.equal(filterCases(records, { query: ' ' }).length, 2);
});
