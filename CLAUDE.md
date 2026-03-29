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
npm test             # Vitest (watch mode, all three frontends)
npm run test:run     # Vitest run mode (all three frontends)
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

**Question Generation**: Instructor triggers batch → `/api/assessment/{id}/questions/generate` → SQS → `QuestionGenerationService` → Bedrock → questions stored in DynamoDB

**Oral Assessment**: Student records audio → uploads to S3 (presigned URL) → `/api/student/{id}/assessment/{aid}/answer` → `SpeechToTextService` (Deepgram) → `ResponseEvaluationService` → scores + feedback

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

**`SQSJobDispatcher` → `DynamoDBJobStore`** (DynamoDB-backed, persists across restarts) — used for batch evaluation and question generation jobs. Job items stored as `JOB#` records in the assessment table. SQS consumer thread starts at app boot.

## Environment Variables — How They Work

**All `.env` files are gitignored and never pushed.** There are two separate systems:

### Backend (EC2)
Vars come from **AWS SSM Parameter Store** at `/ai-tutor/prod/`. `scripts/load-ssm-env.sh` pulls them and writes `.env` on the EC2 instance at deploy time. To add/change a backend var:
```bash
aws ssm put-parameter --region ap-southeast-2 \
  --name /ai-tutor/prod/MY_VAR --value "value" --type SecureString --overwrite
```
Then redeploy or SSH + re-run the script + restart Docker.

### Frontends (S3/CloudFront)
`VITE_*` vars are **baked in at Vite build time** — there is no runtime config. They are set in `.github/workflows/assessment-frontend-deploy.yml` as `env:` blocks on each build step. The local `.env` files have no effect on production.

**To add a new frontend env var to production:** add it to the workflow's build step `env:` block. Do NOT rely on `.env` files — they are local only and are never deployed.

Currently wired in the workflow: `VITE_API_BASE_URL`. Student app URL is hardcoded as a fallback in source (`https://student.chat9021.org`) since it doesn't change between environments.

## Environment Setup (Local Dev)

Copy `.env.example` to `.env`. Required vars:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- `DEEPGRAM_SECRET_KEY`
- `AUTH_JWT_SECRET`
- `DYNAMODB_TABLE_NAME`, `DYNAMODB_AUTH_USERS_TABLE`
- `BEDROCK_MODEL_CHAT`, `BEDROCK_MODEL_EMBED`

## Documentation

Active docs in `docs/`: `ARCHITECTURE.md`, `QUICKSTART.md`, `ONBOARDING.md`, `DYNAMODB_SCHEMA.md`, `AUTH_CURRENT_STATE_AND_PLAN.md`, `ORAL_ASSESSMENT_DEPLOYMENT.md`, `PLATFORM_PLAN.md`, `ANALYTICS_LOGGING.md`. Per `ARCHITECTURE.md`: **code is source of truth over docs**.
