# Quickstart

## Prerequisites

- Python 3.13+
- Node.js 20+
- A configured `.env` at repo root

Backend integrations vary by feature (`Neo4j`, `AWS Bedrock`, `Deepgram`, optional `DynamoDB`).

## 1) Backend

From repo root:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Backend URLs:

- API: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

## 2) Frontends

### Main Chat Frontend

```bash
cd ai-tutor-frontend
npm install
npm run dev
```

### Oral Assessment Instructor Frontend

```bash
cd oral-assessment-instructor
npm install
npm run dev
```

### Oral Assessment Student Frontend

```bash
cd oral-assessment-student
npm install
npm run dev
```

## 3) Tests

From repo root:

```bash
source venv/bin/activate
PYTHONPATH=. pytest tests -q
```

## 4) Common Local Checks

- If imports fail in tests, ensure `PYTHONPATH=.` is set.
- If auth-protected routes fail, confirm frontend is sending `Authorization` header.
- If vector features fail, verify Neo4j env vars and server reachability.

## 5) Useful Entry Points

- App bootstrap: `app.py`
- Router composition: `src/main/controllers/`
- Services: `src/main/service/`
- Auth: `src/main/auth/`
# Quickstart

## Prerequisites

- Python 3.13+
- Node.js 20+
- A configured `.env` at repo root

Backend integrations vary by feature (`Neo4j`, `AWS Bedrock`, `Deepgram`, optional `DynamoDB`).

## 1) Backend

From repo root:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Backend URLs:

- API: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

## 2) Frontends

### Main Chat Frontend

```bash
cd ai-tutor-frontend
npm install
npm run dev
```

### Oral Assessment Instructor Frontend

```bash
cd oral-assessment-instructor
npm install
npm run dev
```

### Oral Assessment Student Frontend

```bash
cd oral-assessment-student
npm install
npm run dev
```

## 3) Tests

From repo root:

```bash
source venv/bin/activate
PYTHONPATH=. pytest tests -q
```

## 4) Common Local Checks

- If imports fail in tests, ensure `PYTHONPATH=.` is set.
- If auth-protected routes fail, confirm frontend is sending `Authorization` header.
- If vector features fail, verify Neo4j env vars and server reachability.

## 5) Useful Entry Points

- App bootstrap: `app.py`
- Router composition: `src/main/controllers/`
- Services: `src/main/service/`
- Auth: `src/main/auth/`
# AI Tutor Agent - Quick Start Guide

## 🚀 What is This?

An AI-powered educational platform for programming courses that:
- **Generates** oral exam questions from assignments and student code
- **Transcribes** student audio responses
- **Evaluates** responses with detailed feedback
- **Provides** RAG-based chat tutoring with course materials

---

## 📦 Installation (5 minutes)

```bash
# 1. Clone and setup
git clone <repo-url>
cd AI-Tutor-Agent
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start Neo4j
docker run -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest

# 4. Run application
python app.py
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

---

## 🔑 Required Credentials

```env
# Neo4j (Vector Database)
NEO4J_URI=bolt://3.27.56.110:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# AWS Bedrock (LLM)
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Deepgram (Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_key
```

If running Neo4j locally instead, set:
```env
NEO4J_URI=bolt://localhost:7687
```

---

## 📚 Main Workflows

## 🧭 Workflow Modes (UX)

The product now presents three core user-story modes:

1. **General Chat**
  - Purpose: concept explanations and assignment Q&A
  - Default response behavior: explanatory tutor style

2. **Code with AI (Assistant)**
  - Purpose: coding help, focused debugging, and edit proposals
  - Default response behavior: concise assistant style

3. **Question Generation**
  - Purpose: produce oral-assessment questions from assignment + submission artifacts

`pedagogy_mode` is optional and supports `explanatory` and `concise`.

### 1. Upload Course Materials
```bash
curl -X POST http://localhost:8000/internal/context/upload \
  -H "Content-Type: application/json" \
  -d '{
    "DocumentName": "Assignment 1 Brief",
    "Description": "Binary tree implementation",
    "Text": "# Assignment 1\n## Task 1: Implement a binary search tree...",
    "Scope": "CS101"
  }'
```

**Files**: Any course materials, assignment briefs, rubrics, lecture notes

---

### 2. Generate Questions
```bash
curl -X POST http://localhost:8000/internal/questions/generate \
  -F "assignment_brief=@test_inputs/assignment.txt" \
  -F "student_submission=@test_inputs/student_code.py" \
  -F "student_name=john_doe"
