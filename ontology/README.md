# SIF 온톨로지 그래프 (Neo4j + react-force-graph)

> **SafeGori 프로젝트 안에서의 위치:**
>  API는 `backend/ontology_api.py`(+ `backend/graph.py`), 화면은 `src/components/`에 합쳐져 있습니다.
> 아래 문서에서 `api/`, `web/` 경로는 원래 단독 프로젝트 기준
> 통합 내역은 `docs/ontology-integration.md`

공단 SIF 아카이브 엑셀을 Neo4j에 올리고, 같은 구조의 자료가 새로 생기면 계속 이어서 올려 웹페이지의 react-force-graph에 띄우기 위한 도구

```
엑셀 (공단 원본 그대로 / 정리 양식)
   │  python ingest.py load 파일.xlsx
   ▼
[읽기] 머리글 이름으로 열 찾기 ── [변환] config/ 규칙 적용 ── review_needed.csv (검토할 값)
   │
   ▼
Neo4j  (MERGE: 같은 사례는 갱신, 새 사례만 추가)
   │  uvicorn api.server:app
   ▼
API  (/api/case, /api/tbox, /api/taxonomy ... → {nodes, links})
   │  fetch
   ▼
웹페이지  <SifGraph> / <SifExplorer>  (react-force-graph-2d)
```

## 폴더

| 경로 | 내용 |
|---|---|
| `ingest.py` | 적재 도구 (load, remap, derive, check, init, template) |
| `config/` | 분류 대응표와 규칙. 코드를 고치지 않고 여기만 바꿉니다 |
| `sif/read.py` | 엑셀 읽기 (공단 원본·정리 양식 자동 판별) |
| `sif/transform.py` | 규칙 적용 |
| `sif/neo.py` | Neo4j 쓰기 |
| `api/server.py` | react-force-graph 형식으로 응답하는 API |
| `web/src/sif/` | React 컴포넌트 (`SifGraph`, `SifExplorer`, `api.ts`) |
| `template/SIF_정리양식.xlsx` | 직접 정리해서 올릴 때 쓰는 양식 |


