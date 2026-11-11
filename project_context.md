# Capstone Front-end 개발 컨텍스트 정리

## 1. 프로젝트 개요

이 프로젝트는 **온톨로지 기반 산업재해 예방 AI Agent**를 구현하는 캡스톤 프로젝트이다.

최종 목표는 산업재해 관련 데이터를 온톨로지와 Knowledge Graph로 구조화하고, 사용자가 자연어로 질문하면 AI Agent가 관련 관계와 경로를 탐색하여 사고 원인, 위험요인, 예방대책 등을 답변하는 웹서비스를 만드는 것이다.

현재 프론트엔드 쪽에서는 **React 기반 UI를 먼저 구현**하고 있으며, 우선순위는 아래와 같다.

- 좌측 Sidebar
- 우측 Chat UI
- 이후 Knowledge Graph 시각화
- 이후 FastAPI 연동
- 이후 LLM API 연동
- 이후 Neo4j 및 Graph RAG 연동

예정 기술 스택:

- Front-end: React
- Graph visualization: react-force-graph
- Back-end: Python, FastAPI
- LLM: OpenAI ChatGPT API 또는 Upstage
- Graph DB: Neo4j
- 추후 Graph RAG / Ontology 연동

---

## 2. 현재까지 진행한 작업

### 2.1 Node.js / npm 설치

처음에는 아래 명령어가 모두 `command not found` 상태였다.

```bash
node -v
npm -v
```

따라서 Homebrew를 통해 Node.js를 설치했다.

설치 후에는 Node.js 및 npm 사용 가능 상태가 되었다.

현재 확인된 Node 버전:

```text
v26.10.0
```

---

### 2.2 Vite + React 프로젝트 생성

아래 명령으로 React 프로젝트를 생성했다.

```bash
npm create vite@latest safety-agent-web -- --template react
```

Vite 생성 과정에서:

```text
Which linter to use?
```

질문에는 `Oxlint`를 선택했다.

이후:

```text
Install with npm and start now?
```

질문에는 `Yes`를 선택했다.

React 기본 페이지가 아래 주소에서 정상적으로 표시되는 것까지 확인했다.

```text
http://localhost:5173/
```

---

## 3. 초기 React 프로젝트 구조

처음 생성된 구조는 대략 다음과 같았다.

```text
safety-agent-web/
├── index.html
├── node_modules/
├── package.json
├── package-lock.json
├── public/
├── src/
│   ├── App.css
│   ├── App.jsx
│   ├── assets/
│   ├── index.css
│   └── main.jsx
├── README.md
└── vite.config.js
```

추후 아래와 같은 Component 구조를 만들기로 했다.

```text
src/
├── components/
│   ├── Sidebar.jsx
│   └── ChatPanel.jsx
├── App.css
├── App.jsx
├── index.css
└── main.jsx
```

---

## 4. Sidebar 설계

초기 Sidebar 메뉴는 아래와 같이 계획했다.

```text
AI 질의
지식 그래프
사고 사례
비교 실험
설정
```

기능 의미:

- `AI 질의`
  - 산업재해 관련 자연어 질의
  - 추후 LLM 및 Agent와 연결

- `지식 그래프`
  - Neo4j의 관계 데이터를 시각화
  - `react-force-graph` 사용 예정

- `사고 사례`
  - 산업재해 사례 목록 및 검색

- `비교 실험`
  - Keyword Search
  - Vector RAG
  - Knowledge Graph
  - Ontology + KG + RAG
  - 추후 방식별 결과 비교용

- `설정`
  - 향후 모델/API 등의 설정용

현재 MVP에서는 실제로 `AI 질의`, `지식 그래프` 정도만 동작시키고 나머지는 빈 페이지로 둬도 된다.

---

## 5. React 기본 Component 코드 방향

### 5.1 Sidebar.jsx

위치:

```text
src/components/Sidebar.jsx
```

예정 코드 형태:

