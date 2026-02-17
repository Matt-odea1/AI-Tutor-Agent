# AI Tutor Agent

## Overview
An intelligent educational assessment and tutoring system for introductory programming courses. The system combines AI-powered question generation, speech-to-text transcription, and automated evaluation to provide comprehensive oral examination capabilities. Built on AWS Bedrock AgentCore with a modular FastAPI architecture.

## Features

### 🎯 Core Capabilities
- **AI Question Generation**: Automatically generate tailored oral exam questions from assignment briefs and student code
- **Speech-to-Text**: Transcribe student audio responses using Deepgram API
- **Automated Evaluation**: AI-powered assessment of student responses with detailed feedback
- **Document Management**: Vector storage and semantic search for course materials
- **Interactive Chat**: RAG-based tutoring with context from uploaded documents

### 🔧 Technical Features
- AWS Bedrock AgentCore integration (Amazon Nova Lite for chat, Titan Embed for vectors)
- Neo4j graph database for vector storage and retrieval
- Async job processing for evaluations
- Modular service/controller architecture
- Comprehensive test suite

## Quick Start

### Prerequisites
- Python 3.13+
- Neo4j database (local or cloud)
- AWS credentials with Bedrock access
- Deepgram API key

### Installation

1. **Clone and setup environment:**
```bash
git clone <repository-url>
cd AI-Tutor-Agent
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. **Configure environment variables:**
Create a `.env` file in the root directory:
```env
# Neo4j Configuration
NEO4J_URI=bolt://3.27.56.110:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password

# AWS Bedrock
AWS_REGION=ap-southeast-2
BEDROCK_MODEL_CHAT=amazon.nova-lite-v1:0
BEDROCK_MODEL_EMBED=amazon.titan-embed-text-v2:0

# Deepgram
DEEPGRAM_SECRET_KEY=your_deepgram_key

# API Settings
HOST=0.0.0.0
PORT=8000
RELOAD=true
```

3. **Run the application:**
```bash
python app.py
```

4. **Access the API:**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## Usage Workflows

### 📝 Workflow 1: Generate Questions from Student Code

1. **Prepare input files:**
   - Assignment brief (text/markdown)
   - Student code submission (.py file)

2. **Generate questions:**
```bash
curl -X POST "http://localhost:8000/internal/questions/generate" \
  -F "assignment_brief=@assignment.txt" \
  -F "student_submission=@student_code.py" \
  -F "student_name=john_doe"
```

3. **Output:**
   - `test_outputs/questions/john_doe_questions.json` (structured data)
   - `test_outputs/questions/john_doe_questions.csv` (readable format)

Questions include:
- 5 specific questions about the student's code
- 3 general questions about programming concepts
- Rationale for each question
- Code references for specific questions

---

### 🎤 Workflow 2: Record and Transcribe Student Responses

1. **Student records audio responses** (using your AVRecorder or any tool)
   - Save as `.wav` files

2. **Transcribe audio:**
```bash
curl -X POST "http://localhost:8000/internal/chat/transcribe" \
  -F "DocumentTitle=Question 1 Response" \
  -F "File=@response.wav"
```

3. **Populate responses CSV:**
   - Manually fill `test_outputs/questions/john_doe_responses.csv`
   - Include transcripts, audio paths, timestamps

---

### 📊 Workflow 3: Evaluate Student Responses

1. **Start evaluation (async):**
```bash
curl -X POST "http://localhost:8000/internal/evaluations/evaluate" \
  -H "Content-Type: application/json" \
  -d '{
    "student_name": "john_doe",
    "responses_file_name": "john_doe_responses.csv"
  }'
```

Response includes `job_id` for tracking.

2. **Check status:**
```bash
curl "http://localhost:8000/internal/evaluations/status/eval_john_doe_XXXXXXXXXX"
```

3. **View results:**
```bash
# Human-readable report
cat test_outputs/evaluations/john_doe/report.md

# Scores CSV
cat test_outputs/evaluations/john_doe/scores.csv

# Detailed JSON
cat test_outputs/evaluations/john_doe/evaluation.json
```

**Scoring:**
- Each question: 0-10 points (Correctness: 0-5, Understanding: 0-5)
- Total: 80 points for 8 questions
- Grades: Excellent (80-100%), Competent (60-80%), Developing (40-60%), Unsatisfactory (0-40%)

---

### 💬 Workflow 4: Interactive Tutoring (RAG Chat)

1. **Upload course materials:**
```bash
curl -X POST "http://localhost:8000/internal/context/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "DocumentName": "Python Basics",
    "Description": "Introduction to Python",
    "Text": "... course content ...",
    "Scope": "python101"
  }'
```

2. **Chat with AI tutor:**
```bash
curl -X POST "http://localhost:8000/internal/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Explain how for loops work in Python",
    "top_k": 5
  }'