```bash
pip install -r requirements.txt
cp .env.example .env      # Neo4j 주소와 비밀번호 입력
python ingest.py check    # "연결 성공"이 나오면 됩니다

Aura는 `NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io` 형식입니다.

```bash
python ingest.py load 한국산업안전보건공단_..._20260401.xlsx --dry-run
```

`preview/cases_mapped.csv`에 사례별로 어떤 재해종류·기인물 분류·유발요인이 붙는지,괜찮으면 `--dry-run`을 빼고 실행

```bash
python ingest.py load 한국산업안전보건공단_..._20260401.xlsx
```


**직접 정리해서.** `template/SIF_정리양식.xlsx`에 한 행에 사례 하나씩 쓰고 `load`합니다. 제조·건설 사례를 한 시트에 섞어도 되고, 재해종류가 비어 있으면 문장에서 자동 추출합니다.

```bash
python ingest.py load 새자료.xlsx 다른자료.xlsx
```

**중복이 생기지 않는 이유.** 사례 ID를 `재해개요 + 기인물 + 재해유발요인` 내용으로 만듭니다 (`SIF-C-4f3a...`). 그래서 새 버전 아카이브에 예전 사례가 그대로 들어 있으면 같은 ID가 되어 갱신만 되고, 새 사례만 추가됩니다. 화면에 보이는 `SIF-C-0002` 같은 번호는 `code` 속성입니다.

주의할 점이 하나 있습니다. 공단이 예전 사례의 개요 문장을 고쳐서 다시 내면, 내용이 달라졌으니 새 사례로 들어갑니다. 이걸 막으려면 정리 양식의 `사례ID` 열에 고정 ID를 직접 적으세요. 그 값이 있으면 그대로 ID로 씁니다.

적재할 때마다 `(:IngestRun)` 노드가 생기고 사례와 `LOADED_IN`으로 이어지므로, 언제 어떤 파일로 몇 건이 새로 들어왔는지 `/api/runs`나 아래 질의로 볼 수 있습니다.

```cypher
MATCH (r:IngestRun) RETURN r.file, r.loadedAt, r.cases, r.newCases ORDER BY r.loadedAt DESC
```

## 분류 규칙 고치기

새 자료에서 처음 보는 기인물이 나오면 `미분류`로 들어가고 `review_needed.csv`에 적힙니다. 예를 들어 "드론"이 처음 나왔다면:

1. `config/causal_object_category.csv`에 `드론,차량·건설기계,,` 한 줄 추가
2. `python ingest.py remap`

remap은 Neo4j에 저장해 둔 원본 값(`raw_*` 속성)을 다시 읽어서 지금 규칙으로 전체를 다시 매핑합니다. 원본 엑셀 파일은 필요 없습니다.

| 파일 | 바꾸는 것 |
|---|---|
| `causal_object_category.csv` | 기인물 → 기인물 분류. 괄호 앞 이름(`사다리(이동식/A형)` → `사다리`)으로도 찾습니다 |
| `accident_types.csv` | 재해종류 → 상위분류, 공식 발생형태 |
| `hazard_factors.csv` | 유발요인 목록과 요인 분류 (멘토 12요인 표시) |
| `rules_accident_type.yaml` | 재해종류 재분류(이상온도 접촉 → 온열질환 등), 제조업 재해종류 추출, 사례별 보정 |
| `rules_hazard.yaml` | 원문 → 유발요인 매핑 규칙 |
| `rules_control_level.yaml` | 대책 문장 → 통제위계 키워드 |
| `columns.yaml` | 엑셀 머리글 별칭 |
| `time_periods.yaml` | 연도 → 시기 묶음 (중대재해처벌법 시행 전·첫해·이후) |
| `height_bands.yaml` | 추락 높이 구간 (2m 기준) |
| `aliases.csv` | 용어 사전: 사용자가 쓰는 말 → 개념 (포크레인 → 굴착기) |
| `patterns.yaml` | 사고 패턴 묶는 기준, 최소 건수, 대표 사례 점수 |

규칙은 키워드 기반 초안이라 점선(`derived`)으로 표시됩니다. 멘토님 검토 후 규칙을 고쳐 remap하는 식으로 정확도를 올리면 됩니다.

## API 실행

```bash
uvicorn api.server:app --reload --port 8000
```

http://localhost:8000/docs 에서 모든 API를 바로 눌러 볼 수 있습니다.

| 주소 | 화면 | 내용 |
|---|---|---|
| `GET /api/tbox?case=SIF-M-0004` | T-Box로 보기 | 클래스 15개·관계 19개, 각 클래스에 그 사례의 값(`values`) |
| `GET /api/case/{id}` | 사례 그래프 | 사례와 값, 값의 상위 분류, 이어짐(LEADS_TO) |
| `GET /api/taxonomy/accident_type?sector=C` | 재해종류 | 최상위 → 상위분류 → 재해종류, 노드 `val`은 사례 수 |
| `GET /api/taxonomy/work_type?expand=W:2.1 거푸집 작업` | 공종 | 공종 → 작업, `expand`로 단위작업 펼치기 |
| `GET /api/taxonomy/industry` | 업종 | 대분류 → 중분류 (→ 소분류) |
| `GET /api/taxonomy/hazard` | 유발요인 | 요인 분류 → 유발요인 |
| `GET /api/taxonomy/causal_object` | 기인물 | 기인물 분류 → 기인물 |
| `GET /api/nodes/{라벨}/{id}/stats` | 오른쪽 패널 | 그 분류 아래 사례들의 재해종류·기인물·유발요인·통제위계 분포 |
| `GET /api/nodes/{라벨}/{id}/cases` | 오른쪽 패널 | 그 분류 아래 사례 목록 (`skip`, `limit`) |
| `GET /api/search?q=지게차` | 사례 찾기 | 번호·개요·기인물 검색 |
| `GET /api/runs` | 적재 이력 | |

응답은 모두 react-force-graph가 바로 받는 `{ nodes: [...], links: [...] }` 형식입니다. 노드의 `group`(case, context, accident, object, hazard, measure)이 색상 키이고, 링크의 `name`이 화살표에 쓸 한글 관계명, `derived`가 점선 여부입니다.

웹페이지 주소가 다르면 `.env`의 `CORS_ORIGINS`에 넣으세요 (예: `http://localhost:5173`).

