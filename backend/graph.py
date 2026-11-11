'''Neo4j 지식그래프 조회 + 프론트(GraphPanel)용 {nodes, links} 변환.

스키마: ontology/ 파이프라인(python ontology/ingest.py load ...)이 만든 온톨로지.
기존 엔드포인트(/api/objects, /api/graph/object/{name}, /api/cases/{id})의 응답 모양은 그대로 둡니다.

기인물 중심 흐름 그래프 (왼쪽 → 오른쪽, 노드마다 stage 0~4)
  stage 0  작업        UnitWork(건설) / WorkSituation(제조)   -> type task
  stage 1  기인물      CausalObject (괄호 앞 기본 이름)        -> type equipment
  stage 2  유발요인    HazardFactor                            -> type risk
  stage 3  재해종류    AccidentType                            -> type accident
  stage 4  예방대책    ControlLevel (통제위계별 대책 묶음)      -> type prevention
링크의 count는 모두 "이 기인물 사고 중" 함께 나타난 사례 수입니다.
'''
import os

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password123")),
        )
    return _driver


def run(query, **params):
    with get_driver().session(database=os.getenv("NEO4J_DATABASE") or None) as session:
        return [record.data() for record in session.run(query, **params)]


def _short(text, limit=12):
    return text if len(text) <= limit else text[:limit] + "…"


# 사례 → 기본 기인물: 괄호 하위유형(사다리(이동식/A형))은 상위 기인물(사다리)로 모읍니다.
BASE_OBJECT = """
    MATCH (c:AccidentCase)-[:INVOLVES]->(:CausalObject)-[:BROADER*0..1]->(o:CausalObject)
    WHERE NOT (o)-[:BROADER]->(:CausalObject)
"""
LEVEL_ORDER = ['제거·대체', '공학적 대책', '관리적 대책', '개인보호구']


def object_list():
    return run(BASE_OBJECT + """
        WITH o, count(DISTINCT c) AS cases
        WHERE NOT o.name IN ['분류 불가', '분류불능', '원인미상']
        RETURN o.name AS name, cases
        ORDER BY cases DESC
    """)


def object_graph(name, per_type=6):
    """기인물 하나를 가운데 두고 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책 흐름 그래프."""
    center = run(BASE_OBJECT + """
        AND o.name = $name
        WITH o, collect(DISTINCT c) AS cs
        RETURN o.name AS name, size(cs) AS cases,
               [x IN cs[0..5] | coalesce(x.legacyId, x.code)] AS examples,
               [(o)-[:BROADER]->(k:ObjectCategory) | k.name][0] AS category
    """, name=name)
    if not center or not center[0]["cases"]:
        return None
    scope = BASE_OBJECT + " AND o.name = $name WITH DISTINCT c "
    works = run(scope + """
        MATCH (c)-[:OCCURRED_DURING]->(u)
        RETURN labels(u)[0] AS label, u.id AS id, u.name AS name, u.code AS code, count(*) AS count
        ORDER BY count DESC LIMIT $limit
    """, name=name, limit=per_type)
    hazards = run(scope + """
        MATCH (c)-[:CAUSED_BY]->(h:HazardFactor)
        OPTIONAL MATCH (h)-[:BROADER]->(hc:HazardCategory)
        RETURN h.name AS name, hc.name AS category, count(*) AS count
        ORDER BY count DESC LIMIT $limit
    """, name=name, limit=per_type)
    hz = [h["name"] for h in hazards]
    accidents = run(scope + """
        MATCH (c)-[:HAS_ACCIDENT_TYPE]->(a:AccidentType)
        RETURN a.name AS name, count(*) AS count
        ORDER BY count DESC LIMIT $limit
    """, name=name, limit=per_type)
    at = [a["name"] for a in accidents]
    hz_at = run(scope + """
        MATCH (c)-[:CAUSED_BY]->(h:HazardFactor), (c)-[:HAS_ACCIDENT_TYPE]->(a:AccidentType)
        WHERE h.name IN $hz AND a.name IN $at
        RETURN h.name AS h, a.name AS a, count(*) AS count
    """, name=name, hz=hz, at=at)
    levels = run(scope + """
        MATCH (c)-[:HAS_ACCIDENT_TYPE]->(a:AccidentType)
        WHERE a.name IN $at
        MATCH (c)-[:HAS_MEASURE]->(m:Measure)-[:BROADER]->(cl:ControlLevel)
        RETURN a.name AS a, cl.name AS level, count(*) AS count, collect(DISTINCT m.text)[0..3] AS examples
    """, name=name, at=at)
    return build_graph(center[0], works, hazards, accidents, hz_at, levels)