```

The system retrieves relevant context from uploaded materials and provides answers.

---

## Directory Structure

```
AI-Tutor-Agent/
├── app.py                              # FastAPI application entry point
├── requirements.txt                    # Python dependencies
│
├── src/main/
│   ├── agentcore_setup/               # AWS Bedrock AgentCore configuration
│   │   ├── AgentCoreClient.py         # Bedrock runtime client
│   │   ├── bootstrap.py               # Runtime initialization
│   │   └── config.py                  # Model configuration
│   │
│   ├── llm/                           # LLM providers
│   │   ├── AgentCoreProvider.py       # Main LLM interface (chat, embed)
│   │   └── LlmProvider.py             # Abstract provider interface
│   │
│   ├── service/                       # Business logic services
│   │   ├── ChatService.py             # RAG chat with vector search
│   │   ├── ContextVectorService.py    # Document storage and retrieval
│   │   ├── QuestionGenerationService.py    # AI question generation
│   │   ├── ResponseEvaluationService.py    # AI response evaluation
│   │   ├── SpeechToTextService.py     # Deepgram transcription
│   │   ├── FileToTextService.py       # PDF/file text extraction
│   │   └── TextPreprocessingService.py # Document preprocessing
│   │
│   ├── controllers/                   # API endpoints
│   │   └── InternalEndpoints.py       # All REST API routes
│   │
│   ├── dtos/                          # Data transfer objects
│   │   ├── ChatRequest.py / ChatResponse.py
│   │   ├── GenerateQuestionsRequest.py / Response.py
│   │   └── EvaluateResponsesRequest.py / Response.py
│   │
│   ├── utils/                         # Utility functions
│   │   ├── ReadPrompt.py              # Prompt file loader
│   │   └── SplitByMd.py               # Markdown splitter
│   │
│   └── video_audio/                   # Audio/video recording
│       ├── AudioRecorder.py
│       └── AVRecorder.py
│
├── test_inputs/                       # Input files for testing
│   ├── assignment.txt                 # Sample assignment brief
│   └── student_code.py                # Sample student submission
│
├── test_outputs/                      # Generated outputs
│   ├── questions/                     # Generated questions
│   │   ├── {student}_questions.json
│   │   ├── {student}_questions.csv
│   │   └── {student}_responses.csv    # Filled by student/tester
│   │
│   └── evaluations/                   # Evaluation results
│       └── {student}/
│           ├── evaluation.json        # Detailed results
│           ├── scores.csv             # Summary scores
│           └── report.md              # Human-readable report
│
├── test_scripts/                      # Testing utilities
│   ├── test_evaluation.py             # Evaluation testing script
│   ├── EVALUATION_API.md              # Evaluation API docs
│   └── QUESTION_GENERATION_API.md     # Question gen API docs
│
├── tests/                             # Unit and integration tests
│   ├── service/
│   ├── llm/
│   └── agentcore_setup/
│
└── Prompt Files
    └── prompts/
        ├── question_generation_prompt.md  # Question generation instructions
        ├── response_evaluation_prompt.md  # Evaluation criteria and rubric
        └── vector_store_prompt.md         # Document preprocessing prompt
```

## API Endpoints

### Question Generation
- `POST /internal/questions/generate` - Generate questions from assignment and student code

### Response Evaluation
- `POST /internal/evaluations/evaluate` - Start async evaluation of student responses
- `GET /internal/evaluations/status/{job_id}` - Check evaluation job status

### Chat & Tutoring
- `POST /internal/chat` - Ask questions with RAG context
- `POST /internal/chat/transcribe` - Transcribe audio to text

### Document Management
- `POST /internal/context/upload` - Upload document text
- `POST /internal/context/uploadFile` - Upload PDF file
- `POST /internal/context/list` - List uploaded documents
- `DELETE /internal/context/delete` - Delete document

### Health
- `GET /health` - Service health check

**Full API documentation available at:** http://localhost:8000/docs

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Backend Framework** | FastAPI |
| **Language** | Python 3.13 |
| **Database** | Neo4j (vector + graph) |
| **LLM Platform** | AWS Bedrock AgentCore |
| **Chat Model** | Amazon Nova Lite v1 |
| **Embedding Model** | Amazon Titan Embed Text v2 |
| **Speech-to-Text** | Deepgram API |
| **File Processing** | PyPDF2, ReportLab |
| **Media** | MoviePy, OpenCV, SoundDevice |

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEO4J_URI` | Neo4j connection URI | `bolt://3.27.56.110:7687` |
| `NEO4J_USERNAME` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | - |
| `AWS_REGION` | AWS region for Bedrock | `ap-southeast-2` |
| `BEDROCK_MODEL_CHAT` | Chat model ID | `amazon.nova-lite-v1:0` |
| `BEDROCK_MODEL_EMBED` | Embedding model ID | `amazon.titan-embed-text-v2:0` |
| `BEDROCK_EMBED_DIM` | Embedding dimension | `1024` |
| `DEEPGRAM_SECRET_KEY` | Deepgram API key | - |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8000` |

---

## Testing

### Run Tests
```bash
# All tests
PYTHONPATH=src pytest tests/ -v