```jsx
function Sidebar({ selectedMenu, onSelectMenu }) {
  const menus = [
    { id: "chat", label: "AI 질의" },
    { id: "graph", label: "지식 그래프" },
    { id: "cases", label: "사고 사례" },
    { id: "experiment", label: "비교 실험" },
    { id: "settings", label: "설정" },
  ];

  return (
    <aside className="sidebar">
      <div className="logo">
        Safety Agent
      </div>

      <nav className="menu">
        {menus.map((menu) => (
          <button
            key={menu.id}
            className={
              selectedMenu === menu.id
                ? "menu-item active"
                : "menu-item"
            }
            onClick={() => onSelectMenu(menu.id)}
          >
            {menu.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
```

---

### 5.2 ChatPanel.jsx

위치:

```text
src/components/ChatPanel.jsx
```

초기에는 LLM을 붙이지 않고 UI만 구현하기로 했다.

예정 코드 형태:

```jsx
function ChatPanel() {
  return (
    <div className="chat-container">
      <div className="chat-header">
        산업재해 예방 AI Agent
      </div>

      <div className="messages">
        <div className="message assistant">
          산업재해 관련 질문을 입력해주세요.
        </div>
      </div>

      <div className="chat-input">
        <input
          type="text"
          placeholder="산업재해 관련 질문을 입력하세요..."
        />

        <button>전송</button>
      </div>
    </div>
  );
}

export default ChatPanel;
```

---

### 5.3 App.jsx

초기 UI 확인용 구조:

```jsx
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import "./App.css";

function App() {
  return (
    <div className="app">
      <Sidebar />

      <main className="main-content">
        <ChatPanel />
      </main>
    </div>
  );
}

export default App;
```

추후 `useState()`를 사용하여 Sidebar 메뉴 선택 기능을 추가할 예정이다.

---

## 6. CSS 초기 구성

`src/App.css`에서 아래와 같은 형태로 레이아웃을 구성하려고 했다.

핵심 구조:

```text
전체 화면
├── Sidebar (약 240px)
└── Main Content
    └── Chat Panel
```

화면은 기본적으로:

```text
┌──────────────┬────────────────────────────────────┐
│ Safety Agent │ 산업재해 예방 AI Agent             │
│              │                                    │
│ AI 질의      │                                    │
│ 지식 그래프  │           Chat messages            │
│ 사고 사례    │                                    │
│ 비교 실험    │                                    │
│ 설정         │                                    │
│              │ [질문 입력.............] [전송]   │
└──────────────┴────────────────────────────────────┘
```

형태를 목표로 한다.

---

## 7. Vite 개발 서버 사용법

React 개발 서버 실행:

```bash
npm run dev
```

정상적으로 실행되면:

```text
VITE v8.x.x ready

Local: http://localhost:5173/
```

형식으로 나타난다.

브라우저에서 아래 주소로 UI를 확인한다.

```text
http://localhost:5173/
```

### 중요

`npm run dev` 실행 후 터미널이 아래 상태라면:

```text
VITE ready

Local: http://localhost:5173/
press h + enter to show help
```

해당 터미널은 Vite 서버 프로세스가 사용하고 있다.

이 상태에서 일반 쉘 명령어를 사용하려면 새 터미널을 열어야 한다.

예:

```text
Terminal 1
npm run dev

Terminal 2
git
ls
pwd
npm install
...
```

---

## 8. 프로젝트 폴더 이동

원래 프로젝트 위치는 다음과 같았다.

```text
~/safety-agent-web
```

이후 Git 기반 개발을 위해 프로젝트 파일 전체를 다른 폴더로 이동했다.

현재 확인된 위치:

```text
/Users/jiwonkim/capstone
```

현재 해당 폴더에서:

```bash
ls
```

실행 시:

```text
index.html
package-lock.json
public
src
node_modules
package.json
README.md
vite.config.js
```

가 보이는 상태이다.

따라서 현재 `/Users/jiwonkim/capstone`이 Vite 프로젝트 root로 사용되고 있다.

---

# 9. 폴더 이동 후 실제 발생한 오류

폴더 이동 이후 아래 명령을 실행했다.

```bash
npm run dev
```

