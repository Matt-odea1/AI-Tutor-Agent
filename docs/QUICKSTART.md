# Quickstart

## Prerequisites

- Python 3.13+
- Node.js 20+
- A configured `.env` at repo root (copy from `.env.example`)

Backend integrations vary by feature: Neo4j, AWS Bedrock, Deepgram, DynamoDB.

## 1) Backend

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your credentials
python app.py
```

- API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

### Local Neo4j (optional)

```bash
docker-compose up -d   # starts Neo4j on ports 7474 (browser) and 7687 (bolt)
```

## 2) Frontends

Each frontend is a standalone Vite + React app. From the repo root:

```bash
# Main chat + code editor
cd ai-tutor-frontend && npm install && npm run dev     # port 5173

# Instructor dashboard
cd oral-assessment-instructor && npm install && npm run dev   # port 5175

# Student assessment
cd oral-assessment-student && npm install && npm run dev      # port 5176
```

All three connect to the backend at `http://localhost:8000` in dev mode.

## 3) Tests

```bash
# Backend (from repo root)
source venv/bin/activate
PYTHONPATH=. pytest tests/ -v

# Frontend (from any frontend dir)
npm run test:run        # single run
npm test                # watch mode

# Full frontend validation (ai-tutor-frontend)
npm run validate        # type-check + lint + format + tests
```

## 4) Common Issues

| Problem | Fix |
|---------|-----|
| Import errors in tests | Set `PYTHONPATH=.` before running pytest |
| Auth-protected routes fail | Confirm frontend sends `Authorization: Bearer <token>` header |
| Vector features fail | Check `NEO4J_*` env vars and that Neo4j is reachable |
| Frontend can't reach backend | Ensure backend is running on port 8000 |

## 5) Key Entry Points

| What | Where |
|------|-------|
| App bootstrap | `app.py` |
| Router composition | `src/main/controllers/` |
| Services | `src/main/service/` |
| Auth | `src/main/auth/` |
| DI container | `src/main/controllers/controller_dependencies.py` |
| Settings | `src/main/config/settings.py` |
| System prompts | `prompts/` |

## 6) Environment Variables

See `.env.example` for the full list. Key groups:

- **AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
- **Neo4j**: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- **Bedrock**: `BEDROCK_MODEL_CHAT`, `BEDROCK_MODEL_EMBED`
- **Auth**: `AUTH_JWT_SECRET`
- **DynamoDB**: `DYNAMODB_TABLE_NAME`, `DYNAMODB_AUTH_USERS_TABLE`
- **Deepgram**: `DEEPGRAM_SECRET_KEY`
- **S3/SQS**: `S3_ASSESSMENT_BUCKET`, `SQS_JOBS_QUEUE_URL`
