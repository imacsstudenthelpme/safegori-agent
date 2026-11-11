"""사고 패턴: 비슷한 사고를 묶고 패턴마다 대표 사례를 고릅니다.

미리보기(dry-run)와 Neo4j 적재가 같은 함수를 쓰므로 결과가 항상 같습니다.
입력은 사례 속성 딕셔너리 목록입니다 (transform의 props, 또는 Neo4j에서 읽은 properties).
"""
from __future__ import annotations

import hashlib
from collections import defaultdict


def pattern_id(key: str) -> str:
    return 'PAT:' + hashlib.sha1(key.encode('utf-8')).hexdigest()[:10]


def build_patterns(cases: list[dict], cfg: dict) -> list[dict]:
    """cases: id, code, sectorCode, year, patternKey, patternObject, patternType, patternHazard,
    patternWork, repScore 를 가진 딕셔너리."""
    groups = defaultdict(list)
    skip = set(cfg.get('exclude_objects') or [])
    for c in cases:
        if c.get('patternObject') in skip:
            continue
        if c.get('patternKey'):
            groups[c['patternKey']].append(c)
    out = []
    for key, members in groups.items():
        if len(members) < cfg['min_size']:
            continue
        ranked = sorted(members, key=lambda c: (-(c.get('repScore') or 0), -(c.get('year') or 0), c.get('code', '')))
        reps = [ranked[0]]
        want = cfg['representatives']
        if cfg['score'].get('diversify') and want > 1:
            first = ranked[0]
            for c in ranked[1:]:
                if len(reps) >= want:
                    break
                if c.get('sectorCode') != first.get('sectorCode') or c.get('patternWork') != first.get('patternWork'):
                    reps.append(c)
        for c in ranked[1:]:
            if len(reps) >= want:
                break
            if c not in reps:
                reps.append(c)
        sectors = {c.get('sectorCode') for c in members}
        works = defaultdict(int)
        for c in members:
            if c.get('patternWork'):
                works[c['patternWork']] += 1
        f = members[0]
        out.append({
            'id': pattern_id(key), 'key': key, 'name': key, 'size': len(members),
            'object': f['patternObject'], 'accidentType': f['patternType'], 'hazard': f['patternHazard'],
            'sectors': sorted(s for s in sectors if s),
            'topWorks': [w for w, _ in sorted(works.items(), key=lambda x: -x[1])[:3]],
            'members': [c['id'] for c in members],
            'reps': [c['id'] for c in reps],
        })
    out.sort(key=lambda p: -p['size'])
    return out


def coverage(patterns: list[dict], total: int) -> str:
    covered = sum(p['size'] for p in patterns)
    return f'패턴 {len(patterns)}개가 사례 {covered:,}건({covered / max(total, 1):.0%})을 묶음'
