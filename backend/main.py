import os
from typing import Literal
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

import graph
import rag
import vector_index
from fastapi.responses import JSONResponse
from neo4j.exceptions import Neo4jError, ServiceUnavailable
from ontology_api import router as ontology_router

load_dotenv()

API_KEY = os.getenv("GENERATION_API_KEY") or os.getenv("UPSTAGE_API_KEY")
MODEL_NAME = os.getenv("GENERATION_API_MODEL") or os.getenv("UPSTAGE_MODEL", "solar-pro4")

# Upstage 키가 없어도 온톨로지 API는 사용할 수 있습니다. 채팅만 503을 돌려줍니다.
client = OpenAI(api_key=API_KEY, base_url=vector_index.BASE_URL, timeout=45, max_retries=1) if API_KEY else None
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
    role: Literal['user', 'assistant']
    content: str = Field(max_length=6000)


class ChatRequest(BaseModel):
    message: str = Field(max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    agent: rag.Agent = 'ontology'


@app.post("/api/chat")
def chat(request: ChatRequest):
    global last_chat_success
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="질문을 입력해 주세요.")
    if client is None:
        raise HTTPException(status_code=503, detail="생성 API 키를 설정해 주세요.")
    try:
        if request.agent == 'vector':
            vector_index.load_index()
        result = rag.answer(client, MODEL_NAME, request.agent, question,
                            [turn.model_dump() for turn in request.history[-10:]])
    except vector_index.IndexUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ServiceUnavailable, Neo4jError) as exc:
        raise HTTPException(status_code=503, detail="Neo4j에 연결하거나 사례를 조회할 수 없습니다.") from exc
    except (OpenAIError, rag.InvalidModelOutput, ValueError) as exc:
        raise HTTPException(status_code=502, detail="검색 또는 답변 생성에 실패했습니다. 다시 시도해 주세요.") from exc
    last_chat_success = datetime.now(timezone.utc).isoformat()
    return result


@app.get("/api/health")
def health():
    try:
        vector_index.load_index()
        vector = 'ready' if os.getenv('EMBEDDING_API_KEY') else 'missing_key'
    except vector_index.IndexUnavailable as exc:
        vector = str(exc)
    return {"status": "ok", "model": MODEL_NAME, "upstage_configured": bool(API_KEY),
            "last_chat_success": last_chat_success, "vector_status": vector}


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
