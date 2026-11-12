# Backend (FastAPI + Upstage Solar)

## Setup

Run from the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt -r ontology/requirements.txt
cp -n backend/.env.example backend/.env
# Set NEO4J_PASSWORD and the chat API keys in backend/.env
```

The ontology endpoints can run without an Upstage key; `/api/chat` returns 503 until one is configured.

## Local Neo4j

From the repository root, start the database with:

```bash
docker compose --env-file backend/.env up -d
```

The backend connects to `bolt://127.0.0.1:7688`. Open [Neo4j Browser](http://127.0.0.1:7475) and use that same Bolt URL and the credentials in `backend/.env`.

To populate a fresh database, run the ontology loader from the repository root after completing Setup. Both the dotenv command and the loader use the same virtual environment:

```bash
backend/.venv/bin/python -m dotenv -f backend/.env run -- backend/.venv/bin/python ontology/ingest.py check
backend/.venv/bin/python -m dotenv -f backend/.env run -- backend/.venv/bin/python ontology/ingest.py load ontology/SIF_20260401.xlsx
```

## Frontend integration

The frontend uses `/api/health` → `upstage_configured` for provider status.
Conversation history and the sidebar from PR #5 are integrated with the ontology explorer.

## Run

```bash
backend/.venv/bin/python -m uvicorn main:app --app-dir backend --reload --port 8000
```

## Verify

```bash
curl http://127.0.0.1:8000/api/health

curl -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "크레인과 연결된 위험요인은?", "history": []}'
```

## SIF chat agents

Both agents answer from the construction records in `ontology/SIF_20260401.xlsx`.
The ontology agent reads Neo4j and counts matching construction cases. The vector
agent retrieves similar cases by cosine similarity and describes the scope of its
search when asked for corpus-wide counts. The chat offers either agent or both in
parallel, with separate histories in comparison mode.

Configure the generation and embedding settings in `backend/.env`. The index
builder sends construction passages to Upstage for embedding. The chat service
sends the question and retrieved evidence to Upstage to generate a response.

From the repository root, build the
vector index before using vector chat:

```bash
backend/.venv/bin/python backend/vector_index.py
```

The index and reusable embedding batches are stored in `local-db/`. Rebuild
after changing the workbook or embedding models. Start the backend as above and
run `npm run dev` from the repository root for the frontend.
