# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python/FastAPI)
```bash
python app.py                          # Run API server (port 8000)
PYTHONPATH=. pytest tests/ -v          # Run all tests
PYTHONPATH=. pytest tests/service/ -v  # Run service tests only
PYTHONPATH=. pytest tests -q           # Quick test run
```

### Frontend Apps
```bash
# From each directory:
npm run dev          # Start dev server
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run type-check   # tsc --noEmit only
npm run validate     # type-check + lint + format check + tests (ai-tutor-frontend only)
npm test             # Vitest (ai-tutor-frontend only)
npm run test:run     # Vitest run mode (no watch)
```

Dev ports: `ai-tutor-frontend` → 5173, `oral-assessment-instructor` → 5175, `oral-assessment-student` → 5176

### Local Infrastructure
```bash
docker-compose up -d   # Start Neo4j locally (ports 7474, 7687)
```

## Architecture

### System Overview

**Backend**: FastAPI (`app.py`) with strict layering — routers in `src/main/controllers/`, business logic in `src/main/service/`, Pydantic DTOs in `src/main/dtos/`.

**Three frontends** all call the same FastAPI backend at port 8000:
- `ai-tutor-frontend/` — general chat, RAG, in-browser Python editor with Monaco/Pyodide
- `oral-assessment-instructor/` — create assessments, generate questions, view results
- `oral-assessment-student/` — take assessments, record audio, view feedback

### Core Data Flows

**RAG Chat**: User message → `/internal/history/views/{id}/message` → `ChatService` → `ContextVectorService` (Neo4j vector search) → Bedrock Nova Lite → response with sources

**Question Generation**: Instructor uploads code/brief → `/internal/questions/generate` → `QuestionGenerationService` → Bedrock → CSV of questions

**Oral Assessment**: Student records audio → uploads to S3 (presigned URL) → `/internal/assessment/submit` → `SpeechToTextService` (Deepgram) → `ResponseEvaluationService` → scores + feedback

**Code Assistant**: Code + prompt → `/internal/history/threads/{id}/message` → `ChatService` → edit proposals returned

### Key Infrastructure

- **Bedrock** (`src/main/llm/`): Chat model (Amazon Nova Lite), embeddings (Amazon Titan Embed Text v2)
- **Neo4j**: Vector store for RAG + graph queries (configured via `NEO4J_*` env vars)
- **DynamoDB**: Chat history, assessment state, user auth sessions
- **S3**: Audio recordings and transcripts (`S3_ASSESSMENT_BUCKET`)
- **Deepgram**: Speech-to-text for oral assessment responses
- **AWS SES**: Password reset emails

### Frontend State & API

All frontends use **Zustand** for state management and **Axios** with a configured base URL (resolves `localhost:8000` in dev, production URL in prod).

Frontend API config lives in `{app}/src/config/api.config.ts` and `{app}/src/services/api.ts`. Auth uses JWT stored client-side; Google OAuth is optional.

### Authentication

JWT-based auth with optional Google OAuth. Backend auth logic in `src/main/auth/`. Frontend `LoginGate` component (`ai-tutor-frontend/src/shared/LoginGate.tsx`) wraps protected routes. DynamoDB table `auth_users` stores user records.

### Async Jobs

Long-running evaluations use `EvaluationJobStore` (in-memory). Jobs are volatile — lost on server restart. Job status polled via `/internal/evaluations/{job_id}/status`.

## Environment Setup

Copy `.env.example` to `.env`. Required vars:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- `DEEPGRAM_SECRET_KEY`
- `AUTH_JWT_SECRET`
- `DYNAMODB_TABLE_NAME`, `DYNAMODB_AUTH_USERS_TABLE`
- `BEDROCK_MODEL_CHAT`, `BEDROCK_MODEL_EMBED`

## Documentation

Active docs in `docs/`: `ARCHITECTURE.md`, `QUICKSTART.md`, `DYNAMODB_SCHEMA.md`, `AUTH_CURRENT_STATE_AND_PLAN.md`, `DEPLOYMENT_PLAN.md`, `ANALYTICS_LOGGING.md`. Per `ARCHITECTURE.md`: **code is source of truth over docs**.
