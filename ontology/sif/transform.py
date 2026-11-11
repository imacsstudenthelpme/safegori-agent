"""원본 행 → 온톨로지 값.

규칙과 대응표는 모두 config/ 폴더에서 읽습니다. 코드를 고치지 않고 설정 파일만 바꿔서
`python ingest.py remap`을 실행하면 이미 올라간 사례 전체에 새 규칙이 적용됩니다.
"""
from __future__ import annotations

import csv
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

SECTOR_NAME = {'M': '제조업 등', 'C': '건설업'}
UNCLASSIFIED = '미분류'


def _csv(path: Path) -> list[dict]:
    with open(path, encoding='utf-8-sig', newline='') as f:
        return [{k.strip(): (v or '').strip() for k, v in r.items()} for r in csv.DictReader(f)]


def _yaml(path: Path) -> dict:
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f)


@dataclass
class Config:
    columns: dict
    object_category: dict
    object_note: dict
    accident_types: dict
    hazard_factors: dict
    rules_at: dict
    rules_hf: dict
    rules_cl: dict
    periods: list
    height_bands: list
    aliases: list
    patterns: dict

    @classmethod
    def load(cls, folder: str | Path = 'config') -> 'Config':
        d = Path(folder)
        oc = _csv(d / 'causal_object_category.csv')
        at = _csv(d / 'accident_types.csv')
        hf = _csv(d / 'hazard_factors.csv')
        cfg = cls(
            columns=_yaml(d / 'columns.yaml'),
            object_category={r['기인물']: r['상위분류'] for r in oc if r['기인물']},
            object_note={r['기인물']: r['메모'] for r in oc if r.get('메모')},
            accident_types={r['재해종류']: (r['상위분류'], r['공식 발생형태']) for r in at if r['재해종류']},
            hazard_factors={r['유발요인']: (r['요인 분류'], r['멘토 12요인'] == 'Y') for r in hf if r['유발요인']},
            rules_at=_yaml(d / 'rules_accident_type.yaml'),
            rules_hf=_yaml(d / 'rules_hazard.yaml'),
            rules_cl=_yaml(d / 'rules_control_level.yaml'),
            periods=_yaml(d / 'time_periods.yaml')['periods'],
            height_bands=_yaml(d / 'height_bands.yaml')['bands'],
            aliases=_csv(d / 'aliases.csv') if (d / 'aliases.csv').exists() else [],
            patterns=_yaml(d / 'patterns.yaml'),
        )
        cfg.validate()
        return cfg

    def validate(self):
        names = set(self.hazard_factors)
        bad = []
        for sec in ('M', 'C'):
            spec = self.rules_hf[sec]
            for r in spec.get('rules', []) + spec.get('fallback', []):
                if r['factor'] not in names:
                    bad.append(r['factor'])
            if spec.get('default') and spec['default'] not in names:
                bad.append(spec['default'])
        if bad:
            raise ValueError(f'rules_hazard.yaml에 hazard_factors.csv에 없는 요인이 있습니다: {sorted(set(bad))}')


def base_of(name: str) -> str:
    b = re.split(r'[\(\[]', name)[0].strip()
    return b or name


def _any(text: str, words) -> bool:
    return any(w in text for w in words)


def match(cond: dict, ctx: dict) -> bool:
    for k, v in cond.items():
        if k in ('factor', 'stop', 'note', 'set', 'group', 'type', 'source'):
            continue
        if k == 'sector':
            if ctx['sector'] not in (v if isinstance(v, list) else [v]):
                return False
        elif k == 'at':
            if ctx['at'] not in v:
                return False
        elif k == 'category':
            if ctx['category'] not in v:
                return False
        elif k == 'not_category':
            if ctx['category'] in v:
                return False
        elif k == 'object_any':
            if not _any(ctx['co'], v):
                return False
        elif k == 'text_any':
            if not _any(ctx['text'], v):
                return False
        elif k == 'text_all':
            if not all(w in ctx['text'] for w in v):
                return False
        elif k == 'phrase_any':
            if not _any(ctx['hf'], v):
                return False
        elif k == 'summary_any':
            if not _any(ctx['summary'], v):
                return False
        elif k == 'any_of':
            if not any(match(c, ctx) for c in v):
                return False
        else:
            raise ValueError(f'알 수 없는 조건 키: {k}')
    return True


def split_measures(text: str) -> list[str]:
    parts = text.split('▶') if '▶' in text else text.splitlines()
    return [p.strip(' \n\r\t-·•') for p in parts if p.strip(' \n\r\t-·•')]


def measure_id(text: str) -> str:
    return 'M:' + hashlib.sha1(re.sub(r'\s+', '', text).encode('utf-8')).hexdigest()[:12]


def code_of(name: str) -> str:
    m = re.match(r'^([\d.]+)', name)
    return m.group(1).rstrip('.') if m else ''


