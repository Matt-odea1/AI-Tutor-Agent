import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import TakeAssessment from './pages/TakeAssessment';
import ViewResults from './pages/ViewResults';
import { ToastContainer } from './components/ToastContainer';
import './index.css';

function DefaultRoute() {
  const navigate = useNavigate();
  const [linkInput, setLinkInput] = useState('');

  const handleGo = () => {
    try {
      const url = new URL(linkInput.trim());
      navigate(url.pathname);
    } catch {
      // not a full URL — treat as pathname
      navigate(linkInput.trim());
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-10 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Oral Assessment Platform</h1>
        <p className="text-gray-600 mb-2">
          This platform is used to take oral assessments set by your instructor.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          If you have an assessment link, open it in your browser or paste it below.
        </p>
        <div className="flex space-x-2">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGo()}
            placeholder="Paste your assessment link…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleGo}
            disabled={!linkInput.trim()}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-40 transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        {/* Assessment taking - URL format: /:studentId/:assessmentId */}
        <Route path="/:studentId/:assessmentId" element={<TakeAssessment />} />

        {/* Results viewing - URL format: /:studentId/results/:assessmentId */}
        <Route path="/:studentId/results/:assessmentId" element={<ViewResults />} />

        {/* Default/Home page */}
        <Route path="*" element={<DefaultRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