그러나 아래 오류가 발생했다.

```text
Error [ERR_MODULE_NOT_FOUND]:
Cannot find module '/Users/jiwonkim/capstone/node_modules/dist/node/cli.js'
imported from
/Users/jiwonkim/capstone/node_modules/.bin/vite
```

Node 버전:

```text
Node.js v26.10.0
```

이 오류는 폴더 이동 과정에서 `node_modules` 내부 실행 링크 또는 패키지 경로가 꼬였을 가능성이 높다.

`node_modules`는 프로젝트 소스가 아니라 로컬 환경에 설치되는 dependency 집합이므로, 프로젝트 위치를 바꾼 경우 새 위치에서 다시 설치하는 것이 가장 안전하다.

기본 복구 절차:

```bash
rm -rf node_modules
npm install
npm run dev
```

그래도 해결되지 않으면:

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

두 번째 방법은 dependency lock도 다시 생성하는 방식이므로 첫 번째 방법보다 강한 초기화이다.

가능하면 우선 `package-lock.json`은 유지하고 `node_modules`만 다시 설치하는 것을 권장한다.

---

# 10. 폴더 이동 후 반드시 점검할 항목

아래 내용은 Codex가 작업 시작 전에 명시적으로 확인하는 것이 좋다.

## 10.1 현재 Working Directory

현재 터미널이 반드시 프로젝트 root인지 확인:

```bash
pwd
```

예상:

```text
/Users/jiwonkim/capstone
```

이어서:

```bash
ls
```

했을 때 최소한 아래가 보여야 한다.

```text
package.json
src
vite.config.js
```

---

## 10.2 node_modules 재설치 여부

폴더를 통째로 이동했다면 기존 `node_modules`를 신뢰하지 않는 것이 좋다.

권장:

```bash
rm -rf node_modules
npm install
```

이후:

```bash
npm run dev
```

---

## 10.3 .gitignore 확인

Git에는 `node_modules`를 올리면 안 된다.

`.gitignore`에 최소한 아래가 포함되어 있어야 한다.

```gitignore
node_modules
dist
.env
.env.*
.DS_Store
```

단, `.env.example`을 사용할 예정이라면 아래처럼 예외를 둘 수 있다.

```gitignore
.env
.env.*
!.env.example
```

---

## 10.4 node_modules가 이미 Git에 추적되고 있는 경우

`.gitignore`에 `node_modules`를 추가해도 이미 Git index에 올라간 파일은 계속 추적될 수 있다.

확인:

```bash
git status
```

만약 `node_modules`가 추적되고 있다면:

```bash
git rm -r --cached node_modules
```

이후 commit 한다.

---

## 10.5 package.json의 script 확인

아래 명령:

```bash
cat package.json
```

`script`에 최소한 아래가 존재해야 한다.

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

`npm run dev`는 여기의 `vite` script를 실행한다.

---

## 10.6 잘못된 절대 경로 import 확인

프로젝트 폴더를 이동할 때 소스 코드에 절대 경로가 박혀 있으면 깨질 수 있다.

예를 들어 다음과 같은 코드는 피해야 한다.

```jsx
import Sidebar from "/Users/jiwonkim/safety-agent-web/src/components/Sidebar";
```

대신:

```jsx
import Sidebar from "./components/Sidebar";
```

처럼 상대 경로 또는 alias를 사용해야 한다.

현재 작성했던 React 코드는 상대 경로 사용을 전제로 한다.

---

## 10.7 환경변수 파일 경로

추후 LLM API 연동 시 `.env` 또는 backend `.env`를 사용할 예정이다.

폴더를 이동하면 기존 `.env`가 누락됐는지 확인해야 한다.

특히 API key는 절대로 React source에 직접 작성하지 않는다.

잘못된 방식:

```js
const OPENAI_API_KEY = "sk-...";
```

권장 구조:

```text
React
  ↓
FastAPI
  ↓
OpenAI / Upstage
```

API key는 backend 환경변수에서만 관리한다.

---

## 10.8 Vite 캐시 문제

