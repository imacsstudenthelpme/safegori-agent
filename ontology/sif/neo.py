"""Neo4j 적재.

원칙
- 모든 쓰기는 MERGE라서 같은 파일을 두 번 올려도 사례가 중복되지 않습니다.
- 사례를 다시 올리면 그 사례에서 나가는 관계를 지우고 새로 만듭니다(적재 이력 LOADED_IN은 유지).
- 분류 관계(BROADER, MAPS_TO)는 대응표가 바뀌면 예전 상위 노드와의 관계를 지우고 새로 겁니다.
- 파생 관계(LEADS_TO, MITIGATES)는 적재가 끝날 때마다 전체를 다시 계산합니다.
"""
from __future__ import annotations

import datetime as dt
import os
from typing import Iterable

from neo4j import GraphDatabase

from .transform import Case

LABELS = ['AccidentCase', 'Industry', 'WorkSituation', 'WorkType', 'Work', 'UnitWork', 'AccidentType',
          'AccidentTypeGroup', 'OfficialForm', 'CausalObject', 'ObjectCategory', 'HazardFactor',
          'HazardCategory', 'Measure', 'ControlLevel', 'IngestRun',
          'Year', 'YearMonth', 'Period', 'HeightBand', 'Term', 'AccidentPattern']


def driver_from_env():
    uri = os.environ.get('NEO4J_URI', 'bolt://localhost:7687')
    user = os.environ.get('NEO4J_USER', 'neo4j')
    pw = os.environ.get('NEO4J_PASSWORD', '')
    return GraphDatabase.driver(uri, auth=(user, pw))


def database():
    return os.environ.get('NEO4J_DATABASE') or None


def chunks(seq: list, n: int = 500) -> Iterable[list]:
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


