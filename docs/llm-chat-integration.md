# LLM 채팅 연동 — 진행상황 및 실행 가이드

업데이트: 2026-10-08

## 요약

ChatPanel의 더미(mock) 응답을 실제 LLM API 응답으로 교체했습니다. 프론트엔드가 LLM을 직접 호출하지 않고, 경량 FastAPI 백엔드를 거치도록 구성했습니다 (API 키를 브라우저에 노출하지 않기 위함). 처음에는 Google Gemini로 연동했다가, 이후 **Upstage AI의 Solar API**로 교체했습니다.

```
React (Vite :5173) --fetch('/api/chat')--> Vite proxy --> FastAPI (:8000) --> Upstage Solar API
```

- Vite dev server의 `server.proxy`가 `/api/*` 요청을 `http://127.0.0.1:8000`으로 포워딩합니다. 브라우저 입장에서는 same-origin이라 CORS 문제가 없습니다.
- API 키는 `backend/.env`에만 존재하고 git에 올라가지 않습니다 (`.gitignore`에 이미 `.env`, `.env.*` 패턴이 있어 `backend/` 하위에도 적용됩니다).
- Upstage Solar는 OpenAI SDK와 호환되는 방식(`base_url` 오버라이드)으로 제공되어, `openai` 패키지로 그대로 호출합니다.

## ⚠️ 팀원 조치 필요: 의존성 패키지 변경 (`backend/requirements.txt`)

최근 커밋에서 LLM 프로바이더를 Gemini → Upstage Solar로 교체하면서 `backend/requirements.txt`의 패키지 구성이 바뀌었습니다.

| 변경 | 이전 | 이후 |
| --- | --- | --- |
| LLM SDK | `google-genai` (제거) | `openai` (신규 추가) |
| 나머지 패키지 | `fastapi`, `uvicorn[standard]`, `python-dotenv` | 동일 (변경 없음) |

Upstage Solar API는 OpenAI SDK와 호환되는 방식(`base_url` 오버라이드)으로 제공되기 때문에, Gemini 전용 SDK였던 `google-genai`를 걷어내고 범용 `openai` 패키지로 교체했습니다.

**기존에 `backend/.venv`를 이미 만들어서 쓰고 있던 사람(또는 AI 에이전트)은 반드시 아래 작업을 해야 합니다:**

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt   # openai 설치, google-genai는 자동 정리되지 않으니 필요시 pip uninstall google-genai
```

- `pip install -r requirements.txt`만 돌리면 `openai`는 새로 설치되지만, 기존에 깔려 있던 `google-genai`는 자동으로 제거되지 않습니다. 완전히 깨끗한 환경을 원하면 `pip uninstall google-genai` 후 재설치하거나, venv를 통째로 재생성하세요:
  ```bash
  rm -rf .venv
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  ```
- `.env` 파일도 `GEMINI_API_KEY`/`GEMINI_MODEL`이 아니라 `UPSTAGE_API_KEY`/`UPSTAGE_MODEL`을 사용하도록 바뀌었습니다. `.env.example`을 참고해 키 이름을 맞춰주세요 (값은 각자의 Upstage API 키로 교체).
- AI 코딩 에이전트(Claude, Cursor 등)에게 백엔드 작업을 시킬 때도 이 변경사항을 인지시켜야 합니다 — 과거 대화 기록이나 캐시된 컨텍스트에 `google-genai` 기반 코드가 남아있다면 혼동할 수 있으니, 이 문서(`docs/llm-chat-integration.md`)와 `backend/main.py`를 최신 기준으로 다시 읽게 하세요.

## Git 브랜치 현황

- `main` — 프론트엔드 작업이 머지된 최신 상태.
- `backend/upstage-chat-api` — 이번 작업 브랜치. 원래 `backend/gemini-chat-api`였으나, PR/머지 전에 Gemini → Upstage로 교체하면서 브랜치 이름도 함께 바꿨습니다.
- 브랜치 네이밍 컨벤션: `<영역>/<작업 설명>` 형태 (예: `backend/upstage-chat-api`, `frontend/graph-filter`).
- 전략: `main`은 항상 동작하는 상태로 유지하고, 기능 단위로 짧은 브랜치를 파서 작업 후 `main`에 머지하는 단순 feature-branch 방식을 씁니다.

## 변경된 파일

| 파일 | 내용 |
| --- | --- |
| `backend/main.py` | FastAPI 앱. `POST /api/chat`, `GET /api/health` 엔드포인트. `openai` SDK(`base_url=https://api.upstage.ai/v1`)로 Upstage Solar 호출 |
| `backend/requirements.txt` | `fastapi`, `uvicorn[standard]`, `openai`, `python-dotenv` |
| `backend/.env.example` | `UPSTAGE_API_KEY`, `UPSTAGE_MODEL` 환경변수 템플릿 |
| `backend/README.md` | 백엔드 단독 실행/검증 커맨드 |
| `vite.config.js` | `/api` → `http://127.0.0.1:8000` 프록시 |
| `src/components/ChatPanel.jsx` | 실제 `fetch('/api/chat')` 호출. 로딩 표시, 에러 메시지, 멀티턴 history 전송 (프로바이더 교체와 무관하게 변경 없음) |
| `src/data/mockData.js` | mock 채팅 응답 함수 제거 (그래프 관련 데이터는 유지) |

## 실행 방법 (macOS/zsh)

### 1. 백엔드

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env 파일을 열어 UPSTAGE_API_KEY=<자신의 Upstage API 키>로 수정
```

Upstage API 키는 [Upstage Console](https://console.upstage.ai)에서 발급받습니다.

백엔드 실행:

```bash
uvicorn main:app --reload --port 8000
```

단독 검증:

```bash
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "크레인과 연결된 위험요인은?", "history": []}'
```

### 2. 프론트엔드

새 터미널에서:

```bash
npm install   # 최초 1회
npm run dev
```

브라우저에서 `http://localhost:5173` (포트가 사용 중이면 Vite가 자동으로 다음 포트를 사용) 접속 후 채팅 테스트.

## 모델 선택 관련 참고사항

`solar-pro2`가 실제 키로 바로 정상 동작함을 확인했습니다 (2026-10-08). Gemini 때처럼 모델명 트러블슈팅이 필요하지 않았습니다. `.env.example`의 기본값(`solar-pro2`)을 그대로 유지하면 됩니다. 추후 Upstage가 모델을 deprecate하면 `solar-pro3`, `solar-mini` 등으로 교체를 시도해볼 것.

## 검증 완료 항목

- [x] 백엔드 단독 기동 및 `/api/health`, `/api/chat` curl 테스트 — `solar-pro2`로 정상 응답 확인
- [x] Vite 프록시를 통한 `/api/chat` 호출 정상 동작
- [x] 멀티턴 대화 컨텍스트(이전 답변 참조 질문) 정상 반영 확인
- [x] 백엔드 중단 시 프론트엔드 에러 메시지 정상 표시 (502 → "답변을 가져오지 못했습니다")
- [x] `npm run build`, `npm run lint` 통과

## 다음 작업 후보

- `requirements.txt` 버전 고정 (현재는 미고정)
- 전역 CSS 정리 (가로 스크롤, 다크모드 대비 — `docs/development-review.md` 참고)
- 메뉴 전환 시 채팅 상태 유지
- FastAPI에 Neo4j / Knowledge Graph 연동 추가
