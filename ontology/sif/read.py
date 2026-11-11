"""엑셀 읽기.

두 가지 형식을 모두 받습니다.
1. 공단 아카이브 원본: 시트마다 제목 줄 몇 개 뒤에 머리글이 있고, 건설업은 머리글이 두 줄입니다.
2. 정리 양식(template/SIF_정리양식.xlsx): 한 시트에 '업종구분' 열이 있고 제조·건설 사례가 섞여 있습니다.

열 위치가 아니라 머리글 이름(config/columns.yaml의 별칭)으로 찾기 때문에 열 순서가 바뀌어도 됩니다.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pandas as pd

FIELDS = ['case_id', 'serial', 'sector', 'ind_l', 'ind_m', 'ind_s', 'ws', 'wt', 'w', 'uw',
          'at', 'summary', 'co', 'hf', 'ms']


def norm(v) -> str:
    return re.sub(r'\s+', '', str(v)) if v is not None else ''


def clean(v) -> str:
    if v is None:
        return ''
    if isinstance(v, float) and pd.isna(v):
        return ''
    s = str(v).strip()
    if s.lower() == 'nan':
        return ''
    if re.fullmatch(r'\d+\.0', s):
        s = s[:-2]
    return s


def _alias_map(columns_cfg: dict) -> dict:
    out = {}
    for field, names in columns_cfg['aliases'].items():
        for n in names:
            out[norm(n)] = field
    return out


def _find_header(df: pd.DataFrame, amap: dict):
    for i in range(min(20, len(df))):
        keys = {amap.get(norm(x)) for x in df.iloc[i].tolist()}
        if 'summary' in keys and ('co' in keys or 'hf' in keys):
            return i
    return None


def _columns(df: pd.DataFrame, h: int, amap: dict):
    top = df.iloc[h].tolist()
    sub = df.iloc[h + 1].tolist() if h + 1 < len(df) else [None] * len(top)
    sub_keys = [amap.get(norm(x)) for x in sub]
    two_rows = sum(1 for k in sub_keys if k) >= 2
    cols = {}
    for j in range(len(top)):
        key = sub_keys[j] if two_rows and sub_keys[j] else amap.get(norm(top[j]))
        if key and key not in cols:
            cols[key] = j
    return cols, h + (2 if two_rows else 1)


def _sector_of_row(sheet_sector: str | None, raw: str) -> str:
    if raw:
        return 'C' if '건설' in raw else 'M'
    return sheet_sector or 'M'


def case_key(sector: str, summary: str, co: str, hf: str) -> str:
    """원본 내용으로 만든 고유 키. 같은 사례가 다른 파일에 다시 들어와도 같은 키가 됩니다."""
    raw = '|'.join([sector, norm(summary), norm(co), norm(hf)])
    return f'SIF-{sector}-' + hashlib.sha1(raw.encode('utf-8')).hexdigest()[:10]


def read_workbook(path: str | Path, columns_cfg: dict, archive: str | None = None) -> tuple[list[dict], list[str]]:
    """파일 하나를 읽어 사례 행 목록과 경고 목록을 돌려줍니다."""
    path = Path(path)
    amap = _alias_map(columns_cfg)
    archive = archive or path.stem
    rows, warnings = [], []
    sheets = pd.read_excel(path, sheet_name=None, header=None, dtype=object)
    for sheet, df in sheets.items():
        if df.empty:
            continue
        h = _find_header(df, amap)
        if h is None:
            warnings.append(f'[{sheet}] 머리글(재해개요·기인물)을 찾지 못해 건너뜀')
            continue
        cols, start = _columns(df, h, amap)
        if 'sector' in cols:
            sheet_sector = None
        elif 'uw' in cols or 'wt' in cols:
            sheet_sector = 'C'
        elif 'ind_l' in cols or 'ind_s' in cols:
            sheet_sector = 'M'
        else:
            sheet_sector = 'C' if '건설' in sheet else 'M'
            warnings.append(f'[{sheet}] 업종을 머리글로 판단할 수 없어 시트 이름으로 {sheet_sector} 처리')
        missing = [f for f in ('summary', 'co', 'hf', 'ms') if f not in cols]
        if missing:
            warnings.append(f'[{sheet}] 없는 열: {", ".join(missing)}')
        n0 = len(rows)
        for i in range(start, len(df)):
            vals = df.iloc[i].tolist()
            r = {f: clean(vals[j]) if j < len(vals) else '' for f, j in cols.items()}
            if not r.get('summary'):
                continue
            r = {f: r.get(f, '') for f in FIELDS}
            r['sector'] = _sector_of_row(sheet_sector, r['sector'])
            r['archive'] = archive
            r['sheet'] = sheet
            r['row'] = i + 1
            r['id'] = r['case_id'] or case_key(r['sector'], r['summary'], r['co'], r['hf'])
            rows.append(r)
        warnings.append(f'[{sheet}] 사례 {len(rows) - n0}건 읽음 (머리글 {h + 1}행, 업종 {sheet_sector or "열 값"})')
    return rows, warnings
