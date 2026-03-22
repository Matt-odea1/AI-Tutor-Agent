import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TakeAssessment from './pages/TakeAssessment';
import ViewResults from './pages/ViewResults';
import { ToastContainer } from './components/ToastContainer';
import './index.css';

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
        <Route path="*" element={
          <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-message border border-gray-100 p-12 max-w-md text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Oral Assessment Platform
              </h1>
              <p className="text-gray-600 mb-6">
                Please use the assessment link provided by your instructor to begin.
              </p>
              <p className="text-sm text-gray-500">
                Please check your invitation email for your assessment link. If you believe this is an error, contact your instructor.
              </p>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
