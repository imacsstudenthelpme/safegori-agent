"""온톨로지 탐색 API (react-force-graph용 {nodes, links}).

ontology/ 파이프라인이 만든 Neo4j 스키마를 읽습니다. main.py에서 app.include_router(router)로 붙입니다.
기존 SafeGori 엔드포인트(/api/objects, /api/graph/object/{name}, /api/cases/{id}, /api/chat, /api/health)와
경로가 겹치지 않습니다.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

import graph

router = APIRouter()


def q(cypher: str, **params) -> list[dict]:
    return graph.run(cypher, **params)


# 클래스 정의 (T-Box). group은 프런트 색상 키입니다.
CLASSES = {
    'AccidentCase': ('사고사례', 'case'), 'Industry': ('업종', 'context'), 'WorkSituation': ('고위험작업·상황', 'context'),
    'UnitWork': ('단위작업', 'context'), 'Work': ('작업', 'context'), 'WorkType': ('공종', 'context'),
    'AccidentType': ('재해종류', 'accident'), 'AccidentTypeGroup': ('재해종류 상위분류', 'accident'),
    'OfficialForm': ('공식 발생형태', 'accident'), 'CausalObject': ('기인물', 'object'),
    'ObjectCategory': ('기인물 분류', 'object'), 'HazardFactor': ('재해유발요인', 'hazard'),
    'HazardCategory': ('요인 분류', 'hazard'), 'Measure': ('예방대책', 'measure'), 'ControlLevel': ('통제위계', 'measure'),
    'YearMonth': ('연월', 'time'), 'Year': ('연도', 'time'), 'Period': ('시기', 'time'),
    'HeightBand': ('추락 높이', 'height'), 'Term': ('용어', 'term'),
    'AccidentPattern': ('사고 패턴', 'pattern'),
}
# (출발, 도착, 관계, 한글 이름). 순서 번호(1부터)가 관점별 핵심 관계 번호와 같습니다.
RELATIONS = [
    ('AccidentCase', 'Industry', 'IN_INDUSTRY', '업종'), ('AccidentCase', 'WorkSituation', 'OCCURRED_DURING', '작업 중 발생'),
    ('AccidentCase', 'UnitWork', 'OCCURRED_DURING', '작업 중 발생'), ('AccidentCase', 'AccidentType', 'HAS_ACCIDENT_TYPE', '재해종류'),
    ('AccidentCase', 'AccidentTypeGroup', 'CLASSIFIED_AS', '사례별 보정'), ('AccidentCase', 'CausalObject', 'INVOLVES', '기인물'),
    ('AccidentCase', 'HazardFactor', 'CAUSED_BY', '유발요인'), ('AccidentCase', 'Measure', 'HAS_MEASURE', '예방대책'),
    ('Industry', 'Industry', 'BROADER', '상위 분류'), ('UnitWork', 'Work', 'BROADER', '상위 분류'),
    ('Work', 'WorkType', 'BROADER', '상위 분류'), ('CausalObject', 'CausalObject', 'BROADER', '상위 분류'),
    ('CausalObject', 'ObjectCategory', 'BROADER', '상위 분류'), ('HazardFactor', 'HazardCategory', 'BROADER', '상위 분류'),
    ('AccidentType', 'AccidentTypeGroup', 'BROADER', '상위 분류'), ('AccidentType', 'OfficialForm', 'MAPS_TO', '공식 명칭'),
    ('Measure', 'ControlLevel', 'BROADER', '상위 분류'), ('Measure', 'HazardFactor', 'MITIGATES', '통제'),
    ('HazardFactor', 'AccidentType', 'LEADS_TO', '이어짐'),
    # 20~ : 시기·높이·용어 (번호를 바꾸지 않도록 뒤에 붙입니다)
    ('AccidentCase', 'YearMonth', 'OCCURRED_IN', '발생 시기'), ('YearMonth', 'Year', 'BROADER', '상위 분류'),
    ('Year', 'Period', 'BROADER', '상위 분류'), ('AccidentCase', 'HeightBand', 'FELL_FROM', '추락 높이'),
    ('HeightBand', 'HeightBand', 'BROADER', '상위 분류'), ('Term', 'CausalObject', 'REFERS_TO', '가리킴'),
    ('Term', 'AccidentType', 'REFERS_TO', '가리킴'), ('Term', 'HazardFactor', 'REFERS_TO', '가리킴'),
    # 28~ : 사고 패턴
    ('AccidentCase', 'AccidentPattern', 'BELONGS_TO', '같은 패턴'),
    ('AccidentPattern', 'CausalObject', 'DEFINED_BY', '정의'), ('AccidentPattern', 'AccidentType', 'DEFINED_BY', '정의'),
    ('AccidentPattern', 'HazardFactor', 'DEFINED_BY', '정의'),
    ('AccidentPattern', 'AccidentCase', 'REPRESENTED_BY', '대표 사례'),
]
# 흐름(o→o→o) 단계: 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책
FLOW_STAGES = [('작업', ['UnitWork', 'WorkSituation', 'Work']), ('기인물', ['CausalObject']),
               ('유발요인', ['HazardFactor']), ('재해종류', ['AccidentType']), ('예방대책', ['Measure', 'ControlLevel'])]
REL_NAME = {r[2]: r[3] for r in RELATIONS}
DERIVED = {'LEADS_TO', 'MITIGATES', 'MAPS_TO', 'CLASSIFIED_AS'}

# 분류 화면 정의: (최상위 이름, 상위 라벨, 하위 라벨, 사례→하위 경로, 펼치기 라벨, 펼치기 경로)
TAXONOMY = {
    'accident_type': ('재해종류', 'AccidentTypeGroup', 'AccidentType',
                      '(c)-[:HAS_ACCIDENT_TYPE]->(l:AccidentType)-[:BROADER]->(g:AccidentTypeGroup)', None, None),
    'hazard': ('유발요인', 'HazardCategory', 'HazardFactor',
               '(c)-[:CAUSED_BY]->(l:HazardFactor)-[:BROADER]->(g:HazardCategory)', None, None),
    'causal_object': ('기인물', 'ObjectCategory', 'CausalObject',
                      '(c)-[:INVOLVES]->(:CausalObject)-[:BROADER*0..1]->(l:CausalObject)-[:BROADER]->(g:ObjectCategory)',
                      'CausalObject', '(c)-[:INVOLVES]->(x:CausalObject)-[:BROADER]->(l)'),
    'work_type': ('공종', 'WorkType', 'Work', '(c)-[:OCCURRED_DURING]->(:UnitWork)-[:BROADER]->(l:Work)-[:BROADER]->(g:WorkType)',
                  'UnitWork', '(c)-[:OCCURRED_DURING]->(x:UnitWork)-[:BROADER]->(l)'),
    'industry': ('업종', 'Industry', 'Industry',
                 '(c)-[:IN_INDUSTRY]->(:Industry)-[:BROADER]->(l:Industry)-[:BROADER]->(g:Industry)',
                 'Industry', '(c)-[:IN_INDUSTRY]->(x:Industry)-[:BROADER]->(l)'),
    'year': ('시기', 'Period', 'Year', '(c)-[:OCCURRED_IN]->()-[:BROADER*0..1]->(l:Year)-[:BROADER]->(g:Period)',
             'YearMonth', '(c)-[:OCCURRED_IN]->(x:YearMonth)-[:BROADER]->(l)'),
    'height': ('추락 높이', 'HeightBand', 'HeightBand', '(c)-[:FELL_FROM]->(l:HeightBand)-[:BROADER]->(g:HeightBand)',
               None, None),
}
# 모든 목록·통계 질의에 붙는 공통 조건: 업종, 연도 범위 (연도는 사례 속성 year로 빠르게 거릅니다)
CASE_FILTER = ('($sector IS NULL OR c.sectorCode = $sector) AND ($y0 IS NULL OR c.year >= $y0) '
               'AND ($y1 IS NULL OR c.year <= $y1)')
CASE_FIELDS = ['id', 'code', 'legacyId', 'sector', 'sectorCode', 'archive', 'sheet', 'row', 'summary', 'raw_hf', 'raw_co',
               'raw_at', 'accidentTypeSource', 'sources']


def check_label(label: str) -> str:
    if label not in CLASSES:
        raise HTTPException(400, f'알 수 없는 라벨: {label}')
    return label


def node_json(label: str, props: dict, **extra) -> dict:
    name = props.get('code') if label == 'AccidentCase' else props.get('name') or props.get('text') or props.get('id')
    out = {'id': props['id'], 'name': name, 'label': label, 'group': CLASSES[label][1]}
    if label == 'AccidentCase':
        out.update({k: props.get(k) for k in CASE_FIELDS})
    elif label == 'Measure':
        out['text'] = props.get('text')
    elif label == 'HazardFactor':
        out['mentor12'] = props.get('mentor12')
    out.update(extra)
    return out


def link_json(s: str, t: str, rtype: str, props: dict | None = None) -> dict:
    props = props or {}
    return {'source': s, 'target': t, 'type': rtype, 'name': REL_NAME.get(rtype, rtype),
            'derived': rtype in DERIVED or props.get('status') == '초안' or (props.get('origin') or '') not in ('', '원본'),
            **{k: v for k, v in props.items() if k in ('count', 'status', 'origin', 'note')}}


@router.get('/api/ontology/health')
def health():
    return {'ok': True, 'counts': q('MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY label')}


@router.get('/api/case/{case_id}')
def case_graph(case_id: str):
    """사례 하나와 그 값들, 값들의 상위 분류까지 (멘토님 A-Box 화면용)."""
    rows = q("""
        MATCH (c:AccidentCase) WHERE c.id = $id OR c.code = $id OR c.legacyId = $id
        WITH c LIMIT 1
        MATCH (c)-[r]->(n) WHERE NOT n:IngestRun
        OPTIONAL MATCH path = (n)-[:BROADER|MAPS_TO*1..3]->(m)
        WITH c, r, n, collect(path) AS paths
        RETURN properties(c) AS c, type(r) AS rt, properties(r) AS rp, labels(n)[0] AS nl, properties(n) AS np,
               [p IN paths | [x IN nodes(p) | {l: labels(x)[0], p: properties(x)}]] AS chains,
               [p IN paths | [y IN relationships(p) | {t: type(y), p: properties(y)}]] AS chainRels
    """, id=case_id)
    if not rows:
        raise HTTPException(404, '사례를 찾을 수 없습니다')
    cp = rows[0]['c']
    nodes = {cp['id']: node_json('AccidentCase', cp, root=True)}
    links = {}
    for r in rows:
        nodes.setdefault(r['np']['id'], node_json(r['nl'], r['np']))
        links[(cp['id'], r['np']['id'], r['rt'])] = link_json(cp['id'], r['np']['id'], r['rt'], r['rp'])
        for chain, rels in zip(r['chains'], r['chainRels']):
            for i, rel in enumerate(rels):
                a, b = chain[i], chain[i + 1]
                nodes.setdefault(b['p']['id'], node_json(b['l'], b['p']))
                links[(a['p']['id'], b['p']['id'], rel['t'])] = link_json(a['p']['id'], b['p']['id'], rel['t'], rel['p'])
    for r in q("""
        MATCH (c:AccidentCase {id: $id})-[:CAUSED_BY]->(h)-[l:LEADS_TO]->(a)<-[:HAS_ACCIDENT_TYPE]-(c)
        RETURN h.id AS s, a.id AS t, l.count AS n
    """, id=cp['id']):
        links[(r['s'], r['t'], 'LEADS_TO')] = {**link_json(r['s'], r['t'], 'LEADS_TO', {'count': r['n']}),
                                               'name': f"이어짐 {r['n']}건"}
    return {'nodes': list(nodes.values()), 'links': list(links.values())}


@router.get('/api/tbox')
def tbox(case: str | None = None):
    """클래스 15개와 관계 19개. case를 주면 각 클래스에 그 사례의 값이 values로 붙습니다."""
    counts = {r['l']: r['n'] for r in q('MATCH (n) WHERE NOT n:IngestRun RETURN labels(n)[0] AS l, count(*) AS n')}
    rel_counts = {(r['s'], r['t'], r['e']): r['n'] for r in q("""
        MATCH (a)-[r]->(b) WHERE NOT b:IngestRun
        RETURN labels(a)[0] AS s, type(r) AS t, labels(b)[0] AS e, count(*) AS n
    """)}
    values: dict[str, list[str]] = {}
    present = set()
    if case:
        g = case_graph(case)
        for n in g['nodes']:
            values.setdefault(n['label'], []).append(n['name'])
        lab = {n['id']: n['label'] for n in g['nodes']}
        present = {(lab.get(l['source']), l['type'], lab.get(l['target'])) for l in g['links']}
    nodes = [{'id': k, 'name': v[0], 'label': k, 'group': v[1], 'count': counts.get(k, 0),
              'values': values.get(k, [])} for k, v in CLASSES.items()]
    links = []
    for i, (s, t, rtype, name) in enumerate(RELATIONS, start=1):
        links.append({'source': s, 'target': t, 'type': rtype, 'name': name, 'rid': i,
                      'count': rel_counts.get((s, rtype, t), 0), 'derived': rtype in DERIVED,
                      'present': (s, rtype, t) in present if case else None})
    return {'nodes': nodes, 'links': links}


@router.get('/api/taxonomy/{kind}')
def taxonomy(kind: str, sector: str | None = Query(None, pattern='^(M|C)$'), expand: str | None = None,
             y0: int | None = None, y1: int | None = None):
    """분류 트리 (멘토님 분류체계 화면용). expand에 하위 노드 id를 주면 한 단계 더 펼칩니다."""
    if kind not in TAXONOMY:
        raise HTTPException(404, f'kind는 {list(TAXONOMY)} 중 하나')
    root_name, glabel, llabel, path, xlabel, xpath = TAXONOMY[kind]
    where = 'WHERE ' + CASE_FILTER
    rows = q(f"""
        MATCH (c:AccidentCase) {where}
        MATCH {path}
        RETURN properties(g) AS g, properties(l) AS l, count(DISTINCT c) AS n
    """, sector=sector, y0=y0, y1=y1)
    root = 'ROOT:' + kind
    nodes = {root: {'id': root, 'name': root_name, 'label': 'Root', 'group': 'root', 'level': 0, 'val': 0}}
    links = []
    for r in rows:
        gid, lid = r['g']['id'], r['l']['id']
        if gid not in nodes:
            nodes[gid] = node_json(glabel, r['g'], level=1, val=0)
            links.append({'source': root, 'target': gid, 'type': 'TOP', 'name': ''})
        nodes[gid]['val'] += r['n']
        nodes[root]['val'] += r['n']
        nodes[lid] = node_json(llabel, r['l'], level=2, val=r['n'])
        links.append({'source': gid, 'target': lid, 'type': 'BROADER', 'name': '상위 분류'})
    if expand and xlabel and expand in nodes:
        for r in q(f"""
            MATCH (l:{llabel} {{id: $lid}})
            MATCH (c:AccidentCase) {where}
            MATCH {xpath}
            RETURN properties(x) AS x, count(DISTINCT c) AS n
        """, lid=expand, sector=sector, y0=y0, y1=y1):
            nodes[r['x']['id']] = node_json(xlabel, r['x'], level=3, val=r['n'])
            links.append({'source': expand, 'target': r['x']['id'], 'type': 'BROADER', 'name': '상위 분류'})
    return {'nodes': list(nodes.values()), 'links': links}


def _case_scope(label: str) -> str:
    """분류 노드 아래 사례를 찾는 패턴. 사례에서 값으로, 값에서 BROADER를 0~3번 타고 올라갑니다."""
    if label == 'AccidentCase':
        raise HTTPException(400, '사례 노드는 /api/case를 쓰세요')
    if label == 'OfficialForm':
        return 'MATCH (c:AccidentCase)-[:HAS_ACCIDENT_TYPE]->(:AccidentType)-[:MAPS_TO]->(n)'
    if label == 'Term':
        return 'MATCH (n)-[:REFERS_TO]->(t) MATCH (c:AccidentCase)-[]->(x)-[:BROADER*0..3]->(t)'
    return 'MATCH (c:AccidentCase)-[]->(x)-[:BROADER*0..3]->(n)'


@router.get('/api/nodes/{label}/{node_id}/cases')
def node_cases(label: str, node_id: str, sector: str | None = Query(None, pattern='^(M|C)$'),
               skip: int = 0, limit: int = Query(40, le=500), y0: int | None = None, y1: int | None = None):
    label = check_label(label)
    scope = _case_scope(label)
    rows = q(f"""
        MATCH (n:{label} {{id: $id}})
        {scope}
        WHERE {CASE_FILTER}
        WITH DISTINCT c ORDER BY c.year DESC, c.code
        WITH collect(c) AS cs
        RETURN size(cs) AS total,
               [x IN cs[$skip..$skip + $limit] | {{id: x.id, code: x.code, summary: x.summary, year: x.year}}] AS items
    """, id=node_id, sector=sector, skip=skip, limit=limit, y0=y0, y1=y1)
    return rows[0] if rows else {'total': 0, 'items': []}


@router.get('/api/nodes/{label}/{node_id}/stats')
def node_stats(label: str, node_id: str, sector: str | None = Query(None, pattern='^(M|C)$'),
               y0: int | None = None, y1: int | None = None):
    """분류 노드 아래 사례들의 재해종류·기인물 분류·유발요인·통제위계 분포 (오른쪽 패널용)."""
    label = check_label(label)
    base = f"""
        MATCH (n:{label} {{id: $id}})
        {_case_scope(label)}
        WHERE {CASE_FILTER}
        WITH DISTINCT c
    """
    parts = {
        'accidentType': 'MATCH (c)-[:HAS_ACCIDENT_TYPE]->(v) RETURN v.name AS k, count(*) AS n',
        'objectCategory': 'MATCH (c)-[:INVOLVES]->(:CausalObject)-[:BROADER*1..2]->(v:ObjectCategory) RETURN v.name AS k, count(DISTINCT c) AS n',
        'causalObject': 'MATCH (c)-[:INVOLVES]->(:CausalObject)-[:BROADER*0..1]->(v:CausalObject) WHERE NOT (v)-[:BROADER]->(:CausalObject) RETURN v.name AS k, count(DISTINCT c) AS n',
        'hazardFactor': 'MATCH (c)-[:CAUSED_BY]->(v) RETURN v.name AS k, count(*) AS n',
        'controlLevel': 'MATCH (c)-[:HAS_MEASURE]->(:Measure)-[:BROADER]->(v:ControlLevel) RETURN v.name AS k, count(*) AS n',
        'sector': 'RETURN c.sector AS k, count(*) AS n',
        'heightBand': 'MATCH (c)-[:FELL_FROM]->(v:HeightBand) RETURN v.name AS k, count(*) AS n',
    }
    out = {}
    for k, tail in parts.items():
        out[k] = q(base + tail + ' ORDER BY n DESC LIMIT 8', id=node_id, sector=sector, y0=y0, y1=y1)
    # 연도별 추이는 순서대로
    out['year'] = q(base + 'RETURN toString(c.year) AS k, count(*) AS n ORDER BY k', id=node_id, sector=sector,
                    y0=y0, y1=y1)
    return out


@router.get('/api/search')
def search(q_: str = Query(..., alias='q', min_length=2), limit: int = Query(20, le=100)):
    """사례 검색과 함께, 질문 속 말이 가리키는 개념(용어 사전·연도)도 돌려줍니다."""
    rows = q("""
        MATCH (c:AccidentCase)
        WHERE c.code CONTAINS $s OR c.id CONTAINS $s OR c.summary CONTAINS $s OR c.raw_co CONTAINS $s
        RETURN c.id AS id, c.code AS code, c.summary AS summary, c.sector AS sector, c.year AS year
        ORDER BY c.year DESC, c.code LIMIT $limit
    """, s=q_, limit=limit)
    return {'items': rows, 'concepts': resolve_terms(q_)}


def resolve_terms(text: str) -> list[dict]:
    """문장 속 용어 → 개념. 용어 사전(Term) 이름이 문장에 들어 있거나 문장이 용어에 들어 있으면 해당."""
    out = q("""
        MATCH (t:Term)-[r:REFERS_TO]->(x)
        WHERE $s CONTAINS t.name OR t.name CONTAINS $s
        RETURN t.name AS term, x.id AS id, labels(x)[0] AS label, x.name AS name, r.weight AS weight
        ORDER BY r.weight DESC, name LIMIT 40
    """, s=text)
    # 긴 용어가 짧은 용어를 품으면 긴 쪽만 씁니다: '포크레인'에 '크레인'이 들어 있어도 크레인류로 넓히지 않음
    # 질문 안에 그대로 들어 있는 용어가 있으면 그것만 씁니다 ('크레인'으로 물으면 '포크레인'은 제외).
    matched = {o['term'] for o in out if o['term'] in text}
    if matched:
        out = [o for o in out if o['term'] in matched and not any(o['term'] != t and o['term'] in t for t in matched)]
    m = re.search(r'(20\d\d)', text)
    if m:
        out += q("MATCH (y:Year {id: $id}) RETURN y.name AS term, y.id AS id, 'Year' AS label, y.name AS name, "
                 "1.0 AS weight", id='Y:' + m.group(1))
    for o in out:
        o['group'] = CLASSES.get(o['label'], ('', ''))[1]
    return out


@router.get('/api/terms')
def terms(q_: str = Query(..., alias='q', min_length=1)):
    """용어 → 개념 목록. 하나의 용어가 여러 개념을 가리키면 전부 돌려줍니다 (예: 크레인 → 14개)."""
    return {'items': resolve_terms(q_)}


@router.get('/api/patterns')
def patterns(sector: str | None = Query(None, pattern='^(M|C)$'), q_: str | None = Query(None, alias='q'),
             skip: int = 0, limit: int = Query(30, le=200)):
    """사고 패턴 카드 목록 (큰 패턴부터). q는 패턴 이름 또는 용어 사전으로 찾은 개념으로 거릅니다 (예: 포크레인)."""
    cids = [c['id'] for c in resolve_terms(q_)] if q_ else []
    where = ('($sector IS NULL OR $sector IN p.sectors) AND ($q IS NULL OR p.name CONTAINS $q '
             'OR EXISTS { MATCH (p)-[:DEFINED_BY]->(x) WHERE x.id IN $cids })')
    total = q(f'MATCH (p:AccidentPattern) WHERE {where} RETURN count(p) AS n', sector=sector, q=q_, cids=cids)
    rows = q(f"""
        MATCH (p:AccidentPattern) WHERE {where}
        WITH p ORDER BY p.size DESC SKIP $skip LIMIT $limit
        OPTIONAL MATCH (p)-[x:REPRESENTED_BY]->(c:AccidentCase)
        WITH p, x, c ORDER BY x.rank
        WITH p, collect(CASE WHEN c IS NULL THEN null ELSE
             {{id: c.id, code: c.code, legacyId: c.legacyId, summary: c.summary, year: c.year, sector: c.sector}} END) AS reps
        OPTIONAL MATCH (p)-[d:DEFINED_BY]->(v)
        WITH p, reps, collect({{role: d.role, id: v.id, name: v.name, label: labels(v)[0]}}) AS parts
        RETURN p {{.id, .name, .size, .sectors, .topWorks}} AS pattern, reps, parts
        ORDER BY pattern.size DESC
    """, sector=sector, q=q_, cids=cids, skip=skip, limit=limit)
    return {'total': total[0]['n'] if total else 0, 'items': rows}


@router.get('/api/patterns/{pid}')
def pattern_detail(pid: str):
    """패턴 하나: 대표 사례(원인 문장·대책·통제위계)와 패턴 전체의 대책 통제위계 분포."""
    head = q("""
        MATCH (p:AccidentPattern {id: $id})
        OPTIONAL MATCH (p)-[d:DEFINED_BY]->(v)
        RETURN p {.id, .name, .size, .sectors, .topWorks} AS pattern,
               collect({role: d.role, id: v.id, name: v.name, label: labels(v)[0]}) AS parts
    """, id=pid)
    if not head:
        raise HTTPException(404, '패턴을 찾을 수 없습니다')
    reps = q("""
        MATCH (:AccidentPattern {id: $id})-[x:REPRESENTED_BY]->(c:AccidentCase)
        OPTIONAL MATCH (c)-[hm:HAS_MEASURE]->(m:Measure)
        OPTIONAL MATCH (m)-[:BROADER]->(cl:ControlLevel)
        WITH x, c, hm, m, collect(cl.name) AS levels ORDER BY hm.order
        WITH x, c, collect(CASE WHEN m IS NULL THEN null ELSE {text: m.text, levels: levels} END) AS measures
        OPTIONAL MATCH (c)-[:CAUSED_BY]->(h:HazardFactor)
        WITH x, c, measures, collect(h.name) AS hazards
        RETURN c {.id, .code, .legacyId, .summary, .year, .sector, .raw_hf, .raw_co} AS case, hazards, measures
        ORDER BY x.rank
    """, id=pid)
    levels = q("""
        MATCH (:AccidentPattern {id: $id})<-[:BELONGS_TO]-(c)-[:HAS_MEASURE]->(:Measure)-[:BROADER]->(cl:ControlLevel)
        RETURN cl.name AS k, count(*) AS n ORDER BY n DESC
    """, id=pid)
    return {**head[0], 'representatives': reps, 'controlLevels': levels}


@router.get('/api/patterns/{pid}/flow')
def pattern_flow(pid: str, top: int = Query(3, le=6)):
    """패턴의 흐름 그래프: 주요 작업 → 기인물 → 유발요인 → 재해종류 → 통제위계별 대책. 노드마다 stage(0~4)."""
    head = pattern_detail(pid)
    nodes, links = [], []
    def add(label, props, stage, **extra):
        n = node_json(label, props, stage=stage, **extra)
        nodes.append(n)
        return n['id']
    works = q("""
        MATCH (:AccidentPattern {id: $id})<-[:BELONGS_TO]-(c)-[:OCCURRED_DURING]->(u)
        RETURN labels(u)[0] AS l, properties(u) AS p, count(*) AS n ORDER BY n DESC LIMIT $top
    """, id=pid, top=top)
    stage_ids = [[add(w['l'], w['p'], 0, val=w['n']) for w in works]]
    role_stage = {'기인물': 1, '유발요인': 2, '재해종류': 3}
    for r, st in role_stage.items():
        part = next((x for x in head['parts'] if x['role'] == r), None)
        stage_ids.append([add(part['label'], {'id': part['id'], 'name': part['name']}, st, val=head['pattern']['size'])]
                         if part else [])
    stage_ids.append([add('ControlLevel', {'id': 'CL:' + lv['k'], 'name': lv['k']}, 4, val=lv['n'])
                      for lv in head['controlLevels']])
    for a, b in zip(stage_ids, stage_ids[1:]):
        for s_ in a:
            for t in b:
                links.append({'source': s_, 'target': t, 'type': 'FLOW', 'name': ''})
    return {'nodes': nodes, 'links': links, 'pattern': head['pattern']}


@router.get('/api/runs')
def runs():
    """적재 이력. 어떤 파일을 언제 올렸고 새 사례가 몇 건이었는지."""
    return {'items': q('MATCH (r:IngestRun) RETURN r.file AS file, toString(r.loadedAt) AS loadedAt, '
                       'r.cases AS cases, r.newCases AS newCases ORDER BY r.loadedAt DESC')}
