# 개발 검토 및 인수인계

검토일: 2026-10-01. 범위: 프로젝트 소스, 의존성, Git 상태, 실행 환경.

## 요약 문서와 실제 상태

실제 구현은 요약의 1~4단계보다 진행된 7단계 수준이다. 사이드바 메뉴 선택, 입력 상태, 사용자 메시지 출력이 이미 있다. 그래프 라이브러리, FastAPI, LLM, Neo4j는 없으며 AI 메시지는 최초 안내 문구뿐이다. 소스와 Vite 설정에서 이동 전 절대 경로 import는 발견되지 않았다.

검토 시작 당시 브랜치는 `front-end`, 커밋은 `e89c7d0 Initial commit`이었다. Git 추적 파일은 `.gitignore`, `README.md` 두 개뿐이고 나머지 앱 소스는 미추적 상태였다. 개발 파일이 로컬에 존재하는 것과 Git에 저장된 것은 다르므로, 이후 검토된 변경을 명시적으로 커밋해야 한다.

## 발견 사항

| 우선순위 | 위치 | 문제 및 영향 | 다음 작업 완료 조건 |
| --- | --- | --- | --- |
| 높음·복구 완료 | `node_modules/.bin` | Vite와 Oxlint 실행 파일이 심볼릭 링크가 아닌 일반 파일로 남아 상대 import 경로 오류 발생 | 재설치 후 build/lint와 개발 서버 실행 성공 |
| 높음·정리 완료 | `.gitignore` | `node_modules` 제외 누락. Git 상태에 의존성이 나타나고 린터도 의존성 코드 검사 | 의존성 제외 및 소스 lint 정상 완료 |
| 중간 | `src/index.css:57`, `src/App.css:16` | 부모 `#root`는 1126px 중앙 정렬, 자식 `.app`은 100vw. 넓은 화면에서 우측 넘침이 생길 구조이며 중앙 텍스트 정렬도 상속됨 | 전역 스타일 정리 후 넓은/좁은 화면에서 가로 넘침 없음 |
| 중간 | `src/index.css:20`, `src/index.css:33` | 자동 다크 테마와 App.css의 흰색 고정 배경이 혼재. 글자·입력 필드 대비 문제 가능 | 운영체제 밝은/어두운 설정 모두 확인 |
| 중간 | `src/App.jsx:18`, `src/components/ChatPanel.jsx:4` | 다른 메뉴 이동 시 ChatPanel이 제거되어 돌아오면 입력과 대화가 초기화됨 | 같은 세션의 메뉴 왕복에서 대화 유지 |
| 중간 | `src/components/ChatPanel.jsx:48` | Enter 처리에 IME 조합 상태 확인 없음. 한글 확정 Enter가 전송으로 처리될 가능성 | 실제 한글 IME에서 조합 확정과 전송 구분 |
| 낮음 | `src/components/ChatPanel.jsx:32` | 새 메시지 추가 시 자동 스크롤 없음 | 긴 대화에서 새 메시지 확인 가능 |
| 낮음 | `src/components/ChatPanel.jsx:44`, `index.html:2` | 입력의 명시적 접근성 이름이 없고 문서 언어는 en | 입력 라벨과 한국어 lang 적용 |

화면 관련 항목은 코드 검토 결과이며 브라우저 시각 검증과 실제 IME 테스트는 아직 하지 않았다. 이번 작업에서는 기능 소스를 수정하지 않았다.

## 이번 준비 작업

- 기존 `package-lock.json`을 유지하고 로컬 npm 캐시로 의존성을 재설치했다.
- 실행 명령: `npm ci --offline --cache /Users/jiwonkim/.npm --ignore-scripts --no-audit --no-fund`.
- `.gitignore`에 `node_modules/`, `.env.*`, `.env.example` 예외, `.DS_Store`를 추가했다. 기존 `dist/`, `.env` 제외는 유지했다.
- README에 실행·검증 명령과 현재 상태를 기록했다.
- 원본 대화 요약과 기능 코드는 보존했다. 커밋·푸시는 수행하지 않았다.

## 검증 결과

- `npm run build`: 성공, Vite 8.3.1, 19개 모듈 변환.
- `.gitignore` 보완 후 `npm run lint`: 성공, 진단 출력 없음.
- `git diff --check`: 성공.
- `git check-ignore`: 의존성, 빌드 결과, `.env.local` 제외 확인.
- 개발 서버: 샌드박스의 포트 제한으로 첫 실행은 실패했으나 권한 승인 후 정상 시작. 주소는 `http://127.0.0.1:5173/`.
- 브라우저 상호작용 및 시각 검증은 미실시. 자동화 테스트 스크립트 없음.

## 다음 개발 단위

첫 작업은 UI 기반 안정화다. 전역 CSS 정리, 상위 상태로 채팅 보존, IME 처리, 접근성 및 스크롤을 개선한다. 완료 시 메뉴 왕복, 공백 입력, 한글 입력, 긴 대화, 모바일 폭, 다크 모드를 확인하고 lint/build를 통과시킨다.

그 다음 더미 그래프 화면을 만들고 FastAPI 계약을 확정한다. 이전 요약의 `POST /api/chat` 및 `{ answer, sources, graph: { nodes, links } }` 형식은 제안 상태이며 아직 구현된 API가 아니다. API 키와 Neo4j 접속 정보는 백엔드에서만 관리한다.
