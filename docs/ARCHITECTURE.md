# Architecture

## System Overview

AI Tutor Agent is a FastAPI backend with multiple frontend clients:

- `ai-tutor-frontend` (chat + history UX)
- `oral-assessment-instructor` (instructor assessment workflow)
- `oral-assessment-student` (student assessment workflow)

Core backend responsibilities:

- Context ingestion + retrieval (vector search)
- Chat and history workflows
- Oral assessment lifecycle (assessment, student progress, results)
- Question generation and response evaluation jobs

## Backend Layering

### API Layer

- Located in `src/main/controllers/`
- Routers map HTTP requests to service calls
- Centralized error envelopes in `src/main/controllers/api_errors.py`

Current routers:

- `chat_router.py`
- `history_router.py`
- `questions_router.py`
- `evaluations_router.py`
- `student_router.py`
- `assessment_router.py`
- `InternalEndpoints.py` (context + S3 upload)
- `auth_router.py`

### Auth Layer

- Located in `src/main/auth/`
- Principal resolution via `require_auth_principal`
- Route-level authorization checks in controller helpers

### Service Layer

- Located in `src/main/service/`
- Business workflows and orchestration
- Recent decomposition split larger services into focused collaborators:
       - `ResponseEvaluation*`
       - `OralAssessment*`
       - `InstructorAssessment*`

### Provider/Infra Integrations

- Bedrock/AgentCore via `src/main/llm/` and `src/main/agentcore_setup/`
- Neo4j vector retrieval via `ContextVectorService`
- DynamoDB-backed assessment/auth/history stores
- S3 presigned uploads via `S3UploadService`

## Runtime Bootstrap

- Entry point: `app.py`
- Settings: `src/main/config/settings.py`
- Exception handlers registered globally (`register_exception_handlers`)

## Error Contract

All API errors return:

```json
{
       "ok": false,
       "error": {
              "code": "...",
              "message": "...",
              "details": {}
       }
}
```

Major global categories are mapped centrally:

- `auth_error`
- `not_found`
- `validation_error`
- `dependency_failure`
- `internal_error`

## Source of Truth

When architecture docs and code diverge, code wins. Update this file in the same change that introduces architectural shifts.
# Architecture

## System Overview

AI Tutor Agent is a FastAPI backend with multiple frontend clients:

- `ai-tutor-frontend` (chat + history UX)
- `oral-assessment-instructor` (instructor assessment workflow)
- `oral-assessment-student` (student assessment workflow)

Core backend responsibilities:

- Context ingestion + retrieval (vector search)
- Chat and history workflows
- Oral assessment lifecycle (assessment, student progress, results)
- Question generation and response evaluation jobs

## Backend Layering

### API Layer

- Located in `src/main/controllers/`
- Routers map HTTP requests to service calls
- Centralized error envelopes in `src/main/controllers/api_errors.py`

Current routers:

- `chat_router.py`
- `history_router.py`
- `questions_router.py`
- `evaluations_router.py`
- `student_router.py`
- `assessment_router.py`
- `InternalEndpoints.py` (context + S3 upload)
- `auth_router.py`

### Auth Layer

- Located in `src/main/auth/`
- Principal resolution via `require_auth_principal`
- Route-level authorization checks in controller helpers

### Service Layer

- Located in `src/main/service/`
- Business workflows and orchestration
- Recent decomposition split larger services into focused collaborators:
       - `ResponseEvaluation*`
       - `OralAssessment*`
       - `InstructorAssessment*`

### Provider/Infra Integrations

- Bedrock/AgentCore via `src/main/llm/` and `src/main/agentcore_setup/`
- Neo4j vector retrieval via `ContextVectorService`
- DynamoDB-backed assessment/auth/history stores
- S3 presigned uploads via `S3UploadService`

## Runtime Bootstrap

- Entry point: `app.py`
- Settings: `src/main/config/settings.py`
- Exception handlers registered globally (`register_exception_handlers`)

## Error Contract

All API errors return:

```json
{
       "ok": false,
       "error": {
              "code": "...",
              "message": "...",
              "details": {}
       }
}
```

Major global categories are mapped centrally:

- `auth_error`
- `not_found`
- `validation_error`
- `dependency_failure`
- `internal_error`