class Writer:
    def __init__(self, driver):
        self.driver = driver
        self.db = database()

    def run(self, q: str, **params):
        with self.driver.session(database=self.db) as s:
            return s.run(q, **params).consume()

    def data(self, q: str, **params):
        with self.driver.session(database=self.db) as s:
            return [r.data() for r in s.run(q, **params)]

    def init(self):
        for l in LABELS:
            self.run(f'CREATE CONSTRAINT {l.lower()}_id IF NOT EXISTS FOR (n:{l}) REQUIRE n.id IS UNIQUE')
        self.run('CREATE INDEX accidentcase_code IF NOT EXISTS FOR (n:AccidentCase) ON (n.code)')
        self.run('CREATE INDEX accidentcase_legacy IF NOT EXISTS FOR (n:AccidentCase) ON (n.legacyId)')
        self.run('CREATE FULLTEXT INDEX accidentcase_text IF NOT EXISTS FOR (n:AccidentCase) '
                 'ON EACH [n.summary, n.raw_co, n.raw_hf]')

    def existing_ids(self, ids: list[str]) -> set:
        rows = self.data('UNWIND $ids AS id MATCH (c:AccidentCase {id:id}) RETURN c.id AS id', ids=ids)
        return {r['id'] for r in rows}

    # ---------- 사례 ----------
    def write_cases(self, cases: list[Case], source: str | None):
        for part in chunks(cases):
            ids = [c.id for c in part]
            self.run("""
                UNWIND $rows AS r
                MERGE (c:AccidentCase {id: r.id})
                ON CREATE SET c.firstLoaded = datetime()
                SET c += r.props, c.updated = datetime()
                WITH c, r WHERE r.source IS NOT NULL AND NOT r.source IN coalesce(c.sources, [])
                SET c.sources = coalesce(c.sources, []) + r.source
            """, rows=[{'id': c.id, 'props': c.props, 'source': source} for c in part])
            self.run("""
                UNWIND $ids AS id
                MATCH (c:AccidentCase {id: id})-[r]->()
                WHERE type(r) <> 'LOADED_IN'
                DELETE r
            """, ids=ids)
            self._context(part)
            self._accident(part)
            self._object(part)
            self._hazard(part)
            self._measure(part)
            self._time(part)
            self._height(part)

    def _context(self, part: list[Case]):
        m = [{'id': c.id, **c.context} for c in part if c.props['sectorCode'] == 'M' and c.context.get('ind_s')]
        if m:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (s:Industry {id: 'IND:S:' + r.ind_s}) SET s.name = r.ind_s, s.level = '소분류'
                MERGE (c)-[:IN_INDUSTRY]->(s)
                WITH s, r WHERE r.ind_m <> ''
                MERGE (m:Industry {id: 'IND:M:' + r.ind_m}) SET m.name = r.ind_m, m.level = '중분류'
                MERGE (s)-[:BROADER]->(m)
                WITH m, r WHERE r.ind_l <> ''
                MERGE (l:Industry {id: 'IND:L:' + r.ind_l}) SET l.name = r.ind_l, l.level = '대분류'
                MERGE (m)-[:BROADER]->(l)
            """, rows=m)
        ws = [{'id': c.id, 'ws': c.context['ws']} for c in part if c.props['sectorCode'] == 'M' and c.context.get('ws')]
        if ws:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (w:WorkSituation {id: 'WS:' + r.ws}) SET w.name = r.ws
                MERGE (c)-[:OCCURRED_DURING]->(w)
            """, rows=ws)
        cc = [{'id': c.id, **c.context} for c in part if c.props['sectorCode'] == 'C' and c.context.get('uw')]
        if cc:
            from .transform import code_of
            for r in cc:
                r.update(uw_code=code_of(r['uw']), w_code=code_of(r['w']), wt_code=code_of(r['wt']))
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (u:UnitWork {id: 'UW:' + r.uw}) SET u.name = r.uw, u.code = r.uw_code
                MERGE (c)-[:OCCURRED_DURING]->(u)
                WITH u, r WHERE r.w <> ''
                MERGE (w:Work {id: 'W:' + r.w}) SET w.name = r.w, w.code = r.w_code
                MERGE (u)-[:BROADER]->(w)
                WITH w, r WHERE r.wt <> ''
                MERGE (t:WorkType {id: 'WT:' + r.wt}) SET t.name = r.wt, t.code = r.wt_code
                MERGE (w)-[:BROADER]->(t)
            """, rows=cc)

    def _replace_parent(self, child: str, parent: str, rows: list[dict], rel_props: dict | None = None,
                        rel: str = 'BROADER'):
        """child 노드의 parent 라벨 상위 관계를 r.parent 하나로 맞춥니다."""
        if not rows:
            return
        self.run(f"""
            UNWIND $rows AS r
            MATCH (ch:{child} {{id: r.child}})
            OPTIONAL MATCH (ch)-[old:{rel}]->(p0:{parent}) WHERE p0.id <> r.parent
            DELETE old
            WITH DISTINCT ch, r
            MERGE (p:{parent} {{id: r.parent}}) SET p.name = r.pname
            MERGE (ch)-[b:{rel}]->(p) SET b += $props
        """, rows=rows, props=rel_props or {})

    def _accident(self, part: list[Case]):
        self.run("""
            UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
            MERGE (a:AccidentType {id: 'AT:' + r.at}) SET a.name = r.at
            MERGE (c)-[x:HAS_ACCIDENT_TYPE]->(a) SET x.origin = r.src
        """, rows=[{'id': c.id, 'at': c.at, 'src': c.at_source} for c in part])
        tax = {c.at: c for c in part}
        self._replace_parent('AccidentType', 'AccidentTypeGroup',
                             [{'child': 'AT:' + a, 'parent': 'ATG:' + c.at_group, 'pname': c.at_group} for a, c in tax.items()])
        self._replace_parent('AccidentType', 'OfficialForm',
                             [{'child': 'AT:' + a, 'parent': 'OF:' + c.at_official, 'pname': c.at_official} for a, c in tax.items()],
                             {'status': '미확인'}, rel='MAPS_TO')
        cls = [{'id': c.id, 'g': c.classified_as, 'note': c.classified_note} for c in part if c.classified_as]
        if cls:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (g:AccidentTypeGroup {id: 'ATG:' + r.g}) SET g.name = r.g
                MERGE (c)-[x:CLASSIFIED_AS]->(g) SET x.origin = '규칙', x.status = '초안', x.note = r.note
            """, rows=cls)

    def _object(self, part: list[Case]):
        self.run("""
            UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
            MERGE (o:CausalObject {id: 'CO:' + r.co}) SET o.name = r.co
            MERGE (c)-[x:INVOLVES]->(o) SET x.note = r.note
        """, rows=[{'id': c.id, 'co': c.co, 'note': c.co_note} for c in part])
        sub = {c.co: c for c in part if c.co_base != c.co}
        self._replace_parent('CausalObject', 'CausalObject',
                             [{'child': 'CO:' + k, 'parent': 'CO:' + c.co_base, 'pname': c.co_base} for k, c in sub.items()],
                             {'origin': '괄호 분리'})
        top = {c.co_base: c for c in part}
        self._replace_parent('CausalObject', 'ObjectCategory',
                             [{'child': 'CO:' + k, 'parent': 'COC:' + c.co_category, 'pname': c.co_category} for k, c in top.items()])

    def _hazard(self, part: list[Case]):
        rows = [{'id': c.id, 'hf': c.hazards, 'src': '표준 문구 매핑' if c.props['sectorCode'] == 'M' else '규칙 매핑'}
                for c in part]
        self.run("""
            UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
            UNWIND r.hf AS h
            MERGE (f:HazardFactor {id: h.id}) SET f.name = h.name, f.mentor12 = h.mentor12
            MERGE (c)-[x:CAUSED_BY]->(f) SET x.origin = r.src, x.status = '초안'
        """, rows=rows)
        tax = {h['id']: h for c in part for h in c.hazards}
        self._replace_parent('HazardFactor', 'HazardCategory',
                             [{'child': k, 'parent': 'HC:' + h['category'], 'pname': h['category']} for k, h in tax.items()])

    def _measure(self, part: list[Case]):
        self.run("""
            UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
            UNWIND r.ms AS m
            MERGE (n:Measure {id: m.id}) SET n.text = m.text
            MERGE (c)-[x:HAS_MEASURE]->(n) SET x.order = m.order
        """, rows=[{'id': c.id, 'ms': c.measures} for c in part])
        ms = {m['id']: m for c in part for m in c.measures}
        self.run("""
            UNWIND $rows AS r MATCH (n:Measure {id: r.id})
            OPTIONAL MATCH (n)-[old:BROADER]->(p0:ControlLevel) WHERE NOT p0.id IN r.levels
            DELETE old
            WITH DISTINCT n, r
            UNWIND r.levels AS lv
            MERGE (p:ControlLevel {id: lv}) SET p.name = substring(lv, 3)
            MERGE (n)-[b:BROADER]->(p) SET b.origin = '규칙', b.status = '초안'
        """, rows=[{'id': k, 'levels': ['CL:' + lv for lv in m['levels']]} for k, m in ms.items()])

    def _time(self, part: list[Case]):
        """사례 → 연월(없으면 연도) → 연도 → 시기."""
        ym = [{'id': c.id, 'ym': f'{c.year}-{c.month:02d}', 'y': c.year, 'm': c.month}
              for c in part if c.year and c.month]
        if ym:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (t:YearMonth {id: 'YM:' + r.ym}) SET t.name = r.ym, t.year = r.y, t.month = r.m
                MERGE (c)-[x:OCCURRED_IN]->(t) SET x.origin = '개요 추출'
            """, rows=ym)
        yo = [{'id': c.id, 'y': c.year} for c in part if c.year and not c.month]
        if yo:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (y:Year {id: 'Y:' + toString(r.y)}) SET y.name = toString(r.y) + '년', y.value = r.y
                MERGE (c)-[x:OCCURRED_IN]->(y) SET x.origin = '개요 추출'
            """, rows=yo)
        yms = {f'{c.year}-{c.month:02d}': c for c in part if c.year and c.month}
        self.run("""
            UNWIND $rows AS r MERGE (y:Year {id: 'Y:' + toString(r.y)}) SET y.name = toString(r.y) + '년', y.value = r.y
        """, rows=[{'y': y} for y in sorted({c.year for c in part if c.year})])
        self._replace_parent('YearMonth', 'Year',
                             [{'child': 'YM:' + k, 'parent': f'Y:{c.year}', 'pname': f'{c.year}년'} for k, c in yms.items()])
        years = {c.year: c.period for c in part if c.year and c.period}
        self._replace_parent('Year', 'Period',
                             [{'child': f'Y:{y}', 'parent': 'P:' + p, 'pname': p} for y, p in years.items()])

    def _height(self, part: list[Case]):
        rows = [{'id': c.id, 'b': c.band, 'h': c.height} for c in part if c.band]
        if rows:
            self.run("""
                UNWIND $rows AS r MATCH (c:AccidentCase {id: r.id})
                MERGE (b:HeightBand {id: 'HB:' + r.b}) SET b.name = r.b
                MERGE (c)-[x:FELL_FROM]->(b) SET x.origin = '개요 추출', x.heightM = r.h
            """, rows=rows)
        bands = {c.band: c.band_parent for c in part if c.band and c.band_parent}
        self._replace_parent('HeightBand', 'HeightBand',
                             [{'child': 'HB:' + b, 'parent': 'HB:' + p, 'pname': p} for b, p in bands.items()])

    # ---------- 사고 패턴 ----------
    def write_patterns(self, pcfg: dict) -> list[dict]:
        """전체 사례를 다시 묶어 패턴을 새로 만듭니다 (새 자료가 들어오면 패턴 크기·대표 사례가 바뀌므로 매번 전체 재계산)."""
        from .patterns import build_patterns
        cases = self.data("""
            MATCH (c:AccidentCase) WHERE c.patternKey IS NOT NULL
            RETURN c.id AS id, c.code AS code, c.sectorCode AS sectorCode, c.year AS year,
                   c.patternKey AS patternKey, c.patternObject AS patternObject, c.patternType AS patternType,
                   c.patternHazard AS patternHazard, c.patternWork AS patternWork, c.repScore AS repScore
        """)
        pats = build_patterns(cases, pcfg)
        self.run('MATCH (p:AccidentPattern) DETACH DELETE p')
        for part in chunks(pats, 200):
            self.run("""
                UNWIND $rows AS r
                CREATE (p:AccidentPattern {id: r.id, name: r.name, size: r.size, sectors: r.sectors,
                                           topWorks: r.topWorks})
                WITH p, r
                OPTIONAL MATCH (o:CausalObject {id: 'CO:' + r.object})
                OPTIONAL MATCH (a:AccidentType {id: 'AT:' + r.accidentType})
                OPTIONAL MATCH (h:HazardFactor {id: 'HF:' + r.hazard})
                FOREACH (_ IN CASE WHEN o IS NULL THEN [] ELSE [1] END | MERGE (p)-[:DEFINED_BY {role: '기인물'}]->(o))
                FOREACH (_ IN CASE WHEN a IS NULL THEN [] ELSE [1] END | MERGE (p)-[:DEFINED_BY {role: '재해종류'}]->(a))
                FOREACH (_ IN CASE WHEN h IS NULL THEN [] ELSE [1] END | MERGE (p)-[:DEFINED_BY {role: '유발요인'}]->(h))
            """, rows=[{k: v for k, v in p.items() if k not in ('members', 'reps')} for p in part])
            self.run("""
                UNWIND $rows AS r MATCH (p:AccidentPattern {id: r.id})
                UNWIND r.members AS cid MATCH (c:AccidentCase {id: cid})
                MERGE (c)-[:BELONGS_TO]->(p)
            """, rows=[{'id': p['id'], 'members': p['members']} for p in part])
            self.run("""
                UNWIND $rows AS r MATCH (p:AccidentPattern {id: r.id})
                UNWIND range(0, size(r.reps) - 1) AS i
                MATCH (c:AccidentCase {id: r.reps[i]})
                MERGE (p)-[x:REPRESENTED_BY]->(c) SET x.rank = i + 1
            """, rows=[{'id': p['id'], 'reps': p['reps']} for p in part])
        return pats

    # ---------- 용어 사전 ----------
    def write_terms(self, aliases: list[dict]) -> list[dict]:
        """config/aliases.csv를 읽어 (:Term)-[:REFERS_TO]->(개념)을 다시 만듭니다. 대상을 못 찾은 줄을 돌려줍니다."""
        allowed = {'CausalObject', 'ObjectCategory', 'AccidentType', 'AccidentTypeGroup', 'HazardFactor',
                   'HazardCategory', 'ControlLevel', 'WorkType', 'Work', 'UnitWork', 'Industry', 'WorkSituation',
                   'Period', 'Year', 'HeightBand'}
        self.run('MATCH (:Term)-[r:REFERS_TO]->() DELETE r')
        missing = []
        for a in aliases:
            label = a['대상 라벨']
            if label not in allowed:
                missing.append({**a, '사유': '허용되지 않은 라벨'})
                continue
            cond = 't.name CONTAINS $target' if a['일치 방식'] == 'contains' else 't.name = $target'
            s = self.run(f"""
                MATCH (t:{label}) WHERE {cond}
                MERGE (term:Term {{id: 'TERM:' + $name}}) SET term.name = $name
                MERGE (term)-[r:REFERS_TO]->(t)
                SET r.weight = toFloat($w), r.origin = 'aliases.csv', r.note = $note
            """, target=a['대상 이름'], name=a['용어'], w=a['가중치'] or 1, note=a.get('메모', ''))
            if s.counters.relationships_created == 0:
                missing.append({**a, '사유': '대상 노드 없음'})
        self.run('MATCH (t:Term) WHERE NOT (t)-[:REFERS_TO]->() DELETE t')
        return missing

    # ---------- 이력·파생·정리 ----------
    def record_run(self, file: str, ids: list[str], new: int):
        run_id = 'RUN:' + dt.datetime.now().strftime('%Y%m%d-%H%M%S') + ':' + file
        self.run("""
            MERGE (r:IngestRun {id: $rid})
            SET r.file = $file, r.loadedAt = datetime(), r.cases = $n, r.newCases = $new
        """, rid=run_id, file=file, n=len(ids), new=new)
        for part in chunks(ids, 2000):
            self.run("""
                MATCH (r:IngestRun {id: $rid})
                UNWIND $ids AS id MATCH (c:AccidentCase {id: id})
                MERGE (c)-[:LOADED_IN]->(r)
            """, rid=run_id, ids=part)
        return run_id

    def derive(self):
        self.run('MATCH ()-[r:LEADS_TO|MITIGATES]->() DELETE r')
        self.run("""
            MATCH (h:HazardFactor)<-[:CAUSED_BY]-(c:AccidentCase)-[:HAS_ACCIDENT_TYPE]->(a:AccidentType)
            WITH h, a, count(c) AS n
            MERGE (h)-[r:LEADS_TO]->(a) SET r.count = n, r.derived = true
        """)
        self.run("""
            MATCH (m:Measure)<-[:HAS_MEASURE]-(c:AccidentCase)-[:CAUSED_BY]->(h:HazardFactor)
            WITH m, h, count(c) AS n
            MERGE (m)-[r:MITIGATES]->(h) SET r.count = n, r.derived = true
        """)

    def cleanup(self):
        """더 이상 어떤 사례와도 이어지지 않는 값·분류 노드를 지웁니다."""
        order = ['Measure', 'CausalObject', 'CausalObject', 'HazardFactor', 'AccidentType', 'WorkSituation',
                 'UnitWork', 'Work', 'WorkType', 'Industry', 'Industry', 'Industry', 'ObjectCategory',
                 'HazardCategory', 'AccidentTypeGroup', 'OfficialForm', 'ControlLevel',
                 'YearMonth', 'Year', 'Period', 'HeightBand', 'HeightBand']
        total = 0
        for l in order:
            s = self.run(f'MATCH (n:{l}) WHERE NOT EXISTS {{ MATCH ()-[r]->(n) WHERE NOT type(r) IN ["MITIGATES", "LEADS_TO", "REFERS_TO"] }} '
                         f'DETACH DELETE n')
            total += s.counters.nodes_deleted
        return total

    def all_case_props(self) -> list[dict]:
        return [r['p'] for r in self.data('MATCH (c:AccidentCase) RETURN properties(c) AS p')]

    def summary(self) -> list[dict]:
        return self.data('MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY label')