# 원본 표기 오류까지 허용: '2023월 5월', '2019년 6워령', '2020년 11년', '2023년경 11월경', '2020.10.24'
YEAR_RE = re.compile(r'^\s*(20\d\d)\s*(?:년|월|\.)\s*(?:경\s*)?(?:(\d{1,2})\s*(?=월|년|경|워|\.))?')
HEIGHT_RE = re.compile(r'(?<![\d.])(\d{1,3}(?:\.\d+)?)\s*(?:m|M|미터)(?:\s*(\d{1,2})\s*(?:cm|센티))?(?![a-zA-Z²])')
FALL_TYPES = {'추락'}


def extract_time(summary: str):
    m = YEAR_RE.match(summary or '')
    if not m:
        return None, None
    month = int(m.group(2)) if m.group(2) and 1 <= int(m.group(2)) <= 12 else None
    return int(m.group(1)), month


def extract_height(summary: str):
    """재해개요에서 높이(m). 여러 개면 가장 큰 값(난간 높이보다 떨어진 높이가 큼). 300m 넘으면 무시."""
    vals = []
    for m in HEIGHT_RE.finditer(summary or ''):
        v = float(m.group(1)) + (int(m.group(2)) / 100 if m.group(2) else 0)
        if 0 < v <= 300:
            vals.append(round(v, 2))
    return max(vals) if vals else None


def period_of(year, cfg) -> str | None:
    if year is None:
        return None
    for p in cfg.periods:
        if (p.get('from') is None or year >= p['from']) and (p.get('to') is None or year <= p['to']):
            return p['name']
    return None


def band_of(h, cfg):
    if h is None:
        return None, None
    for b in cfg.height_bands:
        if b['min'] <= h < b['max']:
            return b['name'], b.get('parent')
    return None, None


@dataclass
class Case:
    id: str
    props: dict
    context: dict
    at: str
    at_source: str
    at_group: str
    at_official: str
    classified_as: str | None
    classified_note: str
    co: str
    co_base: str
    co_category: str
    co_note: str
    hazards: list
    measures: list
    year: int | None = None
    month: int | None = None
    period: str | None = None
    height: float | None = None
    band: str | None = None
    band_parent: str | None = None
    issues: list = field(default_factory=list)