## Source of Truth

When architecture docs and code diverge, code wins. Update this file in the same change that introduces architectural shifts.
# AI Tutor Agent - System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI TUTOR AGENT SYSTEM                            │
│                                                                          │
│  Educational Assessment & Tutoring Platform for Programming Courses     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## High-Level Architecture

```
                      ┌─────────────────────────────────┐
                      │     CLIENT APPLICATIONS         │
                      │  (Web/Mobile/CLI/Postman/cURL)  │
                      └────────────┬────────────────────┘
                                   │ HTTP/REST
                                   │
┌──────────────────────────────────▼──────────────────────────────────────┐
│                         FASTAPI APPLICATION                              │
│                           (app.py + routers)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    API ENDPOINTS LAYER                             │ │
│  │              (InternalEndpoints.py - Controllers)                  │ │
│  │                                                                    │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │ │
│  │  │   Context    │  │     Chat     │  │  Questions   │           │ │
│  │  │   /context   │  │    /chat     │  │  /questions  │           │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │ │
│  │                                                                    │ │
│  │  ┌──────────────┐                                                 │ │
│  │  │ Evaluations  │                                                 │ │
│  │  │ /evaluations │                                                 │ │
│  │  └──────────────┘                                                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      SERVICE LAYER                                 │ │
│  │                  (Business Logic Services)                         │ │
│  │                                                                    │ │
│  │  ┌───────────────────┐  ┌───────────────────┐                    │ │
│  │  │  ChatService      │  │ ContextVector     │                    │ │
│  │  │  (RAG workflow)   │  │ Service           │                    │ │
│  │  └───────────────────┘  │ (Vector store)    │                    │ │
│  │                         └───────────────────┘                    │ │
│  │  ┌───────────────────┐  ┌───────────────────┐                    │ │
│  │  │ QuestionGeneration│  │ ResponseEvaluation│                    │ │
│  │  │ Service           │  │ Service           │                    │ │
│  │  └───────────────────┘  └───────────────────┘                    │ │
│  │                                                                    │ │
│  │  ┌───────────────────┐  ┌───────────────────┐                    │ │
│  │  │ SpeechToText      │  │ FileToText        │                    │ │
│  │  │ Service           │  │ Service           │                    │ │
│  │  └───────────────────┘  └───────────────────┘                    │ │
│  │                                                                    │ │
│  │  ┌───────────────────┐                                            │ │
│  │  │ TextPreprocessing │                                            │ │
│  │  │ Service           │                                            │ │
│  │  └───────────────────┘                                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    LLM PROVIDER LAYER                              │ │
│  │                 (External Service Interfaces)                      │ │
│  │                                                                    │ │
│  │  ┌───────────────────────────────────────────────────────────────┐│ │
│  │  │              AgentCoreProvider                                 ││ │
│  │  │  • generate(prompt) → text                                     ││ │
│  │  │  • chat(messages) → text                                       ││ │
│  │  │  • embed(texts) → vectors                                      ││ │
│  │  │  • Stream support                                              ││ │
│  │  └───────────────────────────────────────────────────────────────┘│ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ External API Calls
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌────────────────┐      ┌────────────────┐        ┌────────────────┐
│   AWS BEDROCK  │      │     NEO4J      │        │    DEEPGRAM    │
│                │      │                │        │                │
│ • Amazon Nova  │      │ • Vector Store │        │ • Speech-to-   │
│   Lite (LLM)   │      │ • Embeddings   │        │   Text API     │
│ • Titan Embed  │      │ • Graph DB     │        │                │
│   (Embeddings) │      │                │        │                │
└────────────────┘      └────────────────┘        └────────────────┘
```

---

## Data Flow: Complete Workflow

### 1️⃣ Document Upload & Indexing