간혹 폴더 이동이나 dependency 변경 후 Vite cache가 꼬일 수 있다.

필요 시:

```bash
rm -rf node_modules/.vite
npm run dev
```

일반적으로 `node_modules` 전체 재설치 시 같이 해결된다.

---

## 10.9 package-lock.json과 dependency 불일치

`package.json`은 변경됐는데 `package-lock.json`이 오래된 상태라면 dependency 설치에서 이상이 생길 수 있다.

일반적인 해결:

```bash
npm install
```

심각하게 꼬였을 경우:

```bash
rm -rf node_modules package-lock.json
npm install
```

---

## 10.10 Node 버전 호환성

현재 사용 중인 Node 버전은:

```text
v26.10.0
```

이 버전은 상당히 최신 버전이다.

Vite와 대부분의 package가 정상 작동할 가능성이 높지만, 추후 일부 package가 Node 26을 아직 공식 지원하지 않는 경우 compatibility 문제가 발생할 수 있다.

만약 dependency install 과정에서 Node version 관련 오류가 발생하면 LTS 버전으로 변경하는 것을 고려한다.

예:

```text
Node 22 LTS
```

단, 현재 오류는 Node 버전 문제보다는 프로젝트 폴더 이동 후 `node_modules`가 깨진 문제로 보는 것이 우선이다.

---

# 11. Git으로 이동 후 권장 초기 점검 절차

Codex가 개발을 시작하기 전에 아래 순서로 점검하는 것을 권장한다.

```bash
pwd
ls
git status
cat package.json
```

그 다음 dependency를 깨끗하게 재설치:

```bash
rm -rf node_modules
npm install
```

개발 서버 실행:

```bash
npm run dev
```

정상 확인:

```text
http://localhost:5173/
```

---

# 12. Git 저장소 추천 상태

프로젝트 root:

```text
capstone/
├── .git/
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── vite.config.js
├── public/
└── src/
```

`node_modules/`는 로컬에는 존재하지만 Git에는 포함하지 않는다.

---

# 13. 향후 Front-end 권장 구조

현재 Component가 늘어날 예정이므로 아래와 같이 정리하는 것이 좋다.

```text
src/
├── components/
│   ├── Sidebar.jsx
│   ├── ChatPanel.jsx
│   └── GraphView.jsx
│
├── pages/
│   ├── ChatPage.jsx
│   └── GraphPage.jsx
│
├── api/
│   └── client.js
│
├── App.jsx
├── App.css
├── index.css
└── main.jsx
```

초기에는 `pages/`, `api/`를 만들 필요 없이 간단하게 시작해도 된다.

---

# 14. Front-end 개발 단계

권장 순서:

```text
1. React/Vite 정상 실행
2. Sidebar 구현
3. ChatPanel 구현
4. CSS 레이아웃
5. Sidebar 메뉴 선택 기능
6. 채팅 input state 구현
7. 사용자 메시지 화면 출력
8. react-force-graph-2d 설치
9. Dummy graph 렌더링
10. FastAPI backend 생성
11. React → FastAPI fetch 연동
12. OpenAI 또는 Upstage LLM 연결
13. Neo4j 연결
14. FastAPI에서 answer + graph 반환
15. React에서 답변 + Knowledge Graph 동시 표시
```

현재는 대략 1~4단계 근처를 진행 중이다.

LLM API는 아직 연결하지 않았다.

---

# 15. react-force-graph 예정

추후 Front-end graph 시각화에는 아래 패키지를 사용할 예정이다.

```bash
npm install react-force-graph-2d
```

기본 데이터 형태:

```js
const graphData = {
  nodes: [
    { id: "크레인" },
    { id: "낙하 위험" },
    { id: "안전모 착용" }
  ],

  links: [
    {
      source: "크레인",
      target: "낙하 위험"
    },
    {
      source: "낙하 위험",
      target: "안전모 착용"
    }
  ]
};
```

향후 backend가 다음처럼 데이터를 반환하도록 설계하는 것이 좋다.

