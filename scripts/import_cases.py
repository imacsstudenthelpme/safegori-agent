"""Read the SIF archive without modifying it. Usage: python import_cases.py source.xlsx"""
import json
import sys
import unicodedata
from pathlib import Path
import openpyxl

source = Path(sys.argv[1])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
records = []
for sheet_index, sheet in enumerate(workbook.worksheets[1:], 1):
    construction = sheet.title == '아카이브(건설업)'
    labels = (['연번', '공종', '작업명', '단위작업명', '재해종류', '재해개요', '기인물', '재해유발요인', '위험성 감소대책(예시)'] if construction else
              ['연번', '산재업종(대분류)', '산재업종(중분류)', '산재업종(소분류)', '재해개요', '기인물', '고위험작업·상황', '재해유발요인', '위험성 감소대책(예시)'])
    count = 0
    for row_number, row in enumerate(sheet.values, 1):
        if not isinstance(row[1], (int, float)):
            continue
        fields = dict(zip(labels, row[1:10]))
        records.append({'id': f'sif-{sheet_index}-{row_number}', 'sourceSheet': sheet.title,
                        'sourceRow': row_number, 'group': '건설업' if construction else '제조업 등',
                        'summary': fields['재해개요'] or '',
                        'category': fields['공종'] if construction else fields['산재업종(대분류)'],
                        'task': fields['작업명'] if construction else fields['고위험작업·상황'],
                        'fields': fields})
        count += 1
    print(sheet.title, count)
assert len({r['id'] for r in records}) == len(records)
target = Path(__file__).resolve().parents[1] / 'public/data/cases.json'
target.write_text(json.dumps({'sourceFile': unicodedata.normalize('NFC', source.name), 'records': records}, ensure_ascii=False), encoding='utf-8')
print('Total:', len(records))
