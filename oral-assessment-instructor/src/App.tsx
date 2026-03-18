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
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/assessments" replace />} />

        {/* Instructor routes */}
        <Route path="/assessments" element={<AssessmentList />} />
        <Route path="/assessments/create" element={<CreateAssessment />} />
        <Route path="/assessments/:assessmentId/upload" element={<UploadStudents />} />
        <Route path="/assessments/:assessmentId/generate" element={<GenerateQuestions />} />
        <Route path="/assessments/:assessmentId/monitor" element={<MonitorProgress />} />
        <Route path="/assessments/:assessmentId/results" element={<ViewResults />} />
        <Route path="/assessments/:assessmentId/student/:studentId/results" element={<StudentResultDetail />} />
        <Route path="/assessments/:assessmentId/questions/:studentId" element={<QuestionEditor />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