```
┌──────────────┐
│  Instructor  │
│  Uploads     │
│  Documents   │
└──────┬───────┘
       │
       │ POST /internal/context/upload
       │ (Assignment brief, course materials, rubrics)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ ContextVectorService.upload_document()                   │
│                                                           │
│ 1. TextPreprocessingService → Clean & format to markdown │
│ 2. split_by_markdown_heading() → Chunk by headers        │
│ 3. AgentCoreProvider.embed() → Generate 1024-dim vectors │
│ 4. Neo4j storage → Save chunks with embeddings           │
└──────────────────────────────────────────────────────────┘
       │
       │ Document chunks stored
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│           NEO4J VECTOR DATABASE                          │
│                                                           │
│ (d:Document {                                             │
│   id: "doc-abc123",                                       │
│   chunk_idx: 0,                                           │
│   title: "Assignment 1 Brief",                            │
│   text: "# Task 1...",                                    │
│   embedding: [0.123, 0.456, ...],  // 1024 dims          │
│   scope: "CS101"                                          │
│ })                                                        │
└──────────────────────────────────────────────────────────┘
```

### 2️⃣ Question Generation

```
┌──────────────┐
│  Instructor  │
│  Requests    │
│  Questions   │
└──────┬───────┘
       │
       │ POST /internal/questions/generate
       │ - assignment_brief (file)
       │ - student_submission (code file)
       │ - student_name
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ QuestionGenerationService.generate_questions()           │
│                                                           │
│ 1. Read assignment brief text                            │
│ 2. Read student code                                      │
│ 3. Load question_generation_prompt.md                     │
│ 4. Build prompt with context                             │
│ 5. AgentCoreProvider.generate() → Raw JSON               │
│ 6. Parse & validate questions                            │
│ 7. Save to test_outputs/questions/                       │
│    • {student_name}_questions.json                        │
│    • {student_name}_questions.csv                         │
└──────────────────────────────────────────────────────────┘
       │
       │ Questions generated
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│     test_outputs/questions/john_doe_questions.csv        │
│                                                           │
│ question_number,question_text,category,...                │
│ 1,"Explain your binary tree implementation",code,...     │
│ 2,"What is the time complexity?",analysis,...            │
└──────────────────────────────────────────────────────────┘
```

### 3️⃣ Audio Transcription

```
┌──────────────┐
│   Student    │
│   Records    │
│   Responses  │
└──────┬───────┘
       │
       │ Audio files (.wav)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│     POST /internal/chat/transcribe                       │
│                                                           │
│ 1. Upload .wav file                                       │
│ 2. Save to temp file                                      │
│ 3. DeepgramTranscribeService.transcribe()                │
│    └─ Deepgram API call                                  │
│ 4. Return transcript                                      │
│ 5. Clean up temp file                                     │
└──────────────────────────────────────────────────────────┘
       │
       │ Transcript returned
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  Instructor manually fills responses CSV:                │
│  test_outputs/questions/john_doe_responses.csv           │
│                                                           │
│ question_number,response_text,audio_path,...              │
│ 1,"A binary tree is...",path/to/q1.wav,...              │
│ 2,"O(log n) for balanced trees",path/to/q2.wav,...      │
└──────────────────────────────────────────────────────────┘
```

### 4️⃣ Response Evaluation

```
┌──────────────┐
│  Instructor  │
│  Requests    │
│  Evaluation  │
└──────┬───────┘
       │
       │ POST /internal/evaluations/evaluate
       │ - student_name
       │ - assignment_brief (file)
       │ - student_submission (code file)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ ResponseEvaluationService.evaluate_responses_async()     │
│                                                           │
│ 1. Create unique job_id                                  │
│ 2. Start background thread                               │
│ 3. Return job_id immediately                             │
└──────────────────────────────────────────────────────────┘
       │
       │ job_id: "eval-xyz789"
       │ status: "processing"
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ BACKGROUND THREAD (async evaluation)                     │
│                                                           │
│ 1. Read questions CSV                                     │
│ 2. Read responses CSV                                     │
│ 3. Read assignment brief & student code                   │
│ 4. Load response_evaluation_prompt.md                     │
│ 5. For each question-response pair:                       │
│    a. Build evaluation prompt                            │
│    b. AgentCoreProvider.generate() → Raw JSON            │
│    c. Parse scores & feedback                            │
│ 6. Aggregate scores                                       │
│ 7. Save results to test_outputs/evaluations/{student}/   │
│    • evaluation.json (detailed feedback)                  │
│    • report.md (human-readable)                           │
│    • scores.csv (tabular format)                          │
│ 8. Update job status: "completed"                        │
└──────────────────────────────────────────────────────────┘
       │
       │ GET /internal/evaluations/status/{job_id}
       │ (poll for completion)
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  test_outputs/evaluations/john_doe/evaluation.json       │
│                                                           │
│ {                                                         │
│   "student_name": "john_doe",                             │
│   "total_questions": 10,                                  │
│   "average_correctness": 4.2,                             │
│   "average_understanding": 3.8,                           │
│   "overall_score": 80.0,                                  │
│   "evaluations": [                                        │
│     {                                                     │
│       "question_number": 1,                               │
│       "correctness_score": 5,                             │
│       "understanding_score": 4,                           │
│       "feedback": "Excellent explanation..."              │
│     }, ...                                                │
│   ]                                                       │
│ }                                                         │
└──────────────────────────────────────────────────────────┘
```