# Specific test suites
pytest tests/service/ -v
pytest tests/llm/ -v
pytest tests/agentcore_setup/ -v
```

### Test Question Generation
```bash
# Via Swagger UI
open http://localhost:8000/docs

# Via cURL
curl -X POST "http://localhost:8000/internal/questions/generate" \
  -F "assignment_brief=@test_inputs/assignment.txt" \
  -F "student_submission=@test_inputs/student_code.py" \
  -F "student_name=john_doe"
```

### Test Evaluation
```bash
# Run the test script
python test_scripts/test_evaluation.py

# Or manually
curl -X POST "http://localhost:8000/internal/evaluations/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"student_name": "john_doe", "responses_file_name": "john_doe_responses.csv"}'
```

---

## Key Features Explained

### 🎯 AI Question Generation
- Analyzes assignment requirements and student code
- Generates 5 specific questions about implementation
- Generates 3 general questions about concepts
- Provides rationale and code references
- Outputs to JSON and CSV formats

### 📊 Automated Evaluation
- Evaluates responses on two criteria:
  - **Correctness** (0-5): Technical accuracy
  - **Understanding** (0-5): Conceptual depth
- Async processing (8 seconds per question)
- Generates detailed feedback and improvement suggestions
- Creates human-readable reports (Markdown)
- Provides structured data (JSON, CSV)

### 💬 RAG Chat System
- Semantic search across uploaded course materials
- Context-aware responses using vector embeddings
- Supports document scoping for organization
- Real-time chat with AI tutor

### 🎤 Speech Processing
- Deepgram-powered transcription
- Support for WAV audio files
- Integration with evaluation workflow

---

## Development

### Code Structure Principles
- **Modular Services**: Each service handles one responsibility
- **Dependency Injection**: Services injected via FastAPI Depends
- **Type Safety**: Pydantic models for all DTOs
- **Async Support**: Background jobs for long-running tasks
- **Error Handling**: Structured exceptions and HTTP error codes

### Adding New Features

1. **Create Service**: Add to `src/main/service/`
2. **Create DTOs**: Add to `src/main/dtos/`
3. **Add Endpoint**: Update `src/main/controllers/InternalEndpoints.py`
4. **Write Tests**: Add to `tests/`
5. **Update Docs**: Update README and API docs

---

## Common Use Cases

### 1. Bulk Question Generation
Generate questions for multiple students:
```python
students = ["alice", "bob", "charlie"]
for student in students:
    # Upload assignment_brief and student_{name}.py
    # Generate questions
    # Save to test_outputs/questions/
```

### 2. Automated Grading Pipeline
```python
# 1. Generate questions from submissions
# 2. Students record responses
# 3. Transcribe audio
# 4. Evaluate all responses
# 5. Generate class report
```

### 3. Interactive Study Sessions
```python
# 1. Upload course materials
# 2. Students ask questions via chat
# 3. AI provides context-aware answers
```

---

## Troubleshooting

### Common Issues

**Neo4j Connection Error:**
```bash
# Check Neo4j is running
neo4j status

# Verify credentials in .env
NEO4J_URI=bolt://3.27.56.110:7687
```

**AWS Bedrock Access Error:**
```bash
# Configure AWS credentials
aws configure

# Verify Bedrock model access in AWS Console
```

**Deepgram Transcription Error:**
```bash
# Check API key is set
echo $DEEPGRAM_SECRET_KEY

# Verify audio file format (must be .wav)
```

**Evaluation Job Stuck:**
- Jobs are in-memory (lost on restart)
- Check server logs for errors
- Verify response CSV file exists and is valid

---

## Roadmap

- [ ] Persistent job storage (Redis/Database)
- [ ] Real-time audio recording UI
- [ ] Batch evaluation support
- [ ] Class-level analytics dashboard
- [ ] Custom rubric configuration
- [ ] Multi-language support
- [ ] Video analysis integration
- [ ] Plagiarism detection

---

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`pytest tests/`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

[Your License Here]

---

## Acknowledgments

- AWS Bedrock for LLM infrastructure
- Deepgram for speech-to-text services
- Neo4j for vector database capabilities
- FastAPI for the excellent web framework

---

## Contact & Support

For questions, issues, or contributions:
- GitHub Issues: [Repository Issues]
- Documentation: http://localhost:8000/docs

---

## Notes

- **MVP Focus**: Prioritizes working code, safe defaults, and clarity
- **Production Ready**: Add authentication, rate limiting, and monitoring before production use
- **Extensible**: Easy to add new models, services, and features
- **Educational**: Designed for programming education contexts

For detailed API documentation, see:
- `ARCHITECTURE.md` - Complete system architecture and data flows
- `CHAT_FLOW_DOCUMENTATION.md` - Complete chat/RAG system documentation
- `CHAT_FLOW_SUMMARY.md` - Quick reference for chat functionality
- `EVALUATION_API.md` - Evaluation endpoints and workflows
- `QUESTION_GENERATION_API.md` - Question generation endpoints
- `DIRECTORY_STRUCTURE.md` - Directory organization guide
