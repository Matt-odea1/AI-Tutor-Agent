import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AssessmentList from './pages/AssessmentList';
import CreateAssessment from './pages/CreateAssessment';
import UploadStudents from './pages/UploadStudents';
import GenerateQuestions from './pages/GenerateQuestions';
import MonitorProgress from './pages/MonitorProgress';
import ViewResults from './pages/ViewResults';
import StudentResultDetail from './pages/StudentResultDetail';
import QuestionEditor from './pages/QuestionEditor';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import OfflineBanner from './components/OfflineBanner';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      {/* ErrorBoundary is the outermost element inside the router, so a render
          crash on any screen shows the fallback card instead of a blank page.
          OfflineBanner and ToastContainer are mounted once, globally: pages push
          into the toastStore rather than rendering their own <Toast />. */}
      <ErrorBoundary>
        <OfflineBanner />
        <ToastContainer />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Default route */}
          <Route path="/" element={<Navigate to="/assessments" replace />} />

          {/* Protected instructor routes */}
          <Route path="/assessments" element={<AuthGate><AssessmentList /></AuthGate>} />
          <Route path="/assessments/create" element={<AuthGate><CreateAssessment /></AuthGate>} />
          <Route path="/assessments/:assessmentId/upload" element={<AuthGate><UploadStudents /></AuthGate>} />
          <Route path="/assessments/:assessmentId/generate" element={<AuthGate><GenerateQuestions /></AuthGate>} />
          <Route path="/assessments/:assessmentId/monitor" element={<AuthGate><MonitorProgress /></AuthGate>} />
          <Route path="/assessments/:assessmentId/results" element={<AuthGate><ViewResults /></AuthGate>} />
          <Route path="/assessments/:assessmentId/student/:studentId/results" element={<AuthGate><StudentResultDetail /></AuthGate>} />
          <Route path="/assessments/:assessmentId/questions/:studentId" element={<AuthGate><QuestionEditor /></AuthGate>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