### 5️⃣ Interactive Chat (RAG)

```
┌──────────────┐
│   Student    │
│   Asks       │
│   Question   │
└──────┬───────┘
       │
       │ POST /internal/chat
       │ {"query": "What is Task 1 about?", "top_k": 5}
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ ChatService.chat()                                        │
│                                                           │
│ 1. VECTOR SEARCH                                          │
│    ├─ Embed query → 1024-dim vector                      │
│    ├─ Search Neo4j for similar chunks                    │
│    └─ Return top-5 by cosine similarity                  │
│                                                           │
│ 2. BUILD PROMPT                                           │
│    ├─ System: "You are a helpful assistant..."           │
│    ├─ Context: Retrieved chunk texts                     │
│    └─ Question: User query                               │
│                                                           │
│ 3. LLM GENERATION                                         │
│    ├─ AgentCoreProvider.chat(messages)                   │
│    └─ AWS Bedrock (Amazon Nova Lite)                     │
│                                                           │
│ 4. RETURN RESPONSE                                        │
│    └─ Answer + context IDs + metadata                    │
└──────────────────────────────────────────────────────────┘
       │
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ ChatResponse                                              │
│                                                           │
│ {                                                         │
│   "answer": "Task 1 requires implementing a binary       │
│              search tree with insert, delete, and        │
│              traversal operations.",                      │
│   "context_ids": ["doc-abc123", "doc-def456"],           │
│   "tokens_input": 1250,                                   │
│   "tokens_output": 45,                                    │
│   "model_id": "amazon.nova-lite-v1:0"                    │
│ }                                                         │
└──────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Core Framework
- **FastAPI**: REST API framework
- **Python 3.13+**: Primary language
- **Pydantic**: Data validation and DTOs

### AI/ML Services
- **AWS Bedrock**: LLM and embeddings
  - Amazon Nova Lite: Chat/generation
  - Titan Embed: Text embeddings (1024-dim)
- **AgentCore**: AWS Bedrock SDK wrapper

### Data Storage
- **Neo4j**: Vector database for semantic search
  - Document chunks with embeddings
  - Graph-based relationships

### External Services
- **Deepgram**: Speech-to-text transcription

### File Processing
- **PyPDF2**: PDF text extraction
- **Markdown**: Document formatting

---

## Directory Structure

```
AI-Tutor-Agent/
├── app.py                              # FastAPI main application
├── requirements.txt                    # Python dependencies
├── .env                                # Environment variables
│
├── src/main/
│   ├── agentcore_setup/
│   │   ├── AgentCoreClient.py         # AgentCore runtime wrapper
│   │   ├── bootstrap.py               # Singleton runtime
│   │   └── config.py                  # Model configuration
│   │
│   ├── controllers/
│   │   └── InternalEndpoints.py       # All REST endpoints
│   │
│   ├── dtos/
│   │   ├── ChatRequest.py             # Chat request model
│   │   ├── ChatResponse.py            # Chat response model
│   │   ├── GenerateQuestionsRequest.py
│   │   ├── GenerateQuestionsResponse.py
│   │   ├── EvaluateResponsesRequest.py
│   │   └── EvaluateResponsesResponse.py
│   │
│   ├── llm/
│   │   └── AgentCoreProvider.py       # LLM interface
│   │
│   ├── service/
│   │   ├── ChatService.py             # RAG chat workflow
│   │   ├── ContextVectorService.py    # Vector store operations
│   │   ├── QuestionGenerationService.py
│   │   ├── ResponseEvaluationService.py
│   │   ├── SpeechToTextService.py     # Deepgram integration
│   │   ├── FileToTextService.py       # PDF extraction
│   │   └── TextPreprocessingService.py
│   │
│   └── utils/
│       ├── ReadPrompt.py              # Prompt file loader
│       └── SplitByMd.py               # Markdown chunking
│
├── test_inputs/                        # Input files
│   ├── assignment.txt                 # Assignment briefs
│   └── student_code.py                # Student submissions
│
├── test_outputs/
│   ├── questions/                     # Generated questions
│   │   ├── {student}_questions.json
│   │   ├── {student}_questions.csv
│   │   └── {student}_responses.csv
│   │
│   └── evaluations/                   # Evaluation results
│       └── {student_name}/
│           ├── evaluation.json
│           ├── report.md
│           └── scores.csv
│
├── tests/                              # Test suite
│   ├── test_chat_service.py
│   ├── service/
│   ├── agentcore_setup/
│   └── llm/
│
└── Documentation:
    ├── README.md                       # This file
    ├── CHAT_FLOW_DOCUMENTATION.md     # Complete chat/RAG docs
    ├── CHAT_FLOW_SUMMARY.md           # Quick reference
    ├── EVALUATION_API.md              # Evaluation endpoints
    └── QUESTION_GENERATION_API.md     # Question generation endpoints