def transform(r: dict, cfg: Config) -> Case:
    sector = r['sector']
    at, co = r.get('at', ''), r.get('co', '')
    notes = []
    issues = []
    ctx0 = {'sector': sector, 'at': at, 'co': co, 'category': '', 'hf': r['hf'], 'summary': r['summary'],
            'text': r['hf'] + ' ' + r['summary']}
    for rw in cfg.rules_at.get('rewrites', []):
        if match(rw['when'], ctx0):
            at = rw['set'].get('at', at)
            co = rw['set'].get('co', co)
            ctx0.update(at=at, co=co)
            if rw.get('note'):
                notes.append(rw['note'])

    if at and at == r.get('at'):
        at_source = '원본'
    elif at:
        at_source = '; '.join(notes) or '재분류'
    else:
        at_source = ''
        for ex in cfg.rules_at.get('extract', []):
            if match(ex, ctx0):
                at, at_source = ex['type'], ex.get('source', '추출')
                break
        if not at:
            at, at_source = cfg.rules_at['extract_default']['type'], cfg.rules_at['extract_default']['source']
            issues.append(('재해종류', r['summary'][:60], '문장에서 재해종류를 찾지 못함'))
    group, official = cfg.accident_types.get(at, (UNCLASSIFIED, '미확인'))
    if group == UNCLASSIFIED:
        issues.append(('재해종류', at, 'accident_types.csv에 없는 재해종류'))

    co = co or '분류 불가'
    base = base_of(co)
    category = cfg.object_category.get(co) or cfg.object_category.get(base)
    if not category:
        category = UNCLASSIFIED
        issues.append(('기인물', base, 'causal_object_category.csv에 없는 기인물'))
    co_note = cfg.object_note.get(co) or ''
    if co != r.get('co', '') and r.get('co'):
        co_note = f"원본 {r['co']} → {co}"

    ctx = dict(ctx0, at=at, co=co, category=category)
    classified, cnote = None, ''
    for c in cfg.rules_at.get('classify', []):
        if match(c['when'], ctx) and c['group'] != group:
            classified, cnote = c['group'], c.get('note', '')
            break

    spec = cfg.rules_hf[sector]
    found = []
    for rule in spec['rules']:
        if match(rule, ctx) and rule['factor'] not in found:
            found.append(rule['factor'])
            if spec.get('mode') == 'first' or rule.get('stop'):
                break
    if spec.get('mode') != 'first':
        found = found[: spec.get('max', 2)]
    if not found:
        for rule in spec.get('fallback', []):
            if match(rule, ctx):
                found.append(rule['factor'])
                break
    if not found:
        found = [spec.get('default', '기타')]
    if found == ['기타']:
        issues.append(('유발요인', r['hf'][:60], '규칙에 맞는 유발요인이 없어 기타'))
    hazards = [{'id': 'HF:' + f, 'name': f, 'category': cfg.hazard_factors[f][0],
                'mentor12': cfg.hazard_factors[f][1]} for f in found]

    measures = []
    for k, t in enumerate(split_measures(r['ms'])):
        levels = [lv['level'] for lv in cfg.rules_cl['levels'] if _any(t, lv['keywords'])]
        measures.append({'id': measure_id(t), 'text': t, 'order': k + 1, 'levels': levels})

    if sector == 'M':
        context = {'ind_l': r['ind_l'], 'ind_m': r['ind_m'], 'ind_s': r['ind_s'], 'ws': r['ws']}
    else:
        context = {'wt': r['wt'], 'w': r['w'], 'uw': r['uw']}

    year, month = extract_time(r['summary'])
    if year is None:
        issues.append(('발생 시기', r['summary'][:40], '재해개요 첫머리에서 연도를 찾지 못함'))
    period = period_of(year, cfg)
    height = extract_height(r['summary']) if (at in FALL_TYPES or group == '떨어짐·넘어짐') else None
    band, band_parent = band_of(height, cfg)

    # 사고 패턴 키와 대표 사례 점수
    work = r['w'] or r['ind_m'] or ''
    key_vals = {'object': base, 'accident_type': at, 'hazard': hazards[0]['name'], 'work': work}
    pcfg = cfg.patterns
    pattern_key = ' · '.join(key_vals[k] for k in pcfg['key'])
    sc = pcfg['score']
    lv = {l for m in measures for l in m['levels']}
    rep = (sc['per_control_level'] * len(lv) + (sc['has_engineering'] if '공학적 대책' in lv else 0)
           + sc['per_measure'] * min(len(measures), sc['max_measures'])
           + (sc['original_type'] if at_source == '원본' else 0)
           + (sc['summary_len_ok'] if sc['summary_min'] <= len(r['summary']) <= sc['summary_max'] else 0))

    serial = r.get('serial', '')
    code = f"SIF-{sector}-{int(serial):04d}" if serial.isdigit() else r['id']
    props = {
        'id': r['id'], 'code': code, 'sector': SECTOR_NAME[sector], 'sectorCode': sector,
        'serial': serial, 'archive': r['archive'], 'sheet': r['sheet'], 'row': r['row'],
        'summary': r['summary'], 'accidentTypeSource': at_source,
        'raw_ind_l': r['ind_l'], 'raw_ind_m': r['ind_m'], 'raw_ind_s': r['ind_s'], 'raw_ws': r['ws'],
        'raw_wt': r['wt'], 'raw_w': r['w'], 'raw_uw': r['uw'], 'raw_at': r['at'], 'raw_co': r['co'],
        'raw_hf': r['hf'], 'raw_ms': r['ms'],
        'year': year, 'month': month, 'heightM': height, 'fatal': '사망' in r['summary'],
        'patternKey': pattern_key, 'patternObject': base, 'patternType': at,
        'patternHazard': hazards[0]['name'], 'patternWork': work, 'repScore': round(rep, 2),
        # 프런트의 public/data/cases.json(scripts/import_cases.py)과 같은 ID: sif-{시트 순서}-{엑셀 행}
        # 공단 원본 엑셀(시트 순서: 개요, 제조업등, 건설업)일 때만 만듭니다.
        'legacyId': (f"sif-{1 if sector == 'M' else 2}-{r['row']}" if str(r.get('sheet', '')).startswith('아카이브(') else ''),
    }
    return Case(id=r['id'], props=props, context=context, at=at, at_source=at_source, at_group=group,
                at_official=official, classified_as=classified, classified_note=cnote, co=co, co_base=base,
                co_category=category, co_note=co_note, hazards=hazards, measures=measures,
                year=year, month=month, period=period, height=height, band=band, band_parent=band_parent,
                issues=[(r['id'],) + i for i in issues])


def raw_from_props(p: dict) -> dict:
    """Neo4j에 저장된 사례 속성에서 원본 행을 되살립니다 (remap용)."""
    return {
        'id': p['id'], 'case_id': p['id'], 'serial': p.get('serial', ''), 'sector': p['sectorCode'],
        'ind_l': p.get('raw_ind_l', ''), 'ind_m': p.get('raw_ind_m', ''), 'ind_s': p.get('raw_ind_s', ''),
        'ws': p.get('raw_ws', ''), 'wt': p.get('raw_wt', ''), 'w': p.get('raw_w', ''), 'uw': p.get('raw_uw', ''),
        'at': p.get('raw_at', ''), 'summary': p.get('summary', ''), 'co': p.get('raw_co', ''),
        'hf': p.get('raw_hf', ''), 'ms': p.get('raw_ms', ''),
        'archive': p.get('archive', ''), 'sheet': p.get('sheet', ''), 'row': p.get('row', 0),
    }
