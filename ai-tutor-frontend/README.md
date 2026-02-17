# AI Tutor - Intelligent Learning Assistant

An AI-powered tutoring system designed to help students learn computer science concepts through interactive conversation, code practice, and workflow-based experiences.

## 🌟 Features

### Core Functionality
- **Workflow UX Modes**
  - 📖 **General Chat**: Detailed explanations and concept learning
  - 🧩 **Code Assistant**: Concise coding support and edit-focused help
  - ❓ **Question Generation**: Oral-assessment question creation workflow

- **Interactive Code Editor**
  - Built-in Python code editor with Monaco Editor
  - Client-side code execution using Pyodide
  - Code execution history tracking
  - Real-time syntax highlighting and error detection

- **Session Management**
  - Persistent chat sessions stored in DynamoDB
  - Auto-generated session titles
  - Session history with search and filtering
  - Delete unwanted sessions

- **Smart UI/UX**
  - ChatGPT-style interface
  - Split-view mode for code + chat side-by-side
  - Responsive design with mobile support
  - Auto-collapsing sidebar on mobile
  - Markdown rendering with syntax highlighting
  - Smooth animations and transitions

- **Privacy & Research**
  - Transparent data usage information
  - Research study compliance
  - Anonymized data collection

## 🗂 Project Structure

The frontend is organized by feature for scalability and maintainability:

```
src/
  features/
    ai-assist/
    chat/
    code-editor/
    sidebar/
  shared/
  hooks/
  store/
  types/
  utils/
  pages/
  assets/
```

- `features/`: Feature-specific UI and logic, grouped by domain.
- `shared/`: Reusable UI components (modals, skeletons, error boundaries).
- `hooks/`, `store/`, `types/`, `utils/`: Shared logic, state, types, and helpers.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for backend)
- AWS account with DynamoDB access (for production)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AI-Tutor-Agent/ai-tutor-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and set your configuration:
   ```env
   VITE_API_BASE_URL=http://localhost:8000
   VITE_APP_NAME=AI Tutor
   VITE_APP_VERSION=1.0.0
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:5173`

5. **Make sure the backend is running**
   ```bash
   # In the root directory
   cd ../
   python -m uvicorn app:app --reload
   ```

## 📦 Build for Production

```bash
npm run build
npm run preview  # Preview production build
```

The optimized production build will be in the `dist/` directory.

## 🛠️ Technology Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Zustand** - State management
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Monaco Editor** - Code editor component
- **Pyodide** - Client-side Python execution
- **React Markdown** - Markdown rendering
- **Axios** - HTTP client

### Backend Integration
- FastAPI (Python)
- DynamoDB for session storage
- AWS Bedrock for LLM integration

## 📁 Project Structure

```
ai-tutor-frontend/
├── src/
│   ├── api/              # API client and endpoints
│   ├── components/       # React components
│   ├── config/           # Configuration files
│   ├── hooks/            # Custom React hooks
│   ├── pages/            # Page components
│   ├── store/            # Zustand store
│   ├── types/            # TypeScript types
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Root component
│   └── main.tsx          # App entry point
├── public/               # Static assets
├── .env.example          # Environment variables template
└── package.json          # Dependencies and scripts
```

## 🎨 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8000` |
| `VITE_APP_NAME` | Application name | `AI Tutor` |
| `VITE_APP_VERSION` | Application version | `1.0.0` |

### Pedagogy Behavior

The backend supports two pedagogy behaviors:
1. **Explanatory** - General Chat defaults
2. **Concise** - Code Assistant defaults

## 🌐 Deployment

### Vercel / Netlify
1. Build: `npm run build`
2. Deploy the `dist/` folder
3. Set environment variables in your hosting platform

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push and open a Pull Request

## 🗺️ Roadmap

- [ ] Add unit tests with Vitest
- [ ] Implement error boundary
- [ ] Add keyboard shortcuts
- [ ] Improve accessibility
- [ ] Add theme toggle
- [ ] Export chat history

## 📄 License

This project is part of a research study at UNSW Sydney.

---

For questions or support, please contact the research team.