```

---

## Service Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                  Dependency Graph                       │
└─────────────────────────────────────────────────────────┘

InternalEndpoints (Controllers)
    │
    ├─── ChatService
    │       ├─── ContextVectorService
    │       │       ├─── AgentCoreProvider (embed)
    │       │       ├─── TextPreprocessingService
    │       │       ├─── SplitByMd utility
    │       │       └─── Neo4j Driver
    │       │
    │       └─── AgentCoreProvider (chat)
    │
    ├─── ContextVectorService (document upload)
    │       └─── (same as above)
    │
    ├─── QuestionGenerationService
    │       ├─── AgentCoreProvider (generate)
    │       └─── ReadPrompt utility
    │
    ├─── ResponseEvaluationService
    │       ├─── AgentCoreProvider (generate)
    │       ├─── ReadPrompt utility
    │       └─── threading (async jobs)
    │
    ├─── SpeechToTextService
    │       └─── Deepgram API
    │
    └─── FileToTextService
            └─── PyPDF2
```

---

## Configuration Management

### Environment Variables (.env)
```bash
# Neo4j
NEO4J_URI=bolt://3.27.56.110:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# AWS Bedrock
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_key

# Models (optional, defaults provided)
BEDROCK_MODEL_CHAT=amazon.nova-lite-v1:0
BEDROCK_MODEL_EMBED=amazon.titan-embed-text-v2:0
EMBEDDING_DIM=1024
EMBED_MAX_CHARS=2048
```