def build_graph(center, works, hazards, accidents, hz_at, levels):
    obj_id = f"obj:{center['name']}"
    nodes = [{
        "id": obj_id, "label": center["name"], "type": "equipment", "stage": 1,
        "props": {"cases": center["cases"], "examples": center["examples"], "category": center.get("category")},
    }]
    links = []

    for w in works:
        node_id = f"work:{w['id']}"
        nodes.append({"id": node_id, "label": _short(w["name"]), "type": "task", "stage": 0,
                      "props": {"code": w.get("code"), "fullName": w["name"], "count": w["count"],
                                "kind": "단위작업" if w["label"] == "UnitWork" else "작업·상황"}})
        links.append({"source": node_id, "target": obj_id, "relation": f"작업 중 · {w['count']}건", "count": w["count"]})

    for h in hazards:
        node_id = f"hf:{h['name']}"
        nodes.append({"id": node_id, "label": _short(h["name"]), "type": "risk", "stage": 2,
                      "props": {"fullName": h["name"], "category": h.get("category"), "count": h["count"]}})
        links.append({"source": obj_id, "target": node_id, "relation": f"유발요인 · {h['count']}건", "count": h["count"]})

    for a in accidents:
        nodes.append({"id": f"acc:{a['name']}", "label": a["name"], "type": "accident", "stage": 3,
                      "props": {"count": a["count"]}})
    for r in hz_at:
        links.append({"source": f"hf:{r['h']}", "target": f"acc:{r['a']}",
                      "relation": f"이어짐 · {r['count']}건", "count": r["count"]})

    seen = {}
    for r in levels:
        node_id = f"cl:{r['level']}"
        if node_id not in seen:
            seen[node_id] = {"id": node_id, "label": r["level"], "type": "prevention", "stage": 4,
                             "props": {"fullName": r["level"], "count": 0, "examples": []}}
            nodes.append(seen[node_id])
        seen[node_id]["props"]["count"] += r["count"]
        seen[node_id]["props"]["examples"] = (seen[node_id]["props"]["examples"] + r["examples"])[:3]
        links.append({"source": f"acc:{r['a']}", "target": node_id,
                      "relation": f"예방대책 · {r['count']}건", "count": r["count"]})

    def order(n):
        if n["type"] == "prevention" and n["label"] in LEVEL_ORDER:
            return (n["stage"], LEVEL_ORDER.index(n["label"]))
        return (n["stage"], -n["props"].get("count", n["props"].get("cases", 0)))
    nodes.sort(key=order)

    return {
        "source": "neo4j",
        "layout": "flow",
        "stages": ["작업", "기인물", "유발요인", "재해종류", "예방대책"],
        "title": center["name"],
        "subtitle": f"사고사례 {center['cases']}건 기반 · 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책",
        "nodes": nodes,
        "links": links,
    }


def case_detail(case_id):
    """사례 상세. id는 legacyId(sif-1-7), 사례 번호(SIF-M-0004), 내부 id 모두 받습니다."""
    rows = run(
        """
        MATCH (c:AccidentCase)
        WHERE c.legacyId = $id OR c.code = $id OR c.id = $id
        WITH c LIMIT 1
        OPTIONAL MATCH (c)-[:OCCURRED_DURING]->(u)
        OPTIONAL MATCH (c)-[:INVOLVES]->(o:CausalObject)
        OPTIONAL MATCH (c)-[:HAS_ACCIDENT_TYPE]->(a:AccidentType)
        OPTIONAL MATCH (c)-[:BELONGS_TO]->(p:AccidentPattern)
        WITH c, u, o, a, p
        OPTIONAL MATCH (c)-[:CAUSED_BY]->(h:HazardFactor)
        WITH c, u, o, a, p, collect(DISTINCT h.name) AS hazards
        OPTIONAL MATCH (c)-[hm:HAS_MEASURE]->(m:Measure)
        WITH c, u, o, a, p, hazards, m, hm ORDER BY hm.order
        RETURN coalesce(c.legacyId, c.code) AS id, c.code AS code, c.year AS year, c.fatal AS fatal,
               c.summary AS summary, c.raw_hf AS riskText, u.name AS unitWork, o.name AS causalObject,
               a.name AS accidentType, hazards, p.id AS patternId, p.name AS pattern,
               collect(m.text) AS measures
        """,
        id=case_id,
    )
    return rows[0] if rows and rows[0]["id"] else None


def ping():
    run("RETURN 1 AS ok")
    return True