## 기존 웹페이지에 붙이기

```bash
npm i react-force-graph-2d@1.25.5
```

`web/src/sif/` 폴더를 프로젝트 `src/` 아래에 복사하고, Vite라면 `.env`에 `VITE_SIF_API=http://localhost:8000`을 넣습니다.

다섯 화면을 한 번에 쓰려면:

```tsx
import SifExplorer from './sif/SifExplorer';

<div style={{ height: '100vh' }}>
  <SifExplorer initialCase="SIF-M-0004" />
</div>
```

이미 화면 틀이 있고 그래프만 바꾸려면:

```tsx
import SifGraph from './sif/SifGraph';
import { api } from './sif/api';

const [data, setData] = useState({ nodes: [], links: [] });
useEffect(() => { api.caseGraph('SIF-M-0004').then(setData); }, []);

<SifGraph data={data} mode="case" width={900} height={640}
          persona={1} onNodeClick={(n) => console.log(n)} />
```

`mode`는 `tbox`(클래스 상자 고정 배치), `case`(사례 중심 방사형), `taxonomy`(분류 방사형) 세 가지입니다. `persona`는 `PERSONAS` 순서(0 전체, 1 현장 안전관리자 …)이고, 그 사람에게 핵심인 관계를 주황색으로 강조합니다.

## Neo4j Browser에서 확인

```cypher
// 사례 하나 펼치기 (멘토님 sif-1-4와 같은 사례)
MATCH p=(c:AccidentCase {code:'SIF-M-0004'})-[r]->() WHERE type(r) <> 'LOADED_IN' RETURN p

// 재해종류 상위분류별 사례 수
MATCH (c:AccidentCase)-[:HAS_ACCIDENT_TYPE]->(:AccidentType)-[:BROADER]->(g:AccidentTypeGroup)
RETURN g.name, count(c) ORDER BY count(c) DESC

// 공종별 추락 사례
MATCH (c:AccidentCase)-[:OCCURRED_DURING]->(:UnitWork)-[:BROADER*]->(t:WorkType),
      (c)-[:HAS_ACCIDENT_TYPE]->(:AccidentType {name:'추락'})
RETURN t.name, count(c) ORDER BY count(c) DESC

// 아직 분류되지 않은 값
MATCH (n)-[:BROADER]->(x) WHERE x.name = '미분류' RETURN labels(n)[0], n.name
```

## 그래프 구조 요약

| 라벨 | id 형식 | 비고 |
|---|---|---|
| AccidentCase | `SIF-C-xxxxxxxxxx` | `code`(SIF-C-0002), `summary`, 원본 값 `raw_*`, `sources`(올린 파일 목록) |
| Industry | `IND:S:/M:/L:이름` | 소→중→대 `BROADER` (제조업 등) |
| WorkSituation | `WS:이름` | 제조업 등 |
| UnitWork / Work / WorkType | `UW:` `W:` `WT:` | 단위작업→작업→공종 `BROADER`, `code` 1.1.1 (건설업) |
| AccidentType / AccidentTypeGroup / OfficialForm | `AT:` `ATG:` `OF:` | `BROADER`, `MAPS_TO` |
| CausalObject / ObjectCategory | `CO:` `COC:` | 괄호 하위유형 → 기본 이름 → 분류 |
| HazardFactor / HazardCategory | `HF:` `HC:` | `mentor12` 표시 |
| Measure / ControlLevel | `M:해시` `CL:` | 같은 문장의 대책은 한 노드로 공유 |
| IngestRun | `RUN:날짜:파일` | 적재 이력 (그래프 화면에서는 제외) |

