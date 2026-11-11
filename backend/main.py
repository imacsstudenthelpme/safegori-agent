import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

import graph
from fastapi.responses import JSONResponse
from neo4j.exceptions import Neo4jError, ServiceUnavailable
from ontology_api import router as ontology_router

load_dotenv()

API_KEY = os.getenv("UPSTAGE_API_KEY")
MODEL_NAME = os.getenv("UPSTAGE_MODEL", "solar-pro2")

# Upstage 키가 없어도 온톨로지 API는 사용할 수 있습니다. 채팅만 503을 돌려줍니다.
client = OpenAI(api_key=API_KEY, base_url="https://api.upstage.ai/v1") if API_KEY else None
last_chat_success = None

app = FastAPI(title="SafeGori API (chat + ontology)")
app.include_router(ontology_router)


@app.exception_handler(ServiceUnavailable)
@app.exception_handler(Neo4jError)
async def neo4j_error(_request, exc):
    """Neo4j가 꺼져 있거나 인증이 틀리면 온톨로지 API도 503으로 알려 줍니다."""
    return JSONResponse(status_code=503, content={"detail": f"Neo4j 연결 실패: {exc}"})

# The Vite dev-server proxy (see vite.config.js) is the primary mechanism that
# keeps the browser same-origin, so this middleware only matters for direct
# calls (e.g. the /docs page) or if the proxy config ever gets removed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    answer: str


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    global last_chat_success
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="message is required")
    if client is None:
        raise HTTPException(status_code=503, detail="UPSTAGE_API_KEY가 설정되지 않았습니다 (backend/.env)")

    messages = [{"role": turn.role, "content": turn.content} for turn in request.history]
    messages.append({"role": "user", "content": question})

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail="Upstage request failed."
        ) from exc

    answer = response.choices[0].message.content if response.choices else None
    if not answer:
        raise HTTPException(status_code=502, detail="Upstage returned an empty response")

    last_chat_success = datetime.now(timezone.utc).isoformat()
    return ChatResponse(answer=answer)


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "upstage_configured": bool(API_KEY),
            "last_chat_success": last_chat_success}


# ---------------------------------------------------------------------------
#새로 추가한  Neo4j 지식그래프 API
# ---------------------------------------------------------------------------

def _neo4j_call(fn, *args):
    """Neo4j가 꺼져 있거나 비밀번호가 틀리면 503으로 알려주기."""
    try:
        return fn(*args)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Neo4j 연결 실패: {exc}") from exc


@app.get("/api/graph/health")
def graph_health():
    _neo4j_call(graph.ping)
    return {"status": "ok", "neo4j": "connected"}


@app.get("/api/objects")
def objects():
    """왼쪽/툴바 선택용 기인물 목록 (사례 수 많은 순)."""
    return _neo4j_call(graph.object_list)


@app.get("/api/graph/object/{name}")
def object_graph(name: str, per_type: int = 6):
    """기인물 중심 그래프 {nodes, links}."""
    result = _neo4j_call(graph.object_graph, name, per_type)
    if result is None:
        raise HTTPException(status_code=404, detail=f"'{name}' 기인물을 찾을 수 없습니다")
    return result


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str):
    result = _neo4j_call(graph.case_detail, case_id)
    if result is None:
        raise HTTPException(status_code=404, detail="사례를 찾을 수 없습니다")
    return result