```

**Output**: 
- `test_outputs/questions/john_doe_questions.json`
- `test_outputs/questions/john_doe_questions.csv`

---

### 3. Transcribe Student Responses
```bash
curl -X POST http://localhost:8000/internal/chat/transcribe \
  -F "DocumentTitle=Question 1 Response" \
  -F "File=@response.wav"
```

**Manual Step**: Fill `test_outputs/questions/john_doe_responses.csv` with transcripts

---

### 4. Evaluate Responses
```bash
# Start evaluation (returns job_id)
curl -X POST http://localhost:8000/internal/evaluations/evaluate \
  -F "student_name=john_doe" \
  -F "assignment_brief=@test_inputs/assignment.txt" \
  -F "student_submission=@test_inputs/student_code.py"

# Check status
curl http://localhost:8000/internal/evaluations/status/{job_id}
```

**Output**:
- `test_outputs/evaluations/john_doe/evaluation.json`
- `test_outputs/evaluations/john_doe/report.md`
- `test_outputs/evaluations/john_doe/scores.csv`

---

### 5. Chat with AI Tutor
```bash
curl -X POST http://localhost:8000/internal/history/views/{view_session_id}/message \
  -H "Content-Type: application/json" \
  -H "X-User-Id: your-user-id" \
  -d '{
    "query": "What data structure should I use for Task 1?",
    "top_k": 5,
    "include_history": true
  }'
```

**Returns**: AI answer grounded in uploaded course materials

> Note: `/internal/chat` is still available for compatibility, but history-based routes are the recommended path.

---

## 🗂️ Directory Structure

```
AI-Tutor-Agent/
├── test_inputs/           # Assignment briefs, student code
│   ├── assignment.txt
│   └── student_code.py
│
├── test_outputs/
│   ├── questions/         # Generated questions & responses
│   │   ├── {student}_questions.json
│   │   ├── {student}_questions.csv
│   │   └── {student}_responses.csv
│   │
│   └── evaluations/       # Evaluation results
│       └── {student}/
│           ├── evaluation.json
│           ├── report.md
│           └── scores.csv
│
├── src/main/
│   ├── controllers/       # REST endpoints
│   ├── service/          # Business logic
│   ├── llm/              # LLM provider
│   └── dtos/             # Request/response models
│
└── Documentation/
    ├── README.md
    ├── ARCHITECTURE.md           # System architecture
    ├── CHAT_FLOW_DOCUMENTATION.md # Complete chat docs
    └── CHAT_FLOW_SUMMARY.md      # Quick chat reference
```

---

## 🎯 Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/internal/context/upload` | POST | Upload documents |
| `/internal/history/workspaces` | POST | Create workspace |
| `/internal/history/views` | POST | Create view session |
| `/internal/history/views/{id}/message` | POST | General Chat message |
| `/internal/history/codememory/{id}/threads/{thread_id}/message` | POST | Code Assistant message |
| `/internal/chat` | POST | Legacy chat route (compatibility) |
| `/internal/questions/generate` | POST | Generate questions |
| `/internal/chat/transcribe` | POST | Transcribe audio |
| `/internal/evaluations/evaluate` | POST | Evaluate responses (async) |
| `/internal/evaluations/status/{id}` | GET | Check evaluation status |
| `/docs` | GET | Interactive API docs |

---

## 🧠 How It Works

### Chat (RAG)
1. **Upload** course materials → Neo4j vector store
2. **Query** "What is X?" → Semantic search (Cohere embeddings, 1024-dim)
3. **Retrieve** top-5 relevant chunks → Build context
4. **Generate** answer with AWS Bedrock (Amazon Nova Lite)
5. **Return** answer + sources

### Question Generation
1. **Input**: Assignment brief + Student code
2. **LLM**: AWS Bedrock generates 10 questions
3. **Categories**: Code understanding, implementation, analysis, debugging
4. **Output**: JSON + CSV formats

### Response Evaluation
1. **Input**: Questions CSV + Responses CSV + Assignment + Code
2. **LLM**: Evaluates each response (correctness 0-5, understanding 0-5)
3. **Output**: Detailed feedback per question + overall scores
4. **Format**: JSON (structured) + Markdown (human-readable) + CSV (tabular)

---

## 💡 Common Use Cases