파생 관계 `LEADS_TO`(유발요인→재해종류), `MITIGATES`(대책→유발요인)는 적재할 때마다 `count`와 함께 다시 계산합니다.

## 8. 사고 패턴 (유사 사고 묶음)

같은 **기인물 + 재해종류 + 첫 번째 유발요인**으로 일어난 사고를 하나의 패턴으로 묶고, 패턴마다 대표 사례 2건을 고릅니다. 아카이브 6,032건 기준으로 5건 이상인 패턴 208개가 사례 4,317건(72%)을 묶습니다. 기인물을 알 수 없는 사례(분류 불가 등)는 묶지 않습니다.

```
(:AccidentCase)-[:BELONGS_TO]->(:AccidentPattern {name, size, sectors, topWorks})
(:AccidentPattern)-[:DEFINED_BY {role:'기인물'|'재해종류'|'유발요인'}]->(개념 노드)
(:AccidentPattern)-[:REPRESENTED_BY {rank}]->(:AccidentCase)
```

대표 사례는 `patterns.yaml`의 점수로 고릅니다. 대책이 여러 통제위계에 걸쳐 있고, 공학적 대책이 있고, 재해종류가 원본 값이며, 개요 길이가 카드에 알맞은 사례가 위로 옵니다. 두 번째 대표 사례는 가능하면 업종이나 작업이 다른 것으로 고릅니다. 패턴은 새 자료가 들어올 때마다 전체를 다시 계산합니다 (`load`, `remap` 모두).

| 주소 | 내용 |
|---|---|
| `GET /api/patterns?q=포크레인&sector=C` | 패턴 카드 목록 (큰 패턴부터). `q`는 패턴 이름 또는 용어 사전으로 찾은 개념 |
| `GET /api/patterns/{id}` | 대표 사례의 개요·원인 문장·대책(통제위계 표시), 패턴 전체의 통제위계 분포 |
| `GET /api/patterns/{id}/flow` | 흐름 그래프: 주요 작업 → 기인물 → 유발요인 → 재해종류 → 통제위계 (노드마다 `stage`) |

`--dry-run`이면 `preview/patterns.csv`에 패턴과 대표 사례가 저장되니, 멘토님 검토용으로 쓸 수 있습니다.

## 9. 흐름 강조 (o→o→o)

`<SifGraph>`는 노드에 마우스를 올리거나 누르면, 연결된 이웃만이 아니라 **화살표 방향을 따라 앞뒤로 이어진 경로 전체**를 강조하고 그 경로 위로 입자가 흘러가게 합니다. 사례 노드처럼 모든 곳으로 퍼지는 허브에서는 앞쪽 탐색을 멈춰서, 그래프 전체가 켜지지 않게 했습니다.

`flow` 속성을 켜면 노드를 단계별 열로 세웁니다.

```
사고 → 작업 → 기인물 → 유발요인 → 재해종류 → 예방대책
```

```tsx
<SifGraph data={caseGraph} mode="case" flow width={900} height={600} />   // 사례 하나의 흐름
<SifGraph data={patternFlow} mode="case" flow width={900} height={600} /> // 패턴의 흐름 (/api/patterns/{id}/flow)
```

단계 정의는 `api.ts`의 `FLOW_STAGES`에서 바꿉니다. `<SifExplorer>`에는 "사고 패턴" 탭(카드 한 줄 3개, 원인·대책 패널, 흐름 전체보기 팝업)과 사례 그래프의 "흐름 보기"·"전체보기" 버튼이 추가되어 있습니다.