```json
{
  "answer": "크레인 작업에서 주요 위험은 ...",
  "sources": [],
  "graph": {
    "nodes": [],
    "links": []
  }
}
```

이 구조라면 React에서는 LLM 제공자가 OpenAI인지 Upstage인지 몰라도 된다.

---

# 16. 예정 Backend 구조

최종 구조는 다음을 목표로 한다.

```text
User
  ↓
React
  ↓
FastAPI
  ↓
AI Agent
  ├── LLM
  └── Neo4j
       ↓
Knowledge Graph
```

React에서 OpenAI API를 직접 호출하지 않는다.

이유:

- 브라우저에 API key 노출 가능
- Agent 로직 관리 어려움
- Neo4j 연동 로직이 Front-end로 새어나감
- LLM 제공자 변경 시 Front-end까지 수정해야 함

따라서:

```text
React
POST /api/chat
  ↓
FastAPI
  ↓
OpenAI / Upstage / Neo4j
```

구조로 유지한다.

---

# 17. 중요한 개발 원칙

## Front-end

React는 화면 렌더링과 사용자의 입력만 담당한다.

예:

```json
POST /api/chat

{
  "message": "크레인 작업의 주요 위험요인은?"
}
```

---

## Back-end

FastAPI가 아래를 담당한다.

```text
질문 수신
↓
Agent 처리
↓
Neo4j Query
↓
LLM 응답 생성
↓
React에 결과 반환
```

---

## API 응답

초기:

```json
{
  "answer": "..."
}
```

최종:

```json
{
  "answer": "...",
  "sources": [],
  "graph": {
    "nodes": [],
    "links": []
  }
}
```

---

# 18. 현재 Codex가 우선 확인해야 할 내용

개발 시작 전 아래 항목부터 확인할 것.

1. 현재 프로젝트 root가 `/Users/jiwonkim/capstone`인지
2. `package.json`이 정상인지
3. `node_modules`가 이동 전 상태 그대로인지
4. `npm install`이 새 root에서 정상 완료되는지
5. `npm run dev`가 정상 동작하는지
6. `.gitignore`에 `node_modules`, `.env`, `dist`가 포함돼 있는지
7. 현재 `src` 내부 코드가 어느 단계까지 작성됐는지
8. 기존 import에 절대 경로가 있는지
9. Vite 기본 CSS가 React UI를 방해하고 있지 않은지
10. Git branch와 working tree 상태가 어떤지

특히 현재까지 가장 명시적인 known issue는:

```text
폴더 이동 이후 기존 node_modules의 vite 실행 경로가 깨져
ERR_MODULE_NOT_FOUND가 발생함
```

이다.

따라서 Codex는 가장 먼저 아래 복구 과정을 검토해야 한다.

```bash
rm -rf node_modules
npm install
npm run dev
```

---

# 19. 현재 목표

지금 당장은 LLM 또는 Neo4j 연동보다 Front-end UI를 먼저 완성한다.

1차 목표 화면:

```text
┌──────────────┬────────────────────────────────────┐
│ Safety Agent │ 산업재해 예방 AI Agent             │
│              │                                    │
│ AI 질의      │                                    │
│ 지식 그래프  │            Chat                    │
│ 사고 사례    │                                    │
│ 비교 실험    │                                    │
│ 설정         │                                    │
│              │ [질문 입력.............] [전송]   │
└──────────────┴────────────────────────────────────┘
```

그 다음:

```text
Sidebar 메뉴 전환
↓
Chat state
↓
Graph 시각화
↓
FastAPI
↓
LLM
↓
Neo4j
```

순서로 개발한다.

---

# 20. 한 줄 요약

현재 프로젝트는 **Vite + React 기반 Front-end 초기 UI를 구성하는 단계**이며, 프로젝트를 `/Users/jiwonkim/capstone`으로 이동한 이후 기존 `node_modules`의 Vite 경로가 깨져 `ERR_MODULE_NOT_FOUND`가 발생한 상태이므로, 새 위치에서 dependency를 재설치한 뒤 UI 개발을 이어가는 것이 우선이다.