### For Instructors
- Upload assignment briefs and rubrics
- Generate personalized questions for each student
- Review auto-generated evaluations
- Adjust feedback before sharing with students

### For Students
- Ask questions about assignments via chat
- Get explanations of concepts from course materials
- Receive detailed feedback on oral responses
- Clarify evaluation criteria

---

## 🛠️ Tech Stack

- **FastAPI**: REST API framework
- **AWS Bedrock**: LLM (Amazon Nova Lite) + Embeddings (Titan Embed)
- **Neo4j**: Vector database for semantic search
- **Deepgram**: Speech-to-text transcription
- **Python 3.13+**: Core language

---

## 📊 Example Output

### Generated Questions (CSV)
```csv
question_number,question_text,category,difficulty,focus_area
1,"Explain your binary tree implementation",code_understanding,medium,data_structures
2,"What is the time complexity?",analysis,medium,algorithms
```

### Evaluation Results (JSON)
```json
{
  "student_name": "john_doe",
  "total_questions": 10,
  "average_correctness": 4.2,
  "average_understanding": 3.8,
  "overall_score": 80.0,
  "evaluations": [
    {
      "question_number": 1,
      "correctness_score": 5,
      "understanding_score": 4,
      "feedback": "Excellent explanation of binary tree structure..."
    }
  ]
}
```

### Chat Response
```json
{
  "answer": "For Task 1, implement a binary search tree with insert, delete, and in-order traversal methods...",
  "context_ids": ["doc-abc123", "doc-def456"],
  "tokens_input": 1250,
  "tokens_output": 45
}
```

---

## 🔍 Testing

```bash
# Run all tests
pytest

# Run specific test
pytest tests/test_chat_service.py

# With coverage
pytest --cov=src/main --cov-report=html
```

---

## 🐛 Troubleshooting

### Neo4j Connection Error
```bash
# Check Neo4j is running
docker ps | grep neo4j

# Restart if needed
docker restart <neo4j-container-id>
```

### AWS Bedrock Access Denied
```bash
# Verify credentials
aws sts get-caller-identity

# Check IAM permissions for Bedrock
```

### Evaluation Job Stuck
```bash
# Check job status
curl http://localhost:8000/internal/evaluations/status/{job_id}

# Check logs
tail -f logs/app.log
```

---

## 📈 Performance

| Operation | Time | Cost (AWS) |
|-----------|------|------------|
| Document Upload | 1-3s | ~$0.0002 |
| Chat Query | 3-6s | ~$0.002 |
| Question Generation | 5-10s | ~$0.01 |
| Response Evaluation (10 questions) | 30-60s | ~$0.05 |

---

## 🔐 Security Notes

**Current Status**: Development/MVP
- ✅ Environment variable configuration
- ✅ Input validation
- ✅ Error handling

**Before Production**:
- Add authentication (JWT/OAuth2)
- Implement rate limiting
- Use HTTPS
- Add request logging
- Use AWS Secrets Manager

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| `README.md` | Complete user guide |
| `ARCHITECTURE.md` | System architecture & data flows |
| `CHAT_FLOW_DOCUMENTATION.md` | Detailed chat/RAG documentation |
| `CHAT_FLOW_SUMMARY.md` | Quick chat reference |
| `EVALUATION_API.md` | Evaluation API details |
| `QUESTION_GENERATION_API.md` | Question generation API details |

---

## 🚦 Next Steps

1. **Setup**: Follow installation steps above
2. **Test**: Upload a sample document and ask a question
3. **Explore**: Try question generation with sample files
4. **Customize**: Adjust prompts in `*_prompt.md` files
5. **Extend**: Add new services or integrate with LMS

---

## 💬 Support

- **API Docs**: http://localhost:8000/docs
- **Issues**: GitHub Issues
- **Email**: [your-email@example.com]

---

## ✨ Key Features

- 🤖 **AI-Powered**: AWS Bedrock (Nova Lite) for generation
- 🔍 **Semantic Search**: Neo4j + Cohere embeddings
- 🎤 **Audio Support**: Deepgram transcription
- 📊 **Detailed Feedback**: Multi-criteria evaluation
- 💬 **Interactive Chat**: RAG-based tutoring
- 🔧 **Modular**: Easy to extend and customize
- 📚 **Well-Documented**: Complete guides and examples

---

**Ready to start?** Run `python app.py` and visit http://localhost:8000/docs! 🚀