### Model Configuration (config.py)
```python
BEDROCK_MODEL_CHAT = os.getenv("BEDROCK_MODEL_CHAT", "amazon.nova-lite-v1:0")
BEDROCK_MODEL_EMBED = os.getenv("BEDROCK_MODEL_EMBED", "amazon.titan-embed-text-v2:0")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose | Async |
|----------|--------|---------|-------|
| `/internal/context/upload` | POST | Upload text document | No |
| `/internal/context/uploadFile` | POST | Upload PDF file | No |
| `/internal/context/delete` | DELETE | Delete document | No |
| `/internal/context/list` | POST | List documents | No |
| `/internal/chat` | POST | RAG chat query | No |
| `/internal/chat/transcribe` | POST | Transcribe audio | No |
| `/internal/questions/generate` | POST | Generate questions | No |
| `/internal/evaluations/evaluate` | POST | Evaluate responses | Yes |
| `/internal/evaluations/status/{job_id}` | GET | Check evaluation status | - |

---

## Performance & Scalability

### Latency Breakdown (Typical)
| Operation | Latency | Notes |
|-----------|---------|-------|
| Document Upload | 1-3s | Depends on size, chunking, embedding |
| Chat Query | 3-6s | Vector search + LLM generation |
| Question Generation | 5-10s | LLM call for 10 questions |
| Response Evaluation | 30-60s | Async, 10 questions × evaluations |
| Audio Transcription | 1-3s | Deepgram API call |

### Cost Estimation (AWS Bedrock)
| Service | Rate | Per Request |
|---------|------|-------------|
| Amazon Nova Lite (Chat) | ~$0.00006/1K tokens | ~$0.001-0.003 |
| Titan Embed (Embeddings) | ~$0.00002/1K tokens | ~$0.0001 |
| Document Upload (1000 tokens) | - | ~$0.0002 (embedding) |
| Chat Query (2500 tokens) | - | ~$0.002 (total) |

### Scalability Considerations
- **Neo4j**: Consider vector indexes for >10K documents
- **AgentCore**: Rate limits apply (check AWS quotas)
- **Async Jobs**: In-memory tracking (use Redis for production)
- **Deepgram**: Concurrent transcription limits

---

## Security & Best Practices

### Current Implementation
- ✅ Environment variable configuration
- ✅ Input validation (Pydantic DTOs)
- ✅ Error handling and logging
- ✅ Scoped document storage (multi-tenant support)

### Production Recommendations
- 🔒 Add authentication (JWT, OAuth2)
- 🔒 Implement rate limiting (per user/IP)
- 🔒 Add request logging and monitoring
- 🔒 Use secrets manager (AWS Secrets Manager, HashiCorp Vault)
- 🔒 Implement CORS policies
- 🔒 Add input sanitization
- 🔒 Use HTTPS in production

---

## Testing

### Run Tests
```bash
# All tests
pytest

# Specific test file
pytest tests/test_chat_service.py

# With coverage
pytest --cov=src/main --cov-report=html
```

### Test Coverage
- ✅ ChatService unit tests
- ✅ ContextVectorService unit tests
- ✅ AgentCoreProvider unit tests
- ✅ Service layer tests
- ✅ Utility function tests

---

## Future Enhancements

### Phase 1: Core Improvements
- [ ] Conversation history (session management)
- [ ] Streaming chat responses
- [ ] Hybrid search (vector + keyword)
- [ ] Caching (Redis for embeddings/LLM responses)

### Phase 2: Advanced Features
- [ ] Multi-modal context (images, diagrams)
- [ ] Code execution sandbox (for testing student code)
- [ ] Plagiarism detection
- [ ] Adaptive difficulty (question generation)

### Phase 3: Production Features
- [ ] User authentication & authorization
- [ ] Admin dashboard (usage metrics, costs)
- [ ] Webhook notifications (evaluation completion)
- [ ] Export to LMS (Canvas, Moodle integration)

---

## Troubleshooting

### Common Issues

**Neo4j Connection Failed**
```bash
# Check Neo4j is running
docker ps | grep neo4j

# Verify credentials in .env
NEO4J_URI=bolt://3.27.56.110:7687
```

**AWS Bedrock Access Denied**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify Bedrock permissions in IAM policy
```

**Deepgram API Errors**
```bash
# Verify API key
curl -H "Authorization: Token YOUR_DEEPGRAM_KEY" \
     https://api.deepgram.com/v1/listen
```

**Evaluation Job Stuck**
```bash
# Check job status
GET /internal/evaluations/status/{job_id}

# Check logs for errors
tail -f logs/app.log
```

---

## Development Workflow

### Adding a New Service
1. Create service class in `src/main/service/`
2. Define DTOs in `src/main/dtos/`
3. Add endpoint in `InternalEndpoints.py`
4. Write tests in `tests/service/`
5. Update documentation

### Adding a New LLM Provider
1. Implement `LlmProvider` interface
2. Update `bootstrap.py` for provider selection
3. Add configuration in `config.py`
4. Test with existing services
5. Update README

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[Your License Here]

---

## Support & Contact

- **Documentation**: See individual `.md` files in project root
- **API Docs**: http://localhost:8000/docs (when running)
- **Issues**: GitHub Issues
- **Email**: [your-email@example.com]

---

## Acknowledgments

- AWS Bedrock for LLM infrastructure
- Deepgram for speech-to-text services
- Neo4j for vector database capabilities
- FastAPI for the excellent web framework
- The open-source community

---

**Last Updated**: December 2024
**Version**: 1.0.0
**Status**: Production-Ready (MVP)
